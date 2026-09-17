/* =========================================================================
   AlphaDesk — simulateur de crise

   « Si une crise arrive, qu'est-ce qu'il se passe pour mon argent ? »

   Deux façons d'y répondre, et elles se complètent :

   1. REJOUER DE VRAIES CRISES. Les données existent : 2000, 2008, 2011,
      2020, 2022. On fait passer chaque méthode dedans et on regarde ce
      qu'elle a réellement encaissé. C'est la réponse la plus solide, parce
      qu'aucune hypothèse n'est inventée.

   2. INVENTER UN CHOC. Utile quand l'historique de la valeur est trop court,
      ou pour tester un scénario qui ne s'est pas encore produit. Le choc est
      calibré sur la volatilité réelle du titre — mais cela reste une
      simulation, et l'écran le dit clairement.

   Ce qui est mesuré n'est pas le rendement : c'est la PERTE ENCAISSÉE et le
   TEMPS DE RÉCUPÉRATION. Parce qu'une méthode ne se juge pas quand tout va
   bien — elle se juge le jour où l'on a envie de tout vendre.
   ========================================================================= */
import * as I from './indicators.js';
import { computeIndicators } from './engine.js';
import { runStrategy, prepareForStrategies } from './strategies.js';
import { preparerAnalystes } from './analystes.js';
import { TOUTES_METHODES } from './robustesse.js';

/* ------------------------------------------------------------------ */
/*  Les crises de référence                                            */
/* ------------------------------------------------------------------ */
export const CRISES = [
  {
    id: 'internet', court: '2000 – 2003', nom: 'Éclatement de la bulle internet',
    debut: '2000-03-01', fin: '2003-03-31',
    recit: 'Trois ans de baisse lente et continue, sans krach spectaculaire. Le pire scénario pour le moral : la chute est assez douce pour qu’on espère un rebond chaque mois, et assez longue pour tout emporter.',
    lecon: 'Les baisses lentes font plus de dégâts que les krachs, parce qu’on y reste.'
  },
  {
    id: 'subprimes', court: '2008', nom: 'Crise financière de 2008',
    debut: '2007-10-01', fin: '2009-03-31',
    recit: 'Dix-huit mois, une chute d’environ la moitié sur la plupart des marchés, avec des semaines où tout baissait en même temps — actions, immobilier, matières premières.',
    lecon: 'La diversification disparaît exactement quand on en a besoin.'
  },
  {
    id: 'dette', court: '2011', nom: 'Crise de la dette en zone euro',
    debut: '2011-05-01', fin: '2011-11-30',
    recit: 'Six mois violents, très concentrés sur l’Europe et les banques. Les valeurs américaines ont beaucoup moins souffert.',
    lecon: 'Une crise peut être régionale : votre exposition géographique compte autant que votre choix de titres.'
  },
  {
    id: 'covid', court: 'Covid 2020', nom: 'Krach du Covid',
    debut: '2020-02-14', fin: '2020-06-30',
    recit: 'La chute la plus rapide de l’histoire moderne — environ un tiers en cinq semaines — suivie d’un rebond presque aussi rapide.',
    lecon: 'Les méthodes lentes sortent après la chute et rentrent après le rebond : elles encaissent deux fois. Les krachs éclair sont leur pire ennemi.'
  },
  {
    id: 'inflation', court: '2022', nom: 'Remontée des taux de 2022',
    debut: '2022-01-01', fin: '2022-10-31',
    recit: 'Dix mois de baisse régulière provoquée par la hausse des taux. Les valeurs de croissance ont beaucoup plus souffert que les autres.',
    lecon: 'Quand le loyer de l’argent monte, ce qui avait le plus monté baisse le plus.'
  }
];

