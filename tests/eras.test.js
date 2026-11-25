// Schrottplatz und Urzeit (18.11.): Roboter mit Schild, Laser, Tesla, Kuppel, Bauen; Dinos, die wachsen, und das T-Rex-Ei.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, PLURAL, CATEGORIES, TERRAIN, CELL, BOT, DOME, YOUNG, REX_HATCH, MACHINE } from '../game/js/data.js';
import { createWorld, spawn, rebuildHash, setCell, nearestEnemy, aloft } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { hurt } from '../game/js/combat.js';
import { ABILITY, FEARLESS, NO_GHOUL, BUILD, WRECK, laserShot, teslaArc, megaWreck } from '../game/js/abilities.js';
import { ruleAllows, RULE } from '../game/js/rules.js';
import { unitCard } from '../game/js/cards.js';
import { deathVoice } from '../game/js/audio.js';
import { rigLayout } from '../game/js/render/rig.js';

const DT = 1 / 60;
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
const dummy = (w, type, x, y, team = 'rot') => { const e = spawn(w, type, x, y, team); e.hp = 1e9; e.cd = 1e9; e.abCd = 1e9; return e; };
const run = (w, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { step(w, DT); if (each) each(w.events); w.events.length = 0; } };
const SCHROTT = ['minibot', 'laserbot', 'drohne', 'kuppel', 'spinne', 'schweisser', 'magnet', 'tesla', 'mega'];
const URZEIT = ['hoehle', 'speer', 'schamane', 'raptor', 'ptera', 'anky', 'trike', 'rex', 'mammut'];

test('Daten: 9 Roboter und 9 Urzeit-Einheiten malbar, mit Texten, Mehrzahl, Karte und Zeichnung', () => {
  const cat = c => Object.keys(UNITS).filter(k => UNITS[k].cat === c && UNITS[k].paint !== false);
  assert.deepEqual(cat('schrott'), SCHROTT);
  assert.deepEqual(cat('urzeit'), URZEIT);
  assert.ok(CATEGORIES.some(c => c[0] === 'schrott') && CATEGORIES.some(c => c[0] === 'urzeit'));
  for (const t of [...SCHROTT, ...URZEIT, 'rexei']) {
    assert.ok(PLURAL[t], `${t}: Mehrzahl`);
    assert.ok(UNITS[t].abil && UNITS[t].abil.length, `${t}: Kartentext`);
    for (const a of UNITS[t].abil) { assert.ok(a.n.length <= 24, `${t}: ${a.n}`); assert.ok(a.d.length <= 140, `${t}: ${a.d}`); }
    assert.ok(rigLayout(t).body, `${t}: Rig`);
  }
  for (const t of SCHROTT) { assert.ok(UNITS[t].bot, t); assert.ok(MACHINE.has(t), t); assert.ok(FEARLESS.has(t), t); assert.ok(NO_GHOUL.has(t), t); assert.equal(deathVoice(t), 'dieMetal', t); }
  for (const t of ['raptor', 'ptera', 'anky', 'trike', 'rex']) assert.equal(deathVoice(t), 'dieBeast', t);
  assert.equal(UNITS.rexei.paint, false);
  assert.ok(unitCard('tesla').tags.length > 0);
});

test('Regeln: Schrottplatz, Urzeit und zwei Mischungen fürs 1 gegen 1', () => {
  assert.ok(ruleAllows('schrott', 'mega') && !ruleAllows('schrott', 'rex'));
  assert.ok(ruleAllows('urzeit', 'rex') && !ruleAllows('urzeit', 'rexei'), 'das Ei ist nicht malbar');
  assert.ok(ruleAllows('maschinen', 'panzer') && ruleAllows('maschinen', 'tesla') && !ruleAllows('maschinen', 'ritter'));
  assert.ok(ruleAllows('jura', 'wolf') && ruleAllows('jura', 'trike'));
  assert.ok(ruleAllows('luft', 'ptera') && ruleAllows('luft', 'drohne'));
  assert.ok(RULE.alles && ruleAllows('alles', 'laserbot'));
});

