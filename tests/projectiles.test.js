import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, setCell, cellIndex, rebuildHash } from '../game/js/world.js';
import { PROJECTILES, fire, stepProjectiles, blast, raycast, hasLineOfFire, think } from '../game/js/combat.js';
import { integrate, collide, collideWalls } from '../game/js/physics.js';

const DT = 1 / 60;
const mkWorld = () => { const w = createWorld(1400, 800, 7); w.teamMode = true; return w; };
const flyAll = (w, max = 240) => { for (let k = 0; k < max && w.proj.length; k++) stepProjectiles(w, DT); };
const full = u => u.hp === u.T.hp;
const wallCol = (w, x, y0, y1) => { for (let y = y0; y <= y1; y += 10) setCell(w, cellIndex(w, x, y), 4); };
// Nur die genannten Einheiten denken; alle bewegen sich physikalisch (wie sim.step)
const stepOnly = (w, thinkers, dt = DT) => {
  rebuildHash(w);
  for (const u of thinkers) if (u.alive) think(w, u, dt);
  integrate(w, dt); collide(w);
  for (const u of w.units) if (u.alive) collideWalls(w, u, dt);
  stepProjectiles(w, dt);
};

test('PROJECTILES: Bögen und gerade Schüsse mit Tempo', () => {
  assert.deepEqual(PROJECTILES, {
    arrow: { arc: true, speed: 520 }, bomb: { arc: true, speed: 450 }, mortar: { arc: true, speed: 500 },
    shell: { arc: true, speed: 850 }, bullet: { arc: false, speed: 1100 }, rocket: { arc: false, speed: 520 },
    fire: { arc: false, speed: 330 },
  });
});

test('Pfeil fliegt über einen Verbündeten hinweg und trifft das Ziel', () => {
  const w = mkWorld();
  const s = spawn(w, 'schuetze', 300, 300, 'blau');
  const ally = spawn(w, 'krieger', 375, 300, 'blau');
  const t = spawn(w, 'krieger', 450, 300, 'rot');
  rebuildHash(w);
  fire(w, s, t, 'arrow');
  const p = w.proj[0];
  assert.ok(p.h > 0, 'Bogen hat Höhe');
  let maxZ = 0;
  for (let k = 0; k < 240 && w.proj.length; k++) { stepProjectiles(w, DT); if (w.proj.length) maxZ = Math.max(maxZ, w.proj[0].z); }
  assert.ok(maxZ > 15, `Pfeil steigt (z ${maxZ})`);
  assert.ok(full(ally), 'Verbündeter unversehrt');
  assert.ok(t.hp < t.T.hp, 'Ziel getroffen');
});

test('Kugel trifft den ersten Körper im Weg – auch einen Verbündeten', () => {
  const w = mkWorld();
  const s = spawn(w, 'soldat', 300, 300, 'blau');
  const t = spawn(w, 'krieger', 500, 300, 'rot');
  rebuildHash(w);
  fire(w, s, t, 'bullet');
  // Der Verbündete läuft nach dem Schuss in die Bahn
  const ally = spawn(w, 'krieger', 400, 300, 'blau'); rebuildHash(w);
  flyAll(w);
  assert.ok(ally.hp < ally.T.hp, 'Verbündeter getroffen');
  assert.ok(full(t), 'Ziel dahinter verschont');
  assert.equal(w.proj.length, 0);
  assert.ok(w.events.some(e => e.type === 'hit' && e.kind === 'bullet'));
});

