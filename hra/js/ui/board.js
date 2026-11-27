// Kreslení mapy na canvas, posun a zoom, výběr místa dotykem.
import { graph, hexXY } from '../core/hex.js';
import { TERRAIN_COLOR, TERRAIN_GFX, RES_COLOR, PIPS, COLORS } from '../data.js';

// ---------- obrázky dílků ----------
// figurky obarvené na barvu hráče: bílý obrázek × barva, předkreslené jednou na hráče
const TINT = {};
function tinted(name, color) {
  const k = name + color;
  if (TINT[k]) return TINT[k];
  const img = sprite(name);
  if (!img) return null;
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  x.globalCompositeOperation = 'multiply'; x.fillStyle = color; x.fillRect(0, 0, c.width, c.height);
  x.globalCompositeOperation = 'destination-in'; x.drawImage(img, 0, 0);
  return (TINT[k] = c);
}
// samostatné obrázky (bouře); načtou se jednou, do té doby se kreslí náhradní tvar
function sprite(name) {
  let img = IMG[name];
  if (!img) { img = IMG[name] = new Image(); img.onload = () => { for (const B of waiting) B.draw(); }; img.src = 'gfx/' + name + '.webp'; }
  return img.complete && img.naturalWidth ? img : null;
}
// Načítají se jednou pro celou aplikaci; dokud nejsou načtené, dílek se kreslí barvou a značkou.
const IMG = {}, waiting = new Set();
function texture(t, q, r) {
  const list = TERRAIN_GFX[t];
  if (!list || !list.length) return null;
  const h = Math.abs(q * 73856093 ^ r * 19349663), name = list[h % list.length];
  let img = IMG[name];
  if (!img) {
    img = IMG[name] = new Image();
    img.onload = () => { for (const B of waiting) B.draw(); };
    img.src = 'gfx/' + name + '.jpg';
  }
  return img.complete && img.naturalWidth ? { img, h } : null;
}
import { pc } from './dom.js';

const INK = '#1d2a38';

