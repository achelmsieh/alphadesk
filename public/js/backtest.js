/* =========================================================================
   AlphaDesk — backtest du moteur de décision
   Règles anti-triche appliquées :
   • la décision est prise à la CLÔTURE de la séance i, avec les seules
     données disponibles jusqu'à i ;
   • l'exécution a lieu à l'OUVERTURE de la séance i+1 ;
   • frais et glissement sont déduits à chaque aller et à chaque retour ;
   • le stop est testé sur le plus bas de la séance, l'objectif sur le plus
     haut, et si les deux sont touchés le même jour on retient le stop
     (hypothèse pessimiste).
   ========================================================================= */
import * as I from './indicators.js';
import { analyzeAt, HORIZONS, RISKS } from './engine.js';

/** nombre au format francais */
const nf = (x, d = 1) => (x === null || x === undefined || !isFinite(x)) ? 'n/d'
  : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });


export const DEFAULT_BT = {
  warmup: 220,          // séances nécessaires avant la première décision
  feeBps: 10,           // frais de courtage, en points de base, par transaction
  slippageBps: 5,       // écart entre le prix théorique et le prix obtenu
  allowShort: false,    // vente à découvert
  partialAtTarget1: 0.5,// part sortie au premier objectif
  trailAfterTarget1: true,
  exitOnSignalFlip: true
};

