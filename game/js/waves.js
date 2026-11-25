// Wellenmodus (25.11.): Welle um Welle kommen Gegner von rechts. Vor jeder Welle malt der Spieler nach, wer überlebt,
// bleibt stehen. Jede geschaffte Welle bringt Punkte; die Punkte sind ein Gesamtkonto (Verluste kommen nicht zurück).
// Vorbei ist es, wenn Blau niemand mehr hat. Rein bis auf das Aufstellen (placeQuick); Zufall aus der Saat des Laufs.
import { quickPlan, placeQuick } from './quick.js';
import { MAPS, applyMap } from './rules.js';
import { UNITS } from './data.js';

export const WAVES = { START: 45, GAIN: 26, GAIN_K: 4, BASE: 26, GROW: 15, TIME: 150 };

// Kleiner, fester Zufall (mulberry32)
export function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Punkte der Gegner in Welle k (ab 1): wächst etwas schneller als linear
export const wavePoints = k => Math.round(WAVES.BASE + WAVES.GROW * (k - 1) * (1 + (k - 1) * .08));
// Punkte, die der Spieler nach Welle k dazubekommt
export const waveGain = k => WAVES.GAIN + WAVES.GAIN_K * k;

// Das „Level“ eines Laufs (läuft als Mission ohne Kapitel, kind 'waves')
export function wavesLevel(seed) {
  const rand = seeded(seed ^ 0x5eed);
  const maps = MAPS.filter(m => m.id !== 'furt');
  return {
    id: 'waves', n: 'Wellenmodus', hint: 'Halte so viele Wellen wie möglich. Wer überlebt, bleibt stehen. Nach jeder Welle gibt es neue Punkte.',
    budget: WAVES.START, par: WAVES.START, place: [], waves: { seed, map: maps[rand() * maps.length | 0].id },
  };
}

// Gelände des Laufs (einmal zu Beginn)
export function wavesTerrain(world, def) { applyMap(world, def.waves.map); }

// Welle k aufstellen (Team Rot, rechte Seite). Je Welle fest aus Saat und k. Gibt die Gegnerpunkte zurück.
export function spawnWave(world, def, k) {
  const rand = seeded(def.waves.seed + k * 7919);
  // ab Welle 5 auch Bosse; vorher nur Einheiten bis 12 Punkte
  const plan = quickPlan(wavePoints(k), rand, 'rot', t => k >= 5 || UNITS[t].cost <= 12);
  placeQuick(world, plan, 'rot');
  return wavePoints(k);
}

// Stand einer Welle: 'clear' (Rot besiegt oder Zeit um mit Blau am Leben), 'lose' (Blau besiegt) oder null
export function waveResult(world, t) {
  let b = 0, r = 0;
  for (const u of world.units) { if (!u.alive) continue; if (u.team === 'blau') b++; else if (u.team === 'rot') r++; }
  if (b === 0) return 'lose';
  if (r === 0 || t > WAVES.TIME) return 'clear';
  return null;
}

// Bestwert: { best (höchste geschaffte Welle), runs }
export function cleanWaves(raw) {
  const best = Math.max(0, Math.floor(Number(raw && raw.best) || 0)), runs = Math.max(0, Math.floor(Number(raw && raw.runs) || 0));
  return { best: Math.min(best, 999), runs: Math.min(runs, 1e6) };
}
