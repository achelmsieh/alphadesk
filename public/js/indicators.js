/* =========================================================================
   AlphaDesk — bibliothèque d'indicateurs techniques
   Tout est calculé ici, en clair, à partir des séries OHLCV brutes.
   Convention : chaque fonction renvoie un tableau de même longueur que
   l'entrée, rempli de `null` tant que l'indicateur n'a pas assez d'historique.
   ========================================================================= */

/* ----------------------------- aides de base ---------------------------- */
export const nz = (v, d = null) => (v === null || v === undefined || !isFinite(v)) ? d : v;
export const last = a => (a && a.length ? a[a.length - 1] : null);
export const prev = (a, n = 1) => (a && a.length > n ? a[a.length - 1 - n] : null);

export function sum(arr) { let s = 0; for (const x of arr) s += x; return s; }
export function mean(arr) { return arr.length ? sum(arr) / arr.length : null; }
export function stdev(arr, sample = false) {
  if (arr.length < 2) return null;
  const m = mean(arr);
  const v = sum(arr.map(x => (x - m) ** 2)) / (arr.length - (sample ? 1 : 0));
  return Math.sqrt(v);
}
export function median(arr) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b), h = Math.floor(s.length / 2);
  return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2;
}
export function percentile(arr, p) {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}
/** rang du dernier point dans sa propre distribution (0 → 1) */
export function pctRank(arr, value) {
  const clean = arr.filter(x => x !== null && isFinite(x));
  if (!clean.length) return null;
  return clean.filter(x => x <= value).length / clean.length;
}
export function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
/** normalise une valeur d'un intervalle vers [-1, 1] */
export function scale(x, lo, hi) {
  if (x === null || !isFinite(x)) return 0;
  return clamp((x - lo) / (hi - lo), 0, 1) * 2 - 1;
}

/* -------------------------------- moyennes ------------------------------ */
export function sma(src, p) {
  const out = new Array(src.length).fill(null);
  let acc = 0;
  for (let i = 0; i < src.length; i++) {
    acc += src[i];
    if (i >= p) acc -= src[i - p];
    if (i >= p - 1) out[i] = acc / p;
  }
  return out;
}

export function ema(src, p) {
  const out = new Array(src.length).fill(null);
  if (src.length < p) return out;
  const k = 2 / (p + 1);
  let e = mean(src.slice(0, p));
  out[p - 1] = e;
  for (let i = p; i < src.length; i++) { e = src[i] * k + e * (1 - k); out[i] = e; }
  return out;
}

/** moyenne lissée de Wilder — celle utilisée par le RSI et l'ATR d'origine */
export function rma(src, p) {
  const out = new Array(src.length).fill(null);
  if (src.length < p) return out;
  let e = mean(src.slice(0, p));
  out[p - 1] = e;
  for (let i = p; i < src.length; i++) { e = (e * (p - 1) + src[i]) / p; out[i] = e; }
  return out;
}

export function wma(src, p) {
  const out = new Array(src.length).fill(null);
  const denom = p * (p + 1) / 2;
  for (let i = p - 1; i < src.length; i++) {
    let acc = 0;
    for (let j = 0; j < p; j++) acc += src[i - j] * (p - j);
    out[i] = acc / denom;
  }
  return out;
}

/** Hull MA — très réactive, peu de retard */
export function hma(src, p) {
  const half = wma(src, Math.max(1, Math.round(p / 2)));
  const full = wma(src, p);
  const raw = src.map((_, i) => (half[i] === null || full[i] === null) ? null : 2 * half[i] - full[i]);
  const filled = raw.map(x => x === null ? 0 : x);
  const h = wma(filled, Math.max(1, Math.round(Math.sqrt(p))));
  return raw.map((x, i) => x === null ? null : h[i]);
}

export function dema(src, p) {
  const e1 = ema(src, p);
  const e2 = ema(e1.map(x => x ?? src[0]), p);
  return src.map((_, i) => (e1[i] === null || e2[i] === null) ? null : 2 * e1[i] - e2[i]);
}

