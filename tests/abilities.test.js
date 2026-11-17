// Fähigkeiten (Spez. #30, Nachtrag 3, Festlegung 1 und 7): Modul abilities.js mit der Tabelle ABILITY (nur Verhalten,
// Texte in data.js), Vorrang der Zustände in combat.think, Schreck (scare), Feuer-Merkmal, Raketensalve des Hubschraubers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createWorld, spawn, rebuildHash, nearestEnemy } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { think, ignite, PRONE_UP_T } from '../game/js/combat.js';
import { MORALE, isFleeing, updateCentroids } from '../game/js/morale.js';
import { shieldBlocks } from '../game/js/formation.js';
import { poseUnit, projScreen } from '../game/js/render/pose.js';
import { createFxCore } from '../game/js/render/fxcore.js';
import { UNITS } from '../game/js/data.js';
import { ABILITY, stepAbility, scare, cancelAbility, FIRE_KINDS, isFire, HELI_SALVO } from '../game/js/abilities.js';

const DT = 1 / 60;
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Gegner, der nie zuschlägt (oder schießt) und nicht stirbt
const dummy = (w, type, x, y, team = 'rot') => { const e = spawn(w, type, x, y, team); e.hp = 1e9; e.cd = 1e9; return e; };
const allies = (w, x, y, team = 'blau', n = MORALE.MIN_ALLIES) => {
  for (let k = 0; k < n; k++) { const a = dummy(w, 'krieger', x + k * 24, y, team); a.state = 'stun'; a.stunT = 1e9; }
};
// Schritte über secs s; each(events) sieht die Ereignisse jedes Schritts
const run = (w, secs, each) => {
  for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); if (each) each(w.events); w.events.length = 0; }
};
const rockets = evs => evs.filter(e => e.type === 'shot' && e.kind === 'rocket').length;

/* ---------- Tabelle und Felder ---------- */
test('ABILITY: nur Verhalten (cd, ready, start, update), Texte in data.js', () => {
  assert.ok(ABILITY.heli, 'Hubschrauber hat eine Fähigkeit');
  for (const k in ABILITY) {
    const A = ABILITY[k];
    assert.ok(UNITS[k], k);
    assert.equal(typeof A.cd, 'number');
    for (const f of ['ready', 'start', 'update']) assert.equal(typeof A[f], 'function', `${k}.${f}`);
    assert.ok(!('name' in A) && !('desc' in A) && !('n' in A) && !('d' in A), `${k}: keine Texte`);
  }
  assert.equal(ABILITY.heli.cd, 25);
  assert.ok(UNITS.heli.abil.some(a => a.n === 'Raketensalve'), 'Kartentext in data.js');
});

test('spawn legt die Fähigkeitsfelder an; Abklingzeit versetzt in [0,3, 1] · cd', () => {
  const w = mkWorld();
  const k = spawn(w, 'krieger', 100, 100, 'blau');
  assert.equal(k.abCd, 0); assert.equal(k.abOn, false); assert.equal(k.abT, 0); assert.equal(k.abK, 0); assert.equal(k.fearT, 0);
  for (let i = 0; i < 40; i++) {
    const h = spawn(w, 'heli', 200 + i, 200, 'blau');
    assert.ok(h.abCd >= .3 * 25 - 1e-9 && h.abCd <= 25 + 1e-9, `abCd ${h.abCd}`);
  }
});

/* ---------- Hubschrauber ---------- */
test('Heli feuert 4 Raketen im Abstand von 0,25 s, Schaden Panzerfaust ÷ 2, Splash der Panzerfaust, dann abCd ≈ 25', () => {
  const w = mkWorld(), h = spawn(w, 'heli', 400, 400, 'blau');
  for (let k = 0; k < 5; k++) dummy(w, 'krieger', 560, 380 + k * 10);
  h.abCd = 0;
  const times = [], shots = [];
  let t = 0;
  run(w, 1.2, evs => {
    t += DT;
    for (const e of evs) if (e.type === 'shot' && e.kind === 'rocket') times.push(t);
    for (const p of w.proj) if (p.kind === 'rocket' && !shots.includes(p)) shots.push(p);
  });
  assert.equal(times.length, 4, `Raketen ${times.length}`);
  for (let k = 1; k < 4; k++) assert.ok(Math.abs(times[k] - times[k - 1] - HELI_SALVO.GAP) < 2 * DT, `Abstand ${times[k] - times[k - 1]}`);
  assert.equal(HELI_SALVO.N, 4); assert.equal(HELI_SALVO.GAP, .25);
  for (const p of shots) {
    assert.equal(p.src, h); assert.equal(p.arc, false);
    assert.equal(p.dmg, UNITS.panzerfaust.dmg / 2); assert.equal(p.R, UNITS.panzerfaust.splash);
  }
  assert.equal(h.abOn, false);
  assert.ok(Math.abs(h.abCd - 25) < .6, `abCd ${h.abCd}`);
  // danach wieder normale Salven (Kugeln), keine Raketen bis zur nächsten Abklingzeit
  let more = 0; run(w, 3, evs => { more += rockets(evs); });
  assert.equal(more, 0);
});

