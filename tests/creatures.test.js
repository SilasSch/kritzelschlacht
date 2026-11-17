// Neue Kreaturen (Spez. Nachtrag 3, #34; Festlegung 3: Frösche, 6: Flieger und Phönix, 7: Feuer): Troll, Zyklop, Hexe,
// Phönix, Einhorn und der nicht malbare Frosch.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, rebuildHash, nearestEnemy, factionOf } from '../game/js/world.js';
import { step, missionResult, sandboxWinner } from '../game/js/sim.js';
import { think, attack, hurt, ignite, stepProjectiles, fire, PROJECTILES, BURN_MAX_GEN } from '../game/js/combat.js';
import { shieldBlocks } from '../game/js/formation.js';
import { MORALE } from '../game/js/morale.js';
import { UNITS, UNDEAD, RANGED } from '../game/js/data.js';
import {
  ABILITY, TROLL, CYCLOPS, FROG, FROG_IMMUNE, PHOENIX, UNICORN, NO_GHOUL, isFire, curseFrog, BARRAGE,
} from '../game/js/abilities.js';
import { mixed2Types, MIXED_TYPES } from '../game/js/bench.js';
import { unitCard, cardTypes } from '../game/js/cards.js';
import { createFxCore } from '../game/js/render/fxcore.js';
import { poseUnit, projScreen } from '../game/js/render/pose.js';

const DT = 1 / 60;
const NEW = ['troll', 'zyklop', 'hexe', 'phoenix', 'einhorn'];
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
// Gegner, der nie zuschlägt (oder schießt) und nicht stirbt
const dummy = (w, type, x, y, team = 'rot') => { const e = spawn(w, type, x, y, team); e.hp = 1e9; e.cd = 1e9; return e; };
const freeze = u => { u.state = 'stun'; u.stunT = 1e9; return u; };
const run = (w, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); if (each) each(w.events); w.events.length = 0; } };
const hit = (w, u, t) => { u.cd = 0; const dx = t.x - u.x, dy = t.y - u.y; attack(w, u, t, Math.hypot(dx, dy) || 1, dx, dy); };

/* ---------- Daten ---------- */
test('Daten: fünf neue malbare Kreaturen in Mythisch (9 mit Tasten 1–9), Frosch nicht malbar, Texte nur in data.js', () => {
  for (const t of NEW) {
    assert.equal(UNITS[t].cat, 'mythisch', t); assert.notEqual(UNITS[t].paint, false, t);
    const c = unitCard(t);
    assert.ok(c.abil.length >= 2, `${t}: Fähigkeiten auf der Karte`);
    assert.ok(!c.tags.includes('Nicht malbar'), t);
  }
  const myth = Object.keys(UNITS).filter(k => UNITS[k].cat === 'mythisch' && UNITS[k].paint !== false);
  assert.deepEqual(myth, ['magier', 'geist', 'drache', 'vampir', ...NEW], 'Mythisch: 9 malbare Einheiten');
  assert.equal(UNITS.frosch.paint, false); assert.equal(UNITS.frosch.cat, 'mythisch');
  for (const k in UNITS) assert.ok('paint' in UNITS[k], `${k}: gleiche Schlüssel`);
  // Lexikon: der Frosch mit dem Hinweis, wie er entsteht
  assert.ok(cardTypes().find(g => g.cat === 'mythisch').types.includes('frosch'));
  assert.ok(unitCard('frosch').tags.includes('Nicht malbar'));
  assert.ok(unitCard('frosch').abil.some(a => /entsteht durch Froschfluch/.test(a.d)), 'Frosch: entsteht durch Froschfluch');
  // nicht malbar heißt: nicht in Malleiste, Zufallsschlacht und mixed2 (Filter wie beim Ghul); mixed bleibt fest
  assert.ok(!mixed2Types().includes('frosch'));
  for (const t of NEW) { assert.ok(mixed2Types().includes(t), t); assert.ok(!MIXED_TYPES.includes(t), t); }
  // Fähigkeitstabelle: nur die Hexe hat eine ausgelöste Fähigkeit (Froschfluch, cd 14)
  assert.equal(ABILITY.hexe.cd, 14); assert.equal(FROG.T, 5);
  for (const t of ['troll', 'zyklop', 'phoenix', 'einhorn', 'frosch']) assert.ok(!ABILITY[t], t);
  assert.ok(UNITS.hexe.fly && UNITS.hexe.flyZ === 24); assert.ok(UNITS.phoenix.fly && UNITS.phoenix.flyZ === 26);
  assert.equal(UNITS.hexe.dmg, 10); assert.equal(CYCLOPS.R, 34);
  assert.ok(isFire('phoenix')); assert.ok(RANGED.has('hexe'));
  for (const t of ['panzer', 'heli', 'drache', 'elefant', 'ghul']) assert.ok(FROG_IMMUNE.has(t), t);
});

