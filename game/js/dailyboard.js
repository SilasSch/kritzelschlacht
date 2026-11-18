// Bestenliste der Tageschallenge (18.11.). Rein: kein DOM. Jeder Eintrag trägt die gemalte Armee (online.packArmy) und wird
// nachgerechnet, bevor er zählt: Gezählt wird nur, was die Simulation selbst ergibt (Sieg, Punkte, Zeit), nie eine
// behauptete Zahl. Das geht, weil der Kampf der Tageschallenge fest ist:
//   - die Gegner stehen mit der Saat placeSeed(Datum) (placeRect wackelt mit world.rng),
//   - die eigene Armee wird vor dem Kampf auf das Raster des Pakets gesetzt (packArmy → unpackArmy),
//   - der Kampf läuft mit der Saat fightSeed(Datum) aus dem Schnappschuss (battle.resetFight).
// main.js startet den Kampf im Spiel mit genau diesem Schnappschuss; dasselbe Ergebnis kommt bei jedem Nachrechnen heraus.
// Rangfolge: Sieg, dann weniger Punkte, dann schnellerer Sieg, dann wer zuerst eingetragen hat.
//
// Spielversion (SIM_VERSION): Ein Balance-Update ändert, wie derselbe Kampf ausgeht. Jeder Eintrag trägt deshalb die Version,
// unter der er gespielt wurde, und sein Ergebnis (r). Einträge der aktuellen Version werden nachgerechnet; Einträge einer
// älteren Version zählen so, wie sie eingetragen wurden, aber nur für Tage bis zum letzten Tag dieser Version
// (VERSIONS[v].until). Ein Update mitten am Tag: bei der alten Version until = Tag des Updates eintragen. Dann bleiben die
// Einträge von vorher stehen (markiert „alte Version“), neue werden nach den neuen Regeln nachgerechnet; ab dem nächsten
// Tag gilt nur noch die neue Version. tests/dailyboard.test.js schlägt fehl, solange die aktuelle Version nicht in VERSIONS steht.
import { UNITS } from './data.js';
import { createWorld, spawn, rebuildHash } from './world.js';
import { buildMission, missionResult, step } from './sim.js';
import { snapshotBattle, resetFight, STEP } from './battle.js';
import { createRng } from './rng.js';
import { applyShape } from './shapes.js';
import { unpackArmy, packArmy } from './online.js';
import { unitAllowed } from './campaign/index.js';
import { zoneX } from './paint.js';
import { dailyLevel, hashStr, DAILY_POOL, DAILY_BOSSES } from './daily.js';
import { SHAPES } from './shapes.js';
import { WORLD_W, WORLD_H } from './camera.js';

