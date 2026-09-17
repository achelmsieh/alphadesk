/* =========================================================================
   AlphaDesk — moteur graphique (canvas, sans dépendance)
   Un graphique en panneaux : prix + volumes + oscillateurs, avec curseur
   de lecture, lignes de niveaux et marqueurs d'opérations.
   ========================================================================= */

const CSS = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

function palette() {
  return {
    bg: CSS('--surface-1') || '#15161a',
    grid: CSS('--grid') || 'rgba(255,255,255,.055)',
    axis: CSS('--axis') || '#3b3f47',
    text: CSS('--text-3') || '#757b87',
    textStrong: CSS('--text') || '#f1f3f6',
    up: CSS('--up') || '#1baf7a',
    down: CSS('--down') || '#e34948',
    accent: CSS('--accent') || '#3987e5',
    warn: CSS('--warn') || '#fab219'
  };
}

export class PriceChart {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cfg = null;
    this.hover = null;
    this.onHover = null;
    this._bind();
    this._ro = new ResizeObserver(() => this.render());
    this._ro.observe(canvas.parentElement || canvas);
  }

  destroy() { this._ro?.disconnect(); }

  _bind() {
    this.cv.addEventListener('mousemove', e => {
      const r = this.cv.getBoundingClientRect();
      this.hover = { x: e.clientX - r.left, y: e.clientY - r.top };
      this.render();
    });
    this.cv.addEventListener('mouseleave', () => {
      this.hover = null; this.render();
      if (this.onHover) this.onHover(null);
    });
    // Ctrl (ou Maj) + molette = zoom. La molette seule doit continuer à faire
    // défiler la page : sinon le curseur reste piégé sur le graphique.
    this.cv.addEventListener('wheel', e => {
      if (!this.cfg) return;
      if (!e.ctrlKey && !e.shiftKey && !e.metaKey) return;
      e.preventDefault();
      const span = this.cfg.view.to - this.cfg.view.from;
      const step = Math.max(3, Math.round(span * 0.12));
      const dir = e.deltaY > 0 ? 1 : -1;
      let from = this.cfg.view.from - dir * step;
      from = Math.max(0, Math.min(this.cfg.view.to - 25, from));
      this.cfg.view.from = from;
      this.render();
    }, { passive: false });
  }

  /**
   * @param cfg {
   *   t,o,h,l,c,v   séries
   *   overlays[]    {key,data,color,width,dash,label,type:'line'|'area'|'cloud'}
   *   panes[]       {key,height,series:[{data,color,type:'line'|'hist'|'area'}],bands:[{v,color}],range:[min,max],label}
   *   hlines[]      {price,color,label,dash}
   *   markers[]     {idx,type:'buy'|'sell'|'exit',label}
   *   bars          nombre de bougies visibles par défaut
   * }
   */
  setData(cfg) {
    const n = cfg.c.length;
    // Densite adaptee a la largeur reelle : sous ~6 px par bougie les corps
    // tombent a un cheveu et le graphique cesse d'etre lisible. On montre
    // donc moins de seances sur un panneau etroit plutot que de les ecraser.
    const plotW = Math.max(280, (this.cv.parentElement?.clientWidth || 860) - 70);
    const auto = Math.round(plotW / 6);
    const bars = Math.max(40, Math.min(n, cfg.bars || auto, auto));
    this.cfg = { ...cfg, view: { from: Math.max(0, n - bars), to: n } };
    this.render();
  }

  render() {
    const cfg = this.cfg; if (!cfg) return;
    const cv = this.cv, ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const host = cv.parentElement;
    const W = Math.max(320, host.clientWidth), Hgt = Math.max(240, cfg.height || host.clientHeight || 420);
    if (cv.width !== W * dpr || cv.height !== Hgt * dpr) {
      cv.width = W * dpr; cv.height = Hgt * dpr;
      cv.style.width = W + 'px'; cv.style.height = Hgt + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = palette();
    ctx.clearRect(0, 0, W, Hgt);

    const padL = 8, padR = 62, padT = 10, padB = 22;
    const panes = cfg.panes || [];
    const paneH = panes.reduce((s, p) => s + (p.height || 70), 0);
    const priceH = Hgt - padT - padB - paneH - (panes.length * 6);
    const plotW = W - padL - padR;

    const { from, to } = cfg.view;
    const N = to - from;
    const bw = plotW / N;
    const xOf = i => padL + (i - from) * bw + bw / 2;

    /* ---------- échelle des prix ---------- */
    let lo = Infinity, hi = -Infinity;
    for (let i = from; i < to; i++) { lo = Math.min(lo, cfg.l[i]); hi = Math.max(hi, cfg.h[i]); }
    for (const ov of cfg.overlays || []) {
      if (ov.hideFromScale) continue;
      for (let i = from; i < to; i++) {
        const a = ov.type === 'cloud' ? [ov.a[i], ov.b[i]] : [ov.data[i]];
        for (const x of a) if (x !== null && isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
      }
    }
    // Un niveau projete n'a pas le droit d'ecraser les cours : il n'elargit
    // l'echelle que s'il reste dans 25 % de l'amplitude visible. Au-dela il
    // n'est pas trace ici (sa valeur exacte est dans le plan chiffre).
    const span0 = hi - lo || 1;
    const loGuard = lo - span0 * 0.25, hiGuard = hi + span0 * 0.25;
    for (const h of cfg.hlines || []) {
      if (h.price !== null && isFinite(h.price) && h.price >= loGuard && h.price <= hiGuard) {
        lo = Math.min(lo, h.price); hi = Math.max(hi, h.price);
      }
    }
    const pad = (hi - lo) * 0.06 || 1;
    lo -= pad; hi += pad;
    const yOf = p => padT + priceH - (p - lo) / (hi - lo) * priceH;

    /* ---------- grille et axe des prix ---------- */
    ctx.strokeStyle = P.grid; ctx.fillStyle = P.text;
    ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.lineWidth = 1;
    const ticks = niceTicks(lo, hi, 6);
    for (const tk of ticks) {
      const y = Math.round(yOf(tk)) + .5;
      if (y < padT || y > padT + priceH) continue;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(fmtAxis(tk), padL + plotW + 6, y);
    }

    /* ---------- axe du temps ---------- */
    const tickEvery = Math.max(1, Math.floor(N / 7));
    ctx.textBaseline = 'top';
    for (let i = from; i < to; i += tickEvery) {
      const x = xOf(i);
      ctx.strokeStyle = P.grid;
      ctx.beginPath(); ctx.moveTo(Math.round(x) + .5, padT); ctx.lineTo(Math.round(x) + .5, padT + priceH); ctx.stroke();
      ctx.fillStyle = P.text;
      const lbl = fmtDate(cfg.t[i], N);
      // un libelle ne deborde jamais et n'est jamais rogne : on le cale sur le
      // bord quand il n'y a plus la place de le centrer
      const half = ctx.measureText(lbl).width / 2;
      if (x - half < padL) ctx.textAlign = 'left', ctx.fillText(lbl, padL, Hgt - padB + 6);
      else if (x + half > padL + plotW) ctx.textAlign = 'right', ctx.fillText(lbl, padL + plotW, Hgt - padB + 6);
      else ctx.textAlign = 'center', ctx.fillText(lbl, x, Hgt - padB + 6);
    }

    /* ---------- nuages (Ichimoku) ---------- */
    for (const ov of (cfg.overlays || []).filter(o => o.type === 'cloud')) {
      ctx.beginPath();
      let started = false;
      for (let i = from; i < to; i++) {
        if (ov.a[i] === null || ov.a[i] === undefined) continue;
        const x = xOf(i), y = yOf(ov.a[i]);
        started ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), started = true);
      }
      for (let i = to - 1; i >= from; i--) {
        if (ov.b[i] === null || ov.b[i] === undefined) continue;
        ctx.lineTo(xOf(i), yOf(ov.b[i]));
      }
      ctx.closePath();
      ctx.fillStyle = ov.color || 'rgba(91,140,255,.10)';
      ctx.fill();
    }

    /* ---------- bougies ---------- */
    // corps plafonne a 12 px : on ne remplit jamais toute la case, le reste
    // de la bande est de l'air (c'est lui qui separe deux bougies voisines)
    const body = Math.max(1.5, Math.min(bw * 0.72, 12));
    for (let i = from; i < to; i++) {
      const up = cfg.c[i] >= cfg.o[i];
      const col = up ? P.up : P.down;
      const x = xOf(i);
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.round(x) + .5, yOf(cfg.h[i]));
      ctx.lineTo(Math.round(x) + .5, yOf(cfg.l[i]));
      ctx.stroke();
      const yO = yOf(cfg.o[i]), yC = yOf(cfg.c[i]);
      const top = Math.min(yO, yC), hh = Math.max(1, Math.abs(yC - yO));
      if (bw < 3) { ctx.fillRect(x - .5, top, 1, hh); }
      else ctx.fillRect(x - body / 2, top, body, hh);
    }

    /* ---------- superpositions ---------- */
    for (const ov of (cfg.overlays || []).filter(o => o.type !== 'cloud')) {
      ctx.save();
      ctx.strokeStyle = ov.color; ctx.lineWidth = ov.width || 1.4;
      if (ov.dash) ctx.setLineDash(ov.dash);
      ctx.beginPath();
      let started = false;
      for (let i = from; i < to; i++) {
        const y = ov.data[i];
        if (y === null || y === undefined || !isFinite(y)) { started = false; continue; }
        const px = xOf(i), py = yOf(y);
        started ? ctx.lineTo(px, py) : (ctx.moveTo(px, py), started = true);
      }
      ctx.stroke();
      ctx.restore();
    }

    /* ---------- lignes horizontales (stop, objectifs, niveaux) ---------- */
    for (const h of cfg.hlines || []) {
      if (h.price === null || !isFinite(h.price)) continue;
      const y = yOf(h.price);
      if (y < padT - 2 || y > padT + priceH + 2) continue;
      ctx.save();
      ctx.strokeStyle = h.color; ctx.lineWidth = 1;
      ctx.setLineDash(h.dash || [5, 4]);
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + plotW, y); ctx.stroke();
      ctx.setLineDash([]);
      if (h.label) {
        ctx.font = '10px system-ui, sans-serif';
        const w = ctx.measureText(h.label).width + 10;
        ctx.fillStyle = h.color;
        ctx.globalAlpha = .9;
        ctx.fillRect(padL + 2, y - 8, w, 16);
        ctx.globalAlpha = 1;
        ctx.fillStyle = CSS('--plane') || '#0b0c0e'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(h.label, padL + 7, y);
      }
      ctx.restore();
    }

    /* ---------- marqueurs d'opérations ---------- */
    for (const m of cfg.markers || []) {
      if (m.idx < from || m.idx >= to) continue;
      const x = xOf(m.idx);
      const buy = m.type === 'buy';
      const y = buy ? yOf(cfg.l[m.idx]) + 14 : yOf(cfg.h[m.idx]) - 14;
      ctx.fillStyle = m.type === 'exit' ? P.warn : buy ? P.up : P.down;
      ctx.beginPath();
      if (m.type === 'exit') { ctx.arc(x, y, 4, 0, Math.PI * 2); }
      else if (buy) { ctx.moveTo(x, y - 7); ctx.lineTo(x - 5, y + 3); ctx.lineTo(x + 5, y + 3); }
      else { ctx.moveTo(x, y + 7); ctx.lineTo(x - 5, y - 3); ctx.lineTo(x + 5, y - 3); }
      ctx.closePath(); ctx.fill();
    }

    /* ---------- panneaux d'oscillateurs ---------- */
    let yCursor = padT + priceH + 6;
    this._paneGeom = [];
    for (const pane of panes) {
      const ph = pane.height || 70;
      this._drawPane(ctx, pane, padL, yCursor, plotW, ph, from, to, xOf, P);
      this._paneGeom.push({ pane, top: yCursor, h: ph });
      yCursor += ph + 6;
    }

    /* ---------- curseur de lecture ---------- */
    if (this.hover && this.hover.x > padL && this.hover.x < padL + plotW) {
      const idx = Math.max(from, Math.min(to - 1, from + Math.floor((this.hover.x - padL) / bw)));
      const x = xOf(idx);
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.setLineDash([3, 3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, padT); ctx.lineTo(x, Hgt - padB); ctx.stroke();
      if (this.hover.y < padT + priceH) {
        ctx.beginPath(); ctx.moveTo(padL, this.hover.y); ctx.lineTo(padL + plotW, this.hover.y); ctx.stroke();
        const p = lo + (padT + priceH - this.hover.y) / priceH * (hi - lo);
        ctx.setLineDash([]);
        ctx.fillStyle = P.accent;
        ctx.fillRect(padL + plotW + 2, this.hover.y - 8, padR - 6, 16);
        ctx.fillStyle = CSS('--plane') || '#0b0c0e'; ctx.font = '10px ui-monospace, monospace';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(fmtAxis(p), padL + plotW + 6, this.hover.y);
      }
      ctx.restore();
      if (this.onHover) this.onHover(idx);
    }
  }

  _drawPane(ctx, pane, x0, y0, w, h, from, to, xOf, P) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,.015)';
    ctx.fillRect(x0, y0, w, h);

    let lo = Infinity, hi = -Infinity;
    if (pane.range) { [lo, hi] = pane.range; }
    else {
      for (const s of pane.series) {
        for (let i = from; i < to; i++) {
          const v = s.data[i];
          if (v === null || v === undefined || !isFinite(v)) continue;
          lo = Math.min(lo, v); hi = Math.max(hi, v);
        }
      }
      if (!isFinite(lo)) { lo = 0; hi = 1; }
      const pd = (hi - lo) * 0.1 || 1; lo -= pd; hi += pd;
      if (pane.zeroCentered) { const m = Math.max(Math.abs(lo), Math.abs(hi)); lo = -m; hi = m; }
    }
    const yOf = v => y0 + h - (v - lo) / (hi - lo) * h;

    // Seuils de lecture (30 / 70 du RSI...). Trait PLEIN d'une hauteur de
    // cheveu : le pointille ajoute du bruit et se lit comme une projection.
    for (const b of pane.bands || []) {
      const y = yOf(b.v);
      if (y < y0 || y > y0 + h) continue;
      ctx.strokeStyle = b.color || P.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x0, Math.round(y) + .5); ctx.lineTo(x0 + w, Math.round(y) + .5); ctx.stroke();
    }
    if (pane.fillBetween) {
      const [a, b] = pane.fillBetween;
      ctx.fillStyle = 'rgba(91,140,255,.07)';
      ctx.fillRect(x0, yOf(b), w, Math.abs(yOf(a) - yOf(b)));
    }

    const bw = w / (to - from);
    for (const s of pane.series) {
      if (s.type === 'hist') {
        const zero = yOf(0);
        for (let i = from; i < to; i++) {
          const v = s.data[i];
          if (v === null || !isFinite(v)) continue;
          ctx.fillStyle = s.colorFn ? s.colorFn(v, i) : (v >= 0 ? P.up : P.down);
          const y = yOf(v);
          ctx.fillRect(xOf(i) - Math.max(1, bw * .35), Math.min(y, zero), Math.max(1.5, bw * .7), Math.max(1, Math.abs(y - zero)));
        }
      } else if (s.type === 'bars') {
        for (let i = from; i < to; i++) {
          const v = s.data[i];
          if (v === null || !isFinite(v)) continue;
          ctx.fillStyle = s.colorFn ? s.colorFn(v, i) : s.color;
          const y = yOf(v);
          ctx.fillRect(xOf(i) - Math.max(1, bw * .35), y, Math.max(1.5, bw * .7), y0 + h - y);
        }
      } else {
        ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.3;
        ctx.beginPath();
        let started = false;
        for (let i = from; i < to; i++) {
          const v = s.data[i];
          if (v === null || v === undefined || !isFinite(v)) { started = false; continue; }
          const px = xOf(i), py = yOf(v);
          started ? ctx.lineTo(px, py) : (ctx.moveTo(px, py), started = true);
        }
        ctx.stroke();
      }
    }

    ctx.fillStyle = P.text;
    ctx.font = '10px system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(pane.label || '', x0 + 6, y0 + 4);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(fmtAxis(hi), x0 + w + 6, y0 + 7);
    ctx.fillText(fmtAxis(lo), x0 + w + 6, y0 + h - 7);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/*  Courbe simple (capital, comparaisons)                              */
