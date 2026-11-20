// Browser-Eingabe: Maus, Mausrad, Tastatur -> actions. Malen nur in Weltkoordinaten (screenToWorld).
// actions = { paintAt(wx, wy, erase), strokeStart(), strokeEnd(), brushDelta(d), brushRadius() -> Welteinheiten,
//             setCat(dir), pickSlot(n), eraser(), undo(), togglePause(), hover(wx, wy, inside),
//             keysBlocked() -> true, solange ein Dialog offen ist (Lexikon): dann keine Tastenkürzel }
import { screenToWorld, zoomAt, pan } from './camera.js';
import { createWheel, wheelAction } from './wheel.js';

const BRUSH_STEP = 8;

export function bindInput(canvas, cam, actions) {
  let space = false;
  let painting = false, erase = false, panning = false;
  let paintId = null, panId = null, pinch = null;
  let over = false;   // Zeiger über dem Spielfeld: dann verschiebt die Leertaste, auch wenn noch ein Knopf den Fokus hat
  let last = null;   // letzte Stempelposition (Welt)
  let lastS = null;  // letzte Bildschirmposition (fürs Verschieben)
  const pointers = new Map();   // pointerId → { x, y }
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
    if (painting) { painting = false; paintId = null; last = null; actions.strokeEnd(); }
    panning = false; panId = null; lastS = null;
  }

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    const s = local(e);
    if (e.pointerType === 'touch') {
      pointers.set(e.pointerId, s);
      if (pointers.size >= 2) {
        e.preventDefault();
        if (painting || panning) endStroke();
        const [[id0, a], [id1, b]] = [...pointers.entries()];
        pinch = { id0, id1, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, d: Math.hypot(b.x - a.x, b.y - a.y) };
        try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
        return;
      }
    }
    if (pinch || painting || panning) return;
    if (e.button === 1 || (e.button === 0 && space)) { // Mitteltaste oder Leertaste+Ziehen: verschieben
      e.preventDefault();
      panning = true; panId = e.pointerId; lastS = s;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      return;
    }
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    erase = e.button === 2;
    painting = true; paintId = e.pointerId;
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    const w = screenToWorld(cam, s.x, s.y);
    actions.strokeStart();
    actions.paintAt(w.x, w.y, erase);
    last = w;
  });

  canvas.addEventListener('pointermove', (e) => {
    const s = local(e);
    over = true;
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, s);
    if (pinch) {
      const a = pointers.get(pinch.id0), b = pointers.get(pinch.id1);
      if (a && b) {
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, d = Math.hypot(b.x - a.x, b.y - a.y);
        pan(cam, mx - pinch.mx, my - pinch.my);
        if (pinch.d > 4 && d > 4) zoomAt(cam, mx, my, d / pinch.d);
        pinch.mx = mx; pinch.my = my; pinch.d = d;
      }
      return;
    }
    if (panning && e.pointerId === panId) {
      pan(cam, s.x - lastS.x, s.y - lastS.y);
      lastS = s;
    } else if (painting && e.pointerId === paintId) {
      stamp(screenToWorld(cam, s.x, s.y));
    }
    if (e.pointerId === paintId || (!painting && !panning)) hover(s, true);
  });

  const up = (e) => {
    pointers.delete(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (pinch && (e.pointerId === pinch.id0 || e.pointerId === pinch.id1)) { pinch = null; return; }
    if (e.pointerId === paintId || e.pointerId === panId) endStroke();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('pointerleave', (e) => { over = false; if (!painting && !panning && !pinch) hover(local(e), false); });

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
  const onInteractive = (t) => !!(t && t.closest && t.closest('button,input,a,[role="button"],[role="tab"]'));

  window.addEventListener('keydown', (e) => {
    if (inTextInput(e.target) || (actions.keysBlocked && actions.keysBlocked())) return;
    if (e.code === 'Space') {
      // fokussierter Knopf (#72): Leertaste drückt ihn, außer der Zeiger steht auf dem Spielfeld (verschieben wie bisher)
      if (onInteractive(e.target) && !over) return;
      space = true; e.preventDefault(); return;
    }
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
    else if (k === 'm' && actions.toggleMute) actions.toggleMute();
    else if (k === 'r' && actions.toggleRanges) actions.toggleRanges();
    else if (/^[1-9]$/.test(e.key)) actions.pickSlot(Number(e.key));
  });
  window.addEventListener('keyup', (e) => { if (e.code === 'Space') { if (space && onInteractive(e.target)) e.preventDefault(); space = false; } });
  window.addEventListener('blur', () => { space = false; pinch = null; pointers.clear(); endStroke(); });
}
