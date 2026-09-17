/* =========================================================================
   AlphaDesk — le comparateur de méthodes

   Quatre questions, quatre volets :
     1. Sur ce titre      — qu'est-ce qui aurait marché ici ?
     2. Robustesse        — qu'est-ce qui marche AILLEURS AUSSI ? (le vrai test)
     3. Crises            — que se passe-t-il quand tout s'effondre ?
     4. Analystes         — est-ce que suivre les cabinets rapporte ?

   Règle d'écriture : le lecteur n'est pas un professionnel de la finance.
   Il connaît « acheter », « vendre », « perdre de l'argent ». Il ne connaît
   pas « drawdown », « Sharpe » ni « exposition ». Chaque chiffre affiché est
   donc traduit en une phrase, et chaque terme technique porte sa définition
   au survol.
   ========================================================================= */
import { LineChart } from './chart.js';
import { METHODES, comparerMethodes, prepareForStrategies } from './strategies.js';
import { epreuveRobustesse, TOUTES_METHODES, expliquerMethode } from './robustesse.js';
import { rejouerCrises, simulerScenario, CRISES, SCENARIOS, dureeLisible } from './crises.js';
import { justesseObjectifs, LIBELLE_CONSENSUS, preparerAnalystes } from './analystes.js';
import { computeIndicators } from './engine.js';
import { UNIVERS } from './universe.js';
import * as PF from './portfolio.js';
import {
  $, el, esc, n, px, pct, money, cls, sgn, dt, annee, cssVar,
  meter, meterDiv, toast, terme
} from './format.js';

const nf = (x, d = 1) => (x === null || x === undefined || !isFinite(x)) ? 'n/d'
  : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });

/* ------------------------------------------------------------------ */
/*  Paniers proposés pour l'épreuve de robustesse                      */
/* ------------------------------------------------------------------ */
const PANIERS = {
  varie: {
    nom: 'Panier varié (recommandé)',
    detail: 'Des profils volontairement différents : du luxe, de la banque, de l’énergie, de la techno américaine et deux indices. C’est la composition qui met le plus les méthodes à l’épreuve.',
    symboles: ['MC.PA', 'BNP.PA', 'TTE.PA', 'AIR.PA', 'AAPL', 'MSFT', 'JNJ', 'XOM', '^FCHI', '^GSPC']
  },
  cac: {
    nom: 'Dix poids lourds français',
    detail: 'Les plus grosses capitalisations de la cote parisienne, toutes éligibles au PEA.',
    symboles: ['MC.PA', 'OR.PA', 'TTE.PA', 'SAN.PA', 'AIR.PA', 'SU.PA', 'AI.PA', 'BNP.PA', 'DG.PA', 'RMS.PA']
  },
  us: {
    nom: 'Dix géantes américaines',
    detail: 'Les moteurs de la performance mondiale de la dernière décennie. Attention : la période testée leur a été exceptionnellement favorable.',
    symboles: ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'JNJ', 'PG', 'JPM', 'XOM', 'KO', 'WMT']
  },
  indices: {
    nom: 'Indices et ETF',
    detail: 'Des paniers déjà diversifiés. C’est sur eux que les méthodes de suivi de tendance ont été conçues et testées à l’origine.',
    symboles: ['^FCHI', '^GSPC', '^NDX', '^GDAXI', '^STOXX50E', 'CW8.PA', '^FTSE', '^N225']
  },
  portefeuille: {
    nom: 'Mes positions',
    detail: 'Les valeurs que vous suivez réellement dans l’onglet Portefeuille.',
    symboles: null
  }
};

const PROFONDEURS = [
  { key: '5y', label: '5 ans', from: null, range: '5y', note: 'rapide' },
  { key: '10y', label: '10 ans', from: dateIlYa(10), range: null, note: 'inclut 2020 et 2022' },
  { key: 'max', label: 'Depuis 2000', from: '2000-01-01', range: null, note: 'inclut 2008 — le plus instructif' }
];
function dateIlYa(annees) {
  const d = new Date(); d.setFullYear(d.getFullYear() - annees);
  return d.toISOString().slice(0, 10);
}

/* ================================================================== */
/*  ENTRÉE PRINCIPALE                                                  */
/* ================================================================== */
export async function vueComparateur(c, S, ctx) {
  S.cmpTab = S.cmpTab || 'robustesse';
  const onglets = [
    ['titre', 'Sur ce titre', 'ce qui aurait marché sur ' + S.symbol],
    ['robustesse', 'Épreuve de robustesse', 'ce qui marche aussi ailleurs'],
    ['crises', 'Résistance aux crises', '2008, 2020, 2022…'],
    ['analystes', 'Suivre les analystes', 'est-ce que ça rapporte ?']
  ];

  c.innerHTML = `
    <div class="card">
      <h3>Comparateur de méthodes <span class="sub">la question n’est pas « qu’est-ce qui a gagné », mais « sur quoi puis-je m’appuyer »</span></h3>
      <p class="sm dim" style="margin-top:0;max-width:84ch">
        Toutes les méthodes sont rejouées sur les <b>données réelles du passé</b>, avec exactement les mêmes
        règles : la décision est prise le soir, l’ordre passe le lendemain matin, et les frais sont déduits
        à l’aller comme au retour. Aucune méthode n’est retouchée pour mieux figurer au classement.
      </p>
      <div class="seg" id="cmpTabs" style="margin-top:14px;flex-wrap:wrap">
        ${onglets.map(([k, l]) => `<button data-k="${k}" class="${S.cmpTab === k ? 'on' : ''}">${l}</button>`).join('')}
      </div>
      <div class="xs faint" style="margin-top:8px">${esc(onglets.find(o => o[0] === S.cmpTab)[2])}</div>
    </div>
    <div id="cmpBody"></div>`;

  $('#cmpTabs').querySelectorAll('button').forEach(b => {
    b.onclick = () => { S.cmpTab = b.dataset.k; ctx.render(); };
  });

  const body = $('#cmpBody');
  if (S.cmpTab === 'titre') await voletTitre(body, S, ctx);
  else if (S.cmpTab === 'robustesse') await voletRobustesse(body, S, ctx);
  else if (S.cmpTab === 'crises') await voletCrises(body, S, ctx);
  else await voletAnalystes(body, S, ctx);
}

/* ================================================================== */
/*  VOLET 1 — SUR CE TITRE                                             */
/* ================================================================== */
async function voletTitre(body, S, ctx) {
  const fait = S.compar && S.compar.symbol === S.symbol && S.compar.period === S.period;
  body.innerHTML = `
    <div class="card">
      <div class="row wrap between" style="gap:12px">
        <div>
          <div class="b">${esc(S.symbol)} · ${esc(ctx.periodCfg().label)}</div>
          <div class="xs faint" style="margin-top:3px">Un seul titre, une seule période : instructif, mais insuffisant pour décider. L’onglet suivant est là pour ça.</div>
        </div>
        <button class="btn primary" id="run1">Comparer les ${METHODES.length} méthodes</button>
      </div>
      ${progressif('p1')}
    </div>
    <div id="out1">${fait ? '' : vide('⚖', `Lancez la comparaison sur ${esc(S.symbol)}`)}</div>`;

  $('#run1').onclick = async () => {
    const r = await ctx.ensureReport();
    const { bar, txt, box } = prog('p1');
    box.style.display = 'block'; $('#run1').disabled = true;
    prepareForStrategies(r.ind);
    const res = await comparerMethodes(r.ind, { capital: S.profile.capital, start: 260 }, S.profile,
      (p, nom) => { bar.style.width = (p * 100) + '%'; txt.textContent = nom ? `Test : ${nom}…` : 'Finalisation…'; });
    box.style.display = 'none'; $('#run1').disabled = false;
    S.compar = { ...res, symbol: S.symbol, period: S.period, nom: r.ctx.name };
    dessinerTitre(S);
  };
  if (fait) dessinerTitre(S);
}

