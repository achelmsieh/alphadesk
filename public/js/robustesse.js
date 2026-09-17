/* =========================================================================
   AlphaDesk — épreuve de robustesse

   Une méthode qui gagne sur UNE valeur et UNE période n'a rien prouvé :
   sur dix méthodes testées, il s'en trouve toujours une qui gagne par
   hasard. La seule question qui compte est : « est-ce que cette méthode
   gagne AUSSI ailleurs ? »

   Ce fichier rejoue donc chaque méthode sur plusieurs valeurs à la fois et
   ne retient que ce qui se répète. Une méthode qui gagne partout mérite
   d'être suivie. Une méthode qui gagne une fois sur deux est une pièce de
   monnaie avec un nom savant.
   ========================================================================= */
import * as I from './indicators.js';
import { computeIndicators } from './engine.js';
import { METHODES, runStrategy, prepareForStrategies } from './strategies.js';
import { METHODES_ANALYSTES, preparerAnalystes } from './analystes.js';


/** nombre au format francais : virgule decimale, jamais de point */
const nf = (x, d = 1) => (x === null || x === undefined || !isFinite(x)) ? 'n/d'
  : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

export const TOUTES_METHODES = [...METHODES, ...METHODES_ANALYSTES];

/* ------------------------------------------------------------------ */
/*  Exécution : N valeurs × M méthodes                                 */
/* ------------------------------------------------------------------ */
/**
 * @param jeux    [{symbol, nom, data, analystes}] séries déjà téléchargées
 * @param opts    { feeBps, slippageBps, capital, start }
 */
export async function epreuveRobustesse(jeux, opts = {}, profile = null, onProgress) {
  const methodes = TOUTES_METHODES.filter(m => {
    if (!m.besoinAnalystes) return true;
    // une méthode « analystes » n'a de sens que si au moins une valeur en a
    return jeux.some(j => j.analystes?.disponible);
  });

  const parMethode = new Map(methodes.map(m => [m.id, { methode: m, lignes: [] }]));
  const valeursRetenues = [];
  const valeursEcartees = [];
  const total = jeux.length * methodes.length;
  let fait = 0;

  for (const jeu of jeux) {
    let ind;
    try {
      ind = computeIndicators(jeu.data.series);
      if (ind.n < 320) { valeursEcartees.push({ symbol: jeu.symbol, raison: `${ind.n} séances seulement` }); continue; }
      prepareForStrategies(ind);
      preparerAnalystes(ind, jeu.analystes);
    } catch (e) {
      valeursEcartees.push({ symbol: jeu.symbol, raison: 'données inexploitables' });
      continue;
    }

    const annees = (ind.t[ind.n - 1] - ind.t[0]) / (365.25 * 24 * 3600 * 1000);
    valeursRetenues.push({
      symbol: jeu.symbol, nom: jeu.nom || jeu.symbol, seances: ind.n, annees,
      debut: ind.t[0], fin: ind.t[ind.n - 1],
      analystes: !!jeu.analystes?.disponible
    });

    let ref = null;
    for (const m of methodes) {
      if (m.besoinAnalystes && !jeu.analystes?.disponible) { fait++; continue; }
      const r = await runStrategy(ind, m, opts, profile);
      fait++;
      if (onProgress && fait % 3 === 0) {
        onProgress(fait / total, `${jeu.symbol} · ${m.nom}`);
        await new Promise(res => setTimeout(res, 0));
      }
      if (!r.ok) continue;
      if (m.id === 'buyhold') ref = r;
      parMethode.get(m.id).lignes.push({
        symbol: jeu.symbol, nom: jeu.nom || jeu.symbol, annees,
        rendement: r.rendement, cagr: r.cagr, maxDrawdown: r.maxDrawdown,
        sharpe: r.sharpe, calmar: r.calmar, exposition: r.exposition,
        operations: r.operations, tauxReussite: r.tauxReussite, facteurProfit: r.facteurProfit
      });
    }
    /* Écarts par rapport à la simple détention, valeur par valeur.

       POINT MÉTHODOLOGIQUE : sur un historique long, les rendements
       composent. Soustraire deux rendements CUMULÉS (« +520 % contre
       +87 % ») donne un écart de plusieurs centaines de points qui ne
       veut rien dire et écrase tout le reste. La comparaison se fait
       donc en rendement ANNUEL, qui reste lisible quelle que soit la
       durée : « 2,3 points de moins par an » se comprend. */
    if (ref) {
      for (const [, bloc] of parMethode) {
        const l = bloc.lignes.find(x => x.symbol === jeu.symbol);
        if (!l) continue;
        l.refCagr = ref.cagr; l.refRendement = ref.rendement;
        l.refRepli = ref.maxDrawdown; l.refCalmar = ref.calmar;
        l.ecart = l.rendement - ref.rendement;                    // conservé, non affiché
        l.ecartAnnuel = (l.cagr !== null && ref.cagr !== null) ? l.cagr - ref.cagr : null;
        l.ecartRepli = Math.abs(ref.maxDrawdown) - Math.abs(l.maxDrawdown);
        l.bat = l.ecartAnnuel !== null ? l.ecartAnnuel > 0 : l.ecart > 0;
        l.protege = l.ecartRepli > 0;
        // meilleur « rapport gain / souffrance » : le critère le plus honnête
        l.meilleurRapport = (l.calmar !== null && ref.calmar !== null) && l.calmar > ref.calmar;
      }
    }
  }
  if (onProgress) onProgress(1, '');

  const resultats = [...parMethode.values()]
    .filter(b => b.lignes.length)
    .map(b => synthetiser(b.methode, b.lignes));

  const reference = resultats.find(r => r.id === 'buyhold');
  for (const r of resultats) r.robustesse = indiceRobustesse(r, valeursRetenues.length);
  resultats.sort((a, b) => b.robustesse.note - a.robustesse.note);

  return {
    resultats, reference,
    valeurs: valeursRetenues, ecartees: valeursEcartees,
    fiabilite: jugerFiabilite(valeursRetenues),
    verdict: verdictGlobal(resultats, reference, valeursRetenues)
  };
}

