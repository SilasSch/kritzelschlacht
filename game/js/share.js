// Teilen per Code (Audit 18.11.): Schlachten und eigene Level als Text, der sich kopieren und woanders einfügen lässt.
// Rein bis auf CompressionStream (Browser und Node 18+; ohne ihn unkomprimiert). Kein Server: der Code enthält alles.
//
// Code = 'KS1.' + base64url(deflate-raw(JSON)) oder 'KS0.' + base64url(JSON) ohne Kompression.
// Inhalt: { v: 1, k: 'battle', units, terr } (Aufstellung beider Seiten) oder { v: 1, k: 'level', level } (eigenes Level).
// Einheiten und Gelände stehen in Anteilen der Welt (x / W, y / H), damit der Code auf jeder Bildschirmgröße passt.
import { UNITS, TERRAIN, CELL } from './data.js';
import { spawn, rebuildHash, touchTerrain, setCell } from './world.js';
import { STONE_WALL } from './spells.js';
import { SHAPES, applyShape } from './shapes.js';
import { UNIT_CAP } from './paint.js';
import { isLevel } from './editor.js';
import { validDuel } from './duel.js';   // Code-Duell (18.11.)
import { validResult } from './dailyboard.js';   // Ergebnis der Tageschallenge (Bestenliste 18.11.)
import { tr } from './i18n.js';

export const PREFIX = 'KS';
const Q = 10000;   // Koordinaten als ganze Zahlen 0..Q
const MAX_BYTES = 256 * 1024;   // Obergrenze für entpackte Codes (Schutz vor Zip-Bomben)
const MAX_TERR = 8000;
const has = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);
const numIn = (v, a, b) => typeof v === 'number' && Number.isFinite(v) && v >= a && v <= b;
const q = v => Math.round(Math.max(0, Math.min(1, v)) * Q);
const TERR_BY_ID = Object.fromEntries(Object.entries(TERRAIN).filter(([k]) => k !== 'radierer').map(([k, T]) => [T.id, k]));
const isSide = t => t === 'blau' || t === 'rot';

/* ---------- Text <-> Daten ---------- */
const b64url = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = str => {
  const s = atob(str.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((str.length + 3) % 4));
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
};
async function pipe(bytes, Stream, maxBytes = MAX_BYTES) {
  const reader = new Blob([bytes]).stream().pipeThrough(new Stream('deflate-raw')).getReader();
  const chunks = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); throw new Error('Code zu groß'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.byteLength; }
  return out;
}
const canZip = () => typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

export async function encode(data) {
  const raw = new TextEncoder().encode(JSON.stringify(data));
  if (canZip()) return `${PREFIX}1.${b64url(await pipe(raw, CompressionStream, Infinity))}`;
  return `${PREFIX}0.${b64url(raw)}`;
}