/* -------------------------- tendance / direction ------------------------ */
export function macd(close, fast = 12, slow = 26, signal = 9) {
  const ef = ema(close, fast), es = ema(close, slow);
  const line = close.map((_, i) => (ef[i] === null || es[i] === null) ? null : ef[i] - es[i]);
  const firstIdx = line.findIndex(x => x !== null);
  const compact = firstIdx < 0 ? [] : line.slice(firstIdx);
  const sig = ema(compact, signal);
  const signalArr = new Array(close.length).fill(null);
  sig.forEach((v, i) => { if (v !== null) signalArr[firstIdx + i] = v; });
  const hist = line.map((v, i) => (v === null || signalArr[i] === null) ? null : v - signalArr[i]);
  return { line, signal: signalArr, hist };
}

export function rsi(close, p = 14) {
  const gains = [0], losses = [0];
  for (let i = 1; i < close.length; i++) {
    const d = close[i] - close[i - 1];
    gains.push(Math.max(d, 0)); losses.push(Math.max(-d, 0));
  }
  const ag = rma(gains.slice(1), p), al = rma(losses.slice(1), p);
  const out = new Array(close.length).fill(null);
  for (let i = 0; i < ag.length; i++) {
    if (ag[i] === null) continue;
    const rs = al[i] === 0 ? 100 : ag[i] / al[i];
    out[i + 1] = al[i] === 0 ? 100 : 100 - 100 / (1 + rs);
  }
  return out;
}

export function trueRange(h, l, c) {
  const out = [h[0] - l[0]];
  for (let i = 1; i < c.length; i++) {
    out.push(Math.max(h[i] - l[i], Math.abs(h[i] - c[i - 1]), Math.abs(l[i] - c[i - 1])));
  }
  return out;
}

export function atr(h, l, c, p = 14) { return rma(trueRange(h, l, c), p); }

/** ADX + DI : force de la tendance (ADX) et son sens (DI+ / DI-) */
export function adx(h, l, c, p = 14) {
  const n = c.length;
  const plusDM = [0], minusDM = [0], tr = trueRange(h, l, c);
  for (let i = 1; i < n; i++) {
    const up = h[i] - h[i - 1], down = l[i - 1] - l[i];
    plusDM.push(up > down && up > 0 ? up : 0);
    minusDM.push(down > up && down > 0 ? down : 0);
  }
  const atrS = rma(tr, p), pS = rma(plusDM, p), mS = rma(minusDM, p);
  const pdi = new Array(n).fill(null), mdi = new Array(n).fill(null), dx = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (atrS[i] === null || atrS[i] === 0) continue;
    pdi[i] = 100 * pS[i] / atrS[i];
    mdi[i] = 100 * mS[i] / atrS[i];
    const s = pdi[i] + mdi[i];
    dx[i] = s === 0 ? 0 : 100 * Math.abs(pdi[i] - mdi[i]) / s;
  }
  const firstIdx = dx.findIndex(x => x !== null);
  const adxArr = new Array(n).fill(null);
  if (firstIdx >= 0) {
    const sm = rma(dx.slice(firstIdx), p);
    sm.forEach((v, i) => { if (v !== null) adxArr[firstIdx + i] = v; });
  }
  return { adx: adxArr, pdi, mdi };
}

/** Supertrend — suiveur de tendance basé ATR, donne un stop dynamique */
export function supertrend(h, l, c, p = 10, mult = 3) {
  const a = atr(h, l, c, p);
  const n = c.length;
  const line = new Array(n).fill(null), dir = new Array(n).fill(null);
  let upper = null, lower = null, trend = 1;
  for (let i = 0; i < n; i++) {
    if (a[i] === null) continue;
    const mid = (h[i] + l[i]) / 2;
    let ub = mid + mult * a[i], lb = mid - mult * a[i];
    if (upper !== null) {
      ub = (ub < upper || c[i - 1] > upper) ? ub : upper;
      lb = (lb > lower || c[i - 1] < lower) ? lb : lower;
      trend = (trend === 1 && c[i] < lower) ? -1 : (trend === -1 && c[i] > upper) ? 1 : trend;
    }
    upper = ub; lower = lb;
    line[i] = trend === 1 ? lb : ub;
    dir[i] = trend;
  }
  return { line, dir };
}

