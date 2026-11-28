// ---------- Rozšíření „Stráže a cechy“ (bot) ----------
// Volá se z bot.js po stavbě měst a osad; vrací akci rozšíření nebo null.
import { graph } from '../core/hex.js';
import { PIPS } from '../data.js';

export function extBot(v, me, L, cfg, rnd) {
  const g = graph(v.map.hexes), x = v.ext, pl = v.players[me];
  const towers = Object.entries(x.towers).filter(([, t]) => t.p === me);
  const def = towers.reduce((a, [, t]) => a + t.l, 0);
  const cities = Object.values(v.bld).filter(b => b.p === me && b.c).length;
  const danger = x.pirates >= 2 && def < cities; // útok se blíží a obrana nestačí
  // cech: kupecký při velké ruce, stavitelský při hodně cestách v zásobě, jinak učenecký
  const gu = L.filter(a => a.t === 'guild');
  if (gu.length) {
    const val = { trade: pl.handN / 2, build: pl.left.road / 4, learn: 1.5 };
    return gu.reduce((b, a) => (val[a.g] + rnd() * 0.01 > val[b.g] ? a : b));
  }
  if (cfg.plan === false && rnd() > 0.3) return null; // lehký bot staví věže jen občas
  const up = L.filter(a => a.t === 'build' && a.kind === 'tup');
  if (up.length && danger) return up[0];
  const tw = L.filter(a => a.t === 'build' && a.kind === 'tower');
  if (tw.length && (danger || towers.length === 0 && cities > 0)) {
    // věž u vlastních výnosných dílků (chrání je před bouří)
    const score = id => g.V[id].hex.reduce((a, h) => a + (g.hv[h].some(w => v.bld[w] && v.bld[w].p === me) ? PIPS[v.map.hexes[h].n] || 0 : 0), 0);
    return tw.reduce((b, a) => (score(a.at) + rnd() * 0.01 > score(b.at) ? a : b));
  }
  return null;
}