// Werte, die den Kampf der Tageschallenge bestimmen: Einheiten der Auswahl und Bosse, Formen. SIM_REV von Hand erhöhen,
// wenn sich die Simulation selbst ändert (combat.js, physics.js …), ohne dass sich diese Werte ändern.
export const SIM_REV = 6;   // 2: Balance-Runde 18.11. (König, Synergien, Keil, Lama, Waldbrand); 3: Bienen 1 Punkt (Kugeln, Blitze); 4: Adler packt zu, Flammenwerfer, Pikenier; 5: Wegfindung überarbeitet; 6: Römer im Block (Schildstoß, Scutum)
export function simVersion() {
  const types = [...new Set([...DAILY_POOL, ...DAILY_BOSSES])].sort();
  return 'v' + hashStr(JSON.stringify([SIM_REV, types.map(t => [t, UNITS[t] || null]), SHAPES])).toString(36);
}
export const SIM_VERSION = simVersion();
// Bekannte Versionen: until = letzter Tag, an dem sie galt (null: die aktuelle)
export const VERSIONS = {
  vh9hl1p: { until: '2026-11-18' },   // Stand bei Start der Bestenliste (18.11.)
  v1j0sw5m: { until: '2026-11-18' },   // Luftwaffe: Hubschrauber neu, Jet, Kampfdrohne, Bomber (18.11.)
  v3v8ayv: { until: '2026-11-18' },   // Balance-Runde: Magier 8 und langsamer, Ritter, Sani, Vampir, Gorilla, Meteor, König, Lama, Keil, Synergien, Waldbrand (18.11.)
  v1w2hbq9: { until: '2026-11-18' },   // Bienen 1 Punkt, dafür 24 LP, Stich 4, Gift 5/s, Kugeln ×2,5, Blitze ×1,6 (18.11.)
  vsjyhqn: { until: '2026-11-19' },   // Adler packt zu (kleine Gegner hochheben und fallen lassen), neu: Flammenwerfer, Pikenier (18.11.); bis 19.11., weil das Update kurz vor Mitternacht kam (offene Tabs spielen den 19. noch mit dieser Version)
  v1oqxao2: { until: '2026-11-19' },   // Wegfindung überarbeitet: Zielwahl mit Weg, Umweg um Dornen und Wasser, Weg zu Luftzielen, Abstand zu Kanten (18.11.)
  vh9f0ah: { until: null },   // Römer im Block: Schildstoß gegen Nahkämpfer, Scutum gegen Schwerthiebe von vorn (18.11.)
};
const VER_RE = /^v[0-9a-z]{1,12}$/;
// Eintrag einer älteren Version für diesen Tag annehmen? Liefert das eingetragene Ergebnis (mit old: true) oder null
export function acceptOld(date, v, r) {
  const k = VERSIONS[v];
  if (!k || !k.until || date > k.until || !r || typeof r !== 'object') return null;
  const win = r.win === true, spent = +r.spent, time = +r.time, stars = +r.stars;
  if (!(spent > 0 && spent <= dailyLevel(date).budget * 2 && time > 0 && time <= 181 && stars >= 0 && stars <= 3)) return null;
  return { win, spent, time, stars: win ? Math.max(1, Math.round(stars)) : 0, old: true };
}

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
// stamp = { v, r }: Version und eingetragenes Ergebnis. Fehlt v oder ist es die aktuelle Version, wird nachgerechnet.
export function createCheck(date, army, now = () => globalThis.performance.now(), stamp = null) {
  const c = { done: false, result: null, error: null };
  if (stamp && stamp.v && stamp.v !== SIM_VERSION) {
    c.done = true; c.pump = () => true;
    c.result = acceptOld(date, stamp.v, stamp.r);
    if (!c.result) c.error = 'Spielversion passt nicht';
    return c;
  }
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
export function checkNow(date, army, stamp = null) { const c = createCheck(date, army, undefined, stamp); c.pump(); return c; }
// Version und Ergebnis zum Mitschicken (Ergebnis-Code, Live-Eintrag, lokale Liste)
export const stampOf = res => ({ v: SIM_VERSION, r: { win: !!res.win, spent: res.spent, time: res.time, stars: res.stars } });
const cleanStamp = e => (e && VER_RE.test(e.v || '') && e.r && typeof e.r === 'object' ? { v: e.v, r: { win: e.r.win === true, spent: +e.r.spent || 0, time: +e.r.time || 0, stars: +e.r.stars || 0 } } : {});

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
// sv/r: Spielversion und Ergebnis (ältere Codes ohne sv gelten als aktuelle Version)
export const resultCode = (date, army, name, res, sv = SIM_VERSION) => ({ v: 1, k: 'dailyres', d: date, a: army, n: cleanName(name), ...(res ? { sv, r: stampOf(res).r } : {}) });
export function validResult(d) {
  if (!d || !DATE_RE.test(d.d || '') || typeof d.a !== 'string' || typeof d.n !== 'string') return false;
  if (d.sv !== undefined && d.sv !== SIM_VERSION) return !!acceptOld(d.d, d.sv, d.r);   // ältere Version: nicht nachrechenbar
  try { dailyArmy(d.d, d.a); } catch (e) { return false; }
  return true;
}

/* ---------- Lokale Tagesliste: { 'YYYY-MM-DD': [{ n, a, at, me }] } ---------- */
// Ein Eintrag je Name und Tag (der bessere bleibt, nach Nachrechnen entscheidet main/ui). Hier nur Ablage und Kürzen.
export function addLocal(board, date, entry) {
  const day = (board[date] = (board[date] || []).filter(e => e.a !== entry.a && !(entry.me ? e.me : e.n === entry.n && !e.me)));
  day.push({ n: cleanName(entry.n), a: entry.a, at: entry.at || Date.now(), ...(entry.me ? { me: 1 } : {}), ...cleanStamp(entry) });
  return board;
}
export function cleanBoard(raw, keep = BOARD_KEEP) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const k of Object.keys(raw).filter(k => DATE_RE.test(k)).sort().slice(-keep)) {
    const day = Array.isArray(raw[k]) ? raw[k].filter(e => e && typeof e.a === 'string' && typeof e.n === 'string').slice(0, 50) : [];
    if (day.length) out[k] = day.map(e => ({ n: cleanName(e.n), a: e.a, at: +e.at || 0, ...(e.me ? { me: 1 } : {}), ...cleanStamp(e) }));
  }
  return out;
}

/* ---------- Live-Bestenliste (db): scores/<Spieler-id> = { days: { 'YYYY-MM-DD': { a, at, v, r } } } ---------- */
// Jeder schreibt nur sein eigenes Dokument (Regel scores/{self}); gelesen wird die ganze Sammlung. Behalten: BOARD_KEEP Tage.
export const DB_RULES = [{ path: 'scores', read: 'view', write: 'owner' }, { path: 'scores/{self}', write: 'interact' }];
export function mergeOwn(doc, date, army, at = Date.now(), keep = BOARD_KEEP, res = null) {
  const days = { ...((doc && doc.days) || {}) };
  days[date] = { a: army, at, ...(res ? stampOf(res) : {}) };
  const keys = Object.keys(days).filter(k => DATE_RE.test(k)).sort().slice(-keep);
  return { days: Object.fromEntries(keys.map(k => [k, days[k]])) };
}
// Alle Dokumente → Einträge eines Tages [{ uid, a, at }]
export function dayEntries(docs, date) {
  const out = [];
  for (const d of docs) {
    const e = d.data && d.data.days && d.data.days[date];
    if (e && typeof e.a === 'string') out.push({ uid: d.id, a: e.a, at: +e.at || 0, ...cleanStamp(e) });
  }
  return out;
}