function dessinerTitre(S) {
  const C = S.compar, out = $('#out1');
  if (!C || !out) return;
  const res = C.resultats, ref = C.reference;
  if (!res || !res.length) {
    out.innerHTML = carte('Comparaison impossible sur cette période',
      `Ces méthodes s’appuient sur des moyennes calculées sur 200 séances : il faut au moins
       <b>300 séances</b> d’historique. Choisissez <b>2 ans</b> ou plus dans la barre du haut.`);
    return;
  }
  const best = res.filter(x => x.id !== 'buyhold').reduce((a, b) => (b.calmar ?? -99) > (a.calmar ?? -99) ? b : a, res[0]);
  out.innerHTML = `
    ${carte(`Sur ${esc(C.nom || C.symbol)}`, esc(C.lecture))}
    <div class="card pad0">
      <h3 style="padding:16px 18px 6px;margin:0">Classement <span class="sub">trié par rapport entre le gain et la pire perte</span></h3>
      <div style="overflow-x:auto">${tableauMethodes(res, ref)}</div>
    </div>
    <div class="card">
      <h3>Évolution du capital <span class="sub">référence en gris, trois meilleures en couleur</span></h3>
      <div class="chart-host"><canvas id="ch1"></canvas></div>
    </div>`;
  const cv = $('#ch1');
  if (cv) {
    const top = res.filter(x => x.id !== 'buyhold').slice(0, 3);
    const couleurs = ['#3987e5', '#c98500', '#d55181'];
    new LineChart(cv).setData({
      height: 280, dates: ref ? ref.equity.dates : top[0]?.equity.dates,
      series: [
        ...(ref ? [{ data: ref.equity.values, color: cssVar('--text-3'), width: 1.6, label: 'Ne rien faire' }] : []),
        ...top.map((x, k) => ({ data: x.equity.values, color: couleurs[k], width: 2, label: x.nom }))
      ]
    });
  }
}

function tableauMethodes(res, ref) {
  return `<table>
    <thead><tr>
      <th>Méthode</th><th class="num">Gain total</th><th class="num">Par an</th>
      <th class="num">${terme('repli maximal', 'Pire perte')}</th>
      <th class="num">${terme('ratio de Calmar', 'Gain / souffrance')}</th>
      <th class="num">${terme('exposition', 'Temps investi')}</th>
      <th class="num">Opérations</th><th class="num">vs ne rien faire</th>
    </tr></thead>
    <tbody>${res.map(x => `<tr>
      <td><span class="b">${esc(x.nom)}</span>${x.id === 'buyhold' ? ' <span class="badge plain">référence</span>' : ''}${x.id === 'alphadesk' ? ' <span class="badge info">maison</span>' : ''}
          <div class="xs faint">${esc(x.famille)}</div></td>
      <td class="num b ${cls(x.rendement)}">${pct(x.rendement, 1)}</td>
      <td class="num ${cls(x.cagr)}">${x.cagr === null ? '—' : pct(x.cagr, 1)}</td>
      <td class="num down">${pct(x.maxDrawdown, 1)}</td>
      <td class="num ${x.calmar > 0.5 ? 'up' : ''}">${n(x.calmar, 2)}</td>
      <td class="num faint">${n(x.exposition, 0)} %</td>
      <td class="num faint">${x.operations}</td>
      <td class="num b ${cls(x.ecartVsReference)}">${x.id === 'buyhold' ? '—' : pct(x.ecartVsReference, 1)}</td>
    </tr>`).join('')}</tbody>
  </table>`;
}

/* ================================================================== */
/*  VOLET 2 — ÉPREUVE DE ROBUSTESSE  (le cœur)                         */
/* ================================================================== */
async function voletRobustesse(body, S, ctx) {
  S.panier = S.panier || 'varie';
  S.profondeur = S.profondeur || '10y';
  S.avecMoteur = S.avecMoteur ?? false;

  const p = PANIERS[S.panier];
  const symboles = p.symboles || positionsUtilisateur();
  const prof = PROFONDEURS.find(x => x.key === S.profondeur);
  const estimation = estimerDuree(symboles.length, S.avecMoteur, S.profondeur);

  body.innerHTML = `
    <div class="card">
      <h3>Le seul test qui permet de décider</h3>
      <p class="sm dim" style="margin-top:0;max-width:84ch">
        Une méthode qui gagne sur une seule valeur n’a rien prouvé : sur quatorze méthodes testées,
        il s’en trouve toujours une qui gagne par chance. La vraie question est :
        <b>est-ce qu’elle gagne aussi sur les autres ?</b> Une méthode qui bat le simple achat sur huit
        valeurs sur dix mérite votre confiance. Une méthode qui gagne une fois sur deux est une pièce
        de monnaie avec un nom savant.
      </p>
      <div class="row wrap" style="gap:12px;margin-top:14px">
        <div><label class="field">Panier de valeurs</label>
          <select id="rPanier">${Object.entries(PANIERS).map(([k, v]) =>
            `<option value="${k}" ${k === S.panier ? 'selected' : ''}>${esc(v.nom)}</option>`).join('')}</select></div>
        <div><label class="field">Profondeur d’historique</label>
          <select id="rProf">${PROFONDEURS.map(x =>
            `<option value="${x.key}" ${x.key === S.profondeur ? 'selected' : ''}>${x.label} — ${x.note}</option>`).join('')}</select></div>
        <div style="align-self:flex-end">
          <label class="row xs" style="gap:7px;cursor:pointer;padding-bottom:8px">
            <input type="checkbox" id="rMoteur" ${S.avecMoteur ? 'checked' : ''}>
            <span>inclure le moteur AlphaDesk <span class="faint">(bien plus lent)</span></span>
          </label>
        </div>
        <div style="align-self:flex-end"><button class="btn primary" id="runR">Lancer l’épreuve</button></div>
      </div>
      <div class="xs faint" style="margin-top:10px">
        ${esc(p.detail)}<br>
        <b>${symboles.length} valeurs</b> · ${esc(prof.label)} · durée estimée : <b>${estimation}</b>
        ${symboles.length < 5 ? ' · <span class="warn">moins de cinq valeurs : le résultat sera peu fiable</span>' : ''}
      </div>
      ${progressif('pR')}
    </div>
    <div id="outR">${(S.robust && S.robust.cle === cleRobust(S)) ? '' :
      vide('◎', 'Lancez l’épreuve pour savoir sur quelle méthode vous appuyer', 'le résultat vous dira aussi à quel point il est fiable')}</div>`;

  $('#rPanier').onchange = e => { S.panier = e.target.value; ctx.render(); };
  $('#rProf').onchange = e => { S.profondeur = e.target.value; ctx.render(); };
  $('#rMoteur').onchange = e => { S.avecMoteur = e.target.checked; ctx.render(); };
  $('#runR').onclick = () => lancerRobustesse(S, ctx, symboles, prof);

  if (S.robust && S.robust.cle === cleRobust(S)) dessinerRobustesse(S, ctx);
}

