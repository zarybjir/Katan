// Generátor náhody se seedem. Stav je číslo v poli `rng` předaného objektu.
export function next(s) {
  let t = (s.rng = (s.rng + 0x6D2B79F5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export const rint = (s, n) => Math.floor(next(s) * n);
export const pick = (s, a) => a[rint(s, a.length)];
export function shuffle(s, a) {
  for (let i = a.length - 1; i > 0; i--) { const j = rint(s, i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
