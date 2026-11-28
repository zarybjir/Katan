// Pravidla: legal(stav, hráč) vrací dovolené akce, apply(stav, hráč, akce) akci provede.
import { graph } from './hex.js';
import { rint } from './rng.js';
import { points, updateBonus } from './score.js';
import { RES, TERRAIN, COST, RULES } from '../data.js';

const tot = h => RES.reduce((a, r) => a + (h[r] || 0), 0);
export const canPay = (hand, cost) => RES.every(r => (hand[r] || 0) >= (cost[r] || 0));
const isRes = o => o && typeof o === 'object' && Object.keys(o).every(k => RES.includes(k) && Number.isInteger(o[k]) && o[k] >= 0 && o[k] < 100);

function pay(s, p, cost) { for (const r of RES) if (cost[r]) { s.players[p].hand[r] -= cost[r]; s.bank[r] += cost[r]; } }
function give(s, p, r, n) { n = Math.min(n, s.bank[r]); s.bank[r] -= n; s.players[p].hand[r] += n; return n; }

// ---------- kde lze stavět ----------
export function roadSpots(s, p) {
  const g = graph(s.map.hexes), out = [];
  if (s.players[p].left.road < 1) return out;
  if (s.phase === 'setup') return g.V[s.setup.last].edges.filter(e => s.roads[e] === undefined);
  for (const e of Object.values(g.E)) {
    if (s.roads[e.id] !== undefined) continue;
    const ok = [e.a, e.b].some(v => {
      const b = s.bld[v];
      if (b) return b.p === p;
      return g.V[v].edges.some(x => s.roads[x] === p);
    });
    if (ok) out.push(e.id);
  }
  return out;
}
export function settleSpots(s, p) {
  const g = graph(s.map.hexes), out = [];
  if (s.players[p].left.settle < 1) return out;
  for (const v of Object.values(g.V)) {
    if (s.bld[v.id] || v.adj.some(w => s.bld[w])) continue;
    if (s.phase !== 'setup' && !v.edges.some(e => s.roads[e] === p)) continue;
    out.push(v.id);
  }
  return out;
}
export function citySpots(s, p) {
  if (s.players[p].left.city < 1) return [];
  return Object.keys(s.bld).filter(v => s.bld[v].p === p && !s.bld[v].c);
}
// směnný poměr hráče pro surovinu (přístavy)
export function rate(s, p, r) {
  let k = RULES.bankRate;
  const g = graph(s.map.hexes);
  for (const pt of s.map.ports) {
    const e = g.E[pt.e];
    if (![e.a, e.b].some(v => s.bld[v] && s.bld[v].p === p)) continue;
    if (pt.type === 'any') k = Math.min(k, RULES.portRate);
    else if (pt.type === r) k = Math.min(k, RULES.portResRate);
  }
  return k;
}
// kdo může být okraden při přesunu bouře na dílek
export function victims(s, p, hex) {
  const g = graph(s.map.hexes), out = new Set();
  for (const v of g.hv[hex]) { const b = s.bld[v]; if (b && b.p !== p && tot(s.players[b.p].hand) > 0) out.add(b.p); }
  return [...out].sort();
}

