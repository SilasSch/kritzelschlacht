// König (Wunsch Silas, 18.11.): Königsaura, Schlachtruf, Königsmord (abilities.KING)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { hurt } from '../game/js/combat.js';
import { UNITS } from '../game/js/data.js';
import { ABILITY, KING } from '../game/js/abilities.js';
import { unitCard } from '../game/js/cards.js';
import { rigLayout } from '../game/js/render/rig.js';

const DT = 1 / 60;
const mkWorld = (seed = 3) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
const run = (w, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); if (each) each(w.events); w.events.length = 0; } };

test('Daten: König ist eine teure, malbare Armee-Einheit mit drei Fähigkeiten auf der Karte', () => {
  const T = UNITS.koenig;
  assert.equal(T.cat, 'armee'); assert.notEqual(T.paint, false);
  assert.ok(T.cost >= 12, 'teuer');
  assert.deepEqual(unitCard('koenig').abil.map(a => a.n), ['Königsaura', 'Schlachtruf', 'Königsmord']);
  assert.equal(ABILITY.koenig.cd, 18);
});

test('Königsaura: nahe Armee-Truppen werden mutig, fremde Kategorien und Feinde nicht', () => {
  const w = mkWorld();
  const k = spawn(w, 'koenig', 300, 400, 'blau');
  const near = spawn(w, 'krieger', 340, 400, 'blau');
  const far = spawn(w, 'krieger', 300 + KING.AURA_R + 60, 400, 'blau');
  const wolf = spawn(w, 'wolf', 320, 430, 'blau');
  const foe = spawn(w, 'krieger', 330, 380, 'rot');
  for (const u of [k, near, far, wolf, foe]) { u.state = 'stun'; u.stunT = 1e9; }
  run(w, 1);
  assert.ok(near.braveT > 0, 'nah: mutig');
  assert.equal(far.braveT, 0, 'zu weit');
  assert.equal(wolf.braveT, 0, 'kein Armee-Typ');
  assert.equal(foe.braveT, 0, 'Feind');
});

test('Königsaura: mutige Einheiten fliehen nicht (ohne König schon)', () => {
  const fled = king => {
    const w = mkWorld();
    if (king) spawn(w, 'koenig', 250, 400, 'blau');
    const u = spawn(w, 'krieger', 330, 400, 'blau');
    for (let i = 0; i < 4; i++) spawn(w, 'krieger', 200, 300 + i * 30, 'blau');
    const foe = spawn(w, 'krieger', 600, 400, 'rot'); foe.hp = 1e9;
    run(w, .6);
    u.hp = UNITS.krieger.hp * .1;
    let f = false;
    run(w, 3, () => { if (u.alive && u.flee) f = true; });
    return f;
  };
  assert.equal(fled(false), true, 'Kontrolle: ohne König flieht er');
  assert.equal(fled(true), false, 'mit König nicht');
});

test('Schlachtruf: heilt Verbündete im Umkreis und treibt sie an', () => {
  const w = mkWorld();
  const k = spawn(w, 'koenig', 300, 400, 'blau');
  const allies = [0, 1, 2, 3].map(i => spawn(w, 'krieger', 260, 340 + i * 40, 'blau'));
  const foe = spawn(w, 'krieger', 340, 400, 'rot'); foe.hp = 1e9; foe.cd = 1e9;
  for (const a of allies) a.hp = a.T.hp * .5;
  k.tg = foe; k.abCd = 0;
  assert.ok(ABILITY.koenig.ready(w, k));
  ABILITY.koenig.start(w, k);
  for (const a of allies) {
    assert.ok(Math.abs(a.hp - a.T.hp * (.5 + KING.CRY_HEAL)) < 1e-6, 'geheilt');
    assert.equal(a.buffT, KING.CRY_T); assert.equal(a.spdMul, KING.CRY_SPEED); assert.equal(a.dmgMul, KING.CRY_DMG);
  }
  assert.ok(w.events.some(e => e.type === 'ability' && e.k === 'kingCry'));
});

test('Königsmord: fällt der König, erschrecken die eigenen Truppen, die Feinde nicht', () => {
  const w = mkWorld();
  const k = spawn(w, 'koenig', 300, 400, 'blau');
  const own = spawn(w, 'krieger', 380, 400, 'blau');
  const foe = spawn(w, 'krieger', 340, 400, 'rot');
  hurt(w, k, 1e9, 'melee', foe);
  assert.equal(k.alive, false);
  assert.ok(own.fearT > 0, 'eigene erschrecken');
  assert.equal(foe.fearT, 0, 'Feind nicht');
});

test('Rig: König hat Körper, Krone und Schwert', () => {
  const L = rigLayout('koenig');
  for (const p of ['body', 'headgear', 'weapon']) assert.ok(L[p], p);
  assert.equal(L.body.variants, 5, 'Teamfarben');
});

test('Schlacht: König mit Kriegern läuft deterministisch durch', () => {
  const play = () => {
    const w = mkWorld(11);
    spawn(w, 'koenig', 300, 400, 'blau');
    for (let i = 0; i < 10; i++) spawn(w, 'krieger', 340, 250 + i * 30, 'blau');
    for (let i = 0; i < 14; i++) spawn(w, 'krieger', 900, 230 + i * 30, 'rot');
    run(w, 20);
    return w.units.filter(u => u.alive).map(u => u.team + Math.round(u.hp)).join();
  };
  assert.equal(play(), play());
});