/* ------------------------------------------------------------------ */
/*  Boucle principale                                                  */
/* ------------------------------------------------------------------ */
export async function runBacktest(ind, profile, opts = {}, onProgress) {
  const O = { ...DEFAULT_BT, ...opts };
  const H = HORIZONS[profile.horizon] || HORIZONS.moyen;
  const R = RISKS[profile.risk] || RISKS.equilibre;
  const n = ind.n;
  const start = Math.max(O.warmup, 210);
  if (n <= start + 30) {
    return { error: `Historique insuffisant : ${n} séances disponibles, ${start + 30} nécessaires. Choisissez une période plus longue.` };
  }

  const cost = (O.feeBps + O.slippageBps) / 10000;
  const capital0 = Math.max(profile.capital || 10000, 1000);

  let cash = capital0;
  let pos = null;                 // position ouverte
  const trades = [];
  const equity = new Array(n).fill(null);
  const scores = new Array(n).fill(null);
  const exposure = new Array(n).fill(0);
  let pendingOrder = null;        // ordre décidé hier, exécuté à l'ouverture

  for (let i = start; i < n; i++) {
    const O_ = ind.o[i], H_ = ind.h[i], L_ = ind.l[i], C_ = ind.c[i];

    /* --- 1. exécution de l'ordre décidé la veille, à l'ouverture ------ */
    if (pendingOrder) {
      const px = O_ * (1 + (pendingOrder.side === 'long' ? cost : -cost));
      if (pendingOrder.type === 'open' && !pos) {
        const qty = pendingOrder.qty;
        if (qty > 0 && qty * px <= cash) {
          cash -= qty * px;
          pos = {
            side: pendingOrder.side, entryIdx: i, entryPrice: px, qty, qtyInit: qty,
            stop: pendingOrder.stop, stopInit: pendingOrder.stop,
            t1: pendingOrder.t1, t2: pendingOrder.t2,
            entryScore: pendingOrder.score, entryConviction: pendingOrder.conviction,
            partialDone: false, reasonIn: pendingOrder.reason, maxFavorable: 0, maxAdverse: 0
          };
        }
      } else if (pendingOrder.type === 'close' && pos) {
        closePosition(i, px, pendingOrder.reason);
      }
      pendingOrder = null;
    }

    /* --- 2. gestion intra-séance de la position ouverte --------------- */
    if (pos) {
      const dirSign = pos.side === 'long' ? 1 : -1;
      // excursions favorables / défavorables, utiles pour juger le placement du stop
      const fav = dirSign * ((pos.side === 'long' ? H_ : L_) - pos.entryPrice) / pos.entryPrice * 100;
      const adv = dirSign * ((pos.side === 'long' ? L_ : H_) - pos.entryPrice) / pos.entryPrice * 100;
      pos.maxFavorable = Math.max(pos.maxFavorable, fav);
      pos.maxAdverse = Math.min(pos.maxAdverse, adv);

      const stopHit = pos.side === 'long' ? L_ <= pos.stop : H_ >= pos.stop;
      const t1Hit = !pos.partialDone && (pos.side === 'long' ? H_ >= pos.t1 : L_ <= pos.t1);
      const t2Hit = pos.side === 'long' ? H_ >= pos.t2 : L_ <= pos.t2;

      if (stopHit) {
        // hypothèse pessimiste : si stop et objectif tombent le même jour, le stop l'emporte
        const px = pos.stop * (1 - dirSign * cost);
        closePosition(i, px, pos.partialDone ? 'stop suiveur' : 'stop de protection');
      } else {
        if (t1Hit && O.partialAtTarget1 > 0) {
          const qtyOut = Math.floor(pos.qtyInit * O.partialAtTarget1);
          if (qtyOut > 0 && qtyOut < pos.qty) {
            const px = pos.t1 * (1 - dirSign * cost);
            // même convention qu'à la clôture : une vente à découvert se
            // dénoue en miroir autour du prix d'entrée
            cash += pos.side === 'long' ? qtyOut * px : qtyOut * (2 * pos.entryPrice - px);
            recordPartial(i, px, qtyOut);
            pos.qty -= qtyOut;
          }
          pos.partialDone = true;
          pos.stop = pos.entryPrice;            // on sécurise : stop au point mort
        }
        if (pos && t2Hit) {
          const px = pos.t2 * (1 - dirSign * cost);
          closePosition(i, px, 'objectif atteint');
        }
      }

      // stop suiveur après le premier objectif : on colle au Supertrend
      if (pos && pos.partialDone && O.trailAfterTarget1) {
        const st = ind.supertrend.line[i], sd = ind.supertrend.dir[i];
        if (st !== null) {
          if (pos.side === 'long' && sd === 1 && st > pos.stop) pos.stop = st;
          if (pos.side === 'short' && sd === -1 && st < pos.stop) pos.stop = st;
        }
      }
    }

    /* --- 3. décision à la clôture, exécutée demain -------------------- */
    const a = analyzeAt(ind, i, profile, {});
    scores[i] = a.signal.score;

    if (!pos) {
      const wantLong = a.signal.action.startsWith('buy') && a.plan.actionable;
      const wantShort = O.allowShort && a.signal.action.startsWith('sell') && a.plan.actionable;
      if (wantLong || wantShort) {
        const side = wantLong ? 'long' : 'short';
        const eq = cash;
        let riskPct = a.plan.sizing.riskPct;
        const riskAmount = eq * riskPct / 100;
        const rps = a.plan.riskPerShare;
        let qty = rps > 0 ? Math.floor(riskAmount / rps) : 0;
        const maxNotional = eq * R.maxPosition / 100;
        if (qty * C_ > maxNotional) qty = Math.floor(maxNotional / C_);
        if (qty > 0) {
          pendingOrder = {
            type: 'open', side, qty, stop: a.plan.stop,
            t1: a.plan.targets[0].price, t2: a.plan.targets[1].price,
            score: a.signal.score, conviction: a.signal.conviction,
            reason: `${a.signal.label} · score ${a.signal.score} · conviction ${a.signal.conviction} %`
          };
        }
      }
    } else if (O.exitOnSignalFlip) {
      const flipped = pos.side === 'long'
        ? (a.signal.score <= -18)
        : (a.signal.score >= 18);
      const stale = i - pos.entryIdx > H.holdMax;
      if (flipped) pendingOrder = { type: 'close', side: pos.side, reason: `retournement du signal (score ${a.signal.score})` };
      else if (stale) pendingOrder = { type: 'close', side: pos.side, reason: `durée maximale de détention atteinte (${H.holdMax} séances)` };
    }

    /* --- 4. valorisation de fin de séance ---------------------------- */
    const mtm = pos ? (pos.side === 'long' ? pos.qty * C_ : pos.qty * (2 * pos.entryPrice - C_)) : 0;
    equity[i] = cash + mtm;
    exposure[i] = pos ? 1 : 0;

    if (onProgress && i % 60 === 0) {
      onProgress((i - start) / (n - start));
      await new Promise(r => setTimeout(r, 0));   // on rend la main au navigateur
    }
  }

  // clôture forcée de la dernière position, au dernier cours connu
  if (pos) closePosition(n - 1, ind.c[n - 1] * (1 - (pos.side === 'long' ? cost : -cost)), 'fin de la période testée');

  function recordPartial(i, px, qty) {
    pos.partials = pos.partials || [];
    pos.partials.push({ idx: i, price: px, qty, pnl: (px - pos.entryPrice) * qty * (pos.side === 'long' ? 1 : -1) });
  }

  function closePosition(i, px, reason) {
    const dirSign = pos.side === 'long' ? 1 : -1;
    const pnlRest = (px - pos.entryPrice) * pos.qty * dirSign;
    cash += pos.side === 'long' ? pos.qty * px : pos.qty * (2 * pos.entryPrice - px);
    const partialPnl = (pos.partials || []).reduce((s, p) => s + p.pnl, 0);
    const totalPnl = pnlRest + partialPnl;
    const investedAtEntry = pos.qtyInit * pos.entryPrice;
    trades.push({
      side: pos.side,
      entryIdx: pos.entryIdx, entryDate: ind.t[pos.entryIdx], entryPrice: pos.entryPrice,
      exitIdx: i, exitDate: ind.t[i], exitPrice: px,
      qty: pos.qtyInit, invested: investedAtEntry,
      pnl: totalPnl, pnlPct: investedAtEntry ? 100 * totalPnl / investedAtEntry : 0,
      bars: i - pos.entryIdx, reasonIn: pos.reasonIn, reasonOut: reason,
      stopInit: pos.stopInit, t1: pos.t1, t2: pos.t2,
      entryScore: pos.entryScore, entryConviction: pos.entryConviction,
      maxFavorable: pos.maxFavorable, maxAdverse: pos.maxAdverse,
      partials: pos.partials || []
    });
    pos = null;
  }

  return buildReport({ ind, trades, equity, scores, exposure, start, capital0, profile, opts: O });
}