/* ---------- Troll ---------- */
test('Troll heilt 3 % seiner LP je s; nach einem Feuertreffer (auch Brand) 4 s lang nicht', () => {
  const w = mkWorld(), u = freeze(spawn(w, 'troll', 400, 400, 'blau'));
  rebuildHash(w);
  const H = UNITS.troll.hp;
  u.hp = 100;
  for (let i = 0; i < 60; i++) think(w, u, DT);
  assert.ok(Math.abs(u.hp - (100 + TROLL.REGEN * H)) < 1e-6, `nach 1 s ${u.hp}`);
  // Feuerball (Feuer): 4 s keine Heilung, danach wieder
  hurt(w, u, 10, 'fire', null);
  const h0 = u.hp;
  for (let i = 0; i < 3.9 * 60; i++) think(w, u, DT);
  assert.equal(u.hp, h0, 'keine Heilung 3,9 s nach dem Feuer');
  for (let i = 0; i < 1.1 * 60; i++) think(w, u, DT);
  assert.ok(u.hp > h0, 'heilt wieder');
  // Andere Treffer stoppen die Heilung nicht
  u.hp = 100; hurt(w, u, 10, 'melee', null);
  for (let i = 0; i < 30; i++) think(w, u, DT);
  assert.ok(u.hp > 90, `Nahkampf stoppt sie nicht (${u.hp})`);
  // Brand über Zeit: solange er brennt und 4 s danach keine Heilung
  u.hp = 100; u.noHealT = 0;
  ignite(w, u, 0, null);
  let maxHp = u.hp;
  for (let i = 0; i < 6.5 * 60; i++) { think(w, u, DT); maxHp = Math.max(maxHp, u.hp); }
  assert.ok(maxHp <= 100, 'kein Anstieg während des Brands und 4 s danach');
  assert.ok(u.burnT === 0);
});

/* ---------- Zyklop ---------- */
test('Zyklop: Felsbrocken im Bogen über eine Mauer, Einschlag R 34 mit 2 Trümmern, Schilde halten ihn nicht ab', () => {
  const w = mkWorld(), z = spawn(w, 'zyklop', 300, 400, 'blau');
  // Mauer quer zwischen Zyklop und Ziel
  for (let gy = 30; gy <= 50; gy++) for (const gx of [44, 45]) { const i = gy * w.GW + gx; w.terr[i] = 4; w.whp[i] = 140; }
  const t = dummy(w, 'krieger', 540, 400), near = dummy(w, 'krieger', 540, 425), far = dummy(w, 'krieger', 540, 470);
  [t, near, far].forEach(freeze);
  rebuildHash(w);
  z.tg = t; z.rt = 9; z.cd = 0;
  think(w, z, DT);
  const p = w.proj.find(q => q.kind === 'boulder');
  assert.ok(p, 'wirft einen Felsbrocken'); assert.ok(p.arc, 'im Bogen');
  // genau auf das Ziel, damit die Abstände der Nachbarn feststehen
  p.x1 = t.x; p.y1 = t.y;
  const wallHp = w.whp.slice(), d0 = w.debris.length, h = [t.hp, near.hp, far.hp];
  let evs = [];
  for (let i = 0; i < 180 && w.proj.includes(p); i++) { stepProjectiles(w, DT); evs = evs.concat(w.events); w.events.length = 0; }
  assert.ok(!w.proj.includes(p), 'gelandet');
  assert.ok(t.hp < h[0], 'Ziel hinter der Mauer getroffen');
  assert.ok(near.hp < h[1], 'Nachbar 25 px weiter getroffen (R 34)');
  assert.equal(far.hp, h[2], 'Nachbar 70 px weiter nicht');
  assert.deepEqual([...w.whp], [...wallHp], 'Mauer unversehrt: der Bogen geht darüber');
  assert.equal(w.debris.length - d0, CYCLOPS.DEBRIS, '2 Trümmerbrocken');
  assert.ok(evs.some(e => e.type === 'creature' && e.k === 'boulder'), 'Einschlag-Effekt');
  // Trümmer sind nur optisch: ihr Liegen schadet niemandem
  const hk = t.hp; for (let i = 0; i < 120; i++) step(w, DT); assert.equal(t.hp, hk);

  // Römer im Block: Pfeile hält der Schild, den Felsen nicht (Explosion)
  const w2 = mkWorld(), R = [];
  for (let k = 0; k < 8; k++) R.push(spawn(w2, 'roemer', 300 - (k % 4) * 26, 400 + ((k / 4 | 0) - .5) * 26, 'blau'));
  dummy(w2, 'schuetze', 1200, 400);
  run(w2, .6);
  const r = R[0];
  assert.equal(r.formOn, true); assert.ok(shieldBlocks(r, 'arrow', -r.formAx, -r.formAy));
  const zz = spawn(w2, 'zyklop', r.x + 200, r.y, 'rot'); rebuildHash(w2);
  fire(w2, zz, r, 'boulder', r.x, r.y);
  const hr = r.hp, b = w2.proj[w2.proj.length - 1];
  while (w2.proj.includes(b)) stepProjectiles(w2, DT);
  assert.ok(hr - r.hp > UNITS.zyklop.dmg * .5, `voller Explosionsschaden am Schild vorbei (${hr - r.hp})`);
});

