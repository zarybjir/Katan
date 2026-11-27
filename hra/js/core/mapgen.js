// Generování mapy ze seedu: tvar ostrova, dílky, čísla, přístavy.
import { DIRS, hid, graph, hexXY } from './hex.js';
import { next, shuffle } from './rng.js';
import { MAPSIZE, NUMS, SPIRAL, RES, PORTS_ANY, TERRAIN_SHARE } from '../data.js';

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
  // pravidelný šestiúhelník o poloměru 2 (19 dílků); pro 5–6 hráčů navíc 12 dílků třetího kruhu
  // bez rohů (31 dílků) – tvar je souměrný podle všech os
  sym: (R, n) => {
    const out = [];
    for (let q = -3; q <= 3; q++) for (let r = -3; r <= 3; r++) {
      const d = dist({ q, r }), big = [q, r, -q - r].filter(x => Math.abs(x) === 3).length;
      if (d <= 2 || (n > 22 && d === 3 && big === 1)) out.push([q, r]);
    }
    return seedSet(out);
  },
  symrand: (R, n) => SHAPES.sym(R, n), // stejný tvar, čísla náhodně
  ridge: (R, n) => grow(R, seedSet([[0, 0]]), n, 1.5, h => Math.abs(h.r) <= 1),
};
function shape(R, n, type) { return [...(SHAPES[type] || SHAPES.island)(R, n).values()]; }

// počet sousedních dvojic se stejným dílkem / s čísly 6 a 8 / se stejným číslem
export function quality(hexes) {
  const g = graph(hexes); let same = 0, hot = 0, twin = 0;
  hexes.forEach((h, i) => g.hadj[i].forEach(j => {
    if (j <= i) return;
    if (h.t === hexes[j].t) same++;
    if ((h.n === 6 || h.n === 8) && (hexes[j].n === 6 || hexes[j].n === 8)) hot++;
    if (h.n && h.n === hexes[j].n) twin++;
  }));
  return { same, hot, twin };
}
const ringOf = h => (Math.abs(h.q) + Math.abs(h.r) + Math.abs(h.q + h.r)) / 2;
// pořadí dílků ve spirále: kruhy od okraje ke středu, v kruhu podle úhlu od rohu s; dir = směr
export function spiral(hexes, s, dir) {
  const a0 = Math.PI / 6 + s * Math.PI / 3;
  const key = i => { const h = hexes[i], p = hexXY(h.q, h.r); let a = (Math.atan2(p.y, p.x) - a0) * dir; a = ((a % (2 * Math.PI)) + 2 * Math.PI + 1e-6) % (2 * Math.PI); return [-ringOf(h), a]; };
  return hexes.map((_, i) => i).sort((x, y) => { const A = key(x), B = key(y); return A[0] - B[0] || A[1] - B[1]; });
}