/** Parabolic SAR — points de retournement / trailing stop */
export function psar(h, l, step = 0.02, maxStep = 0.2) {
  const n = h.length, out = new Array(n).fill(null);
  if (n < 2) return out;
  let bull = true, af = step, ep = h[0], sar = l[0];
  for (let i = 1; i < n; i++) {
    sar = sar + af * (ep - sar);
    if (bull) {
      sar = Math.min(sar, l[i - 1], i > 1 ? l[i - 2] : l[i - 1]);
      if (h[i] > ep) { ep = h[i]; af = Math.min(af + step, maxStep); }
      if (l[i] < sar) { bull = false; sar = ep; ep = l[i]; af = step; }
    } else {
      sar = Math.max(sar, h[i - 1], i > 1 ? h[i - 2] : h[i - 1]);
      if (l[i] < ep) { ep = l[i]; af = Math.min(af + step, maxStep); }
      if (h[i] > sar) { bull = true; sar = ep; ep = h[i]; af = step; }
    }
    out[i] = sar;
  }
  return out;
}

export function ichimoku(h, l, c, conv = 9, base = 26, spanB = 52, disp = 26) {
  const mid = (per) => h.map((_, i) => {
    if (i < per - 1) return null;
    let hi = -Infinity, lo = Infinity;
    for (let j = i - per + 1; j <= i; j++) { hi = Math.max(hi, h[j]); lo = Math.min(lo, l[j]); }
    return (hi + lo) / 2;
  });
  const tenkan = mid(conv), kijun = mid(base), sb = mid(spanB);
  const senkouA = tenkan.map((t, i) => (t === null || kijun[i] === null) ? null : (t + kijun[i]) / 2);
  return { tenkan, kijun, senkouA, senkouB: sb, chikou: c, disp };
}

/** Aroon — depuis combien de temps date le plus haut / plus bas */
export function aroon(h, l, p = 25) {
  const n = h.length, up = new Array(n).fill(null), dn = new Array(n).fill(null);
  for (let i = p; i < n; i++) {
    let hi = -Infinity, lo = Infinity, hIdx = i, lIdx = i;
    for (let j = i - p; j <= i; j++) {
      if (h[j] >= hi) { hi = h[j]; hIdx = j; }
      if (l[j] <= lo) { lo = l[j]; lIdx = j; }
    }
    up[i] = 100 * (p - (i - hIdx)) / p;
    dn[i] = 100 * (p - (i - lIdx)) / p;
  }
  return { up, down: dn, osc: up.map((u, i) => (u === null ? null : u - dn[i])) };
}

/* ------------------------------- momentum ------------------------------- */
export function stochastic(h, l, c, kP = 14, kSmooth = 3, dP = 3) {
  const n = c.length, raw = new Array(n).fill(null);
  for (let i = kP - 1; i < n; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - kP + 1; j <= i; j++) { hi = Math.max(hi, h[j]); lo = Math.min(lo, l[j]); }
    raw[i] = hi === lo ? 50 : 100 * (c[i] - lo) / (hi - lo);
  }
  const filled = raw.map(x => x ?? 50);
  const k = sma(filled, kSmooth).map((v, i) => raw[i] === null ? null : v);
  const d = sma(k.map(x => x ?? 50), dP).map((v, i) => k[i] === null ? null : v);
  return { k, d, raw };
}

export function stochRSI(close, rsiP = 14, stochP = 14, kS = 3, dS = 3) {
  const r = rsi(close, rsiP);
  const n = close.length, raw = new Array(n).fill(null);
  for (let i = 0; i < n; i++) {
    if (i < rsiP + stochP) continue;
    const w = r.slice(i - stochP + 1, i + 1).filter(x => x !== null);
    if (w.length < stochP) continue;
    const hi = Math.max(...w), lo = Math.min(...w);
    raw[i] = hi === lo ? 50 : 100 * (r[i] - lo) / (hi - lo);
  }
  const k = sma(raw.map(x => x ?? 50), kS).map((v, i) => raw[i] === null ? null : v);
  const d = sma(k.map(x => x ?? 50), dS).map((v, i) => k[i] === null ? null : v);
  return { k, d };
}

