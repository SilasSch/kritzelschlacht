// Bestenliste der Tageschallenge (18.11.). Rein: kein DOM. Jeder Eintrag trägt die gemalte Armee (online.packArmy) und wird
// nachgerechnet, bevor er zählt: Gezählt wird nur, was die Simulation selbst ergibt (Sieg, Punkte, Zeit), nie eine
// behauptete Zahl. Das geht, weil der Kampf der Tageschallenge fest ist:
//   - die Gegner stehen mit der Saat placeSeed(Datum) (placeRect wackelt mit world.rng),
//   - die eigene Armee wird vor dem Kampf auf das Raster des Pakets gesetzt (packArmy → unpackArmy),
//   - der Kampf läuft mit der Saat fightSeed(Datum) aus dem Schnappschuss (battle.resetFight).
// main.js startet den Kampf im Spiel mit genau diesem Schnappschuss; dasselbe Ergebnis kommt bei jedem Nachrechnen heraus.
// Rangfolge: Sieg, dann weniger Punkte, dann schnellerer Sieg, dann wer zuerst eingetragen hat.
import { UNITS } from './data.js';
import { createWorld, spawn, rebuildHash } from './world.js';
import { buildMission, missionResult, step } from './sim.js';
import { snapshotBattle, resetFight, STEP } from './battle.js';
import { createRng } from './rng.js';
import { applyShape } from './shapes.js';
import { unpackArmy, packArmy } from './online.js';
import { unitAllowed } from './campaign/index.js';
import { zoneX } from './paint.js';
import { dailyLevel, hashStr } from './daily.js';
import { WORLD_W, WORLD_H } from './camera.js';

export const placeSeed = date => hashStr('kritzel-daily-place|' + date);
export const fightSeed = date => hashStr('kritzel-daily-fight|' + date);
export const BOARD_KEEP = 7;     // Tage je Spieler in der Live-Bestenliste
export const NAME_MAX = 20;
const EPS = 1e-6;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const cleanName = s => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

// Gegner der Tageschallenge in eine Welt setzen (fest je Datum)
export function placeDaily(world, level) {
  world.rng = createRng(placeSeed(level.daily));
  buildMission(world, level);
}

// Armee prüfen und als Einheitenliste liefern; wirft mit verständlicher Meldung
export function dailyArmy(date, army, W = WORLD_W, H = WORLD_H) {
  if (!DATE_RE.test(date || '')) throw new Error('Kein gültiges Datum.');
  const L = dailyLevel(date);
  const us = unpackArmy(army, 'blau', W, H, null);
  if (!us.length) throw new Error('Keine Armee.');
  const probe = { W, H };
  const zx = zoneX(probe);
  let cost = 0;
  for (const u of us) {
    if (!unitAllowed(L, u.type)) throw new Error('Einheit in dieser Tageschallenge nicht erlaubt.');
    if (u.x > zx + 1) throw new Error('Einheit hinter der Mallinie.');
    cost += UNITS[u.type].cost;
  }
  if (cost > L.budget + EPS) throw new Error('Budget überschritten.');
  return { level: L, units: us, spent: Math.round(cost * 100) / 100 };
}

// Schnappschuss zum Kampfbeginn: Gegner fest, eigene Armee aus dem Paket (in dieser Reihenfolge, hinter den Gegnern)
export function dailySnapshot(date, army) {
  const { level, units, spent } = dailyArmy(date, army);
  const w = createWorld(WORLD_W, WORLD_H, 1);
  placeDaily(w, level);
  for (const u of units) { const n = spawn(w, u.type, u.x, u.y, 'blau'); if (u.shape) applyShape(n, u.shape); }
  rebuildHash(w);
  return { snap: snapshotBattle(w), level, spent };
}

// Armee der Welt auf das Raster des Pakets bringen (für main.js): liefert den Text
export const armyOf = world => packArmy(world, 'blau');

