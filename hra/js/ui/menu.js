// Obrazovky mimo hru: nabídka, založení hry, připojení, lobby.
import { h, clear } from './dom.js';
import { NAME, COLORS, COLOR_NAME, BOT_LEVEL, RULES, MAPS, MAP_TEXT } from '../data.js';
import { genMap } from '../core/mapgen.js';
import { createBoard } from './board.js';

const screen = (root, ...kids) => clear(root).append(h('div', { class: 'screen' }, kids));

// A: { settings, saveSettings(), hasSaved, newGame(), join(), resume() }
export function showMenu(root, A) {
  const name = h('input', { id: 'name', maxlength: 16, value: A.settings.name, placeholder: 'Jméno hráče', oninput: () => { A.settings.name = name.value; A.saveSettings(); } });
  screen(root, h('h1', null, NAME), h('p', { class: 'dim' }, 'Tahová strategie pro 2–6 hráčů'),
    h('label', null, 'Jméno', name),
    h('button', { class: 'btn', id: 'm-new', onclick: A.newGame }, 'Nová hra'),
    h('button', { class: 'btn', id: 'm-join', onclick: A.join }, 'Připojit se'),
    A.hasSaved && h('button', { class: 'btn ghost', id: 'm-resume', onclick: A.resume }, 'Pokračovat v uložené hře'),
    h('button', { class: 'btn ghost', id: 'm-anim', onclick: A.anim }, 'Animace a zvuky'),
    A.lan && h('button', { class: 'btn ghost', id: 'm-update', onclick: A.update }, 'Zkontrolovat aktualizace'),
    h('p', { class: 'dim small' }, A.version ? 'verze ' + A.version : ''));
}

// založení hry: počet hráčů, obsazení míst, cíl
export function showSetup(root, A, onStart, onBack) {
  const cfg = A.settings.setup || { n: 4, target: RULES.target, seats: [] };
  if (!MAPS[cfg.map] && cfg.map !== 'random') cfg.map = 'island';
  const types = Object.keys(MAPS);
  let seed, type; // náhled ukazuje přesně tu mapu, na které se bude hrát
  const reroll = () => { seed = (Math.random() * 2 ** 31) | 0; type = cfg.map === 'random' ? types[seed % types.length] : cfg.map; };
  reroll();
  const KINDS = [['local', 'Hráč na tomto zařízení'], ['open', 'Hráč po síti'], ['bot:easy', 'Bot – ' + BOT_LEVEL.easy], ['bot:mid', 'Bot – ' + BOT_LEVEL.mid], ['bot:hard', 'Bot – ' + BOT_LEVEL.hard]];
  const draw = () => {
    while (cfg.seats.length < cfg.n) cfg.seats.push({ k: cfg.seats.length ? 'bot:mid' : 'local', name: '' });
    const seats = cfg.seats.slice(0, cfg.n);
    // každé místo má jinou barvu; chybějící nebo zdvojenou doplní první volná
    const used = new Set();
    seats.forEach(s => { if (!Number.isInteger(s.c) || s.c < 0 || s.c >= COLORS.length || used.has(s.c)) s.c = -1; else used.add(s.c); });
    seats.forEach(s => { if (s.c < 0) { s.c = COLORS.findIndex((_, k) => !used.has(k)); used.add(s.c); } });
    let locals = 0;
    screen(root, h('h2', null, 'Nová hra'),
      h('label', null, 'Počet hráčů', h('div', { class: 'row' }, [2, 3, 4, 5, 6].map(n => h('button', { class: 'btn small' + (cfg.n === n ? ' on' : ''), 'data-n': n, onclick: () => { cfg.n = n; draw(); } }, String(n))))),
      mapBox(),
      seats.map((s, i) => {
        const first = s.k === 'local' && locals++ === 0;
        const sel = h('select', { 'data-seat': i, onchange: () => { s.k = sel.value; draw(); } }, KINDS.map(([k, t]) => h('option', { value: k, selected: s.k === k }, t)));
        const nm = s.k === 'local' && h('input', { maxlength: 16, value: s.name || (first ? A.settings.name : ''), placeholder: 'Jméno', oninput: () => { s.name = nm.value; } });
        // výběr barvy: barva jiného místa se s ním prohodí
        const pick = h('div', { class: 'colors' }, COLORS.map((c, k) => h('button', { class: 'cdot' + (s.c === k ? ' on' : ''), style: `--c:${c}`, title: COLOR_NAME[k], 'data-color': k, 'aria-label': COLOR_NAME[k],
          onclick: e => { e.preventDefault(); const o = seats.find(x => x !== s && x.c === k); if (o) o.c = s.c; s.c = k; draw(); } })));
        return h('div', { class: 'seat' }, h('span', { class: 'pdot big', style: `background:${COLORS[s.c]}` }), h('div', { class: 'col grow' }, sel, nm, pick));
      }),
      h('label', null, 'Cílový počet bodů', h('div', { class: 'row' }, [8, 10, 12].map(n => h('button', { class: 'btn small' + (cfg.target === n ? ' on' : ''), onclick: () => { cfg.target = n; draw(); } }, String(n))))),
      seats.some(s => s.k === 'open') && h('p', { class: 'dim' }, 'Hra se otevře pro připojení. Neobsazená místa po spuštění převezmou boti.'),
      h('button', { class: 'btn', id: 's-go', onclick: () => {
        A.settings.setup = cfg; A.saveSettings();
        let l = 0;
        onStart({ target: cfg.target, map: type, seed, seats: seats.map((s, i) => ({ color: s.c, ...(s.k.startsWith('bot') ? { kind: 'bot', level: s.k.slice(4) } : s.k === 'open' ? { kind: 'open' } : { kind: 'local', name: (s.name || (l++ === 0 ? A.settings.name : '')).trim() || 'Hráč ' + (i + 1) }) })) });
      } }, 'Pokračovat'),
      h('button', { class: 'btn ghost', onclick: onBack }, 'Zpět'));
  };
  function mapBox() {
    const sel = h('select', { id: 's-map', onchange: () => { cfg.map = sel.value; reroll(); draw(); } },
      [...types.map(k => [k, MAPS[k]]), ['random', 'Náhodná']].map(([k, t]) => h('option', { value: k, selected: cfg.map === k }, t)));
    const cv = h('canvas', { class: 'preview', id: 's-preview' });
    // náhled ukazuje jen tvar ostrova; krajiny, čísla a přístavy se rozmístí až při spuštění hry
    const m = genMap(seed, cfg.n, type);
    createBoard(cv, () => {}).setView({ map: { hexes: m.hexes.map(x => ({ q: x.q, r: x.r, t: 'blank', n: 0 })), ports: [] }, roads: {}, bld: {}, storm: -1 });
    return h('label', null, 'Mapa', sel, cv, h('div', { class: 'row' },
      h('span', { class: 'dim grow' }, (cfg.map === 'random' ? MAPS[type] + ': ' : '') + MAP_TEXT[type]),
      !type.startsWith('sym') && h('button', { class: 'btn small', id: 's-reroll', onclick: e => { e.preventDefault(); reroll(); draw(); } }, 'Jiný tvar')));
  }
  draw();
}

