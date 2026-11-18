// Zusammenführung von Task 5 (Tiere), Task 6 (Kreaturen) und Nachtrag 4 (Task 4b): Regeln, die keiner der Zweige allein
// prüfen konnte (verstecktes Krokodil und Phönix-Asche in den neuen Zielwahlen, Immunitäten, Listen, Form der Einheiten).
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNITS, TERRAIN, CELL, UNDEAD, CATEGORIES } from '../game/js/data.js';
import { createWorld, spawn, rebuildHash, setCell } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { think, hullMg, poison } from '../game/js/combat.js';
import { ABILITY, FEARLESS, NO_GHOUL, FROG_IMMUNE, canCurse, curseFrog, scare } from '../game/js/abilities.js';
import { stamp } from '../game/js/paint.js';
import { mixed2Types, MIXED_TYPES } from '../game/js/bench.js';

const DT = 1 / 60;
const mkWorld = (seed = 7) => { const w = createWorld(1400, 800, seed); w.teamMode = true; return w; };
const water = (w, x0, y0, x1, y1) => {
  for (let gy = (y0 / CELL) | 0; gy <= (y1 / CELL) | 0; gy++) for (let gx = (x0 / CELL) | 0; gx <= (x1 / CELL) | 0; gx++) setCell(w, gy * w.GW + gx, TERRAIN.wasser.id);
};
// Krokodil, das im Wasser liegt und nichts tut (versteckt, solange niemand näher als HIDE_R ist)
function hiddenCroc(w, x, y, team = 'rot') {
  water(w, x - 60, y - 60, x + 60, y + 60);
  const c = spawn(w, 'krokodil', x, y, team); c.hp = 1e9; c.cd = 1e9; c.abCd = 1e9; c.T = { ...UNITS.krokodil, speed: 0 };
  c.hidden = true; c.seenT = 0;
  return c;
}
// Phönix als Asche (bleibt Asche, solange der Test läuft)
function ash(w, x, y, team = 'rot') {
  const p = spawn(w, 'phoenix', x, y, team); p.hp = 0; p.ashT = 1e9; p.z = 0; p.fz = 0;
  return p;
}

test('Froschfluch: der Elefant (Task 5) ist immun wie die Bosse und der Ghul', () => {
  for (const t of ['elefant', 'panzer', 'heli', 'drache', 'ghul']) assert.ok(FROG_IMMUNE.has(t), t);
  const w = mkWorld(), e = spawn(w, 'elefant', 300, 300, 'rot');
  assert.equal(canCurse(e), false);
  assert.equal(curseFrog(w, e), false);
  assert.equal(e.type, 'elefant');
});

test('FEARLESS: Elefant furchtlos gegen Brüllen und Spuk, Bienen erschrecken ihn trotzdem', () => {
  assert.deepEqual([...FEARLESS].sort(), ['bomber', 'drache', 'drohne', 'elefant', 'heli', 'jet', 'kampfdrohne', 'kuppel', 'laserbot', 'magnet', 'mega', 'minibot', 'panzer', 'schweisser', 'spinne', 'tesla']);
  const w = mkWorld(), g = spawn(w, 'geist', 300, 300, 'blau'), e = spawn(w, 'elefant', 380, 300, 'rot');
  g.tg = e; rebuildHash(w);
  assert.equal(ABILITY.geist.ready(w, g), false, 'Spuk wirkt nicht');
  // die Bienenangst ruft scare direkt (abilities.animalPassive), FEARLESS hält sie nicht auf
  scare(w, e, 1.5);
  assert.ok(e.fearT > 0);
});

test('UNDEAD, NO_GHOUL, Gift: Ghule nie geheilt oder vergiftet; Frosch und Bosse nie Ghul', () => {
  assert.ok(UNDEAD.has('ghul'));
  for (const t of ['ghul', 'frosch', 'panzer', 'heli', 'drache', 'elefant']) assert.ok(NO_GHOUL.has(t), t);
  const w = mkWorld(), b = spawn(w, 'biene', 300, 300, 'blau'), gh = spawn(w, 'ghul', 310, 300, 'rot');
  poison(w, gh, b);
  assert.equal(gh.poisonT, 0);
});

