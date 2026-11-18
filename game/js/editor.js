// Level-Editor (Audit 18.11.): aus der Welt ein eigenes Level bauen. Rein: kein DOM, kein PIXI.
// Im Editor malt der Spieler die Gegner (Team 'rot') rechts der Mallinie (paint.zoneX) und Gelände überall. levelFromWorld
// macht daraus ein Level im Format der Kampagne (docs/kampagne.md), das buildMission (sim.js) auf jeder Weltgröße aufbaut:
// x als Anteil des Missionsrahmens (world.frameX), y als Anteil von H.
import { UNITS, TERRAIN, CATEGORIES, CELL } from './data.js';
import { MISSION_ASPECT } from './world.js';
import { STONE_WALL } from './spells.js';
import { tr } from './i18n.js';

export const CUSTOM_MAX = 30;           // höchstens so viele eigene Level im Spielstand
export const NAME_MAX = 40, HINT_MAX = 140;
// Kategorien, aus denen ein eigenes Level Einheiten erlauben kann (nie 'gelaende': in Leveln wird kein Gelände gemalt)
export const UNIT_CATS = CATEGORIES.map(c => c[0]).filter(k => k !== 'gelaende');

const TERR_BY_ID = Object.fromEntries(Object.entries(TERRAIN).filter(([k]) => k !== 'radierer').map(([k, T]) => [T.id, k]));
const r4 = v => Math.round(v * 1e4) / 1e4;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Umkehrung von world.frameX: px → Anteil des Missionsrahmens (auf breiten Welten auch < 0 oder > 1)
export function frameFrac(world, px) {
  const L = Math.min(world.W, MISSION_ASPECT * world.H);
  return (px - (world.W - L) / 2) / L;
}

// Budget-Vorschlag: 1,5 × Punktwert der Gegner, rund und mindestens 10
export const suggestBudget = enemyPts => Math.max(10, Math.round(1.5 * (enemyPts || 0)));
export const parFor = budget => Math.max(1, Math.round(budget / 1.3));

// Kurzer, stabiler Hash (FNV-1a, 32 bit) als id
export function hashText(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(36);
}

// Gelände als Rechtecke: Läufe gleicher Zellen je Zeile, darunter liegende gleiche Läufe zusammengefasst. Koordinaten sind
// Zellmitten (tRect in sim.js nimmt die Zellen von floor(x0) bis floor(x1) einschließlich): auf gleich großer Welt exakt.
export function terrainRects(world) {
  const { GW, GH, terr, towner, H } = world, open = new Map(), out = [];
  const close = r => out.push(r);
  for (let gy = 0; gy < GH; gy++) {
    const seen = new Set();
    let gx = 0;
    while (gx < GW) {
      const i = gy * GW + gx, id = terr[i];
      if (!id || !TERR_BY_ID[id] || towner[i] === STONE_WALL.OWNER) { gx++; continue; }
      let e = gx;
      while (e + 1 < GW && terr[gy * GW + e + 1] === id && towner[gy * GW + e + 1] !== STONE_WALL.OWNER) e++;
      const key = `${id}:${gx}:${e}`, prev = open.get(key);
      if (prev && prev.gy1 === gy - 1) prev.gy1 = gy;
      else { if (prev) close(prev); open.set(key, { id, gx0: gx, gx1: e, gy0: gy, gy1: gy }); }
      seen.add(key);
      gx = e + 1;
    }
    for (const [k, r] of open) if (!seen.has(k)) { close(r); open.delete(k); }
  }
  for (const r of open.values()) close(r);
  const place = [];
  for (const r of out) {
    let f0 = frameFrac(world, r.gx0 * CELL + CELL / 2), f1 = frameFrac(world, r.gx1 * CELL + CELL / 2);
    // außerhalb des Rahmens (breite Welt): abschneiden, ganz außerhalb fällt weg
    if (f1 < 0 || f0 > 1) continue;
    f0 = clamp(f0, 0, 1); f1 = clamp(f1, 0, 1);
    place.push(['tRect', TERR_BY_ID[r.id], r4(f0), r4((r.gy0 * CELL + CELL / 2) / H), r4(f1), r4(clamp((r.gy1 * CELL + CELL / 2) / H, 0, 1))]);
  }
  return place;
}

