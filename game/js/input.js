// Browser-Eingabe: Maus, Mausrad, Tastatur -> actions. Malen nur in Weltkoordinaten (screenToWorld).
// actions = { paintAt(wx, wy, erase), strokeStart(), strokeEnd(), brushDelta(d), brushRadius() -> Welteinheiten,
//             setCat(dir), pickSlot(n), eraser(), undo(), togglePause(), hover(wx, wy, inside) }
import { screenToWorld, zoomAt, pan } from './camera.js';
import { createWheel, wheelAction } from './wheel.js';

const BRUSH_STEP = 8;

export function bindInput(canvas, cam, actions) {
  let space = false;
  let painting = false, erase = false, panning = false;
  let last = null;   // letzte Stempelposition (Welt)
  let lastS = null;  // letzte Bildschirmposition (fürs Verschieben)
  const wheel = createWheel();

  const local = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const hover = (s, inside) => {
    if (!actions.hover) return;
    const w = screenToWorld(cam, s.x, s.y);
    actions.hover(w.x, w.y, inside);
  };

  function stamp(w) {
    const spacing = Math.max(6, (actions.brushRadius ? actions.brushRadius() : 0) * 0.45);
    const dx = w.x - last.x, dy = w.y - last.y;
    const dist = Math.hypot(dx, dy);
    if (dist < spacing) return;
    const n = Math.floor(dist / spacing);
    for (let i = 1; i <= n; i++) {
      const t = (i * spacing) / dist;
      actions.paintAt(last.x + dx * t, last.y + dy * t, erase);
    }
    const t = (n * spacing) / dist;
    last = { x: last.x + dx * t, y: last.y + dy * t };
  }

  function endStroke() {
    if (painting) { painting = false; last = null; actions.strokeEnd(); }
    panning = false; lastS = null;
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    const s = local(e);
    if (e.button === 1 || (e.button === 0 && space)) { // Mitteltaste oder Leertaste+Ziehen: verschieben
      e.preventDefault();
      panning = true; lastS = s;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    erase = e.button === 2;
    painting = true;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const w = screenToWorld(cam, s.x, s.y);
    actions.strokeStart();
    actions.paintAt(w.x, w.y, erase);
    last = w;
  });

  canvas.addEventListener('pointermove', (e) => {
    const s = local(e);
    if (panning) {
      pan(cam, s.x - lastS.x, s.y - lastS.y);
      lastS = s;
    } else if (painting) {
      stamp(screenToWorld(cam, s.x, s.y));
    }
    hover(s, true);
  });

  const up = (e) => {
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    endStroke();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', (e) => { if (!painting && !panning) hover(local(e), false); });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    // deltaY/deltaX vor deltaMode lesen: Firefox meldet dann Pixel statt Zeilen
    const dy = e.deltaY, dx = e.deltaX;
    const a = wheelAction(wheel, { deltaY: dy, deltaX: dx, deltaMode: e.deltaMode, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey }, cam.viewH);
    if (!a) return;
    if (a.brush) { actions.brushDelta(a.brush); return; }
    const s = local(e);
    zoomAt(cam, s.x, s.y, a.zoom);
    hover(s, true);
  }, { passive: false });

  const inTextInput = (t) => {
    if (!t || !t.tagName) return false;
    if (t.isContentEditable || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT') return true;
    return t.tagName === 'INPUT' && t.type !== 'range' && t.type !== 'checkbox' && t.type !== 'button';
  };

  window.addEventListener('keydown', (e) => {
    if (inTextInput(e.target)) return;
    if (e.code === 'Space') { space = true; e.preventDefault(); return; }
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault(); actions.undo(); return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.code === 'NumpadAdd') { e.preventDefault(); actions.brushDelta(BRUSH_STEP); return; }
    if (e.key === '-' || e.code === 'NumpadSubtract') { e.preventDefault(); actions.brushDelta(-BRUSH_STEP); return; }
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'q') actions.setCat(-1);
    else if (k === 'e') actions.setCat(1);
    else if (k === 'x') actions.eraser();
    else if (k === 'p') actions.togglePause();
    else if (/^[1-9]$/.test(e.key)) actions.pickSlot(Number(e.key));
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') space = false; });
  window.addEventListener('blur', () => { space = false; endStroke(); });
}
