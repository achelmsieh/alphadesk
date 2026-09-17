/* =========================================================================
   AlphaDesk — bibliothèque de méthodes d'investissement

   Ce fichier contient les règles EXACTES de méthodes qui ont été publiées,
   testées et discutées pendant des décennies. Chacune est implémentée telle
   qu'elle est définie dans sa source, sans l'améliorer après coup — c'est la
   seule façon d'obtenir une comparaison honnête.

   Règles d'exécution communes, identiques pour toutes :
   • la position voulue est décidée à la CLÔTURE de la séance i ;
   • le passage d'ordre a lieu à l'OUVERTURE de la séance i+1 ;
   • frais et glissement déduits à l'aller comme au retour ;
   • hors position, le capital dort en liquidités et ne rapporte rien
     (hypothèse pessimiste : dans la réalité il serait rémunéré).

   Toutes les fonctions `signal` sont causales : elles ne lisent les séries
   qu'à l'indice i, jamais au-delà.
   ========================================================================= */
import * as I from './indicators.js';
import { analyzeAt } from './engine.js';

const chg = (c, i, back) => (i < back || !c[i - back]) ? null : 100 * (c[i] / c[i - back] - 1);

/* =========================================================================
   LES MÉTHODES
   `signal(ind, i, mem)` renvoie 1 (investi) ou 0 (liquidités).
   `mem` est un objet libre conservé d'une séance à l'autre, pour les
   méthodes qui ont besoin de mémoire (cassures, sorties conditionnelles).
   ========================================================================= */
