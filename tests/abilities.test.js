// Fähigkeiten (Spez. #30, Nachtrag 3, Festlegung 1 und 7): Modul abilities.js mit der Tabelle ABILITY (nur Verhalten,
// Texte in data.js), Vorrang der Zustände in combat.think, Schreck (scare), Feuer-Merkmal, Raketensalve des Hubschraubers.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createWorld, spawn, rebuildHash, nearestEnemy } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { think, ignite, attack, PRONE_UP_T, BURN_MAX_GEN, BURN_T } from '../game/js/combat.js';
import { integrate } from '../game/js/physics.js';
import { MORALE, isFleeing, updateCentroids } from '../game/js/morale.js';
import { shieldBlocks, SHIELD_KINDS } from '../game/js/formation.js';
import { poseUnit, projScreen } from '../game/js/render/pose.js';
import { createFxCore } from '../game/js/render/fxcore.js';
import { UNITS } from '../game/js/data.js';
import {
  ABILITY, stepAbility, scare, cancelAbility, FIRE_KINDS, isFire, HELI_SALVO,
  FIRE_ARROWS, HEAL_WAVE, GRENADE, BARRAGE, RAM, HOWL, ROAR, SPOOK, DIVE, FEARLESS, SHARE_JITTER,
} from '../game/js/abilities.js';

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
  const mods = ['data', 'rng', 'world', 'physics', 'pathing', 'muzzle', 'formation', 'morale', 'abilities', 'spells', 'combat', 'sim',
    'bench', 'paint', 'cards', 'save', 'camera', 'wheel', 'render/pose', 'render/fxcore', 'render/rig', 'render/quads'];
  for (const m of mods) {
    const url = new URL(`../game/js/${m}.js`, import.meta.url).href;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)});`], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${m}: ${r.stderr}`);
  }
});

/* ---------- Task 2: Fähigkeiten der bestehenden Einheiten (#30) ---------- */
const shots = (evs, kind) => evs.filter(e => e.type === 'shot' && e.kind === kind).length;
const ABIL_NAMES = {
  heli: 'Raketensalve', schuetze: 'Brandpfeile', sani: 'Heilwelle', soldat: 'Handgranate', moerser: 'Sperrfeuer',
  panzer: 'Ramme', wolf: 'Heulen', baer: 'Brüllen', geist: 'Spuk', drache: 'Sturzflug',
};
// Pfeil im Bogen, der im nächsten Schritt bei (x1, y1) landet
const arcShot = (w, kind, src, x0, y0, x1, y1) => w.proj.push({ kind, arc: true, x0, y0, x1, y1, t: 0, dur: .01, h: 0,
  x: x0, y: y0, z: 0, tz: 0, f: src.team, src, dmg: 12, R: 0 });

test('Tabelle: neun neue Fähigkeiten mit den Abklingzeiten aus #30, Kartentexte in data.js', () => {
  const cds = { schuetze: 30, sani: 20, soldat: 15, moerser: 30, panzer: 25, wolf: 25, baer: 20, geist: 15, drache: 30, heli: 25 };
  assert.deepEqual(Object.keys(ABILITY).sort(), Object.keys(cds).sort());
  for (const k in cds) {
    assert.equal(ABILITY[k].cd, cds[k], k);
    assert.ok(UNITS[k].abil.some(a => a.n === ABIL_NAMES[k]), `${k}: Kartentext ${ABIL_NAMES[k]}`);
  }
  // ohne Fähigkeit bleiben Krieger, Ritter, Reiter, Grenadier, Bienen, MG, Scharfschütze, Panzerfaust (#30)
  for (const k of ['krieger', 'ritter', 'reiter', 'grenadier', 'biene', 'mg', 'sniper', 'panzerfaust']) assert.equal(ABILITY[k], undefined, k);
});

