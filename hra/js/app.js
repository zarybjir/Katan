// Start aplikace, přepínání obrazovek, spojení hostitele a klienta.
import { createHost } from './net/host.js';
import { createClient } from './net/client.js';
import { newToken, newCode } from './net/proto.js';
import { memPair } from './net/transport-mem.js';
import { tabsListen, tabsConnect } from './net/transport-tabs.js';
import { lanAvailable, lanListen, lanConnect, lanDiscover } from './net/transport-lan.js';
import { rtcListen, rtcConnect } from './net/transport-rtc.js';
import { showMenu, showSetup, showJoin, showLobby } from './ui/menu.js';
import { createGame } from './ui/hud.js';
import { describe } from './ui/text.js';
import { checkUpdate } from './update.js';
import { h, clear, modal, toast, topModal, closeModals } from './ui/dom.js';

const $screen = document.getElementById('screen'), $game = document.getElementById('game');
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem(k); } catch {} },
};
const android = globalThis.Android;
const FAST = new URLSearchParams(location.search).has('fast'); // rychlí boti pro testy
const settings = Object.assign({ name: '', token: '' }, store.get('so-set'));
if (!settings.token) settings.token = newToken();
const saveSettings = () => store.set('so-set', settings);
saveSettings();

let S = null; // běžící relace (hostitel nebo klient)
const A = {
  settings, saveSettings, lan: lanAvailable(), version: android ? android.version() : '',
  get hasSaved() { const s = store.get('so-host'); return !!(s && s.g && s.g.phase !== 'end' && s.g.bank && 'sheep' in s.g.bank); }, // hry ze starší verze se zahazují
  newGame: () => showSetup($screen, A, hostGame, menu),
  join: joinScreen,
  update: () => checkUpdate(true),
  resume: () => { const r = store.get('so-host'); if (r) hostGame(null, r); },
};

function show(game) { $screen.hidden = game; $game.hidden = !game; if (android) android.keepAwake(game); }
function menu() { show(false); showMenu($screen, A); }

// ---------- relace ----------
function session(conn, hello, host) {
  const s = { views: {}, seats: [], log: [], cur: null, pending: null, multi: false, host, lobby: null, G: null, logSeq: 0, logPid: null, left: false, net: null, stops: [] };
  s.view = () => (s.cur !== null && s.views[s.cur] ? s.views[s.cur].view : null);
  s.act = a => s.client.act(s.cur, a);
  s.accept = () => { s.cur = s.pending; s.pending = null; s.G.update(); };
  s.refresh = () => host && host.resend(); // jen pro testy: znovu rozeslat pohledy
  s.version = A.version;
  s.away = () => s.cur !== null && s.cur >= 0 && s.seats[s.cur] && s.seats[s.cur].away;
  s.back = () => s.client.back(s.cur);
  s.netInfo = () => s.net && netLines(s);
  s.leave = finished => {
    s.left = true; clearInterval(s.timer);
    s.client.close(); for (const f of s.stops) try { f(); } catch {}
    if (host) { host.close(); if (finished) store.del('so-host'); }
    S = null; closeModals(); clear($game); menu();
  };
  let queued = false;
  const refresh = () => {
    queued = false;
    if (s.left) return;
    const pids = Object.keys(s.views).map(Number).sort((a, b) => a - b);
    s.multi = pids.length > 1;
    const busy = pids.filter(p => s.views[p].view.legal.length);
    const waiting = p => { const L = s.views[p].view.legal; return L.length === 1 && L[0].t === 'cancel'; };
    let want = s.cur;
    if (want === null || !pids.includes(want)) want = busy[0] ?? pids[0];
    else if (!busy.includes(want) || (waiting(want) && busy.some(p => p !== want))) want = busy.find(p => p !== want) ?? want;
    if (s.cur === null || !s.multi) { s.cur = want; s.pending = null; }
    else if (want !== s.cur) s.pending = want; else s.pending = null;
    if (!s.G) { show(true); s.G = createGame($game, s); }
    s.G.update();
  };
  s.client = createClient(conn, hello, {
    onLobby: m => { s.lobby = m; drawLobby(s); },
    onView: m => {
      s.views[m.pid] = m; s.seats = m.seats;
      if (s.logPid === null) s.logPid = m.pid;
      if (m.pid === s.logPid && m.seq > s.logSeq) {
        s.logSeq = m.seq;
        const names = m.view.players.map(p => p.name);
        for (const e of m.ev) {
          const line = describe(s.multi || host && Object.keys(s.views).length > 1 ? { ...e, res: e.e === 'steal' ? undefined : e.res, card: e.e === 'buy' ? undefined : e.card } : e, names);
          if (line) s.log.push(line);
          if (e.e === 'build' && s.G) s.G.board.setMark(e.at);
        }
      }
      if (!queued) { queued = true; queueMicrotask(refresh); }
    },
    onError: m => { toast(m.msg); if (m.code === 'proto') checkUpdate(false); if (['proto', 'full', 'started', 'token'].includes(m.code)) s.fatal = true; },
    onClose: () => {
      if (s.left) return;
      if (s.fatal || !s.G) { s.leave(); return; }
      const d = modal('Spojení přerušeno', h('div', { class: 'col' }, h('p', null, 'Spojení s hostitelem bylo ztraceno.'),
        h('button', { class: 'btn', onclick: () => { d.close(); const a = settings.lastAddr; s.leave(); joinGame(a).catch(e => toast(e.message)); } }, 'Připojit znovu'),
        h('button', { class: 'btn ghost', onclick: () => { d.close(); s.leave(); } }, 'Do nabídky')), { sticky: true });
    },
  });
  return s;
}

