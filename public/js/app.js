/* =========================================================================
   AlphaDesk — application
   ========================================================================= */
import { analyze, quickScore, HORIZONS, RISKS, DEFAULT_PROFILE } from './engine.js';
import { runBacktest, walkForward } from './backtest.js';
import { PriceChart, LineChart, drawSparkline } from './chart.js';
import { FICHES, PARCOURS, QUIZ, NIVEAUX } from './academy.js';
import { UNIVERS, BENCHMARKS, PERIODES, suggestBenchmark } from './universe.js';
import { LECONS, PROGRESSION } from './lessons.js';
import { METHODES, comparerMethodes, prepareForStrategies } from './strategies.js';
import * as PF from './portfolio.js';
import {
  $, el, esc, clamp, n, px, pct, money, curSym, big, dt, annee, cls, sgn,
  cssVar, tint, meter, meterDiv, sevColor, qualColor, toast, terme
} from './format.js';
import { vueComparateur } from './vues-comparateur.js';

/* ============================== état global ============================= */
const S = {
  profile: loadProfile(),
  symbol: localStorage.getItem('alphadesk.symbol') || 'MC.PA',
  period: localStorage.getItem('alphadesk.period') || '2y',
  view: 'analyse',
  report: null,
  charts: {},
  acadSection: 'methodes',
  compar: null,
  bt: null,
  screen: null,
  ai: { hasKey: false, text: null, loading: false },
  protege: false
};

function loadProfile() {
  try {
    return { ...DEFAULT_PROFILE, ...JSON.parse(localStorage.getItem('alphadesk.profile') || '{}') };
  } catch { return { ...DEFAULT_PROFILE }; }
}
function saveProfile() {
  localStorage.setItem('alphadesk.profile', JSON.stringify(S.profile));
  renderProfileSummary();
}

/* ============================ mise en forme =============================
   Toutes les aides de formatage et les composants de jauge vivent dans
   format.js : elles sont partagees avec les vues du comparateur.          */

/* ================================== API ================================= */
const cache = new Map();
async function api(path, opts) {
  const key = path + (opts ? JSON.stringify(opts) : '');
  if (!opts && cache.has(key)) return cache.get(key);
  const r = await fetch(path, opts);
  if (!r.ok) throw new Error('Serveur : ' + r.status);
  const j = await r.json();
  if (!opts) { cache.set(key, j); setTimeout(() => cache.delete(key), 120000); }
  return j;
}
/** Jeton d'administration : seulement necessaire quand l'application est
    deployee en ligne. En local le serveur ne le reclame pas. */
const getToken = () => localStorage.getItem('alphadesk.token') || '';
function postJSON(path, body) {
  const headers = { 'content-type': 'application/json' };
  const t = getToken();
  if (t) headers['x-alphadesk-token'] = t;
  return fetch(path, { method: 'POST', headers, body: JSON.stringify(body) });
}

const getChart = (sym, range, interval) => api(`/api/chart?symbol=${encodeURIComponent(sym)}&range=${range}&interval=${interval}`);
const getFund = sym => api(`/api/fundamentals?symbol=${encodeURIComponent(sym)}`);
/** Avis d'analystes datés — souvent vides hors marché américain. */
const getAnalystes = sym => api(`/api/analystes?symbol=${encodeURIComponent(sym)}`);
/** Historique quotidien profond : indispensable pour traverser une crise.
    Les raccourcis de Yahoo degradent l'intervalle au-dela de quelques
    annees, il faut donc passer des bornes de dates explicites. */
const getChartLong = (sym, depuis = '2000-01-01') =>
  api(`/api/chart?symbol=${encodeURIComponent(sym)}&from=${depuis}&interval=1d`);

function periodCfg() { return PERIODES.find(p => p.key === S.period) || PERIODES[2]; }

/* ================================ amorçage ============================== */
init();

async function init() {
  applyCvd();
  buildPeriodSeg();
  bindNav();
  bindSearch();
  renderProfileSummary();
  $('#refreshBtn').onclick = () => { cache.clear(); render(); };

  try {
    const h = await api('/api/health');
    S.ai.hasKey = !!h.ai;
    S.protege = !!h.protege;
    $('#srvTxt').textContent = 'connecté · v' + h.version + (h.protege ? ' · protégé' : '');
  } catch {
    $('#srvDot').classList.add('off');
    $('#srvTxt').textContent = 'serveur hors ligne';
  }
  render();
}

/* Mode daltonien : la direction bascule sur une paire bleu/orange separee
   de 26,8 en deuteranopie, et les moyennes mobiles passent en rampe neutre.
   La teinte n'est jamais le seul canal : le signe et les libelles restent. */
function applyCvd() {
  const on = localStorage.getItem('alphadesk.cvd') === '1';
  document.documentElement.dataset.cvd = on ? '1' : '0';
  return on;
}

function bindNav() {
  document.querySelectorAll('#nav button').forEach(b => {
    b.onclick = () => {
      document.querySelectorAll('#nav button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      S.view = b.dataset.view;
      render();
    };
  });
}

function buildPeriodSeg() {
  const seg = $('#periodSeg');
  seg.innerHTML = PERIODES.map(p => `<button data-k="${p.key}" class="${p.key === S.period ? 'on' : ''}">${p.label.split(' ')[0]}${p.key === '10y' || p.key === 'max' ? '' : ''}</button>`).join('');
  seg.querySelectorAll('button').forEach(b => {
    b.onclick = () => {
      S.period = b.dataset.k;
      localStorage.setItem('alphadesk.period', S.period);
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.k === S.period));
      // la profondeur d'historique change tout : on invalide l'analyse en cache
      S.report = null; S.bt = null; S.ai.text = null; S.compar = null;
      render();
    };
  });
}

function bindSearch() {
  const inp = $('#search'), box = $('#results');
  let timer;
  inp.addEventListener('input', () => {
    clearTimeout(timer);
    const q = inp.value.trim();
    if (q.length < 2) { box.style.display = 'none'; return; }
    timer = setTimeout(async () => {
      try {
        const res = await api('/api/search?q=' + encodeURIComponent(q));
        box.innerHTML = res.length ? res.map(r => `
          <div class="row" data-s="${esc(r.symbol)}">
            <div class="sym">${esc(r.symbol)} <span class="xs faint">${esc(r.exchange || '')}</span></div>
            <div class="nm">${esc(r.name)}${r.sector ? ' · ' + esc(r.sector) : ''}</div>
          </div>`).join('') : '<div class="row"><div class="nm">Aucun résultat</div></div>';
        box.style.display = 'block';
        box.querySelectorAll('[data-s]').forEach(d => {
          d.onclick = () => {
            selectSymbol(d.dataset.s);
            box.style.display = 'none'; inp.value = '';
          };
        });
      } catch { box.style.display = 'none'; }
    }, 260);
  });
  document.addEventListener('click', e => { if (!e.target.closest('.search-wrap')) box.style.display = 'none'; });
}

function selectSymbol(sym) {
  S.symbol = sym;
  localStorage.setItem('alphadesk.symbol', sym);
  S.report = null; S.bt = null; S.ai.text = null; S.compar = null;
  S.view = 'analyse';
  document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('active', x.dataset.view === 'analyse'));
  render();
}

function renderProfileSummary() {
  const H = HORIZONS[S.profile.horizon], R = RISKS[S.profile.risk];
  $('#profileSummary').innerHTML =
    `<div class="b" style="color:var(--text-dim)">${H.label} · ${R.label}</div>
     <div>Capital ${money(S.profile.capital, 'EUR')} · risque ${R.riskPerTrade} %/ligne</div>`;
}

/** Ce que les vues externes ont besoin de connaitre de l'application. */
function ctxApp() {
  return {
    api, getChart, getFund, getAnalystes, getChartLong,
    periodCfg, ensureReport, render, selectSymbol, terme
  };
}

/* ================================ routeur =============================== */
async function render() {
  const c = $('#content');
  Object.values(S.charts).forEach(ch => ch?.destroy?.());
  S.charts = {};
  const views = {
    analyse: viewAnalyse, screener: viewScreener, backtest: viewBacktest,
    portefeuille: viewPortefeuille, journal: viewJournal,
    academie: viewAcademie, comparateur: c2 => vueComparateur(c2, S, ctxApp()), quiz: viewQuiz, reglages: viewReglages
  };
  try { await views[S.view](c); }
  catch (e) {
    console.error(e);
    c.innerHTML = `<div class="card"><h3>Erreur</h3><p>${esc(e.message)}</p>
      <p class="sm dim">Si le problème persiste, vérifiez que le serveur tourne et que la connexion internet est active.</p></div>`;
  }
}

/* =========================================================================
   VUE 1 — ANALYSE
   ========================================================================= */
async function viewAnalyse(c) {
  c.innerHTML = `<div class="card"><div class="row"><span class="loader"></span>
    <span class="dim">Chargement de ${esc(S.symbol)} et calcul des indicateurs…</span></div></div>`;

  const P = periodCfg();
  const bench = S.profile.benchmark || suggestBenchmark(S.symbol);
  const [data, benchmark, fundamentals] = await Promise.all([
    getChart(S.symbol, P.key, P.interval),
    getChart(bench, P.key, P.interval).catch(() => null),
    getFund(S.symbol).catch(() => null)
  ]);

  if (!data?.series?.c?.length) { c.innerHTML = `<div class="empty"><div class="big">∅</div>Aucune donnée pour ${esc(S.symbol)}.</div>`; return; }
  if (data.series.c.length < 60) {
    c.innerHTML = `<div class="card"><h3>Historique insuffisant</h3><p>${esc(S.symbol)} ne dispose que de ${data.series.c.length} séances sur cette période. Choisissez une période plus longue.</p></div>`;
    return;
  }

  const r = analyze({ data, benchmark, fundamentals, profile: S.profile });
  r.periodKey = S.period;
  S.report = r;
  const i = r.ind.n - 1;
  const chg = r.ind.c[i] - (r.ind.c[i - 1] ?? r.ind.c[i]);
  const chgP = r.ind.c[i - 1] ? chg / r.ind.c[i - 1] * 100 : 0;

  $('#topInfo').innerHTML = `<span class="mono">${esc(data.symbol)}</span>
    <span class="${cls(chgP)} mono b">${px(r.ind.c[i])} ${curSym(data.currency)}</span>
    <span class="${cls(chgP)} mono">${pct(chgP)}</span>
    ${data.stale ? '<span class="badge neutral">cache</span>' : ''}`;

  c.innerHTML = `
    ${headerBlock(r, data, chgP)}
    <div class="grid g-main">
      <div>
        ${chartCard(r)}
        ${customCard(r)}
        ${mtfCard(r)}
        ${factorsCard(r)}
        ${narrativeCard(r)}
        ${analoguesCard(r)}
        ${saisonCard(r)}
        ${aiCard(r)}
        ${fundaCard(r)}
      </div>
      <div>
        ${decisionCard(r)}
        ${planCard(r)}
        ${earningsAlert(r)}
        ${watchCard(r)}
        ${scenariosCard(r)}
        ${statsCard(r)}
        ${perfCard(r)}
      </div>
    </div>
    <div class="disclaimer">
      AlphaDesk produit une analyse technique automatisée à partir de données de marché publiques. Ce n'est pas un conseil
      en investissement personnalisé, et aucun modèle ne prédit l'avenir. Les performances passées ne préjugent pas des
      performances futures. Les décisions, et leurs conséquences, restent les vôtres.
    </div>`;

  mountChart(r);
  bindAnalyseActions(r);
}

function headerBlock(r, data, chgP) {
  const w = r.ctx.week52;
  const pos = w ? ((r.ind.c[r.ind.n - 1] - w.low) / (w.high - w.low) * 100) : null;
  const periodes = [
    ['j5', '5 jours'], ['m1', '1 mois'], ['m3', '3 mois'],
    ['m6', '6 mois'], ['a1', '1 an'], ['ytd', 'Depuis janvier']
  ];
  return `<div class="card">
    <div class="row between wrap" style="gap:18px;align-items:flex-start">
      <div>
        <div class="row wrap" style="gap:10px">
          <span style="font-size:19px;font-weight:650;letter-spacing:-.4px">${esc(data.name || data.symbol)}</span>
          <span class="badge plain mono">${esc(data.symbol)}</span>
          ${data.exchange ? `<span class="xs faint">${esc(data.exchange)}</span>` : ''}
          ${r.ctx.fundamentals?.sector ? `<span class="badge plain">${esc(r.ctx.fundamentals.sector)}</span>` : ''}
        </div>
        <div class="row" style="gap:12px;margin-top:6px;align-items:baseline">
          <span style="font-size:30px;font-weight:660;letter-spacing:-1.2px">${px(r.ind.c[r.ind.n - 1])}</span>
          <span class="dim" style="font-size:14px">${curSym(data.currency)}</span>
          <span class="${cls(chgP)} b" style="font-size:14px">${pct(chgP)}</span>
          <span class="xs faint">aujourd'hui</span>
        </div>
      </div>
    </div>

    <div class="grid g3" style="margin-top:16px;gap:10px;grid-template-columns:repeat(6,minmax(0,1fr))">
      ${periodes.map(([k, lbl]) => `<div class="stat" style="padding:11px 13px">
        <div class="lbl">${lbl}</div>
        <div class="val ${cls(r.perf[k])}" style="font-size:17px">${pct(r.perf[k], 1)}</div>
      </div>`).join('')}
    </div>

    ${w ? `<div style="margin-top:16px">
      <div class="row between xs faint">
        <span>plus bas 52 s. <b class="mono" style="color:var(--text-2)">${px(w.low)}</b></span>
        <span>position dans la fourchette annuelle : <b style="color:var(--text-2)">${n(pos, 0)} %</b></span>
        <span>plus haut 52 s. <b class="mono" style="color:var(--text-2)">${px(w.high)}</b></span>
      </div>
      <div class="meter" style="margin-top:6px;background:linear-gradient(90deg,var(--down-wash),var(--warn-wash),var(--up-wash))">
        <i style="width:2px;margin-left:${clamp(pos, 0, 100)}%;background:var(--text);border-radius:1px"></i>
      </div>
    </div>` : ''}
  </div>`;
}

