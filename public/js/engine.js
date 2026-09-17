/* =========================================================================
   AlphaDesk — moteur d'analyse et de décision
   Transforme une série OHLCV en : indicateurs, indicateurs propriétaires,
   score global, signal, plan de trade chiffré et explication en français.

   POINT CRITIQUE : tout le moteur est « index-aware ». Chaque calcul se fait
   sur une fenêtre qui se termine à l'indice demandé, jamais sur la série
   entière. C'est ce qui permet au backtest de rejouer le moteur bar par bar
   sans qu'aucune donnée future ne fuite dans le passé.
   ========================================================================= */
import * as I from './indicators.js';

/* =========================================================================
   1. PROFILS D'INVESTISSEMENT
   ========================================================================= */
export const HORIZONS = {
  court: {
    key: 'court', label: 'Court terme', detail: 'quelques jours à 4 semaines',
    weights: { tendance: 14, qualiteTendance: 10, momentum: 26, flux: 14, position: 14, structure: 12, volatilite: 6, forceRelative: 4, fonda: 0 },
    atrStop: 2.0, maPivot: 20, holdMax: 25
  },
  moyen: {
    key: 'moyen', label: 'Moyen terme', detail: '1 à 6 mois',
    weights: { tendance: 22, qualiteTendance: 14, momentum: 18, flux: 12, position: 8, structure: 10, volatilite: 6, forceRelative: 6, fonda: 4 },
    atrStop: 2.5, maPivot: 50, holdMax: 120
  },
  long: {
    key: 'long', label: 'Long terme', detail: '6 mois à plusieurs années',
    weights: { tendance: 26, qualiteTendance: 12, momentum: 10, flux: 8, position: 6, structure: 8, volatilite: 4, forceRelative: 8, fonda: 18 },
    atrStop: 3.5, maPivot: 200, holdMax: 400
  }
};

export const RISKS = {
  prudent: { key: 'prudent', label: 'Prudent', riskPerTrade: 0.5, maxPosition: 8, minConviction: 65 },
  equilibre: { key: 'equilibre', label: 'Équilibré', riskPerTrade: 1.0, maxPosition: 15, minConviction: 55 },
  offensif: { key: 'offensif', label: 'Offensif', riskPerTrade: 2.0, maxPosition: 25, minConviction: 45 }
};

export const DEFAULT_PROFILE = {
  horizon: 'moyen', risk: 'equilibre', capital: 10000, benchmark: '^FCHI'
};

/* ------------------------------ utilitaires ----------------------------- */
/** fenêtre de k valeurs se terminant à i (incluse) */
const win = (arr, i, k) => arr.slice(Math.max(0, i - k + 1), i + 1);
const winClean = (arr, i, k) => win(arr, i, k).filter(x => x !== null && isFinite(x));
/** nombre au format français : séparateur décimal virgule, espace fine pour les milliers */
const nf = (x, d = 1) => (x === null || x === undefined || !isFinite(x)) ? 'n/d'
  : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtSigned = (x, d = 0) => (x === null || x === undefined || !isFinite(x)) ? 'n/d' : (x >= 0 ? '+' : '') + nf(x, d);
function fmtNum(x) {
  if (x === null || x === undefined || !isFinite(x)) return 'n/d';
  const a = Math.abs(x);
  return nf(x, a >= 1000 ? 0 : a >= 10 ? 2 : 3);
}
function pctChangeAt(c, i, back) {
  if (i < back || !c[i - back]) return null;
  return 100 * (c[i] / c[i - back] - 1);
}

/* =========================================================================
   2. CALCUL DE TOUS LES INDICATEURS (une seule passe sur la série)
   ========================================================================= */
export function computeIndicators(series) {
  const { o, h, l, c, v, t } = series;
  const n = c.length;
  const ind = { n, t, o, h, l, c, v };

  // --- moyennes mobiles
  ind.sma20 = I.sma(c, 20); ind.sma50 = I.sma(c, 50);
  ind.sma100 = I.sma(c, 100); ind.sma200 = I.sma(c, 200);
  ind.ema9 = I.ema(c, 9); ind.ema21 = I.ema(c, 21); ind.ema50 = I.ema(c, 50);
  ind.hma20 = I.hma(c, 20);

  // --- tendance
  ind.macd = I.macd(c, 12, 26, 9);
  ind.adx = I.adx(h, l, c, 14);
  ind.supertrend = I.supertrend(h, l, c, 10, 3);
  ind.psar = I.psar(h, l);
  ind.ichimoku = I.ichimoku(h, l, c);
  ind.aroon = I.aroon(h, l, 25);

  // --- momentum
  ind.rsi = I.rsi(c, 14); ind.rsi7 = I.rsi(c, 7);
  ind.stoch = I.stochastic(h, l, c, 14, 3, 3);
  ind.stochRsi = I.stochRSI(c);
  ind.cci = I.cci(h, l, c, 20);
  ind.willr = I.williamsR(h, l, c, 14);
  ind.roc = I.roc(c, 12);
  ind.tsi = I.tsi(c);

  // --- volatilité
  ind.atr = I.atr(h, l, c, 14);
  ind.atrPct = ind.atr.map((a, i) => a === null ? null : 100 * a / c[i]);
  ind.bb = I.bollinger(c, 20, 2);
  ind.kc = I.keltner(h, l, c, 20, 2);
  ind.donchian = I.donchian(h, l, 20);
  ind.hv20 = I.histVol(c, 20); ind.hv60 = I.histVol(c, 60);
  ind.squeeze = I.squeeze(h, l, c);

  // --- volume
  ind.obv = I.obv(c, v);
  ind.cmf = I.cmf(h, l, c, v, 20);
  ind.mfi = I.mfi(h, l, c, v, 14);
  ind.forceIndex = I.forceIndex(c, v, 13);
  ind.adLine = I.adLine(h, l, c, v);
  ind.vwap20 = I.vwap(h, l, c, v, 20);
  ind.volSma20 = I.sma(v, 20);
  ind.volSpike = I.volumeSpike(v, 20);

  // --- rendements
  ind.returns = I.returns(c);
  ind.logReturns = I.logReturns(c);

  // --- séries roulantes indispensables au mode index-aware --------------
  // régression : pente normalisée et qualité d'ajustement, calculées à chaque barre
  ind.reg20 = rollingLinreg(c, 20);
  ind.reg50 = rollingLinreg(c, 50);
  ind.reg120 = rollingLinreg(c, 120);
  // repli courant depuis le plus haut atteint jusqu'ici
  ind.ddSeries = runningDrawdown(c);
  // exposant de Hurst glissant (recalculé toutes les 5 barres, puis reporté)
  ind.hurstSeries = rollingHurst(c, 140, 5);
  // OBV normalisé pour comparer sa pente d'une barre à l'autre
  ind.obvSlope = rollingObvSlope(ind.obv, 40, 120);

  return ind;
}

function rollingLinreg(src, p) {
  const n = src.length;
  const angle = new Array(n).fill(null), r2 = new Array(n).fill(null), slope = new Array(n).fill(null);
  // sommes glissantes pour rester en O(n)
  let sy = 0, sxy = 0, syy = 0;
  const sx = (p - 1) * p / 2, sxx = (p - 1) * p * (2 * p - 1) / 6;
  for (let i = 0; i < n; i++) {
    if (i >= p) { /* recalcul direct : la fenêtre glisse, les x se décalent */ }
    if (i < p - 1) continue;
    sy = 0; sxy = 0; syy = 0;
    for (let k = 0; k < p; k++) { const y = src[i - p + 1 + k]; sy += y; sxy += k * y; syy += y * y; }
    const den = p * sxx - sx * sx;
    const sl = den === 0 ? 0 : (p * sxy - sx * sy) / den;
    const my = sy / p;
    const ssTot = syy - p * my * my;
    const inter = my - sl * (sx / p);
    let ssRes = 0;
    for (let k = 0; k < p; k++) { const y = src[i - p + 1 + k]; const e = y - (sl * k + inter); ssRes += e * e; }
    slope[i] = sl;
    r2[i] = ssTot <= 0 ? 0 : Math.max(0, 1 - ssRes / ssTot);
    angle[i] = my === 0 ? 0 : (sl / my) * 100;
  }
  return { slope, r2, angle };
}

