# AlphaDesk

Poste d'analyse technique et d'aide à la décision d'investissement. Tourne **entièrement sur votre machine**,
sans compte, sans abonnement, sans envoi de vos données ailleurs.

La différence avec les sites d'analyse habituels : ici, **la décision est affichée, pas cachée** — et surtout,
tout ce qui l'a produite est visible. Score, poids de chaque facteur, niveaux calculés, taille de position,
et une explication écrite de pourquoi le moteur pense ce qu'il pense.

---

## Démarrer

Double-cliquez sur **`Lancer AlphaDesk.bat`**. Le navigateur s'ouvre sur `http://localhost:4321`.

Ou en ligne de commande :

```bash
node server.js
```

Node.js 18 ou plus récent est requis (vous avez Node 22). **Aucune dépendance à installer** — pas de `npm install`,
pas de `node_modules`. Tout est écrit à la main.

---

## Les écrans

| Écran | Ce qu'il fait |
|---|---|
| **Analyse d'un titre** | Le rapport complet : graphique, 40+ indicateurs, score, plan chiffré, unité de temps supérieure, configurations analogues, fourchette probable, saisonnalité |
| **Screener** | Note chaque valeur d'un univers (CAC 40, Europe, US, ETF PEA, crypto…) avec **vos** réglages et les classe |
| **Backtest** | Rejoue le moteur séance par séance sur l'historique pour savoir s'il aurait créé de la valeur |
| **Comparateur de méthodes** | Met 11 méthodes documentées en concurrence sur *votre* titre, avec les mêmes frais pour toutes |
| **Portefeuille** | Suit vos positions, calcule le risque réel cumulé, alerte sur les niveaux franchis |
| **Journal** | Trace vos décisions et leurs raisons — le seul moyen de distinguer une bonne décision d'un bon résultat |
| **Académie + Quiz** | 8 leçons de méthode, un plan en 4 semaines, 19 fiches indicateurs branchées sur les valeurs réelles du titre, 8 questions pièges |

---

## Comment la décision est construite

### 1. Les indicateurs bruts (`public/js/indicators.js`)

Tout est recalculé localement à partir des séries OHLCV. Rien n'est repris d'un fournisseur de signaux :
vous pouvez lire chaque formule.

- **Tendance** — SMA 20/50/100/200, EMA, Hull MA, DEMA, MACD, ADX/DI, Supertrend, Parabolic SAR, Ichimoku, Aroon
- **Momentum** — RSI, Stochastique, StochRSI, CCI, Williams %R, ROC, TSI
- **Volatilité** — ATR, Bollinger (+ %B, largeur), Keltner, Donchian, volatilité historique, détection de compression
- **Volume** — OBV, CMF, MFI, Force Index, ligne A/D, VWAP glissant et ancré
- **Statistiques** — Sharpe, Sortino, VaR et CVaR historiques, asymétrie, kurtosis, bêta, corrélation, exposant de Hurst
- **Structure** — sommets et creux, zones de support/résistance pondérées par les touches, pivots, Fibonacci,
  divergences prix/oscillateur, chandeliers japonais

### 2. Les cinq agrégats maison (`public/js/engine.js`)

Des dizaines de mesures condensées en cinq lectures uniques :

| Code | Nom | Échelle | Répond à |
|---|---|---|---|
| **TQS** | Trend Quality Score | 0 → 100 | *Y a-t-il une tendance exploitable ?* (avant même de demander son sens) |
| **MPI** | Momentum Pressure Index | −100 → +100 | *Qui pousse, les acheteurs ou les vendeurs ?* |
| **VRG** | Volatility Regime Gauge | régime + rang | *La volatilité actuelle est-elle normale pour ce titre ?* |
| **SFI** | Smart Flow Index | −100 → +100 | *L'argent entre-t-il vraiment, ou la hausse est-elle vide ?* |
| **RES** | Risk Exposure Score | 0 → 100 | *Combien ce titre peut-il faire mal ?* → pilote la taille de position |

### 3. Le score global

Neuf facteurs sont notés de −100 à +100, puis pondérés **selon votre horizon** :

