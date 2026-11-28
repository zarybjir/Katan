// Animace: hod kostkami, rozdávání surovin z dílků, suroviny do banky a z banky. Jsou jen vizuální – stav hry se
// mění hned, animace se dají vypnout v nastavení a kostky přeskočit klepnutím.
import { h, modal } from './dom.js';
import { icon } from './icons.js';
import { cardEl } from './trade.js';
import { graph } from '../core/hex.js';
import { TERRAIN } from '../data.js';

export const ANIM_DEF = { dice: true, deal: true, burn: true, banner: true, sound: true };
const SPEED_DEF = 'mid';
// klíč burn zůstává kvůli uloženému nastavení; dnes znamená suroviny letící do banky a z ní
export const ANIM_NAME = { dice: 'Hod kostkami', deal: 'Rozdávání surovin z dílků', burn: 'Pohyb surovin (banka, obchod, krádež)', banner: 'Hlášky uprostřed obrazovky', sound: 'Zvuky' };

let fx = null;
const layer = () => fx || (fx = document.body.appendChild(h('div', { id: 'fx' })));
const wait = ms => new Promise(r => setTimeout(r, ms));
// rychlost letu surovin (volí se v nastavení): délka letu v ms; rozestup je pětina letu
export const SPEEDS = { fast: 1000, mid: 1700, slow: 2800 };
export const SPEED_NAME = { fast: 'Rychle', mid: 'Středně', slow: 'Pomalu' };
export let FLY = SPEEDS.mid, GAP = FLY / 5;
export function setSpeed(k) { FLY = SPEEDS[k] || SPEEDS.mid; GAP = FLY / 5; }
export const DICE_ROLL = 1000, DICE_SHOW = 2100; // kostky se točí 1 s, výsledek je vidět do 2,1 s

// ---------- kostky ----------
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
function face(el, n) {
  el.replaceChildren(...Array.from({ length: 9 }, (_, i) => h('i', { class: PIPS[n].includes(i + 1) ? 'on' : '' })));
}
export function dice(d) {
  document.querySelectorAll('.dice-fx').forEach(e => e.remove()); // předchozí hod (rychlí boti) zmizí hned
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
  }, DICE_ROLL);
  setTimeout(() => { box.classList.add('out'); setTimeout(end, 250); }, DICE_SHOW);
}

// ---------- přelet ikonky ----------
const center = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
const live = el => el && el.isConnected; // obrazovka se mezitím mohla změnit (konec hry, odchod)
function fly(kind, from, to, delay, demo) {
  const ic = icon(kind, 30);
  ic.classList.add('fly'); if (demo) ic.classList.add('demo');
  ic.style.left = from.x - 15 + 'px'; ic.style.top = from.y - 15 + 'px'; ic.style.opacity = '0';
  layer().append(ic);
  const dx = to.x - from.x, dy = to.y - from.y;
  const an = ic.animate([
    { transform: 'translate(0,0) scale(.6)', opacity: 0 },
    { transform: 'translate(0,-14px) scale(1.15)', opacity: 1, offset: .12 },
    { transform: `translate(${dx}px,${dy}px) scale(.8)`, opacity: 1 },
  ], { duration: FLY, delay, easing: 'ease-in-out', fill: 'forwards' });
  an.onfinish = () => ic.remove();
  return an.finished.catch(() => {});
}
function pulse(el, delay, ding) {
  if (!el) return;
  setTimeout(() => ding && ding(), delay);
  setTimeout(() => el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 250 }), delay);
}

// ---------- rozdávání ----------
// srcOf(p, r) → body na obrazovce (dílky, které surovinu daly), dst(p, r) → prvek, kam karta letí
export function deal(gains, srcOf, dst, ding) {
  let k = 0;
  for (const { p, res } of gains) for (const r of Object.keys(res)) for (let i = 0; i < res[r]; i++) {
    const to = dst(p, r);
    if (!live(to)) continue;
    const src = srcOf(p, r);
    if (!src.length) continue;
    const from = src[i % src.length], delay = GAP * k++;
    fly(r, from, center(to), delay);
    pulse(to, delay + FLY, ding && (() => ding(r)));
  }
}

