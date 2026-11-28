// ---------- Rozšíření „Stráže a cechy“ (rozhraní) ----------
// Kreslení věží, ukazatel pirátů, dialog Stráže, výběr cechu, texty do deníku a hlášky.
import { h, modal, pc } from '../ui/dom.js';
import { resIcons } from '../ui/icons.js';
import { RES_NAME } from '../data.js';
import { STRAZE, GUILDS, GUILD_TEXT } from './straze.js';

export const EXT_KIND = { tower: 'věž', tup: 'vylepšení věže', guild: 'cech' };
export const EXT_COST = { tower: STRAZE.tower, tup: STRAZE.towerUp, guild: STRAZE.guild };

// věž: kamenná bašta v barvě hráče, stupeň 2 je vyšší a má druhé cimbuří
export function drawTowers(ctx, v, g) {
  for (const [id, t] of Object.entries(v.ext.towers)) {
    const { x, y } = g.V[id], w = 0.26, hh = t.l === 2 ? 0.52 : 0.38, top = y - hh + 0.1;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = 0.08 * ctx.getTransform().a; ctx.shadowOffsetY = 0.03 * ctx.getTransform().a;
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y + 0.1); ctx.lineTo(x - w / 2, top);
    for (let i = 0; i < 3; i++) { const cx = x - w / 2 + (i * w) / 2.5; ctx.lineTo(cx, top - 0.07); ctx.lineTo(cx + w / 5, top - 0.07); ctx.lineTo(cx + w / 5, top); ctx.lineTo(cx + w / 2.5, top); }
    ctx.lineTo(x + w / 2, top - 0.07); ctx.lineTo(x + w / 2, y + 0.1); ctx.closePath();
    ctx.fillStyle = pc(t.p); ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 0.035; ctx.stroke();
    if (t.l === 2) { ctx.beginPath(); ctx.moveTo(x - w / 2, top + 0.16); ctx.lineTo(x + w / 2, top + 0.16); ctx.stroke(); }
    ctx.beginPath(); ctx.rect(x - 0.035, y - 0.02, 0.07, 0.12); ctx.fillStyle = 'rgba(30,20,10,.7)'; ctx.fill(); // brána
    ctx.restore();
  }
}

// ukazatel flotily pod ikonou banky
export function pirateBadge(v) {
  const n = v.ext.pirates, of = STRAZE.pirateSteps;
  return h('div', { id: 'pirates', title: 'Pirátská flotila: při plném počtu zaútočí' }, '⚓ ', h('b', null, `${n}/${of}`));
}

// dialog Stráže: věž, vylepšení, cech a přehled obrany
export function guardDialog(v, builds, own, setMode) {
  const me = v.you, x = v.ext;
  const def = Object.values(x.towers).filter(t => t.p === me).reduce((a, t) => a + t.l, 0);
  const cities = Object.values(v.bld).filter(b => b.p === me && b.c).length;
  const mine = Object.entries(x.guild).filter(([at]) => v.bld[at] && v.bld[at].p === me).map(([, k]) => GUILDS[k]);
  const opt = k => h('button', { class: 'btn', 'data-ext': k, disabled: !(own && builds(k).length), onclick: () => { m.close(); setMode(k); } },
    EXT_KIND[k][0].toUpperCase() + EXT_KIND[k].slice(1) + ' ', resIcons(EXT_COST[k], 18));
  const m = modal('Stráže a cechy', h('div', { class: 'col' },
    h('p', null, `Obrana: ${def} (součet stupňů věží), města: ${cities}, piráti: ${x.pirates}/${STRAZE.pirateSteps}.`),
    h('p', { class: 'dim' }, `Flotila se přiblíží po součtu ${STRAZE.pirateSums.join(', ')}. Při útoku přijde o jednu surovinu za město každý, kdo má menší obranu než počet měst; nejsilnější obrana získá ${STRAZE.defendPts} bod.`),
    h('p', { class: 'dim' }, 'Věž stojí na volném vrcholu u vlastní cesty. Bouři na dílek u věže smí přesunout jen její majitel; cizí cestu věž zastaví.'),
    opt('tower'), opt('tup'), opt('guild'),
    h('p', { class: 'dim' }, mine.length ? 'Otevřené cechy: ' + mine.join(', ') : 'Cech se otevírá ve vlastním městě, každý druh jednou.')));
}

// výběr cechu pro město
export function guildPick(L, at, act) {
  const opts = L.filter(a => a.t === 'guild' && a.at === at);
  const m = modal('Cech ve městě', h('div', { class: 'col' }, opts.map(a => h('button', { class: 'btn', 'data-guild': a.g, onclick: () => { m.close(); act(a); } },
    h('span', null, h('b', null, GUILDS[a.g][0].toUpperCase() + GUILDS[a.g].slice(1)), ' – ', GUILD_TEXT[a.g]))),
    h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Zpět')));
}

// deník
export function describeExt(e, names) {
  const n = names[e.p] ?? '';
  if (e.e === 'guild') return `${n}: cech ${GUILDS[e.g]}`;
  if (e.e === 'pirates') return `Pirátská flotila se blíží (${e.step}/${e.of}).`;
  if (e.e === 'raidLoss') return `${n}: ztráta při útoku pirátů` + (e.res ? `: ${Object.entries(e.res).map(([r, k]) => `${k}× ${RES_NAME[r]}`).join(', ')}` : ` (${e.n} karet)`);
  if (e.e === 'raid') return 'Útok pirátů.' + (e.best !== null ? ` Nejsilnější obrana: ${names[e.best]} (+${STRAZE.defendPts} bod).` : '');
  return null;
}
// hláška uprostřed obrazovky
export function sayExt(e, names) {
  if (e.e === 'pirates' && e.step < e.of) return `Piráti se blíží: ${e.step}/${e.of}`;
  if (e.e === 'raid') return 'Útok pirátů' + (e.best !== null ? `. Obrana: ${names[e.best]}` : '');
  return null;
}
