// Přenos v paměti: dvojice propojených konců. defer určuje doručení (výchozí hned, v aplikaci mikroúloha).
export function memPair(defer = f => f()) {
  const mk = () => ({ onmsg: null, onclose: null, open: true });
  const a = mk(), b = mk();
  const wire = (x, y) => {
    x.send = t => { if (x.open && y.open) defer(() => y.onmsg && y.onmsg(t)); };
    x.close = () => { if (!x.open) return; x.open = false; if (y.open) { y.open = false; defer(() => y.onclose && y.onclose()); } };
  };
  wire(a, b); wire(b, a);
  return [a, b];
}
