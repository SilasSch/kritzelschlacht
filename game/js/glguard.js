// WebGL-Kontextverlust (Grafiktreiber setzt zurück, Tab lange im Hintergrund, Handy wechselt die App): PixiJS stellt die
// Texturen nach "webglcontextrestored" selbst wieder her. Hier hält das Spiel solange an, zeigt einen Hinweis und zeichnet
// danach das Gelände neu. Kommt der Kontext nicht binnen RELOAD_AFTER_MS zurück, bietet der Hinweis "Neu laden" an.
import { tr } from './i18n.js';
export const RELOAD_AFTER_MS = 4000;

// canvas: das WebGL-Canvas; box: Element für den Hinweis (index.html #glLost); hooks: { pause(on), restored() }
export function guardContext(canvas, box, hooks, timers = globalThis) {
  let timer = 0, lost = false;
  const msg = box.querySelector('p'), btn = box.querySelector('button');
  btn.onclick = () => location.reload();
  canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();   // ohne preventDefault gibt der Browser den Kontext nie zurück
    if (lost) return;
    lost = true;
    hooks.pause(true);
    msg.textContent = tr('Die Grafik wurde zurückgesetzt. Einen Moment …');
    btn.hidden = true; box.hidden = false;
    timer = timers.setTimeout(() => { msg.textContent = tr('Die Grafik kommt nicht zurück. Neu laden hilft (Spielstand bleibt erhalten).'); btn.hidden = false; }, RELOAD_AFTER_MS);
  });
  canvas.addEventListener('webglcontextrestored', () => {
    if (!lost) return;
    lost = false;
    timers.clearTimeout(timer);
    box.hidden = true;
    hooks.restored();
    hooks.pause(false);
  });
  return { get lost() { return lost; } };
}
