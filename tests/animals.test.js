// Neue Tiere (Spez. Nachtrag 3, #33; Task 5): Elefant, Krokodil, Gorilla, Adler, Büffel.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, PLURAL, TERRAIN, CELL } from '../game/js/data.js';
import { createWorld, spawn, rebuildHash, nearestEnemy, outOfMelee, aloft, EAGLE_REACH_Z, HIDE_R, setCell } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { think, attack } from '../game/js/combat.js';
import { ABILITY, FEARLESS, NO_GHOUL, TIERE, BEE_FEAR, CHEST_BEAT, TRAMPLE, HERD, CROC, THROW, SWOOP, GRAB, scare } from '../game/js/abilities.js';
import { isFleeing } from '../game/js/morale.js';
import { unitCard, cardTypes } from '../game/js/cards.js';
import { createFxCore } from '../game/js/render/fxcore.js';
import { poseUnit, BOSS, BOSS_SQUASH, CROC_SUBMERGE } from '../game/js/render/pose.js';
import { bossLayout, rigLayout, drawRigPart } from '../game/js/render/rig.js';

const DT = 1 / 60;
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
// Gegner, der nie zuschlägt und nicht stirbt
const dummy = (w, type, x, y, team = 'rot') => { const e = spawn(w, type, x, y, team); e.hp = 1e9; e.cd = 1e9; e.abCd = 1e9; return e; };
const run = (w, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); if (each) each(w.events); w.events.length = 0; } };
const water = (w, x0, y0, x1, y1) => {
  for (let gy = (y0 / CELL) | 0; gy <= (y1 / CELL) | 0; gy++) for (let gx = (x0 / CELL) | 0; gx <= (x1 / CELL) | 0; gx++) setCell(w, gy * w.GW + gx, TERRAIN.wasser.id);
};
const NEW = ['elefant', 'krokodil', 'gorilla', 'adler', 'bueffel'];

/* ---------- Daten ---------- */
test('Daten: fünf neue Tiere, Tiere hat 8 malbare Einheiten, Texte nur in data.js', () => {
  for (const t of NEW) {
    assert.equal(UNITS[t].cat, 'tiere', t); assert.notEqual(UNITS[t].paint, false, t);
    assert.ok(PLURAL[t], `${t}: Mehrzahl`);
    assert.ok(UNITS[t].abil && UNITS[t].abil.length > 0, `${t}: Kartentext`);
    assert.ok(TIERE.has(t));
    const A = ABILITY[t];
    assert.ok(A && typeof A.ready === 'function' && !('name' in A) && !('desc' in A), `${t}: Fähigkeit ohne Texte`);
    assert.ok(unitCard(t).abil.length > 0);
  }
  const tiere = Object.keys(UNITS).filter(k => UNITS[k].cat === 'tiere' && UNITS[k].paint !== false);
  assert.deepEqual(tiere, ['wolf', 'baer', 'biene', 'elefant', 'krokodil', 'gorilla', 'adler', 'lama', 'bueffel']);   // Lama: 18.11.
  assert.ok(cardTypes().find(g => g.cat === 'tiere').types.includes('elefant'));
  // Abklingzeiten aus dem Plan (Büffel: Herdenzeit HERD.CD in u.herdCd)
  assert.equal(ABILITY.elefant.cd, 20); assert.equal(ABILITY.krokodil.cd, 8); assert.equal(ABILITY.gorilla.cd, 12); assert.equal(ABILITY.adler.cd, 10);
  assert.equal(HERD.CD, 20); assert.equal(HERD.T, 2); assert.equal(HERD.SPEED, 2.2); assert.equal(HERD.MIN, 3); assert.equal(HERD.R, 60);
  assert.equal(TRAMPLE.T, 1.5); assert.equal(CROC.MUL, 2); assert.equal(CROC.STUN, 1); assert.equal(THROW.DIST, 120); assert.equal(THROW.MAXM, 2);
  assert.equal(SWOOP.MUL, 3); assert.equal(CHEST_BEAT.R, 70); assert.equal(CHEST_BEAT.T, 1.5); assert.equal(CHEST_BEAT.CD, 20);
  assert.equal(BEE_FEAR.R, 50); assert.equal(BEE_FEAR.T, 1.5); assert.equal(BEE_FEAR.CD, 6);
  assert.equal(UNITS.adler.fly, 1); assert.equal(UNITS.adler.flyZ, 30); assert.equal(HIDE_R, 60);
  assert.ok(UNITS.elefant.mass >= 20, 'Elefant schwer');
  // Elefant: furchtlos gegen Brüllen und Spuk, nie Ghul (der Frosch-Fluch nutzt dieselbe Liste der Immunen)
  assert.ok(FEARLESS.has('elefant') && NO_GHOUL.has('elefant'));
});