test('Raketenspur: die Raketen des Helis nutzen den Raketen-Effekt (Mündungsblitz, Rauchspur aus der Höhe)', () => {
  const w = mkWorld(), h = spawn(w, 'heli', 400, 400, 'blau');
  for (let k = 0; k < 5; k++) dummy(w, 'krieger', 560, 380 + k * 10);
  h.abCd = 0;
  const fx = createFxCore({});
  let flash = 0, smoke = 0, high = false;
  for (let k = 0; k < 30; k++) {
    step(w, DT);
    for (const p of w.proj) if (p.kind === 'rocket' && p.t < 2 * DT) { const s = {}; projScreen(p, s); if (s.y < p.y - 20) high = true; }
    const n0 = fx.store.countByKind();
    fx.consume(w.events); fx.update(DT, w); w.events.length = 0;
    const n1 = fx.store.countByKind();
    flash += Math.max(0, (n1.flash || 0) - (n0.flash || 0)); smoke = Math.max(smoke, n1.smoke || 0);
  }
  assert.ok(flash >= 1, 'Mündungsblitz');
  assert.ok(smoke > 5, `Rauchspur ${smoke}`);
  assert.ok(high, 'Start in Flughöhe des Helis');
});

test('Heli zielt auf die dichteste Feindgruppe in Reichweite, nicht auf eine Gruppe mit mehr Eigenen', () => {
  const w = mkWorld(), h = spawn(w, 'heli', 400, 400, 'blau');
  const lone = dummy(w, 'krieger', 480, 400);                 // nächster Feind, allein
  const grp = [];
  for (let k = 0; k < 6; k++) grp.push(dummy(w, 'krieger', 400 + (k % 3) * 12, 560 + (k / 3 | 0) * 12));
  rebuildHash(w); updateCentroids(w, DT);
  h.abCd = 0; h.rt = 1; h.tg = lone;
  think(w, h, DT);
  assert.equal(h.abOn, true);
  assert.ok(grp.includes(h.tg), 'Gruppe statt Einzelgänger');
  // Eigene in der Gruppe: lieber der Einzelgänger
  const w2 = mkWorld(), h2 = spawn(w2, 'heli', 400, 400, 'blau');
  const lone2 = dummy(w2, 'krieger', 480, 400);
  for (let k = 0; k < 2; k++) dummy(w2, 'krieger', 400 + k * 12, 560);
  for (let k = 0; k < 4; k++) dummy(w2, 'krieger', 400 + k * 12, 574, 'blau');
  rebuildHash(w2); updateCentroids(w2, DT);
  h2.abCd = 0; h2.rt = 1; h2.tg = lone2;
  think(w2, h2, DT);
  assert.equal(h2.abOn, true); assert.equal(h2.tg, lone2);
});

test('Heli ohne Feind in Reichweite löst nicht aus und versucht es später wieder', () => {
  const w = mkWorld(), h = spawn(w, 'heli', 200, 400, 'blau');
  dummy(w, 'krieger', 1200, 400);
  h.abCd = 0;
  let n = 0; run(w, .4, evs => { n += rockets(evs); });
  assert.equal(n, 0); assert.equal(h.abOn, false); assert.ok(h.abCd > 0, 'Wartezeit bis zum nächsten Versuch');
});

test('Abklingzeiten versetzt: von 50 Helis lösen in keinem Schritt mehr als 5 aus', () => {
  const w = mkWorld(3), H = [];
  for (let k = 0; k < 50; k++) H.push(spawn(w, 'heli', 300 + (k % 10) * 20, 200 + (k / 10 | 0) * 80, 'blau'));
  for (let k = 0; k < 30; k++) dummy(w, 'ritter', 560 + (k % 5) * 30, 200 + (k / 5 | 0) * 60);
  let worst = 0, total = 0;
  for (let t = 0; t < 26; t += DT) {
    const before = H.map(h => h.abOn);
    step(w, DT); w.events.length = 0;
    let n = 0; for (let k = 0; k < H.length; k++) if (!before[k] && H[k].abOn) n++;
    total += n; if (n > worst) worst = n;
  }
  assert.ok(worst <= 5, `höchstens ${worst} im selben Schritt`);
  // fast alle haben ausgelöst (wer im dichten Pulk nur Verbündete in der Schusslinie hat, wartet)
  assert.ok(total >= 40, `ausgelöst ${total}`);
});

