// Lava (Nachtrag 5, #42): niemand läuft freiwillig in Lava, auch nicht auf der Flucht, beim Stürmen oder im Block.
// Wer hineingerät (geschleudert, geschoben), läuft auf kürzestem Weg hinaus, vor allem anderen (physics.lavaGuard,
// physics.lavaEscape in integrate; das Flussfeld führt nicht durch Lava, pathing.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, cellIndex } from '../game/js/world.js';
import { step, tRect } from '../game/js/sim.js';
import { applyImpulse, integrate, lavaGuard, lavaEscape } from '../game/js/physics.js';
import { MORALE } from '../game/js/morale.js';
import { TERRAIN } from '../game/js/data.js';

const DT = 1 / 60, LAVA = TERRAIN.lava.id;
const mk = (seed = 5) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
const inLava = (w, u) => w.terr[cellIndex(w, u.x, u.y)] === LAVA;
const run = (w, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); w.events.length = 0; if (each) each(t + DT); } };

test('lavaGuard: kein Schritt in Lava, an der Kante entlang gleiten', () => {
  const w = mk();
  tRect(w, 'lava', 300 / 1400, 0, 340 / 1400, 1);   // senkrechter Streifen x 300..349
  const u = spawn(w, 'krieger', 294, 400, 'blau');
  assert.equal(lavaGuard(w, u, 50, 0), true, 'geradeaus hinein: gesperrt');
  assert.equal(lavaGuard(w, u, 50, 30), true);
  u.mx = 50; u.my = 30; integrate(w, DT);
  assert.ok(Math.abs(u.x - 294) < 1e-9 && u.y > 400, `gleitet nur in y: ${u.x}, ${u.y}`);
  assert.equal(lavaGuard(w, u, -50, 0), false, 'weg von der Lava: frei');
  const v = spawn(w, 'krieger', 320, 400, 'blau');
  assert.equal(lavaEscape(w, v), true);
  assert.ok(Math.abs(v.x - 320) < 30, 'Ziel nah');
});

test('10 fliehende Krieger laufen nicht in einen Lavastreifen', () => {
  const w = mk();
  tRect(w, 'lava', 200 / 1400, 0, 250 / 1400, 1);   // Lava links, dahinter die eigenen Leute
  // MIN_ALLIES betäubte Verbündete hinter der Lava: Fluchtrichtung und Schwerpunkt zeigen beide in die Lava
  for (let k = 0; k < MORALE.MIN_ALLIES; k++) { const a = spawn(w, 'krieger', 80, 300 + k * 30, 'blau'); a.state = 'stun'; a.stunT = 1e9; a.hp = 1e9; }
  const K = [];
  for (let k = 0; k < 10; k++) { const u = spawn(w, 'krieger', 330 + (k % 2) * 20, 300 + k * 20, 'blau'); u.hp = 10; K.push(u); }
  // Verfolger von rechts, die nie zuschlagen
  for (let k = 0; k < 4; k++) { const e = spawn(w, 'krieger', 420, 320 + k * 40, 'rot'); e.hp = 1e9; e.cd = 1e9; }
  let entered = 0, fled = 0;
  run(w, 6, () => { for (const u of K) { if (u.flee) fled++; if (u.alive && inLava(w, u)) entered++; } });
  assert.ok(fled > 0, 'sie fliehen');
  assert.equal(entered, 0, 'keiner betritt die Lava');
});

test('in Lava geschleudert: nach der Landung in etwa 1 s wieder draußen, vor Ziel und Schreck', () => {
  const w = mk();
  tRect(w, 'lava', 400 / 1400, 0, 600 / 1400, 1);   // breites Lavafeld x 400..609
  const u = spawn(w, 'krieger', 380, 400, 'blau');
  // Ziel hinter der Lava: Wunschbewegung zeigt hinein; Schreck soll auch nicht weiter hinein treiben
  const e = spawn(w, 'krieger', 700, 400, 'rot'); e.hp = 1e9; e.cd = 1e9; e.state = 'stun'; e.stunT = 1e9;
  applyImpulse(u, 120, 0, 200);   // fliegt etwa 40 px weit in die Lava
  let landed = -1, out = -1, t0 = 0;
  for (let t = 0; t < 4 && out < 0; t += DT) {
    step(w, DT); w.events.length = 0;
    if (landed < 0 && u.state === 'ok' && inLava(w, u)) { landed = t; u.fearT = 2; t0 = t; }
    if (landed >= 0 && !inLava(w, u)) out = t;
  }
  assert.ok(landed >= 0, 'landet in der Lava');
  assert.ok(out >= 0 && out - t0 <= 1.1, `draußen nach ${(out - t0).toFixed(2)} s`);
  assert.ok(u.x < 400, 'auf der nahen Seite hinaus');
  assert.ok(u.alive);
});

test('Römerblock marschiert an der Lavakante entlang und verliert niemanden an die Lava', () => {
  const w = mk(9);
  tRect(w, 'lava', 0, 430 / 800, 1, 520 / 800);   // waagrechter Streifen unter dem Block
  const R = [];
  for (let j = 0; j < 3; j++) for (let i = 0; i < 4; i++) R.push(spawn(w, 'roemer', 300 + i * 24, 372 + j * 24, 'blau'));
  // Gegner rechts vorn direkt an der Kante: der Block zieht an der Lava entlang, leicht auf sie zu
  for (let k = 0; k < 6; k++) spawn(w, 'krieger', 1100 + (k % 3) * 20, 412 + (k >> 1 & 1) * 6, 'rot');
  let entered = 0, inForm = 0;
  run(w, 10, () => { for (const u of R) { if (u.alive && inLava(w, u)) entered++; if (u.formOn) inForm++; } });
  assert.ok(inForm > 0, 'marschiert als Block');
  assert.equal(entered, 0, 'kein Römer in der Lava');
});
