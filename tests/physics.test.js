import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, setCell, cellIndex, rebuildHash } from '../game/js/world.js';
import { GRAVITY, GROUND_FRICTION, WALL_CLEAR_Z, applyImpulse, integrate, collide, collideWalls } from '../game/js/physics.js';
import { CELL } from '../game/js/data.js';
import { think, blast } from '../game/js/combat.js';

const DT = 1 / 60;
const mkWorld = () => { const w = createWorld(1400, 800, 5); w.teamMode = true; return w; };
// Ein Physikschritt in der Reihenfolge von sim.step (ohne KI und Geschosse)
const phys = (w, dt = DT) => {
  rebuildHash(w); integrate(w, dt); collide(w);
  for (const u of w.units) if (u.alive) collideWalls(w, u, dt);
};
const wallRect = (w, gx0, gy0, gx1, gy1) => {
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) setCell(w, gy * w.GW + gx, 4, 0);
};
const inWall = (w, u) => w.terr[cellIndex(w, u.x, u.y)] === 4;
// Fliegt bis zur Landung, liefert die Flugzeit
const flyUntilLanded = (w, u, max = 5) => {
  let t = 0;
  while (u.state === 'air' && t < max) { phys(w); t += DT; }
  return t;
};

test('Konstanten', () => {
  assert.equal(GRAVITY, 900); assert.equal(GROUND_FRICTION, 8); assert.equal(WALL_CLEAR_Z, 12);
});

test('Senkrechter Impuls: Flugzeit ≈ 2·vz/g, danach stun 0.3–0.8 s', () => {
  const w = mkWorld(); const u = spawn(w, 'soldat', 300, 300, 'blau');
  applyImpulse(u, 0, 0, 200);                       // Masse 1 → vz = 200, kein Abpraller (< 250)
  assert.equal(u.state, 'air'); assert.equal(u.vz, 200);
  w.events.length = 0;
  const t = flyUntilLanded(w, u);
  assert.ok(Math.abs(t - 2 * 200 / GRAVITY) < 3 * DT, `Flugzeit ${t}`);
  assert.equal(u.state, 'stun'); assert.equal(u.z, 0);
  const peak = 200 * 200 / (2 * GRAVITY);
  assert.ok(Math.abs(u.peakZ - peak) < 3, `peakZ ${u.peakZ}`);
  assert.ok(u.stunT >= .3 && u.stunT <= .8);
  assert.ok(Math.abs(u.stunT - (.3 + .5 * u.peakZ / 120)) < 1e-9);
  const land = w.events.find(e => e.type === 'land');
  assert.ok(land && land.impact > 150 && Math.abs(land.x - u.x) < 1e-9);
  // Betäubung läuft ab, dann wieder 'ok'
  let s = 0; while (u.state === 'stun' && s < 2) { phys(w); s += DT; }
  assert.equal(u.state, 'ok'); assert.ok(Math.abs(s - .3 - .5 * peak / 120) < 3 * DT, `stun ${s}`);
  assert.equal(u.x, 300); assert.equal(u.y, 300);
});

test('Höherer Flug → längere Betäubung, gedeckelt bei 0.8 s', () => {
  const stunFor = iz => {
    const w = mkWorld(); const u = spawn(w, 'soldat', 300, 300, 'blau');
    applyImpulse(u, 0, 0, iz); flyUntilLanded(w, u);
    assert.equal(u.state, 'stun'); return u.stunT;
  };
  const a = stunFor(150), b = stunFor(240), c = stunFor(600), d = stunFor(900);
  assert.ok(a < b && b < c, `${a} ${b} ${c}`);
  assert.equal(c, .8); assert.equal(d, .8);
});

test('Harter Aufprall prallt einmal ab (vz = -vz·0.25)', () => {
  const w = mkWorld(); const u = spawn(w, 'soldat', 300, 300, 'blau');
  applyImpulse(u, 0, 0, 1200);                      // Abpraller mit 300 > 250: trotzdem nur einmal
  let bounces = 0, prev = u.vz;
  for (let k = 0; k < 600 && u.state === 'air'; k++) {
    phys(w);
    if (prev < 0 && u.vz > 0) { bounces++; assert.ok(Math.abs(u.vz - 1200 * .25) < 20, `bounce vz ${u.vz}`); }
    prev = u.vz;
  }
  assert.equal(bounces, 1); assert.equal(u.state, 'stun');
});

test('Panzer schiebt Soldat: Soldat weicht ≥ 10× weiter aus als Panzer', () => {
  const w = mkWorld();
  const p = spawn(w, 'panzer', 400, 300, 'blau'), s = spawn(w, 'soldat', 420, 300, 'rot');
  rebuildHash(w); collide(w);
  const dp = Math.hypot(p.x - 400, p.y - 300), ds = Math.hypot(s.x - 420, s.y - 300);
  assert.ok(ds > 0 && ds >= 10 * dp, `soldat ${ds} panzer ${dp}`);
  assert.ok(s.x > 420 && p.x <= 400);
  // Fährt der Panzer weiter, wird der Soldat vor ihm hergeschoben
  for (let k = 0; k < 60; k++) { p.mx = 32; phys(w); }
  assert.ok(s.x - p.x >= (22 + 9) * .9 - 1, 'Soldat bleibt vor dem Panzer');
  assert.ok(s.x > 440, `Soldat geschoben bis ${s.x}`);
});