/* ---------- Elefant ---------- */
test('Elefant trampelt Krieger zur Seite: Feinde fliegen und nehmen Schaden, Eigene fliegen nur', () => {
  const w = mkWorld(), e = spawn(w, 'elefant', 300, 400, 'blau');
  const foes = [dummy(w, 'krieger', 400, 392), dummy(w, 'krieger', 430, 410), dummy(w, 'krieger', 470, 400)];
  const own = spawn(w, 'krieger', 360, 405, 'blau'); own.hp = 1e9; own.cd = 1e9;
  const target = dummy(w, 'krieger', 520, 400);
  const y0 = foes.map(f => f.y), hp0 = foes.map(f => f.hp);
  e.abCd = 0; e.beeCd = 1e9;
  rebuildHash(w);
  let started = false, airborne = new Set(), ownHp = own.hp;
  for (let k = 0; k < 150; k++) {
    step(w, DT);
    if (w.events.some(ev => ev.type === 'ability' && ev.k === 'trample')) started = true;
    for (const f of [...foes, own]) if (f.state === 'air') airborne.add(f);
    w.events.length = 0;
  }
  assert.ok(started, 'Trampeln ausgelöst');
  assert.ok(target.alive);
  const flung = foes.filter((f, i) => airborne.has(f) && Math.abs(f.y - y0[i]) > 15);
  assert.ok(flung.length >= 2, `seitlich weggeschleudert: ${foes.map((f, i) => (f.y - y0[i]).toFixed(1))}`);
  assert.ok(foes.some((f, i) => f.hp < hp0[i] - TRAMPLE.DMG * .9), 'Schaden an Feinden');
  assert.ok(airborne.has(own), 'Eigene werden auch weggeschoben');
  assert.ok(own.hp >= ownHp - 1e-9, 'Eigene nehmen keinen Schaden (Festlegung 2)');
  assert.ok(!e.abOn && e.abCd > 15, 'danach Abklingzeit');
});

test('Elefant flieht vor 10 Bienen (höchstens einmal je 6 s); Brüllen, Spuk und eigene Bienen lassen ihn kalt', () => {
  const w = mkWorld(), e = spawn(w, 'elefant', 400, 400, 'blau');
  e.abCd = 1e9;
  for (let i = 0; i < 10; i++) { const b = spawn(w, 'biene', 400 + Math.cos(i) * 45, 400 + Math.sin(i) * 45, 'rot'); b.cd = 1e9; b.hp = 1e9; }
  rebuildHash(w);
  let fears = 0, fled = false;
  run(w, 7.5, evs => { for (const ev of evs) if (ev.type === 'fear' && Math.abs(ev.x - e.x) < 1e-6) fears++; if (isFleeing(e)) fled = true; });
  assert.ok(fled, 'flieht');
  assert.ok(fears >= 1 && fears <= 2, `Schreck ${fears}× in 7,5 s`);
  // eigene Bienen: kein Schreck
  const w2 = mkWorld(), e2 = spawn(w2, 'elefant', 400, 400, 'blau');
  e2.abCd = 1e9;
  for (let i = 0; i < 10; i++) spawn(w2, 'biene', 400 + Math.cos(i) * 40, 400 + Math.sin(i) * 40, 'blau');
  spawn(w2, 'krieger', 900, 400, 'rot');
  rebuildHash(w2);
  run(w2, 1);
  assert.equal(e2.fearT, 0, 'eigene Bienen erschrecken nicht');
  // Brüllen (Bär) und Spuk: der Elefant ist furchtlos
  const w3 = mkWorld(), e3 = spawn(w3, 'elefant', 400, 400, 'blau'), k3 = spawn(w3, 'krieger', 440, 400, 'blau');
  const k4 = spawn(w3, 'krieger', 445, 430, 'blau'); k4.cd = 1e9;   // Brüllen braucht 2 Feinde (ROAR.MIN)
  const bear = spawn(w3, 'baer', 460, 400, 'rot'); bear.abCd = 0;
  e3.abCd = 1e9; k3.cd = 1e9;
  rebuildHash(w3);
  let roared = false;
  run(w3, .5, evs => { if (evs.some(ev => ev.type === 'ability' && ev.k === 'roar')) roared = true; });
  assert.ok(roared, 'Bär brüllte');
  assert.ok(isFleeing(k3), 'Krieger erschrickt');
  assert.equal(e3.fearT, 0, 'Elefant nicht');
});

