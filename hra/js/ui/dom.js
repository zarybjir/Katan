// Drobné pomůcky pro DOM.
export function h(tag, a, ...kids) {
  const e = document.createElement(tag);
  for (const k in a || {}) {
    const v = a[k];
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (k === 'value') e.value = v;
    else if (v === true) e.setAttribute(k, '');
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat(3)) if (c != null && c !== false) e.append(c);
  return e;
}
export const clear = e => { while (e.firstChild) e.firstChild.remove(); return e; };
export const SYMS = ['●', '■', '▲', '◆', '✚', '★', '✖', '♥']; // značka ke každé barvě palety (rozlišení i bez barev)
import { COLORS, COLOR_LIGHT } from '../data.js';
// barvy hráčů v běžící hře: index hráče → index palety (nastavuje herní obrazovka z pohledu)
let MAP = [];
export const setColors = list => { MAP = Array.isArray(list) ? list : []; };
const ix = p => (MAP[p] ?? p) % COLORS.length;
export const pc = p => COLORS[ix(p)];
export const ps = p => SYMS[ix(p)];
export const plight = p => COLOR_LIGHT[ix(p)];


// modální okno; vrací funkci pro zavření
let stack = [];
export function modal(title, body, o = {}) {
  const close = () => { wrap.remove(); stack = stack.filter(x => x !== api); };
  const box = h('div', { class: 'box' }, title && h('h2', null, title), body);
  const wrap = h('div', { class: 'modal' + (o.cls ? ' ' + o.cls : ''), onclick: e => { if (e.target === wrap && !o.sticky) close(); } }, box);
  const api = { close, sticky: !!o.sticky, key: o.key };
  document.body.append(wrap); stack.push(api);
  return api;
}
export const topModal = () => stack[stack.length - 1];
export const closeModals = key => { for (const m of stack.slice()) if (!key || m.key === key) m.close(); };
export function toast(text) {
  const t = h('div', { class: 'toast' }, text);
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}