function decisionCard(r) {
  const s = r.signal;
  const dirClass = s.tone.startsWith('pos') ? 'up' : s.tone === 'neutral' ? 'warn' : 'down';
  const convColor = s.conviction >= 65 ? 'var(--up)' : s.conviction >= 45 ? 'var(--warn)' : 'var(--down)';
  const verdict = s.action === 'hold'
    ? 'Aucun avantage statistique net. Rester en liquidites est ici la position la plus rentable.'
    : r.plan.actionable
      ? `Plan exploitable : rapport gain/risque de ${n(r.plan.rr, 2)} pour 1 (${r.plan.quality}).`
      : `Signal present mais rapport gain/risque insuffisant (${n(r.plan.rr, 2)}) au prix actuel — attendre un meilleur point d'entree.`;
  return `<div class="decision ${s.tone}">
    <div class="xs faint" style="letter-spacing:.8px;text-transform:uppercase;font-weight:600">Décision · ${esc(s.horizon.label)}</div>

    <div class="row between wrap" style="align-items:flex-end;margin-top:8px;gap:14px">
      <div>
        <div class="lab ${dirClass}">${esc(s.label)}</div>
        <div class="sm faint" style="margin-top:3px">${esc(s.horizon.detail)}</div>
      </div>
      <div class="hero">
        <span class="fig ${dirClass}">${sgn(s.score)}${s.score}</span>
        <span class="unit">/ 100</span>
      </div>
    </div>

    <div style="margin-top:16px">
      <div class="row between xs faint"><span>vendeur −100</span><span>point mort</span><span>+100 acheteur</span></div>
      <div style="margin-top:6px">${meterDiv(s.score, true)}</div>
    </div>

    <div class="grid g2" style="margin-top:16px;gap:14px">
      <div>
        <div class="xs faint" style="text-transform:uppercase;letter-spacing:.6px;font-weight:600">Conviction</div>
        <div class="meter-row" style="margin-top:6px">${meter(s.conviction, 100, convColor)}<span class="v">${s.conviction} %</span></div>
      </div>
      <div>
        <div class="xs faint" style="text-transform:uppercase;letter-spacing:.6px;font-weight:600">Accord des facteurs</div>
        <div class="meter-row" style="margin-top:6px">${meter(s.agreement, 100, 'var(--accent)')}<span class="v">${s.agreement} %</span></div>
      </div>
    </div>

    <div class="sm dim" style="margin-top:14px">${verdict}</div>
  </div>`;
}

function planCard(r) {
  const p = r.plan, cur = r.ctx.currency;
  const bull = r.signal.action.startsWith('buy');
  return `<div class="card">
    <h3>Plan de trade <span class="sub">${p.actionable ? 'exploitable' : 'à ne pas exécuter en l\'état'}</span></h3>
    <table>
      <tr><td class="dim">Zone d'entrée</td><td class="num b">${px(p.entryLow)} – ${px(p.entryHigh)}</td></tr>
      <tr><td class="dim">Stop de protection</td><td class="num b down">${px(p.stop)} <span class="xs faint">(${pct(p.stopPct, 1)})</span></td></tr>
      ${p.targets.map((t, k) => `<tr><td class="dim">${t.label}</td>
        <td class="num ${bull ? 'up' : 'down'}">${px(t.price)} <span class="xs faint">(${pct(t.pct, 1)} · R/R ${n(t.rr, 1)})</span></td></tr>`).join('')}
      <tr><td class="dim">Quantité conseillée</td><td class="num b">${p.sizing.shares} titres</td></tr>
      <tr><td class="dim">Montant engagé</td><td class="num">${money(p.sizing.notional, cur)} <span class="xs faint">(${n(p.sizing.notionalPct, 1)} % du capital)</span></td></tr>
      <tr><td class="dim">Perte si stop touché</td><td class="num down">${money(p.sizing.riskAmount, cur)} <span class="xs faint">(${n(p.sizing.riskPct, 2)} % du capital)</span></td></tr>
    </table>
    <div class="sm dim" style="margin-top:10px">${esc(p.entryNote)}</div>
    <div class="xs faint" style="margin-top:6px">Stop calé sur ${esc(p.stopWhy)}. ATR ${px(p.atr)} (${n(p.atrPct, 2)} % du cours).${p.sizing.capped ? ' Quantité plafonnée par la limite de concentration du profil.' : ''}</div>
    <div class="row" style="margin-top:12px;gap:8px">
      <button class="btn primary" id="addPos">Suivre cette position</button>
      <button class="btn" id="copyPlan">Copier le plan</button>
    </div>
  </div>`;
}

function customCard(r) {
  const c = r.custom;
  const tile = (code, titre, corps, note, tone) => `
    <div class="stat" style="cursor:pointer" data-fiche="${code.toLowerCase()}" title="Ouvrir la fiche ${code}">
      <div class="row between"><span class="lbl">${code}</span><span class="xs faint">${esc(titre)}</span></div>
      ${corps}
      <div class="xs ${tone}" style="margin-top:7px;line-height:1.4">${esc(note)}</div>
    </div>`;
  const val = (v, suffix) => `<div class="val" style="font-size:24px;margin-top:5px">${v}${suffix ? `<span style="font-size:13px;color:var(--text-3);font-weight:500"> ${suffix}</span>` : ''}</div>`;

  return `<div class="card">
    <h3>Indicateurs AlphaDesk <span class="sub">agrégats propriétaires — cliquez une tuile pour sa fiche</span></h3>
    <div class="grid g5">
      ${tile('TQS', 'qualité de tendance',
        val(c.tqs.value, '/100') + `<div style="margin-top:9px">${meter(c.tqs.value, 100, qualColor(c.tqs.value))}</div>`,
        c.tqs.label, c.tqs.value >= 65 ? 'up' : c.tqs.value >= 45 ? 'warn' : 'faint')}

      ${tile('MPI', 'pression du momentum',
        val(sgn(c.mpi.value) + c.mpi.value, '') + `<div style="margin-top:9px">${meterDiv(c.mpi.value)}</div>`,
        c.mpi.label, c.mpi.value > 15 ? 'up' : c.mpi.value < -15 ? 'down' : 'warn')}

      ${tile('SFI', 'flux de capitaux',
        val(sgn(c.sfi.value) + c.sfi.value, '') + `<div style="margin-top:9px">${meterDiv(c.sfi.value)}</div>`,
        c.sfi.label, c.sfi.value > 10 ? 'up' : c.sfi.value < -10 ? 'down' : 'warn')}

      ${tile('RES', 'exposition au risque',
        val(c.res.value, '/100') + `<div style="margin-top:9px">${meter(c.res.value, 100, sevColor(c.res.value))}</div>`,
        c.res.label, c.res.value > 65 ? 'down' : c.res.value > 45 ? 'warn' : 'up')}

      ${tile('VRG', 'régime de volatilité',
        `<div class="val" style="font-size:17px;margin-top:7px">${esc(c.vrg.regime)}</div>
         <div class="meter-row" style="margin-top:9px">${meter((c.vrg.rank ?? 0) * 100, 100, sevColor((c.vrg.rank ?? 0) * 100))}<span class="v">${c.vrg.rank === null ? '—' : n(c.vrg.rank * 100, 0) + '%'}</span></div>`,
        c.vrg.squeeze ? `Compression depuis ${c.vrg.squeezeBars} séances — mouvement ample en préparation` : `ATR ${n(c.vrg.atrPct, 2)} % du cours`,
        c.vrg.squeeze ? 'warn' : 'faint')}
    </div>
  </div>`;
}

function factorsCard(r) {
  const fs = [...r.signal.detail].sort((x, y) => Math.abs(y.contribution) - Math.abs(x.contribution));
  return `<div class="card">
    <h3>Les facteurs de la décision <span class="sub">triés par poids réel dans le score</span></h3>
    ${fs.map(f => `<div class="factor">
      <div class="top">
        <span class="b">${esc(f.label)} <span class="w">poids ${f.weight} %</span></span>
        <span class="mono b ${cls(f.score)}" style="font-variant-numeric:tabular-nums">${sgn(f.score)}${f.score}</span>
      </div>
      <div style="margin-top:7px">${meterDiv(f.score)}</div>
      <div class="why">${esc(f.why)}</div>
      ${f.detail ? `<div class="det">${esc(f.detail)}</div>` : ''}
    </div>`).join('')}
  </div>`;
}

function narrativeCard(r) {
  return `<div class="card">
    <h3>Lecture de l'analyse</h3>
    ${r.narrative.map(p => `<div class="narr"><h4>${esc(p.title)}</h4><p>${esc(p.text)}</p></div>`).join('')}
  </div>`;
}

function watchCard(r) {
  const ico = { invalidation: '⛔', niveau: '◈', alerte: '⚠', risque: '☢' };
  return `<div class="card">
    <h3>Ce qu'il faut surveiller</h3>
    ${r.watch.map(w => `<div class="note-line"><span class="pin">${ico[w.type] || '•'}</span><span>${esc(w.text)}</span></div>`).join('')}
  </div>`;
}

function statsCard(r) {
  const s = r.stats;
  const rows = [
    ['Volatilité annualisée', n(s.volAnn, 1) + ' %', s.volAnn > 40 ? 'down' : s.volAnn < 20 ? 'up' : ''],
    ['Ratio de Sharpe (1 an)', n(s.sharpe, 2), s.sharpe > 1 ? 'up' : s.sharpe < 0 ? 'down' : ''],
    ['Ratio de Sortino', n(s.sortino, 2), s.sortino > 1.5 ? 'up' : ''],
    ['VaR 95 % à 1 jour', pct(s.var95 * 100, 2), 'down'],
    ['CVaR 95 % (pires 5 %)', pct(s.cvar95 * 100, 2), 'down'],
    ['Repli maximal historique', pct(s.maxDD, 1), 'down'],
    ['Repli actuel', pct(s.currentDD, 1), s.currentDD < -10 ? 'down' : ''],
    ['Séances positives', n(s.positiveDays, 1) + ' %', ''],
    ['Asymétrie (skewness)', n(s.skew, 2), ''],
    ['Kurtosis excédentaire', n(s.kurtosis, 2), s.kurtosis > 4 ? 'warn' : ''],
    ['Exposant de Hurst', n(s.hurst, 2), ''],
    ...(r.ctx.relative ? [
      ['Bêta vs ' + r.ctx.relative.benchName, n(r.ctx.relative.beta, 2), ''],
      ['Corrélation à l\'indice', n(r.ctx.relative.correlation, 2), '']
    ] : [])
  ];
  return `<div class="card">
    <h3>Statistiques de risque <span class="sub">sur 1 an glissant</span></h3>
    <table>${rows.map(([a, b, k]) => `<tr><td class="dim">${a}</td><td class="num ${k}">${b}</td></tr>`).join('')}</table>
    <div class="xs faint" style="margin-top:9px">
      Lecture rapide : la VaR indique la perte dépassée une séance sur vingt. Un kurtosis supérieur à 3 signale
      des mouvements extrêmes plus fréquents que ne le suppose une loi normale — les modèles de risque classiques
      sous-estiment alors le danger.
    </div>
  </div>`;
}

function perfCard(r) {
  if (!r.ctx.relative) return '';
  const rel = r.ctx.relative;
  return `<div class="card">
    <h3>Face au marché <span class="sub">${esc(rel.benchName)}</span></h3>
    <table>
      <tr><td class="dim">Écart sur 1 mois</td><td class="num ${cls(rel.excess1m)}">${pct(rel.excess1m, 1)}</td></tr>
      <tr><td class="dim">Écart sur 3 mois</td><td class="num ${cls(rel.excess3m)}">${pct(rel.excess3m, 1)}</td></tr>
      <tr><td class="dim">Écart sur 1 an</td><td class="num ${cls(rel.excess1y)}">${pct(rel.excess1y, 1)}</td></tr>
    </table>
    <div class="xs faint" style="margin-top:8px">
      Un bêta de ${n(rel.beta, 2)} signifie que le titre amplifie les mouvements de l'indice d'environ ${n((rel.beta || 1) * 100, 0)} %.
      ${rel.correlation !== null && rel.correlation < 0.5 ? 'La corrélation faible en fait un bon outil de diversification.' : ''}
    </div>
  </div>`;
}

function fundaCard(r) {
  const f = r.ctx.fundamentals;
  if (!f || f.error || (!f.per && !f.marketCap && !f.roe)) return '';
  const a = f.analysts || {};
  const totalA = a.strongBuy + a.buy + a.hold + a.sell + a.strongSell;
  const rows = [
    ['Capitalisation', big(f.marketCap)], ['PER (12 derniers mois)', n(f.per, 1)],
    ['PER prévisionnel', n(f.perFwd, 1)], ['Ratio cours / actif net', n(f.priceToBook, 2)],
    ['Rendement du dividende', f.dividendYield ? n(f.dividendYield * 100, 2) + ' %' : '—'],
    ['Croissance du CA', f.revenueGrowth != null ? pct(f.revenueGrowth * 100, 1) : '—'],
    ['Marge nette', f.profitMargin != null ? n(f.profitMargin * 100, 1) + ' %' : '—'],
    ['Rentabilité des fonds propres', f.roe != null ? n(f.roe * 100, 1) + ' %' : '—'],
    ['Dette / fonds propres', f.debtToEquity != null ? n(f.debtToEquity, 0) + ' %' : '—'],
    ['Bêta (source marché)', n(f.beta, 2)]
  ];
  const target = f.targetMean;
  const upside = target && r.ind.c[r.ind.n - 1] ? (target / r.ind.c[r.ind.n - 1] - 1) * 100 : null;
  return `<div class="card">
    <h3>Fondamentaux <span class="sub">${esc(f.industry || f.sector || '')}</span></h3>
    <div class="grid g2">
      <table>${rows.slice(0, 5).map(([x, y]) => `<tr><td class="dim">${x}</td><td class="num">${y}</td></tr>`).join('')}</table>
      <table>${rows.slice(5).map(([x, y]) => `<tr><td class="dim">${x}</td><td class="num">${y}</td></tr>`).join('')}</table>
    </div>
    ${totalA > 0 ? `<div style="margin-top:12px">
      <div class="row between sm"><span class="dim">Consensus des analystes (${totalA} avis)</span>
      <span class="b">${esc(({ strong_buy: 'Achat fort', buy: 'Achat', hold: 'Conserver', sell: 'Vendre', strong_sell: 'Vente forte' })[f.recoKey] || f.recoKey || '—')}</span></div>
      <div class="row" style="gap:2px;margin-top:6px;height:7px">
        ${[['strongBuy', 'var(--up)'], ['buy', 'rgba(46,189,133,.55)'], ['hold', 'var(--warn)'], ['sell', 'rgba(246,70,93,.55)'], ['strongSell', 'var(--down)']]
          .map(([k, col]) => a[k] ? `<div style="flex:${a[k]};background:${col};border-radius:2px" title="${k}: ${a[k]}"></div>` : '').join('')}
      </div>
      ${target ? `<div class="sm dim" style="margin-top:8px">Objectif de cours moyen : <span class="mono b">${px(target)}</span>
        <span class="${cls(upside)}">(${pct(upside, 1)})</span> · fourchette ${px(f.targetLow)} – ${px(f.targetHigh)}</div>` : ''}
      <div class="xs faint" style="margin-top:6px">Le consensus des analystes est une information de marché, pas une vérité :
        il est souvent en retard et structurellement optimiste. AlphaDesk l'affiche sans l'intégrer au score.</div>
    </div>` : ''}
    ${f.summary ? `<details class="acc-block" style="margin-top:12px"><summary>Activité de la société</summary>
      <div class="inner sm dim">${esc(f.summary.slice(0, 1200))}</div></details>` : ''}
  </div>`;
}

