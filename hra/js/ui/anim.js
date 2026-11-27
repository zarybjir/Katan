// Animace: hod kostkami, rozdávání surovin, pálení karet. Jsou jen vizuální – stav hry se
// mění hned, animace se dají vypnout v nastavení a kostky přeskočit klepnutím.
import { h, modal } from './dom.js';
import { icon } from './icons.js';
import { graph } from '../core/hex.js';
import { TERRAIN } from '../data.js';

export const ANIM_DEF = { dice: true, deal: true, burn: true };
export const ANIM_NAME = { dice: 'Hod kostkami', deal: 'Rozdávání surovin', burn: 'Pálení odhozených karet' };

let fx = null;
const layer = () => fx || (fx = document.body.appendChild(h('div', { id: 'fx' })));
const wait = ms => new Promise(r => setTimeout(r, ms));

// ---------- kostky ----------
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
function face(el, n) {
  el.replaceChildren(...Array.from({ length: 9 }, (_, i) => h('i', { class: PIPS[n].includes(i + 1) ? 'on' : '' })));
}
export function dice(d) {
  const a = h('div', { class: 'die' }), b = h('div', { class: 'die' });
  const box = h('div', { class: 'dice-fx', onclick: () => end() }, a, b, h('div', { class: 'sum' }));
  let done = false, t;
  const end = () => { if (done) return; done = true; clearInterval(t); box.remove(); };
  layer().append(box);
  t = setInterval(() => { face(a, 1 + Math.floor(Math.random() * 6)); face(b, 1 + Math.floor(Math.random() * 6)); }, 70);
  face(a, d[0]); face(b, d[1]);
  setTimeout(() => {
    clearInterval(t); face(a, d[0]); face(b, d[1]);
    box.classList.add('stop'); box.lastChild.textContent = String(d[0] + d[1]);
  }, 650);
  setTimeout(() => { box.classList.add('out'); setTimeout(end, 250); }, 1350);
}

// ---------- přelet ikonky ----------
const center = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
function fly(kind, from, to, delay) {
  const ic = icon(kind, 30);
  ic.classList.add('fly');
  ic.style.left = from.x - 15 + 'px'; ic.style.top = from.y - 15 + 'px'; ic.style.opacity = '0';
  layer().append(ic);
  const dx = to.x - from.x, dy = to.y - from.y;
  const an = ic.animate([
    { transform: 'translate(0,0) scale(.6)', opacity: 0 },
    { transform: 'translate(0,-14px) scale(1.15)', opacity: 1, offset: .2 },
    { transform: `translate(${dx}px,${dy}px) scale(.8)`, opacity: 1 },
  ], { duration: 650, delay, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'forwards' });
  an.onfinish = () => ic.remove();
  return an.finished.catch(() => {});
}
function pulse(el, delay) {
  if (!el) return;
  setTimeout(() => el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 250 }), delay);
}

// ---------- rozdávání ----------
// srcOf(p, r) → body na obrazovce (dílky, které surovinu daly), dst(p, r) → prvek, kam karta letí
export function deal(gains, srcOf, dst) {
  let k = 0;
  for (const { p, res } of gains) for (const r of Object.keys(res)) for (let i = 0; i < res[r]; i++) {
    const src = srcOf(p, r), to = dst(p, r);
    if (!to) continue;
    const from = src[i % src.length], delay = 120 * k++;
    fly(r, from, center(to), delay);
    pulse(to, delay + 650);
  }
}

// ---------- pálení ----------
export function burn(el, n) {
  if (!el) return;
  const c = center(el);
  for (let i = 0; i < n; i++) {
    const card = h('div', { class: 'burn' }, h('div', { class: 'card-b' }), h('span', { class: 'flame' }, '🔥'));
    card.style.left = c.x - 14 + (i - (n - 1) / 2) * 18 + 'px'; card.style.top = c.y - (c.y > innerHeight / 3 ? 30 : 0) + 'px';
    layer().append(card);
    const rot = (i % 2 ? 1 : -1) * (8 + i * 3), d = 110 * i, up = c.y > innerHeight / 3 ? -1 : 1; // u horního okraje karta padá dolů
    const fy = k => (up < 0 ? -k : 40 - (k - 30) * 0.6); // plamen vždy stoupá
    card.firstChild.animate([
      { transform: 'translateY(0) rotate(0)', filter: 'none', opacity: 1 },
      { transform: `translateY(${26 * up}px) rotate(${rot}deg)`, filter: 'none', opacity: 1, offset: .3 },
      { transform: `translateY(${34 * up}px) rotate(${rot}deg) scale(.9)`, filter: 'brightness(.35) sepia(1)', opacity: 1, offset: .7 },
      { transform: `translateY(${40 * up}px) rotate(${rot}deg) scale(.4)`, filter: 'brightness(.1)', opacity: 0 },
    ], { duration: 1300, delay: d, easing: 'ease-in', fill: 'forwards' });
    const an = card.lastChild.animate([
      { transform: 'translateY(0) scale(.2)', opacity: 0 },
      { transform: `translateY(${fy(30)}px) scale(.5)`, opacity: 0, offset: .25 },
      { transform: `translateY(${fy(46)}px) scale(1.4)`, opacity: 1, offset: .55 },
      { transform: `translateY(${fy(70)}px) scale(.6)`, opacity: 0 },
    ], { duration: 1300, delay: d, fill: 'forwards' });
    an.onfinish = () => card.remove();
  }
}

// Zdroj surovin: dílky s hozeným číslem kolem staveb hráče; jinak střed mapy (banka, karta zásoby).
export function sources(v, board, sum, p, r) {
  const g = graph(v.map.hexes), out = [];
  if (sum) v.map.hexes.forEach((hx, i) => {
    if (hx.n !== sum || i === v.storm || TERRAIN[hx.t] !== r) return;
    if (g.hv[i].some(id => v.bld[id] && v.bld[id].p === p)) out.push(board.px('h', i));
  });
  if (!out.length && !sum && v.phase === 'setup') {
    // úvodní osada: dílky kolem poslední stavby hráče
    const last = Object.keys(v.bld).filter(id => v.bld[id].p === p).pop();
    if (last) g.V[last].hex.forEach(i => { if (TERRAIN[v.map.hexes[i].t] === r) out.push(board.px('h', i)); });
  }
  if (!out.length) { const r2 = document.getElementById('board').getBoundingClientRect(); out.push({ x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 }); }
  return out;
}

// ---------- nastavení ----------
export function animDialog(set, save) {
  const rows = Object.keys(ANIM_DEF).map(k => {
    const cb = h('input', { type: 'checkbox', 'data-anim': k, checked: set[k] !== false, onchange: () => { set[k] = cb.checked; save(); } });
    return h('label', { class: 'toggle' }, cb, h('span', null, ANIM_NAME[k]));
  });
  modal('Animace', h('div', { class: 'col' }, rows, h('p', { class: 'dim' }, 'Animace jsou jen pro přehled; hra pokračuje i během nich. Kostky lze přeskočit klepnutím.')));
}