test('stepAbility: Typ ohne Fähigkeit (Typwechsel, Froschfluch) setzt ein hängendes abOn zurück', () => {
  const w = mkWorld(), k = spawn(w, 'krieger', 100, 100, 'blau');
  k.abOn = true; k.abT = .4; k.abK = 2;
  assert.equal(stepAbility(w, k, DT), false);
  assert.equal(k.abOn, false); assert.equal(k.abT, 0); assert.equal(k.abK, 0);
});

test('Brandpfeile: 3 Brandpfeile auf das Ziel, Treffer zünden an, dann abCd ≈ 30', () => {
  const w = mkWorld(), s = spawn(w, 'schuetze', 400, 400, 'blau');
  const K = [];
  for (let k = 0; k < 5; k++) { const e = dummy(w, 'krieger', 560, 380 + k * 10); e.state = 'stun'; e.stunT = 1e9; K.push(e); }
  s.abCd = 0; s.cd = 1e9; s.tg = K[0]; s.rt = 5;
  let n = 0, ign = 0;
  run(w, 1.5, evs => { n += shots(evs, 'firearrow'); ign += evs.filter(e => e.type === 'ignite').length; });
  assert.equal(n, FIRE_ARROWS.N); assert.equal(FIRE_ARROWS.N, 3);
  assert.ok(ign >= 1, `ignite ${ign}`);
  assert.equal(s.abOn, false);
  assert.ok(Math.abs(s.abCd - 30) < 1.6, `abCd ${s.abCd}`);
  // die Salve ersetzt die nächsten Pfeile: danach lädt er für sie nach
  assert.ok(s.cd >= 1e9 - 2, 'cd bleibt hoch');
});

test('Brandpfeile: eigene Schützen bis SHARE px laden mit neu, die Salve kostet die nächsten Pfeile', () => {
  const w = mkWorld(), s = spawn(w, 'schuetze', 400, 400, 'blau');
  const near = spawn(w, 'schuetze', 400 + FIRE_ARROWS.SHARE - 20, 400, 'blau'), far = spawn(w, 'schuetze', 400, 400 + FIRE_ARROWS.SHARE + 20, 'blau');
  const foe = spawn(w, 'schuetze', 560, 380, 'rot');
  const e = dummy(w, 'krieger', 560, 400);
  for (const u of [near, far, foe]) { u.abCd = 2; u.cd = 1e9; }
  rebuildHash(w); updateCentroids(w, DT);
  s.abCd = 0; s.tg = e; s.rt = 5; s.cd = 0;
  think(w, s, DT);
  assert.equal(s.abOn, true);
  const cd = ABILITY.schuetze.cd;
  assert.ok(near.abCd >= cd && near.abCd <= cd * (1 + SHARE_JITTER), `geteilt ${near.abCd}`);
  assert.equal(far.abCd, 2); assert.equal(foe.abCd, 2);
  run(w, .5);
  assert.equal(s.abOn, false);
  assert.ok(s.cd > (FIRE_ARROWS.N - 1) * UNITS.schuetze.cd - .6, `Nachladen ${s.cd}`);
});

test('Brandpfeile: Römerschild hält den Brandpfeil ab, er zündet nicht; sonst Treffer wie ein Pfeil, dann Brand', () => {
  assert.ok(SHIELD_KINDS.has('firearrow'));
  assert.ok(isFire('firearrow'));
  const w = mkWorld(), R = [];
  for (let k = 0; k < 8; k++) R.push(spawn(w, 'roemer', 300 - (k % 4) * 26, 400 + ((k / 4 | 0) - .5) * 26, 'blau'));
  const s = dummy(w, 'schuetze', 1200, 400);
  run(w, .6);
  const u = R[0];
  assert.equal(u.formOn, true);
  // von vorn auf den Block (Flugrichtung gegen die Blickrichtung): geblockt, kein Feuer
  arcShot(w, 'firearrow', s, u.x + u.formAx * 200, u.y + u.formAy * 200, u.x, u.y);
  const evs = [];
  step(w, DT); evs.push(...w.events); w.events.length = 0;
  assert.ok(evs.some(e => e.type === 'block' && e.kind === 'firearrow'), 'Schildblock');
  assert.equal(evs.filter(e => e.type === 'ignite').length, 0);
  assert.equal(u.burnT, 0);
  // Ritter ohne Schild: Schaden wie ein Pfeil (×0,35), dann brennt er (ohne Überspringen: höchste Generation)
  const w2 = mkWorld(), s2 = dummy(w2, 'schuetze', 100, 400), r = dummy(w2, 'ritter', 300, 400);
  r.hp = 200;
  arcShot(w2, 'firearrow', s2, 100, 400, 300, 400);
  w2.rng = () => .5;
  step(w2, DT);
  assert.ok(w2.events.some(e => e.type === 'ignite'), 'zündet');
  assert.equal(r.burnGen, BURN_MAX_GEN); assert.ok(r.burnT > 0);
  assert.ok(Math.abs(200 - r.hp - 12 * .35) < 1e-6, `Schaden ${200 - r.hp}`);
});