test('raycast: erster Körper, erste Mauerzelle, ignore', () => {
  const w = mkWorld();
  const a = spawn(w, 'krieger', 400, 300, 'blau');
  const b = spawn(w, 'krieger', 450, 300, 'rot');
  rebuildHash(w);
  let r = raycast(w, 300, 300, 600, 300, 6, new Set());
  assert.equal(r.unit, a); assert.equal(r.cell, -1);
  assert.ok(Math.abs(r.t - (400 - 9 - 300) / 300) < 1e-6, `t ${r.t}`);
  r = raycast(w, 300, 300, 600, 300, 6, new Set([a]));
  assert.equal(r.unit, b);
  r = raycast(w, 300, 300, 600, 300, 60, new Set());
  assert.equal(r.unit, null, 'hoch über den Köpfen');
  assert.equal(r.t, 1);
  wallCol(w, 352, 250, 350);
  r = raycast(w, 300, 300, 600, 300, 6, new Set());
  assert.equal(r.unit, null); assert.equal(r.cell, cellIndex(w, 352, 300));
  assert.ok(Math.abs(r.t - 50 / 300) < 1e-6, `t ${r.t}`);
  r = raycast(w, 300, 300, 600, 300, 14, new Set());
  assert.equal(r.cell, -1, 'über die Mauer'); assert.equal(r.unit, a);
});

test('hasLineOfFire: falsch nur, wenn der erste Treffer zur eigenen Fraktion gehört', () => {
  const w = mkWorld();
  const s = spawn(w, 'soldat', 300, 300, 'blau');
  const t = spawn(w, 'krieger', 450, 300, 'rot');
  rebuildHash(w);
  assert.equal(hasLineOfFire(w, s, t), true);
  const e2 = spawn(w, 'krieger', 380, 300, 'rot'); rebuildHash(w);
  assert.equal(hasLineOfFire(w, s, t), true, 'anderer Gegner im Weg ist ok');
  e2.alive = false;
  spawn(w, 'krieger', 380, 300, 'blau'); rebuildHash(w);
  assert.equal(hasLineOfFire(w, s, t), false);
});

test('Soldat hinter eigener Reihe feuert nicht und bewegt sich seitlich', () => {
  const w = mkWorld();
  const s = spawn(w, 'soldat', 300, 300, 'blau'); s.cd = 0;
  const ally = spawn(w, 'krieger', 350, 300, 'blau');
  const t = spawn(w, 'krieger', 460, 300, 'rot');
  rebuildHash(w);
  think(w, s, DT);
  assert.equal(w.proj.length, 0, 'kein Schuss');
  assert.ok(Math.abs(s.my) > 0 && Math.abs(s.mx) < 1e-9, `seitlich: mx ${s.mx} my ${s.my}`);
  const side = s.id % 2 ? 1 : -1;
  assert.ok(Math.abs(Math.abs(s.my) - s.T.speed * .7) < 1e-9, 'Tempo ×0.7');
  assert.equal(Math.sign(s.my), side, 'Seite über id % 2');
  assert.ok(s.blockedT > 0);
  // Nach einigen Schritten seitlich frei: er schießt, der Verbündete bleibt heil
  for (let k = 0; k < 180; k++) stepOnly(w, [s]);
  assert.ok(Math.abs(s.y - 300) > 12, `ausgewichen (y ${s.y})`);
  assert.ok(t.hp < t.T.hp, 'Ziel getroffen');
  assert.ok(full(ally), 'nie durch den Verbündeten');
});

test('Dauerhaft verdeckt: nach 2 s neues Ziel mit freier Linie, nie Schuss durch Verbündete', () => {
  const w = mkWorld();
  const s = spawn(w, 'soldat', 300, 300, 'blau'); s.cd = 0;
  // lange Reihe Verbündeter, seitlich kommt man nicht vorbei
  const allies = [];
  for (let y = 100; y <= 520; y += 15) allies.push(spawn(w, 'ritter', 345, y, 'blau'));
  const a = spawn(w, 'krieger', 450, 300, 'rot');      // nächster Gegner, verdeckt
  const b = spawn(w, 'krieger', 200, 140, 'rot');      // weiter weg, freie Linie
  rebuildHash(w);
  let firstShot = -1;
  for (let k = 0; k < 6 * 60; k++) {
    stepOnly(w, [s]);
    if (firstShot < 0 && w.events.some(e => e.type === 'shot')) firstShot = k * DT;
    w.events.length = 0;
    for (const al of allies) assert.ok(full(al), `Verbündeter getroffen bei ${k * DT}s`);
  }
  assert.ok(firstShot >= 2 - 1e-6, `erster Schuss erst nach 2 s (${firstShot})`);
  assert.ok(b.hp < b.T.hp, 'Ausweichziel beschossen');
  assert.ok(full(a), 'verdecktes Ziel nie beschossen');
});

