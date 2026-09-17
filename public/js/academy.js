/* =========================================================================
   AlphaDesk — Académie
   Le contenu pédagogique : à quoi sert chaque indicateur, comment le lire,
   ses pièges, et comment le combiner. Chaque fiche est reliée à la valeur
   réellement calculée sur le titre affiché, pour apprendre sur du concret.
   ========================================================================= */

export const NIVEAUX = {
  base: { label: 'Fondamentaux', color: '#5b8cff' },
  inter: { label: 'Intermédiaire', color: '#2ebd85' },
  avance: { label: 'Avancé', color: '#f0a93b' }
};

/* =========================================================================
   LES FICHES INDICATEURS
   `live` reçoit le rapport d'analyse et renvoie la lecture du jour.
   ========================================================================= */
export const FICHES = [
  /* ------------------------------- TENDANCE ---------------------------- */
  {
    id: 'mm', famille: 'Tendance', niveau: 'base',
    titre: 'Moyennes mobiles (MM20, MM50, MM200)',
    resume: 'La ligne qui lisse le bruit et révèle la direction de fond.',
    aQuoiCaSert: `Le prix d'une action bouge tous les jours pour des raisons qui n'ont souvent aucune importance. La moyenne mobile fait une chose simple : elle calcule le cours moyen des N dernières séances et trace ce résultat jour après jour. Ce qui reste, c'est la direction réelle, débarrassée du bruit quotidien.`,
    calcul: `MM20 = moyenne des 20 dernières clôtures. Chaque jour, on ajoute la nouvelle clôture et on retire la plus ancienne. La MM50 fait pareil sur 50 séances, la MM200 sur 200 (environ un an de bourse).`,
    commentLire: [
      'Le cours **au-dessus** de sa moyenne mobile : les acheteurs qui sont entrés récemment sont en gain. Ils n\'ont pas de raison de vendre en panique. C\'est un environnement porteur.',
      'Le cours **sous** sa moyenne : ceux qui ont acheté récemment perdent. Chaque rebond devient une occasion pour eux de sortir à l\'équilibre — c\'est ce qui crée la résistance.',
      'L\'**ordre** des moyennes compte plus que leur valeur : MM20 > MM50 > MM200 est l\'empilement haussier idéal. Il indique que la hausse est cohérente sur les trois horizons.',
      'Le **croisement** MM50 qui passe au-dessus de la MM200 (« croix dorée ») ou en dessous (« croix de la mort ») est un signal lent mais très suivi — il déclenche donc des flux réels.'
    ],
    pieges: [
      'La moyenne mobile est **en retard par construction**. Elle ne prédit rien, elle décrit. Elle vous dira qu\'une tendance existe, jamais qu\'elle va commencer.',
      'Dans un marché sans direction, le cours traverse sa moyenne dix fois par mois. Chaque traversée ressemble à un signal ; ce sont dix fausses alertes et dix frais de courtage.',
      'La MM200 est un niveau **psychologique** autant que technique : il est très regardé, donc le prix y réagit — mais cela n\'en fait pas une vérité économique.'
    ],
    combiner: 'La moyenne mobile dit la direction, jamais la force. Croisez-la toujours avec l\'ADX : une MM haussière avec un ADX sous 20 est une tendance en trompe-l\'œil.',
    live: r => {
      const i = r.ind.n - 1, c = r.ind.c[i];
      const s20 = r.ind.sma20[i], s50 = r.ind.sma50[i], s200 = r.ind.sma200[i];
      if (s200 === null) return `Historique trop court pour calculer la MM200 sur ce titre.`;
      const ordre = (c > s20 && s20 > s50 && s50 > s200) ? 'un empilement parfaitement haussier'
        : (c < s20 && s20 < s50 && s50 < s200) ? 'un empilement parfaitement baissier'
          : 'un empilement désordonné, signe d\'un marché en transition';
      return `Sur ce titre : cours ${fmt(c)}, MM20 ${fmt(s20)}, MM50 ${fmt(s50)}, MM200 ${fmt(s200)}. C'est ${ordre}. Le cours est ${nf(((c / s200 - 1) * 100), 1)} % ${c > s200 ? 'au-dessus' : 'sous'} sa MM200.`;
    }
  },

  {
    id: 'macd', famille: 'Tendance', niveau: 'inter',
    titre: 'MACD — convergence / divergence des moyennes',
    resume: 'Mesure si la tendance accélère ou s\'essouffle.',
    aQuoiCaSert: `Le MACD compare une moyenne rapide (12 jours) à une moyenne lente (26 jours). Quand l'écart entre les deux grandit, le mouvement accélère. Quand il se resserre, le mouvement s'essouffle — même si le prix continue de monter. C'est cette information d'accélération que le prix seul ne donne pas.`,
    calcul: `Ligne MACD = EMA12 − EMA26. Ligne de signal = EMA9 de la ligne MACD. Histogramme = ligne MACD − ligne de signal. C'est l'histogramme qui porte l'information la plus utile.`,
    commentLire: [
      '**Histogramme positif et qui grandit** : la hausse accélère. C\'est le meilleur moment d\'une tendance.',
      '**Histogramme positif mais qui rétrécit** : le prix monte encore, mais de moins en moins vite. Premier avertissement, souvent plusieurs semaines avant le sommet.',
      '**Croisement de la ligne MACD au-dessus de sa ligne de signal** : signal d\'achat classique. Fiable en tendance, catastrophique en marché plat.',
      '**Passage au-dessus/en dessous de zéro** : changement de régime de moyen terme, plus lent mais plus significatif que le croisement des lignes.'
    ],
    pieges: [
      'Le MACD n\'est **pas borné** : contrairement au RSI, il n\'y a pas de niveau « trop haut ». Comparer sa valeur entre deux titres différents n\'a aucun sens.',
      'En marché sans tendance, les croisements s\'enchaînent tous les trois jours. Filtrer avec l\'ADX est indispensable.'
    ],
    combiner: 'MACD + ADX : le MACD donne le timing, l\'ADX dit si ce timing mérite d\'être joué. Ajoutez le volume pour vérifier que le mouvement est soutenu par de l\'argent réel.',
    live: r => {
      const i = r.ind.n - 1, h = r.ind.macd.hist[i], h5 = r.ind.macd.hist[i - 5];
      if (h === null) return 'MACD non calculable (historique trop court).';
      const accel = (h5 !== null && h5 !== undefined) ? (Math.abs(h) > Math.abs(h5) ? 'qui se renforce' : 'qui s\'essouffle') : '';
      return `Histogramme MACD actuellement ${h > 0 ? 'positif' : 'négatif'} (${nf(h, 3)}) ${accel}. La ligne MACD est ${r.ind.macd.line[i] > 0 ? 'au-dessus de zéro' : 'sous zéro'}.`;
    }
  },

  {
    id: 'adx', famille: 'Tendance', niveau: 'inter',
    titre: 'ADX — la force de la tendance',
    resume: 'Le seul indicateur qui vous dit si une tendance mérite d\'être suivie.',
    aQuoiCaSert: `L'ADX répond à une question que presque aucun autre indicateur ne traite : « y a-t-il vraiment une tendance ici ? » Il ne dit pas si ça monte ou si ça descend — uniquement si le mouvement est directionnel ou s'il tourne en rond. C'est le filtre le plus important de toute l'analyse technique.`,
    calcul: `On mesure chaque jour combien le haut dépasse le haut de la veille (DI+) et combien le bas descend sous le bas de la veille (DI−). L'ADX lisse l'écart entre les deux sur 14 séances.`,
    commentLire: [
      '**ADX < 20** : pas de tendance. Les indicateurs de suivi (moyennes, MACD, Supertrend) vont produire des faux signaux en série. C\'est le terrain des stratégies de range.',
      '**ADX entre 20 et 25** : tendance naissante. On surveille, on n\'engage pas encore tout.',
      '**ADX > 25** : vraie tendance directionnelle. Les stratégies de suivi fonctionnent.',
      '**ADX > 40** : tendance très forte, mais souvent proche de son épuisement. Ne pas ouvrir de nouvelle position à ce stade, gérer celles qui existent.',
      '**DI+ au-dessus de DI−** : la tendance est haussière. L\'inverse pour une baisse.'
    ],
    pieges: [
      'Un ADX élevé ne veut **pas dire hausse**. Un krach produit un ADX de 50. L\'ADX mesure l\'intensité, le DI donne le sens.',
      'L\'ADX est lent. Il confirme une tendance déjà bien installée — ne l\'utilisez pas pour entrer au plus bas, mais pour savoir si vous avez le droit de suivre.'
    ],
    combiner: 'ADX = interrupteur. ADX > 25 → on écoute le MACD et les moyennes. ADX < 20 → on écoute plutôt le RSI et les bandes de Bollinger.',
    live: r => {
      const i = r.ind.n - 1, a = r.ind.adx.adx[i];
      if (a === null) return 'ADX non calculable.';
      const p = r.ind.adx.pdi[i], m = r.ind.adx.mdi[i];
      return `ADX à ${nf(a, 1)} → ${a > 40 ? 'tendance très forte, potentiellement mûre' : a > 25 ? 'vraie tendance directionnelle' : a > 20 ? 'tendance naissante' : 'pas de tendance exploitable'}. DI+ ${nf(p, 1)} contre DI− ${nf(m, 1)} : avantage ${p > m ? 'aux acheteurs' : 'aux vendeurs'}.`;
    }
  },

  {
    id: 'supertrend', famille: 'Tendance', niveau: 'inter',
    titre: 'Supertrend — la ligne de stop qui suit la tendance',
    resume: 'Une ligne unique qui donne le sens et le niveau de sortie.',
    aQuoiCaSert: `Le Supertrend trace une ligne sous le cours en tendance haussière, au-dessus en tendance baissière. Elle monte avec le prix mais ne redescend jamais tant que la tendance tient. C'est simultanément un indicateur de direction et un stop suiveur — d'où sa popularité.`,
    calcul: `On prend le milieu de la bougie (haut + bas) / 2, et on place une bande à ± (3 × ATR). La ligne ne se déplace que dans le sens favorable ; elle bascule de l'autre côté quand le cours la traverse en clôture.`,
    commentLire: [
      'Ligne **sous le cours et verte** : tendance haussière. Tant que la clôture reste au-dessus, on conserve.',
      'Le **basculement** de la ligne est le signal d\'entrée/sortie. Il est net, sans ambiguïté — c\'est sa force.',
      'La **distance** entre le cours et la ligne indique le risque que vous acceptez pour rester dans le trade.'
    ],
    pieges: [
      'En marché plat, la ligne bascule sans arrêt et chaque bascule coûte des frais. Le Supertrend a besoin d\'un ADX > 20 pour donner le meilleur de lui-même.',
      'Le paramètre 3 × ATR est un choix. Plus petit, il réagit vite mais vous sort au moindre bruit. Plus grand, il vous garde en position mais avec un risque plus large.'
    ],
    combiner: 'Utilisez-le comme stop, pas comme signal d\'entrée unique. Le plan de trade d\'AlphaDesk s\'en sert comme candidat au stop de protection.',
    live: r => {
      const i = r.ind.n - 1, d = r.ind.supertrend.dir[i], l = r.ind.supertrend.line[i];
      if (l === null) return 'Supertrend non calculable.';
      const dist = Math.abs(r.ind.c[i] - l) / r.ind.c[i] * 100;
      return `Supertrend ${d === 1 ? 'haussier' : 'baissier'}, ligne à ${fmt(l)} — soit ${nf(dist, 1)} % ${d === 1 ? 'sous' : 'au-dessus du'} cours actuel. C'est le niveau de sortie logique si la tendance se retourne.`;
    }
  },

  {
    id: 'ichimoku', famille: 'Tendance', niveau: 'avance',
    titre: 'Ichimoku — le système complet en un coup d\'œil',
    resume: 'Un système japonais qui donne tendance, support, résistance et timing sur un seul graphique.',
    aQuoiCaSert: `Ichimoku Kinko Hyo signifie « graphique en équilibre d'un coup d'œil ». Il projette un « nuage » dans le futur, construit à partir des points médians de plusieurs périodes. Ce nuage agit comme une zone de support ou de résistance connue à l'avance.`,
    calcul: `Tenkan = (plus haut + plus bas) / 2 sur 9 séances. Kijun = pareil sur 26. Senkou A = (Tenkan + Kijun) / 2, projeté 26 séances en avant. Senkou B = médiane sur 52 séances, projetée aussi. Le nuage est la zone entre Senkou A et B.`,
    commentLire: [
      '**Cours au-dessus du nuage** : tendance haussière. Le nuage devient le support.',
      '**Cours dans le nuage** : zone d\'indécision. La règle traditionnelle est de ne rien faire.',
      '**Nuage épais** : support ou résistance solide. **Nuage fin** : il cédera facilement.',
      'Le **croisement Tenkan/Kijun** au-dessus du nuage est un signal d\'achat de bonne qualité.'
    ],
    pieges: [
      'Ichimoku est calibré pour des marchés qui cotaient 6 jours par semaine (Japon des années 1960). Les valeurs 9/26/52 sont une convention, pas une loi physique.',
      'Le graphique paraît chargé : n\'utilisez que ce que vous comprenez. Le nuage seul apporte déjà 80 % de la valeur.'
    ],
    combiner: 'Le nuage donne des niveaux à l\'avance — parfait pour placer objectifs et stops. Combinez avec le volume pour valider les cassures de nuage.',
    live: r => {
      const i = r.ind.n - 1, ic = r.ind.ichimoku, d = ic.disp;
      const a = ic.senkouA[i - d], b = ic.senkouB[i - d];
      if (a == null || b == null) return 'Nuage Ichimoku non calculable sur cette profondeur d\'historique.';
      const c = r.ind.c[i], top = Math.max(a, b), bot = Math.min(a, b);
      const pos = c > top ? 'au-dessus du nuage (configuration haussière)' : c < bot ? 'sous le nuage (configuration baissière)' : 'à l\'intérieur du nuage (indécision)';
      return `Le cours est ${pos}. Nuage entre ${fmt(bot)} et ${fmt(top)}, épaisseur ${nf(((top - bot) / c * 100), 1)} % du cours.`;
    }
  },

  /* ------------------------------- MOMENTUM ---------------------------- */
  {
    id: 'rsi', famille: 'Momentum', niveau: 'base',
    titre: 'RSI — l\'indice de force relative',
    resume: 'Mesure si le mouvement récent est exagéré dans un sens ou dans l\'autre.',
    aQuoiCaSert: `Le RSI compare l'ampleur moyenne des hausses à celle des baisses sur 14 séances, et ramène le tout sur une échelle de 0 à 100. Il répond à : « le mouvement récent est-il allé trop loin, trop vite ? »`,
    calcul: `RSI = 100 − 100 / (1 + RS), où RS = moyenne des hausses / moyenne des baisses sur 14 séances (lissage de Wilder).`,
    commentLire: [
      '**RSI > 70** : surachat. Attention, cela ne veut pas dire « vendre » — cela veut dire « le point d\'entrée est mauvais maintenant ».',
      '**RSI < 30** : survente. Un rebond technique devient probable, mais un titre en chute libre peut rester sous 30 pendant des mois.',
      '**RSI autour de 50** : équilibre. En tendance haussière, les replis s\'arrêtent souvent vers 40-45 : c\'est un excellent point d\'entrée.',
      '**Divergence** : le prix fait un nouveau sommet mais pas le RSI → le mouvement perd sa force interne. C\'est l\'usage le plus puissant du RSI.'
    ],
    pieges: [
      'L\'erreur la plus coûteuse en bourse : **vendre parce que le RSI est à 75**. Dans une tendance forte, le RSI reste en surachat des semaines entières, et le titre double.',
      'Le RSI ne fonctionne comme signal de retournement que dans un marché **sans tendance**. En tendance, il ne sert qu\'à repérer les replis.'
    ],
    combiner: 'RSI + ADX est le duo décisif. ADX < 20 → le RSI à 70/30 est un vrai signal de retournement. ADX > 25 → le RSI ne sert qu\'à optimiser le timing d\'entrée dans le sens de la tendance.',
    live: r => {
      const i = r.ind.n - 1, v = r.ind.rsi[i], a = r.ind.adx.adx[i];
      if (v === null) return 'RSI non calculable.';
      const ctxt = (a !== null && a > 25)
        ? 'Comme l\'ADX signale une vraie tendance, ce niveau ne doit PAS être lu comme un signal de retournement, seulement comme une indication sur la qualité du point d\'entrée.'
        : 'Comme l\'ADX est faible (marché sans tendance), les niveaux 70 et 30 retrouvent leur valeur de signal de retournement.';
      return `RSI à ${nf(v, 1)} → ${v > 70 ? 'zone de surachat' : v < 30 ? 'zone de survente' : 'zone neutre'}. ${ctxt}`;
    }
  },

  {
    id: 'stoch', famille: 'Momentum', niveau: 'base',
    titre: 'Stochastique',
    resume: 'Où se situe la clôture dans la fourchette des 14 derniers jours.',
    aQuoiCaSert: `L'idée est fine : dans une tendance haussière, les clôtures se font près du plus haut de la journée ; dans une baisse, près du plus bas. Le stochastique mesure exactement ça, sur 14 séances.`,
    calcul: `%K = 100 × (clôture − plus bas 14j) / (plus haut 14j − plus bas 14j), lissé sur 3 séances. %D = moyenne de %K sur 3 séances.`,
    commentLire: [
      '**Au-dessus de 80** : les clôtures se font en haut de fourchette — les acheteurs dominent, mais le mouvement est tendu.',
      '**Sous 20** : les clôtures se font en bas de fourchette.',
      'Le **croisement de %K au-dessus de %D** en zone basse est un signal d\'achat de court terme classique.'
    ],
    pieges: [
      'Beaucoup plus nerveux que le RSI : il génère énormément de signaux, dont la majorité sont du bruit.',
      'Comme le RSI, inutilisable seul en tendance forte.'
    ],
    combiner: 'Excellent pour affiner l\'entrée une fois que la direction a été décidée par un indicateur de tendance.',
    live: r => {
      const i = r.ind.n - 1, k = r.ind.stoch.k[i], d = r.ind.stoch.d[i];
      if (k === null) return 'Stochastique non calculable.';
      return `%K à ${nf(k, 1)} et %D à ${nf(d, 1)} → ${k > 80 ? 'haut de fourchette' : k < 20 ? 'bas de fourchette' : 'milieu de fourchette'}. ${k > d ? '%K au-dessus de %D : impulsion de court terme positive.' : '%K sous %D : impulsion de court terme négative.'}`;
    }
  },

  /* ------------------------------ VOLATILITÉ --------------------------- */
  {
    id: 'atr', famille: 'Volatilité', niveau: 'base',
    titre: 'ATR — l\'amplitude moyenne réelle',
    resume: 'Combien ce titre bouge en moyenne par séance. La base de tout stop bien placé.',
    aQuoiCaSert: `L'ATR mesure l'amplitude moyenne d'une séance, gaps compris. C'est l'indicateur le plus important pour la **gestion du risque** : il vous dit quelle marge laisser à votre stop pour ne pas être sorti par le bruit normal du titre.`,
    calcul: `Amplitude vraie d'une séance = le plus grand de : (haut − bas), |haut − clôture veille|, |bas − clôture veille|. L'ATR est la moyenne lissée de cette valeur sur 14 séances.`,
    commentLire: [
      'Un stop placé à **moins de 1,5 × ATR** sera touché par le bruit normal, sans que votre scénario soit invalidé. Vous perdrez de l\'argent en ayant raison.',
      'Exprimé en **% du cours**, l\'ATR permet de comparer deux titres : un ATR de 1 % et un ATR de 5 %, ce n\'est pas le même métier.',
      'Un ATR qui **explose** signale un changement de régime : information majeure, panique, ou publication de résultats.'
    ],
    pieges: [
      'L\'ATR ne donne **aucune direction**. Une forte volatilité n\'est ni haussière ni baissière.',
      'Ne comparez jamais l\'ATR brut de deux titres à des prix différents : rapportez-le toujours au cours.'
    ],
    combiner: 'C\'est la brique de la taille de position : quantité = (capital × risque accepté) / (distance au stop). AlphaDesk calcule cela automatiquement dans le plan de trade.',
    live: r => {
      const i = r.ind.n - 1, a = r.ind.atr[i], p = r.ind.atrPct[i];
      if (a === null) return 'ATR non calculable.';
      return `ATR à ${fmt(a)}, soit ${nf(p, 2)} % du cours. Un stop sérieux se place donc au minimum à ${fmt(a * 2)} du prix d'entrée (2 × ATR), soit ${nf((p * 2), 1)} %.`;
    }
  },

  {
    id: 'bollinger', famille: 'Volatilité', niveau: 'base',
    titre: 'Bandes de Bollinger',
    resume: 'Une enveloppe qui s\'élargit quand le marché s\'agite et se resserre quand il dort.',
    aQuoiCaSert: `Les bandes encadrent le prix à ± 2 écarts-types de sa moyenne 20 jours. Statistiquement, le cours passe environ 95 % du temps à l'intérieur. Leur vraie valeur n'est pas de dire « trop haut / trop bas » mais de mesurer la **compression** de la volatilité.`,
    calcul: `Bande centrale = MM20. Bande haute = MM20 + 2 × écart-type des 20 dernières clôtures. Bande basse = MM20 − 2 × écart-type.`,
    commentLire: [
      '**Bandes resserrées** (compression) : le calme précède le mouvement. Un mouvement ample se prépare — sans indication de direction.',
      '**Le cours colle à la bande haute** : ce n\'est pas un signal de vente, c\'est le signe d\'une tendance puissante. On appelle cela « marcher sur la bande ».',
      '**%B** situe le cours dans les bandes : 1 = sur la bande haute, 0 = sur la bande basse, 0,5 = sur la moyenne.'
    ],
    pieges: [
      'Vendre dès que le cours touche la bande haute est la faute classique. En tendance forte, il y reste pendant des semaines.',
      'Les bandes s\'adaptent au prix : elles ne prédisent rien, elles décrivent une dispersion passée.'
    ],
    combiner: 'La compression (bandes de Bollinger à l\'intérieur des canaux de Keltner) est un des rares signaux d\'anticipation fiables. AlphaDesk la détecte automatiquement dans l\'indicateur VRG.',
    live: r => {
      const i = r.ind.n - 1, pb = r.ind.bb.percentB[i], bw = r.ind.bb.bandwidth[i];
      if (pb === null) return 'Bandes non calculables.';
      const sq = r.custom.vrg.squeeze;
      return `%B à ${nf(pb, 2)} (${pb > 1 ? 'au-dessus de la bande haute' : pb > .8 ? 'proche de la bande haute' : pb < 0 ? 'sous la bande basse' : pb < .2 ? 'proche de la bande basse' : 'dans la zone centrale'}). Largeur des bandes : ${nf(bw, 1)} % du cours. ${sq ? `⚠ Compression détectée depuis ${r.custom.vrg.squeezeBars} séances : un mouvement ample se prépare.` : ''}`;
    }
  },

  /* -------------------------------- VOLUME ----------------------------- */
  {
    id: 'obv', famille: 'Volume', niveau: 'inter',
    titre: 'OBV — le volume cumulé et orienté',
    resume: 'Vérifie que la hausse est financée par de l\'argent réel.',
    aQuoiCaSert: `L'OBV additionne le volume des séances de hausse et soustrait celui des séances de baisse. Le résultat est une courbe qui doit accompagner le prix. Quand le prix monte mais que l'OBV stagne, la hausse n'est pas financée : elle est fragile.`,
    calcul: `Si clôture > clôture veille : OBV = OBV + volume. Si clôture < clôture veille : OBV = OBV − volume. Sinon inchangé.`,
    commentLire: [
      'L\'OBV doit **faire les mêmes sommets** que le prix. Si le prix monte et pas l\'OBV : divergence baissière, les gros vendent dans la hausse.',
      'Un OBV qui monte pendant que le prix stagne : **accumulation discrète**. C\'est souvent le signe précurseur d\'une cassure.',
      'La **valeur absolue** de l\'OBV n\'a aucun sens — seule sa pente compte.'
    ],
    pieges: [
      'L\'OBV traite une hausse de 0,1 % comme une hausse de 5 % : il ignore l\'ampleur du mouvement. Le Chaikin Money Flow corrige ce défaut.',
      'Sur les petites capitalisations peu liquides, un seul ordre institutionnel fausse toute la courbe.'
    ],
    combiner: 'OBV + CMF + MFI forment l\'indicateur SFI d\'AlphaDesk : trois façons de mesurer le flux, agrégées pour réduire le bruit de chacune.',
    live: r => {
      const i = r.ind.n - 1, s = r.ind.obvSlope[i];
      return `Pente de l'OBV normalisée : ${s === null ? 'n/d' : nf(s, 0)} sur 100. ${s > 20 ? 'Les volumes accompagnent bien la hausse.' : s < -20 ? 'Les volumes accompagnent la baisse : distribution en cours.' : 'Les volumes ne penchent clairement d\'aucun côté.'} Indicateur SFI global : ${r.custom.sfi.value} (${r.custom.sfi.label}).`;
    }
  },

  {
    id: 'mfi', famille: 'Volume', niveau: 'inter',
    titre: 'MFI — le RSI pondéré par le volume',
    resume: 'Comme le RSI, mais il ne compte que l\'argent qui bouge vraiment.',
    aQuoiCaSert: `Le MFI applique la logique du RSI aux flux monétaires : prix typique × volume. Une hausse sur faible volume pèse peu ; une hausse sur gros volume pèse lourd. C'est un RSI qui sait faire la différence entre un mouvement financé et un mouvement creux.`,
    calcul: `Prix typique = (haut + bas + clôture) / 3. Flux = prix typique × volume. MFI = 100 − 100 / (1 + flux positifs 14j / flux négatifs 14j).`,
    commentLire: [
      '**MFI > 80** : surachat sur flux réels — plus significatif qu\'un RSI à 80.',
      '**MFI < 20** : survente sur flux réels.',
      '**Divergence MFI/prix** : signal de retournement de meilleure qualité qu\'une divergence RSI, parce qu\'elle intègre le volume.'
    ],
    pieges: ['Inutilisable sur les instruments sans volume fiable (certains indices, certains ETF synthétiques, le Forex).'],
    combiner: 'Utilisez le MFI en remplacement du RSI dès que le volume du titre est fiable.',
    live: r => {
      const i = r.ind.n - 1, m = r.ind.mfi[i], rs = r.ind.rsi[i];
      if (m === null) return 'MFI non calculable.';
      const ecart = (rs !== null) ? Math.abs(m - rs) : 0;
      return `MFI à ${nf(m, 1)} contre RSI à ${nf(rs, 1)}. ${ecart > 12 ? `L'écart de ${nf(ecart, 0)} points est notable : le mouvement du prix n'est pas confirmé par les flux monétaires.` : 'MFI et RSI concordent : le mouvement est cohérent avec les volumes.'}`;
    }
  },

  /* ---------------------- INDICATEURS PROPRIÉTAIRES -------------------- */
  {
    id: 'tqs', famille: 'AlphaDesk', niveau: 'inter', maison: true,
    titre: 'TQS — Trend Quality Score',
    resume: 'Note sur 100 la fiabilité de la tendance, pas sa direction.',
    aQuoiCaSert: `Avant de demander « ça monte ou ça descend ? », il faut demander « y a-t-il une tendance exploitable ? ». Le TQS agrège cinq mesures indépendantes en une note unique, pour répondre à cette question sans avoir à lire cinq graphiques.`,
    calcul: `Empilement des moyennes mobiles (30 %) + force directionnelle ADX (25 %) + linéarité du mouvement, mesurée par le R² d'une régression sur 50 séances (20 %) + persistance statistique, via l'exposant de Hurst (15 %) + cohérence entre le Supertrend et la pente (10 %).`,
    commentLire: [
      '**TQS ≥ 70** : tendance nette et régulière. Les stratégies de suivi de tendance sont dans leur terrain naturel.',
      '**TQS 50-70** : tendance réelle mais heurtée. Réduire la taille de position.',
      '**TQS 30-50** : marché hésitant. Les signaux de suivi vont générer des pertes par accumulation de faux départs.',
      '**TQS < 30** : aucune tendance. Ne rien faire, ou jouer les bornes de la fourchette.'
    ],
    pieges: ['Le TQS ne donne pas la direction. Un krach régulier produit un TQS de 85. Lisez toujours la direction séparément.'],
    combiner: 'Le TQS pondère automatiquement le facteur « qualité de tendance » dans le score global d\'AlphaDesk.',
    live: r => `TQS à ${r.custom.tqs.value}/100 — ${r.custom.tqs.label}. Détail : ${r.custom.tqs.parts.map(p => `${p.k} ${Math.round(p.v)}`).join(' · ')}.`
  },

  {
    id: 'mpi', famille: 'AlphaDesk', niveau: 'inter', maison: true,
    titre: 'MPI — Momentum Pressure Index',
    resume: 'Six oscillateurs ramenés à un seul chiffre, de −100 à +100.',
    aQuoiCaSert: `RSI, MACD, stochastique, ROC, TSI et CCI disent souvent la même chose avec des échelles différentes. Le MPI les normalise tous sur la même échelle et les agrège, ce qui annule le bruit propre à chacun tout en gardant le signal commun.`,
    calcul: `Chaque oscillateur est ramené sur [−100, +100] par rapport à son point neutre, puis moyenné avec des poids : RSI 22 %, MACD 22 %, Stoch 14 %, ROC 14 %, TSI 14 %, CCI 14 %.`,
    commentLire: [
      '**MPI > +45** : pression acheteuse forte et unanime.',
      '**MPI entre −15 et +15** : ni acheteur ni vendeur ne domine. C\'est là que se perdent la plupart des trades.',
      '**MPI < −45** : pression vendeuse forte.',
      'Regardez aussi l\'**accélération** : un MPI à +30 qui monte vaut mieux qu\'un MPI à +50 qui baisse.'
    ],
    pieges: ['Le MPI est un indicateur de momentum : il est par nature en retard sur les retournements brutaux.'],
    combiner: 'MPI fort + TQS faible = piège classique : beaucoup d\'énergie, aucune direction. Attendre.',
    live: r => `MPI à ${r.custom.mpi.value >= 0 ? '+' : ''}${r.custom.mpi.value} — ${r.custom.mpi.label}. ${r.custom.mpi.accel > 0 ? 'Le momentum s\'accélère.' : r.custom.mpi.accel < 0 ? 'Le momentum décélère.' : ''}`
  },

  {
    id: 'vrg', famille: 'AlphaDesk', niveau: 'avance', maison: true,
    titre: 'VRG — Volatility Regime Gauge',
    resume: 'Situe la volatilité actuelle par rapport à sa propre histoire.',
    aQuoiCaSert: `Un ATR de 2 % n'est ni élevé ni faible dans l'absolu — tout dépend du titre. Le VRG classe la volatilité du jour dans sa distribution des 250 dernières séances et en déduit un régime. C'est ce régime qui commande la taille de position.`,
    calcul: `Rang percentile de l'ATR (en % du cours) dans ses 250 dernières valeurs, complété par la détection de compression (bandes de Bollinger entièrement contenues dans les canaux de Keltner).`,
    commentLire: [
      '**Rang < 20 %** : très calme. Position confortable, mais attention aux compressions qui précèdent les grands mouvements.',
      '**Rang 45-75 %** : normal.',
      '**Rang > 90 %** : choc de volatilité. AlphaDesk réduit alors automatiquement de moitié la taille de position et rabote le score global de 30 %.',
      '**Compression détectée** : le marché retient son souffle. Ne pas anticiper la direction, attendre la sortie.'
    ],
    pieges: ['Une volatilité basse n\'est pas un marché sûr : c\'est souvent le calme d\'avant la tempête. La faillite de LTCM, 2007, février 2018 sont arrivées après des périodes de volatilité historiquement basse.'],
    combiner: 'Le VRG pilote directement la taille de position dans le plan de trade.',
    live: r => {
      const v = r.custom.vrg;
      return `Régime : ${v.regime}. ATR ${nf(v.atrPct, 2)} % du cours, rang historique ${v.rank === null ? 'n/d' : nf((v.rank * 100), 0)} %. ${v.squeeze ? `Compression active depuis ${v.squeezeBars} séances.` : 'Pas de compression en cours.'}`;
    }
  },

  {
    id: 'sfi', famille: 'AlphaDesk', niveau: 'avance', maison: true,
    titre: 'SFI — Smart Flow Index',
    resume: 'Est-ce que l\'argent entre ou sort du titre ?',
    aQuoiCaSert: `Un prix qui monte sans volume est un prix qui ment. Le SFI combine cinq mesures de flux — pente de l'OBV, Chaikin Money Flow, MFI, Force Index et cohérence volume/prix sur 10 séances — pour dire si le mouvement est financé.`,
    calcul: `Pente OBV normalisée 30 % + CMF 25 % + MFI 20 % + Force Index 15 % + confirmation volume/prix 10 %.`,
    commentLire: [
      '**SFI > +35** : accumulation nette, les acheteurs paient le prix demandé.',
      '**SFI < −35** : distribution nette, les vendeurs cèdent au prix offert.',
      'Le cas le plus instructif : **prix en hausse mais SFI négatif** — la hausse est vide, quelqu\'un distribue dans la force.'
    ],
    pieges: ['Sur un indice ou un ETF synthétique, le volume ne reflète pas l\'activité réelle sur les sous-jacents : le SFI y perd beaucoup de sa valeur.'],
    combiner: 'SFI + divergence RSI : la combinaison la plus fiable pour détecter un sommet avant qu\'il ne soit évident.',
    live: r => `SFI à ${r.custom.sfi.value >= 0 ? '+' : ''}${r.custom.sfi.value} — ${r.custom.sfi.label}. Détail : ${r.custom.sfi.parts.map(p => `${p.k} ${Math.round(p.v)}`).join(' · ')}.`
  },

  {
    id: 'res', famille: 'AlphaDesk', niveau: 'avance', maison: true,
    titre: 'RES — Risk Exposure Score',
    resume: 'Le risque intrinsèque du titre, sur 100. Il pilote la taille de position.',
    aQuoiCaSert: `Deux titres avec le même signal d'achat ne méritent pas la même somme. Le RES agrège volatilité, repli en cours, VaR, risque d'événement extrême et liquidité pour dire combien ce titre peut vous faire mal.`,
    calcul: `Régime de volatilité 30 % + repli depuis le plus haut 20 % + VaR 95 % à un jour 20 % + kurtosis (queues de distribution) 15 % + liquidité 15 %.`,
    commentLire: [
      '**RES < 30** : risque faible, taille de position normale.',
      '**RES 50-70** : risque élevé, AlphaDesk réduit la position.',
      '**RES > 70** : risque très élevé, position réduite de 20 % supplémentaires et score global raboté.',
      'La **VaR 95 %** se lit simplement : « une séance sur vingt perd au moins X % ». Si ce X vous empêche de dormir, la position est trop grosse.'
    ],
    pieges: ['Le RES mesure le risque **passé**. Un titre calme depuis deux ans peut s\'effondrer demain sur une publication.'],
    combiner: 'Le RES et le VRG pilotent ensemble le champ « taille de position » du plan de trade.',
    live: r => {
      const x = r.custom.res;
      return `RES à ${x.value}/100 — ${x.label}. ${x.var95 !== null ? `VaR 95 % à un jour : ${nf((Math.abs(x.var95) * 100), 2)} % (une séance sur vingt perd au moins cela).` : ''} ${x.avgDailyValue ? `Volume d'échange moyen : ${nf((x.avgDailyValue / 1e6), 1)} M par séance.` : ''}`;
    }
  },

  /* -------------------------- GESTION DU RISQUE ------------------------ */
  {
    id: 'sizing', famille: 'Méthode', niveau: 'base',
    titre: 'La taille de position — la seule variable que vous contrôlez',
    resume: 'Vous ne choisissez pas si vous avez raison. Vous choisissez combien vous perdez si vous avez tort.',
    aQuoiCaSert: `C'est le sujet le plus important de tout l'investissement, et celui dont personne ne parle. Un investisseur qui a raison 40 % du temps avec une bonne gestion de taille gagne de l'argent. Un investisseur qui a raison 70 % du temps mais met tout sur un coup finit ruiné.`,
    calcul: `Quantité = (Capital × Risque accepté en %) / (Prix d'entrée − Prix du stop).\n\nExemple avec 10 000 € de capital, 1 % de risque accepté, une entrée à 50 € et un stop à 46 € :\nrisque total accepté = 100 €, risque par action = 4 €, quantité = 25 actions, soit 1 250 € investis.\nSi le stop est touché, vous perdez 100 € — 1 % du capital, pas 100 % de la ligne.`,
    commentLire: [
      'Le **risque accepté** est un pourcentage du capital total, pas de la ligne : 0,5 % pour un profil prudent, 1 % équilibré, 2 % offensif. Au-delà de 2 %, une série de six pertes consécutives (qui arrive) vous coûte plus de 11 % du capital.',
      'La **distance au stop** détermine la quantité. Un stop large impose une petite position. C\'est le mécanisme qui vous protège automatiquement des titres trop volatils.',
      'Une **limite par ligne** (8 à 25 % du capital selon le profil) évite la surconcentration même quand le stop est très proche.'
    ],
    pieges: [
      'Décider de la quantité **avant** le stop est l\'erreur qui ruine les portefeuilles. L\'ordre correct est : scénario → stop → quantité.',
      'Déplacer le stop pour « laisser une chance » transforme une petite perte planifiée en grosse perte subie. Le stop se déplace dans un seul sens : celui du gain.'
    ],
    combiner: 'AlphaDesk applique cette formule automatiquement dans chaque plan de trade, en réduisant encore la taille quand le VRG ou le RES signalent un risque élevé.',
    live: r => {
      const s = r.plan.sizing;
      return `Pour votre profil et un capital de ${fmtMoney(r.profile.capital)} : risque accepté ${s.riskPct} % (${fmtMoney(s.riskAmount)}), distance au stop ${fmt(r.plan.riskPerShare)} → ${s.shares} titres, soit ${fmtMoney(s.notional)} investis (${nf(s.notionalPct, 1)} % du capital)${s.capped ? ', plafonné par la limite de concentration' : ''}.`;
    }
  },

  {
    id: 'rr', famille: 'Méthode', niveau: 'base',
    titre: 'Le rapport gain / risque',
    resume: 'Combien vous espérez gagner pour chaque euro risqué.',
    aQuoiCaSert: `Un trade n'est pas « bon » parce qu'il a des chances de réussir. Il est bon parce que ce qu'il rapporte quand il réussit dépasse largement ce qu'il coûte quand il échoue. C'est cela qui permet de gagner de l'argent avec un taux de réussite inférieur à 50 %.`,
    calcul: `R/R = (Objectif − Entrée) / (Entrée − Stop).\n\nAvec un R/R de 2 pour 1 et un taux de réussite de seulement 40 % :\nsur 10 trades → 4 gains de 2 R = +8 R, 6 pertes de 1 R = −6 R, résultat net +2 R. Vous gagnez en ayant tort six fois sur dix.`,
    commentLire: [
      '**R/R < 1,2** : à refuser, quel que soit l\'enthousiasme du signal.',
      '**R/R entre 1,5 et 2** : acceptable si le taux de réussite historique est bon.',
      '**R/R > 2,5** : configuration à privilégier.',
      'Le **taux de réussite minimal** pour être rentable se calcule : 1 / (1 + R/R). Avec un R/R de 2, il vous suffit de 33 % de réussite.'
    ],
    pieges: [
      'Éloigner artificiellement l\'objectif pour améliorer le R/R sur le papier est une auto-tromperie. L\'objectif doit correspondre à un vrai niveau technique.',
      'Rapprocher le stop pour améliorer le R/R vous fait sortir sur le bruit. Le stop doit être là où le scénario est réellement invalidé.'
    ],
    combiner: 'AlphaDesk refuse de qualifier un plan d\'« exploitable » sous 1,2 de R/R, même quand le score est très positif. C\'est volontaire.',
    live: r => {
      const t = r.plan.targets[0];
      const minWin = r.plan.rr ? 100 / (1 + r.plan.rr) : null;
      return `Plan actuel : entrée ${fmt(r.plan.price)}, stop ${fmt(r.plan.stop)}, premier objectif ${fmt(t.price)} → R/R de ${nf(r.plan.rr, 2)} pour 1 (${r.plan.quality}). Il vous suffirait d'un taux de réussite de ${nf(minWin, 0)} % pour être rentable sur la durée avec ce type de configuration.`;
    }
  },

  {
    id: 'divergence', famille: 'Méthode', niveau: 'avance',
    titre: 'Les divergences',
    resume: 'Quand le prix et l\'indicateur racontent deux histoires différentes.',
    aQuoiCaSert: `Une divergence apparaît quand le prix fait un nouveau sommet mais que l'oscillateur ne suit pas. Cela signifie que le mouvement se poursuit sur une force interne décroissante — comme une voiture qui avance encore alors que le moteur a calé.`,
    calcul: `On repère les deux derniers sommets (ou creux) du prix, puis on compare les valeurs correspondantes de l'oscillateur. Prix ↑ et oscillateur ↓ = divergence baissière. Prix ↓ et oscillateur ↑ = divergence haussière.`,
    commentLire: [
      '**Divergence baissière classique** : prix plus haut, RSI plus bas → essoufflement de la hausse.',
      '**Divergence haussière classique** : prix plus bas, RSI plus haut → la baisse perd sa force, un plancher se construit.',
      '**Divergences cachées** : elles indiquent au contraire une **continuation** de la tendance en cours. Plus subtiles, plus rares, très utiles pour rentrer sur repli.'
    ],
    pieges: [
      'Une divergence est un signal d\'**essoufflement**, jamais de retournement immédiat. Le prix peut diverger pendant des mois avant de céder.',
      'Ne jamais trader une divergence seule. Il faut un déclencheur : cassure d\'un support, bascule du Supertrend, croisement de moyennes.'
    ],
    combiner: 'Divergence + volume en baisse + résistance majeure = la configuration de retournement la plus solide de l\'analyse technique.',
    live: r => {
      const d = [...(r.struct.divRsi || []), ...(r.struct.divMacd || [])];
      if (!d.length) return 'Aucune divergence détectée sur la fenêtre récente.';
      return d.map(x => `Divergence ${x.type} ${x.kind} détectée entre les séances ${x.from} et ${x.to}.`).join(' ');
    }
  }
];

