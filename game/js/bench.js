// Leistungsszenen (Task 13) für tools/bench.mjs und game/index.html?bench=N. Rein: kein DOM, Zufall nur
// über world.rng(), also bei gleicher Saat gleich aufgebaut.
//   mixed:      N Einheiten in 4 Teams (je ein Viertel), alle Typen gemischt, je Team 1 Drache, 2 Panzer und
//               2 Hubschrauber, der Rest gleich verteilt auf die übrigen 16 Typen (Mörser, Grenadiere,
//               MG-Schützen, Scharfschützen, Bienen …). Gelände: Mauerkreuz mit Lücken in der Mitte (Wegfindung
//               aktiv), zwei Lavafelder, ein Teich, ein Wäldchen.
//   blastcrowd: 500 Bienen im Kreis mit Radius 80 px, alle BLAST_EVERY Schritte 20 gleichzeitige
//               Mörsereinschläge darin (Review Focus #5); eine halbe Periode vor jeder Salve wird der Schwarm
//               wieder auf 500 aufgefüllt (buildBench).
import { UNITS } from './data.js';
import { spawn, rebuildHash, factionOf } from './world.js';
import { placeCircle, tRect, tCircle } from './sim.js';
import { PROJECTILES } from './combat.js';

export const BENCH_STEPS = 600;
export const BENCH_W = 1600, BENCH_H = 900;   // Welt eines Laptops (1920×1080 bei Grundzoom 1,15 ≈ 1670×940)
export const BENCH_TEAMS = ['blau', 'rot', 'gruen', 'gelb'];
export const BENCH_BOSSES = { drache: 1, panzer: 2, heli: 2 };   // je Team
export const SCENARIOS = ['mixed', 'blastcrowd'];
export const CROWD_N = 500, CROWD_R = 80, VOLLEY_N = 20, BLAST_EVERY = 60;

// Bereiche der Teams in Anteilen von W/H (vier Ecken, Abstand zur Mitte etwa eine Schussweite)
const ZONES = [[.04, .05, .38, .42], [.62, .05, .96, .42], [.04, .58, .38, .95], [.62, .58, .96, .95]];

export function benchMixed(world, n = 2000) {
  world.teamMode = true;
  // Gelände: Mauerkreuz mit Lücken (Wegfindung), Lava, Wasser, Wald
  tRect(world, 'mauer', .495, .02, .505, .3); tRect(world, 'mauer', .495, .42, .505, .58); tRect(world, 'mauer', .495, .7, .505, .98);
  tRect(world, 'mauer', .1, .49, .3, .51); tRect(world, 'mauer', .7, .49, .9, .51);
  tCircle(world, 'lava', .5, .36, .045); tCircle(world, 'lava', .5, .64, .045);
  tCircle(world, 'wasser', .25, .3, .06); tCircle(world, 'wald', .75, .72, .07);
  const rest = Object.keys(UNITS).filter(k => !(k in BENCH_BOSSES));
  const per = Math.floor(n / 4);
  for (let t = 0; t < 4; t++) {
    const cnt = t < 3 ? per : n - 3 * per, team = BENCH_TEAMS[t];
    const types = [];
    for (const k in BENCH_BOSSES) for (let i = 0; i < BENCH_BOSSES[k] && types.length < cnt; i++) types.push(k);
    for (let i = 0; types.length < cnt; i++) types.push(rest[i % rest.length]);
    // gemischt: Typen in Zufallsreihenfolge (world.rng) auf ein Gitter im Teambereich
    for (let i = types.length - 1; i > 0; i--) { const j = (world.rng() * (i + 1)) | 0; const q = types[i]; types[i] = types[j]; types[j] = q; }
    const [x0, y0, x1, y1] = ZONES[t], w = (x1 - x0) * world.W, h = (y1 - y0) * world.H;
    const cols = Math.max(1, Math.round(Math.sqrt(cnt * w / h))), rows = Math.ceil(cnt / cols);
    for (let k = 0; k < cnt; k++) {
      const i = k % cols, j = (k / cols) | 0;
      const x = x0 * world.W + (cols === 1 ? w / 2 : i * w / (cols - 1)) + (world.rng() - .5) * 4;
      const y = y0 * world.H + (rows === 1 ? h / 2 : j * h / (rows - 1)) + (world.rng() - .5) * 4;
      spawn(world, types[k], x, y, team);
    }
  }
  rebuildHash(world);
}

