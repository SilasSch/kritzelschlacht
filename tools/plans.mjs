// Testarmeen pro Mission und Konter-Erwartungen für tools/balance.mjs und die Tests.
// Plan = Array<[type, n, x0, y0, x1, y1]> (blaue Rechtecke; x in Anteilen des Missionsrahmens world.frameX, y von H).
import { UNITS } from '../game/js/data.js';
import { placeRect } from '../game/js/sim.js';
import { frameX } from '../game/js/world.js';

const F = [.32, .3, .38, .7];   // Front
const B = [.18, .32, .25, .68]; // hinten
const Md = [.26, .32, .31, .68]; // Mitte
const Deep = [.05, .1, .12, .9]; // ganz hinten, über fast die ganze Höhe verteilt

// Index 0..8 = Mission 1..9
export const MISSION_PLANS = [
  { smart: [['ritter', 9, ...F]], spam: [['krieger', 30, ...F]] },
  // M2: nur 4 Grenadiere: ihre Bomben fallen in den Nahkampf vor den Rittern und treffen die eigenen Ritter mit
  { smart: [['ritter', 12, ...F], ['grenadier', 4, ...B]], spam: [['krieger', 50, ...F]] },
  { smart: [['biene', 170, ...F]], spam: [['krieger', 55, ...F]] },
  { smart: [['reiter', 30, ...F]], spam: [['krieger', 60, ...F]] },
  { smart: [['magier', 14, ...B]], spam: [['krieger', 55, ...F]] },
  { smart: [['biene', 180, ...F]], spam: [['wolf', 80, ...F]] },
  // M7: Bären und Wölfe kommen durch die Lavalücke (Wegfindung); weit hinten und breit verteilt (beides nötig)
  // schießen die Schützen am längsten, bevor die Tiere heran sind
  { smart: [['schuetze', 34, ...Deep]], spam: [['krieger', 55, ...F]] },
  { smart: [['schuetze', 14, ...Md], ['magier', 16, ...B]], spam: [['krieger', 85, ...F]] },
  { smart: [['soldat', 16, ...F], ['panzerfaust', 12, ...B]], spam: [['krieger', 75, ...F]] },
];

// Missionen (Index), deren Spam-Plan verlieren muss: M2, M4, M5, M7, M8, M9.
// M3 (Eiserne Front) und M6 (Wilde Jagd) sind ausgenommen; der M1-Spam (Einstieg) muss gewinnen.
export const SPAM_MUST_LOSE = [1, 3, 4, 6, 7, 8];

// [a, b, Punkte]: a schlägt b bei gleichen Punkten. Liegt in game/js/data.js (die Charakterkarten lesen sie).
export { COUNTERS } from '../game/js/data.js';

// Weltformen, an denen das Balance-Gate gelten muss (Welt = Viewport / Grundzoom, main.js baseZoomFor).
// 1400×875 = 1280×800-Laptop; die anderen sind typische Laptop-Viewports; 1400×1050 = 1024×768.
export const SHAPES = [[1400, 875], [1614, 820], [1670, 826], [1726, 820], [1670, 939], [1400, 1050]];

// Duell-Aufstellung: a links (blau), b rechts (rot)
export const DUEL_A = [.22, .3, .34, .7];
export const DUEL_B = [.66, .3, .78, .7];

// Setzt einen Plan als blaue Einheiten (Rasterlayout wie placeRect, im Missionsrahmen) und gibt die Kosten zurück.
export function placePlan(world, plan) {
  let spent = 0;
  for (const [type, n, x0, y0, x1, y1] of plan) {
    placeRect(world, type, n, frameX(world, x0) / world.W, y0, frameX(world, x1) / world.W, y1, 'blau');
    spent += n * UNITS[type].cost;
  }
  return spent;
}