/* ------------------------------------------------------------------ */
/*  Scénarios inventés                                                 */
/* ------------------------------------------------------------------ */
export const SCENARIOS = [
  {
    id: 'krachEclair', nom: 'Krach éclair', duree: 25,
    baisse: -0.32, forme: 'brutal', rebond: 0,
    recit: 'Un tiers perdu en cinq semaines, puis le marché reste au tapis. C’est la forme du Covid sans le rebond.',
    test: 'Est-ce que votre méthode a le temps de réagir ?'
  },
  {
    id: 'baisseLente', nom: 'Baisse lente d’un an', duree: 250,
    baisse: -0.40, forme: 'lent', rebond: 0,
    recit: 'Quarante pour cent perdus sur douze mois, par petites touches. Aucune journée n’est dramatique ; l’année l’est.',
    test: 'Est-ce que votre méthode sort avant d’avoir tout perdu ?'
  },
  {
    id: 'chocEnV', nom: 'Choc en V', duree: 80,
    baisse: -0.28, forme: 'brutal', rebond: 1.0,
    recit: 'Chute brutale puis récupération complète en trois mois.',
    test: 'Est-ce que votre méthode vous fait rater le rebond ? C’est le piège le plus coûteux du suivi de tendance.'
  },
  {
    id: 'stagnation', nom: 'Trois ans sans direction', duree: 750,
    baisse: -0.02, forme: 'plat', rebond: 0,
    recit: 'Le marché finit où il a commencé, après trois ans de va-et-vient.',
    test: 'Est-ce que votre méthode se fait grignoter par les frais et les faux signaux ?'
  }
];

/* ------------------------------------------------------------------ */
/*  1. Rejouer les vraies crises                                       */
/* ------------------------------------------------------------------ */
/**
 * @param data        série longue (idéalement depuis 2000, en quotidien)
 * @param analystes   avis datés, facultatif
 */
export async function rejouerCrises(data, opts = {}, profile = null, analystes = null, onProgress) {
  const ind = computeIndicators(data.series);
  if (ind.n < 400) return { error: `Historique trop court (${ind.n} séances). Il faut charger une période longue pour traverser une crise.` };
  prepareForStrategies(ind);
  preparerAnalystes(ind, analystes);

  const methodes = TOUTES_METHODES.filter(m => !m.besoinAnalystes || analystes?.disponible);

  // couverture : quelles crises la série traverse-t-elle réellement ?
  const couvertes = CRISES.map(c => {
    const d = Date.parse(c.debut), f = Date.parse(c.fin);
    const i0 = ind.t.findIndex(x => x >= d);
    let i1 = ind.t.findIndex(x => x >= f);
    if (i1 < 0) i1 = ind.t.length - 1;
    const complet = i0 > 0 && i1 > i0 + 15;
    return { ...c, i0, i1, complet, seances: complet ? i1 - i0 : 0 };
  }).filter(c => c.complet);

  if (!couvertes.length) {
    return {
      error: 'Aucune grande crise n’est couverte par l’historique chargé.',
      conseil: 'Choisissez « Maximum » dans la barre du haut : le serveur ira chercher les données quotidiennes depuis 2000.'
    };
  }

  const resultats = [];
  let fait = 0;
  for (const m of methodes) {
    const r = await runStrategy(ind, m, { ...opts, start: 260 }, profile);
    fait++;
    if (onProgress) { onProgress(fait / methodes.length, m.nom); await new Promise(x => setTimeout(x, 0)); }
    if (!r.ok) continue;

    // on reconstruit une courbe de capital indexée sur les indices d'origine
    const capital = new Array(ind.n).fill(null);
    const investiParJour = new Array(ind.n).fill(0);
    const parDate = new Map();
    r.equity.dates.forEach((d, k) => parDate.set(d, r.equity.values[k]));
    for (let j = 0; j < ind.n; j++) {
      const v = parDate.get(ind.t[j]);
      if (v !== undefined) capital[j] = v;
    }
    // journal des séances réellement investies, déduit des opérations
    for (const t of (r.trades || [])) {
      for (let j = t.entryIdx; j <= t.exitIdx && j < ind.n; j++) investiParJour[j] = 1;
    }

    const parCrise = couvertes.map(c => mesurerCrise(ind, capital, c, investiParJour));
    resultats.push({
      id: m.id, nom: m.nom, famille: m.famille, resume: m.resume,
      global: { rendement: r.rendement, maxDrawdown: r.maxDrawdown, exposition: r.exposition },
      crises: parCrise,
      pireCrise: parCrise.length ? parCrise.reduce((a, b) => (b.perteMax ?? 0) < (a.perteMax ?? 0) ? b : a) : null,
      perteMoyenne: I.mean(parCrise.map(x => x.perteMax).filter(x => x !== null)),
      expositionCrises: I.mean(parCrise.map(x => x.expositionCrise).filter(x => x !== null))
    });
  }
  if (onProgress) onProgress(1, '');

  const ref = resultats.find(x => x.id === 'buyhold');
  for (const r of resultats) {
    r.ecartVsDetention = ref ? r.perteMoyenne - ref.perteMoyenne : null;   // positif = a mieux résisté
  }
  resultats.sort((a, b) => (b.perteMoyenne ?? -999) - (a.perteMoyenne ?? -999));

  return { ok: true, crises: couvertes, resultats, reference: ref, lecture: lireCrises(resultats, ref, couvertes) };
}