// ---------- banka ----------
// kinds: seznam surovin (nebo 'cards' u skrytých karet); toBank = z hráče do banky, jinak z banky k hráči
export function bankFlow(el, kinds, toBank, delay0 = 0, ding) {
  const bank = document.getElementById('bank');
  if (!live(el) || !live(bank) || !kinds.length) return;
  const a = center(el), b = center(bank);
  kinds.forEach((k, i) => {
    const d = delay0 + GAP * i;
    fly(k, toBank ? a : b, toBank ? b : a, d);
    pulse(toBank ? bank : el, d + FLY, ding && (() => ding(k)));
  });
}
// přelet surovin mezi dvěma hráči (obchod, krádež)
export function between(a, b, kinds, delay0 = 0, ding) {
  if (!live(a) || !live(b) || !kinds.length) return;
  const p = center(a), q = center(b);
  kinds.forEach((k, i) => { const d = delay0 + GAP * i; fly(k, p, q, d); pulse(b, d + FLY, ding && (() => ding(k))); });
}

// ---------- odhalení karty výpravy ----------
export function cardShow(card, title) {
  const el = h('div', { class: 'card-show' }, cardEl(card, h('div', { class: 'vwho' }, title)));
  (document.getElementById('bn') || document.body.appendChild(h('div', { id: 'bn' }))).append(el);
  el.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.6) rotateY(80deg)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotateY(0)', offset: .15 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .85 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.9)' }], { duration: 2400, fill: 'forwards' })
    .finished.catch(() => {}).then(() => el.remove());
}

// ---------- hlášky uprostřed obrazovky ----------
// zobrazí se na 2 s; další hláška počká, ve frontě zůstanou nejvýš dvě
const queue = [];
let showing = false;
export function banner(text) {
  if (queue.length >= 2) queue.shift();
  queue.push(text);
  if (!showing) nextBanner();
}
function nextBanner() {
  const text = queue.shift();
  if (!text) { showing = false; return; }
  showing = true;
  const el = h('div', { class: 'banner' }, text);
  (document.getElementById('bn') || document.body.appendChild(h('div', { id: 'bn' }))).append(el); // pod dialogy, aby je hláška nezakryla
  el.animate([{ opacity: 0, transform: 'translate(-50%,-50%) scale(.85)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .1 }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)', offset: .85 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.95)' }], { duration: 2000, fill: 'forwards' })
    .finished.catch(() => {}).then(() => { el.remove(); nextBanner(); });
}
export const expand = res => Object.keys(res || {}).flatMap(r => Array(res[r]).fill(r));

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
  const bd = document.getElementById('board');
  if (!out.length && bd) { const r2 = bd.getBoundingClientRect(); out.push({ x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 }); }
  return out;
}

// ---------- nastavení ----------
export function animDialog(set, save) {
  const rows = Object.keys(ANIM_DEF).map(k => {
    const cb = h('input', { type: 'checkbox', 'data-anim': k, checked: set[k] !== false, onchange: () => { set[k] = cb.checked; save(); } });
    return h('label', { class: 'toggle' }, cb, h('span', null, ANIM_NAME[k]));
  });
  // rychlost letu: po změně přeletí ukázková surovina nad spodní lištou
  setSpeed(set.speed || SPEED_DEF);
  const sp = h('div', { class: 'row' }, Object.keys(SPEEDS).map(k => h('button', { class: 'btn small' + ((set.speed || SPEED_DEF) === k ? ' on' : ''), 'data-speed': k, onclick: e => {
    set.speed = k; save(); setSpeed(k);
    sp.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === e.currentTarget));
    const bar = document.getElementById('bar'), y = bar ? bar.getBoundingClientRect().top - 24 : innerHeight * 0.8;
    fly(['wood', 'stone', 'grain', 'sheep', 'brick'][Math.floor(Math.random() * 5)], { x: 30, y }, { x: innerWidth - 30, y }, 0, true);
  } }, SPEED_NAME[k])));
  modal('Animace a zvuky', h('div', { class: 'col' }, rows, h('label', null, 'Rychlost letu surovin', sp), h('p', { class: 'dim' }, 'Animace jsou jen pro přehled; hra pokračuje i během nich. Kostky lze přeskočit klepnutím.')));
}
