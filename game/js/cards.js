// Charakterkarten (Spez. #29): reine Kartendaten aus UNITS, COUNTERS und den Fähigkeitstexten (UNITS[t].abil).
// Kein DOM; ui.js baut daraus die Karte beim Hover bzw. bei Auswahl und das Lexikon. Alles wird aus den
// Spieldaten gelesen, neue Einheiten erscheinen also ohne Zusatzarbeit.
import { UNITS, COUNTERS, CATEGORIES, RANGED } from './data.js';

// Gilt für alle Einheiten (Spez. #27); steht einmal im Lexikon statt auf jeder Karte
export const RETREAT_NOTE = 'Alle Einheiten ziehen sich ab 25 % Leben zurück, erholen sich abseits und kehren ab 60 % in den Kampf zurück. Römer im Block halten bis 15 % durch.';

// Fernkampf ab dieser Reichweite (px); darunter Nahkampf
const MELEE_MAX = 20;

// Schaden je Sekunde (Heiler: Heilung je Sekunde); der Balken zeigt so auch Dauerfeuer (MG) und Feueratem richtig
const dps = T => (T.dmg || T.heal || 0) / (T.cd || 1);

// Maxima über alle Einheiten, einmal beim ersten Aufruf (UNITS ändert sich zur Laufzeit nicht)
let MAX = null;
function maxima() {
  if (MAX) return MAX;
  MAX = { hp: 0, dmg: 0, speed: 0, range: 0, cost: 0 };
  for (const t in UNITS) {
    const T = UNITS[t];
    MAX.hp = Math.max(MAX.hp, T.hp); MAX.dmg = Math.max(MAX.dmg, dps(T)); MAX.speed = Math.max(MAX.speed, T.speed);
    MAX.range = Math.max(MAX.range, T.range); MAX.cost = Math.max(MAX.cost, T.cost);
  }
  return MAX;
}

// 0..1 relativ zum Maximum aller Einheiten. Leben, Schaden, Reichweite und Kosten spannen mehr als eine
// Zehnerpotenz (Bienen 7 LP, Panzer 1000): dort zeigt die Wurzel den Anteil, sonst wären Krieger und Ritter
// kaum sichtbare Striche. Tempo liegt eng beieinander (32..135) und bleibt linear.
const rel = (v, m, sqrt) => (m > 0 ? Math.min(1, Math.max(0, sqrt ? Math.sqrt(v / m) : v / m)) : 0);

const uniq = a => [...new Set(a)];

export function unitCard(type) {
  const T = UNITS[type];
  if (!T) return null;
  const M = maxima();
  const tags = [];
  if (T.heal) tags.push('Heilt');
  else tags.push(T.range >= MELEE_MAX || RANGED.has(type) ? 'Fernkampf' : 'Nahkampf');
  if (T.fly) tags.push('Fliegt');
  if (T.splash) tags.push('Flächenschaden');
  // nicht malbar (Ghul): erscheint nur im Lexikon, die Fähigkeitstexte sagen, wie er entsteht (Vorgabe 3)
  if (T.paint === false) tags.push('Nicht malbar');
  return {
    type,
    name: T.n,
    cat: T.cat,
    desc: T.d,
    stats: {
      hp: rel(T.hp, M.hp, true),
      dmg: rel(dps(T), M.dmg, true),
      speed: rel(T.speed, M.speed, false),
      range: rel(T.range, M.range, true),
      cost: rel(T.cost, M.cost, true),
    },
    raw: {
      hp: T.hp, dmg: T.dmg || 0, heal: T.heal || 0, dps: Math.round(dps(T) * 10) / 10, cd: T.cd,
      speed: T.speed, range: T.range, cost: T.cost, splash: T.splash || 0, fly: !!T.fly,
      melee: T.range < MELEE_MAX,
    },
    tags,
    abil: (T.abil || []).map(a => ({ n: a.n, d: a.d })),
    strong: uniq(COUNTERS.filter(c => c[0] === type && UNITS[c[1]]).map(c => c[1])),
    weak: uniq(COUNTERS.filter(c => c[1] === type && UNITS[c[0]]).map(c => c[0])),
  };
}

// Einheiten nach Kategorie in der Reihenfolge von CATEGORIES (ohne leere Kategorien wie Gelände)
export function cardTypes() {
  const out = [];
  for (const [cat, name] of CATEGORIES) {
    const types = Object.keys(UNITS).filter(t => UNITS[t].cat === cat);
    if (types.length) out.push({ cat, name, types });
  }
  return out;
}