function aiCard(r) {
  return `<div class="card" id="aiCard">
    <h3>Second regard — analyste IA <span class="sub">${S.ai.hasKey ? 'Claude relit le rapport chiffré' : 'clé API non configurée'}</span></h3>
    ${S.ai.hasKey
      ? (S.ai.text
        ? `<div class="sm" style="line-height:1.7;white-space:pre-wrap">${mdLite(S.ai.text)}</div>
           <button class="btn sm" id="aiAgain" style="margin-top:10px">Regénérer</button>`
        : `<p class="sm dim">Le moteur d'AlphaDesk a produit le rapport chiffré ci-dessus. L'IA ne recalcule rien :
           elle relit ces chiffres et les met en perspective, sans jamais en inventer.</p>
           <button class="btn primary" id="aiRun">Demander l'avis de l'IA</button>`)
      : `<p class="sm dim">Toute l'analyse ci-dessus est produite localement, sans IA — les scores, le plan et le narratif
         sortent du moteur de calcul. Vous pouvez en plus faire relire ce rapport par Claude pour un second regard
         rédigé : renseignez une clé API dans <b>Réglages</b>. C'est facultatif, tout fonctionne sans.</p>`}
  </div>`;
}

function mdLite(t) {
  return esc(t)
    .replace(/\*\*(.+?)\*\*/g, '<b class="acc">$1</b>')
    .replace(/^#+\s*(.+)$/gm, '<b>$1</b>')
    .replace(/^[-•]\s*(.+)$/gm, '&nbsp;• $1');
}


/* ======================= contexte élargi de l'analyse ===================== */

function mtfCard(r) {
  const m = r.mtf;
  if (!m) return '';
  const jour = r.signal.score >= 18 ? 1 : r.signal.score <= -18 ? -1 : 0;
  const aligne = m.sens !== 0 && jour !== 0 && m.sens === jour;
  const conflit = m.sens !== 0 && jour !== 0 && m.sens !== jour;
  const tone = aligne ? 'up' : conflit ? 'down' : 'warn';
  const verdict = aligne
    ? `Les deux unités de temps disent la même chose. C'est la configuration la plus confortable : le signal quotidien travaille dans le sens de la marée hebdomadaire.`
    : conflit
      ? `Conflit d'unités de temps : le signal quotidien est ${jour > 0 ? 'acheteur' : 'vendeur'} alors que la tendance ${esc(m.echelle)} est ${m.sens > 0 ? 'haussière' : 'baissière'}. Une position prise contre l'unité de temps supérieure réussit nettement moins souvent — réduire la taille, ou attendre que les deux s'accordent.`
      : `L'unité de temps supérieure n'a pas d'avis tranché. Le signal quotidien n'est ni soutenu ni contrarié : traitez-le comme un signal de court terme, avec une taille réduite.`;
  return `<div class="card">
    <h3>Unité de temps supérieure <span class="sub">${esc(m.echelle)} · le filtre le plus rentable qui ne coûte rien</span></h3>
    <div class="grid g2" style="gap:12px">
      <div class="stat">
        <div class="lbl">Vue ${esc(m.echelle)}</div>
        <div class="val sm ${m.sens > 0 ? 'up' : m.sens < 0 ? 'down' : 'warn'}">${esc(m.label)}</div>
        <div class="note mono xs">${esc(m.detail)}</div>
      </div>
      <div class="stat">
        <div class="lbl">Vue de la période affichée</div>
        <div class="val sm ${jour > 0 ? 'up' : jour < 0 ? 'down' : 'warn'}">${esc(r.signal.label)}</div>
        <div class="note">score ${sgn(r.signal.score)}${r.signal.score} · conviction ${r.signal.conviction} %</div>
      </div>
    </div>
    <div class="note-line" style="margin-top:12px;border:0;padding-bottom:0">
      <span class="pin">${aligne ? '✓' : conflit ? '⛔' : '⚠'}</span>
      <span class="${tone}">${verdict}</span>
    </div>
  </div>`;
}

function analoguesCard(r) {
  const a = r.analogues;
  if (!a) return '';
  if (a.insuffisant) return `<div class="card">
    <h3>Configurations analogues</h3>
    <p class="sm dim" style="margin:0">Cette configuration ne s'est présentée que ${a.total} fois sur l'historique chargé —
    trop peu pour en tirer quoi que ce soit. Chargez une période plus longue, ou considérez que le passé n'a rien à dire ici.</p>
  </div>`;
  const h21 = a.horizons[21], h63 = a.horizons[63];
  const ligne = (lbl, h) => `<tr>
    <td class="dim">${lbl}</td>
    <td class="num b ${cls(h.moyenne)}">${pct(h.moyenne, 2)}</td>
    <td class="num ${cls(h.mediane)}">${pct(h.mediane, 2)}</td>
    <td class="num">${n(h.positif, 0)} %</td>
    <td class="num faint">${pct(h.p20, 1)} → ${pct(h.p80, 1)}</td>
  </tr>`;
  return `<div class="card">
    <h3>Configurations analogues <span class="sub">les ${a.total} fois où ce titre était dans le même état</span></h3>
    <p class="sm dim" style="margin-top:0">
      État actuel : <b>${esc(a.libelle)}</b>. Voici ce qui s'est passé ensuite, sur cet historique.
      Ce n'est pas une prévision — c'est une base de comparaison.
    </p>
    <table>
      <thead><tr><th>Ensuite</th><th class="num">Moyenne</th><th class="num">Médiane</th>
        <th class="num">% positifs</th><th class="num">Fourchette usuelle</th></tr></thead>
      <tbody>
        ${ligne('Après 1 mois', h21)}
        ${ligne('Après 3 mois', h63)}
      </tbody>
    </table>
    <div class="xs faint" style="margin-top:9px">
      La « fourchette usuelle » écarte les 20 % de cas les plus extrêmes de chaque côté.
      Pire cas observé à un mois : ${pct(h21.pire, 1)} · meilleur : ${pct(h21.meilleur, 1)}.
      ${a.total < 15 ? ' Avec moins de quinze occurrences, considérez ces chiffres comme indicatifs seulement.' : ''}
    </div>
  </div>`;
}

function scenariosCard(r) {
  const sc = r.scenarios;
  if (!sc) return '';
  const p = r.ind.c[r.ind.n - 1];
  const rows = [
    ['Très défavorable', sc.tresBas, '5 % des cas font pire', 'down'],
    ['Défavorable', sc.bas, '1 cas sur 4', 'down'],
    ['Médian', sc.median, 'la moitié des cas de part et d\'autre', ''],
    ['Favorable', sc.haut, '1 cas sur 4', 'up'],
    ['Très favorable', sc.tresHaut, '5 % des cas font mieux', 'up']
  ];
  return `<div class="card">
    <h3>Fourchette probable à un mois <span class="sub">distribution réelle de ce titre, pas une loi théorique</span></h3>
    <table>
      ${rows.map(([lbl, v, note, k]) => `<tr>
        <td class="dim">${lbl}</td>
        <td class="num b ${k}">${px(v)}</td>
        <td class="num ${cls((v / p - 1) * 100)}">${pct((v / p - 1) * 100, 1)}</td>
        <td class="xs faint">${note}</td>
      </tr>`).join('')}
    </table>
    <div class="xs faint" style="margin-top:9px">
      Calculé sur ${sc.n} fenêtres de 21 séances de l'historique chargé. Historiquement,
      ${n(sc.baisseProbable, 0)} % des mois se sont terminés en baisse sur cette valeur.
      Une loi normale sous-estimerait les extrêmes : c'est pourquoi on utilise la distribution observée.
    </div>
  </div>`;
}

function saisonCard(r) {
  const s = r.saison;
  if (!s || !s.fiable) return '';
  const vals = s.mois.filter(m => m.moyenne !== null).map(m => m.moyenne);
  const amp = Math.max(...vals.map(Math.abs)) || 1;
  const moisActuel = new Date().getMonth();
  return `<div class="card">
    <h3>Saisonnalité <span class="sub">rendement moyen par mois sur ${n(s.anneesCouvertes, 1)} ans d'historique</span></h3>
    <div class="grid" style="grid-template-columns:repeat(12,minmax(0,1fr));gap:6px;align-items:end">
      ${s.mois.map(m => {
        const h = m.moyenne === null ? 0 : Math.abs(m.moyenne) / amp * 52;
        const pos = (m.moyenne ?? 0) >= 0;
        return `<div class="center" title="${m.nom} : ${pct(m.moyenne, 2)} sur ${m.n} années">
          <div style="height:56px;display:flex;flex-direction:column;justify-content:${pos ? 'flex-end' : 'flex-start'}">
            ${pos ? `<div style="height:${h}px;background:var(--up);border-radius:3px 3px 0 0"></div>` : ''}
          </div>
          <div style="height:2px;background:var(--axis)"></div>
          <div style="height:56px">
            ${!pos ? `<div style="height:${h}px;background:var(--down);border-radius:0 0 3px 3px"></div>` : ''}
          </div>
          <div class="xs ${m.mois === moisActuel ? 'acc b' : 'faint'}" style="margin-top:4px">${m.nom}</div>
        </div>`;
      }).join('')}
    </div>
    <div class="xs faint" style="margin-top:10px">
      La saisonnalité est l'un des effets les plus fragiles de l'analyse de marché : avec seulement
      ${n(s.anneesCouvertes, 0)} observations par mois, un seul krach déforme toute une colonne.
      À lire comme une curiosité, jamais comme une raison d'acheter.
    </div>
  </div>`;
}

function earningsAlert(r) {
  const f = r.ctx.fundamentals;
  if (!f || !f.nextEarnings) return '';
  const jours = Math.round((f.nextEarnings * 1000 - Date.now()) / 86400000);
  if (jours < -2 || jours > 30) return '';
  const proche = jours <= 10;
  return `<div class="card" style="border-color:${proche ? 'rgba(250,178,25,.45)' : 'var(--border)'}">
    <h3>Publication de résultats</h3>
    <div class="note-line" style="border:0;padding:0">
      <span class="pin">${proche ? '⚠' : 'ℹ'}</span>
      <span class="${proche ? 'warn' : ''}">
        Résultats attendus ${jours <= 0 ? 'aujourd\'hui ou tout juste publiés' : `dans ${jours} jour${jours > 1 ? 's' : ''}`}
        (${dt(f.nextEarnings * 1000)}).
        ${proche ? 'Une publication provoque régulièrement un écart de plusieurs pour cent à l\'ouverture, qui saute par-dessus les stops : le risque réel dépasse alors ce que le plan a calculé. Soit on réduit la position avant, soit on attend la publication.' : 'À garder en tête si l\'horizon de la position dépasse cette date.'}
      </span>
    </div>
  </div>`;
}

function chartCard(r) {
  return `<div class="card pad0">
    <div class="row between" style="padding:12px 16px 0">
      <h3 style="margin:0">Graphique</h3>
      <div class="row" style="gap:6px">
        <div class="seg" id="ovSeg">
          <button data-o="ma" class="on">Moyennes</button>
          <button data-o="bb">Bollinger</button>
          <button data-o="st">Supertrend</button>
          <button data-o="ich">Ichimoku</button>
          <button data-o="lv" class="on">Niveaux</button>
          <button data-o="plan" class="on">Plan</button>
        </div>
      </div>
    </div>
    <div class="chart-legend" id="chartLegend"></div>
    <div class="chart-host"><canvas id="mainChart"></canvas></div>
    <div class="xs faint" style="padding:4px 16px 12px">Ctrl + molette = zoom · survol = lecture des valeurs</div>
  </div>`;
}

const OV = { ma: true, bb: false, st: false, ich: false, lv: true, plan: true };

function mountChart(r) {
  const cv = $('#mainChart');
  if (!cv) return;
  const ch = new PriceChart(cv);
  S.charts.main = ch;
  const draw = () => ch.setData(buildChartCfg(r));
  draw();
  ch.onHover = idx => {
    const L = $('#chartLegend'); if (!L) return;
    if (idx === null) { L.innerHTML = legendStatic(r); return; }
    const i = idx;
    L.innerHTML = `<span class="mono">${dt(r.ind.t[i])}</span>
      <span>O <b class="mono">${px(r.ind.o[i])}</b></span>
      <span>H <b class="mono">${px(r.ind.h[i])}</b></span>
      <span>B <b class="mono">${px(r.ind.l[i])}</b></span>
      <span>C <b class="mono ${r.ind.c[i] >= r.ind.o[i] ? 'up' : 'down'}">${px(r.ind.c[i])}</b></span>
      <span>Vol <b class="mono">${big(r.ind.v[i])}</b></span>
      <span>RSI <b class="mono">${n(r.ind.rsi[i], 1)}</b></span>
      <span>MACD <b class="mono ${cls(r.ind.macd.hist[i])}">${n(r.ind.macd.hist[i], 3)}</b></span>`;
  };
  $('#chartLegend').innerHTML = legendStatic(r);
  $('#ovSeg').querySelectorAll('button').forEach(b => {
    b.onclick = () => { OV[b.dataset.o] = !OV[b.dataset.o]; b.classList.toggle('on', OV[b.dataset.o]); draw(); $('#chartLegend').innerHTML = legendStatic(r); };
  });
}

function legendStatic(r) {
  const keys = [];
  if (OV.ma) keys.push(
    ['MM20', cssVar('--ma-20')], ['MM50', cssVar('--ma-50')], ['MM200', cssVar('--ma-200')]);
  if (OV.bb) keys.push(['Bollinger 20-2', cssVar('--text-3')]);
  if (OV.st) keys.push(['Supertrend', r.ind.supertrend.dir[r.ind.n - 1] === 1 ? cssVar('--up') : cssVar('--down')]);
  if (OV.ich) keys.push(['Nuage Ichimoku', cssVar('--accent')]);
  return keys.map(([l, c]) => `<span class="key"><i style="background:${c}"></i>${l}</span>`).join('') +
    `<span class="faint">panneaux : volume · RSI 14 · MACD 12-26-9</span>`;
}