export function createBoard(cv, onPick) {
  const ctx = cv.getContext('2d');
  const B = { v: null, g: null, targets: null, cam: { x: 0, y: 0, k: 40 }, fitted: false, mark: null };
  waiting.add(B);
  let dpr = 1, W = 0, H = 0, raf = 0;

  B.resize = () => {
    const r = cv.getBoundingClientRect();
    dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    W = r.width; H = r.height;
    cv.width = Math.max(1, Math.round(W * dpr)); cv.height = Math.max(1, Math.round(H * dpr));
    if (B.g && !B.moved) B.fit(); else B.draw();
  };
  B.setView = v => {
    const first = !B.v || B.v.map.hexes.length !== v.map.hexes.length;
    B.v = v; B.g = graph(v.map.hexes);
    if (first) { B.moved = false; B.fit(); } else B.draw();
  };
  B.setTargets = t => { B.targets = t; B.draw(); };
  B.setMark = m => { B.mark = m; };
  B.fit = () => {
    if (!B.g || !W) return;
    const xs = Object.values(B.g.V).map(v => v.x), ys = Object.values(B.g.V).map(v => v.y);
    const M = 1.45, x0 = Math.min(...xs) - M, x1 = Math.max(...xs) + M, y0 = Math.min(...ys) - M, y1 = Math.max(...ys) + M; // okraj pro přístavy
    B.cam.k = Math.min(W / (x1 - x0), H / (y1 - y0));
    B.cam.x = (x0 + x1) / 2; B.cam.y = (y0 + y1) / 2; B.minK = B.cam.k * 0.7;
    B.draw();
  };
  B.draw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(); }); };

  // poloha místa na obrazovce (pro testy)
  B.px = (type, id) => {
    const g = B.g; let x, y;
    if (type === 'v') ({ x, y } = g.V[id]);
    else if (type === 'e') { x = (g.V[g.E[id].a].x + g.V[g.E[id].b].x) / 2; y = (g.V[g.E[id].a].y + g.V[g.E[id].b].y) / 2; }
    else ({ x, y } = hexXY(B.v.map.hexes[id].q, B.v.map.hexes[id].r));
    const r = cv.getBoundingClientRect();
    return { x: r.left + (x - B.cam.x) * B.cam.k + W / 2, y: r.top + (y - B.cam.y) * B.cam.k + H / 2 };
  };
  const toWorld = (px, py) => ({ x: (px - W / 2) / B.cam.k + B.cam.x, y: (py - H / 2) / B.cam.k + B.cam.y });

  // ---------- kreslení ----------
  function paint() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    const v = B.v, g = B.g;
    if (!v) return;
    const k = B.cam.k * dpr;
    ctx.setTransform(k, 0, 0, k, cv.width / 2 - B.cam.x * k, cv.height / 2 - B.cam.y * k);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    const path = i => { ctx.beginPath(); g.hv[i].forEach((id, j) => { const p = g.V[id]; j ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.closePath(); };
    // mělčina kolem ostrova
    ctx.strokeStyle = 'rgba(190,230,245,.35)'; ctx.lineWidth = 0.55;
    v.map.hexes.forEach((_, i) => { path(i); ctx.stroke(); });
    ctx.strokeStyle = '#e9dcb2'; ctx.lineWidth = 0.22;
    v.map.hexes.forEach((_, i) => { path(i); ctx.stroke(); });
    // přístavy: dřevěné molo od pobřeží k bóji s žetonem suroviny (2:1) nebo kotvou (3:1)
    for (const pt of v.map.ports) port(pt);
    // dílky
    v.map.hexes.forEach((hx, i) => {
      const c = hexXY(hx.q, hx.r);
      path(i); ctx.fillStyle = TERRAIN_COLOR[hx.t]; ctx.fill();
      const tx = texture(hx.t, hx.q, hx.r);
      if (tx) { // téměř celý obrázek; malý posun a zrcadlení podle polohy dílku, aby stejné dílky nevypadaly stejně
        const { img, h } = tx, W0 = img.naturalWidth, s = W0 * 0.96, ox = (h % 3) / 2 * (W0 - s), oy = ((h >> 3) % 3) / 2 * (W0 - s);
        ctx.save(); ctx.clip(); ctx.translate(c.x, c.y); if (h & 1) ctx.scale(-1, 1);
        ctx.drawImage(img, ox, oy, s, s, -1.01, -1.01, 2.02, 2.02);
        ctx.restore();
      }
      ctx.strokeStyle = 'rgba(29,42,56,.7)'; ctx.lineWidth = 0.05; path(i); ctx.stroke();
      if (!tx) glyph(hx.t, c.x, c.y - 0.42);
      if (hx.n) token(c.x, c.y + 0.18, hx.n);
      if (B.targets && B.targets.h && B.targets.h.includes(i)) { path(i); ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.08; ctx.stroke(); }
    });
    // bouře
    if (v.storm >= 0) {
      const hx = v.map.hexes[v.storm], c = hexXY(hx.q, hx.r), st = sprite('boure');
      if (st) ctx.drawImage(st, c.x - 0.62, c.y - 0.75, 1.24, 1.24); else cloud(c.x, c.y + 0.05);
    }
    // cesty
    for (const e of Object.keys(v.roads)) {
      const ed = g.E[e], a = g.V[ed.a], b = g.V[ed.b];
      const ax = a.x + (b.x - a.x) * 0.16, ay = a.y + (b.y - a.y) * 0.16, bx = b.x + (a.x - b.x) * 0.16, by = b.y + (a.y - b.y) * 0.16;
      road(ax, ay, bx, by, v.roads[e]);
    }
    // nabídka hran
    if (B.targets && B.targets.e) for (const e of B.targets.e) {
      const ed = g.E[e], a = g.V[ed.a], b = g.V[ed.b];
      ctx.beginPath(); ctx.moveTo(a.x + (b.x - a.x) * 0.2, a.y + (b.y - a.y) * 0.2); ctx.lineTo(b.x + (a.x - b.x) * 0.2, b.y + (a.y - b.y) * 0.2);
      ctx.strokeStyle = INK; ctx.lineWidth = 0.2; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.12; ctx.stroke();
    }
    // stavby
    for (const id of Object.keys(v.bld)) { const b = v.bld[id], p = g.V[id]; house(p.x, p.y, b.p, b.c); }
    // nabídka vrcholů
    if (B.targets && B.targets.v) for (const id of B.targets.v) {
      const p = g.V[id];
      ctx.beginPath(); ctx.arc(p.x, p.y, v.bld[id] ? 0.36 : 0.14, 0, 7);
      if (!v.bld[id]) { ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill(); }
      ctx.strokeStyle = v.bld[id] ? '#fff' : INK; ctx.lineWidth = v.bld[id] ? 0.08 : 0.05; ctx.stroke();
    }
    // značka poslední stavby
    if (B.mark) {
      const m = B.mark; let x, y;
      if (g.V[m]) { x = g.V[m].x; y = g.V[m].y; } else if (g.E[m]) { x = (g.V[g.E[m].a].x + g.V[g.E[m].b].x) / 2; y = (g.V[g.E[m].a].y + g.V[g.E[m].b].y) / 2; }
      if (x !== undefined) { ctx.beginPath(); ctx.arc(x, y, 0.42, 0, 7); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 0.05; ctx.setLineDash([0.12, 0.1]); ctx.stroke(); ctx.setLineDash([]); }
    }
  }
  // žeton čísla: pergamenový kotouč bez lemu, patkové číslo; 6 a 8 (padají nejčastěji) červeně a větší
  function token(x, y, n) {
    const hot = n === 6 || n === 8, r = 0.33, ink = hot ? '#a3231b' : '#2e2214';
    const pg = ctx.createRadialGradient(x - 0.08, y - 0.1, 0.02, x, y, r);
    pg.addColorStop(0, '#fbf3dc'); pg.addColorStop(1, '#ead9ae');
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 0.1 * B.cam.k * dpr; ctx.shadowOffsetY = 0.03 * B.cam.k * dpr;
    ctx.beginPath(); ctx.arc(x, y, r * 0.9, 0, 7); ctx.fillStyle = pg; ctx.fill();
    ctx.restore();
    ctx.font = `700 ${hot ? 0.38 : 0.33}px Georgia, 'Noto Serif', 'Times New Roman', serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = ink; ctx.fillText(String(n), x, y + 0.01);
  }
  function text(t, x, y, size, color) {
    ctx.font = `700 ${size}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = color; ctx.fillText(t, x, y);
  }
  function port(pt) {
    const g = B.g, e = g.E[pt.e], a = g.V[e.a], b = g.V[e.b], hx = B.v.map.hexes[e.hex[0]], c = hexXY(hx.q, hx.r);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(mx - c.x, my - c.y), ux = (mx - c.x) / d, uy = (my - c.y) / d;
    const px = mx + ux * 0.86, py = my + uy * 0.86;
    // dvě lávky od rohů hrany k přístavu
    const jet = sprite('lavka');
    for (const v of [a, b]) {
      const sx = v.x + (mx - v.x) * 0.25, sy = v.y + (my - v.y) * 0.25, ex = px + (v.x - mx) * 0.3, ey = py + (v.y - my) * 0.3;
      const ang = Math.atan2(ey - sy, ex - sx), len = Math.hypot(ex - sx, ey - sy);
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
      ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 0.06 * B.cam.k * dpr; ctx.shadowOffsetY = 0.03 * B.cam.k * dpr;
      if (jet) ctx.drawImage(jet, -0.02, -0.08, len + 0.04, 0.16);
      else {
        ctx.fillStyle = '#6e4a26'; ctx.fillRect(0, -0.065, len, 0.13);
        ctx.shadowColor = 'transparent'; ctx.strokeStyle = 'rgba(30,18,8,.65)'; ctx.lineWidth = 0.012;
        for (let t = 0.07; t < len; t += 0.07) { ctx.beginPath(); ctx.moveTo(t, -0.065); ctx.lineTo(t, 0.065); ctx.stroke(); }
      }
      ctx.restore();
    }
    // kormidlo se žetonem suroviny (2:1) nebo kotvou (3:1)
    const r = 0.36, wheel = sprite('kormidlo'), tok = sprite(pt.type === 'any' ? 'res-any' : 'res-' + pt.type);
    if (wheel && tok) {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 0.1 * B.cam.k * dpr; ctx.shadowOffsetY = 0.04 * B.cam.k * dpr;
      ctx.drawImage(wheel, px - r * 1.45, py - r * 1.45, r * 2.9, r * 2.9); ctx.restore();
      ctx.drawImage(tok, px - r * 0.82, py - r * 0.82, r * 1.64, r * 1.64);
    } else {
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 0.12 * B.cam.k * dpr; ctx.shadowOffsetY = 0.04 * B.cam.k * dpr;
      ctx.beginPath(); ctx.arc(px, py, r, 0, 7); ctx.fillStyle = '#7a5520'; ctx.fill(); ctx.restore();
      ctx.beginPath(); ctx.arc(px, py, r * 0.84, 0, 7); ctx.fillStyle = pt.type === 'any' ? '#1f4f6e' : RES_COLOR[pt.type]; ctx.fill();
      if (pt.type === 'any') anchor(px, py - 0.02, 0.2);
    }
    // štítek s poměrem pod bójí
    const lx = px, ly = py + r * 1.22, w = 0.42, hgt = 0.2;
    ctx.beginPath(); ctx.roundRect ? ctx.roundRect(lx - w / 2, ly - hgt / 2, w, hgt, 0.05) : ctx.rect(lx - w / 2, ly - hgt / 2, w, hgt);
    ctx.fillStyle = '#2b1d10'; ctx.fill(); ctx.strokeStyle = '#d8b25a'; ctx.lineWidth = 0.02; ctx.stroke();
    ctx.font = "700 0.155px Georgia, 'Noto Serif', serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f4e3b5';
    ctx.fillText(pt.type === 'any' ? '3:1' : '2:1', lx, ly + 0.005);
  }
  function anchor(x, y, s) { // kotva pro přístav 3:1
    ctx.save(); ctx.strokeStyle = '#f4e3b5'; ctx.fillStyle = '#f4e3b5'; ctx.lineWidth = s * 0.16; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(x, y - s * 0.62, s * 0.14, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.48); ctx.lineTo(x, y + s * 0.62); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - s * 0.32, y - s * 0.22); ctx.lineTo(x + s * 0.32, y - s * 0.22); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y + s * 0.05, s * 0.58, 0.25 * Math.PI, 0.75 * Math.PI); ctx.stroke();
    ctx.restore();
  }
  // cesta: trám v barvě hráče s tmavým obrysem, světlou hranou a stínem
  function road(ax, ay, bx, by, p) {
    const col = pc(p), img = tinted('fig-cesta', col);
    if (img) {
      const len = Math.hypot(bx - ax, by - ay) + 0.06, w = 0.11;
      ctx.save(); ctx.translate((ax + bx) / 2, (ay + by) / 2); ctx.rotate(Math.atan2(by - ay, bx - ax));
      ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 0.07 * B.cam.k * dpr; ctx.shadowOffsetY = 0.03 * B.cam.k * dpr;
      ctx.drawImage(img, -len / 2, -w / 2, len, w); ctx.restore();
      return;
    }
    ctx.save();
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 0.09 * B.cam.k * dpr; ctx.shadowOffsetY = 0.035 * B.cam.k * dpr;
    ctx.strokeStyle = '#1b130b'; ctx.lineWidth = 0.13; ctx.stroke();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = col; ctx.lineWidth = 0.085; ctx.stroke();
    // světlá horní hrana a tmavší spodní, aby trám působil plasticky
    const nx = -(by - ay), ny = bx - ax, l = Math.hypot(nx, ny) || 1, ox = nx / l * 0.02, oy = ny / l * 0.02;
    const up = oy < 0 ? 1 : -1;
    ctx.beginPath(); ctx.moveTo(ax + ox * up, ay + oy * up); ctx.lineTo(bx + ox * up, by + oy * up);
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.022; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(ax - ox * up, ay - oy * up); ctx.lineTo(bx - ox * up, by - oy * up);
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 0.022; ctx.stroke();
    ctx.restore();
  }
  function house(x, y, p, city) {
    const fig = tinted(city ? 'fig-mesto' : 'fig-osada', pc(p));
    if (fig) {
      const s = city ? 0.95 : 0.7;
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 0.1 * B.cam.k * dpr; ctx.shadowOffsetY = 0.04 * B.cam.k * dpr;
      ctx.drawImage(fig, x - s / 2, y - s * 0.62, s, s); ctx.restore();
      return;
    }
    const s = city ? 0.3 : 0.21;
    ctx.beginPath();
    if (city) { ctx.moveTo(x - s, y + s * 0.8); ctx.lineTo(x - s, y - s * 0.2); ctx.lineTo(x - s * 0.1, y - s * 0.2); ctx.lineTo(x - s * 0.1, y - s * 0.7); ctx.lineTo(x + s * 0.45, y - s * 1.25); ctx.lineTo(x + s, y - s * 0.7); ctx.lineTo(x + s, y + s * 0.8); }
    else { ctx.moveTo(x - s, y + s * 0.85); ctx.lineTo(x - s, y - s * 0.15); ctx.lineTo(x, y - s * 1.05); ctx.lineTo(x + s, y - s * 0.15); ctx.lineTo(x + s, y + s * 0.85); }
    ctx.closePath();
    ctx.fillStyle = pc(p); ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 0.055; ctx.stroke();
  }
  function cloud(x, y) {
    ctx.fillStyle = 'rgba(40,48,66,.92)'; ctx.strokeStyle = '#11161f'; ctx.lineWidth = 0.04;
    ctx.beginPath();
    ctx.arc(x - 0.25, y + 0.02, 0.2, 0, 7); ctx.arc(x, y - 0.1, 0.27, 0, 7); ctx.arc(x + 0.27, y + 0.02, 0.2, 0, 7); ctx.rect(x - 0.25, y, 0.52, 0.22);
    ctx.fill();
    ctx.beginPath(); ctx.moveTo(x + 0.04, y + 0.2); ctx.lineTo(x - 0.1, y + 0.45); ctx.lineTo(x + 0.02, y + 0.45); ctx.lineTo(x - 0.06, y + 0.68); ctx.lineTo(x + 0.16, y + 0.36); ctx.lineTo(x + 0.04, y + 0.36); ctx.lineTo(x + 0.14, y + 0.2); ctx.closePath();
    ctx.fillStyle = '#ffd84a'; ctx.fill(); ctx.stroke();
  }
  // jednoduché značky dílků
  function glyph(t, x, y) {
    ctx.lineWidth = 0.035; ctx.strokeStyle = 'rgba(29,42,56,.6)';
    const tri = (cx, cy, w, hh, col) => { ctx.beginPath(); ctx.moveTo(cx - w, cy + hh); ctx.lineTo(cx, cy - hh); ctx.lineTo(cx + w, cy + hh); ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.stroke(); };
    if (t === 'forest') { tri(x - 0.22, y + 0.04, 0.15, 0.2, '#1f6b3a'); tri(x + 0.22, y + 0.04, 0.15, 0.2, '#1f6b3a'); tri(x, y - 0.02, 0.18, 0.26, '#2a7d47'); }
    else if (t === 'claypit') { ctx.fillStyle = '#9c3f25'; for (const [dx, dy] of [[-0.25, 0.06], [0.01, 0.06], [-0.12, -0.08], [0.14, -0.08]]) { ctx.beginPath(); ctx.rect(x + dx, y + dy, 0.24, 0.12); ctx.fill(); ctx.stroke(); } }
    else if (t === 'quarry') { tri(x - 0.13, y + 0.02, 0.24, 0.24, '#6f7782'); tri(x + 0.18, y + 0.07, 0.18, 0.18, '#5d6570'); ctx.beginPath(); ctx.moveTo(x - 0.21, y - 0.08); ctx.lineTo(x - 0.13, y - 0.22); ctx.lineTo(x - 0.05, y - 0.08); ctx.closePath(); ctx.fillStyle = '#f2f4f6'; ctx.fill(); }
    else if (t === 'field') { ctx.strokeStyle = '#a87d12'; ctx.lineWidth = 0.05; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(x + i * 0.11, y + 0.2); ctx.lineTo(x + i * 0.11 + 0.04, y - 0.16); ctx.stroke(); } }
    else if (t === 'pasture') { for (const [dx, dy] of [[-0.17, 0.04], [0.17, -0.02]]) { ctx.beginPath(); ctx.ellipse(x + dx, y + dy, 0.15, 0.1, 0, 0, 7); ctx.fillStyle = '#f6f3ea'; ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.arc(x + dx + 0.14, y + dy - 0.03, 0.055, 0, 7); ctx.fillStyle = INK; ctx.fill(); } }
    else { ctx.strokeStyle = 'rgba(120,100,60,.7)'; ctx.lineWidth = 0.04; for (const dy of [0.3, 0.5]) { ctx.beginPath(); ctx.moveTo(x - 0.3, y + dy); ctx.quadraticCurveTo(x - 0.15, y + dy - 0.12, x, y + dy); ctx.quadraticCurveTo(x + 0.15, y + dy + 0.12, x + 0.3, y + dy); ctx.stroke(); } }
  }

  // ---------- vstup ----------
  // Klepnutí vs. posun: rozhoduje vzdálenost od místa dotyku (ne součet drobných pohybů prstu),
  // klepnutí se vyhodnotí v místě dotyku. SLOP je tolerance chvění prstu v CSS px.
  const SLOP = 16, pts = new Map();
  let start = null, panning = false, pinch = 0;
  cv.addEventListener('pointerdown', e => {
    if (e.isPrimary) pts.clear(); // první prst: zapomenout ztracené dotyky z dřívějška
    try { cv.setPointerCapture(e.pointerId); } catch {}
    pts.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
    if (pts.size === 1) { start = { x: e.offsetX, y: e.offsetY }; panning = false; }
    else { start = null; pinch = 0; } // druhý prst = zoom, klepnutí se už nevyhodnotí
  });
  cv.addEventListener('pointermove', e => {
    const p = pts.get(e.pointerId);
    if (!p) return;
    const dx = e.offsetX - p.x, dy = e.offsetY - p.y;
    p.x = e.offsetX; p.y = e.offsetY;
    if (pts.size === 1) {
      if (!panning && start && Math.hypot(e.offsetX - start.x, e.offsetY - start.y) > SLOP) panning = true;
      if (panning) { B.cam.x -= dx / B.cam.k; B.cam.y -= dy / B.cam.k; B.moved = true; B.draw(); }
    } else if (pts.size === 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) zoom(d / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = d;
    }
  });
  const up = e => {
    const had = pts.delete(e.pointerId);
    if (!pts.size) pinch = 0;
    if (had && e.type === 'pointerup' && !panning && start && !pts.size) tap(start.x, start.y);
    if (!pts.size) start = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up); cv.addEventListener('lostpointercapture', up);
  cv.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, e.offsetX, e.offsetY); }, { passive: false });
  function zoom(f, px, py) {
    const w = toWorld(px, py), k = Math.max(B.minK || 10, Math.min((B.minK || 10) * 6, B.cam.k * f));
    B.cam.k = k; B.cam.x = w.x - (px - W / 2) / k; B.cam.y = w.y - (py - H / 2) / k; B.moved = true; B.draw();
  }
  // klepnutí: nejbližší nabízené místo v dosahu (zásahová plocha je větší než kresba)
  function tap(px, py) {
    const t = B.targets, g = B.g;
    if (!t || !g) return;
    const w = toWorld(px, py), reach = Math.max(0.42, 30 / B.cam.k);
    let best = null, bd = reach;
    for (const id of t.v || []) { const d = Math.hypot(g.V[id].x - w.x, g.V[id].y - w.y); if (d < bd) { bd = d; best = { type: 'v', id }; } }
    for (const id of t.e || []) { const e = g.E[id], d = Math.hypot((g.V[e.a].x + g.V[e.b].x) / 2 - w.x, (g.V[e.a].y + g.V[e.b].y) / 2 - w.y); if (d < bd) { bd = d; best = { type: 'e', id }; } }
    if (!best) for (const i of t.h || []) { const hx = B.v.map.hexes[i], c = hexXY(hx.q, hx.r); if (Math.hypot(c.x - w.x, c.y - w.y) < 0.87) best = { type: 'h', id: i }; }
    onPick(best); // null = klepnutí mimo nabízená místa
  }
  new ResizeObserver(B.resize).observe(cv);
  return B;
}
