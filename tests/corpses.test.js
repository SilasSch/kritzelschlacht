import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, setCell, cellIndex, rebuildHash, resizeWorld, clearBattle } from '../game/js/world.js';
import { applyImpulse, integrate, collide, collideWalls, stepCorpses, CORPSE_CAP, PART_CAP, LAUNCH_VZ } from '../game/js/physics.js';
import { blast, hurt, PARTS } from '../game/js/combat.js';
import { step } from '../game/js/sim.js';

const DT = 1 / 60;
const mkWorld = () => { const w = createWorld(1400, 800, 5); w.teamMode = true; return w; };
// Ein Physikschritt in der Reihenfolge von sim.step (ohne KI und Geschosse), mit Leichen
const phys = (w, dt = DT) => {
  rebuildHash(w); integrate(w, dt); collide(w);
  for (const u of w.units) if (u.alive) collideWalls(w, u, dt);
  stepCorpses(w, dt);
};
const run = (w, s) => { for (let k = 0; k < Math.round(s / DT); k++) phys(w); };
const wallCol = (w, x, y0, y1) => { for (let y = y0; y <= y1; y += 10) setCell(w, cellIndex(w, x, y), 4, 0); };
const tough = u => { u.hp = 1e9; return u; };

test('Konstanten', () => {
  assert.equal(CORPSE_CAP, 1500); assert.equal(PART_CAP, 500); assert.equal(LAUNCH_VZ, 60);
  assert.deepEqual(PARTS.krieger, ['headgear', 'weapon']);
  assert.deepEqual(PARTS.ritter, ['headgear', 'shield']);
  assert.deepEqual(PARTS.panzer, ['turret']);
});

test('blast: Impuls I = dmg·9·falloff vom Zentrum weg, iz = 0.6·I', () => {
  const w = mkWorld();
  const u = tough(spawn(w, 'soldat', 520, 300, 'blau'));   // d = 20, R = 40 → falloff 0.75
  rebuildHash(w);
  blast(w, 500, 300, 40, 40, 'rot', null, 'blast', 0);
  const I = 40 * 9 * .75;
  assert.ok(Math.abs(u.vx - I) < 1e-9, `vx ${u.vx}`); assert.ok(Math.abs(u.vy) < 1e-9);
  assert.ok(Math.abs(u.vz - .6 * I) < 1e-9, `vz ${u.vz}`); assert.equal(u.state, 'air');
});

test('Explosion schleudert leichte Einheiten weiter als schwere', () => {
  const dist = type => {
    const w = mkWorld(); const u = tough(spawn(w, type, 520, 300, 'blau')); rebuildHash(w);
    blast(w, 500, 300, 40, 40, 'rot', null, 'blast', 0);
    run(w, 2);
    return u.x - 520;
  };
  const b = dist('biene'), r = dist('ritter'), p = dist('panzer');
  assert.ok(b > r && r > p && p >= 0, `biene ${b} ritter ${r} panzer ${p}`);
  assert.ok(r > 10, `ritter ${r}`);
  assert.ok(b < 400, `biene bleibt im Rahmen: ${b}`);
});

test('Geschleuderte Einheit landet betäubt (state stun)', () => {
  const w = mkWorld(); const u = tough(spawn(w, 'soldat', 520, 300, 'blau')); rebuildHash(w);
  blast(w, 500, 300, 40, 40, 'rot', null, 'blast', 0);
  assert.equal(u.state, 'air');
  let t = 0; while (u.state === 'air' && t < 3) { phys(w); t += DT; }
  assert.equal(u.state, 'stun'); assert.equal(u.z, 0); assert.ok(u.stunT >= .3);
});