function netLines(s) {
  const n = s.net, out = [];
  if (n.lan) out.push('Místní síť: ' + (n.lan.ips.length ? n.lan.ips.map(ip => ip + ':' + n.lan.port).join(', ') : 'bez připojení k síti'));
  else if (n.lanErr) out.push('Místní síť: ' + n.lanErr);
  out.push('Internet – kód hry: ' + (n.rtc === 'ok' ? s.host.code : n.rtc === 'wait' ? 'připojování…' : n.rtc));
  if (n.tabs) out.push('Záložky prohlížeče – kód: ' + s.host.code);
  return out;
}
function drawLobby(s) {
  if (s.G || s.left) return;
  show(false);
  showLobby($screen, s.lobby, { host: !!s.host, net: s.host && s.net ? netLines(s) : null, start: () => s.host.start(), leave: () => { if (s.host) store.del('so-host'); s.leave(); } });
}

// ---------- hostitel ----------
function hostGame(cfg, restore) {
  const code = restore ? restore.code : newCode();
  const H = createHost(restore ? { restore, botDelay: FAST ? 20 : undefined, save: t => store.set('so-host', t) }
    : { botDelay: FAST ? 20 : undefined, seats: cfg.seats, target: cfg.target, map: cfg.map, seed: cfg.seed ?? (Math.random() * 2 ** 31) | 0, code, save: t => store.set('so-host', t) });
  const [a, b] = memPair(queueMicrotask);
  S = session(a, null, H);
  S.timer = setInterval(() => H.tick(), 1000);
  if (H.seats.some(x => x.kind === 'open')) openNet(S, H);
  H.attach(b, { local: true });
  if (restore) H.kick();
  else if (!S.net) H.start();
}
function openNet(s, H) {
  const n = s.net = { lan: null, lanErr: null, rtc: 'wait', tabs: false };
  const on = c => H.attach(c), redraw = () => { if (s.lobby && !s.G) drawLobby(s); };
  if (lanAvailable()) { try { n.lan = lanListen(settings.name || 'Souostroví', on); s.stops.push(n.lan.stop); } catch (e) { n.lanErr = e.message; } }
  else { try { const t = tabsListen(H.code, on); n.tabs = true; s.stops.push(t.stop); } catch {} }
  rtcListen(H.code, on).then(r => { if (s.left) return r.stop(); n.rtc = 'ok'; s.stops.push(r.stop); redraw(); }, e => { n.rtc = e.message; redraw(); });
}

// ---------- klient ----------
async function joinGame(addr) {
  let conn;
  if (/^[a-z]{5}$/i.test(addr)) {
    const code = addr.toUpperCase();
    conn = lanAvailable() ? await rtcConnect(code) : await tabsConnect(code).catch(() => rtcConnect(code));
  } else conn = await lanConnect(addr);
  settings.lastAddr = addr; saveSettings();
  if (S) S.leave();
  S = session(conn, { name: settings.name || 'Hráč', token: settings.token }, null);
}
function joinScreen() {
  let stop = () => {};
  const onList = showJoin($screen, A, a => joinGame(a).then(() => stop()), () => { stop(); menu(); });
  stop = lanDiscover(onList);
}

// tlačítko zpět v Androidu: zavře dialog, jinak nechá aplikaci rozhodnout
globalThis.onAndroidBack = () => {
  const m = topModal();
  if (m) { if (!m.sticky) m.close(); return true; }
  if (S && S.G) { document.getElementById('a-menu')?.click(); return true; }
  if (S) { S.leave(); return true; }
  if (!document.getElementById('m-new')) { menu(); return true; }
  return false;
};
globalThis.__so = { get S() { return S; } }; // pro testy v prohlížeči
menu();
if (android) setTimeout(() => { if (!S) checkUpdate(false); }, 1500); // nová verze se nabídne jen mimo hru
