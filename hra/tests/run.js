// Testy jádra, botů a sítě. Spuštění: node hra/tests/run.js [filtr]
import { graph, corners } from '../js/core/hex.js';
import { genMap, quality } from '../js/core/mapgen.js';
import { newGame, view, total, eventsFor } from '../js/core/state.js';
import { apply, legal, roadSpots, settleSpots, rate } from '../js/core/rules.js';
import { points, roadLen, updateBonus } from '../js/core/score.js';
import { next } from '../js/core/rng.js';
import { botAct } from '../js/bot/bot.js';
import { createHost } from '../js/net/host.js';
import { createClient } from '../js/net/client.js';
import { memPair } from '../js/net/transport-mem.js';
import { RES, PIECES, MAPSIZE, COST, RULES, PROTO, bankSize, deckFor } from '../js/data.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, msg = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} čekáno ${JSON.stringify(b)}, je ${JSON.stringify(a)}`); };
const ok = (c, msg = 'podmínka neplatí') => { if (!c) throw new Error(msg); };
const must = (s, p, a) => { const r = apply(s, p, a); if (!r.ok) throw new Error('akce odmítnuta: ' + r.err + ' ' + JSON.stringify(a)); return r.ev; };
const bad = (s, p, a) => { const before = JSON.stringify(s), r = apply(s, p, a); ok(!r.ok, 'akce měla být odmítnuta: ' + JSON.stringify(a)); eq(JSON.stringify(s), before, 'neplatná akce změnila stav:'); };
const rndOf = seed => { const R = { rng: seed }; return () => next(R); };
const hexes = list => list.map(([q, r]) => ({ q, r }));
const names = n => Array.from({ length: n }, (_, i) => 'H' + i);

// krok hry boty; vrací false, když nikdo nemá akci
function botStep(s, level, rnd, check) {
  for (let p = 0; p < s.players.length; p++) {
    const v = view(s, p);
    if (!v.legal.length) continue;
    const a = botAct(v, typeof level === 'string' ? level : level[p], rnd);
    if (!a) continue;
    must(s, p, a);
    if (check) check(s);
    return true;
  }
  return false;
}
// hra po úvodním rozmístění, hráč 0 na tahu v hlavní fázi
function started(seed = 3, n = 3) {
  const s = newGame({ seed, names: names(n) }), rnd = rndOf(seed);
  while (s.phase === 'setup') botStep(s, 'mid', rnd);
  s.turn = 0; s.phase = 'main';
  return s;
}
const setHand = (s, p, h) => { for (const r of RES) s.players[p].hand[r] = h[r] || 0; };

function invariants(s) {
  const n = s.players.length;
  for (const r of RES) {
    const sum = s.bank[r] + s.players.reduce((a, p) => a + p.hand[r], 0);
    if (sum !== bankSize(n)) throw new Error(`počet karet ${r} nesedí: ${sum}`);
    if (s.bank[r] < 0 || s.players.some(p => p.hand[r] < 0)) throw new Error('záporný počet karet');
  }
  s.players.forEach((pl, p) => {
    const roads = Object.values(s.roads).filter(x => x === p).length;
    const b = Object.values(s.bld).filter(x => x.p === p);
    const st = b.filter(x => !x.c).length, ct = b.length - st;
    if (roads + pl.left.road !== PIECES.road || st + pl.left.settle !== PIECES.settle || ct + pl.left.city !== PIECES.city) throw new Error('počet dílů hráče nesedí');
    if (points(s, p, false) < st + 2 * ct) throw new Error('body nesedí se stavbami');
  });
  const dk = deckFor(n), all = Object.values(dk).reduce((a, b) => a + b, 0);
  const held = s.players.reduce((a, p) => a + p.cards.length + p.fresh.length, 0);
  if (s.deck.length + held > all) throw new Error('karet výprav je víc než v balíčku');
  const g = graph(s.map.hexes);
  for (const v of Object.keys(s.bld)) if (g.V[v].adj.some(w => s.bld[w])) throw new Error('sousední stavby');
}

