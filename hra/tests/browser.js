// Test rozhraní v prohlížeči (Playwright s Chromiem). Spuštění: node hra/tests/browser.js
// Projde nabídku, odehraje tahy proti botům, stavbu a směnu, hru ve dvou záložkách a předávání zařízení.
import { createRequire } from 'module';
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';
const { chromium } = createRequire(import.meta.url)('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const srv = createServer(async (q, r) => {
  try { const f = q.url.split('?')[0]; const b = await readFile(join(root, f === '/' ? 'index.html' : f)); r.writeHead(200, { 'content-type': MIME[extname(f)] || 'text/html' }); r.end(b); }
  catch { r.writeHead(404); r.end(); }
}).listen(0);
const URL0 = `http://127.0.0.1:${srv.address().port}/?fast`;
const out = join(root, 'tests', 'out');
const errs = [];
const ok = (c, m) => { if (!c) throw new Error(m); };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} čekáno ${JSON.stringify(b)}, je ${JSON.stringify(a)}`); };

async function open(ctx, name) {
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(`${name}: ${m.text()}`); });
  p.on('pageerror', e => errs.push(`${name}: ${e}`));
  await p.goto(URL0);
  await p.fill('#name', name);
  return p;
}
const view = p => p.evaluate(() => { const S = __so.S, v = S && S.view(); return v && { phase: v.phase, turn: v.turn, you: v.you, turnNo: v.turnNo, legal: v.legal, pending: S.pending, roads: Object.keys(v.roads).length, bld: Object.keys(v.bld).length, hand: v.players[v.you]?.hand, trade: v.trade }; });
const tapSpot = async (p, type, id) => { const c = await p.evaluate(([t, i]) => __so.S.G.board.px(t, i), [type, id]); await p.mouse.click(c.x, c.y); };
// klepnutí s chvěním prstu: součet pohybů přes 10 px, vzdálenost od začátku pod toleranci
const shakyTap = async (p, type, id) => {
  const c = await p.evaluate(([t, i]) => __so.S.G.board.px(t, i), [type, id]);
  await p.mouse.move(c.x, c.y); await p.mouse.down();
  for (const [dx, dy] of [[5, -4], [-6, 5], [4, 6], [-3, -5], [2, 1]]) await p.mouse.move(c.x + dx, c.y + dy, { steps: 2 });
  await p.mouse.up();
};
// jeden krok hráče přes rozhraní; vrací false, když není co dělat
async function step(p) {
  const v = await view(p);
  if (!v) return false;
  if (v.pending !== null) { await p.click('#pass-ok'); return true; }
  const L = v.legal;
  if (!L.length || v.phase === 'end') return false;
  const a = L[0];
  if (L.some(x => x.t === 'end')) await p.click('#a-end');
  else if (a.t === 'build') await shakyTap(p, a.kind === 'road' ? 'e' : 'v', a.at);
  else if (a.t === 'roll') await p.click('#a-roll');
  else if (a.t === 'storm') { await tapSpot(p, 'h', a.hex); const b = p.locator('.modal .btn').first(); if (await b.count()) await b.click(); }
  else if (a.t === 'discard') { for (let i = 0; i < a.n; i++) await p.locator('.picker .res:not([disabled])').first().click(); await p.click('#discard-go'); }
  else if (a.t === 'respond') await p.click('#resp-no', { timeout: 500 }).catch(() => {});
  else if (a.t === 'confirm' || a.t === 'cancel') await p.click('#offer-cancel', { timeout: 500 }).catch(() => {});
  else await p.click('#a-end');
  await p.waitForTimeout(60);
  return true;
}
const until = async (p, f, what, ms = 20000) => { const t = Date.now(); for (;;) { if (await f()) return; if (Date.now() - t > ms) throw new Error('čekání vypršelo: ' + what); await p.waitForTimeout(50); } };

const browser = await chromium.launch();
try {
  // ---------- hra proti botům ----------
  let ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, deviceScaleFactor: 2 });
  let p = await open(ctx, 'Jana');
  await p.click('#m-new'); await p.click('#s-go');
  await p.waitForSelector('#board');
  await until(p, async () => { await step(p); const v = await view(p); return v.phase === 'main' && v.turn === v.you && v.legal.length; }, 'první vlastní tah');
  let v = await view(p);
  ok(v.bld >= 8 && v.roads >= 8, `po rozmístění má být aspoň 8 osad a 8 cest, je ${v.bld} a ${v.roads}`);
  // suroviny pro stavbu (zásah do stavu hostitele, pak směna jako běžná akce)
  await p.evaluate(() => { const g = __so.S.host.g, h = g.players[__so.S.cur].hand; for (const r in h) { g.bank[r] -= 6 - h[r]; h[r] = 6; } __so.S.host.act(__so.S.cur, { t: 'bank', give: 'wood', get: 'brick' }); });
  await until(p, async () => (await view(p)).hand.brick === 7, 'směna přes hostitele');
  await p.screenshot({ path: join(out, 'hra-na-vysku.png') });
  await p.click('#a-prices'); ok((await p.locator('.price').count()) === 4, 'ceník nemá čtyři položky');
  ok((await p.locator('.price[data-kind=road]').textContent()).includes('Lze postavit'), 'ceník neukazuje, že cestu lze postavit');
  await p.screenshot({ path: join(out, 'cenik.png') }); await p.mouse.click(5, 5);
  await p.click('#a-trade'); await p.click('.box .row .res[data-res=stone]:not([disabled])'); await p.locator('.box .row').nth(1).locator('.res[data-res=grain]').click(); await p.click('#bank-go');
  await until(p, async () => (await view(p)).hand.grain === 7, 'směna s bankou přes dialog');
  const roads = (await view(p)).roads;
  await p.click('#a-road');
  v = await view(p);
  await tapSpot(p, 'e', v.legal.find(a => a.t === 'build' && a.kind === 'road').at);
  await until(p, async () => (await view(p)).roads === roads + 1, 'stavba cesty');
  await p.click('#a-buy');
  await p.click('#a-cards'); ok(await p.locator('.card').count() >= 1, 'koupená výprava není v seznamu'); await p.mouse.click(5, 5);
  const pts0 = await p.evaluate(() => __so.S.view().players[__so.S.cur].pts);
  await p.evaluate(() => { const g = __so.S.host.g, h = g.players[__so.S.cur].hand; g.bank.stone += h.stone; h.stone = 0; __so.S.refresh(); });
  await until(p, async () => (await view(p)).hand.stone === 0, 'odebrání kamene');
  await p.click('#a-city'); await p.waitForSelector('.price');
  ok((await p.locator('.price[data-kind=city]').textContent()).includes('Chybí: 3× kámen'), 'ceník neukazuje chybějící kámen');
  await p.mouse.click(5, 5);
  await p.evaluate(() => { const g = __so.S.host.g, h = g.players[__so.S.cur].hand; g.bank.stone -= 4; h.stone = 4; __so.S.refresh(); });
  await until(p, async () => (await view(p)).hand.stone === 4, 'vrácení kamene');
  await p.click('#a-city'); v = await view(p);
  await shakyTap(p, 'v', v.legal.find(a => a.t === 'build' && a.kind === 'city').at); await p.click('#city-ok', { timeout: 3000 });
  await until(p, async () => (await p.evaluate(() => __so.S.view().players[__so.S.cur].pts)) === pts0 + 1, 'stavba města');
  // nabídka obchodu botům
  await p.click('#a-trade'); await p.locator('.picker').nth(0).locator('.res[data-res=wood]').click(); await p.locator('.picker').nth(1).locator('.res[data-res=brick]').click(); await p.click('#offer-go');
  await until(p, async () => { const w = await view(p); if (w.trade && w.legal.some(a => a.t === 'cancel')) await p.click('#offer-cancel', { timeout: 300 }).catch(() => {}); return !w.trade; }, 'uzavření nabídky');
  await p.click('#a-menu'); await p.screenshot({ path: join(out, 'menu-hry.png') });
  await p.click('#g-anim'); await p.click('[data-anim=burn]');
  ok(await p.evaluate(() => JSON.parse(localStorage.getItem('so-set')).anim.burn === false), 'vypnutí animace se neuložilo');
  await p.click('[data-anim=burn]'); await p.mouse.click(5, 5);
  await p.click('#a-end');
  await until(p, async () => { await step(p); return (await view(p)).turnNo >= 9; }, 'několik kol hry', 60000);
  ok((await p.locator('#log div').count()) > 0, 'deník je prázdný');
  // uložená hra jde obnovit
  await until(p, async () => { // do cesty může vstoupit nabídka obchodu od bota
    await step(p);
    try { await p.click('#a-menu', { timeout: 400 }); await p.click('#leave', { timeout: 400 }); await p.click('#leave-ok', { timeout: 400 }); return true; } catch { return false; }
  }, 'opuštění hry');
  const tn = await p.evaluate(() => JSON.parse(localStorage.getItem('so-host')).g.turnNo);
  await p.click('#m-resume'); await p.waitForSelector('#board');
  await until(p, async () => !!(await view(p)), 'obnova hry');
  ok((await view(p)).turnNo >= tn, 'obnovená hra je starší než uložená');
  await ctx.close();

  // ---------- na šířku ----------
  ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  p = await open(ctx, 'Jana');
  await p.click('#m-new'); await p.click('[data-n="6"]'); await p.click('#s-go'); await p.waitForSelector('#board');
  await until(p, async () => { await step(p); const w = await view(p); return w.phase === 'main' && w.turn === w.you && w.legal.length; }, 'tah na šířku', 40000);
  await p.screenshot({ path: join(out, 'hra-na-sirku.png') });
  const bb = await p.locator('#a-end').boundingBox();
  ok(bb && bb.x + bb.width <= 844 && bb.y + bb.height <= 390, 'tlačítko Konec tahu je mimo obrazovku');
  await ctx.close();

  // ---------- dvě záložky (přenos tabs) ----------
  ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  const hp = await open(ctx, 'Hostitel');
  await hp.click('#m-new'); await hp.click('[data-n="3"]'); await hp.selectOption('[data-seat="1"]', 'open');
  await hp.selectOption('#s-map', 'atoll'); await hp.click('#s-reroll'); await hp.waitForSelector('#s-preview');
  await hp.locator('.seat').nth(0).locator('[data-color="7"]').click(); // hostitel: růžová
  await hp.locator('.seat').nth(1).locator('[data-color="0"]').click(); // hráč po síti: červená
  await hp.screenshot({ path: join(out, 'nova-hra.png') });
  await hp.click('#s-go');
  await hp.waitForSelector('#l-start');
  ok((await hp.locator('.screen').textContent()).includes('Mapa: Atol'), 'lobby neukazuje typ mapy');
  const code = await hp.evaluate(() => __so.S.host.code);
  ok((await hp.locator('#net').textContent()).includes(code), 'lobby neukazuje kód hry');
  const cp = await open(ctx, 'Klient');
  await cp.click('#m-join'); await cp.fill('#j-addr', code); await cp.click('#j-go');
  await cp.waitForSelector('#l-leave');
  await until(hp, async () => (await hp.locator('.seat').nth(1).textContent()).includes('Klient'), 'hostitel vidí klienta');
  await hp.screenshot({ path: join(out, 'lobby.png') });
  await hp.click('#l-start');
  await cp.waitForSelector('#board'); await hp.waitForSelector('#board');
  await until(hp, async () => { await step(hp); await step(cp); const a = await view(hp), b = await view(cp); return a.turnNo >= 4 && b.turnNo >= 4; }, 'hra ve dvou záložkách', 60000);
  const [a, b] = [await view(hp), await view(cp)];
  ok(a.you === 0 && b.you === 1 && a.roads === b.roads && a.bld === b.bld, 'hostitel a klient vidí různý stav');
  ok(await cp.evaluate(() => __so.S.view().map.hexes.every(h => Math.abs(h.q) + Math.abs(h.r) + Math.abs(h.q + h.r) >= 4)), 'klient nehraje na zvolené mapě (atol)');
  eq(await cp.evaluate(() => __so.S.view().colors), [7, 0, 2], 'barvy hráčů:');
  ok(await cp.evaluate(() => getComputedStyle(document.querySelector('.chip[data-p="0"]')).getPropertyValue('--c').trim() === '#ff3fae'), 'štítek hostitele u klienta nemá zvolenou barvu');
  ok(await cp.evaluate(() => !__so.S.view().players[0].hand && !!__so.S.view().players[1].hand), 'klient vidí cizí ruku');
  // odpojení klienta a návrat
  await cp.reload(); await cp.click('#m-join'); await cp.click('#j-go'); await cp.waitForSelector('#board');
  await until(cp, async () => { const w = await view(cp); return w && w.you === 1; }, 'návrat klienta do hry');
  await ctx.close();

  // ---------- jedno zařízení, dva hráči ----------
  ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
  p = await open(ctx, 'Jana');
  await p.click('#m-new'); await p.click('[data-n="2"]'); await p.selectOption('[data-seat="1"]', 'local'); await p.click('#s-go');
  await p.waitForSelector('#board');
  let passes = 0;
  await until(p, async () => { if (await p.locator('#pass-ok').count()) { passes++; if (passes === 1) await p.screenshot({ path: join(out, 'predani.png') }); } await step(p); return (await view(p)).turnNo >= 3; }, 'hra dvou hráčů na jednom zařízení', 40000);
  ok(passes >= 4, 'obrazovka předání zařízení se neukázala: ' + passes);
  await ctx.close();
} catch (e) { errs.push('TEST: ' + e.message); for (const c of browser.contexts()) for (const [i, pg] of c.pages().entries()) { await pg.screenshot({ path: join(out, `chyba-${i}.png`) }).catch(() => {}); errs.push('stav: ' + JSON.stringify(await view(pg).catch(() => null)).slice(0, 600)); } }
await browser.close(); srv.close();
if (errs.length) { console.log('CHYBY:\n' + errs.join('\n')); process.exit(1); }
console.log('prohlížeč: vše v pořádku, snímky v hra/tests/out/');