test('Abhebeschwelle: senkrechter Anteil nur ab vz ≥ 60, sonst nur Schubs ohne Betäubung', () => {
  const w = mkWorld();
  const p = tough(spawn(w, 'panzer', 520, 300, 'blau'));    // Granate auf Panzer: iz/m ≪ 60
  rebuildHash(w);
  blast(w, 500, 300, 42, 20, 'rot', null, 'blast', 0);
  assert.equal(p.state, 'ok'); assert.equal(p.vz, 0); assert.ok(p.vx > 0);
  for (let k = 0; k < 30; k++) { phys(w); assert.equal(p.state, 'ok'); }
  // Soldat am Rand einer schwachen Explosion: 10·9·0.5 = 45 → iz/m = 27 < 60
  const w2 = mkWorld(); const s = tough(spawn(w2, 'soldat', 540, 300, 'blau')); rebuildHash(w2);
  blast(w2, 500, 300, 40, 10, 'rot', null, 'blast', 0);
  assert.equal(s.state, 'ok'); assert.equal(s.vz, 0); assert.ok(s.vx > 0);
  // Knapp über der Schwelle hebt er ab
  const w3 = mkWorld(); const s3 = tough(spawn(w3, 'soldat', 500, 300, 'blau')); rebuildHash(w3);
  blast(w3, 500, 300, 40, 12, 'rot', null, 'blast', 0);   // 12·9·1·0.6 = 64.8
  assert.equal(s3.state, 'air'); assert.ok(s3.vz >= LAUNCH_VZ);
});

test('Schnelle Körper am Boden tunneln nicht durch eine 1-Zellen-Mauer', () => {
  for (const sp of [600, 900, 1200, 1800, 2400]) for (const x0 of [300, 303, 306, 309]) {
    const w = mkWorld(); const u = spawn(w, 'soldat', x0, 300, 'blau');
    wallCol(w, 335, 250, 350);                    // Zelle x 330–340
    applyImpulse(u, sp, 0, 0);
    for (let k = 0; k < 60; k++) { phys(w); assert.ok(u.x < 330, `v ${sp} x0 ${x0}: x ${u.x}`); }
    assert.ok(u.x > 318, `v ${sp} x0 ${x0}: bleibt an der Mauer stehen (${u.x})`);
  }
});

test('Tote Einheit wird zur Leiche, die innerhalb von 3 s zur Ruhe kommt', () => {
  const w = mkWorld(); const u = spawn(w, 'krieger', 520, 300, 'blau'); u.hp = 1; rebuildHash(w);
  blast(w, 500, 300, 40, 40, 'rot', null, 'blast', 0);
  assert.equal(u.alive, false);
  assert.ok(w.events.some(e => e.type === 'death' && e.unitType === 'krieger'));
  const c = w.corpses.find(k => k.kind === 'body');
  assert.ok(c, 'Leiche angelegt');
  assert.equal(c.type, 'krieger'); assert.equal(c.team, 'blau'); assert.equal(c.state, 'fly');
  assert.ok(c.vx > 100 && c.vz > 100, `fliegt weg: ${c.vx} ${c.vz}`);
  assert.ok(Math.abs(c.vrot) >= 4 && Math.abs(c.vrot) <= 10, `vrot ${c.vrot}`);
  assert.equal(c.fade, 0);
  let maxZ = 0, t = 0;
  while (c.state === 'fly' && t < 3) { phys(w); maxZ = Math.max(maxZ, c.z); t += DT; }
  assert.equal(c.state, 'rest', `nach ${t} s`); assert.equal(c.z, 0);
  assert.ok(maxZ > 5, 'war in der Luft'); assert.ok(c.x > 540, `gerutscht bis ${c.x}`);
  assert.equal(c.vx, 0); assert.equal(c.vy, 0); assert.equal(c.vrot, 0);
  const x = c.x, rot = c.rot; run(w, 1); assert.equal(c.x, x); assert.equal(c.rot, rot);
});

test('In der Luft getötete Einheit fliegt als Leiche weiter (z, vz, Geschwindigkeit)', () => {
  const w = mkWorld(); const u = spawn(w, 'soldat', 300, 300, 'blau');
  applyImpulse(u, 200, 0, 300); for (let k = 0; k < 10; k++) phys(w);
  const { x, z, vx, vz } = u; assert.ok(z > 20);
  hurt(w, u, 1e9, 'bullet', null);
  const c = w.corpses.find(k => k.kind === 'body');
  assert.equal(c.x, x); assert.equal(c.z, z); assert.equal(c.vz, vz); assert.ok(Math.abs(c.vx - vx) < 1e-9);
  assert.equal(c.state, 'fly');
});

