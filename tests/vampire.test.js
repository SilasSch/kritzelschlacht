// Vampir und Ghul (Spez. Nachtrag 3, #32; Festlegung 1: die Fledermausform ist die Flucht selbst; Festlegung 3: Ghule).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, rebuildHash, nearestEnemy, factionOf, isBat } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { think, attack, hurt, blast, ignite, stepBurn } from '../game/js/combat.js';
import { HEAL_WAVE, ABILITY, VAMPIRE, GHOUL, NO_GHOUL } from '../game/js/abilities.js';
import { MORALE } from '../game/js/morale.js';
import { UNITS, BAT_FORM, UNDEAD } from '../game/js/data.js';
import { unitCard, cardTypes } from '../game/js/cards.js';
import { createFxCore } from '../game/js/render/fxcore.js';
import { poseUnit } from '../game/js/render/pose.js';

const DT = 1 / 60;
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Gegner, der nie zuschlägt und nicht stirbt
const dummy = (w, type, x, y, team = 'rot') => { const e = spawn(w, type, x, y, team); e.hp = 1e9; e.cd = 1e9; return e; };
const run = (w, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); if (each) each(w.events); w.events.length = 0; } };
// Biss des Vampirs v auf t (Nahkampfangriff wie in combat.think, ohne Abklingzeit)
const bite = (w, v, t) => { v.cd = 0; const dx = t.x - v.x, dy = t.y - v.y; attack(w, v, t, Math.hypot(dx, dy) || 1, dx, dy); };
const ghoulsOf = (w, v) => w.units.filter(u => u.alive && u.type === 'ghul' && u.owner === v);
const bodies = (w, type) => w.corpses.filter(c => c.kind === 'body' && c.type === type).length;

/* ---------- Daten ---------- */
test('Daten: Vampir malbar in Mythisch, Ghul nicht malbar; Fledermausform fliegt auf 22 px mit doppeltem Tempo', () => {
  assert.equal(UNITS.vampir.cat, 'mythisch'); assert.notEqual(UNITS.vampir.paint, false);
  assert.equal(UNITS.ghul.paint, false); assert.equal(UNITS.ghul.cat, 'mythisch');
  for (const k in UNITS) assert.ok('paint' in UNITS[k], `${k}: gleiche Schlüssel (paint)`);
  assert.deepEqual(Object.keys(BAT_FORM), Object.keys(UNITS.vampir));
  assert.ok(BAT_FORM.fly); assert.equal(BAT_FORM.flyZ, VAMPIRE.BAT_Z); assert.equal(VAMPIRE.BAT_Z, 22);
  assert.equal(BAT_FORM.speed, 2 * UNITS.vampir.speed); assert.equal(BAT_FORM.hp, UNITS.vampir.hp);
  assert.ok(!UNITS.vampir.fly && !UNITS.ghul.fly);
  assert.ok(UNDEAD.has('ghul') && !UNDEAD.has('vampir'));
  assert.ok(!ABILITY.vampir, 'Fledermausform ist keine ABILITY (Fliehende lösen keine aus, Festlegung 1)');
  for (const t of ['ghul', 'frosch', 'panzer', 'heli', 'drache', 'elefant']) assert.ok(NO_GHOUL.has(t), t);
  // Karten: Fähigkeiten des Vampirs, Ghul im Lexikon mit dem Hinweis, wie er entsteht
  const names = unitCard('vampir').abil.map(a => a.n);
  for (const n of ['Lebensraub', 'Fledermausform', 'Ghule', 'Schwäche: Feuer']) assert.ok(names.includes(n), n);
  assert.ok(unitCard('ghul').abil.some(a => /Vampirbiss/.test(a.n + a.d)), 'Ghul: entsteht durch Vampirbiss');
  assert.ok(cardTypes().find(g => g.cat === 'mythisch').types.includes('ghul'), 'Ghul im Lexikon');
  assert.ok(unitCard('ghul').tags.includes('Nicht malbar') && !unitCard('vampir').tags.includes('Nicht malbar'));
});