function buildChartCfg(r) {
  const ind = r.ind;
  const UP = cssVar('--up'), DOWN = cssVar('--down'), ACC = cssVar('--accent'), MUTED = cssVar('--text-3');
  const ov = [];

  // Les trois moyennes mobiles ne sont pas des categories : c'est une serie
  // ORDONNEE (horizon court -> long). Une rampe monochrome encode cet ordre
  // et libere le vert/rouge pour la seule direction des cours.
  if (OV.ma) {
    ov.push({ data: ind.sma20, color: cssVar('--ma-20'), width: 2, type: 'line' });
    ov.push({ data: ind.sma50, color: cssVar('--ma-50'), width: 2, type: 'line' });
    ov.push({ data: ind.sma200, color: cssVar('--ma-200'), width: 2, type: 'line' });
  }
  if (OV.bb) {
    ov.push({ data: ind.bb.upper, color: MUTED, width: 1, type: 'line' });
    ov.push({ data: ind.bb.lower, color: MUTED, width: 1, type: 'line' });
    ov.push({ data: ind.bb.mid, color: tint('--text-3', .5), width: 1, type: 'line' });
  }
  if (OV.st) {
    // le Supertrend porte un sens : il prend le jeton de direction
    ov.push({ data: ind.supertrend.line, color: ind.supertrend.dir[ind.n - 1] === 1 ? UP : DOWN, width: 2, type: 'line' });
  }
  if (OV.ich) {
    const d = ind.ichimoku.disp;
    const shift = arr => { const o = new Array(ind.n).fill(null); for (let i = 0; i < ind.n; i++) if (arr[i - d] != null) o[i] = arr[i - d]; return o; };
    const A = shift(ind.ichimoku.senkouA), B = shift(ind.ichimoku.senkouB);
    const last = ind.n - 1;
    const bull = (A[last] ?? 0) >= (B[last] ?? 0);
    // lavis a ~10 % : un nuage est une zone, jamais un bloc sature
    ov.push({ type: 'cloud', a: A, b: B, color: bull ? tint('--up', .10) : tint('--down', .10) });
    ov.push({ data: ind.ichimoku.tenkan, color: ACC, width: 1, type: 'line' });
    ov.push({ data: ind.ichimoku.kijun, color: tint('--accent', .55), width: 1, type: 'line' });
  }

  const hl = [];
  if (OV.lv) {
    // zones de prix : trait plein d'une hauteur de cheveu, tres recessif
    r.struct.levels.slice(0, 5).forEach(z => hl.push({
      price: z.price, dash: [],
      color: z.kind === 'resistance' ? tint('--down', .32) : tint('--up', .32)
    }));
  }
  if (OV.plan && r.signal.action !== 'hold') {
    // le stop et les objectifs sont des niveaux PROJETES, pas encore atteints :
    // le pointille est ici porteur de sens, il ne decore pas une grille
    hl.push({ price: r.plan.stop, color: DOWN, dash: [5, 4], label: 'Stop ' + px(r.plan.stop) });
    r.plan.targets.slice(0, 2).forEach((t, k) =>
      hl.push({ price: t.price, color: UP, dash: [5, 4], label: `Obj. ${k + 1}  ${px(t.price)}` }));
  }

  const volUp = tint('--up', .42), volDown = tint('--down', .42);
  const volColor = (v, i) => ind.c[i] >= ind.o[i] ? volUp : volDown;
  const histColor = v => v >= 0 ? UP : DOWN;

  return {
    t: ind.t, o: ind.o, h: ind.h, l: ind.l, c: ind.c, v: ind.v,
    bars: Math.min(200, ind.n), height: 470, overlays: ov, hlines: hl,
    panes: [
      {
        label: 'Volume', height: 54,
        series: [
          { data: ind.v, type: 'bars', colorFn: volColor },
          { data: ind.volSma20, type: 'line', color: MUTED, width: 1 }
        ]
      },
      {
        label: 'RSI 14', height: 66, range: [0, 100],
        bands: [
          { v: 30, color: tint('--up', .3) },
          { v: 50, color: 'rgba(255,255,255,.055)' },
          { v: 70, color: tint('--down', .3) }
        ],
        series: [{ data: ind.rsi, type: 'line', color: ACC, width: 2 }]
      },
      {
        label: 'MACD 12-26-9', height: 66, zeroCentered: true,
        bands: [{ v: 0, color: 'rgba(255,255,255,.07)' }],
        series: [
          { data: ind.macd.hist, type: 'hist', colorFn: histColor },
          { data: ind.macd.line, type: 'line', color: ACC, width: 1.6 },
          { data: ind.macd.signal, type: 'line', color: MUTED, width: 1.4 }
        ]
      }
    ]
  };
}

function bindAnalyseActions(r) {
  document.querySelectorAll('[data-fiche]').forEach(d => {
    d.onclick = () => {
      S.view = 'academie';
      S.acadSection = 'indicateurs';   // sinon la fiche visee n'est pas dans la section affichee
      S.focusFiche = d.dataset.fiche;
      document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('active', x.dataset.view === 'academie'));
      render();
    };
  });
  const add = $('#addPos');
  if (add) add.onclick = () => openAddPosition(r);
  const cp = $('#copyPlan');
  if (cp) cp.onclick = () => {
    const p = r.plan;
    const txt = `${r.ctx.name} (${r.ctx.symbol}) — ${r.signal.label}
Score ${r.signal.score}/100 · conviction ${r.signal.conviction} % · horizon ${r.signal.horizon.label}
Entrée : ${px(p.entryLow)} – ${px(p.entryHigh)}
Stop : ${px(p.stop)} (${pct(p.stopPct, 1)}) — ${p.stopWhy}
Objectifs : ${p.targets.map(t => `${px(t.price)} (R/R ${n(t.rr, 1)})`).join(' / ')}
Quantité : ${p.sizing.shares} titres = ${money(p.sizing.notional, r.ctx.currency)}
Perte si stop : ${money(p.sizing.riskAmount, r.ctx.currency)} (${n(p.sizing.riskPct, 2)} % du capital)`;
    navigator.clipboard.writeText(txt).then(() => toast('Plan copié dans le presse-papier', 'ok'));
  };
  const aiBtn = $('#aiRun') || $('#aiAgain');
  if (aiBtn) aiBtn.onclick = () => runAI(r);
}

async function runAI(r) {
  const card = $('#aiCard');
  card.querySelector('button').disabled = true;
  card.insertAdjacentHTML('beforeend', '<div class="row sm dim" id="aiLoad" style="margin-top:10px"><span class="loader"></span> Analyse en cours…</div>');
  const payload = {
    titre: r.ctx.name, symbole: r.ctx.symbol, devise: r.ctx.currency,
    cours: r.ind.c[r.ind.n - 1], horizon: r.signal.horizon.label, profilRisque: r.signal.riskProfile.label,
    capital: r.profile.capital,
    decision: { signal: r.signal.label, score: r.signal.score, conviction: r.signal.conviction, accordFacteurs: r.signal.agreement },
    indicateursMaison: {
      TQS: r.custom.tqs.value, MPI: r.custom.mpi.value, SFI: r.custom.sfi.value,
      RES: r.custom.res.value, regimeVolatilite: r.custom.vrg.regime, compression: r.custom.vrg.squeeze
    },
    facteurs: r.signal.detail.map(f => ({ nom: f.label, score: f.score, poids: f.weight, lecture: f.why, detail: f.detail })),
    plan: {
      entree: [r.plan.entryLow, r.plan.entryHigh], stop: r.plan.stop, motifStop: r.plan.stopWhy,
      objectifs: r.plan.targets.map(t => ({ prix: t.price, rr: t.rr, origine: t.source })),
      quantite: r.plan.sizing.shares, montant: r.plan.sizing.notional, perteSiStop: r.plan.sizing.riskAmount,
      rapportGainRisque: r.plan.rr, exploitable: r.plan.actionable
    },
    performances: r.perf, statistiquesRisque: r.stats,
    surveillance: r.watch.map(w => w.text),
    fondamentaux: r.ctx.fundamentals ? {
      per: r.ctx.fundamentals.per, roe: r.ctx.fundamentals.roe,
      croissanceCA: r.ctx.fundamentals.revenueGrowth, margeNette: r.ctx.fundamentals.profitMargin,
      detteFondsPropres: r.ctx.fundamentals.debtToEquity, secteur: r.ctx.fundamentals.sector
    } : null
  };
  try {
    const res = await postJSON('/api/ai', payload);
    const j = await res.json();
    if (res.status === 401) {
      toast('Jeton d\'administration requis — renseignez-le dans Réglages', 'err');
      $('#aiLoad')?.remove(); card.querySelector('button').disabled = false; return;
    }
    if (j.ok) { S.ai.text = j.text; render(); }
    else { toast('IA indisponible : ' + (j.reason || 'erreur'), 'err'); $('#aiLoad')?.remove(); card.querySelector('button').disabled = false; }
  } catch (e) {
    toast('IA : ' + e.message, 'err'); $('#aiLoad')?.remove();
  }
}

function openAddPosition(r) {
  const p = r.plan;
  const bear = r.signal.action.startsWith('sell');
  const m = el(`<div class="modal-bg"><div class="modal">
    <h2>Suivre cette position</h2>
    <div class="sm dim" style="margin-bottom:14px">${esc(r.ctx.name)} — les valeurs proviennent du plan calculé. Ajustez si votre exécution réelle diffère.</div>
    ${bear ? `<div class="note-line" style="border:0;padding:0 0 12px"><span class="pin">⚠</span>
      <span class="sm warn">Le plan en cours est un plan de <b>baisse</b> : stop au-dessus du cours, objectifs en dessous.
      Le sens est donc pré-réglé sur « vente à découvert ». Si vous détenez déjà le titre et souhaitez simplement suivre
      votre ligne existante, passez le sens sur « achat » et saisissez vos propres niveaux.</span></div>` : ''}
    <div class="grid g2">
      <div><label class="field">Sens</label><select id="f_side">
        <option value="long" ${bear ? '' : 'selected'}>Achat (long)</option>
        <option value="short" ${bear ? 'selected' : ''}>Vente à découvert</option></select></div>
      <div><label class="field">Quantité</label><input type="number" id="f_qty" value="${p.sizing.shares}" step="any"></div>
      <div><label class="field">Prix d'entrée</label><input type="number" id="f_entry" value="${p.price.toFixed(4)}" step="any"></div>
      <div><label class="field">Stop</label><input type="number" id="f_stop" value="${p.stop.toFixed(4)}" step="any"></div>
      <div><label class="field">Objectif 1</label><input type="number" id="f_t1" value="${p.targets[0].price.toFixed(4)}" step="any"></div>
      <div><label class="field">Objectif 2</label><input type="number" id="f_t2" value="${p.targets[1].price.toFixed(4)}" step="any"></div>
    </div>
    <label class="field" style="margin-top:12px">Thèse d'investissement — pourquoi vous entrez (à relire à la sortie)</label>
    <textarea id="f_thesis" rows="3" style="width:100%">${esc(r.narrative[4]?.text.slice(0, 200) || '')}</textarea>
    <div class="row" style="margin-top:16px;gap:8px;justify-content:flex-end">
      <button class="btn" id="f_cancel">Annuler</button>
      <button class="btn primary" id="f_ok">Enregistrer</button>
    </div>
  </div></div>`);
  document.body.appendChild(m);
  m.querySelector('#f_cancel').onclick = () => m.remove();
  m.onclick = e => { if (e.target === m) m.remove(); };
  m.querySelector('#f_ok').onclick = () => {
    PF.addPosition({
      symbol: r.ctx.symbol, name: r.ctx.name, currency: r.ctx.currency,
      side: m.querySelector('#f_side').value, qty: +m.querySelector('#f_qty').value,
      entry: +m.querySelector('#f_entry').value, stop: +m.querySelector('#f_stop').value,
      target1: +m.querySelector('#f_t1').value, target2: +m.querySelector('#f_t2').value,
      thesis: m.querySelector('#f_thesis').value,
      scoreAtEntry: r.signal.score, convictionAtEntry: r.signal.conviction, horizon: S.profile.horizon
    });
    m.remove(); toast('Position ajoutée au portefeuille', 'ok');
  };
}

/* =========================================================================
   VUE 2 — SCREENER
   ========================================================================= */