test('Heilwelle: Verbündete in 90 px +25 % ihrer max. LP (gedeckelt), Feinde und Ferne nicht', () => {
  const w = mkWorld(), s = spawn(w, 'sani', 400, 400, 'blau');
  s.cd = 1e9;
  const a = spawn(w, 'krieger', 440, 400, 'blau'), b = spawn(w, 'ritter', 400, 460, 'blau'), c = spawn(w, 'krieger', 340, 420, 'blau');
  const far = spawn(w, 'krieger', 600, 400, 'blau'), foe = dummy(w, 'krieger', 420, 350);
  a.hp = .3 * UNITS.krieger.hp; b.hp = .5 * UNITS.ritter.hp; c.hp = .9 * UNITS.krieger.hp; far.hp = 10; foe.hp = 10;
  rebuildHash(w); updateCentroids(w, DT);
  s.abCd = 0;
  think(w, s, DT);
  assert.equal(HEAL_WAVE.R, 90); assert.equal(HEAL_WAVE.FRAC, .25);
  assert.ok(Math.abs(a.hp - .55 * UNITS.krieger.hp) < 1e-9, `a ${a.hp}`);
  assert.ok(Math.abs(b.hp - .75 * UNITS.ritter.hp) < 1e-9, `b ${b.hp}`);
  assert.equal(c.hp, UNITS.krieger.hp, 'gedeckelt');
  assert.equal(far.hp, 10); assert.equal(foe.hp, 10);
  assert.ok(w.events.some(e => e.type === 'ability' && e.k === 'heal'), 'Effekt');
  assert.ok(Math.abs(s.abCd - 20) < 1e-9);
  // nur ein Verletzter: keine Welle, neuer Versuch bald
  const w2 = mkWorld(), s2 = spawn(w2, 'sani', 400, 400, 'blau'), d = spawn(w2, 'krieger', 440, 400, 'blau');
  d.hp = 20; s2.cd = 1e9; rebuildHash(w2); s2.abCd = 0;
  think(w2, s2, DT);
  assert.equal(d.hp, 20); assert.ok(s2.abCd > 0 && s2.abCd < 1);
});

test('Handgranate: ein Bogenwurf bomb (R 36, Schaden 24) vom Soldaten, nicht in eine Gruppe mit mehr Eigenen', () => {
  const w = mkWorld(), s = spawn(w, 'soldat', 400, 400, 'blau');
  s.tg = dummy(w, 'krieger', 530, 400); s.rt = 5;
  s.abCd = 0; s.cd = 1e9;
  let n = 0; const bombs = [];
  run(w, .3, evs => { n += shots(evs, 'bomb'); for (const p of w.proj) if (p.kind === 'bomb' && !bombs.includes(p)) bombs.push(p); });
  assert.equal(n, 1);
  assert.equal(bombs.length, 1);
  assert.equal(bombs[0].src, s); assert.equal(bombs[0].arc, true);
  assert.equal(bombs[0].dmg, GRENADE.DMG); assert.equal(bombs[0].R, GRENADE.R);
  assert.equal(GRENADE.DMG, 24); assert.equal(GRENADE.R, 36);
  // mehr Eigene als Feinde am Ziel: kein Wurf
  const w2 = mkWorld(), s2 = spawn(w2, 'soldat', 400, 400, 'blau');
  s2.tg = dummy(w2, 'krieger', 530, 400); s2.rt = 5;
  for (let k = 0; k < 2; k++) { const a = dummy(w2, 'krieger', 525 + k * 10, 420, 'blau'); a.state = 'stun'; a.stunT = 1e9; }
  s2.abCd = 0; s2.cd = 1e9;
  let n2 = 0; run(w2, .3, evs => { n2 += shots(evs, 'bomb'); });
  assert.equal(n2, 0);
});