/* ---------- Lebensraub ---------- */
test('Lebensraub: ein Biss heilt den Vampir um die Hälfte des Schadens, gedeckelt auf seine max. LP, auch auf der Flucht', () => {
  const w = mkWorld(), v = spawn(w, 'vampir', 100, 100, 'blau'), t = dummy(w, 'krieger', 118, 100); t.hp = 1000;
  rebuildHash(w);
  v.hp = 50;
  const h0 = t.hp; bite(w, v, t);
  const dealt = h0 - t.hp;
  assert.ok(dealt > 5, `Schaden ${dealt}`);
  assert.ok(Math.abs(v.hp - (50 + dealt / 2)) < 1e-9, `LP ${v.hp}, erwartet ${50 + dealt / 2}`);
  v.hp = UNITS.vampir.hp - 1; bite(w, v, t);
  assert.equal(v.hp, UNITS.vampir.hp, 'gedeckelt');
  // Gegenwehr in der Ecke läuft über denselben Angriff: Lebensraub auch auf der Flucht
  v.hp = 30; v.flee = true; const h1 = t.hp; bite(w, v, t);
  assert.ok(Math.abs(v.hp - (30 + (h1 - t.hp) / 2)) < 1e-9);
  // Überschuss zählt nicht: nur der Schaden bis zum Tod des Opfers
  const weak = spawn(w, 'krieger', 100, 118, 'rot'); weak.hp = 2; v.hp = 40; v.flee = false; bite(w, v, weak);
  assert.ok(!weak.alive); assert.ok(Math.abs(v.hp - 41) < 1e-9, `LP ${v.hp}`);
});

/* ---------- Ghule ---------- */
test('Ghul entsteht, höchstens 3: 6 Bisskills ergeben 3 Ghule seines Teams am Ort des Opfers, nur die übrigen Opfer hinterlassen Leichen', () => {
  const w = mkWorld(), v = spawn(w, 'vampir', 400, 400, 'blau');
  rebuildHash(w);
  const spots = [];
  for (let k = 0; k < 6; k++) {
    const t = spawn(w, 'krieger', 418, 400 + k * 3, 'rot'); t.hp = 1;
    spots.push([t.x, t.y]);
    w.events.length = 0;
    bite(w, v, t);
    assert.ok(!t.alive, `Opfer ${k}`);
    assert.equal(bodies(w, 'krieger'), Math.max(0, k - 2), `Leichen nach ${k + 1} Kills`);
    if (k < 3) {
      assert.ok(w.events.some(e => e.type === 'death' && e.unitType === 'krieger'), 'death zählt für die Statistik');
      assert.ok(w.events.some(e => e.type === 'vamp' && e.k === 'rise'), 'rise-Effekt');
    }
  }
  const g = ghoulsOf(w, v);
  assert.equal(g.length, 3); assert.equal(v.ghouls, 3);
  for (let k = 0; k < 3; k++) {
    assert.equal(g[k].team, 'blau'); assert.equal(g[k].x, spots[k][0]); assert.equal(g[k].y, spots[k][1]);
    assert.ok(g[k].riseT > 0, 'steht erst auf');
  }
  // Kein Ghul aus anderen Tötungen des Vampirs (kein Biss) und keiner aus Bossen und Fliegern
  const w2 = mkWorld(), v2 = spawn(w2, 'vampir', 400, 400, 'blau'); rebuildHash(w2);
  const k1 = spawn(w2, 'krieger', 418, 400, 'rot'); hurt(w2, k1, 1e6, 'blast', v2);
  const bee = spawn(w2, 'biene', 410, 400, 'rot'); bee.hp = 1; bite(w2, v2, bee);
  const tank = spawn(w2, 'panzer', 440, 400, 'rot'); tank.hp = 1; bite(w2, v2, tank);
  assert.ok(!k1.alive && !bee.alive && !tank.alive);
  assert.equal(ghoulsOf(w2, v2).length, 0); assert.equal(v2.ghouls, 0);
});

test('Ghul: Team und Fraktion des Vampirs (auch jeder gegen jeden), wird nicht geheilt', () => {
  const w = createWorld(1400, 800, 3), v = spawn(w, 'vampir', 400, 400, 'blau');
  w.teamMode = false; rebuildHash(w);
  const t = spawn(w, 'krieger', 418, 400, 'rot'); t.hp = 1; bite(w, v, t);
  const g = ghoulsOf(w, v)[0];
  assert.ok(g, 'Ghul');
  assert.equal(factionOf(w, g), 'vampir', 'Jeder gegen jeden: Fraktion des Vampirs');
  rebuildHash(w);
  assert.equal(nearestEnemy(w, g), null, 'Vampir ist kein Feind seines Ghuls');
  // Sanitäter und Heilwelle heilen Ghule nicht (sonst verliert der Zerfall seinen Sinn)
  w.teamMode = true;
  const s = spawn(w, 'sani', 440, 430, 'blau'), k = spawn(w, 'krieger', 440, 400, 'blau');
  g.hp = 10; k.hp = 10; s.cd = 0; s.abCd = 0;
  for (const u of w.units) if (u !== s) { u.state = 'stun'; u.stunT = 1e9; }
  rebuildHash(w);
  const g0 = g.hp;
  for (let i = 0; i < 60; i++) { think(w, s, DT); }
  assert.ok(k.hp > 10, 'Krieger geheilt');
  assert.ok(g.hp <= g0, `Ghul nicht geheilt (${g0} → ${g.hp})`);
  assert.ok(HEAL_WAVE.R > dist(s, g), 'Ghul im Kreis der Heilwelle');
});