/* ------------------------------------------------------------------ */
export class LineChart {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this._ro = new ResizeObserver(() => this.render());
    this._ro.observe(canvas.parentElement || canvas);
  }
  setData(cfg) { this.cfg = cfg; this.render(); }
  render() {
    const cfg = this.cfg; if (!cfg) return;
    const cv = this.cv, ctx = this.ctx, P = palette();
    const dpr = window.devicePixelRatio || 1;
    const W = Math.max(280, (cv.parentElement?.clientWidth) || 400), H = cfg.height || 240;
    cv.width = W * dpr; cv.height = H * dpr;
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const padL = 8, padR = 60, padT = 12, padB = 22;
    const w = W - padL - padR, h = H - padT - padB;
    let lo = Infinity, hi = -Infinity;
    for (const s of cfg.series) for (const v of s.data) { if (v === null || !isFinite(v)) continue; lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (!isFinite(lo)) return;
    const pd = (hi - lo) * .08 || 1; lo -= pd; hi += pd;
    const n = Math.max(...cfg.series.map(s => s.data.length));
    const xOf = i => padL + i / (n - 1) * w;
    const yOf = v => padT + h - (v - lo) / (hi - lo) * h;

    ctx.strokeStyle = P.grid; ctx.fillStyle = P.text;
    ctx.font = '11px ui-monospace, monospace';
    for (const tk of niceTicks(lo, hi, 5)) {
      const y = Math.round(yOf(tk)) + .5;
      if (y < padT || y > padT + h) continue;
      ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + w, y); ctx.stroke();
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(fmtAxis(tk), padL + w + 6, y);
    }
    if (cfg.dates?.length) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      const every = Math.max(1, Math.floor(n / 6));
      for (let i = 0; i < n; i += every) ctx.fillText(fmtDate(cfg.dates[i], n), xOf(i), H - padB + 6);
    }

    for (const s of cfg.series) {
      ctx.save();
      if (s.fill) {
        ctx.beginPath();
        ctx.moveTo(xOf(0), yOf(s.data[0]));
        s.data.forEach((v, i) => { if (v !== null && isFinite(v)) ctx.lineTo(xOf(i), yOf(v)); });
        ctx.lineTo(xOf(s.data.length - 1), padT + h); ctx.lineTo(xOf(0), padT + h);
        ctx.closePath(); ctx.fillStyle = s.fill; ctx.fill();
      }
      ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 1.8;
      if (s.dash) ctx.setLineDash(s.dash);
      ctx.beginPath();
      let started = false;
      s.data.forEach((v, i) => {
        if (v === null || !isFinite(v)) { started = false; return; }
        const x = xOf(i), y = yOf(v);
        started ? ctx.lineTo(x, y) : (ctx.moveTo(x, y), started = true);
      });
      ctx.stroke();
      ctx.restore();
    }

    // légende
    let lx = padL + 8;
    ctx.font = '11px system-ui, sans-serif'; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    for (const s of cfg.series) {
      if (!s.label) continue;
      ctx.fillStyle = s.color;
      ctx.fillRect(lx, padT + 2, 10, 3);
      ctx.fillStyle = P.textStrong;
      ctx.fillText(s.label, lx + 15, padT + 4);
      lx += 22 + ctx.measureText(s.label).width;
    }
  }
}

