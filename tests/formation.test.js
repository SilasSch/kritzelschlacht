// Römer-Blockformation (Spez. #25): Blöcke ab FORM.MIN Römern, feste Plätze, Gleichschritt, Nachrücken,
// Auflösen vor dem Feind und an Mauern, Fraktionen getrennt.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, setCell, cellIndex, clearBattle } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { hurt } from '../game/js/combat.js';
import { FORM } from '../game/js/formation.js';
import { CELL } from '../game/js/data.js';

const W = 1400, H = 800, DT = 1 / 60;
const mk = (seed = 3) => { const w = createWorld(W, H, seed); w.teamMode = true; return w; };
const run = (w, secs, each) => {
  for (let i = 0; i < Math.round(secs * 60); i++) { step(w, DT); w.events.length = 0; if (each && each(w) === true) return true; }
  return false;
};
// n Römer im Raster (rows Glieder hintereinander in x, Abstand 22), vorderstes Glied bei x0, nach +x blickend
function block(w, n, x0, y0, team = 'blau', rows = 3) {
  const cols = Math.ceil(n / rows), out = [];
  for (let k = 0; k < n; k++) {
    const j = k % rows, i = (k / rows) | 0;
    out.push(spawn(w, 'roemer', x0 - j * 22, y0 + (i - (cols - 1) / 2) * 22, team));
  }
  return out;
}
const romans = w => w.units.filter(u => u.alive && u.type === 'roemer');
const formOf = (w, u) => w.formations.find(f => f.id === u.form);

test('FORM: Werte laut Spez.', () => {
  assert.deepEqual(FORM, { MIN: 4, LINK: 46, SPACING: 22, ENGAGE: 90, PILUM_MIN: 90, PILUM_MAX: 160, REFORM: .5, STUCK: 3 });
});

test('Block ab 4 Römern: 6 eng beieinander bilden einen Block, 3 nicht', () => {
  const w = mk();
  block(w, 6, 300, 400, 'blau', 2);
  spawn(w, 'krieger', 900, 400, 'rot');
  run(w, .6);
  const rs = romans(w);
  assert.equal(rs.length, 6);
  assert.ok(rs.every(u => u.formOn === true), 'alle in Formation');
  assert.ok(rs[0].form > 0 && rs.every(u => u.form === rs[0].form), 'dieselbe Block-id');
  const f = formOf(w, rs[0]);
  assert.ok(f && f.faction === 'blau' && f.n === 6 && f.state === 'march');
  // Blickrichtung: zum Gegner (rechts)
  assert.ok(f.ax > .9, `ax ${f.ax}`);

  const w3 = mk();
  block(w3, 3, 300, 400, 'blau', 1);
  spawn(w3, 'krieger', 900, 400, 'rot');
  run(w3, .6);
  assert.ok(romans(w3).every(u => u.formOn === false && u.form === 0), 'zu wenige: kein Block');
  // Nicht-Römer bleiben auf den Startwerten
  const k = w.units.find(u => u.type === 'krieger');
  assert.equal(k.form, 0); assert.equal(k.formOn, false); assert.equal(k.slotX, 0); assert.equal(k.pilum, 1);
});

test('Gleichschritt: 12 Römer halten 2 s lang ihre Plätze und laufen gleich schnell', () => {
  const w = mk();
  const rs = block(w, 12, 300, 400);
  spawn(w, 'krieger', 1250, 400, 'rot');
  const x0 = rs.reduce((s, u) => s + u.x, 0) / rs.length;
  run(w, 2);
  assert.ok(rs.every(u => u.alive && u.formOn), 'alle im Block');
  const x1 = rs.reduce((s, u) => s + u.x, 0) / rs.length;
  assert.ok(x1 - x0 > 50, `marschiert: ${x1 - x0} px`);
  const d = rs.map(u => Math.hypot(u.x - u.slotX, u.y - u.slotY));
  const mean = d.reduce((s, v) => s + v, 0) / d.length;
  const sd = Math.sqrt(d.reduce((s, v) => s + (v - mean) ** 2, 0) / d.length);
  assert.ok(sd < 6, `Streuung der Platzabstände ${sd.toFixed(2)} px`);
  const sp = rs.map(u => Math.hypot(u.mx, u.my));
  const lo = Math.min(...sp), hi = Math.max(...sp);
  assert.ok(lo > 0 && hi <= lo * 1.1, `Tempi ${lo.toFixed(1)}..${hi.toFixed(1)}`);
  // nicht schneller als das Blocktempo · 1,25
  const f = formOf(w, rs[0]);
  assert.ok(hi <= f.speed * 1.25 + 1e-9, `höchstens speed · 1,25: ${hi}`);
  // Römer im Marsch suchen kein Ziel
  assert.ok(rs.every(u => u.tg === null));
});

