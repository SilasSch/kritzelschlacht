// Verschiebbare Malleiste: am Griff ziehen, die Lage bleibt im Fenster und wird gemerkt (localStorage, eigener
// Schlüssel, nicht im Spielstand). Doppelklick auf den Griff oder der Knopf ↺ setzt sie an den Standardplatz zurück.
// Gespeichert wird die Lage als Anteil des freien Platzes (0 = links/oben, 1 = rechts/unten): so bleibt die Leiste bei
// jeder Fenstergröße sichtbar und an derselben Ecke. Der Griff liegt im HUD, nicht auf der Leinwand: Ziehen malt nie.

// Rein (für Tests): Anteil → px und px → Anteil. vw/vh Fenster, w/h Leiste, m Mindestabstand zum Rand (alles in px)
export function placeAt(fx, fy, vw, vh, w, h, m = 8) {
  const sx = Math.max(0, vw - w - 2 * m), sy = Math.max(0, vh - h - 2 * m);
  return { x: m + clamp01(fx) * sx, y: m + clamp01(fy) * sy };
}
export function fractionOf(x, y, vw, vh, w, h, m = 8) {
  const sx = vw - w - 2 * m, sy = vh - h - 2 * m;
  return { fx: sx > 0 ? clamp01((x - m) / sx) : .5, fy: sy > 0 ? clamp01((y - m) / sy) : 1 };
}
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : +v || 0);

export function parsePos(text) {
  try {
    const p = JSON.parse(text);
    if (p && Number.isFinite(p.fx) && Number.isFinite(p.fy)) return { fx: clamp01(p.fx), fy: clamp01(p.fy) };
  } catch (e) { /* unlesbar */ }
  return null;
}

// el: die Leiste, grip: Griff darin, reset: Knopf zum Zurücksetzen, host: Bezugsrahmen (#app), onMove: nach jeder Änderung
export function makeDraggable({ el, grip, reset, host, key, onMove = () => {} }) {
  let pos = null;
  try { pos = parsePos(localStorage.getItem(key)); } catch (e) { /* kein Speicher */ }
  const store = () => { try { if (pos) localStorage.setItem(key, JSON.stringify(pos)); else localStorage.removeItem(key); } catch (e) { /* ignore */ } };
  // CSS-zoom des HUD (index.html): Bildschirm-px = CSS-px · z
  const zoomOf = () => { const r = el.getBoundingClientRect(); return el.offsetWidth ? r.width / el.offsetWidth : 1; };

  function apply() {
    el.classList.toggle('free', !!pos);
    if (reset) reset.hidden = !pos;
    if (!pos) { el.style.left = el.style.top = ''; onMove(); return; }
    const z = zoomOf(), r = el.getBoundingClientRect(), h = host.getBoundingClientRect();
    const p = placeAt(pos.fx, pos.fy, h.width, h.height, r.width, r.height);
    el.style.left = `${p.x / z}px`; el.style.top = `${p.y / z}px`;
    onMove();
  }

  let drag = null;
  grip.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const r = el.getBoundingClientRect(), h = host.getBoundingClientRect();
    // Beim ersten Ziehen aus dem Raster lösen, ohne zu springen
    if (!pos) { pos = fractionOf(r.left - h.left, r.top - h.top, h.width, h.height, r.width, r.height); apply(); }
    drag = { id: e.pointerId, dx: e.clientX - r.left, dy: e.clientY - r.top };
    grip.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
  });
  grip.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const r = el.getBoundingClientRect(), h = host.getBoundingClientRect();
    pos = fractionOf(e.clientX - drag.dx - h.left, e.clientY - drag.dy - h.top, h.width, h.height, r.width, r.height);
    apply();
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    drag = null; el.classList.remove('dragging'); store();
  };
  grip.addEventListener('pointerup', end);
  grip.addEventListener('pointercancel', end);
  const back = () => { pos = null; store(); apply(); };
  grip.addEventListener('dblclick', back);
  if (reset) reset.addEventListener('click', back);
  // Tastatur: Pfeile verschieben (Umschalt: weiter), Pos1 setzt zurück
  grip.addEventListener('keydown', (e) => {
    const step = e.shiftKey ? .1 : .02, d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (e.key === 'Home') { e.preventDefault(); e.stopPropagation(); back(); return; }
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    if (!pos) { const r = el.getBoundingClientRect(), h = host.getBoundingClientRect(); pos = fractionOf(r.left - h.left, r.top - h.top, h.width, h.height, r.width, r.height); }
    pos = { fx: clamp01(pos.fx + d[0]), fy: clamp01(pos.fy + d[1]) };
    apply(); store();
  });

  // Fenster- oder Leistengröße geändert (Reiter mit mehr Einheiten): wieder ins Fenster holen
  addEventListener('resize', apply);
  if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (pos && !drag) apply(); }).observe(el);
  apply();
  return { apply, reset: back, get pos() { return pos; } };
}