test('Tod ohne Explosion (Nahkampf): Leiche hüpft vom Mörder weg und kommt binnen 3 s zur Ruhe', () => {
  const w = mkWorld();
  const k = spawn(w, 'krieger', 280, 300, 'rot'), u = spawn(w, 'krieger', 300, 300, 'blau');
  hurt(w, u, 1e9, 'melee', k);
  const c = w.corpses.find(e => e.kind === 'body');
  assert.equal(c.state, 'fly');
  assert.ok(c.vz >= 140 && c.vz <= 200, `vz ${c.vz}`);
  assert.ok(c.vx >= 60 && c.vx <= 110 && Math.abs(c.vy) < 1e-9, `weg vom Mörder: ${c.vx} ${c.vy}`);
  assert.ok(Math.abs(c.vrot) >= 4 && Math.abs(c.vrot) <= 10);
  let maxZ = 0, t = 0;
  while (c.state === 'fly' && t < 3) { phys(w); maxZ = Math.max(maxZ, c.z); t += DT; }
  assert.ok(maxZ > 0, 'hebt ab'); assert.equal(c.state, 'rest', `nach ${t} s`); assert.equal(c.z, 0);
  assert.ok(c.x > 300);
  // ohne Mörder (Lava, Feuer): Zufallsrichtung, gleiche Beträge
  const w2 = mkWorld(); const v = spawn(w2, 'soldat', 500, 300, 'blau'); hurt(w2, v, 1e9, 'fire', null);
  const c2 = w2.corpses[0], h = Math.hypot(c2.vx, c2.vy);
  assert.ok(c2.vz >= 140 && c2.vz <= 200 && h >= 60 - 1e-9 && h <= 110 + 1e-9, `${c2.vz} ${h}`);
  // geschleudert getötet: kein zusätzlicher Hüpfer
  const w3 = mkWorld(); const s3 = spawn(w3, 'soldat', 520, 300, 'blau'); s3.hp = 1; rebuildHash(w3);
  blast(w3, 500, 300, 40, 40, 'rot', null, 'blast', 0);
  const c3 = w3.corpses.find(e => e.kind === 'body');
  assert.ok(Math.abs(c3.vz - .6 * 40 * 9 * .75) < 1e-9 && Math.abs(c3.vx - 40 * 9 * .75) < 1e-9);
});

test('Teile fliegen getrennt und kommen ebenfalls zur Ruhe', () => {
  for (const [type, parts] of [['krieger', ['headgear', 'weapon']], ['ritter', ['headgear', 'shield']], ['panzer', ['turret']]]) {
    const w = mkWorld(); const u = spawn(w, type, 600, 400, 'rot');
    hurt(w, u, 1e9, 'blast', null);
    const body = w.corpses.filter(c => c.kind === 'body'), ps = w.corpses.filter(c => c.kind === 'part');
    assert.equal(body.length, 1);
    assert.deepEqual(ps.map(c => c.part), parts);
    for (const p of ps) { assert.equal(p.type, type); assert.equal(p.team, 'rot'); assert.equal(p.state, 'fly'); assert.ok(p.vz > 0); }
    run(w, .4);
    for (const p of ps) assert.ok(Math.hypot(p.x - body[0].x, p.y - body[0].y) + p.z > 8, `${type}/${p.part} fliegt eigenständig`);
    run(w, 2.6);
    for (const c of w.corpses) { assert.notEqual(c.state, 'fly', `${type}/${c.part || 'body'} ruht`); assert.equal(c.z, 0); }
  }
});

test('Leichen sind kein Hindernis: Einheit läuft ohne Ablenkung durch', () => {
  const walk = withCorpses => {
    const w = mkWorld(); const u = spawn(w, 'krieger', 200, 300, 'blau');
    if (withCorpses) for (let k = 0; k < 20; k++) { const d = spawn(w, 'ritter', 240 + k * 8, 300 + (k % 3 - 1) * 4, 'rot'); hurt(w, d, 1e9, 'melee', null); }
    run(w, 3);
    assert.ok(w.corpses.every(c => c.state === 'rest'));
    const before = w.corpses.map(c => [c.x, c.y]);
    for (let k = 0; k < 180; k++) { u.mx = 52; u.my = 0; phys(w); }
    w.corpses.forEach((c, i) => { assert.equal(c.x, before[i][0]); assert.equal(c.y, before[i][1]); });
    return [u.x, u.y];
  };
  const [x0, y0] = walk(false), [x1, y1] = walk(true);
  assert.equal(x1, x0); assert.equal(y1, y0); assert.equal(y1, 300);
});

