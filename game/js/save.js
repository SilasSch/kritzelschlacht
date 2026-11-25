// Spielstand (rein, kein DOM): Schlüssel wie im alten Spiel, { stars: { levelId: 1..3 }, muted, volume (0..1, optional), medals, tutorial, custom, daily }.
// main.js liest und schreibt localStorage[SAVE_KEY] damit.
// Kampagne (Spez. #52): Sterne hängen an der festen id des Levels (campaign/). Alte Stände zählen die 9 Missionen der
// Grundausbildung nach Index 0–8; parseSave übersetzt sie in deren ids (LEGACY_IDS). serializeSave schreibt die Sterne
// der Grundausbildung zusätzlich unter dem alten Index, damit ein älteres Spiel (auch kritzelschlacht.html) sie weiter sieht.
import { LEGACY_IDS } from './campaign/grundausbildung.js';
import { isLevel, CUSTOM_MAX } from './editor.js';
import { cleanTemplates } from './templates.js';   // Armee-Vorlagen (25.11.)
import { cleanWaves } from './waves.js';   // Wellenmodus (25.11.)
import { cleanWeekly } from './weekly.js';   // Wochenchallenge (25.11.)
import { cleanAch } from './achievements.js';   // Erfolge (25.11.)

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
  save.daily = cleanDaily(save.daily);
  save.armies = cleanTemplates(save.armies);
  save.waves = cleanWaves(save.waves);
  save.weekly = cleanWeekly(save.weekly);
  save.ach = cleanAch(save.ach);
  return save;
}

/* ---------- Tageschallenge (Audit 18.11.) ---------- */
// daily: { 'YYYY-MM-DD': { spent, stars } }, der Bestwert je Tag (game/js/daily.js recordDaily). Behalten werden nur die
// letzten DAILY_KEEP Tage (nach Datum); Unlesbares fällt weg.
export const DAILY_KEEP = 30;
export function cleanDaily(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const keys = Object.keys(raw).filter(k => /^\d{4}-\d{2}-\d{2}$/.test(k)).sort();
  for (const k of keys) {
    const v = raw[k], spent = v && Number(v.spent);
    if (!v || typeof v !== 'object' || !(spent >= 0) || !Number.isFinite(spent)) continue;
    out[k] = { spent, stars: starVal(v.stars) };
  }
  for (const k of Object.keys(out).slice(0, -DAILY_KEEP)) delete out[k];
  return out;
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
  if (typeof save.volume === 'number') out.volume = Math.max(0, Math.min(1, save.volume));
  if (save.custom && save.custom.length) out.custom = parseCustom(save.custom);
  // daily nur, wenn es Einträge gibt
  const daily = cleanDaily(save.daily);
  if (Object.keys(daily).length) out.daily = daily;
  const armies = cleanTemplates(save.armies);
  if (armies.length) out.armies = armies;
  const waves = cleanWaves(save.waves);
  if (waves.runs) out.waves = waves;
  const weekly = cleanWeekly(save.weekly);
  if (Object.keys(weekly).length) out.weekly = weekly;
  const ach = cleanAch(save.ach);
  if (Object.keys(ach.n).length || ach.types.length || ach.forms.length || Object.keys(ach.got).length) out.ach = ach;
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