/* ---------- Krokodil ---------- */
test('Krokodil im Wasser: ein Schütze in 200 px visiert es nicht an, in 50 px schon; nach dem Biss 2 s sichtbar', () => {
  const w = mkWorld();
  water(w, 100, 200, 800, 600);
  const c = spawn(w, 'krokodil', 300, 400, 'blau'), s = dummy(w, 'schuetze', 500, 400);
  rebuildHash(w);
  step(w, DT); w.events.length = 0;
  assert.equal(c.hidden, true, 'versteckt im Wasser');
  c.x = 300; c.y = 400; rebuildHash(w);
  assert.equal(nearestEnemy(w, s), null, '200 px: nicht anvisiert');
  // auch ein schon gewähltes Ziel wird bei der Neuwahl fallen gelassen (Fernkämpfer wie Nahkämpfer)
  s.tg = c; s.rt = 5; think(w, s, DT);
  assert.notEqual(s.tg, c, 'Neuwahl: Ziel abgetaucht');
  c.x = 450; rebuildHash(w);
  assert.equal(nearestEnemy(w, s), c, '50 px: anvisiert');
  c.x = 300; rebuildHash(w);
  c.seenT = CROC.SEEN;
  assert.equal(nearestEnemy(w, s), c, 'nach dem Biss sichtbar');
  // ein normaler Biss macht es sichtbar
  const w2 = mkWorld(); water(w2, 100, 200, 800, 600);
  const c2 = spawn(w2, 'krokodil', 300, 400, 'blau'), k2 = dummy(w2, 'krieger', 320, 400);
  rebuildHash(w2); c2.cd = 0; attack(w2, c2, k2, 20, 20, 0);
  assert.ok(c2.seenT > 1.9);
  // an Land nicht versteckt
  const w3 = mkWorld(), c3 = spawn(w3, 'krokodil', 300, 400, 'blau'); spawn(w3, 'krieger', 900, 400, 'rot');
  rebuildHash(w3); step(w3, DT);
  assert.equal(c3.hidden, false);
});

test('Krokodil: Packen macht doppelten Schaden und betäubt 1 s; im Wasser 1,6-mal, an Land 0,7-mal so schnell', () => {
  const w = mkWorld(), c = spawn(w, 'krokodil', 300, 400, 'blau'), k = spawn(w, 'krieger', 321, 400, 'rot');
  k.hp = 1000; k.cd = 1e9; c.abCd = 0;
  rebuildHash(w);
  let snap = false;
  for (let i = 0; i < 60 && !snap; i++) { step(w, DT); snap = w.events.some(e => e.type === 'ability' && e.k === 'snap'); w.events.length = 0; }
  assert.ok(snap, 'Packen');
  const dealt = 1000 - k.hp;
  assert.ok(dealt >= UNITS.krokodil.dmg * CROC.MUL * .85 - 1e-9, `Schaden ${dealt}`);
  assert.equal(k.state, 'stun'); assert.ok(k.stunT > .9, `betäubt ${k.stunT}`);
  assert.ok(c.seenT > 1.9, 'sichtbar nach dem Biss');
  run(w, 1.1);
  assert.equal(k.state, 'ok', 'nach 1 s wieder frei');
  // Tempo
  const speedOn = wet => {
    const w2 = mkWorld(); if (wet) water(w2, 0, 0, 1399, 799);
    const u = spawn(w2, 'krokodil', 200, 400, 'blau'); dummy(w2, 'krieger', 1300, 400);
    u.abCd = 1e9; rebuildHash(w2);
    run(w2, 1); const x0 = u.x; run(w2, 1);
    return u.x - x0;
  };
  const wet = speedOn(true), dry = speedOn(false);
  assert.ok(Math.abs(wet - UNITS.krokodil.speed * 1.6) < 4, `Wasser ${wet}`);
  assert.ok(Math.abs(dry - UNITS.krokodil.speed * .7) < 4, `Land ${dry}`);
});

/* ---------- Gorilla ---------- */
// Gorilla (Blau) gegen ein Opfer vom Typ type direkt vor ihm, dahinter eine Feindgruppe; liefert die größte Wurfweite
function throwTest(type) {
  const w = mkWorld(), g = spawn(w, 'gorilla', 300, 400, 'blau');
  const r = UNITS.gorilla.r + UNITS[type].r + 2;
  const v = spawn(w, type, 300 + r, 400, 'rot'); v.cd = 1e9; v.abCd = 1e9; v.hp = Math.max(v.hp, 1e6);
  for (let i = 0; i < 6; i++) dummy(w, 'krieger', 470 + (i % 2) * 20, 380 + (i >> 1) * 20);
  g.abCd = 0; g.beatCd = 1e9;
  rebuildHash(w);
  const x0 = v.x, y0 = v.y;
  let far = 0, air = false, grabbed = false;
  for (let k = 0; k < 150; k++) {
    step(w, DT); w.events.length = 0;
    if (g.grabbed === v) grabbed = true;
    if (v.state === 'air') air = true;
    far = Math.max(far, Math.hypot(v.x - x0, v.y - y0));
  }
  return { far, air, grabbed, v, g };
}
test('Gorilla wirft Krieger und Ritter (Masse 2) mehr als 80 px weit in die Feindgruppe, aber keinen Bären und keinen Panzer', () => {
  for (const t of ['krieger', 'ritter']) {
    const r = throwTest(t);
    assert.ok(r.grabbed && r.air, `${t}: gepackt und geworfen`);
    assert.ok(r.far > 80 && r.far < 200, `${t}: Wurfweite ${r.far.toFixed(1)}`);
    assert.ok(r.v.x > 300 + 80, `${t}: Richtung Feindgruppe (${r.v.x.toFixed(1)})`);
    assert.equal(r.v.z, 0, `${t}: gelandet`);
    assert.equal(r.g.grabbed, null);
  }
  for (const t of ['baer', 'panzer']) {
    const r = throwTest(t);
    assert.ok(!r.grabbed && !r.air, `${t}: zu schwer`);
  }
});