export const METHODES = [
  {
    id: 'buyhold',
    nom: 'Achat et conservation',
    famille: 'Référence',
    resume: 'Acheter, ne rien faire, ne jamais vendre.',
    reference: 'La référence que toute méthode doit battre pour exister.',
    regles: [
      'Acheter au premier jour de la période.',
      'Ne jamais vendre.'
    ],
    signal: () => 1
  },

  {
    id: 'faber',
    nom: 'La règle des 10 mois (Faber)',
    famille: 'Suivi de tendance',
    resume: 'Investi tant que le cours est au-dessus de sa moyenne longue, en liquidités sinon.',
    reference: 'Meb Faber, « A Quantitative Approach to Tactical Asset Allocation » (2007), testé sur plus d’un siècle de données.',
    regles: [
      'Une seule décision par mois, à la clôture du dernier jour.',
      'Cours au-dessus de la moyenne mobile 200 séances (≈ 10 mois) → investi.',
      'Cours en dessous → tout en liquidités.'
    ],
    signal: (ind, i) => {
      const m = ind.sma200[i];
      if (m === null) return 0;
      // décision mensuelle : on ne réévalue qu'au changement de mois
      const d = new Date(ind.t[i]), p = new Date(ind.t[i - 1] || ind.t[i]);
      return { hold: true, value: ind.c[i] > m ? 1 : 0, decide: d.getMonth() !== p.getMonth() };
    },
    mensuel: true
  },

  {
    id: 'mm200',
    nom: 'La moyenne 200 séances, en quotidien',
    famille: 'Suivi de tendance',
    resume: 'La même idée que Faber, mais réévaluée chaque jour.',
    reference: 'Version quotidienne de la règle des 10 mois — plus réactive, mais beaucoup plus de transactions.',
    regles: [
      'Clôture au-dessus de la MM200 → investi.',
      'Clôture en dessous → liquidités.',
      'Réévalué à chaque séance.'
    ],
    signal: (ind, i) => (ind.sma200[i] !== null && ind.c[i] > ind.sma200[i]) ? 1 : 0
  },

  {
    id: 'croixdoree',
    nom: 'Croisement doré MM50 / MM200',
    famille: 'Suivi de tendance',
    resume: 'Investi quand la moyenne 50 passe au-dessus de la moyenne 200.',
    reference: 'Le signal le plus commenté de la presse financière. Très lent, donc peu de faux signaux — mais des entrées tardives.',
    regles: [
      'MM50 au-dessus de la MM200 → investi.',
      'MM50 en dessous → liquidités.'
    ],
    signal: (ind, i) => (ind.sma50[i] !== null && ind.sma200[i] !== null && ind.sma50[i] > ind.sma200[i]) ? 1 : 0
  },

  {
    id: 'momentum12',
    nom: 'Momentum absolu 12 mois',
    famille: 'Momentum',
    resume: 'Investi si le titre a gagné de l’argent sur les douze derniers mois.',
    reference: 'Gary Antonacci, « Dual Momentum Investing » (2014) ; fondé sur Moskowitz, Ooi & Pedersen (2012), qui documentent l’effet sur 58 marchés et 800 ans de données reconstituées.',
    regles: [
      'À la fin de chaque mois, calculer le rendement des 12 derniers mois.',
      'Rendement positif → investi. Rendement négatif → liquidités.',
      'Le momentum est la seule anomalie de marché qui ait survécu à sa publication.'
    ],
    signal: (ind, i) => {
      const r = chg(ind.c, i, 252);
      if (r === null) return 0;
      const d = new Date(ind.t[i]), p = new Date(ind.t[i - 1] || ind.t[i]);
      return { hold: true, value: r > 0 ? 1 : 0, decide: d.getMonth() !== p.getMonth() };
    },
    mensuel: true
  },

  {
    id: 'momentum61',
    nom: 'Momentum 6 mois, saute le dernier',
    famille: 'Momentum',
    resume: 'Rendement des six derniers mois en ignorant le mois écoulé.',
    reference: 'Jegadeesh & Titman (1993). Le mois le plus récent est volontairement exclu : à très court terme, le prix a tendance à faire l’inverse du momentum.',
    regles: [
      'Mesurer le rendement entre il y a 6 mois et il y a 1 mois.',
      'Positif → investi. Négatif → liquidités.',
      'Réévalué mensuellement.'
    ],
    signal: (ind, i) => {
      if (i < 130) return 0;
      const a = ind.c[i - 21], b = ind.c[i - 126];
      if (!a || !b) return 0;
      const d = new Date(ind.t[i]), p = new Date(ind.t[i - 1] || ind.t[i]);
      return { hold: true, value: a / b - 1 > 0 ? 1 : 0, decide: d.getMonth() !== p.getMonth() };
    },
    mensuel: true
  },

  {
    id: 'donchian',
    nom: 'Cassure de Donchian 20 / 10 (les Tortues)',
    famille: 'Cassure',
    resume: 'Acheter un plus haut de 20 séances, sortir sur un plus bas de 10.',
    reference: 'Système des « Turtle Traders » de Richard Dennis (1983), qui a prouvé qu’une méthode mécanique s’enseigne à des débutants complets.',
    regles: [
      'Clôture au plus haut des 20 dernières séances → entrée.',
      'Clôture au plus bas des 10 dernières séances → sortie.',
      'Aucune anticipation : on suit, on ne devine pas.'
    ],
    signal: (ind, i, mem) => {
      const hi20 = ind.donchian.upper[i], lo10 = lowest(ind.l, i, 10);
      if (hi20 === null) return 0;
      if (!mem.in && ind.c[i] >= hi20 * 0.999) mem.in = true;
      else if (mem.in && lo10 !== null && ind.c[i] <= lo10 * 1.001) mem.in = false;
      return mem.in ? 1 : 0;
    }
  },

  {
    id: 'supertrend',
    nom: 'Supertrend 10 / 3',
    famille: 'Suivi de tendance',
    resume: 'Investi tant que la ligne Supertrend reste sous les cours.',
    reference: 'Suiveur de tendance basé sur l’ATR : le stop s’élargit quand le marché s’agite, ce qui évite les sorties sur bruit.',
    regles: [
      'Ligne Supertrend haussière → investi.',
      'Bascule baissière → liquidités.'
    ],
    signal: (ind, i) => ind.supertrend.dir[i] === 1 ? 1 : 0
  },

  {
    id: 'connors2',
    nom: 'RSI(2) de Connors',
    famille: 'Retour à la moyenne',
    resume: 'Acheter la panique de court terme, mais uniquement dans une tendance de fond haussière.',
    reference: 'Larry Connors & Cesar Alvarez, « Short Term Trading Strategies That Work » (2008). Le filtre MM200 est ce qui sépare cette méthode du couteau qui tombe.',
    regles: [
      'Filtre obligatoire : cours au-dessus de la MM200.',
      'RSI 2 périodes sous 10 → achat.',
      'Sortie dès que la clôture repasse au-dessus de la moyenne 5 séances.',
      'Positions très courtes, quelques séances seulement.'
    ],
    signal: (ind, i, mem) => {
      const r2 = ind.rsi2?.[i], s200 = ind.sma200[i], s5 = ind.sma5?.[i];
      if (r2 === null || r2 === undefined || s200 === null) return 0;
      if (!mem.in && ind.c[i] > s200 && r2 < 10) mem.in = true;
      else if (mem.in && s5 != null && ind.c[i] > s5) mem.in = false;
      return mem.in ? 1 : 0;
    }
  },

  {
    id: 'macd',
    nom: 'Croisement du MACD',
    famille: 'Momentum',
    resume: 'Investi quand l’histogramme MACD est positif.',
    reference: 'Une des règles les plus populaires auprès des particuliers — incluse ici précisément pour voir ce qu’elle vaut réellement, sans filtre de tendance.',
    regles: [
      'Histogramme MACD positif → investi.',
      'Histogramme négatif → liquidités.'
    ],
    signal: (ind, i) => (ind.macd.hist[i] !== null && ind.macd.hist[i] > 0) ? 1 : 0
  },

  {
    id: 'alphadesk',
    nom: 'Le moteur AlphaDesk',
    famille: 'Composite',
    resume: 'Le score global de cette application, utilisé comme simple interrupteur.',
    reference: 'Agrégat pondéré des neuf facteurs, sans stop ni objectif ici — pour le comparer aux autres méthodes à armes égales.',
    regles: [
      'Score global ≥ +18 → investi.',
      'Score global < 0 → liquidités.',
      'Entre les deux, on conserve la position en cours.'
    ],
    signal: (ind, i, mem, profile) => {
      const sc = analyzeAt(ind, i, profile, {}, { scoreOnly: true }).signal.score;
      if (sc >= 18) mem.in = true;
      else if (sc < 0) mem.in = false;
      return mem.in ? 1 : 0;
    },
    lent: true
  }
];

