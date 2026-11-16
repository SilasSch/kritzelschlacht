// Drachenfeuer (Spez. #21, Task 12a): Drachenatem zündet an, Brand macht Schaden über Zeit und springt
// in begrenztem Maß (abnehmende Chance, höchstens Generation 3) auf nahe Einheiten über, Wasser löscht.
// Dazu die Darstellung in fxcore: dichter Flammenstrahl, Flammen und Rauchfaden an brennenden Einheiten.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, setCell, cellIndex, rebuildHash } from '../game/js/world.js';
import { attack, think, ignite, BURN_T, BURN_DPS, BURN_MAX_GEN, SPREAD_DT, SPREAD_P, SPREAD_PAD } from '../game/js/combat.js';
import { step, placeCircle } from '../game/js/sim.js';
import { eventSound } from '../game/js/audio.js';
import { createRng } from '../game/js/rng.js';
import { createFxCore, look, GLOW_KINDS, WARM_KINDS, FRAME_LIMITS, FX_CAP, BURN_FX_UNITS } from '../game/js/render/fxcore.js';

const DT = 1 / 60;
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
const run = (w, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); if (each) each(w); w.events.length = 0; } };

/* ---------- Werte ---------- */
test('Brandwerte: 3 s, 8 Schaden/s, Generation ≤ 3, Sprung alle 0,25 s mit 0,35 · 0,5^gen im Radius r + r + 6', () => {
  assert.equal(BURN_T, 3); assert.equal(BURN_DPS, 8); assert.equal(BURN_MAX_GEN, 3);
  assert.equal(SPREAD_DT, .25); assert.equal(SPREAD_P, .35); assert.equal(SPREAD_PAD, 6);
});

/* ---------- ignite ---------- */
test('ignite: setzt burnT 3 und burnGen, meldet ignite; nie über Generation 3, nie auf eine höhere Generation', () => {
  const w = mkWorld(), k = spawn(w, 'krieger', 300, 300, 'blau');
  assert.equal(k.burnT, 0); assert.equal(k.burnGen, 0);
  assert.equal(ignite(w, k, 4, null), false); assert.equal(k.burnT, 0);
  assert.equal(ignite(w, k, 2, null), true);
  assert.equal(k.burnT, 3); assert.equal(k.burnGen, 2);
  const ev = w.events.filter(e => e.type === 'ignite');
  assert.equal(ev.length, 1); assert.equal(ev[0].x, 300); assert.equal(ev[0].y, 300);
  k.burnT = 1;
  assert.equal(ignite(w, k, 3, null), false, 'brennt schon mit niedrigerer Generation');
  assert.equal(k.burnT, 1); assert.equal(k.burnGen, 2);
  assert.equal(ignite(w, k, 2, null), true, 'gleiche Generation frischt auf'); assert.equal(k.burnT, 3);
  assert.equal(ignite(w, k, 0, null), true); assert.equal(k.burnGen, 0);
  assert.equal(w.events.filter(e => e.type === 'ignite').length, 1, 'ignite nur beim Anzünden, nicht beim Auffrischen');
});

test('ignite: Tote und Drachen (feuerfest) brennen nicht', () => {
  const w = mkWorld(), k = spawn(w, 'krieger', 300, 300, 'blau'), d = spawn(w, 'drache', 400, 300, 'blau');
  k.alive = false;
  assert.equal(ignite(w, k, 0, null), false); assert.equal(ignite(w, d, 0, null), false);
  assert.equal(d.burnT, 0);
});