test('Gorilla: fällt er während des Hebens, lässt er das Opfer fallen (landet, schwebt nicht)', () => {
  const w = mkWorld(), g = spawn(w, 'gorilla', 300, 400, 'blau'), v = dummy(w, 'krieger', 323, 400);
  g.abCd = 0; g.beatCd = 1e9; rebuildHash(w);
  for (let k = 0; k < 10 && !g.grabbed; k++) { step(w, DT); w.events.length = 0; }
  assert.equal(g.grabbed, v);
  run(w, .1);
  assert.ok(v.z > 0, 'hochgehoben');
  scare(w, g, 2);   // Schreck bricht ab
  run(w, 1);
  assert.equal(g.grabbed, null); assert.equal(v.z, 0); assert.ok(v.state !== 'air');
});

// Review Task 5, Punkt 4: stirbt der Gorilla, wird er betäubt oder verflucht, während er das Opfer hält, lässt er es über
// dropGrabbed fallen (Tod: combat.die → releaseUnit; Betäubung und Fluch: cancelAbility → throwEnd)
test('Gorilla: Tod, Betäubung oder Froschfluch beim Heben lassen das Opfer fallen', async () => {
  const { hurt } = await import('../game/js/combat.js');
  const { curseFrog } = await import('../game/js/abilities.js');
  for (const how of ['tot', 'betäubt', 'frosch']) {
    const w = mkWorld(), g = spawn(w, 'gorilla', 300, 400, 'blau'), v = dummy(w, 'krieger', 323, 400);
    g.abCd = 0; g.beatCd = 1e9; rebuildHash(w);
    for (let k = 0; k < 10 && !g.grabbed; k++) { step(w, DT); w.events.length = 0; }
    assert.equal(g.grabbed, v, how);
    run(w, .1);
    assert.ok(v.z > 0 && g.abK === 0, `${how}: hochgehoben, noch beim Heben`);
    if (how === 'tot') hurt(w, g, 1e9, 'melee', v);
    else if (how === 'betäubt') { g.state = 'stun'; g.stunT = 2; }
    else assert.ok(curseFrog(w, g));
    run(w, 1);
    assert.equal(g.grabbed, null, how); assert.equal(v.z, 0, how); assert.ok(v.state !== 'air', how);
    assert.ok(Math.abs(v.x - 323) < 60, `${how}: nicht geworfen (Wurf: etwa 120 px; x ${v.x})`);
  }
});

test('Brustklopfen: beim ersten Kontakt, schwächere Feinde in 70 px fliehen 1,5 s, stärkere nicht; dann 20 s Ruhe', () => {
  const w = mkWorld(), g = spawn(w, 'gorilla', 300, 400, 'blau');
  const weak = dummy(w, 'krieger', 350, 400); weak.hp = 60;
  const strong = dummy(w, 'ritter', 300, 455); strong.hp = 300;
  const far = dummy(w, 'krieger', 300, 300); far.hp = 60;
  g.abCd = 1e9;
  rebuildHash(w);
  let beats = 0;
  run(w, .1, evs => { beats += evs.filter(e => e.type === 'ability' && e.k === 'beat').length; });
  assert.equal(beats, 1);
  assert.ok(isFleeing(weak) && weak.fearT > 1.3, 'schwächerer flieht');
  assert.ok(!isFleeing(strong), 'stärkerer nicht');
  assert.ok(!isFleeing(far), 'zu weit weg');
  assert.ok(g.beatCd > 19);
  run(w, 5, evs => { beats += evs.filter(e => e.type === 'ability' && e.k === 'beat').length; });
  assert.equal(beats, 1, 'nur alle 20 s');
});

