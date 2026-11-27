// Generování mapy ze seedu: tvar ostrova, dílky, čísla, přístavy.
import { DIRS, hid, graph } from './hex.js';
import { next, shuffle } from './rng.js';
import { MAPSIZE, NUMS, RES } from '../data.js';

// ---------- tvar ----------
const cx = h => 2 * h.q + h.r; // vodorovná poloha na mřížce vrcholů
const dist = h => (Math.abs(h.q) + Math.abs(h.r) + Math.abs(h.q + h.r)) / 2;
// Růst pevniny: přidává sousední dílky, dokud jich není n. pow určuje sevřenost (víc sousedů = větší šance).
function grow(R, set, n, pow, allowed, from) {
  while (set.size < n) {
    const fr = new Map();
    for (const h of set.values()) {
      if (from && !from(h)) continue;
      for (const [dq, dr] of DIRS) {
        const c = { q: h.q + dq, r: h.r + dr }, k = hid(c.q, c.r);
        if (set.has(k) || (allowed && !allowed(c))) continue;
        const f = fr.get(k) || { ...c, w: 0 };
        f.w++; fr.set(k, f);
      }
    }
    const list = [...fr.values()];
    if (!list.length) break;
    let tot = 0; for (const f of list) tot += f.w ** pow;
    let x = next(R) * tot, ch = list[list.length - 1];
    for (const f of list) { x -= f.w ** pow; if (x <= 0) { ch = f; break; } }
    set.set(hid(ch.q, ch.r), { q: ch.q, r: ch.r });
  }
  return set;
}
const seedSet = list => new Map(list.map(([q, r]) => [hid(q, r), { q, r }]));
const SHAPES = {
  island: (R, n) => grow(R, seedSet([[0, 0]]), n, 3),
  bays: (R, n) => grow(R, seedSet([[0, 0]]), n, 0.4),
  // prstenec: celý kruh ve vzdálenosti 2, zbytek roste ven; střed zůstává lagunou
  atoll: (R, n) => {
    const ring = [];
    for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (dist({ q, r }) === 2) ring.push([q, r]);
    return grow(R, seedSet(ring), n, 2, h => dist(h) >= 2);
  },
  // dvě pevniny, mezi nimi tři dílky v řadě
  isthmus: (R, n) => {
    const set = seedSet([[-1, 0], [0, 0], [1, 0]]);
    const half = Math.floor((n - 3) / 2);
    grow(R, set, 3 + half, 3, h => cx(h) <= -3, h => cx(h) <= -2);
    return grow(R, set, n, 3, h => cx(h) >= 3, h => cx(h) >= 2);
  },
  ridge: (R, n) => grow(R, seedSet([[0, 0]]), n, 1.5, h => Math.abs(h.r) <= 1),
};
function shape(R, n, type) { return [...(SHAPES[type] || SHAPES.island)(R, n).values()]; }

// počet sousedních dvojic se stejným dílkem / s čísly 6 a 8
export function quality(hexes) {
  const g = graph(hexes); let same = 0, hot = 0;
  hexes.forEach((h, i) => g.hadj[i].forEach(j => {
    if (j <= i) return;
    if (h.t === hexes[j].t) same++;
    if ((h.n === 6 || h.n === 8) && (hexes[j].n === 6 || hexes[j].n === 8)) hot++;
  }));
  return { same, hot };
}

export function genMap(seed, players, type = 'island') {
  const R = { rng: seed | 0 };
  const n = MAPSIZE[players] || MAPSIZE[4];
  const hexes = shape(R, n, type);
  const g = graph(hexes);
  // dílky: pustiny + rovnoměrně pět druhů
  const waste = Math.max(1, Math.round(n / 18));
  const kinds = shuffle(R, ['forest', 'quarry', 'field', 'pasture', 'claypit']);
  const base = []; for (let i = 0; i < n - waste; i++) base.push(kinds[i % 5]);
  for (let i = 0; i < waste; i++) base.push('waste');
  let best = null, bs = 1e9;
  for (let k = 0; k < 40 && bs > 2; k++) {
    const t = shuffle(R, base.slice());
    hexes.forEach((h, i) => { h.t = t[i]; h.n = 0; });
    const s = quality(hexes).same;
    if (s < bs) { bs = s; best = t; }
  }
  hexes.forEach((h, i) => { h.t = best[i]; });
  // čísla: 6 a 8 spolu nesousedí
  const land = hexes.map((h, i) => i).filter(i => hexes[i].t !== 'waste');
  const nums = land.map((_, i) => NUMS[i % NUMS.length]);
  for (let k = 0; k < 2000; k++) {
    shuffle(R, nums);
    land.forEach((i, j) => { hexes[i].n = nums[j]; });
    if (!quality(hexes).hot) break;
  }
  // přístavy na pobřeží, s rozestupem
  const coast = shuffle(R, Object.values(g.E).filter(e => e.hex.length === 1).map(e => e.id).sort());
  const want = Math.round(n / 3), used = new Set(), ports = [];
  const types = shuffle(R, RES.slice());
  for (const e of coast) {
    if (ports.length >= want) break;
    const { a, b } = g.E[e];
    if ([a, b].some(v => used.has(v) || g.V[v].adj.some(w => used.has(w)))) continue;
    used.add(a); used.add(b);
    ports.push({ e, type: ports.length % 2 ? 'any' : types[(ports.length / 2) % 5] });
  }
  return { hexes, ports, storm: hexes.findIndex(h => h.t === 'waste') };
}
