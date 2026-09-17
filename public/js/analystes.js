/* =========================================================================
   AlphaDesk — les avis d'analystes, testés au lieu d'être crus

   « Est-ce que je gagne de l'argent si je suis les cabinets qui notent les
   entreprises ? » C'est une question qui se teste, et ce fichier la teste.

   Méthode : chaque avis daté est converti en note chiffrée, on reconstitue
   le consensus jour après jour (en ne gardant que l'avis le plus récent de
   chaque cabinet, et seulement s'il a moins de six mois), puis on rejoue une
   stratégie qui suit ce consensus — avec exactement les mêmes règles
   d'exécution et les mêmes frais que toutes les autres méthodes.

   Limite honnête : Yahoo fournit cet historique pour la plupart des valeurs
   américaines, presque jamais pour les valeurs européennes. Quand il manque,
   l'application le dit au lieu de laisser croire qu'il n'y a pas d'avis.
   ========================================================================= */

/* ------------------------------------------------------------------ */
/*  Conversion des notations en échelle chiffrée                       */
/*  Chaque cabinet a son propre vocabulaire : « Overweight » chez l'un */
/*  veut dire la même chose que « Buy » chez l'autre.                  */
/* ------------------------------------------------------------------ */

/** nombre au format francais : virgule decimale, jamais de point */
const nf = (x, d = 1) => (x === null || x === undefined || !isFinite(x)) ? 'n/d'
  : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

const ECHELLE = [
  [+2, ['strong buy', 'conviction buy', 'top pick', 'strong-buy']],
  [+1, ['buy', 'outperform', 'overweight', 'positive', 'add', 'accumulate',
        'market outperform', 'sector outperform', 'long-term buy', 'speculative buy']],
  [0, ['hold', 'neutral', 'market perform', 'sector weight', 'perform', 'equal-weight',
       'equal weight', 'in-line', 'peer perform', 'sector perform', 'mixed', 'fair value']],
  [-1, ['underperform', 'underweight', 'reduce', 'negative', 'sector underperform',
        'market underperform', 'below average', 'weak hold']],
  [-2, ['sell', 'strong sell', 'strong-sell']]
];

export function noteChiffree(texte) {
  if (!texte) return null;
  const t = String(texte).toLowerCase().trim();
  for (const [valeur, libelles] of ECHELLE) if (libelles.includes(t)) return valeur;
  // repli : on cherche un mot-clé, du plus précis au plus vague
  if (/strong\s*buy/.test(t)) return +2;
  if (/sell/.test(t)) return -2;
  if (/buy|outperform|overweight|positive/.test(t)) return +1;
  if (/underperform|underweight|reduce/.test(t)) return -1;
  if (/hold|neutral|perform|weight/.test(t)) return 0;
  return null;
}

export const LIBELLE_CONSENSUS = v =>
  v === null ? 'aucun avis'
    : v >= 1.2 ? 'achat marqué'
      : v >= 0.4 ? 'plutôt acheteur'
        : v > -0.4 ? 'partagé'
          : v > -1.2 ? 'plutôt vendeur'
            : 'vente marquée';

/* ------------------------------------------------------------------ */
/*  Reconstitution du consensus jour par jour                          */
/* ------------------------------------------------------------------ */
/**
 * @param dates      horodatages de la série de cotations (ms)
 * @param avis       [{date, cabinet, note, objectif}] triés par date
 * @param memoireJ   durée de validité d'un avis, en jours
 * @returns { consensus[], nbAvis[], objectif[] } alignés sur `dates`
 *
 * Règle anti-triche : à la date j, seuls les avis émis AVANT j sont pris en
 * compte. Un avis publié le jour même n'est utilisable que le lendemain,
 * comme n'importe quelle autre information de marché.
 */
export function consensusParJour(dates, avis, memoireJ = 180) {
  const n = dates.length;
  const consensus = new Array(n).fill(null);
  const nbAvis = new Array(n).fill(0);
  const objectif = new Array(n).fill(null);
  if (!avis || !avis.length) return { consensus, nbAvis, objectif };

  const memoireMs = memoireJ * 86400000;
  const propres = avis
    .map(a => ({ ...a, valeur: noteChiffree(a.note) }))
    .filter(a => a.valeur !== null && isFinite(a.date))
    .sort((a, b) => a.date - b.date);

  let curseur = 0;
  const dernierParCabinet = new Map();      // cabinet -> {date, valeur, objectif}

  for (let j = 0; j < n; j++) {
    const jour = dates[j];
    // on absorbe tous les avis STRICTEMENT antérieurs à la séance en cours
    while (curseur < propres.length && propres[curseur].date < jour) {
      const a = propres[curseur++];
      dernierParCabinet.set(a.cabinet, { date: a.date, valeur: a.valeur, objectif: a.objectif });
    }
    let somme = 0, compte = 0, sommeObj = 0, compteObj = 0;
    for (const [, v] of dernierParCabinet) {
      if (jour - v.date > memoireMs) continue;   // avis périmé : un cabinet muet depuis 6 mois ne compte plus
      somme += v.valeur; compte++;
      if (v.objectif > 0) { sommeObj += v.objectif; compteObj++; }
    }
    nbAvis[j] = compte;
    consensus[j] = compte ? somme / compte : null;
    objectif[j] = compteObj ? sommeObj / compteObj : null;
  }
  return { consensus, nbAvis, objectif };
}