/* ------------------------------------------------------------------ */
/*  Sparkline — la micro-tendance d'une tuile de statistique           */
/*  (un ratio unique se lit sur une jauge linéaire en HTML, pas sur un */
/*   cadran circulaire : voir .meter dans la feuille de style)         */
/* ------------------------------------------------------------------ */
export function drawSparkline(canvas, data, { color, height = 30 } = {}) {
  const ctx = canvas.getContext('2d'), P = palette();
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth || 110;
  canvas.width = w * dpr; canvas.height = height * dpr;
  canvas.style.height = height + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, height);

  const pts = data.filter(x => x !== null && isFinite(x));
  if (pts.length < 2) return;
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const pad = 3;
  const xOf = i => i / (pts.length - 1) * w;
  const yOf = v => height - pad - (hi === lo ? .5 : (v - lo) / (hi - lo)) * (height - pad * 2);

  const col = color || (pts[pts.length - 1] >= pts[0] ? P.up : P.down);
  // lavis à ~10 % sous la ligne, jamais un bloc saturé
  ctx.beginPath();
  ctx.moveTo(0, height);
  pts.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)));
  ctx.lineTo(w, height); ctx.closePath();
  ctx.fillStyle = col.startsWith('#') ? col + '1a' : col;
  ctx.globalAlpha = col.startsWith('#') ? 1 : .1;
  ctx.fill(); ctx.globalAlpha = 1;

  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((v, i) => i ? ctx.lineTo(xOf(i), yOf(v)) : ctx.moveTo(xOf(i), yOf(v)));
  ctx.stroke();

  // marqueur de fin : >= 8 px avec un anneau de 2 px couleur surface
  const lx = xOf(pts.length - 1), ly = yOf(pts[pts.length - 1]);
  ctx.beginPath(); ctx.arc(lx - 2, ly, 4.5, 0, Math.PI * 2);
  ctx.fillStyle = P.bg; ctx.fill();
  ctx.beginPath(); ctx.arc(lx - 2, ly, 3, 0, Math.PI * 2);
  ctx.fillStyle = col; ctx.fill();
}

/* ------------------------------ formats -------------------------------- */
function niceTicks(lo, hi, count) {
  const span = hi - lo;
  if (!isFinite(span) || span <= 0) return [lo];
  const raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}
function fmtAxis(v) {
  const a = Math.abs(v);
  const f = (x, d) => x.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
  if (a >= 1e9) return f(v / 1e9, 1) + ' Md';
  if (a >= 1e6) return f(v / 1e6, 1) + ' M';
  if (a >= 1e4) return f(Math.round(v), 0);
  if (a >= 100) return f(v, 1);
  if (a >= 1) return f(v, 2);
  return f(v, 4);
}
function fmtDate(ms, span) {
  const d = new Date(ms);
  if (span <= 30) return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
  if (span <= 400) return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
  return d.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
}