/* ---------- Roboter ---------- */
test('Bot-Schild: schluckt Treffer vor den LP, lädt nach Pause wieder auf; Blitz doppelt', () => {
  const w = mkWorld(), b = spawn(w, 'minibot', 300, 300, 'blau'), k = spawn(w, 'krieger', 320, 300, 'rot');
  const S = UNITS.minibot.hp * BOT.SHIELD;
  assert.equal(b.shd, S);
  hurt(w, b, S * .5, 'melee', k);
  assert.equal(b.hp, UNITS.minibot.hp, 'Schild nimmt den Schlag');
  assert.ok(Math.abs(b.shd - S * .5) < 1e-9);
  hurt(w, b, S, 'melee', k);
  assert.ok(b.shd === 0 && b.hp < UNITS.minibot.hp, 'Rest geht an die LP');
  const hp = b.hp; k.cd = 1e9; k.x = 900;
  run(w, BOT.RECHARGE_T + 3);
  assert.ok(b.shd > 0, 'lädt wieder auf');
  const m = spawn(w, 'mega', 600, 600, 'blau'); m.shd = 0;
  const h0 = m.hp; hurt(w, m, 10, 'lightning', k); const dl = h0 - m.hp;
  const h1 = m.hp; m.shd = 0; hurt(w, m, 10, 'melee', k); const dm = h1 - m.hp;
  assert.ok(dl > dm * 1.6, `Blitz ${dl} gegen Schlag ${dm}`);
  assert.ok(b.hp >= hp);
});

test('Kurzschluss: Bodenroboter im Wasser kurz betäubt, Flieger nicht', () => {
  const w = mkWorld();
  for (let gy = 5; gy < 15; gy++) for (let gx = 5; gx < 15; gx++) setCell(w, gy * w.GW + gx, TERRAIN.wasser.id);
  const b = spawn(w, 'laserbot', 10 * CELL, 10 * CELL, 'blau'), d = spawn(w, 'drohne', 10 * CELL + 10, 10 * CELL, 'blau');
  let short = 0;
  run(w, .2, ev => { for (const e of ev) if (e.type === 'ability' && e.k === 'short') short++; });
  assert.equal(short, 1);
  assert.equal(b.state, 'stun');
  assert.notEqual(d.state, 'stun');
});

test('Laser: trifft sofort, auch Flieger, und geht durch auf einen zweiten Gegner', () => {
  const w = mkWorld(), l = spawn(w, 'laserbot', 200, 300, 'blau');
  const a = dummy(w, 'krieger', 340, 300), b = dummy(w, 'krieger', 400, 302), c = dummy(w, 'krieger', 600, 300);
  rebuildHash(w);
  laserShot(w, l, a);
  assert.ok(a.hp < 1e9 && b.hp < 1e9, 'Ziel und der dahinter');
  assert.equal(c.hp, 1e9, 'zu weit dahinter');
  assert.ok(w.events.some(e => e.type === 'spell' && e.k === 'laser'));
  const h = dummy(w, 'heli', 300, 500); h.z = 60; rebuildHash(w);
  laserShot(w, l, h);
  assert.ok(h.hp < 1e9, 'Flieger getroffen');
});

test('Teslaspule: Kettenblitz springt auf mehrere Gegner, nicht auf Eigene', () => {
  const w = mkWorld(), t = spawn(w, 'tesla', 200, 300, 'blau'), own = spawn(w, 'minibot', 330, 300, 'blau');
  const e = [0, 1, 2, 3].map(i => dummy(w, 'krieger', 300 + i * 50, 300));
  rebuildHash(w);
  const oh = own.hp, os = own.shd;
  teslaArc(w, t, e[0]);
  for (const v of e) assert.ok(v.hp < 1e9, 'jeder getroffen');
  assert.ok(e[3].hp > e[0].hp, 'Schaden fällt mit jedem Sprung');
  assert.equal(own.hp, oh); assert.equal(own.shd, os);
});

