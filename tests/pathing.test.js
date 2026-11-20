import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, setCell, cellIndex, rebuildHash } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { hitWall } from '../game/js/combat.js';
import { createFlow, updateFlow, flowDir, flowDirTo, directBlocked, PATH_CELL, PATH_BLOCK_WALL, PATH_BLOCK_LAVA, PATH_REFRESH, PATH_MAX_PER_STEP } from '../game/js/pathing.js';
import { CELL } from '../game/js/data.js';

const W = 1400, H = 800, DT = 1 / 60;
const mk = (seed = 7) => { const w = createWorld(W, H, seed); w.teamMode = true; return w; };
// Senkrechte Mauer in Pixeln: x0..x1 (Breite), y0..y1
function wallRect(w, x0, x1, y0, y1, id = 4) {
  for (let y = y0; y < y1; y += CELL) for (let x = x0; x < x1; x += CELL) setCell(w, cellIndex(w, x, y), id, 0);
}
function ring(w, cx, cy, r0, r1) {
  for (let gy = 0; gy < w.GH; gy++) for (let gx = 0; gx < w.GW; gx++) {
    const d = Math.hypot(gx * CELL + 5 - cx, gy * CELL + 5 - cy);
    if (d >= r0 && d <= r1) setCell(w, gy * w.GW + gx, 4, 0);
  }
}
const run = (w, secs, each) => { for (let i = 0; i < secs * 60; i++) { step(w, DT); if (each) each(w); w.events.length = 0; } };
const wallHits = w => w.events.filter(e => e.type === 'wallHit').length;

/* ---------- Flussfeld direkt ---------- */

test('flowDir: Mauer mit Lücke unten, Richtung zeigt zur Lücke', () => {
  const w = mk();
  wallRect(w, 700, 720, 0, 640);                 // Lücke y 640..800
  spawn(w, 'krieger', 400, 200, 'blau'); spawn(w, 'krieger', 1000, 200, 'rot');
  rebuildHash(w);
  const fl = createFlow(w); updateFlow(w, fl, DT);
  const d = flowDir(fl, 'blau', 400, 200);
  assert.ok(d, 'erreichbar');
  assert.ok(d.dy > .5, `nach unten zur Lücke: ${d.dx} ${d.dy}`);
  // Weg ist länger als die Luftlinie (600 px), aber kein Ring
  assert.ok(d.dist > 700 && d.dist < 2000, `dist ${d.dist}`);
});

test('flowDir: geschlossener Ring ist unerreichbar (null)', () => {
  const w = mk();
  ring(w, 1000, 400, 150, 190);
  spawn(w, 'krieger', 300, 400, 'blau'); spawn(w, 'schuetze', 1000, 400, 'rot');
  rebuildHash(w);
  const fl = createFlow(w); updateFlow(w, fl, DT);
  assert.equal(flowDir(fl, 'blau', 300, 400), null);
  // innen ist der Gegner der Blauen erreichbar: die Roten innen haben keinen Weg nach draußen
  assert.equal(flowDir(fl, 'rot', 1000, 400), null);
});

test('flowDir: Fluss mit fernem Steg: kurzer Weg durch Wasser; naher Steg: über den Steg', () => {
  const w = mk();
  wallRect(w, 680, 740, 0, 800, 1);               // Fluss 60 px breit über die ganze Höhe
  wallRect(w, 680, 740, 700, 760, 0);              // Steg (frei) weit unten
  spawn(w, 'krieger', 600, 100, 'blau'); spawn(w, 'krieger', 820, 100, 'rot');
  rebuildHash(w);
  const fl = createFlow(w); updateFlow(w, fl, DT);
  const d = flowDir(fl, 'blau', 600, 100);
  assert.ok(d && d.dx > .7, `quer durchs Wasser: ${d && d.dx} ${d && d.dy}`);
  // Steg direkt neben dem Weg: der kleine Umweg ist billiger als 60 px Wasser (×2,5)
  const w2 = mk();
  wallRect(w2, 680, 740, 0, 800, 1);
  wallRect(w2, 680, 740, 140, 200, 0);
  spawn(w2, 'krieger', 600, 100, 'blau'); spawn(w2, 'krieger', 820, 100, 'rot');
  rebuildHash(w2);
  const fl2 = createFlow(w2); updateFlow(w2, fl2, DT);
  const d2 = flowDir(fl2, 'blau', 600, 100);
  assert.ok(d2 && d2.dy > .3, `zum Steg: ${d2 && d2.dx} ${d2 && d2.dy}`);
});