// Schwarm in der Mitte, rechts davon ein paar rote Krieger (Ziel der Bienen) und 4 Mörser als Schützen.
export function benchBlastcrowd(world) {
  world.teamMode = true;
  fillCrowd(world);
  for (let i = 0; i < 4; i++) spawn(world, 'moerser', world.W * .9, world.H * (.3 + i * .13), 'rot');
  for (let i = 0; i < 12; i++) spawn(world, 'krieger', world.W * .5 + 200 + (i % 3) * 22, world.H * .5 - 60 + (i / 3 | 0) * 40, 'rot');
  rebuildHash(world);
}

// Füllt den Bienenschwarm (Team blau) im Kreis CROWD_R um die Mitte wieder auf CROWD_N auf.
export function fillCrowd(world) {
  let alive = 0;
  for (const u of world.units) if (u.alive && u.type === 'biene') alive++;
  const k = CROWD_N - alive;
  if (k > 0) placeCircle(world, 'biene', k, .5, .5, CROWD_R / world.H, 'blau');
}

// VOLLEY_N Mörsergranaten, die im nächsten Schritt gleichzeitig im Kreis CROWD_R um die Schwarmmitte
// (Mittel der lebenden Bienen, sonst Kartenmitte) einschlagen: Bögen wie combat.fire sie anlegt, aber schon
// am Ende ihrer Flugzeit. Schütze: ein lebender roter Mörser.
export function mortarVolley(world) {
  let src = null, cx = 0, cy = 0, nb = 0;
  for (const u of world.units) {
    if (!u.alive) continue;
    if (!src && u.type === 'moerser') src = u;
    if (u.type === 'biene') { cx += u.x; cy += u.y; nb++; }
  }
  if (!src) return 0;
  if (nb) { cx /= nb; cy /= nb; } else { cx = world.W * .5; cy = world.H * .5; }
  const T = UNITS.moerser, f = factionOf(world, src);
  for (let i = 0; i < VOLLEY_N; i++) {
    const a = world.rng() * Math.PI * 2, d = Math.sqrt(world.rng()) * CROWD_R;
    const x1 = cx + Math.cos(a) * d, y1 = cy + Math.sin(a) * d;
    const dist = Math.hypot(x1 - src.x, y1 - src.y), dur = .9 + dist / PROJECTILES.mortar.speed;
    world.proj.push({ kind: 'mortar', arc: true, x0: src.x, y0: src.y, x1, y1, t: dur, dur, h: dist * .55,
      x: x1, y: y1, z: 0, tz: 0, f, src, dmg: T.dmg, R: T.splash });
  }
  return VOLLEY_N;
}

// Szene aufbauen (Welt vorher leer); liefert den Takt je Schritt k (vor dem Schritt aufrufen) oder null.
// blastcrowd: Schritt VOLLEY_AT, VOLLEY_AT + BLAST_EVERY, …: Salve ('volley'); dazwischen (Schritt
// BLAST_EVERY, 2·BLAST_EVERY, …) wird der Schwarm aufgefüllt ('fill'), damit er bis zur nächsten Salve
// wieder steht (die Kosten von 500 frisch gesetzten Bienen zählen so getrennt von den Einschlägen).
export const VOLLEY_AT = BLAST_EVERY / 2;
export function buildBench(world, scenario, n) {
  if (scenario === 'blastcrowd') {
    benchBlastcrowd(world);
    return k => {
      if (k % BLAST_EVERY === VOLLEY_AT) { mortarVolley(world); return 'volley'; }
      if (k > 0 && k % BLAST_EVERY === 0) { fillCrowd(world); rebuildHash(world); return 'fill'; }
      return false;
    };
  }
  benchMixed(world, n);
  return null;
}