test('Abbruch: Betäubung mitten in der Salve setzt abOn zurück, keine weiteren Raketen, Abklingzeit läuft neu', () => {
  const w = mkWorld(), h = spawn(w, 'heli', 400, 400, 'blau');
  for (let k = 0; k < 5; k++) dummy(w, 'krieger', 560, 380 + k * 10);
  h.abCd = 0;
  let n = 0;
  for (let k = 0; k < 200 && h.abK < 2; k++) { step(w, DT); n += rockets(w.events); w.events.length = 0; }
  assert.equal(n, 2); assert.equal(h.abOn, true);
  h.state = 'stun'; h.stunT = 1;   // Flieger werden sonst nie betäubt: hier von Hand
  run(w, DT, evs => { n += rockets(evs); });
  assert.equal(h.abOn, false);
  assert.ok(h.abCd > 24.9, `Abklingzeit neu: ${h.abCd}`);
  run(w, .3, evs => { n += rockets(evs); });
  h.state = 'ok'; h.stunT = 0;
  run(w, 1.5, evs => { n += rockets(evs); });
  assert.equal(n, 2, 'keine weiteren Raketen');
});

test('Abbruch durch Schreck und Rückzug; Fliehende und Erschreckte lösen nichts aus', () => {
  // Schreck mitten in der Salve
  const w = mkWorld(), h = spawn(w, 'heli', 400, 400, 'blau');
  for (let k = 0; k < 5; k++) dummy(w, 'krieger', 560, 380 + k * 10);
  h.abCd = 0;
  let n = 0;
  for (let k = 0; k < 200 && h.abK < 1; k++) { step(w, DT); n += rockets(w.events); w.events.length = 0; }
  scare(w, h, 2);
  assert.equal(h.abOn, false);
  run(w, 1, evs => { n += rockets(evs); });
  assert.equal(n, 1);
  // Rückzug mitten in der Salve
  const w2 = mkWorld(), h2 = spawn(w2, 'heli', 400, 400, 'blau');
  for (let k = 0; k < 5; k++) dummy(w2, 'krieger', 560, 380 + k * 10);
  allies(w2, 100, 700);
  h2.abCd = 0; let n2 = 0;
  for (let k = 0; k < 200 && h2.abK < 1; k++) { step(w2, DT); n2 += rockets(w2.events); w2.events.length = 0; }
  h2.hp = .2 * UNITS.heli.hp;
  run(w2, 1, evs => { n2 += rockets(evs); });
  assert.equal(h2.flee, true); assert.equal(h2.abOn, false); assert.equal(n2, 1);
  // erschreckt mit fertiger Abklingzeit: keine Salve
  const w3 = mkWorld(), h3 = spawn(w3, 'heli', 400, 400, 'blau');
  for (let k = 0; k < 5; k++) dummy(w3, 'krieger', 560, 380 + k * 10);
  scare(w3, h3, 1); h3.abCd = 0;
  let n3 = 0; run(w3, .9, evs => { n3 += rockets(evs); });
  assert.equal(n3, 0); assert.equal(h3.abOn, false);
});

test('cancelAbility und stepAbility: ohne Fähigkeit nichts, nach dem Abbruch volle Abklingzeit', () => {
  const w = mkWorld(), k = spawn(w, 'krieger', 100, 100, 'blau');
  assert.equal(stepAbility(w, k, DT), false);
  cancelAbility(w, k); assert.equal(k.abCd, 0);
  const h = spawn(w, 'heli', 400, 400, 'blau');
  h.abOn = true; h.abK = 2; h.abT = .5;
  cancelAbility(w, h);
  assert.equal(h.abOn, false); assert.equal(h.abK, 0); assert.equal(h.abT, 0); assert.equal(h.abCd, 25);
});

