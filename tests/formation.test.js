// Römer-Blockformation (Spez. #25): Blöcke ab FORM.MIN Römern, feste Plätze, Gleichschritt, Nachrücken,
// Auflösen vor dem Feind und an Mauern, Fraktionen getrennt. Speerwurf und Schilde (Task 3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, setCell, cellIndex, clearBattle, rebuildHash } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { hurt, think, fire, stepProjectiles, PILUM_SCAN, PILUM_SCAN_T } from '../game/js/combat.js';
import { integrate, collide } from '../game/js/physics.js';
import { FORM, FORM_CHASE, updateFormations, shieldBlocks, SHIELD_KINDS, SHIELD_MUL, SHIELD_COS, PILUM_RANK_DT, blockCols, COLS_MAX, hazardAt } from '../game/js/formation.js';
import { CELL, HASH_CELL, UNITS, TERRAIN, TERR_SPEED, TERR_HAZ } from '../game/js/data.js';

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

// SPACING 22 → 26 (Task 4, Controller-Entscheid): mit dem großen Scutum vor dem Körper wirkte der Block mit
// 22 px gedrängt (Schilde überdecken den Vordermann); 26 px lässt jede Figur samt Schild lesbar
// ENGAGE 90 → 30 (Task 7, Balance): der Block bleibt bis kurz vor dem Zusammenstoß geschlossen (Gründe in formation.js)
// LINK 110 → 50 und MAX 40 (Nachtrag 4, #35): nur dicht gemalte Römer bilden einen Block, höchstens 40 je Block
test('FORM: Werte laut Spez.', () => {
  assert.deepEqual(FORM, { MIN: 4, MAX: 40, LINK: 50, SPACING: 26, ENGAGE: 30, PILUM_MIN: 90, PILUM_MAX: 160, REFORM: .5, STUCK: 3 });
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
  // bleibt aufgelöst, solange Feinde in ENGAGE · 2 sind (geprüft bei jeder Neubildung)
  let checked = 0;
  run(w, 1, ww => {
    const members = rs.filter(u => u.alive);
    const near = ww.units.some(v => v.alive && v.team === 'rot' && members.some(u => Math.hypot(u.x - v.x, u.y - v.y) <= FORM.ENGAGE * 2));
    if (!near || !members.length) return;
    const f = formOf(ww, members[0]);
    assert.ok(!f || f.state === 'charge', 'Feind in ENGAGE · 2, Block bleibt aufgelöst');
    checked++;
  });
  assert.ok(checked > 0, 'Feinde blieben in ENGAGE · 2');
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

// Lavabecken 200×200 im Weg von 16 Römern: Plätze über Lava geben ihren Römer frei (er läuft dem Flussfeld
// nach drumherum), statt ihn hineinzuziehen. Vergleich: 16 Krieger am selben Ort.
function lavaPool(type) {
  const w = createWorld(1600, 900, 3); w.teamMode = true;
  for (let y = 300; y < 500; y += CELL) for (let x = 600; x < 800; x += CELL) setCell(w, cellIndex(w, x, y), 2, 0);
  const us = [];
  for (let k = 0; k < 16; k++) { const j = k % 3, i = (k / 3) | 0; us.push(spawn(w, type, 400 - j * 22, 400 + (i - 2.5) * 22, 'blau')); }
  spawn(w, 'krieger', 1300, 400, 'rot');
  let onLava = 0, lavaDeaths = 0, blockSteps = 0;
  for (let i = 0; i < 14 * 60; i++) {
    step(w, DT);
    for (const e of w.events) if (e.type === 'death' && e.unitType === type && e.killerId === null) lavaDeaths++;
    w.events.length = 0;
    for (const u of us) if (u.alive && w.terr[cellIndex(w, u.x, u.y)] === 2) onLava++;
    if (us.some(u => u.alive && u.formOn)) blockSteps++;
  }
  return { lavaS: onLava * DT, lavaDeaths, blockSteps };
}

test('Lava: ein Block zieht seine Römer nicht durchs Lavabecken', () => {
  const k = lavaPool('krieger'), r = lavaPool('roemer');
  assert.equal(r.lavaDeaths, 0, 'kein Römer stirbt in der Lava');
  assert.ok(r.lavaS <= 2 * k.lavaS, `Einheitensekunden auf Lava: Römer ${r.lavaS.toFixed(1)}, Krieger ${k.lavaS.toFixed(1)}`);
  assert.ok(r.blockSteps > 5 * 60, `Block bleibt bestehen (${r.blockSteps} Schritte in Formation)`);
});

test('Lava: sind mehr als die Hälfte der Plätze verbaut, löst sich der Block nach STUCK s auf', () => {
  // Lavastreifen über die ganze Höhe: kein Umweg, der Fluss führt mitten hindurch
  const w = mk();
  for (let y = 0; y < H; y += CELL) for (let x = 520; x < 600; x += CELL) setCell(w, cellIndex(w, x, y), 2, 0);
  const rs = block(w, 8, 470, 400, 'blau', 2);
  spawn(w, 'krieger', 1200, 400, 'rot');
  let freeMax = 0, tCharge = -1, t = 0;
  run(w, 8, ww => {
    t += DT;
    freeMax = Math.max(freeMax, rs.filter(u => u.alive && u.formFree).length);
    if (tCharge < 0 && formOf(ww, rs[0]).state === 'charge') { tCharge = t; return true; }
  });
  assert.ok(freeMax > 4, `mehr als die Hälfte frei: ${freeMax}`);
  assert.ok(tCharge > FORM.STUCK, `aufgelöst nach ${tCharge.toFixed(2)} s`);
  assert.ok(rs.every(u => !u.formOn && !u.formFree));
});

/* ---------- Speerwurf und Schilde (Spez. #25, Task 3) ---------- */

test('Schild: Konstanten laut Spez.', () => {
  assert.deepEqual([...SHIELD_KINDS].sort(), ['arrow', 'bullet', 'firearrow', 'pilum']);   // Brandpfeil: Vorgabe 5
  assert.equal(SHIELD_MUL, .1);
  assert.equal(SHIELD_COS, .5);
  assert.equal(PILUM_RANK_DT, .15);
});

test('shieldBlocks: nur Pfeil, Kugel, Speer von vorn (±60°) auf Römer in Formation', () => {
  // Römer blickt nach +x; ein Geschoss "von vorn" fliegt nach −x
  const v = { type: 'roemer', formOn: true, formAx: 1, formAy: 0 };
  for (const k of ['arrow', 'bullet', 'pilum']) assert.equal(shieldBlocks(v, k, -1, 0), true, `${k} von vorn`);
  assert.equal(shieldBlocks(v, 'arrow', -300, 0), true, 'Länge egal');
  // ±59° hält, ±61° nicht (cos 60° = SHIELD_COS)
  const at = deg => { const a = (180 + deg) * Math.PI / 180; return [Math.cos(a), Math.sin(a)]; };
  assert.equal(shieldBlocks(v, 'arrow', ...at(59)), true, '59°');
  assert.equal(shieldBlocks(v, 'arrow', ...at(-59)), true, '−59°');
  assert.equal(shieldBlocks(v, 'arrow', ...at(61)), false, '61°');
  assert.equal(shieldBlocks(v, 'bullet', 1, 0), false, 'von hinten');
  assert.equal(shieldBlocks(v, 'bullet', 0, 1), false, '90° seitlich');
  assert.equal(shieldBlocks(v, 'bullet', 0, -1), false, '90° von der anderen Seite');
  assert.equal(shieldBlocks({ ...v, formOn: false }, 'arrow', -1, 0), false, 'ohne Formation');
  assert.equal(shieldBlocks({ ...v, formFree: true }, 'arrow', -1, 0), false, 'vom Platz freigegeben (Lava/Mauer)');
  assert.equal(shieldBlocks({ ...v, formFree: false }, 'arrow', -1, 0), true);
  for (const k of ['fire', 'rocket', 'blast', 'melee']) assert.equal(shieldBlocks(v, k, -1, 0), false, k);
  assert.equal(shieldBlocks({ ...v, type: 'krieger' }, 'arrow', -1, 0), false, 'nur Römer');
  assert.equal(shieldBlocks(v, 'arrow', 0, 0), false, 'ohne Richtung');
  // Blickrichtung schräg (Block blickt nach unten rechts)
  const s = Math.SQRT1_2, d = { type: 'roemer', formOn: true, formAx: s, formAy: s };
  assert.equal(shieldBlocks(d, 'arrow', -s, -s), true);
  assert.equal(shieldBlocks(d, 'arrow', -1, 0), true, '45°');
  assert.equal(shieldBlocks(d, 'arrow', s, -s), false, '90°');
});

// Gesamter Schaden je Römer (Tote zählen voll)
const dmgOf = rs => rs.reduce((s, u) => s + Math.min(u.T.hp, u.T.hp - u.hp), 0) / rs.length;
// 4 s Beschuss durch 10 Schützen; die Römer waten durch Wasser (×0,4), damit sie in 4 s nicht auflaufen
function volley(romans) {
  const w = mk(5);
  for (let y = 200; y < 600; y += CELL) for (let x = 100; x < 720; x += CELL) setCell(w, cellIndex(w, x, y), 1, 0);
  const rs = romans(w);
  for (let i = 0; i < 10; i++) spawn(w, 'schuetze', 620, 310 + i * 20, 'rot');
  let blocks = 0;
  for (let i = 0; i < 4 * 60; i++) {
    step(w, DT);
    for (const e of w.events) if (e.type === 'block') blocks++;
    w.events.length = 0;
  }
  return { rs, dmg: dmgOf(rs), blocks };
}

test('Block hält Pfeile ab: im Block ≤ 15 % des Schadens einzelner Römer', () => {
  const inBlock = volley(w => block(w, 10, 400, 400, 'blau', 2));
  const single = volley(w => [spawn(w, 'roemer', 400, 378, 'blau'), spawn(w, 'roemer', 400, 400, 'blau'), spawn(w, 'roemer', 400, 422, 'blau')]);
  assert.ok(inBlock.rs.every(u => u.alive && u.formOn), 'der Block steht nach 4 s noch (Beschuss von vorn)');
  assert.ok(single.rs.every(u => !u.formOn), 'einzeln: keine Formation');
  assert.ok(inBlock.blocks > 10, `Schilde halten: ${inBlock.blocks} Blocks`);
  assert.equal(single.blocks, 0, 'einzeln hält kein Schild');
  assert.ok(single.dmg > 20, `einzeln getroffen: ${single.dmg.toFixed(1)}`);
  assert.ok(inBlock.dmg <= .15 * single.dmg, `Block ${inBlock.dmg.toFixed(1)} vs. einzeln ${single.dmg.toFixed(1)} je Römer`);
});

// Nur die Römer denken; der Feind steht still (wie sim.step, ohne Flussfeld)
function stepRomans(w, dt = DT) {
  w.time += dt;
  rebuildHash(w);
  updateFormations(w, dt);
  for (const u of w.units) if (u.alive && u.type === 'roemer') think(w, u, dt);
  integrate(w, dt); collide(w);
  stepProjectiles(w, dt);
}
// Läuft secs s und sammelt die geworfenen Speere: { u, t, d, p } (Werfer, Zeit, Abstand zum Ziel beim Wurf)
function throws(w, secs, target) {
  const seen = new Set(), out = [];
  let shots = 0;
  for (let i = 0; i < Math.round(secs * 60); i++) {
    stepRomans(w);
    for (const e of w.events) if (e.type === 'shot' && e.kind === 'pilum') shots++;
    w.events.length = 0;
    for (const p of w.proj) if (p.kind === 'pilum' && !seen.has(p)) {
      seen.add(p);
      out.push({ u: p.src, t: w.time, d: Math.hypot(target.x - p.src.x, target.y - p.src.y), p });
    }
  }
  return { out, shots };
}

test('Speer einmal: Feind 120 px vor einem Römer im Block → genau ein Speer, danach pilum 0; bei 60 px keiner', () => {
  const w = mk();
  const rs = block(w, 8, 400, 400, 'blau', 2);
  const me = rs.find(u => u.x === 400 && u.y === 389);
  const foe = spawn(w, 'krieger', 520, 389, 'rot');
  const { out, shots } = throws(w, 1.5, foe);
  const mine = out.filter(o => o.u === me);
  assert.equal(mine.length, 1, 'genau ein Speer');
  assert.equal(me.pilum, 0);
  assert.equal(shots, out.length, 'ein shot-Ereignis je Speer');
  assert.equal(new Set(out.map(o => o.u)).size, out.length, 'jeder höchstens einmal');
  for (const o of out) assert.ok(o.d >= FORM.PILUM_MIN && o.d <= FORM.PILUM_MAX + 1, `Wurf aus ${o.d.toFixed(1)} px`);
  assert.ok(out.every(o => o.p.dmg === UNITS.roemer.pilum), 'Schaden UNITS.roemer.pilum');
  // Feind steht still: der Speer trifft ihn
  assert.ok(foe.hp < foe.T.hp, 'Feind getroffen');

  const w2 = mk();
  const rs2 = block(w2, 8, 400, 400, 'blau', 2);
  const me2 = rs2.find(u => u.x === 400 && u.y === 389);
  const foe2 = spawn(w2, 'krieger', 460, 389, 'rot');
  const r2 = throws(w2, 1, foe2);
  assert.equal(r2.shots, 0, 'bei 60 px kein Speer');
  assert.equal(me2.pilum, 1);
});

test('Speer: einzelne Römer (ohne Block) werfen nicht', () => {
  const w = mk();
  const rs = [spawn(w, 'roemer', 400, 378, 'blau'), spawn(w, 'roemer', 400, 400, 'blau'), spawn(w, 'roemer', 400, 422, 'blau')];
  const foe = spawn(w, 'krieger', 520, 400, 'rot');
  assert.equal(throws(w, 1, foe).shots, 0);
  assert.ok(rs.every(u => u.pilum === 1));
});

test('Speer: die erste Reihe wirft zuerst, die zweite frühestens PILUM_RANK_DT s später', () => {
  const w = mk();
  const rs = block(w, 8, 400, 400, 'blau', 2);
  const firstRow = new Set(rs.filter(u => u.x === 400));
  const foe = spawn(w, 'krieger', 520, 400, 'rot');
  const { out } = throws(w, 1.5, foe);
  const front = out.filter(o => firstRow.has(o.u)), back = out.filter(o => !firstRow.has(o.u));
  assert.equal(front.length, 4, 'ganze erste Reihe wirft');
  assert.ok(back.length >= 1, 'zweite Reihe wirft');
  const t0 = Math.min(...front.map(o => o.t));
  assert.ok(front.every(o => o.t === t0), 'erste Reihe zugleich');
  for (const o of back) assert.ok(o.t >= t0 + PILUM_RANK_DT - 1e-9, `zweite Reihe nach ${(o.t - t0).toFixed(3)} s`);
});

test('Speer über eigene Reihen: aus der dritten Reihe auf ein Ziel in 140 px trifft keinen Römer der ersten Reihe', () => {
  const w = mk(11);
  const rs = block(w, 12, 400, 400, 'blau', 3);
  // ohne Gegner steht der Block; blaue Römer blicken nach rechts (+x)
  for (let i = 0; i < 40; i++) stepRomans(w);
  assert.ok(rs.every(u => u.formOn), 'Block steht');
  const f = formOf(w, rs[0]);
  assert.ok(f.ax > .99, `Blick nach +x: ${f.ax}`);
  const depth = u => (u.slotX - f.cx) * f.ax + (u.slotY - f.cy) * f.ay;
  const maxD = Math.max(...rs.map(depth));
  const rank = u => Math.round((maxD - depth(u)) / FORM.SPACING);
  const first = rs.filter(u => rank(u) === 0), third = rs.filter(u => rank(u) === 2);
  assert.ok(first.length >= 4 && third.length >= 1, `Reihen ${first.length}/${third.length}`);
  const u = third[0];
  const foe = spawn(w, 'baer', u.x + 140, u.y, 'rot');
  rebuildHash(w);
  for (let k = 0; k < 30; k++) {
    fire(w, u, foe, 'pilum');
    for (let i = 0; i < 120 && w.proj.length; i++) stepProjectiles(w, DT);
  }
  assert.ok(first.every(v => v.hp === v.T.hp), 'erste Reihe unversehrt');
  assert.ok(rs.every(v => v.hp === v.T.hp), 'kein Römer getroffen');
  assert.ok(foe.hp < foe.T.hp, 'Ziel getroffen');
});

// Fix-Runde 1: volT läuft weiter, auch wenn der Gegner, der die Uhr gestartet hat, fällt oder abzieht. Dann sucht
// jeder Römer mit Speer jeden Schritt ein Ziel; die Suche muss auf PILUM_MAX begrenzt sein (nicht die Ringsuche
// über die ganze Karte), sonst kostet ein ruhender Block mit Speeren ein Vielfaches (0,40 statt 0,10 ms).
test('Speer: Zielsuche bleibt auf PILUM_MAX begrenzt, auch wenn der Feind weit weg ist', () => {
  const w = createWorld(2400, 1200, 3); w.teamMode = true;
  const rs = [];
  for (let k = 0; k < 40; k++) { const j = k % 4, i = (k / 4) | 0; rs.push(spawn(w, 'roemer', 300 - j * 22, 600 + (i - 4.5) * 22, 'blau')); }
  spawn(w, 'krieger', 1800, 600, 'rot');   // 1500 px vor dem Block
  for (let i = 0; i < 30; i++) stepRomans(w);
  assert.ok(rs.every(u => u.formOn), 'Block marschiert');
  // Uhr läuft (wie nach einem gefallenen Gegner), alle haben noch ihren Speer
  for (const f of w.formations) f.volT = 1;
  const c0 = PILUM_SCAN.calls, z0 = PILUM_SCAN.cells, N = 60;
  for (let i = 0; i < N; i++) { stepRomans(w); for (const f of w.formations) f.volT = 1; }
  const calls = PILUM_SCAN.calls - c0, cells = PILUM_SCAN.cells - z0;
  const box = (2 * Math.ceil(FORM.PILUM_MAX / HASH_CELL) + 1) ** 2;
  // gedrosselt (finale Prüfung): je Römer höchstens eine Suche je PILUM_SCAN_T s (plus die erste beim Freigeben)
  assert.ok(calls > 0 && calls <= 40 * (Math.ceil(N * DT / PILUM_SCAN_T) + 1), `Suchen ${calls}`);
  assert.ok(cells <= calls * box, `höchstens ${box} Hash-Zellen je Suche: ${(cells / calls).toFixed(1)}`);
  assert.ok(rs.every(u => u.pilum === 1), 'kein Wurf ohne Ziel in Reichweite');
});

// Finale Prüfung: 200 Römer marschierten als Kolonne 10 × 20 (Spalten fest höchstens 10). Die Grenze wächst
// mit n bis COLS_MAX (blockCols); seit MAX 40 (Nachtrag 4) ist ein Block höchstens 40 Römer groß (10 Spalten × 4 Reihen).
test('Breite: große Blöcke marschieren als Front, kleine wie bisher', () => {
  for (const [n, c] of [[4, 3], [12, 5], [30, 9], [40, 10], [80, 10], [100, 13], [200, 16], [400, 16]]) assert.equal(blockCols(n), c, `n ${n}`);
  const w = mk();
  for (let k = 0; k < 40; k++) spawn(w, 'roemer', 200 + (k % 5) * 22, 300 + ((k / 5) | 0) * 22, 'blau');
  spawn(w, 'krieger', 1300, 400, 'rot');
  run(w, .6);
  assert.equal(w.formations.length, 1);
  const f = w.formations[0], rows = new Set(f.oD).size, cols = new Set(f.oL).size;
  assert.equal(f.n, 40);
  assert.equal(cols, 10); assert.equal(rows, 4);
  assert.ok(cols > rows, `breiter als tief: ${cols} × ${rows}`);
});

// Nachtrag 4 (#35): eine große gemalte Masse wird nicht ein Riesenblock, sondern mehrere Blöcke zu höchstens MAX
test('MAX: 200 dicht gemalte Römer bilden mehrere Blöcke zu höchstens 40', () => {
  const w = mk();
  for (let k = 0; k < 200; k++) spawn(w, 'roemer', 200 + (k % 10) * 22, 180 + ((k / 10) | 0) * 22, 'blau');
  spawn(w, 'krieger', 1300, 400, 'rot');
  run(w, .05);
  assert.ok(w.formations.length >= 5, `Blöcke ${w.formations.length}`);
  assert.ok(w.formations.every(f => f.n <= FORM.MAX), w.formations.map(f => f.n).join(','));
  assert.equal(w.formations.reduce((s, f) => s + f.n, 0), 200);
});

// Finale Prüfung: Gefahr und Geländebremse kommen aus TERRAIN (data.js), nicht aus Zahlen in formation.js
test('Gelände: Gefahr und Tempo nach TERRAIN, gleich wie physics.integrate', () => {
  assert.deepEqual(TERR_HAZ, [false, false, true, false, true, false, false]);   // 5: Asche (Waldbrand), 6: Dornen
  assert.deepEqual(TERR_SPEED, [1, .4, .8, .85, 1, 1, .75]);
  for (const k in TERRAIN) {
    const w = mk(), x = 300, y = 300;
    if (TERRAIN[k].id) setCell(w, cellIndex(w, x, y), TERRAIN[k].id, 0);
    assert.equal(hazardAt(w, x, y), k === 'lava' || k === 'mauer', k);
    if (k === 'mauer') continue;
    // eine Bodeneinheit läuft mit TERR_SPEED · Wunschtempo
    const u = spawn(w, 'krieger', x, y, 'blau'); u.mx = 50; u.my = 0;
    integrate(w, DT);
    // Lava (Nachtrag 5, #42): wer drinsteht, läuft mit vollem Tempo (gebremst) auf kürzestem Weg hinaus, nicht weiter
    if (k === 'lava') { assert.ok(Math.abs(Math.hypot(u.x - x, u.y - y) / DT - u.T.speed * TERR_SPEED[2]) < 1e-6 && u.x < x, `${k}: ${((u.x - x) / DT).toFixed(2)}`); continue; }
    assert.ok(Math.abs((u.x - x) / DT - 50 * TERR_SPEED[TERRAIN[k].id]) < 1e-6, `${k}: ${((u.x - x) / DT).toFixed(2)}`);
  }
});

// LINK 50 (Nachtrag 4, #35; vorher 110). Zwei Gruppen aus je 4 Römern (2 × 2, Abstand 22) übereinander;
// ihre nächsten Mitglieder liegen gap px auseinander. Bis LINK verbindet die Kette sie zu einem Block.
test('LINK: Gruppen 40 px auseinander bilden einen Block, 60 px auseinander zwei', () => {
  const blocks = gap => {
    const w = mk();
    const a = block(w, 4, 300, 400, 'blau', 2), b = block(w, 4, 300, 400 + 22 + gap, 'blau', 2);
    spawn(w, 'krieger', 1300, 400, 'rot');
    run(w, .05);
    return { w, a, b };
  };
  const one = blocks(40);
  assert.equal(one.w.formations.length, 1);
  assert.equal(one.w.formations[0].n, 8);
  assert.ok([...one.a, ...one.b].every(u => u.formOn && u.form === one.a[0].form));
  const two = blocks(60);
  assert.equal(two.w.formations.length, 2);
  assert.ok(two.w.formations.every(f => f.n === 4));
  assert.notEqual(two.a[0].form, two.b[0].form);
  assert.ok(FORM.LINK > 40 && FORM.LINK < 60, `LINK ${FORM.LINK}`);
});

// Nachtrag 4 (#35): Schützen, die zurückweichen und schießen, zerpflückten den Block, der im Tempo des Langsamsten
// marschierte. Unter Beschuss oder bei zurückweichendem Ziel marschiert er mit FORM_CHASE.MUL · Römertempo.
test('Verfolgung: 12 Römer holen 10 zurückweichende Schützen schneller ein als ohne FORM_CHASE', () => {
  assert.deepEqual(FORM_CHASE, { MUL: 1.1, LOOSE: .8, V: 8, HIT_T: .5, HOLD: 1.5 });
  const trial = (seed, on) => {
    const save = { ...FORM_CHASE };
    if (!on) Object.assign(FORM_CHASE, { MUL: 1, LOOSE: 0, V: Infinity, HIT_T: -Infinity });
    try {
      const w = mk(seed);
      block(w, 12, 300, 400);
      // unsterbliche Schützen, die 22 px/s zurückweichen (wie beim Ausweichen) und dabei schießen
      const es = []; for (let k = 0; k < 10; k++) { const e = spawn(w, 'schuetze', 640, 220 + k * 40, 'rot'); e.hp = 1e9; es.push(e); }
      let t = 0;
      for (let i = 0; i < 60 * 25; i++) {
        step(w, DT); w.events.length = 0; t += DT;
        for (const e of es) e.x = Math.min(W - 10, e.x + 22 * DT);
        if (w.formations[0] && w.formations[0].state === 'charge') return t;
      }
      return Infinity;
    } finally { Object.assign(FORM_CHASE, save); }
  };
  for (const seed of [1, 2]) {
    const before = trial(seed, false), after = trial(seed, true);
    // Nachtrag 8 (#50): beschossene Römer fliehen nicht mehr, auch ohne FORM_CHASE holt der Block schneller auf (Saat 1:
    // 16,7 → 11,8 s); der Vorsprung durch FORM_CHASE bleibt, darum 0,9 statt 0,8
    assert.ok(after < 13 && after < before * .9, `Saat ${seed}: Zusammenstoß nach ${after.toFixed(2)} s statt ${before.toFixed(2)} s`);
  }
});

// Nachtrag 4 (#35): im Block wählt jeder Römer ein eigenes Ziel, beim Speerwurf (fliegende Speere zählen als vergeben,
// combat.PILUM_CLAIM) und beim ersten Ziel nach dem Auflösen (formation.CHARGE_CLAIM), statt dass alle denselben treffen
test('Verteilte Ziele: 12 Römer gegen 10 verteilte Gegner treffen mit Speeren ≥ 4 und greifen nach dem Auflösen ≥ 4 an', () => {
  for (const seed of [1, 2, 3]) {
    const w = mk(seed);
    const rs = block(w, 12, 300, 400);
    const es = [];
    for (let k = 0; k < 10; k++) {
      // 2 Glieder × 5, 40 px Abstand (vorher: 3 verschiedene Speerziele und 3 Ziele nach dem Auflösen)
      const e = spawn(w, 'krieger', 640 + (k % 2) * 40, 400 + ((k >> 1) - 2) * 40, 'rot');
      e.T = { ...UNITS.krieger, speed: 0 }; e.hp = 1e6; e.cd = 1e9; es.push(e);
    }
    let speared = -1, targets = -1;
    run(w, 20, () => {
      const f = w.formations.find(q => rs.some(u => u.form === q.id));
      if (speared < 0 && f && f.state === 'charge') speared = es.filter(e => e.hp < 1e6).length;
      else if (speared >= 0) { targets = new Set(rs.filter(u => u.alive && u.tg).map(u => u.tg)).size; return true; }
    });
    assert.ok(speared >= 4, `Saat ${seed}: Speere trafen ${speared} verschiedene Gegner`);
    assert.ok(targets >= 4, `Saat ${seed}: nach dem Auflösen ${targets} verschiedene Ziele`);
  }
});