/* ------------------------------------------------------------------ */
/*  Synthèse d'une méthode sur l'ensemble des valeurs                  */
/* ------------------------------------------------------------------ */
function synthetiser(methode, lignes) {
  const med = cle => I.median(lignes.map(l => l[cle]).filter(x => x !== null && isFinite(x)));
  const avecEcart = lignes.filter(l => l.ecart !== undefined);
  const gagnees = avecEcart.filter(l => l.bat).length;
  const protegees = avecEcart.filter(l => l.protege).length;
  const mieuxNotees = avecEcart.filter(l => l.meilleurRapport).length;
  const ecarts = avecEcart.map(l => l.ecartAnnuel).filter(x => x !== null && isFinite(x));

  /* Le gain médian d'une méthode testée sur un sous-ensemble ne se compare
     pas au gain médian de la référence sur le panier entier : on calcule
     donc AUSSI la référence restreinte aux mêmes valeurs. */
  const refMemeSousEnsemble = avecEcart.length
    ? I.median(avecEcart.map(l => l.rendement - l.ecart))
    : null;

  return {
    id: methode.id, nom: methode.nom, famille: methode.famille,
    resume: methode.resume, regles: methode.regles, reference: methode.reference,
    lignes,
    nbValeurs: lignes.length,
    referenceMedianeComparable: refMemeSousEnsemble,
    rendementMedian: med('rendement'),
    cagrMedian: med('cagr'),
    repliMedian: med('maxDrawdown'),
    sharpeMedian: med('sharpe'),
    calmarMedian: med('calmar'),
    expositionMedian: med('exposition'),
    operationsMedian: med('operations'),
    // ce qui compte vraiment : la régularité d'une valeur à l'autre
    tauxVictoire: avecEcart.length ? 100 * gagnees / avecEcart.length : null,
    tauxProtection: avecEcart.length ? 100 * protegees / avecEcart.length : null,
    ecartMedian: ecarts.length ? I.median(ecarts) : null,     // en points de rendement ANNUEL
    ecartPire: ecarts.length ? Math.min(...ecarts) : null,
    ecartMeilleur: ecarts.length ? Math.max(...ecarts) : null,
    dispersion: ecarts.length > 2 ? I.stdev(ecarts, true) : null,
    tauxMeilleurRapport: avecEcart.length ? 100 * mieuxNotees / avecEcart.length : null,
    gagnees, protegees, mieuxNotees, testees: avecEcart.length
  };
}

/* ------------------------------------------------------------------ */
/*  L'indice de robustesse                                             */
/* ------------------------------------------------------------------ */
/**
 * Note sur 100 qui répond à « puis-je m'appuyer sur cette méthode ? ».
 * Elle ne récompense PAS la performance : une méthode qui explose sur une
 * valeur et s'effondre sur les neuf autres doit être mal notée, parce qu'on
 * ne peut pas savoir à l'avance sur laquelle on tombera.
 */
