// Přenos po místní síti. Hostitel: WebSocket server v Android obalu (window.Android).
// Klient: spojení přes Android most, v prohlížeči přes běžný WebSocket.
const A = () => globalThis.Android;
const cb = () => (globalThis.AndroidCb = globalThis.AndroidCb || {});
export const lanAvailable = () => !!A();

export function lanListen(name, onConn) {
  const r = JSON.parse(A().startServer(name));
  if (r.error) throw new Error(r.error);
  const conns = new Map(), k = cb();
  k.onOpen = id => { const c = { onmsg: null, onclose: null, send: t => A().send(id, t), close: () => { A().closeClient(id); conns.delete(id); } }; conns.set(id, c); onConn(c); };
  k.onMessage = (id, t) => { const c = conns.get(id); c && c.onmsg && c.onmsg(t); };
  k.onClose = id => { const c = conns.get(id); conns.delete(id); c && c.onclose && c.onclose(); };
  return { port: r.port, ips: r.ips || [], stop: () => { A().stopServer(); conns.clear(); } };
}

export function lanConnect(addr) {
  const url = 'ws://' + (addr.includes(':') ? addr : addr + ':47600');
  return new Promise((res, rej) => {
    let open = false;
    const c = { onmsg: null, onclose: null };
    const fail = () => { if (open) c.onclose && c.onclose(); else rej(new Error('Spojení se nezdařilo.')); };
    if (A()) {
      const k = cb(), id = A().wsConnect(url);
      k.ws = k.ws || new Map(); k.ws.set(id, { open: () => { open = true; res(c); }, msg: t => c.onmsg && c.onmsg(t), close: fail });
      k.onWsOpen = i => k.ws.get(i)?.open();
      k.onWsMessage = (i, t) => k.ws.get(i)?.msg(t);
      k.onWsClose = i => { const x = k.ws.get(i); k.ws.delete(i); x && x.close(); };
      c.send = t => A().wsSend(id, t);
      c.close = () => { k.ws.delete(id); A().wsClose(id); };
    } else {
      let ws;
      try { ws = new WebSocket(url); } catch { rej(new Error('Neplatná adresa.')); return; }
      ws.onopen = () => { open = true; res(c); };
      ws.onmessage = e => c.onmsg && c.onmsg(e.data);
      ws.onclose = fail;
      c.send = t => ws.readyState === 1 && ws.send(t);
      c.close = () => { ws.onclose = null; ws.close(); };
    }
    setTimeout(() => { if (!open) { try { c.close && c.close(); } catch {} rej(new Error('Hostitel neodpovídá.')); } }, 8000);
  });
}

// hledání her v místní síti (jen v aplikaci)
export function lanDiscover(onList) {
  if (!A()) return () => {};
  cb().onFound = json => { try { onList(JSON.parse(json)); } catch {} };
  A().discover(true);
  return () => A().discover(false);
}