// Nachrechnen in Häppchen: pump(ms) rechnet höchstens etwa ms Millisekunden; done, result = { win, spent, time, stars }
// oder error (Text). Ohne Zeitlimit (pump()) läuft es bis zum Ende.
export function createCheck(date, army, now = () => globalThis.performance.now()) {
  const c = { done: false, result: null, error: null };
  let w = null, t = 0, spent = 0, par = 0;
  try {
    const s = dailySnapshot(date, army);
    spent = s.spent; par = s.level.par;
    w = createWorld(WORLD_W, WORLD_H, 1);
    w.teamMode = true;
    resetFight(w, s.snap, fightSeed(date));
  } catch (e) { c.done = true; c.error = e.message || 'Ungültig.'; }
  c.pump = (ms = Infinity) => {
    const end = now() + ms;
    while (!c.done) {
      for (let k = 0; k < 30 && !c.done; k++) {
        step(w, STEP); w.events.length = 0; t += STEP;
        const r = missionResult(w, t);
        if (r) {
          const win = r === 'win';
          c.result = { win, spent, time: Math.round(t * 100) / 100, stars: win ? 1 + (spent <= par * 1.25 ? 1 : 0) + (spent <= par ? 1 : 0) : 0 };
          c.done = true; w = null;
        }
      }
      if (now() >= end) break;
    }
    return c.done;
  };
  return c;
}
export function checkNow(date, army) { const c = createCheck(date, army); c.pump(); return c; }

// Sortierung: geprüfte Siege vorn (weniger Punkte, dann kürzere Zeit, dann früher eingetragen)
export function rankEntries(list) {
  return list.slice().sort((a, b) => {
    const wa = a.res && a.res.win ? 0 : 1, wb = b.res && b.res.win ? 0 : 1;
    if (wa !== wb) return wa - wb;
    if (!wa) {
      if (Math.abs(a.res.spent - b.res.spent) > EPS) return a.res.spent - b.res.spent;
      if (Math.abs(a.res.time - b.res.time) > EPS) return a.res.time - b.res.time;
    }
    return (a.at || 0) - (b.at || 0);
  });
}

/* ---------- Ergebnis-Code (für den öffentlichen Link): { v: 1, k: 'dailyres', d, a, n } über share.js ---------- */
export const resultCode = (date, army, name) => ({ v: 1, k: 'dailyres', d: date, a: army, n: cleanName(name) });
export function validResult(d) {
  if (!d || !DATE_RE.test(d.d || '') || typeof d.a !== 'string' || typeof d.n !== 'string') return false;
  try { dailyArmy(d.d, d.a); } catch (e) { return false; }
  return true;
}

/* ---------- Lokale Tagesliste: { 'YYYY-MM-DD': [{ n, a, at, me }] } ---------- */
// Ein Eintrag je Name und Tag (der bessere bleibt, nach Nachrechnen entscheidet main/ui). Hier nur Ablage und Kürzen.
export function addLocal(board, date, entry) {
  const day = (board[date] = (board[date] || []).filter(e => e.a !== entry.a && !(entry.me ? e.me : e.n === entry.n && !e.me)));
  day.push({ n: cleanName(entry.n), a: entry.a, at: entry.at || Date.now(), ...(entry.me ? { me: 1 } : {}) });
  return board;
}
export function cleanBoard(raw, keep = BOARD_KEEP) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.keys(raw).filter(k => DATE_RE.test(k)).sort().slice(-keep)) {
    const day = Array.isArray(raw[k]) ? raw[k].filter(e => e && typeof e.a === 'string' && typeof e.n === 'string').slice(0, 50) : [];
    if (day.length) out[k] = day.map(e => ({ n: cleanName(e.n), a: e.a, at: +e.at || 0, ...(e.me ? { me: 1 } : {}) }));
  }
  return out;
}

/* ---------- Live-Bestenliste (db): scores/<Spieler-id> = { days: { 'YYYY-MM-DD': { a, at } } } ---------- */
// Jeder schreibt nur sein eigenes Dokument (Regel scores/{self}); gelesen wird die ganze Sammlung. Behalten: BOARD_KEEP Tage.
export const DB_RULES = [{ path: 'scores', read: 'view', write: 'owner' }, { path: 'scores/{self}', write: 'interact' }];
export function mergeOwn(doc, date, army, at = Date.now(), keep = BOARD_KEEP) {
  const days = { ...((doc && doc.days) || {}) };
  days[date] = { a: army, at };
  const keys = Object.keys(days).filter(k => DATE_RE.test(k)).sort().slice(-keep);
  return { days: Object.fromEntries(keys.map(k => [k, days[k]])) };
}
// Alle Dokumente → Einträge eines Tages [{ uid, a, at }]
export function dayEntries(docs, date) {
  const out = [];
  for (const d of docs) {
    const e = d.data && d.data.days && d.data.days[date];
    if (e && typeof e.a === 'string') out.push({ uid: d.id, a: e.a, at: +e.at || 0 });
  }
  return out;
}