// Gegner (Team 'rot', malbar) als ['unit', typ, fx, fy]; fx im Rahmen gehalten, damit sie auch auf schmaleren Welten im Bild stehen
export function enemyPlace(world) {
  const out = [];
  for (const u of world.units) {
    if (!u.alive || u.team !== 'rot') continue;
    const type = u.frogFrom || u.type;
    if (!UNITS[type] || UNITS[type].paint === false) continue;
    out.push(['unit', type, r4(clamp(frameFrac(world, u.x), .005, .995)), r4(clamp(u.y / world.H, .01, .99))]);
  }
  return out;
}

const cleanText = (s, max) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);

// meta = { n, hint, budget (leer: Vorschlag), cats (Liste der erlaubten Einheiten-Kategorien; leer oder alle: keine Einschränkung) }
// Liefert { id, n, hint, budget, par, cats?, place }. Ohne Gegner ist place ohne 'unit' (canPublish prüft das).
export function levelFromWorld(world, meta = {}) {
  const units = enemyPlace(world), terr = terrainRects(world);
  let pts = 0;
  for (const p of units) pts += UNITS[p[1]].cost;
  const b = Math.round(Number(meta.budget));
  const budget = b > 0 ? Math.min(99999, b) : suggestBudget(pts);
  const cats = Array.isArray(meta.cats) ? UNIT_CATS.filter(k => meta.cats.includes(k)) : UNIT_CATS;
  const level = {
    id: '', n: cleanText(meta.n, NAME_MAX) || 'Eigenes Level', hint: cleanText(meta.hint, HINT_MAX) || 'Besiege die rote Armee.',
    budget, par: parFor(budget),
  };
  if (cats.length && cats.length < UNIT_CATS.length) level.cats = cats;
  level.place = [...terr, ...units];
  level.id = 'custom-' + hashText(JSON.stringify([level.n, level.hint, level.budget, level.cats || null, level.place]));
  return level;
}

// Kann das Level getestet, geteilt oder gespeichert werden? Liefert null oder eine Meldung
export function levelProblem(level) {
  if (!level.place.some(p => p[0] === 'unit')) return tr('Male zuerst Gegner rechts der gestrichelten Linie.');
  return null;
}

// Form eines eigenen Levels (Spielstand, Code): true, wenn buildMission und die Mission damit umgehen können
export function isLevel(l) {
  if (!l || typeof l !== 'object' || Array.isArray(l)) return false;
  if (typeof l.id !== 'string' || !l.id || typeof l.n !== 'string' || (l.hint != null && typeof l.hint !== 'string')) return false;
  if (!(l.budget > 0) || !(l.par > 0) || !Array.isArray(l.place) || !l.place.length) return false;
  if (l.cats != null && (!Array.isArray(l.cats) || !l.cats.every(k => UNIT_CATS.includes(k) || k === 'gelaende'))) return false;
  if (l.units != null && (!Array.isArray(l.units) || !l.units.every(t => UNITS[t] && UNITS[t].paint !== false))) return false;
  const num = v => typeof v === 'number' && Number.isFinite(v);
  for (const p of l.place) {
    if (!Array.isArray(p)) return false;
    if (p[0] === 'unit') { if (!UNITS[p[1]] || !num(p[2]) || !num(p[3])) return false; }
    else if (p[0] === 'tRect') { if (!TERRAIN[p[1]] || p[1] === 'radierer' || ![2, 3, 4, 5].every(k => num(p[k]))) return false; }
    else if (p[0] === 'rect' || p[0] === 'circle') { if (!UNITS[p[1]] || !p.slice(2).every(num)) return false; }
    else if (p[0] === 'tCircle') { if (!TERRAIN[p[1]] || p[1] === 'radierer' || !p.slice(2).every(num)) return false; }
    else return false;
  }
  return true;
}

// Punktwert der Gegner eines Levels (nur 'unit'-Einträge; rect und circle zählen n-mal)
export function levelEnemyPoints(l) {
  let s = 0;
  for (const p of l.place) {
    if (p[0] === 'unit') s += UNITS[p[1]].cost;
    else if (p[0] === 'rect' || p[0] === 'circle') s += UNITS[p[1]].cost * p[2];
  }
  return s;
}

// Liste eigener Level: eines ein- oder ersetzen (replaceId: das bearbeitete), neueste zuerst. Liefert { list, error }
export function upsertCustom(list, level, replaceId = null) {
  const out = list.filter(l => l.id !== level.id && l.id !== replaceId);
  if (out.length >= CUSTOM_MAX) return { list, error: tr('Höchstens {n} eigene Level. Lösche zuerst eines.', { n: CUSTOM_MAX }) };
  return { list: [level, ...out], error: null };
}