/* ---------- Drachenatem ---------- */
test('Drachenatem zündet Getroffene mit Generation 0 an, Verursacher ist der Drache; außerhalb des Kegels nicht', () => {
  const w = mkWorld(), d = spawn(w, 'drache', 300, 300, 'rot');
  const a = spawn(w, 'krieger', 380, 300, 'blau'), b = spawn(w, 'biene', 360, 310, 'blau');
  const off = spawn(w, 'krieger', 300, 380, 'blau'), far = spawn(w, 'krieger', 600, 300, 'blau');
  rebuildHash(w);
  d.cd = 0; attack(w, d, a, 80, 80, 0);
  for (const v of [a, b]) { assert.equal(v.burnT, 3); assert.equal(v.burnGen, 0); assert.equal(v.burnSrc, d); }
  assert.equal(off.burnT, 0); assert.equal(far.burnT, 0);
  assert.equal(w.events.filter(e => e.type === 'ignite').length, 2);
  const shot = w.events.find(e => e.type === 'shot' && e.kind === 'breath');
  assert.ok(shot && Number.isFinite(shot.tx) && Number.isFinite(shot.ty), 'Zielpunkt für den Flammenstrahl');
});

/* ---------- Brand ---------- */
test('Brand: 8 Schaden/s über 3 s (24), danach aus; kein Dauer-Quetschen, auch mit Verursacher', () => {
  const w = mkWorld(), k = spawn(w, 'krieger', 300, 300, 'blau'), d = spawn(w, 'drache', 1200, 700, 'rot');
  rebuildHash(w);
  ignite(w, k, 0, d);
  let maxHit = 0;
  for (let t = 0; t < 3.5; t += DT) { think(w, k, DT); maxHit = Math.max(maxHit, k.hitT); }
  near(k.hp, 60 - 24, 1e-6);
  assert.equal(k.burnT, 0); assert.equal(k.burnGen, 0); assert.equal(k.burnSrc, null);
  assert.equal(maxHit, 0, 'Brand quetscht nicht');
});

test('Brand: Abschuss zählt für den Drachen, solange er lebt; ist er tot, für niemanden', () => {
  const w = mkWorld(), d = spawn(w, 'drache', 1200, 700, 'rot');
  const k = spawn(w, 'krieger', 300, 300, 'blau'); k.hp = 5; rebuildHash(w);
  ignite(w, k, 0, d);
  for (let t = 0; t < 1 && k.alive; t += DT) think(w, k, DT);
  assert.equal(k.alive, false); assert.equal(d.kills, 1);
  const death = w.events.find(e => e.type === 'death');
  assert.equal(death.killerId, d.id);
  const k2 = spawn(w, 'krieger', 300, 400, 'blau'); k2.hp = 5; rebuildHash(w);
  ignite(w, k2, 0, d); d.alive = false;
  for (let t = 0; t < 1 && k2.alive; t += DT) think(w, k2, DT);
  assert.equal(k2.alive, false); assert.equal(d.kills, 1);
  assert.equal(w.events.filter(e => e.type === 'death').pop().killerId, null);
});

test('Brand läuft auch bei betäubten Einheiten weiter (think entscheidet dann nichts)', () => {
  const w = mkWorld(), k = spawn(w, 'krieger', 300, 300, 'blau'); rebuildHash(w);
  ignite(w, k, 0, null); k.state = 'stun'; k.stunT = 10;
  think(w, k, .5);
  near(k.hp, 60 - 4, 1e-9);
});

/* ---------- Ausbreitung ---------- */
function swarm(seed) {
  const w = mkWorld(seed);
  // 60 Bienen in einem Kreis mit Radius 40 px, ohne Gegner (stehen still)
  placeCircle(w, 'biene', 60, 700 / 1400, .5, 40 / 800, 'blau');
  rebuildHash(w);
  let c = w.units[0];
  for (const u of w.units) if (Math.hypot(u.x - 700, u.y - 400) < Math.hypot(c.x - 700, c.y - 400)) c = u;
  ignite(w, c, 0, null);
  const seen = new Map();   // id → kleinste Generation
  const note = ww => { for (const u of ww.units) if (u.burnT > 0 && !(seen.get(u.id) <= u.burnGen)) seen.set(u.id, u.burnGen); };
  note(w);
  run(w, 5, note);
  return { w, seen };
}

