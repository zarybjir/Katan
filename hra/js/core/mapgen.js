// Generování mapy ze seedu: tvar ostrova, dílky, čísla, přístavy.
import { DIRS, hid, graph } from './hex.js';
import { next, shuffle } from './rng.js';
import { MAPSIZE, NUMS, RES } from '../data.js';

// ---------- tvar ----------
function shape(R, n) {
  const set = new Map([[hid(0, 0), { q: 0, r: 0 }]]);
  while (set.size < n) {
    const fr = new Map();
    for (const h of set.values()) for (const [dq, dr] of DIRS) {
      const k = hid(h.q + dq, h.r + dr);
      if (set.has(k)) continue;
      const f = fr.get(k) || { q: h.q + dq, r: h.r + dr, w: 0 };
      f.w++; fr.set(k, f);
    }
    const list = [...fr.values()];
    let tot = 0; for (const f of list) tot += f.w * f.w * f.w; // kompaktní tvar: víc sousedů = větší šance
    let x = next(R) * tot, ch = list[0];
    for (const f of list) { x -= f.w * f.w * f.w; if (x <= 0) { ch = f; break; } }
    set.set(hid(ch.q, ch.r), { q: ch.q, r: ch.r });
  }
  return [...set.values()];
}

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

export function genMap(seed, players) {
  const R = { rng: seed | 0 };
  const n = MAPSIZE[players] || MAPSIZE[4];
  const hexes = shape(R, n);
  const g = graph(hexes);
  // dílky: pustiny + rovnoměrně pět druhů
  const waste = Math.max(1, Math.round(n / 18));
  const kinds = shuffle(R, ['forest', 'quarry', 'field', 'fishery', 'mine']);
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
