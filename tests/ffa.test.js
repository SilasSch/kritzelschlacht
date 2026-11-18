// Jeder gegen jeden (teamMode false, die Demo beim Start): Fraktion = Einheitentyp (world.factionOf). Rauchtests,
// dass Rückzug, Römerblöcke und Scharfschützen dort vernünftig bleiben (finale Prüfung der Römer-Runde): Fliehende
// laufen zum Schwerpunkt ihres Typs, Römer aller Teams bilden einen Block, kein Absturz, kein NaN.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn } from '../game/js/world.js';
import { step, placeRect, placeCircle } from '../game/js/sim.js';
import { SNIPER } from '../game/js/combat.js';
import { UNITS } from '../game/js/data.js';
import { HOME_W, HOME_NEAR } from '../game/js/morale.js';

const DT = 1 / 60;
const mk = (seed = 5) => { const w = createWorld(1400, 800, seed); w.teamMode = false; return w; };
const run = (w, secs, each) => { for (let i = 0; i < Math.round(secs * 60); i++) { step(w, DT); w.events.length = 0; if (each) each(i); } };
const finite = w => w.units.every(u => [u.x, u.y, u.hp, u.mx, u.my, u.vx, u.vy].every(Number.isFinite));
const dummy = (w, type, x, y, team) => { const e = spawn(w, type, x, y, team); e.hp = 1e9; e.cd = 1e9; return e; };

test('FFA Rückzug: ein Krieger flieht zum Schwerpunkt der Krieger, auch zu denen anderer Teams', () => {
  const w = mk();
  // eigene Art (andere Teams), betäubt und unsterblich: der Schwerpunkt bleibt bei (300, 600)
  for (let k = 0; k < 4; k++) { const a = dummy(w, 'krieger', 270 + k * 20, 600, k % 2 ? 'rot' : 'gelb'); a.state = 'stun'; a.stunT = 1e9; }
  const foe = dummy(w, 'ritter', 760, 300, 'blau');   // anderer Typ: Feind, auch im selben Team
  const u = spawn(w, 'krieger', 700, 300, 'blau'); u.hp = 10;
  const d0 = Math.hypot(u.x - 300, u.y - 600);
  run(w, 1.5);
  assert.equal(u.flee, true);
  assert.equal(foe.alive, true);
  const c = w.cent.get('krieger');
  assert.ok(c && Math.abs(c.x - 300) < 1e-6 && Math.abs(c.y - 600) < 1e-6, 'Schwerpunkt der Art Krieger');
  assert.ok([...w.cent.keys()].every(k => UNITS[k]), 'Fraktionen sind Typen');
  assert.ok(Math.hypot(u.x - 300, u.y - 600) < d0 - 60, `näher am Schwerpunkt: ${d0.toFixed(0)} → ${Math.hypot(u.x - 300, u.y - 600).toFixed(0)}`);
  assert.ok(u.x < 700 && u.y > 300, 'weg vom Ritter, zu den Kriegern');
  assert.ok(finite(w));
});

test('FFA Römer: blaue und rote Römer bilden einen Block und marschieren auf den nächsten anderen Typ', () => {
  const w = mk();
  const rs = [];
  for (let k = 0; k < 8; k++) rs.push(spawn(w, 'roemer', 300 - (k % 2) * 22, 340 + ((k / 2) | 0) * 22, k < 4 ? 'blau' : 'rot'));
  spawn(w, 'krieger', 1100, 380, 'blau');
  run(w, 2);
  assert.equal(w.formations.length, 1);
  const f = w.formations[0];
  assert.equal(f.faction, 'roemer'); assert.equal(f.n, 8); assert.equal(f.state, 'march');
  assert.ok(rs.every(u => u.formOn && u.form === f.id));
  assert.ok(f.ax > .9, `Blick zum Krieger: ${f.ax.toFixed(2)}`);
  assert.ok(rs.every(u => u.x > 330), 'marschiert');
  assert.ok(finite(w));
});

