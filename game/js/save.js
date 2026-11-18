// Spielstand (rein, kein DOM): Schlüssel wie im alten Spiel, { stars: { levelId: 1..3 }, muted }.
// main.js liest und schreibt localStorage[SAVE_KEY] damit.
// Kampagne (Spez. #52): Sterne hängen an der festen id des Levels (campaign/). Alte Stände zählen die 9 Missionen der
// Grundausbildung nach Index 0–8; parseSave übersetzt sie in deren ids (LEGACY_IDS). serializeSave schreibt die Sterne
// der Grundausbildung zusätzlich unter dem alten Index, damit ein älteres Spiel (auch kritzelschlacht.html) sie weiter sieht.
import { LEGACY_IDS } from './campaign/grundausbildung.js';
import { isLevel, CUSTOM_MAX } from './editor.js';

export const SAVE_KEY = 'kritzelschlacht-v1';

const starVal = v => { const n = Math.floor(Number(v)); return n > 0 ? Math.min(3, n) : 0; };

// Text aus localStorage (oder null) → Spielstand; Unlesbares ergibt den leeren Stand.
export function parseSave(text) {
  const save = { stars: {}, muted: false, medals: {}, tutorial: false };
  try {
    const s = JSON.parse(text || 'null');
    if (s && typeof s === 'object' && !Array.isArray(s)) Object.assign(save, s);
  } catch (e) { /* kein oder kaputter Speicher */ }
  if (!save.stars || typeof save.stars !== 'object' || Array.isArray(save.stars)) save.stars = {};
  save.stars = migrateStars(save.stars);
  // Audit 18.11.: Medaillen je Level (Bitmaske, medals.js) und ob das Tutorial gespielt oder übersprungen wurde
  const md = save.medals, medals = {};
  if (md && typeof md === 'object' && !Array.isArray(md)) for (const k of Object.keys(md)) { const v = Math.floor(Number(md[k])); if (v > 0) medals[k] = v & 7; }
  save.medals = medals;
  save.tutorial = !!save.tutorial;
  save.custom = parseCustom(save.custom);
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
  const out = { stars, muted: save.muted, medals: save.medals || {}, tutorial: !!save.tutorial };
  if (save.custom && save.custom.length) out.custom = parseCustom(save.custom);
  return JSON.stringify(out);
}

/* ---------- Eigene Level (Audit 18.11.) ---------- */
// custom: Liste eigener Level (editor.js), neueste zuerst. Ungültige und doppelte (gleiche id) fallen weg, höchstens CUSTOM_MAX.
export function parseCustom(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [], ids = new Set();
  for (const l of raw) {
    if (out.length >= CUSTOM_MAX) break;
    if (!isLevel(l) || ids.has(l.id)) continue;
    ids.add(l.id); out.push(l);
  }
  return out;
}