test('Zyklop im Nahkampf unbeholfen: Abklingzeit ×2, Schaden ×0,5; kein Wurf auf nahe Feinde', () => {
  const w = mkWorld(), z = spawn(w, 'zyklop', 400, 400, 'blau'), t = dummy(w, 'krieger', 425, 400);
  freeze(t); rebuildHash(w);
  z.tg = t; z.rt = 9; z.cd = 0;
  const h0 = t.hp;
  think(w, z, DT);
  assert.equal(w.proj.length, 0, 'kein Felsbrocken auf 25 px');
  const dmg = h0 - t.hp, T = UNITS.zyklop;
  assert.ok(dmg >= T.dmg * CYCLOPS.MELEE_DMG * .85 - 1e-9 && dmg <= T.dmg * CYCLOPS.MELEE_DMG * 1.15 + 1e-9, `Schaden ${dmg}`);
  assert.ok(z.cd >= T.cd * CYCLOPS.MELEE_CD * .85 - DT && z.cd <= T.cd * CYCLOPS.MELEE_CD * 1.15, `Abklingzeit ${z.cd}`);
  // dazwischen (über Nahkampfreichweite, unter MIN_D): geht hin statt zu werfen
  const w2 = mkWorld(), z2 = spawn(w2, 'zyklop', 400, 400, 'blau'), t2 = freeze(dummy(w2, 'krieger', 455, 400));
  rebuildHash(w2); z2.tg = t2; z2.rt = 9; z2.cd = 0;
  think(w2, z2, DT);
  assert.equal(w2.proj.length, 0); assert.ok(z2.mx > 0, 'geht auf ihn zu');
  // weiter weg: Wurf
  const w3 = mkWorld(), z3 = spawn(w3, 'zyklop', 400, 400, 'blau'), t3 = freeze(dummy(w3, 'krieger', 600, 400));
  rebuildHash(w3); z3.tg = t3; z3.rt = 9; z3.cd = 0;
  think(w3, z3, DT);
  assert.ok(w3.proj.some(p => p.kind === 'boulder' && p.R === CYCLOPS.R && p.dmg === UNITS.zyklop.dmg));
});