test('Sperrfeuer: 3 Mörsergranaten im Abstand von 0,4 s rund um das Ziel', () => {
  const w = mkWorld(), m = spawn(w, 'moerser', 300, 400, 'blau');
  const e = dummy(w, 'krieger', 620, 400); e.state = 'stun'; e.stunT = 1e9;
  m.abCd = 0; m.cd = 1e9; m.tg = e; m.rt = 5;
  const times = [], pts = [];
  let t = 0;
  run(w, 1.2, evs => { t += DT; for (const v of evs) if (v.type === 'shot' && v.kind === 'mortar') { times.push(t); pts.push([v.tx, v.ty]); } });
  assert.equal(times.length, 3);
  for (let k = 1; k < 3; k++) assert.ok(Math.abs(times[k] - times[k - 1] - BARRAGE.GAP) < 2 * DT, `Abstand ${times[k] - times[k - 1]}`);
  for (const [x, y] of pts) assert.ok(Math.hypot(x - e.x, y - e.y) <= BARRAGE.SPREAD + 1e-6, 'um das Ziel');
  assert.equal(m.abOn, false);
});

test('Ramme: 1,2 s mit dreifachem Tempo aufs Ziel, schiebt Eigene weg ohne Schaden, 20 Schaden an Feinden', () => {
  const w = mkWorld(), p = spawn(w, 'panzer', 300, 400, 'blau');
  p.cd = 1e9; p.mgCd = 1e9;   // ohne Kanone und Bug-MG (Nachtrag 4): nur der Rammschaden zählt
  const foe = dummy(w, 'krieger', 440, 400); foe.state = 'stun'; foe.stunT = 1e9;
  const own = [spawn(w, 'krieger', 345, 404, 'blau'), spawn(w, 'krieger', 380, 395, 'blau')];
  for (const a of own) { a.cd = 1e9; a.state = 'stun'; a.stunT = 1e9; }
  const pos = own.map(a => [a.x, a.y]);
  rebuildHash(w); updateCentroids(w, DT);
  p.abCd = 0; p.tg = foe; p.rt = 5;
  let maxSp = 0;
  const x0 = p.x;
  for (let k = 0; k < 90; k++) { step(w, DT); w.events.length = 0; if (p.abOn) maxSp = Math.max(maxSp, Math.hypot(p.mx, p.my)); }
  assert.ok(Math.abs(maxSp - UNITS.panzer.speed * RAM.SPEED) < 1e-6, `Tempo ${maxSp}`);
  assert.equal(RAM.T, 1.2); assert.equal(RAM.DMG, 20);
  assert.ok(p.x - x0 > 80, `gefahren ${p.x - x0}`);
  own.forEach((a, i) => {
    assert.equal(a.hp, UNITS.krieger.hp, 'Eigene unverletzt');
    assert.ok(Math.hypot(a.x - pos[i][0], a.y - pos[i][1]) > 15, `verschoben ${Math.hypot(a.x - pos[i][0], a.y - pos[i][1])}`);
  });
  const lost = 1e9 - foe.hp;
  assert.ok(Math.abs(lost - RAM.DMG) < 1e-6, `Feind ${lost}`);
  assert.equal(p.abOn, false);
});