async function viewScreener(c) {
  const keys = Object.keys(UNIVERS);
  const sel = S.screenUniverse || 'cac40';
  c.innerHTML = `
    <div class="card">
      <h3>Screener <span class="sub">le moteur note chaque valeur de l'univers avec vos réglages</span></h3>
      <div class="row wrap" style="gap:10px">
        <div><label class="field">Univers</label>
          <select id="uni">${keys.map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${UNIVERS[k].label} (${UNIVERS[k].symbols.length})</option>`).join('')}</select></div>
        <div><label class="field">Filtre</label>
          <select id="filt">
            <option value="all">Tout afficher</option>
            <option value="buy">Signaux d'achat seulement</option>
            <option value="actionable">Plans exploitables seulement</option>
            <option value="sell">Signaux de vente seulement</option>
          </select></div>
        <div style="align-self:flex-end"><button class="btn primary" id="scan">Lancer le scan</button></div>
        <div class="grow"></div>
        <div class="sm dim" style="align-self:flex-end;max-width:360px">${esc(UNIVERS[sel].note)}</div>
      </div>
      <div id="scanProg" style="margin-top:12px;display:none">
        <div class="progress"><i id="scanBar" style="width:0%"></i></div>
        <div class="xs faint" id="scanTxt" style="margin-top:5px"></div>
      </div>
    </div>
    <div id="scanOut">${S.screen ? '' : `<div class="empty"><div class="big">⛃</div>
      Lancez un scan pour classer les valeurs de l'univers selon votre profil<br>
      <span class="sm">${HORIZONS[S.profile.horizon].label} · ${RISKS[S.profile.risk].label} · capital ${money(S.profile.capital, 'EUR')}</span></div>`}</div>`;

  $('#uni').onchange = e => { S.screenUniverse = e.target.value; S.screen = null; render(); };
  $('#filt').onchange = () => { if (S.screen) renderScanTable(); };
  $('#scan').onclick = () => runScan(sel);
  if (S.screen) renderScanTable();
}

async function runScan(uniKey) {
  const uni = UNIVERS[uniKey];
  const prog = $('#scanProg'), bar = $('#scanBar'), txt = $('#scanTxt');
  prog.style.display = 'block';
  $('#scan').disabled = true;

  const P = periodCfg();
  const benchSym = S.profile.benchmark || '^FCHI';
  let benchPerf = null;
  try {
    const b = await getChart(benchSym, '1y', '1d');
    const bc = b.series.c, i = bc.length - 1;
    const ch = k => i >= k ? 100 * (bc[i] / bc[i - k] - 1) : null;
    benchPerf = { name: b.name || benchSym, m1: ch(21), m3: ch(63), a1: ch(252) };
  } catch { }

  const chunks = [];
  for (let i = 0; i < uni.symbols.length; i += 12) chunks.push(uni.symbols.slice(i, i + 12));
  const rows = []; const failed = [];
  let done = 0;

  for (const ch of chunks) {
    txt.textContent = `Téléchargement et calcul… ${done}/${uni.symbols.length}`;
    try {
      const batch = await api(`/api/batch?symbols=${encodeURIComponent(ch.join(','))}&range=1y&interval=1d`);
      for (const sym of ch) {
        const d = batch[sym];
        if (!d || d.error || !d.series?.c?.length) { failed.push(sym); continue; }
        const q = quickScore(d, S.profile, benchPerf);
        if (q) rows.push(q); else failed.push(sym);
      }
    } catch (e) { failed.push(...ch); }
    done += ch.length;
    bar.style.width = (100 * done / uni.symbols.length) + '%';
    await new Promise(r => setTimeout(r, 10));
  }

  S.screen = { rows, failed, uni: uni.label, at: Date.now(), benchPerf };
  prog.style.display = 'none';
  $('#scan').disabled = false;
  renderScanTable();
}

function renderScanTable() {
  const out = $('#scanOut'); if (!out || !S.screen) return;
  const filt = $('#filt')?.value || 'all';
  let rows = [...S.screen.rows];
  if (filt === 'buy') rows = rows.filter(r => r.signal.action.startsWith('buy'));
  if (filt === 'sell') rows = rows.filter(r => r.signal.action.startsWith('sell'));
  if (filt === 'actionable') rows = rows.filter(r => r.plan.actionable);
  rows.sort((a, b) => b.signal.score - a.signal.score);

  const buys = S.screen.rows.filter(r => r.signal.action.startsWith('buy')).length;
  const sells = S.screen.rows.filter(r => r.signal.action.startsWith('sell')).length;
  const acti = S.screen.rows.filter(r => r.plan.actionable).length;
  const avg = rows.length ? rows.reduce((s, r) => s + r.signal.score, 0) / S.screen.rows.length : 0;

  out.innerHTML = `
    <div class="grid g4" style="margin-bottom:14px">
      <div class="kpi"><div class="lbl">Valeurs analysées</div><div class="val">${S.screen.rows.length}</div>
        <div class="note">${S.screen.failed.length ? S.screen.failed.length + ' indisponibles' : 'univers complet'}</div></div>
      <div class="kpi"><div class="lbl">Signaux d'achat</div><div class="val up">${buys}</div>
        <div class="note">${acti} plans exploitables</div></div>
      <div class="kpi"><div class="lbl">Signaux de vente</div><div class="val down">${sells}</div></div>
      <div class="kpi"><div class="lbl">Score moyen de l'univers</div><div class="val ${cls(avg)}">${sgn(avg)}${n(avg, 0)}</div>
        <div class="note">${avg > 15 ? 'marché globalement porteur' : avg < -15 ? 'marché globalement négatif' : 'marché sans direction dominante'}</div></div>
    </div>
    <div class="card pad0">
      <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th>Valeur</th><th class="right">Cours</th><th class="right">Score</th><th>Signal</th>
          <th class="right">Conv.</th><th class="right">TQS</th><th class="right">MPI</th><th class="right">SFI</th>
          <th class="right">RES</th><th class="right">3 mois</th><th class="right">vs indice</th>
          <th class="right">R/R</th><th class="right">Stop</th>
        </tr></thead>
        <tbody>
        ${rows.map(r => `<tr class="clickable" data-s="${esc(r.symbol)}">
          <td><div class="b">${esc(r.name?.slice(0, 26) || r.symbol)}</div><div class="xs faint mono">${esc(r.symbol)}</div></td>
          <td class="num">${px(r.price)}</td>
          <td class="num b ${cls(r.signal.score)}">${sgn(r.signal.score)}${r.signal.score}</td>
          <td><span class="badge ${r.signal.tone}">${r.signal.label.replace(' — ATTENDRE', '').replace(' / ALLÉGER', '')}</span></td>
          <td class="num">${r.signal.conviction} %</td>
          <td class="num">${r.custom.tqs.value}</td>
          <td class="num ${cls(r.custom.mpi.value)}">${sgn(r.custom.mpi.value)}${r.custom.mpi.value}</td>
          <td class="num ${cls(r.custom.sfi.value)}">${sgn(r.custom.sfi.value)}${r.custom.sfi.value}</td>
          <td class="num ${r.custom.res.value > 65 ? 'down' : r.custom.res.value < 40 ? 'up' : ''}">${r.custom.res.value}</td>
          <td class="num ${cls(r.perf.m3)}">${pct(r.perf.m3, 1)}</td>
          <td class="num ${cls(r.relative?.excess3m)}">${r.relative ? pct(r.relative.excess3m, 1) : '—'}</td>
          <td class="num ${r.plan.actionable ? 'up' : 'faint'}">${n(r.plan.rr, 1)}</td>
          <td class="num faint">${pct(r.plan.stopPct, 1)}</td>
        </tr>`).join('')}
        </tbody>
      </table>
      </div>
    </div>
    ${topIdeas(rows)}
    <div class="xs faint">Scan réalisé le ${dt(S.screen.at, { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
      sur l'univers « ${esc(S.screen.uni)} », avec vos réglages actuels. Cliquez sur une ligne pour l'analyse complète.
      ${S.screen.failed.length ? 'Symboles sans données : ' + esc(S.screen.failed.join(', ')) : ''}</div>`;

  out.querySelectorAll('[data-s]').forEach(t => t.onclick = () => selectSymbol(t.dataset.s));
  // micro-tendance sur 3 mois : la partie « trend » du contrat d'une tuile
  out.querySelectorAll('canvas.spark').forEach(cv => {
    const row = S.screen.rows.find(x => x.symbol === cv.dataset.sym);
    if (row) drawSparkline(cv, row.ind.c.slice(-63), { height: 34 });
  });
}

function topIdeas(rows) {
  const best = rows.filter(r => r.plan.actionable && r.signal.action.startsWith('buy')).slice(0, 3);
  if (!best.length) return `<div class="card"><h3>Idées retenues</h3>
    <p class="sm dim">Aucune configuration ne réunit à la fois un signal d'achat, une conviction suffisante et un rapport
    gain/risque acceptable dans cet univers. C'est une information en soi : forcer une position quand le marché n'offre
    rien est la façon la plus sûre de perdre de l'argent.</p></div>`;
  return `<div class="card">
    <h3>Les 3 meilleures configurations <span class="sub">signal, conviction et rapport gain/risque réunis</span></h3>
    <div class="grid g3">
    ${best.map((r, k) => `<div class="kpi" style="cursor:pointer" data-s="${esc(r.symbol)}">
      <div class="row between"><span class="b">${esc(r.name?.slice(0, 22) || r.symbol)}</span><span class="badge ${r.signal.tone}">${r.signal.score > 0 ? '+' : ''}${r.signal.score}</span></div>
      <div class="xs faint mono">${esc(r.symbol)} · ${px(r.price)} ${curSym(r.currency)}</div>
      <canvas class="spark" data-sym="${esc(r.symbol)}" style="width:100%;margin-top:8px"></canvas>
      <table style="margin-top:8px">
        <tr><td class="dim xs">Entrée</td><td class="num xs">${px(r.plan.entryLow)} – ${px(r.plan.entryHigh)}</td></tr>
        <tr><td class="dim xs">Stop</td><td class="num xs down">${px(r.plan.stop)} (${pct(r.plan.stopPct, 1)})</td></tr>
        <tr><td class="dim xs">Objectif 1</td><td class="num xs up">${px(r.plan.targets[0].price)} (R/R ${n(r.plan.rr, 1)})</td></tr>
        <tr><td class="dim xs">Quantité</td><td class="num xs">${r.plan.sizing.shares} titres</td></tr>
      </table>
      <div class="xs dim" style="margin-top:6px">${esc(r.custom.tqs.label)} · ${esc(r.custom.mpi.label.toLowerCase())}</div>
    </div>`).join('')}
    </div>
  </div>`;
}

/* =========================================================================
   VUE 3 — BACKTEST
   ========================================================================= */
async function viewBacktest(c) {
  c.innerHTML = `
    <div class="card">
      <h3>Backtest du moteur <span class="sub">le moteur rejoué séance par séance sur ${esc(S.symbol)}</span></h3>
      <p class="sm dim" style="margin-top:0">
        La décision est prise à la clôture avec les seules données connues à cet instant, l'exécution a lieu à l'ouverture
        du lendemain, frais et glissement déduits. Si le stop et l'objectif sont touchés le même jour, on retient le stop.
        C'est volontairement pessimiste : un backtest qui flatte ne sert à rien.
      </p>
      <div class="row wrap" style="gap:10px">
        <div><label class="field">Frais (points de base)</label><input type="number" id="bt_fee" value="10" style="width:90px"></div>
        <div><label class="field">Glissement (pdb)</label><input type="number" id="bt_slip" value="5" style="width:90px"></div>
        <div><label class="field">Sortie au 1er objectif</label><select id="bt_part"><option value="0.5">50 % de la position</option><option value="0">Aucune (tout au 2e objectif)</option><option value="1">Totalité</option></select></div>
        <div><label class="field">Vente à découvert</label><select id="bt_short"><option value="0">Non</option><option value="1">Oui</option></select></div>
        <div style="align-self:flex-end"><button class="btn primary" id="btRun">Lancer le backtest</button></div>
        <div style="align-self:flex-end"><button class="btn" id="wfRun">Test par sous-périodes</button></div>
      </div>
      <div id="btProg" style="margin-top:12px;display:none"><div class="progress"><i id="btBar" style="width:0%"></i></div>
        <div class="xs faint" style="margin-top:5px" id="btTxt">Calcul…</div></div>
    </div>
    <div id="btOut">${S.bt ? '' : `<div class="empty"><div class="big">↺</div>
      Lancez le backtest pour savoir si ce moteur aurait créé de la valeur sur ${esc(S.symbol)}<br>
      <span class="sm">période ${esc(periodCfg().label)} · profil ${HORIZONS[S.profile.horizon].label}</span></div>`}</div>`;

  $('#btRun').onclick = () => doBacktest();
  $('#wfRun').onclick = () => doWalkForward();
  if (S.bt) renderBt();
}

async function ensureReport() {
  if (S.report && S.report.ctx.symbol === S.symbol && S.report.periodKey === S.period) return S.report;
  const P = periodCfg();
  const data = await getChart(S.symbol, P.key, P.interval);
  const bench = await getChart(S.profile.benchmark || suggestBenchmark(S.symbol), P.key, P.interval).catch(() => null);
  const fund = await getFund(S.symbol).catch(() => null);
  S.report = analyze({ data, benchmark: bench, fundamentals: fund, profile: S.profile });
  S.report.periodKey = S.period;
  return S.report;
}

async function doBacktest() {
  const r = await ensureReport();
  const prog = $('#btProg'), bar = $('#btBar');
  prog.style.display = 'block'; $('#btRun').disabled = true;
  const opts = {
    feeBps: +$('#bt_fee').value, slippageBps: +$('#bt_slip').value,
    partialAtTarget1: +$('#bt_part').value, allowShort: $('#bt_short').value === '1'
  };
  const res = await runBacktest(r.ind, S.profile, opts, p => { bar.style.width = (p * 100) + '%'; });
  prog.style.display = 'none'; $('#btRun').disabled = false;
  if (res.error) { $('#btOut').innerHTML = `<div class="card"><h3>Backtest impossible</h3><p class="sm">${esc(res.error)}</p></div>`; return; }
  S.bt = { ...res, symbol: S.symbol, name: r.ctx.name };
  renderBt();
}

async function doWalkForward() {
  const r = await ensureReport();
  const prog = $('#btProg'), bar = $('#btBar'), txt = $('#btTxt');
  prog.style.display = 'block'; txt.textContent = 'Test sur sous-périodes successives…';
  $('#wfRun').disabled = true;
  const res = await walkForward(r.ind, S.profile, {}, 3, p => { bar.style.width = (p * 100) + '%'; });
  prog.style.display = 'none'; $('#wfRun').disabled = false;
  const out = $('#btOut');
  const html = res.error ? `<div class="card"><h3>Test par sous-périodes</h3><p class="sm">${esc(res.error)}</p></div>` : `
    <div class="card">
      <h3>Test par sous-périodes <span class="sub">le moteur tient-il sur des régimes de marché différents ?</span></h3>
      <table><thead><tr><th>Période</th><th class="right">Moteur</th><th class="right">Détention simple</th>
        <th class="right">Écart</th><th class="right">Trades</th><th class="right">Réussite</th><th class="right">Repli max.</th></tr></thead>
      <tbody>${res.folds.map(f => `<tr>
        <td class="sm">${dt(f.from, { month: 'short', year: '2-digit' })} → ${dt(f.to, { month: 'short', year: '2-digit' })}</td>
        <td class="num ${cls(f.totalReturn)}">${pct(f.totalReturn, 1)}</td>
        <td class="num ${cls(f.buyHold)}">${pct(f.buyHold, 1)}</td>
        <td class="num b ${cls(f.totalReturn - f.buyHold)}">${pct(f.totalReturn - f.buyHold, 1)}</td>
        <td class="num">${f.trades}</td><td class="num">${f.winRate === null ? '—' : n(f.winRate, 0) + ' %'}</td>
        <td class="num down">${pct(f.maxDrawdown, 1)}</td></tr>`).join('')}</tbody></table>
      <div class="sm dim" style="margin-top:10px">${esc(res.verdict)}</div>
    </div>`;
  out.insertAdjacentHTML('afterbegin', html);
}

function renderBt() {
  const b = S.bt, out = $('#btOut'); if (!b) return;
  const p = b.perf, bh = b.buyHold, t = b.trades;
  const diff = p.totalReturn - bh.totalReturn;

  out.innerHTML = `
    <div class="card">
      <div class="row between wrap">
        <h3 style="margin:0">Résultat sur ${esc(b.name || b.symbol)}
          <span class="sub">${dt(b.params.startDate)} → ${dt(b.params.endDate)} · ${b.params.bars} séances</span></h3>
        <span class="badge ${diff > 0 ? 'pos2' : 'neg2'}">${diff > 0 ? 'le moteur bat la détention simple' : 'la détention simple fait mieux'} de ${pct(Math.abs(diff), 1).replace('+', '')}</span>
      </div>
      <div class="grid g4" style="margin-top:14px">
        <div class="kpi"><div class="lbl">Performance du moteur</div><div class="val ${cls(p.totalReturn)}">${pct(p.totalReturn, 1)}</div>
          <div class="note">${p.cagr !== null ? n(p.cagr, 1) + ' % par an' : ''}</div></div>
        <div class="kpi"><div class="lbl">Détention simple</div><div class="val ${cls(bh.totalReturn)}">${pct(bh.totalReturn, 1)}</div>
          <div class="note">${bh.cagr !== null ? n(bh.cagr, 1) + ' % par an' : ''}</div></div>
        <div class="kpi"><div class="lbl">Repli maximal</div><div class="val down">${pct(p.maxDrawdown, 1)}</div>
          <div class="note">contre ${pct(bh.maxDrawdown, 1)} en détention</div></div>
        <div class="kpi"><div class="lbl">Temps exposé au marché</div><div class="val">${n(p.exposurePct, 0)} %</div>
          <div class="note">le reste en liquidités</div></div>
      </div>
      <div class="chart-host" style="margin-top:16px"><canvas id="eqChart"></canvas></div>
    </div>

    <div class="grid g2">
      <div class="card">
        <h3>Qualité des opérations</h3>
        <table>
          <tr><td class="dim">Nombre d'opérations</td><td class="num b">${t.count}</td></tr>
          <tr><td class="dim">Taux de réussite</td><td class="num ${t.winRate > 50 ? 'up' : ''}">${t.winRate === null ? '—' : n(t.winRate, 1) + ' %'}</td></tr>
          <tr><td class="dim">Facteur de profit</td><td class="num ${t.profitFactor > 1.3 ? 'up' : t.profitFactor < 1 ? 'down' : ''}">${t.profitFactor === Infinity ? '∞' : n(t.profitFactor, 2)}</td></tr>
          <tr><td class="dim">Gain moyen / perte moyenne</td><td class="num">${n(t.payoff, 2)}</td></tr>
          <tr><td class="dim">Espérance par opération</td><td class="num ${cls(t.expectancy)}">${money(t.expectancy, '')}</td></tr>
          <tr><td class="dim">Durée moyenne</td><td class="num">${n(t.avgBars, 0)} séances</td></tr>
          <tr><td class="dim">Pire série de pertes</td><td class="num down">${t.maxLossStreak} d'affilée</td></tr>
          <tr><td class="dim">Meilleure série</td><td class="num up">${t.maxWinStreak} d'affilée</td></tr>
          <tr><td class="dim">Sharpe du moteur</td><td class="num">${n(p.sharpe, 2)} <span class="xs faint">(détention ${n(bh.sharpe, 2)})</span></td></tr>
          <tr><td class="dim">Ratio de Calmar</td><td class="num">${n(p.calmar, 2)}</td></tr>
        </table>
        <div class="sm dim" style="margin-top:10px">${btVerdict(b)}</div>
      </div>

      <div class="card">
        <h3>Pouvoir prédictif du score <span class="sub">rendement moyen à 21 séances après chaque signal</span></h3>
        <table>
          <thead><tr><th>Score au signal</th><th class="right">Cas</th><th class="right">Rendement moyen</th>
            <th class="right">% gagnants</th><th class="right">vs moyenne</th></tr></thead>
          <tbody>${b.edge.bands.map(band => {
            const h = band.byHorizon[21];
            return `<tr><td>${band.label}</td><td class="num">${h.n}</td>
              <td class="num b ${cls(h.mean)}">${h.n ? pct(h.mean, 2) : '—'}</td>
              <td class="num">${h.winRate === null ? '—' : n(h.winRate, 0) + ' %'}</td>
              <td class="num ${cls(h.excess)}">${h.excess === null ? '—' : pct(h.excess, 2)}</td></tr>`;
          }).join('')}</tbody>
        </table>
        <div class="sm ${b.edge.verdict.reliable ? 'up' : 'warn'}" style="margin-top:10px">${esc(b.edge.verdict.text)}</div>
        <div class="xs faint" style="margin-top:6px">Référence : sur cette période, une séance prise au hasard rapportait
          ${pct(b.edge.baseline[21].mean, 2)} sur les 21 séances suivantes, avec ${n(b.edge.baseline[21].winRate, 0)} % de cas positifs.</div>
      </div>
    </div>

    <div class="card pad0">
      <h3 style="padding:16px 18px 10px;margin:0">Détail des opérations</h3>
      <div style="overflow-x:auto;max-height:460px">
      <table>
        <thead><tr><th>Entrée</th><th class="right">Prix</th><th>Sortie</th><th class="right">Prix</th>
          <th class="right">Durée</th><th class="right">Résultat</th><th class="right">%</th>
          <th class="right">Score</th><th>Motif de sortie</th></tr></thead>
        <tbody>${t.list.slice().reverse().map(x => `<tr>
          <td class="sm">${dt(x.entryDate, { day: '2-digit', month: 'short', year: '2-digit' })}</td>
          <td class="num">${px(x.entryPrice)}</td>
          <td class="sm">${dt(x.exitDate, { day: '2-digit', month: 'short', year: '2-digit' })}</td>
          <td class="num">${px(x.exitPrice)}</td>
          <td class="num faint">${x.bars} j</td>
          <td class="num b ${cls(x.pnl)}">${money(x.pnl, '')}</td>
          <td class="num ${cls(x.pnlPct)}">${pct(x.pnlPct, 1)}</td>
          <td class="num faint">${x.entryScore}</td>
          <td class="sm dim">${esc(x.reasonOut)}</td></tr>`).join('') || '<tr><td colspan="9" class="center dim" style="padding:26px">Aucune opération déclenchée sur la période — le moteur n\'a jamais trouvé de configuration réunissant signal, conviction et rapport gain/risque suffisants.</td></tr>'}</tbody>
      </table>
      </div>
    </div>

    <div class="card">
      <h3>Comment lire ce backtest</h3>
      <div class="sm dim" style="line-height:1.7">
        <p><b class="acc">Le piège principal</b> — un backtest teste une stratégie sur le passé d'un seul titre. Un bon
        résultat peut venir du hasard ou d'un régime de marché qui ne reviendra pas. Le test par sous-périodes
        (bouton en haut) est bien plus informatif qu'une performance globale flatteuse.</p>
        <p><b class="acc">Le facteur de profit</b> — total des gains divisé par total des pertes. En dessous de 1, la
        stratégie perd de l'argent. Entre 1 et 1,3 l'avantage est trop faible pour survivre aux frais réels. Au-dessus
        de 1,5 c'est intéressant, au-dessus de 2 c'est rare et mérite d'être vérifié deux fois.</p>
        <p><b class="acc">Le repli maximal</b> compte plus que la performance — c'est la perte que vous auriez dû
        encaisser sans abandonner. Une stratégie à +80 % avec −45 % de repli est en pratique intenable pour la plupart
        des gens : on abandonne au pire moment.</p>
        <p><b class="acc">Battre la détention simple</b> n'est pas une évidence. Sur une valeur en tendance haussière
        continue, ne rien faire bat presque toujours toute stratégie de timing. L'intérêt du moteur apparaît surtout
        sur les marchés heurtés et dans la réduction du repli maximal.</p>
      </div>
    </div>`;

  const cv = $('#eqChart');
  if (cv) {
    const lc = new LineChart(cv);
    S.charts.eq = lc;
    lc.setData({
      height: 260, dates: b.equity.dates,
      series: [
        { data: b.equity.values, color: cssVar('--accent'), width: 2, label: 'Capital avec le moteur', fill: tint('--accent', .12) },
        { data: b.equity.buyHold, color: cssVar('--text-3'), width: 1.6, label: 'Détention simple' }
      ]
    });
  }
}

function btVerdict(b) {
  const t = b.trades, p = b.perf, bh = b.buyHold;
  if (!t.count) return 'Aucune opération : sur cette valeur et cette période, le moteur n\'a jamais réuni ses trois conditions (signal, conviction, rapport gain/risque). C\'est un comportement voulu — un filtre qui ne filtre jamais ne sert à rien.';
  if (t.count < 8) return `Seulement ${t.count} opérations : l'échantillon est trop petit pour en tirer une conclusion statistique. Testez sur une période plus longue ou sur plusieurs valeurs avant de conclure quoi que ce soit.`;
  const pf = t.profitFactor;
  let v = pf > 1.5 ? 'Le moteur dégage un avantage net sur cette valeur. '
    : pf > 1.15 ? 'Le moteur dégage un avantage modeste, qui reste fragile face aux frais réels. '
      : pf > 0.95 ? 'Le moteur est proche de l\'équilibre : pas d\'avantage exploitable ici. '
        : 'Le moteur détruit de la valeur sur cette valeur. ';
  // on compare des amplitudes de perte : c'est la valeur absolue qui compte
  const ddMoteur = Math.abs(p.maxDrawdown), ddDetention = Math.abs(bh.maxDrawdown);
  v += ddMoteur > ddDetention
    ? `Attention : son repli maximal (${n(p.maxDrawdown, 1)} %) est plus profond que celui de la simple détention (${n(bh.maxDrawdown, 1)} %).`
    : `Point positif : il réduit le repli maximal de ${n(ddDetention - ddMoteur, 1)} points par rapport à la détention — c'est souvent ce qui permet de tenir une stratégie dans la durée.`;
  return v;
}

/* =========================================================================
   VUE 4 — PORTEFEUILLE
   ========================================================================= */
async function viewPortefeuille(c) {
  const positions = PF.loadPositions();
  const open = positions.filter(p => p.status === 'ouverte');

  c.innerHTML = `<div class="card"><div class="row"><span class="loader"></span><span class="dim">Valorisation des positions…</span></div></div>`;

  const quotes = {};
  await Promise.all([...new Set(open.map(p => p.symbol))].map(async sym => {
    try {
      const d = await getChart(sym, '1y', '1d');
      const q = quickScore(d, S.profile, null);
      quotes[sym] = { price: d.price ?? d.series.c[d.series.c.length - 1], score: q?.signal.score ?? null, signalLabel: q?.signal.label ?? null, atr: q?.plan.atr ?? null };
    } catch { }
  }));

  const val = PF.valuate(positions, quotes, S.profile.capital);
  const diag = PF.diagnose(val, S.profile.capital);
  const t = val.totals;

  c.innerHTML = `
    <div class="grid g4">
      <div class="kpi"><div class="lbl">Valeur des positions</div><div class="val">${money(t.marketValue, 'EUR')}</div>
        <div class="note">${t.positions} ligne${t.positions > 1 ? 's' : ''} ouverte${t.positions > 1 ? 's' : ''}</div></div>
      <div class="kpi"><div class="lbl">Plus-value latente</div><div class="val ${cls(t.unrealized)}">${money(t.unrealized, 'EUR')}</div>
        <div class="note ${cls(t.unrealizedPct)}">${pct(t.unrealizedPct, 2)}</div></div>
      <div class="kpi"><div class="lbl">Résultat réalisé</div><div class="val ${cls(t.realized)}">${money(t.realized, 'EUR')}</div>
        <div class="note">${t.closedCount} position${t.closedCount > 1 ? 's' : ''} clôturée${t.closedCount > 1 ? 's' : ''}${t.winRate !== null ? ' · ' + n(t.winRate, 0) + ' % de réussite' : ''}</div></div>
      <div class="kpi"><div class="lbl">Risque si tous les stops sautent</div>
        <div class="val ${t.riskOpenPct > 6 ? 'down' : t.riskOpenPct > 3 ? 'warn' : 'up'}">${t.riskOpenPct === null ? '—' : n(t.riskOpenPct, 1) + ' %'}</div>
        <div class="note">${money(t.riskOpen, 'EUR')} du capital</div></div>
    </div>

    <div class="card">
      <h3>Diagnostic du portefeuille</h3>
      ${diag.map(d => `<div class="note-line">
        <span class="pin">${d.level === 'danger' ? '⛔' : d.level === 'warn' ? '⚠' : d.level === 'good' ? '✓' : 'ℹ'}</span>
        <span class="${d.level === 'danger' ? 'down' : d.level === 'warn' ? 'warn' : d.level === 'good' ? 'up' : ''}">${esc(d.text)}</span></div>`).join('')}
    </div>

    ${val.rows.length ? `<div class="card pad0">
      <h3 style="padding:16px 18px 10px;margin:0">Positions ouvertes</h3>
      <div style="overflow-x:auto"><table>
        <thead><tr><th>Valeur</th><th class="right">Qté</th><th class="right">PRU</th><th class="right">Cours</th>
          <th class="right">Valeur</th><th class="right">+/- latent</th><th class="right">%</th>
          <th class="right">Stop</th><th class="right">Obj. 1</th><th class="right">Signal</th><th>Alertes</th><th></th></tr></thead>
        <tbody>${val.rows.map(r => `<tr>
          <td><div class="b clickable" data-go="${esc(r.symbol)}" style="cursor:pointer">${esc(r.name?.slice(0, 22) || r.symbol)}</div>
              <div class="xs faint mono">${esc(r.symbol)}${r.side === 'short' ? ' · vente à découvert' : ''}</div></td>
          <td class="num">${n(r.qty, 0)}</td>
          <td class="num">${px(r.entry)}</td>
          <td class="num b">${px(r.price)}</td>
          <td class="num">${money(r.marketValue, '')}</td>
          <td class="num b ${cls(r.pnl)}">${money(r.pnl, '')}</td>
          <td class="num ${cls(r.pnlPct)}">${pct(r.pnlPct, 1)}</td>
          <td class="num down">${r.stop ? px(r.stop) + ` <span class="xs faint">${pct(r.distStop, 1)}</span>` : '<span class="warn">absent</span>'}</td>
          <td class="num up">${r.target1 ? px(r.target1) + ` <span class="xs faint">${pct(r.distT1, 1)}</span>` : '—'}</td>
          <td class="num ${cls(r.score)}">${r.score === null ? '—' : sgn(r.score) + r.score}</td>
          <td class="xs">${r.alerts.map(a => `<div class="${a.level === 'danger' ? 'down' : a.level === 'warn' ? 'warn' : 'up'}">${esc(a.text)}</div>`).join('') || '<span class="faint">—</span>'}</td>
          <td class="right"><button class="btn sm" data-close="${r.id}">Clôturer</button>
            <button class="btn sm danger" data-del="${r.id}">×</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>` : `<div class="empty"><div class="big">▤</div>Aucune position ouverte.<br>
      <span class="sm">Depuis l'analyse d'un titre, le bouton « Suivre cette position » enregistre le plan ici.</span></div>`}

    ${val.closed.length ? `<div class="card pad0">
      <h3 style="padding:16px 18px 10px;margin:0">Historique</h3>
      <div style="overflow-x:auto;max-height:320px"><table>
        <thead><tr><th>Valeur</th><th class="right">Entrée</th><th class="right">Sortie</th>
          <th class="right">Résultat</th><th>Motif</th><th>Thèse d'entrée</th><th></th></tr></thead>
        <tbody>${val.closed.slice().reverse().map(p => `<tr>
          <td class="b">${esc(p.name?.slice(0, 20) || p.symbol)}</td>
          <td class="num">${px(p.entry)}</td><td class="num">${px(p.exit)}</td>
          <td class="num b ${cls(p.realizedPnl)}">${money(p.realizedPnl, '')}</td>
          <td class="sm dim">${esc(p.exitReason || '—')}</td>
          <td class="xs faint">${esc((p.thesis || '').slice(0, 90))}</td>
          <td class="right"><button class="btn sm danger" data-del="${p.id}">×</button></td>
        </tr>`).join('')}</tbody>
      </table></div>
    </div>` : ''}

    <div class="card">
      <h3>Sauvegarde</h3>
      <div class="row" style="gap:8px">
        <button class="btn" id="expBtn">Exporter le dossier (JSON)</button>
        <button class="btn" id="impBtn">Importer</button>
        <input type="file" id="impFile" accept="application/json" style="display:none">
      </div>
      <div class="xs faint" style="margin-top:8px">Positions et journal sont stockés uniquement dans ce navigateur.
        Vider les données du site les effacerait — exportez régulièrement.</div>
    </div>`;

  c.querySelectorAll('[data-go]').forEach(b => b.onclick = () => selectSymbol(b.dataset.go));
  c.querySelectorAll('[data-close]').forEach(b => b.onclick = () => {
    const row = val.rows.find(r => r.id === b.dataset.close);
    const price = prompt(`Prix de sortie pour ${row.symbol} ?`, px(row.price).replace(/\s/g, '').replace(',', '.'));
    if (price === null) return;
    const reason = prompt('Motif de la sortie (objectif atteint, stop, changement de thèse…) ?', '') || '';
    PF.closePosition(b.dataset.close, parseFloat(String(price).replace(',', '.')), reason);
    render();
  });
  c.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    if (confirm('Supprimer définitivement cette ligne ?')) { PF.removePosition(b.dataset.del); render(); }
  });
  $('#expBtn').onclick = () => {
    const blob = new Blob([PF.exportAll()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `alphadesk-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };
  $('#impBtn').onclick = () => $('#impFile').click();
  $('#impFile').onchange = e => {
    const f = e.target.files[0]; if (!f) return;
    const rd = new FileReader();
    rd.onload = () => { try { PF.importAll(rd.result); toast('Dossier importé', 'ok'); render(); } catch (x) { toast('Fichier invalide', 'err'); } };
    rd.readAsText(f);
  };
}

/* =========================================================================
   VUE 5 — JOURNAL
   ========================================================================= */
async function viewJournal(c) {
  const list = PF.loadJournal();
  c.innerHTML = `
    <div class="card">
      <h3>Journal de bord <span class="sub">la seule façon de distinguer une bonne décision d'un bon résultat</span></h3>
      <p class="sm dim" style="margin-top:0">
        Un gain peut venir d'une mauvaise décision et une perte d'une bonne. Sans trace écrite de ce que vous pensiez
        au moment d'entrer, il est impossible de progresser : la mémoire réécrit systématiquement l'histoire en votre faveur.
      </p>
      <textarea id="jText" rows="3" style="width:100%" placeholder="Ce que j'observe aujourd'hui, ce que je décide, et pourquoi…"></textarea>
      <div class="row" style="margin-top:8px;gap:8px">
        <select id="jType">
          <option value="note">Note</option><option value="observation">Observation de marché</option>
          <option value="erreur">Erreur à ne pas refaire</option><option value="règle">Règle que je me fixe</option>
        </select>
        <input type="text" id="jSym" placeholder="Symbole (facultatif)" style="width:170px">
        <button class="btn primary" id="jAdd">Ajouter</button>
      </div>
    </div>
    ${list.length ? list.map(e => `<div class="card" style="padding:12px 16px">
      <div class="row between">
        <div class="row" style="gap:8px">
          <span class="badge ${e.type === 'ouverture' ? 'pos1' : e.type === 'clôture' ? 'info' : e.type === 'erreur' ? 'neg1' : 'plain'}">${esc(e.type)}</span>
          ${e.symbol ? `<span class="mono xs faint">${esc(e.symbol)}</span>` : ''}
        </div>
        <div class="row" style="gap:8px">
          <span class="xs faint">${dt(e.at, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          <button class="btn sm danger" data-jdel="${e.id}">×</button>
        </div>
      </div>
      <div class="sm" style="margin-top:6px;white-space:pre-wrap">${esc(e.text)}</div>
    </div>`).join('') : '<div class="empty"><div class="big">✎</div>Journal vide.</div>'}`;

  $('#jAdd').onclick = () => {
    const t = $('#jText').value.trim(); if (!t) return;
    PF.addJournal({ type: $('#jType').value, symbol: $('#jSym').value.trim(), text: t });
    render();
  };
  c.querySelectorAll('[data-jdel]').forEach(b => b.onclick = () => { PF.removeJournal(b.dataset.jdel); render(); });
}

/* =========================================================================
   VUE 6 — ACADÉMIE
   ========================================================================= */
async function viewAcademie(c) {
  const r = S.report;
  const sections = [
    ['methodes', 'Méthodes qui marchent'],
    ['parcours', 'Parcours guidés'],
    ['indicateurs', 'Fiches indicateurs']
  ];
  c.innerHTML = `
    <div class="card">
      <div class="row between wrap" style="gap:14px">
        <div style="flex:1;min-width:260px">
          <h3 style="margin-bottom:8px">Académie <span class="sub">comprendre pour décider soi-même</span></h3>
          <p class="sm dim" style="margin:0;max-width:78ch">
            Trois niveaux de lecture. Les <b>méthodes</b> exposent ce qui a réellement été testé sur des décennies,
            avec ce que ça coûte. Les <b>parcours</b> donnent un ordre de lecture. Les <b>fiches</b> détaillent chaque outil.
            ${r ? `Les encadrés bleus donnent la valeur réelle sur <b>${esc(r.ctx.name)}</b> en ce moment.`
                : 'Analysez un titre pour voir en plus les valeurs réelles dans chaque fiche.'}
          </p>
        </div>
        <div class="seg" id="acadSeg">
          ${sections.map(([k, l]) => `<button data-k="${k}" class="${S.acadSection === k ? 'on' : ''}">${l}</button>`).join('')}
        </div>
      </div>
    </div>
    <div id="acadBody"></div>`;

  $('#acadSeg').querySelectorAll('button').forEach(b => {
    b.onclick = () => { S.acadSection = b.dataset.k; render(); };
  });

  const body = $('#acadBody');
  if (S.acadSection === 'methodes') body.innerHTML = acadMethodes(r);
  else if (S.acadSection === 'parcours') body.innerHTML = acadParcours();
  else body.innerHTML = acadFiches(r);

  if (S.acadSection === 'methodes') {
    body.querySelectorAll('[data-run]').forEach(btn => {
      btn.onclick = e => {
        e.preventDefault(); e.stopPropagation();
        S.comparFocus = btn.dataset.run;
        S.view = 'comparateur';
        document.querySelectorAll('#nav button').forEach(x => x.classList.toggle('active', x.dataset.view === 'comparateur'));
        render();
      };
    });
  }
  body.querySelectorAll('[data-goto]').forEach(el2 => {
    el2.onclick = e => {
      e.preventDefault();
      S.acadSection = 'indicateurs'; S.focusFiche = el2.dataset.goto; render();
    };
  });

  if (S.focusFiche) {
    const f = S.focusFiche;
    S.focusFiche = null;               // consomme dans tous les cas, jamais laisse en attente
    if (S.acadSection === 'indicateurs') {
      const d = document.getElementById('f-' + f);
      if (d) { d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    }
  }
}

/* ------------------------- section « méthodes » ------------------------- */
function acadMethodes(r) {
  const familles = [...new Set(LECONS.map(l => l.famille))];
  const badge = { 'Méthode': 'info', 'Ce qui marche': 'pos1', 'Ce qui compte': 'neutral', 'Ce qui ne marche pas': 'neg1' };
  return `
    <div class="card">
      <h3>Avant tout</h3>
      <p class="sm dim" style="margin:0;max-width:80ch">
        Presque tout ce qui circule sur les marchés n'a jamais été testé sérieusement. Ce qui suit se limite à ce qui a
        survécu à quatre questions : testé sur combien d'années, publié et toujours valable, reproductible sur d'autres
        marchés, et obtenu sans optimiser deux cents variantes. Chaque méthode est présentée avec
        <b>son mode d'échec</b> — une méthode dont on ne vous dit pas quand elle perd est une méthode qu'on vous vend.
      </p>
      <div class="row wrap" style="margin-top:12px;gap:8px">
        <span class="badge info">${LECONS.length} leçons</span>
        <span class="badge pos1">${METHODES.length} méthodes exécutables</span>
        <span class="badge plain">toutes testables sur vos propres titres</span>
      </div>
    </div>
    ${familles.map(fam => `
      <div class="card">
        <h3>${esc(fam)}</h3>
        ${LECONS.filter(l => l.famille === fam).map(l => leconHtml(l, badge[fam] || 'plain')).join('')}
      </div>`).join('')}`;
}

function leconHtml(l, badgeClass) {
  const m = l.methodeId ? METHODES.find(x => x.id === l.methodeId) : null;
  return `<details class="fiche" id="l-${l.id}">
    <summary>
      <span class="badge ${badgeClass}">${esc(l.famille)}</span>
      <span class="b">${esc(l.titre)}</span>
      <span class="grow"></span>
      <span class="xs faint">${esc(l.resume)}</span>
    </summary>
    <div class="body">
      <p style="font-size:14px;color:#dbe2ee">${esc(l.accroche)}</p>
      ${l.sections.map(sec => `
        <h5>${esc(sec.t)}</h5>
        ${sec.p.map(x => `<p>${boldize(x)}</p>`).join('')}
      `).join('')}
      ${m ? `
        <h5>La règle, telle qu'elle est définie</h5>
        <div class="formula">${m.regles.map(x => '· ' + x).join('\n')}</div>
        <p class="xs faint" style="margin-top:6px">Source : ${esc(m.reference)}</p>
        <button class="btn primary sm" data-run="${m.id}" style="margin-top:10px">Tester cette méthode sur un titre</button>
      ` : ''}
      <div class="live" style="border-left-color:var(--up);background:var(--up-wash)">
        <div class="tt" style="color:var(--up)">À retenir</div>${esc(l.aRetenir)}
      </div>
    </div>
  </details>`;
}

/* ------------------------- section « parcours » ------------------------- */
function acadParcours() {
  const nom = e => {
    if (e.type === 'fiche') { const f = FICHES.find(x => x.id === e.id); return f ? f.titre : e.id; }
    const l = LECONS.find(x => x.id === e.id); return l ? l.titre : e.id;
  };
  return `
    <div class="card">
      <h3>Plan de travail en quatre semaines <span class="sub">l'ordre compte : le risque d'abord, le rendement ensuite</span></h3>
      <p class="sm dim" style="margin-top:0;max-width:80ch">
        Ce plan est conçu pour être suivi dans l'ordre. La plupart des débutants commencent par les signaux d'achat
        et finissent par la gestion du risque — c'est exactement l'inverse de ce qui permet de durer.
      </p>
    </div>
    ${PROGRESSION.map((sem, k) => `
      <div class="card">
        <div class="row between wrap" style="gap:10px">
          <h3 style="margin:0">${esc(sem.titre)}</h3>
          <span class="badge plain">${sem.etapes.length} lectures</span>
        </div>
        <p class="sm dim" style="margin:8px 0 12px">${esc(sem.but)}</p>
        <div class="grid g2" style="gap:8px">
          ${sem.etapes.map((e, i) => `
            <div class="stat" style="cursor:${e.type === 'fiche' ? 'pointer' : 'default'};padding:10px 13px"
                 ${e.type === 'fiche' ? `data-goto="${e.id}"` : ''}>
              <div class="row" style="gap:9px;align-items:baseline">
                <span class="mono faint xs">${i + 1}</span>
                <span class="sm b">${esc(nom(e))}</span>
              </div>
              <div class="xs faint" style="margin-top:2px">${e.type === 'fiche' ? 'fiche indicateur' : 'leçon de méthode'}</div>
            </div>`).join('')}
        </div>
        <div class="live" style="margin-top:12px">
          <div class="tt">Exercice</div>${esc(sem.exercice)}
        </div>
      </div>`).join('')}
    <div class="card">
      <h3>Parcours thématiques</h3>
      <div class="grid g2">
      ${PARCOURS.map(p => `<details class="acc-block"><summary>${esc(p.titre)} <span class="xs faint">· ${p.duree}</span></summary>
        <div class="inner">
          <p class="sm dim">${esc(p.intro)}</p>
          ${p.etapes ? `<ol style="padding-left:18px;margin:8px 0">${p.etapes.map(e => {
            const f = FICHES.find(x => x.id === e.fiche);
            return `<li style="margin-bottom:7px"><span class="acc b" style="cursor:pointer" data-goto="${e.fiche}">${esc(f?.titre || e.fiche)}</span>
              <div class="xs dim">${esc(e.pourquoi)}</div></li>`;
          }).join('')}</ol>` : ''}
          ${p.regles ? `<div>${p.regles.map(x => `<div class="note-line"><span class="pin">▸</span>
            <span><b>${esc(x.r)}</b><div class="xs dim">${esc(x.d)}</div></span></div>`).join('')}</div>` : ''}
        </div></details>`).join('')}
      </div>
    </div>`;
}

/* ------------------------ section « indicateurs » ----------------------- */
function acadFiches(r) {
  const familles = [...new Set(FICHES.map(f => f.famille))];
  return familles.map(fam => `<div class="card">
    <h3>${esc(fam)}</h3>
    ${FICHES.filter(f => f.famille === fam).map(f => ficheHtml(f, r, false)).join('')}
  </div>`).join('');
}

function ficheHtml(f, r, open) {
  const lv = NIVEAUX[f.niveau];
  let live = '';
  if (r) { try { live = f.live(r); } catch { live = ''; } }
  return `<details class="fiche" id="f-${f.id}" ${open ? 'open' : ''}>
    <summary>
      <span class="badge plain" style="color:${lv.color};border:1px solid ${lv.color}44">${lv.label}</span>
      ${f.maison ? '<span class="badge info">AlphaDesk</span>' : ''}
      <span class="b">${esc(f.titre)}</span>
      <span class="grow"></span>
      <span class="xs faint">${esc(f.resume)}</span>
    </summary>
    <div class="body">
      <h5>À quoi ça sert</h5><p>${esc(f.aQuoiCaSert)}</p>
      <h5>Comment ça se calcule</h5><div class="formula">${esc(f.calcul)}</div>
      <h5>Comment le lire</h5><ul>${f.commentLire.map(x => `<li>${boldize(x)}</li>`).join('')}</ul>
      <h5>Les pièges</h5><ul>${f.pieges.map(x => `<li>${boldize(x)}</li>`).join('')}</ul>
      <h5>Avec quoi le combiner</h5><p>${esc(f.combiner)}</p>
      ${live ? `<div class="live"><div class="tt">Sur ${esc(r.ctx.name)} en ce moment</div>${esc(live)}</div>` : ''}
    </div>
  </details>`;
}
function boldize(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<b class="acc">$1</b>'); }

/* =========================================================================
   VUE 7 — QUIZ
   ========================================================================= */
async function viewQuiz(c) {
  c.innerHTML = `
    <div class="card">
      <h3>Quiz <span class="sub">8 situations réelles — les erreurs coûtent cher, autant les faire ici</span></h3>
      <p class="sm dim" style="margin-top:0">Chaque question porte sur un piège classique. L'explication compte plus que la bonne réponse.</p>
      <div id="score" class="b" style="margin-top:6px"></div>
    </div>
    ${QUIZ.map((q, i) => `<div class="quiz-q" data-q="${i}">
      <div class="b">${i + 1}. ${esc(q.q)}</div>
      ${q.options.map((o, k) => `<button class="quiz-opt" data-k="${k}">${esc(o)}</button>`).join('')}
      <div class="quiz-exp" style="display:none"></div>
    </div>`).join('')}`;

  let answered = 0, good = 0;
  c.querySelectorAll('.quiz-q').forEach(box => {
    const qi = +box.dataset.q, q = QUIZ[qi];
    box.querySelectorAll('.quiz-opt').forEach(btn => {
      btn.onclick = () => {
        if (box.dataset.done) return;
        box.dataset.done = '1'; answered++;
        const k = +btn.dataset.k;
        if (k === q.bonne) { btn.classList.add('good'); good++; }
        else { btn.classList.add('bad'); box.querySelectorAll('.quiz-opt')[q.bonne].classList.add('good'); }
        const exp = box.querySelector('.quiz-exp');
        exp.style.display = 'block';
        exp.innerHTML = `<b class="${k === q.bonne ? 'up' : 'down'}">${k === q.bonne ? '✓ Exact.' : '✗ Pas tout à fait.'}</b> ${esc(q.explication)}`;
        $('#score').innerHTML = `Score : <span class="${good / answered >= .7 ? 'up' : good / answered >= .5 ? 'warn' : 'down'}">${good} / ${answered}</span>` +
          (answered === QUIZ.length ? (good >= 7 ? ' — excellent, vous avez les réflexes qui protègent le capital.' : good >= 5 ? ' — bonne base, relisez les fiches sur la gestion du risque.' : ' — reprenez le parcours « Démarrer » dans l\'Académie avant d\'investir.') : '');
      };
    });
  });
}


/* =========================================================================
   VUE 8 — RÉGLAGES
   ========================================================================= */
async function viewReglages(c) {
  const st = await api('/api/settings').catch(() => ({ hasKey: false }));
  c.innerHTML = `
    <div class="grid g2">
      <div class="card">
        <h3>Stratégie <span class="sub">ces réglages changent le score, le plan et le screener</span></h3>
        <label class="field">Horizon d'investissement</label>
        <select id="p_h" style="width:100%">${Object.entries(HORIZONS).map(([k, v]) => `<option value="${k}" ${k === S.profile.horizon ? 'selected' : ''}>${v.label} — ${v.detail}</option>`).join('')}</select>
        <div class="xs faint" style="margin:6px 0 14px">L'horizon modifie le poids des familles d'indicateurs : le court terme
          privilégie le momentum, le long terme la tendance de fond et les fondamentaux.</div>

        <label class="field">Profil de risque</label>
        <select id="p_r" style="width:100%">${Object.entries(RISKS).map(([k, v]) => `<option value="${k}" ${k === S.profile.risk ? 'selected' : ''}>${v.label} — ${v.riskPerTrade} % du capital risqué par ligne, ${v.maxPosition} % maximum par position</option>`).join('')}</select>
        <div class="xs faint" style="margin:6px 0 14px">Détermine la taille des positions et le seuil de conviction requis
          pour qu'un signal soit qualifié de « fort ».</div>

        <label class="field">Capital de référence (€)</label>
        <input type="number" id="p_c" value="${S.profile.capital}" style="width:100%" step="100">
        <div class="xs faint" style="margin:6px 0 14px">Sert uniquement au calcul des quantités. Aucune donnée bancaire n'est demandée ni stockée.</div>

        <label class="field">Indice de référence</label>
        <select id="p_b" style="width:100%">
          <option value="">Automatique selon la place de cotation</option>
          ${BENCHMARKS.map(b => `<option value="${b.symbol}" ${b.symbol === S.profile.benchmark ? 'selected' : ''}>${b.label}</option>`).join('')}
        </select>
        <div class="xs faint" style="margin-top:6px">Utilisé pour la force relative et le bêta.</div>

        <button class="btn primary" id="p_save" style="margin-top:16px">Enregistrer</button>
      </div>

      <div>
        <div class="card">
          <h3>Analyste IA <span class="sub">facultatif</span></h3>
          <p class="sm dim" style="margin-top:0">
            Tout AlphaDesk fonctionne sans IA : les indicateurs, le score, le plan et le narratif sont calculés localement.
            L'IA ajoute seulement un second regard rédigé sur le rapport chiffré — elle ne recalcule rien et ne peut pas
            inventer de chiffre, puisqu'elle ne reçoit que les valeurs déjà calculées.
          </p>
          <label class="field">Clé API Anthropic ${st.hasKey ? '<span class="up">— une clé est déjà enregistrée</span>' : ''}</label>
          <input type="text" id="k_key" placeholder="sk-ant-…" style="width:100%">
          <label class="field" style="margin-top:10px">Modèle</label>
          <select id="k_model" style="width:100%">
            <option value="claude-sonnet-5" ${st.aiModel === 'claude-sonnet-5' ? 'selected' : ''}>Claude Sonnet 5 — rapide, suffisant ici</option>
            <option value="claude-opus-5" ${st.aiModel === 'claude-opus-5' ? 'selected' : ''}>Claude Opus 5 — analyse plus poussée</option>
          </select>
          <div class="row" style="margin-top:12px;gap:8px">
            <button class="btn primary" id="k_save">Enregistrer la clé</button>
            ${st.hasKey ? '<button class="btn danger" id="k_del">Supprimer</button>' : ''}
          </div>
          <div class="xs faint" style="margin-top:8px">La clé est stockée dans le fichier <span class="mono">data/settings.json</span>
            sur votre machine et n'est jamais envoyée ailleurs qu'à l'API d'Anthropic.</div>
        </div>

        ${S.protege ? `<div class="card" style="border-color:rgba(250,178,25,.45)">
          <h3>Instance en ligne — jeton d'administration</h3>
          <p class="sm dim" style="margin-top:0">
            Ce serveur est accessible par URL, donc les réglages et l'analyste IA sont fermés au public :
            sans cela, n'importe quel visiteur pourrait dépenser vos crédits Anthropic. Collez ici le jeton
            défini dans la variable d'environnement <span class="mono">ALPHADESK_TOKEN</span> de l'hébergeur.
            Il reste dans ce navigateur, il n'est jamais affiché ailleurs.
          </p>
          <input type="password" id="adm_token" placeholder="jeton d'administration"
                 value="${esc(getToken())}" style="width:100%" autocomplete="off">
          <div class="xs faint" style="margin-top:6px">Sans ce jeton, tout le reste fonctionne :
            analyse, screener, backtest, comparateur et académie restent ouverts.</div>
        </div>` : ''}

        <div class="card">
          <h3>Affichage</h3>
          <div class="row between wrap" style="gap:14px">
            <div style="flex:1;min-width:220px">
              <div class="b">Mode daltonien</div>
              <div class="xs dim" style="margin-top:3px;line-height:1.55">
                Le vert et le rouge du marché sont séparés de seulement ΔE 6,9 en deutéranopie —
                la forme la plus répandue de daltonisme. Ce mode bascule la direction sur une paire
                bleu / orange séparée de 26,8, et fait passer les moyennes mobiles en rampe neutre.
                Le signe (+/−) et les libellés restent présents dans les deux cas : la couleur n'est
                jamais le seul canal d'information.
              </div>
            </div>
            <div class="seg" id="cvdSeg">
              <button data-v="0">Standard</button>
              <button data-v="1">Daltonien</button>
            </div>
          </div>
        </div>

        <div class="card">
          <h3>Ce que fait AlphaDesk avec vos réglages</h3>
          <table>
            <tr><td class="dim">Poids de la tendance</td><td class="num">${HORIZONS[S.profile.horizon].weights.tendance} %</td></tr>
            <tr><td class="dim">Poids du momentum</td><td class="num">${HORIZONS[S.profile.horizon].weights.momentum} %</td></tr>
            <tr><td class="dim">Poids des flux</td><td class="num">${HORIZONS[S.profile.horizon].weights.flux} %</td></tr>
            <tr><td class="dim">Poids des fondamentaux</td><td class="num">${HORIZONS[S.profile.horizon].weights.fonda} %</td></tr>
            <tr><td class="dim">Distance du stop</td><td class="num">${n(HORIZONS[S.profile.horizon].atrStop, 1)} × ATR</td></tr>
            <tr><td class="dim">Risque par ligne</td><td class="num">${RISKS[S.profile.risk].riskPerTrade} % du capital</td></tr>
            <tr><td class="dim">Taille maximale d'une ligne</td><td class="num">${RISKS[S.profile.risk].maxPosition} % du capital</td></tr>
            <tr><td class="dim">Conviction requise pour un signal fort</td><td class="num">${RISKS[S.profile.risk].minConviction} %</td></tr>
          </table>
        </div>

        <div class="card">
          <h3>Sources et limites</h3>
          <div class="sm dim" style="line-height:1.7">
            <p><b class="acc">Données</b> — cotations et fondamentaux issus de Yahoo Finance, en différé (15 à 20 minutes
            selon les places). Elles servent à l'analyse, pas à l'exécution d'ordres à la seconde.</p>
            <p><b class="acc">Calculs</b> — tous les indicateurs sont recalculés localement à partir des séries OHLCV brutes.
            Rien n'est repris d'un fournisseur de signaux : vous pouvez lire chaque formule dans
            <span class="mono">public/js/indicators.js</span>.</p>
            <p><b class="acc">Limites</b> — l'analyse technique décrit des comportements passés. Elle ne connaît ni les
            résultats à venir, ni une fusion, ni une décision de banque centrale. Un backtest favorable ne garantit rien.</p>
            <p><b class="acc">Confidentialité</b> — portefeuille et journal restent dans votre navigateur ; aucun compte,
            aucun envoi vers un serveur tiers hors appels de cotation.</p>
          </div>
        </div>
      </div>
    </div>`;

  const cvdOn = localStorage.getItem('alphadesk.cvd') === '1';
  $('#cvdSeg').querySelectorAll('button').forEach(b => {
    b.classList.toggle('on', b.dataset.v === (cvdOn ? '1' : '0'));
    b.onclick = () => {
      localStorage.setItem('alphadesk.cvd', b.dataset.v);
      applyCvd();
      S.report = null; S.bt = null;
      toast(b.dataset.v === '1' ? 'Mode daltonien activé' : 'Palette standard rétablie', 'ok');
      render();
    };
  });

  $('#p_save').onclick = () => {
    S.profile.horizon = $('#p_h').value;
    S.profile.risk = $('#p_r').value;
    S.profile.capital = Math.max(0, +$('#p_c').value || 0);
    S.profile.benchmark = $('#p_b').value || suggestBenchmark(S.symbol);
    // le profil change les poids du score : tout resultat en cache devient faux
    saveProfile(); S.report = null; S.bt = null; S.screen = null; S.compar = null;
    toast('Réglages enregistrés — les analyses sont recalculées', 'ok');
  };
  const jetonInput = $('#adm_token');
  if (jetonInput) {
    jetonInput.onchange = () => {
      const v = jetonInput.value.trim();
      if (v) localStorage.setItem('alphadesk.token', v); else localStorage.removeItem('alphadesk.token');
      toast(v ? 'Jeton enregistré dans ce navigateur' : 'Jeton effacé', 'ok');
    };
  }

  $('#k_save').onclick = async () => {
    const key = $('#k_key').value.trim();
    const r = await postJSON('/api/settings', { ...(key ? { anthropicKey: key } : {}), aiModel: $('#k_model').value });
    if (r.status === 401) { toast('Jeton d\'administration invalide ou manquant', 'err'); return; }
    S.ai.hasKey = !!key || st.hasKey;
    toast('Enregistré', 'ok'); render();
  };
  const kd = $('#k_del');
  if (kd) kd.onclick = async () => {
    const r = await postJSON('/api/settings', { anthropicKey: '' });
    if (r.status === 401) { toast('Jeton d\'administration invalide ou manquant', 'err'); return; }
    S.ai.hasKey = false; toast('Clé supprimée', 'ok'); render();
  };
}