/* ---------- Hexe ---------- */
test('Hexe: verwandelt einen Ritter in einen Frosch, nach 5 s ist er wieder Ritter mit seinen LP; Panzer bleibt Panzer', () => {
  const w = mkWorld(), hx = spawn(w, 'hexe', 400, 400, 'blau'), r = spawn(w, 'ritter', 560, 400, 'rot');
  r.hp = 137; r.cd = 1e9;
  rebuildHash(w);
  hx.tg = r; hx.rt = 9; hx.abCd = 0;
  let evs = [];
  think(w, hx, DT); evs = evs.concat(w.events); w.events.length = 0;
  assert.equal(r.type, 'frosch'); assert.equal(r.T, UNITS.frosch); assert.equal(r.frogFrom, 'ritter');
  assert.equal(r.hp, 137, 'behält seine LP'); assert.equal(r.team, 'rot');
  assert.equal(factionOf(w, r), 'rot');
  assert.ok(evs.some(e => e.type === 'creature' && e.k === 'frog'));
  assert.ok(hx.abCd > 0 || hx.abOn === false);
  // Frosch: harmlos, hüpft vom Feind weg
  const h0 = hx.hp, d0 = dist(r, hx);
  r.hp = 137;
  for (let t = 0; t < FROG.T - .2; t += DT) {
    hx.abCd = 99; hx.cd = 99;   // die Hexe hält still
    step(w, DT); w.events.length = 0;
  }
  assert.equal(r.type, 'frosch', 'noch Frosch');
  assert.equal(hx.hp, h0, 'Frosch greift nicht an');
  assert.ok(dist(r, hx) > d0 + 20, `hüpft weg (${d0.toFixed(0)} → ${dist(r, hx).toFixed(0)})`);
  run(w, .3, e => { evs = evs.concat(e); });
  assert.equal(r.type, 'ritter'); assert.equal(r.T, UNITS.ritter); assert.equal(r.frogFrom, null);
  assert.equal(r.hp, 137, 'wieder Ritter mit seinen LP');
  assert.ok(evs.some(e => e.type === 'creature' && e.k === 'unfrog'));
  // LP über den max. LP des alten Typs werden gedeckelt
  const s = spawn(w, 'schuetze', 300, 300, 'rot'); curseFrog(w, s); s.hp = 1000; s.frogT = DT / 2; think(w, s, DT);
  assert.equal(s.type, 'schuetze'); assert.equal(s.hp, UNITS.schuetze.hp);

  // Panzer bleibt Panzer (immun): die Hexe löst gar nicht aus
  const w2 = mkWorld(), h2 = spawn(w2, 'hexe', 400, 400, 'blau'), p = dummy(w2, 'panzer', 560, 400);
  rebuildHash(w2); h2.tg = p; h2.rt = 9; h2.abCd = 0;
  think(w2, h2, DT);
  assert.equal(p.type, 'panzer'); assert.equal(h2.abOn, false);
  for (const t of FROG_IMMUNE) if (UNITS[t]) { const v = spawn(w2, t, 200, 200, 'rot'); assert.equal(curseFrog(w2, v), false, t); assert.equal(v.type, t); }
  // Jeder gegen jeden: der Frosch bleibt auf der Seite seiner Art (u.kin), keine eigene Fraktion 'frosch'
  const w3 = createWorld(1400, 800, 5); w3.teamMode = false;
  const k3 = spawn(w3, 'krieger', 300, 300, 'rot'), k4 = spawn(w3, 'krieger', 340, 300, 'gelb'), h3 = spawn(w3, 'hexe', 500, 300, 'blau');
  curseFrog(w3, k3); rebuildHash(w3);
  assert.equal(factionOf(w3, k3), 'krieger'); assert.equal(w3.facCount.size, 2);
  assert.notEqual(nearestEnemy(w3, k4), k3, 'Krieger greifen ihren verwandelten Kameraden nicht an'); void h3;
});