test('Nicht malbar: der Frosch (Task 6) fällt unter den paint:false-Rückhalt von stamp (Nachtrag 4, 8a)', () => {
  const w = mkWorld();
  const r = stamp(w, { placed: [], erased: [], terr: [] }, 300, 300, 40, 'frosch', 'blau', null, null);
  assert.equal(r.placed, 0);
  assert.equal(w.units.length, 0);
  assert.ok(!mixed2Types().includes('frosch') && !mixed2Types().includes('ghul'));
});

test('Kategorien: Tiere 8 und Mythisch 9 malbare Einheiten; mixed bleibt fest, mixed2 hat beide neuen Sätze', () => {
  const keys = c => Object.keys(UNITS).filter(k => UNITS[k].cat === c && UNITS[k].paint !== false);
  assert.deepEqual(keys('tiere'), ['wolf', 'baer', 'biene', 'elefant', 'krokodil', 'gorilla', 'adler', 'lama', 'stinktier', 'bueffel']);   // Lama: Ideenrunde 18.11.
  assert.deepEqual(CATEGORIES.map(c => c[0]), ['armee', 'tiere', 'mythisch', 'modern', 'schrott', 'urzeit', 'gelaende']);
  assert.deepEqual(keys('mythisch'), ['magier', 'geist', 'drache', 'vampir', 'troll', 'zyklop', 'hexe', 'phoenix', 'einhorn']);
  const neu = ['elefant', 'krokodil', 'gorilla', 'adler', 'bueffel', 'troll', 'zyklop', 'hexe', 'phoenix', 'einhorn'];
  for (const t of neu) { assert.ok(mixed2Types().includes(t), t); assert.ok(!MIXED_TYPES.includes(t), t); }
});

test('Form der Einheiten: alle Felder aus Task 4b, 5 und 6 je einmal, Zahlenfelder als Zahlen', () => {
  const w = mkWorld();
  const keys = Object.keys(spawn(w, 'krieger', 50, 50, 'blau'));
  for (const k of ['rangedT', 'poisonT', 'poisonSrc', 'stingTg', 'healAt', 'healN', 'mgCd', 'frogFrom', 'frogT', 'reborn', 'ashT',
    'noHealT', 'auraT', 'auraAt', 'trailT', 'hidden', 'seenT', 'grabbed', 'herdCd', 'beatCd', 'beeCd']) {
    assert.equal(keys.filter(x => x === k).length, 1, k);
  }
  for (const t of Object.keys(UNITS)) {
    const u = spawn(w, t, 100, 100, 'rot');
    assert.equal(Object.keys(u).join(), keys.join(), t);
    for (const k of ['rangedT', 'poisonT', 'healAt', 'mgCd', 'frogT', 'ashT', 'noHealT', 'auraT', 'auraAt', 'trailT', 'seenT', 'herdCd', 'beatCd', 'beeCd']) {
      assert.equal(typeof u[k], 'number', `${t}.${k}`);
    }
  }
});

/* ---------- Verstecktes Krokodil (Task 5) in den neuen Zielwahlen ---------- */
test('Hexe: verflucht kein abgetauchtes Krokodil, auch wenn es noch ihr Ziel ist', () => {
  const w = mkWorld(), c = hiddenCroc(w, 450, 400), h = spawn(w, 'hexe', 300, 400, 'blau');
  rebuildHash(w); h.tg = c; h.abCd = 0;
  assert.equal(ABILITY.hexe.ready(w, h), false);
  c.seenT = 2;   // nach einem Biss sichtbar: dann schon
  assert.equal(ABILITY.hexe.ready(w, h), true);
});

