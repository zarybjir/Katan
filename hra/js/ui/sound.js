// Zvuky skládané v prohlížeči (WebAudio) – bez zvukových souborů, fungují offline.
// Zvuk se odemyká prvním dotykem; když WebAudio chybí, funkce nic nedělají.
let ctx = null, master = null;
export const snd = { on: true };

function ac() {
  if (!snd.on) return null;
  if (!ctx) {
    try { ctx = new (globalThis.AudioContext || globalThis.webkitAudioContext)(); } catch { return null; }
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}
if (globalThis.addEventListener) addEventListener('pointerdown', () => ac(), { capture: true });

// tón s rychlým náběhem a doznívajícím koncem
function tone(f, dur, { type = 'sine', vol = 0.3, at = 0, to = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at, o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master); o.start(t); o.stop(t + dur + 0.02);
}
// šum přes filtr (klepnutí, šustění, hrom)
function noise(dur, { freq = 1000, q = 1, type = 'bandpass', vol = 0.3, at = 0, attack = 0.004 } = {}) {
  const c = ac(); if (!c) return;
  const t = c.currentTime + at, n = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(master); s.start(t); s.stop(t + dur + 0.02);
}

// výšky tónů pro suroviny (pentatonika, aby souzvuk nezněl falešně)
const NOTE = { wood: 523, stone: 587, grain: 659, sheep: 784, brick: 880, cards: 440 };

export const sfx = {
  // kostky: série klepnutí po stole, na konci dvě dopadnutí
  dice() {
    let t = 0;
    for (let i = 0; i < 9; i++) { t += 0.035 + Math.random() * 0.06; noise(0.04, { freq: 2200 + Math.random() * 1800, q: 4, vol: 0.18 + Math.random() * 0.12, at: t }); }
    noise(0.09, { freq: 900, q: 2, vol: 0.35, at: t + 0.1 }); noise(0.08, { freq: 1100, q: 2, vol: 0.3, at: t + 0.17 });
  },
  // surovina dorazila k hráči
  gain(r) { tone(NOTE[r] || 600, 0.22, { type: 'triangle', vol: 0.16 }); tone((NOTE[r] || 600) * 2, 0.12, { vol: 0.05, at: 0.01 }); },
  // surovina dopadla do banky (cinknutí mince)
  coin() { tone(1900, 0.12, { vol: 0.08 }); tone(2650, 0.18, { vol: 0.06, at: 0.02 }); },
  // stavba: dřevěné ťuknutí, město dvakrát
  build(kind) {
    const n = kind === 'city' ? 2 : 1, low = kind === 'road' ? 260 : 180;
    for (let i = 0; i < n; i++) { tone(low, 0.12, { vol: 0.35, at: i * 0.13, to: low * 0.7 }); noise(0.05, { freq: 1400, q: 1.5, vol: 0.2, at: i * 0.13 }); }
  },
  // začátek vlastního tahu: dva tóny lodního zvonku
  turn() { tone(660, 0.6, { type: 'sine', vol: 0.18 }); tone(990, 0.7, { type: 'sine', vol: 0.12, at: 0.14 }); },
  // sedmička: hrom
  storm() { noise(1.6, { freq: 160, type: 'lowpass', q: 0.7, vol: 0.55, attack: 0.08 }); noise(0.7, { freq: 420, type: 'lowpass', vol: 0.3, at: 0.05 }); },
  // krádež karty: švih
  steal() { noise(0.25, { freq: 2500, q: 0.8, vol: 0.18, attack: 0.08 }); },
  // nabídka obchodu
  offer() { tone(880, 0.14, { type: 'triangle', vol: 0.14 }); tone(1175, 0.2, { type: 'triangle', vol: 0.12, at: 0.12 }); },
  // karta výpravy
  card() { noise(0.12, { freq: 3000, q: 0.7, vol: 0.12, attack: 0.03 }); tone(700, 0.15, { type: 'triangle', vol: 0.08, at: 0.05 }); },
  // vítězství: stoupající akord
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.9 - i * 0.1, { type: 'triangle', vol: 0.18, at: i * 0.13 })); },
};
