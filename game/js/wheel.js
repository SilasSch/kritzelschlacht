// Reine Mausrad-Logik (kein DOM): Mausrad, Touchpad und Zwei-Finger-Pinch -> Zoomfaktor oder Pinseländerung.
// e = { deltaX, deltaY, deltaMode, shiftKey, ctrlKey } wie WheelEvent; viewH = Ansichtshöhe in px (Seitenmodus).
// Zoom ist stetig: Faktor = exp(-dy * k), ein Mausrad-Raster (~100 px) gibt ~1,15×, viele kleine
// Touchpad-Schritte zoomen entsprechend wenig. Shift+Rad ändert den Pinsel; kleine Schritte werden
// gesammelt, bis ein ganzer Pixel zusammenkommt (ein Raster ~8 px). Seitwärts wischen ohne Shift tut nichts.
export const LINE_PX = 16;                       // deltaMode 1 (Zeilen)
export const NOTCH_PX = 100;                     // typisches Mausrad-Raster in px
export const NOTCH_ZOOM = 1.15;                  // Zoom je Raster
export const ZOOM_K = Math.log(NOTCH_ZOOM) / NOTCH_PX;
export const PINCH_K = .01;                      // Strg+Rad (Pinch): Chrome meldet ~ -100·ln(Skalierung)
export const MAX_EVENT_ZOOM = 1.25;              // höchstens so viel je Ereignis
export const BRUSH_PER_NOTCH = 8;                // Pinsel-px je Raster

export function createWheel() { return { acc: 0 }; }

// Normalisiert auf Pixel (deltaMode 0 px, 1 Zeilen, 2 Seiten).
export function wheelPx(d, mode, viewH) {
  if (mode === 1) return d * LINE_PX;
  if (mode === 2) return d * (viewH || 800);
  return d;
}

// Gibt { zoom: Faktor } oder { brush: ganze px } oder null zurück.
export function wheelAction(state, e, viewH) {
  const mode = e.deltaMode || 0;
  if (e.shiftKey) {
    // Manche Browser machen aus Shift+Rad ein deltaX
    const d = wheelPx(e.deltaY || e.deltaX || 0, mode, viewH);
    if (!d) return null;
    if (state.acc && Math.sign(state.acc) !== Math.sign(-d)) state.acc = 0; // Richtungswechsel
    const lim = BRUSH_PER_NOTCH;
    state.acc = Math.min(lim, Math.max(-lim, state.acc - d * BRUSH_PER_NOTCH / NOTCH_PX));
    const whole = Math.trunc(state.acc);
    if (!whole) return null;
    state.acc -= whole;
    return { brush: whole };
  }
  const d = wheelPx(e.deltaY || 0, mode, viewH);   // deltaX ohne Shift: seitwärts wischen zoomt nicht
  if (!d) return null;
  const f = Math.exp(-d * (e.ctrlKey ? PINCH_K : ZOOM_K));
  return { zoom: Math.min(MAX_EVENT_ZOOM, Math.max(1 / MAX_EVENT_ZOOM, f)) };
}