// ---------- geometrie ----------
test('geometrie: počty vrcholů a hran', () => {
  let g = graph(hexes([[0, 0]]));
  eq([Object.keys(g.V).length, Object.keys(g.E).length], [6, 6]);
  g = graph(hexes([[0, 0], [1, 0]]));
  eq([Object.keys(g.V).length, Object.keys(g.E).length], [10, 11]);
  const big = [];
  for (let q = -2; q <= 2; q++) for (let r = -2; r <= 2; r++) if (Math.abs(q + r) <= 2) big.push([q, r]);
  g = graph(hexes(big));
  eq([big.length, Object.keys(g.V).length, Object.keys(g.E).length], [19, 54, 72]);
});
test('geometrie: sousednosti a jednoznačnost id', () => {
  const m = genMap(11, 4), g = graph(m.hexes);
  for (const v of Object.values(g.V)) {
    ok(v.adj.length >= 2 && v.adj.length <= 3 && v.hex.length >= 1 && v.hex.length <= 3, 'vrchol ' + v.id);
    ok(new Set(v.adj).size === v.adj.length && v.adj.length === v.edges.length);
    for (const w of v.adj) ok(g.V[w].adj.includes(v.id), 'nesymetrie');
    for (const w of Object.values(g.V)) if (w !== v) ok(Math.hypot(v.x - w.x, v.y - w.y) > 0.9, 'dva vrcholy na jednom místě');
  }
  for (const e of Object.values(g.E)) {
    ok(e.hex.length >= 1 && e.hex.length <= 2);
    ok(Math.abs(Math.hypot(g.V[e.a].x - g.V[e.b].x, g.V[e.a].y - g.V[e.b].y) - 1) < 1e-9, 'délka hrany');
  }
  m.hexes.forEach(h => ok(new Set(corners(h.q, h.r)).size === 6));
});

// ---------- generátor mapy ----------
test('mapa: 1000 seedů splní pravidla', () => {
  for (let seed = 1; seed <= 1000; seed++) {
    const n = 2 + seed % 5, m = genMap(seed, n), g = graph(m.hexes);
    eq(m.hexes.length, MAPSIZE[n]);
    eq(quality(m.hexes).hot, 0, 'seed ' + seed + ': 6 a 8 vedle sebe,');
    ok(m.hexes[m.storm].t === 'waste', 'bouře mimo pustinu');
    for (const h of m.hexes) ok(h.t === 'waste' ? h.n === 0 : h.n >= 2 && h.n <= 12 && h.n !== 7, 'číslo dílku');
    const cnt = {}; for (const h of m.hexes) cnt[h.t] = (cnt[h.t] || 0) + 1;
    const vals = ['forest', 'quarry', 'field', 'fishery', 'mine'].map(t => cnt[t] || 0);
    ok(Math.max(...vals) - Math.min(...vals) <= 1, 'nerovnoměrné dílky');
    ok(m.ports.length >= 4, 'málo přístavů: ' + m.ports.length);
    const pv = m.ports.flatMap(p => [g.E[p.e].a, g.E[p.e].b]);
    ok(new Set(pv).size === pv.length, 'přístavy sdílejí vrchol');
    for (const p of m.ports) ok(g.E[p.e].hex.length === 1, 'přístav mimo pobřeží');
    const seen = new Set([0]), q = [0]; // souvislost
    while (q.length) for (const j of g.hadj[q.pop()]) if (!seen.has(j)) { seen.add(j); q.push(j); }
    eq(seen.size, m.hexes.length, 'nesouvislá mapa');
  }
});
test('mapa: stejný seed dá stejnou mapu', () => {
  eq(genMap(77, 4), genMap(77, 4));
  ok(JSON.stringify(genMap(77, 4)) !== JSON.stringify(genMap(78, 4)));
});

