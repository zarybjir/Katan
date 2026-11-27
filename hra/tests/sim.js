// Simulace her botů pro ladění čísel. Spuštění: node hra/tests/sim.js [hráčů] [easy|mid|hard] [typ mapy]
import { newGame, view, total } from '../js/core/state.js';
import { apply, settleSpots } from '../js/core/rules.js';
import { points } from '../js/core/score.js';
import { botAct } from '../js/bot/bot.js';
import { next } from '../js/core/rng.js';
import { MAPS } from '../js/data.js';
const N = +process.argv[2] || 3, G = 200, lv = process.argv[3] || 'hard';
const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1], pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(a.length * p)];
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`hráčů ${N}, boti ${lv}, ${G} her na mapu`);
for (const map of (process.argv[4] ? [process.argv[4]] : Object.keys(MAPS))) {
  const rounds = [], seatWin = Array(N).fill(0), second = [], last = [], dead = [], c = { road: 0, settle: 0, city: 0, buy: 0, bank: 0, offer: 0, trade: 0, seven: 0, discard: 0, play: 0 };
  let longB = 0, guardB = 0, noSpot = 0, outSettle = 0, gainPerTurn = [], firstBuild = [], stuckTurns = 0, turnsAll = 0, waitMax = [];
  for (let seed = 1; seed <= G; seed++) {
    const s = newGame({ seed, names: Array.from({ length: N }, (_, i) => 'B' + i), map });
    const R = { rng: seed * 31 }, rnd = () => next(R);
    let acted = false, gained = 0, fb = null, deadT = 0, turns = 0, streak = Array(N).fill(0), maxStreak = 0;
    while (s.phase !== 'end') {
      for (let p = 0; p < N; p++) {
        const v = view(s, p); if (!v.legal.length) continue;
        const a = botAct(v, lv, rnd); if (!a) continue;
        const r = apply(s, p, a); if (!r.ok) throw new Error(r.err);
        for (const e of r.ev) {
          if (e.e === 'build' && s.phase !== 'setup' && s.turnNo >= 0 && s.setup === null) { c[e.kind]++; acted = true; if (fb === null && e.kind !== 'road') fb = s.turnNo / N; }
          if (e.e === 'buy') { c.buy++; acted = true; } if (e.e === 'bank') { c.bank++; } if (e.e === 'offer') { c.offer++; if (e.p !== 0 && s.trade && s.trade.resp[0] === undefined) c.dialog = (c.dialog || 0) + 1; } if (e.e === 'trade') { c.trade++; }
          if (e.e === 'seven') c.seven++; if (e.e === 'discard') c.discard++; if (e.e === 'play') { c.play++; }
          if (e.e === 'gain' && s.setup === null) gained += total(e.res);
          if (e.e === 'turn' && s.setup === null) { turns++; const prev = (e.p + N - 1) % N; if (!acted) { deadT++; streak[prev]++; maxStreak = Math.max(maxStreak, streak[prev]); } else streak[prev] = 0; acted = false; }
        }
        break;
      }
    }
    rounds.push(s.turnNo / N); seatWin[(s.winner - s.first + N) % N]++;
    const pts = s.players.map((_, i) => points(s, i, true)).sort((a, b) => b - a); second.push(pts[1]); last.push(pts[N - 1]);
    dead.push(deadT / turns); gainPerTurn.push(gained / turns); firstBuild.push(fb ?? 99); waitMax.push(maxStreak);
    if (s.long !== null) longB++; if (s.guard !== null) guardB++;
    s.phase = 'main'; for (let p = 0; p < N; p++) { if (!settleSpots(s, p).length) noSpot++; if (s.players[p].left.settle === 0) outSettle++; }
  }
  const g = x => (x / G).toFixed(1);
  console.log(`\n== ${MAPS[map]} ==`);
  console.log(`kol: medián ${med(rounds).toFixed(0)}, 10 % her do ${pct(rounds, .1).toFixed(0)}, 90 % do ${pct(rounds, .9).toFixed(0)}, max ${Math.max(...rounds).toFixed(0)}`);
  console.log(`výhry podle pořadí na tahu: ${seatWin.map(x => Math.round(x / G * 100) + ' %').join(' / ')}`);
  console.log(`body druhého: ${avg(second).toFixed(1)}, posledního: ${avg(last).toFixed(1)}`);
  console.log(`tahy bez stavby a koupě: ${(avg(dead) * 100).toFixed(0)} %, nejdelší série takových tahů jednoho hráče (medián): ${med(waitMax)}, 90 %: ${pct(waitMax, .9)}`);
  console.log(`surovin na tah (všichni dohromady): ${avg(gainPerTurn).toFixed(2)}, první osada/město v kole: ${med(firstBuild).toFixed(0)}`);
  console.log(`na hru: cest ${g(c.road)}, osad ${g(c.settle)}, měst ${g(c.city)}, výprav ${g(c.buy)}, zahraných ${g(c.play)}, směn s bankou ${g(c.bank)}, nabídek ${g(c.offer)}, obchodů ${g(c.trade)}, dialogů nabídky pro hráče 1: ${g(c.dialog || 0)}, sedmiček ${g(c.seven)}, odhození ${g(c.discard)}`);
  console.log(`bonus cesta udělen ${Math.round(longB / G * 100)} %, hlídky ${Math.round(guardB / G * 100)} %; hráčů bez místa pro osadu na konci ${g(noSpot)}, bez dílků osad ${g(outSettle)}`);
}
