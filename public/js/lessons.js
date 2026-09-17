/* =========================================================================
   AlphaDesk — Académie, partie « méthodes »

   Les fiches indicateurs (academy.js) expliquent des OUTILS.
   Ce fichier explique des MÉTHODES : ce qui a été testé publiquement,
   sur des décennies, et ce qui a survécu — avec ce que ça coûte.

   Règle d'écriture : aucune affirmation sans sa source, et aucune méthode
   présentée sans son mode d'échec. Une méthode dont on ne vous dit pas
   quand elle perd est une méthode qu'on vous vend.
   ========================================================================= */

export const LECONS = [
  /* ------------------------------------------------------------------ */
  {
    id: 'preuves',
    titre: 'Savoir ce qui a été prouvé, et ce qui a seulement été raconté',
    famille: 'Méthode',
    niveau: 'base',
    resume: 'La question à poser avant d’adopter n’importe quelle règle.',
    accroche: `Le monde de la bourse produit des règles à un rythme industriel. La quasi-totalité ne survit pas à un examen sérieux. Avant d’adopter une méthode, il y a quatre questions à poser — et elles éliminent 95 % de ce qui circule.`,
    sections: [
      {
        t: 'Les quatre questions',
        p: [
          '**Sur combien d’années a-t-elle été testée ?** Une règle validée sur cinq ans n’a rien prouvé : elle a décrit un régime de marché. Le seuil sérieux commence vers vingt ans, idéalement en incluant 2000-2003 et 2008.',
          '**A-t-elle survécu à sa publication ?** C’est le test le plus dur. Une anomalie publiée attire les capitaux qui la font disparaître. Le momentum, publié en 1993, fonctionne toujours — c’est exceptionnel. Le « lundi noir », l’effet janvier et la plupart des effets calendaires ont été arbitrés jusqu’à extinction.',
          '**Marche-t-elle ailleurs ?** Une règle qui ne fonctionne que sur le S&P 500 est probablement le fruit du hasard. Les effets robustes se retrouvent sur plusieurs pays, plusieurs classes d’actifs, plusieurs époques.',
          '**Combien de variantes ont été essayées avant de trouver celle-ci ?** Si l’auteur a testé deux cents combinaisons de paramètres et vous montre la meilleure, il ne vous montre pas une découverte : il vous montre un accident. C’est le sur-ajustement, la maladie mortelle du backtest.'
        ]
      },
      {
        t: 'Le sur-ajustement, en une image',
        p: [
          'Prenez cent personnes, faites-leur jouer dix fois à pile ou face. En moyenne, une d’entre elles fera huit bons appels sur dix. Si vous ne montrez que celle-là, vous avez la preuve d’un talent extraordinaire — sauf qu’il n’y a aucun talent.',
          'C’est exactement ce que produit un optimiseur de paramètres. Le remède n’est pas de mieux optimiser : c’est de **tester la règle sur des périodes et des actifs qui n’ont pas servi à la construire**. C’est ce que fait le bouton « Test par sous-périodes » de l’écran Backtest.'
        ]
      },
      {
        t: 'Ce qui reste debout après ce filtre',
        p: [
          'Très peu de choses, et c’est rassurant : cela signifie qu’il n’y a pas cent méthodes à maîtriser, mais trois ou quatre familles à comprendre. Le momentum, le suivi de tendance, la prime de valeur et de qualité, et la gestion du risque. Le reste est du commentaire.'
        ]
      }
    ],
    aRetenir: 'Une méthode sans période de test longue, sans validation hors échantillon et sans mode d’échec annoncé n’est pas une méthode : c’est une opinion avec des chiffres.'
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'momentum',
    titre: 'Le momentum — la seule anomalie qui ait survécu à sa publication',
    famille: 'Ce qui marche',
    niveau: 'inter',
    resume: 'Ce qui monte depuis un an a tendance à continuer encore quelques mois.',
    accroche: `C’est le résultat le plus dérangeant de la finance académique, parce qu’il contredit frontalement l’idée que les marchés sont efficients. Et pourtant il tient depuis trente ans après publication, sur presque tous les marchés testés.`,
    sections: [
      {
        t: 'Le constat',
        p: [
          'Jegadeesh et Titman publient en 1993 un résultat simple : acheter les titres qui ont le mieux performé sur les 3 à 12 derniers mois, et vendre les pires, produit un rendement anormal qui persiste 3 à 12 mois.',
          'Moskowitz, Ooi et Pedersen étendent en 2012 l’observation aux indices, matières premières, devises et obligations : **58 marchés, même effet**. Des travaux ultérieurs le retrouvent sur des données reconstituées remontant au XIXᵉ siècle.',
          'Un détail compte : on **exclut le dernier mois**. À très court terme, le prix a tendance à faire l’inverse. Le signal classique est donc « rendement entre −12 mois et −1 mois ».'
        ]
      },
      {
        t: 'Pourquoi ça marche (les deux explications)',
        p: [
          '**L’explication comportementale** : les investisseurs réagissent trop lentement aux bonnes nouvelles, puis trop fort quand ils se rendent compte qu’ils ont tardé. L’information met des mois à se refléter entièrement dans le prix.',
          '**L’explication par le risque** : le momentum s’effondre brutalement lors des retournements violents. Vous êtes payé pour accepter un risque rare mais atroce. En 2009, une stratégie momentum classique a perdu plus de 40 % en trois mois, au moment précis où le marché rebondissait.',
          'Les deux sont probablement vraies en partie. Pour un investisseur particulier, seule la conséquence pratique compte : **le momentum paie en moyenne, et vous fait très mal aux retournements.**'
        ]
      },
      {
        t: 'La règle concrète',
        p: [
          'Version minimale, réévaluée une fois par mois : rendement sur 12 mois positif → investi ; négatif → liquidités. C’est le « momentum absolu » de Gary Antonacci.',
          'Version comparative : classer les valeurs de votre univers par rendement 12 mois et ne garder que le premier tiers. C’est ce que fait la colonne « vs indice » du screener.',
          'Ne réévaluez pas tous les jours. Le momentum est un effet de moyen terme ; le surveiller quotidiennement ne fait qu’ajouter des frais et des faux départs.'
        ]
      },
      {
        t: 'Ce que ça coûte',
        p: [
          'Des périodes de sous-performance de deux à trois ans, où vous verrez la détention simple faire mieux et vous vous demanderez pourquoi vous suivez cette règle. C’est précisément à ce moment-là que la plupart abandonnent — et c’est pour ça que l’effet survit.',
          'Des retournements brutaux : le momentum est mauvais aux points d’inflexion majeurs, par construction.'
        ]
      }
    ],
    methodeId: 'momentum12',
    aRetenir: 'Le momentum est l’effet le plus documenté du marché. Il paie en moyenne, il vous humilie aux retournements, et il exige de tenir pendant les périodes creuses.'
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'tendance',
    titre: 'Le suivi de tendance — vous n’achetez pas du rendement, vous achetez de l’assurance',
    famille: 'Ce qui marche',
    niveau: 'inter',
    resume: 'La règle la plus simple du monde, et ce qu’elle apporte réellement.',
    accroche: `« Investi si le cours est au-dessus de sa moyenne 200 séances, sinon en liquidités. » C’est tout. Meb Faber a testé cette règle en 2007 sur plus d’un siècle de données, et le résultat est très mal compris.`,
    sections: [
      {
        t: 'Ce que le test montre vraiment',
        p: [
          'Le rendement est **comparable** à la détention simple — pas spectaculairement meilleur. Ce qui change radicalement, c’est le repli maximal : il est souvent divisé par deux, parfois par trois.',
          'La raison est mécanique : les grands krachs ne surviennent presque jamais au-dessus de la moyenne 200. Ils s’installent après que le cours l’ait cassée. La règle ne prédit rien — elle vous sort avant le pire du désastre, et vous fait rentrer un peu trop tard.'
        ]
      },
      {
        t: 'Pourquoi c’est plus important que le rendement',
        p: [
          'Une stratégie à +9 % par an avec −55 % de repli maximal est mathématiquement supérieure à une stratégie à +8 % avec −22 %. En pratique, c’est l’inverse : **personne ne tient une perte de 55 %**. On vend au plus bas, on revient trop tard, et le rendement théorique n’est jamais encaissé.',
          'La vraie question n’est pas « quelle méthode rapporte le plus » mais « quelle méthode puis-je encore suivre quand tout va mal ». C’est pour ça que le repli maximal est affiché en gras dans le backtest.'
        ]
      },
      {
        t: 'Le prix à payer',
        p: [
          '**Les faux signaux.** Dans un marché qui oscille autour de sa moyenne, vous sortez et rentrez en boucle, en perdant un peu à chaque aller-retour. C’est le coût de l’assurance : des petites pertes régulières contre la protection d’un sinistre rare.',
          '**Le retard.** Vous ne sortirez jamais au sommet et ne rentrerez jamais au plus bas. Une méthode qui promettrait le contraire ne serait pas une méthode de suivi.',
          '**La frustration.** En marché haussier régulier, vous ferez moins bien que ne rien faire, et vous aurez payé des frais pour ça.'
        ]
      },
      {
        t: 'Comment l’appliquer sans se saborder',
        p: [
          'Décidez **une fois par mois**, pas tous les jours : Faber teste la règle en données mensuelles, et c’est ce qui limite les faux signaux.',
          'Appliquez-la à un indice ou un ETF diversifié plutôt qu’à une action isolée. Sur un titre unique, la volatilité propre à l’entreprise génère beaucoup plus de bruit.',
          'Ne l’améliorez pas. Chaque « optimisation » que vous ajouterez sera calée sur le passé récent.'
        ]
      }
    ],
    methodeId: 'faber',
    aRetenir: 'Le suivi de tendance n’augmente pas beaucoup le rendement ; il rend le parcours tenable. C’est ce qui permet d’encaisser réellement le rendement de long terme au lieu d’abandonner en route.'
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'retour',
    titre: 'Le retour à la moyenne — puissant à court terme, mortel au mauvais endroit',
    famille: 'Ce qui marche',
    niveau: 'avance',
    resume: 'Acheter la baisse fonctionne, à une condition non négociable.',
    accroche: `Les excès de court terme se corrigent : c’est vrai et c’est mesurable. Mais la même règle appliquée sans filtre est la façon la plus efficace de se ruiner.`,
    sections: [
      {
        t: 'Le constat',
        p: [
          'Sur des horizons de quelques jours, le prix a tendance à revenir vers sa moyenne. Connors et Alvarez documentent en 2008 un système simple : RSI sur 2 périodes sous 10, achat ; sortie dès que le cours repasse au-dessus de sa moyenne 5 séances.',
          'Les taux de réussite publiés sont élevés — souvent au-dessus de 65 %. Ce qui est trompeur, parce que le taux de réussite n’est pas ce qui détermine la rentabilité.'
        ]
      },
      {
        t: 'Le filtre qui change tout',
        p: [
          '**Cours au-dessus de la moyenne 200 séances.** Sans ce filtre, vous n’achetez plus un excès temporaire : vous achetez une entreprise en train de s’effondrer. La baisse a une raison, et elle continue.',
          'C’est la différence entre acheter un repli dans une tendance haussière — statistiquement payant — et rattraper un couteau qui tombe — statistiquement ruineux. Les deux ressemblent exactement à la même chose sur le graphique du jour.'
        ]
      },
      {
        t: 'Le piège du taux de réussite',
        p: [
          'Ces méthodes gagnent souvent, mais peu à chaque fois, et perdent rarement, mais beaucoup. Le profil de résultat est l’inverse du suivi de tendance.',
          'Conséquence : une seule perte non coupée efface quinze gains. La discipline du stop est encore plus critique ici qu’ailleurs, alors même que la méthode donne l’impression rassurante de « presque toujours marcher ».'
        ]
      }
    ],
    methodeId: 'connors2',
    aRetenir: 'Le retour à la moyenne ne s’applique qu’au-dessus de la moyenne 200. En dessous, la même règle vous fait acheter une entreprise en train de mourir.'
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'couts',
    titre: 'Les frais et l’impôt — l’adversaire qui gagne toujours',
    famille: 'Ce qui compte',
    niveau: 'base',
    resume: 'Le seul facteur de performance que vous contrôlez entièrement.',
    accroche: `Vous ne contrôlez pas les marchés. Vous contrôlez ce que vous payez pour y accéder — et sur vingt ans, c’est souvent l’écart le plus important entre deux investisseurs identiques.`,
    sections: [
      {
        t: 'L’arithmétique',
        p: [
          '10 000 € placés à 7 % par an pendant 25 ans donnent environ 54 000 €. Les mêmes 10 000 € à 5 % — soit deux points de frais en moins — donnent environ 34 000 €. **Deux points de frais ont coûté 37 % du résultat final.**',
          'Ce n’est pas une opinion sur la gestion active : c’est de l’intérêt composé appliqué à une soustraction.'
        ]
      },
      {
        t: 'Ce que coûte réellement une transaction',
        p: [
          'Le courtage affiché n’est qu’une partie. Il faut y ajouter **l’écart entre l’achat et la vente** (vous achetez au prix demandé, vous vendez au prix offert) et le **glissement** (le prix bouge entre votre décision et votre exécution).',
          'C’est pour cela que le backtest d’AlphaDesk déduit 10 points de base de frais **et** 5 points de glissement, à l’aller comme au retour. Une méthode qui n’est rentable que sans ces coûts n’est pas rentable.'
        ]
      },
      {
        t: 'L’effet sur le choix de méthode',
        p: [
          'Une stratégie qui produit 200 allers-retours par an doit être significativement meilleure qu’une stratégie qui en produit 4, juste pour arriver au même résultat net. Regardez toujours la colonne « opérations » avant la colonne « rendement ».',
          'En France, le PEA permet d’éviter l’impôt sur les plus-values après cinq ans (hors prélèvements sociaux). Une méthode qui tourne beaucoup à l’intérieur d’un PEA n’est pas taxée à chaque aller-retour — ce qui change complètement le calcul par rapport à un compte-titres ordinaire.'
        ]
      }
    ],
    aRetenir: 'Avant de chercher à gagner un point de performance, vérifiez que vous n’en perdez pas deux en frais. C’est plus facile, plus sûr, et immédiat.'
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'diversification',
    titre: 'La diversification — le seul repas gratuit, et comment on le gâche',
    famille: 'Ce qui compte',
    niveau: 'inter',
    resume: 'Réduire le risque sans réduire le rendement espéré. À une condition.',
    accroche: `Markowitz l’appelait « le seul repas gratuit de la finance » : en combinant des actifs qui ne bougent pas ensemble, on réduit la volatilité sans sacrifier le rendement espéré. La condition tient dans trois mots : qui ne bougent pas ensemble.`,
    sections: [
      {
        t: 'Ce qui n’est pas de la diversification',
        p: [
          'Détenir dix valeurs technologiques américaines, c’est détenir une seule idée en dix exemplaires. La corrélation entre elles dépasse souvent 0,8 : en cas de choc, elles tombent ensemble.',
          'La colonne « corrélation à l’indice » de l’écran d’analyse sert exactement à ça. Une valeur à 0,9 de corrélation n’ajoute presque rien à un portefeuille qui contient déjà l’indice.'
        ]
      },
      {
        t: 'Le piège des corrélations en temps de crise',
        p: [
          'Les corrélations ne sont pas stables : elles **montent quand le marché s’effondre**. Les diversifications qui fonctionnaient en temps calme disparaissent précisément le jour où vous en aviez besoin.',
          'C’est la raison pour laquelle le diagnostic du portefeuille d’AlphaDesk calcule le risque cumulé « si tous les stops étaient touchés simultanément » plutôt qu’un risque moyen : en crise, ils se déclenchent ensemble.'
        ]
      },
      {
        t: 'Le rééquilibrage',
        p: [
          'Ramener périodiquement les poids à leur cible vous force à vendre ce qui a monté et acheter ce qui a baissé — l’inverse de ce que l’émotion commande. Sur longue période, cela ajoute un peu de rendement et réduit le risque.',
          'Une ou deux fois par an suffit. Rééquilibrer trop souvent transforme le bénéfice en frais.'
        ]
      }
    ],
    aRetenir: 'Diversifier, ce n’est pas multiplier les lignes : c’est multiplier les idées indépendantes. Dix titres du même secteur, c’est une seule ligne mal déguisée.'
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'nemarchepas',
    titre: 'Ce qui ne marche pas — et pourquoi ça se vend si bien',
    famille: 'Ce qui ne marche pas',
    niveau: 'base',
    resume: 'Les méthodes qui échouent aux quatre questions, et le ressort psychologique de chacune.',
    accroche: `Il est aussi utile de savoir ce qui ne fonctionne pas. Toutes les pratiques ci-dessous sont populaires ; aucune ne résiste à un test sérieux.`,
    sections: [
      {
        t: 'Prédire la direction du marché',
        p: [
          'Les prévisions d’indices à un an des grandes banques, comparées aux résultats réels, se révèlent régulièrement moins précises qu’une règle naïve du type « le marché monte de 8 % ». Ce n’est pas un problème de compétence : c’est un problème d’impossibilité.',
          'Ressort psychologique : une prévision chiffrée donne l’illusion du contrôle. Un « je ne sais pas, voici comment je gère l’incertitude » ne se vend pas.'
        ]
      },
      {
        t: 'Les figures chartistes complexes',
        p: [
          'Épaule-tête-épaule, drapeaux, biseaux : les tests systématiques donnent des résultats faibles et instables, très sensibles à la définition exacte de la figure. Le problème est que la reconnaissance de forme humaine trouve des figures partout, y compris dans du bruit aléatoire.',
          'Faites l’expérience : générez une marche aléatoire et vous y verrez des épaule-tête-épaule parfaits.'
        ]
      },
      {
        t: 'L’effet de levier comme accélérateur',
        p: [
          'Le levier ne multiplie pas le rendement : il multiplie la **volatilité**, et la volatilité ronge le capital de façon asymétrique. Perdre 50 % exige ensuite de gagner 100 % pour revenir à l’équilibre.',
          'Sur un actif volatil, un levier ×3 quotidien peut perdre de l’argent même quand le sous-jacent finit à l’équilibre. Ce n’est pas un défaut du produit : c’est son fonctionnement mathématique normal.'
        ]
      },
      {
        t: 'Moyenner à la baisse sans thèse',
        p: [
          'Renforcer une position perdante « pour baisser le prix de revient » augmente l’exposition à une idée dont le marché vient de dire qu’elle était fausse. Cela transforme une petite perte planifiée en perte majeure subie.',
          'Ressort psychologique : c’est indolore sur le moment, parce que cela évite d’acter l’erreur. C’est exactement pour ça que c’est dangereux.'
        ]
      },
      {
        t: 'Suivre des signaux dont on ignore la règle',
        p: [
          'Si vous ne pouvez pas écrire la règle qui a produit le signal, vous ne pourrez pas savoir quand elle cesse de fonctionner, ni décider de sortir. Vous n’avez pas une méthode : vous avez une dépendance.',
          'C’est la raison d’être de cette application : chaque score affiché est décomposé en facteurs, chaque facteur est chiffré, et chaque formule est lisible dans le code.'
        ]
      }
    ],
    aRetenir: 'Les méthodes qui se vendent le mieux sont celles qui promettent de supprimer l’incertitude. L’incertitude ne se supprime pas — elle se dimensionne.'
  },

  /* ------------------------------------------------------------------ */
  {
    id: 'psychologie',
    titre: 'Les biais qui coûtent le plus cher',
    famille: 'Ce qui compte',
    niveau: 'base',
    resume: 'Les erreurs sont systématiques, donc prévisibles, donc évitables.',
    accroche: `Les erreurs d’investissement ne sont pas aléatoires : elles suivent des schémas identifiés et reproductibles. Les connaître ne suffit pas à les éviter — mais les règles écrites, si.`,
    sections: [
      {
        t: 'L’aversion à la perte',
        p: [
          'Kahneman et Tversky l’ont mesurée : une perte fait environ deux fois plus mal qu’un gain équivalent ne fait plaisir. Conséquence directe : on coupe les gains trop tôt pour sécuriser la satisfaction, et on laisse courir les pertes pour éviter d’acter la douleur.',
          'C’est exactement l’inverse de ce qu’il faut faire. **Le remède n’est pas la volonté, c’est l’ordre automatique** : stop placé à l’entrée, objectif partiel défini à l’avance.'
        ]
      },
      {
        t: 'Le biais de confirmation',
        p: [
          'Une fois la position prise, vous lirez les nouvelles qui vous donnent raison et écarterez les autres. C’est involontaire et quasi universel.',
          'Remède concret : écrivez au moment de l’entrée **ce qui vous ferait changer d’avis**. Si ce point est atteint et que vous cherchez une raison de rester, vous venez de l’identifier en direct. C’est la fonction du champ « thèse » et de la section « ce qui invaliderait l’analyse ».'
        ]
      },
      {
        t: 'L’excès de confiance après une série de gains',
        p: [
          'Trois gains d’affilée et la taille des positions augmente, les stops s’élargissent, la discipline se relâche. La série de gains n’a rien prouvé : sur une méthode à 50 % de réussite, trois gains consécutifs arrivent une fois sur huit.',
          'Remède : la taille de position est déterminée par une formule, pas par l’humeur du moment.'
        ]
      },
      {
        t: 'Le biais rétrospectif',
        p: [
          'Après coup, tout krach paraît évident. Cette illusion vous convainc que vous auriez pu le voir venir, donc que vous verrez le prochain. C’est faux, et c’est coûteux.',
          'Remède : le journal de bord. Relire ce que vous pensiez **avant** de savoir est le seul antidote connu.'
        ]
      }
    ],
    aRetenir: 'On ne corrige pas un biais par la lucidité : on le neutralise par une règle écrite à l’avance, quand on est calme.'
  }
];