test('Heulen: Rudelmitglieder in 120 px 5 s Tempo und Biss ×1,3, Fremde nicht; das ganze Rudel lädt neu', () => {
  const w = mkWorld(), W = [];
  for (let k = 0; k < 4; k++) W.push(spawn(w, 'wolf', 400 + k * 18, 400, 'blau'));
  const lone = spawn(w, 'wolf', 700, 700, 'blau'), red = spawn(w, 'wolf', 420, 440, 'rot'), kr = spawn(w, 'krieger', 420, 370, 'blau');
  red.cd = 1e9; red.state = 'stun'; red.stunT = 1e9;
  const prey = dummy(w, 'krieger', 560, 400);
  for (const u of [...W, lone, kr, red]) u.abCd = 100;
  W[0].abCd = 0; W[0].tg = prey;
  rebuildHash(w); updateCentroids(w, DT);
  think(w, W[0], DT);
  for (const u of W) {
    assert.equal(u.buffT, HOWL.T); assert.equal(u.spdMul, HOWL.SPEED); assert.equal(u.dmgMul, HOWL.DMG);
    assert.ok(u.abCd >= ABILITY.wolf.cd - 1e-9, `Rudel lädt neu: ${u.abCd}`);
  }
  for (const u of [lone, red, kr]) { assert.equal(u.buffT, 0); assert.equal(u.spdMul, 1); assert.equal(u.dmgMul, 1); }
  assert.equal(HOWL.R, 120); assert.equal(HOWL.T, 5);
  assert.ok(w.events.some(e => e.type === 'ability' && e.k === 'howl'));
  // Tempo: die Wunschbewegung wirkt ×1,3
  const u = W[1]; u.mx = 50; u.my = 0; u.vx = 0; u.vy = 0;
  for (const v of w.units) if (v !== u) v.alive = false;
  const xa = u.x; integrate(w, DT);
  assert.ok(Math.abs(u.x - xa - 50 * 1.3 * DT) < 1e-9, `Tempo ${(u.x - xa) / DT}`);
  // Biss: ×1,3 (dazu der Rudelbonus ×1,4)
  const w2 = mkWorld(), P = [];
  for (let k = 0; k < 3; k++) P.push(spawn(w2, 'wolf', 400 + k * 12, 400, 'blau'));
  const t = dummy(w2, 'krieger', 430, 420); t.fx = 0; t.fy = 0;
  rebuildHash(w2); w2.rng = () => .5;
  P[0].buffT = 1; P[0].spdMul = HOWL.SPEED; P[0].dmgMul = HOWL.DMG; P[0].cd = 0;
  const hp0 = t.hp;
  attack(w2, P[0], t, 30, 30, 20);
  assert.ok(Math.abs(hp0 - t.hp - UNITS.wolf.dmg * 1.4 * 1.3) < 1e-6, `Biss ${hp0 - t.hp}`);
  // nach 5 s vorbei
  const w3 = mkWorld(), x = spawn(w3, 'wolf', 100, 100, 'blau');
  x.buffT = HOWL.T; x.spdMul = HOWL.SPEED; x.dmgMul = HOWL.DMG; x.abCd = 100;
  rebuildHash(w3);
  for (let k = 0; k < Math.ceil(HOWL.T / DT) + 1; k++) think(w3, x, DT);
  assert.equal(x.buffT, 0); assert.equal(x.spdMul, 1); assert.equal(x.dmgMul, 1);
});