const cleRobust = S => `${S.panier}|${S.profondeur}|${S.avecMoteur}|${S.profile.horizon}|${S.profile.risk}`;

function positionsUtilisateur() {
  const l = PF.loadPositions().filter(x => x.status === 'ouverte').map(x => x.symbol);
  return [...new Set(l)];
}

function estimerDuree(nbValeurs, avecMoteur, profondeur) {
  const barres = profondeur === '5y' ? 1250 : profondeur === '10y' ? 2500 : 6500;
  const parValeur = 0.35 + (barres / 1250) * 0.5 + (avecMoteur ? (barres / 1250) * 11 : 0);
  const sec = Math.round(nbValeurs * parValeur);
  return sec < 60 ? `${sec} secondes` : `environ ${Math.round(sec / 60)} minute${sec >= 90 ? 's' : ''}`;
}

async function lancerRobustesse(S, ctx, symboles, prof) {
  const { bar, txt, box } = prog('pR');
  box.style.display = 'block';
  $('#runR').disabled = true;
  const out = $('#outR');
  out.innerHTML = '';

  // 1. téléchargement des séries
  const jeux = [];
  for (let i = 0; i < symboles.length; i++) {
    const sym = symboles[i];
    txt.textContent = `Téléchargement ${i + 1}/${symboles.length} : ${sym}…`;
    bar.style.width = (i / symboles.length * 25) + '%';
    try {
      const data = prof.from ? await ctx.getChartLong(sym, prof.from) : await ctx.getChart(sym, prof.range, '1d');
      if (!data?.series?.c?.length) continue;
      let analystes = null;
      try { analystes = await ctx.getAnalystes(sym); } catch { }
      jeux.push({ symbol: sym, nom: data.name || sym, data, analystes });
    } catch { /* valeur ignorée, signalée dans le rapport */ }
    await new Promise(r => setTimeout(r, 0));
  }

  if (!jeux.length) {
    box.style.display = 'none'; $('#runR').disabled = false;
    out.innerHTML = carte('Aucune donnée', 'Aucune des valeurs du panier n’a pu être téléchargée. Vérifiez la connexion, puis réessayez.');
    return;
  }

  // 2. l'épreuve
  const opts = { capital: S.profile.capital, start: 260 };
  const filtre = S.avecMoteur ? null : 'alphadesk';
  const res = await epreuveRobustesseFiltree(jeux, opts, S.profile, filtre,
    (p, quoi) => { bar.style.width = (25 + p * 75) + '%'; txt.textContent = quoi || 'Synthèse…'; });

  box.style.display = 'none'; $('#runR').disabled = false;
  S.robust = { ...res, cle: cleRobust(S), panier: PANIERS[S.panier].nom, profondeur: prof.label };
  dessinerRobustesse(S, ctx);
}

/** permet d'exclure la méthode maison, qui est bien plus lente que les autres */
async function epreuveRobustesseFiltree(jeux, opts, profile, exclureId, onProgress) {
  if (!exclureId) return epreuveRobustesse(jeux, opts, profile, onProgress);
  const sauve = TOUTES_METHODES.slice();
  const idx = TOUTES_METHODES.findIndex(m => m.id === exclureId);
  if (idx >= 0) TOUTES_METHODES.splice(idx, 1);
  try { return await epreuveRobustesse(jeux, opts, profile, onProgress); }
  finally { TOUTES_METHODES.length = 0; TOUTES_METHODES.push(...sauve); }
}

function dessinerRobustesse(S, ctx) {
  const R = S.robust, out = $('#outR');
  if (!R || !out) return;
  const res = R.resultats, ref = R.reference;
  if (!res || !res.length) { out.innerHTML = carte('Aucun résultat', 'Aucune méthode n’a pu être testée.'); return; }

  const fiab = R.fiabilite;
  const candidates = res.filter(x => x.id !== 'buyhold' && x.robustesse.note !== null);

  out.innerHTML = `
    <div class="card" style="border-left:3px solid var(--accent)">
      <h3>${esc(R.verdict.titre)}</h3>
      <p style="margin:0;font-size:14px;line-height:1.72;color:#dbe2ee;max-width:86ch">${esc(R.verdict.texte)}</p>
    </div>

    <div class="grid g3" style="margin-bottom:16px">
      <div class="stat">
        <div class="lbl">Valeurs testées</div>
        <div class="val">${R.valeurs.length}</div>
        <div class="note">${esc(R.panier)} · ${esc(R.profondeur)}</div>
      </div>
      <div class="stat">
        <div class="lbl">Fiabilité de ce classement</div>
        <div class="val ${fiab.note >= 70 ? 'up' : fiab.note >= 45 ? 'warn' : 'down'}">${fiab.note}/100</div>
        <div style="margin-top:7px">${meter(fiab.note, 100, fiab.note >= 70 ? 'var(--up)' : fiab.note >= 45 ? 'var(--warn)' : 'var(--down)')}</div>
      </div>
      <div class="stat">
        <div class="lbl">Méthodes solides</div>
        <div class="val ${candidates.filter(x => x.robustesse.note >= 65).length ? 'up' : 'warn'}">
          ${candidates.filter(x => x.robustesse.note >= 65).length} <span style="font-size:13px;color:var(--text-3);font-weight:500">sur ${candidates.length}</span></div>
        <div class="note">note de robustesse ≥ 65</div>
      </div>
    </div>

    <div class="card" style="border-color:${fiab.note < 45 ? 'rgba(250,178,25,.45)' : 'var(--border)'}">
      <div class="note-line" style="border:0;padding:0">
        <span class="pin">${fiab.note >= 70 ? '✓' : fiab.note >= 45 ? 'ℹ' : '⚠'}</span>
        <span class="sm ${fiab.note < 45 ? 'warn' : 'dim'}">${esc(fiab.texte)}</span>
      </div>
    </div>

    <div class="card pad0">
      <h3 style="padding:16px 18px 6px;margin:0">Classement par robustesse
        <span class="sub">cliquez une ligne pour voir le détail valeur par valeur</span></h3>
      <div style="overflow-x:auto">
      <table>
        <thead><tr>
          <th>Méthode</th><th class="num">Robustesse</th><th>Verdict</th>
          <th class="num">Meilleur rapport<br><span class="faint" style="text-transform:none;font-weight:400">gain / souffrance</span></th>
          <th class="num">Réduit la perte</th>
          <th class="num">${terme('exposition', 'Temps investi')}</th>
          <th class="num">Rendement / an<br><span class="faint" style="text-transform:none;font-weight:400">vs ne rien faire</span></th>
          <th class="num">${terme('repli maximal', 'Pire perte médiane')}</th>
        </tr></thead>
        <tbody>
        ${res.map(x => ligneRobustesse(x, ref)).join('')}
        </tbody>
      </table>
      </div>
    </div>

    <div id="detailMethode"></div>

    <div class="card">
      <h3>Comment lire ce tableau</h3>
      <div class="sm dim" style="line-height:1.75;max-width:86ch">
        <p><b class="acc">La note de robustesse</b> ne récompense pas la performance : elle récompense la
        <b>régularité</b>. Une méthode qui double sur une valeur et s’effondre sur les neuf autres reçoit une
        mauvaise note — parce que vous ne saurez jamais à l’avance sur laquelle vous tombez. Elle combine
        quatre choses : sur combien de valeurs la méthode gagne (40 points), sur combien elle limite les
        pertes (25), l’ampleur de son avance (20), et sa constance d’une valeur à l’autre (15).</p>
        <p><b class="acc">« Meilleur rapport gain / souffrance »</b> est la colonne la plus parlante. Elle
        répond à : « pour chaque euro de perte encaissé en cours de route, laquelle m’a rapporté le plus ? »
        On ne compare volontairement PAS les rendements bruts : sur vingt ans, ne rien faire gagne presque
        toujours en rendement brut, et juger là-dessus ne distinguerait rien. Ce qui différencie les
        méthodes, c’est le chemin parcouru pour y arriver.</p>
        <p><b class="acc">« Rendement / an »</b> est exprimé en rendement <b>annuel</b>, jamais en cumulé.
        Sur vingt ans les gains composent : dire « 400 points d’écart » n’aurait aucun sens, alors que
        « deux points de moins par an » se comprend immédiatement.</p>
        <p><b class="acc">Pourquoi « écart médian » et pas « gain total »</b> — l’écart est calculé
        valeur par valeur, puis on prend la médiane. C’est la seule comparaison honnête : une méthode
        qui n’a pu être testée que sur quelques valeurs aurait sinon un gain moyen incomparable avec
        celui des autres. Quand c’est le cas, la ligne le signale en rouge.</p>
        <p><b class="acc">Le piège des liquidités</b> — une méthode qui reste presque toujours hors du
        marché « protège » parfaitement… en ne participant à rien. La note en tient compte : les points
        de protection sont pondérés par le temps réellement investi. Rester sur la touche ne rapporte
        pas de points.</p>
        <p><b class="acc">« Protège »</b> compte autant que le gain. Une méthode qui rapporte un peu moins
        mais vous évite une perte de moitié est un meilleur placement, parce que c’est celle que vous
        tiendrez réellement jusqu’au bout. La plupart des gens ne perdent pas de l’argent parce qu’ils ont
        choisi la mauvaise méthode : ils en perdent parce qu’ils ont abandonné la bonne au pire moment.</p>
      </div>
    </div>`;

  out.querySelectorAll('tr[data-m]').forEach(tr => {
    tr.onclick = () => afficherDetailMethode(S, tr.dataset.m, ctx);
  });
}

