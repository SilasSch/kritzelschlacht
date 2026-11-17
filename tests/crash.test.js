import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, setCell, cellIndex, rebuildHash } from '../game/js/world.js';
import { applyImpulse, integrate, collide, collideWalls, stepCorpses, stepDebris, DEBRIS_CAP } from '../game/js/physics.js';
import { hurt, hitWall } from '../game/js/combat.js';
import { step } from '../game/js/sim.js';
import { CELL } from '../game/js/data.js';

const DT = 1 / 60;
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
// Physikschritt in der Reihenfolge von sim.step (ohne KI und Geschosse)
const phys = (w, dt = DT) => {
  rebuildHash(w); integrate(w, dt); collide(w);
  for (const u of w.units) if (u.alive) collideWalls(w, u, dt);
  stepCorpses(w, dt); stepDebris(w, dt);
};
const run = (w, s) => { for (let k = 0; k < Math.round(s / DT); k++) phys(w); };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const area = (w, id, gx0, gy0, gx1, gy1) => {
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) setCell(w, gy * w.GW + gx, id, 0);
};

test('Abgeschossener Heli fällt, explodiert am Boden und verletzt Einheiten im Radius 50', () => {
  const w = mkWorld();
  const h = spawn(w, 'heli', 500, 300, 'rot');
  const shooter = spawn(w, 'soldat', 300, 300, 'blau'); shooter.hp = 1e9;
  // Hüpfer vom Schützen weg (+x, 60–110 px/s, ~0.32 s Fall): Aufschlag etwa bei x 520–535
  const near = spawn(w, 'soldat', 528, 300, 'blau'), weak = spawn(w, 'krieger', 528, 318, 'rot');
  const far = spawn(w, 'soldat', 640, 300, 'blau');
  near.hp = 1e6; weak.hp = 1;
  rebuildHash(w);
  hurt(w, h, 1e9, 'bullet', shooter);
  assert.equal(h.alive, false); assert.equal(shooter.kills, 1);
  const c = w.corpses.find(k => k.kind === 'body' && k.type === 'heli');
  assert.equal(c.crash, 'heli'); assert.equal(c.z, 46); assert.equal(c.state, 'fly');
  assert.ok(Math.abs(c.vrot) >= 4, 'dreht sich');
  w.events.length = 0;
  let t = 0, crash = null, lastZ = c.z;
  while (!crash && t < 2) {
    phys(w); t += DT;
    crash = w.events.find(e => e.type === 'crash');
    if (!crash) { assert.ok(c.z <= lastZ + 1e-9, 'fällt ohne Hüpfer nach oben'); lastZ = c.z; assert.ok(!w.events.some(e => e.type === 'blast'), 'kein Knall in der Luft'); }
  }
  assert.ok(crash, 'Absturz-Ereignis'); assert.equal(crash.kind, 'heli');
  assert.ok(t > .2 && t < .6, `Fallzeit ${t}`);
  assert.equal(c.z, 0); assert.equal(c.crash, null, 'explodiert nur einmal');
  const b = w.events.find(e => e.type === 'blast');
  assert.ok(b && b.R === 50 && b.x === crash.x && b.y === crash.y, 'Explosion am Aufschlagpunkt');
  assert.ok(dist(near, crash) < 40 && dist(far, crash) > 50 + far.T.r + 16, `${dist(near, crash)} ${dist(far, crash)}`);
  assert.ok(near.hp < 1e6, 'nahe Einheit verletzt'); assert.equal(weak.alive, false, 'auch Gegner des Helis');
  assert.equal(far.hp, far.T.hp, 'außerhalb unverletzt'); assert.equal(shooter.hp, 1e9);
  assert.equal(shooter.kills, 1, 'der Absturz schreibt niemandem Abschüsse gut');
  const before = w.events.length; run(w, 2);
  assert.equal(w.events.slice(before).filter(e => e.type === 'crash').length, 0);
});