export function indiceRobustesse(r, nbValeurs) {
  if (r.id === 'buyhold') {
    return {
      note: null, label: 'Référence',
      explication: 'C’est le point de comparaison : acheter et ne rien faire. Toute méthode doit faire mieux que lui pour mériter le temps qu’elle coûte.'
    };
  }
  const parts = [];
  const ajoute = (nom, obtenu, max, detail) => parts.push({ nom, obtenu, max, detail });
  const expo = r.expositionMedian ?? 0;
  const participation = I.clamp(expo / 45, 0, 1);

  /* 1. Meilleur rapport entre le gain et la souffrance (35 points)
     C'est le critère central, et il remplace « bat en rendement total ».
     Raison : sur vingt ans, la simple détention gagne presque toujours en
     rendement brut — juger là-dessus reviendrait à recaler toutes les
     méthodes à zéro sans rien apprendre. La vraie question est : pour
     chaque unité de perte encaissée en route, laquelle a rapporté le plus ? */
  const tr = r.tauxMeilleurRapport ?? 0;
  ajoute('Meilleur rapport gain / souffrance', (tr / 100) * 35, 35,
    `offre un meilleur rapport que la simple détention sur ${r.mieuxNotees} valeur${r.mieuxNotees > 1 ? 's' : ''} sur ${r.testees}`);

  /* 2. Protection en cas de baisse (25 points)
     PIÈGE ÉVITÉ ICI : une méthode qui reste en liquidités protège de tout,
     trivialement, en ne participant à rien. Sans correctif, « ne jamais
     investir » obtiendrait la note maximale. On pondère donc par la
     participation réelle. */
  const tp = r.tauxProtection ?? 0;
  ajoute('Réduit les pertes', (tp / 100) * 25 * participation, 25,
    participation < 0.9
      ? `limite le repli sur ${r.protegees} valeur${r.protegees > 1 ? 's' : ''} sur ${r.testees}, mais n'est investie que ${nf(expo, 0)} % du temps — la protection compte donc moins`
      : `limite le repli sur ${r.protegees} valeur${r.protegees > 1 ? 's' : ''} sur ${r.testees}`);

  /* 3. Ce que la méthode coûte en rendement annuel (20 points)
     Perdre un peu de rendement pour beaucoup moins de souffrance est un bon
     échange : on ne sanctionne donc vraiment qu'au-delà de 4 points par an. */
  const em = r.ecartMedian ?? 0;
  ajoute('Coût en rendement annuel',
    I.clamp((em + 4) / 4, 0, 1) * 20, 20,
    em >= 0
      ? `rapporte ${nf(em, 1)} point${Math.abs(em) > 1 ? 's' : ''} de plus par an que la simple détention`
      : `coûte ${nf(Math.abs(em), 1)} point${Math.abs(em) > 1 ? 's' : ''} de rendement par an`);

  // 4. Constance d'une valeur à l'autre (20 points)
  const disp = r.dispersion;
  ajoute('Constance d’une valeur à l’autre',
    disp === null ? 9 : I.clamp(1 - disp / 12, 0, 1) * 20, 20,
    disp === null ? 'trop peu de valeurs pour la mesurer'
      : `les écarts annuels vont de ${nf(r.ecartPire, 1)} à ${r.ecartMeilleur >= 0 ? '+' : ''}${nf(r.ecartMeilleur, 1)} points`);

  const note = Math.round(parts.reduce((s, p) => s + p.obtenu, 0));

  /* Pénalité de confiance calculée sur le nombre de valeurs où CETTE méthode
     a réellement pu tourner — pas sur la taille du panier. Sans cela, une
     méthode évaluée sur 4 valeurs serait comparée d'égal à égal avec une
     méthode évaluée sur 10, ce qui la favorise indûment. */
  const testees = r.testees || r.nbValeurs || 0;
  const confiance = I.clamp(testees / 8, 0.35, 1);
  const noteFinale = Math.round(note * confiance);
  const partiel = testees < nbValeurs;

  return {
    note: noteFinale, brute: note, parts, confiance, testees, partiel,
    label: noteFinale >= 65 ? 'Solide' : noteFinale >= 45 ? 'Correcte' : noteFinale >= 28 ? 'Fragile' : 'À écarter',
    explication: (partiel
      ? `Attention : cette méthode n'a pu être testée que sur ${testees} des ${nbValeurs} valeurs du panier — sa note en tient compte, mais la comparaison reste moins solide que pour les autres. `
      : '') + (noteFinale >= 65
        ? 'Elle tient sur la majorité des valeurs testées, pas seulement sur une. C’est le profil d’une méthode sur laquelle on peut bâtir.'
        : noteFinale >= 45
          ? 'Elle fonctionne plus souvent qu’elle n’échoue, sans être régulière. Utilisable, mais à surveiller.'
          : noteFinale >= 28
            ? 'Elle gagne parfois, perd souvent. Difficile de savoir à l’avance dans quel cas on se trouve.'
            : 'Sur ces valeurs, elle ne fait pas mieux que le hasard. Ne pas s’appuyer dessus.')
  };
}