export function cci(h, l, c, p = 20) {
  const tp = c.map((_, i) => (h[i] + l[i] + c[i]) / 3);
  const m = sma(tp, p), n = c.length, out = new Array(n).fill(null);
  for (let i = p - 1; i < n; i++) {
    const w = tp.slice(i - p + 1, i + 1);
    const md = mean(w.map(x => Math.abs(x - m[i])));
    out[i] = md === 0 ? 0 : (tp[i] - m[i]) / (0.015 * md);
  }
  return out;
}

export function williamsR(h, l, c, p = 14) {
  const n = c.length, out = new Array(n).fill(null);
  for (let i = p - 1; i < n; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - p + 1; j <= i; j++) { hi = Math.max(hi, h[j]); lo = Math.min(lo, l[j]); }
    out[i] = hi === lo ? -50 : -100 * (hi - c[i]) / (hi - lo);
  }
  return out;
}

export function roc(src, p = 12) {
  return src.map((v, i) => (i < p || src[i - p] === 0) ? null : 100 * (v - src[i - p]) / src[i - p]);
}

export function momentum(src, p = 10) {
  return src.map((v, i) => i < p ? null : v - src[i - p]);
}

/** True Strength Index — momentum doublement lissé, peu de bruit */
export function tsi(close, long = 25, short = 13, sig = 13) {
  const d = close.map((v, i) => i === 0 ? 0 : v - close[i - 1]);
  const e1 = ema(d, long), e2 = ema(e1.map(x => x ?? 0), short);
  const a1 = ema(d.map(Math.abs), long), a2 = ema(a1.map(x => x ?? 0), short);
  const line = close.map((_, i) => (e2[i] === null || a2[i] === null || a2[i] === 0) ? null : 100 * e2[i] / a2[i]);
  const signal = ema(line.map(x => x ?? 0), sig).map((v, i) => line[i] === null ? null : v);
  return { line, signal };
}

/* ------------------------------ volatilité ------------------------------ */
export function bollinger(close, p = 20, mult = 2) {
  const mid = sma(close, p), n = close.length;
  const up = new Array(n).fill(null), lo = new Array(n).fill(null),
    pb = new Array(n).fill(null), bw = new Array(n).fill(null);
  for (let i = p - 1; i < n; i++) {
    const sd = stdev(close.slice(i - p + 1, i + 1));
    up[i] = mid[i] + mult * sd; lo[i] = mid[i] - mult * sd;
    pb[i] = up[i] === lo[i] ? 0.5 : (close[i] - lo[i]) / (up[i] - lo[i]);
    bw[i] = mid[i] === 0 ? null : 100 * (up[i] - lo[i]) / mid[i];
  }
  return { mid, upper: up, lower: lo, percentB: pb, bandwidth: bw };
}

export function keltner(h, l, c, p = 20, mult = 2, atrP = 10) {
  const mid = ema(c, p), a = atr(h, l, c, atrP);
  return {
    mid,
    upper: mid.map((m, i) => (m === null || a[i] === null) ? null : m + mult * a[i]),
    lower: mid.map((m, i) => (m === null || a[i] === null) ? null : m - mult * a[i])
  };
}

export function donchian(h, l, p = 20) {
  const n = h.length, up = new Array(n).fill(null), dn = new Array(n).fill(null);
  for (let i = p - 1; i < n; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - p + 1; j <= i; j++) { hi = Math.max(hi, h[j]); lo = Math.min(lo, l[j]); }
    up[i] = hi; dn[i] = lo;
  }
  return { upper: up, lower: dn, mid: up.map((u, i) => u === null ? null : (u + dn[i]) / 2) };
}

/** volatilité historique annualisée, en % */
export function histVol(close, p = 20, periodsPerYear = 252) {
  const r = logReturns(close), n = close.length, out = new Array(n).fill(null);
  for (let i = p; i < n; i++) {
    const sd = stdev(r.slice(i - p + 1, i + 1).filter(x => x !== null), true);
    if (sd !== null) out[i] = sd * Math.sqrt(periodsPerYear) * 100;
  }
  return out;
}

