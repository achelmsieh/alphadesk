/* =========================================================================
   AlphaDesk — serveur local (zéro dépendance)
   - sert le front statique
   - proxy vers Yahoo Finance (évite le blocage CORS du navigateur)
   - cache disque + mémoire
   - passerelle optionnelle vers l'API Claude (commentaire IA)
   ========================================================================= */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, 'public');
const DATA = path.join(__dirname, 'data');
const CACHE_DIR = path.join(DATA, 'cache');
const SETTINGS_FILE = path.join(DATA, 'settings.json');
const PORT = Number(process.env.PORT || 4321);

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

fs.mkdirSync(CACHE_DIR, { recursive: true });

/* =========================================================================
   PROTECTION D'UNE INSTANCE PUBLIQUE

   En local, AlphaDesk est ouvert : c'est votre machine, vous etes seul.
   Des qu'il est deploye sur un hebergeur accessible par URL, deux routes
   doivent etre fermees, sinon n'importe quel visiteur peut :
     · POST /api/settings -> ecrire dans vos reglages,
     · POST /api/ai       -> depenser VOS credits Anthropic.

   Il suffit donc de definir la variable d'environnement ALPHADESK_TOKEN
   sur l'hebergeur. Tant qu'elle est absente (usage local), rien ne change.
   ========================================================================= */
const ADMIN_TOKEN = process.env.ALPHADESK_TOKEN || '';
const PROTECTED = !!ADMIN_TOKEN;

function estAdmin(req) {
  if (!PROTECTED) return true;
  const fourni = req.headers['x-alphadesk-token'];
  if (typeof fourni !== 'string' || fourni.length !== ADMIN_TOKEN.length) return false;
  // comparaison a duree constante : ne revele pas le jeton par chronometrage
  let diff = 0;
  for (let i = 0; i < ADMIN_TOKEN.length; i++) diff |= fourni.charCodeAt(i) ^ ADMIN_TOKEN.charCodeAt(i);
  return diff === 0;
}

/* Limitation de debit simple, par adresse : evite qu'une instance publique
   ne serve de relais Yahoo gratuit a toute la planete. */
const hits = new Map();
function tropDeRequetes(req) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
  const now = Date.now(), fenetre = 60_000, plafond = 150;
  const e = hits.get(ip);
  if (!e || now - e.debut > fenetre) { hits.set(ip, { debut: now, n: 1 }); return false; }
  e.n++;
  if (hits.size > 5000) hits.clear();          // garde-fou memoire
  return e.n > plafond;
}

/* ----------------------------- utilitaires ----------------------------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png',
  '.woff2': 'font/woff2', '.map': 'application/json'
};

function log(...a) { console.log(new Date().toISOString().slice(11, 19), ...a); }
function sendJSON(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function safeKey(s) { return String(s).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120); }
function num(x, d) { return (x === null || x === undefined || !isFinite(x)) ? d : x; }

/* --------------------------- cache deux étages -------------------------- */
const mem = new Map();
function cacheGet(key, ttlMs) {
  const m = mem.get(key);
  if (m && Date.now() - m.t < ttlMs) return m.v;
  const f = path.join(CACHE_DIR, safeKey(key) + '.json');
  try {
    const st = fs.statSync(f);
    if (Date.now() - st.mtimeMs < ttlMs) {
      const v = JSON.parse(fs.readFileSync(f, 'utf8'));
      mem.set(key, { t: st.mtimeMs, v });
      return v;
    }
  } catch { /* pas de cache */ }
  return null;
}
function cacheSet(key, v) {
  mem.set(key, { t: Date.now(), v });
  try { fs.writeFileSync(path.join(CACHE_DIR, safeKey(key) + '.json'), JSON.stringify(v)); } catch { }
}
/** dernier recours : cache périmé, mieux que rien si la source tombe */
function cacheGetStale(key) {
  const m = mem.get(key); if (m) return m.v;
  try { return JSON.parse(fs.readFileSync(path.join(CACHE_DIR, safeKey(key) + '.json'), 'utf8')); } catch { return null; }
}