// Liefert die Daten oder wirft einen Error mit verständlicher Meldung
export async function decode(text) {
  const m = /KS([01])\.([A-Za-z0-9_-]+)/.exec(String(text || '').replace(/\s+/g, ''));
  if (!m) throw new Error(tr('Das ist kein Kritzelschlacht-Code.'));
  if (m[2].length > Math.ceil(MAX_BYTES * 4 / 3) + 4) throw new Error(tr('Der Code ist unvollständig oder beschädigt.'));
  let bytes;
  try {
    bytes = unb64url(m[2]);
    if (bytes.length > MAX_BYTES) throw new Error('Code zu groß');
    if (m[1] === '1') {
      if (!canZip()) throw new Error(tr('Dieser Browser kann den Code nicht entpacken.'));
      bytes = await pipe(bytes, DecompressionStream, MAX_BYTES);
    }
  } catch (e) { throw new Error(tr('Der Code ist unvollständig oder beschädigt.')); }
  let data;
  try { data = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { throw new Error(tr('Der Code ist unvollständig oder beschädigt.')); }
  validate(data);
  return data;
}

/* ---------- Prüfung ---------- */
function validate(d) {
  const bad = msg => { throw new Error(tr(msg || 'Der Code passt nicht zu dieser Version des Spiels.')); };
  if (!d || typeof d !== 'object' || Array.isArray(d) || d.v !== 1) bad();
  if (d.k === 'battle') {
    if (!Array.isArray(d.units) || !Array.isArray(d.terr)) bad();
    if (d.units.length > UNIT_CAP || d.terr.length > MAX_TERR) bad();
    for (const u of d.units) {
      if (!Array.isArray(u) || (u.length !== 4 && u.length !== 5)) bad();
      if (!has(UNITS, u[0]) || UNITS[u[0]].paint === false || !isSide(u[1])) bad();
      if (!numIn(u[2], 0, Q) || !numIn(u[3], 0, Q)) bad();
      if (u.length === 5 && !has(SHAPES, u[4])) bad();
    }
    for (const t of d.terr) {
      if (!Array.isArray(t) || t.length !== 5 || !has(TERRAIN, t[0]) || t[0] === 'radierer') bad();
      if (!numIn(t[1], 0, Q) || !numIn(t[2], 0, Q) || !numIn(t[3], 0, Q) || !numIn(t[4], 0, Q)) bad();
    }
    if (!d.units.some(u => u[1] === 'blau') && !d.units.some(u => u[1] === 'rot') && !d.terr.length) bad('Der Code enthält keine Aufstellung.');
  } else if (d.k === 'level') {
    if (!isLevel(d.level)) bad();
  } else if (d.k === 'duel' || d.k === 'duelres') {
    if (!validDuel(d)) bad();
  } else if (d.k === 'dailyres') {
    if (!validResult(d)) bad('Das Ergebnis passt nicht zur Tageschallenge dieses Tages.');
  } else bad();
}

/* ---------- Gelände als Rechtecke ---------- */
// Zusammenhängende Läufe gleicher Zellen je Zeile, als [schlüssel, x0, y0, x1, y1] in Anteilen (Q). keep(i): Zelle aufnehmen?
export function terrainRuns(world, keep = () => true) {
  const { GW, GH, terr } = world, out = [];
  for (let gy = 0; gy < GH; gy++) {
    let gx = 0;
    while (gx < GW) {
      const i = gy * GW + gx, id = terr[i];
      if (!id || !TERR_BY_ID[id] || !keep(i)) { gx++; continue; }
      let e = gx;
      while (e + 1 < GW && terr[gy * GW + e + 1] === id && keep(gy * GW + e + 1)) e++;
      out.push([TERR_BY_ID[id], q(gx / GW), q(gy / GH), q((e + 1) / GW), q((gy + 1) / GH)]);
      gx = e + 1;
    }
  }
  return out;
}
// Läufe zurück ins Gitter (Zellen, deren Mitte im Rechteck liegt); owner wie setCell
export function applyRuns(world, runs, owner = 0) {
  const { GW, GH } = world;
  for (const [k, x0, y0, x1, y1] of runs) {
    if (!has(TERRAIN, k) || k === 'radierer') continue;
    const id = TERRAIN[k].id;
    const gx0 = Math.max(0, Math.round(x0 / Q * GW)), gx1 = Math.min(GW, Math.max(Math.round(x1 / Q * GW), gx0 + 1));
    const gy0 = Math.max(0, Math.round(y0 / Q * GH)), gy1 = Math.min(GH, Math.max(Math.round(y1 / Q * GH), gy0 + 1));
    for (let gy = gy0; gy < gy1; gy++)
      for (let gx = gx0; gx < gx1; gx++) setCell(world, gy * GW + gx, id, owner);
  }
  touchTerrain(world);
}

/* ---------- Schlacht ---------- */
// Aufstellung beider Seiten (ohne Ghule und Zauberwände) als teilbare Daten
export function battleData(world) {
  const units = [];
  for (const u of world.units) {
    if (!u.alive || !isSide(u.team) || UNITS[u.type].paint === false) continue;
    const e = [u.type, u.team, q(u.x / world.W), q(u.y / world.H)];
    if (u.shape) e.push(u.shape);
    units.push(e);
  }
  return { v: 1, k: 'battle', units, terr: terrainRuns(world, i => world.towner[i] !== STONE_WALL.OWNER) };
}
// In eine geleerte Welt der Schlacht stellen (main.js leert vorher und zeichnet danach)
export function applyBattle(world, d) {
  applyRuns(world, d.terr);
  for (const [type, team, x, y, shape] of d.units) {
    const u = spawn(world, type, Math.max(6, Math.min(world.W - 6, x / Q * world.W)), Math.max(6, Math.min(world.H - 6, y / Q * world.H)), team);
    if (shape && has(SHAPES, shape)) applyShape(u, shape, true);
  }
  rebuildHash(world);
}

/* ---------- Eigenes Level ---------- */
export const levelData = level => ({ v: 1, k: 'level', level });
export const CELL_PX = CELL;