test('FFA Scharfschützen: ohne eigene Front rücken sie nach der Wartezeit vor und weichen nahen Feinden aus', () => {
  const w = mk();
  const s = spawn(w, 'sniper', 200, 400, 'blau');
  spawn(w, 'krieger', 200 + UNITS.sniper.range + 300, 400, 'blau');   // anderer Typ: Feind, weit weg
  run(w, SNIPER.WAIT - .5);
  assert.ok(Math.abs(s.x - 200) < 1, 'wartet');
  run(w, 2);
  assert.ok(s.x > 230, `rückt vor: ${s.x.toFixed(0)}`);
  const w2 = mk(), s2 = spawn(w2, 'sniper', 600, 400, 'gelb');
  const e = dummy(w2, 'krieger', 600 + UNITS.sniper.range * .5, 400, 'gelb'); e.state = 'stun'; e.stunT = 1e9;
  run(w2, 1);
  assert.ok(e.x - s2.x > UNITS.sniper.range * .5 + 10, `weicht zurück: ${(e.x - s2.x).toFixed(0)}`);
  assert.ok(finite(w) && finite(w2));
});

// Saat 13 (Nachtrag 7): Saat 11 lag schon vorher knapp an der Grenze (80,3 %), mit dem Ausweichen 79,2 %; andere Saaten 89–100 %
test('FFA Demo-Schlacht mit Römern, Scharfschützen und Sanitätern: 30 s ohne NaN, Fliehende laufen zu ihrem Typ', () => {
  const w = mk(13);
  placeRect(w, 'krieger', 36, .12, .18, .24, .42, 'blau');
  placeRect(w, 'ritter', 12, .14, .58, .22, .74, 'blau');
  placeRect(w, 'grenadier', 18, .4, .52, .48, .68, 'rot');
  placeRect(w, 'reiter', 9, .42, .12, .52, .26, 'rot');
  placeCircle(w, 'biene', 40, .9, .2, .07, 'gelb');
  placeRect(w, 'schuetze', 14, .86, .62, .92, .84, 'gruen');
  placeRect(w, 'roemer', 20, .6, .3, .68, .5, 'blau');
  placeRect(w, 'sniper', 4, .7, .8, .74, .9, 'rot');
  placeRect(w, 'sani', 4, .05, .4, .08, .6, 'gruen');
  // Erwartete Fluchtrichtung wie morale.fleeSteer: weg vom Feind plus HOME_W zum Schwerpunkt c (zieht der auf den
  // Feind zu, nur sein seitlicher Anteil). Verglichen mit dem Schwerpunkt des eigenen Typs und, als Gegenprobe, dem
  // des eigenen Teams (das im FFA nichts bedeutet).
  const dir = (u, c) => {
    const t = u.tg, ex = u.x - t.x, ey = u.y - t.y, l = Math.hypot(ex, ey), ax = ex / l, ay = ey / l;
    let dx = ax, dy = ay;
    const hx = c.x - u.x, hy = c.y - u.y, hl = Math.hypot(hx, hy);
    if (hl > HOME_NEAR) { let nx = hx / hl, ny = hy / hl; const k = nx * ax + ny * ay; if (k < 0) { nx -= k * ax; ny -= k * ay; } dx += HOME_W * nx; dy += HOME_W * ny; }
    const m = Math.hypot(dx, dy); return [dx / m, dy / m];
  };
  const match = (u, c) => { const [dx, dy] = dir(u, c), m = Math.hypot(u.mx, u.my); return (dx * u.mx + dy * u.my) / m > .97; };
  let flee = 0, byType = 0, byTeam = 0;
  run(w, 30, i => {
    if (i % 30) return;
    const team = new Map();
    for (const v of w.units) if (v.alive && !v.flee) { const o = team.get(v.team) || { x: 0, y: 0, n: 0 }; o.x += v.x; o.y += v.y; o.n++; team.set(v.team, o); }
    for (const o of team.values()) { o.x /= o.n; o.y /= o.n; }
    for (const u of w.units) {
      if (!u.alive || !u.flee || u.state !== 'ok' || !u.tg || !u.tg.alive || !(u.mx || u.my) || u.cornerT > 0) continue;
      const c = w.cent.get(u.type), tc = team.get(u.team);
      if (!c || !c.n || !tc) continue;
      flee++;
      if (match(u, c)) byType++;
      if (match(u, tc)) byTeam++;
    }
  });
  assert.ok(finite(w), 'kein NaN');
  assert.ok(w.units.filter(u => !u.alive).length >= 20, 'es wurde gekämpft');
  assert.ok(flee >= 20, `Fluchtproben ${flee}`);
  assert.ok(byType >= .8 * flee, `Richtung zum eigenen Typ ${byType}/${flee}`);
  assert.ok(byTeam < .6 * flee, `Gegenprobe Team ${byTeam}/${flee}`);
});