/* --------------------- session Yahoo (cookie + crumb) ------------------- */
let yahooSession = { cookie: '', crumb: '', t: 0 };
async function getYahooSession(force = false) {
  if (!force && yahooSession.crumb && Date.now() - yahooSession.t < 45 * 60 * 1000) return yahooSession;
  try {
    const r = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' });
    const cookie = (r.headers.getSetCookie?.() || []).map(c => c.split(';')[0]).join('; ');
    const c = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, cookie } });
    const crumb = (await c.text()).trim();
    if (crumb && crumb.length < 30) yahooSession = { cookie, crumb, t: Date.now() };
  } catch (e) { log('session marché indisponible:', e.message); }
  return yahooSession;
}

async function yfetch(url, { withCrumb = false, retry = true } = {}) {
  const headers = { 'User-Agent': UA, 'Accept': 'application/json' };
  let u = url;
  if (withCrumb) {
    const s = await getYahooSession();
    if (s.cookie) headers.cookie = s.cookie;
    if (s.crumb) u += (u.includes('?') ? '&' : '?') + 'crumb=' + encodeURIComponent(s.crumb);
  }
  const r = await fetch(u, { headers });
  if (r.status === 401 && withCrumb && retry) { await getYahooSession(true); return yfetch(url, { withCrumb, retry: false }); }
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* ------------------------ normalisation des séries ---------------------- */
function normalizeChart(j) {
  const res = j?.chart?.result?.[0];
  if (!res) throw new Error('série vide');
  const q = res.indicators?.quote?.[0] || {};
  const adj = res.indicators?.adjclose?.[0]?.adjclose;
  const ts = res.timestamp || [];
  const out = { t: [], o: [], h: [], l: [], c: [], v: [], adj: [] };
  for (let i = 0; i < ts.length; i++) {
    const c = q.close?.[i];
    if (c === null || c === undefined || !isFinite(c)) continue;
    out.t.push(ts[i] * 1000);
    out.o.push(num(q.open?.[i], c)); out.h.push(num(q.high?.[i], c));
    out.l.push(num(q.low?.[i], c)); out.c.push(c);
    out.v.push(num(q.volume?.[i], 0)); out.adj.push(num(adj?.[i], c));
  }
  const m = res.meta || {};
  return {
    symbol: m.symbol, currency: m.currency, exchange: m.fullExchangeName || m.exchangeName,
    type: m.instrumentType, name: m.longName || m.shortName || m.symbol,
    price: m.regularMarketPrice, prevClose: m.chartPreviousClose ?? m.previousClose,
    tz: m.exchangeTimezoneName, interval: m.dataGranularity,
    fiftyTwoWeekHigh: m.fiftyTwoWeekHigh, fiftyTwoWeekLow: m.fiftyTwoWeekLow,
    marketState: m.marketState, series: out, fetchedAt: Date.now()
  };
}

/* ------------------------------ endpoints ------------------------------- */
/**
 * Series de cotations.
 * `range` accepte les raccourcis Yahoo (1y, 5y, max...), MAIS au-dela de
 * quelques annees Yahoo degrade silencieusement l'intervalle : un `max` en
 * `1d` renvoie en realite du mensuel. Pour obtenir du VRAI quotidien sur une
 * longue periode il faut passer des bornes de dates explicites — c'est ce
 * que font `from`/`to`, indispensables au simulateur de crises.
 */
async function apiChart(symbol, range, interval, from = null, to = null) {
  const bornes = from ? `from${from}_to${to || 'now'}` : range;
  const key = `chart_${symbol}_${bornes}_${interval}`;
  const ttl = from ? 7 * 24 * 3600 * 1000       // historique ancien : il ne bouge plus
    : /m$|h$/.test(interval) ? 60 * 1000 : 15 * 60 * 1000;
  const hit = cacheGet(key, ttl); if (hit) return hit;
  try {
    const periode = from
      ? `period1=${Math.floor(Date.parse(from) / 1000)}&period2=${Math.floor((to ? Date.parse(to) : Date.now()) / 1000)}`
      : `range=${range}`;
    const j = await yfetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?${periode}&interval=${interval}&includePrePost=false&events=div%2Csplit`);
    const n = normalizeChart(j);
    const ev = j?.chart?.result?.[0]?.events || {};
    n.dividends = Object.values(ev.dividends || {});
    n.splits = Object.values(ev.splits || {});
    cacheSet(key, n);
    return n;
  } catch (e) {
    const stale = cacheGetStale(key);
    if (stale) { stale.stale = true; return stale; }
    throw e;
  }
}

async function apiSearch(q) {
  const key = `search_${q.toLowerCase()}`;
  const hit = cacheGet(key, 12 * 3600 * 1000); if (hit) return hit;
  const j = await yfetch(`https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&listsCount=0`);
  const out = (j.quotes || []).filter(x => x.symbol).map(x => ({
    symbol: x.symbol, name: x.longname || x.shortname || x.symbol,
    exchange: x.exchDisp || x.exchange, type: x.quoteType,
    sector: x.sectorDisp || '', industry: x.industryDisp || ''
  }));
  cacheSet(key, out); return out;
}

const FUND_MODULES = 'price,summaryDetail,summaryProfile,defaultKeyStatistics,financialData,recommendationTrend,calendarEvents';
async function apiFundamentals(symbol) {
  const key = `fund_${symbol}`;
  const hit = cacheGet(key, 12 * 3600 * 1000); if (hit) return hit;
  try {
    const j = await yfetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${FUND_MODULES}`, { withCrumb: true });
    const r = j?.quoteSummary?.result?.[0] || {};
    const g = (o, k) => (o?.[k]?.raw !== undefined ? o[k].raw : (typeof o?.[k] === 'number' ? o[k] : null));
    const sd = r.summaryDetail || {}, ks = r.defaultKeyStatistics || {}, fd = r.financialData || {},
      pr = r.price || {}, sp = r.summaryProfile || {};
    const rt = (r.recommendationTrend?.trend || [])[0] || {};
    const out = {
      name: pr.longName || pr.shortName || symbol, sector: sp.sector || '', industry: sp.industry || '',
      country: sp.country || '', employees: sp.fullTimeEmployees || null, website: sp.website || '',
      summary: sp.longBusinessSummary || '',
      marketCap: g(pr, 'marketCap') ?? g(sd, 'marketCap'),
      per: g(sd, 'trailingPE'), perFwd: g(sd, 'forwardPE'), peg: g(ks, 'pegRatio'),
      priceToBook: g(ks, 'priceToBook'), priceToSales: g(sd, 'priceToSalesTrailing12Months'),
      beta: g(sd, 'beta') ?? g(ks, 'beta'), dividendYield: g(sd, 'dividendYield'),
      payoutRatio: g(sd, 'payoutRatio'), eps: g(ks, 'trailingEps'),
      revenueGrowth: g(fd, 'revenueGrowth'), earningsGrowth: g(fd, 'earningsGrowth'),
      profitMargin: g(fd, 'profitMargins'), operatingMargin: g(fd, 'operatingMargins'),
      roe: g(fd, 'returnOnEquity'), roa: g(fd, 'returnOnAssets'),
      debtToEquity: g(fd, 'debtToEquity'), currentRatio: g(fd, 'currentRatio'),
      freeCashflow: g(fd, 'freeCashflow'), totalCash: g(fd, 'totalCash'), totalDebt: g(fd, 'totalDebt'),
      targetMean: g(fd, 'targetMeanPrice'), targetHigh: g(fd, 'targetHighPrice'), targetLow: g(fd, 'targetLowPrice'),
      recoKey: fd.recommendationKey || '', nbAnalysts: g(fd, 'numberOfAnalystOpinions'),
      analysts: {
        strongBuy: rt.strongBuy || 0, buy: rt.buy || 0, hold: rt.hold || 0,
        sell: rt.sell || 0, strongSell: rt.strongSell || 0
      },
      nextEarnings: (r.calendarEvents?.earnings?.earningsDate || [])[0]?.raw || null,
      shortRatio: g(ks, 'shortRatio'),
      heldInsiders: g(ks, 'heldPercentInsiders'), heldInstitutions: g(ks, 'heldPercentInstitutions')
    };
    cacheSet(key, out); return out;
  } catch (e) {
    const stale = cacheGetStale(key); if (stale) return stale;
    return { error: e.message, name: symbol };
  }
}

