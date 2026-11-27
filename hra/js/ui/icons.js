// Ikonky surovin a ukazatelů (SVG, bílé na barevném kolečku).
import { RES_COLOR } from '../data.js';

const P = {
  wood: '<path d="M12 3l5 7h-3l4 5h-4l3 4H7l3-4H6l4-5H7z"/><rect x="11" y="18" width="2" height="3"/>',
  stone: '<path d="M3 19l5-9 3 4 4-8 6 13z"/><path d="M15 6l1.6 3.2h-3.2z" fill="#fff" opacity=".9"/>',
  grain: '<path d="M12 21V8" stroke="#fff" stroke-width="1.6" fill="none"/><ellipse cx="12" cy="5" rx="1.6" ry="2.4"/><ellipse cx="9.4" cy="9" rx="1.5" ry="2.3" transform="rotate(-30 9.4 9)"/><ellipse cx="14.6" cy="9" rx="1.5" ry="2.3" transform="rotate(30 14.6 9)"/><ellipse cx="9.4" cy="13" rx="1.5" ry="2.3" transform="rotate(-30 9.4 13)"/><ellipse cx="14.6" cy="13" rx="1.5" ry="2.3" transform="rotate(30 14.6 13)"/>',
  sheep: '<circle cx="9" cy="11" r="3.2"/><circle cx="13" cy="10" r="3.4"/><circle cx="15.5" cy="13" r="3"/><circle cx="10" cy="14" r="3"/><ellipse cx="18.6" cy="10" rx="2" ry="1.6" fill="#333"/><rect x="9" y="16" width="1.6" height="4" fill="#333"/><rect x="14" y="16" width="1.6" height="4" fill="#333"/>',
  brick: '<rect x="3" y="6" width="8" height="4" rx=".6"/><rect x="12.5" y="6" width="8.5" height="4" rx=".6"/><rect x="3" y="11.5" width="4" height="4" rx=".6"/><rect x="8.5" y="11.5" width="8" height="4" rx=".6"/><rect x="18" y="11.5" width="3" height="4" rx=".6"/><rect x="3" y="17" width="8" height="3" rx=".6"/><rect x="12.5" y="17" width="8.5" height="3" rx=".6"/>',
  cards: '<rect x="5" y="4" width="11" height="15" rx="2" opacity=".55"/><rect x="8" y="6" width="11" height="15" rx="2"/>',
  special: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 7.5l1.3 2.8 3 .3-2.3 2 .7 3-2.7-1.6-2.7 1.6.7-3-2.3-2 3-.3z" fill="#5b3f99"/>',
  points: '<path d="M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6.1L12 16.8l-5.4 2.9 1.1-6.1L3.2 9.4l6.1-.8z"/>',
};
const BG = { ...RES_COLOR, cards: '#4f6378', special: '#7a5bc4', points: '#c9962c' };

// ikonka jako HTML prvek; kind = surovina nebo cards / special / points
export function icon(kind, size = 22) {
  const s = document.createElement('span');
  s.className = 'ico';
  s.style.cssText = `background:${BG[kind]};width:${size}px;height:${size}px`;
  s.innerHTML = `<svg viewBox="0 0 24 24" width="${Math.round(size * 0.78)}" height="${Math.round(size * 0.78)}" fill="#fff">${P[kind]}</svg>`;
  return s;
}