/**
 * Attache le consensus à la série d'indicateurs.
 *
 * POINT IMPORTANT : on calcule aussi des seuils ADAPTATIFS, propres à chaque
 * valeur. Des seuils absolus (« investi si consensus > +1 ») ne fonctionnent
 * pas, et la raison est instructive : les cabinets ne disent presque jamais
 * « vendre ». Sur la plupart des titres le consensus oscille entre +0,3 et
 * +1,0 et ne descend jamais sous zéro. Un seuil absolu ne se déclencherait
 * donc jamais, et le test de contrôle ne prouverait rien.
 *
 * On compare donc le consensus du jour à SA PROPRE HISTOIRE sur les deux
 * années précédentes — uniquement le passé, jamais l'avenir.
 */
export function preparerAnalystes(ind, donnees) {
  const { consensus, nbAvis, objectif } = consensusParJour(ind.t, donnees?.avis || []);
  ind.consensus = consensus;
  ind.consensusNb = nbAvis;
  ind.consensusObjectif = objectif;
  ind.analystesDisponibles = !!donnees?.disponible;

  const n = ind.n;
  const rang = new Array(n).fill(null);     // position du jour dans sa propre histoire (0 → 1)
  const fenetre = 504;                      // deux ans de séances
  for (let i = 0; i < n; i++) {
    const c = consensus[i];
    if (c === null) continue;
    const passe = [];
    for (let j = Math.max(0, i - fenetre); j < i; j++) {
      if (consensus[j] !== null) passe.push(consensus[j]);
    }
    if (passe.length < 60) continue;        // pas assez de recul pour se situer
    let dessous = 0;
    for (const v of passe) if (v <= c) dessous++;
    rang[i] = dessous / passe.length;
  }
  ind.consensusRang = rang;

  // amplitude réellement observée : sert à dire si les cabinets ont déjà été négatifs
  const vus = consensus.filter(x => x !== null);
  ind.consensusMin = vus.length ? Math.min(...vus) : null;
  ind.consensusMax = vus.length ? Math.max(...vus) : null;
  ind.consensusJamaisNegatif = vus.length ? Math.min(...vus) >= 0 : null;
  return ind;
}

