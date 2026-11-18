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
  // Task 7: Budget 100 → 95, Spam 50 → 47 Krieger (mehr passt nicht ins Budget)
  // Nachtrag 7 (#47): par 70 → 75, 14 Ritter + 3 Grenadiere statt 12 + 4 (die Schützen weichen den Bomben aus)
  { smart: [['ritter', 14, ...F], ['grenadier', 3, ...B]], spam: [['krieger', 47, ...F]] },
  // M3, M6: Bienen kosten 0,55 statt 0,5 (Nachtrag 4, #37). Task 7: par 85 → 90 bzw. 90 → 95 und 163 bzw. 172 Bienen
  // (154 bzw. 163 gewannen an einzelnen Formen nur 3/8 bzw. 4/8; die alten Pläne hatten 170 bzw. 180)
  { smart: [['biene', 163, ...F]], spam: [['krieger', 55, ...F]] },
  { smart: [['reiter', 30, ...F]], spam: [['krieger', 60, ...F]] },
  { smart: [['magier', 14, ...B]], spam: [['krieger', 55, ...F]] },
  // M6: 163 Bienen hinten (B) statt vorn: der Schwarm sammelt sich, bevor die Reiter da sind (vorn 5/8, hinten 8/8)
  { smart: [['biene', 172, ...B]], spam: [['wolf', 80, ...F]] },
  // M7: Bären und Wölfe kommen durch die Lavalücke (Wegfindung); weit hinten und breit verteilt (beides nötig)
  // schießen die Schützen am längsten, bevor die Tiere heran sind
  { smart: [['schuetze', 34, ...Deep]], spam: [['krieger', 55, ...F]] },
  { smart: [['schuetze', 14, ...Md], ['magier', 16, ...B]], spam: [['krieger', 85, ...F]] },
  // M9: Task 7: Panzerfäuste in der Mitte statt hinten (gleiche Kosten): mit Rückzug kamen sie von hinten zu spät an die
  // Panzer (5/8 an 1400×1050, vorher an einzelnen Formen 6/8); in der Mitte 8/8 an allen Formen
  { smart: [['soldat', 16, ...F], ['panzerfaust', 12, ...Md]], spam: [['krieger', 75, ...F]] },
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

// newspam (tools/balance.mjs, Task 7; Vorgabe 6): geprüft und gemeldet werden alle malbaren Einheiten, das Gate (Exitcode)
// gilt für die Einheiten dieser Runde (NEW_UNITS, mit dem Römer der Vorrunde). Eine neue Einheit verliert mit vollem
// Budget mindestens 6/8, oder sie gewinnt höchstens so oft wie der Spam der bestehenden Einheit derselben Rolle
// (SPAM_ROLE) mit demselben Budget in derselben Mission: dann macht sie die Mission nicht leichter, als sie schon ist.
// Grund: mit vollem Budget (rund 1,4 × par) gewinnen schon die bestehenden Einheiten viele Missionen, auch die Lösung der
// Mission selbst (M4: 40 Reiter 8/8, M5: 16 Magier 8/8, M7: 44 Schützen 8/8); bei der Prüfung aller Einheiten verloren 87
// von 186 Spam-Läufen keine 6/8 (Bericht Task 7). Bestehende Einheiten sind darum nur Auskunft, kein Gate.
export const NEW_UNITS = ['roemer', 'vampir', 'troll', 'zyklop', 'hexe', 'phoenix', 'einhorn', 'elefant', 'krokodil', 'gorilla', 'adler', 'bueffel'];
// neue Einheit → bestehende Einheit derselben Rolle (der Vampir hat keine: er muss überall verlieren)
export const SPAM_ROLE = {
  einhorn: 'reiter',   // Sturmläufer, reitet durch
  bueffel: 'reiter',   // Sturm (Stampede)
  zyklop: 'moerser',   // Artillerie im Bogen über Mauern
  phoenix: 'geist',    // tief fliegender Nahkämpfer
  adler: 'geist',      // tief fliegender Nahkämpfer, jagt Fernkämpfer
  hexe: 'magier',      // Zauberin auf Distanz
  troll: 'baer',       // zäher, schwerer Nahkämpfer
  gorilla: 'baer',
  elefant: 'baer',
  krokodil: 'krieger', // Nahkämpfer am Boden
};
// Lösung der Mission (Index → Typen): dort darf die neue Einheit mit vollem Budget gewinnen. M5 (Die Festung) lehrt
// Reichweite über die Mauer (Hinweis: Magier schießen weiter als Schützen; Smart-Plan 14 Magier); der Zyklop ist genau
// diese Artillerie (280 px über Mauern). Er gewann M5 auch mit 5 Zyklopen (Kosten 14) oder 200 px Reichweite 8/8.
export const SPAM_ANSWER = { 4: ['zyklop'] };

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

// Unterstützung darf nicht dominieren (Nachtrag 4, #38): [a, Helfer, b, Punkte]. Blau hat je die Hälfte der Punkte in a
// (DUEL_A) und im Helfer (SUPPORT_REAR, dahinter), Rot alle Punkte in b. Blau darf höchstens SUPPORT_MAX der Läufe gewinnen.
export const SUPPORT_DUELS = [['krieger', 'sani', 'krieger', 90], ['schuetze', 'sani', 'schuetze', 90], ['soldat', 'sani', 'soldat', 105]];
export const SUPPORT_REAR = [.12, .35, .2, .65];

// Setzt einen Plan als blaue Einheiten (Rasterlayout wie placeRect, im Missionsrahmen) und gibt die Kosten zurück.
export function placePlan(world, plan) {
  let spent = 0;
  for (const [type, n, x0, y0, x1, y1] of plan) {
    placeRect(world, type, n, frameX(world, x0) / world.W, y0, frameX(world, x1) / world.W, y1, 'blau');
    spent += n * UNITS[type].cost;
  }
  return spent;
}