/** Mesures d'une méthode sur une fenêtre de crise. */
function mesurerCrise(ind, capital, c, investiParJour) {
  let pic = -Infinity, perteMax = 0, points = 0, investi = 0;
  let valeurAvant = null;
  for (let j = c.i0; j <= c.i1; j++) {
    const v = capital[j];
    if (v === null) continue;
    if (valeurAvant === null) valeurAvant = v;
    pic = Math.max(pic, v);
    perteMax = Math.min(perteMax, (v - pic) / pic);
    if (investiParJour && investiParJour[j]) investi++;
    points++;
  }
  const valeurApres = capital[c.i1];
  // temps de récupération : combien de séances pour retrouver le niveau d'avant-crise
  let recuperation = null;
  if (valeurAvant !== null) {
    for (let j = c.i1; j < ind.n; j++) {
      if (capital[j] !== null && capital[j] >= valeurAvant) { recuperation = j - c.i1; break; }
    }
  }
  // part du temps réellement exposé pendant la crise
  const titrePic = Math.max(...ind.c.slice(c.i0, c.i1 + 1));
  let titrePerte = 0, p2 = -Infinity;
  for (let j = c.i0; j <= c.i1; j++) { p2 = Math.max(p2, ind.c[j]); titrePerte = Math.min(titrePerte, (ind.c[j] - p2) / p2); }

  return {
    id: c.id, nom: c.nom, court: c.court, debut: ind.t[c.i0], fin: ind.t[c.i1], seances: c.seances,
    perteMax: points ? perteMax * 100 : null,
    resultat: (valeurAvant && valeurApres) ? 100 * (valeurApres / valeurAvant - 1) : null,
    perteTitre: titrePerte * 100,
    /* Sans cette mesure, une méthode qui n'était tout simplement pas investie
       apparaîtrait comme la championne de la résistance aux crises. */
    expositionCrise: points ? 100 * investi / points : null,
    recuperation, points
  };
}