test('Schildkuppel: fängt einen Pfeil von außen ab und bricht nach DOME.HP Schaden', () => {
  const w = mkWorld(), k = spawn(w, 'kuppel', 700, 400, 'blau');
  k.cd = 1e9; const s = spawn(w, 'schuetze', 400, 400, 'rot');
  s.hp = 1e9;
  let caught = 0, broke = 0;
  run(w, 30, ev => {
    k.x = 700; k.y = 400; k.vx = k.vy = 0;   // die Kuppel bleibt stehen, der Schütze schießt von außen
    for (const e of ev) { if (e.type === 'ability' && e.k === 'domeHit') caught++; if (e.k === 'domeBreak') broke++; }
  });
  assert.ok(caught > 0, 'Pfeile abgefangen');
  assert.ok(broke >= 1, 'überlastet');
  assert.ok(k.hp > 0);
  assert.equal(DOME.R, 70);
});

test('Schrauber-Drohne: baut aus 2 eigenen Schrotthaufen einen Minibot; repariert Panzer, aber keine Menschen', () => {
  const w = mkWorld(), d = spawn(w, 'drohne', 300, 300, 'blau');
  const bots = [spawn(w, 'minibot', 320, 300, 'blau'), spawn(w, 'minibot', 300, 330, 'blau')];
  dummy(w, 'krieger', 1300, 700);   // ohne Gegner denkt niemand nach
  for (const b of bots) { b.shd = 0; hurt(w, b, 1e6, 'melee', null); }
  run(w, 3);
  const n0 = w.units.filter(u => u.alive && u.type === 'minibot').length;
  d.abCd = 0;
  run(w, 2);
  assert.equal(w.units.filter(u => u.alive && u.type === 'minibot').length, n0 + 1, 'Minibot gebaut');
  assert.ok(ABILITY.drohne.cd === BUILD.CD);
  const w2 = mkWorld(), d2 = spawn(w2, 'drohne', 300, 300, 'blau'), p = spawn(w2, 'panzer', 330, 300, 'blau'), k = spawn(w2, 'krieger', 300, 330, 'blau');
  dummy(w2, 'krieger', 1300, 700);
  p.hp = 100; k.hp = 20;
  run(w2, 4);
  assert.ok(p.hp > 100, 'Panzer repariert');
  assert.equal(k.hp, 20, 'Krieger nicht geheilt');
  const w3 = mkWorld(), sa = spawn(w3, 'sani', 300, 300, 'blau'), mb = spawn(w3, 'minibot', 330, 300, 'blau');
  dummy(w3, 'krieger', 1300, 700);
  mb.hp = 10; run(w3, 3);
  assert.equal(mb.hp, 10, 'Sanitäter heilt keine Roboter');
});

test('Mega-Mech: zerfällt beim Tod in WRECK.N Minibots seines Teams', () => {
  const w = mkWorld(), m = spawn(w, 'mega', 500, 400, 'blau');
  m.shd = 0; hurt(w, m, 1e7, 'melee', null);
  const mini = w.units.filter(u => u.alive && u.type === 'minibot');
  assert.equal(mini.length, WRECK.N);
  for (const u of mini) assert.equal(u.team, 'blau');
  assert.equal(typeof megaWreck, 'function');
});

/* ---------- Urzeit ---------- */
test('Wachsen: Raptor startet als Jungtier und wird nach T.grow s erwachsen (LP im selben Anteil)', () => {
  const w = mkWorld(), r = spawn(w, 'raptor', 300, 300, 'blau');
  assert.equal(r.T, YOUNG.raptor);
  assert.ok(r.T.hp < UNITS.raptor.hp && r.T.dmg < UNITS.raptor.dmg && r.T.r < UNITS.raptor.r);
  r.hp = r.T.hp / 2;
  let grow = 0;
  run(w, UNITS.raptor.grow + .2, ev => { for (const e of ev) if (e.type === 'ability' && e.k === 'grow') grow++; });
  assert.equal(grow, 1);
  assert.equal(r.T, UNITS.raptor);
  assert.ok(Math.abs(r.hp - UNITS.raptor.hp / 2) < 2, 'halbe LP bleiben halbe LP');
});