test('Dichter Bienenschwarm (60 Bienen, Radius 40): Feuer erreicht weitere Bienen, höchstens Generation 3', () => {
  let total = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const { w, seen } = swarm(seed);
    const gens = [...seen.values()];
    assert.ok(seen.size >= 8, `seed ${seed}: nur ${seen.size} Bienen gefangen`);
    assert.ok(Math.max(...gens) <= BURN_MAX_GEN, `seed ${seed}: Generation ${Math.max(...gens)}`);
    assert.ok(gens.some(g => g >= 2), `seed ${seed}: Feuer springt mehrfach`);
    assert.ok(w.units.every(u => !u.alive || u.burnT === 0), 'nach 5 s ist alles aus');
    total += seen.size;
  }
  assert.ok(total / 5 < 60, 'nicht der ganze Schwarm in jedem Lauf');
});

test('Verteilte Reihe (Abstand 40 px): Feuer springt nicht über', () => {
  for (const seed of [1, 2, 3]) {
    const w = mkWorld(seed), line = [];
    for (let i = 0; i < 10; i++) line.push(spawn(w, 'krieger', 300, 200 + i * 40, 'blau'));
    rebuildHash(w);
    ignite(w, line[5], 0, null);
    const seen = new Set();
    run(w, 4, ww => { for (const u of ww.units) if (u.burnT > 0) seen.add(u.id); });
    assert.deepEqual([...seen], [line[5].id]);
    near(line[5].hp, 60 - 24, 1e-6);
  }
});

test('Ausbreitung: dichter Krieger-Block fängt Feuer; Flieger zünden nur Flieger, Boden nur Boden', () => {
  const w = mkWorld(3), block = [];
  for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) block.push(spawn(w, 'krieger', 300 + i * 17, 300 + j * 17, 'blau'));
  // Bienen direkt über dem Block, in der Luft: dürfen nicht vom Boden gezündet werden (und umgekehrt)
  const bees = [];
  for (let i = 0; i < 6; i++) bees.push(spawn(w, 'biene', 310 + i * 10, 330, 'blau'));
  rebuildHash(w);
  ignite(w, block[12], 0, null);
  const seen = new Set();
  run(w, 4, ww => { for (const u of ww.units) if (u.burnT > 0) seen.add(u); });
  assert.ok([...seen].filter(u => u.type === 'krieger').length >= 4, `Block: ${seen.size}`);
  assert.ok(bees.every(b => !seen.has(b)), 'keine Biene vom Boden gezündet');
  const w2 = mkWorld(3), b2 = [], k2 = [];
  for (let i = 0; i < 8; i++) b2.push(spawn(w2, 'biene', 300 + i * 8, 300, 'blau'));
  for (let i = 0; i < 8; i++) k2.push(spawn(w2, 'krieger', 300 + i * 8, 300, 'blau'));
  rebuildHash(w2);
  ignite(w2, b2[4], 0, null);
  const seen2 = new Set();
  run(w2, 2, ww => { for (const u of ww.units) if (u.burnT > 0) seen2.add(u); });
  assert.ok(seen2.size >= 2, 'Bienen zünden Bienen');
  assert.ok(k2.every(k => !seen2.has(k)), 'kein Krieger von einer Biene gezündet');
});

test('Ausbreitung trifft jede Fraktion (auch den Gegner des Verursachers)', () => {
  const w = mkWorld(4), red = [], blue = [];
  for (let i = 0; i < 6; i++) { red.push(spawn(w, 'krieger', 300 + i * 18, 300, 'rot')); blue.push(spawn(w, 'krieger', 300 + i * 18, 318, 'blau')); }
  for (const u of [...red, ...blue]) u.T = { ...u.T, speed: 0, range: 0, dmg: 0 };   // stehen still, kämpfen nicht
  rebuildHash(w);
  ignite(w, red[2], 0, null);
  const seen = new Set();
  run(w, 3, ww => { for (const u of ww.units) if (u.burnT > 0) seen.add(u); });
  assert.ok(blue.some(b => seen.has(b)), 'Feuer springt auf die andere Fraktion');
});