/* ---------- Adler ---------- */
// Ziel ist ein Lama (Fernkämpfer, zu schwer zum Packen): kleine Ziele packt er stattdessen (Test unten)
test('Adler stößt auf einen Fernkämpfer herab, obwohl ein Krieger näher ist; erster Treffer ×3, danach steigt er', () => {
  const w = mkWorld(), a = spawn(w, 'adler', 300, 400, 'blau');
  const k = dummy(w, 'krieger', 380, 400), s = dummy(w, 'lama', 520, 400);
  a.abCd = 0;
  rebuildHash(w);
  assert.equal(nearestEnemy(w, a), k, 'normal wäre der Krieger dran');
  step(w, DT); w.events.length = 0;
  assert.ok(a.abOn && a.tg === s, 'Sturzflug auf den Schützen');
  let hitZ = -1, dmg = 0;
  for (let i = 0; i < 240 && hitZ < 0; i++) {
    const h = s.hp; step(w, DT);
    if (s.hp < h) { hitZ = a.z; dmg = h - s.hp; }
    w.events.length = 0;
  }
  assert.ok(hitZ >= 0 && hitZ <= EAGLE_REACH_Z, `getroffen unten (z ${hitZ})`);
  assert.ok(dmg >= UNITS.adler.dmg * SWOOP.MUL * .85 - 1e-9, `dreifacher Schaden ${dmg}`);
  assert.ok(k.hp === 1e9, 'Krieger nicht getroffen');
  let top = 0;
  run(w, 1.2, () => { top = Math.max(top, a.z); });
  assert.ok(top > UNITS.adler.flyZ - 3, `steigt wieder (${top})`);
});

test('Adler packt zu: hebt einen Schützen hoch, trägt ihn zurück und lässt ihn fallen', () => {
  const w = mkWorld(), a = spawn(w, 'adler', 300, 400, 'blau'), s = dummy(w, 'schuetze', 480, 400);
  a.abCd = 0;
  rebuildHash(w);
  let grab = -1, drop = null, top = 0, xMax = 0;
  for (let i = 0; i < 360 && !drop; i++) {
    step(w, DT);
    for (const e of w.events) { if (e.k === 'grab') grab = i; if (e.k === 'drop') drop = e; }
    w.events.length = 0;
    if (grab >= 0) { top = Math.max(top, s.z); xMax = Math.max(xMax, s.x); }
  }
  assert.ok(grab >= 0, 'gepackt');
  assert.ok(drop, 'fallen gelassen');
  assert.ok(top >= GRAB.Z - GRAB.HANG - 8, `hochgehoben (${top})`);
  assert.ok(s.x < 480, `zurückgetragen (x ${s.x.toFixed(0)})`);
  assert.equal(s.state, 'air', 'fällt');
  assert.ok(1e9 - s.hp >= GRAB.DMG + UNITS.adler.dmg * .85 - 1e-6, 'Schaden beim Fallenlassen');
});

test('Adler packt keine schweren Gegner', () => {
  const w = mkWorld(), a = spawn(w, 'adler', 300, 400, 'blau'); dummy(w, 'ritter', 480, 400);
  a.abCd = 0;
  rebuildHash(w);
  let grab = false;
  for (let i = 0; i < 300; i++) { step(w, DT); if (w.events.some(e => e.k === 'grab')) grab = true; w.events.length = 0; }
  assert.ok(!grab);
});

test('Adler: Nahkämpfer erreichen ihn oben nicht, unten schon', () => {
  const w = mkWorld(), a = spawn(w, 'adler', 300, 400, 'rot'), k = spawn(w, 'krieger', 318, 400, 'blau');
  a.hp = 1e6; a.cd = 1e9; a.abCd = 1e9;
  rebuildHash(w);
  assert.equal(a.z, UNITS.adler.flyZ);
  assert.ok(aloft(a) && outOfMelee(k, a), 'oben: außer Reichweite');
  k.cd = 0; k.tg = a; k.rt = 5;
  const h = a.hp; think(w, k, DT);
  assert.equal(a.hp, h, 'kein Schlag nach oben');
  a.z = 10;
  assert.ok(!aloft(a) && !outOfMelee(k, a));
  k.cd = 0; think(w, k, DT);
  assert.ok(a.hp < h, 'unten getroffen');
  // Fernkämpfer erreichen ihn immer
  const s = spawn(w, 'schuetze', 200, 400, 'blau');
  a.z = 30;
  assert.ok(!outOfMelee(s, a));
});

// Review Task 5, Punkt 1: Nahkämpfer am Boden visieren einen kreisenden Adler nicht an (sonst standen sie untätig unter
// ihm), wie Hubschrauber und Fledermausform; Fernkämpfer schon
test('Adler oben: Nahkämpfer wählen ihn nicht als Ziel und lassen ihn bei der Neuwahl fallen, Schützen nicht', () => {
  const w = mkWorld(), a = spawn(w, 'adler', 300, 400, 'rot'), k = spawn(w, 'krieger', 330, 400, 'blau');
  const far = dummy(w, 'krieger', 700, 400), s = spawn(w, 'schuetze', 200, 400, 'blau');
  a.hp = 1e6; a.cd = 1e9; a.abCd = 1e9; k.cd = 1e9;
  rebuildHash(w);
  assert.ok(aloft(a));
  assert.equal(nearestEnemy(w, k), far, 'Krieger: der Adler oben zählt nicht');
  assert.equal(nearestEnemy(w, s), a, 'Schütze: schon');
  k.tg = a; k.rt = 5; think(w, k, DT);
  assert.equal(k.tg, far, 'Neuwahl: Adler oben fällt weg');
  a.z = 10; rebuildHash(w);
  assert.equal(nearestEnemy(w, k), a, 'unten wieder ein Ziel');
});