/**
 * Historique DATE des avis d'analystes (upgrades / downgrades).
 * Disponible pour la plupart des valeurs americaines, tres souvent vide pour
 * les valeurs europeennes : l'application doit le dire au lieu de faire
 * croire a une absence d'avis.
 */
async function apiAnalystes(symbol) {
  const key = `analystes_${symbol}`;
  const hit = cacheGet(key, 24 * 3600 * 1000); if (hit) return hit;
  try {
    const j = await yfetch(
      `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=upgradeDowngradeHistory,recommendationTrend`,
      { withCrumb: true });
    const r = j?.quoteSummary?.result?.[0] || {};
    const brut = r.upgradeDowngradeHistory?.history || [];
    const avis = brut
      .filter(x => x.epochGradeDate && x.toGrade)
      .map(x => ({
        date: x.epochGradeDate * 1000,
        cabinet: x.firm || '?',
        note: x.toGrade,
        noteAvant: x.fromGrade || '',
        action: x.action || '',
        objectif: x.currentPriceTarget ?? null,
        objectifAvant: x.priorPriceTarget ?? null
      }))
      .sort((a, b) => a.date - b.date);
    const out = {
      symbol, disponible: avis.length >= 20, nombre: avis.length,
      debut: avis.length ? avis[0].date : null,
      fin: avis.length ? avis[avis.length - 1].date : null,
      cabinets: [...new Set(avis.map(a => a.cabinet))].length,
      avis,
      tendance: (r.recommendationTrend?.trend || []).slice(0, 4)
    };
    cacheSet(key, out); return out;
  } catch (e) {
    const stale = cacheGetStale(key); if (stale) return stale;
    return { symbol, disponible: false, nombre: 0, avis: [], erreur: e.message };
  }
}