test('flowDir: Lava wird über die Lücke umgangen', () => {
  const w = mk();
  wallRect(w, 700, 780, 0, 340, 2); wallRect(w, 700, 780, 460, 800, 2);   // Lücke y 340..460
  spawn(w, 'krieger', 500, 120, 'blau'); spawn(w, 'krieger', 1000, 120, 'rot');
  rebuildHash(w);
  const fl = createFlow(w); updateFlow(w, fl, DT);
  const d = flowDir(fl, 'blau', 500, 120);
  assert.ok(d && d.dy > .4, `zur Lücke: ${d && d.dx} ${d && d.dy}`);
  assert.equal(directBlocked(w, fl, 500, 120, 1000, 120), PATH_BLOCK_LAVA, 'gerade Linie quert Lava');
  assert.equal(directBlocked(w, fl, 500, 400, 1000, 400), 0, 'durch die Lücke frei');
  // Mauer hinter der Lava zählt als Mauer (Umweg-Regel gilt dann)
  wallRect(w, 900, 920, 100, 140); updateFlow(w, fl, DT);
  assert.equal(directBlocked(w, fl, 500, 120, 1000, 120), PATH_BLOCK_WALL, 'Mauer schlägt Lava');
});

test('updateFlow: Puffer bleiben bei wiederholter Aktualisierung dieselben', () => {
  const w = mk();
  wallRect(w, 700, 720, 0, 640);
  spawn(w, 'krieger', 400, 200, 'blau'); spawn(w, 'krieger', 1000, 200, 'rot');
  rebuildHash(w);
  const fl = createFlow(w); updateFlow(w, fl, DT);
  const cost = fl.cost, fb = fl.fields.get('blau'), db = fb.dist, dr = fl.fields.get('rot').dist;
  const r0 = fl.stats.recomputes;
  for (let i = 0; i < 200; i++) updateFlow(w, fl, .05);   // 10 s: viele gestaffelte Neuberechnungen
  // 2 Fraktionen, je eine Auffrischung alle PATH_REFRESH s (Task 13: aus der Konstante statt fest 30 bei 0,5 s)
  const want = Math.floor(.75 * 2 * 10 / PATH_REFRESH);
  assert.ok(fl.stats.recomputes >= r0 + want, `neu berechnet: ${fl.stats.recomputes - r0} (erwartet ≥ ${want})`);
  assert.equal(fl.cost, cost); assert.equal(fl.fields.get('blau'), fb);
  assert.equal(fl.fields.get('blau').dist, db); assert.equal(fl.fields.get('rot').dist, dr);
  // Geländeänderung ohne Größenänderung: auch dann dieselben Puffer
  setCell(w, cellIndex(w, 705, 100), 0, 0); updateFlow(w, fl, DT);
  assert.equal(fl.cost, cost); assert.equal(fl.fields.get('blau').dist, db);
});

test('updateFlow: höchstens 2 Neuberechnungen je Schritt, verschwundene Fraktionen fallen weg', () => {
  const w = createWorld(W, H, 3); w.teamMode = false;
  const types = ['krieger', 'ritter', 'schuetze', 'wolf', 'baer', 'soldat', 'mg', 'reiter'];
  types.forEach((t, k) => spawn(w, t, 100 + k * 150, 400, 'blau'));
  rebuildHash(w);
  const fl = createFlow(w);
  updateFlow(w, fl, DT);
  assert.equal(fl.stats.recomputes, 2);
  for (let i = 0; i < 3; i++) updateFlow(w, fl, DT);
  assert.equal(fl.stats.recomputes, 8);
  for (const [, f] of fl.fields) assert.ok(f.ready);
  w.units[0].alive = false; rebuildHash(w); updateFlow(w, fl, DT);
  assert.equal(fl.fields.has('krieger'), false);
  assert.equal(fl.fields.size, 7); assert.equal(fl.list.length, 7);
});