/* ---------- Schreck ---------- */
test('scare: mit vollen LP flieht die Einheit sec s lang ohne Erholung und kehrt dann zurück', () => {
  const w = mkWorld(), u = spawn(w, 'krieger', 600, 400, 'blau');
  allies(w, 200, 700);
  const e = dummy(w, 'krieger', 640, 400); e.state = 'stun'; e.stunT = 1e9;   // steht still
  run(w, DT);
  scare(w, u, 2);
  assert.equal(u.fearT, 2); assert.equal(isFleeing(u), true); assert.equal(u.flee, false);
  let swung = false, maxSp = 0, steps = 0;
  while (u.fearT > 0 && steps < 1000) {
    step(w, DT); w.events.length = 0; steps++;
    if (u.swingT > 0) swung = true;
    maxSp = Math.max(maxSp, Math.hypot(u.mx, u.my));
  }
  assert.ok(Math.abs(steps * DT - 2) < 2 * DT, `Dauer ${steps * DT}`);
  assert.equal(swung, false, 'kein Schlag');
  assert.ok(Math.abs(maxSp - UNITS.krieger.speed * MORALE.SPEED) < 1e-6, `Fluchttempo ${maxSp}`);
  assert.ok(dist(u, e) > 80, `weggelaufen: ${dist(u, e)}`);
  assert.equal(isFleeing(u), false); assert.equal(u.flee, false);
  assert.equal(u.hp, UNITS.krieger.hp);
  // zurück in den Kampf: läuft auf den Gegner zu
  const d0 = dist(u, e);
  run(w, 1);
  assert.ok(dist(u, e) < d0 - 30, `kehrt zurück: ${d0} → ${dist(u, e)}`);
});

test('scare: keine Erholung (auch ohne Feind in SAFE_R), Ende nicht über die 60-%-Regel, längster Schreck gilt', () => {
  const w = mkWorld(), u = spawn(w, 'krieger', 600, 400, 'blau');
  allies(w, 200, 700);
  dummy(w, 'krieger', 1000, 400);   // weiter als SAFE_R
  u.hp = .5 * UNITS.krieger.hp;
  scare(w, u, 3); scare(w, u, 1);
  assert.equal(u.fearT, 3);
  run(w, 2.9);
  assert.equal(u.hp, .5 * UNITS.krieger.hp, 'keine Erholung');
  assert.equal(isFleeing(u), true);
  // geheilt über 60 %: der Schreck läuft weiter
  u.hp = UNITS.krieger.hp; run(w, DT);
  assert.equal(isFleeing(u), true);
  run(w, .2);
  assert.equal(isFleeing(u), false);
});

test('scare: endet der Schreck unter 25 % LP, übernimmt der normale Rückzug', () => {
  const w = mkWorld(), u = spawn(w, 'krieger', 600, 400, 'blau');
  allies(w, 200, 700);
  dummy(w, 'krieger', 650, 400);
  u.hp = .2 * UNITS.krieger.hp;
  scare(w, u, .5);
  run(w, .55);
  assert.equal(u.flee, true, 'Rückzug nach dem Schreck');
});

test('scare: erschreckter Römer verliert den Schildschutz und verlässt den Block', () => {
  const w = mkWorld(), R = [];
  for (let k = 0; k < 8; k++) R.push(spawn(w, 'roemer', 300 - (k % 4) * 26, 400 + ((k / 4 | 0) - .5) * 26, 'blau'));
  dummy(w, 'schuetze', 1200, 400);
  run(w, .6);
  const u = R[0];
  assert.equal(u.formOn, true);
  assert.equal(shieldBlocks(u, 'arrow', -u.formAx, -u.formAy), true, 'Schild hält von vorn');
  scare(w, u, 2);
  assert.equal(u.formOn, false); assert.equal(u.formFree, false); assert.equal(u.form, 0);
  assert.equal(shieldBlocks(u, 'arrow', -u.formAx, -u.formAy), false, 'kein Schildschutz');
  run(w, 1);   // Neubildungen: der Erschreckte bleibt draußen, die anderen marschieren weiter
  assert.equal(u.formOn, false); assert.equal(u.form, 0);
  for (const f of w.formations) assert.ok(!f.m.includes(u));
  assert.ok(R.slice(1).some(r => r.formOn), 'Block ohne ihn');
});

test('scare: erschrecktes liegendes MG steht erst auf, dann flieht es', () => {
  const w = mkWorld(), u = spawn(w, 'mg', 600, 400, 'blau');
  u.stance = 'prone';
  const e = dummy(w, 'schuetze', 750, 400);
  allies(w, 300, 420);
  rebuildHash(w); updateCentroids(w, DT);
  scare(w, u, 2);
  think(w, u, DT);
  assert.equal(u.stance, 'up');
  assert.equal(u.mx, 0); assert.equal(u.my, 0);
  for (let t = 0; t < PRONE_UP_T + .05; t += DT) { w.time += DT; think(w, u, DT); }
  assert.equal(u.stance, 'stand');
  assert.ok(u.mx < 0, 'läuft weg');
  assert.ok(e.alive);
});

