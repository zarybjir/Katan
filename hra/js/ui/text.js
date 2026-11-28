// Texty: popis událostí do deníku a formátování surovin.
import { RES, RES_NAME, KIND_NAME, CARDS } from '../data.js';
import { describeExt, EXT_KIND } from '../ext/straze-ui.js'; // rozšíření

export const fmtRes = o => RES.filter(r => o[r]).map(r => `${o[r]}× ${RES_NAME[r]}`).join(', ') || 'nic';

// names: jména hráčů; vrací řádek deníku nebo null
export function describe(e, names) {
  const n = names[e.p] ?? '';
  switch (e.e) {
    case 'roll': return `${n}: hod ${e.d[0] + e.d[1]} (${e.d[0]} + ${e.d[1]})`;
    case 'gain': return Object.keys(e.res).length ? `${n}: zisk ${fmtRes(e.res)}` : null;
    case 'build': return `${n}: stavba – ${KIND_NAME[e.kind] || EXT_KIND[e.kind]}`; // rozšíření: věž
    case 'seven': return 'Padla sedmička, přichází bouře.';
    case 'discard': return `${n}: odhozeno karet: ${e.n}`;
    case 'storm': return `${n}: přesun bouře`;
    case 'steal': return `${n}: karta od hráče ${names[e.from]}` + (e.res ? ` (${RES_NAME[e.res]})` : '');
    case 'buy': return `${n}: koupě výpravy` + (e.card ? ` (${CARDS[e.card]})` : '');
    case 'play': return `${n}: zahraná karta – ${CARDS[e.card]}`;
    case 'bank': return `${n}: směna ${e.rate}× ${RES_NAME[e.give]} za 1× ${RES_NAME[e.get]}`;
    case 'offer': return `${n}: nabídka ${fmtRes(e.give)} za ${fmtRes(e.want)}`;
    case 'respond': return `${n}: nabídka ${e.ok ? 'přijata' : 'odmítnuta'}`;
    case 'trade': return `${n} a ${names[e.with]}: obchod ${fmtRes(e.give)} za ${fmtRes(e.want)}`;
    case 'tradeEnd': return 'Nabídka obchodu skončila.';
    case 'win': return `Hra skončila. Vítězí ${n}.`;
    default: return describeExt(e, names); // rozšíření
  }
}