test('Hexe: fliegt auf 24 px, Nahkämpfer erreichen sie; Zauber hex gerade, grünlich, kein Feuer, 10 Schaden', () => {
  const w = mkWorld(), hx = spawn(w, 'hexe', 400, 400, 'blau'), k = spawn(w, 'krieger', 440, 400, 'rot');
  rebuildHash(w);
  run(w, 1);
  assert.ok(Math.abs(hx.z - 24) < 1e-6, `Flughöhe ${hx.z}`);
  assert.equal(nearestEnemy(w, k), hx, 'Krieger nimmt die Hexe als Ziel (Festlegung 6)');
  assert.equal(PROJECTILES.hex.arc, false); assert.ok(!isFire('hex'));
  const w2 = mkWorld(), h2 = spawn(w2, 'hexe', 400, 400, 'blau'), t = freeze(dummy(w2, 'krieger', 560, 400));
  run(w2, .5);
  h2.tg = t; h2.rt = 9; h2.cd = 0; h2.abCd = 99; h2.lofWait = 0;
  think(w2, h2, DT);
  const p = w2.proj.find(q => q.kind === 'hex');
  assert.ok(p, 'Zauber geschossen'); assert.equal(p.dmg, 10);
  const h0 = t.hp;
  for (let i = 0; i < 120 && w2.proj.includes(p); i++) stepProjectiles(w2, DT);
  const d = h0 - t.hp;
  assert.ok(d >= 10 * .85 - 1e-9 && d <= 10 * 1.15 + 1e-9, `Schaden ${d}`);
  assert.equal(t.burnT, 0, 'zündet nicht an');
  // Bildschirmlage des Zaubers (Renderer): wie gerade Schüsse
  const ps = projScreen({ ...p, t: 0 });
  assert.ok(Number.isFinite(ps.x) && Number.isFinite(ps.y));
});

test('Froschfluch: ein verwandelter Römer verlässt seinen Block und verliert den Schild', () => {
  const w = mkWorld(), R = [];
  for (let k = 0; k < 8; k++) R.push(spawn(w, 'roemer', 300 - (k % 4) * 26, 400 + ((k / 4 | 0) - .5) * 26, 'blau'));
  dummy(w, 'schuetze', 1200, 400);
  run(w, .6);
  const u = R[0];
  assert.equal(u.formOn, true); assert.ok(u.form > 0);
  assert.ok(curseFrog(w, u));
  assert.equal(u.formOn, false); assert.equal(u.formFree, false); assert.equal(u.form, 0);
  assert.equal(shieldBlocks(u, 'arrow', -u.formAx, -u.formAy), false, 'kein Schildschutz');
  run(w, 1);
  assert.equal(u.formOn, false); assert.equal(u.type, 'frosch');
  for (const f of w.formations) for (const m of f.m) if (m === u) assert.ok(!m.formOn);
  assert.ok(R.slice(1).some(r => r.formOn), 'Block ohne ihn');
  run(w, FROG.T);
  assert.equal(u.type, 'roemer', 'nach dem Fluch wieder Römer');
});

test('Froschfluch bricht eine laufende Fähigkeit sauber ab (mit end), Schreck und Flucht enden', () => {
  const w = mkWorld(), m = spawn(w, 'moerser', 300, 400, 'blau');
  for (let k = 0; k < 6; k++) freeze(dummy(w, 'krieger', 600 + (k % 3) * 14, 390 + (k / 3 | 0) * 14));
  rebuildHash(w);
  m.tg = w.units[1]; m.rt = 9; m.abCd = 0; m.cd = 0;
  think(w, m, DT);
  assert.equal(m.abOn, true, 'Sperrfeuer läuft');
  m.cd = 0;
  curseFrog(w, m);
  assert.equal(m.abOn, false); assert.equal(m.abT, 0); assert.equal(m.abK, 0);
  assert.equal(m.abCd, ABILITY.moerser.cd, 'Abklingzeit beginnt neu');
  assert.ok(m.cd >= UNITS.moerser.cd, 'end lief (barrageEnd: Nachladen)');
  const np = w.proj.length;
  for (let i = 0; i < 60; i++) { think(w, m, DT); }
  assert.equal(w.proj.length, np, 'als Frosch keine Granaten mehr');
  assert.equal(m.abOn, false);
  // Schreck und Flucht enden beim Verwandeln
  const s = spawn(w, 'krieger', 200, 200, 'blau'); s.fearT = 2; s.flee = true;
  curseFrog(w, s);
  assert.equal(s.fearT, 0); assert.equal(s.flee, false);
  // ein Flieger fällt als Frosch, steigt danach wieder auf
  const g = spawn(w, 'geist', 700, 200, 'blau'); run(w, .5);
  curseFrog(w, g);
  assert.ok(!g.T.fly); run(w, 1.5);
  assert.equal(g.z, 0, 'Frosch am Boden');
  run(w, FROG.T);
  assert.equal(g.type, 'geist'); assert.equal(g.state, 'ok'); assert.ok(g.z > 10, `wieder in der Luft (${g.z})`);
});

