// König des Hügels (hill.js): Tageshügel, Spiegeln, Krönung, kaputte Dokumente
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS } from '../game/js/data.js';
import { ruleAllows, RULE_IDS, MAP_IDS } from '../game/js/rules.js';
import { packArmy, unpackArmy, PAINT_TYPES, budgetOf } from '../game/js/online.js';
import { hillCfg, hillSeed, kingOf, histOf, lastOf, mirrorArmy, hillList, crown, firstKing, sameKing, reign, HIST_MAX } from '../game/js/hill.js';

const W = 1600, H = 900, D = '2026-11-25';
// Armee auf der rechten Seite (Rot) aus erlaubten Einheiten, innerhalb des Budgets
function army(date, n = 6, dx = 0) {
  const cfg = hillCfg(date);
  const t = PAINT_TYPES.filter(t => ruleAllows(cfg.cat, t)).sort((a, b) => UNITS[a].cost - UNITS[b].cost)[0];
  const units = [];
  for (let i = 0; i < n && (i + 1) * UNITS[t].cost <= budgetOf(cfg); i++) units.push({ type: t, team: 'rot', x: W * 0.7 + dx + i * 12, y: 200 + i * 40, alive: true });
  return packArmy({ units, W, H }, 'rot');
}

test('Tageshügel: Regel und Karte fest je Datum und gültig', () => {
  const a = hillCfg(D), b = hillCfg(D);
  assert.deepEqual(a, b);
  assert.ok(RULE_IDS.includes(a.cat) && MAP_IDS.includes(a.map));
  const days = new Set(Array.from({ length: 20 }, (_, i) => JSON.stringify(hillCfg(`2026-12-${String(i + 1).padStart(2, '0')}`))));
  assert.ok(days.size > 5, 'die Tage unterscheiden sich');
});

test('Spiegeln: Rot rechts wird Blau links, gleiche Einheiten', () => {
  const cfg = hillCfg(D), b = army(D);
  const red = unpackArmy(b, 'rot', W, H, cfg), blue = unpackArmy(mirrorArmy(b, cfg, W, H), 'blau', W, H, cfg);
  assert.equal(blue.length, red.length);
  blue.forEach((u, i) => { assert.equal(u.type, red[i].type); assert.ok(Math.abs(u.x - (W - red[i].x)) < 0.1); assert.ok(u.x < W / 2); });
});

test('Krönung: leerer Thron, Sturz, Bilanz und Verlauf', () => {
  const b1 = army(D), b2 = army(D, 5, 30);
  let doc = firstKing(null, D, b1, { by: 'u1', n: 'Mia' }, 1000, W, H);
  let k = kingOf(doc, D, W, H);
  assert.equal(k.by, 'u1'); assert.equal(k.n, 'Mia'); assert.equal(k.def, 0);
  assert.equal(doc.last, null); assert.deepEqual(histOf(doc, D), []);
  doc.k.def = 4;
  const old = kingOf(doc, D, W, H);
  doc = crown(doc, D, old, b2, { by: 'u2', n: 'Tom' }, 5000, W, H);
  k = kingOf(doc, D, W, H);
  assert.equal(k.by, 'u2'); assert.equal(k.at, 5000);
  const h = histOf(doc, D);
  assert.equal(h.length, 1); assert.deepEqual(h[0], { by: 'u1', n: 'Mia', at: 1000, until: 5000, def: 4 });
  const l = lastOf(doc, D);
  assert.equal(l.n, 'Tom'); assert.equal(l.old, 'Mia'); assert.equal(l.b, b2); assert.equal(l.seed, hillSeed(D, old));
  const list = hillList(l.a, l.b, hillCfg(D), W, H);
  assert.ok(list.some(u => u.team === 'blau') && list.some(u => u.team === 'rot'));
  assert.ok(sameKing(k, kingOf(doc, D, W, H))); assert.ok(!sameKing(k, old));
  for (let i = 0; i < HIST_MAX + 5; i++) doc = crown(doc, D, kingOf(doc, D, W, H), b1, { by: 'x' + i, n: 'X' }, 6000 + i, W, H);
  assert.equal(histOf(doc, D).length, HIST_MAX);
});

test('Kaputte oder fremde Dokumente: kein König', () => {
  const doc = firstKing(null, D, army(D), { by: 'u1', n: 'Mia' }, 1000, W, H);
  assert.equal(kingOf(doc, '2026-11-26', W, H), null, 'anderer Tag');
  assert.equal(kingOf({ ...doc, k: { ...doc.k, a: '!!' } }, D, W, H), null);
  assert.equal(kingOf({ ...doc, k: { ...doc.k, a: '' } }, D, W, H), null, 'leere Armee');
  assert.equal(kingOf({ ...doc, k: { ...doc.k, a: army(D) } }, D, W, H), null, 'Armee auf der falschen Seite');
  assert.equal(kingOf(null, D), null); assert.deepEqual(histOf({ d: D, hist: 'x' }, D), []); assert.equal(lastOf({ d: D, last: { a: 1 } }, D), null);
});

test('Regentschaft in Stunden und Minuten', () => {
  assert.deepEqual(reign(0), { h: 0, m: 0 });
  assert.deepEqual(reign((2 * 60 + 5) * 60000 + 999), { h: 2, m: 5 });
});
