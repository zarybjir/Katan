// ---------- Rozšíření „Stráže a cechy“ (pravidla) ----------
// Zapíná se volbou při zakládání hry (stav má pole `ext`). Celé rozšíření je ve složce js/ext/;
// do základní hry vedou jen háčky označené komentářem „rozšíření“. Smazání: složka js/ext/
// a řádky s tím komentářem (seznam v CLAUDE.md, oddíl Rozšíření).
import { graph } from '../core/hex.js';
import { rint } from '../core/rng.js';
import { RES, COST } from '../data.js';

// čísla rozšíření (ladí se simulací botů)
export const STRAZE = {
  tower: { wood: 1, stone: 1 },          // stavba věže (stupeň 1)
  towerUp: { stone: 1, grain: 1 },       // vylepšení na stupeň 2
  towers: 4,                             // věží na hráče
  guild: { grain: 2, sheep: 1 },         // otevření cechu ve městě
  pirateSums: [2, 3, 11, 12],            // součty, po kterých se flotila přiblíží
  pirateSteps: 5,                        // přiblížení do útoku
  defendPts: 1,                          // bod za nejsilnější obranu při útoku
  roadGuild: { wood: 1 },                // cena cesty se stavitelským cechem
  cardGuild: { sheep: 1, stone: 1 },     // první výprava v tahu s učeneckým cechem
  tradeRate: 3,                          // kupecký cech: směna s bankou
};
export const GUILDS = { trade: 'kupecký', build: 'stavitelský', learn: 'učenecký' };
export const GUILD_TEXT = {
  trade: 'Směna s bankou 3:1 pro všechny suroviny.',
  build: 'Cesta stojí jen dřevo.',
  learn: 'První výprava v každém tahu stojí ovci a kámen (bez obilí).',
};

export const init = s => { s.ext = { towers: {}, guild: {}, pirates: 0, vp: s.players.map(() => 0), learnTurn: -1 }; };
const has = (s, p, g) => Object.entries(s.ext.guild).some(([v, k]) => k === g && s.bld[v] && s.bld[v].p === p);
const tot = h => RES.reduce((a, r) => a + (h[r] || 0), 0);
const canPay = (hand, c) => RES.every(r => (hand[r] || 0) >= (c[r] || 0));
function pay(s, p, c) { for (const r of RES) if (c[r]) { s.players[p].hand[r] -= c[r]; s.bank[r] += c[r]; } }

// ---------- háčky pro základní pravidla ----------
export const tower = (s, v) => s.ext && s.ext.towers[v];             // věž na vrcholu (blokuje stavby i cizí cesty)
export const rate = (s, p, k) => (has(s, p, 'trade') ? Math.min(k, STRAZE.tradeRate) : k);
export function cost(s, p, kind) {
  if (kind === 'road' && has(s, p, 'build')) return STRAZE.roadGuild;
  if (kind === 'card' && has(s, p, 'learn') && s.ext.learnTurn !== s.turnNo) return STRAZE.cardGuild;
  return COST[kind];
}
export const points = (s, p) => s.ext.vp[p] || 0;
// bouři na dílek s cizí věží smí přesunout jen majitel věže
export function stormOk(s, p, hex) {
  const g = graph(s.map.hexes);
  return !g.hv[hex].some(v => s.ext.towers[v] && s.ext.towers[v].p !== p);
}
export const defense = (s, p) => Object.values(s.ext.towers).filter(t => t.p === p).reduce((a, t) => a + t.l, 0);
export const cities = (s, p) => Object.values(s.bld).filter(b => b.p === p && b.c).length;

// dovolené akce rozšíření v hlavní fázi
export function legal(s, p, out) {
  const g = graph(s.map.hexes), pl = s.players[p], mine = Object.values(s.ext.towers).filter(t => t.p === p).length;
  if (mine < STRAZE.towers && canPay(pl.hand, STRAZE.tower))
    for (const v of Object.values(g.V)) if (!s.bld[v.id] && !s.ext.towers[v.id] && v.edges.some(e => s.roads[e] === p)) out.push({ t: 'build', kind: 'tower', at: v.id });
  if (canPay(pl.hand, STRAZE.towerUp))
    for (const [v, t] of Object.entries(s.ext.towers)) if (t.p === p && t.l < 2) out.push({ t: 'build', kind: 'tup', at: v });
  if (canPay(pl.hand, STRAZE.guild))
    for (const [v, b] of Object.entries(s.bld)) if (b.p === p && b.c && !s.ext.guild[v]) for (const k of Object.keys(GUILDS)) if (!has(s, p, k)) out.push({ t: 'guild', at: v, g: k });
}

// provedení akce rozšíření; vrací false, když akce rozšíření nepatří
export function apply(s, p, a, ev) {
  if (a.t === 'build' && a.kind === 'tower') { pay(s, p, STRAZE.tower); s.ext.towers[a.at] = { p, l: 1 }; ev.push({ e: 'build', p, kind: 'tower', at: a.at, paid: true }); return true; }
  if (a.t === 'build' && a.kind === 'tup') { pay(s, p, STRAZE.towerUp); s.ext.towers[a.at].l = 2; ev.push({ e: 'build', p, kind: 'tup', at: a.at, paid: true }); return true; }
  if (a.t === 'guild') { pay(s, p, STRAZE.guild); s.ext.guild[a.at] = a.g; ev.push({ e: 'guild', p, at: a.at, g: a.g }); return true; }
  return false;
}
// po koupi výpravy (sleva učeneckého cechu platí jen jednou za tah)
export const bought = s => { s.ext.learnTurn = s.turnNo; };

// po hodu: přiblížení flotily, při posledním kroku útok
export function onRoll(s, sum, ev) {
  if (!STRAZE.pirateSums.includes(sum)) return;
  s.ext.pirates++;
  ev.push({ e: 'pirates', step: s.ext.pirates, of: STRAZE.pirateSteps });
  if (s.ext.pirates < STRAZE.pirateSteps) return;
  s.ext.pirates = 0;
  const def = s.players.map((_, p) => defense(s, p)), lost = {};
  s.players.forEach((pl, p) => {
    const n = cities(s, p);
    if (def[p] >= n) return;
    const res = {};
    for (let i = 0; i < n && tot(pl.hand) > 0; i++) { // jedna surovina za každé město
      const pool = RES.flatMap(r => Array(pl.hand[r]).fill(r)), r = pool[rint(s, pool.length)];
      pl.hand[r]--; s.bank[r]++; res[r] = (res[r] || 0) + 1;
    }
    if (Object.keys(res).length) { lost[p] = tot(res); ev.push({ e: 'raidLoss', p, n: tot(res), secret: { res }, see: [p] }); }
  });
  const max = Math.max(...def), top = def.map((d, i) => (d === max ? i : -1)).filter(i => i >= 0);
  const best = max > 0 && top.length === 1 ? top[0] : null;
  if (best !== null) s.ext.vp[best] += STRAZE.defendPts;
  ev.push({ e: 'raid', lost, best });
}