test('Adler pickt: sinkt zum Biss unter die Reichweite der Nahkämpfer und steigt danach wieder', () => {
  const w = mkWorld(), a = spawn(w, 'adler', 300, 400, 'blau'), k = dummy(w, 'krieger', 330, 400);
  a.abCd = 1e9; rebuildHash(w);
  let bites = 0, lowAtBite = true, zs = [];
  for (let i = 0; i < 240; i++) {
    const h = k.hp; step(w, DT); w.events.length = 0;
    if (k.hp < h) { bites++; if (a.z > EAGLE_REACH_Z) lowAtBite = false; }
    zs.push(a.z);
  }
  assert.ok(bites >= 3, `Bisse ${bites}`);
  assert.ok(lowAtBite, 'nur unten');
  assert.ok(zs.slice(60).some(z => z > 20), 'steigt zwischen den Bissen');
});

// Review Task 5, Punkt 3: der Meteor (spells.tryMeteor) zielt nicht auf ein verstecktes Krokodil
test('Meteor: ein verstecktes Krokodil ist kein Zielpunkt; sichtbar schon', async () => {
  const { tryMeteor } = await import('../game/js/spells.js');
  const setup = seen => {
    const w = mkWorld();
    water(w, 400, 320, 560, 480);
    for (let k = 0; k < 3; k++) spawn(w, 'magier', 300, 380 + k * 20, 'blau');
    const c = dummy(w, 'krokodil', 480, 400); c.hidden = true; c.seenT = seen;
    // sechs Krieger im Ring (50 px) um das Krokodil: nur dessen Mitte hat genug Feinde für den Meteor
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; dummy(w, 'krieger', 480 + 50 * Math.cos(a), 400 + 50 * Math.sin(a)); }
    rebuildHash(w);
    return { w, m: w.units[0] };
  };
  const hid = setup(0);
  assert.equal(tryMeteor(hid.w, hid.m), false, 'versteckt: kein Meteor');
  const vis = setup(CROC.SEEN);
  assert.equal(tryMeteor(vis.w, vis.m), true, 'sichtbar: Meteor');
});

/* ---------- Büffel ---------- */
const herdTest = n => {
  const w = mkWorld(), bs = [];
  for (let i = 0; i < n; i++) { const b = spawn(w, 'bueffel', 300 + (i % 2) * 18, 380 + i * 18, 'blau'); b.abCd = 0; bs.push(b); }
  const s = dummy(w, 'schuetze', 480, 400);
  rebuildHash(w);
  let together = 0, fast = 0;
  for (let k = 0; k < 120; k++) {
    step(w, DT); w.events.length = 0;
    if (bs.every(b => b.abOn)) together++;
    for (const b of bs) if (b.abOn && Math.hypot(b.mx, b.my) > UNITS.bueffel.speed * 2) fast++;
  }
  return { bs, together, fast, s };
};
test('3 Büffel stürmen gemeinsam (Tempo ×2,2, 20 s Herdenpause auf allen), 2 nicht', () => {
  const h3 = herdTest(3);
  assert.ok(h3.together > 30, `gemeinsam gestürmt (${h3.together} Schritte)`);
  assert.ok(h3.fast > 0);
  for (const b of h3.bs) assert.ok(b.herdCd > HERD.CD - 2 && b.herdCd <= HERD.CD + HERD.T, `herdCd ${b.herdCd}`);
  const cds = h3.bs.map(b => b.herdCd);
  assert.ok(Math.max(...cds) - Math.min(...cds) < .1, 'gemeinsamer Wert');
  const h2 = herdTest(2);
  assert.equal(h2.together, 0); assert.ok(h2.bs.every(b => b.herdCd === 0), 'zwei stürmen nicht');
});

test('Stampede rammt Feinde und Eigene beiseite, Schaden nur an Feinden', () => {
  const w = mkWorld(), bs = [];
  for (let i = 0; i < 3; i++) { const b = spawn(w, 'bueffel', 300, 380 + i * 20, 'blau'); b.abCd = 0; bs.push(b); }
  const foe = dummy(w, 'krieger', 420, 402), friend = spawn(w, 'krieger', 380, 420, 'blau');
  friend.hp = 1e9; friend.cd = 1e9;
  dummy(w, 'schuetze', 560, 400);
  rebuildHash(w);
  let foeAir = false, friendAir = false;
  run(w, 2.5, () => { if (foe.state === 'air') foeAir = true; if (friend.state === 'air') friendAir = true; });
  assert.ok(foeAir && foe.hp < 1e9, 'Feind geschleudert und verletzt');
  assert.ok(friendAir && friend.hp === 1e9, 'Eigener nur geschoben');
});

