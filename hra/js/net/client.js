// Klient: posílá akce, přijímá lobby a pohledy. Neobsahuje žádná pravidla.
import { parse, pack } from './proto.js';
import { PROTO } from '../data.js';

// h: { onLobby(m), onView(m), onError(m), onClose() }; hello: { name, token } nebo null (místní spojení)
export function createClient(conn, hello, h) {
  const C = { conn, open: true };
  conn.onmsg = text => {
    const m = parse(text);
    if (!m) return;
    if (m.t === 'lobby') h.onLobby && h.onLobby(m);
    else if (m.t === 'view') h.onView && h.onView(m);
    else if (m.t === 'error') h.onError && h.onError(m);
  };
  conn.onclose = () => { if (C.open) { C.open = false; h.onClose && h.onClose(); } };
  if (hello) conn.send(pack({ t: 'hello', name: hello.name, token: hello.token, proto: PROTO }));
  C.act = (pid, a) => conn.send(pack({ t: 'action', pid, a }));
  C.back = pid => conn.send(pack({ t: 'back', pid }));
  C.close = () => { C.open = false; conn.onclose = null; conn.close(); };
  return C;
}