test('Dauerhaft verdeckt ohne Alternative: hält das Feuer, friert nicht ein, blockedT zurückgesetzt', () => {
  const w = mkWorld();
  const s = spawn(w, 'soldat', 300, 300, 'blau'); s.cd = 0;
  const allies = [];
  for (let y = 40; y <= 760; y += 15) allies.push(spawn(w, 'ritter', 345, y, 'blau'));
  spawn(w, 'krieger', 450, 300, 'rot');
  spawn(w, 'krieger', 470, 360, 'rot');
  rebuildHash(w);
  let shots = 0, maxBlocked = 0; const ys = [];
  for (let k = 0; k < 7 * 60; k++) {
    stepOnly(w, [s]);
    shots += w.events.filter(e => e.type === 'shot').length; w.events.length = 0;
    maxBlocked = Math.max(maxBlocked, s.blockedT);
    if (k % 30 === 0) ys.push(s.y);
  }
  assert.equal(shots, 0, 'nie gefeuert');
  for (const al of allies) assert.ok(full(al));
  assert.ok(maxBlocked < 2 + DT * 1.5, `blockedT zurückgesetzt (${maxBlocked})`);
  // bewegt sich weiter (kein Einfrieren): die Position ändert sich in jeder halben Sekunde der letzten Sekunden
  const moved = ys.slice(-6).some((y, i, a) => i > 0 && Math.abs(y - a[i - 1]) > 1);
  assert.ok(moved, `bewegt sich: ${ys.map(y => y.toFixed(1)).join(' ')}`);
});

test('Mauer stoppt Kugel; Rakete explodiert an der Mauer und beschädigt sie', () => {
  const w = mkWorld();
  const s = spawn(w, 'soldat', 300, 300, 'blau');
  const t = spawn(w, 'krieger', 500, 300, 'rot');
  wallCol(w, 372, 250, 350);
  const i = cellIndex(w, 372, 300);
  rebuildHash(w);
  fire(w, s, t, 'bullet');
  flyAll(w);
  assert.ok(full(t), 'Kugel bleibt in der Mauer');
  assert.equal(w.proj.length, 0);
  const pf = spawn(w, 'panzerfaust', 300, 300, 'blau'); s.alive = false; rebuildHash(w);
  w.events.length = 0;
  fire(w, pf, t, 'rocket');
  flyAll(w);
  assert.ok(full(t), 'Ziel hinter der Mauer verschont');
  assert.ok(w.whp[i] < 140, `Mauer beschädigt (${w.whp[i]})`);
  const b = w.events.find(e => e.type === 'blast');
  assert.ok(b && Math.abs(b.x - 370) < 2, `Explosion an der Mauer (${b && b.x})`);
});

test('Explosion verletzt auch eigene Einheiten im Radius', () => {
  const w = mkWorld();
  const src = spawn(w, 'grenadier', 510, 300, 'blau');
  const own = spawn(w, 'krieger', 500, 320, 'blau');
  const foe = spawn(w, 'krieger', 490, 300, 'rot');
  const far = spawn(w, 'krieger', 600, 300, 'blau');
  rebuildHash(w);
  blast(w, 500, 300, 40, 20, 'blau', src, 'blast', 0);
  assert.ok(Math.abs((own.T.hp - own.hp) - 20 * (1 - .5 * 20 / 40)) < 1e-9, 'Verbündeter voll nach Abstand');
  assert.ok(foe.hp < foe.T.hp);
  assert.ok(Math.abs((src.T.hp - src.hp) - 20 * (1 - .5 * 10 / 40) * .5) < 1e-9, 'Schütze selbst ×0.5');
  assert.ok(full(far));
});

