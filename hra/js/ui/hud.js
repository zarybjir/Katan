// Herní obrazovka: hráči, mapa, ruka, tlačítka akcí, deník.
import { h, clear, modal, closeModals, toast, pc, dot, setColors } from './dom.js';
import { createBoard } from './board.js';
import { icon } from './icons.js';
import { dice, deal, bankFlow, between, banner, cardShow, expand, sources, animDialog, FLY, GAP, DICE_ROLL } from './anim.js';
import { sfx, snd } from './sound.js';
import { resTile, tradeDialog, respondDialog, offerDialog, discardDialog, cardsDialog } from './trade.js';
import { fmtRes } from './text.js';
import { RES, RES_NAME, RES_COLOR, COST, TERRAIN, KIND_NAME, KIND_TEXT, COLORS, RULES, BOT_LEVEL, CARDS, CARD_TEXT } from '../data.js';

// S: { view(), seats, log, multi, pending, cur, act(a), accept(), leave(), netInfo() }
export function createGame(root, S) {
  let mode = null, over = false;
  const el = {
    players: h('div', { id: 'players' }), cv: h('canvas', { id: 'board' }), log: h('div', { id: 'log', onclick: showLog }),
    hint: h('div', { id: 'hint' }), hand: h('div', { id: 'hand' }), actions: h('div', { id: 'actions' }), pass: h('div', { id: 'pass' }),
  };
  clear(root).append(el.players, h('div', { id: 'mid' }, el.cv, el.log, h('div', { id: 'bank', title: 'banka' }, icon('bank', 30))), h('div', { id: 'bar' }, el.hint, el.hand, el.actions), el.pass);
  const board = createBoard(el.cv, pick);
  const G = { update, board };

  const act = a => { mode = null; S.act(a); };

  function pick(t) {
    const v = S.view(), L = v.legal;
    if (!t) { // klepnutí vedle zvýrazněných míst
      if (mode || v.phase === 'setup' || (L[0] && (L[0].t === 'storm' || L[0].free))) toast('Vybrat lze jen zvýrazněné místo.');
      return;
    }
    if (t.type === 'h') {
      const c = L.filter(a => a.t === 'storm' && a.hex === t.id);
      if (!c.length) return;
      if (c[0].from === null) return act(c[0]); // u dílku nikdo s kartami není
      // výběr, komu vzít kartu – i když je kandidát jen jeden
      const m = modal('Bouře: komu vzít kartu', h('div', { class: 'col' },
        h('p', { class: 'dim' }, 'Bouře se přesune na vybraný dílek. Jednomu hráči s budovou u dílku se vezme náhodná karta.'),
        c.map(a => h('button', { class: 'btn', 'data-from': a.from, onclick: () => { m.close(); act(a); } },
          `${v.players[a.from].name} (karet: ${v.players[a.from].handN})`)),
        h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Jiný dílek')), { key: 'storm' });
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
    setColors(v.colors);
    // předání zařízení mezi hráči na jednom zařízení
    clear(el.pass);
    if (S.pending !== null && S.pending !== undefined) {
      closeModals('auto');
      el.pass.className = 'show';
      el.pass.append(h('div', { class: 'box' }, h('h2', null, 'Předání zařízení'),
        h('p', null, dot(S.pending), `Pokračuje ${v.players[S.pending].name}.`),
        h('button', { class: 'btn', id: 'pass-ok', onclick: () => S.accept() }, 'Pokračovat')));
      return;
    }
    el.pass.className = '';
    const me = v.you, L = v.legal, mine = v.players[me];
    const builds = k => L.filter(a => a.t === 'build' && a.kind === k);
    const free = L.length && L[0].free;
    if (mode && !builds(mode).length) mode = null;
    setColors(v.colors);
    board.setView(v);

    // ---------- hráči ----------
    // nahoře soupeři (divák vidí všechny), dole vlastní pruh se surovinami
    const tag = (s, i) => s.kind === 'bot' ? ' ·bot' : s.away ? ' ·bot' : s.online === false ? ' ·odpojeno' : '';
    const waits = i => v.phase !== 'end' && (i === v.turn || !!(v.discard && v.discard[i]));
    const stat = (kind, n, title) => h('span', { class: 'stat', title }, icon(kind, 18), h('b', null, String(n)));
    const stats = (p, i) => [stat('cards', p.handN, 'karty surovin'), stat('special', p.cardN, 'výpravy'), stat('guard', p.guards, 'zahrané hlídky'), stat('points', p.pts, 'body'),
      v.long === i && h('span', { class: 'bonus', title: 'nejdelší cesta' }, '⟿'), v.guard === i && h('span', { class: 'bonus', title: 'nejvíc hlídek' }, '⛨')];
    clear(el.players);
    v.players.forEach((p, i) => {
      if (i === me) return;
      el.players.append(h('button', { class: 'chip' + (waits(i) ? ' turn' : ''), 'data-p': i, style: `--c:${pc(i)}`, onclick: () => playerInfo(v, i) },
        h('span', { class: 'nm' }, p.name + tag(S.seats[i] || {}, i)),
        h('span', { class: 'st' }, stats(p, i))));
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

    // ---------- vlastní pruh ----------
    clear(el.hand);
    el.hand.className = waits(me) ? 'turn' : '';
    if (mine && mine.hand) {
      el.hand.style.setProperty('--c', pc(me));
      el.hand.append(h('div', { class: 'res-row' }, RES.map(r => h('span', { class: 'have' + (mine.hand[r] ? '' : ' zero'), 'data-res': r }, icon(r, 30), h('b', null, String(mine.hand[r]))))),
        h('button', { class: 'mine', onclick: () => playerInfo(v, me) }, dot(me), stats(mine, me)));
    }

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
    modal(p.name, h('div', { class: 'col' },
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
      h('button', { class: 'btn', id: 'g-anim', onclick: () => { m.close(); animDialog(S.anim, S.saveAnim); } }, 'Animace a zvuky'),
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
      order.map(o => h('div', { class: 'line' }, dot(o.i), h('span', { class: 'grow' }, o.p.name), h('b', null, `${o.p.pts} b.`))),
      h('button', { class: 'btn', id: 'over-menu', onclick: () => { closeModals(); S.leave(true); } }, 'Do nabídky')), { key: 'over' });
  }
  // animace událostí (po překreslení, aby cílové prvky existovaly)
  G.animate = ev => {
    const v = S.view(), a = S.anim;
    if (!v || !ev.length) return;
    const target = (p, r) => p === v.you ? (r ? document.querySelector(`#hand .have[data-res=${r}]`) : document.getElementById('hand')) : document.querySelector(`.chip[data-p="${p}"]`);
    let sum = 0, fromBank = false;
    snd.on = a.sound !== false;
    const coin = () => sfx.coin(), gainS = r => sfx.gain(r);
    const nm = p => (v.players[p] ? v.players[p].name : '');
    const say = t => { if (a.banner !== false) banner(t); };
    const later = t => setTimeout(() => say(t), a.dice ? DICE_ROLL + 300 : 0); // až po dohození kostek
    const gains = [];
    // zvuk se ozve při doletu suroviny; když je animace vypnutá, hned
    const flow = (el, kinds, toBank, delay = 0) => {
      if (a.burn) bankFlow(el, kinds, toBank, delay, toBank ? coin : gainS);
      else kinds.forEach((k, i) => setTimeout(() => (toBank ? coin() : gainS(k)), delay + 120 * i));
    };
    for (const e of ev) {
      if (e.e === 'roll') { sum = e.d[0] + e.d[1]; if (a.dice) dice(e.d); sfx.dice(); }
      else if (e.e === 'seven') {
        setTimeout(() => sfx.storm(), a.dice ? DICE_ROLL : 0);
        later(e.discard && e.discard[v.you] ? `Bouře: odhození ${e.discard[v.you]} karet` : e.p === v.you ? 'Přesun bouře' : `Bouře: přesun – ${nm(e.p)}`);
      }
      else if (e.e === 'turn' && v.phase !== 'setup') { if (e.p === v.you) sfx.turn(); later(`Na tahu: ${nm(e.p)}`); }
      else if (e.e === 'storm' && e.p !== v.you) say(`${nm(e.p)} přesouvá bouři`);
      else if (e.e === 'steal') {
        sfx.steal();
        const k = [e.res || 'cards'];
        if (a.burn) between(target(e.from, e.res), target(e.p, e.res), k, 300, gainS);
        if (e.from === v.you) say(`${nm(e.p)} bere kartu` + (e.res ? ': ' + RES_NAME[e.res] : ''));
        else if (e.p === v.you && e.res) say(`Karta od hráče ${nm(e.from)}: ${RES_NAME[e.res]}`);
      }
      else if (e.e === 'trade') {
        say(`Obchod: ${nm(e.p)} a ${nm(e.with)}`);
        if (a.burn) { const g = expand(e.give), w = expand(e.want); between(target(e.p), target(e.with), g, 0, gainS); between(target(e.with), target(e.p), w, GAP * g.length + 300, gainS); }
      }
      else if (e.e === 'offer' && e.p !== v.you) { sfx.offer(); say(`Nabídka obchodu: ${nm(e.p)}`); }
      else if (e.e === 'win') { sfx.win(); say(`Vítězí ${nm(e.p)}`); }
      else if (e.e === 'play') { sfx.card(); if (e.card === 'supply') fromBank = true; if (a.banner !== false) cardShow(e.card, `${CARDS[e.card]}: ${nm(e.p)}`); if (e.card === 'guard' && e.p === v.you) say('Přesun bouře'); }
      else if (e.e === 'build') { sfx.build(e.kind); if (e.paid) flow(target(e.p), expand(COST[e.kind]), true); }
      else if (e.e === 'gain' && Object.keys(e.res).length) { if (fromBank) flow(target(e.p), expand(e.res), false); else gains.push(e); }
      else if (e.e === 'discard') flow(target(e.p), e.res ? expand(e.res) : Array(e.n).fill('cards'), true);
      else if (e.e === 'buy') { sfx.card(); flow(target(e.p), expand(COST.card), true); if (e.card && a.banner !== false) setTimeout(() => cardShow(e.card, 'Nová výprava: ' + CARDS[e.card]), 600); }
      else if (e.e === 'bank') { flow(target(e.p, e.give), Array(e.rate).fill(e.give), true); flow(target(e.p, e.get), [e.get], false, GAP * e.rate + FLY); }
    }
    const wait = sum && a.dice ? DICE_ROLL + 300 : 0;
    if (gains.length && a.deal) setTimeout(() => deal(gains, (p, r) => sources(S.view(), board, sum, p, r), target, gainS), wait);
    else if (gains.length) setTimeout(() => expand(Object.assign({}, ...gains.map(g => g.res))).slice(0, 6).forEach((r, i) => setTimeout(() => gainS(r), 120 * i)), wait);
  };
  G.toast = toast;
  return G;
}