test('Leichen landen nicht in Mauern und bleiben in der Welt', () => {
  const w = mkWorld();
  wallCol(w, 335, 200, 400);
  const u = spawn(w, 'krieger', 310, 300, 'rot'); u.vx = 2000;   // rast gegen die Mauer
  const e = spawn(w, 'krieger', 1390, 30, 'rot'); e.vx = 900; e.vy = -900;
  hurt(w, u, 1e9, 'melee', null); hurt(w, e, 1e9, 'melee', null);
  for (let k = 0; k < 240; k++) {
    phys(w);
    for (const c of w.corpses) {
      assert.notEqual(w.terr[cellIndex(w, c.x, c.y)], 4, `in der Mauer: ${c.x}`);
      assert.ok(c.x >= 6 && c.x <= w.W - 6 && c.y >= 6 && c.y <= w.H - 6, `außerhalb: ${c.x} ${c.y}`);
    }
  }
  assert.ok(w.corpses.filter(c => c.type === 'krieger' && c.x < 335).length >= 1, 'Leiche bleibt vor der Mauer');
  // Mauer über einer liegenden Leiche: wird herausgeschoben
  const c = w.corpses[0]; setCell(w, cellIndex(w, c.x, c.y), 4, 0);
  phys(w);
  assert.notEqual(w.terr[cellIndex(w, c.x, c.y)], 4);
});

test('Leiche in Wasser treibt (auch schwere), in Lava wird sie zu Asche (Task 10: danach entfernt)', () => {
  const w = mkWorld();
  for (let gx = 0; gx < 30; gx++) for (let gy = 0; gy < 30; gy++) { setCell(w, gy * w.GW + gx, 1); setCell(w, gy * w.GW + gx + 60, 2); }
  const a = spawn(w, 'wolf', 150, 150, 'rot'), b = spawn(w, 'panzer', 150, 150, 'rot'), l = spawn(w, 'wolf', 750, 150, 'rot');
  for (const u of [a, b, l]) hurt(w, u, 1e9, 'melee', null);
  const ca = w.corpses.find(c => c.type === 'wolf' && c.x < 400), cb = w.corpses.find(c => c.type === 'panzer' && c.kind === 'body');
  const cl = w.corpses.find(c => c.type === 'wolf' && c.x > 400);
  run(w, 1.5);
  assert.equal(ca.state, 'float'); assert.equal(cb.state, 'float'); assert.equal(cl.state, 'ash');
  run(w, 3);
  assert.equal(ca.state, 'sink'); assert.equal(cb.state, 'sink'); assert.ok(!w.corpses.includes(cl), 'verbrannt und entfernt');
  run(w, 2);
  assert.ok(!w.corpses.includes(ca) && !w.corpses.includes(cb), 'gesunken und entfernt');
});

test('Deckel: bei 1.600 Leichen verblassen die ältesten 100 und verschwinden', () => {
  const w = mkWorld();
  for (let k = 0; k < 1600; k++) { const u = spawn(w, 'wolf', 20 + (k % 60) * 20, 20 + (k / 60 | 0) * 20, 'rot'); hurt(w, u, 1e9, 'melee', null); }
  assert.equal(w.corpses.length, 1600);
  const all = w.corpses.slice();
  stepCorpses(w, DT);
  assert.equal(w.corpses.length, 1600);
  for (let k = 0; k < 1600; k++) assert.equal(all[k].fade > 0, k < 100, `Leiche ${k} fade ${all[k].fade}`);
  assert.ok(all[0].fade <= 1 && all[0].fade > .9);
  for (let k = 0; k < 70; k++) stepCorpses(w, DT);
  assert.equal(w.corpses.length, 1500);
  assert.equal(w.corpses[0], all[100]);
  assert.ok(w.corpses.every(c => c.fade === 0));
  // weitere Tote: wieder genau so viele der ältesten verblassen
  for (let k = 0; k < 10; k++) hurt(w, spawn(w, 'wolf', 700, 400, 'rot'), 1e9, 'melee', null);
  stepCorpses(w, DT);
  assert.equal(w.corpses.filter(c => c.fade > 0).length, 10);
  assert.ok(w.corpses.slice(0, 10).every(c => c.fade > 0));
});