function runningDrawdown(c) {
  const out = new Array(c.length).fill(0);
  let peak = -Infinity;
  for (let i = 0; i < c.length; i++) { peak = Math.max(peak, c[i]); out[i] = (c[i] - peak) / peak; }
  return out;
}

function rollingHurst(c, window, every) {
  const n = c.length, out = new Array(n).fill(null);
  let lastVal = null;
  for (let i = 0; i < n; i++) {
    if (i >= window && (i % every === 0 || lastVal === null)) {
      lastVal = I.hurst(c.slice(i - window + 1, i + 1), 30);
    }
    out[i] = lastVal;
  }
  return out;
}

function rollingObvSlope(obv, p, normWindow) {
  const n = obv.length, out = new Array(n).fill(null);
  const reg = rollingLinreg(obv, p);
  for (let i = 0; i < n; i++) {
    if (reg.slope[i] === null) continue;
    const w = win(obv, i, normWindow);
    const range = Math.max(...w) - Math.min(...w) || 1;
    out[i] = I.clamp(reg.slope[i] * p / range, -1, 1) * 100;
  }
  return out;
}

/* =========================================================================
   3. STRUCTURE DE MARCHÉ À UN INDICE DONNÉ
   ========================================================================= */
export function structureAt(ind, i, lookback = 220, opts = {}) {
  const avecNiveaux = opts.niveaux !== false;
  const s = Math.max(0, i - lookback + 1);
  const h = ind.h.slice(s, i + 1), l = ind.l.slice(s, i + 1), c = ind.c.slice(s, i + 1), o = ind.o.slice(s, i + 1);
  const sw = I.swings(h, l, 5);
  const shift = a => a.map(x => ({ ...x, idx: x.idx + s }));
  // le regroupement en zones ne sert qu'au plan de trade : on l'evite quand
  // l'appelant ne veut que le score (boucle de backtest, comparateur)
  const lv = avecNiveaux
    ? I.levels(h, l, c, 5, 1.2, sw).map(z => ({ ...z, lastIdx: z.lastIdx + s, firstIdx: z.firstIdx + s }))
    : [];

  // Divergences : on interroge deux oscillateurs, mais une même divergence
  // repérée par les deux ne doit compter qu'une fois dans le score.
  const rawDiv = [
    ...(I.divergence(c, ind.rsi.slice(s, i + 1), Math.min(70, c.length - 1), 4) || []).map(d => ({ ...d, source: 'RSI' })),
    ...(I.divergence(c, ind.macd.hist.slice(s, i + 1), Math.min(70, c.length - 1), 4) || []).map(d => ({ ...d, source: 'MACD' }))
  ];
  const seen = new Map();
  for (const d of rawDiv) {
    const key = d.type + '|' + d.kind;
    if (seen.has(key)) { seen.get(key).sources.push(d.source); continue; }
    seen.set(key, { ...d, from: d.from + s, to: d.to + s, sources: [d.source] });
  }
  const divergences = [...seen.values()];

  return {
    swings: { highs: shift(sw.highs), lows: shift(sw.lows) },
    levels: lv,
    fib: avecNiveaux ? I.fibonacci(h, l, Math.min(120, h.length)) : null,
    pivots: avecNiveaux ? I.pivots(h, l, c) : null,
    candles: I.candlePatterns(o, h, l, c, c.length - 1),
    divergences,
    divRsi: divergences.filter(d => d.sources.includes('RSI')),
    divMacd: divergences.filter(d => d.sources.includes('MACD'))
  };
}

/* =========================================================================
   4. INDICATEURS PROPRIÉTAIRES ALPHADESK
   ========================================================================= */

/** TQS — Trend Quality Score (0 → 100) : la tendance est-elle nette et fiable ? */
export function trendQualityScore(ind, i) {
  const c = ind.c[i], parts = [];

  const mas = [ind.sma20[i], ind.sma50[i], ind.sma200[i]];
  let stack = 50;
  if (mas.every(x => x !== null)) {
    if (c > mas[0] && mas[0] > mas[1] && mas[1] > mas[2]) stack = 100;
    else if (c < mas[0] && mas[0] < mas[1] && mas[1] < mas[2]) stack = 0;
    else stack = ((c > mas[0] ? 1 : 0) + (mas[0] > mas[1] ? 1 : 0) + (mas[1] > mas[2] ? 1 : 0)) / 3 * 100;
  } else if (ind.sma50[i] !== null) {
    stack = c > ind.sma50[i] ? 70 : 30;
  }
  parts.push({ k: 'Empilement des moyennes mobiles', v: stack, w: 0.3 });

  const a = ind.adx.adx[i];
  parts.push({ k: 'Force directionnelle (ADX)', v: a === null ? 50 : I.clamp((a - 10) / 30, 0, 1) * 100, w: 0.25 });

  const r2 = ind.reg50.r2[i];
  parts.push({ k: 'Linéarité du mouvement (R²)', v: r2 === null ? 50 : r2 * 100, w: 0.2 });

  const hu = ind.hurstSeries[i];
  parts.push({ k: 'Persistance statistique (Hurst)', v: hu === null ? 50 : I.clamp((hu - 0.35) / 0.3, 0, 1) * 100, w: 0.15 });

  const stDir = ind.supertrend.dir[i], slope = ind.reg50.angle[i];
  const coherent = slope !== null && ((stDir === 1 && slope > 0) || (stDir === -1 && slope < 0));
  parts.push({ k: 'Cohérence des signaux', v: coherent ? 100 : 30, w: 0.1 });

  const score = parts.reduce((s, p) => s + p.v * p.w, 0);
  return {
    value: Math.round(score), direction: stack >= 55 ? 1 : stack <= 45 ? -1 : 0, parts,
    label: score >= 70 ? 'Tendance nette' : score >= 50 ? 'Tendance présente mais imparfaite'
      : score >= 30 ? 'Marché hésitant' : 'Pas de tendance exploitable'
  };
}

/** MPI — Momentum Pressure Index (−100 → +100) */
export function momentumPressureIndex(ind, i) {
  const parts = [];
  const push = (k, v, w) => parts.push({ k, v: I.clamp(v || 0, -100, 100), w });

  const r = ind.rsi[i];
  push('RSI 14', r === null ? 0 : (r - 50) * 2.4, 0.22);
  const mh = ind.macd.hist[i], atr = ind.atr[i];
  push('Histogramme MACD', (mh === null || !atr) ? 0 : I.clamp(mh / (atr * 0.6), -1, 1) * 100, 0.22);
  const k = ind.stoch.k[i];
  push('Stochastique', k === null ? 0 : (k - 50) * 2, 0.14);
  const rc = ind.roc[i];
  push('Taux de variation 12 j', rc === null ? 0 : I.clamp(rc / 12, -1, 1) * 100, 0.14);
  const ts = ind.tsi.line[i];
  push('True Strength Index', ts === null ? 0 : I.clamp(ts / 35, -1, 1) * 100, 0.14);
  const cc = ind.cci[i];
  push('CCI 20', cc === null ? 0 : I.clamp(cc / 150, -1, 1) * 100, 0.14);

  const value = parts.reduce((s, p) => s + p.v * p.w, 0);
  const mh5 = ind.macd.hist[i - 5];
  const accel = (mh !== null && mh5 != null) ? Math.sign(Math.abs(mh) - Math.abs(mh5)) * Math.sign(mh || 1) : 0;
  return {
    value: Math.round(value), parts, accel,
    label: value > 45 ? 'Pression acheteuse forte' : value > 15 ? 'Pression acheteuse'
      : value > -15 ? 'Équilibre acheteurs / vendeurs' : value > -45 ? 'Pression vendeuse' : 'Pression vendeuse forte'
  };
}

