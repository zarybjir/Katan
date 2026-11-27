// Založení hry a pohled hráče.
import { genMap } from './mapgen.js';
import { rint, shuffle } from './rng.js';
import { legal } from './rules.js';
import { points } from './score.js';
import { RES, PIECES, RULES, bankSize, deckFor } from '../data.js';

export const emptyRes = () => Object.fromEntries(RES.map(r => [r, 0]));
export const total = h => RES.reduce((a, r) => a + (h[r] || 0), 0);

// opts: { seed, names: [...], target, map, colors: [index palety pro každého hráče] }
export function newGame(opts) {
  const n = opts.names.length, seed = opts.seed | 0;
  const map = genMap(seed, n, opts.map);
  const s = {
    v: 1, rng: (seed ^ 0x5bd1e995) | 0, target: opts.target || RULES.target, colors: opts.colors || opts.names.map((_, i) => i),
    map: { hexes: map.hexes, ports: map.ports }, storm: map.storm,
    players: opts.names.map(name => ({ name, hand: emptyRes(), cards: [], fresh: [], guards: 0, left: { ...PIECES } })),
    roads: {}, bld: {}, bank: Object.fromEntries(RES.map(r => [r, bankSize(n)])), deck: [],
    phase: 'setup', turn: 0, turnNo: 0, setup: null, rolled: null, discard: {},
    freeRoads: 0, played: false, offers: 0, trade: null,
    long: null, guard: null, longLen: opts.names.map(() => 0), winner: null,
  };
  for (const [c, k] of Object.entries(deckFor(n))) for (let i = 0; i < k; i++) s.deck.push(c);
  shuffle(s, s.deck);
  const first = rint(s, n), order = [];
  for (let i = 0; i < n; i++) order.push((first + i) % n);
  s.setup = { order: order.concat(order.slice().reverse()), i: 0, step: 'settle', last: null };
  s.turn = s.setup.order[0]; s.first = first;
  return s;
}

// Pohled hráče p (p = -1: divák). Cizí ruce a výpravy jen jako počty, bez balíčku a stavu náhody.
export function view(s, p) {
  const v = { ...s, you: p };
  delete v.rng; delete v.deck;
  v.deckN = s.deck.length;
  v.players = s.players.map((pl, i) => {
    const o = { name: pl.name, guards: pl.guards, left: pl.left, handN: total(pl.hand), cardN: pl.cards.length + pl.fresh.length, pts: points(s, i, i === p) };
    if (i === p) { o.hand = pl.hand; o.cards = pl.cards; o.fresh = pl.fresh; }
    return o;
  });
  if (s.phase === 'end') v.players.forEach((o, i) => { o.pts = points(s, i, true); });
  v.legal = p >= 0 ? legal(s, p) : [];
  return JSON.parse(JSON.stringify(v));
}

// Událost pro hráče p: tajná část (např. ukradená karta) jen pro zúčastněné.
export function eventsFor(ev, p) {
  return ev.map(e => {
    if (!e.secret) return e;
    const { secret, see, ...pub } = e;
    return see.includes(p) ? { ...pub, ...secret } : pub;
  });
}
