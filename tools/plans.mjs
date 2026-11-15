// Testarmeen pro Mission und Konter-Erwartungen für tools/balance.mjs und die Tests.
// Plan = Array<[type, n, x0, y0, x1, y1]> (blaue Rechtecke in Anteilen von W/H).
import { UNITS } from '../game/js/data.js';
import { placeRect } from '../game/js/sim.js';

const F = [.32, .3, .38, .7];   // Front
const B = [.18, .32, .25, .68]; // hinten
const Md = [.26, .32, .31, .68]; // Mitte

// Index 0..8 = Mission 1..9
export const MISSION_PLANS = [
  { smart: [['ritter', 9, ...F]], spam: [['krieger', 30, ...F]] },
  { smart: [['ritter', 10, ...F], ['grenadier', 6, ...B]], spam: [['krieger', 50, ...F]] },
  { smart: [['biene', 160, ...F]], spam: [['krieger', 55, ...F]] },
  { smart: [['reiter', 30, ...F]], spam: [['krieger', 60, ...F]] },
  { smart: [['magier', 14, ...B]], spam: [['krieger', 55, ...F]] },
  { smart: [['biene', 180, ...F]], spam: [['wolf', 80, ...F]] },
  { smart: [['schuetze', 30, ...B]], spam: [['krieger', 55, ...F]] },
  { smart: [['schuetze', 14, ...Md], ['magier', 16, ...B]], spam: [['krieger', 85, ...F]] },
  { smart: [['soldat', 16, ...F], ['panzerfaust', 12, ...B]], spam: [['krieger', 75, ...F]] },
];

// Missionen (Index), deren Spam-Plan verlieren muss: M2, M4, M5, M7, M8, M9.
// M1 (Tutorial), M3 (Eiserne Front) und M6 (Wilde Jagd) sind ausgenommen.
export const SPAM_MUST_LOSE = [1, 3, 4, 6, 7, 8];

// [a, b, Punkte]: a schlägt b bei gleichen Punkten
export const COUNTERS = [
  ['ritter', 'krieger', 60], ['ritter', 'schuetze', 60], ['ritter', 'reiter', 60],
  ['biene', 'ritter', 60], ['biene', 'schuetze', 60], ['krieger', 'biene', 60],
  ['wolf', 'schuetze', 60], ['wolf', 'grenadier', 60],
  ['reiter', 'schuetze', 60], ['reiter', 'grenadier', 60],
  ['magier', 'krieger', 60], ['grenadier', 'krieger', 60],
  ['panzerfaust', 'panzer', 90], ['panzerfaust', 'heli', 90], ['soldat', 'heli', 90],
  ['panzer', 'krieger', 105], ['panzer', 'soldat', 105],
  ['mg', 'biene', 90], ['mg', 'krieger', 90], ['sniper', 'ritter', 90],
];

// Duell-Aufstellung: a links (blau), b rechts (rot)
export const DUEL_A = [.22, .3, .34, .7];
export const DUEL_B = [.66, .3, .78, .7];

// Setzt einen Plan als blaue Einheiten (Rasterlayout wie placeRect) und gibt die Kosten zurück.
export function placePlan(world, plan) {
  let spent = 0;
  for (const [type, n, x0, y0, x1, y1] of plan) {
    placeRect(world, type, n, x0, y0, x1, y1, 'blau');
    spent += n * UNITS[type].cost;
  }
  return spent;
}
