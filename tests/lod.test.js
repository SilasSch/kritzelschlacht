// Detailstufe der Effekte (Task 13): Stufe 1 = Rauch aus, übrige Partikel ×0,5; Regler aus der Bilddauer.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createFxCore, createLodGovernor, emberCount, JET_N,
  LOD_MAX, LOD_OFF, LOD_SLOW_MS, LOD_SLOW_T, LOD_OK_MS, LOD_RECOVER_T, LOD_RECOVER_MAX,
} from '../game/js/render/fxcore.js';

const fixed = () => { let s = 7; return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; };
const core = lod => { const c = createFxCore({}, { rand: fixed() }); c.lod = lod; return c; };
const kinds = c => c.store.countByKind();

test('Stufe 1: Explosion ohne Rauch, halbe Glut, Kern und Bodenlicht bleiben', () => {
  const ev = [{ type: 'blast', x: 100, y: 100, R: 55, kind: 'blast' }];
  const a = core(0), b = core(1);
  a.consume(ev); b.consume(ev);
  const ka = kinds(a), kb = kinds(b);
  assert.equal(ka.ember, emberCount(55)); assert.equal(ka.smoke, 6);
  assert.equal(kb.ember, Math.floor(emberCount(55) / 2));
  assert.equal(kb.smoke, undefined);
  assert.equal(kb.core, 1); assert.equal(kb.light, 1);
  assert.ok(b.stats().lodSkipped >= 6 + Math.ceil(emberCount(55) / 2));
});

test('Stufe 1: Flammenstrahl halb, Staub und Rauchfäden aus, auf Stufe 0 wieder alles', () => {
  const breath = { type: 'shot', kind: 'breath', x: 0, y: 0, z: 0, face: 1, nx: 1, ny: 0, tx: 100, ty: 0, tz: 0 };
  const a = core(0), b = core(1);
  a.consume([breath]); b.consume([breath]);
  assert.equal(kinds(a).jet, JET_N); assert.equal(kinds(b).jet, JET_N / 2);
  const land = [{ type: 'land', x: 0, y: 0, impact: 400 }, { type: 'extinguish', x: 0, y: 0 }];
  const c = core(1); c.consume(land);
  for (const k of LOD_OFF) assert.equal(kinds(c)[k], undefined, k);
  // zurück auf 0: wieder alles
  c.lod = 0; c.consume(land); assert.ok(kinds(c).dust > 0 && kinds(c).wisp > 0);
});

test('lod wird auf 0..LOD_MAX begrenzt', () => {
  const c = createFxCore({});
  c.lod = 5; assert.equal(c.lod, LOD_MAX);
  c.lod = -1; assert.equal(c.lod, 0);
  c.lod = NaN; assert.equal(c.lod, 0);
});

test('Regler: langsame Bilder senken die Stufe, schnelle holen sie zurück', () => {
  const g = createLodGovernor();
  for (let i = 0; i < 120; i++) g.update(8, 16.7);
  assert.equal(g.level, 0);
  // ein einzelner Ruckler senkt nicht
  g.update(45); g.update(8, 16.7); assert.equal(g.level, 0);
  // dauerhaft 25 ms Arbeit: nach etwa LOD_SLOW_T s (plus Anlauf des Mittels) Stufe 1
  let t = 0; while (g.level === 0 && t < 2) { g.update(25); t += .025; }
  assert.equal(g.level, 1); assert.ok(t >= LOD_SLOW_T && t < LOD_SLOW_T + .6, `t ${t}`);
  // 14 ms (zwischen LOD_OK_MS und LOD_SLOW_MS): bleibt
  for (let i = 0; i < 400; i++) g.update(14, 16.7);
  assert.equal(g.level, 1);
  // 8 ms Arbeit bei 16,7 ms Abstand: nach LOD_RECOVER_T s zurück
  t = 0; while (g.level === 1 && t < 10) { g.update(8, 16.7); t += .0167; }
  assert.equal(g.level, 0); assert.ok(t >= LOD_RECOVER_T && t < LOD_RECOVER_T + 1, `t ${t}`);
  assert.ok(LOD_OK_MS < LOD_SLOW_MS);
});

test('Regler: auf 30 Hz begrenzter Browser mit wenig Arbeit bleibt auf Stufe 0, Zeit zählt nach Bildabstand', () => {
  const g = createLodGovernor();
  for (let i = 0; i < 300; i++) g.update(6, 33.3);     // 10 s bei 30 fps, 6 ms Arbeit
  assert.equal(g.level, 0);
  // viel Arbeit bei 30 Hz: senkt nach etwa LOD_SLOW_T s Echtzeit (nicht Arbeitszeit)
  let t = 0; while (g.level === 0 && t < 3) { g.update(24, 33.3); t += .0333; }
  assert.equal(g.level, 1); assert.ok(t >= LOD_SLOW_T && t < LOD_SLOW_T + .8, `t ${t}`);
});

test('Regler: jedes weitere Senken verdoppelt die Wartezeit, Hintergrund-Bilder zählen nicht', () => {
  const g = createLodGovernor();
  const slow = () => { while (g.level === 0) g.update(30); };
  const back = () => { let t = 0; while (g.level === 1) { g.update(8, 16.7); t += .0167; } return t; };
  slow(); const t1 = back();
  slow(); const t2 = back();
  slow(); const t3 = back();
  assert.ok(t2 > t1 * 1.8 && t3 > t2 * 1.8, `${t1} ${t2} ${t3}`);
  for (let i = 0; i < 10; i++) slow(), back();
  assert.equal(g.hold, LOD_RECOVER_MAX);
  const h = createLodGovernor();
  for (let i = 0; i < 50; i++) h.update(1000);   // Tab im Hintergrund
  assert.equal(h.level, 0); assert.equal(h.ema, 0);
});
