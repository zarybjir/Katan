// Klient: posílá akce, přijímá lobby a pohledy. Neobsahuje žádná pravidla.
import { parse, pack } from './proto.js';
import { PROTO, NET } from '../data.js';

// h: { onLobby(m), onView(m), onError(m), onClose() }; hello: { name, token } nebo null (místní spojení)
export function createClient(conn, hello, h) {
  const C = { conn, open: true };
  let seen = Date.now();
  const drop = () => { if (C.open) { C.open = false; clearInterval(beat); h.onClose && h.onClose(); } };
  // hlídání spojení: bez odpovědi hostitele po dobu NET.dead se spojení považuje za ztracené
  let last = Date.now();
  const beat = hello ? setInterval(() => {
    const t = Date.now();
    if (t - last > NET.ping * 3000) seen = t; // aplikace byla uspaná: nejdřív zkusit ping, až pak spojení zahodit
    last = t;
    if (Date.now() - seen > NET.dead * 1000) { conn.onclose = null; conn.close(); drop(); } else conn.send(pack({ t: 'ping' }));
  }, NET.ping * 1000) : 0;
  conn.onmsg = text => {
    seen = Date.now();
    const m = parse(text);
    if (!m) return;
    if (m.t === 'lobby') h.onLobby && h.onLobby(m);
    else if (m.t === 'view') h.onView && h.onView(m);
    else if (m.t === 'error') h.onError && h.onError(m);
  };
  conn.onclose = drop;
  if (hello) conn.send(pack({ t: 'hello', name: hello.name, token: hello.token, proto: PROTO }));
  C.act = (pid, a) => conn.send(pack({ t: 'action', pid, a }));
  C.back = pid => conn.send(pack({ t: 'back', pid }));
  C.color = (pid, c) => conn.send(pack({ t: 'color', pid, c }));
  C.close = () => { C.open = false; clearInterval(beat); conn.onclose = null; conn.close(); };
  return C;
}