test('Ausbreitung: verbraucht world.rng() nur über die Würfe und ist reproduzierbar', () => {
  const a = swarm(11), b = swarm(11);
  assert.deepEqual([...a.seen.entries()], [...b.seen.entries()]);
  assert.deepEqual(a.w.units.map(u => [u.id, u.alive, u.hp]), b.w.units.map(u => [u.id, u.alive, u.hp]));
  const c = swarm(12);
  assert.notDeepEqual([...a.seen.entries()], [...c.seen.entries()], 'anderer Seed, anderes Feuer');
});

test('Ausbreitung: Prüfungen gestaffelt alle 0,25 s je brennender Einheit (nicht alle im selben Schritt)', () => {
  const w = mkWorld(5), us = [];
  for (let i = 0; i < 8; i++) us.push(spawn(w, 'krieger', 100 + i * 100, 300, 'blau'));
  rebuildHash(w);
  for (const u of us) ignite(w, u, 0, null);
  const first = us.map(u => u.burnCk);
  for (const c of first) assert.ok(c > 0 && c <= SPREAD_DT + 1e-9, `${c}`);
  assert.ok(new Set(first.map(c => c.toFixed(4))).size >= 4, 'gestaffelt nach id');
  // danach genau alle SPREAD_DT eine Prüfung (burnCk springt wieder hoch)
  const u = us[0], jumps = [];
  for (let i = 0; i < 90; i++) { const b = u.burnCk; think(w, u, DT); if (u.burnCk > b) jumps.push(i); }
  assert.ok(jumps.length >= 4, `${jumps}`);
  for (let i = 1; i < jumps.length; i++) near((jumps[i] - jumps[i - 1]) * DT, SPREAD_DT, DT + 1e-9);
});

/* ---------- Wasser ---------- */
test('Wasser löscht Bodentruppen sofort (extinguish), Flieger über Wasser brennen weiter', () => {
  const w = mkWorld(), k = spawn(w, 'krieger', 305, 305, 'blau'), b = spawn(w, 'biene', 505, 305, 'blau');
  rebuildHash(w);
  ignite(w, k, 0, null); ignite(w, b, 0, null);
  assert.equal(k.burnT, 3);
  // brennend ins Wasser
  setCell(w, cellIndex(w, 305, 305), 1); setCell(w, cellIndex(w, 505, 305), 1);
  step(w, DT);
  assert.equal(k.burnT, 0); assert.equal(k.burnGen, 0);
  assert.ok(w.events.some(e => e.type === 'extinguish' && Math.abs(e.x - k.x) < 2));
  assert.ok(b.burnT > 2.9, 'Biene brennt weiter');
  assert.equal(ignite(w, k, 0, null), false, 'im Wasser fängt man kein Feuer');
});

/* ---------- Darstellung (fxcore) ---------- */
const mkCore = opt => createFxCore({}, opt);
const kinds = core => core.store.countByKind();
const BREATH = { type: 'shot', kind: 'breath', x: 300, y: 280, z: 60, face: 1, nx: 1, ny: 0, tx: 390, ty: 300, tz: 0 };