test('Brüllen: Feinde in 80 px erschrecken 2 s, außerhalb, Eigene und Panzer nicht', () => {
  const w = mkWorld(), b = spawn(w, 'baer', 400, 400, 'blau');
  b.cd = 1e9;
  const in1 = dummy(w, 'krieger', 440, 400), in2 = dummy(w, 'krieger', 400, 460);
  const out = dummy(w, 'krieger', 400, 520), own = spawn(w, 'krieger', 350, 400, 'blau');
  const tank = dummy(w, 'panzer', 330, 450);
  rebuildHash(w); updateCentroids(w, DT);
  b.abCd = 0;
  think(w, b, DT);
  assert.equal(in1.fearT, ROAR.T); assert.equal(in2.fearT, ROAR.T);
  assert.equal(isFleeing(in1), true);
  assert.equal(out.fearT, 0); assert.equal(own.fearT, 0); assert.equal(tank.fearT, 0);
  assert.ok(FEARLESS.has('panzer') && FEARLESS.has('heli') && FEARLESS.has('drache'));
  assert.equal(ROAR.R, 80); assert.equal(ROAR.T, 2);
  assert.ok(w.events.some(e => e.type === 'ability' && e.k === 'roar'));
  assert.equal(w.events.filter(e => e.type === 'fear').length, 2);
});

test('Spuk: genau eine feindliche Einheit (das Ziel) erschrickt 2,5 s', () => {
  const w = mkWorld(), g = spawn(w, 'geist', 400, 400, 'blau');
  g.cd = 1e9;
  const E = [dummy(w, 'krieger', 440, 400), dummy(w, 'krieger', 460, 420), dummy(w, 'krieger', 470, 380)];
  rebuildHash(w); updateCentroids(w, DT);
  g.tg = E[0]; g.rt = 1; g.abCd = 0;
  think(w, g, DT);
  assert.equal(E.filter(e => e.fearT > 0).length, 1);
  assert.equal(E[0].fearT, SPOOK.T); assert.equal(SPOOK.T, 2.5);
  assert.ok(Math.abs(g.abCd - 15) < 1e-9);
  assert.ok(w.events.some(e => e.type === 'ability' && e.k === 'spook'));
});

test('Sturzflug: sinkt auf z 6, landet, schleudert alle Körper im Kreis weg, 30 Schaden nur an Feinden, steigt wieder', () => {
  const w = mkWorld(), d = spawn(w, 'drache', 400, 400, 'blau');
  d.cd = 1e9;
  const F = [];
  for (let k = 0; k < 4; k++) { const e = dummy(w, 'krieger', 480 + (k % 2) * 14, 392 + (k >> 1) * 14); e.state = 'stun'; e.stunT = 1e9; F.push(e); }
  const own = spawn(w, 'krieger', 500, 440, 'blau'); own.cd = 1e9; own.state = 'stun'; own.stunT = 1e9;
  const pos = [...F, own].map(u => [u.x, u.y]);
  rebuildHash(w); updateCentroids(w, DT);
  d.abCd = 0; d.tg = F[0]; d.rt = 5;
  let minZ = Infinity, steps = 0, started = false;
  const evs = [];
  while (steps < 300) {
    step(w, DT); evs.push(...w.events); w.events.length = 0; steps++;
    if (d.abOn) started = true;
    minZ = Math.min(minZ, d.z);
    if (started && !d.abOn) break;
  }
  assert.ok(started, 'ausgelöst');
  assert.ok(minZ <= DIVE.Z + 1e-6, `tiefster Punkt ${minZ}`);
  assert.equal(d.z, UNITS.drache.flyZ, 'wieder auf Flughöhe');
  assert.equal(DIVE.R, 90); assert.equal(DIVE.DMG, 30); assert.equal(DIVE.Z, 6);
  [...F, own].forEach((u, i) => assert.ok(Math.hypot(u.x - pos[i][0], u.y - pos[i][1]) > 10, `weggeschleudert ${i}`));
  for (const e of F) assert.ok(Math.abs(1e9 - e.hp - DIVE.DMG) < 1e-6, `Schaden ${1e9 - e.hp}`);
  assert.equal(own.hp, UNITS.krieger.hp, 'Eigene unverletzt');
  assert.ok(evs.some(e => e.type === 'ability' && e.k === 'dive'));
  assert.ok(steps * DT < 2.5, `Dauer ${steps * DT}`);
});