/* ---------- Phönix ---------- */
test('Phönix: steht einmal aus der Asche wieder auf (2 s, 50 % LP), der zweite Tod ist endgültig', () => {
  const w = mkWorld(), p = spawn(w, 'phoenix', 400, 400, 'blau'), k = spawn(w, 'krieger', 420, 400, 'rot');
  k.cd = 1e9; rebuildHash(w);
  let evs = [];
  hurt(w, p, 1e6, 'melee', k); evs = evs.concat(w.events); w.events.length = 0;
  assert.equal(p.alive, true, 'Asche lebt'); assert.equal(p.ashT, PHOENIX.ASH_T); assert.equal(p.reborn, false);
  assert.equal(k.kills, 0, 'kein Abschuss');
  assert.ok(evs.some(e => e.type === 'creature' && e.k === 'ash')); assert.ok(!evs.some(e => e.type === 'death'));
  rebuildHash(w);
  assert.equal(nearestEnemy(w, k), null, 'Asche nicht anvisierbar');
  assert.equal(hurt(w, p, 50, 'fire', k), 0, 'Asche unverwundbar');
  assert.ok(!ignite(w, p, 0, k), 'fängt kein Feuer');
  run(w, PHOENIX.ASH_T - .1);
  assert.ok(p.ashT > 0, 'noch Asche');
  run(w, .2, e => { evs = evs.concat(e); });
  assert.equal(p.ashT, 0); assert.equal(p.reborn, true);
  assert.ok(Math.abs(p.hp - PHOENIX.HP * UNITS.phoenix.hp) < 1e-6 || p.hp < PHOENIX.HP * UNITS.phoenix.hp, `LP ${p.hp}`);
  assert.ok(evs.some(e => e.type === 'creature' && e.k === 'rise'));
  hurt(w, p, 1e6, 'melee', k);
  assert.equal(p.alive, false, 'zweiter Tod endgültig'); assert.equal(k.kills, 1);
});

test('Phönix-Asche beendet keine Schlacht: Mission und Sandkasten zählen sie als lebend', () => {
  const w = mkWorld(), p = spawn(w, 'phoenix', 400, 400, 'blau'), k = spawn(w, 'krieger', 900, 400, 'rot');
  k.cd = 1e9;
  rebuildHash(w);
  assert.equal(sandboxWinner(w), null);   // contested
  hurt(w, p, 1e6, 'blast', null);
  assert.ok(p.ashT > 0);
  assert.equal(missionResult(w, 10), null, 'Mission läuft weiter');
  for (let i = 0; i < 60; i++) { step(w, DT); assert.equal(sandboxWinner(w), null, 'kein Sieger'); assert.equal(w.facCount.size, 2); }
  assert.equal(missionResult(w, 11), null);
  run(w, PHOENIX.ASH_T);
  assert.equal(p.ashT, 0); assert.ok(p.alive);
});

test('Phönix: Feuerspur zündet feindliche Bodentruppen an (Generation 2), keine Verbündeten, ihn selbst nie', () => {
  const w = mkWorld(), p = spawn(w, 'phoenix', 300, 400, 'blau');
  const foes = [], own = [];
  for (let k = 0; k < 5; k++) foes.push(freeze(dummy(w, 'krieger', 380 + k * 40, 400)));
  for (let k = 0; k < 3; k++) own.push(freeze(dummy(w, 'krieger', 400 + k * 60, 400, 'blau')));
  const far = dummy(w, 'krieger', 900, 400); far.state = 'ok';
  rebuildHash(w);
  let ig = 0;
  // fliegt über die Reihe hinweg zum fernen Ziel
  for (let t = 0; t < 4; t += DT) {
    p.tg = far; p.rt = 9;
    step(w, DT);
    for (const e of w.events) if (e.type === 'ignite') ig++;
    w.events.length = 0;
  }
  assert.ok(p.x > 600, `überflogen (${p.x.toFixed(0)})`);
  assert.ok(foes.some(f => f.burnT > 0 || f.hp < 1e9), 'Feinde unter der Spur brennen');
  assert.ok(foes.every(f => f.burnT === 0 || f.burnGen >= PHOENIX.TRAIL_GEN), 'Generation 2');
  assert.ok(own.every(o => o.hp === 1e9 && o.burnT === 0 || o.burnGen > PHOENIX.TRAIL_GEN), 'Verbündete nicht von der Spur');
  assert.equal(p.burnT, 0);
  assert.ok(ig > 0);
  assert.ok(PHOENIX.TRAIL_GEN < BURN_MAX_GEN);
});