/** compression de volatilité : bandes de Bollinger à l'intérieur des Keltner */
export function squeeze(h, l, c, bbP = 20, bbM = 2, kcP = 20, kcM = 1.5) {
  const bb = bollinger(c, bbP, bbM), kc = keltner(h, l, c, kcP, kcM, kcP);
  return c.map((_, i) => {
    if (bb.upper[i] === null || kc.upper[i] === null) return null;
    return bb.upper[i] < kc.upper[i] && bb.lower[i] > kc.lower[i];
  });
}

/* -------------------------------- volume -------------------------------- */
export function obv(c, v) {
  const out = [0];
  for (let i = 1; i < c.length; i++) {
    out.push(out[i - 1] + (c[i] > c[i - 1] ? v[i] : c[i] < c[i - 1] ? -v[i] : 0));
  }
  return out;
}

/** Chaikin Money Flow — pression acheteuse nette sur p séances */
export function cmf(h, l, c, v, p = 20) {
  const mfv = c.map((_, i) => {
    const rng = h[i] - l[i];
    return rng === 0 ? 0 : ((c[i] - l[i]) - (h[i] - c[i])) / rng * v[i];
  });
  const n = c.length, out = new Array(n).fill(null);
  for (let i = p - 1; i < n; i++) {
    const vs = sum(v.slice(i - p + 1, i + 1));
    out[i] = vs === 0 ? 0 : sum(mfv.slice(i - p + 1, i + 1)) / vs;
  }
  return out;
}

/** Money Flow Index — le « RSI du volume » */
export function mfi(h, l, c, v, p = 14) {
  const tp = c.map((_, i) => (h[i] + l[i] + c[i]) / 3);
  const n = c.length, out = new Array(n).fill(null);
  for (let i = p; i < n; i++) {
    let pos = 0, neg = 0;
    for (let j = i - p + 1; j <= i; j++) {
      const f = tp[j] * v[j];
      if (tp[j] > tp[j - 1]) pos += f; else if (tp[j] < tp[j - 1]) neg += f;
    }
    out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
  }
  return out;
}

export function forceIndex(c, v, p = 13) {
  const raw = c.map((x, i) => i === 0 ? 0 : (x - c[i - 1]) * v[i]);
  return ema(raw, p);
}

/** ligne d'accumulation / distribution */
export function adLine(h, l, c, v) {
  const out = [];
  let acc = 0;
  for (let i = 0; i < c.length; i++) {
    const rng = h[i] - l[i];
    acc += rng === 0 ? 0 : ((c[i] - l[i]) - (h[i] - c[i])) / rng * v[i];
    out.push(acc);
  }
  return out;
}

/** VWAP glissant sur p séances (approximation quotidienne) */
export function vwap(h, l, c, v, p = 20) {
  const tp = c.map((_, i) => (h[i] + l[i] + c[i]) / 3);
  const n = c.length, out = new Array(n).fill(null);
  for (let i = p - 1; i < n; i++) {
    const vs = sum(v.slice(i - p + 1, i + 1));
    out[i] = vs === 0 ? c[i] : sum(tp.slice(i - p + 1, i + 1).map((x, j) => x * v[i - p + 1 + j])) / vs;
  }
  return out;
}

/** VWAP ancré à un index donné (ex. le plus bas de l'année) */
export function anchoredVwap(h, l, c, v, startIdx) {
  const out = new Array(c.length).fill(null);
  let pv = 0, vv = 0;
  for (let i = startIdx; i < c.length; i++) {
    const tp = (h[i] + l[i] + c[i]) / 3;
    pv += tp * v[i]; vv += v[i];
    out[i] = vv === 0 ? tp : pv / vv;
  }
  return out;
}

/* ----------------------- statistiques de rendement ---------------------- */
export function returns(close) { return close.map((v, i) => i === 0 ? null : (v / close[i - 1] - 1)); }
export function logReturns(close) { return close.map((v, i) => i === 0 ? null : Math.log(v / close[i - 1])); }

export function maxDrawdown(close) {
  let peak = -Infinity, mdd = 0, peakIdx = 0, troughIdx = 0, curPeak = 0;
  for (let i = 0; i < close.length; i++) {
    if (close[i] > peak) { peak = close[i]; curPeak = i; }
    const dd = (close[i] - peak) / peak;
    if (dd < mdd) { mdd = dd; peakIdx = curPeak; troughIdx = i; }
  }
  return { maxDrawdown: mdd, peakIdx, troughIdx };
}

