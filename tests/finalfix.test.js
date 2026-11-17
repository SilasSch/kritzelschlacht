// Funde der Abschlussprüfung (Fähigkeiten und neue Einheiten): je ein Test pro Fund.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, rebuildHash, setCell } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { ignite } from '../game/js/combat.js';
import { curseFrog, scare, ROAR, CHEST_BEAT } from '../game/js/abilities.js';
import { TERRAIN, CELL } from '../game/js/data.js';

const DT = 1 / 60;
const mkWorld = (seed = 7) => { const w = createWorld(800, 600, seed); w.teamMode = true; return w; };

test('Fund 1: ein Froschfluch, der mitten im Schritt endet, gibt dem Sanitäter keine NaN-Wunde', () => {
  for (let trial = 0; trial < 12; trial++) {
    const w = mkWorld(1 + trial);
    const s = spawn(w, 'sani', 400, 300, 'blau');
    for (let k = 0; k < 4; k++) spawn(w, 'sani', 100, 100 + k * 20, 'blau');
    const e = spawn(w, 'krieger', 412 + trial * .2, 300, 'rot'); e.cd = 99; e.abCd = 99;
    rebuildHash(w);
    curseFrog(w, s, DT * (1 + (trial % 3)));
    s.cd = 0;
    for (let i = 0; i < 10; i++) { step(w, DT); e.cd = 99; }
    assert.equal(s.type, 'sani');
    assert.ok(Number.isFinite(e.hp), `Krieger-LP endlich (Versuch ${trial})`);
    for (const u of w.units) assert.ok(Number.isFinite(u.hp), 'keine NaN-LP');
  }
});

test('Fund 2: ein Phönix, der an Gift zu Asche wird, handelt in diesem Schritt nicht mehr', () => {
  const w = mkWorld(5);
  const p = spawn(w, 'phoenix', 400, 300, 'blau');
  const e = spawn(w, 'krieger', 405, 300, 'rot'); e.cd = 1e9; e.hp = 1e9; e.abCd = 99;
  rebuildHash(w);
  p.cd = 0; p.hp = .001; p.poisonT = 5;
  step(w, DT);
  assert.ok(p.ashT > 0, 'Phönix ist zu Asche geworden');
  assert.equal(e.hp, 1e9, 'Asche schlägt nicht zu');
  assert.ok(p.cd <= 0, 'Asche löst keinen Angriff aus');
});

test('Fund 3: eine Fähigkeit trifft keine Asche (das Ziel wird vor stepAbility verworfen)', () => {
  const w = mkWorld(6);
  const c = spawn(w, 'krokodil', 400, 300, 'blau'); c.abCd = 0; c.cd = 1e9;
  const a = spawn(w, 'krieger', 410, 300, 'rot'); a.hp = 50; a.ashT = 1; a.cd = 1e9;
  rebuildHash(w);
  c.tg = a; c.rt = 5;
  step(w, DT);
  assert.equal(a.hp, 50, 'Biss der Fähigkeit trifft die Asche nicht');
  assert.equal(c.seenT <= 0, true, 'kein Packen (seenT bliebe sonst gesetzt)');
  assert.equal(a.state, 'ok');
});

test('Fund 4: ein versteckt verfluchtes Krokodil ist als Frosch nicht unsichtbar', () => {
  const w = mkWorld(3);
  for (let gy = 0; gy < w.GH; gy++) for (let gx = 0; gx < w.GW; gx++) if (gx * CELL < 300) setCell(w, gy * w.GW + gx, TERRAIN.wasser.id);
  const c = spawn(w, 'krokodil', 290, 300, 'rot');
  for (let k = 0; k < 4; k++) spawn(w, 'krieger', 100, 100 + k * 20, 'rot');
  const s = spawn(w, 'schuetze', 700, 300, 'blau'); s.cd = 99;
  rebuildHash(w); step(w, DT);
  assert.equal(c.hidden, true, 'Aufbau: Krokodil ist im Wasser versteckt');
  curseFrog(w, c, 5);
  assert.equal(c.hidden, false, 'Frosch ist nicht versteckt');
  c.x = 500;
  for (let i = 0; i < 30; i++) step(w, DT);
  assert.equal(c.type, 'frosch');
  assert.equal(c.hidden, false, 'Frosch außerhalb des Wassers bleibt sichtbar');
});

test('Fund 5: Schreck trifft weder Frosch noch Asche, und beide zählen nicht für Brüllen und Brustklopfen', () => {
  // scare selbst: ein Frosch läuft vor updateMorale zurück, sein Schreck würde eingefroren und später übernommen
  {
    const w = mkWorld(8);
    const k = spawn(w, 'krieger', 400, 300, 'rot'), g = spawn(w, 'krieger', 420, 300, 'rot');
    rebuildHash(w);
    curseFrog(w, k, 5); g.ashT = 1;
    scare(w, k, 3); scare(w, g, 3);
    assert.equal(k.fearT, 0, 'Frosch erschrickt nicht');
    assert.equal(g.fearT, 0, 'Asche erschrickt nicht');
  }
  // Bär: ein echter Feind plus Frosch plus Asche sind nur 1 < MIN Opfer, kein Brüllen
  {
    const w = mkWorld(9);
    const b = spawn(w, 'baer', 400, 300, 'blau'); b.abCd = 0; b.cd = 1e9;
    const real = spawn(w, 'krieger', 420, 300, 'rot'), fr = spawn(w, 'krieger', 400, 330, 'rot'), as = spawn(w, 'krieger', 380, 300, 'rot');
    for (const e of [real, fr, as]) { e.cd = 1e9; e.hp = 1e9; }
    rebuildHash(w);
    curseFrog(w, fr, 50); as.ashT = 5;
    assert.ok(ROAR.MIN >= 2);
    step(w, DT);
    assert.equal(real.fearT, 0, 'Brüllen löst nicht aus');
    assert.equal(b.abOn, false);
  }
  // Gorilla: ohne echtes Opfer (nur Frosch und Asche mit weniger LP) kein Brustklopfen: Wiederholung nach RETRY, nicht CD
  {
    const w = mkWorld(10);
    const g = spawn(w, 'gorilla', 400, 300, 'blau'); g.cd = 1e9;
    const fr = spawn(w, 'krieger', 420, 300, 'rot'), as = spawn(w, 'krieger', 380, 300, 'rot');
    for (const e of [fr, as]) { e.cd = 1e9; e.hp = 5; }
    rebuildHash(w);
    curseFrog(w, fr, 50); as.ashT = 5;
    step(w, DT);
    assert.ok(g.beatCd < CHEST_BEAT.CD / 2, 'kein Brustklopfen: beatCd bleibt bei RETRY');
    assert.equal(fr.fearT, 0); assert.equal(as.fearT, 0);
  }
});