/* =========================================================================
   PARCOURS D'APPRENTISSAGE
   ========================================================================= */
export const PARCOURS = [
  {
    id: 'demarrer', titre: 'Démarrer — les 5 notions qui comptent vraiment',
    duree: '20 minutes',
    intro: `Si vous ne deviez retenir que cinq choses avant de passer votre premier ordre, ce sont celles-là. Elles ne rendront pas vos analyses brillantes, mais elles vous empêcheront de perdre bêtement — ce qui est bien plus rentable.`,
    etapes: [
      { fiche: 'sizing', pourquoi: 'On commence par le risque, jamais par le gain. C\'est contre-intuitif et c\'est pour cela que la plupart des débutants font l\'inverse.' },
      { fiche: 'atr', pourquoi: 'Parce qu\'un stop mal placé transforme une bonne analyse en perte sèche.' },
      { fiche: 'rr', pourquoi: 'Pour comprendre qu\'on peut gagner en ayant tort la majorité du temps.' },
      { fiche: 'mm', pourquoi: 'L\'outil de tendance le plus simple, et suffisant pour 80 % des décisions.' },
      { fiche: 'rsi', pourquoi: 'Le plus connu, le plus mal utilisé. Savoir quand il ne faut PAS l\'écouter vaut de l\'or.' }
    ]
  },
  {
    id: 'lire', titre: 'Savoir lire un marché avant d\'agir',
    duree: '30 minutes',
    intro: `La question n'est jamais « ça va monter ? ». Elle est : « dans quel type de marché suis-je, et quelle stratégie y fonctionne ? ». Un marché en tendance et un marché en range ne se jouent pas avec les mêmes outils — c'est l'erreur la plus fréquente et la plus coûteuse.`,
    etapes: [
      { fiche: 'adx', pourquoi: 'L\'interrupteur : tendance ou pas tendance. Tout découle de cette réponse.' },
      { fiche: 'tqs', pourquoi: 'La version agrégée de cette question, en une note sur 100.' },
      { fiche: 'bollinger', pourquoi: 'Pour identifier les phases de compression, les seules qui s\'anticipent.' },
      { fiche: 'vrg', pourquoi: 'Pour situer la volatilité actuelle dans son histoire et adapter la taille.' },
      { fiche: 'ichimoku', pourquoi: 'Pour obtenir des niveaux de support et résistance connus à l\'avance.' }
    ]
  },
  {
    id: 'confirmer', titre: 'Confirmer un signal — ne jamais entrer sur un seul indicateur',
    duree: '25 minutes',
    intro: `Un indicateur isolé se trompe souvent. Trois indicateurs indépendants qui disent la même chose se trompent rarement. Le mot important est « indépendants » : RSI, stochastique et Williams %R disent tous la même chose — les empiler ne confirme rien du tout.`,
    etapes: [
      { fiche: 'macd', pourquoi: 'Le timing : la tendance accélère-t-elle ou s\'essouffle-t-elle ?' },
      { fiche: 'obv', pourquoi: 'Le financement : le mouvement est-il soutenu par de l\'argent réel ?' },
      { fiche: 'mfi', pourquoi: 'La version pondérée par le volume, plus fiable que le RSI quand le volume est bon.' },
      { fiche: 'sfi', pourquoi: 'L\'agrégation des flux en un seul chiffre.' },
      { fiche: 'divergence', pourquoi: 'Le signal d\'alerte qui précède les retournements majeurs.' }
    ]
  },
  {
    id: 'discipline', titre: 'La discipline — ce qui sépare ceux qui durent des autres',
    duree: '20 minutes',
    intro: `Le marché ne vous doit rien et ne s'intéresse pas à votre opinion. Les règles ci-dessous n'ont rien de spectaculaire, mais elles sont la différence entre un investisseur qui est encore là dans dix ans et un autre qui a arrêté.`,
    regles: [
      { r: 'Écrire le scénario AVANT d\'acheter', d: 'Point d\'entrée, stop, objectif, taille. Si vous ne pouvez pas les écrire, vous n\'avez pas d\'idée, vous avez une envie.' },
      { r: 'Ne jamais élargir un stop', d: 'Le stop se déplace uniquement dans le sens du gain. L\'élargir, c\'est refuser une perte planifiée pour en subir une plus grande.' },
      { r: 'Une position ne dépasse jamais la limite du profil', d: 'Même sur la conviction la plus forte. Les certitudes les plus fortes produisent les pires pertes.' },
      { r: 'Après trois pertes consécutives, arrêter deux jours', d: 'La tentation de « se refaire » est le mécanisme par lequel une mauvaise semaine devient une mauvaise année.' },
      { r: 'Tenir un journal', d: 'Noter la raison d\'entrée et la relire à la sortie. C\'est le seul moyen de distinguer une bonne décision d\'un bon résultat — ce n\'est pas la même chose.' },
      { r: 'Ne jamais investir sur un actif dont vous ne comprenez pas le fonctionnement', d: 'Si vous ne pouvez pas expliquer en deux phrases d\'où vient le rendement, vous êtes probablement la source du rendement de quelqu\'un d\'autre.' },
      { r: 'Se méfier de ses propres analyses quand elles confirment ce qu\'on espérait', d: 'Le biais de confirmation est plus dangereux que n\'importe quel faux signal technique.' }
    ]
  }
];

