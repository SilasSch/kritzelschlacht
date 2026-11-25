// König des Hügels (25.11.): Jeden Tag ein Hügel mit fester Regel, Karte und Budget. Wer zuerst eine Armee malt, sitzt
// auf dem Thron; wer den König schlägt, übernimmt ihn. Rein: kein DOM, keine Datenbank (die steckt in ui/hill.js).
//
// Der König steht immer links (Blau), der Herausforderer malt rechts (Rot) und sieht die Armee des Königs nicht. Gewinnt
// der Herausforderer, wird seine Armee gespiegelt und verteidigt ab jetzt links. Alle Karten sind links-rechts symmetrisch.
// Gekämpft wird wie im Code-Duell (duel.js duelList, main.js onlineFight) mit einer Saat je Regentschaft: Wer gegen
// denselben König verliert, kann mit einer anderen Armee denselben Kampf noch einmal versuchen.
//
// Datenbank-Dokument hill/<Datum>:
//   { d: Datum, k: König | null, hist: [frühere Könige], last: letzte Krönung }
//   König  = { a: Armee (packArmy, Blau), by: Spieler-id, n: Name, at: Zeit der Krönung (ms), def: abgewehrte Angriffe }
//   hist   = [{ by, n, at, until, def }], neueste zuerst, höchstens HIST_MAX
//   last   = { a: Armee des gestürzten Königs (Blau), b: Armee des Siegers (Rot), n: Sieger, old: Gestürzter, seed }
import { RULE_IDS, MAP_IDS } from './rules.js';
import { unpackArmy, packArmy, battleList } from './online.js';
import { hashStr } from './daily.js';
import { cleanName } from './dailyboard.js';
import { WORLD_W, WORLD_H } from './camera.js';

export const HILL_BUDGET = 150;
export const HIST_MAX = 12;
export const HILL_COLL = 'hill';
// Datenbank-Regeln: alle lesen, Mitwirkende schreiben (Spielstand für alle)
export const HILL_RULES = [{ path: HILL_COLL, read: 'view', write: 'interact' }];

// Regel, Karte und Budget des Tages (für alle gleich)
export function hillCfg(date) {
  const h = hashStr('kritzel-hill|' + date);
  return { r: 1, cat: RULE_IDS[h % RULE_IDS.length], map: MAP_IDS[(h >>> 8) % MAP_IDS.length], budget: HILL_BUDGET, seed: 0 };
}
// Saat des Kampfs gegen den König (fest je Regentschaft)
export const hillSeed = (date, king) => hashStr(`kritzel-hill-fight|${date}|${king ? king.at : 0}`) | 0;

const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
const num = v => (typeof v === 'number' && isFinite(v) ? v : 0);

// Gültiger König aus dem Dokument oder null (kaputte oder regelwidrige Armee zählt nicht)
export function kingOf(doc, date, W = WORLD_W, H = WORLD_H) {
  const k = isObj(doc) && doc.d === date ? doc.k : null;
  if (!isObj(k) || typeof k.a !== 'string' || typeof k.by !== 'string') return null;
  try {
    const us = unpackArmy(k.a, 'blau', W, H, hillCfg(date));
    if (!us.length) return null;
  } catch (e) { return null; }
  return { a: k.a, by: k.by, n: cleanName(k.n), at: num(k.at), def: Math.max(0, Math.floor(num(k.def))) };
}
export function histOf(doc, date) {
  if (!isObj(doc) || doc.d !== date || !Array.isArray(doc.hist)) return [];
  return doc.hist.filter(isObj).slice(0, HIST_MAX).map(h => ({ by: String(h.by || ''), n: cleanName(h.n), at: num(h.at), until: num(h.until), def: Math.max(0, Math.floor(num(h.def))) }));
}
export function lastOf(doc, date) {
  const l = isObj(doc) && doc.d === date ? doc.last : null;
  if (!isObj(l) || typeof l.a !== 'string' || typeof l.b !== 'string') return null;
  return { a: l.a, b: l.b, n: cleanName(l.n), old: cleanName(l.old), seed: num(l.seed) | 0 };
}

// Armee eines Herausforderers (Rot, rechts) gespiegelt nach links (Blau)
export function mirrorArmy(packedRot, cfg, W = WORLD_W, H = WORLD_H) {
  const us = unpackArmy(packedRot, 'rot', W, H, cfg).map(u => ({ ...u, x: W - u.x, team: 'blau', alive: true }));
  return packArmy({ units: us, W, H }, 'blau');
}

// Kampfliste: König links, Herausforderer rechts
export function hillList(kingA, challengerB, cfg, W = WORLD_W, H = WORLD_H) {
  return battleList(unpackArmy(kingA, 'blau', W, H, cfg), unpackArmy(challengerB, 'rot', W, H, cfg));
}

// Neues Dokument nach einer Krönung. old: der König, gegen den gekämpft wurde (null: leerer Thron).
// b: Armee des Siegers (Rot). me: { by, n }. now: Zeit in ms.
export function crown(doc, date, old, b, me, now, W = WORLD_W, H = WORLD_H) {
  const cfg = hillCfg(date);
  const hist = histOf(doc, date);
  if (old) hist.unshift({ by: old.by, n: old.n, at: old.at, until: now, def: old.def });
  return {
    d: date,
    k: { a: mirrorArmy(b, cfg, W, H), by: me.by, n: cleanName(me.n), at: now, def: 0 },
    hist: hist.slice(0, HIST_MAX),
    last: old ? { a: old.a, b, n: cleanName(me.n), old: old.n, seed: hillSeed(date, old) } : (isObj(doc) && doc.d === date && doc.last) || null,
  };
}
// Erster König auf leerem Thron: die eigene Armee (Rot gemalt) direkt gespiegelt
export const firstKing = (doc, date, b, me, now, W, H) => crown(doc, date, null, b, me, now, W, H);

// Ist der König im Dokument noch derselbe, gegen den gekämpft wurde?
export const sameKing = (a, b) => !!a && !!b && a.by === b.by && a.at === b.at;

// Wie lange regiert der König schon (ms → „3 Std. 12 Min.“-Bausteine)
export function reign(ms) {
  const m = Math.max(0, Math.floor(ms / 60000));
  return { h: Math.floor(m / 60), m: m % 60 };
}
