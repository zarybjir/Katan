// Herní obrazovka: hráči, mapa, ruka, tlačítka akcí, deník.
import { h, clear, modal, closeModals, toast, SYM } from './dom.js';
import { createBoard } from './board.js';
import { resTile, tradeDialog, respondDialog, offerDialog, discardDialog, cardsDialog } from './trade.js';
import { fmtRes } from './text.js';
import { RES, RES_NAME, RES_COLOR, COST, KIND_NAME, KIND_TEXT, COLORS, RULES, BOT_LEVEL, CARDS, CARD_TEXT } from '../data.js';

// S: { view(), seats, log, multi, pending, cur, act(a), accept(), leave(), netInfo() }
export function createGame(root, S) {
  let mode = null, over = false;
  const el = {
    players: h('div', { id: 'players' }), cv: h('canvas', { id: 'board' }), log: h('div', { id: 'log', onclick: showLog }),
    hint: h('div', { id: 'hint' }), hand: h('div', { id: 'hand' }), actions: h('div', { id: 'actions' }), pass: h('div', { id: 'pass' }),
  };
  clear(root).append(el.players, h('div', { id: 'mid' }, el.cv, el.log), h('div', { id: 'bar' }, el.hint, el.hand, el.actions), el.pass);
  const board = createBoard(el.cv, pick);
  const G = { update, board };

  const act = a => { mode = null; S.act(a); };

  function pick(t) {
    const v = S.view(), L = v.legal;
    if (t.type === 'h') {
      const c = L.filter(a => a.t === 'storm' && a.hex === t.id);
      if (c.length === 1) return act(c[0]);
      const m = modal('Bouře: komu vzít kartu', h('div', { class: 'col' }, c.map(a => h('button', { class: 'btn', onclick: () => { m.close(); act(a); } },
        `${SYM[a.from]} ${v.players[a.from].name} (karet: ${v.players[a.from].handN})`))));
      return;
    }
    const a = L.find(a => a.t === 'build' && a.at === t.id && (!mode || a.kind === mode));
    if (!a) return;
    if (a.kind !== 'city') return act({ t: 'build', kind: a.kind, at: a.at });
    const m = modal('Stavba města', h('div', { class: 'col' }, h('p', null, 'Osada se změní na město. Cena: ' + fmtRes(COST.city) + '.'),
      h('div', { class: 'row' }, h('button', { class: 'btn', id: 'city-ok', onclick: () => { m.close(); act({ t: 'build', kind: 'city', at: a.at }); } }, 'Postavit'), h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Zpět'))));
  }

  function update() {
    const v = S.view();
    if (!v) return;
    // předání zařízení mezi hráči na jednom zařízení
    clear(el.pass);
    if (S.pending !== null && S.pending !== undefined) {
      closeModals('auto');
      el.pass.className = 'show';
      el.pass.append(h('div', { class: 'box' }, h('h2', null, 'Předání zařízení'),
        h('p', null, h('span', { style: `color:${COLORS[S.pending]}` }, SYM[S.pending] + ' '), `Pokračuje ${v.players[S.pending].name}.`),
        h('button', { class: 'btn', id: 'pass-ok', onclick: () => S.accept() }, 'Pokračovat')));
      return;
    }
    el.pass.className = '';
    const me = v.you, L = v.legal, mine = v.players[me];
    const builds = k => L.filter(a => a.t === 'build' && a.kind === k);
    const free = L.length && L[0].free;
    if (mode && !builds(mode).length) mode = null;
    board.setView(v);

    // ---------- hráči ----------
    clear(el.players);
    v.players.forEach((p, i) => {
      const s = S.seats[i] || {};
      const waits = v.phase !== 'end' && (i === v.turn || (v.discard && v.discard[i]));
      el.players.append(h('button', { class: 'chip' + (waits ? ' turn' : '') + (i === me ? ' me' : ''), style: `--c:${COLORS[i]}`, onclick: () => playerInfo(v, i) },
        h('span', { class: 'sym' }, SYM[i]), h('span', { class: 'nm' }, p.name + (s.kind === 'bot' ? ' ·bot' : s.away ? ' ·bot' : s.online === false ? ' ·odpojeno' : '')),
        h('span', { class: 'st' }, `★${p.pts}  ▮${p.handN}` + (p.cardN ? `  ✦${p.cardN}` : '') + (v.long === i ? '  ⟿' : '') + (v.guard === i ? '  ⛨' : ''))));
    });

    // ---------- nabídka míst na mapě ----------
    let targets = null;
    if (v.phase === 'setup' && L.length) targets = L[0].kind === 'settle' ? { v: L.map(a => a.at) } : { e: L.map(a => a.at) };
    else if (L.length && L[0].t === 'storm') targets = { h: [...new Set(L.map(a => a.hex))] };
    else if (free) targets = { e: L.map(a => a.at) };
    else if (mode) targets = mode === 'road' ? { e: builds('road').map(a => a.at) } : { v: builds(mode).map(a => a.at) };
    board.setTargets(targets);

    // ---------- nápověda ----------
    const nm = v.players[v.turn].name;
    let hint;
    if (v.phase === 'end') hint = `Hra skončila. Vítězí ${v.players[v.winner].name}.`;
    else if (!L.length) hint = v.phase === 'discard' ? 'Čeká se na odhození karet.' : v.trade ? 'Probíhá nabídka obchodu.' : `Na tahu: ${nm}` + (v.phase === 'setup' ? ' (rozmístění)' : v.phase === 'storm' ? ' (přesun bouře)' : '');
    else if (v.phase === 'setup') {
      const two = v.setup.i >= v.players.length; // druhé kolo jde v opačném pořadí a dává suroviny
      hint = `Rozmístění, ${two ? '2' : '1'}. kolo: ` + (L[0].kind === 'settle' ? 'výběr místa pro osadu' + (two ? ' (dá suroviny z okolních dílků)' : '') : 'cesta k osadě');
    }
    else if (L[0].t === 'roll') hint = 'Tah začíná hodem kostkami.';
    else if (L[0].t === 'storm') hint = 'Bouře: výběr dílku, kam se přesune';
    else if (L[0].t === 'discard') hint = 'Bouře: odhození karet';
    else if (free) hint = `Stavba cesty zdarma (zbývá ${v.freeRoads})`;
    else if (mode) hint = `Výběr místa: ${KIND_NAME[mode]}`;
    else if (v.trade) hint = 'Probíhá nabídka obchodu.';
    else hint = 'Probíhá vlastní tah.';
    clear(el.hint).append(h('span', { class: 'grow' }, hint), h('button', { class: 'btn small', id: 'a-prices', onclick: () => prices(v) }, 'Ceník'));
    if (v.rolled) el.hint.append(h('span', { class: 'dice' }, h('i', null, String(v.rolled[0])), h('i', null, String(v.rolled[1]))));

    // ---------- ruka ----------
    clear(el.hand);
    if (mine && mine.hand) for (const r of RES) el.hand.append(resTile(r, mine.hand[r], { off: true }));

    // ---------- tlačítka ----------
    clear(el.actions);
    const btn = (id, label, on, click, cls = '') => h('button', { class: 'btn act ' + cls, id: 'a-' + id, disabled: !on, onclick: click }, label);
    // tlačítko, které při nedostupnosti nezamrzne, ale ukáže ceník s tím, co chybí
    const soft = (id, label, on, click, cls = '') => h('button', { class: 'btn act ' + cls + (on ? '' : ' off'), id: 'a-' + id, onclick: on ? click : () => prices(S.view()) }, label);
    const cost = k => h('span', { class: 'cost' }, RES.flatMap(r => Array(COST[k][r] || 0).fill(0).map(() => h('i', { style: `background:${RES_COLOR[r]}` }))));
    if (L.some(a => a.t === 'roll')) el.actions.append(btn('roll', 'Hodit kostkami', true, () => act({ t: 'roll' }), 'wide'));
    else if (v.phase === 'main' && v.turn === me && !free && !v.trade) {
      for (const k of ['road', 'settle', 'city'])
        el.actions.append(soft(k, [h('span', null, KIND_NAME[k][0].toUpperCase() + KIND_NAME[k].slice(1)), cost(k)], builds(k).length > 0, () => { mode = mode === k ? null : k; update(); }, mode === k ? 'on' : ''));
      el.actions.append(soft('buy', [h('span', null, 'Výprava'), cost('card')], L.some(a => a.t === 'buy'), () => act({ t: 'buy' })),
        btn('cards', `Karty (${mine.cards.length + mine.fresh.length})`, mine.cards.length + mine.fresh.length > 0, () => cardsDialog(v, act)),
        btn('trade', 'Obchod', L.some(a => a.t === 'bank' || a.t === 'offer'), () => tradeDialog(v, act)),
        btn('end', 'Konec tahu', L.some(a => a.t === 'end'), () => act({ t: 'end' }), 'end'));
    } else if (mine && mine.cards && mine.cards.length + mine.fresh.length) el.actions.append(btn('cards', `Karty (${mine.cards.length + mine.fresh.length})`, true, () => cardsDialog(v, act)));
    el.actions.append(h('button', { class: 'btn act ghost', id: 'a-menu', onclick: menu }, '☰'));

    // ---------- deník ----------
    clear(el.log);
    for (const line of S.log.slice(-2)) el.log.append(h('div', null, line));

    // ---------- automatické dialogy ----------
    closeModals('auto');
    const d = L.find(a => a.t === 'discard');
    if (d) discardDialog(v, d.n, act);
    else if (L.some(a => a.t === 'respond')) respondDialog(v, act);
    else if (v.trade && v.trade.from === me) offerDialog(v, act);
    if (v.phase === 'end' && !over) { over = true; gameOver(v); }
  }

  function playerInfo(v, i) {
    const p = v.players[i], s = S.seats[i] || {};
    const kind = s.kind === 'bot' ? `bot (${BOT_LEVEL[s.level]})` : s.away ? 'hraje bot (hráč je nečinný)' : s.online === false ? 'odpojeno' : 'hráč';
    modal(`${SYM[i]} ${p.name}`, h('div', { class: 'col' },
      h('p', null, `Body: ${p.pts} z ${v.target}`), h('p', null, `Karty surovin: ${p.handN}, výpravy: ${p.cardN}`),
      h('p', null, `Nejdelší cesta: ${v.longLen[i]}` + (v.long === i ? ` (bonus ${RULES.longPts} body)` : '')),
      h('p', null, `Zahrané hlídky: ${p.guards}` + (v.guard === i ? ` (bonus ${RULES.guardPts} body)` : '')),
      h('p', null, `Zbývá: cesty ${p.left.road}, osady ${p.left.settle}, města ${p.left.city}`), h('p', { class: 'dim' }, kind)));
  }
  function showLog() {
    const box = h('div', { class: 'col loglist' }, S.log.slice(-80).map(l => h('div', null, l)));
    modal('Deník', box);
    box.scrollTop = 1e6;
  }
  function menu() {
    const info = S.netInfo && S.netInfo();
    const m = modal('Hra', h('div', { class: 'col' },
      info && h('div', { class: 'col' }, info.map(l => h('p', { class: 'dim' }, l))),
      S.away && S.away() && h('button', { class: 'btn', onclick: () => { m.close(); S.back(); } }, 'Převzít hru zpět od bota'),
      h('button', { class: 'btn', onclick: () => { m.close(); prices(S.view()); } }, 'Ceník'),
      h('button', { class: 'btn', onclick: () => { m.close(); rules(); } }, 'Pravidla'),
      h('button', { class: 'btn', onclick: () => { m.close(); board.moved = false; board.fit(); } }, 'Vystředit mapu'),
      h('button', { class: 'btn ghost', id: 'leave', onclick: () => { m.close(); const c = modal('Opustit hru', h('div', { class: 'col' }, h('p', null, S.host ? 'Hra zůstane uložená a půjde v ní pokračovat. Připojení hráči budou odpojeni.' : 'Do hry se lze vrátit přes nabídku Připojit se.'),
        h('div', { class: 'row' }, h('button', { class: 'btn', id: 'leave-ok', onclick: () => { c.close(); S.leave(); } }, 'Opustit'), h('button', { class: 'btn ghost', onclick: () => c.close() }, 'Zpět')))); } }, 'Opustit hru'),
      S.version && h('p', { class: 'dim small' }, 'verze ' + S.version)));
  }
  // ceník: co lze koupit, cena, k čemu to je a co hráči chybí
  function prices(v) {
    const me = v.you, pl = me >= 0 ? v.players[me] : null, hand = pl && pl.hand, L = v.legal;
    const mine = v.phase === 'main' && v.turn === me && !v.trade;
    const row = k => {
      const c = COST[k], can = k === 'card' ? L.some(a => a.t === 'buy') : L.some(a => a.t === 'build' && a.kind === k && !a.free);
      const miss = hand ? RES.filter(r => (c[r] || 0) > hand[r]).map(r => `${c[r] - hand[r]}× ${RES_NAME[r]}`) : [];
      const left = k === 'card' ? v.deckN : pl ? pl.left[k] : null;
      let st;
      if (!hand) st = '';
      else if (can) st = k === 'card' ? 'Lze koupit.' : 'Lze postavit.';
      else if (miss.length) st = 'Chybí: ' + miss.join(', ') + '.';
      else if (left === 0) st = k === 'card' ? 'Balíček je prázdný.' : 'Nezbývá žádný dílek.';
      else if (!mine) st = 'Nakupovat lze jen během vlastního tahu.';
      else st = k === 'city' ? 'Není osada, kterou by šlo vylepšit.' : 'Není volné místo napojené na vlastní cestu.';
      return h('div', { class: 'price' + (can ? ' can' : ''), 'data-kind': k },
        h('div', { class: 'line' }, h('b', { class: 'grow' }, KIND_NAME[k][0].toUpperCase() + KIND_NAME[k].slice(1)),
          left !== null && h('span', { class: 'dim' }, (k === 'card' ? 'v balíčku: ' : 'zbývá: ') + left)),
        h('div', { class: 'chips' }, RES.filter(r => c[r]).map(r => h('span', { class: 'chip-res' + (hand && hand[r] < c[r] ? ' lack' : ''), style: `--c:${RES_COLOR[r]}` }, `${c[r]}× ${RES_NAME[r]}`))),
        h('p', { class: 'dim' }, KIND_TEXT[k]),
        st && h('p', { class: 'st' }, st));
    };
    modal('Ceník', h('div', { class: 'col' }, ['road', 'settle', 'city', 'card'].map(row),
      h('p', { class: 'dim' }, `Chybějící suroviny lze získat obchodem: s bankou ${RULES.bankRate}:1, v přístavu ${RULES.portRate}:1 nebo ${RULES.portResRate}:1, nebo nabídkou ostatním hráčům.`)), { cls: 'prices' });
  }
  function rules() {
    modal('Pravidla', h('div', { class: 'col rules' },
      ['road', 'settle', 'city', 'card'].map(k => h('p', null, h('b', null, KIND_NAME[k] + ': '), fmtRes(COST[k]))),
      h('p', null, 'Hod kostkami určí číslo. Dílky s tímto číslem dají sousedním osadám jednu surovinu, městům dvě.'),
      h('p', null, `Osada je za 1 bod, město za 2. Nejdelší cesta (od ${RULES.longMin} úseků) a nejvíc zahraných hlídek (od ${RULES.guardMin}) dávají po ${RULES.longPts} bodech.`),
      h('p', null, `Při součtu 7 přichází bouře: kdo má víc než ${RULES.discardOver} karet, polovinu odhodí. Hráč na tahu bouři přesune; dílek pod bouří nevyrábí.`),
      h('p', null, `Směna s bankou je ${RULES.bankRate}:1, v přístavu ${RULES.portRate}:1 nebo ${RULES.portResRate}:1 za vyznačenou surovinu.`),
      h('p', null, 'Na začátku si každý postupně postaví osadu a k ní cestu. Pak ještě jednou v opačném pořadí; za druhou osadu hráč dostane po jedné surovině z každého sousedního dílku.'),
      h('p', null, 'Osada nesmí stát hned vedle jiné stavby a musí navazovat na vlastní cestu.'),
      Object.keys(CARDS).map(c => h('p', null, h('b', null, CARDS[c] + ': '), CARD_TEXT[c]))));
  }
  function gameOver(v) {
    const order = v.players.map((p, i) => ({ p, i })).sort((a, b) => b.p.pts - a.p.pts);
    modal('Konec hry', h('div', { class: 'col' },
      h('p', null, `Vítězí ${v.players[v.winner].name}.`),
      order.map(o => h('div', { class: 'line' }, h('span', { style: `color:${COLORS[o.i]}` }, SYM[o.i] + ' '), h('span', { class: 'grow' }, o.p.name), h('b', null, `${o.p.pts} b.`))),
      h('button', { class: 'btn', id: 'over-menu', onclick: () => { closeModals(); S.leave(true); } }, 'Do nabídky')), { key: 'over' });
  }
  G.toast = toast;
  return G;
}