test('Ghul zerfällt: 4 % LP je s, nach 25 s ohne Kampf tot ohne Leiche; stirbt der Vampir, zerfallen seine Ghule sofort', () => {
  const w = mkWorld(), v = spawn(w, 'vampir', 400, 400, 'blau'); rebuildHash(w);
  const t = spawn(w, 'krieger', 418, 400, 'rot'); t.hp = 1; bite(w, v, t);
  const g = ghoulsOf(w, v)[0];
  assert.equal(GHOUL.DECAY, .04);
  run(w, 5);
  assert.ok(Math.abs(g.hp - .8 * UNITS.ghul.hp) < .5, `nach 5 s ${g.hp}`);
  assert.ok(g.riseT === 0 && g.alive);
  let crumbled = 0;
  run(w, 20 + 2 * DT, evs => { crumbled += evs.filter(e => e.type === 'vamp' && e.k === 'crumble').length; });
  assert.ok(!g.alive, 'nach 25 s zerfallen');
  assert.equal(crumbled, 1); assert.equal(v.ghouls, 0); assert.equal(g.owner, null);
  assert.equal(bodies(w, 'ghul'), 0, 'keine Leiche');
  // Der Vampir stirbt: alle seine Ghule zerfallen sofort, ohne neue Ghule und ohne Leichen
  const w2 = mkWorld(), v2 = spawn(w2, 'vampir', 400, 400, 'blau'); rebuildHash(w2);
  for (let k = 0; k < 3; k++) { const e = spawn(w2, 'krieger', 418, 390 + k * 10, 'rot'); e.hp = 1; bite(w2, v2, e); }
  const gs = ghoulsOf(w2, v2);
  assert.equal(gs.length, 3);
  const other = spawn(w2, 'vampir', 600, 400, 'blau'); const e2 = spawn(w2, 'krieger', 618, 400, 'rot'); e2.hp = 1; bite(w2, other, e2);
  w2.events.length = 0;
  hurt(w2, v2, 1e6, 'blast', null);
  assert.ok(!v2.alive);
  assert.ok(gs.every(x => !x.alive), 'zerfallen');
  assert.equal(ghoulsOf(w2, other).length, 1, 'Ghule anderer Vampire bleiben');
  assert.equal(w2.events.filter(e => e.type === 'vamp' && e.k === 'crumble').length, 3);
  assert.equal(w2.events.filter(e => e.type === 'death' && e.unitType === 'ghul').length, 3, 'zählen als Verluste');
  assert.equal(bodies(w2, 'ghul'), 0);
});

test('Kein Ghul aus Ghul: tötet ein Vampir einen Ghul, entsteht kein neuer, der Ghul hinterlässt eine Leiche', () => {
  const w = mkWorld(), a = spawn(w, 'vampir', 300, 400, 'blau'), b = spawn(w, 'vampir', 500, 400, 'rot'); rebuildHash(w);
  const t = spawn(w, 'krieger', 318, 400, 'rot'); t.hp = 1; bite(w, a, t);
  const g = ghoulsOf(w, a)[0];
  g.x = 518; g.y = 400; g.hp = 1;
  bite(w, b, g);
  assert.ok(!g.alive);
  assert.equal(b.ghouls, 0); assert.equal(ghoulsOf(w, b).length, 0);
  assert.equal(a.ghouls, 0, 'Zähler des Besitzers sinkt');
  assert.equal(bodies(w, 'ghul'), 1);
});