function lireCrises(resultats, ref, crises) {
  if (!resultats.length || !ref) return 'Pas assez de résultats.';
  /* Une méthode qui n'était presque jamais investie « résiste » à toutes les
     crises sans mérite : on ne la retient comme championne que si elle a
     réellement participé au marché au moins un tiers du temps. */
  const participantes = resultats.filter(r => (r.expositionCrises ?? 0) >= 33 || r.id === 'buyhold');
  const meilleur = participantes[0] || resultats[0];
  const absents = resultats.filter(r => r.id !== 'buyhold' && (r.expositionCrises ?? 0) < 33);
  const nf = (x, d = 1) => (x === null || x === undefined || !isFinite(x)) ? 'n/d'
    : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = x => (x === null || !isFinite(x)) ? 'n/d' : `${nf(x)} %`;
  const noms = crises.map(c => c.nom.toLowerCase()).join(', ');

  let t = `Les crises traversées par cet historique : ${noms}. `;
  t += `En moyenne sur ces épisodes, ne rien faire a coûté ${pct(ref.perteMoyenne)} de perte maximale. `;
  if (meilleur.id === 'buyhold') {
    t += `Aucune méthode n’a fait mieux — ce qui arrive quand les crises testées ont été suivies de rebonds rapides : sortir coûte alors plus cher que rester.`;
  } else {
    t += `« ${meilleur.nom} » a le mieux résisté, avec ${pct(meilleur.perteMoyenne)} — soit ${pct(Math.abs(meilleur.perteMoyenne - ref.perteMoyenne))} de souffrance en moins. `;
    const rec = meilleur.crises.map(c => c.recuperation).filter(x => x !== null);
    if (rec.length) {
      const r2 = ref.crises.map(c => c.recuperation).filter(x => x !== null);
      t += `Il lui a fallu en médiane ${dureeLisible(I.median(rec))} pour effacer la baisse, contre ` +
        `${r2.length ? dureeLisible(I.median(r2)) : 'n/d'} sans rien faire. `;
    }
    t += `Elle était investie ${nf(meilleur.expositionCrises ?? 0, 0)} % du temps pendant ces épisodes.`;
  }
  if (absents.length) {
    t += ` À noter : ${absents.map(a => `« ${a.nom} »`).join(', ')} ` +
      `${absents.length > 1 ? 'affichent' : 'affiche'} de très faibles pertes, mais simplement parce que ` +
      `${absents.length > 1 ? 'ces méthodes n\'étaient' : 'cette méthode n\'était'} quasiment pas investie pendant ces périodes. ` +
      `Ne pas jouer n'est pas gagner : ces lignes sont écartées du verdict.`;
  }
  return t;
}

/** 1680 séances ne parle à personne : on traduit en années et mois. */
export function dureeLisible(seances) {
  if (seances === null || seances === undefined || !isFinite(seances)) return 'jamais';
  const s = Math.round(seances);
  if (s <= 0) return 'aucun délai';
  if (s < 22) return `${s} séance${s > 1 ? 's' : ''}`;
  const mois = s / 21;
  if (mois < 18) return `environ ${Math.round(mois)} mois`;
  const ans = mois / 12;
  return `environ ${ans.toFixed(ans < 3 ? 1 : 0)} an${ans >= 2 ? 's' : ''}`;
}

/* ------------------------------------------------------------------ */
/*  2. Inventer un choc et le faire subir aux méthodes                 */
/* ------------------------------------------------------------------ */
/**
 * Prolonge la série réelle par un scénario scripté, puis rejoue les méthodes.
 * Le bruit quotidien est calibré sur la volatilité observée du titre, pour
 * que le scénario ressemble à ce titre-là et pas à un titre théorique.
 */