/** VRG — Volatility Regime Gauge */
export function volatilityRegime(ind, i) {
  const cur = ind.atrPct[i];
  const hist = winClean(ind.atrPct, i, 250);
  const rank = (hist.length > 30 && cur !== null) ? I.pctRank(hist, cur) : null;
  const sq = ind.squeeze[i];
  let sqCount = 0;
  for (let j = i; j >= 0 && ind.squeeze[j] === true; j--) sqCount++;
  const bw = ind.bb.bandwidth[i];
  const bwHist = winClean(ind.bb.bandwidth, i, 250);
  const bwRank = (bwHist.length > 30 && bw !== null) ? I.pctRank(bwHist, bw) : null;

  let regime, tone;
  if (rank === null) { regime = 'Inconnu'; tone = 'neutre'; }
  else if (rank < 0.2) { regime = 'Très calme'; tone = 'calme'; }
  else if (rank < 0.45) { regime = 'Calme'; tone = 'calme'; }
  else if (rank < 0.75) { regime = 'Normal'; tone = 'neutre'; }
  else if (rank < 0.9) { regime = 'Tendu'; tone = 'tendu'; }
  else { regime = 'Choc de volatilité'; tone = 'choc'; }

  return {
    atrPct: cur, medianAtrPct: I.median(hist), rank, regime, tone,
    squeeze: sq === true, squeezeBars: sqCount, bandwidth: bw, bandwidthRank: bwRank,
    hv20: ind.hv20[i], hv60: ind.hv60[i],
    label: sq === true ? `${regime} — compression depuis ${sqCount} séances (mouvement en préparation)` : regime
  };
}

/** SFI — Smart Flow Index (−100 → +100) */
export function smartFlowIndex(ind, i) {
  const parts = [];
  parts.push({ k: 'Tendance de l’OBV', v: ind.obvSlope[i] ?? 0, w: 0.3 });

  const cm = ind.cmf[i];
  parts.push({ k: 'Chaikin Money Flow', v: cm === null ? 0 : I.clamp(cm / 0.2, -1, 1) * 100, w: 0.25 });

  const mf = ind.mfi[i];
  parts.push({ k: 'Money Flow Index', v: mf === null ? 0 : (mf - 50) * 2, w: 0.2 });

  const fi = ind.forceIndex[i];
  const fiHist = winClean(ind.forceIndex, i, 120).map(Math.abs);
  const fiScale = fiHist.length ? (I.percentile(fiHist, 0.8) || 1) : 1;
  parts.push({ k: 'Force Index', v: fi === null ? 0 : I.clamp(fi / fiScale, -1, 1) * 100, w: 0.15 });

  let conf = 0, wsum = 0;
  for (let j = Math.max(1, i - 9); j <= i; j++) {
    const rel = Math.min(ind.volSpike[j] ?? 1, 3);
    conf += Math.sign(ind.c[j] - ind.c[j - 1]) * rel; wsum += rel;
  }
  parts.push({ k: 'Volume confirmant le prix', v: wsum ? (conf / wsum) * 100 : 0, w: 0.1 });

  const value = parts.reduce((s, p) => s + p.v * p.w, 0);
  return {
    value: Math.round(value), parts,
    label: value > 35 ? 'Accumulation nette' : value > 10 ? 'Légère accumulation'
      : value > -10 ? 'Flux neutres' : value > -35 ? 'Légère distribution' : 'Distribution nette'
  };
}

/** RES — Risk Exposure Score (0 → 100, 100 = risque maximal) */
export function riskExposureScore(ind, i, vrg) {
  const parts = [];
  const rets = winClean(ind.returns, i, 252);

  parts.push({ k: 'Régime de volatilité', v: vrg.rank === null ? 50 : vrg.rank * 100, w: 0.3 });

  const dd = Math.abs(ind.ddSeries[i]) * 100;
  parts.push({ k: 'Repli depuis le plus haut', v: I.clamp(dd / 35, 0, 1) * 100, w: 0.2 });

  const varD = I.historicalVaR(rets, 0.95);
  parts.push({ k: 'VaR 95 % à 1 jour', v: varD === null ? 50 : I.clamp(Math.abs(varD) / 0.06, 0, 1) * 100, w: 0.2 });

  const kurt = I.kurtosis(rets);
  parts.push({ k: 'Risque d’événement extrême', v: kurt === null ? 50 : I.clamp(kurt / 8, 0, 1) * 100, w: 0.15 });

  const vw = win(ind.v, i, 20), cw = win(ind.c, i, 20);
  const avgVal = I.mean(vw.map((x, j) => x * cw[j]));
  const liq = !avgVal ? 50 : I.clamp(1 - Math.log10(Math.max(avgVal, 1)) / 8, 0, 1) * 100;
  parts.push({ k: 'Liquidité', v: liq, w: 0.15 });

  const value = parts.reduce((s, p) => s + p.v * p.w, 0);
  return {
    value: Math.round(value), parts, var95: varD, kurtosis: kurt, avgDailyValue: avgVal,
    label: value < 30 ? 'Risque faible' : value < 50 ? 'Risque modéré' : value < 70 ? 'Risque élevé' : 'Risque très élevé'
  };
}

export function customIndicators(ind, i) {
  const tqs = trendQualityScore(ind, i);
  const mpi = momentumPressureIndex(ind, i);
  const vrg = volatilityRegime(ind, i);
  const sfi = smartFlowIndex(ind, i);
  const res = riskExposureScore(ind, i, vrg);
  return { tqs, mpi, vrg, sfi, res };
}

/* =========================================================================
   5. LES FACTEURS DE DÉCISION
   ========================================================================= */