/* ------------------------------------------------------------------ */
/*  Les méthodes « suivre les analystes »                              */
/* ------------------------------------------------------------------ */
export const METHODES_ANALYSTES = [
  {
    id: 'analystes',
    nom: 'Suivre le consensus des analystes',
    famille: 'Avis d’experts',
    resume: 'Investi quand les cabinets sont plus optimistes que d’habitude sur cette valeur.',
    reference: 'Barber, Lehavy, McNichols & Trueman, « Can Investors Profit from the Prophets? » (Journal of Finance, 2001) : les titres les mieux notés surperforment effectivement les moins bien notés — mais l’écart disparaît une fois les frais de rotation déduits, parce qu’il faut se réajuster en permanence.',
    regles: [
      'Reconstituer chaque jour le consensus : moyenne des avis les plus récents de chaque cabinet.',
      'Un avis de plus de six mois est écarté : un cabinet silencieux ne vote plus.',
      'Comparer ce consensus à son propre niveau des deux années précédentes.',
      'Consensus dans la moitié haute de son histoire → investi.',
      'Consensus retombé dans le tiers bas → liquidités.',
      'Le seuil est adaptatif car les cabinets ne disent presque jamais « vendre » : un seuil fixe ne se déclencherait jamais.'
    ],
    besoinAnalystes: true,
    signal: (ind, i, mem) => {
      const r = ind.consensusRang?.[i];
      if (r === null || r === undefined) return 0;
      if (r > 0.5) mem.in = true;
      else if (r < 0.33) mem.in = false;
      return mem.in ? 1 : 0;
    }
  },
  {
    id: 'analystesStrict',
    nom: 'Suivre uniquement leurs plus fortes convictions',
    famille: 'Avis d’experts',
    resume: 'La version exigeante : investi seulement quand l’optimisme atteint son quart le plus haut.',
    reference: 'Variante calée sur le premier décile de Barber et al., le groupe où l’effet mesuré était le plus fort. Peu d’occasions, mais théoriquement les meilleures.',
    regles: [
      'Consensus dans le quart le plus optimiste de son histoire récente → investi.',
      'Retombé sous la médiane → sortie.',
      'Au moins trois cabinets actifs, sinon on s’abstient.'
    ],
    besoinAnalystes: true,
    signal: (ind, i, mem) => {
      const r = ind.consensusRang?.[i], nb = ind.consensusNb?.[i] || 0;
      if (r === null || r === undefined || nb < 3) return 0;
      if (r > 0.75) mem.in = true;
      else if (r < 0.5) mem.in = false;
      return mem.in ? 1 : 0;
    }
  },
  {
    id: 'contreAnalystes',
    nom: 'Faire l’inverse des analystes',
    famille: 'Avis d’experts',
    resume: 'Le test de contrôle : acheter quand ils sont moins optimistes que d’habitude.',
    reference: 'Présente pour une raison précise. Si « suivre » et « faire l’inverse » gagnent tous les deux, ce n’est pas l’avis qui est bon : c’est le titre qui monte. Sans ce garde-fou, on prendrait la hausse du marché pour du talent d’analyste.',
    regles: [
      'Consensus dans la moitié basse de son histoire récente → investi.',
      'Remonté au-dessus des deux tiers → liquidités.',
      'Sert de point de contrôle, pas de recommandation.'
    ],
    besoinAnalystes: true,
    signal: (ind, i, mem) => {
      const r = ind.consensusRang?.[i];
      if (r === null || r === undefined) return 0;
      if (r < 0.5) mem.in = true;
      else if (r > 0.67) mem.in = false;
      return mem.in ? 1 : 0;
    }
  }
];

/* ------------------------------------------------------------------ */
/*  Lecture de l'objectif de cours collectif                           */
/* ------------------------------------------------------------------ */
/**
 * Les cabinets publient aussi un objectif de cours. Le comparer au cours
 * réellement atteint un an plus tard mesure leur justesse — et cette mesure
 * est rarement flatteuse.
 */
export function justesseObjectifs(ind, horizon = 252) {
  const ecarts = [];
  for (let j = 0; j < ind.n - horizon; j++) {
    const obj = ind.consensusObjectif?.[j];
    if (!obj || !ind.c[j]) continue;
    if (j > 0 && ind.consensusObjectif[j - 1] === obj) continue;   // un point par révision
    const reel = ind.c[j + horizon];
    ecarts.push({
      date: ind.t[j],
      attendu: obj, hausseAttendue: 100 * (obj / ind.c[j] - 1),
      obtenu: reel, hausseObtenue: 100 * (reel / ind.c[j] - 1)
    });
  }
  if (ecarts.length < 8) return null;
  const moyAttendu = ecarts.reduce((s, e) => s + e.hausseAttendue, 0) / ecarts.length;
  const moyObtenu = ecarts.reduce((s, e) => s + e.hausseObtenue, 0) / ecarts.length;
  const atteints = ecarts.filter(e => e.hausseObtenue >= e.hausseAttendue).length;
  return {
    n: ecarts.length, moyAttendu, moyObtenu, biais: moyAttendu - moyObtenu,
    tauxAtteinte: 100 * atteints / ecarts.length,
    lecture: `Sur ${ecarts.length} révisions d'objectif, les cabinets attendaient en moyenne ` +
      `${moyAttendu >= 0 ? '+' : ''}${nf(moyAttendu, 1)} % à un an ; le titre a réellement fait ` +
      `${moyObtenu >= 0 ? '+' : ''}${nf(moyObtenu, 1)} %. ` +
      (Math.abs(moyAttendu - moyObtenu) < 3
        ? 'Les objectifs étaient globalement réalistes sur cette période.'
        : moyAttendu > moyObtenu
          ? `L'objectif a été trop optimiste de ${nf((moyAttendu - moyObtenu), 1)} points en moyenne — c'est le biais le mieux documenté du métier.`
          : `L'objectif a été trop prudent de ${nf((moyObtenu - moyAttendu), 1)} points en moyenne.`) +
      ` L'objectif n'a été atteint ou dépassé que dans ${nf((100 * atteints / ecarts.length), 0)} % des cas.`
  };
}
