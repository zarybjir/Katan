// Bot: (pohled, obtížnost, rnd) → akce. Vybírá jen z pohled.legal, nevidí cizí karty.
// Vrací null jen tehdy, když čeká na odpovědi na vlastní nabídku obchodu.
import { graph } from '../core/hex.js';
import { RES, TERRAIN, PIPS, COST, BOT, BOT_OFFER } from '../data.js';
import { resWeights, myRes, vertexScore, openSpots, roadScore, missing, goal } from './eval.js';

export function botAct(v, level, rnd) {
  const L = v.legal, me = v.you, cfg = BOT[level] || BOT.mid;
  if (!L.length) return null;
  const pl = v.players[me], hand = pl.hand;
  const noisy = x => x * (1 + cfg.noise * (rnd() * 2 - 1));
  const bestOf = (list, f) => { let b = null, bs = -1e9; for (const x of list) { const s = noisy(f(x)) + rnd() * 1e-6; if (s > bs) { bs = s; b = x; } } return b; };
  const w = resWeights(v, cfg.plan), have = myRes(v, me);
  const builds = k => L.filter(a => a.t === 'build' && a.kind === k);
  const spotMap = () => new Map(openSpots(v).map(id => [id, vertexScore(v, id, w, have)]));

  const first = L[0];
  // ---------- odhození karet ----------
  if (first.t === 'discard') {
    const h = { ...hand }, res = {};
    for (let i = 0; i < first.n; i++) {
      const r = bestOf(RES.filter(r => h[r] > 0), r => h[r]);
      h[r]--; res[r] = (res[r] || 0) + 1;
    }
    return { t: 'discard', res };
  }
  // ---------- obchod mezi hráči ----------
  if (v.trade) {
    const tr = v.trade;
    if (tr.from === me) {
      const yes = L.filter(a => a.t === 'confirm');
      if (yes.length) return bestOf(yes, a => -v.players[a.with].pts);
      const waiting = v.players.some((_, i) => i !== me && tr.resp[i] === undefined);
      return waiting ? null : { t: 'cancel' };
    }
    const can = L.some(a => a.t === 'respond' && a.ok);
    if (!can || !cfg.trade || v.players[tr.from].pts >= v.target - 2) return { t: 'respond', ok: false };
    const g = myGoal();
    if (!g) return { t: 'respond', ok: false };
    const cost = COST[g], after = { ...hand };
    for (const r of RES) after[r] += (tr.give[r] || 0) - (tr.want[r] || 0);
    const d = missing(hand, cost) - missing(after, cost), tot = o => RES.reduce((a, r) => a + (o[r] || 0), 0);
    // přijme, co přiblíží cíl; nebo férovou výměnu přebytků, která cíli neuškodí
    const spare = RES.every(r => !tr.want[r] || hand[r] - tr.want[r] >= (cost[r] || 0));
    return { t: 'respond', ok: d > 0 || (d === 0 && spare && tot(tr.give) >= tot(tr.want)) };
  }
  // ---------- úvodní rozmístění ----------
  if (v.phase === 'setup') {
    if (first.kind === 'settle') return bestOf(L, a => vertexScore(v, a.at, w, have));
    const sp = spotMap();
    return bestOf(L, a => roadScore(v, me, a.at, sp, w, have));
  }
  if (first.t === 'roll') { // hlídka před hodem, když bouře stojí u vlastní stavby (lehký bot ne)
    const gp = L.find(a => a.t === 'play' && a.card === 'guard');
    if (gp && cfg.plan && v.storm >= 0 && graph(v.map.hexes).hv[v.storm].some(id => v.bld[id] && v.bld[id].p === me)) return gp;
    return first;
  }
  // ---------- bouře ----------
  if (first.t === 'storm') {
    const g = graph(v.map.hexes);
    return bestOf(L, a => {
      const hx = v.map.hexes[a.hex];
      let s = 0;
      for (const id of g.hv[a.hex]) {
        const b = v.bld[id];
        if (!b) continue;
        const val = (PIPS[hx.n] || 0) * (b.c ? 2 : 1);
        s += b.p === me ? -50 : val * (cfg.block ? 1 + v.players[b.p].pts / 4 : 1);
      }
      if (a.from !== null) s += 2 + (cfg.block ? v.players[a.from].pts / 2 : 0) + Math.min(3, v.players[a.from].handN / 3);
      return s;
    });
  }
  // ---------- hlavní fáze ----------
  if (first.free) { const sp = spotMap(); return bestOf(L, a => roadScore(v, me, a.at, sp, w, have)); }
  if (level === 'easy' && rnd() < 0.12) return { t: 'end' };
  const play = c => L.find(a => a.t === 'play' && a.card === c);
  if (play('guard')) return play('guard');
  const city = builds('city'), settle = builds('settle'), road = builds('road');
  if (city.length) return bestOf(city, a => vertexScore(v, a.at, w, null));
  if (settle.length) return bestOf(settle, a => vertexScore(v, a.at, w, have));
  if (play('roads')) return play('roads');
  const g = myGoal();
  const sup = L.filter(a => a.t === 'play' && a.card === 'supply');
  if (sup.length && g) {
    const b = bestOf(sup, a => { const h = { ...hand }; for (const r of a.res) h[r]++; return -missing(h, COST[g]); });
    const h = { ...hand }; for (const r of b.res) h[r]++;
    if (missing(h, COST[g]) === 0 || pl.handN <= 3) return b;
  }
  const others = v.longLen.filter((_, i) => i !== me), chase = v.longLen[me] >= 4 && v.long !== me && v.longLen[me] + 1 >= Math.max(0, ...others);
  if (road.length && (g === 'road' || pl.handN >= 7 || chase)) {
    const sp = spotMap(), b = bestOf(road, a => cfg.plan ? roadScore(v, me, a.at, sp, w, have) + 0.01 : rnd());
    // cesta, která nevede k žádnému místu pro osadu, jen při honbě za nejdelší cestou
    if (!cfg.plan || chase || roadScore(v, me, b.at, sp, w, have) > 0) return b;
  }
  if (L.some(a => a.t === 'buy') && (g === 'card' || pl.handN >= 6)) return { t: 'buy' };
  // směna s bankou, když přiblíží cíl a nesáhne na potřebné suroviny
  if (g) {
    const cost = COST[g];
    const tr = L.filter(a => a.t === 'bank' && hand[a.give] - a.rate >= (cost[a.give] || 0) && hand[a.get] < (cost[a.get] || 0));
    if (tr.length) return bestOf(tr, a => -a.rate);
    if (cfg.trade && v.offers === 0 && L.some(a => a.t === 'offer') && missing(hand, cost) === 1 && rnd() < BOT_OFFER) {
      const want = RES.find(r => hand[r] < (cost[r] || 0));
      const give = bestOf(RES.filter(r => hand[r] > (cost[r] || 0)), r => hand[r] - (cost[r] || 0));
      if (want && give) return { t: 'offer', give: { [give]: 1 }, want: { [want]: 1 } };
    }
  }
  return { t: 'end' };

  function myGoal() {
    const gr = graph(v.map.hexes);
    const mineV = Object.keys(v.bld).filter(id => v.bld[id].p === me);
    const hasCity = mineV.some(id => !v.bld[id].c);
    const hasSettle = openSpots(v).some(id => gr.V[id].edges.some(e => v.roads[e] === me));
    const hasRoad = Object.keys(v.roads).some(e => v.roads[e] === me);
    return goal(v, me, hasSettle, hasCity, hasRoad);
  }
}
