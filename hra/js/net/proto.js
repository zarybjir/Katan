// Tvary zpráv a jejich kontrola. Zprávy jsou JSON s polem `t`.
// klient → hostitel: hello {name, token, proto}, action {pid, a}, back {pid}, ping
// hostitel → klient: lobby {...}, view {pid, view, ev, seq, seats}, error {code, msg}, pong
import { NET } from '../data.js';

export function parse(text) {
  if (typeof text !== 'string' || text.length > NET.maxMsg) return null;
  try { const m = JSON.parse(text); return m && typeof m === 'object' && typeof m.t === 'string' ? m : null; } catch { return null; }
}
export const pack = m => JSON.stringify(m);
export const cleanName = n => (typeof n === 'string' ? n.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 16) : '') || 'Hráč';
export const okToken = t => typeof t === 'string' && t.length >= 8 && t.length <= 64;
export function newToken() {
  const a = new Uint8Array(12); globalThis.crypto.getRandomValues(a);
  return [...a].map(x => x.toString(16).padStart(2, '0')).join('');
}
const ABC = 'ABCDEFGHJKLMNPRSTUVXZ';
export function newCode() {
  const a = new Uint8Array(5); globalThis.crypto.getRandomValues(a);
  return [...a].map(x => ABC[x % ABC.length]).join('');
}