// Review Task 5, Punkt 2: die Stampede läuft 2 s geradeaus; wie beim Trampeln (lineFree) nur mit freier Strecke
test('Stampede: keine Herde stürmt in Lava oder gegen eine Mauer', () => {
  for (const terr of ['lava', 'mauer']) {
    const w = mkWorld(), bs = [];
    for (let i = 0; i < 3; i++) { const b = spawn(w, 'bueffel', 300 + (i % 2) * 18, 380 + i * 18, 'blau'); b.abCd = 0; bs.push(b); }
    dummy(w, 'schuetze', 480, 400);
    for (let gy = (300 / CELL) | 0; gy <= (500 / CELL) | 0; gy++) for (let gx = (420 / CELL) | 0; gx <= (440 / CELL) | 0; gx++) setCell(w, gy * w.GW + gx, TERRAIN[terr].id);
    rebuildHash(w);
    let stampede = 0;
    run(w, 1.5, () => { for (const b of bs) if (b.abOn) stampede++; });
    assert.equal(stampede, 0, `${terr}: keine Stampede`);
    assert.ok(bs.every(b => b.alive && b.herdCd === 0), `${terr}: Herde unversehrt`);
  }
  // Gegenprobe ohne Hindernis: die Herde stürmt
  assert.ok(herdTest(3).together > 30);
});

/* ---------- Form ---------- */
test('Form bleibt gleich: neue Felder für alle Einheiten, eine Schlacht mit allen neuen Tieren ändert keine Form', () => {
  const keys = Object.keys(spawn(createWorld(400, 300, 1), 'krieger', 50, 50, 'blau')).join();
  const w = mkWorld(3);
  water(w, 500, 250, 900, 550);
  for (const t of NEW) assert.equal(Object.keys(spawn(createWorld(400, 300, 1), t, 50, 50, 'blau')).join(), keys, t);
  const k0 = spawn(w, 'krieger', 0, 0, 'blau');
  for (const f of ['hidden', 'seenT', 'grabbed', 'herdCd', 'beatCd', 'beeCd']) assert.ok(f in k0, f);
  assert.equal(k0.hidden, false); assert.equal(k0.grabbed, null);
  k0.alive = false;
  const types = [...NEW, 'krieger', 'schuetze', 'ritter', 'biene', 'soldat'];
  for (let i = 0; i < 60; i++) spawn(w, types[i % types.length], 250 + (i % 6) * 25, 250 + ((i / 6) | 0) * 30, 'blau');
  for (let i = 0; i < 60; i++) spawn(w, types[(i + 3) % types.length], 1000 + (i % 6) * 25, 250 + ((i / 6) | 0) * 30, 'rot');
  for (let i = 0; i < 4; i++) spawn(w, 'krokodil', 600 + i * 40, 400, 'blau');
  rebuildHash(w);
  const evs = new Set();
  // Nachtrag 8 (#50): Elefanten fliehen nicht mehr, die Schlacht verläuft anders; 12 statt 8 s, bis jede Fähigkeit vorkam
  run(w, 12, e => { for (const ev of e) if (ev.type === 'ability') evs.add(ev.k); });
  assert.deepEqual(w.units.filter(u => Object.keys(u).join() !== keys).map(u => u.type), []);
  for (const f of ['seenT', 'herdCd', 'beatCd', 'beeCd']) assert.ok(w.units.every(u => typeof u[f] === 'number'), f);
  assert.ok(w.units.every(u => typeof u.hidden === 'boolean' && (u.grabbed === null || typeof u.grabbed === 'object')));
  for (const k of ['trample', 'stampede', 'beat']) assert.ok(evs.has(k), `${k} kam vor (${[...evs]})`);
});

test('Determinismus: gleiche Saat, gleiche Schlacht mit den neuen Tieren', () => {
  const sim = () => {
    const w = mkWorld(11); water(w, 600, 300, 800, 500);
    for (let i = 0; i < 25; i++) spawn(w, NEW[i % 5], 300 + (i % 5) * 30, 300 + ((i / 5) | 0) * 40, 'blau');
    for (let i = 0; i < 25; i++) spawn(w, ['krieger', 'schuetze', 'biene', 'ritter', 'mg'][i % 5], 1000 + (i % 5) * 30, 300 + ((i / 5) | 0) * 40, 'rot');
    rebuildHash(w); run(w, 6);
    return w.units.map(u => `${u.type}:${u.x.toFixed(3)},${u.y.toFixed(3)},${u.hp.toFixed(3)}`).join('|');
  };
  assert.equal(sim(), sim());
});