test('Sturzflug: Abbruch (Schreck) bringt den Drachen weich zurück auf die Flughöhe', () => {
  const w = mkWorld(), d = spawn(w, 'drache', 400, 400, 'blau');
  d.cd = 1e9;
  let e0 = null;
  for (let k = 0; k < 4; k++) { const e = dummy(w, 'krieger', 480 + (k % 2) * 14, 392 + (k >> 1) * 14); e.state = 'stun'; e.stunT = 1e9; e0 = e0 || e; }
  d.abCd = 0; d.tg = e0; d.rt = 5;
  for (let k = 0; k < 12; k++) { step(w, DT); w.events.length = 0; }
  assert.equal(d.abOn, true); assert.ok(d.z < UNITS.drache.flyZ);
  const z0 = d.z;
  scare(w, d, .1);
  step(w, DT); w.events.length = 0;
  assert.equal(d.abOn, false);
  assert.ok(d.z >= z0 && d.z < UNITS.drache.flyZ, 'kein Sprung');
  run(w, 1);
  assert.equal(d.z, UNITS.drache.flyZ);
});

test('Fähigkeiten-Effekte: kurz (unter 1,5 s), im Budget, ohne Dauerflackern', () => {
  for (const k of ['heal', 'roar', 'howl', 'spook', 'ram', 'dive']) {
    const fx = createFxCore({}, { rand: () => .5 });
    fx.consume([{ type: 'ability', k, x: 300, y: 300, z: 0, R: 90 }, { type: 'fear', x: 300, y: 300, z: 0 }]);
    assert.ok(fx.store.count > 0, `${k}: Partikel`);
    assert.ok(fx.store.count < 60, `${k}: ${fx.store.count} Partikel`);
    for (let t = 0; t < 1.5; t += DT) fx.update(DT, null);
    assert.equal(fx.store.count, 0, `${k}: nach 1,5 s vorbei`);
  }
  // Brandpfeil im Flug: kleine Flammenspur
  const w = mkWorld(), s = spawn(w, 'schuetze', 400, 400, 'blau');
  s.tg = dummy(w, 'krieger', 560, 400); s.rt = 5;
  s.abCd = 0; s.cd = 1e9;
  const fx = createFxCore({});
  let fl = 0;
  for (let k = 0; k < 30; k++) { step(w, DT); fx.consume(w.events); w.events.length = 0; fx.update(DT, w); fl = Math.max(fl, fx.store.countByKind().fire || 0); }
  assert.ok(fl >= 1, 'Flammenspur');
  // Bildschirmlage wie beim Pfeil: steigt zur Zielhöhe
  const p = { kind: 'firearrow', arc: true, x0: 0, y0: 0, x1: 100, y1: 0, t: 1, dur: 1, h: 0, tz: 40 }, o = projScreen(p, {});
  assert.ok(Math.abs(o.y + 40) < 1e-9, `Zielhöhe ${o.y}`);
});

test('Erschreckte lösen auch die neuen Fähigkeiten nicht aus', () => {
  const w = mkWorld(), b = spawn(w, 'baer', 400, 400, 'blau');
  const e1 = dummy(w, 'krieger', 440, 400), e2 = dummy(w, 'krieger', 400, 440);
  rebuildHash(w); updateCentroids(w, DT);
  scare(w, b, 1); b.abCd = 0; b.cd = 1e9;
  think(w, b, DT);
  assert.equal(e1.fearT, 0); assert.equal(e2.fearT, 0); assert.equal(b.abOn, false);
});