test('Flieger: Kugel auf Heli fliegt in Heli-Höhe und trifft keine Bodentruppen dazwischen', () => {
  const w = mkWorld();
  const s = spawn(w, 'soldat', 300, 300, 'blau');
  const ally = spawn(w, 'krieger', 360, 300, 'blau');
  const foe = spawn(w, 'krieger', 400, 300, 'rot');
  const h = spawn(w, 'heli', 470, 300, 'rot');
  rebuildHash(w);
  assert.equal(hasLineOfFire(w, s, h), true, 'Verbündeter am Boden blockiert nicht');
  fire(w, s, h, 'bullet');
  assert.equal(w.proj[0].z, h.z);
  flyAll(w);
  assert.ok(h.hp < h.T.hp, 'Heli getroffen');
  assert.ok(full(ally) && full(foe), 'Bodentruppen unberührt');
});

test('Flieger: Schüsse auf Flieger gehen über Mauern', () => {
  const w = mkWorld();
  const s = spawn(w, 'soldat', 300, 300, 'blau');
  const h = spawn(w, 'heli', 470, 300, 'rot');
  wallCol(w, 372, 250, 350);
  rebuildHash(w);
  fire(w, s, h, 'bullet');
  flyAll(w);
  assert.ok(h.hp < h.T.hp);
  assert.equal(w.whp[cellIndex(w, 372, 300)], 140);
});

test('Pfeil trifft am Landepunkt den nächsten Körper – auch einen Verbündeten', () => {
  const w = mkWorld();
  const s = spawn(w, 'schuetze', 300, 300, 'blau');
  const t = spawn(w, 'krieger', 450, 300, 'rot');
  rebuildHash(w);
  fire(w, s, t, 'arrow');
  const p = w.proj[0];
  // Verbündeter steht genau am Landepunkt, das Ziel ist weggelaufen
  const ally = spawn(w, 'krieger', p.x1, p.y1, 'blau'); t.x = 600; rebuildHash(w);
  flyAll(w);
  assert.ok(ally.hp < ally.T.hp); assert.ok(full(t));
});

test('Friendly Fire zählt nicht als Abschuss', () => {
  const w = mkWorld();
  const src = spawn(w, 'grenadier', 300, 300, 'blau');
  const own = spawn(w, 'krieger', 500, 300, 'blau'); own.hp = 1;
  const foe = spawn(w, 'krieger', 505, 300, 'rot'); foe.hp = 1;
  rebuildHash(w);
  blast(w, 500, 300, 40, 50, 'blau', src, 'blast', 0);
  assert.equal(own.alive, false); assert.equal(foe.alive, false);
  assert.equal(src.kills, 1);
});

test('Gerade Schüsse: Renderer-Felder bleiben stimmig (Position aus t/dur = physikalische Position + Mündungsversatz)', () => {
  const w = mkWorld();
  const s = spawn(w, 'soldat', 300, 300, 'blau'); const t = spawn(w, 'krieger', 700, 380, 'rot');
  rebuildHash(w);
  fire(w, s, t, 'rocket');
  const p = w.proj[0], ox = p.x0 - s.x, oy = p.y0 - s.y;
  for (let k = 0; k < 20; k++) stepProjectiles(w, DT);
  const q = p.t / p.dur;
  assert.ok(Math.abs(p.x0 + (p.x1 - p.x0) * q - (p.x + ox)) < 1e-6);
  assert.ok(Math.abs(p.y0 + (p.y1 - p.y0) * q - (p.y + oy)) < 1e-6);
  assert.equal(p.h, 0);
});

/* ---------- Fix-Runde 1: echte Schussbahn (Vorhalt + Streuung), Flieger als Schützen ---------- */
// Soldat schießt einmal (falls frei) auf einen schnell laufenden Reiter; das Geschoss fliegt zu Ende,
// das Ziel bewegt sich weiter. Liefert {fired, ally}.
const movingTargetTrial = (seed, allyY) => {
  const w = createWorld(1400, 800, seed); w.teamMode = true;
  const s = spawn(w, 'soldat', 300, 300, 'blau'); s.cd = 0;
  const t = spawn(w, 'reiter', 450, 300, 'rot'); t.mx = 0; t.my = 150;   // Vorhalt ≈ 16 px nach unten
  const ally = spawn(w, 'krieger', 420, allyY, 'blau');
  rebuildHash(w);
  // think setzt nur bei s die Wunschbewegung zurück; das Ziel behält my = 150
  think(w, s, DT);
  const fired = w.proj.length > 0;
  for (let k = 0; k < 60 && w.proj.length; k++) { t.y += t.my * DT; rebuildHash(w); stepProjectiles(w, DT); }
  return { fired, ally };
};