test('Normaler Treffer (iz=0) betäubt nicht', () => {
  const w = mkWorld(); const u = spawn(w, 'soldat', 300, 300, 'blau');
  applyImpulse(u, 180, 0, 0);
  assert.equal(u.state, 'ok'); assert.equal(u.vx, 180); assert.equal(u.vz, 0);
  for (let k = 0; k < 60; k++) { phys(w); assert.equal(u.state, 'ok'); assert.equal(u.z, 0); }
  assert.ok(u.x > 315 && u.x < 330, `Schubs ${u.x}`);   // ≈ 180/8 = 22 px
  assert.ok(Math.abs(u.vx) < 2);
  // Explosion (combat.blast) schubst auch nur
  const v = spawn(w, 'krieger', 600, 300, 'blau'); rebuildHash(w);
  blast(w, 590, 300, 40, 1, 'rot', null, 'blast', 0);
  assert.equal(v.state, 'ok'); assert.ok(v.vx > 0); assert.equal(v.vz, 0);
});

test('Masse skaliert den Schubs: Panzer kaum, Soldat voll', () => {
  const w = mkWorld();
  const s = spawn(w, 'soldat', 300, 300, 'blau'), p = spawn(w, 'panzer', 600, 300, 'blau');
  applyImpulse(s, 100, 0, 0); applyImpulse(p, 100, 0, 0);
  assert.equal(s.vx, 100); assert.equal(p.vx, 100 / 40);
});

test('think überspringt Einheiten in der Luft oder betäubt, Timer laufen weiter', () => {
  const w = mkWorld();
  const u = spawn(w, 'krieger', 300, 300, 'blau'); spawn(w, 'krieger', 340, 300, 'rot');
  rebuildHash(w);
  u.state = 'stun'; u.stunT = .5; u.cd = 1; u.hitT = .1; u.mx = 50;
  think(w, u, .1);
  assert.equal(u.mx, 0); assert.equal(u.my, 0); assert.equal(u.tg, null);
  assert.ok(Math.abs(u.cd - .9) < 1e-9); assert.equal(u.hitT, 0);
  u.state = 'ok'; think(w, u, .1);
  assert.ok(u.tg && u.mx > 0);
});

test('Gegen Mauer geschoben: Körper bleibt außerhalb der Mauerzellen', () => {
  const w = mkWorld(); wallRect(w, 40, 20, 41, 40);   // Mauer bei x 400–420, y 200–410
  const u = spawn(w, 'soldat', 370, 300, 'blau');
  applyImpulse(u, 400, 0, 0);
  let blockedSeen = false;
  for (let k = 0; k < 120; k++) {
    u.mx = 40; u.my = 10; phys(w);
    assert.ok(!inWall(w, u), `in Mauer bei ${u.x},${u.y}`);
    assert.ok(u.x < 400);
    if (u.blk > 0) blockedSeen = true;
  }
  assert.ok(blockedSeen); assert.equal(w.terr[u.bcell], 4);
  assert.ok(u.blk > .45, `blk ${u.blk}`);              // KI haut nach 0.45 s auf die Mauer
  assert.ok(u.y > 310, 'gleitet entlang der Mauer');
});

test('In Mauerzelle gelandet → steht danach in freier Zelle', () => {
  const w = mkWorld(); wallRect(w, 40, 25, 48, 35);   // Block x 400–490, y 250–360
  const u = spawn(w, 'soldat', 330, 305, 'blau');
  applyImpulse(u, 120, 0, 400);                       // fliegt über die Mauer, landet mittendrin
  let overWall = false;
  for (let k = 0; k < 300 && u.state === 'air'; k++) { phys(w); if (inWall(w, u)) { overWall = true; assert.ok(u.z >= WALL_CLEAR_Z || u.vz < 0); } }
  assert.ok(overWall, 'Körper war über der Mauer');
  assert.notEqual(u.state, 'air');
  assert.ok(!inWall(w, u), `steckt in Mauer bei ${u.x},${u.y}`);
  for (let k = 0; k < 60; k++) { phys(w); assert.ok(!inWall(w, u)); }
  // Direkt im Mauerinneren landen (z. B. Mauer unter einem fallenden Körper gemalt)
  const v = spawn(w, 'krieger', 445, 305, 'blau'); v.state = 'air'; v.z = 30; v.vz = -50; v.peakZ = 40;
  flyUntilLanded(w, v);
  assert.ok(!inWall(w, v), `v steckt in Mauer bei ${v.x},${v.y}`);
  assert.ok(Math.abs(v.x - 445) <= 6 * CELL + CELL && Math.abs(v.y - 305) <= 6 * CELL + CELL);
});

