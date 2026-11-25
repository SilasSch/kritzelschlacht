// Schlacht-Modus (Spez. #45): Schnappschuss der Aufstellung, Wiederherstellen ("Nochmal", "Aufstellung ändern") und die
// Auswertung "10× auswerten" ohne Zeichnen. Rein: kein DOM, kein PIXI, Zufall nur über world.rng(). main.js baut darauf
// die Abläufe mit Oberfläche.
import { UNITS } from './data.js';
import { createWorld, spawn, rebuildHash, clearBattle, touchTerrain } from './world.js';
import { step, battleWinner } from './sim.js';
import { STONE_WALL } from './spells.js';
import { createRng } from './rng.js';
import { applyShape } from './shapes.js';

export const STEP = 1 / 60;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const isSide = t => t === 'blau' || t === 'rot';

// Aufstellung beider Seiten mit Gelände. Ghule (nicht malbar) gehören zu einer Schlacht und kommen nicht mit; ein Frosch
// kommt als er selbst, die Asche des Phönix mit halben LP (wie saveSandbox in main.js); Steinwände der Magier nicht.
// Malbar nach u.type, nicht u.T: ein T-Rex trägt als Ei UNITS.rexei (nicht malbar) und ist trotzdem ein T-Rex.
export function snapshotBattle(world) {
  const units = [];
  for (const u of world.units) {
    if (!u.alive || !isSide(u.team) || (UNITS[u.type].paint === false && u.frogFrom === null)) continue;
    units.push({ type: u.frogFrom || u.type, team: u.team, x: u.x, y: u.y, hp: u.ashT > 0 ? u.T.hp / 2 : u.hp, reborn: u.reborn, shape: u.shape });
  }
  const towner = world.towner.slice(), terr = world.terr.slice(), whp = world.whp.slice();
  for (let i = 0; i < towner.length; i++) if (towner[i] === STONE_WALL.OWNER) { terr[i] = 0; towner[i] = 0; whp[i] = 0; }
  return { W: world.W, H: world.H, GW: world.GW, GH: world.GH, units, terr, towner, whp, weather: world.weather || null };   // Wetter (25.11.)
}

// Stellt die Aufstellung exakt wieder her: leert alles, was zur Schlacht gehört (Leichen, Geschosse, Trümmer, Formationen,
// Zauberwände, Meteor-Kanäle, Ghule, Brand und Gift mit den Einheiten), dann Gelände (auf dem gemeinsamen Teil des Gitters,
// falls sich die Größe geändert hat) und Einheiten in derselben Reihenfolge.
export function restoreBattle(world, s) {
  clearBattle(world);
  world.contested = false; world.teamMode = true;
  world.weather = s.weather || null;   // Wetter (25.11.)
  world.terr.fill(0); world.towner.fill(0); world.whp.fill(0);
  const mw = Math.min(s.GW, world.GW), mh = Math.min(s.GH, world.GH);
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const a = y * s.GW + x, b = y * world.GW + x;
    world.terr[b] = s.terr[a]; world.towner[b] = s.towner[a]; world.whp[b] = s.whp[a];
  }
  touchTerrain(world);
  for (const u of s.units) {
    const n = spawn(world, u.type, clamp(u.x, 6, world.W - 6), clamp(u.y, 6, world.H - 6), u.team);
    n.hp = n.growT > 0 ? Math.min(u.hp, n.T.hp) : u.hp; n.reborn = u.reborn;   // Dinos starten wieder klein (Ei, Jungtier)
    if (u.shape) applyShape(n, u.shape, false);
  }
  rebuildHash(world);
}

// Kampfbeginn mit festem Zustand (Replay): stellt die Aufstellung wieder her und setzt alles zurück, was die Welt aus
// früheren Kämpfen mitbringt (Zufall, Zeit, ids, Wegfindung, Zähler für Blöcke und Zauber). Zweimal mit demselben snap und
// derselben Saat aufgerufen, läuft der Kampf danach Schritt für Schritt gleich, egal was vorher in der Welt geschah.
export function resetFight(world, snap, seed) {
  world.rng = createRng(seed);
  world.time = 0; world.nextId = 1; world.flow = null;
  world.formNext = 1; world.castNext = 1; world.lastWinT = -9;
  restoreBattle(world, snap);
  world.contested = false;
}

// Seiten tauschen: spiegelt Einheiten und Gelände an der Mittellinie, Blau wird Rot und umgekehrt
export function mirrorBattle(world) {
  const s = snapshotBattle(world), { GW, GH } = s;
  for (const u of s.units) { u.x = world.W - u.x; u.team = u.team === 'blau' ? 'rot' : 'blau'; }
  for (const k of ['terr', 'towner', 'whp']) {
    const a = s[k], m = a.slice();
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) m[y * GW + x] = a[y * GW + (GW - 1 - x)];
    s[k] = m;
  }
  restoreBattle(world, s);
}

// Eine Schlacht ohne Zeichnen bis zum Sieger (battleWinner), Schritt für Schritt; events werden verworfen
export function createFight(snap, seed) {
  const world = createWorld(snap.W, snap.H, seed);
  world.teamMode = true;
  restoreBattle(world, snap);
  const f = { world, t: 0, winner: null };
  f.winner = battleWinner(world, 0);
  return f;
}
export function stepFight(f) {
  step(f.world, STEP);
  f.t += STEP;
  f.world.events.length = 0;
  f.winner = battleWinner(f.world, f.t);
  return f.winner;
}

// "10× auswerten": n Schlachten derselben Aufstellung mit den Saaten seed, seed + 1, ...; pump(ms) rechnet höchstens etwa
// ms Millisekunden weiter (main.js je Bild), cancel() bricht ab. Ergebnis { wins: { blau, rot, draw }, avgTime, times }.
export function createBatch(snap, n = 10, seed = 1, now = () => globalThis.performance.now()) {
  const wins = { blau: 0, rot: 0, draw: 0 }, times = [];
  let k = 0, fight = null;
  const b = {
    n, get k() { return k; }, done: n <= 0, cancelled: false, result: null,
    cancel() { b.cancelled = true; b.done = true; fight = null; },
    pump(ms = Infinity) {
      const end = now() + ms;
      while (!b.done) {
        if (!fight) fight = createFight(snap, (seed + k * 7919) | 0);
        const w = fight.winner || stepFight(fight);
        if (w) {
          wins[w]++; times.push(fight.t); fight = null; k++;
          if (k >= n) { b.done = true; b.result = { wins: { ...wins }, avgTime: times.reduce((a, x) => a + x, 0) / times.length, times: times.slice() }; }
        }
        if (now() >= end) break;
      }
      return b.done;
    },
  };
  if (b.done) b.result = { wins: { ...wins }, avgTime: 0, times: [] };
  return b;
}