test('T-Rex: Ei (kämpft und läuft nicht), schlüpft nach REX_HATCH s, ist nach T.grow s erwachsen', () => {
  const w = mkWorld(), r = spawn(w, 'rex', 300, 300, 'blau'), k = dummy(w, 'krieger', 330, 300);
  assert.equal(r.type, 'rex'); assert.equal(r.T, UNITS.rexei);
  run(w, REX_HATCH - .5);
  assert.equal(k.hp, 1e9, 'das Ei greift nicht an');
  assert.ok(Math.abs(r.x - 300) < 1, 'das Ei läuft nicht');
  run(w, 1);
  assert.equal(r.T, YOUNG.rex, 'geschlüpft');
  k.x = 1300; k.y = 700;
  run(w, UNITS.rex.grow - REX_HATCH);
  assert.equal(r.T, UNITS.rex, 'erwachsen');
});

test('Schamanin: Kräuterrauch lässt Jungtiere in der Nähe schneller wachsen', () => {
  const w = mkWorld(), a = spawn(w, 'raptor', 300, 300, 'blau'), b = spawn(w, 'raptor', 1100, 600, 'blau');
  spawn(w, 'schamane', 320, 300, 'blau');
  run(w, UNITS.raptor.grow * .6);
  assert.equal(a.T, UNITS.raptor, 'mit Rauch schon erwachsen');
  assert.equal(b.T, YOUNG.raptor, 'ohne noch jung');
});

// Luft gegen Nahkampf (20.11.): oben unerreichbar, aber Nahkämpfer bleiben ihm auf den Fersen (world.chaseAir), damit sie
// beim Herabstoßen zum Steinwurf zur Stelle sind
test('Flugsaurier: oben unerreichbar, Nahkämpfer verfolgen ihn trotzdem', () => {
  const w = mkWorld(), p = spawn(w, 'ptera', 300, 300, 'blau'), k = spawn(w, 'krieger', 340, 300, 'rot');
  assert.ok(aloft(p));
  rebuildHash(w);
  assert.equal(nearestEnemy(w, k), p);
  p.z = 8; assert.ok(!aloft(p), 'unten erreichbar');
});

test('Ankylosaurus: von vorn halber Schaden durch Schläge', () => {
  const w = mkWorld(), a = spawn(w, 'anky', 300, 300, 'blau'), k = spawn(w, 'krieger', 330, 300, 'rot'), b = spawn(w, 'krieger', 270, 300, 'rot');
  a.T = UNITS.anky; a.hp = 1000; a.face = 1; a.fx = 1; a.fy = 0;
  hurt(w, a, 20, 'melee', k); const front = 1000 - a.hp;
  const h = a.hp; hurt(w, a, 20, 'melee', b); const back = h - a.hp;
  assert.ok(front < back * .6, `vorn ${front}, hinten ${back}`);
});

test('Gemischte Schlacht Schrottplatz gegen Urzeit läuft 90 s ohne Fehler und ohne NaN', () => {
  const w = mkWorld(3);
  for (let gy = 8; gy < 14; gy++) for (let gx = 60; gx < 80; gx++) setCell(w, gy * w.GW + gx, TERRAIN.wasser.id);
  for (let i = 0; i < 27; i++) { spawn(w, SCHROTT[i % 9], 150 + (i % 5) * 30, 100 + ((i / 5) | 0) * 110, 'blau'); spawn(w, URZEIT[i % 8], 1250 - (i % 5) * 30, 100 + ((i / 5) | 0) * 110, 'rot'); }
  run(w, 90, () => { for (const u of w.units) assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y) && Number.isFinite(u.hp), u.type); });
});