// ---------- dovolené akce ----------
// Akce {t:'discard', n} a {t:'offer'} jsou šablony: obsah (res / give, want) doplní hráč.
export function legal(s, p) {
  const out = [], pl = s.players[p];
  if (!pl || s.phase === 'end') return out;
  if (s.phase === 'discard') { if (s.discard[p]) out.push({ t: 'discard', n: s.discard[p] }); return out; }
  if (s.trade) {
    const tr = s.trade;
    if (p === tr.from) {
      for (const q of Object.keys(tr.resp)) if (tr.resp[q] === 'yes') out.push({ t: 'confirm', with: +q });
      out.push({ t: 'cancel' });
    } else if (tr.resp[p] === undefined) {
      if (canPay(pl.hand, tr.want)) out.push({ t: 'respond', ok: true });
      out.push({ t: 'respond', ok: false });
    }
    return out;
  }
  if (p !== s.turn) return out;
  if (s.phase === 'setup') {
    if (s.setup.step === 'settle') for (const at of settleSpots(s, p)) out.push({ t: 'build', kind: 'settle', at });
    else for (const at of roadSpots(s, p)) out.push({ t: 'build', kind: 'road', at });
    return out;
  }
  if (s.phase === 'roll') { // před hodem jde zahrát jen hlídka (přesun bouře)
    out.push({ t: 'roll' });
    if (!s.played && pl.cards.includes('guard')) out.push({ t: 'play', card: 'guard' });
    return out;
  }
  if (s.phase === 'storm') {
    s.map.hexes.forEach((h, i) => {
      if (i === s.storm) return;
      const vs = victims(s, p, i);
      if (vs.length) for (const from of vs) out.push({ t: 'storm', hex: i, from });
      else out.push({ t: 'storm', hex: i, from: null });
    });
    return out;
  }
  // hlavní fáze
  if (s.freeRoads > 0) { for (const at of roadSpots(s, p)) out.push({ t: 'build', kind: 'road', at, free: true }); return out; }
  if (canPay(pl.hand, COST.road)) for (const at of roadSpots(s, p)) out.push({ t: 'build', kind: 'road', at });
  if (canPay(pl.hand, COST.settle)) for (const at of settleSpots(s, p)) out.push({ t: 'build', kind: 'settle', at });
  if (canPay(pl.hand, COST.city)) for (const at of citySpots(s, p)) out.push({ t: 'build', kind: 'city', at });
  if (s.deck.length && canPay(pl.hand, COST.card)) out.push({ t: 'buy' });
  if (!s.played) {
    if (pl.cards.includes('guard')) out.push({ t: 'play', card: 'guard' });
    if (pl.cards.includes('roads') && roadSpots(s, p).length) out.push({ t: 'play', card: 'roads' });
    if (pl.cards.includes('supply')) {
      for (let i = 0; i < 5; i++) for (let j = i; j < 5; j++) {
        const a = RES[i], b = RES[j];
        if (a === b ? s.bank[a] >= 2 : s.bank[a] >= 1 && s.bank[b] >= 1) out.push({ t: 'play', card: 'supply', res: [a, b] });
      }
    }
  }
  for (const r of RES) {
    const k = rate(s, p, r);
    if (pl.hand[r] >= k) for (const q of RES) if (q !== r && s.bank[q] > 0) out.push({ t: 'bank', give: r, get: q, rate: k });
  }
  if (s.offers < RULES.maxOffers && tot(pl.hand) > 0 && s.players.length > 1) out.push({ t: 'offer' });
  out.push({ t: 'end' });
  return out;
}

// ---------- provedení akce ----------
const fail = err => ({ ok: false, err });