/** lot de séries pour le screener, concurrence limitée */
async function apiBatch(symbols, range, interval) {
  const out = {}; const queue = symbols.slice(0, 120); let idx = 0;
  const worker = async () => {
    while (idx < queue.length) {
      const s = queue[idx++];
      try { out[s] = await apiChart(s, range, interval); }
      catch (e) { out[s] = { error: e.message }; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, queue.length) }, worker));
  return out;
}

/* ------------------------------ réglages -------------------------------- */
function readSettings() {
  try { return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')); } catch { return {}; }
}
function writeSettings(s) { fs.writeFileSync(SETTINGS_FILE, JSON.stringify(s, null, 2)); }

/* --------------------------- passerelle Claude -------------------------- */
const AI_SYSTEM = [
  "Tu es un analyste financier senior francophone qui assiste un investisseur particulier.",
  "Tu reçois un rapport technique déjà calculé (indicateurs, scores, niveaux, backtest).",
  "Règle absolue : n'invente AUCUN chiffre. Utilise uniquement les valeurs fournies dans le JSON.",
  "Structure ta réponse en 4 blocs courts avec des titres en gras markdown :",
  "1. **Ce que dit le marché** — lecture croisée des indicateurs, en langage clair.",
  "2. **Les 2 risques principaux** — concrets, chiffrés.",
  "3. **Plan d'action** — entrée, stop, objectifs, taille de position, en reprenant les niveaux fournis.",
  "4. **Ce qui invaliderait l'analyse** — le signal précis qui doit faire changer d'avis.",
  "Sois direct et pédagogue. Pas de jargon gratuit : si tu emploies un terme technique, explique-le en cinq mots.",
  "Termine par une ligne rappelant qu'il s'agit d'une analyse technique automatisée, pas d'un conseil en investissement personnalisé."
].join(' ');

async function apiAI(payload) {
  const st = readSettings();
  const key = process.env.ANTHROPIC_API_KEY || st.anthropicKey;
  if (!key) return { ok: false, reason: 'no-key' };
  const model = st.aiModel || 'claude-sonnet-5';
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model, max_tokens: 1800, system: AI_SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(payload) }]
      })
    });
    const j = await r.json();
    if (!r.ok) return { ok: false, reason: j?.error?.message || ('HTTP ' + r.status) };
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    return { ok: true, text, model, usage: j.usage };
  } catch (e) { return { ok: false, reason: e.message }; }
}