/* ------------------------------------------------------------------ */
/*  Rapport statistique                                                */
/* ------------------------------------------------------------------ */
function buildReport({ ind, trades, equity, scores, exposure, start, capital0, profile, opts }) {
  const n = ind.n;
  const eqClean = [], eqIdx = [];
  for (let i = start; i < n; i++) { if (equity[i] !== null) { eqClean.push(equity[i]); eqIdx.push(i); } }

  const finalEq = eqClean[eqClean.length - 1] ?? capital0;
  const totalReturn = 100 * (finalEq / capital0 - 1);
  const years = (ind.t[n - 1] - ind.t[start]) / (365.25 * 24 * 3600 * 1000);
  const cagr = years > 0.2 ? (Math.pow(finalEq / capital0, 1 / years) - 1) * 100 : null;

  const eqRets = eqClean.map((v, i) => i === 0 ? null : v / eqClean[i - 1] - 1);
  const dd = I.maxDrawdown(eqClean);
  const bhStart = ind.c[start], bhEnd = ind.c[n - 1];
  const bhReturn = 100 * (bhEnd / bhStart - 1);
  const bhSeries = [];
  for (let i = start; i < n; i++) bhSeries.push(capital0 * ind.c[i] / bhStart);
  const bhDD = I.maxDrawdown(bhSeries);
  const bhRets = bhSeries.map((v, i) => i === 0 ? null : v / bhSeries[i - 1] - 1);

  const wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const winRate = trades.length ? 100 * wins.length / trades.length : null;
  const avgWin = wins.length ? grossWin / wins.length : 0;
  const avgLoss = losses.length ? grossLoss / losses.length : 0;
  const expectancy = trades.length ? (grossWin - grossLoss) / trades.length : 0;

  // séries de gains / pertes consécutifs
  let curW = 0, curL = 0, maxW = 0, maxL = 0;
  for (const t of trades) {
    if (t.pnl > 0) { curW++; curL = 0; maxW = Math.max(maxW, curW); }
    else { curL++; curW = 0; maxL = Math.max(maxL, curL); }
  }

  const byReason = {};
  for (const t of trades) {
    const k = t.reasonOut;
    byReason[k] = byReason[k] || { n: 0, pnl: 0 };
    byReason[k].n++; byReason[k].pnl += t.pnl;
  }

  return {
    ok: true,
    params: { profile, opts, start, startDate: ind.t[start], endDate: ind.t[n - 1], bars: n - start },
    equity: { idx: eqIdx, values: eqClean, buyHold: bhSeries, dates: eqIdx.map(i => ind.t[i]) },
    scores,
    perf: {
      capital0, finalEquity: finalEq, totalReturn, cagr,
      maxDrawdown: dd.maxDrawdown * 100,
      sharpe: I.sharpe(eqRets), sortino: I.sortino(eqRets),
      volAnn: (I.stdev(eqRets.filter(x => x !== null), true) ?? 0) * Math.sqrt(252) * 100,
      exposurePct: 100 * exposure.slice(start).reduce((a, b) => a + b, 0) / (n - start),
      calmar: (cagr !== null && dd.maxDrawdown !== 0) ? cagr / Math.abs(dd.maxDrawdown * 100) : null
    },
    buyHold: {
      totalReturn: bhReturn,
      cagr: years > 0.2 ? (Math.pow(bhEnd / bhStart, 1 / years) - 1) * 100 : null,
      maxDrawdown: bhDD.maxDrawdown * 100,
      sharpe: I.sharpe(bhRets),
      volAnn: (I.stdev(bhRets.filter(x => x !== null), true) ?? 0) * Math.sqrt(252) * 100
    },
    trades: {
      list: trades, count: trades.length, wins: wins.length, losses: losses.length,
      winRate, avgWin, avgLoss, grossWin, grossLoss,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : (grossWin > 0 ? Infinity : null),
      expectancy, payoff: avgLoss > 0 ? avgWin / avgLoss : null,
      avgBars: trades.length ? I.mean(trades.map(t => t.bars)) : null,
      maxWinStreak: maxW, maxLossStreak: maxL,
      best: trades.length ? trades.reduce((a, b) => b.pnl > a.pnl ? b : a) : null,
      worst: trades.length ? trades.reduce((a, b) => b.pnl < a.pnl ? b : a) : null,
      byReason
    },
    edge: signalEdge(ind, scores, start)
  };
}

