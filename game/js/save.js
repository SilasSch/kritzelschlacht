// Spielstand (rein, kein DOM): Schlüssel wie im alten Spiel, { stars: { levelId: 1..3 }, muted }.
// main.js liest und schreibt localStorage[SAVE_KEY] damit.
// Kampagne (Spez. #52): Sterne hängen an der festen id des Levels (campaign/). Alte Stände zählen die 9 Missionen der
// Grundausbildung nach Index 0–8; parseSave übersetzt sie in deren ids (LEGACY_IDS). serializeSave schreibt die Sterne
// der Grundausbildung zusätzlich unter dem alten Index, damit ein älteres Spiel (auch kritzelschlacht.html) sie weiter sieht.
import { LEGACY_IDS } from './campaign/grundausbildung.js';

export const SAVE_KEY = 'kritzelschlacht-v1';

const starVal = v => { const n = Math.floor(Number(v)); return n > 0 ? Math.min(3, n) : 0; };

// Text aus localStorage (oder null) → Spielstand; Unlesbares ergibt den leeren Stand.
export function parseSave(text) {
  const save = { stars: {}, muted: false };
  try {
    const s = JSON.parse(text || 'null');
    if (s && typeof s === 'object' && !Array.isArray(s)) Object.assign(save, s);
  } catch (e) { /* kein oder kaputter Speicher */ }
  if (!save.stars || typeof save.stars !== 'object' || Array.isArray(save.stars)) save.stars = {};
  save.stars = migrateStars(save.stars);
  return save;
}

// { '0': 3, 'ga-2': 1, 'burg-1': 2 } → { 'ga-1': 3, 'ga-2': 1, 'burg-1': 2 }; je Level der beste Wert, alter Index oder id
export function migrateStars(raw) {
  const out = {};
  for (const k of Object.keys(raw)) {
    const v = starVal(raw[k]);
    if (!v) continue;
    const id = /^\d+$/.test(k) ? LEGACY_IDS[+k] : k;
    if (!id) continue;   // Index ohne Mission (gab es nie)
    out[id] = Math.max(out[id] || 0, v);
  }
  return out;
}

export function serializeSave(save) {
  const stars = { ...save.stars };
  LEGACY_IDS.forEach((id, i) => { if (stars[id]) stars[i] = stars[id]; });
  return JSON.stringify({ stars, muted: save.muted });
}