// ---------- pravidla ----------
test('rozmístění: pořadí, vzdálenost, suroviny za druhou osadu', () => {
  const s = newGame({ seed: 5, names: names(3) }), g = graph(s.map.hexes);
  const p = s.turn, other = (p + 1) % 3;
  eq(legal(s, other), []);
  const at = settleSpots(s, p)[0];
  bad(s, other, { t: 'build', kind: 'settle', at });
  bad(s, p, { t: 'build', kind: 'road', at: g.V[at].edges[0] });
  bad(s, p, { t: 'roll' });
  must(s, p, { t: 'build', kind: 'settle', at });
  bad(s, p, { t: 'build', kind: 'settle', at: settleSpots(s, p)[0] });
  const far = Object.keys(g.E).find(e => !g.V[at].edges.includes(e));
  bad(s, p, { t: 'build', kind: 'road', at: far });
  must(s, p, { t: 'build', kind: 'road', at: g.V[at].edges[0] });
  eq(s.turn, other);
  bad(s, other, { t: 'build', kind: 'settle', at: g.V[at].adj[0] });
  const rnd = rndOf(1);
  while (s.phase === 'setup') ok(botStep(s, 'mid', rnd), 'rozmístění se zaseklo');
  eq(s.phase, 'roll'); eq(s.turn, s.first);
  s.players.forEach((pl, i) => {
    eq([pl.left.settle, pl.left.road], [PIECES.settle - 2, PIECES.road - 2]);
    ok(total(pl.hand) >= 1 && total(pl.hand) <= 3, 'suroviny za druhou osadu');
    eq(points(s, i, true), 2);
  });
  invariants(s);
});
test('hod: jen hráč na tahu, výnos surovin', () => {
  const s = started(); s.phase = 'roll';
  bad(s, 1, { t: 'roll' });
  bad(s, 0, { t: 'end' });
  const before = s.players.map(p => total(p.hand));
  const ev = must(s, 0, { t: 'roll' });
  const sum = s.rolled[0] + s.rolled[1];
  if (sum === 7) ok(s.phase === 'storm' || s.phase === 'discard');
  else {
    eq(s.phase, 'main');
    const gained = ev.filter(e => e.e === 'gain').reduce((a, e) => a + total(e.res), 0);
    eq(s.players.reduce((a, p) => a + total(p.hand), 0) - before.reduce((a, b) => a + b, 0), gained);
  }
  bad(s, 0, { t: 'roll' });
  invariants(s);
});
test('výnos: město dává dvě, bouře blokuje, banka omezuje', () => {
  const s = started(4, 2), g = graph(s.map.hexes);
  const v = Object.keys(s.bld).find(id => s.bld[id].p === 0 && g.V[id].hex.some(h => s.map.hexes[h].t !== 'waste'));
  const h = g.V[v].hex.find(h => s.map.hexes[h].t !== 'waste'), hx = s.map.hexes[h];
  const res = { forest: 'wood', quarry: 'stone', field: 'grain', fishery: 'fish', mine: 'iron' }[hx.t];
  // najdi seed hodu, který dá číslo dílku
  const tryRoll = mod => {
    for (let k = 0; k < 5000; k++) {
      const c = JSON.parse(JSON.stringify(s)); c.rng = k; c.phase = 'roll'; mod(c);
      const b = c.players[0].hand[res]; must(c, 0, { t: 'roll' });
      if (c.rolled[0] + c.rolled[1] === hx.n) return c.players[0].hand[res] - b;
    }
    throw new Error('hod nenalezen');
  };
  const others = c => g.hv[h].filter(x => x !== v && c.bld[x]).forEach(x => { delete c.bld[x]; });
  const same = c => c.map.hexes.forEach((o, i) => { if (i !== h && o.n === hx.n) o.n = hx.n === 2 ? 3 : 2; });
  eq(tryRoll(c => { others(c); same(c); c.storm = h === 0 ? 1 : 0; }), 1);
  eq(tryRoll(c => { others(c); same(c); c.storm = h === 0 ? 1 : 0; c.bld[v].c = 1; }), 2);
  eq(tryRoll(c => { others(c); same(c); c.storm = h; }), 0);
  eq(tryRoll(c => { others(c); same(c); c.storm = h === 0 ? 1 : 0; c.bld[v].c = 1; c.bank[res] = 1; }), 1);
});
test('stavba: cesta, osada, město a jejich ceny', () => {
  const s = started();
  setHand(s, 0, {});
  const e = roadSpots(s, 0)[0];
  bad(s, 0, { t: 'build', kind: 'road', at: e });
  setHand(s, 0, { wood: 1, stone: 1 });
  bad(s, 1, { t: 'build', kind: 'road', at: e });
  const bank = { ...s.bank };
  must(s, 0, { t: 'build', kind: 'road', at: e });
  eq(total(s.players[0].hand), 0); eq(s.roads[e], 0);
  eq([s.bank.wood, s.bank.stone], [bank.wood + 1, bank.stone + 1]);
  setHand(s, 0, { wood: 1, stone: 1 });
  bad(s, 0, { t: 'build', kind: 'road', at: e }); // obsazeno
  // osada: jen u vlastní cesty a ne vedle jiné stavby
  setHand(s, 0, { wood: 9, stone: 9, grain: 9, fish: 9, iron: 9 });
  const g = graph(s.map.hexes);
  const own = Object.keys(s.bld).find(v => s.bld[v].p === 0);
  bad(s, 0, { t: 'build', kind: 'settle', at: g.V[own].adj[0] });
  const lone = Object.keys(g.V).find(v => !s.bld[v] && !g.V[v].adj.some(w => s.bld[w]) && !g.V[v].edges.some(x => s.roads[x] === 0));
  bad(s, 0, { t: 'build', kind: 'settle', at: lone });
  let spot = settleSpots(s, 0)[0], guard = 0;
  while (!spot && guard++ < 10) { must(s, 0, { t: 'build', kind: 'road', at: roadSpots(s, 0).find(x => true) }); spot = settleSpots(s, 0)[0]; }
  ok(spot, 'nenalezeno místo pro osadu');
  const h0 = { ...s.players[0].hand };
  must(s, 0, { t: 'build', kind: 'settle', at: spot });
  for (const r of RES) eq(h0[r] - s.players[0].hand[r], COST.settle[r] || 0);
  // město
  bad(s, 0, { t: 'build', kind: 'city', at: Object.keys(s.bld).find(v => s.bld[v].p === 1) });
  const left = { ...s.players[0].left }, pts = points(s, 0, true);
  must(s, 0, { t: 'build', kind: 'city', at: spot });
  eq([s.players[0].left.city, s.players[0].left.settle], [left.city - 1, left.settle + 1]);
  eq(points(s, 0, true), pts + 1);
  bad(s, 0, { t: 'build', kind: 'city', at: spot });
  bad(s, 0, { t: 'build', kind: 'tower', at: spot });
});
test('směna s bankou a přístavy', () => {
  const s = started();
  for (const pt of s.map.ports) { const e = graph(s.map.hexes).E[pt.e]; delete s.bld[e.a]; delete s.bld[e.b]; }
  setHand(s, 0, { wood: 3 });
  bad(s, 0, { t: 'bank', give: 'wood', get: 'iron' });
  setHand(s, 0, { wood: 4 });
  bad(s, 0, { t: 'bank', give: 'wood', get: 'wood' });
  bad(s, 0, { t: 'bank', give: 'iron', get: 'wood' });
  must(s, 0, { t: 'bank', give: 'wood', get: 'iron' });
  eq(s.players[0].hand, { wood: 0, stone: 0, grain: 0, fish: 0, iron: 1 });
  const pt = s.map.ports.find(p => p.type !== 'any'), e = graph(s.map.hexes).E[pt.e];
  s.bld[e.a] = { p: 0, c: 0 };
  eq(rate(s, 0, pt.type), RULES.portResRate);
  eq(rate(s, 1, pt.type), RULES.bankRate);
  const any = s.map.ports.find(p => p.type === 'any'), e2 = graph(s.map.hexes).E[any.e];
  s.bld[e2.b] = { p: 1, c: 0 };
  eq(rate(s, 1, 'wood'), RULES.portRate);
  setHand(s, 0, { [pt.type]: 2 });
  must(s, 0, { t: 'bank', give: pt.type, get: RES.find(r => r !== pt.type) });
  eq(total(s.players[0].hand), 1);
});
test('výpravy: koupě, zahrání až další tah, jedna za tah', () => {
  const s = started();
  setHand(s, 0, {});
  bad(s, 0, { t: 'buy' });
  s.deck = ['supply', 'guard', 'roads', 'point', 'guard'];
  setHand(s, 0, { grain: 5, fish: 5, iron: 5 });
  must(s, 0, { t: 'buy' });
  eq(s.players[0].fresh, ['guard']);
  bad(s, 0, { t: 'play', card: 'guard' });
  must(s, 0, { t: 'buy' });
  eq(s.players[0].cards, ['point']); eq(points(s, 0, true), 3); eq(points(s, 0, false), 2);
  bad(s, 0, { t: 'play', card: 'point' });
  must(s, 0, { t: 'buy' }); must(s, 0, { t: 'buy' }); must(s, 0, { t: 'buy' });
  eq(s.deck.length, 0);
  bad(s, 0, { t: 'buy' });
  must(s, 0, { t: 'end' });
  eq(s.players[0].cards.slice().sort(), ['guard', 'guard', 'point', 'roads', 'supply']);
  s.turn = 0; s.phase = 'main';
  // hlídka: přesun bouře
  must(s, 0, { t: 'play', card: 'guard' });
  eq(s.phase, 'storm'); eq(s.players[0].guards, 1);
  const st = legal(s, 0)[0];
  bad(s, 0, { t: 'storm', hex: s.storm, from: null });
  must(s, 0, st);
  eq(s.phase, 'main');
  bad(s, 0, { t: 'play', card: 'supply', res: ['wood', 'wood'] }); // druhá karta v tahu
  s.played = false;
  bad(s, 0, { t: 'play', card: 'supply', res: ['wood'] });
  bad(s, 0, { t: 'play', card: 'supply', res: ['wood', 'gold'] });
  const w = s.players[0].hand.wood;
  must(s, 0, { t: 'play', card: 'supply', res: ['wood', 'wood'] });
  eq(s.players[0].hand.wood, w + 2);
  s.played = false; setHand(s, 0, {});
  must(s, 0, { t: 'play', card: 'roads' });
  eq(s.freeRoads, 2);
  bad(s, 0, { t: 'end' });
  must(s, 0, { t: 'build', kind: 'road', at: roadSpots(s, 0)[0] });
  must(s, 0, { t: 'build', kind: 'road', at: roadSpots(s, 0)[0] });
  eq(s.freeRoads, 0);
  bad(s, 0, { t: 'build', kind: 'road', at: roadSpots(s, 0)[0] });
});
test('bouře: odhození poloviny, krádež, tajná událost', () => {
  const s = started();
  setHand(s, 1, { wood: 5, iron: 4 }); setHand(s, 2, { wood: 2 });
  s.phase = 'discard'; s.discard = { 1: 4 };
  eq(legal(s, 0), []); eq(legal(s, 1), [{ t: 'discard', n: 4 }]);
  bad(s, 1, { t: 'discard', res: { wood: 3 } });
  bad(s, 1, { t: 'discard', res: { wood: 5, iron: -1 } });
  bad(s, 1, { t: 'discard', res: { stone: 4 } });
  bad(s, 2, { t: 'discard', res: { wood: 1 } });
  must(s, 1, { t: 'discard', res: { wood: 2, iron: 2 } });
  eq(s.phase, 'storm'); eq(total(s.players[1].hand), 5);
  const a = legal(s, 0).find(x => x.from === 1);
  ok(a, 'chybí možnost okrást hráče 1');
  bad(s, 0, { t: 'storm', hex: a.hex, from: 0 });
  bad(s, 0, { t: 'storm', hex: a.hex, from: null });
  bad(s, 1, a);
  const ev = must(s, 0, a);
  eq(total(s.players[1].hand), 4); eq(total(s.players[0].hand) >= 1, true); eq(s.storm, a.hex);
  const st = ev.find(e => e.e === 'steal');
  ok(eventsFor(ev, 0).find(e => e.e === 'steal').res && eventsFor(ev, 1).find(e => e.e === 'steal').res, 'zúčastnění vidí kartu');
  ok(!('res' in eventsFor(ev, 2).find(e => e.e === 'steal')) && st.secret, 'třetí hráč kartu nevidí');
});
test('obchod mezi hráči', () => {
  const s = started();
  setHand(s, 0, { wood: 2 }); setHand(s, 1, { iron: 1 }); setHand(s, 2, { iron: 2, wood: 1 });
  bad(s, 1, { t: 'offer', give: { iron: 1 }, want: { wood: 1 } });
  bad(s, 0, { t: 'offer', give: { wood: 3 }, want: { iron: 1 } });
  bad(s, 0, { t: 'offer', give: { wood: 1 }, want: { wood: 1 } });
  bad(s, 0, { t: 'offer', give: { wood: 1 }, want: {} });
  bad(s, 0, { t: 'offer', give: { wood: 1.5 }, want: { iron: 1 } });
  bad(s, 0, { t: 'offer', give: { gold: 1 }, want: { iron: 1 } });
  must(s, 0, { t: 'offer', give: { wood: 1 }, want: { iron: 2 } });
  eq(s.trade.resp, { 1: 'no' }); // hráč 1 nemá dvě železa
  bad(s, 0, { t: 'end' });
  bad(s, 0, { t: 'confirm', with: 2 });
  bad(s, 1, { t: 'respond', ok: true });
  must(s, 2, { t: 'respond', ok: true });
  bad(s, 2, { t: 'respond', ok: false });
  bad(s, 0, { t: 'confirm', with: 1 });
  must(s, 0, { t: 'confirm', with: 2 });
  eq(s.players[0].hand, { wood: 1, stone: 0, grain: 0, fish: 0, iron: 2 });
  eq(s.players[2].hand, { wood: 2, stone: 0, grain: 0, fish: 0, iron: 0 });
  eq(s.trade, null);
  must(s, 0, { t: 'offer', give: { wood: 1 }, want: { fish: 1 } }); // nikdo nemá → zavře se sama
  eq(s.trade, null);
  setHand(s, 1, { iron: 1 });
  must(s, 0, { t: 'offer', give: { wood: 1 }, want: { iron: 1 } });
  must(s, 0, { t: 'cancel' });
  eq(s.offers, 3);
  bad(s, 0, { t: 'offer', give: { wood: 1 }, want: { iron: 1 } }); // limit nabídek za tah
});
test('konec tahu a výhra', () => {
  const s = started();
  bad(s, 1, { t: 'end' });
  must(s, 0, { t: 'end' });
  eq([s.turn, s.phase], [1, 'roll']);
  s.phase = 'main'; s.target = 3;
  setHand(s, 1, { wood: 9, stone: 9, grain: 9, fish: 9, iron: 9 });
  const at = Object.keys(s.bld).find(v => s.bld[v].p === 1);
  const ev = must(s, 1, { t: 'build', kind: 'city', at });
  eq([s.phase, s.winner], ['end', 1]);
  ok(ev.some(e => e.e === 'win'));
  eq(legal(s, 1), []); bad(s, 1, { t: 'end' });
});
test('nejdelší cesta: délka, přerušení, držitel', () => {
  const s = started(9, 2), g = graph(s.map.hexes);
  s.roads = {}; s.bld = {};
  // had z pěti hran
  const find = p => { if (p.length === 7) return p; for (const nx of g.V[p[p.length - 1]].adj) if (!p.includes(nx)) { const r = find([...p, nx]); if (r) return r; } return null; };
  const path = find([Object.keys(g.V)[0]]);
  const e = i => (path[i] < path[i + 1] ? path[i] + '|' + path[i + 1] : path[i + 1] + '|' + path[i]);
  for (let i = 0; i < 5; i++) s.roads[e(i)] = 0;
  eq(roadLen(s, 0), 5);
  updateBonus(s); eq(s.long, 0); eq(points(s, 0, false), RULES.longPts);
  s.bld[path[2]] = { p: 1, c: 0 }; // cizí osada cestu přeruší
  eq(roadLen(s, 0), 3);
  updateBonus(s); eq(s.long, null);
  delete s.bld[path[2]];
  for (let i = 0; i < 5; i++) s.roads[e(i)] = i < 5 ? 0 : 1;
  updateBonus(s); eq(s.long, 0);
  s.roads[e(5)] = 0; updateBonus(s); eq(s.longLen[0], 6);
});

