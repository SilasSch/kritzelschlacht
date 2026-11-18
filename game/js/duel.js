// Code-Duell (18.11.): 1 gegen 1 ohne Live-Verbindung, nur mit Codes (geht auch über den öffentlichen Link). Rein: kein DOM.
//   1. A wählt Regel und Karte (rules.js) oder lost sie aus, malt links (Blau) und verschickt die Herausforderung:
//      { v: 1, k: 'duel', cfg, a }   (a = Armee von A, online.packArmy; im Code gepackt, im Spiel nicht zu sehen)
//   2. B fügt den Code ein, malt rechts (Rot) mit derselben Kategorie und demselben Budget, ohne As Armee zu sehen. Der
//      Kampf läuft sofort; B schickt die Antwort zurück: { v: 1, k: 'duelres', cfg, a, b }.
//   3. A fügt die Antwort ein und sieht denselben Kampf (gleiche Aufstellung in gleicher Reihenfolge, gleiche Saat).
// Die Codes laufen über share.js (encode/decode); validDuel prüft sie dort.
import { unpackArmy, battleList, ONLINE_CATS, ONLINE_BUDGETS } from './online.js';
import { WORLD_W, WORLD_H } from './camera.js';
import { MAP_IDS } from './rules.js';

export const challengeData = (cfg, a) => ({ v: 1, k: 'duel', cfg: { r: 1, cat: cfg.cat, map: cfg.map || 'feld', seed: cfg.seed, budget: cfg.budget }, a });
export const answerData = (d, b) => ({ v: 1, k: 'duelres', cfg: d.cfg, a: d.a, b });

// Beide Armeen als Liste für main.js onlineFight
export function duelList(d, W = WORLD_W, H = WORLD_H) {
  const a = unpackArmy(d.a, 'blau', W, H, d.cfg);
  const b = d.b != null ? unpackArmy(d.b, 'rot', W, H, d.cfg) : [];
  return battleList(a, b);
}

// Für share.js validate: wirft bei kaputten oder manipulierten Codes
export function validDuel(d) {
  const c = d && d.cfg;
  if (!c || !ONLINE_CATS.includes(c.cat) || !ONLINE_BUDGETS.includes(c.budget) || !Number.isInteger(c.seed) || typeof d.a !== 'string') return false;
  if (c.map !== undefined && !MAP_IDS.includes(c.map)) return false;   // ältere Codes ohne Karte: offenes Feld
  if (d.k === 'duelres' && typeof d.b !== 'string') return false;
  try {
    const l = duelList(d);
    if (!l.some(u => u.team === 'blau')) return false;
    if (d.k === 'duelres' && !l.some(u => u.team === 'rot')) return false;
  } catch (e) { return false; }
  return true;
}
