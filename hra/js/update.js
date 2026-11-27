// Aktualizace z aplikace: poslední vydání na GitHubu, stažení a instalace přes Android most.
import { h, modal } from './ui/dom.js';

const API = 'https://api.github.com/repos/zarybjir/Katan/releases/latest';
const A = () => globalThis.Android;
const num = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
// je verze a novější než b (po číslech: 0.10 > 0.9)
export function newer(a, b) {
  const x = num(a), y = num(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}
async function latest() {
  const r = await fetch(API, { headers: { Accept: 'application/vnd.github+json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  const j = await r.json();
  const apk = (j.assets || []).find(a => /\.apk$/.test(a.name));
  return { ver: String(j.tag_name || '').replace(/^v/, ''), url: apk && apk.browser_download_url, notes: String(j.body || '').slice(0, 600) };
}

// manual: hráč se ptá sám, takže dostane odpověď i tehdy, když nová verze není
export async function checkUpdate(manual) {
  const say = t => manual && modal('Aktualizace', h('p', null, t));
  if (!A() || !A().updateInstall) return say('Aktualizace jsou dostupné jen v aplikaci pro Android.');
  let rel;
  try { rel = await latest(); } catch { return say('Novou verzi se nepodařilo zjistit. Je potřeba připojení k internetu.'); }
  const cur = A().version();
  if (!rel.url || !newer(rel.ver, cur)) return say(`Nainstalovaná verze ${cur} je nejnovější.`);
  offer(rel, cur);
}

function offer(rel, cur) {
  const st = h('p', { class: 'dim', id: 'upd-state' }), fill = h('i'), bar = h('div', { class: 'bar' }, fill);
  const go = h('button', { class: 'btn', id: 'upd-go' }, 'Aktualizovat');
  const m = modal('Nová verze ' + rel.ver, h('div', { class: 'col' },
    h('p', null, `Nainstalovaná verze: ${cur}. Rozehraná hra i nastavení zůstanou zachované.`),
    rel.notes && h('p', { class: 'dim' }, rel.notes), bar, st, go,
    h('button', { class: 'btn ghost', onclick: () => m.close() }, 'Později')), { key: 'upd' });
  go.onclick = () => { go.disabled = true; st.textContent = 'Stahování…'; A().updateInstall(rel.url); };
  const cb = globalThis.AndroidCb = globalThis.AndroidCb || {};
  cb.onUpdate = (kind, data) => {
    if (kind === 'progress') { fill.style.width = data + '%'; st.textContent = `Stahování: ${data} %`; }
    else if (kind === 'ready') {
      fill.style.width = '100%'; go.disabled = false; go.textContent = 'Znovu otevřít instalaci';
      st.textContent = 'Instalaci je potřeba potvrdit v systémovém okně. Při první aktualizaci se Android zeptá, jestli tato aplikace smí instalovat aplikace.';
    } else { st.textContent = data; go.disabled = false; }
  };
}
