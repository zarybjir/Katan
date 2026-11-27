// Přenos mezi záložkami prohlížeče (vývoj a testy): BroadcastChannel pojmenovaný kódem hry.
export function tabsListen(code, onConn) {
  const ch = new BroadcastChannel('so-' + code), conns = new Map();
  ch.onmessage = e => {
    const m = e.data;
    if (!m || m.to !== 'h') return;
    let c = conns.get(m.from);
    if (m.open && !c) {
      c = { onmsg: null, onclose: null, send: d => ch.postMessage({ to: m.from, d }), close: () => { ch.postMessage({ to: m.from, close: 1 }); conns.delete(m.from); } };
      conns.set(m.from, c); onConn(c);
      ch.postMessage({ to: m.from, ready: 1 });
    } else if (c && m.close) { conns.delete(m.from); c.onclose && c.onclose(); }
    else if (c && m.d !== undefined) c.onmsg && c.onmsg(m.d);
  };
  return { stop: () => { for (const c of conns.values()) c.close(); ch.close(); } };
}
export function tabsConnect(code) {
  return new Promise((res, rej) => {
    const ch = new BroadcastChannel('so-' + code), id = Math.random().toString(36).slice(2);
    let open = false;
    const c = { onmsg: null, onclose: null, send: d => ch.postMessage({ to: 'h', from: id, d }), close: () => { ch.postMessage({ to: 'h', from: id, close: 1 }); ch.close(); } };
    ch.onmessage = e => {
      const m = e.data;
      if (!m || m.to !== id) return;
      if (m.ready) { open = true; res(c); }
      else if (m.close) { ch.close(); c.onclose && c.onclose(); }
      else if (m.d !== undefined) c.onmsg && c.onmsg(m.d);
    };
    ch.postMessage({ to: 'h', from: id, open: 1 });
    addEventListener('pagehide', () => c.close());
    setTimeout(() => { if (!open) { ch.close(); rej(new Error('Hra nenalezena.')); } }, 1500);
  });
}