export function apply(s, p, a) {
  if (!a || typeof a !== 'object' || !s.players[p]) return fail('neplatná akce');
  const L = legal(s, p), ev = [], pl = s.players[p];
  const has = f => L.some(f);
  switch (a.t) {
    case 'build': {
      if (!has(x => x.t === 'build' && x.kind === a.kind && x.at === a.at)) return fail('zde nelze stavět');
      const setup = s.phase === 'setup', paid = !setup && !(a.kind === 'road' && s.freeRoads > 0);
      if (a.kind === 'road') {
        if (s.freeRoads > 0) s.freeRoads--; else if (!setup) pay(s, p, COST.road);
        s.roads[a.at] = p; pl.left.road--;
      } else if (a.kind === 'settle') {
        if (!setup) pay(s, p, COST.settle);
        s.bld[a.at] = { p, c: 0 }; pl.left.settle--;
      } else {
        pay(s, p, COST.city);
        s.bld[a.at].c = 1; pl.left.city--; pl.left.settle++;
      }
      ev.push({ e: 'build', p, kind: a.kind, at: a.at, paid });
      updateBonus(s);
      if (setup) setupStep(s, p, a, ev);
      else if (s.freeRoads > 0 && !roadSpots(s, p).length) s.freeRoads = 0;
      break;
    }
    case 'roll': {
      if (!has(x => x.t === 'roll')) return fail('teď nelze házet');
      const d = [1 + rint(s, 6), 1 + rint(s, 6)], sum = d[0] + d[1];
      s.rolled = d; ev.push({ e: 'roll', p, d });
      if (sum === 7) {
        s.discard = {};
        s.players.forEach((q, i) => { const n = tot(q.hand); if (n > RULES.discardOver) s.discard[i] = Math.floor(n / 2); });
        s.phase = Object.keys(s.discard).length ? 'discard' : 'storm';
        ev.push({ e: 'seven', p, discard: { ...s.discard } });
      } else { produce(s, sum, ev); s.phase = 'main'; }
      break;
    }
    case 'discard': {
      const n = s.phase === 'discard' && s.discard[p];
      if (!n) return fail('není co odhazovat');
      if (!isRes(a.res) || tot(a.res) !== n || !canPay(pl.hand, a.res)) return fail('neplatný výběr karet');
      pay(s, p, a.res); delete s.discard[p];
      ev.push({ e: 'discard', p, n, secret: { res: a.res }, see: [p] });
      if (!Object.keys(s.discard).length) s.phase = 'storm';
      break;
    }
    case 'storm': {
      if (!has(x => x.t === 'storm' && x.hex === a.hex && x.from === (a.from ?? null))) return fail('sem bouři přesunout nelze');
      s.storm = a.hex; ev.push({ e: 'storm', p, hex: a.hex });
      if (a.from !== null && a.from !== undefined) {
        const h = s.players[a.from].hand, pool = [];
        for (const r of RES) for (let i = 0; i < h[r]; i++) pool.push(r);
        const r = pool[rint(s, pool.length)];
        h[r]--; pl.hand[r]++;
        ev.push({ e: 'steal', p, from: a.from, secret: { res: r }, see: [p, a.from] });
      }
      s.phase = s.back || 'main'; delete s.back;
      break;
    }
    case 'buy': {
      if (!has(x => x.t === 'buy')) return fail('výpravu teď nelze koupit');
      pay(s, p, COST.card);
      const c = s.deck.pop();
      (c === 'point' ? pl.cards : pl.fresh).push(c);
      ev.push({ e: 'buy', p, secret: { card: c }, see: [p] });
      break;
    }
    case 'play': {
      if (!has(x => x.t === 'play' && x.card === a.card)) return fail('kartu teď nelze zahrát');
      if (a.card === 'supply') {
        if (!Array.isArray(a.res) || a.res.length !== 2 || !has(x => x.t === 'play' && x.card === 'supply' && ((x.res[0] === a.res[0] && x.res[1] === a.res[1]) || (x.res[0] === a.res[1] && x.res[1] === a.res[0])))) return fail('neplatný výběr surovin');
      }
      pl.cards.splice(pl.cards.indexOf(a.card), 1); s.played = true;
      ev.push({ e: 'play', p, card: a.card });
      if (a.card === 'guard') { pl.guards++; updateBonus(s); s.back = s.phase === 'roll' ? 'roll' : 'main'; s.phase = 'storm'; } // po přesunu bouře zpět k hodu, nebo dál v tahu
      else if (a.card === 'roads') s.freeRoads = Math.min(2, pl.left.road);
      else { const res = {}; for (const r of a.res) res[r] = (res[r] || 0) + give(s, p, r, 1); ev.push({ e: 'gain', p, res }); }
      break;
    }
    case 'bank': {
      const x = L.find(x => x.t === 'bank' && x.give === a.give && x.get === a.get);
      if (!x) return fail('tuto směnu nelze provést');
      pl.hand[a.give] -= x.rate; s.bank[a.give] += x.rate; give(s, p, a.get, 1);
      ev.push({ e: 'bank', p, give: a.give, get: a.get, rate: x.rate });
      break;
    }
    case 'offer': {
      if (!has(x => x.t === 'offer')) return fail('nabídku teď nelze podat');
      if (!isRes(a.give) || !isRes(a.want) || !tot(a.give) || !tot(a.want)) return fail('neplatná nabídka');
      if (RES.some(r => a.give[r] && a.want[r])) return fail('stejná surovina na obou stranách');
      if (!canPay(pl.hand, a.give)) return fail('nabízené suroviny chybí');
      const clean = o => Object.fromEntries(RES.filter(r => o[r]).map(r => [r, o[r]]));
      s.trade = { from: p, give: clean(a.give), want: clean(a.want), resp: {} };
      s.offers++;
      s.players.forEach((q, i) => { if (i !== p && !canPay(q.hand, s.trade.want)) s.trade.resp[i] = 'no'; });
      ev.push({ e: 'offer', p, give: s.trade.give, want: s.trade.want });
      closeIfDead(s, ev);
      break;
    }
    case 'respond': {
      if (!has(x => x.t === 'respond' && x.ok === !!a.ok)) return fail('na nabídku nelze odpovědět');
      s.trade.resp[p] = a.ok ? 'yes' : 'no';
      ev.push({ e: 'respond', p, ok: !!a.ok });
      closeIfDead(s, ev);
      break;
    }
    case 'confirm': {
      if (!has(x => x.t === 'confirm' && x.with === a.with)) return fail('obchod nelze potvrdit');
      const tr = s.trade, q = s.players[a.with];
      if (!canPay(pl.hand, tr.give) || !canPay(q.hand, tr.want)) { s.trade = null; ev.push({ e: 'tradeEnd', p }); break; }
      for (const r of RES) {
        const g = tr.give[r] || 0, w = tr.want[r] || 0;
        pl.hand[r] += w - g; q.hand[r] += g - w;
      }
      ev.push({ e: 'trade', p, with: a.with, give: tr.give, want: tr.want });
      s.trade = null;
      break;
    }
    case 'cancel': {
      if (!has(x => x.t === 'cancel')) return fail('není co rušit');
      s.trade = null; ev.push({ e: 'tradeEnd', p });
      break;
    }
    case 'end': {
      if (!has(x => x.t === 'end')) return fail('tah teď nelze ukončit');
      pl.cards.push(...pl.fresh); pl.fresh = [];
      s.turn = (s.turn + 1) % s.players.length;
      s.turnNo++; s.phase = 'roll'; s.played = false; s.offers = 0; s.freeRoads = 0; s.rolled = null;
      ev.push({ e: 'turn', p: s.turn });
      break;
    }
    default: return fail('neznámá akce');
  }
  if (s.phase !== 'setup' && s.phase !== 'end' && points(s, s.turn, true) >= s.target) {
    s.phase = 'end'; s.winner = s.turn; s.trade = null;
    ev.push({ e: 'win', p: s.turn });
  }
  return { ok: true, ev };
}