test('Über den Rand geschleudert → landet innerhalb der Welt', () => {
  const w = mkWorld();
  const a = spawn(w, 'soldat', 20, 20, 'blau'), b = spawn(w, 'krieger', 1390, 790, 'rot');
  applyImpulse(a, -2000, -1500, 350); applyImpulse(b, 3000, 2500, 350);
  for (let k = 0; k < 300; k++) {
    phys(w);
    for (const u of [a, b]) assert.ok(u.x >= 6 && u.x <= w.W - 6 && u.y >= 6 && u.y <= w.H - 6, `${u.x},${u.y}`);
  }
  for (const u of [a, b]) { assert.notEqual(u.state, 'air'); assert.ok(!inWall(w, u)); assert.equal(u.z, 0); }
  // Randzelle eine Mauer: Körper landet trotzdem in einer freien Zelle in der Welt
  const w2 = mkWorld(); wallRect(w2, 0, 0, 3, 3);
  const c = spawn(w2, 'soldat', 60, 60, 'blau'); applyImpulse(c, -800, -800, 300);
  for (let k = 0; k < 300; k++) phys(w2);
  assert.ok(!inWall(w2, c) && c.x >= 6 && c.y >= 6, `${c.x},${c.y}`);
});

test('Flieger bleiben auf flyZ und kollidieren nicht mit Bodentruppen', () => {
  const w = mkWorld();
  const h = spawn(w, 'heli', 400, 300, 'blau'), s = spawn(w, 'soldat', 405, 300, 'rot');
  const b1 = spawn(w, 'biene', 600, 300, 'blau'), b2 = spawn(w, 'biene', 603, 300, 'blau');
  applyImpulse(h, 1200, 0, 500);                      // Flieger ignorieren iz; Masse 12 → vx 100
  assert.equal(h.state, 'ok'); assert.equal(h.vz, 0);
  rebuildHash(w); collide(w);
  assert.equal(s.x, 405); assert.equal(h.x, 400);     // Heli und Soldat überlappen ungestört
  assert.ok(b2.x - b1.x > 3, 'Flieger untereinander kollidieren');
  for (let k = 0; k < 120; k++) { h.mx = 0; phys(w); assert.equal(h.z, UNITS_FLYZ.heli); assert.equal(h.state, 'ok'); }
  assert.equal(b1.z, UNITS_FLYZ.biene);
  assert.ok(h.x > 410, 'horizontaler Impuls wirkt');
});

const UNITS_FLYZ = { heli: 46, biene: 14 };

test('Körper hoch in der Luft (z > r) werden bei der Kollision übersprungen', () => {
  const w = mkWorld();
  const a = spawn(w, 'soldat', 400, 300, 'blau'), b = spawn(w, 'soldat', 404, 300, 'rot');
  a.state = 'air'; a.z = 30; a.vz = 0;
  rebuildHash(w); collide(w);
  assert.equal(a.x, 400); assert.equal(b.x, 404);
  a.z = 5; collide(w);
  assert.ok(b.x > 404);
});

test('Lava brennt am Boden, nicht in der Luft; Wasser bremst', () => {
  const w = mkWorld();
  for (let gx = 20; gx < 40; gx++) for (let gy = 20; gy < 40; gy++) setCell(w, gy * w.GW + gx, 2, 0);
  for (let gx = 60; gx < 80; gx++) for (let gy = 20; gy < 40; gy++) setCell(w, gy * w.GW + gx, 1, 0);
  const g = spawn(w, 'soldat', 300, 300, 'blau'), a = spawn(w, 'soldat', 330, 300, 'blau');
  a.state = 'air'; a.z = 100; a.vz = 0;
  integrate(w, .1);
  assert.ok(g.hp < 55 && Math.abs(g.hp - 54) < 1e-9); assert.equal(a.hp, 55);
  const s = spawn(w, 'soldat', 700, 300, 'blau'); s.mx = 50;
  integrate(w, .1); assert.ok(Math.abs(s.x - 702) < 1e-9);
});

test('Physik ist deterministisch und nutzt kein Math.random', () => {
  const orig = Math.random; Math.random = () => { throw new Error('Math.random'); };
  try {
    const run = () => {
      const w = mkWorld(); wallRect(w, 40, 25, 48, 35);
      for (let i = 0; i < 30; i++) applyImpulse(spawn(w, i % 3 ? 'soldat' : 'baer', 300 + i * 7, 280 + i * 3, 'blau'), 150, 20 * (i % 5), i % 2 ? 300 : 0);
      for (let k = 0; k < 120; k++) phys(w);
      return w.units.map(u => `${u.x.toFixed(4)},${u.y.toFixed(4)},${u.z.toFixed(4)},${u.state}`).join('|');
    };
    assert.equal(run(), run());
  } finally { Math.random = orig; }
});

test('land-Ereignis hat immer eine Aufprallgeschwindigkeit, auch ohne applyImpulse', () => {
  const w = mkWorld(); const u = spawn(w, 'krieger', 300, 300, 'blau');
  u.state = 'air'; u.z = 20; u.vz = -50; u.peakZ = 20;
  flyUntilLanded(w, u);
  const e = w.events.find(e => e.type === 'land');
  assert.ok(e && Number.isFinite(e.impact) && e.impact > 50, `impact ${e && e.impact}`);
});