test('Abstürzender Drache schleudert Einheiten im Radius 70, ohne Schaden', () => {
  const w = mkWorld();
  const d = spawn(w, 'drache', 500, 300, 'rot');
  const s = spawn(w, 'soldat', 520, 300, 'blau'), p = spawn(w, 'panzer', 470, 300, 'blau');
  const far = spawn(w, 'soldat', 640, 300, 'blau');
  rebuildHash(w);
  hurt(w, d, 1e9, 'fire', null);
  const c = w.corpses.find(k => k.kind === 'body');
  assert.equal(c.crash, 'drache'); assert.equal(c.z, 60);
  w.events.length = 0;
  let t = 0, crash = null;
  while (!crash && t < 2) { phys(w); t += DT; crash = w.events.find(e => e.type === 'crash'); }
  assert.ok(crash); assert.equal(crash.kind, 'drache');
  assert.ok(!w.events.some(e => e.type === 'blast'), 'keine Explosion');
  assert.ok(dist(s, crash) < 70 && dist(far, crash) > 70 + far.T.r, `${dist(s, crash)} ${dist(far, crash)}`);
  // Geschwindigkeit nach außen (radial vom Aufschlagpunkt weg)
  const radial = u => ((u.x - crash.x) * u.vx + (u.y - crash.y) * u.vy) / dist(u, crash);
  assert.equal(s.state, 'air', 'leichte Einheit hebt ab');
  assert.ok(radial(s) > 500, `weggeschleudert: ${radial(s)}`);
  assert.ok(Math.hypot(s.vx, s.vy) <= 700 + 1e-6, 'gedeckelt wie Explosionen');
  assert.equal(p.state, 'ok', 'Panzer hebt nicht ab'); assert.ok(radial(p) > 10, `Panzer geschubst: ${radial(p)}`);
  assert.equal(far.vx, 0); assert.equal(far.state, 'ok');
  for (const u of [s, p, far]) assert.equal(u.hp, u.T.hp, `${u.type} ohne Schaden`);
});

test('Bienen und Geister fallen als normale Leichen, ohne Absturz', () => {
  const w = mkWorld();
  const b = spawn(w, 'biene', 400, 300, 'rot'), g = spawn(w, 'geist', 600, 300, 'rot');
  const s = spawn(w, 'soldat', 405, 300, 'blau');
  rebuildHash(w);
  hurt(w, b, 1e9, 'blast', null); hurt(w, g, 1e9, 'blast', null);
  const cb = w.corpses.find(k => k.type === 'biene'), cg = w.corpses.find(k => k.type === 'geist');
  assert.equal(cb.z, 14); assert.equal(cg.z, 18); assert.ok(!cb.crash && !cg.crash);
  w.events.length = 0; run(w, 3);
  assert.ok(!w.events.some(e => e.type === 'crash' || e.type === 'blast'));
  assert.equal(cb.state, 'rest'); assert.equal(cg.state, 'rest'); assert.equal(s.hp, s.T.hp);
});

