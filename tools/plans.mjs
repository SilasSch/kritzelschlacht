// Testarmeen pro Mission und Konter-Erwartungen für tools/balance.mjs und die Tests.
// Plan = Array<[type, n, x0, y0, x1, y1]> (blaue Rechtecke; x in Anteilen des Missionsrahmens world.frameX, y von H).
import { UNITS, MISSIONS } from '../game/js/data.js';
import { placeRect } from '../game/js/sim.js';
import { frameX, spawn } from '../game/js/world.js';

const F = [.32, .3, .38, .7];   // Front
const B = [.18, .32, .25, .68]; // hinten
const Md = [.26, .32, .31, .68]; // Mitte
const Deep = [.05, .1, .12, .9]; // ganz hinten, über fast die ganze Höhe verteilt

// Index 0..8 = Mission 1..9
export const MISSION_PLANS = [
  { smart: [['ritter', 9, ...F]], spam: [['krieger', 30, ...F]] },
  // M2: nur 4 Grenadiere: ihre Bomben fallen in den Nahkampf vor den Rittern und treffen die eigenen Ritter mit
  { smart: [['ritter', 12, ...F], ['grenadier', 4, ...B]], spam: [['krieger', 50, ...F]] },
  // M3, M6: Bienen kosten 0,55 statt 0,5 (Nachtrag 4, #37): 154 bzw. 163 statt 170 bzw. 180, damit der Plan unter par bleibt
  { smart: [['biene', 154, ...F]], spam: [['krieger', 55, ...F]] },
  { smart: [['reiter', 30, ...F]], spam: [['krieger', 60, ...F]] },
  { smart: [['magier', 14, ...B]], spam: [['krieger', 55, ...F]] },
  // M6: 163 Bienen hinten (B) statt vorn: der Schwarm sammelt sich, bevor die Reiter da sind (vorn 5/8, hinten 8/8)
  { smart: [['biene', 163, ...B]], spam: [['wolf', 80, ...F]] },
  // M7: Bären und Wölfe kommen durch die Lavalücke (Wegfindung); weit hinten und breit verteilt (beides nötig)
  // schießen die Schützen am längsten, bevor die Tiere heran sind
  { smart: [['schuetze', 34, ...Deep]], spam: [['krieger', 55, ...F]] },
  { smart: [['schuetze', 14, ...Md], ['magier', 16, ...B]], spam: [['krieger', 85, ...F]] },
  { smart: [['soldat', 16, ...F], ['panzerfaust', 12, ...B]], spam: [['krieger', 75, ...F]] },
];

// Missionen (Index), deren Spam-Plan verlieren muss: M2, M4, M5, M7, M8, M9.
// M3 (Eiserne Front) und M6 (Wilde Jagd) sind ausgenommen; der M1-Spam (Einstieg) muss gewinnen.
export const SPAM_MUST_LOSE = [1, 3, 4, 6, 7, 8];

// Spam einzelner neuer Einheiten mit vollem Budget (Spez. Nachtrag 3, Einschränkungen): wo der Spam-Plan einer
// Mission verlieren muss (SPAM_MUST_LOSE), darf auch eine neue Einheit allein die Mission nicht billig lösen. Grund:
// nur der Krieger-Spam war geprüft, und 23 Römer (unter par) gewannen M5 mit drei Sternen (finale Prüfung, Römer-
// Runde). Geprüft wird jede gelistete Einheit in jeder dieser Missionen, deren Kategorien sie erlauben
// (MISSIONS[i].cats). Ein späterer Plan nimmt hier alle neuen Einheiten auf.
export const UNIT_SPAM = ['roemer'];
export const unitSpamAllowed = (i, type) => !MISSIONS[i].cats || MISSIONS[i].cats.includes(UNITS[type].cat);
// Plan: so viele wie das Budget hergibt, an der Front
export const unitSpamPlan = (i, type) => [[type, Math.floor(MISSIONS[i].budget / UNITS[type].cost + 1e-9), ...F]];

// [a, b, Punkte]: a schlägt b bei gleichen Punkten. Liegt in game/js/data.js (die Charakterkarten lesen sie).
export { COUNTERS } from '../game/js/data.js';

// Weltformen, an denen das Balance-Gate gelten muss (Welt = Viewport / Grundzoom, main.js baseZoomFor).
// 1400×875 = 1280×800-Laptop; die anderen sind typische Laptop-Viewports; 1400×1050 = 1024×768.
export const SHAPES = [[1400, 875], [1614, 820], [1670, 826], [1726, 820], [1670, 939], [1400, 1050]];

// Duell-Aufstellung: a links (blau), b rechts (rot)
export const DUEL_A = [.22, .3, .34, .7];
export const DUEL_B = [.66, .3, .78, .7];

// Duell-Dichte je Typ (Nachtrag 4, #35): Römer bilden nur aus dicht gemalten Gruppen einen Block (formation.FORM.LINK
// 50 px). Das Raster von placeRect in DUEL_A/DUEL_B hat bis zu 104 px Spaltenabstand, also setzt das Duell sie wie
// gemalt: ein fast quadratisches Raster mit DUEL_DENSE[type] px Abstand, mittig im Duell-Rechteck. Nur der Prüfstand,
// keine Spielregel.
export const DUEL_DENSE = { roemer: 24 };
// Setzt n Einheiten vom Typ type ins Duell-Rechteck rect (Anteile von W und H, wie placeRect): dicht für DUEL_DENSE-Typen,
// sonst placeRect. Zufall wie placeRect (±2 px je Achse über world.rng).
export function placeDuel(world, type, n, rect, team) {
  const sp = DUEL_DENSE[type];
  if (!sp) { placeRect(world, type, n, ...rect, team); return; }
  const [x0, y0, x1, y1] = rect, cx = (x0 + x1) / 2 * world.W, cy = (y0 + y1) / 2 * world.H;
  const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
  for (let k = 0; k < n; k++) {
    const i = k % cols, j = (k / cols) | 0;
    const x = cx + (i - (cols - 1) / 2) * sp + (world.rng() * 4 - 2);
    const y = cy + (j - (rows - 1) / 2) * sp + (world.rng() * 4 - 2);
    spawn(world, type, x, y, team);
  }
}

// Setzt einen Plan als blaue Einheiten (Rasterlayout wie placeRect, im Missionsrahmen) und gibt die Kosten zurück.
export function placePlan(world, plan) {
  let spent = 0;
  for (const [type, n, x0, y0, x1, y1] of plan) {
    placeRect(world, type, n, frameX(world, x0) / world.W, y0, frameX(world, x1) / world.W, y1, 'blau');
    spent += n * UNITS[type].cost;
  }
  return spent;
}