export function buildFactors(ind, i, custom, struct, ctx) {
  const c = ind.c[i];
  const F = [];
  const add = (key, label, score, why, detail) =>
    F.push({ key, label, score: Math.round(I.clamp(score || 0, -100, 100)), why, detail });

  /* --- Tendance de fond ------------------------------------------------ */
  {
    const s200 = ind.sma200[i], s50 = ind.sma50[i], s20 = ind.sma20[i];
    let sc = 0; const notes = [];
    if (s200 !== null) {
      const d = (c / s200 - 1) * 100;
      sc += I.clamp(d / 15, -1, 1) * 45;
      notes.push(`${d >= 0 ? 'au-dessus' : 'sous'} la MM200 de ${nf(Math.abs(d), 1)} %`);
    }
    if (s50 !== null) {
      const d = (c / s50 - 1) * 100;
      sc += I.clamp(d / 8, -1, 1) * 30;
      notes.push(`${d >= 0 ? 'au-dessus' : 'sous'} la MM50 de ${nf(Math.abs(d), 1)} %`);
    }
    if (s20 !== null && s50 !== null) {
      sc += s20 > s50 ? 15 : -15;
      notes.push(s20 > s50 ? 'MM20 > MM50 (croisement favorable)' : 'MM20 < MM50 (croisement défavorable)');
    }
    const ang = ind.reg50.angle[i];
    if (ang !== null) sc += I.clamp(ang / 0.25, -1, 1) * 10;
    add('tendance', 'Tendance de fond', sc,
      sc > 30 ? 'Le titre est structurellement haussier.' : sc < -30 ? 'Le titre est structurellement baissier.' : 'Pas de direction structurelle claire.',
      notes.join(' · '));
  }

  /* --- Qualité de la tendance ------------------------------------------ */
  {
    const t = custom.tqs;
    const sc = (t.value - 45) * 2 * (t.direction === 0 ? 0.35 : t.direction);
    const a = ind.adx.adx[i];
    add('qualiteTendance', 'Qualité de la tendance (TQS)', sc,
      t.value >= 65 ? 'La tendance est régulière : les signaux de suivi sont fiables.'
        : t.value >= 45 ? 'La tendance existe mais reste heurtée.'
          : 'Marché sans direction : les faux signaux sont fréquents.',
      `TQS ${t.value}/100 · ADX ${a === null ? 'n/d' : nf(a, 1)} · R² ${nf((ind.reg50.r2[i] ?? 0), 2)}`);
  }

  /* --- Momentum --------------------------------------------------------- */
  {
    const m = custom.mpi;
    let sc = m.value;
    const r = ind.rsi[i];
    if (r !== null && (r > 78 || r < 22)) sc *= 0.55; // un extrême prévient de l'essoufflement
    add('momentum', 'Momentum (MPI)', sc, m.label + '.',
      `RSI ${r === null ? 'n/d' : nf(r, 1)} · MACD ${ind.macd.hist[i] === null ? 'n/d' : (ind.macd.hist[i] > 0 ? 'positif' : 'négatif')} · Stoch ${ind.stoch.k[i] === null ? 'n/d' : nf(ind.stoch.k[i], 0)}`);
  }

  /* --- Flux et volume --------------------------------------------------- */
  {
    const s = custom.sfi;
    add('flux', 'Flux acheteurs / vendeurs (SFI)', s.value, s.label + '.',
      `CMF ${ind.cmf[i] === null ? 'n/d' : nf(ind.cmf[i], 3)} · MFI ${ind.mfi[i] === null ? 'n/d' : nf(ind.mfi[i], 0)} · volume ${nf((ind.volSpike[i] ?? 1), 2)}× la moyenne`);
  }

  /* --- Position dans la fourchette ------------------------------------- */
  {
    const pb = ind.bb.percentB[i], don = ind.donchian;
    const pos = (don.upper[i] === null || don.upper[i] === don.lower[i]) ? 0.5 : (c - don.lower[i]) / (don.upper[i] - don.lower[i]);
    let sc = 0;
    if (pb !== null) sc += (0.5 - I.clamp(pb, -0.2, 1.2)) * 110;
    sc += (0.5 - pos) * 60;
    let note = `%B ${pb === null ? 'n/d' : nf(pb, 2)} · position dans le canal 20 j : ${nf((pos * 100), 0)} %`;
    if (ctx.week52) note += ` · ${nf(ctx.week52.fromHigh, 1)} % sous le plus haut 52 semaines`;
    add('position', 'Position dans la fourchette', sc,
      sc > 25 ? 'Le prix est en bas de fourchette : le point d’entrée est plus favorable.'
        : sc < -25 ? 'Le prix est en haut de fourchette : risque de payer cher, un repli serait un meilleur point d’entrée.'
          : 'Le prix est au milieu de sa fourchette.', note);
  }

  /* --- Structure et signaux -------------------------------------------- */
  {
    let sc = 0; const notes = [];
    const st = ind.supertrend.dir[i];
    if (st !== null) { sc += st * 30; notes.push(st === 1 ? 'Supertrend haussier' : 'Supertrend baissier'); }
    const ps = ind.psar[i];
    if (ps !== null) { sc += (c > ps ? 20 : -20); notes.push(c > ps ? 'SAR sous les cours' : 'SAR au-dessus des cours'); }
    const ic = ind.ichimoku, d = ic.disp;
    const kA = ic.senkouA[i - d], kB = ic.senkouB[i - d];
    if (kA != null && kB != null) {
      const top = Math.max(kA, kB), bot = Math.min(kA, kB);
      if (c > top) { sc += 25; notes.push('cours au-dessus du nuage Ichimoku'); }
      else if (c < bot) { sc -= 25; notes.push('cours sous le nuage Ichimoku'); }
      else notes.push('cours dans le nuage Ichimoku (indécision)');
    }
    const ao = ind.aroon.osc[i];
    if (ao !== null) sc += I.clamp(ao / 100, -1, 1) * 15;
    for (const cd of struct.candles) {
      if (cd.sens === 'haussier') sc += cd.force * 4;
      else if (cd.sens === 'baissier') sc -= cd.force * 4;
    }
    if (struct.candles.length) notes.push('chandelier : ' + struct.candles.map(x => x.name).join(', '));
    const divs = (struct.divergences || []).filter(x => x.kind === 'classique');
    for (const dv of divs) {
      // une divergence confirmée par deux oscillateurs pèse un peu plus lourd
      sc += (dv.type === 'haussière' ? 18 : -18) * (dv.sources.length > 1 ? 1.3 : 1);
      notes.push(`divergence ${dv.type} (${dv.sources.join(' + ')})`);
    }
    add('structure', 'Structure et signaux', sc,
      sc > 30 ? 'Les signaux de structure confirment la hausse.' : sc < -30 ? 'Les signaux de structure confirment la baisse.' : 'Signaux de structure partagés.',
      notes.join(' · '));
  }

  /* --- Régime de volatilité -------------------------------------------- */
  {
    const v = custom.vrg;
    let sc = v.rank === null ? 0 : (0.55 - v.rank) * 120;
    if (v.squeeze) sc += 10;
    add('volatilite', 'Régime de volatilité (VRG)', sc,
      v.tone === 'choc' ? 'Volatilité exceptionnelle : réduire la taille de position ou attendre.'
        : v.squeeze ? 'Compression de volatilité : un mouvement ample se prépare, la direction n’est pas encore décidée.'
          : v.tone === 'calme' ? 'Volatilité contenue : conditions confortables pour se positionner.'
            : 'Volatilité dans sa norme.',
      `ATR ${v.atrPct === null ? 'n/d' : nf(v.atrPct, 2)} % du cours · rang historique ${v.rank === null ? 'n/d' : nf((v.rank * 100), 0)} %`);
  }

  /* --- Force relative --------------------------------------------------- */
  {
    if (ctx.relative) {
      const rs = ctx.relative;
      const sc = I.clamp((rs.excess3m || 0) / 12, -1, 1) * 60 + I.clamp((rs.excess1m || 0) / 6, -1, 1) * 40;
      add('forceRelative', 'Force relative au marché', sc,
        sc > 20 ? `Le titre surperforme ${rs.benchName}.` : sc < -20 ? `Le titre sous-performe ${rs.benchName}.` : `Le titre suit ${rs.benchName}.`,
        `3 mois : ${fmtSigned(rs.excess3m)} pts vs indice · 1 mois : ${fmtSigned(rs.excess1m)} pts${rs.beta != null ? ` · bêta ${nf(rs.beta, 2)}` : ''}`);
    } else {
      add('forceRelative', 'Force relative au marché', 0, 'Indice de référence indisponible.', '');
    }
  }

  /* --- Fondamentaux ----------------------------------------------------- */
  {
    const f = ctx.fundamentals;
    if (f && !f.error && (f.per || f.roe || f.revenueGrowth)) {
      let sc = 0; const notes = [];
      if (f.per && f.per > 0) { sc += I.clamp((28 - f.per) / 20, -1, 1) * 30; notes.push(`PER ${nf(f.per, 1)}`); }
      if (f.revenueGrowth != null) { sc += I.clamp(f.revenueGrowth / 0.2, -1, 1) * 25; notes.push(`croissance du CA ${nf((f.revenueGrowth * 100), 1)} %`); }
      if (f.roe != null) { sc += I.clamp((f.roe - 0.08) / 0.18, -1, 1) * 20; notes.push(`ROE ${nf((f.roe * 100), 1)} %`); }
      if (f.profitMargin != null) { sc += I.clamp(f.profitMargin / 0.18, -1, 1) * 15; notes.push(`marge nette ${nf((f.profitMargin * 100), 1)} %`); }
      if (f.debtToEquity != null) { sc += I.clamp((110 - f.debtToEquity) / 110, -1, 1) * 10; notes.push(`dette / fonds propres ${nf(f.debtToEquity, 0)} %`); }
      add('fonda', 'Fondamentaux', sc,
        sc > 25 ? 'Société solide et raisonnablement valorisée.' : sc < -25 ? 'Valorisation tendue ou fondamentaux fragiles.' : 'Fondamentaux corrects, sans excès.',
        notes.join(' · '));
    } else {
      add('fonda', 'Fondamentaux', 0, 'Données fondamentales non disponibles pour cet instrument.', '');
    }
  }

  return F;
}

/* =========================================================================
   6. SCORE GLOBAL ET SIGNAL
   ========================================================================= */
export function scoreAndSignal(factors, profile, custom) {
  const H = HORIZONS[profile.horizon] || HORIZONS.moyen;
  const R = RISKS[profile.risk] || RISKS.equilibre;
  const W = H.weights;

  let totalW = 0, acc = 0;
  const detail = factors.map(f => {
    const w = W[f.key] ?? 0;
    totalW += w; acc += f.score * w;
    return { ...f, weight: w, contribution: f.score * w };
  });
  let raw = totalW ? acc / totalW : 0;

  if (custom.vrg.tone === 'choc') raw *= 0.7;
  if (custom.res.value > 75) raw *= 0.85;

  const score = Math.round(I.clamp(raw, -100, 100));

  const weighted = detail.filter(d => d.weight >= 6);
  const dominant = Math.sign(score) || 1;
  const agree = weighted.filter(d => Math.sign(d.score) === dominant).length / (weighted.length || 1);
  const dispersion = I.stdev(weighted.map(d => d.score)) ?? 50;
  let conviction = Math.round(I.clamp(
    40 * agree + 35 * I.clamp(Math.abs(score) / 55, 0, 1) + 25 * I.clamp(1 - dispersion / 75, 0, 1), 0, 100));
  if (custom.vrg.tone === 'choc') conviction = Math.round(conviction * 0.8);

  let label, action, tone;
  if (score >= 42 && conviction >= R.minConviction) { label = 'ACHAT FORT'; action = 'buy2'; tone = 'pos2'; }
  else if (score >= 18) { label = 'ACHAT'; action = 'buy1'; tone = 'pos1'; }
  else if (score <= -42 && conviction >= R.minConviction) { label = 'VENTE FORTE'; action = 'sell2'; tone = 'neg2'; }
  else if (score <= -18) { label = 'VENTE / ALLÉGER'; action = 'sell1'; tone = 'neg1'; }
  else { label = 'NEUTRE — ATTENDRE'; action = 'hold'; tone = 'neutral'; }

  return { score, conviction, label, action, tone, detail, horizon: H, riskProfile: R, agreement: Math.round(agree * 100) };
}