test('Zerstörte Mauerzelle erzeugt 3 Brocken, die niemanden verletzen und nach 9 s Liegen verschwinden', () => {
  const w = mkWorld();
  const i = cellIndex(w, 505, 305), cx = (i % w.GW) * CELL + 5, cy = (i / w.GW | 0) * CELL + 5;
  setCell(w, i, 4, 0);
  const s = spawn(w, 'soldat', cx + 14, cy, 'blau');
  hitWall(w, i, 100, cx - 30, cy);
  assert.equal(w.debris.length, 0, 'nur beim Zerbrechen');
  hitWall(w, i, 100, cx - 30, cy);
  assert.equal(w.terr[i], 0);
  assert.equal(w.debris.length, 3);
  for (const d of w.debris) {
    for (const k of ['x', 'y', 'z', 'vx', 'vy', 'vz', 'rot', 'vrot', 't']) assert.equal(typeof d[k], 'number', k);
    assert.ok(d.vx > 0, `vom Zerstörer weg: ${d.vx}`); assert.ok(d.vz > 0, 'fliegt hoch');
  }
  // Ohne Herkunft: Zufallsrichtung, aber Brocken entstehen trotzdem
  const j = cellIndex(w, 905, 305); setCell(w, j, 4, 0); hitWall(w, j, 500);
  assert.equal(w.debris.length, 6);
  for (const d of w.debris.slice(3)) assert.ok(Number.isFinite(d.vx) && Number.isFinite(d.vy));
  // Mauer daneben: Brocken bleiben draußen
  const wall = cellIndex(w, cx + 40, cy); setCell(w, wall, 4, 0);
  const x0 = s.x, y0 = s.y;
  for (let k = 0; k < Math.round(3 / DT); k++) {
    phys(w);
    // über der Mauer (z ≥ 12) dürfen sie hinwegfliegen, darunter nie darin stecken
    for (const d of w.debris) if (d.z < 12) assert.notEqual(w.terr[cellIndex(w, d.x, d.y)], 4, `nicht in der Mauer (z ${d.z})`);
  }
  assert.equal(s.hp, s.T.hp, 'kein Schaden'); assert.equal(s.x, x0); assert.equal(s.y, y0);
  assert.equal(w.debris.length, 6, 'liegen noch');
  for (const d of w.debris) { assert.equal(d.z, 0); assert.equal(d.vx, 0); assert.equal(d.vy, 0); assert.notEqual(w.terr[cellIndex(w, d.x, d.y)], 4); }
  run(w, 5.5);
  assert.equal(w.debris.length, 6, 'liegen noch nach 8.5 s'); assert.ok(w.debris.every(d => d.fade === 0));
  let faded = 0, t = 0;
  while (w.debris.length && t < 4) { faded = Math.max(faded, w.debris.filter(d => d.fade > 0).length); phys(w); t += DT; }
  assert.equal(w.debris.length, 0, 'verschwunden'); assert.ok(faded > 0, 'verblassen vor dem Entfernen');
});

test('Brocken: Deckel 400, die ältesten verschwinden zuerst', () => {
  const w = mkWorld();
  for (let k = 0; k < 150; k++) { const i = (40 + (k / 100 | 0)) * w.GW + 5 + k % 100; setCell(w, i, 4, 0); hitWall(w, i, 500, 0, 0); }
  assert.equal(w.debris.length, 450);
  const keep = w.debris.slice(50);
  stepDebris(w, DT);
  assert.equal(w.debris.length, DEBRIS_CAP); assert.equal(DEBRIS_CAP, 400);
  assert.equal(w.debris[0], keep[0]); assert.equal(w.debris[399], keep[399]);
});

test('sim.step bewegt Brocken', () => {
  const w = mkWorld(); const i = cellIndex(w, 505, 305); setCell(w, i, 4, 0);
  hitWall(w, i, 500, 400, 305);
  const d = w.debris[0], x = d.x, z = d.z;
  step(w, DT);
  assert.ok(d.x !== x && d.z !== z);
});