export function genMap(seed, players, type = 'island') {
  const R = { rng: seed | 0 };
  const hexes = shape(R, MAPSIZE[players] || MAPSIZE[4], type), n = hexes.length; // souměrná mapa má vlastní velikost
  const g = graph(hexes);
  // dílky: pustiny + rovnoměrně pět druhů
  const waste = Math.max(1, Math.round(n / 18));
  // počty krajin podle poměru TERRAIN_SHARE, zbytek po zaokrouhlení dostanou největší zlomky
  const land0 = n - waste, tot = Object.values(TERRAIN_SHARE).reduce((x, y) => x + y, 0);
  const want = Object.entries(TERRAIN_SHARE).map(([t, w]) => ({ t, x: land0 * w / tot }));
  want.forEach(o => { o.k = Math.floor(o.x); });
  let left = land0 - want.reduce((x, o) => x + o.k, 0);
  for (const o of shuffle(R, want.slice()).sort((p, q) => (q.x - q.k) - (p.x - p.k))) if (left > 0) { o.k++; left--; }
  const base = []; for (const o of want) for (let i = 0; i < o.k; i++) base.push(o.t);
  for (let i = 0; i < waste; i++) base.push('waste');
  let best = null, bs = 1e9;
  for (let k = 0; k < 40 && bs > 2; k++) {
    const t = shuffle(R, base.slice());
    hexes.forEach((h, i) => { h.t = t[i]; h.n = 0; });
    const s = quality(hexes).same;
    if (s < bs) { bs = s; best = t; }
  }
  hexes.forEach((h, i) => { h.t = best[i]; });
  // čísla: 6 a 8 spolu nesousedí, stejná čísla také ne
  const land = hexes.map((h, i) => i).filter(i => hexes[i].t !== 'waste');
  const set = nums => { hexes.forEach(h => { h.n = 0; }); land.forEach((i, j) => { hexes[i].n = nums[j]; }); };
  const good = () => { const q = quality(hexes); return !q.hot && !q.twin; };
  let done = false;
  if (type === 'sym' && SPIRAL[land.length]) { // spirála z náhodného rohu a směru
    const seq = SPIRAL[land.length];
    for (const [s, dir] of shuffle(R, [...Array(12).keys()].map(k => [k >> 1, k & 1 ? 1 : -1]))) {
      const ord = spiral(hexes, s, dir).filter(i => hexes[i].t !== 'waste');
      hexes.forEach(h => { h.n = 0; }); ord.forEach((i, j) => { hexes[i].n = seq[j]; });
      if (good()) { done = true; break; }
    }
  }
  if (!done) { // náhodně, s návratem: každé číslo se kontroluje se sousedy, které už číslo mají
    const g = graph(hexes), cnt = {};
    land.forEach((_, i) => { const n = NUMS[i % NUMS.length]; cnt[n] = (cnt[n] || 0) + 1; });
    let order;
    const clash = (i, n) => g.hadj[i].some(j => { const m = hexes[j].n; return m && (m === n || ((n === 6 || n === 8) && (m === 6 || m === 8))); });
    let steps = 0;
    const go = k => {
      if (k === order.length) return true;
      if (++steps > 4000) return false;
      const i = order[k];
      for (const n of shuffle(R, Object.keys(cnt).map(Number))) {
        if (!cnt[n] || clash(i, n)) continue;
        cnt[n]--; hexes[i].n = n;
        if (go(k + 1)) return true;
        cnt[n]++; hexes[i].n = 0;
      }
      return false;
    };
    let found = false; // několik pokusů s jiným náhodným pořadím; každý má omezený počet kroků
    for (let t = 0; t < 8 && !found; t++) {
      hexes.forEach(h => { h.n = 0; }); steps = 0;
      const c0 = { ...cnt };
      order = shuffle(R, land.slice()).sort((x, y) => g.hadj[y].length - g.hadj[x].length);
      found = go(0);
      if (!found) Object.assign(cnt, c0);
    }
    if (!found) { // velmi úzké tvary: aspoň 6 a 8 od sebe, stejná čísla co nejméně
      const nums = land.map((_, i) => NUMS[i % NUMS.length]);
      let best = null, bs = 1e9;
      for (let k = 0; k < 4000 && bs; k++) { shuffle(R, nums); set(nums); const q = quality(hexes), sc = q.hot * 10 + q.twin; if (sc < bs) { bs = sc; best = nums.slice(); } }
      set(best);
    }
  }

  // přístavy: 2:1 pro každou surovinu na rozhraní dvou dílků (hrana pobřeží, jejíž vrchol
  // sousedí se dvěma dílky), 3:1 na samotném okraji (oba vrcholy jen u jednoho dílku)
  const coast = shuffle(R, Object.values(g.E).filter(e => e.hex.length === 1).map(e => e.id).sort());
  const seam = coast.filter(e => [g.E[e].a, g.E[e].b].some(v => g.V[v].hex.length > 1));
  const tip = coast.filter(e => !seam.includes(e));
  // Přístavy nesmí sousedit: rozmístí se rovnoměrně po obvodu ostrova (vnější pobřeží jako cyklus
  // hran). Ze všech posunů se vybere ten, kde nejvíc 3:1 leží na okraji a 2:1 na rozhraní dílků.
  const isSeam = new Set(seam);
  // pobřeží jako cykly hran (vnější obvod, případně laguna uvnitř); přístavy jdou na nejdelší cyklus
  let cyc = []; {
    const at = new Map(); // vrchol → hrany pobřeží
    for (const e of coast) for (const v of [g.E[e].a, g.E[e].b]) (at.get(v) || at.set(v, []).get(v)).push(e);
    const seen = new Set();
    for (const s0 of coast.slice().sort()) {
      if (seen.has(s0)) continue;
      const c = []; let e = s0, v = g.E[s0].b;
      do { c.push(e); seen.add(e); const nx = at.get(v).find(x => x !== e && !seen.has(x)) || at.get(v).find(x => x !== e); v = g.E[nx].a === v ? g.E[nx].b : g.E[nx].a; e = nx; } while (e !== s0 && c.length <= coast.length);
      if (c.length > cyc.length) cyc = c;
    }
  }
  const n9 = PORTS_ANY + RES.length, L = cyc.length;
  let ports = [], top = -Infinity;
  const tryPos = pos => {
    const tips = pos.filter(e => !isSeam.has(e)), seams = pos.filter(e => isSeam.has(e));
    const anyE = tips.slice(0, PORTS_ANY).concat(seams.slice(0, Math.max(0, PORTS_ANY - tips.length)));
    const rest = pos.filter(e => !anyE.includes(e));
    // dva přístavy nesmí mít společný ani sousední vrchol (ani přes pevninu, třeba přes úzkou zátoku)
    const vs = pos.map(e => [g.E[e].a, g.E[e].b]);
    let touch = 0;
    for (let i = 0; i < n9; i++) for (let j = i + 1; j < n9; j++) if (vs[i].some(a => vs[j].some(b => a === b || g.V[a].adj.includes(b)))) touch++;
    const score = anyE.filter(e => !isSeam.has(e)).length + rest.filter(e => isSeam.has(e)).length - 100 * touch;
    if (score > top) {
      top = score;
      const res = shuffle(R, RES.slice());
      ports = anyE.map(e => ({ e, type: 'any' })).concat(rest.map((e, i) => ({ e, type: res[i] })));
    }
  };
  for (const o of shuffle(R, [...Array(L).keys()])) tryPos([...Array(n9).keys()].map(i => cyc[Math.floor(o + i * L / n9) % L]));
  // zvláštní tvary (úzké zátoky): když se přístavy pořád dotýkají, zkusí se drobné posuny
  for (let k = 0; k < 400 && top < 0; k++) {
    const o = Math.floor(next(R) * L);
    tryPos([...Array(n9).keys()].map(i => cyc[(Math.floor(o + i * L / n9) + Math.floor(next(R) * 3) - 1 + L) % L]));
  }
  return { hexes, ports, storm: hexes.findIndex(h => h.t === 'waste') };
}