test('scare trifft keine Toten; Erschreckte zählen überall als fliehend (isFleeing)', () => {
  const w = mkWorld();
  const d = spawn(w, 'krieger', 100, 100, 'blau'); d.alive = false;
  scare(w, d, 2); assert.equal(d.fearT, 0);
  // Zielwahl: ein erschreckter Gegner zählt doppelt so weit
  const c = spawn(w, 'krieger', 300, 400, 'blau');
  const fr = spawn(w, 'krieger', 360, 400, 'rot');
  const fi = spawn(w, 'krieger', 300, 500, 'rot');
  rebuildHash(w);
  assert.equal(nearestEnemy(w, c), fr);
  scare(w, fr, 2);
  assert.equal(nearestEnemy(w, c), fi);
  // Angstaugen
  assert.equal(poseUnit(fr, 1).fear, 1);
  assert.equal(poseUnit(fi, 1).fear, 0);
  // Schwerpunkt ohne Erschreckte
  w.centT = 0; updateCentroids(w, DT);
  assert.equal(w.cent.get('rot').n, 1);
});

test('att: Erschreckte zählen nicht als Angreifer; Sanitäter heilt Erschreckte zuerst', () => {
  const w = mkWorld(), e = dummy(w, 'krieger', 700, 400);
  allies(w, 200, 700);
  const fi = spawn(w, 'krieger', 750, 400, 'blau');
  const fr = spawn(w, 'krieger', 650, 400, 'blau');
  run(w, .1);
  scare(w, fr, 2);
  run(w, .1);
  assert.equal(fi.tg, e); assert.equal(e.att, 1);
  const s = spawn(w, 'sani', 300, 400, 'blau');
  const near = spawn(w, 'krieger', 330, 400, 'blau'); near.hp = 40;
  fr.hp = 50; fr.x = 300; fr.y = 650;
  rebuildHash(w);
  s.rt = 0; think(w, s, DT);
  assert.equal(s.tg, fr);
});

/* ---------- Feuer ---------- */
test('isFire: Feuerarten mit gemeinsamem Merkmal, Brand über Zeit zählt als Feuer', () => {
  assert.deepEqual([...FIRE_KINDS].sort(), ['breath', 'burn', 'fire', 'firearrow', 'phoenix']);
  for (const k of FIRE_KINDS) assert.equal(isFire(k), true, k);
  for (const k of ['rocket', 'blast', 'melee', 'arrow', 'bullet']) assert.equal(isFire(k), false, k);
  // Brand trifft den Geist voll (nur Feuer trifft ihn voll) und den Panzer mit dem Feuerfaktor
  const w = mkWorld();
  const g = spawn(w, 'geist', 300, 300, 'blau'), p = spawn(w, 'panzer', 600, 300, 'blau');
  rebuildHash(w);
  ignite(w, g, 0, null); ignite(w, p, 0, null);
  const g0 = g.hp, p0 = p.hp;
  for (let k = 0; k < 30; k++) { think(w, g, DT); think(w, p, DT); }
  assert.ok(Math.abs(g0 - g.hp - 8 * .5) < 1e-6, `Geist ${g0 - g.hp}`);
  assert.ok(Math.abs(p0 - p.hp - 8 * .5 * .6) < 1e-6, `Panzer ${p0 - p.hp}`);
});

/* ---------- Ladereihenfolge ---------- */
// world → abilities → combat → formation … bilden Importkreise: jedes Logikmodul muss als erstes geladene Datei
// funktionieren (kein Zugriff auf importierte Werte beim Laden). Je Modul ein eigener Prozess.
test('Importkreise: jedes Logikmodul lädt als Einstieg', () => {
  const mods = ['data', 'rng', 'world', 'physics', 'pathing', 'muzzle', 'formation', 'morale', 'abilities', 'combat', 'sim',
    'bench', 'paint', 'cards', 'save', 'camera', 'wheel', 'render/pose', 'render/fxcore', 'render/rig', 'render/quads'];
  for (const m of mods) {
    const url = new URL(`../game/js/${m}.js`, import.meta.url).href;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)});`], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${m}: ${r.stderr}`);
  }
});