test('Lücke schließt: fällt einer aus der ersten Reihe, rückt ein Hintermann nach', () => {
  const w = mk();
  const rs = block(w, 12, 300, 400);
  spawn(w, 'krieger', 1300, 400, 'rot');
  run(w, 1);
  let f = formOf(w, rs[0]);
  const front = rs.reduce((b, u) => ((u.x - f.cx) * f.ax + (u.y - f.cy) * f.ay > (b.x - f.cx) * f.ax + (b.y - f.cy) * f.ay ? u : b));
  hurt(w, front, 1e6, 'melee', null);
  assert.equal(front.alive, false);
  run(w, FORM.REFORM + 1);
  const alive = romans(w);
  assert.equal(alive.length, 11);
  f = formOf(w, alive[0]);
  assert.ok(f && f.n === 11 && f.state === 'march');
  const cols = Math.min(10, Math.max(2, Math.round(Math.sqrt(11 * 2.5))));
  const depth = u => (u.slotX - f.cx) * f.ax + (u.slotY - f.cy) * f.ay;
  const maxD = Math.max(...alive.map(depth));
  const first = alive.filter(u => Math.abs(depth(u) - maxD) < 1);
  assert.equal(first.length, cols, 'erste Reihe hat cols Plätze');
  for (const u of first) assert.ok(Math.hypot(u.x - u.slotX, u.y - u.slotY) < 6, `besetzt: ${Math.hypot(u.x - u.slotX, u.y - u.slotY)}`);
  // die cols vordersten Römer (tatsächliche Lage) sind genau die der ersten Reihe
  const byPos = [...alive].sort((a, b) => ((b.x - f.cx) * f.ax + (b.y - f.cy) * f.ay) - ((a.x - f.cx) * f.ax + (a.y - f.cy) * f.ay));
  assert.deepEqual(new Set(byPos.slice(0, cols)), new Set(first));
});

test('Auflösen vor dem Feind: näher als ENGAGE → charge, die Römer suchen sich Ziele', () => {
  const w = mk();
  const rs = block(w, 8, 400, 400, 'blau', 2);
  for (let i = 0; i < 4; i++) spawn(w, 'krieger', 700, 370 + i * 20, 'rot');
  run(w, .3);
  const f0 = formOf(w, rs[0]);
  assert.equal(f0.state, 'march');
  assert.ok(rs.every(u => u.tg === null), 'im Marsch ohne eigenes Ziel');
  const hit = run(w, 4, ww => formOf(ww, rs[0]).state === 'charge');
  assert.ok(hit, 'Block löst sich auf');
  // im selben Schritt: vorderste Römer höchstens ENGAGE (+ Schrittweite) vom nächsten Feind
  run(w, .1);
  const alive = rs.filter(u => u.alive);
  assert.ok(alive.every(u => u.formOn === false), 'keiner mehr in Formation');
  assert.ok(alive.every(u => u.tg && u.tg.alive), 'alle haben ein Ziel');
  // bleibt aufgelöst, solange Feinde in ENGAGE · 2 sind
  run(w, 1);
  const f = formOf(w, rs.find(u => u.alive));
  assert.ok(!f || f.state === 'charge');
});

test('Fraktionen getrennt: 4 blaue und 4 rote Römer nebeneinander bilden zwei Blöcke', () => {
  const w = mk();
  const b = block(w, 4, 300, 400, 'blau', 2), r = block(w, 4, 340, 400, 'rot', 2);
  run(w, .1);
  assert.equal(w.formations.length, 2);
  assert.deepEqual(w.formations.map(f => f.faction).sort(), ['blau', 'rot']);
  for (const f of w.formations) assert.equal(f.n, 4);
  assert.ok(b.every(u => u.form === b[0].form) && r.every(u => u.form === r[0].form));
  assert.notEqual(b[0].form, r[0].form);
  for (const u of [...b, ...r]) assert.equal(formOf(w, u).faction, u.team, 'keine gemischten Mitglieder');
});

test('Mauer: kein Festhängen, nach STUCK + 0,5 s ist der Block aufgelöst', () => {
  const w = mk();
  for (let y = 0; y < H; y += CELL) for (let x = 500; x < 520; x += CELL) setCell(w, cellIndex(w, x, y), 4, 0);
  const rs = block(w, 8, 486, 400, 'blau', 2);
  spawn(w, 'krieger', 1000, 400, 'rot');
  run(w, .3);
  assert.equal(formOf(w, rs[0]).state, 'march');
  run(w, FORM.STUCK + .2);
  const f = formOf(w, rs[0]);
  assert.equal(f.state, 'charge', `stuckT ${f.stuckT}`);
  assert.ok(rs.every(u => !u.formOn));
});

test('clearBattle leert die Formationen', () => {
  const w = mk();
  block(w, 6, 300, 400);
  spawn(w, 'krieger', 900, 400, 'rot');
  run(w, .2);
  assert.ok(w.formations.length >= 1);
  clearBattle(w);
  assert.equal(w.formations.length, 0);
});

test('gleiche Saat, gleicher Verlauf mit Römern', () => {
  const go = () => {
    const w = mk(9);
    block(w, 12, 300, 300); block(w, 8, 1000, 500, 'rot');
    spawn(w, 'schuetze', 1100, 300, 'rot');
    run(w, 4);
    return w.units.map(u => `${u.x.toFixed(3)},${u.y.toFixed(3)},${u.hp.toFixed(2)},${u.form}`).join('|');
  };
  assert.equal(go(), go());
});