function closeIfDead(s, ev) {
  const tr = s.trade;
  if (s.players.every((_, i) => i === tr.from || tr.resp[i] === 'no')) { s.trade = null; ev.push({ e: 'tradeEnd', p: tr.from }); }
}

function setupStep(s, p, a, ev) {
  const su = s.setup;
  if (a.kind === 'settle') {
    su.last = a.at; su.step = 'road';
    if (su.i >= s.players.length) { // druhá osada dává suroviny z okolních dílků
      const g = graph(s.map.hexes), res = {};
      for (const h of g.V[a.at].hex) { const r = TERRAIN[s.map.hexes[h].t]; if (r) res[r] = (res[r] || 0) + give(s, p, r, 1); }
      ev.push({ e: 'gain', p, res });
    }
    return;
  }
  su.i++; su.step = 'settle'; su.last = null;
  if (su.i >= su.order.length) { s.phase = 'roll'; s.turn = s.first; s.setup = null; ev.push({ e: 'turn', p: s.turn }); }
  else { s.turn = su.order[su.i]; ev.push({ e: 'turn', p: s.turn }); }
}

function produce(s, sum, ev) {
  const g = graph(s.map.hexes), n = s.players.length;
  const claim = s.players.map(() => ({}));
  s.map.hexes.forEach((h, i) => {
    if (h.n !== sum || i === s.storm) return;
    const r = TERRAIN[h.t];
    for (const v of g.hv[i]) { const b = s.bld[v]; if (b) claim[b.p][r] = (claim[b.p][r] || 0) + (b.c ? 2 : 1); }
  });
  const got = s.players.map(() => ({}));
  for (const r of RES) { // když banka nestačí, rozdává se po jedné v pořadí od hráče na tahu
    let left = true;
    while (left && s.bank[r] > 0) {
      left = false;
      for (let k = 0; k < n && s.bank[r] > 0; k++) {
        const q = (s.turn + k) % n;
        if (claim[q][r] > 0) { claim[q][r]--; give(s, q, r, 1); got[q][r] = (got[q][r] || 0) + 1; left = true; }
      }
    }
  }
  got.forEach((res, q) => { if (Object.keys(res).length) ev.push({ e: 'gain', p: q, res }); });
}