/* ---------- Einhorn ---------- */
test('Einhorn: heilt Verbündete bis 70 px um 2 LP je s (keine Ghule, keine Feinde); Hornstoß ×1,5 aus vollem Lauf', () => {
  const w = mkWorld(), e = freeze(spawn(w, 'einhorn', 400, 400, 'blau'));
  const a = freeze(dummy(w, 'krieger', 450, 400, 'blau')), b = freeze(dummy(w, 'krieger', 400, 480, 'blau'));
  const g = freeze(dummy(w, 'ghul', 380, 430, 'blau')), f = freeze(dummy(w, 'krieger', 400, 350, 'rot'));
  for (const v of [a, b, g, f]) v.hp = 30;
  e.hp = 50;
  rebuildHash(w);
  for (let i = 0; i < 120; i++) think(w, e, DT);
  assert.ok(Math.abs(a.hp - (30 + 2 * UNICORN.AURA_HP)) < 1e-6, `Verbündeter in 50 px: ${a.hp}`);
  assert.equal(b.hp, 30, 'Verbündeter in 80 px nicht');
  assert.equal(g.hp, 30, 'Ghul nicht'); assert.ok(UNDEAD.has('ghul'));
  assert.equal(f.hp, 30, 'Feind nicht');
  assert.equal(e.hp, 50, 'sich selbst nicht');
  // Hornstoß: aus vollem Lauf ×1,5 (Reiter-Sturmangriff), danach Durchlauf
  const w2 = mkWorld(), u = spawn(w2, 'einhorn', 400, 400, 'blau'), t = dummy(w2, 'ritter', 425, 400);
  t.hp = 1e6; rebuildHash(w2);
  const T = UNITS.einhorn, m = .7;   // Ritter nimmt Nahkampf ×0,7
  u.run = 0; let h0 = t.hp; hit(w2, u, t);
  const plain = h0 - t.hp;
  assert.ok(plain <= T.dmg * 1.15 * m + 1e-9, `normal ${plain}`);
  assert.equal(u.st, 0);
  u.run = 1; h0 = t.hp; hit(w2, u, t);
  const horn = h0 - t.hp;
  assert.ok(horn >= T.dmg * .85 * m * UNICORN.CHARGE - 1e-9 && horn <= T.dmg * 1.15 * m * UNICORN.CHARGE + 1e-9, `Horn ${horn}`);
  assert.ok(u.st > 0, 'läuft durch');
});

/* ---------- Frosch und Zusammenspiel ---------- */
test('Frosch: nicht malbar, ein gebissener Frosch wird kein Ghul, ein verwandelter Phönix behält reborn', () => {
  assert.equal(UNITS.frosch.paint, false); assert.ok(NO_GHOUL.has('frosch'));
  const w = mkWorld(), v = spawn(w, 'vampir', 400, 400, 'blau'), k = spawn(w, 'krieger', 418, 400, 'rot');
  rebuildHash(w);
  curseFrog(w, k); k.hp = 1;
  hit(w, v, k);
  assert.ok(!k.alive, 'Frosch tot');
  assert.equal(w.units.filter(u => u.type === 'ghul').length, 0, 'kein Ghul aus dem Frosch');
  assert.equal(v.ghouls, 0);
  // Phönix: einmal wiedergeboren, dann verflucht: bleibt reborn (der nächste Tod ist endgültig)
  const p = spawn(w, 'phoenix', 600, 300, 'blau'); p.reborn = true;
  curseFrog(w, p);
  assert.equal(p.type, 'frosch'); assert.equal(p.reborn, true);
  p.frogT = DT / 2; think(w, p, DT);
  assert.equal(p.type, 'phoenix'); assert.equal(p.reborn, true);
  // noch nicht wiedergeboren und als Frosch getötet: wird zur Asche (einmal je Phönix)
  const q = spawn(w, 'phoenix', 700, 300, 'blau');
  curseFrog(w, q); hurt(w, q, 1e6, 'melee', null);
  assert.ok(q.alive); assert.equal(q.type, 'phoenix'); assert.ok(q.ashT > 0);
});