| Facteur | Court terme | Moyen terme | Long terme |
|---|---|---|---|
| Tendance de fond | 14 % | 22 % | 26 % |
| Qualité de la tendance | 10 % | 14 % | 12 % |
| Momentum | 26 % | 18 % | 10 % |
| Flux de capitaux | 14 % | 12 % | 8 % |
| Position dans la fourchette | 14 % | 8 % | 6 % |
| Structure et signaux | 12 % | 10 % | 8 % |
| Régime de volatilité | 6 % | 6 % | 4 % |
| Force relative au marché | 4 % | 6 % | 8 % |
| Fondamentaux | 0 % | 4 % | 18 % |

Le score est ensuite **raboté** en cas de choc de volatilité (−30 %) ou de risque intrinsèque très élevé (−15 %).
La **conviction** mesure séparément l'accord entre les facteurs et leur dispersion : un score fort mais isolé
est rétrogradé automatiquement.

### 4. Le plan de trade

- **Stop** — le plus serré des trois candidats (multiple d'ATR selon l'horizon, ligne Supertrend, dernier creux
  marqué), avec un **plancher de bruit à 1,2 × ATR**. Un stop plus proche serait touché par le mouvement
  normal du titre : on perdrait de l'argent tout en ayant raison.
- **Objectifs** — le premier vrai niveau technique situé au-delà de 1, 2 puis 3,2 fois le risque encaissé.
  Un niveau plus proche que le risque ne justifie pas le trajet. Si aucun niveau n'existe au-dessus
  (titre en territoire vierge), on projette sur un multiple du risque.
- **Quantité** — `(capital × risque accepté) / (entrée − stop)`, réduite automatiquement quand le VRG ou le RES
  signalent un danger, puis plafonnée par la limite de concentration du profil.
- **Verdict** — un plan sous **1,2 de rapport gain/risque** est marqué *non exploitable*, même quand le signal
  est très positif. C'est volontaire.

---

## Les méthodes — enseignées, puis vérifiées

L'Académie ne se contente pas de définir des outils : elle expose **ce qui a réellement été testé**,
sur des décennies, avec ce que ça coûte. Chaque leçon est présentée avec son mode d'échec — une méthode
dont on ne vous dit pas quand elle perd est une méthode qu'on vous vend.

**Le filtre appliqué à tout ce qui est enseigné ici** — quatre questions qui éliminent l'essentiel de ce
qui circule : testé sur combien d'années ? a-t-elle survécu à sa publication ? marche-t-elle sur d'autres
marchés ? combien de variantes ont été essayées avant de trouver celle-ci ?

Ce qui reste debout : le **momentum** (Jegadeesh & Titman 1993, étendu à 58 marchés par Moskowitz, Ooi &
Pedersen 2012), le **suivi de tendance** (Faber 2007, plus d'un siècle de données), le **retour à la moyenne
filtré** (Connors & Alvarez 2008), et la **gestion du risque**. Le reste est du commentaire — et une leçon
entière est consacrée à ce qui ne marche pas, avec le ressort psychologique qui explique pourquoi ça se vend.

### Le comparateur : les leçons mises à l'épreuve sur vos titres

Onze méthodes implémentées **telles qu'elles sont définies dans leur source**, sans les améliorer après coup,
et soumises aux mêmes règles d'exécution : décision à la clôture, ordre à l'ouverture suivante, frais et
glissement à l'aller comme au retour, capital non rémunéré hors position.

Achat et conservation (référence) · Règle des 10 mois de Faber · MM200 quotidienne · Croisement doré ·
Momentum absolu 12 mois · Momentum 6 mois sautant le dernier · Cassure de Donchian 20/10 (les Tortues) ·
Supertrend · RSI(2) de Connors · Croisement MACD · le moteur AlphaDesk.

Le classement est trié par **ratio de Calmar** (rendement annuel ÷ repli maximal), pas par performance brute :
il récompense les méthodes qu'on peut réellement suivre jusqu'au bout. Et l'écran insiste sur la seule
conclusion qui compte : **relancez sur trois ou quatre titres différents**. Si le classement change du tout
au tout, vous regardez du bruit.

## Ce que l'analyse dit en plus du score

- **Unité de temps supérieure** — la tendance hebdomadaire (ou mensuelle quand la période affichée est déjà
  hebdomadaire). Une position prise contre elle réussit nettement moins souvent ; c'est le filtre le plus
  rentable qui ne coûte rien.
- **Configurations analogues** — les fois où ce titre s'est trouvé dans le même état (par rapport à sa MM200,
  bande de RSI, position dans les bandes de Bollinger), et ce qui s'est passé ensuite à 1 et 3 mois.
  Une base de comparaison, pas une prévision — et l'écran refuse de conclure sous cinq occurrences.