export function currentDrawdown(close) {
  const peak = Math.max(...close);
  return (close[close.length - 1] - peak) / peak;
}

export function sharpe(rets, rf = 0, ppy = 252) {
  const r = rets.filter(x => x !== null && isFinite(x));
  if (r.length < 5) return null;
  const m = mean(r) - rf / ppy, s = stdev(r, true);
  return s === 0 ? null : (m / s) * Math.sqrt(ppy);
}

export function sortino(rets, rf = 0, ppy = 252) {
  const r = rets.filter(x => x !== null && isFinite(x));
  if (r.length < 5) return null;
  const m = mean(r) - rf / ppy;
  const down = r.filter(x => x < 0);
  if (!down.length) return null;
  const ds = Math.sqrt(mean(down.map(x => x * x)));
  return ds === 0 ? null : (m / ds) * Math.sqrt(ppy);
}

/** Value at Risk historique — perte journalière dépassée dans (1-conf) des cas */
export function historicalVaR(rets, conf = 0.95) {
  const r = rets.filter(x => x !== null && isFinite(x));
  if (r.length < 30) return null;
  return percentile(r, 1 - conf);
}

export function cvar(rets, conf = 0.95) {
  const v = historicalVaR(rets, conf);
  if (v === null) return null;
  const tail = rets.filter(x => x !== null && x <= v);
  return tail.length ? mean(tail) : v;
}

export function skewness(rets) {
  const r = rets.filter(x => x !== null && isFinite(x));
  if (r.length < 10) return null;
  const m = mean(r), s = stdev(r, true);
  return s === 0 ? null : sum(r.map(x => ((x - m) / s) ** 3)) / r.length;
}

export function kurtosis(rets) {
  const r = rets.filter(x => x !== null && isFinite(x));
  if (r.length < 10) return null;
  const m = mean(r), s = stdev(r, true);
  return s === 0 ? null : sum(r.map(x => ((x - m) / s) ** 4)) / r.length - 3;
}

export function correlation(a, b) {
  const n = Math.min(a.length, b.length);
  const x = [], y = [];
  for (let i = 0; i < n; i++) {
    if (a[i] !== null && b[i] !== null && isFinite(a[i]) && isFinite(b[i])) { x.push(a[i]); y.push(b[i]); }
  }
  if (x.length < 10) return null;
  const mx = mean(x), my = mean(y);
  const cov = sum(x.map((v, i) => (v - mx) * (y[i] - my)));
  const dx = Math.sqrt(sum(x.map(v => (v - mx) ** 2))), dy = Math.sqrt(sum(y.map(v => (v - my) ** 2)));
  return (dx === 0 || dy === 0) ? null : cov / (dx * dy);
}

/** beta d'un titre contre son indice de référence */
export function beta(assetRets, benchRets) {
  const x = [], y = [];
  const n = Math.min(assetRets.length, benchRets.length);
  for (let i = 0; i < n; i++) {
    if (assetRets[i] !== null && benchRets[i] !== null) { y.push(assetRets[i]); x.push(benchRets[i]); }
  }
  if (x.length < 20) return null;
  const mx = mean(x), my = mean(y);
  const cov = sum(x.map((v, i) => (v - mx) * (y[i] - my))) / (x.length - 1);
  const vx = sum(x.map(v => (v - mx) ** 2)) / (x.length - 1);
  return vx === 0 ? null : cov / vx;
}

/** régression linéaire sur les p derniers points : pente + qualité de l'ajustement */
export function linreg(src, p) {
  const n = src.length;
  if (n < p) return { slope: null, r2: null, intercept: null, angle: null };
  const y = src.slice(n - p);
  const xs = y.map((_, i) => i);
  const mx = mean(xs), my = mean(y);
  const num = sum(xs.map((x, i) => (x - mx) * (y[i] - my)));
  const den = sum(xs.map(x => (x - mx) ** 2));
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  const ssTot = sum(y.map(v => (v - my) ** 2));
  const ssRes = sum(y.map((v, i) => (v - (slope * xs[i] + intercept)) ** 2));
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  // pente normalisée : % de variation par séance
  const angle = my === 0 ? 0 : (slope / my) * 100;
  return { slope, intercept, r2, angle };
}

