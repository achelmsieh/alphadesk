/* =========================================================================
   AlphaDesk — portefeuille et journal de bord
   Les positions vivent dans le navigateur (localStorage). Rien ne part
   ailleurs. Le module recalcule le P&L en direct, agrège le risque réel du
   portefeuille et déclenche les alertes sur les niveaux du plan.
   ========================================================================= */

const KEY = 'alphadesk.portfolio.v1';
const JOURNAL = 'alphadesk.journal.v1';

/** nombre au format francais */
const nf = (x, d = 1) => (x === null || x === undefined || !isFinite(x)) ? 'n/d'
  : Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });


export function loadPositions() {
  try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
}
export function savePositions(list) {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function addPosition(p) {
  const list = loadPositions();
  list.push({
    id: crypto.randomUUID(), createdAt: Date.now(), status: 'ouverte',
    symbol: p.symbol, name: p.name || p.symbol, currency: p.currency || '',
    side: p.side || 'long', qty: +p.qty, entry: +p.entry,
    stop: p.stop != null ? +p.stop : null,
    target1: p.target1 != null ? +p.target1 : null,
    target2: p.target2 != null ? +p.target2 : null,
    thesis: p.thesis || '', scoreAtEntry: p.scoreAtEntry ?? null,
    convictionAtEntry: p.convictionAtEntry ?? null, horizon: p.horizon || null
  });
  savePositions(list);
  addJournal({
    type: 'ouverture', symbol: p.symbol,
    text: `Ouverture ${p.qty} × ${p.symbol} à ${p.entry}. Stop ${p.stop ?? 'non défini'}. Thèse : ${p.thesis || '(non renseignée)'}`
  });
  return list;
}

export function closePosition(id, exitPrice, reason) {
  const list = loadPositions();
  const p = list.find(x => x.id === id);
  if (!p) return list;
  p.status = 'fermée'; p.exit = +exitPrice; p.closedAt = Date.now(); p.exitReason = reason || '';
  p.realizedPnl = (p.exit - p.entry) * p.qty * (p.side === 'long' ? 1 : -1);
  savePositions(list);
  addJournal({
    type: 'clôture', symbol: p.symbol,
    text: `Clôture ${p.symbol} à ${exitPrice} — résultat ${p.realizedPnl >= 0 ? '+' : ''}${nf(p.realizedPnl, 2)}. Motif : ${reason || 'non précisé'}`
  });
  return list;
}

export function removePosition(id) {
  const list = loadPositions().filter(x => x.id !== id);
  savePositions(list); return list;
}

export function updatePosition(id, patch) {
  const list = loadPositions();
  const p = list.find(x => x.id === id);
  if (p) { Object.assign(p, patch); savePositions(list); }
  return list;
}

/* ------------------------------- journal -------------------------------- */
export function loadJournal() {
  try { return JSON.parse(localStorage.getItem(JOURNAL)) || []; } catch { return []; }
}
export function addJournal(entry) {
  const list = loadJournal();
  list.unshift({ id: crypto.randomUUID(), at: Date.now(), ...entry });
  localStorage.setItem(JOURNAL, JSON.stringify(list.slice(0, 500)));
  return list;
}
export function removeJournal(id) {
  const list = loadJournal().filter(x => x.id !== id);
  localStorage.setItem(JOURNAL, JSON.stringify(list));
  return list;
}

/* --------------------------- valorisation live -------------------------- */
/**
 * @param positions  positions ouvertes
 * @param quotes     { SYMBOLE: { price, atr, score, signalLabel } }
 */
export function valuate(positions, quotes, capital) {
  const open = positions.filter(p => p.status === 'ouverte');
  const closed = positions.filter(p => p.status === 'fermée');
  const rows = open.map(p => {
    const q = quotes[p.symbol] || {};
    const px = q.price ?? p.entry;
    const dir = p.side === 'long' ? 1 : -1;
    const pnl = (px - p.entry) * p.qty * dir;
    const invested = p.entry * p.qty;
    const pnlPct = invested ? 100 * pnl / invested : 0;
    const risk = p.stop != null ? Math.abs(p.entry - p.stop) * p.qty : null;
    // ce qui reste réellement en jeu : si le stop est déjà franchi, la position
    // aurait dû être soldée, on ne compte plus de risque « à venir »
    const atRisk = p.stop != null ? Math.max(0, (px - p.stop) * dir) * p.qty : null;
    const distStop = p.stop != null ? ((p.stop / px - 1) * 100) : null;
    const distT1 = p.target1 != null ? ((p.target1 / px - 1) * 100) : null;

    // cohérence du plan : sur un achat le stop est SOUS l'entrée et les
    // objectifs AU-DESSUS ; l'inverse sur une vente à découvert
    const stopKo = p.stop != null && dir * (p.entry - p.stop) <= 0;
    const cibleKo = p.target1 != null && dir * (p.target1 - p.entry) <= 0;
    const incoherent = stopKo || cibleKo;

    const alerts = [];
    if (incoherent) {
      alerts.push({
        level: 'danger',
        text: `Niveaux incohérents avec le sens de la position : sur ${p.side === 'long' ? 'un achat, le stop doit être sous le prix d\'entrée et les objectifs au-dessus' : 'une vente à découvert, le stop doit être au-dessus du prix d\'entrée et les objectifs en dessous'}. Corrigez la ligne ou son sens — le suivi automatique est désactivé tant que c'est le cas.`
      });
    } else {
      if (p.stop != null && dir * (px - p.stop) <= 0) alerts.push({ level: 'danger', text: 'Stop franchi — sortie prévue par le plan.' });
      else if (distStop != null && Math.abs(distStop) < 2) alerts.push({ level: 'warn', text: `Le cours n'est plus qu'à ${nf(Math.abs(distStop), 1)} % du stop.` });
      if (p.target2 != null && dir * (px - p.target2) >= 0) alerts.push({ level: 'good', text: 'Second objectif atteint — le plan est arrivé à son terme.' });
      else if (p.target1 != null && dir * (px - p.target1) >= 0) alerts.push({ level: 'good', text: 'Premier objectif atteint — alléger et remonter le stop au point mort.' });
      if (q.score != null && ((dir === 1 && q.score <= -18) || (dir === -1 && q.score >= 18))) {
        alerts.push({ level: 'warn', text: `Le signal s'est retourné (score ${q.score}) alors que la position est ${p.side === 'long' ? 'longue' : 'courte'}.` });
      }
    }

    return {
      ...p, price: px, pnl, pnlPct, invested, marketValue: px * p.qty,
      risk, atRisk, distStop, distT1, alerts, incoherent,
      score: q.score ?? null, signalLabel: q.signalLabel ?? null, atr: q.atr ?? null,
      weight: capital ? 100 * (px * p.qty) / capital : null
    };
  });

  const invested = rows.reduce((s, r) => s + r.invested, 0);
  const marketValue = rows.reduce((s, r) => s + r.marketValue, 0);
  const unrealized = rows.reduce((s, r) => s + r.pnl, 0);
  const realized = closed.reduce((s, p) => s + (p.realizedPnl || 0), 0);
  const totalRiskIfAllStopsHit = rows.reduce((s, r) => s + (r.atRisk ?? 0), 0);

  const wins = closed.filter(p => (p.realizedPnl || 0) > 0);
  return {
    rows, closed,
    totals: {
      positions: rows.length, invested, marketValue, unrealized,
      unrealizedPct: invested ? 100 * unrealized / invested : 0,
      realized, total: unrealized + realized,
      exposurePct: capital ? 100 * marketValue / capital : null,
      cashPct: capital ? 100 * (capital - marketValue) / capital : null,
      riskOpen: totalRiskIfAllStopsHit,
      riskOpenPct: capital ? 100 * totalRiskIfAllStopsHit / capital : null,
      closedCount: closed.length,
      winRate: closed.length ? 100 * wins.length / closed.length : null,
      avgWin: wins.length ? wins.reduce((s, p) => s + p.realizedPnl, 0) / wins.length : null,
      avgLoss: (closed.length - wins.length) ? Math.abs(closed.filter(p => (p.realizedPnl || 0) <= 0).reduce((s, p) => s + p.realizedPnl, 0)) / (closed.length - wins.length) : null
    }
  };
}

/* ---------------------- diagnostic global du portefeuille --------------- */
export function diagnose(val, capital) {
  const out = [];
  const t = val.totals;

  if (!val.rows.length) {
    out.push({ level: 'info', text: 'Aucune position ouverte. Le portefeuille est entièrement en liquidités — c\'est une position à part entière, parfaitement légitime quand aucun signal n\'est clair.' });
    return out;
  }

  if (t.riskOpenPct != null) {
    if (t.riskOpenPct > 6) out.push({ level: 'danger', text: `Risque cumulé de ${nf(t.riskOpenPct, 1)} % du capital si tous les stops étaient touchés simultanément. Au-delà de 6 %, une mauvaise semaine de marché fait très mal. Réduisez une ou deux lignes.` });
    else if (t.riskOpenPct > 3) out.push({ level: 'warn', text: `Risque cumulé de ${nf(t.riskOpenPct, 1)} % du capital. C'est tenable, mais surveillez la corrélation entre vos lignes : en cas de choc de marché, les stops se déclenchent ensemble.` });
    else out.push({ level: 'good', text: `Risque cumulé de ${nf(t.riskOpenPct, 1)} % du capital si tous les stops étaient touchés. C'est une exposition maîtrisée.` });
  }

  const ko = val.rows.filter(r => r.incoherent);
  if (ko.length) out.push({ level: 'danger', text: `Plan incohérent sur ${ko.map(r => r.symbol).join(', ')} : le stop ou les objectifs ne correspondent pas au sens de la position. Rien ne peut être suivi correctement tant que ce n'est pas corrigé.` });

  const noStop = val.rows.filter(r => r.stop == null);
  if (noStop.length) out.push({ level: 'danger', text: `${noStop.length} position${noStop.length > 1 ? 's' : ''} sans stop défini (${noStop.map(r => r.symbol).join(', ')}). Une position sans stop est une position dont vous ne connaissez pas le risque.` });

  const big = val.rows.filter(r => r.weight != null && r.weight > 25);
  if (big.length) out.push({ level: 'warn', text: `Concentration élevée sur ${big.map(r => `${r.symbol} (${nf(r.weight, 0)} %)`).join(', ')}. Une ligne au-delà de 25 % du capital fait dépendre tout le portefeuille d'une seule décision.` });

  if (t.exposurePct != null && t.exposurePct > 95) out.push({ level: 'warn', text: `Portefeuille investi à ${nf(t.exposurePct, 0)} %. Sans liquidités, vous ne pourrez pas saisir la prochaine opportunité — ni encaisser un appel de marge si vous utilisez du levier.` });

  const losers = val.rows.filter(r => r.pnlPct < -15);
  if (losers.length) out.push({ level: 'warn', text: `${losers.length} ligne${losers.length > 1 ? 's' : ''} en perte de plus de 15 % (${losers.map(r => r.symbol).join(', ')}). Question à se poser honnêtement : si cette position n'existait pas, l'ouvririez-vous aujourd'hui ? Si non, elle n'a pas de raison de rester.` });

  const flipped = val.rows.filter(r => r.alerts.some(a => a.text.includes('retourné')));
  if (flipped.length) out.push({ level: 'warn', text: `Le signal s'est retourné sur ${flipped.map(r => r.symbol).join(', ')}. Relisez la thèse d'entrée : est-elle toujours valable ?` });

  if (t.closedCount >= 5 && t.winRate != null) {
    const payoff = (t.avgWin && t.avgLoss) ? t.avgWin / t.avgLoss : null;
    out.push({
      level: 'info',
      text: `Sur ${t.closedCount} positions clôturées : ${nf(t.winRate, 0)} % de réussite` +
        (payoff ? `, gain moyen ${nf(payoff, 2)}× la perte moyenne. ` : '. ') +
        (payoff && t.winRate / 100 * payoff > (1 - t.winRate / 100)
          ? 'La combinaison taux de réussite × ratio gain/perte est positive : votre méthode a une espérance favorable.'
          : 'La combinaison taux de réussite × ratio gain/perte est encore défavorable : soit laisser courir les gains plus longtemps, soit couper les pertes plus tôt.')
    });
  }

  return out;
}

/* ------------------------ export / import du dossier -------------------- */
export function exportAll() {
  return JSON.stringify({
    version: 1, exportedAt: new Date().toISOString(),
    positions: loadPositions(), journal: loadJournal(),
    settings: JSON.parse(localStorage.getItem('alphadesk.profile') || '{}')
  }, null, 2);
}

export function importAll(json) {
  const d = JSON.parse(json);
  if (d.positions) savePositions(d.positions);
  if (d.journal) localStorage.setItem(JOURNAL, JSON.stringify(d.journal));
  if (d.settings) localStorage.setItem('alphadesk.profile', JSON.stringify(d.settings));
  return true;
}