test('Leiche im Wasser: float → sink → weg, mit splash-Ereignis', () => {
  const w = mkWorld();
  area(w, 1, 10, 10, 50, 50);            // Wasser x/y 100–510
  const a = spawn(w, 'wolf', 300, 300, 'rot'), b = spawn(w, 'panzer', 200, 200, 'rot');
  hurt(w, a, 1e9, 'melee', null); hurt(w, b, 1e9, 'melee', null);
  const ca = w.corpses.find(c => c.type === 'wolf'), cb = w.corpses.find(c => c.type === 'panzer' && c.kind === 'body');
  w.events.length = 0;
  let t = 0;
  while (ca.state === 'fly' && t < 2) { phys(w); t += DT; }
  assert.equal(ca.state, 'float');
  const atA = () => w.events.filter(e => e.type === 'splash' && Math.hypot(e.x - ca.x, e.y - ca.y) < 1e-9).length;
  assert.equal(atA(), 1, 'splash beim Eintauchen');
  run(w, 1.9); assert.equal(ca.state, 'float');
  run(w, .2); assert.equal(ca.state, 'sink');
  assert.equal(atA(), 1, 'nur ein splash je Leiche');
  const wet = w.corpses.filter(c => c.state === 'float' || c.state === 'sink');
  assert.ok(wet.length >= 2);
  for (const c of wet) assert.equal(w.events.filter(e => e.type === 'splash' && e.x === c.x && e.y === c.y).length, 1, `${c.type}/${c.part} genau ein splash`);
  run(w, 2.7); assert.ok(w.corpses.includes(ca), 'sinkt noch');
  run(w, .3); assert.ok(!w.corpses.includes(ca), 'untergegangen und entfernt');
  run(w, .5);
  assert.ok(!w.corpses.includes(cb), 'auch schwere Leichen gehen unter');
  // Lebende, die ins Wasser geschleudert werden, spritzen ebenfalls
  const u = spawn(w, 'soldat', 300, 400, 'blau'); applyImpulse(u, 100, 0, 250);
  const before = w.events.length;
  t = 0; while (u.state === 'air' && t < 3) { phys(w); t += DT; }
  assert.ok(w.events.slice(before).some(e => e.type === 'splash'), 'Lebende spritzen');
  assert.equal(u.alive, true);
  // auf trockenem Boden kein splash
  const v = spawn(w, 'soldat', 900, 400, 'blau'); applyImpulse(v, 100, 0, 250);
  const b2 = w.events.length; t = 0; while (v.state === 'air' && t < 3) { phys(w); t += DT; }
  assert.ok(!w.events.slice(b2).some(e => e.type === 'splash'));
});

test('Leiche in Lava: ash → weg', () => {
  const w = mkWorld();
  area(w, 2, 60, 10, 90, 40);            // Lava x 600–910, y 100–410
  const u = spawn(w, 'wolf', 750, 250, 'rot');
  hurt(w, u, 1e9, 'fire', null);
  const c = w.corpses.find(k => k.kind === 'body');
  w.events.length = 0;
  let t = 0;
  while (c.state === 'fly' && t < 2) { phys(w); t += DT; }
  assert.equal(c.state, 'ash');
  const ev = w.events.find(e => e.type === 'terrain' && e.kind === 'ash');
  assert.ok(ev, 'Asche-Fleck');
  const gx = c.x / CELL | 0, gy = c.y / CELL | 0;
  assert.ok(ev.gx0 <= gx && ev.gx1 >= gx && ev.gy0 <= gy && ev.gy1 >= gy, 'mit Zellbereich');
  assert.ok(!w.events.some(e => e.type === 'splash'));
  run(w, 1.9); assert.ok(w.corpses.includes(c));
  run(w, .2); assert.ok(!w.corpses.includes(c), 'verbrannt und entfernt');
});

test('Determinismus: gleiche Saat, gleiche Abstürze und Brocken', () => {
  const sim = () => {
    const w = mkWorld(3);
    for (let k = 0; k < 6; k++) { const i = cellIndex(w, 400 + k * 10, 300); setCell(w, i, 4, 0); }
    spawn(w, 'heli', 420, 320, 'rot'); spawn(w, 'drache', 700, 300, 'rot');
    for (let k = 0; k < 8; k++) spawn(w, 'soldat', 410 + k * 6, 330, 'blau');
    rebuildHash(w);
    for (const u of w.units.filter(v => v.T.fly)) hurt(w, u, 1e9, 'bullet', null);
    for (let k = 0; k < 6; k++) hitWall(w, cellIndex(w, 400 + k * 10, 300), 500, 380, 300);
    run(w, 2);
    return JSON.stringify([w.corpses, w.debris, w.units.map(u => [u.x, u.y, u.hp])]);
  };
  assert.equal(sim(), sim());
});