/**
 * Exposant de Hurst par la méthode des moments d'ordre 2.
 * H > 0,5 : le mouvement persiste (tendance). H < 0,5 : il revient vers sa
 * moyenne (range). H ≈ 0,5 : marche aléatoire.
 * On travaille sur le logarithme du PRIX (et non sur les rendements) :
 * tau(lag) = √(écart-type des variations sur `lag` séances), puis la pente
 * de log(tau) contre log(lag) vaut H/2.
 */
export function hurst(close, maxLag = 40) {
  const lp = close.filter(x => x > 0).map(Math.log);
  if (lp.length < maxLag * 2) return null;
  const lags = [], taus = [];
  for (let lag = 2; lag < maxLag; lag += 2) {
    const diff = [];
    for (let i = lag; i < lp.length; i++) diff.push(lp[i] - lp[i - lag]);
    const sd = stdev(diff, true);
    if (sd && sd > 0) { lags.push(Math.log(lag)); taus.push(Math.log(Math.sqrt(sd))); }
  }
  if (lags.length < 4) return null;
  const mx = mean(lags), my = mean(taus);
  const den = sum(lags.map(x => (x - mx) ** 2));
  if (den === 0) return null;
  const slope = sum(lags.map((x, i) => (x - mx) * (taus[i] - my))) / den;
  return clamp(slope * 2, 0, 1);
}

/* --------------------- structure de marché & niveaux -------------------- */
/** sommets et creux significatifs (fractales de largeur `w`) */
export function swings(h, l, w = 5) {
  const highs = [], lows = [];
  for (let i = w; i < h.length - w; i++) {
    let isHigh = true, isLow = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue;
      if (h[j] >= h[i]) isHigh = false;
      if (l[j] <= l[i]) isLow = false;
    }
    if (isHigh) highs.push({ idx: i, price: h[i] });
    if (isLow) lows.push({ idx: i, price: l[i] });
  }
  return { highs, lows };
}

/** regroupe les swings en zones de support / résistance pondérées par les touches */
export function levels(h, l, c, w = 5, tolPct = 1.2, precalc = null) {
  // `precalc` evite de recalculer les swings quand l'appelant les a deja :
  // sur un backtest, cette seule reutilisation divise le travail par deux
  const { highs, lows } = precalc || swings(h, l, w);
  const pts = [...highs.map(x => ({ ...x, kind: 'R' })), ...lows.map(x => ({ ...x, kind: 'S' }))];
  const zones = [];
  for (const p of pts) {
    const z = zones.find(z => Math.abs(z.price - p.price) / p.price * 100 < tolPct);
    if (z) {
      z.touches++; z.price = (z.price * (z.touches - 1) + p.price) / z.touches;
      z.lastIdx = Math.max(z.lastIdx, p.idx);
    } else {
      zones.push({ price: p.price, touches: 1, lastIdx: p.idx, firstIdx: p.idx });
    }
  }
  const price = c[c.length - 1];
  const n = c.length;
  return zones.map(z => ({
    ...z,
    kind: z.price > price ? 'resistance' : 'support',
    distPct: (z.price - price) / price * 100,
    // une zone récente et souvent touchée compte davantage
    weight: z.touches * (0.55 + 0.45 * (z.lastIdx / n))
  })).sort((a, b) => b.weight - a.weight);
}

/** points pivots de la dernière période (classiques) */
export function pivots(h, l, c) {
  const i = c.length - 1;
  const P = (h[i] + l[i] + c[i]) / 3;
  return {
    P, R1: 2 * P - l[i], S1: 2 * P - h[i],
    R2: P + (h[i] - l[i]), S2: P - (h[i] - l[i]),
    R3: h[i] + 2 * (P - l[i]), S3: l[i] - 2 * (h[i] - P)
  };
}

/** retracements de Fibonacci sur l'amplitude de la fenêtre */
export function fibonacci(h, l, lookback = 120) {
  const s = Math.max(0, h.length - lookback);
  const hi = Math.max(...h.slice(s)), lo = Math.min(...l.slice(s));
  const d = hi - lo;
  return {
    high: hi, low: lo,
    levels: [
      { label: '0 %', price: hi }, { label: '23,6 %', price: hi - d * 0.236 },
      { label: '38,2 %', price: hi - d * 0.382 }, { label: '50 %', price: hi - d * 0.5 },
      { label: '61,8 %', price: hi - d * 0.618 }, { label: '78,6 %', price: hi - d * 0.786 },
      { label: '100 %', price: lo }
    ]
  };
}