function ligneRobustesse(x, ref) {
  const rb = x.robustesse;
  const estRef = x.id === 'buyhold';
  const couleur = rb.note === null ? 'var(--text-3)'
    : rb.note >= 65 ? 'var(--up)' : rb.note >= 45 ? 'var(--warn)' : 'var(--down)';
  return `<tr class="clickable" data-m="${esc(x.id)}">
    <td><span class="b">${esc(x.nom)}</span>${estRef ? ' <span class="badge plain">référence</span>' : ''}
        <div class="xs faint">${esc(x.famille)}${rb.partiel ? ` · <span class="warn">testée sur ${rb.testees} valeurs seulement</span>` : ''}</div></td>
    <td class="num">${rb.note === null ? '<span class="faint">—</span>' :
      `<span class="b" style="color:${couleur}">${rb.note}</span>
       <div style="margin-top:4px;width:56px;margin-left:auto">${meter(rb.note, 100, couleur)}</div>`}</td>
    <td><span class="sm ${rb.note === null ? 'faint' : rb.note >= 65 ? 'up' : rb.note >= 45 ? '' : rb.note >= 28 ? 'warn' : 'down'}">${esc(rb.label)}</span></td>
    <td class="num">${estRef ? '—' : `<b>${x.mieuxNotees}</b> <span class="faint">/ ${x.testees}</span>`}</td>
    <td class="num">${estRef ? '—' : `<b>${x.protegees}</b> <span class="faint">/ ${x.testees}</span>`}</td>
    <td class="num faint">${n(x.expositionMedian, 0)} %</td>
    <td class="num b ${cls(x.ecartMedian)}">${estRef ? '—' : pct(x.ecartMedian, 1)}</td>
    <td class="num down">${pct(x.repliMedian, 1)}</td>
  </tr>`;
}

function afficherDetailMethode(S, id, ctx) {
  const R = S.robust;
  const m = R.resultats.find(x => x.id === id);
  if (!m) return;
  const zone = $('#detailMethode');
  const rb = m.robustesse;

  zone.innerHTML = `
    <div class="card" style="border-color:var(--accent)">
      <div class="row between wrap" style="gap:12px">
        <div>
          <h3 style="margin:0">${esc(m.nom)}</h3>
          <div class="sm dim" style="margin-top:4px;max-width:70ch">${esc(m.resume)}</div>
        </div>
        <button class="btn sm" id="fermerDetail">Fermer</button>
      </div>

      <div class="live" style="margin-top:14px">
        <div class="tt">En clair</div>${esc(expliquerMethode(m, R.reference))}
      </div>

      <h3 style="margin-top:18px">La règle exacte</h3>
      <div class="formula">${m.regles.map(r => '· ' + r).join('\n')}</div>
      <div class="xs faint" style="margin-top:8px">${esc(m.reference)}</div>

      ${rb.note !== null ? `
      <h3 style="margin-top:18px">D’où vient la note de ${rb.note}/100</h3>
      <table>
        ${rb.parts.map(p => `<tr>
          <td class="dim">${esc(p.nom)}</td>
          <td style="width:120px">${meter(p.obtenu, p.max, 'var(--accent)')}</td>
          <td class="num" style="width:70px">${n(p.obtenu, 1)} / ${p.max}</td>
          <td class="xs faint">${esc(p.detail)}</td>
        </tr>`).join('')}
      </table>
      ${rb.confiance < 1 ? `<div class="xs warn" style="margin-top:8px">
        Note réduite de ${Math.round((1 - rb.confiance) * 100)} % : avec seulement ${R.valeurs.length} valeurs,
        le résultat reste indicatif.</div>` : ''}
      <div class="sm dim" style="margin-top:10px">${esc(rb.explication)}</div>` : ''}

      <h3 style="margin-top:18px">Valeur par valeur</h3>
      <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Valeur</th><th class="num">Gain total</th><th class="num">Par an</th>
          <th class="num">${terme('repli maximal', 'Pire perte')}</th>
          <th class="num">${terme('exposition', 'Temps investi')}</th>
          <th class="num">Opérations</th><th class="num">Écart annuel</th><th></th></tr></thead>
        <tbody>${[...m.lignes].sort((a, b) => (b.ecartAnnuel ?? -99) - (a.ecartAnnuel ?? -99)).map(l => `<tr>
          <td><span class="b">${esc(l.nom.slice(0, 26))}</span> <span class="xs faint mono">${esc(l.symbol)}</span></td>
          <td class="num ${cls(l.rendement)}">${pct(l.rendement, 0)}</td>
          <td class="num ${cls(l.cagr)}">${pct(l.cagr, 1)}</td>
          <td class="num down">${pct(l.maxDrawdown, 1)}</td>
          <td class="num faint">${n(l.exposition, 0)} %</td>
          <td class="num faint">${l.operations}</td>
          <td class="num b ${cls(l.ecartAnnuel)}">${l.ecartAnnuel === undefined || l.ecartAnnuel === null ? '—' : pct(l.ecartAnnuel, 1)}</td>
          <td style="width:26px">${l.meilleurRapport === undefined ? '' : l.meilleurRapport ? '<span class="up" title="meilleur rapport gain/souffrance">✓</span>' : '<span class="faint">·</span>'}</td>
        </tr>`).join('')}</tbody>
      </table>
      </div>
    </div>`;
  zone.scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#fermerDetail').onclick = () => { zone.innerHTML = ''; };
}

