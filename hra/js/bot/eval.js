// Ohodnocení pozic pro boty. Pracuje nad pohledem hráče (ne nad stavem).
import { graph } from '../core/hex.js';
import { RES, TERRAIN, PIPS, COST } from '../data.js';

// váhy surovin podle vzácnosti na mapě
export function resWeights(v, plan) {
  const w = Object.fromEntries(RES.map(r => [r, 1]));
  if (!plan) return w;
  const sum = Object.fromEntries(RES.map(r => [r, 0]));
  for (const h of v.map.hexes) { const r = TERRAIN[h.t]; if (r) sum[r] += PIPS[h.n] || 0; }
  const avg = RES.reduce((a, r) => a + sum[r], 0) / 5;
  for (const r of RES) w[r] = Math.max(0.7, Math.min(1.5, avg / (sum[r] || 1)));
  return w;
}

// co už hráč vyrábí
export function myRes(v, p) {
  const g = graph(v.map.hexes), out = {};
  for (const id of Object.keys(v.bld)) if (v.bld[id].p === p)
    for (const h of g.V[id].hex) { const r = TERRAIN[v.map.hexes[h].t]; if (r) out[r] = (out[r] || 0) + (PIPS[v.map.hexes[h].n] || 0); }
  return out;
}

// hodnota vrcholu pro osadu
export function vertexScore(v, id, w, have) {
  const g = graph(v.map.hexes), seen = new Set();
  let s = 0;
  for (const h of g.V[id].hex) {
    const hx = v.map.hexes[h], r = TERRAIN[hx.t];
    if (!r) continue;
    s += (PIPS[hx.n] || 0) * w[r];
    if (!seen.has(r)) { seen.add(r); s += have && !have[r] ? 2 : 0.8; }
  }
  for (const pt of v.map.ports) { const e = g.E[pt.e]; if (e.a === id || e.b === id) s += pt.type === 'any' ? 1 : 1.5; }
  return s;
}

// volné vrcholy, kde by šla postavit osada (bez ohledu na cesty)
export function openSpots(v) {
  const g = graph(v.map.hexes);
  return Object.values(g.V).filter(x => !v.bld[x.id] && !x.adj.some(a => v.bld[a])).map(x => x.id);
}

// hodnota cesty: nejlepší dosažitelný volný vrchol za jejím koncem, dělený vzdáleností
export function roadScore(v, p, e, spots, w, have) {
  const g = graph(v.map.hexes), ed = g.E[e];
  let best = 0;
  for (const start of [ed.a, ed.b]) {
    if (v.bld[start] && v.bld[start].p !== p) continue;
    const dist = new Map([[start, 0]]), q = [start];
    while (q.length) {
      const x = q.shift(), d = dist.get(x);
      if (spots.has(x)) { const sc = spots.get(x) / (1 + d); if (sc > best) best = sc; }
      if (d >= 3 || (v.bld[x] && v.bld[x].p !== p)) continue;
      for (const y of g.V[x].adj) {
        const id = x < y ? x + '|' + y : y + '|' + x;
        if (dist.has(y) || (v.roads[id] !== undefined && v.roads[id] !== p)) continue;
        dist.set(y, d + 1); q.push(y);
      }
    }
  }
  return best;
}

export const missing = (hand, cost) => RES.reduce((a, r) => a + Math.max(0, (cost[r] || 0) - (hand[r] || 0)), 0);

// cíl hráče: co se vyplatí stavět a co k tomu chybí
export function goal(v, p, hasSettleSpot, hasCitySpot, hasRoadSpot) {
  const me = v.players[p], opts = [];
  if (hasCitySpot && me.left.city > 0) opts.push('city');
  if (hasSettleSpot && me.left.settle > 0) opts.push('settle');
  if (!hasSettleSpot && hasRoadSpot && me.left.road > 0 && me.left.settle > 0) opts.push('road');
  if (v.deckN > 0) opts.push('card');
  let best = null, bm = 99;
  for (const k of opts) { const m = missing(me.hand, COST[k]); if (m < bm) { bm = m; best = k; } }
  return best;
}