test('Kreaturen behalten die Form der Einheiten (Typwechsel, Asche, Aura, Spur, Felsen)', () => {
  const keys = Object.keys(spawn(createWorld(400, 300, 1), 'krieger', 50, 50, 'blau')).join();
  const w = mkWorld(3);
  for (let k = 0; k < 4; k++) for (const t of NEW) spawn(w, t, 300 + k * 30, 200 + NEW.indexOf(t) * 80, 'blau');
  for (let k = 0; k < 12; k++) spawn(w, ['krieger', 'ritter', 'roemer', 'schuetze'][k % 4], 800 + (k % 4) * 20, 250 + (k >> 2) * 120, 'rot');
  run(w, 8);
  for (const u of w.units) if (u.type === 'phoenix' && u.alive && !u.reborn) hurt(w, u, 1e6, 'blast', null);
  run(w, 4);
  const bad = w.units.filter(u => Object.keys(u).join() !== keys).map(u => u.type);
  assert.deepEqual(bad, []);
});

/* ---------- Darstellung ---------- */
test('Effekte und Posen: creature-Ereignisse erzeugen Partikel, der Frosch hüpft', () => {
  const fx = createFxCore({ decal() {}, crater() {} }, { rand: () => .5 });
  for (const k of ['boulder', 'frog', 'unfrog', 'curse', 'ash', 'rise', 'trail', 'aura']) {
    fx.clear();
    fx.consume([{ type: 'creature', k, x: 100, y: 100, z: 10, tx: 150, ty: 100, tz: 0, R: 34 }]);
    assert.ok(fx.store.live.length > 0, `${k}: Partikel`);
  }
  const w = mkWorld(), f = spawn(w, 'krieger', 100, 100, 'blau');
  curseFrog(w, f);
  f.mx = 30;
  let lo = 0;
  for (let t = 0; t < 1; t += .02) lo = Math.min(lo, poseUnit(f, t).bob);
  assert.ok(lo < -3, `Frosch springt (${lo})`);
});

// Review Task 6, Punkt 3: Sanitäter und Heilwelle verschwenden nichts an der Asche des Phönix
test('Sanitäter: heilt nicht die Asche des Phönix, sondern den verletzten Krieger daneben', () => {
  const w = mkWorld(), s = spawn(w, 'sani', 300, 400, 'blau');
  const p = spawn(w, 'phoenix', 340, 400, 'blau'); p.hp = 0; p.ashT = 1.8; p.z = 0; p.fz = 0;
  const k = spawn(w, 'krieger', 360, 430, 'blau'); k.hp = 10;
  spawn(w, 'krieger', 1300, 700, 'rot').cd = 1e9;
  rebuildHash(w); s.cd = 0; s.abCd = 1e9;
  think(w, s, DT);
  assert.equal(s.tg, k);
  s.tg = p; s.rt = 5; think(w, s, DT);
  assert.notEqual(s.tg, p, 'altes Ziel zu Asche geworden: neu wählen');
  assert.equal(p.hp, 0);
});

// Review Task 6, Punkt 4: ein Frosch stirbt als sein ursprünglicher Typ (Leiche und Todesmeldung)
test('Frosch stirbt: Leiche, Teile und death-Ereignis nach dem ursprünglichen Typ', () => {
  const w = mkWorld(), r = spawn(w, 'ritter', 300, 400, 'rot'), s = spawn(w, 'schuetze', 500, 400, 'blau');
  rebuildHash(w);
  assert.ok(curseFrog(w, r));
  w.events.length = 0;
  hurt(w, r, 1e6, 'arrow', s);
  assert.ok(!r.alive);
  const ev = w.events.find(e => e.type === 'death');
  assert.equal(ev.unitType, 'ritter');
  assert.ok(w.corpses.length > 0 && w.corpses.every(c => c.type === 'ritter'), w.corpses.map(c => c.type).join());
  // Körper plus die Teile des Ritters (Helm und Schild), nicht die des Froschs (keine)
  assert.equal(w.corpses.filter(c => c.kind === 'part').length, 2);
});