/* ================================================================== */
/*  VOLET 3 — RÉSISTANCE AUX CRISES                                    */
/* ================================================================== */
async function voletCrises(body, S, ctx) {
  S.modeCrise = S.modeCrise || 'reelles';
  S.scenarioChoisi = S.scenarioChoisi || 'krachEclair';

  body.innerHTML = `
    <div class="card">
      <h3>Que se passe-t-il quand tout s’effondre ?</h3>
      <p class="sm dim" style="margin-top:0;max-width:84ch">
        Une méthode ne se juge pas quand tout va bien : elle se juge le jour où vous avez envie de tout
        vendre. Ce volet mesure donc <b>la perte encaissée</b> et <b>le temps qu’il a fallu pour s’en remettre</b>,
        pas le rendement.
      </p>
      <div class="seg" style="margin-top:12px" id="segCrise">
        <button data-k="reelles" class="${S.modeCrise === 'reelles' ? 'on' : ''}">Crises réelles</button>
        <button data-k="scenario" class="${S.modeCrise === 'scenario' ? 'on' : ''}">Scénario inventé</button>
      </div>
      <div class="xs faint" style="margin-top:8px">
        ${S.modeCrise === 'reelles'
          ? 'Les vraies crises de 2000, 2008, 2011, 2020 et 2022, rejouées sur les données du titre. Rien n’est inventé.'
          : 'Un choc fabriqué, calibré sur la volatilité réelle du titre. C’est une simulation, pas une prévision — utile pour voir COMMENT une méthode réagit.'}
      </div>
    </div>
    <div id="zoneCrise"></div>`;

  $('#segCrise').querySelectorAll('button').forEach(b => {
    b.onclick = () => { S.modeCrise = b.dataset.k; ctx.render(); };
  });

  const z = $('#zoneCrise');
  if (S.modeCrise === 'reelles') await sousVoletCrisesReelles(z, S, ctx);
  else await sousVoletScenario(z, S, ctx);
}

async function sousVoletCrisesReelles(z, S, ctx) {
  const fait = S.crisesRes && S.crisesRes.symbol === S.symbol;
  z.innerHTML = `
    <div class="card">
      <div class="row wrap between" style="gap:12px">
        <div>
          <div class="b">${esc(S.symbol)}</div>
          <div class="xs faint" style="margin-top:3px">L’historique quotidien sera chargé depuis 2000 — indépendamment de la période affichée en haut.</div>
        </div>
        <button class="btn primary" id="runC">Rejouer les crises</button>
      </div>
      ${progressif('pC')}
    </div>
    <div id="outC">${fait ? '' : vide('⚡', 'Rejouez les grandes crises sur ce titre', 'chaque méthode est mise à l’épreuve du pire')}</div>`;

  $('#runC').onclick = async () => {
    const { bar, txt, box } = prog('pC');
    box.style.display = 'block'; $('#runC').disabled = true;
    txt.textContent = 'Téléchargement de l’historique long…';
    try {
      const data = await ctx.getChartLong(S.symbol, '2000-01-01');
      let analystes = null; try { analystes = await ctx.getAnalystes(S.symbol); } catch { }
      const res = await rejouerCrises(data, { capital: S.profile.capital }, S.profile, analystes,
        (p, nom) => { bar.style.width = (p * 100) + '%'; txt.textContent = nom ? `Test : ${nom}…` : 'Synthèse…'; });
      S.crisesRes = { ...res, symbol: S.symbol, nom: data.name || S.symbol, seances: data.series.c.length };
    } catch (e) {
      S.crisesRes = { error: e.message, symbol: S.symbol };
    }
    box.style.display = 'none'; $('#runC').disabled = false;
    dessinerCrises(S);
  };
  if (fait) dessinerCrises(S);
}

function dessinerCrises(S) {
  const R = S.crisesRes, out = $('#outC');
  if (!R || !out) return;
  if (R.error) {
    out.innerHTML = carte('Impossible de rejouer les crises',
      esc(R.error) + (R.conseil ? '<br><br>' + esc(R.conseil) : ''));
    return;
  }
  const ref = R.reference;
  out.innerHTML = `
    ${carte(`Crises traversées par ${esc(R.nom)}`, esc(R.lecture))}

    <div class="card pad0">
      <h3 style="padding:16px 18px 6px;margin:0">Perte maximale encaissée pendant chaque crise
        <span class="sub">plus la barre est courte, mieux la méthode a protégé</span></h3>
      <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Méthode</th>
          ${R.crises.map(c => `<th class="num" title="${esc(c.recit)}">${esc(c.court || c.nom)}</th>`).join('')}
          <th class="num">Moyenne</th><th class="num">Investi pendant</th></tr></thead>
        <tbody>${R.resultats.map(m => `<tr>
          <td><span class="b">${esc(m.nom)}</span>${m.id === 'buyhold' ? ' <span class="badge plain">réf.</span>' : ''}</td>
          ${R.crises.map(c => {
            const x = m.crises.find(k => k.id === c.id);
            if (!x || x.perteMax === null) return '<td class="num faint">—</td>';
            // NB : l'alpha d'une couleur CSS exige un POINT decimal, jamais une virgule
            const intensite = Math.min(1, Math.abs(x.perteMax) / 55);
            return `<td class="num" style="background:rgba(227,73,72,${(intensite * 0.22).toFixed(3)})">
              <b>${n(x.perteMax, 0)} %</b>
              <div class="xs faint">${x.recuperation !== null ? dureeLisible(x.recuperation) + ' pour s’en remettre' : 'jamais revenu'}</div>
              ${x.expositionCrise !== null && x.expositionCrise < 30 ? `<div class="xs warn">investi ${n(x.expositionCrise, 0)} % seulement</div>` : ''}
            </td>`;
          }).join('')}
          <td class="num b ${m.perteMoyenne > (ref?.perteMoyenne ?? -100) ? 'up' : ''}">${n(m.perteMoyenne, 1)} %</td>
          <td class="num ${(m.expositionCrises ?? 0) < 33 ? 'warn' : 'faint'}">${n(m.expositionCrises, 0)} %</td>
        </tr>`).join('')}</tbody>
      </table>
      </div>
    </div>

    <div class="card">
      <div class="note-line" style="border:0;padding:0">
        <span class="pin">⚠</span>
        <span class="sm dim">Lisez la dernière colonne avant de conclure. Une méthode qui affiche de
        faibles pertes tout en n’étant investie que 10 % du temps n’a pas « bien résisté » : elle n’était
        pas là. <b>Ne pas jouer n’est pas gagner</b> — ces lignes sont signalées en orange et écartées du
        verdict ci-dessus.</span>
      </div>
    </div>

    <div class="card">
      <h3>Ce que chaque crise enseigne</h3>
      ${R.crises.map(c => `<details class="acc-block">
        <summary>${esc(c.nom)} <span class="xs faint">· ${dt(c.debut, { month: 'short', year: 'numeric' })} → ${dt(c.fin, { month: 'short', year: 'numeric' })}</span></summary>
        <div class="inner">
          <p class="sm dim">${esc(c.recit)}</p>
          <div class="live" style="border-left-color:var(--warn);background:var(--warn-wash)">
            <div class="tt" style="color:var(--warn)">La leçon</div>${esc(c.lecon)}
          </div>
        </div>
      </details>`).join('')}
    </div>`;
}