/* ------------------------------------------------------------------ */
/*  Fiabilité de l'épreuve elle-même                                   */
/* ------------------------------------------------------------------ */
function jugerFiabilite(valeurs) {
  const n = valeurs.length;
  const anneesMin = n ? Math.min(...valeurs.map(v => v.annees)) : 0;
  const anneesMed = n ? I.median(valeurs.map(v => v.annees)) : 0;

  let note = 0;
  note += I.clamp(n / 10, 0, 1) * 50;           // nombre de valeurs
  note += I.clamp(anneesMed / 15, 0, 1) * 35;   // profondeur d'historique
  note += I.clamp(anneesMin / 8, 0, 1) * 15;    // aucune valeur trop courte
  note = Math.round(note);

  return {
    note, nbValeurs: n, anneesMediane: anneesMed, anneesMin,
    niveau: note >= 70 ? 'solide' : note >= 45 ? 'correcte' : note >= 25 ? 'faible' : 'insuffisante',
    texte: n < 3
      ? `Avec seulement ${n} valeur${n > 1 ? 's' : ''}, ce classement ne prouve rien du tout. Ajoutez-en au moins cinq.`
      : n < 6
        ? `${n} valeurs, c’est un début mais c’est peu : une seule valeur atypique peut renverser le classement. Visez huit à dix.`
        : anneesMed < 8
          ? `${n} valeurs sur environ ${nf(anneesMed, 0)} ans chacune. Le nombre est bon, mais l’historique ne couvre probablement pas de vraie crise — testez sur une période plus longue.`
          : `${n} valeurs sur environ ${nf(anneesMed, 0)} ans chacune : l’échantillon est assez large et assez profond pour que le classement veuille dire quelque chose.`
  };
}

/* ------------------------------------------------------------------ */
/*  Le verdict, en langage de tous les jours                           */
/* ------------------------------------------------------------------ */
function verdictGlobal(resultats, reference, valeurs) {
  const candidates = resultats.filter(r => r.id !== 'buyhold' && r.robustesse.note !== null);
  if (!candidates.length || !reference) {
    return { titre: 'Pas assez de résultats', texte: 'Aucune méthode n’a pu être testée sur suffisamment de valeurs.' };
  }
  const meilleure = candidates[0];
  const solides = candidates.filter(r => r.robustesse.note >= 65);
  const correctes = candidates.filter(r => r.robustesse.note >= 45);
  const nulles = candidates.filter(r => r.robustesse.note < 28);
  const n = valeurs.length;
  const pct = x => (x === null || !isFinite(x)) ? 'n/d' : `${x >= 0 ? '+' : ''}${nf(x)} %`;

  let texte = `Sur ${n} valeur${n > 1 ? 's' : ''}, `;
  if (!solides.length && !correctes.length) {
    texte += `aucune méthode ne se détache. La mieux classée est « ${meilleure.nom} » avec ${meilleure.robustesse.note}/100, `;
    texte += `ce qui ne suffit pas à s’y fier. `;
    texte += `Dans ce cas de figure, la décision raisonnable est de s’en tenir à la solution la plus simple et la moins chère : acheter et conserver, `;
    texte += `éventuellement avec une règle de sortie en cas de forte baisse pour pouvoir dormir.`;
  } else if (!solides.length) {
    texte += `aucune méthode ne domine, mais « ${meilleure.nom} » se dégage avec ${meilleure.robustesse.note}/100. `;
    texte += `Elle offre un meilleur rapport entre le gain et la souffrance sur ${meilleure.mieuxNotees} valeur${meilleure.mieuxNotees > 1 ? 's' : ''} sur ${meilleure.testees}, `;
    texte += `${meilleure.ecartMedian >= 0 ? `tout en rapportant ${pct(meilleure.ecartMedian)} de plus par an` : `pour ${pct(Math.abs(meilleure.ecartMedian)).replace('+', '')} de rendement annuel en moins`}, `;
    texte += `et ramène la pire perte de ${pct(reference.repliMedian)} à ${pct(meilleure.repliMedian)}. `;
    texte += `C’est un compromis raisonnable — pas une évidence. Confirmez-le sur un autre panier avant de bâtir dessus.`;
  } else {
    texte += `${solides.length} méthode${solides.length > 1 ? 's tiennent' : ' tient'} la route. `;
    texte += `« ${meilleure.nom} » arrive en tête : elle offre un meilleur rapport entre le gain et la souffrance `;
    texte += `sur ${meilleure.mieuxNotees} valeur${meilleure.mieuxNotees > 1 ? 's' : ''} sur ${meilleure.testees}. `;
    texte += `Elle ${meilleure.ecartMedian >= 0 ? 'rapporte ' + pct(meilleure.ecartMedian) : 'coûte ' + pct(Math.abs(meilleure.ecartMedian)).replace('+', '')} de rendement par an `;
    texte += `par rapport à ne rien faire, mais limite la pire perte à ${pct(meilleure.repliMedian)} contre ${pct(reference.repliMedian)}. `;
    texte += meilleure.ecartMedian >= 0
      ? `Autrement dit : elle rapporte davantage ET fait moins mal en route. C’est rare.`
      : `Autrement dit : vous payez un peu de rendement pour dormir nettement mieux — et c’est souvent ce qui permet de tenir jusqu’au bout.`;
  }
  if (nulles.length) {
    texte += ` À l’inverse, ${nulles.length === 1 ? 'une méthode est à écarter' : `${nulles.length} méthodes sont à écarter`} : `;
    texte += nulles.map(r => `« ${r.nom} »`).join(', ') + `. Sur ces valeurs, ${nulles.length === 1 ? 'elle ne fait' : 'elles ne font'} pas mieux que le hasard, tout en coûtant des frais.`;
  }
  return {
    titre: solides.length
      ? `${meilleure.nom} sort en tête`
      : correctes.length
        ? `${meilleure.nom} se dégage, sans dominer`
        : 'Aucune méthode ne se détache',
    texte,
    meilleure: meilleure.id
  };
}