test('Geländeänderung löst sofort eine Neuberechnung aus', () => {
  const w = mk();
  wallRect(w, 700, 720, 0, 640);
  spawn(w, 'krieger', 400, 200, 'blau'); spawn(w, 'krieger', 1000, 200, 'rot');
  rebuildHash(w);
  const fl = createFlow(w); updateFlow(w, fl, DT); updateFlow(w, fl, DT);
  const r0 = fl.stats.recomputes;
  updateFlow(w, fl, DT);
  assert.equal(fl.stats.recomputes, r0, 'ohne Änderung keine Neuberechnung vor 0,5 s');
  const before = flowDir(fl, 'blau', 400, 200).dy;
  // Loch oben in die Mauer brechen (per hitWall wie im Kampf)
  for (let y = 180; y < 240; y += CELL) for (let x = 700; x < 720; x += CELL) hitWall(w, cellIndex(w, x, y), 999, 690, y);
  updateFlow(w, fl, DT);
  assert.equal(fl.stats.recomputes, r0 + 2);
  const after = flowDir(fl, 'blau', 400, 200);
  assert.ok(before > .5 && Math.abs(after.dy) < .4 && after.dx > .9, `vorher ${before}, nachher ${after.dx} ${after.dy}`);
});

test('sim.step: Malen/setCell (terrainVersion) wird bemerkt', () => {
  const w = mk();
  spawn(w, 'krieger', 400, 200, 'blau'); spawn(w, 'krieger', 1000, 200, 'rot');
  step(w, DT); step(w, DT);
  const r0 = w.flow.stats.recomputes;
  step(w, DT);
  assert.equal(w.flow.stats.recomputes, r0);
  const v0 = w.terrainVersion;
  wallRect(w, 700, 720, 0, 640);
  assert.ok(w.terrainVersion > v0);
  step(w, DT);
  assert.equal(w.flow.stats.recomputes, r0 + 2);
});

/* ---------- Verhalten in der Simulation ---------- */

test('Mauer mit Lücke: Krieger gehen durch die Lücke und schlagen nicht ein', () => {
  const w = mk(11);
  wallRect(w, 700, 720, 0, 600);                   // Lücke y 600..800
  for (let k = 0; k < 6; k++) spawn(w, 'krieger', 420 + (k % 2) * 25, 140 + k * 22, 'blau');
  for (let k = 0; k < 6; k++) spawn(w, 'krieger', 980 + (k % 2) * 25, 140 + k * 22, 'rot');
  let hits = 0, crossed = false;
  run(w, 25, w => { hits += wallHits(w); for (const u of w.units) if (u.alive && u.team === 'blau' && u.x > 740) crossed = true; });
  assert.equal(hits, 0, 'keine Mauertreffer');
  const blauDead = w.units.filter(u => u.team === 'blau' && !u.alive).length, rotDead = w.units.filter(u => u.team === 'rot' && !u.alive).length;
  assert.ok(crossed || blauDead + rotDead > 0, 'sie haben sich gefunden');
  assert.ok(blauDead + rotDead >= 3, `Kampf: ${blauDead} + ${rotDead} tot`);
});

test('Geschlossener Ring: Krieger schlagen die Mauer ein', () => {
  const w = mk(12);
  ring(w, 1000, 400, 150, 190);
  for (let k = 0; k < 6; k++) spawn(w, 'krieger', 420, 300 + k * 30, 'blau');
  spawn(w, 'sani', 1000, 400, 'rot');             // harmlos, bleibt drin (heilt nur)
  spawn(w, 'krieger', 1000, 380, 'rot');           // Bodentruppe innen
  let hits = 0;
  run(w, 25, w => { hits += w.events.filter(e => e.type === 'wallHit' && e.fromX < 1000).length; });
  assert.ok(hits > 10, `Mauertreffer von außen: ${hits}`);
});