async function sousVoletScenario(z, S, ctx) {
  const sc = SCENARIOS.find(x => x.id === S.scenarioChoisi) || SCENARIOS[0];
  const fait = S.scenarioRes && S.scenarioRes.cle === `${S.symbol}|${sc.id}`;
  z.innerHTML = `
    <div class="card">
      <div class="grid g4" style="gap:10px">
        ${SCENARIOS.map(x => `<div class="stat" style="cursor:pointer;${x.id === sc.id ? 'border-color:var(--accent)' : ''}" data-sc="${x.id}">
          <div class="lbl">${esc(x.nom)}</div>
          <div class="val" style="font-size:19px;color:${x.baisse < -0.3 ? 'var(--down)' : x.baisse < -0.1 ? 'var(--warn)' : 'var(--text-2)'}">${n(x.baisse * 100, 0)} %</div>
          <div class="note">sur ${x.duree} séances${x.rebond > 0 ? ', puis rebond' : ''}</div>
        </div>`).join('')}
      </div>
      <div class="live" style="margin-top:14px">
        <div class="tt">${esc(sc.nom)}</div>
        ${esc(sc.recit)} <b style="color:var(--accent)">${esc(sc.test)}</b>
      </div>
      <div class="row between wrap" style="gap:12px;margin-top:14px">
        <div class="xs faint" style="max-width:60ch">
          Le choc est appliqué à la suite de l’historique réel de ${esc(S.symbol)}, avec un bruit quotidien
          calibré sur sa volatilité observée. Le tirage est déterministe : le même scénario donne toujours
          le même résultat, sinon la comparaison entre méthodes serait faussée.
        </div>
        <button class="btn primary" id="runS">Lancer le scénario</button>
      </div>
      ${progressif('pS')}
    </div>
    <div id="outS">${fait ? '' : vide('◈', 'Choisissez un scénario et lancez-le')}</div>`;

  z.querySelectorAll('[data-sc]').forEach(d => {
    d.onclick = () => { S.scenarioChoisi = d.dataset.sc; ctx.render(); };
  });

  $('#runS').onclick = async () => {
    const { bar, txt, box } = prog('pS');
    box.style.display = 'block'; $('#runS').disabled = true;
    txt.textContent = 'Préparation…';
    try {
      const data = await ctx.getChartLong(S.symbol, dateIlYa(12));
      let analystes = null; try { analystes = await ctx.getAnalystes(S.symbol); } catch { }
      const res = await simulerScenario(data, sc, { capital: S.profile.capital }, S.profile, analystes,
        (p, nom) => { bar.style.width = (p * 100) + '%'; txt.textContent = nom ? `Test : ${nom}…` : 'Synthèse…'; });
      S.scenarioRes = { ...res, cle: `${S.symbol}|${sc.id}`, symbol: S.symbol };
    } catch (e) { S.scenarioRes = { error: e.message, cle: `${S.symbol}|${sc.id}` }; }
    box.style.display = 'none'; $('#runS').disabled = false;
    dessinerScenario(S);
  };
  if (fait) dessinerScenario(S);
}

function dessinerScenario(S) {
  const R = S.scenarioRes, out = $('#outS');
  if (!R || !out) return;
  if (R.error) { out.innerHTML = carte('Scénario impossible', esc(R.error)); return; }
  const ref = R.reference;
  out.innerHTML = `
    ${carte('Ce qu’il se passerait', esc(R.lecture))}
    <div class="card pad0">
      <h3 style="padding:16px 18px 6px;margin:0">Résultat de chaque méthode pendant le choc</h3>
      <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Méthode</th><th class="num">Résultat</th><th class="num">Pire moment</th>
          <th class="num">Investi pendant le choc</th><th class="num">vs ne rien faire</th><th>En clair</th></tr></thead>
        <tbody>${R.resultats.map(m => {
          const ecart = ref ? m.resultat - ref.resultat : null;
          return `<tr>
            <td><span class="b">${esc(m.nom)}</span>${m.id === 'buyhold' ? ' <span class="badge plain">réf.</span>' : ''}</td>
            <td class="num b ${cls(m.resultat)}">${pct(m.resultat, 1)}</td>
            <td class="num down">${pct(m.perteMax, 1)}</td>
            <td class="num ${(m.expositionScenario ?? 0) < 20 && m.id !== 'buyhold' ? 'warn' : 'faint'}">${n(m.expositionScenario, 0)} %</td>
            <td class="num ${cls(ecart)}">${m.id === 'buyhold' ? '—' : pct(ecart, 1)}</td>
            <td class="xs dim">${esc(commentaireScenario(m, ref))}</td>
          </tr>`;
        }).join('')}</tbody>
        <tfoot><tr><td colspan="6" class="xs faint" style="padding-top:10px">
          Les lignes dont la colonne « investi pendant le choc » est en orange n’ont pas réellement
          traversé le scénario : leur résultat flatteur ne prouve rien.
        </td></tr></tfoot>
      </table>
      </div>
    </div>
    <div class="card">
      <h3>Le titre pendant le scénario</h3>
      <div class="chart-host"><canvas id="chS"></canvas></div>
      <div class="xs faint" style="margin-top:8px">
        La partie à droite du trait est inventée. Elle sert à observer le comportement des méthodes,
        pas à prédire quoi que ce soit.
      </div>
    </div>`;

  const cv = $('#chS');
  if (cv && R.serie) {
    const d = R.serie.debutScenario;
    const reel = R.serie.c.map((v, i) => i <= d ? v : null);
    const simule = R.serie.c.map((v, i) => i >= d ? v : null);
    new LineChart(cv).setData({
      height: 240, dates: R.serie.t,
      series: [
        { data: reel, color: cssVar('--text-3'), width: 1.8, label: 'historique réel' },
        { data: simule, color: cssVar('--down'), width: 2, label: 'scénario simulé' }
      ]
    });
  }
}

function commentaireScenario(m, ref) {
  if (m.id === 'buyhold') return 'Vous subissez tout, sans rien faire.';
  if (!ref) return '';
  const e = m.resultat - ref.resultat;
  const expo = m.expositionScenario ?? 0;
  if (expo < 3) return 'Elle n’était pas là du tout : sortie avant le choc. Rien encaissé, mais rien gagné non plus.';
  if (expo < 20) return `Presque absente (${Math.round(expo)} % du choc) : elle a pris le début de la baisse puis s’est retirée.`;
  if (e > 8) return 'Elle a nettement amorti le choc.';
  if (e > 2) return 'Elle a un peu amorti.';
  if (e < -8) return 'Elle a fait pire que ne rien faire — sortie trop tard, retour trop tôt.';
  if (e < -2) return 'Légèrement moins bien que ne rien faire.';
  return 'Comportement proche de la simple détention.';
}