export function fabriquerScenario(series, scenario, graine = 12345) {
  const n = series.c.length;
  const rnd = generateurPseudoAleatoire(graine);
  // volatilité quotidienne récente, pour un bruit réaliste
  const rets = [];
  for (let i = Math.max(1, n - 250); i < n; i++) rets.push(Math.log(series.c[i] / series.c[i - 1]));
  const sigma = I.stdev(rets, true) || 0.015;

  const out = {
    t: [...series.t], o: [...series.o], h: [...series.h],
    l: [...series.l], c: [...series.c], v: [...series.v]
  };
  let prix = series.c[n - 1];
  let date = series.t[n - 1];
  const D = scenario.duree;

  for (let k = 1; k <= D; k++) {
    const avancement = k / D;
    let cible;
    if (scenario.forme === 'brutal') {
      // l'essentiel de la chute dans le premier tiers
      const p = Math.min(1, avancement * 3);
      cible = 1 + scenario.baisse * (1 - Math.pow(1 - p, 2));
      if (scenario.rebond > 0 && avancement > 0.35) {
        const pr = (avancement - 0.35) / 0.65;
        cible = 1 + scenario.baisse * (1 - scenario.rebond * pr);
      }
    } else if (scenario.forme === 'lent') {
      cible = 1 + scenario.baisse * avancement;
    } else {
      cible = 1 + scenario.baisse * avancement;   // plat : dérive quasi nulle
    }
    const base = series.c[n - 1] * cible;
    const bruit = Math.exp((rnd() - 0.5) * 2 * sigma * (scenario.forme === 'plat' ? 1.4 : 1.1));
    prix = base * bruit;

    date += 86400000 * (new Date(date).getUTCDay() === 5 ? 3 : 1);   // on saute les week-ends
    const amplitude = prix * sigma * 1.2;
    out.t.push(date);
    out.o.push(prix + (rnd() - 0.5) * amplitude);
    out.h.push(prix + Math.abs(rnd()) * amplitude);
    out.l.push(prix - Math.abs(rnd()) * amplitude);
    out.c.push(prix);
    out.v.push(series.v[n - 1] * (0.8 + rnd() * (scenario.forme === 'brutal' ? 2.5 : 0.8)));
  }
  return { series: out, debutScenario: n, finScenario: n + D };
}

