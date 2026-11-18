// Testarmeen pro Mission und Konter-Erwartungen für tools/balance.mjs und die Tests.
// Plan = Array<[type, n, x0, y0, x1, y1]> (blaue Rechtecke; x in Anteilen des Missionsrahmens world.frameX, y von H).
// Kampagne (Spez. #52): Die Lösungspläne und Spam-Regeln stehen am Level im Kapitelmodul (game/js/campaign/<kapitel>.js:
// plan, spamMustLose, answer …), damit jedes Kapitel eine eigene Datei bleibt. Hier nur die Auswahl der Level für die
// Prüfung (--chapter) und die Namen von früher für die Grundausbildung.
import { UNITS } from '../game/js/data.js';
import { placeRect } from '../game/js/sim.js';
import { frameX, spawn } from '../game/js/world.js';
import { CHAPTERS, chapterById, paintableUnits, unitAllowed, spamMustLose } from '../game/js/campaign/index.js';
import { F } from '../game/js/campaign/areas.js';

const GA = CHAPTERS[0].levels;   // Grundausbildung, Index 0..8 = Mission 1..9

// Früher hier, jetzt am Level (grundausbildung.js): Index 0..8 = Mission 1..9
export const MISSION_PLANS = GA.map(l => l.plan);
// Missionen (Index), deren Spam-Plan verlieren muss: M2, M4, M5, M7, M8, M9 (level.spamMustLose)
export const SPAM_MUST_LOSE = GA.map((l, i) => (spamMustLose(l) ? i : -1)).filter(i => i >= 0);

// Level für die Prüfung: alle Kapitel oder nur die in chapterArg (kommagetrennte ids). Je Level { level, chapter, ci, li,
// tag, seed }: tag ist der Name in der Ausgabe (Grundausbildung wie früher M1..M9, sonst die id), seed(s) die Saat des
// Laufs s (Grundausbildung wie früher 1000 · (li + 1) + s; andere Kapitel dazu + 100 · ci, unabhängig von anderen Kapiteln).
export function selectLevels(chapterArg) {
  const want = chapterArg ? chapterArg.split(',').map(s => s.trim()).filter(Boolean) : null;
  if (want) for (const id of want) if (!chapterById(id)) throw new Error(`unbekanntes Kapitel: ${id} (bekannt: ${CHAPTERS.map(c => c.id).join(', ')})`);
  const out = [];
  CHAPTERS.forEach((chapter, ci) => {
    if (want && !want.includes(chapter.id)) return;
    chapter.levels.forEach((level, li) => out.push({
      level, chapter, ci, li,
      tag: ci === 0 ? `M${li + 1}` : level.id,
      seed: s => 1000 * (li + 1) + (ci === 0 ? 0 : 100 * ci) + s,
    }));
  });
  return out;
}
// --chapter=… aus den Argumenten; der Rest bleibt in der alten Reihenfolge (cmd, runs, Form)
export function parseArgs(argv) {
  const chapter = (argv.find(a => a.startsWith('--chapter=')) || '').slice('--chapter='.length) || null;
  return { chapter, pos: argv.filter(a => !a.startsWith('--')) };
}

// Spam einzelner neuer Einheiten mit vollem Budget (Spez. Nachtrag 3, Einschränkungen): wo der Spam-Plan einer
// Mission verlieren muss (spamMustLose), darf auch eine neue Einheit allein die Mission nicht billig lösen. Grund:
// nur der Krieger-Spam war geprüft, und 23 Römer (unter par) gewannen M5 mit drei Sternen (finale Prüfung, Römer-
// Runde). Geprüft wird jede gelistete Einheit in jedem dieser Level, das sie erlaubt (units, cats), außer sie ist dort
// die Lösung (level.answer). Ein späterer Plan nimmt hier alle neuen Einheiten auf.
export const UNIT_SPAM = ['roemer'];
// lv: Level oder (wie früher) Index der Grundausbildung
const lvl = lv => (typeof lv === 'number' ? GA[lv] : lv);
export const unitSpamAllowed = (lv, type) => unitAllowed(lvl(lv), type) && UNITS[type].paint !== false;
// Plan: so viele wie das Budget hergibt, an der Front
export const unitSpamPlan = (lv, type) => [[type, Math.floor(lvl(lv).budget / UNITS[type].cost + 1e-9), ...F]];
// Malbare Einheiten, deren Spam newspam in einem Level prüft
export const spamTypes = lv => paintableUnits(lvl(lv));

// newspam für neue Kapitel (Spez. #52): jede einzelne erlaubte Einheit verliert mit vollem Budget mindestens 6/8,
// außer das Level nennt sie als Lösung (level.answer). Liefert die Anmerkung der Zeile und ob sie besteht.
export function chapterSpamVerdict(level, type, wins, runs, loseMin = 6 / 8) {
  if ((runs - wins) / runs >= loseMin) return { ok: true, note: '' };
  if ((level.answer || []).includes(type)) return { ok: true, note: 'ok: Lösung des Levels (answer)' };
  return { ok: false, note: `FAIL (${type} spam < 6/8 losses)` };
}

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
// Lösung der Mission (Index → Typen): dort darf die neue Einheit mit vollem Budget gewinnen. Jetzt level.answer
// (grundausbildung.js: M5 Die Festung, der Zyklop).
export const SPAM_ANSWER = Object.fromEntries(GA.map((l, i) => [i, l.answer]).filter(e => e[1]));

// [a, b, Punkte]: a schlägt b bei gleichen Punkten. Liegt in game/js/data.js (die Charakterkarten lesen sie).
export { COUNTERS } from '../game/js/data.js';

// Weltformen, an denen das Balance-Gate gelten muss (Welt = Viewport / Grundzoom, main.js baseZoomFor).
// 1400×875 = 1280×800-Laptop; die anderen sind typische Laptop-Viewports; 1400×1050 = 1024×768.
export const SHAPES = [[1600, 900], [1400, 875], [1614, 820], [1670, 826], [1726, 820], [1670, 939], [1400, 1050]];

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