// ---------- pohled ----------
test('pohled: bez cizích karet, balíčku a stavu náhody', () => {
  const s = started();
  s.players[1].hand.iron = 3; s.players[1].cards = ['guard']; s.players[1].fresh = ['point'];
  const v = view(s, 0), txt = JSON.stringify(v);
  ok(!('rng' in v) && !('deck' in v), 'pohled obsahuje rng nebo balíček');
  ok(v.players[0].hand && !v.players[1].hand && !v.players[1].cards && !v.players[1].fresh, 'cizí ruka v pohledu');
  eq(v.players[1].handN, total(s.players[1].hand)); eq(v.players[1].cardN, 2);
  eq(v.players[1].pts, points(s, 1, false));
  ok(!txt.includes('"point"'), 'skrytý objev v pohledu');
  const w = view(s, -1);
  ok(w.players.every(p => !p.hand) && w.legal.length === 0, 'divák vidí karty');
  v.players[0].hand.wood = 99; ok(s.players[0].hand.wood !== 99, 'pohled sdílí objekty se stavem');
});

// ---------- hry botů ----------
test('boti: 240 celých her bez chyby a zaseknutí', () => {
  const lv = ['easy', 'mid', 'hard'];
  let rounds = 0;
  for (let seed = 1; seed <= 240; seed++) {
    const n = 2 + seed % 5, s = newGame({ seed, names: names(n), target: 8 + seed % 4 }), rnd = rndOf(seed * 13);
    const levels = names(n).map((_, i) => lv[(seed + i) % 3]);
    let steps = 0;
    while (s.phase !== 'end') {
      if (!botStep(s, levels, rnd, invariants)) throw new Error(`seed ${seed}: hra se zasekla ve fázi ${s.phase}`);
      if (++steps > 30000) throw new Error(`seed ${seed}: hra nekončí`);
    }
    ok(points(s, s.winner, true) >= s.target, 'vítěz nemá cílový počet bodů');
    rounds += s.turnNo / n;
  }
  ok(rounds / 240 < 40, 'hry jsou příliš dlouhé: ' + rounds / 240);
});
test('boti: těžký poráží lehkého', () => {
  let hard = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = newGame({ seed, names: names(4) }), rnd = rndOf(seed);
    const levels = seed % 2 ? ['hard', 'easy', 'hard', 'easy'] : ['easy', 'hard', 'easy', 'hard'];
    while (s.phase !== 'end') botStep(s, levels, rnd);
    if (levels[s.winner] === 'hard') hard++;
  }
  ok(hard >= 40, 'těžký bot vyhrál jen ' + hard + ' z 60');
});
test('determinismus: stejný seed a akce dají stejný stav', () => {
  const run = () => { const s = newGame({ seed: 42, names: names(4) }), rnd = rndOf(7); while (s.phase !== 'end') botStep(s, 'mid', rnd); return JSON.stringify(s); };
  eq(run(), run());
});

