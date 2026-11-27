// Přenos přes internet: WebRTC datový kanál (knihovna PeerJS v lib/). Kód hry = id hostitele.
// Signalizace jde přes veřejný broker PeerJS, herní data přímo mezi zařízeními (případně přes TURN z ICE).
import { ICE } from '../data.js';
const PREFIX = 'souostrovi-hra-';
// globalThis.__signal může přesměrovat signalizaci na vlastní server PeerJS (testy, vlastní provoz)
const opts = () => ({ config: { iceServers: ICE }, ...(globalThis.__signal || {}) });
let loading = null;
function lib() {
  if (globalThis.Peer) return Promise.resolve();
  return loading || (loading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'lib/peerjs.min.js'; s.onload = res; s.onerror = () => rej(new Error('Knihovnu pro spojení nelze načíst.'));
    document.head.appendChild(s);
  }));
}
const MSG = { 'unavailable-id': 'Kód hry je obsazený.', 'peer-unavailable': 'Hra s tímto kódem neexistuje.', network: 'Signalizační služba je nedostupná.', 'server-error': 'Signalizační služba je nedostupná.' };
const text = e => MSG[e && e.type] || 'Spojení přes internet se nezdařilo.';

function wrap(dc) {
  const c = { onmsg: null, onclose: null, send: t => { if (dc.open) dc.send(t); }, close: () => dc.close() };
  dc.on('data', d => typeof d === 'string' && c.onmsg && c.onmsg(d));
  dc.on('close', () => c.onclose && c.onclose());
  dc.on('error', () => c.onclose && c.onclose());
  return c;
}

export async function rtcListen(code, onConn) {
  await lib();
  return new Promise((res, rej) => {
    const peer = new globalThis.Peer(PREFIX + code, opts());
    let ready = false;
    peer.on('open', () => { ready = true; res({ stop: () => peer.destroy() }); });
    addEventListener('pagehide', () => peer.destroy());
    peer.on('connection', dc => dc.on('open', () => onConn(wrap(dc))));
    peer.on('disconnected', () => { if (!peer.destroyed) peer.reconnect(); }); // výpadek signalizace nepřeruší navázaná spojení
    peer.on('error', e => { if (!ready) { peer.destroy(); rej(new Error(text(e))); } });
  });
}

export async function rtcConnect(code) {
  await lib();
  return new Promise((res, rej) => {
    const peer = new globalThis.Peer(opts());
    let done = false;
    const fail = m => { if (!done) { done = true; peer.destroy(); rej(new Error(m)); } };
    peer.on('error', e => fail(text(e)));
    peer.on('open', () => {
      const dc = peer.connect(PREFIX + code.toUpperCase(), { reliable: true, serialization: 'raw' });
      const c = wrap(dc), close = c.close;
      c.close = () => { close(); peer.destroy(); };
      dc.on('open', () => { done = true; res(c); });
      addEventListener('pagehide', () => peer.destroy());
    });
    setTimeout(() => fail('Přímé spojení se nepodařilo navázat. Síť některého ze zařízení ho nedovoluje.'), 20000);
  });
}