- **Fourchette probable à un mois** — déduite de la distribution réelle des rendements de ce titre, pas d'une
  loi normale qui sous-estimerait systématiquement les extrêmes.
- **Saisonnalité** — affichée seulement quand l'historique le permet, et présentée comme une curiosité.
- **Publication de résultats** — avertissement quand elle tombe dans les jours qui viennent : un écart
  d'ouverture saute par-dessus les stops, donc le risque réel dépasse ce que le plan a calculé.

## Le système visuel

La couleur est assignée par le **rôle qu'elle joue**, jamais par goût — et la partie
colorimétrique est calculable, donc calculée : la palette est passée au validateur
sur la surface réelle de l'application (`#15161a`), pas jugée à l'œil.

| Rôle | Traitement | Résultat du contrôle |
|---|---|---|
| Direction des cours (hausse / baisse) | statut vert `#1baf7a` / rouge `#e34948` | ΔE 31,3 en vision normale · ΔE 6,9 en deutéranopie |
| Moyennes mobiles MM20 → MM200 | **rampe ordinale** monochrome bleue, claire → foncée | 4 contrôles sur 4 · écart de clarté et contraste validés |
| Score, momentum, flux, facteurs | **jauges divergentes**, point mort gris neutre | jamais une teinte au point mort |
| Risque et volatilité | statut bien / alerte / critique | réservé — jamais réutilisé pour une série |
| Chrome de l'interface | accent bleu `#3987e5` | n'est jamais une couleur de donnée |

**MM20, MM50 et MM200 ne sont pas trois catégories** — c'est une série ordonnée
(horizon court → long). Une rampe d'une seule teinte encode cet ordre, supprime la
confusion entre deux bleus voisins, et libère entièrement le vert et le rouge pour la
seule information qui les mérite : le sens du marché.

**Mode daltonien** (dans *Réglages* → Affichage). Le vert et le rouge boursiers ne sont
séparés que de ΔE 6,9 en deutéranopie, la forme la plus répandue de daltonisme. Le mode
bascule la direction sur une paire bleu / orange séparée de **26,8** et fait passer les
moyennes mobiles en rampe neutre. Dans les deux modes, le signe (+/−) et les libellés
restent affichés : la couleur n'est jamais le seul canal d'information.

Le reste suit les mêmes règles : traits de 2 px, corps de bougie plafonnés avec de l'air
entre voisines, grilles et seuils en trait plein d'une hauteur de cheveu (le pointillé est
réservé aux niveaux *projetés* — stop et objectifs), chasses fixes réservées aux colonnes
de chiffres, chasses proportionnelles pour les grands nombres isolés, et une seule figure
principale par écran.

## Le backtest : les règles anti-triche

Un backtest qui flatte ne sert à rien. Celui-ci applique :

- la décision est prise à la **clôture** de la séance, avec les seules données connues à cet instant ;
- l'exécution a lieu à l'**ouverture du lendemain** ;
- frais et glissement déduits à chaque aller **et** à chaque retour ;
- si le stop et l'objectif sont touchés le même jour, **le stop l'emporte** (hypothèse pessimiste) ;
- tout le moteur est *index-aware* : chaque calcul se fait sur une fenêtre qui se termine à la séance testée,
  jamais sur la série entière. **Aucune donnée future ne peut fuiter dans le passé.**

Deux mesures comptent plus que la performance affichée :

- **Le tableau de pouvoir prédictif** — « quand mon score dit X, que fait réellement le titre dans le mois qui
  suit ? », comparé à une séance prise au hasard. C'est le vrai test : si les bandes ne se séparent pas,
  le score n'apporte rien sur cette valeur.
- **Le test par sous-périodes** — le moteur tient-il sur trois régimes de marché différents, ou un seul
  a-t-il porté tout le résultat ?

---

## Données

Cotations et fondamentaux : **Yahoo Finance**, en différé de 15 à 20 minutes selon les places. Aucune clé n'est
nécessaire. Le serveur local sert de relais (le navigateur ne peut pas appeler Yahoo directement) et met en cache :
15 minutes pour les cotations, 12 heures pour les fondamentaux. Si la source tombe, le dernier cache est réutilisé
et l'écran l'indique.

---

## L'IA — facultative, et volontairement encadrée

Tout fonctionne **sans IA**. Les indicateurs, le score, le plan et le texte d'analyse sortent du moteur de calcul.

