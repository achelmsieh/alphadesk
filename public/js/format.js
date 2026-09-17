/* =========================================================================
   AlphaDesk — mise en forme partagée

   Tout ce qui transforme un nombre en quelque chose de lisible par un
   humain. Règles appliquées partout :
     · virgule décimale, espace fine pour les milliers (format français) ;
     · chasses fixes réservées aux colonnes de chiffres ;
     · un pourcentage signé porte toujours son signe, même positif ;
     · rien n'est jamais affiché « NaN » : c'est « — ».
   ========================================================================= */

export const $ = s => document.querySelector(s);
export const el = h => { const d = document.createElement('div'); d.innerHTML = h.trim(); return d.firstElementChild; };
export const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

export function n(x, d = 2) {
  if (x === null || x === undefined || !isFinite(x)) return '—';
  return Number(x).toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export function px(x) {
  if (x === null || x === undefined || !isFinite(x)) return '—';
  const a = Math.abs(x);
  return n(x, a >= 1000 ? 0 : a >= 10 ? 2 : a >= 1 ? 3 : 4);
}
export const pct = (x, d = 2) =>
  (x === null || x === undefined || !isFinite(x)) ? '—' : (x >= 0 ? '+' : '') + n(x, d) + ' %';

export function money(x, cur = '') {
  if (x === null || !isFinite(x)) return '—';
  return n(x, Math.abs(x) >= 1000 ? 0 : 2) + (cur ? ' ' + curSym(cur) : '');
}
export const curSym = c => ({ EUR: '€', USD: '$', GBP: '£', CHF: 'CHF', JPY: '¥' })[c] || c || '';

export function big(x) {
  if (x === null || !isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a >= 1e12) return n(x / 1e12, 2) + ' T';
  if (a >= 1e9) return n(x / 1e9, 2) + ' Md';
  if (a >= 1e6) return n(x / 1e6, 1) + ' M';
  if (a >= 1e3) return n(x / 1e3, 1) + ' k';
  return n(x, 0);
}

export const dt = (ms, opt) =>
  new Date(ms).toLocaleDateString('fr-FR', opt || { day: '2-digit', month: 'short', year: 'numeric' });
export const annee = ms => new Date(ms).getFullYear();

export const cls = x => (x === null || x === undefined || !isFinite(x)) ? '' : x > 0 ? 'up' : x < 0 ? 'down' : '';
export const sgn = x => (isFinite(x) && x > 0) ? '+' : '';

/* --------------------------- jetons de couleur -------------------------- */
export const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

/** teinte dérivée d'un jeton CSS — aucune couleur ne doit être écrite en dur,
    sinon elle ne suivrait pas le mode daltonien */
export function tint(name, alpha) {
  const h = cssVar(name);
  const m = /^#?([0-9a-f]{6})$/i.exec(h);
  if (!m) return h;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
}

/* ------------------------------- jauges --------------------------------- */
/** jauge simple 0 → max */
export function meter(v, max = 100, color = 'var(--accent)', tall = false) {
  const w = clamp((v || 0) / max * 100, 0, 100);
  return `<div class="meter${tall ? ' tall' : ''}"><i style="width:${w}%;background:${color}"></i></div>`;
}
/** jauge divergente centrée sur zéro ; l'extrémité de donnée est arrondie,
    le côté du point mort reste carré */
export function meterDiv(v, tall = false) {
  const a = clamp(Math.abs(v || 0), 0, 100) / 2;
  const pos = (v || 0) >= 0;
  const r = tall ? 4 : 3;
  const rad = pos ? `0 ${r}px ${r}px 0` : `${r}px 0 0 ${r}px`;
  return `<div class="meter div${tall ? ' tall' : ''}"><i style="width:${a}%;left:${pos ? 50 : 50 - a}%;background:${pos ? 'var(--up)' : 'var(--down)'};border-radius:${rad}"></i></div>`;
}
export const sevColor = v => v > 65 ? 'var(--critical)' : v > 45 ? 'var(--warn)' : 'var(--good)';
export const qualColor = v => v >= 65 ? 'var(--up)' : v >= 45 ? 'var(--warn)' : 'var(--text-3)';

/* --------------------------- notifications ------------------------------ */
export function toast(msg, kind = '') {
  const t = el(`<div class="toast ${kind}">${esc(msg)}</div>`);
  document.body.appendChild(t);
  setTimeout(() => {
    t.style.opacity = '0'; t.style.transition = '.3s';
    setTimeout(() => t.remove(), 300);
  }, 3600);
}

/* ------------------------------ glossaire ------------------------------- */
/**
 * Le public de cette application n'est pas composé de professionnels. Chaque
 * terme technique affiché doit pouvoir être expliqué en une phrase, au survol.
 */
export const GLOSSAIRE = {
  'repli maximal': 'La pire perte subie entre un sommet et le creux qui suit, avant de repartir. C’est le chiffre qui dit si vous auriez tenu.',
  'ratio de Calmar': 'Le gain annuel divisé par la pire perte. Plus il est élevé, plus le rendement a été obtenu confortablement.',
  'ratio de Sharpe': 'Le rendement rapporté aux secousses subies pour l’obtenir. Au-dessus de 1, c’est bon ; en dessous de 0, le placement a fait perdre de l’argent.',
  'facteur de profit': 'Le total des gains divisé par le total des pertes. En dessous de 1, la méthode perd de l’argent.',
  'exposition': 'La part du temps où votre argent est réellement investi. Le reste du temps il dort, sans risque et sans rendement.',
  'liquidités': 'De l’argent non investi, qui attend sur le compte. Il ne rapporte rien ici, mais il ne peut pas baisser non plus.',
  'détention simple': 'Acheter une fois, ne plus jamais rien faire. C’est la référence que toute méthode doit battre.',
  'glissement': 'L’écart entre le prix que vous voyez et celui que vous obtenez réellement. Petit, mais il se répète à chaque opération.',
  'consensus': 'La moyenne des avis des cabinets d’analystes qui suivent l’entreprise.',
  'volatilité': 'L’ampleur des mouvements. Une forte volatilité veut dire de grandes variations, à la hausse comme à la baisse.',
  'momentum': 'La tendance d’un titre qui monte à continuer de monter pendant quelques mois.',
  'moyenne mobile': 'Le cours moyen des N derniers jours, recalculé chaque jour. Elle lisse le bruit et montre la direction de fond.',
  'robustesse': 'Note sur 100 qui dit si une méthode gagne régulièrement sur plusieurs valeurs, ou si elle a eu de la chance sur une seule.',
  'écart annuel': 'La différence de rendement par an entre la méthode et le fait de ne rien faire. On raisonne par an car sur vingt ans les gains se multiplient : un écart cumulé ne voudrait rien dire.',
  'opérations': 'Le nombre d’achats et de ventes déclenchés. Chacun coûte des frais : beaucoup d’opérations rongent le gain.',
  'temps investi': 'La part du temps où votre argent est réellement dans le marché. Le reste, il attend sans risque et sans rendement.',
  'gain / souffrance': 'Le gain annuel divisé par la pire perte traversée. Il répond à : « combien ai-je gagné pour chaque euro de peur encaissé ? »',
  'pire perte': 'La plus forte baisse subie entre un sommet et le creux suivant. C’est le chiffre qui dit si vous auriez tenu sans tout vendre.'
};

/** enrobe un terme d'une infobulle explicative */
export function terme(mot, texteAffiche = null) {
  const def = GLOSSAIRE[mot.toLowerCase()];
  const t = texteAffiche || mot;
  return def ? `<abbr class="gloss" title="${esc(def)}">${esc(t)}</abbr>` : esc(t);
}