export function showJoin(root, A, onJoin, onBack) {
  const addr = h('input', { id: 'j-addr', value: A.settings.lastAddr || '', placeholder: 'Kód hry nebo adresa', autocapitalize: 'characters', autocomplete: 'off' });
  const found = h('div', { class: 'col' });
  const status = h('p', { class: 'dim', id: 'j-status' });
  const go = a => { if (!a.trim()) return; status.textContent = 'Připojování…'; onJoin(a.trim()).catch(e => { status.textContent = e.message; }); };
  screen(root, h('h2', null, 'Připojit se'),
    A.lan && h('label', null, 'Hry v místní síti', found),
    h('label', null, 'Kód hry (internet) nebo adresa (místní síť)', addr),
    h('button', { class: 'btn', id: 'j-go', onclick: () => go(addr.value) }, 'Připojit'), status,
    h('button', { class: 'btn ghost', onclick: onBack }, 'Zpět'));
  if (A.lan) found.append(h('p', { class: 'dim' }, 'Hledání…'));
  return list => {
    clear(found);
    if (!list.length) found.append(h('p', { class: 'dim' }, 'Žádná hra nenalezena.'));
    for (const g of list) found.append(h('button', { class: 'btn small', onclick: () => go(g.host + ':' + g.port) }, `${g.name} (${g.host})`));
  };
}

// lobby: m = zpráva lobby, net = řádky s údaji o připojení (jen hostitel)
export function showLobby(root, m, o) {
  screen(root, h('h2', null, o.host ? 'Hra čeká na hráče' : 'Čekání na spuštění hry'),
    o.net && h('div', { class: 'net', id: 'net' }, o.net.map(l => h('p', null, l))),
    m.seats.map((s, i) => h('div', { class: 'seat' + (m.you.includes(i) ? ' wrap' : '') }, h('span', { class: 'pdot big', style: `background:${COLORS[s.color ?? i]}` }),
      h('span', { class: 'grow' }, s.kind === 'bot' ? `${s.name} (bot, ${BOT_LEVEL[s.level]})` : s.kind === 'open' ? (s.taken ? s.name : 'volné místo') : s.name),
      m.you.includes(i) && h('span', { class: 'dim' }, 'toto zařízení'), s.kind === 'open' && s.taken && h('span', { class: 'dim' }, 'připojeno'),
      // vlastní místo: výběr barvy (barvy ostatních lidí jsou zašedlé)
      m.you.includes(i) && o.color && h('div', { class: 'colors full' }, COLORS.map((c, k) => {
        const owner = m.seats.findIndex((x, j) => j !== i && x.color === k), human = owner >= 0 && (m.seats[owner].kind === 'local' || (m.seats[owner].kind === 'open' && m.seats[owner].taken));
        return h('button', { class: 'cdot' + (s.color === k ? ' on' : ''), style: `--c:${c}`, title: COLOR_NAME[k], 'aria-label': COLOR_NAME[k], 'data-color': k, disabled: human, onclick: () => o.color(i, k) });
      })))),
    h('p', { class: 'dim' }, `Mapa: ${MAPS[m.map] || MAPS.island}, cíl: ${m.target} bodů`),
    o.host && h('button', { class: 'btn', id: 'l-start', onclick: o.start }, 'Spustit hru'),
    h('button', { class: 'btn ghost', id: 'l-leave', onclick: o.leave }, o.host ? 'Zrušit' : 'Odejít'));
}
