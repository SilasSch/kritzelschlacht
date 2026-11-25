// Erfolge (25.11.): spielübergreifende Ziele mit Fortschritt. Rein (kein DOM). Der Zustand liegt im Spielstand
// (save.ach = { n: Zähler, types: gemalte Typen, forms: genutzte Formen, got: { id: Tag } }). main.js meldet Ereignisse
// mit bump/addType/addForm/flag und fragt danach unlocked(ach) nach neuen Erfolgen.
import { UNITS } from './data.js';

const PAINT = () => Object.keys(UNITS).filter(t => UNITS[t].paint !== false);
const n = (a, k) => a.n[k] || 0;

// p(ach) → [aktuell, Ziel]
export const ACHIEVEMENTS = [
  { id: 'sieg1', icon: '🏁', n: 'Erster Sieg', d: 'Gewinne eine Mission.', p: a => [n(a, 'wins'), 1] },
  { id: 'sieg25', icon: '🎖️', n: 'Feldherr', d: 'Gewinne 25 Missionen.', p: a => [n(a, 'wins'), 25] },
  { id: 'spar', icon: '🪙', n: 'Sparfuchs', d: 'Gewinne eine Mission mit höchstens der Hälfte des Budgets.', p: a => [n(a, 'half'), 1] },
  { id: 'heil', icon: '🛡️', n: 'Alle heil', d: 'Gewinne eine Mission ohne eigene Verluste.', p: a => [n(a, 'flawless'), 1] },
  { id: 'maler', icon: '🖌️', n: 'Kritzelkünstler', d: 'Male insgesamt 1000 Einheiten.', p: a => [n(a, 'painted'), 1000] },
  { id: 'sammler', icon: '📚', n: 'Sammler', d: 'Male jede Einheit mindestens einmal.', p: a => [a.types.filter(t => UNITS[t]).length, PAINT().length] },
  { id: 'formen', icon: '📐', n: 'Formationsmeister', d: 'Male Sturmkeil, Igel und Schlachtreihe.', p: a => [a.forms.length, 3] },
  { id: 'kills', icon: '⚔️', n: 'Tausend Siege', d: 'Besiege insgesamt 1000 Gegner.', p: a => [n(a, 'kills'), 1000] },
  { id: 'drache', icon: '🐉', n: 'Drachentöter', d: 'Besiege einen feindlichen Drachen.', p: a => [n(a, 'dragon'), 1] },
  { id: 'welle5', icon: '🌊', n: 'Wellenbrecher', d: 'Schaffe 5 Wellen im Wellenmodus.', p: a => [Math.min(5, n(a, 'wave')), 5] },
  { id: 'welle10', icon: '🌋', n: 'Unbezwingbar', d: 'Schaffe 10 Wellen im Wellenmodus.', p: a => [Math.min(10, n(a, 'wave')), 10] },
  { id: 'woche', icon: '📅', n: 'Wochensieger', d: 'Hol drei Sterne in einer Wochenchallenge.', p: a => [n(a, 'weekly3'), 1] },
  { id: 'tag', icon: '☀️', n: 'Tagesheld', d: 'Gewinne eine Tageschallenge.', p: a => [n(a, 'daily'), 1] },
  { id: 'kapitel', icon: '🗺️', n: 'Kapitel geschafft', d: 'Schaffe alle Level eines Kapitels.', p: a => [n(a, 'chapter'), 1] },
  { id: 'feldzug', icon: '🏰', n: 'Eroberer', d: 'Gewinne einen Feldzug.', p: a => [n(a, 'run'), 1] },
  { id: 'zuschauer', icon: '🍿', n: 'Zuschauer', d: 'Schau 10 Zufallsschlachten bis zum Ende zu.', p: a => [n(a, 'watched'), 10] },
  { id: 'video', icon: '🎬', n: 'Regisseur', d: 'Speichere eine Schlacht als Video.', p: a => [n(a, 'video'), 1] },
];
export const ACH = Object.fromEntries(ACHIEVEMENTS.map(x => [x.id, x]));

export const emptyAch = () => ({ n: {}, types: [], forms: [], got: {} });

export function cleanAch(raw) {
  const a = emptyAch();
  if (!raw || typeof raw !== 'object') return a;
  if (raw.n && typeof raw.n === 'object') for (const k of Object.keys(raw.n)) { const v = Math.floor(Number(raw.n[k])); if (v > 0 && v < 1e9) a.n[k] = v; }
  if (Array.isArray(raw.types)) a.types = [...new Set(raw.types.filter(t => typeof t === 'string' && UNITS[t]))];
  if (Array.isArray(raw.forms)) a.forms = [...new Set(raw.forms.filter(f => ['keil', 'kreis', 'linie'].includes(f)))];
  if (raw.got && typeof raw.got === 'object') for (const k of Object.keys(raw.got)) if (ACH[k] && /^\d{4}-\d{2}-\d{2}$/.test(raw.got[k])) a.got[k] = raw.got[k];
  return a;
}

export const bump = (a, k, by = 1) => { a.n[k] = (a.n[k] || 0) + by; };
export const atLeast = (a, k, v) => { if (v > (a.n[k] || 0)) a.n[k] = v; };
export const addType = (a, t) => { if (UNITS[t] && !a.types.includes(t)) a.types.push(t); };
export const addForm = (a, f) => { if (!a.forms.includes(f)) a.forms.push(f); };

// Neu erreichte Erfolge eintragen (got[id] = Tag) und zurückgeben
export function unlocked(a, day) {
  const out = [];
  for (const x of ACHIEVEMENTS) {
    if (a.got[x.id]) continue;
    const [c, m] = x.p(a);
    if (c >= m) { a.got[x.id] = day; out.push(x); }
  }
  return out;
}