/* =========================================================================
   7. PLAN DE TRADE CHIFFRÉ
   ========================================================================= */
export function buildPlan(ind, i, custom, struct, sig, profile) {
  const price = ind.c[i];
  const H = sig.horizon, R = sig.riskProfile;
  const atr = ind.atr[i] || price * 0.02;
  const bull = sig.action.startsWith('buy');
  const bear = sig.action.startsWith('sell');

  const maKey = H.maPivot === 20 ? 'sma20' : H.maPivot === 50 ? 'sma50' : 'sma200';
  const ma = ind[maKey][i];

  // --- zone d'entrée
  let entryLow, entryHigh, entryNote;
  if (bull) {
    entryLow = Math.min(Math.max(ma ?? price * 0.97, price - 0.9 * atr), price);
    entryHigh = price * 1.004;
    entryNote = (ma && price > ma * 1.06)
      ? 'Le cours est étiré au-dessus de sa moyenne mobile : privilégier un repli vers la zone basse plutôt qu’un achat au prix courant.'
      : 'Achat possible au prix courant ou sur repli léger dans la zone indiquée.';
  } else if (bear) {
    entryLow = price * 0.996;
    entryHigh = Math.max(price * 1.004, Math.min(price + 0.9 * atr, ma ?? price * 1.03));
    entryNote = 'Zone de sortie ou d’allègement. Vendre dans un rebond technique plutôt que dans la panique.';
  } else {
    entryLow = price - 0.5 * atr; entryHigh = price + 0.5 * atr;
    entryNote = 'Aucune position à ouvrir tant que le signal ne se clarifie pas.';
  }

  // --- stop de protection
  const stLine = ind.supertrend.line[i], stDir = ind.supertrend.dir[i];
  const recentLows = struct.swings.lows.filter(s => s.idx > i - 60 && s.price < price).map(s => s.price);
  const recentHighs = struct.swings.highs.filter(s => s.idx > i - 60 && s.price > price).map(s => s.price);
  // Distance minimale : un stop plus proche que 1,2 × ATR serait touché par le
  // bruit normal de la séance. On perdrait de l'argent tout en ayant raison —
  // et le rapport gain/risque affiché serait flatteur mais mensonger.
  const minDist = 1.2 * atr;
  let stop, stopWhy;
  if (bear) {
    // un niveau structurel plus proche que le plancher de bruit est conservé
    // comme ancrage, mais repoussé jusqu'à ce plancher
    const floorV = price + minDist;
    const cands = [{ v: price + H.atrStop * atr, w: `${H.atrStop} × l’ATR au-dessus du cours` }];
    if (stLine !== null && stDir === -1) cands.push({ v: Math.max(stLine, floorV), w: 'la ligne Supertrend' });
    const hi = Math.min(...recentHighs);
    if (isFinite(hi)) cands.push({ v: Math.max(hi * 1.003, floorV), w: 'le dernier sommet marqué' });
    const best = cands.sort((a, b) => a.v - b.v)[0];
    stop = best.v; stopWhy = best.w;
  } else {
    const floorV = price - minDist;
    const cands = [{ v: price - H.atrStop * atr, w: `${H.atrStop} × l’ATR sous le cours` }];
    if (stLine !== null && stDir === 1) cands.push({ v: Math.min(stLine, floorV), w: 'la ligne Supertrend' });
    const lo = Math.max(...recentLows);
    if (isFinite(lo)) cands.push({ v: Math.min(lo * 0.997, floorV), w: 'le dernier creux marqué' });
    const best = cands.sort((a, b) => b.v - a.v)[0];
    stop = best.v; stopWhy = best.w;
  }
  const riskPerShare = Math.abs(price - stop);

  // --- objectifs
  /* --- objectifs -------------------------------------------------------
     On ne vise pas la résistance la plus proche : un niveau situé à moins
     d'un risque de distance ne justifie pas le trajet, quelle que soit sa
     qualité technique. Pour chaque objectif, on retient le premier vrai
     niveau situé au-delà d'un multiple du risque ; s'il n'en existe aucun
     (cas du titre en territoire vierge, au-dessus de tout son historique),
     on projette sur un multiple du risque.                                */
  const dir = bear ? -1 : 1;
  const minMove = Math.max(price * 0.012, atr);
  const zones = struct.levels
    .filter(z => dir * (z.price - price) >= minMove)
    .sort((a, b) => dir * (a.price - b.price));
  const solides = zones.filter(z => z.touches >= 2);

  const seuils = [1.0, 2.0, 3.2];       // en multiples du risque encaissé
  const projections = [1.8, 3.2, 5.0];
  let precedent = null;
  const targets = seuils.map((seuil, k) => {
    const assezLoin = z => Math.abs(z.price - price) >= seuil * riskPerShare
      && (precedent === null || dir * (z.price - precedent) > 0);
    const z = solides.find(assezLoin) || zones.find(assezLoin);
    const v = z ? z.price : price + dir * projections[k] * riskPerShare;
    precedent = v;
    return {
      label: `Objectif ${k + 1}`, price: v, pct: (v / price - 1) * 100,
      rr: riskPerShare ? Math.abs(v - price) / riskPerShare : null,
      source: z
        ? `niveau technique testé ${z.touches} fois`
        : 'projection sur multiple du risque (aucun niveau technique au-delà)'
    };
  });

  // --- taille de position : le risque encaissé est fixe, la quantité s'adapte
  const capital = Math.max(profile.capital || 0, 0);
  let riskPct = R.riskPerTrade;
  if (custom.vrg.tone === 'choc') riskPct *= 0.5;
  else if (custom.vrg.tone === 'tendu') riskPct *= 0.75;
  if (custom.res.value > 70) riskPct *= 0.8;
  riskPct *= I.clamp(sig.conviction / 70, 0.4, 1.15);

  const riskAmount = capital * riskPct / 100;
  let shares = riskPerShare > 0 ? Math.floor(riskAmount / riskPerShare) : 0;
  let notional = shares * price;
  const maxNotional = capital * R.maxPosition / 100;
  let capped = false;
  if (notional > maxNotional) { shares = Math.floor(maxNotional / price); notional = shares * price; capped = true; }
  if (!bull && !bear) { shares = 0; notional = 0; }

  const rr1 = targets[0].rr;
  return {
    price, entryLow, entryHigh, entryNote,
    stop, stopWhy, stopPct: (stop / price - 1) * 100, riskPerShare,
    targets, rr: rr1, atr, atrPct: 100 * atr / price,
    sizing: {
      riskPct: Math.round(riskPct * 100) / 100, riskAmount, shares, notional,
      notionalPct: capital ? 100 * notional / capital : 0, capped, maxPositionPct: R.maxPosition
    },
    quality: rr1 === null ? null : rr1 >= 2.5 ? 'excellent' : rr1 >= 1.8 ? 'bon' : rr1 >= 1.2 ? 'acceptable' : 'insuffisant',
    actionable: (bull || bear) && rr1 !== null && rr1 >= 1.2 && sig.conviction >= 40
  };
}

/* =========================================================================
   8. INVALIDATIONS ET POINTS DE VIGILANCE
   ========================================================================= */