// ---------- síť ----------
function room(seats, extra = {}) {
  let t = 1e6; const saved = [];
  const H = createHost({ seats, seed: 21, code: 'TEST', botDelay: -1, now: () => t, save: x => saved.push(x), ...extra });
  const join = (hello, local) => {
    const [a, b] = memPair(), log = { lobby: [], view: [], err: [], closed: false };
    const C = createClient(a, hello, { onLobby: m => log.lobby.push(m), onView: m => log.view.push(m), onError: m => log.err.push(m), onClose: () => { log.closed = true; } });
    H.attach(b, { local });
    if (hello) C.conn.send(JSON.stringify({ t: 'hello', ...hello, proto: hello.proto ?? PROTO }));
    return { C, log, raw: a, last: () => log.view[log.view.length - 1] };
  };
  return { H, join, saved, now: () => t, time: d => { t += d * 1000; } };
}
test('síť: připojení, lobby, start, pohledy', () => {
  const r = room([{ kind: 'local', name: 'Host' }, { kind: 'open' }, { kind: 'bot', level: 'mid' }]);
  const loc = r.join(null, true);
  eq(loc.log.lobby[0].you, [0]);
  const c = r.join({ name: '  Pavel<b>  ', token: 'tokenpavel1' });
  eq(r.H.seats[1].name, 'Pavelb');
  eq(c.log.lobby.at(-1).you, [1]);
  ok(loc.log.lobby.at(-1).seats[1].taken, 'hostitel nevidí připojeného hráče');
  const full = r.join({ name: 'Třetí', token: 'tokentreti1' });
  eq(full.log.err[0].code, 'full'); ok(full.log.closed);
  const old = r.join({ name: 'Starý', token: 'tokenstary1', proto: PROTO + 1 });
  eq(old.log.err[0].code, 'proto');
  r.H.start();
  eq(loc.last().pid, 0); eq(c.last().pid, 1);
  ok(!c.last().view.players[0].hand && c.last().view.players[1].hand, 'klient dostal cizí ruku');
  ok(!JSON.stringify(c.last()).includes('"rng"'));
  const late = r.join({ name: 'Pozdě', token: 'tokenpozde1' });
  eq(late.log.err[0].code, 'started');
});
test('síť: akce za cizího hráče a poškozené zprávy', () => {
  const r = room([{ kind: 'local', name: 'Host' }, { kind: 'open' }]);
  const loc = r.join(null, true), c = r.join({ name: 'Pavel', token: 'tokenpavel1' });
  r.H.start();
  const turn = r.H.g.turn, me = turn === 0 ? loc : c, other = turn === 0 ? c : loc;
  const a = me.last().view.legal[0], seq = r.H.seq;
  other.C.act(turn, a); // cizí místo
  eq(other.log.err.at(-1).code, 'seat'); eq(r.H.seq, seq);
  other.C.act(1 - turn, a); // vlastní místo, ale není na tahu
  eq(other.log.err.at(-1).code, 'rule'); eq(r.H.seq, seq);
  for (const junk of ['', '{', 'null', '[]', '{"t":5}', '{"t":"action"}', '{"t":"action","pid":"x","a":null}', '{"t":"action","a":{"t":"build","kind":"settle","at":{"x":1}}}', 'x'.repeat(50000), '{"t":"hello","token":"aaaaaaaaaaaa","proto":1}'])
    c.raw.send(junk);
  eq(r.H.seq, seq, 'poškozená zpráva změnila hru:');
  me.C.act(turn, a);
  eq(r.H.seq, seq + 1);
  ok(me.last().ev.some(e => e.e === 'build') && other.last().ev.some(e => e.e === 'build'), 'události nedorazily');
  // příliš mnoho zpráv za vteřinu se zahazuje
  const n = c.log.err.length;
  for (let i = 0; i < 200; i++) c.C.act(turn === 1 ? 0 : 1, { t: 'roll' });
  ok(c.log.err.length - n < 40, 'omezení četnosti nefunguje');
});
test('síť: odpojení, převzetí botem, návrat', () => {
  const r = room([{ kind: 'local', name: 'Host' }, { kind: 'open' }, { kind: 'bot', level: 'easy' }]);
  const loc = r.join(null, true); let c = r.join({ name: 'Pavel', token: 'tokenpavel1' });
  r.H.start(); r.H.pump();
  // hostitel hraje, dokud není na tahu vzdálený hráč
  const rnd = rndOf(3);
  const hostPlays = () => { let n = 0; while (r.H.g.phase !== 'end' && n++ < 500) { r.H.pump(); const v = loc.last().view; if (!v.legal.length) break; r.H.act(0, botAct(v, 'mid', rnd)); } };
  hostPlays();
  ok(legal(r.H.g, 1).length > 0, 'vzdálený hráč má být na tahu');
  c.C.close();
  ok(!r.H.seats[1].conn && r.H.pub()[1].online === false);
  const seq = r.H.seq;
  r.time(5); r.H.tick(); eq(r.H.seats[1].away, false);
  r.time(30); r.H.tick(); eq(r.H.seats[1].away, true);
  r.H.pump(); hostPlays();
  ok(r.H.seq > seq, 'bot za odpojeného nehrál');
  const stranger = r.join({ name: 'Cizí', token: 'tokencizi123' });
  eq(stranger.log.err[0].code, 'started');
  c = r.join({ name: 'Pavel', token: 'tokenpavel1' });
  ok(c.last() && c.last().pid === 1 && c.last().view.players[1].hand, 'po návratu nepřišel pohled');
  eq(c.last().seats[1].away, true);
  c.C.back(1);
  eq(r.H.seats[1].away, false);
  // připojený, ale nečinný hráč: delší limit
  hostPlays();
  if (r.H.g.phase !== 'end' && legal(r.H.g, 1).length) { r.time(40); r.H.tick(); r.time(200); r.H.tick(); eq(r.H.seats[1].away, true); }
});
test('síť: celá hra přes hostitele a uložení', () => {
  const r = room([{ kind: 'local', name: 'A' }, { kind: 'local', name: 'B' }, { kind: 'open' }, { kind: 'bot', level: 'hard' }, { kind: 'open' }]);
  const loc = r.join(null, true), c = r.join({ name: 'Pavel', token: 'tokenpavel1' });
  eq(loc.log.lobby[0].you, [0, 1]);
  r.H.start();
  eq(r.H.seats[4].kind, 'bot', 'neobsazené místo se má změnit na bota');
  const rnd = rndOf(5), latest = {};
  let n = 0, restored = false;
  let H = r.H;
  while (H.g.phase !== 'end' && n++ < 20000) {
    H.pump(); r.time(1);
    for (const m of loc.log.view) latest[m.pid] = m;
    for (const m of c.log.view) latest[m.pid] = m;
    loc.log.view.length = 0; c.log.view.length = 0;
    const pid = [0, 1, 2].find(p => latest[p] && latest[p].seq === H.seq && latest[p].view.legal.length);
    if (pid === undefined) { if (H.g.phase !== 'end') throw new Error('nikdo není na tahu'); break; }
    const a = botAct(latest[pid].view, 'mid', rnd);
    if (!a) { H.act(H.g.trade.from, { t: 'cancel' }); continue; }
    (pid === 2 ? c : loc).C.act(pid, a);
    if (!restored && H.seq > 60) { // obnova hostitele z uložené hry uprostřed
      restored = true;
      const snap = JSON.parse(r.saved.at(-1));
      eq(snap.g, JSON.parse(JSON.stringify(H.g)), 'uložený stav se liší:');
      ok(!JSON.stringify(snap.seats).includes('conn'));
      const H2 = createHost({ restore: snap, botDelay: -1, now: r.now, save: x => r.saved.push(x) });
      eq(H2.pub().map(s => s.name), H.pub().map(s => s.name));
      const [a1, b1] = memPair(); createClient(a1, null, { onView: m => loc.log.view.push(m) }); H2.attach(b1, { local: true });
      const [a2, b2] = memPair(); const C2 = createClient(a2, { name: 'Pavel', token: 'tokenpavel1' }, { onView: m => c.log.view.push(m) }); H2.attach(b2); a2.send(JSON.stringify({ t: 'hello', name: 'Pavel', token: 'tokenpavel1', proto: PROTO }));
      loc.C = { act: (p, x) => a1.send(JSON.stringify({ t: 'action', pid: p, a: x })) }; c.C = C2;
      H = H2;
    }
  }
  eq(H.g.phase, 'end', 'po ' + n + ' krocích, seq ' + H.seq + ':'); ok(restored, 'obnova neproběhla');
});

// ---------- běh ----------
const filter = process.argv[2];
let fail = 0;
for (const t of tests) {
  if (filter && !t.name.includes(filter)) continue;
  const t0 = Date.now();
  try { t.fn(); console.log(`ok    ${t.name} (${Date.now() - t0} ms)`); }
  catch (e) { fail++; console.log(`CHYBA ${t.name}\n      ${e.message}\n${(e.stack || '').split('\n').slice(1, 4).join('\n')}`); }
}
console.log(fail ? `\n${fail} testů selhalo` : '\nvše v pořádku');
process.exit(fail ? 1 : 0);