/* =========================================================================
   PLAN DE TRAVAIL — dans quel ordre lire tout ça
   ========================================================================= */
export const PROGRESSION = [
  {
    titre: 'Semaine 1 — ne pas se faire mal',
    but: 'Comprendre le risque avant de chercher le rendement.',
    etapes: [
      { type: 'lecon', id: 'preuves' },
      { type: 'fiche', id: 'sizing' },
      { type: 'fiche', id: 'atr' },
      { type: 'fiche', id: 'rr' },
      { type: 'lecon', id: 'couts' }
    ],
    exercice: 'Sur un titre de votre choix, notez le plan calculé par AlphaDesk et vérifiez à la main le calcul de quantité. Si vous ne retrouvez pas le chiffre, vous n’avez pas compris la formule — relisez avant d’aller plus loin.'
  },
  {
    titre: 'Semaine 2 — lire un marché',
    but: 'Savoir dans quel type de marché on se trouve, avant de choisir un outil.',
    etapes: [
      { type: 'fiche', id: 'adx' },
      { type: 'fiche', id: 'tqs' },
      { type: 'fiche', id: 'mm' },
      { type: 'fiche', id: 'bollinger' },
      { type: 'fiche', id: 'vrg' }
    ],
    exercice: 'Lancez le screener sur le CAC 40 et classez mentalement les valeurs en trois groupes : en tendance, sans direction, en retournement. Comparez ensuite avec la colonne TQS.'
  },
  {
    titre: 'Semaine 3 — les méthodes qui tiennent',
    but: 'Connaître les trois familles qui ont survécu aux tests, et leurs coûts.',
    etapes: [
      { type: 'lecon', id: 'tendance' },
      { type: 'lecon', id: 'momentum' },
      { type: 'lecon', id: 'retour' },
      { type: 'lecon', id: 'nemarchepas' }
    ],
    exercice: 'Ouvrez l’écran Méthodes et comparez-les sur trois titres très différents : une valeur en forte tendance, une valeur qui oscille, un indice. Notez comment le classement change complètement — c’est la leçon la plus importante de tout ce parcours.'
  },
  {
    titre: 'Semaine 4 — tenir dans la durée',
    but: 'Transformer une méthode en pratique régulière.',
    etapes: [
      { type: 'lecon', id: 'diversification' },
      { type: 'lecon', id: 'psychologie' },
      { type: 'fiche', id: 'divergence' },
      { type: 'fiche', id: 'sfi' }
    ],
    exercice: 'Écrivez dans le journal de bord vos trois règles personnelles non négociables. Relisez-les avant chaque ordre pendant un mois.'
  }
];