export function buildWatchlist(ind, i, custom, struct, sig, plan) {
  const c = ind.c[i], out = [];
  const bull = sig.action.startsWith('buy');

  out.push({
    type: 'invalidation',
    text: `Clôture ${bull ? 'sous' : 'au-dessus de'} ${fmtNum(plan.stop)} — le scénario est cassé, on sort sans discuter (stop calé sur ${plan.stopWhy}).`
  });

  if (ind.sma50[i] !== null) {
    const ma = ind.sma50[i];
    out.push({
      type: 'niveau',
      text: `MM50 à ${fmtNum(ma)} (${nf(((ma / c - 1) * 100), 1)} %) — ${c > ma
        ? 'support dynamique : tant qu’elle tient, la tendance moyenne reste intacte.'
        : 'résistance dynamique : la repasser serait le premier signe de retournement.'}`
    });
  }
  if (ind.sma200[i] !== null) {
    out.push({
      type: 'niveau',
      text: `MM200 à ${fmtNum(ind.sma200[i])} (${nf(((ind.sma200[i] / c - 1) * 100), 1)} %) — la frontière entre marché haussier et marché baissier de long terme.`
    });
  }
  if (custom.vrg.squeeze) {
    out.push({
      type: 'alerte',
      text: `Compression de volatilité depuis ${custom.vrg.squeezeBars} séances : un mouvement ample approche. C’est la sortie de compression qui donne la direction — suivre, ne pas anticiper.`
    });
  }
  for (const d of (struct.divergences || []).filter(x => x.kind === 'classique')) {
    out.push({
      type: 'alerte',
      text: `Divergence ${d.type} détectée sur ${d.sources.join(' et ')} : le prix et l’oscillateur racontent deux histoires différentes, le mouvement perd sa force interne. C’est un signal d’essoufflement, pas de retournement immédiat.`
    });
  }
  const r = ind.rsi[i];
  if (r !== null && r > 75) out.push({ type: 'alerte', text: `RSI à ${nf(r, 0)} : zone de surachat. En tendance forte ce n’est pas un signal de vente, mais un avertissement sur la qualité du point d’entrée.` });
  if (r !== null && r < 25) out.push({ type: 'alerte', text: `RSI à ${nf(r, 0)} : zone de survente. Un rebond technique est probable, mais acheter un couteau qui tombe sans signal de retournement reste dangereux.` });

  const spike = ind.volSpike[i];
  if (spike !== null && spike > 2.2) out.push({ type: 'alerte', text: `Volume à ${nf(spike, 1)}× la moyenne : une information forte circule. Vérifier l’actualité avant toute décision.` });

  if (custom.res.value > 70) out.push({ type: 'risque', text: `${custom.res.label} (RES ${custom.res.value}/100) : la taille de position a été réduite automatiquement dans le plan ci-dessus.` });

  return out;
}

/* =========================================================================
   9. NARRATIF — l'analyse rédigée en français
   ========================================================================= */
export function buildNarrative(ind, i, custom, sig, plan, ctx, factors, perf) {
  const c = ind.c[i];
  const name = ctx.name || ctx.symbol;
  const cur = ctx.currency || '';
  const p = [];

  p.push({
    title: 'Où en est le titre',
    text: `${name} cote ${fmtNum(c)} ${cur}. Sur un mois le titre ${signWord(perf.m1)} de ${absPct(perf.m1)}, sur trois mois ${signWord(perf.m3)} de ${absPct(perf.m3)}, et sur un an ${signWord(perf.a1)} de ${absPct(perf.a1)}. ` +
      `Il évolue ${ind.ddSeries[i] < -0.01 ? `${nf((Math.abs(ind.ddSeries[i]) * 100), 1)} % sous son plus haut historique de la période analysée` : 'au contact de ses plus hauts de la période'}. ` +
      (ctx.relative ? `Face à ${ctx.relative.benchName}, il ${ctx.relative.excess3m >= 0 ? 'fait mieux' : 'fait moins bien'} de ${nf(Math.abs(ctx.relative.excess3m), 1)} points sur trois mois.` : '')
  });

  const a = ind.adx.adx[i];
  p.push({
    title: 'La tendance',
    text: `${custom.tqs.label} : le score de qualité de tendance ressort à ${custom.tqs.value}/100. ` +
      (a !== null ? `L’ADX à ${nf(a, 1)} indique ${a > 25 ? 'une vraie tendance directionnelle' : a > 20 ? 'une tendance naissante' : 'un marché sans direction dominante'}. ` : '') +
      (ind.sma200[i] !== null ? `Le cours est ${c > ind.sma200[i] ? 'au-dessus' : 'sous'} sa moyenne mobile 200 séances, ce qui le classe du côté ${c > ind.sma200[i] ? 'haussier' : 'baissier'} du marché de long terme. ` : '') +
      (custom.tqs.value < 45
        ? 'Dans ce contexte, les stratégies de suivi de tendance produisent beaucoup de faux signaux : mieux vaut jouer les bornes de la fourchette ou rester à l’écart.'
        : 'Les stratégies de suivi de tendance sont ici dans leur terrain de jeu naturel.')
  });

  p.push({
    title: 'Momentum et flux de capitaux',
    text: `${custom.mpi.label} (MPI ${fmtSigned(custom.mpi.value)}). ` +
      (ind.rsi[i] !== null ? `Le RSI à ${nf(ind.rsi[i], 1)} ${ind.rsi[i] > 70 ? 'signale un surachat : le mouvement est tendu' : ind.rsi[i] < 30 ? 'signale une survente : la baisse est déjà très avancée' : 'reste en zone neutre'}. ` : '') +
      `Du côté des volumes : ${custom.sfi.label.toLowerCase()} (SFI ${fmtSigned(custom.sfi.value)}). ` +
      (custom.sfi.value > 10 ? 'L’argent entre sur le titre, ce qui valide la hausse.'
        : custom.sfi.value < -10 ? 'L’argent sort du titre, ce qui fragilise toute tentative de rebond.'
          : 'Aucun camp ne prend l’avantage sur les volumes.')
  });

  p.push({
    title: 'Le risque à accepter',
    text: `Régime de volatilité : ${custom.vrg.label.toLowerCase()}. L’ATR représente ${custom.vrg.atrPct === null ? 'n/d' : nf(custom.vrg.atrPct, 2)} % du cours — c’est l’amplitude moyenne d’une séance. ` +
      `Concrètement, la position peut bouger de ${custom.vrg.atrPct === null ? 'n/d' : nf(custom.vrg.atrPct, 1)} % dans la journée sans que cela signifie quoi que ce soit. ` +
      `${custom.res.label} (RES ${custom.res.value}/100). ` +
      (custom.res.var95 !== null ? `Historiquement, une séance sur vingt perd au moins ${nf((Math.abs(custom.res.var95) * 100), 1)} %.` : '')
  });

  const top = [...factors]
    .sort((x, y) => Math.abs(y.score * (sig.horizon.weights[y.key] || 0)) - Math.abs(x.score * (sig.horizon.weights[x.key] || 0)))
    .slice(0, 3);
  p.push({
    title: 'La décision et pourquoi',
    text: `Score global ${fmtSigned(sig.score)}/100, conviction ${sig.conviction} % (${sig.agreement} % des facteurs pointent dans le même sens). ` +
      `Les trois éléments qui pèsent le plus : ${top.map(f => `${f.label.toLowerCase()} (${fmtSigned(f.score)})`).join(', ')}. ` +
      (sig.action === 'hold'
        ? 'Aucun avantage statistique clair ne se dégage : le bon geste est de ne rien faire et d’attendre que le marché tranche. Ne pas agir est une décision, pas une absence de décision.'
        : plan.actionable
          ? `Le plan proposé offre un rapport gain/risque de ${plan.rr === null ? 'n/d' : nf(plan.rr, 1)} pour 1 sur le premier objectif, ce qui est ${plan.quality}.`
          : `Attention : le signal est ${sig.label.toLowerCase()}, mais le rapport gain/risque (${plan.rr === null ? 'n/d' : nf(plan.rr, 1)}) est insuffisant à ce niveau de prix. Attendre un meilleur point d’entrée vaut mieux que forcer le trade.`)
  });

  return p;
}

function signWord(x) { return x === null ? 'n’a pas bougé' : x >= 0 ? 'progresse' : 'recule'; }
function absPct(x) { return x === null ? 'n/d' : nf(Math.abs(x), 1) + ' %'; }

/* =========================================================================
   10. ANALYSE À UN INDICE — le cœur réutilisé par le backtest
   ========================================================================= */
/**
 * @param opts.scoreOnly  ne calcule ni les zones de prix ni le plan de trade.
 *   Utile aux boucles qui n'ont besoin que du score : le travail est divise
 *   par trois, pour un score strictement identique.
 */