/* ------------------------------------------------------------------ */
/*  Explication « pourquoi » pour une méthode donnée                   */
/* ------------------------------------------------------------------ */
/** Traduit les chiffres d'une méthode en une explication compréhensible. */
export function expliquerMethode(r, reference) {
  if (!reference || r.id === 'buyhold') {
    return 'Acheter au début, ne plus rien faire. Aucun frais de rotation, aucune décision à prendre — mais il faut encaisser toutes les baisses sans broncher.';
  }
  const bouts = [];
  const exp = r.expositionMedian ?? 0;
  const ops = r.operationsMedian ?? 0;

  bouts.push(exp > 85
    ? `Cette méthode reste investie presque tout le temps (${nf(exp, 0)} % des séances) : elle ressemble beaucoup à un simple achat, en un peu plus prudent.`
    : exp > 55
      ? `Elle reste investie ${nf(exp, 0)} % du temps et se met à l’abri le reste. C’est le compromis habituel du suivi de tendance.`
      : `Elle passe la majorité du temps en liquidités (investie seulement ${nf(exp, 0)} % des séances) : elle ne cherche que quelques moments précis.`);

  bouts.push(ops > 60
    ? `Elle déclenche beaucoup d’opérations (${nf(ops, 0)} en médiane) : chaque aller-retour coûte des frais, et c’est souvent ce qui mange l’avantage.`
    : ops > 12
      ? `Elle déclenche ${nf(ops, 0)} opérations en médiane : une rotation raisonnable.`
      : `Elle bouge très peu (${nf(ops, 0)} opérations) : peu de frais, peu d’occasions de se tromper.`);

  if (r.tauxProtection >= 70) {
    bouts.push(`Son vrai apport est la protection : elle réduit la pire perte sur ${r.protegees} valeur${r.protegees > 1 ? 's' : ''} sur ${r.testees}. On achète du confort, pas du rendement.`);
  } else if (r.tauxProtection !== null && r.tauxProtection < 35) {
    bouts.push(`Attention : elle ne protège presque jamais des grosses baisses (${r.protegees} valeur${r.protegees > 1 ? 's' : ''} sur ${r.testees}). Elle prend le risque sans la contrepartie.`);
  }

  if (r.dispersion !== null && r.dispersion > 45) {
    bouts.push(`Ses résultats varient énormément d’une valeur à l’autre (de ${nf(r.ecartPire, 0)} à +${nf(r.ecartMeilleur, 0)} points) : difficile de savoir à l’avance de quel côté on tombera.`);
  }
  return bouts.join(' ');
}