test('Lavastreifen mit Lücke: Bodentruppen nehmen die Lücke', () => {
  const w = mk(13);
  wallRect(w, 700, 780, 0, 330, 2); wallRect(w, 700, 780, 470, 800, 2);   // Lücke y 330..470
  for (let k = 0; k < 6; k++) spawn(w, 'krieger', 420 + (k % 2) * 25, 100 + k * 22, 'blau');
  for (let k = 0; k < 4; k++) spawn(w, 'wolf', 1050 + (k % 2) * 25, 100 + k * 22, 'rot');
  let lavaSteps = 0, unitSteps = 0;
  run(w, 20, w => {
    for (const u of w.units) if (u.alive && !u.T.fly) { unitSteps++; if (w.terr[cellIndex(w, u.x, u.y)] === 2) lavaSteps++; }
  });
  const dead = w.units.filter(u => !u.alive).length;
  assert.ok(dead >= 3, `Kampf fand statt: ${dead}`);
  assert.ok(lavaSteps / unitSteps < .01, `auf Lava: ${lavaSteps}/${unitSteps}`);
});

test('Fluss ohne Steg in der Nähe: Krieger waten durch das Wasser', () => {
  const w = mk(14);
  wallRect(w, 680, 740, 0, 800, 1); wallRect(w, 680, 740, 700, 760, 0);
  for (let k = 0; k < 4; k++) spawn(w, 'krieger', 560, 80 + k * 22, 'blau');
  for (let k = 0; k < 4; k++) spawn(w, 'krieger', 860, 80 + k * 22, 'rot');
  let wet = 0, low = 0;
  run(w, 8, w => { for (const u of w.units) if (u.alive) { if (w.terr[cellIndex(w, u.x, u.y)] === 1) wet++; if (u.y > 400) low++; } });
  assert.ok(wet > 0, 'durchs Wasser');
  assert.equal(low, 0, 'kein Umweg zum Steg');
});

test('Flieger ignorieren Mauern', () => {
  const w = mk(15);
  wallRect(w, 700, 720, 0, 800);                   // durchgehende Mauer
  const g = spawn(w, 'geist', 500, 400, 'blau');
  spawn(w, 'krieger', 1000, 400, 'rot');
  let hits = 0, maxDy = 0;
  run(w, 6, w => { hits += wallHits(w); if (g.alive) maxDy = Math.max(maxDy, Math.abs(g.y - 400)); });
  assert.ok(g.x > 720 || !g.alive, `Geist flog hinüber: ${g.x}`);
  assert.ok(maxDy < 40, `gerade Linie: ${maxDy}`);
  assert.equal(hits, 0);
});

test('Pathing ist deterministisch', () => {
  const build = () => {
    const w = mk(21); wallRect(w, 700, 720, 0, 600);
    for (let k = 0; k < 8; k++) spawn(w, 'krieger', 420 + (k % 2) * 25, 140 + k * 22, 'blau');
    for (let k = 0; k < 8; k++) spawn(w, 'wolf', 980 + (k % 2) * 25, 140 + k * 22, 'rot');
    run(w, 6); return w.units.map(u => `${u.x.toFixed(6)},${u.y.toFixed(6)},${u.hp}`).join(';');
  };
  assert.equal(build(), build());
});

test('PATH_CELL ist 20 (2×2 Geländezellen)', () => { assert.equal(PATH_CELL, 20); assert.equal(PATH_CELL, 2 * CELL); });

test('Fernkämpfer: Mauer jenseits des Wegs bis zur Reichweite stört nicht (kein Umweg)', () => {
  const w = mk(16);
  wallRect(w, 900, 920, 0, 600);                    // Mauer kurz vor dem Ziel, Lücke unten
  const s = spawn(w, 'schuetze', 500, 200, 'blau');  // Reichweite 210: steht bei x ≈ 760 in Reichweite
  const e = spawn(w, 'krieger', 980, 200, 'rot'); e.T = { ...e.T, speed: 0 };   // Ziel bleibt stehen
  let maxY = 0;
  run(w, 4, () => { if (s.alive) maxY = Math.max(maxY, s.y); });
  assert.ok(maxY < 230, `kein Umweg zur Lücke: ${maxY}`);
  assert.ok(s.x > 600, `ging geradeaus vor: ${s.x}`);
});