/* ================================================================== */
/*  VOLET 4 — SUIVRE LES ANALYSTES                                     */
/* ================================================================== */
async function voletAnalystes(body, S, ctx) {
  body.innerHTML = `<div class="card"><div class="row"><span class="loader"></span>
    <span class="dim">Recherche des avis de cabinets sur ${esc(S.symbol)}…</span></div></div>`;

  let av = null;
  try { av = await ctx.getAnalystes(S.symbol); } catch { }

  if (!av || !av.disponible) {
    body.innerHTML = `
      <div class="card">
        <h3>Pas d’historique d’avis pour ${esc(S.symbol)}</h3>
        <p class="sm dim" style="margin-top:0;max-width:82ch">
          ${av && av.nombre > 0
            ? `Seulement ${av.nombre} avis retrouvés — trop peu pour en tirer quoi que ce soit.`
            : 'Aucun historique d’avis n’est publié pour cette valeur par notre source de données.'}
          C’est le cas de <b>la quasi-totalité des valeurs européennes</b> : l’historique daté des
          recommandations n’est disponible, gratuitement, que pour la plupart des valeurs américaines.
        </p>
        <div class="live" style="border-left-color:var(--warn);background:var(--warn-wash)">
          <div class="tt" style="color:var(--warn)">Pour tester cette question</div>
          Cherchez une valeur américaine dans la barre du haut — par exemple <b>AAPL</b>, <b>MSFT</b>,
          <b>JNJ</b> ou <b>XOM</b> — puis revenez sur cet onglet. Vous y verrez plusieurs centaines d’avis
          datés, et surtout ce qu’ils auraient rapporté.
        </div>
      </div>
      ${carteCultureAnalystes()}`;
    return;
  }

  const fait = S.analRes && S.analRes.symbol === S.symbol;
  body.innerHTML = `
    <div class="card">
      <div class="row between wrap" style="gap:12px">
        <div>
          <h3 style="margin:0">Les cabinets ont-ils raison sur ${esc(S.symbol)} ?</h3>
          <div class="sm dim" style="margin-top:5px">
            <b>${av.nombre}</b> avis datés de <b>${av.cabinets}</b> cabinets,
            de ${dt(av.debut, { month: 'long', year: 'numeric' })} à ${dt(av.fin, { month: 'long', year: 'numeric' })}.
          </div>
        </div>
        <button class="btn primary" id="runA">Tester leurs recommandations</button>
      </div>
      <p class="sm dim" style="margin-top:12px;max-width:84ch">
        On reconstitue le consensus jour après jour — en ne gardant que l’avis le plus récent de chaque
        cabinet, et seulement s’il a moins de six mois — puis on rejoue trois stratégies : suivre ce
        consensus, ne suivre que les avis très positifs, et <b>faire exactement l’inverse</b>.
        Cette dernière est un garde-fou : si suivre et faire l’inverse gagnent toutes les deux, c’est que
        c’est le titre qui monte, pas les analystes qui ont raison.
      </p>
      ${progressif('pA')}
    </div>
    <div id="outA">${fait ? '' : vide('◍', 'Lancez le test sur les avis de cabinets')}</div>
    ${carteCultureAnalystes()}`;

  $('#runA').onclick = async () => {
    const { bar, txt, box } = prog('pA');
    box.style.display = 'block'; $('#runA').disabled = true;
    txt.textContent = 'Téléchargement de l’historique…';
    try {
      const data = await ctx.getChartLong(S.symbol, '2012-01-01');
      const ind = computeIndicators(data.series);
      prepareForStrategies(ind);
      preparerAnalystes(ind, av);
      const jeux = [{ symbol: S.symbol, nom: data.name || S.symbol, data, analystes: av }];
      const res = await epreuveRobustesse(jeux, { capital: S.profile.capital, start: 260 }, S.profile,
        (p, quoi) => { bar.style.width = (p * 100) + '%'; txt.textContent = quoi || 'Synthèse…'; });
      S.analRes = {
        symbol: S.symbol, nom: data.name || S.symbol, av,
        resultats: res.resultats, reference: res.reference,
        justesse: justesseObjectifs(ind),
        consensusActuel: ind.consensus[ind.n - 1],
        nbActuel: ind.consensusNb[ind.n - 1]
      };
    } catch (e) { S.analRes = { symbol: S.symbol, error: e.message }; }
    box.style.display = 'none'; $('#runA').disabled = false;
    dessinerAnalystes(S);
  };
  if (fait) dessinerAnalystes(S);
}

