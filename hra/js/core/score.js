// Body, nejdelší cesta, bonusy.
import { graph } from './hex.js';
import { RULES } from '../data.js';
import * as X from '../ext/straze.js'; // rozšíření

// délka nejdelší souvislé cesty hráče (cizí stavba cestu přerušuje)
export function roadLen(s, p) {
  const g = graph(s.map.hexes);
  const mine = Object.keys(s.roads).filter(e => s.roads[e] === p);
  if (!mine.length) return 0;
  const set = new Set(mine), used = new Set();
  let best = 0;
  const go = (v, len) => {
    if (len > best) best = len;
    const b = s.bld[v];
    if (b && b.p !== p && len > 0) return;
    const t = X.tower(s, v); if (t && t.p !== p && len > 0) return; // rozšíření: cizí věž cestu přeruší
    for (const e of g.V[v].edges) {
      if (!set.has(e) || used.has(e)) continue;
      used.add(e);
      go(g.E[e].a === v ? g.E[e].b : g.E[e].a, len + 1);
      used.delete(e);
    }
  };
  const starts = new Set();
  for (const e of mine) { starts.add(g.E[e].a); starts.add(g.E[e].b); }
  for (const v of starts) go(v, 0);
  return best;
}

// přepočet držitele bonusu: držitel zůstává při shodě, jinak jediný nejlepší nad minimem
function holder(cur, vals, min) {
  const max = Math.max(...vals);
  if (max < min) return null;
  if (cur !== null && vals[cur] === max) return cur;
  const top = vals.map((v, i) => (v === max ? i : -1)).filter(i => i >= 0);
  return top.length === 1 ? top[0] : null;
}
export function updateBonus(s) {
  s.longLen = s.players.map((_, p) => roadLen(s, p));
  s.long = holder(s.long, s.longLen, RULES.longMin);
  s.guard = holder(s.guard, s.players.map(pl => pl.guards), RULES.guardMin);
}

// body hráče; full = včetně skrytých objevů
export function points(s, p, full) {
  let n = 0;
  for (const b of Object.values(s.bld)) if (b.p === p) n += b.c ? 2 : 1;
  if (s.long === p) n += RULES.longPts;
  if (s.guard === p) n += RULES.guardPts;
  if (full) n += s.players[p].cards.filter(c => c === 'point').length;
  if (s.ext) n += X.points(s, p); // rozšíření: obrana proti pirátům
  return n;
}