export function analyzeAt(ind, i, profile, ctx = {}, opts = {}) {
  const custom = customIndicators(ind, i);
  const struct = structureAt(ind, i, 220, { niveaux: !opts.scoreOnly });
  const factors = buildFactors(ind, i, custom, struct, ctx);
  const signal = scoreAndSignal(factors, profile, custom);
  if (opts.scoreOnly) return { custom, struct, factors, signal, plan: null };
  const plan = buildPlan(ind, i, custom, struct, signal, profile);
  return { custom, struct, factors, signal, plan };
}

/* =========================================================================
   11. POINT D'ENTRÉE PRINCIPAL
   ========================================================================= */
export function analyze({ data, benchmark, fundamentals, profile }) {
  const prof = { ...DEFAULT_PROFILE, ...(profile || {}) };
  const ind = computeIndicators(data.series);
  const i = ind.n - 1;

  const perf = {
    j1: pctChangeAt(ind.c, i, 1), j5: pctChangeAt(ind.c, i, 5), m1: pctChangeAt(ind.c, i, 21),
    m3: pctChangeAt(ind.c, i, 63), m6: pctChangeAt(ind.c, i, 126), a1: pctChangeAt(ind.c, i, 252),
    ytd: ytdChange(ind.t, ind.c)
  };
  ind.perf = perf;

  const ctx = {
    symbol: data.symbol, name: data.name, currency: data.currency,
    exchange: data.exchange, type: data.type, fundamentals,
    week52: (data.fiftyTwoWeekHigh && data.fiftyTwoWeekLow) ? {
      high: data.fiftyTwoWeekHigh, low: data.fiftyTwoWeekLow,
      fromHigh: (ind.c[i] / data.fiftyTwoWeekHigh - 1) * 100,
      fromLow: (ind.c[i] / data.fiftyTwoWeekLow - 1) * 100
    } : null
  };

  if (benchmark?.series?.c?.length > 60) {
    const bc = benchmark.series.c, bi = bc.length - 1;
    const aligned = alignByTime(data.series.t, data.series.c, benchmark.series.t, bc);
    ctx.relative = {
      benchName: benchmark.name || benchmark.symbol,
      excess1m: (perf.m1 ?? 0) - (pctChangeAt(bc, bi, 21) ?? 0),
      excess3m: (perf.m3 ?? 0) - (pctChangeAt(bc, bi, 63) ?? 0),
      excess1y: (perf.a1 ?? 0) - (pctChangeAt(bc, bi, 252) ?? 0),
      beta: I.beta(aligned.a, aligned.b),
      correlation: I.correlation(aligned.a, aligned.b)
    };
  }

  const { custom, struct, factors, signal, plan } = analyzeAt(ind, i, prof, ctx);
  const watch = buildWatchlist(ind, i, custom, struct, signal, plan);
  const narrative = buildNarrative(ind, i, custom, signal, plan, ctx, factors, perf);

  const rets = winClean(ind.returns, i, 252);
  const mdd = I.maxDrawdown(ind.c);
  const stats = {
    volAnn: (I.stdev(rets, true) ?? 0) * Math.sqrt(252) * 100,
    sharpe: I.sharpe(rets), sortino: I.sortino(rets),
    var95: I.historicalVaR(rets, 0.95), cvar95: I.cvar(rets, 0.95),
    skew: I.skewness(rets), kurtosis: I.kurtosis(rets),
    maxDD: mdd.maxDrawdown * 100, currentDD: ind.ddSeries[i] * 100,
    hurst: ind.hurstSeries[i],
    positiveDays: rets.length ? rets.filter(x => x > 0).length / rets.length * 100 : null
  };

  // --- contexte elargi : ce que le score seul ne dit pas
  const mtf = higherTimeframe(data.series, data.interval || periodInterval(prof));
  const ana = analogues(ind, i);
  const saison = saisonnalite(ind);
  const scen = scenarios(ind, i);

  return {
    ind, custom, struct, ctx, factors, signal, plan, watch, narrative, stats, perf,
    mtf, analogues: ana, saison, scenarios: scen,
    profile: prof, meta: data
  };
}

/** granularite de la serie, deduite de l'ecart median entre deux barres */
function periodInterval(_prof) { return '1d'; }

function ytdChange(t, c) {
  const now = new Date(t[t.length - 1]);
  const jan = new Date(now.getFullYear(), 0, 1).getTime();
  const idx = t.findIndex(x => x >= jan);
  if (idx <= 0) return null;
  return 100 * (c[c.length - 1] / c[idx - 1] - 1);
}