Si vous renseignez une clé API Anthropic dans **Réglages**, un bouton apparaît pour faire relire le rapport
chiffré par Claude. Le modèle reçoit **uniquement les valeurs déjà calculées** et a pour consigne stricte de
n'inventer aucun chiffre : il met en perspective, il ne recalcule pas. La clé est stockée dans
`data/settings.json` sur votre machine et n'est envoyée qu'à l'API d'Anthropic.

---

## Organisation du code

```
AlphaDesk/
├── server.js               relais Yahoo + cache + fichiers statiques + passerelle Claude (zéro dépendance)
├── Lancer AlphaDesk.bat    démarrage en un double-clic
├── data/                   cache disque et réglages (créé automatiquement)
└── public/
    ├── index.html
    ├── css/app.css
    └── js/
        ├── indicators.js   toutes les formules, lisibles une par une
        ├── engine.js       agrégats maison, facteurs, score, plan de trade, narratif
        ├── backtest.js     rejeu historique, statistiques, pouvoir prédictif, sous-périodes
        ├── chart.js        moteur graphique canvas (bougies, panneaux, curseur, jauges)
        ├── academy.js      19 fiches indicateurs, 4 parcours, 8 questions de quiz
        ├── lessons.js      8 leçons de méthode (preuves, coûts, biais) + plan en 4 semaines
        ├── strategies.js   11 méthodes exécutables + moteur de comparaison
        ├── universe.js     listes de valeurs à scanner
        ├── portfolio.js    positions, journal, risque agrégé, alertes
        └── app.js          interface et vues
```

**Vos données** (portefeuille, journal) vivent dans le `localStorage` du navigateur. Rien ne part sur un serveur.
Vider les données du site les effacerait : le bouton *Exporter le dossier* du portefeuille produit une sauvegarde JSON.

---

## Le mettre en ligne

AlphaDesk a besoin de son petit serveur Node : le navigateur ne peut pas appeler Yahoo Finance
directement (blocage CORS), c'est le relais qui s'en charge. **GitHub Pages ne convient donc pas** —
la page s'afficherait, mais aucune donnée n'arriverait. Il faut un hébergeur qui exécute Node.

### Render (gratuit)

1. Créez un compte sur [render.com](https://render.com) et connectez votre compte GitHub.
2. *New → Blueprint*, sélectionnez ce dépôt. Render lit `render.yaml` et configure tout seul.
3. Une fois déployé, ouvrez *Environment* et copiez la valeur de `ALPHADESK_TOKEN`.
4. Sur le site en ligne : **Réglages → Instance en ligne**, collez ce jeton.

L'instance gratuite s'endort après 15 minutes sans visite ; le premier chargement suivant prend
une trentaine de secondes, puis tout redevient instantané.

### Pourquoi un jeton

Dès que l'application est accessible par une URL publique, deux routes doivent être fermées :

| Route | Risque si elle reste ouverte |
|---|---|
| `POST /api/settings` | N'importe qui écrit dans vos réglages |
| `POST /api/ai` | N'importe qui **dépense vos crédits Anthropic** |

Définir `ALPHADESK_TOKEN` suffit à les fermer : le serveur exige alors un en-tête
`x-alphadesk-token`, comparé en temps constant. Tant que la variable est absente — c'est-à-dire
en usage local — rien ne change et tout reste ouvert.

Le reste de l'application demeure accessible sans jeton : analyse, screener, backtest, comparateur
et académie. Une limitation de débit de 150 requêtes par minute et par adresse évite que votre
instance ne serve de relais Yahoo à toute la planète.

### Vos données restent chez vous

Portefeuille et journal vivent dans le `localStorage` de **votre navigateur**, jamais sur le serveur.
Déployer l'application en ligne ne publie donc aucune de vos positions : deux personnes ouvrant la
même URL voient chacune leur propre portefeuille, vide au départ.

## Limites — à lire une fois

L'analyse technique **décrit des comportements passés**. Elle ne connaît pas les résultats à venir, ni une fusion,
ni une décision de banque centrale. Un backtest favorable ne garantit rien : il décrit ce qui *aurait* marché
sur une valeur et une période données.

Le moteur ne remplace pas votre jugement — il le structure, le chiffre, et vous force à écrire le scénario
avant d'engager de l'argent. Ce n'est pas un conseil en investissement personnalisé, et les décisions,
comme leurs conséquences, restent les vôtres.
