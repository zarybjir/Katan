// Dialogy: obchod, odhození karet, výpravy, výběr surovin.
import { h, clear, modal, pc, dot } from './dom.js';
import { RES, RES_NAME, RES_COLOR, CARDS, CARD_TEXT, COLORS } from '../data.js';
import { fmtRes } from './text.js';

export const resTile = (r, n, o = {}) => h('button', { class: 'res' + (o.on ? ' on' : ''), style: `--c:${RES_COLOR[r]}`, disabled: !!o.off, 'data-res': r, onclick: o.click || null },
  h('b', null, String(n)), h('span', null, RES_NAME[r]));

// výběr počtů surovin: max(r) omezuje, limit = nejvyšší součet
export function picker(max, limit, onChange) {
  const val = Object.fromEntries(RES.map(r => [r, 0]));
  const el = h('div', { class: 'picker' });
  const sum = () => RES.reduce((a, r) => a + val[r], 0);
  const draw = () => {
    clear(el);
    for (const r of RES) {
      const can = val[r] < max(r) && sum() < limit;
      el.append(h('div', { class: 'pick' },
        resTile(r, val[r], { off: !can, click: () => { val[r]++; draw(); onChange && onChange(val); } }),
        h('button', { class: 'minus', disabled: !val[r], onclick: () => { val[r]--; draw(); onChange && onChange(val); } }, '−')));
    }
  };
  draw();
  return { el, val, sum };
}

export function tradeDialog(v, act) {
  const L = v.legal, hand = v.players[v.you].hand;
  const body = h('div', { class: 'col' });
  // banka
  const bank = L.filter(a => a.t === 'bank');
  let give = null, get = null;
  const bankBox = h('div', { class: 'col' });
  const drawBank = () => {
    clear(bankBox);
    bankBox.append(h('h3', null, 'Směna s bankou'));
    if (!bank.length) { bankBox.append(h('p', { class: 'dim' }, 'Na směnu není dost stejných surovin.')); return; }
    bankBox.append(h('p', { class: 'dim' }, 'Dává se'),
      h('div', { class: 'row' }, RES.map(r => { const a = bank.find(a => a.give === r); return resTile(r, a ? a.rate : hand[r], { off: !a, on: give === r, click: () => { give = r; if (get === r) get = null; drawBank(); } }); })),
      h('p', { class: 'dim' }, 'Získá se'),
      h('div', { class: 'row' }, RES.map(r => resTile(r, 1, { off: !give || !bank.some(a => a.give === give && a.get === r), on: get === r, click: () => { get = r; drawBank(); } }))),
      h('button', { class: 'btn', id: 'bank-go', disabled: !(give && get), onclick: () => { m.close(); act({ t: 'bank', give, get }); } }, 'Směnit'));
  };
  drawBank();
  body.append(bankBox);
  // hráči
  if (L.some(a => a.t === 'offer')) {
    const go = h('button', { class: 'btn', id: 'offer-go', disabled: true }, 'Nabídnout');
    const upd = () => { go.disabled = !(pg.sum() && pw.sum()) || RES.some(r => pg.val[r] && pw.val[r]); };
    const pg = picker(r => hand[r], 20, upd), pw = picker(() => 9, 20, upd);
    go.onclick = () => { m.close(); act({ t: 'offer', give: { ...pg.val }, want: { ...pw.val } }); };
    body.append(h('h3', null, 'Nabídka hráčům'), h('p', { class: 'dim' }, 'Nabízí se'), pg.el, h('p', { class: 'dim' }, 'Požaduje se'), pw.el, go);
  }
  const m = modal('Obchod', body);
  return m;
}