test('Zyklop und Einhorn: ein abgetauchtes Krokodil als altes Ziel fällt bei der Neuwahl weg, kein Felsbrocken', () => {
  for (const type of ['zyklop', 'einhorn']) {
    const w = mkWorld(), c = hiddenCroc(w, 520, 400), u = spawn(w, type, 300, 400, 'blau');
    u.abCd = 1e9; u.cd = 0; u.tg = c; u.rt = 5; rebuildHash(w);
    think(w, u, DT);
    assert.notEqual(u.tg, c, type);
    assert.equal(w.proj.filter(p => p.kind === 'boulder').length, 0, type);
  }
});

test('Bug-MG des Panzers: schießt nicht auf ein verstecktes Krokodil (auch nicht als u.tg)', () => {
  const w = mkWorld(), p = spawn(w, 'panzer', 300, 400, 'blau'), c = hiddenCroc(w, 450, 400);
  rebuildHash(w); p.cd = 2; p.mgCd = 0; p.tg = c;
  hullMg(w, p, DT);
  assert.equal(w.proj.length, 0, 'Krokodil');
  // Gegenprobe: ein Krieger an derselben Stelle wird beschossen
  const w2 = mkWorld(), p2 = spawn(w2, 'panzer', 300, 400, 'blau'), k = spawn(w2, 'krieger', 450, 400, 'rot');
  rebuildHash(w2); p2.cd = 2; p2.mgCd = 0; p2.tg = k;
  hullMg(w2, p2, DT);
  assert.equal(w2.proj.filter(q => q.kind === 'bullet').length, 1, 'Krieger');
});

// Römerblock (Nachtrag 4, #35): Speer und Sturmangriff verteilen ihre Ziele, aber nie auf das versteckte Krokodil oder Asche
function romanBlock(w, n, x0, y0) {
  const rows = 3, cols = Math.ceil(n / rows), out = [];
  for (let k = 0; k < n; k++) out.push(spawn(w, 'roemer', x0 - (k % rows) * 22, y0 + (((k / rows) | 0) - (cols - 1) / 2) * 22, 'blau'));
  return out;
}
for (const [name, mkFoe] of [['verstecktes Krokodil', hiddenCroc], ['Phönix-Asche', ash]]) {
  test(`Römer: kein Speer und kein Sturmziel auf ${name}`, () => {
    for (const seed of [1, 2, 3]) {
      const w = mkWorld(seed);
      const rs = romanBlock(w, 12, 300, 400);
      // das Versteck liegt seitlich vor den zwei Gegnern: auf dem Anmarsch der einzige in Speerweite, beim Sturm (Ziele
      // verteilt nach d² · (1 + Ansprüche)) für die hinteren Römer das beste freie Ziel
      const foe = mkFoe(w, 560, 470);
      for (let k = 0; k < 2; k++) { const e = spawn(w, 'krieger', 620, 390 + k * 30, 'rot'); e.T = { ...UNITS.krieger, speed: 0 }; e.hp = 1e6; e.cd = 1e9; }
      let charged = false;
      for (let i = 0; i < 60 * 12; i++) {
        step(w, DT); w.events.length = 0;
        if (foe.type === 'krokodil') { foe.hidden = true; foe.seenT = 0; }
        // Speere fliegen im Bogen auf einen Zielpunkt (x1, y1) mit Vorhalt; das Ziel selbst steht still
        assert.ok(!w.proj.some(p => p.kind === 'pilum' && (p.x1 - foe.x) ** 2 + (p.y1 - foe.y) ** 2 < 20 * 20), `Saat ${seed}: Speer auf ${name}`);
        assert.ok(!rs.some(u => u.alive && u.tg === foe && (foe.type !== 'krokodil' || (foe.x - u.x) ** 2 + (foe.y - u.y) ** 2 > 60 * 60)), `Saat ${seed}: Ziel ${name}`);
        if (w.formations.some(f => f.state === 'charge')) charged = true;
      }
      assert.ok(charged, `Saat ${seed}: Sturmangriff kam`);
    }
  });
}
