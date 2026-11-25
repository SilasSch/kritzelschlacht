// Gegner vorstellen (25.11.): beim ersten Laden einer Mission fährt die Kamera kurz an die gegnerische Armee heran
// und zoomt dann zurück auf das ganze Feld. Reine Kamera-Mathematik (camera.js), kein DOM. Ein Klick oder das Mausrad
// bricht ab (main.js).
import { clampCamera } from './camera.js';

export const INTRO = { HOLD: .9, OUT: 1.3, ZOOM: 1.8 };
const ease = t => (t < .5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

// Mittelpunkt und Ausdehnung der Einheiten eines Teams (oder null)
export function armyCenter(units, team) {
  let n = 0, sx = 0, sy = 0;
  for (const u of units) if (u.alive && u.team === team) { n++; sx += u.x; sy += u.y; }
  return n ? { x: sx / n, y: sy / n, n } : null;
}

// Kamera zur Zeit t (s seit Start) auf target ausrichten. Liefert false, sobald die Fahrt vorbei ist (Kamera auf fit).
export function introCam(cam, target, t) {
  const p = t <= INTRO.HOLD ? 0 : Math.min(1, (t - INTRO.HOLD) / INTRO.OUT), k = ease(p);
  const z0 = cam.fit * INTRO.ZOOM;
  cam.zoom = z0 + (cam.fit - z0) * k;
  const cx = target.x + (cam.worldW / 2 - target.x) * k, cy = target.y + (cam.worldH / 2 - target.y) * k;
  cam.x = cx - cam.viewW / cam.zoom / 2;
  cam.y = cy - cam.viewH / cam.zoom / 2;
  clampCamera(cam);
  return p < 1;
}

// Kurzbeschreibung der Gegner: [[typ, anzahl], …], größte Gruppe zuerst
export function armySummary(units, team, max = 4) {
  const m = new Map();
  for (const u of units) if (u.alive && u.team === team && u.T.paint !== false) m.set(u.type, (m.get(u.type) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, max);
}