test('Flammenstrahl: dichter Kegel aus additiv leuchtenden Flammen mit Funken, Hitzeflimmern und etwas Rauch', () => {
  const { store, consume, update } = mkCore();
  consume([BREATH]);
  const k = store.countByKind();
  assert.ok(k.jet >= 16, `jet ${k.jet}`);
  assert.ok(k.spark >= 3, `spark ${k.spark}`);
  assert.ok(k.haze >= 1, `haze ${k.haze}`);
  assert.equal(k.fire, undefined, 'keine 4 Punkte mehr');
  assert.ok(GLOW_KINDS.has('jet') && GLOW_KINDS.has('spark') && WARM_KINDS.has('jet'));
  const o = {};
  for (const p of store.live) {
    look(p, o);
    if (p.k === 'jet' || p.k === 'spark') { assert.ok(o.gAlpha > 0, `${p.k} glüht`); }
    if (p.k === 'jet') { assert.ok(o.wAlpha > 0 && o.wAlpha <= .25 + 1e-12, 'warmer Halo'); }
    if (p.k === 'haze') { assert.equal(o.gAlpha, 0); assert.ok(o.alpha > 0 && o.alpha < .2, 'Flimmern ist zart'); }
  }
  // Kegel: alle Flammen starten an der Mündung (in Flughöhe) und fliegen grob zum Ziel (390, 300)
  const sx = 300, sy = 280 - 60, ang = Math.atan2(300 - sy, 390 - sx);
  for (const p of store.live) if (p.k === 'jet') {
    near(p.x0, sx, 6); near(p.y0, sy, 6);
    let da = Math.atan2(p.vy, p.vx) - ang; da = Math.atan2(Math.sin(da), Math.cos(da));
    assert.ok(Math.abs(da) < .62, `Winkel ${da}`);
  }
  // nach 0,3 s ist der Strahl in die Länge gezogen: Flammen bis über die halbe Strecke zum Ziel
  for (let i = 0; i < 18; i++) update(DT, null);
  const L = Math.hypot(390 - sx, 300 - sy);
  const far = store.live.filter(p => p.k === 'jet' && Math.hypot(p.x - sx, p.y - sy) > L * .6).length;
  assert.ok(far >= 5, `weit: ${far}`);
});

test('Flammenstrahl: Bodenlicht am Ziel und mehrere Atemstöße hintereinander ergeben einen dichten Strom', () => {
  const { store, consume, update } = mkCore();
  for (let i = 0; i < 10; i++) { consume([BREATH]); for (let j = 0; j < 12; j++) update(DT, null); }
  const k = store.countByKind();
  assert.ok(k.jet >= 30, `Strom ${k.jet}`);
  assert.ok(k.light >= 1, 'Boden leuchtet am Ziel');
  const l = store.live.find(p => p.k === 'light');
  near(l.x, 390, 20); near(l.y, 300, 20);
});

test('Flammenstrahl gedeckelt: 500 Atemstöße in einem Bild → höchstens FRAME_LIMITS.jet, nie über FX_CAP', () => {
  const core = mkCore();
  const ev = []; for (let i = 0; i < 500; i++) ev.push(BREATH);
  core.consume(ev);
  assert.ok(FRAME_LIMITS.jet > 0 && FRAME_LIMITS.jet <= 32);
  assert.equal(core.stats().skipped.jet, 500 - FRAME_LIMITS.jet);
  assert.ok(core.store.count <= FX_CAP);
  for (let i = 0; i < 6; i++) core.consume(ev);
  assert.ok(core.store.count <= FX_CAP);
});