/* =========================================================================
   QUIZ
   ========================================================================= */
export const QUIZ = [
  {
    q: 'Le RSI d\'un titre est à 78 et l\'ADX à 34. Que faites-vous ?',
    options: [
      'Je vends : le RSI signale un surachat manifeste.',
      'Je ne vends pas : avec un ADX à 34, la tendance est forte et le RSI peut rester élevé longtemps.',
      'J\'achète : le RSI élevé confirme la force.',
      'Je ne peux rien dire sans connaître le PER.'
    ],
    bonne: 1,
    explication: 'Avec un ADX supérieur à 25, le marché est en tendance : les seuils 70/30 du RSI perdent leur valeur de signal de retournement. Vendre sur un RSI à 78 en pleine tendance est l\'erreur classique qui fait sortir des meilleures positions. En revanche, ce n\'est pas non plus le moment d\'ouvrir une nouvelle position — le point d\'entrée est mauvais.'
  },
  {
    q: 'Vous disposez de 10 000 €, vous acceptez de risquer 1 %, l\'entrée est à 80 € et le stop à 74 €. Combien d\'actions achetez-vous ?',
    options: ['125 actions', '16 actions', '100 actions', '25 actions'],
    bonne: 1,
    explication: 'Risque total accepté = 10 000 × 1 % = 100 €. Risque par action = 80 − 74 = 6 €. Quantité = 100 / 6 = 16 actions, soit 1 280 € investis. Si le stop est touché, vous perdez 96 € — 1 % du capital, comme prévu. La plupart des débutants auraient calculé « combien puis-je acheter », soit 125 actions, et risqueraient 750 € sur une seule idée.'
  },
  {
    q: 'Un titre monte de 12 % en trois semaines, mais son OBV est resté plat. Que conclure ?',
    options: [
      'La hausse est solide, l\'OBV est un indicateur secondaire.',
      'La hausse n\'est pas financée par des volumes croissants : elle est fragile.',
      'Il faut acheter davantage, l\'OBV va rattraper.',
      'L\'OBV plat indique une accumulation.'
    ],
    bonne: 1,
    explication: 'Une divergence entre le prix et l\'OBV signifie que la hausse se fait sur des volumes faibles, ou que les volumes de baisse compensent ceux de hausse. Concrètement : peu d\'acheteurs convaincus, et souvent des vendeurs qui profitent de la hausse pour se dégager. Ce n\'est pas un signal de vente immédiat, mais une raison de réduire la taille et de resserrer le stop.'
  },
  {
    q: 'Quel rapport gain/risque minimal faut-il pour être rentable avec un taux de réussite de 40 % ?',
    options: ['1 pour 1', '1,5 pour 1', 'Plus de 1,5 pour 1', '3 pour 1 minimum'],
    bonne: 2,
    explication: 'Le seuil de rentabilité est R/R = (1 − taux) / taux = (1 − 0,40) / 0,40 = 1,5. À exactement 1,5 vous êtes à l\'équilibre — et les frais vous font perdre. Il faut donc dépasser 1,5 pour gagner réellement. C\'est pourquoi AlphaDesk considère qu\'un plan sous 1,2 n\'est pas exploitable.'
  },
  {
    q: 'Les bandes de Bollinger se resserrent fortement depuis trois semaines. Qu\'est-ce que cela indique ?',
    options: [
      'Le titre va monter.',
      'Le titre va baisser.',
      'Un mouvement de forte amplitude se prépare, sans indication de direction.',
      'Le titre va rester calme encore longtemps.'
    ],
    bonne: 2,
    explication: 'La compression de volatilité est l\'un des rares phénomènes qui s\'anticipent : la volatilité est cyclique, une phase calme est suivie d\'une phase agitée. Mais la compression ne dit rien de la direction. L\'erreur est de deviner le sens ; la bonne pratique est de préparer les deux scénarios et de suivre la sortie.'
  },
  {
    q: 'Votre position est en perte de 8 %, le stop initial était à −6 %. Que faites-vous ?',
    options: [
      'J\'élargis le stop à −12 %, le titre va rebondir.',
      'Je renforce pour baisser mon prix de revient moyen.',
      'Le stop aurait dû être exécuté à −6 % : je sors et j\'analyse pourquoi il ne l\'a pas été.',
      'J\'attends sans rien faire.'
    ],
    bonne: 2,
    explication: 'Un stop non respecté n\'est pas un stop, c\'est un souhait. Les deux premières réponses sont les deux mécanismes par lesquels les investisseurs particuliers transforment une perte de 6 % en perte de 40 %. Renforcer à la baisse (« moyenner ») augmente l\'exposition à une idée dont le marché vient de vous dire qu\'elle était fausse.'
  },
  {
    q: 'Le TQS d\'un titre est à 25 et le MPI à +55. Comment interpréter ?',
    options: [
      'Signal d\'achat très fort : le momentum est excellent.',
      'Beaucoup d\'énergie mais aucune tendance structurée : configuration piège, mieux vaut attendre.',
      'Signal de vente : le TQS est bas.',
      'Les deux indicateurs se contredisent, ils sont inutilisables.'
    ],
    bonne: 1,
    explication: 'C\'est une configuration très courante et très coûteuse : un mouvement violent de court terme au sein d\'un marché sans direction. Le momentum élevé attire l\'œil, mais sans structure de tendance, ces mouvements se retournent aussi vite qu\'ils sont venus. Le score global d\'AlphaDesk pondère justement le momentum par la qualité de tendance pour éviter ce piège.'
  },
  {
    q: 'Que mesure exactement la VaR 95 % à un jour ?',
    options: [
      'La perte maximale possible sur la position.',
      'La perte moyenne des journées négatives.',
      'Le seuil de perte dépassé une séance sur vingt, d\'après l\'historique.',
      'La probabilité de perdre de l\'argent.'
    ],
    bonne: 2,
    explication: 'La VaR 95 % est le seuil que les pertes dépassent dans 5 % des cas, soit une séance sur vingt environ. Son piège majeur : elle ne dit rien de l\'ampleur des pertes AU-DELÀ de ce seuil. C\'est pour cela qu\'AlphaDesk calcule aussi la CVaR (perte moyenne dans ces 5 % de pires cas) et le kurtosis, qui mesure l\'épaisseur des queues de distribution.'
  }
];

/* ---------------------------- petits formats --------------------------- */
const nf = (x, d = 1) => (x === null || x === undefined || !isFinite(x)) ? 'n/d'
  : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
function fmt(x) {
  if (x === null || x === undefined || !isFinite(x)) return 'n/d';
  const a = Math.abs(x);
  return nf(x, a >= 1000 ? 0 : a >= 10 ? 2 : 3);
}
function fmtMoney(x) {
  if (x === null || !isFinite(x)) return 'n/d';
  return Math.round(x).toLocaleString('fr-FR') + ' €';
}
