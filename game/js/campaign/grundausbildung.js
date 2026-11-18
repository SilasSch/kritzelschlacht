// Kapitel 1 „Grundausbildung“ (Spez. #52): die bisherigen 9 Missionen aus data.js MISSIONS, unverändert, dazu je Level
// eine feste id (Sterne im Spielstand, save.js), der Lösungsplan (plan, früher tools/plans.mjs MISSION_PLANS) und die
// Spam-Regeln der Balance-Prüfung (früher SPAM_MUST_LOSE, SPAM_ANSWER und die Sonderfälle M1 und M3 in balance.mjs).
// Felder eines Levels: docs/kampagne.md.
import { MISSIONS } from '../data.js';
import { F, B, Md, Deep } from './areas.js';

// Alte Spielstände speichern Sterne unter dem Index 0–8 der Mission (save.js übersetzt sie in diese ids)
export const LEGACY_IDS = ['ga-1', 'ga-2', 'ga-3', 'ga-4', 'ga-5', 'ga-6', 'ga-7', 'ga-8', 'ga-9'];

// Index 0..8 = Mission 1..9
const PLANS = [
  { smart: [['ritter', 9, ...F]], spam: [['krieger', 30, ...F]] },
  // M2: nur 4 Grenadiere: ihre Bomben fallen in den Nahkampf vor den Rittern und treffen die eigenen Ritter mit
  // Task 7: Budget 100 → 95, Spam 50 → 47 Krieger (mehr passt nicht ins Budget)
  // Nachtrag 7 (#47): par 70 → 75, 14 Ritter + 3 Grenadiere statt 12 + 4 (die Schützen weichen den Bomben aus)
  { smart: [['ritter', 15, ...F], ['grenadier', 3, ...B]], spam: [['krieger', 47, ...F]] },
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
  // M8: Drachenatem trifft seit dem Fix bis zur Angriffsreichweite, auch Schützen auf Abstand (vorher nie): 14 Schützen
  // gewannen nur noch 0/4, 24 Schützen wieder fast immer (par 120 → 140, data.js)
  { smart: [['schuetze', 24, ...Md], ['magier', 16, ...B]], spam: [['krieger', 85, ...F]] },
  // M9: Task 7: Panzerfäuste in der Mitte statt hinten (gleiche Kosten): mit Rückzug kamen sie von hinten zu spät an die
  // Panzer (5/8 an 1400×1050, vorher an einzelnen Formen 6/8); in der Mitte 8/8 an allen Formen
  { smart: [['soldat', 16, ...F], ['panzerfaust', 12, ...Md]], spam: [['krieger', 75, ...F]] },
];

// Spam-Regeln je Mission. Der Spam-Plan muss in M2, M4, M5, M7, M8, M9 verlieren (spamMustLose, Vorgabe für neue
// Kapitel). Ausgenommen: M1 (Einstieg), dort muss der Krieger-Spam gewinnen (spamMustWin); M3 (Eiserne Front): schon in
// der alten Engine gewann der Krieger-Spam manchmal gegen den Ritter-Schildwall, die Mission lehrt aber, dass Bienen (und
// Bomben, Feuer) den Wall knacken, darum gewinnt er höchstens 4/8 (spamMaxWins); M6 (Wilde Jagd) wird nicht geprüft.
// answer: Lösung der Mission, dort darf eine einzelne Einheit mit vollem Budget gewinnen (newspam). M5 (Die Festung) lehrt
// Reichweite über die Mauer (Hinweis: Magier schießen weiter als Schützen; Smart-Plan 14 Magier); der Zyklop ist genau
// diese Artillerie (280 px über Mauern). Er gewann M5 auch mit 5 Zyklopen (Kosten 14) oder 200 px Reichweite 8/8.
const RULES = [
  { spamMustLose: false, spamMustWin: true },
  { spamMustLose: true },
  { spamMustLose: false, spamMaxWins: 4 / 8 },
  { spamMustLose: true },
  { spamMustLose: true, answer: ['zyklop'] },
  { spamMustLose: false },
  { spamMustLose: true },
  { spamMustLose: true },
  { spamMustLose: true },
];

export default {
  id: 'grundausbildung',
  n: 'Grundausbildung',
  d: 'Die ersten neun Missionen: Schildwall, Wasser, Mauern, Lava, Drachen und Panzer.',
  levels: MISSIONS.map((m, i) => ({ ...m, id: LEGACY_IDS[i], plan: PLANS[i], ...RULES[i] })),
};