function lowest(arr, i, p) {
  if (i < p - 1) return null;
  let m = Infinity;
  for (let j = i - p + 1; j <= i; j++) m = Math.min(m, arr[j]);
  return m;
}

/** indicateurs supplémentaires dont certaines méthodes ont besoin */
export function prepareForStrategies(ind) {
  if (!ind.rsi2) ind.rsi2 = I.rsi(ind.c, 2);
  if (!ind.sma5) ind.sma5 = I.sma(ind.c, 5);
  return ind;
}

/* =========================================================================
   LE MOTEUR D'EXÉCUTION
   ========================================================================= */
export const DEFAULT_OPTS = { start: 260, feeBps: 10, slippageBps: 5, capital: 10000 };

export async function runStrategy(ind, methode, opts = {}, profile = null) {
  // certaines methodes lisent des series optionnelles (RSI 2, MM5) : sans ce
  // prealable, leur condition de SORTIE ne se declenche jamais et la position
  // reste ouverte jusqu'a la fin du test
  prepareForStrategies(ind);
  const O = { ...DEFAULT_OPTS, ...opts };
  const n = ind.n;
  const start = Math.max(O.start, 210);
  if (n <= start + 40) return { error: 'historique insuffisant' };

  const cost = (O.feeBps + O.slippageBps) / 10000;
  let cash = O.capital, shares = 0, entryPx = 0, entryIdx = 0;
  const equity = new Array(n).fill(null);
  const invested = new Array(n).fill(0);
  const trades = [];
  const mem = {};
  let pending = null, held = 0;

  for (let i = start; i < n; i++) {
    /* --- exécution de l'ordre de la veille, à l'ouverture --- */
    if (pending === 1 && shares === 0) {
      const px = ind.o[i] * (1 + cost);
      shares = Math.floor(cash / px);
      if (shares > 0) { cash -= shares * px; entryPx = px; entryIdx = i; }
    } else if (pending === 0 && shares > 0) {
      const px = ind.o[i] * (1 - cost);
      cash += shares * px;
      trades.push({
        entryIdx, entryDate: ind.t[entryIdx], entryPrice: entryPx,
        exitIdx: i, exitDate: ind.t[i], exitPrice: px,
        pnl: (px - entryPx) * shares, pnlPct: 100 * (px / entryPx - 1), bars: i - entryIdx
      });
      shares = 0;
    }
    pending = null;

    /* --- décision à la clôture --- */
    let want = methode.signal(ind, i, mem, profile);
    if (want && typeof want === 'object') {
      // méthode à décision mensuelle : entre deux fins de mois, on garde
      if (want.decide) held = want.value;
      want = held;
    }
    if (want === 1 && shares === 0) pending = 1;
    else if (want === 0 && shares > 0) pending = 0;

    equity[i] = cash + shares * ind.c[i];
    invested[i] = shares > 0 ? 1 : 0;

    if (methode.lent && i % 80 === 0) await new Promise(r => setTimeout(r, 0));
  }

  if (shares > 0) {
    const px = ind.c[n - 1] * (1 - cost);
    cash += shares * px;
    trades.push({
      entryIdx, entryDate: ind.t[entryIdx], entryPrice: entryPx,
      exitIdx: n - 1, exitDate: ind.t[n - 1], exitPrice: px,
      pnl: (px - entryPx) * shares, pnlPct: 100 * (px / entryPx - 1), bars: n - 1 - entryIdx
    });
    equity[n - 1] = cash;
    shares = 0;
  }

  return metrics(ind, methode, equity, invested, trades, start, O.capital);
}