/* -------------------------------- routeur ------------------------------- */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let d = ''; req.on('data', c => { d += c; if (d.length > 4e6) req.destroy(); });
    req.on('end', () => { try { resolve(d ? JSON.parse(d) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const p = url.pathname;
  try {
    if (p.startsWith('/api/')) {
      if (tropDeRequetes(req)) return sendJSON(res, 429, { error: 'trop de requetes, patientez une minute' });

      if (p === '/api/health') {
        return sendJSON(res, 200, {
          ok: true, version: '1.0.0',
          ai: !!(process.env.ANTHROPIC_API_KEY || readSettings().anthropicKey),
          protege: PROTECTED
        });
      }
      if (p === '/api/chart') {
        const s = url.searchParams.get('symbol');
        if (!s) return sendJSON(res, 400, { error: 'symbol requis' });
        return sendJSON(res, 200, await apiChart(
          s,
          url.searchParams.get('range') || '2y',
          url.searchParams.get('interval') || '1d',
          url.searchParams.get('from'),
          url.searchParams.get('to')));
      }
      if (p === '/api/analystes') {
        const s = url.searchParams.get('symbol');
        if (!s) return sendJSON(res, 400, { error: 'symbol requis' });
        return sendJSON(res, 200, await apiAnalystes(s));
      }
      if (p === '/api/search') {
        const q = (url.searchParams.get('q') || '').trim();
        if (!q) return sendJSON(res, 200, []);
        return sendJSON(res, 200, await apiSearch(q));
      }
      if (p === '/api/fundamentals') {
        const s = url.searchParams.get('symbol');
        if (!s) return sendJSON(res, 400, { error: 'symbol requis' });
        return sendJSON(res, 200, await apiFundamentals(s));
      }
      if (p === '/api/batch') {
        const list = (url.searchParams.get('symbols') || '').split(',').map(x => x.trim()).filter(Boolean);
        if (!list.length) return sendJSON(res, 400, { error: 'symbols requis' });
        return sendJSON(res, 200, await apiBatch(list, url.searchParams.get('range') || '1y', url.searchParams.get('interval') || '1d'));
      }
      if (p === '/api/settings') {
        if (req.method === 'POST') {
          if (!estAdmin(req)) return sendJSON(res, 401, { error: "jeton d'administration requis" });
          const b = await readBody(req);
          const next = { ...readSettings(), ...b };
          writeSettings(next);
          return sendJSON(res, 200, { ok: true, hasKey: !!next.anthropicKey });
        }
        const s = readSettings();
        return sendJSON(res, 200, { hasKey: !!(s.anthropicKey || process.env.ANTHROPIC_API_KEY), aiModel: s.aiModel || 'claude-sonnet-5' });
      }
      if (p === '/api/ai' && req.method === 'POST') {
        if (!estAdmin(req)) return sendJSON(res, 401, { error: "jeton d'administration requis" });
        return sendJSON(res, 200, await apiAI(await readBody(req)));
      }
      return sendJSON(res, 404, { error: 'route inconnue' });
    }

    // fichiers statiques
    const file = p === '/' ? '/index.html' : p;
    const full = path.join(PUBLIC, path.normalize(file).replace(/^([/\\])+/, ''));
    if (!full.startsWith(PUBLIC)) { res.writeHead(403); return res.end('interdit'); }
    fs.readFile(full, (err, buf) => {
      if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('404'); }
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      res.end(buf);
    });
  } catch (e) {
    log('ERREUR', p, e.message);
    sendJSON(res, 500, { error: e.message });
  }
});

server.listen(PORT, () => {
  log(`AlphaDesk démarré  ->  http://localhost:${PORT}`);
  log(PROTECTED
    ? 'Mode protégé : réglages et IA exigent le jeton ALPHADESK_TOKEN.'
    : 'Mode local ouvert. Si vous exposez ce serveur sur internet, définissez ALPHADESK_TOKEN.');
  getYahooSession();
});