/* ------------------------------------------------------------------ */
/*  Pouvoir prédictif brut du score                                    */
/*  Question posée : « quand mon score dit X, que fait le titre après ? » */
/* ------------------------------------------------------------------ */
export function signalEdge(ind, scores, start) {
  const horizons = [5, 21, 63];
  const bands = [
    { key: 'tresNeg', label: 'Score ≤ −42', test: s => s <= -42 },
    { key: 'neg', label: '−42 à −18', test: s => s > -42 && s <= -18 },
    { key: 'neutre', label: '−18 à +18', test: s => s > -18 && s < 18 },
    { key: 'pos', label: '+18 à +42', test: s => s >= 18 && s < 42 },
    { key: 'tresPos', label: 'Score ≥ +42', test: s => s >= 42 }
  ];
  const out = { horizons, bands: [] };
  const baseline = {};
  for (const hz of horizons) {
    const all = [];
    for (let i = start; i < ind.n - hz; i++) all.push(100 * (ind.c[i + hz] / ind.c[i] - 1));
    baseline[hz] = { mean: I.mean(all), median: I.median(all), winRate: all.length ? 100 * all.filter(x => x > 0).length / all.length : null, n: all.length };
  }
  out.baseline = baseline;

  for (const b of bands) {
    const row = { key: b.key, label: b.label, byHorizon: {} };
    for (const hz of horizons) {
      const fwd = [];
      for (let i = start; i < ind.n - hz; i++) {
        if (scores[i] === null || !b.test(scores[i])) continue;
        fwd.push(100 * (ind.c[i + hz] / ind.c[i] - 1));
      }
      row.byHorizon[hz] = {
        n: fwd.length,
        mean: I.mean(fwd), median: I.median(fwd),
        winRate: fwd.length ? 100 * fwd.filter(x => x > 0).length / fwd.length : null,
        excess: fwd.length ? I.mean(fwd) - baseline[hz].mean : null,
        best: fwd.length ? Math.max(...fwd) : null, worst: fwd.length ? Math.min(...fwd) : null
      };
    }
    out.bands.push(row);
  }

  // verdict synthétique : le score sépare-t-il vraiment les bonnes des mauvaises périodes ?
  const hz = 21;
  const hi = out.bands.find(b => b.key === 'tresPos').byHorizon[hz];
  const lo = out.bands.find(b => b.key === 'tresNeg').byHorizon[hz];
  const spread = (hi.mean !== null && lo.mean !== null) ? hi.mean - lo.mean : null;
  out.verdict = {
    spread21: spread,
    reliable: spread !== null && spread > 2 && hi.n >= 15 && lo.n >= 15,
    text: spread === null ? 'Pas assez de données pour conclure.'
      : (hi.n < 15 || lo.n < 15) ? `Trop peu d’occurrences de signaux extrêmes (${hi.n} achats forts, ${lo.n} ventes fortes) sur cette période : le résultat n’est pas statistiquement exploitable.`
        : spread > 4 ? `Le score sépare nettement : après un signal fort à l’achat le titre gagne en moyenne ${nf(hi.mean, 1)} % sur un mois, contre ${nf(lo.mean, 1)} % après un signal fort à la vente, soit un écart de ${nf(spread, 1)} points.`
          : spread > 1.5 ? `Le score apporte un avantage modéré : écart de ${nf(spread, 1)} points sur un mois entre signaux extrêmes.`
            : `Sur cette valeur et cette période, le score n’apporte pas d’avantage clair (écart de seulement ${nf(spread, 1)} points). À ne pas utiliser seul ici.`
  };
  return out;
}