test('resizeWorld: Flussfeld passt sich der neuen Rastergröße an', async () => {
  const { resizeWorld } = await import('../game/js/world.js');
  const w = mk(17);
  wallRect(w, 700, 720, 0, 640);
  spawn(w, 'krieger', 400, 200, 'blau'); spawn(w, 'krieger', 1000, 200, 'rot');
  step(w, DT);
  const n0 = w.flow.N;
  resizeWorld(w, 1800, 900); step(w, DT);
  assert.ok(w.flow.N > n0);
  assert.equal(w.flow.fields.get('blau').dist.length, w.flow.N);
  const d = flowDir(w.flow, 'blau', 400, 200);
  assert.ok(d && d.dy > .5, 'weiter zur Lücke');
});

test('Dauernde Geländeänderung: jedes der 19 Felder wird in begrenzter Schrittzahl neu berechnet', () => {
  const w = mk(18);
  for (let k = 0; k < 19; k++) spawn(w, 'krieger', 60 + k * 70, 300 + (k % 3) * 60, 't' + k);
  rebuildHash(w);
  const fl = createFlow(w);
  for (let i = 0; i < 12; i++) updateFlow(w, fl, DT);
  const last = new Map(), maxGap = new Map();
  for (let i = 0; i < 120; i++) {
    setCell(w, cellIndex(w, 700, 100 + (i % 40) * 10), i % 2 ? 4 : 0, 0);   // jede Runde ändert sich das Gelände
    updateFlow(w, fl, DT);
    for (const [f, field] of fl.fields) {
      if (field.age === 0) { if (last.has(f)) maxGap.set(f, Math.max(maxGap.get(f) || 0, i - last.get(f))); last.set(f, i); }
    }
    if (i === 60) spawn(w, 'ritter', 700, 700, 'neu');
    if (i === 61) assert.ok(fl.fields.get('neu').ready, 'neue Fraktion sofort bereit');
  }
  assert.equal(fl.fields.size, 20);
  for (const [f] of fl.fields) {
    assert.ok(last.has(f), `${f} nie neu berechnet`);
    if (f !== 'neu') assert.ok((maxGap.get(f) || 0) <= 11, `${f}: Lücke ${maxGap.get(f)} Schritte`);
  }
});

test('Lava ohne Mauer: Wolf weit weg von der Lücke folgt dem Fluss, auch bei langem Umweg', () => {
  const w = mk(19);
  wallRect(w, 700, 780, 0, 330, 2); wallRect(w, 700, 780, 470, 800, 2);   // Lücke y 330..470
  const wolf = spawn(w, 'wolf', 670, 60, 'blau');
  const e = spawn(w, 'krieger', 830, 60, 'rot'); e.T = { ...e.T, speed: 0 };   // Ziel bleibt stehen
  let onLava = 0;
  run(w, 12, w => { if (wolf.alive && w.terr[cellIndex(w, wolf.x, wolf.y)] === 2) onLava++; });
  assert.ok(onLava <= 6, `auf Lava: ${onLava} Schritte`);
  assert.ok(!e.alive || e.hp < e.T.hp || Math.hypot(wolf.x - e.x, wolf.y - e.y) < 60, 'Wolf kam beim Ziel an');
});

test('flowDirTo: Schwarm in derselben groben Zelle teilt ein Feld, Budget je Schritt bleibt begrenzt (#61)', () => {
  const w = mk(23);
  wallRect(w, 700, 720, 0, 600);
  const bees = Array.from({ length: 20 }, (_, i) => spawn(w, 'biene', 902 + (i % 4) * 3, 202 + Math.floor(i / 4) * 2, 'rot'));
  const far = Array.from({ length: 10 }, (_, i) => spawn(w, 'biene', 850 + i * 40, 100 + i * 50, 'rot'));
  rebuildHash(w);
  const fl = createFlow(w);
  updateFlow(w, fl, DT);
  const r0 = fl.stats.recomputes;
  for (const b of bees) assert.ok(flowDirTo(w, fl, b, 400, 200));
  assert.equal(fl.stats.recomputes - r0, 1, 'alle 20 Bienen in einer Zelle teilen genau ein Flussfeld');
  for (const b of far) flowDirTo(w, fl, b, 400, 200);
  assert.ok(fl.stats.recomputes - r0 <= PATH_MAX_PER_STEP, `höchstens ${PATH_MAX_PER_STEP} Neuberechnungen je Schritt`);
});

