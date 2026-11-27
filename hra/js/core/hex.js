// Geometrie mapy. Dílky v axiálních souřadnicích (q, r), špičkou nahoru.
// Vrcholy leží na celočíselné mřížce: střed dílku je (2q+r, 3r), rohy o (0,±2) a (±1,±1).
// Id vrcholu je "x,y" na této mřížce, id hrany jsou dvě id vrcholů spojená "|".
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
const CORN = [[0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1]];
const S3 = Math.sqrt(3) / 2;

export const hid = (q, r) => q + ',' + r;
export const eid = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
export const corners = (q, r) => CORN.map(([dx, dy]) => (2 * q + r + dx) + ',' + (3 * r + dy));
export const hexXY = (q, r) => ({ x: (2 * q + r) * S3, y: 1.5 * r });

const cache = new Map();
// Graf mapy: H (index dílku podle id), V (vrcholy), E (hrany), hadj (sousední dílky).
export function graph(hexes) {
  const key = hexes.map(h => hid(h.q, h.r)).join(';');
  let g = cache.get(key);
  if (g) return g;
  g = { H: {}, V: {}, E: {}, hadj: [], hv: [] };
  hexes.forEach((h, i) => { g.H[hid(h.q, h.r)] = i; });
  hexes.forEach((h, i) => {
    g.hadj.push(DIRS.map(([dq, dr]) => g.H[hid(h.q + dq, h.r + dr)]).filter(x => x !== undefined));
    const cs = corners(h.q, h.r);
    g.hv.push(cs);
    cs.forEach((id, k) => {
      const [vx, vy] = id.split(',').map(Number);
      const v = g.V[id] || (g.V[id] = { id, x: vx * S3, y: vy * 0.5, hex: [], adj: [], edges: [] });
      v.hex.push(i);
      const b = cs[(k + 1) % 6], e = eid(id, b);
      const ed = g.E[e] || (g.E[e] = { id: e, a: id < b ? id : b, b: id < b ? b : id, hex: [] });
      ed.hex.push(i);
    });
  });
  for (const e of Object.values(g.E)) {
    g.V[e.a].adj.push(e.b); g.V[e.b].adj.push(e.a);
    g.V[e.a].edges.push(e.id); g.V[e.b].edges.push(e.id);
  }
  if (cache.size > 50) cache.clear();
  cache.set(key, g);
  return g;
}