function alignByTime(t1, c1, t2, c2) {
  const map = new Map();
  for (let i = 0; i < t2.length; i++) map.set(dayKey(t2[i]), c2[i]);
  const a = [], b = [];
  let pa = null, pb = null;
  for (let i = 0; i < t1.length; i++) {
    const m = map.get(dayKey(t1[i]));
    if (m === undefined) continue;
    if (pa !== null) { a.push(c1[i] / pa - 1); b.push(m / pb - 1); }
    pa = c1[i]; pb = m;
  }
  return { a, b };
}
function dayKey(ms) { const d = new Date(ms); return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`; }


/* =========================================================================
   13. CONTEXTE ÉLARGI
   Quatre lectures que le score seul ne donne pas : l'unité de temps
   supérieure, les configurations passées comparables, la saisonnalité et
   la fourchette de prix probable à un mois.
   ========================================================================= */

/** Agrège les barres en mois calendaires. */
export function toMonthly(series) {
  return groupBy(series, ms => {
    const d = new Date(ms);
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
  });
}

/** Agrège les séances en semaines (lundi → vendredi). */
export function toWeekly(series) {
  return groupBy(series, ms => {
    const d = new Date(ms);
    const day = (d.getUTCDay() + 6) % 7;                 // lundi = 0
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day);
  });
}

function groupBy(series, cle) {
  const out = { t: [], o: [], h: [], l: [], c: [], v: [] };
  let cur = null, key = null;
  const push = c => { out.t.push(c.t); out.o.push(c.o); out.h.push(c.h); out.l.push(c.l); out.c.push(c.c); out.v.push(c.v); };
  for (let i = 0; i < series.c.length; i++) {
    const k = cle(series.t[i]);
    if (k !== key) {
      if (cur) push(cur);
      cur = { t: k, o: series.o[i], h: series.h[i], l: series.l[i], c: series.c[i], v: series.v[i] };
      key = k;
    } else {
      cur.h = Math.max(cur.h, series.h[i]);
      cur.l = Math.min(cur.l, series.l[i]);
      cur.c = series.c[i];
      cur.v += series.v[i];
    }
  }
  if (cur) push(cur);
  return out;
}

/**
 * Lecture de l'unité de temps supérieure.
 * Une position prise contre la tendance hebdomadaire a un taux de réussite
 * nettement plus faible : c'est l'un des filtres les plus rentables qui soit,
 * et il ne coûte rien à appliquer.
 */
/**
 * @param interval  granularite des barres fournies ('1d', '1wk'...). Sur des
 *   barres deja hebdomadaires, regrouper par semaine redonnerait exactement
 *   la meme serie : l'unite superieure devient alors le MOIS. Sans ce test,
 *   la carte affirmerait confirmer le signal avec les memes donnees que lui.
 */
export function higherTimeframe(series, interval = '1d') {
  const hebdo = /wk|mo/i.test(interval || '');
  const w = hebdo ? toMonthly(series) : toWeekly(series);
  const echelle = hebdo ? 'mensuelle' : 'hebdomadaire';
  const n = w.c.length;
  if (n < 40) return null;
  const i = n - 1;
  const sma10 = I.sma(w.c, 10), sma30 = I.sma(w.c, 30);
  const rsi = I.rsi(w.c, 14);
  const macd = I.macd(w.c, 12, 26, 9);
  const pente = I.linreg(w.c.slice(Math.max(0, n - 12)), Math.min(12, n));

  const surMoyenne = sma30[i] !== null && w.c[i] > sma30[i];
  const empilement = (sma10[i] !== null && sma30[i] !== null) ? sma10[i] > sma30[i] : null;
  const momentumOk = macd.hist[i] !== null && macd.hist[i] > 0;

  let score = 0;
  if (surMoyenne) score += 2; else score -= 2;
  if (empilement === true) score += 1; else if (empilement === false) score -= 1;
  if (momentumOk) score += 1; else score -= 1;
  if (pente.angle > 0.15) score += 1; else if (pente.angle < -0.15) score -= 1;

  const sens = score >= 2 ? 1 : score <= -2 ? -1 : 0;
  const u = hebdo ? 'mois' : 'sem.';
  return {
    periodes: n, sens, echelle,
    label: sens === 1 ? `Tendance ${echelle} haussière`
      : sens === -1 ? `Tendance ${echelle} baissière` : `Tendance ${echelle} indécise`,
    close: w.c[i], sma10: sma10[i], sma30: sma30[i], rsi: rsi[i],
    macdHist: macd.hist[i], pente: pente.angle,
    detail: `Clôture ${fmtNum(w.c[i])} · MM10 ${u} ${fmtNum(sma10[i])} · MM30 ${u} ${fmtNum(sma30[i])} · RSI ${nf(rsi[i], 0)}`
  };
}

/**
 * Configurations analogues : on résume l'état du jour en quatre critères
 * grossiers mais robustes, on retrouve toutes les séances passées qui
 * partageaient exactement le même état, et on regarde ce qui s'est passé
 * ensuite. C'est une base de comparaison, pas une prévision.
 */
export function analogues(ind, i, horizons = [21, 63]) {
  const empreinte = j => {
    const c = ind.c[j], s200 = ind.sma200[j], r = ind.rsi[j], pb = ind.bb.percentB[j], ap = ind.atrPct[j];
    if (s200 === null || r === null || pb === null || ap === null) return null;
    const vol = winClean(ind.atrPct, j, 250);
    if (vol.length < 60) return null;
    const rangVol = I.pctRank(vol, ap);
    // Trois axes seulement, volontairement grossiers : plus on affine, moins
    // il reste d'occurrences comparables, et un echantillon de trois cas ne
    // vaut rien. Le regime de volatilite est decrit mais ne sert pas a filtrer.
    return [
      c > s200 ? 'H' : 'B',                                  // au-dessus / sous la MM200
      r < 40 ? '1' : r < 60 ? '2' : '3',                     // bande de RSI
      pb < 0.25 ? 'b' : pb > 0.75 ? 'h' : 'm'                // position dans les bandes
    ].join('') + '|' + (rangVol < 0.5 ? 'c' : 't');
  };

  const cible = empreinte(i);
  if (!cible) return null;

  const res = { signature: cible, horizons: {}, total: 0 };
  const maxH = Math.max(...horizons);
  const dates = [];
  for (const h of horizons) res.horizons[h] = [];

  for (let j = 210; j <= i - maxH; j++) {
    if (empreinte(j) !== cible) continue;
    // on évite de compter dix fois la même période : un point tous les 5 jours
    if (dates.length && j - dates[dates.length - 1] < 4) continue;
    dates.push(j);
    for (const h of horizons) res.horizons[h].push(100 * (ind.c[j + h] / ind.c[j] - 1));
  }
  res.total = dates.length;
  if (res.total < 5) return { signature: cible, total: res.total, insuffisant: true, libelle: decrireEmpreinte(cible) };

  for (const h of horizons) {
    const v = res.horizons[h];
    res.horizons[h] = {
      n: v.length, moyenne: I.mean(v), mediane: I.median(v),
      positif: 100 * v.filter(x => x > 0).length / v.length,
      p20: I.percentile(v, 0.2), p80: I.percentile(v, 0.8),
      pire: Math.min(...v), meilleur: Math.max(...v)
    };
  }
  res.libelle = decrireEmpreinte(cible);
  return res;
}

function decrireEmpreinte(sig) {
  const [etat, vol] = sig.split('|');
  const [regime, rsiB, pos] = etat.split('');
  const a = regime === 'H' ? 'au-dessus de sa MM200' : 'sous sa MM200';
  const b = { '1': 'RSI bas', '2': 'RSI neutre', '3': 'RSI haut' }[rsiB];
  const c = { b: 'en bas des bandes de Bollinger', m: 'au milieu des bandes', h: 'en haut des bandes' }[pos];
  const d = vol === 'c' ? 'volatilité contenue' : 'volatilité élevée';
  return `${a}, ${b}, ${c}, ${d}`;
}

/** Saisonnalité : rendement moyen par mois calendaire sur l'historique disponible. */
export function saisonnalite(ind) {
  const mois = Array.from({ length: 12 }, () => []);
  let moisCourant = null, debut = null;
  for (let i = 0; i < ind.n; i++) {
    const d = new Date(ind.t[i]), m = d.getMonth();
    if (moisCourant === null) { moisCourant = m; debut = i; continue; }
    if (m !== moisCourant) {
      if (ind.c[debut] > 0) mois[moisCourant].push(100 * (ind.c[i - 1] / ind.c[debut] - 1));
      moisCourant = m; debut = i;
    }
  }
  // le dernier mois de la serie doit etre compte lui aussi
  if (moisCourant !== null && debut !== null && debut < ind.n - 1 && ind.c[debut] > 0) {
    mois[moisCourant].push(100 * (ind.c[ind.n - 1] / ind.c[debut] - 1));
  }
  const noms = ['janv.', 'févr.', 'mars', 'avril', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const out = mois.map((v, k) => ({
    mois: k, nom: noms[k], n: v.length,
    moyenne: v.length ? I.mean(v) : null,
    positif: v.length ? 100 * v.filter(x => x > 0).length / v.length : null
  }));
  const valides = out.filter(x => x.n >= 3);
  return {
    mois: out,
    fiable: valides.length >= 10 && Math.min(...valides.map(x => x.n)) >= 4,
    anneesCouvertes: Math.round(ind.n / 252 * 10) / 10
  };
}

/**
 * Fourchette probable à un mois, déduite de la distribution historique des
 * rendements à 21 séances de CE titre — pas d'une loi normale théorique,
 * qui sous-estime systématiquement les extrêmes.
 */
export function scenarios(ind, i, horizon = 21) {
  const prix = ind.c[i];
  const ret = [];
  for (let j = 210; j <= i - horizon; j++) ret.push(ind.c[j + horizon] / ind.c[j] - 1);
  if (ret.length < 40) return null;
  const q = p => prix * (1 + I.percentile(ret, p));
  return {
    horizon,
    tresBas: q(0.05), bas: q(0.25), median: q(0.5), haut: q(0.75), tresHaut: q(0.95),
    n: ret.length,
    baisseProbable: 100 * ret.filter(x => x < 0).length / ret.length
  };
}

/* =========================================================================
   12. VERSION ALLÉGÉE POUR LE SCREENER
   ========================================================================= */
export function quickScore(data, profile, benchPerf) {
  try {
    const ind = computeIndicators(data.series);
    const i = ind.n - 1;
    if (ind.n < 80) return null;
    const perf = {
      j1: pctChangeAt(ind.c, i, 1), j5: pctChangeAt(ind.c, i, 5), m1: pctChangeAt(ind.c, i, 21),
      m3: pctChangeAt(ind.c, i, 63), m6: pctChangeAt(ind.c, i, 126), a1: pctChangeAt(ind.c, i, 252),
      ytd: ytdChange(ind.t, ind.c)
    };
    ind.perf = perf;
    const ctx = {
      symbol: data.symbol, name: data.name, currency: data.currency,
      week52: (data.fiftyTwoWeekHigh && data.fiftyTwoWeekLow) ? {
        high: data.fiftyTwoWeekHigh, low: data.fiftyTwoWeekLow,
        fromHigh: (ind.c[i] / data.fiftyTwoWeekHigh - 1) * 100,
        fromLow: (ind.c[i] / data.fiftyTwoWeekLow - 1) * 100
      } : null
    };
    if (benchPerf) {
      ctx.relative = {
        benchName: benchPerf.name,
        excess1m: (perf.m1 ?? 0) - (benchPerf.m1 ?? 0),
        excess3m: (perf.m3 ?? 0) - (benchPerf.m3 ?? 0),
        excess1y: (perf.a1 ?? 0) - (benchPerf.a1 ?? 0),
        beta: null
      };
    }
    const { custom, factors, signal, plan } = analyzeAt(ind, i, profile, ctx);
    return {
      symbol: data.symbol, name: data.name, currency: data.currency,
      price: ind.c[i], perf, custom, signal, plan, ind, factors,
      relative: ctx.relative || null, week52: ctx.week52
    };
  } catch { return null; }
}
