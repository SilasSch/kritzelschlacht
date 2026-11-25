// Kampagne in Kapiteln (Spez. #52). Jedes Kapitel ist ein eigenes Modul in diesem Ordner ({ id, n, d, levels }); hier
// stehen sie in Spielreihenfolge. Rein: kein DOM. Sterne liegen im Spielstand unter der id des Levels (save.js).
// Ein Level ist eine Mission wie in data.js MISSIONS (n, budget, par, hint, place, cats) plus id, optional units (erlaubte
// Einheitentypen), plan (Lösungsplan der Balance-Prüfung) und die Spam-Regeln (docs/kampagne.md).
import { UNITS, TERRAIN } from '../data.js';
import grundausbildung from './grundausbildung.js';
import burgen from './burgen.js';
import rom from './rom.js';
import wildnis from './wildnis.js';
import akademie from './akademie.js';
import vampire from './vampire.js';
import modern from './modern.js';
import finale from './finale.js';
import schrott from './schrott.js';   // 25.11.: neue Kapitel nach dem Finale, damit niemand ein offenes Kapitel verliert
import urzeit from './urzeit.js';

/* ---------- Schwierigkeit (Silas, 22.11.: „alle Missionen pauschal schwerer, ohne Rebalance“) ---------- */
// Zentrale Stellschraube für alle Kapitel-Level (nicht Tutorial, Tageschallenge oder eigene Level):
// BUDGET_SCALE kürzt Budget und par (drei Sterne), ENEMY_SCALE vergrößert jede Gegnergruppe (rect/circle, aufgerundet).
// Einzelne Einheiten ('unit', etwa Drachen oder Panzer) bleiben einzeln. 1 und 1 = die Level wie in den Kapiteldateien.
// Die Kapiteldateien bleiben unverändert; orig hält Budget und par von dort (Prüfung des Lösungsplans unten).
export const BUDGET_SCALE = 0.7;
export const ENEMY_SCALE = 1.2;
export function harden(level, budgetScale = BUDGET_SCALE, enemyScale = ENEMY_SCALE) {
  const budget = Math.max(1, Math.round(level.budget * budgetScale));
  const par = Math.max(1, Math.min(budget, Math.round(level.par * budgetScale)));
  const place = level.place.map(p => (p[0] === 'rect' || p[0] === 'circle') ? [p[0], p[1], Math.ceil(p[2] * enemyScale - 1e-9), ...p.slice(3)] : p);
  return { ...level, budget, par, place, orig: { budget: level.budget, par: level.par } };
}
const hardenChapter = c => ({ ...c, levels: c.levels.map(l => harden(l)) });

export const CHAPTERS = [grundausbildung, burgen, rom, wildnis, akademie, vampire, modern, finale, schrott, urzeit].map(hardenChapter);

// Flache Liste aller Level: { level, chapter, ci (Index des Kapitels), li (Index im Kapitel) }
export const LEVELS = CHAPTERS.flatMap((chapter, ci) => chapter.levels.map((level, li) => ({ level, chapter, ci, li })));
const byId = new Map(LEVELS.map(e => [e.level.id, e]));

export const chapterById = id => CHAPTERS.find(c => c.id === id) || null;
export const levelInfo = id => byId.get(id) || null;
export const levelById = id => (byId.get(id) || { level: null }).level;
// Level k+1 im selben Kapitel (oder null nach dem letzten)
export function nextLevel(id) {
  const e = byId.get(id); if (!e) return null;
  return e.chapter.levels[e.li + 1] || null;
}

/* ---------- Erlaubte Einheiten ---------- */
// units: Liste erlaubter Einheitentypen; cats: erlaubte Kategorien. Sind beide gesetzt, muss eine Einheit beide erfüllen.
// Gelände hängt nur an cats ('gelaende'); ohne cats ist es erlaubt. Ohne Level (Sandkasten, Schlacht) ist alles erlaubt.
export function unitAllowed(level, type) {
  const T = UNITS[type];
  if (!T) return false;
  if (!level) return true;
  return (!level.units || level.units.includes(type)) && (!level.cats || level.cats.includes(T.cat));
}
// Gelände malen: in Leveln nie (Wunsch Silas, 18.11.: Lava, Mauern und Wasser entschieden Missionen zu billig), nur der
// Radierer geht immer. Das Gelände der Gegner (place) bleibt; im Sandkasten und in der Schlacht ist alles malbar.
export function terrainAllowed(level, key) {
  if (!TERRAIN[key] || TERRAIN[key].paint === false) return false;   // Asche entsteht nur durch Waldbrand
  return key === 'radierer' || !level;
}
// Malbare Einheiten des Levels (paint: false, etwa der Ghul, nie)
export const paintableUnits = level => Object.keys(UNITS).filter(t => UNITS[t].paint !== false && unitAllowed(level, t));
// Reiter der Malleiste: Gelände immer (in Leveln steht dort nur der Radierer), sonst mindestens eine malbare erlaubte Einheit
export function catAllowed(level, cat) {
  if (!level) return true;
  if (cat === 'gelaende') return true;
  return Object.keys(UNITS).some(t => UNITS[t].cat === cat && UNITS[t].paint !== false && unitAllowed(level, t));
}

// Spam-Regel der Balance-Prüfung: ohne Angabe muss der Spam verlieren (Vorgabe für neue Kapitel)
export const spamMustLose = level => level.spamMustLose !== false;