function generateurPseudoAleatoire(graine) {
  // générateur déterministe : le même scénario redonne toujours le même
  // résultat, sinon on ne pourrait pas comparer deux méthodes équitablement
  let s = graine >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export async function simulerScenario(data, scenario, opts = {}, profile = null, analystes = null, onProgress) {
  const { series, debutScenario, finScenario } = fabriquerScenario(data.series, scenario);
  const ind = computeIndicators(series);
  if (debutScenario < 320) return { error: 'Historique réel trop court pour amorcer les méthodes avant le scénario.' };
  prepareForStrategies(ind);
  preparerAnalystes(ind, analystes);

  const methodes = TOUTES_METHODES.filter(m => !m.besoinAnalystes || analystes?.disponible);
  const resultats = [];
  let fait = 0;

  for (const m of methodes) {
    const r = await runStrategy(ind, m, { ...opts, start: 300 }, profile);
    fait++;
    if (onProgress) { onProgress(fait / methodes.length, m.nom); await new Promise(x => setTimeout(x, 0)); }
    if (!r.ok) continue;

    const capital = new Array(ind.n).fill(null);
    const parDate = new Map();
    r.equity.dates.forEach((d, k) => parDate.set(d, r.equity.values[k]));
    for (let j = 0; j < ind.n; j++) {
      const v = parDate.get(ind.t[j]);
      if (v !== undefined) capital[j] = v;
    }
    /* Exposition PENDANT LE CHOC, et pas sur toute l'histoire : une méthode
       sortie du marché avant le scénario afficherait sinon « 0 % de perte »
       tout en semblant investie la moitié du temps. Ne pas jouer n'est pas
       gagner — il faut que la colonne le dise. */
    const investiParJour = new Array(ind.n).fill(0);
    for (const t of (r.trades || [])) {
      for (let j = t.entryIdx; j <= t.exitIdx && j < ind.n; j++) investiParJour[j] = 1;
    }

    const avant = capital[debutScenario - 1];
    const apres = capital[Math.min(finScenario - 1, ind.n - 1)];
    let pic = -Infinity, perteMax = 0, investi = 0, points = 0;
    for (let j = debutScenario; j < Math.min(finScenario, ind.n); j++) {
      const v = capital[j]; if (v === null) continue;
      pic = Math.max(pic, v);
      perteMax = Math.min(perteMax, (v - pic) / pic);
      if (investiParJour[j]) investi++;
      points++;
    }
    resultats.push({
      id: m.id, nom: m.nom, famille: m.famille,
      resultat: (avant && apres) ? 100 * (apres / avant - 1) : null,
      perteMax: points ? perteMax * 100 : null,
      exposition: r.exposition,
      expositionScenario: points ? 100 * investi / points : null
    });
  }
  if (onProgress) onProgress(1, '');

  const ref = resultats.find(x => x.id === 'buyhold');
  const chuteTitre = 100 * (series.c[Math.min(finScenario - 1, series.c.length - 1)] / series.c[debutScenario - 1] - 1);
  /* Les méthodes qui ont réellement traversé le choc passent devant : sinon
     le haut du tableau contredirait le verdict, qui les écarte. */
  resultats.sort((a, b) => {
    const pa = (a.expositionScenario ?? 0) >= 20 || a.id === 'buyhold';
    const pb = (b.expositionScenario ?? 0) >= 20 || b.id === 'buyhold';
    if (pa !== pb) return pa ? -1 : 1;
    return (b.resultat ?? -999) - (a.resultat ?? -999);
  });

  return {
    ok: true, scenario, chuteTitre, resultats, reference: ref,
    serie: { t: series.t, c: series.c, debutScenario, finScenario },
    lecture: lireScenario(resultats, ref, scenario, chuteTitre)
  };
}

function lireScenario(resultats, ref, scenario, chuteTitre) {
  if (!resultats.length) return 'Aucun résultat.';
  const absents = resultats.filter(r => r.id !== 'buyhold' && (r.expositionScenario ?? 0) < 20);
  const presentes = resultats.filter(r => (r.expositionScenario ?? 0) >= 20 || r.id === 'buyhold');
  const nf = (x, d = 1) => (x === null || x === undefined || !isFinite(x)) ? 'n/d'
    : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const pct = x => (x === null || !isFinite(x)) ? 'n/d' : `${x >= 0 ? '+' : ''}${nf(x)} %`;
  const meilleur = presentes[0] || resultats[0];
  let t = `Dans ce scénario, le titre lui-même fait ${pct(chuteTitre)}. `;
  t += `Sans rien faire, votre capital suit : ${pct(ref?.resultat)}. `;
  if (meilleur.id === 'buyhold') {
    t += `Aucune méthode ne fait mieux ici. `;
    t += scenario.rebond > 0
      ? `C’est attendu sur un choc en V : toutes les méthodes de sortie vendent au plus bas et ratent la remontée. C’est le prix de la protection.`
      : `Les méthodes testées n’ont pas réagi assez vite pour ce profil de baisse.`;
  } else {
    t += `« ${meilleur.nom} » s’en sort le mieux avec ${pct(meilleur.resultat)}, `;
    t += `soit ${pct(meilleur.resultat - (ref?.resultat ?? 0))} de mieux que ne rien faire. `;
    t += `Elle est restée investie ${nf(meilleur.expositionScenario ?? 0, 0)} % du choc.`;
  }
  if (absents.length) {
    t += ` ${absents.length > 1 ? `${absents.length} méthodes affichent` : 'Une méthode affiche'} un résultat flatteur ` +
      `(${absents.slice(0, 3).map(a => `« ${a.nom} »`).join(', ')}) simplement parce ` +
      `${absents.length > 1 ? 'qu’elles étaient déjà sorties' : 'qu’elle était déjà sortie'} avant le choc. ` +
      `${absents.length > 1 ? 'Elles sont écartées' : 'Elle est écartée'} du verdict : ne pas jouer n’est pas gagner.`;
  }
  t += ` Rappel : ce scénario est une simulation calibrée sur la volatilité réelle du titre, pas une prévision. Il sert à voir COMMENT une méthode réagit, pas à deviner ce qui va arriver.`;
  return t;
}