test('Teile haben einen eigenen Deckel: Körper erst ab 1.500, die ältesten Teile verblassen zuerst', () => {
  const w = mkWorld();
  // 600 Krieger: 600 Körper + 1.200 Teile. Körper bleiben alle, von den Teilen verblassen die ältesten 700
  for (let k = 0; k < 600; k++) hurt(w, spawn(w, 'krieger', 100 + (k % 40) * 30, 100 + (k / 40 | 0) * 30, 'rot'), 1e9, 'melee', null);
  assert.equal(w.corpses.length, 1800);
  const all = w.corpses.slice(), parts = all.filter(c => c.kind === 'part');
  stepCorpses(w, DT);
  assert.ok(all.filter(c => c.kind === 'body').every(c => c.fade === 0), 'kein Körper verblasst');
  assert.equal(parts.filter(c => c.fade > 0).length, 1200 - PART_CAP);
  assert.ok(parts.slice(0, 1200 - PART_CAP).every(c => c.fade > 0) && parts.slice(1200 - PART_CAP).every(c => c.fade === 0), 'die ältesten Teile');
  for (let k = 0; k < 70; k++) stepCorpses(w, DT);
  assert.equal(w.corpses.length, 600 + PART_CAP);
  // 1.000 weitere Körper ohne Teile (Wölfe): 1.600 Körper → die ältesten 100 Körper verblassen
  for (let k = 0; k < 1000; k++) hurt(w, spawn(w, 'wolf', 20 + (k % 60) * 20, 20 + (k / 60 | 0) * 20, 'rot'), 1e9, 'melee', null);
  const bodies = w.corpses.filter(c => c.kind === 'body');
  stepCorpses(w, DT);
  assert.equal(bodies.filter(c => c.fade > 0).length, 100);
  assert.ok(bodies.slice(0, 100).every(c => c.fade > 0));
  assert.ok(w.corpses.filter(c => c.kind === 'part').every(c => c.fade === 0));
});

test('sim.step bewegt Leichen', () => {
  const w = mkWorld(); const u = spawn(w, 'soldat', 300, 300, 'blau'); u.vx = 300;
  hurt(w, u, 1e9, 'melee', null);
  const c = w.corpses[0], x = c.x;
  step(w, DT);
  assert.ok(c.x > x);
});

test('clearBattle leert Leichen und Trümmer', () => {
  const w = mkWorld();
  const u = spawn(w, 'krieger', 300, 300, 'blau'); spawn(w, 'krieger', 400, 300, 'rot');
  hurt(w, u, 1e9, 'melee', null);
  w.proj.push({ kind: 'bullet' }); w.debris.push({ x: 1, y: 1 });
  const ev = w.events;
  assert.ok(w.corpses.length > 0 && w.events.length > 0);
  clearBattle(w);
  assert.equal(w.units.length, 0); assert.equal(w.proj.length, 0); assert.equal(w.corpses.length, 0);
  assert.equal(w.debris.length, 0); assert.equal(w.events.length, 0); assert.equal(w.events, ev);
  assert.equal(w.dead || 0, 0);
});

test('resizeWorld klemmt auch Leichen in die neue Welt', () => {
  const w = createWorld(1000, 600);
  const u = spawn(w, 'krieger', 990, 590, 'blau'); hurt(w, u, 1e9, 'melee', null);
  w.debris.push({ x: 995, y: 595, z: 0 });
  resizeWorld(w, 800, 500);
  for (const c of [...w.corpses, ...w.debris]) assert.ok(c.x >= 6 && c.x <= 794 && c.y >= 6 && c.y <= 494, `${c.x} ${c.y}`);
});

test('Determinismus: gleiche Saat, gleiche Leichen', () => {
  const sim = () => {
    const w = mkWorld();
    for (let k = 0; k < 10; k++) { const u = spawn(w, 'krieger', 480 + k * 4, 300 + k, 'blau'); u.hp = 1; }
    rebuildHash(w); blast(w, 500, 300, 40, 40, 'rot', null, 'blast', 0); run(w, 1);
    return JSON.stringify(w.corpses);
  };
  assert.equal(sim(), sim());
});