/* ------------------------------------------------------------------ */
/*  Analyse walk-forward : le moteur tient-il hors de l'échantillon ?  */
/* ------------------------------------------------------------------ */
export async function walkForward(ind, profile, opts = {}, folds = 3, onProgress) {
  const n = ind.n, start = Math.max(opts.warmup || 220, 210);
  const usable = n - start;
  if (usable < folds * 120) return { error: 'Historique trop court pour une analyse par périodes. Choisissez 5 ans ou plus.' };
  const size = Math.floor(usable / folds);
  const results = [];
  for (let f = 0; f < folds; f++) {
    const s = start + f * size, e = f === folds - 1 ? n : start + (f + 1) * size;
    const slice = sliceInd(ind, 0, e);
    const r = await runBacktest(slice, profile, { ...opts, warmup: s }, p => onProgress && onProgress((f + p) / folds));
    if (r.ok) {
      results.push({
        fold: f + 1, from: ind.t[s], to: ind.t[e - 1],
        totalReturn: r.perf.totalReturn, buyHold: r.buyHold.totalReturn,
        trades: r.trades.count, winRate: r.trades.winRate,
        maxDrawdown: r.perf.maxDrawdown, sharpe: r.perf.sharpe
      });
    }
  }
  const beat = results.filter(r => r.totalReturn > r.buyHold).length;
  return {
    ok: true, folds: results,
    verdict: results.length
      ? `Le moteur bat la simple détention sur ${beat} période${beat > 1 ? 's' : ''} sur ${results.length}. ` +
      (beat === results.length ? 'Comportement homogène sur toutes les sous-périodes : c’est le meilleur signe de robustesse.'
        : beat === 0 ? 'Sur cette valeur, la détention simple fait mieux partout : le filtrage par signal coûte plus qu’il ne rapporte ici.'
          : 'Résultat hétérogène selon les périodes — le moteur dépend du régime de marché, ce qui est normal mais doit être gardé en tête.')
      : 'Aucun résultat exploitable.'
  };
}

function sliceInd(ind, from, to) {
  const out = { n: to - from };
  for (const [k, v] of Object.entries(ind)) {
    if (k === 'n') continue;
    if (Array.isArray(v)) out[k] = v.slice(from, to);
    else if (v && typeof v === 'object') {
      const sub = {};
      for (const [k2, v2] of Object.entries(v)) sub[k2] = Array.isArray(v2) ? v2.slice(from, to) : v2;
      out[k] = sub;
    } else out[k] = v;
  }
  return out;
}