function dessinerAnalystes(S) {
  const R = S.analRes, out = $('#outA');
  if (!R || !out) return;
  if (R.error) { out.innerHTML = carte('Test impossible', esc(R.error)); return; }

  const suivre = R.resultats.find(x => x.id === 'analystes');
  const strict = R.resultats.find(x => x.id === 'analystesStrict');
  const contre = R.resultats.find(x => x.id === 'contreAnalystes');
  const ref = R.reference;
  const l = m => m ? m.lignes[0] : null;

  const verdict = (() => {
    if (!suivre || !ref) return 'Pas assez de résultats.';
    const s = l(suivre), cc = l(contre), rr = l(ref);
    if (!s || !rr) return 'Pas assez de résultats.';

    /* Comparaison en rendement ANNUEL : sur quatorze ans les gains composent,
       et un écart cumulé de « 1 200 points » ne veut rien dire. */
    const parAn = x => x && x.cagr !== null ? x.cagr : null;
    const dSuivre = (parAn(s) !== null && parAn(rr) !== null) ? parAn(s) - parAn(rr) : null;

    let t = `Suivre le consensus aurait rapporté ${pct(parAn(s), 1)} par an, contre ${pct(parAn(rr), 1)} par an `;
    t += `en achetant simplement et en ne touchant plus à rien. `;
    t += dSuivre !== null && dSuivre > 0.3
      ? `Les cabinets ont donc apporté quelque chose sur ce titre : ${pct(dSuivre, 1)} de mieux chaque année. `
      : dSuivre !== null && dSuivre < -0.3
        ? `Les cabinets n’ont donc rien apporté ici : vous auriez gagné ${pct(Math.abs(dSuivre), 1).replace('+', '')} de plus par an en les ignorant. `
        : `L’écart est négligeable : suivre les cabinets revient à peu près au même que ne rien faire. `;
    t += `La méthode n’était investie que ${n(s.exposition, 0)} % du temps, contre 100 % pour la simple détention — `;
    t += `c’est ce qui explique l’essentiel de l’écart. `;

    // le test de contrôle n'a de valeur que s'il s'est réellement déclenché
    if (cc && cc.exposition > 5) {
      const dContre = (parAn(cc) !== null && parAn(rr) !== null) ? parAn(cc) - parAn(rr) : null;
      t += dContre !== null && dSuivre !== null && dContre > 0 && dSuivre > 0
        ? `Attention au garde-fou : faire l’INVERSE de leurs avis aurait AUSSI battu la référence. Quand les deux gagnent, ce n’est pas l’avis qui porte l’information — c’est simplement que rester à l’écart par moments a payé. Ne tirez aucune conclusion sur la qualité des analystes.`
        : parAn(cc) > parAn(s)
          ? `Et surtout : faire l’inverse aurait rapporté ${pct(parAn(cc), 1)} par an, soit davantage que les suivre. Sur ce titre, le consensus a été un contre-indicateur.`
          : `Le garde-fou est passé : faire l’inverse aurait donné ${pct(parAn(cc), 1)} par an, nettement moins que les suivre. Leur signal porte donc bien une information.`;
    } else {
      t += `Le test de contrôle (« faire l’inverse ») ne s’est presque jamais déclenché, il n’apporte donc rien ici.`;
    }
    return t;
  })();

  out.innerHTML = `
    ${carte('Le verdict', esc(verdict))}

    <div class="grid g3" style="margin-bottom:16px">
      <div class="stat">
        <div class="lbl">${terme('consensus', 'Avis en ce moment')}</div>
        <div class="val sm ${R.consensusActuel > 0.4 ? 'up' : R.consensusActuel < 0 ? 'down' : 'warn'}">
          ${esc(LIBELLE_CONSENSUS(R.consensusActuel))}</div>
        <div class="note">${R.nbActuel} cabinet${R.nbActuel > 1 ? 's' : ''} actif${R.nbActuel > 1 ? 's' : ''} · note moyenne ${n(R.consensusActuel, 2)} sur −2 à +2</div>
      </div>
      <div class="stat">
        <div class="lbl">Suivre le consensus</div>
        <div class="val ${cls(l(suivre)?.cagr)}">${pct(l(suivre)?.cagr, 1)} <span style="font-size:12px;color:var(--text-3);font-weight:500">par an</span></div>
        <div class="note">contre ${pct(l(ref)?.cagr, 1)} par an en ne faisant rien</div>
      </div>
      <div class="stat">
        <div class="lbl">Faire l’inverse</div>
        <div class="val ${cls(l(contre)?.cagr)}">${pct(l(contre)?.cagr, 1)} <span style="font-size:12px;color:var(--text-3);font-weight:500">par an</span></div>
        <div class="note">${(l(contre)?.exposition ?? 0) < 5 ? 'ne s’est jamais déclenché' : 'le test de contrôle'}</div>
      </div>
    </div>

    <div class="card pad0">
      <h3 style="padding:16px 18px 6px;margin:0">Détail des trois stratégies</h3>
      <div style="overflow-x:auto">
      <table>
        <thead><tr><th>Stratégie</th><th class="num">Gain total</th><th class="num">Par an</th>
          <th class="num">${terme('repli maximal', 'Pire perte')}</th>
          <th class="num">${terme('exposition', 'Temps investi')}</th>
          <th class="num">Opérations</th><th class="num">Écart annuel</th></tr></thead>
        <tbody>${[ref, suivre, strict, contre].filter(Boolean).map(m => {
          const x = l(m);
          if (!x) return '';
          return `<tr>
            <td><span class="b">${esc(m.nom)}</span><div class="xs faint">${esc(m.resume)}</div></td>
            <td class="num b ${cls(x.rendement)}">${pct(x.rendement, 0)}</td>
            <td class="num b ${cls(x.cagr)}">${pct(x.cagr, 1)}</td>
            <td class="num down">${pct(x.maxDrawdown, 1)}</td>
            <td class="num faint">${n(x.exposition, 0)} %</td>
            <td class="num faint">${x.operations}</td>
            <td class="num ${cls(x.ecartAnnuel)}">${m.id === 'buyhold' ? '—' : pct(x.ecartAnnuel, 1)}</td>
          </tr>`;
        }).join('')}</tbody>
      </table>
      </div>
    </div>

    ${R.justesse ? `<div class="card">
      <h3>Leurs objectifs de cours étaient-ils justes ?</h3>
      <p class="sm" style="line-height:1.7;color:#ccd3de;max-width:84ch;margin-top:0">${esc(R.justesse.lecture)}</p>
      <div class="grid g3" style="margin-top:14px">
        <div class="stat"><div class="lbl">Hausse annoncée</div>
          <div class="val ${cls(R.justesse.moyAttendu)}">${pct(R.justesse.moyAttendu, 1)}</div>
          <div class="note">en moyenne, à un an</div></div>
        <div class="stat"><div class="lbl">Hausse réelle</div>
          <div class="val ${cls(R.justesse.moyObtenu)}">${pct(R.justesse.moyObtenu, 1)}</div>
          <div class="note">ce qui s’est vraiment passé</div></div>
        <div class="stat"><div class="lbl">Objectif atteint</div>
          <div class="val ${R.justesse.tauxAtteinte > 50 ? 'up' : 'down'}">${n(R.justesse.tauxAtteinte, 0)} %</div>
          <div class="note">des cas sur ${R.justesse.n} révisions</div></div>
      </div>
    </div>` : ''}`;
}

function carteCultureAnalystes() {
  return `<div class="card">
    <h3>Ce que la recherche dit des analystes</h3>
    <div class="sm dim" style="line-height:1.75;max-width:86ch">
      <p><b class="acc">Leurs avis contiennent une information réelle.</b> L’étude de référence — Barber,
      Lehavy, McNichols et Trueman, <i>Can Investors Profit from the Prophets?</i> (2001) — montre que les
      titres les mieux notés font effectivement mieux que les moins bien notés. Ce n’est pas du bruit.</p>
      <p><b class="acc">Mais l’avantage disparaît une fois les frais payés.</b> Les mêmes auteurs le
      constatent : capter cet écart oblige à se réajuster en permanence, et la rotation coûte plus que ce
      qu’elle rapporte. C’est exactement pour cela que la colonne « opérations » figure dans le tableau
      ci-dessus.</p>
      <p><b class="acc">Leurs objectifs de cours sont structurellement optimistes.</b> Un analyste qui
      dégrade une valeur froisse l’entreprise qu’il doit interroger et les clients qui la détiennent.
      La proportion d’avis « vendre » est historiquement minuscule par rapport aux avis « acheter » —
      ce déséquilibre ne reflète pas l’état réel des entreprises.</p>
      <p><b class="acc">Ils réagissent souvent après le marché.</b> Une dégradation arrive fréquemment
      après la baisse, pas avant. Le consensus décrit le présent plus qu’il n’annonce l’avenir.</p>
      <p style="color:var(--text-2)"><b>À retenir :</b> les avis de cabinets sont une information parmi
      d’autres, pas une consigne. Le tableau ci-dessus vous dit ce qu’ils valaient sur <i>ce</i> titre —
      testez-en trois ou quatre avant d’en tirer une règle.</p>
    </div>
  </div>`;
}

/* ================================================================== */
/*  Petits composants partagés                                         */
/* ================================================================== */
const carte = (titre, html) => `<div class="card"><h3>${titre}</h3>
  <p class="sm" style="margin:0;line-height:1.72;color:#dbe2ee;max-width:86ch">${html}</p></div>`;

const vide = (icone, titre, sous = '') => `<div class="empty">
  <div class="big">${icone}</div>${esc(titre)}${sous ? `<br><span class="sm">${esc(sous)}</span>` : ''}</div>`;

const progressif = id => `<div id="${id}" style="margin-top:14px;display:none">
  <div class="progress"><i id="${id}bar" style="width:0%"></i></div>
  <div class="xs faint" id="${id}txt" style="margin-top:6px"></div></div>`;

const prog = id => ({ box: $('#' + id), bar: $('#' + id + 'bar'), txt: $('#' + id + 'txt') });