/* ---------- Freischalten und Fortschritt ---------- */
// chapters: nur für Tests mit eigenen Kapiteln, sonst CHAPTERS
const starsOf = (stars, id) => (stars && stars[id]) || 0;
function findLevel(id, chapters) {
  if (chapters === CHAPTERS) return byId.get(id) || null;
  for (const chapter of chapters) { const li = chapter.levels.findIndex(l => l.id === id); if (li >= 0) return { level: chapter.levels[li], chapter, li }; }
  return null;
}
// Kapitel: das erste ist immer offen, jedes weitere, sobald das letzte Level des vorigen Kapitels mit Leveln (leere
// Kapitel werden übersprungen) mindestens einen Stern hat
export function chapterUnlocked(stars, chapterId, chapters = CHAPTERS) {
  const ci = chapters.findIndex(c => c.id === chapterId);
  if (ci < 0) return false;
  for (let k = ci - 1; k >= 0; k--) {
    const lv = chapters[k].levels;
    if (lv.length) return starsOf(stars, lv[lv.length - 1].id) > 0;
  }
  return true;
}
// Level: das erste eines Kapitels, wenn das Kapitel offen ist; Level k, wenn Level k−1 mindestens einen Stern hat
export function levelUnlocked(stars, id, chapters = CHAPTERS) {
  const e = findLevel(id, chapters); if (!e) return false;
  return e.li === 0 ? chapterUnlocked(stars, e.chapter.id, chapters) : starsOf(stars, e.chapter.levels[e.li - 1].id) > 0;
}
// Sterne und geschaffte Level eines Kapitels
export function chapterProgress(stars, chapterId, chapters = CHAPTERS) {
  const c = chapters.find(k => k.id === chapterId), lv = c ? c.levels : [];
  let got = 0, done = 0;
  for (const l of lv) { const s = starsOf(stars, l.id); got += s; if (s > 0) done++; }
  return { stars: got, maxStars: lv.length * 3, done, total: lv.length };
}

/* ---------- Prüfung der Kapiteldaten (Tests, tools/balance.mjs) ---------- */
// Liefert eine Liste von Fehlermeldungen (leer = in Ordnung)
const PLACE_KINDS = { rect: 'unit', circle: 'unit', unit: 'unit', tRect: 'terrain', tCircle: 'terrain' };
export function validateCampaign(chapters = CHAPTERS) {
  const err = [], ids = new Set(), cids = new Set();
  for (const c of chapters) {
    if (!c.id || !c.n || !c.d || !Array.isArray(c.levels)) { err.push(`Kapitel ${c.id}: id, n, d und levels nötig`); continue; }
    if (cids.has(c.id)) err.push(`Kapitel ${c.id}: doppelte id`);
    cids.add(c.id);
    for (const l of c.levels) {
      const at = `${c.id}/${l.id}`;
      if (typeof l.id !== 'string' || !l.id) { err.push(`${at}: id fehlt`); continue; }
      if (ids.has(l.id)) err.push(`${at}: doppelte Level-id`);
      ids.add(l.id);
      if (!l.n || !l.hint) err.push(`${at}: n und hint nötig`);
      if (!(l.budget > 0) || !(l.par > 0) || l.par > l.budget) err.push(`${at}: 0 < par <= budget nötig`);
      if (l.cats && !l.cats.every(k => k === 'gelaende' || Object.values(UNITS).some(T => T.cat === k))) err.push(`${at}: unbekannte Kategorie in cats`);
      if (l.units) for (const t of l.units) if (!UNITS[t] || UNITS[t].paint === false) err.push(`${at}: ${t} ist keine malbare Einheit`);
      if (!paintableUnits(l).length) err.push(`${at}: keine Einheit erlaubt`);
      if (!Array.isArray(l.place) || !l.place.length) err.push(`${at}: place leer`);
      else for (const p of l.place) {
        const kind = PLACE_KINDS[p[0]];
        if (!kind || (kind === 'unit' ? !UNITS[p[1]] : !TERRAIN[p[1]])) err.push(`${at}: place ${JSON.stringify(p)} ungültig`);
      }
      for (const t of l.answer || []) if (!unitAllowed(l, t)) err.push(`${at}: answer ${t} ist nicht erlaubt`);
      if (!l.plan || !Array.isArray(l.plan.smart) || !l.plan.smart.length) { err.push(`${at}: plan.smart fehlt`); continue; }
      for (const kind of ['smart', 'spam']) {
        const plan = l.plan[kind]; if (!plan) continue;
        let cost = 0;
        for (const [t, n] of plan) {
          if (!unitAllowed(l, t) || UNITS[t].paint === false) err.push(`${at}: plan.${kind} nutzt ${t}, im Level nicht erlaubt`);
          else cost += n * UNITS[t].cost;
        }
        // Lösungsplan gegen das par der Kapiteldatei (orig): nach harden() passt er bewusst nicht mehr ins Budget
        // der Spam-Plan darf über dem Budget liegen (Belastungsprobe, M5: 55 Krieger bei Budget 80)
        if (kind === 'smart' && cost > (l.orig || l).par + 1e-6) err.push(`${at}: plan.smart kostet ${cost} > par ${l.par}`);
      }
    }
  }
  return err;
}