/* ---------- Fledermausform ---------- */
test('Fledermausform: Ziel 400 px entfernt → zerfällt (0,3 s), fliegt auf 22 px doppelt so schnell, Krieger treffen ihn nicht, am Ziel wieder Vampir', () => {
  const w = mkWorld(), v = spawn(w, 'vampir', 200, 400, 'blau'), t = dummy(w, 'krieger', 600, 400);
  rebuildHash(w);
  let puffs = 0;
  run(w, .2, evs => { puffs += evs.filter(e => e.type === 'vamp' && e.k === 'bat').length; });
  assert.equal(puffs, 1, 'Wölkchen beim Zerfallen');
  assert.ok(v.batT > 0 && v.batT < 1 && !v.T.fly, 'verwandelt sich noch (am Boden)');
  assert.ok(Math.abs(v.x - 200) < 1, 'steht beim Verwandeln');
  run(w, .2);
  assert.equal(v.batT, 1); assert.equal(v.T, BAT_FORM); assert.ok(isBat(v));
  run(w, .3);
  assert.ok(Math.abs(v.z - 22) < 1e-6, `Flughöhe ${v.z}`);
  const x0 = v.x; run(w, .5);
  assert.ok(Math.abs((v.x - x0) / .5 - 2 * UNITS.vampir.speed) < 3, `Tempo ${(v.x - x0) / .5}`);
  // Nahkämpfer am Boden erreichen die Fledermäuse nicht (wie den Hubschrauber); Fernkampf schon
  const k = spawn(w, 'krieger', v.x + 15, v.y, 'rot'); k.cd = 0; k.tg = v; rebuildHash(w);
  const s = spawn(w, 'schuetze', v.x + 150, v.y + 60, 'rot');
  assert.notEqual(nearestEnemy(w, k), v, 'kein Ziel für Nahkämpfer');
  assert.equal(nearestEnemy(w, s), v, 'Ziel für Fernkämpfer');
  const h = v.hp; think(w, k, DT);
  assert.notEqual(k.tg, v, 'Krieger lässt ab'); assert.equal(v.hp, h, 'kein Treffer');
  k.alive = false; s.alive = false; rebuildHash(w);
  // am Ziel (40 px): setzt sich wieder zusammen und beißt
  let back = -1;
  for (let i = 0; i < 600 && back < 0; i++) { step(w, DT); w.events.length = 0; if (v.batT === 0) back = i; }
  assert.ok(back >= 0, 'wieder Vampir');
  assert.ok(dist(v, t) <= VAMPIRE.BAT_END + 12, `nah am Ziel (${dist(v, t)})`);
  assert.equal(v.T, UNITS.vampir); assert.equal(v.z, 0);
  const th = t.hp; run(w, 2);
  assert.ok(t.hp < th, 'beißt am Ziel');
  assert.equal(v.batT, 0);
});

test('Fledermausform auf der Flucht: der fliehende Vampir fliegt als Fledermausschwarm davon und beißt nicht', () => {
  const w = mkWorld(), v = spawn(w, 'vampir', 400, 400, 'blau'), k = spawn(w, 'krieger', 418, 400, 'rot');
  for (let i = 0; i < MORALE.MIN_ALLIES + 1; i++) { const a = dummy(w, 'krieger', 100, 300 + i * 30, 'blau'); a.state = 'stun'; a.stunT = 1e9; }
  k.hp = 1e9;
  v.hp = .2 * UNITS.vampir.hp;
  run(w, .6);
  assert.ok(v.flee, 'flieht');
  assert.ok(isBat(v), 'Fledermausform');
  const kh = k.hp; const d0 = dist(v, k);
  run(w, 1);
  assert.equal(k.hp, kh, 'beißt nicht');
  assert.ok(dist(v, k) > d0 + 60, 'fliegt davon');
});

test('Feuer doppelt: Feuerball und Brand treffen den Vampir doppelt, auch in Fledermausform', () => {
  const dmg = (type, f) => { const w = mkWorld(), u = spawn(w, type, 400, 400, 'blau'); rebuildHash(w); const h = u.hp; f(w, u); return h - u.hp; };
  const ball = (w, u) => blast(w, u.x + 10, u.y, 38, 20, null, null, 'fire', 1.5);
  assert.ok(Math.abs(dmg('vampir', ball) - 2 * dmg('krieger', ball)) < 1e-6, 'Feuerball');
  const burn = (w, u) => { ignite(w, u, 3, null); for (let i = 0; i < 60; i++) stepBurn(w, u, DT); };
  assert.ok(Math.abs(dmg('vampir', burn) - 2 * dmg('krieger', burn)) < 1e-6, 'Brand');
  const plain = (w, u) => hurt(w, u, 10, 'bullet', null);
  assert.equal(dmg('vampir', plain), 10, 'sonst normal');
  const bat = (w, u) => { u.T = BAT_FORM; u.batT = 1; hurt(w, u, 10, 'fire', null); };
  assert.equal(dmg('vampir', bat), 20, 'Fledermausform');
});

/* ---------- Darstellung ---------- */
test('Darstellung: rise- und bat-Effekte im Budget, Ghul wächst beim Aufstehen aus dem Boden', () => {
  const fx = createFxCore({});
  fx.consume([{ type: 'vamp', k: 'bat', x: 100, y: 100, z: 0 }, { type: 'vamp', k: 'rise', x: 200, y: 100 }, { type: 'vamp', k: 'crumble', x: 300, y: 100 }]);
  assert.ok(fx.store.count > 6, `Partikel ${fx.store.count}`);
  const w = mkWorld(), v = spawn(w, 'vampir', 400, 400, 'blau'); rebuildHash(w);
  const t = spawn(w, 'krieger', 418, 400, 'rot'); t.hp = 1; bite(w, v, t);
  const g = ghoulsOf(w, v)[0];
  const p0 = poseUnit(g, 0), sy0 = p0.sy;
  g.riseT = 0; const sy1 = poseUnit(g, 0).sy;
  assert.ok(sy0 < .5 * sy1, `wächst aus dem Boden (${sy0} → ${sy1})`);
});