test('Bewegtes Ziel: Verbündeter neben dem Vorhaltepunkt wird nie getroffen (Schusslinie prüft die echte Bahn)', () => {
  // Verbündeter 16 px neben der Mittellinie zum Ziel, aber genau auf der Bahn zum Vorhaltepunkt
  for (let seed = 1; seed <= 12; seed++) {
    const { ally } = movingTargetTrial(seed, 316);
    assert.ok(full(ally), `Seed ${seed}: Verbündeter getroffen`);
  }
});

test('Bewegtes Ziel: Verbündeter auf der anderen Seite blockiert nicht, der Schütze feuert', () => {
  let fired = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const r = movingTargetTrial(seed, 284);
    if (r.fired) fired++;
    assert.ok(full(r.ally), `Seed ${seed}`);
  }
  assert.equal(fired, 12);
});

test('Geschoss fliegt genau zum geprüften Zielpunkt (fire mit vorgegebenem Zielpunkt)', () => {
  const w = mkWorld();
  const s = spawn(w, 'soldat', 300, 300, 'blau'); const t = spawn(w, 'krieger', 450, 300, 'rot');
  rebuildHash(w);
  fire(w, s, t, 'rocket', 455, 320);
  const p = w.proj[0], d = Math.hypot(155, 20);
  assert.ok(Math.abs(p.nx - 155 / d) < 1e-9 && Math.abs(p.ny - 20 / d) < 1e-9);
  assert.ok(Math.abs(p.len - d) < 1e-9, 'Rakete endet am Zielpunkt');
});

test('Heli über einer Mauerzelle trifft sein Bodenziel; die Mauer unter ihm bleibt heil', () => {
  const w = mkWorld();
  const h = spawn(w, 'heli', 300, 300, 'blau'); h.cd = 0;
  const i = cellIndex(w, 300, 300); setCell(w, i, 4);
  const t = spawn(w, 'krieger', 450, 300, 'rot');
  rebuildHash(w);
  assert.equal(hasLineOfFire(w, h, t), true);
  think(w, h, DT);
  assert.equal(w.proj.length, 1, 'Heli feuert');
  assert.ok(w.proj[0].z > 40, `Schuss startet in Heli-Höhe (${w.proj[0].z})`);
  flyAll(w);
  assert.ok(t.hp < t.T.hp, 'Bodenziel getroffen');
  assert.equal(w.whp[i], 140, 'Mauer unter dem Heli unberührt');
});

test('Heli über der eigenen Armee feuert weiter auf den Gegner', () => {
  const w = mkWorld();
  const h = spawn(w, 'heli', 300, 300, 'blau'); h.cd = 0;
  const allies = [[300, 300], [290, 312], [312, 290], [320, 305], [285, 290]].map(([x, y]) => spawn(w, 'krieger', x, y, 'blau'));
  const t = spawn(w, 'krieger', 460, 300, 'rot');
  rebuildHash(w);
  assert.equal(hasLineOfFire(w, h, t), true, 'eigene Leute unter dem Heli blockieren nicht');
  let shots = 0;
  for (let k = 0; k < 90; k++) {
    rebuildHash(w); think(w, h, DT); stepProjectiles(w, DT);
    shots += w.events.filter(e => e.type === 'shot').length; w.events.length = 0;
    h.x = 300; h.y = 300;   // bleibt über der Armee
  }
  assert.ok(shots >= 5, `feuert (${shots} Schüsse)`);
  assert.ok(t.hp < t.T.hp);
  for (const a of allies) assert.ok(full(a), 'Armee darunter unversehrt');
});