// příchozí nabídka
export function respondDialog(v, act) {
  const tr = v.trade, can = v.legal.some(a => a.t === 'respond' && a.ok);
  return modal('Nabídka obchodu', h('div', { class: 'col' },
    h('p', null, `${v.players[tr.from].name} nabízí ${fmtRes(tr.give)} za ${fmtRes(tr.want)}.`),
    !can && h('p', { class: 'dim' }, 'Požadované suroviny v ruce nejsou.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn', id: 'resp-yes', disabled: !can, onclick: () => act({ t: 'respond', ok: true }) }, 'Přijmout'),
      h('button', { class: 'btn ghost', id: 'resp-no', onclick: () => act({ t: 'respond', ok: false }) }, 'Odmítnout'))), { sticky: true, key: 'auto' });
}

// vlastní nabídka: stav odpovědí
export function offerDialog(v, act) {
  const tr = v.trade;
  return modal('Nabídka odeslána', h('div', { class: 'col' },
    h('p', null, `${fmtRes(tr.give)} za ${fmtRes(tr.want)}`),
    v.players.map((p, i) => i === tr.from ? null : h('div', { class: 'line' },
      dot(i), h('span', { class: 'grow' }, p.name),
      tr.resp[i] === 'yes' ? h('button', { class: 'btn small', onclick: () => act({ t: 'confirm', with: i }) }, 'Obchodovat')
        : h('span', { class: 'dim' }, tr.resp[i] === 'no' ? 'odmítnuto' : 'čeká se'))),
    h('button', { class: 'btn ghost', id: 'offer-cancel', onclick: () => act({ t: 'cancel' }) }, 'Zrušit nabídku')), { sticky: true, key: 'auto' });
}

export function discardDialog(v, n, act) {
  const hand = v.players[v.you].hand;
  const go = h('button', { class: 'btn', id: 'discard-go', disabled: true }, `Odhodit (0 / ${n})`);
  const p = picker(r => hand[r], n, () => { go.disabled = p.sum() !== n; go.textContent = `Odhodit (${p.sum()} / ${n})`; });
  go.onclick = () => act({ t: 'discard', res: { ...p.val } });
  return modal('Bouře: odhození karet', h('div', { class: 'col' },
    h('p', null, `V ruce je příliš mnoho karet. Odhazuje se ${n}.`),
    h('p', { class: 'dim' }, 'V ruce: ' + fmtRes(hand)), p.el, go), { sticky: true, key: 'auto' });
}

export function cardsDialog(v, act) {
  const me = v.players[v.you], L = v.legal;
  const count = list => list.reduce((o, c) => { o[c] = (o[c] || 0) + 1; return o; }, {});
  const have = count(me.cards), fresh = count(me.fresh);
  const body = h('div', { class: 'col' });
  const kinds = Object.keys(CARDS).filter(c => have[c] || fresh[c]);
  if (!kinds.length) body.append(h('p', { class: 'dim' }, 'Žádné karty výprav.'));
  for (const c of kinds) {
    const can = L.some(a => a.t === 'play' && a.card === c);
    body.append(h('div', { class: 'card' }, h('img', { class: 'card-art', src: `gfx/karta-${c}.jpg`, alt: '' }),
      h('div', { class: 'grow' }, h('b', null, `${CARDS[c]} ${(have[c] || 0) + (fresh[c] || 0)}×`), h('p', { class: 'dim' }, CARD_TEXT[c] + (fresh[c] ? ' Koupená karta jde zahrát od dalšího tahu.' : ''))),
      c !== 'point' && h('button', { class: 'btn small', 'data-card': c, disabled: !can, onclick: () => {
        m.close();
        if (c !== 'supply') return act({ t: 'play', card: c });
        const go = h('button', { class: 'btn', disabled: true }, 'Vzít');
        const p = picker(r => Math.min(2, v.bank[r]), 2, () => { go.disabled = p.sum() !== 2; });
        const m2 = modal('Zásoby: dvě suroviny z banky', h('div', { class: 'col' }, p.el, go));
        go.onclick = () => { m2.close(); act({ t: 'play', card: 'supply', res: RES.flatMap(r => Array(p.val[r]).fill(r)) }); };
      } }, 'Zahrát')));
  }
  if (v.played) body.append(h('p', { class: 'dim' }, 'V tomto tahu už byla karta zahrána.'));
  const m = modal('Výpravy', body);
  return m;
}