/* ---------- Regression 18.11.: T-Rex fehlte beim Kampfstart ----------
   Aufstellung, Teilen, Online/Code-Duell und Sandkasten-Speicher fragten u.T.paint ab; das Ei trägt UNITS.rexei
   (nicht malbar), also fiel jeder gemalte T-Rex beim Start der Schlacht weg. */
test('T-Rex-Ei: bleibt in Aufstellung, Wiederherstellung, Teilen und Online-Armee erhalten', async () => {
  const { snapshotBattle, restoreBattle } = await import('../game/js/battle.js');
  const { battleData } = await import('../game/js/share.js');
  const { packArmy, unpackArmy } = await import('../game/js/online.js');
  const w = mkWorld();
  const r = spawn(w, 'rex', 300, 300, 'blau'), y = spawn(w, 'raptor', 330, 330, 'blau');
  spawn(w, 'krieger', 1000, 300, 'rot');
  assert.equal(r.T, UNITS.rexei); assert.equal(y.T, YOUNG.raptor);
  const snap = snapshotBattle(w);
  assert.deepEqual(snap.units.map(u => u.type), ['rex', 'raptor', 'krieger']);
  restoreBattle(w, snap);
  const back = w.units.filter(u => u.alive).map(u => u.type);
  assert.deepEqual(back, ['rex', 'raptor', 'krieger']);
  const r2 = w.units.find(u => u.type === 'rex');
  assert.equal(r2.T, UNITS.rexei); assert.equal(r2.hp, UNITS.rexei.hp);
  assert.ok(battleData(w).units.some(e => e[0] === 'rex'), 'Teilen');
  const txt = packArmy(w, 'blau');
  assert.deepEqual(unpackArmy(txt, 'blau', w.W, w.H, { cat: 'urzeit', budget: 100 }).map(u => u.type).sort(), ['raptor', 'rex']);
  // ausgewachsen gespeichert, klein wiederhergestellt: LP nicht über dem Höchstwert des Jungtiers
  const w2 = mkWorld(), g = spawn(w2, 'raptor', 300, 300, 'blau'); spawn(w2, 'krieger', 1000, 300, 'rot');
  g.T = UNITS.raptor; g.hp = UNITS.raptor.hp; g.growT = 0;
  restoreBattle(w2, snapshotBattle(w2));
  const g2 = w2.units.find(u => u.type === 'raptor');
  assert.ok(g2.hp <= g2.T.hp);
});

/* ---------- Regression 18.11.: Flugsaurier schadeten sich selbst ----------
   Der Stein war eine normale Bombe: die Explosion traf alles bis in jede Höhe, also den Flugsaurier über dem Ziel, seine
   Schwarm-Nachbarn und eigene Nahkämpfer am Ziel. Jetzt trifft er nur Feinde am Boden (combat.landArc, p.stone). */
test('Flugsaurier: Steine treffen weder ihn selbst noch andere Flugsaurier noch eigene Nahkämpfer', () => {
  const w = mkWorld(3);
  const P = [0, 1, 2, 3].map(i => spawn(w, 'ptera', 300, 300 + i * 20, 'blau'));
  const H = [0, 1, 2].map(i => spawn(w, 'hoehle', 320, 330 + i * 20, 'blau'));
  const E = [0, 1, 2, 3, 4].map(i => { const e = spawn(w, 'ritter', 700, 280 + i * 25, 'rot'); e.cd = 1e9; e.stoneCd = 1e9; return e; });
  run(w, 12);
  for (const u of P) assert.equal(u.hp, UNITS.ptera.hp, 'Flugsaurier unverletzt');
  for (const u of H) assert.equal(u.hp, UNITS.hoehle.hp, 'Höhlenmensch unverletzt');
  assert.ok(E.some(e => e.hp < UNITS.ritter.hp), 'Feinde getroffen');
});