/* ---------- Darstellung ---------- */
test('Darstellung: Elefant als Boss-Sticker (Rüssel, Ohr, Decke in Teamfarbe), kein Quetschen; Krokodil taucht ab', () => {
  assert.ok(BOSS.has('elefant'));
  const L = bossLayout('elefant');
  for (const p of ['body', 'blanket', 'head', 'trunk', 'ear', 'corpse']) assert.ok(L[p], p);
  assert.equal(L.blanket.variants, 5); assert.equal(L.body.variants, 1); assert.equal(L.body.frames, 2);
  for (const t of ['krokodil', 'gorilla', 'adler', 'bueffel']) {
    assert.equal(bossLayout(t), null);
    const R = rigLayout(t);
    assert.ok(R.body && R.pupilL && R.lid, t);
    assert.equal(R.body.variants, 5, `${t}: Halstuch in Teamfarbe`);
  }
  assert.equal(rigLayout('adler').body.frames, 2);
  const mk = o => ({ id: 1, type: 'elefant', T: UNITS.elefant, x: 0, y: 0, mx: 0, my: 0, vx: 0, vy: 0, face: 1, hitT: 0, fireT: 1, swingT: 0, seed: 0, tg: null, state: 'ok', ...o });
  const wings = new Set(), trunks = [];
  for (let t = 0; t < 3; t += .05) {
    for (const o of [{}, { mx: 30 }, { hitT: .1 }, { swingT: .2 }]) {
      const p = poseUnit(mk(o), t);
      assert.ok(Math.abs(p.sx - 1) <= BOSS_SQUASH + 1e-9 && Math.abs(p.sy - 1) <= BOSS_SQUASH + 1e-9);
      wings.add(Math.round(p.wing * 10)); trunks.push(p.tailSwing);
    }
  }
  assert.ok(wings.size > 5, 'Ohr wedelt');
  assert.ok(poseUnit(mk({ abOn: true }), 1).tailSwing < -2, 'Rüssel hoch beim Trampeln');
  const c = { id: 2, type: 'krokodil', T: UNITS.krokodil, x: 0, y: 0, mx: 0, my: 0, vx: 0, vy: 0, face: 1, hitT: 0, fireT: 1, swingT: 0, seed: 0, tg: null, state: 'ok', hidden: true, seenT: 0 };
  assert.ok(Math.abs(poseUnit(c, 1).sy - CROC_SUBMERGE) < 1e-9, 'abgetaucht');
  assert.equal(poseUnit({ ...c, seenT: 1 }, 1).sy, 1, 'nach dem Biss aufgetaucht');
  // Zeichnungen laufen auf einem Schein-Kontext durch, mit Umrissen #2a2a33
  const log = { strokes: [] };
  const ctx = new Proxy({}, { get: (o, k) => (k === 'log' ? log : k in o ? o[k] : typeof k === 'string' && k !== 'then' ? (() => {}) : undefined),
    set: (o, k, v) => { if (k === 'strokeStyle') log.strokes.push(v); o[k] = v; return true; } });
  for (const t of NEW) {
    const parts = t === 'elefant' ? Object.keys(bossLayout(t)) : ['body', 'shadow', 'lid', 'brow'];
    for (const p of parts) for (const vi of [0, 2]) drawRigPart(ctx, t, p, vi, 1);
  }
  assert.ok(log.strokes.includes('#2a2a33'));
});

test('Effekte: die neuen Fähigkeitsereignisse erzeugen Partikel', () => {
  for (const k of ['trample', 'stampede', 'beat', 'snap', 'throw', 'thrown', 'swoop', 'swoopHit']) {
    const fx = createFxCore({}, { rand: () => .5 });
    fx.consume([{ type: 'ability', k, x: 300, y: 300, z: 0, R: 30, nx: 1, ny: 0, face: 1 }]);
    assert.ok(fx.store.count > 0 && fx.store.count < 60, `${k}: ${fx.store.count} Partikel`);
    for (let t = 0; t < 1.5; t += DT) fx.update(DT, null);
    assert.equal(fx.store.count, 0, `${k}: nach 1,5 s vorbei`);
  }
});

test('Adler auf der Flucht oder ohne Ziel steigt wieder auf Flughöhe', () => {
  const w = mkWorld(), a = spawn(w, 'adler', 300, 400, 'blau'), k = dummy(w, 'krieger', 330, 400);
  a.abCd = 1e9; rebuildHash(w);
  for (let i = 0; i < 120 && a.z > 10; i++) { step(w, DT); w.events.length = 0; }
  assert.ok(a.z <= 10, 'unten zum Picken');
  scare(w, a, 2);
  run(w, .6);
  assert.ok(a.z > UNITS.adler.flyZ - 1, `auf der Flucht oben (${a.z})`);
  k.alive = false; rebuildHash(w);
  run(w, 3);
  assert.ok(a.z > UNITS.adler.flyZ - 1);
});