/* ---------- Fix-Runde 1 ---------- */
test('Sturzflug: Ziel 170 px entfernt, der Aufschlag trifft dort mindestens 5 von 6 Feinden', () => {
  const w = mkWorld(), d = spawn(w, 'drache', 300, 400, 'blau');
  d.cd = 1e9;
  const F = [];
  for (let k = 0; k < 6; k++) { const e = dummy(w, 'krieger', 470 + (k % 3) * 14, 392 + (k / 3 | 0) * 14); e.state = 'stun'; e.stunT = 1e9; F.push(e); }
  rebuildHash(w); updateCentroids(w, DT);
  d.abCd = 0; d.tg = F[0]; d.rt = 5;
  let slam = null;
  for (let k = 0; k < 300 && !slam; k++) { step(w, DT); for (const e of w.events) if (e.type === 'ability' && e.k === 'dive') slam = e; w.events.length = 0; }
  assert.ok(slam, 'Aufschlag');
  assert.ok(Math.hypot(slam.x - 470, slam.y - 392) < 8, `Aufschlag bei ${slam.x.toFixed(0)}, ${slam.y.toFixed(0)}`);
  const hit = F.filter(e => e.hp < 1e9).length;
  assert.ok(hit >= 5, `getroffen ${hit}/6`);
});

// 80 Soldaten gegen 80 Krieger: beim ersten Feindkontakt höchstens GREN_PER_S Granaten in einer Sekunde
const GREN_PER_S = 6;
test(`Handgranate: Gruppen-Abklingzeit, 80 gegen 80 höchstens ${GREN_PER_S} Granaten je Sekunde`, () => {
  const w = createWorld(1600, 900, 3); w.teamMode = true;
  for (let i = 0; i < 80; i++) spawn(w, 'soldat', 300 + (i % 8) * 20, 250 + (i / 8 | 0) * 40, 'blau');
  for (let i = 0; i < 80; i++) spawn(w, 'krieger', 1200 + (i % 8) * 20, 250 + (i / 8 | 0) * 40, 'rot');
  const per = new Map();
  let n = 0;
  for (let s = 0; s < 60 * 30; s++) {
    step(w, DT);
    for (const e of w.events) if (e.type === 'shot' && e.kind === 'bomb') { n++; const k = s / 60 | 0; per.set(k, (per.get(k) || 0) + 1); }
    w.events.length = 0;
  }
  const peak = Math.max(0, ...per.values());
  assert.ok(n >= 3, `geworfen ${n}`);
  assert.ok(peak <= GREN_PER_S, `Spitze ${peak} je s`);
});

/* ---------- Fix-Runde 2 ---------- */
// Entscheidung des Controllers: Brandpfeile zünden das getroffene Ziel an, das Feuer springt nicht über (sonst kippte
// der Brand im gedrängten Römer-Ansturm den Konter roemer > schuetze). Drachenfeuer springt weiter (#21).
test('Brandpfeile: der Getroffene brennt, das Feuer springt nicht auf einen anliegenden Verbündeten über', () => {
  const w = mkWorld(), s = dummy(w, 'schuetze', 100, 400, 'blau');
  const r = dummy(w, 'ritter', 300, 400), nb = dummy(w, 'ritter', 300, 420);   // berühren sich (r 11 + 11 + 6)
  for (const u of [r, nb]) { u.state = 'stun'; u.stunT = 1e9; }
  arcShot(w, 'firearrow', s, 100, 400, 300, 400);
  let burnedR = false;
  for (let t = 0; t < BURN_T + .5; t += DT) { step(w, DT); w.events.length = 0; if (r.burnT > 0) burnedR = true; assert.equal(nb.burnT, 0, 'Nachbar brennt nicht'); }
  assert.ok(burnedR, 'Getroffener brennt');
  assert.ok(r.hp < 1e9, 'Brandschaden');
  // Gegenprobe: Drachenfeuer (Generation 0) springt auf denselben Nachbarn über
  const w2 = mkWorld(), a = dummy(w2, 'ritter', 300, 400), b = dummy(w2, 'ritter', 300, 420);
  for (const u of [a, b]) { u.state = 'stun'; u.stunT = 1e9; }
  rebuildHash(w2);
  ignite(w2, a, 0, null);
  let jumped = false;
  for (let t = 0; t < BURN_T; t += DT) { step(w2, DT); w2.events.length = 0; if (b.burnT > 0) jumped = true; }
  assert.ok(jumped, 'Generation 0 springt über');
});