/* --------------------------- détection de figures ----------------------- */
/** divergences prix / oscillateur sur la fenêtre récente */
export function divergence(price, osc, lookback = 60, w = 4) {
  const n = price.length;
  if (n < lookback + w) return null;
  const s = n - lookback;
  const pk = [], tr = [];
  for (let i = s + w; i < n - w; i++) {
    let isH = true, isL = true;
    for (let j = i - w; j <= i + w; j++) {
      if (j === i) continue;
      if (price[j] >= price[i]) isH = false;
      if (price[j] <= price[i]) isL = false;
    }
    if (isH && osc[i] !== null) pk.push(i);
    if (isL && osc[i] !== null) tr.push(i);
  }
  const res = [];
  if (pk.length >= 2) {
    const [a, b] = [pk[pk.length - 2], pk[pk.length - 1]];
    if (price[b] > price[a] && osc[b] < osc[a]) res.push({ type: 'baissière', kind: 'classique', from: a, to: b });
    if (price[b] < price[a] && osc[b] > osc[a]) res.push({ type: 'baissière', kind: 'cachée', from: a, to: b });
  }
  if (tr.length >= 2) {
    const [a, b] = [tr[tr.length - 2], tr[tr.length - 1]];
    if (price[b] < price[a] && osc[b] > osc[a]) res.push({ type: 'haussière', kind: 'classique', from: a, to: b });
    if (price[b] > price[a] && osc[b] < osc[a]) res.push({ type: 'haussière', kind: 'cachée', from: a, to: b });
  }
  return res.length ? res : null;
}

/** chandeliers japonais notables sur la dernière bougie */
export function candlePatterns(o, h, l, c, i = c.length - 1) {
  const out = [];
  const body = Math.abs(c[i] - o[i]), range = h[i] - l[i] || 1e-9;
  const upper = h[i] - Math.max(o[i], c[i]), lower = Math.min(o[i], c[i]) - l[i];
  const bull = c[i] > o[i];
  if (body / range < 0.1) out.push({ name: 'Doji', sens: 'indécision', force: 1 });
  if (lower > body * 2 && upper < body * 0.6 && body / range > 0.05) {
    out.push({ name: bull ? 'Marteau' : 'Pendu', sens: bull ? 'haussier' : 'baissier', force: 2 });
  }
  if (upper > body * 2 && lower < body * 0.6 && body / range > 0.05) {
    out.push({ name: 'Étoile filante', sens: 'baissier', force: 2 });
  }
  if (body / range > 0.85) out.push({ name: bull ? 'Marubozu haussier' : 'Marubozu baissier', sens: bull ? 'haussier' : 'baissier', force: 2 });
  if (i > 0) {
    const pb = Math.abs(c[i - 1] - o[i - 1]);
    if (bull && c[i - 1] < o[i - 1] && c[i] > o[i - 1] && o[i] < c[i - 1] && body > pb) {
      out.push({ name: 'Avalement haussier', sens: 'haussier', force: 3 });
    }
    if (!bull && c[i - 1] > o[i - 1] && c[i] < o[i - 1] && o[i] > c[i - 1] && body > pb) {
      out.push({ name: 'Avalement baissier', sens: 'baissier', force: 3 });
    }
  }
  return out;
}

/* ------------------------- gaps & activité inhabituelle ----------------- */
export function volumeSpike(v, p = 20) {
  const avg = sma(v, p);
  return v.map((x, i) => (avg[i] === null || avg[i] === 0) ? null : x / avg[i]);
}

export function gaps(o, c, minPct = 1.5) {
  const out = [];
  for (let i = 1; i < o.length; i++) {
    const g = (o[i] - c[i - 1]) / c[i - 1] * 100;
    if (Math.abs(g) >= minPct) out.push({ idx: i, pct: g, from: c[i - 1], to: o[i] });
  }
  return out;
}
