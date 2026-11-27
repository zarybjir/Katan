// Hostitel: drží jediný pravý stav hry, přijímá akce, rozesílá pohledy, řídí boty.
// Spojení je objekt { send(text), close(), onmsg, onclose } z libovolného přenosu.
import { newGame, view, eventsFor } from '../core/state.js';
import { apply, legal } from '../core/rules.js';
import { next } from '../core/rng.js';
import { botAct } from '../bot/bot.js';
import { parse, pack, cleanName, okToken } from './proto.js';
import { PROTO, NET, RULES, BOT_NAMES } from '../data.js';

// opt: { seats:[{kind:'local'|'bot'|'open', name, level}], target, map, seed, code, save(text), botDelay, now(), restore }
export function createHost(opt) {
  const now = opt.now || (() => Date.now());
  const H = {
    g: null, seats: [], conns: new Set(), seq: 0, code: opt.code || '', target: opt.target || RULES.target, map: opt.map || 'island',
    R: { rng: (opt.seed | 0) ^ 0x1234567 }, seed: opt.seed | 0, lastAct: now(), timer: null, botDelay: opt.botDelay ?? NET.botDelay,
    onChange: null, closed: false,
  };
  if (opt.restore) {
    const r = opt.restore;
    Object.assign(H, { g: r.g, seq: r.seq, code: r.code, target: r.target, R: r.R, seed: r.seed, map: r.map || 'island' });
    H.seats = r.seats.map(s => ({ ...s, conn: null }));
  } else H.seats = opt.seats.map((s, i) => seat(s, i));

  function seat(s, i) {
    return { kind: s.kind, level: s.level || 'mid', name: s.kind === 'bot' ? BOT_NAMES[i % BOT_NAMES.length] : s.kind === 'local' ? cleanName(s.name) : '', token: null, conn: null, away: false };
  }
  const pub = () => H.seats.map(s => ({ kind: s.kind, name: s.name, level: s.level, taken: s.kind !== 'open' || !!s.token, online: s.kind !== 'open' || !!s.conn, away: s.away }));
  const save = () => { if (opt.save && H.g) opt.save(JSON.stringify({ v: 1, g: H.g, seq: H.seq, code: H.code, target: H.target, map: H.map, R: H.R, seed: H.seed, seats: H.seats.map(({ conn, ...s }) => s) })); };

  // ---------- rozesílání ----------
  function pidsOf(c) {
    if (c.local) { const l = H.seats.map((s, i) => (s.kind === 'local' ? i : -1)).filter(i => i >= 0); return l.length ? l : [-1]; }
    return H.seats.map((s, i) => (s.conn === c ? i : -1)).filter(i => i >= 0);
  }
  function sendState(c, ev) {
    if (!H.g) { c.conn.send(pack({ t: 'lobby', seats: pub(), you: pidsOf(c), target: H.target, map: H.map, code: H.code })); return; }
    for (const pid of pidsOf(c)) c.conn.send(pack({ t: 'view', pid, view: view(H.g, pid), ev: eventsFor(ev || [], pid), seq: H.seq, seats: pub() }));
  }
  function broadcast(ev) { for (const c of H.conns) if (c.local || c.hello) sendState(c, ev); if (H.onChange) H.onChange(); }
  const err = (c, code, msg) => c.conn.send(pack({ t: 'error', code, msg }));

  // ---------- spojení ----------
  H.attach = (conn, o = {}) => {
    const c = { conn, local: !!o.local, hello: false, win: 0, n: 0, seen: now() };
    H.conns.add(c);
    conn.onmsg = text => handle(c, text);
    conn.onclose = () => {
      H.conns.delete(c);
      let ch = false;
      for (const s of H.seats) if (s.conn === c) { s.conn = null; ch = true; if (!H.g) { s.token = null; s.name = ''; } }
      if (ch) { H.lastAct = now(); broadcast(); }
    };
    if (c.local) sendState(c);
    return c;
  };

  function handle(c, text) {
    if (H.closed) return;
    c.seen = now();
    const m = parse(text);
    const sec = Math.floor(now() / 1000);
    if (c.win !== sec) { c.win = sec; c.n = 0; }
    if (!m || (++c.n > NET.maxRate && !c.local)) return; // poškozené a příliš časté zprávy se zahazují
    if (m.t === 'ping') { c.conn.send(pack({ t: 'pong' })); return; }
    if (m.t === 'hello' && !c.local) { if (!c.hello) hello(c, m); return; }
    if (!c.local && !c.hello) return;
    const pids = pidsOf(c);
    const pid = Number.isInteger(m.pid) ? m.pid : pids[0];
    if (!pids.includes(pid) || pid < 0) return err(c, 'seat', 'Akce za cizího hráče.');
    if (m.t === 'back') { H.seats[pid].away = false; broadcast(); return; }
    if (m.t !== 'action' || !H.g) return;
    H.seats[pid].away = false;
    const r = H.act(pid, m.a);
    if (!r.ok) err(c, 'rule', r.err);
  }

  function hello(c, m) {
    if (m.proto !== PROTO) { err(c, 'proto', 'Rozdílná verze aplikace.'); c.conn.close(); return; }
    if (!okToken(m.token)) { err(c, 'token', 'Neplatné přihlášení.'); c.conn.close(); return; }
    let s = H.seats.find(s => s.kind === 'open' && s.token === m.token);
    if (!s && !H.g) { s = H.seats.find(s => s.kind === 'open' && !s.token); if (s) { s.token = m.token; s.name = cleanName(m.name); } }
    if (!s) { err(c, H.g ? 'started' : 'full', H.g ? 'Hra už běží.' : 'Hra je plná.'); c.conn.close(); return; }
    if (s.conn && s.conn !== c) { const old = s.conn; s.conn = null; H.conns.delete(old); old.conn.onclose = null; old.conn.close(); }
    s.conn = c; c.hello = true; H.lastAct = now();
    broadcast();
  }

  // ---------- lobby (volá rozhraní hostitele přímo) ----------
  H.setSeats = list => {
    if (H.g) return;
    H.seats = list.map((s, i) => {
      const old = H.seats[i];
      if (old && old.kind === 'open' && s.kind === 'open') return old;
      if (old && old.conn) { old.conn.conn.close(); }
      return seat(s, i);
    });
    for (const old of H.seats.slice(list.length)) if (old.conn) old.conn.conn.close();
    broadcast();
  };
  H.start = () => {
    if (H.g) return;
    H.seats.forEach((s, i) => { if (s.kind === 'open' && !s.token) Object.assign(s, seat({ kind: 'bot', level: 'mid' }, i)); });
    H.g = newGame({ seed: H.seed, names: H.seats.map(s => s.name), target: H.target, map: H.map });
    H.lastAct = now(); H.seq = 1; save(); broadcast(); H.kick();
  };

  // ---------- akce a boti ----------
  H.act = (pid, a) => {
    const r = apply(H.g, pid, a);
    if (!r.ok) return r;
    H.seq++; H.lastAct = now(); save(); broadcast(r.ev); H.kick();
    return r;
  };
  const isBot = s => s.kind === 'bot' || s.away;
  function step() {
    if (!H.g || H.g.phase === 'end') return false;
    for (let i = 0; i < H.seats.length; i++) {
      const s = H.seats[i];
      if (!isBot(s)) continue;
      const v = view(H.g, i);
      if (!v.legal.length) continue;
      const a = botAct(v, s.kind === 'bot' ? s.level : 'mid', () => next(H.R));
      if (!a) continue;
      const r = apply(H.g, i, a);
      if (!r.ok) throw new Error('bot: ' + r.err + ' ' + JSON.stringify(a));
      H.seq++; H.lastAct = now(); save(); broadcast(r.ev);
      return true;
    }
    return false;
  }
  H.kick = () => {
    if (H.botDelay < 0 || H.timer || H.closed) return; // záporné zpoždění: boty krokuje volající (testy)
    H.timer = setTimeout(() => { H.timer = null; if (step()) H.kick(); }, H.botDelay);
  };
  H.pump = (max = 1e6) => { let n = 0; while (n < max && step()) n++; return n; };

  // Hlídání nečinnosti vzdálených hráčů; volat zhruba jednou za vteřinu.
  H.tick = () => {
    // klient posílá ping; spojení bez zpráv po dobu NET.dead je mrtvé
    for (const c of [...H.conns]) if (!c.local && now() - c.seen > NET.dead * 1000) { const f = c.conn.onclose; c.conn.onclose = null; c.conn.close(); f && f(); }
    if (!H.g || H.g.phase === 'end') return;
    const idle = (now() - H.lastAct) / 1000;
    let ch = false;
    H.seats.forEach((s, i) => {
      if (s.kind !== 'open' || s.away || !legal(H.g, i).length) return;
      const lim = !s.conn ? 20 : (H.g.trade || H.g.phase === 'discard') ? 30 : NET.turnLimit;
      if (idle > lim) { s.away = true; ch = true; }
    });
    if (ch) { broadcast(); H.kick(); }
  };
  H.close = () => {
    H.closed = true; clearTimeout(H.timer);
    for (const c of H.conns) { c.conn.onclose = null; c.conn.close(); }
    H.conns.clear();
  };
  H.pub = pub;
  return H;
}