function metrics(ind, methode, equity, invested, trades, start, capital0) {
  const vals = [], dates = [];
  for (let i = start; i < ind.n; i++) if (equity[i] !== null) { vals.push(equity[i]); dates.push(ind.t[i]); }
  const fin = vals[vals.length - 1] ?? capital0;
  const annees = (ind.t[ind.n - 1] - ind.t[start]) / (365.25 * 24 * 3600 * 1000);
  const rets = vals.map((v, i) => i === 0 ? null : v / vals[i - 1] - 1);
  const dd = I.maxDrawdown(vals);
  const gains = trades.filter(t => t.pnl > 0);
  const pertes = trades.filter(t => t.pnl <= 0);
  const sommeGains = gains.reduce((s, t) => s + t.pnl, 0);
  const sommePertes = Math.abs(pertes.reduce((s, t) => s + t.pnl, 0));
  const cagr = annees > 0.4 ? (Math.pow(fin / capital0, 1 / annees) - 1) * 100 : null;
  const maxDD = dd.maxDrawdown * 100;

  return {
    ok: true, id: methode.id, nom: methode.nom, famille: methode.famille,
    equity: { values: vals, dates },
    rendement: 100 * (fin / capital0 - 1),
    cagr, capitalFinal: fin,
    maxDrawdown: maxDD,
    calmar: (cagr !== null && maxDD !== 0) ? cagr / Math.abs(maxDD) : null,
    sharpe: I.sharpe(rets), sortino: I.sortino(rets),
    volAnn: (I.stdev(rets.filter(x => x !== null), true) ?? 0) * Math.sqrt(252) * 100,
    exposition: 100 * invested.slice(start).reduce((a, b) => a + b, 0) / (ind.n - start),
    operations: trades.length,
    tauxReussite: trades.length ? 100 * gains.length / trades.length : null,
    facteurProfit: sommePertes > 0 ? sommeGains / sommePertes : (sommeGains > 0 ? Infinity : null),
    dureeMoyenne: trades.length ? I.mean(trades.map(t => t.bars)) : null,
    trades
  };
}

/* =========================================================================
   COMPARAISON DE TOUTES LES MÉTHODES SUR LE MÊME TITRE
   ========================================================================= */
export async function comparerMethodes(ind, opts = {}, profile = null, onProgress) {
  prepareForStrategies(ind);
  const res = [];
  for (let k = 0; k < METHODES.length; k++) {
    const m = METHODES[k];
    if (onProgress) onProgress(k / METHODES.length, m.nom);
    const r = await runStrategy(ind, m, opts, profile);
    if (r.ok) res.push(r);
    await new Promise(r2 => setTimeout(r2, 0));
  }
  if (onProgress) onProgress(1, '');

  const ref = res.find(r => r.id === 'buyhold');
  for (const r of res) {
    r.ecartVsReference = ref ? r.rendement - ref.rendement : null;
    r.ddMieuxQueReference = ref ? Math.abs(ref.maxDrawdown) - Math.abs(r.maxDrawdown) : null;
  }
  res.sort((a, b) => (b.calmar ?? -99) - (a.calmar ?? -99));
  return { resultats: res, reference: ref, lecture: lireComparaison(res, ref) };
}

function lireComparaison(res, ref) {
  if (!res.length || !ref) return 'Pas assez de données pour comparer.';
  const battent = res.filter(r => r.id !== 'buyhold' && r.rendement > ref.rendement);
  const protegent = res.filter(r => r.id !== 'buyhold' && Math.abs(r.maxDrawdown) < Math.abs(ref.maxDrawdown) * 0.7);
  const nf = x => (x === null || !isFinite(x)) ? 'n/d' : x.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const verbe = battent.length > 1 ? 'battent' : 'bat';
  let t = `Sur cette valeur et cette période, ${battent.length} méthode${battent.length > 1 ? 's' : ''} sur ${res.length - 1} ${verbe} la simple détention en rendement`;
  t += `, et ${protegent.length} réduisent le repli maximal d’au moins 30 %. `;
  if (!battent.length) {
    t += `C’est un résultat fréquent et instructif : sur un titre en tendance haussière continue, ne rien faire bat presque toujours le timing. `;
    t += `L’intérêt d’une méthode se juge alors sur le repli encaissé, pas sur la performance : `;
    t += `un rendement un peu inférieur avec deux fois moins de perte maximale est un meilleur placement, parce qu’on le tient jusqu’au bout.`;
  } else {
    const best = res.filter(r => r.id !== 'buyhold').reduce((a, b) => (b.calmar ?? -99) > (a.calmar ?? -99) ? b : a);
    t += `Le meilleur rapport rendement / repli revient à « ${best.nom} » : ${nf(best.rendement)} % pour un repli maximal de ${nf(best.maxDrawdown)} %, `;
    t += `contre ${nf(ref.rendement)} % et ${nf(ref.maxDrawdown)} % en détention simple. `;
    t += `Attention : ce classement vaut pour UNE valeur sur UNE période. Testez-le sur trois ou quatre titres différents avant d’en tirer une règle.`;
  }
  return t;
}