test('Brennende Einheiten: Flammen auf dem Körper und ein Rauchfaden, solange burnT > 0', () => {
  const core = mkCore({ rand: createRng(7) });   // fester Zufall: mit Math.random schlug die Flammenzahl ~1/12 fehl
  const w = mkWorld(), k = spawn(w, 'krieger', 300, 300, 'blau'), b = spawn(w, 'biene', 500, 300, 'blau');
  spawn(w, 'krieger', 700, 300, 'blau');   // brennt nicht
  ignite(w, k, 0, null); ignite(w, b, 1, null);
  for (let i = 0; i < 60; i++) core.update(DT, w);
  const k1 = kinds(core);
  assert.ok(k1.flame >= 8, `flame ${k1.flame}`);
  assert.ok(k1.wisp >= 2, `wisp ${k1.wisp}`);
  assert.equal(core.stats().burning, 2);
  const o = {};
  for (const p of core.store.live) {
    look(p, o);
    if (p.k === 'flame') {
      assert.ok(o.gAlpha > 0, 'Flamme glüht');
      // auf dem Körper: nahe einer der brennenden Einheiten (Bildschirm y − z)
      const onK = Math.abs(p.x0 - k.x) <= k.T.r && Math.abs(p.y0 - (k.y - k.z)) <= k.T.r * 1.6;
      const onB = Math.abs(p.x0 - b.x) <= b.T.r * 1.5 && Math.abs(p.y0 - (b.y - b.z)) <= b.T.r * 2.5;
      assert.ok(onK || onB, `Flamme bei ${p.x0},${p.y0}`);
      assert.ok(p.vy < 0, 'Flammen steigen');
    }
    if (p.k === 'wisp') { assert.equal(o.gAlpha, 0, 'Rauch glüht nicht'); assert.ok(o.alpha >= 0); }
  }
  // gelöscht: keine neuen Flammen
  k.burnT = 0; b.burnT = 0;
  for (let i = 0; i < 90; i++) core.update(DT, w);
  assert.equal(kinds(core).flame, undefined);
  assert.equal(core.stats().burning, 0);
});

test('Brennende Einheiten gedeckelt: höchstens BURN_FX_UNITS je Bild, Partikel nie über FX_CAP', () => {
  const core = mkCore();
  const w = mkWorld();
  for (let i = 0; i < 2000; i++) { const u = spawn(w, 'krieger', 10 + (i % 100) * 13, 10 + (i / 100 | 0) * 13, 'blau'); u.burnT = 3; }
  for (let i = 0; i < 120; i++) core.update(DT, w);
  assert.ok(core.stats().burning <= BURN_FX_UNITS, `${core.stats().burning}`);
  assert.ok(core.store.count <= FX_CAP);
  // Laufzeit misst tools/bench.mjs (fx core ms), nicht dieser Test
  for (let i = 0; i < 60; i++) core.update(DT, w);
  assert.ok(core.store.count <= FX_CAP);
});

test('Leiche in Lava (terrain ash): Asche-Fleck, Dampfwölkchen und Zischen (Spez. #17)', () => {
  const core = mkCore();
  core.consume([{ type: 'terrain', kind: 'ash', x: 300, y: 300, gx0: 29, gy0: 29, gx1: 31, gy1: 31 }]);
  assert.ok(kinds(core).wisp >= 2, 'Dampf');
  assert.equal(eventSound({ type: 'terrain', kind: 'ash' }), 'splash');
  assert.equal(eventSound({ type: 'terrain', gx0: 0, gy0: 0, gx1: 1, gy1: 1 }), null);
  // echte Leiche: fällt in Lava, settle meldet ash
  const w = createWorld(400, 300, 3); w.teamMode = true;
  for (let gy = 10; gy < 20; gy++) for (let gx = 10; gx < 20; gx++) setCell(w, gy * w.GW + gx, 2, 0);
  const u = spawn(w, 'krieger', 150, 150, 'blau'); rebuildHash(w); u.hp = 1;
  w.events.length = 0;
  for (let k = 0; k < 120 && !w.events.some(e => e.type === 'terrain' && e.kind === 'ash'); k++) step(w, DT);
  assert.ok(w.events.some(e => e.type === 'terrain' && e.kind === 'ash'), 'ash-Ereignis');
});

test('ignite: kleiner Flammenstoß; extinguish: Dampfwölkchen; beide gedeckelt', () => {
  const core = mkCore();
  core.consume([{ type: 'ignite', x: 100, y: 100, z: 0 }, { type: 'extinguish', x: 200, y: 200 }]);
  const k = kinds(core);
  assert.ok(k.flame >= 2, 'Flammenstoß'); assert.ok(k.wisp >= 2, 'Dampf');
  const ev = []; for (let i = 0; i < 400; i++) ev.push({ type: 'ignite', x: i, y: 0 });
  core.consume(ev);
  assert.ok((core.stats().skipped.ignite || 0) > 0);
});
