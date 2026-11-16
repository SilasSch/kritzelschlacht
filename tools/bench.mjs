// Headless-Leistungsmessung: node tools/bench.mjs [units=2000] [scenario=mixed|blastcrowd] [seed=1] [--profile] [--lod=1]
// Misst BENCH_STEPS Simulationsschritte (1/60 s) und gibt avg/p95/max step ms aus, dazu getrennt die reine
// Effekt-Logik (fxcore: consume + update je Schritt, wie der Browser je Bild). Vorher läuft eine kurze
// Aufwärmrunde mit anderer Saat (JIT), die nicht zählt. --profile: Zeit je Teil von sim.step (nachgebaute
// Reihenfolge, nur zur Analyse) und Zähler (Ereignisse, Partikel).
import { createWorld, rebuildHash } from '../game/js/world.js';
import { step } from '../game/js/sim.js';
import { think, stepProjectiles } from '../game/js/combat.js';
import { integrate, collide, collideWalls, stepCorpses, stepDebris } from '../game/js/physics.js';
import { createFlow, updateFlow } from '../game/js/pathing.js';
import { createFxCore } from '../game/js/render/fxcore.js';
import { buildBench, BENCH_STEPS, BENCH_W, BENCH_H, SCENARIOS } from '../game/js/bench.js';

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const PROFILE = process.argv.includes('--profile');
const LOD = process.argv.includes('--lod=1') ? 1 : 0;   // Fx-Detailstufe der Effekt-Logik (nur fx core ms, Partikel)
const N = Math.max(4, parseInt(args[0] ?? '2000', 10) || 2000);
const SCEN = args[1] ?? 'mixed';
const SEED = parseInt(args[2] ?? '1', 10) || 1;
if (!SCENARIOS.includes(SCEN)) { console.error(`usage: node tools/bench.mjs [units=2000] [${SCENARIOS.join('|')}] [seed=1] [--profile]`); process.exit(2); }
const DT = 1 / 60;
const now = () => performance.now();

// Nachbau von sim.step mit Zeitnahme je Teil (gleiche Reihenfolge; nur für --profile)
const PH = ['hash', 'flow', 'think', 'integrate', 'collide', 'walls', 'proj', 'corpses'];
function profiledStep(world, dt, acc) {
  let t = now(), t1;
  const lap = k => { t1 = now(); acc[k] += t1 - t; t = t1; };
  world.time += dt;
  rebuildHash(world); lap('hash');
  if (!world.flow) world.flow = createFlow(world);
  updateFlow(world, world.flow, dt); lap('flow');
  const units = world.units;
  for (const u of units) u.att = 0;
  for (const u of units) if (u.alive && u.tg && u.tg.alive) u.tg.att++;
  for (const u of units) if (u.alive) think(world, u, dt);
  lap('think');
  integrate(world, dt); lap('integrate');
  collide(world); lap('collide');
  for (const u of units) if (u.alive) collideWalls(world, u, dt);
  lap('walls');
  stepProjectiles(world, dt); lap('proj');
  stepCorpses(world, dt); stepDebris(world, dt);
  if ((world.dead || 0) > 300) { world.units = world.units.filter(u => u.alive); world.dead = 0; }
  lap('corpses');
}

function run(seed, steps, measure) {
  const world = createWorld(BENCH_W, BENCH_H, seed);
  const tick = buildBench(world, SCEN, N);
  const fx = createFxCore({});
  const times = new Float64Array(steps), fxTimes = new Float64Array(steps);
  const acc = Object.fromEntries(PH.map(k => [k, 0]));
  if (LOD) fx.lod = LOD;
  const hot = [], fill = [];   // Schritte mit Salve bzw. mit aufgefülltem Schwarm (blastcrowd)
  let maxEv = 0, evSum = 0;
  for (let k = 0; k < steps; k++) {
    const what = tick ? tick(k) : false;
    const t0 = now();
    if (measure && PROFILE) profiledStep(world, DT, acc); else step(world, DT);
    const t1 = now();
    const ne = world.events.length; evSum += ne; if (ne > maxEv) maxEv = ne;
    fx.consume(world.events); fx.update(DT, world);
    world.events.length = 0;
    times[k] = t1 - t0; fxTimes[k] = now() - t1;
    if (what === 'volley') hot.push(t1 - t0); else if (what === 'fill') fill.push(t1 - t0);
  }
  let alive = 0; for (const u of world.units) if (u.alive) alive++;
  return { times, fxTimes, acc, hot, fill, alive, maxEv, evAvg: evSum / steps, particles: fx.store.count, dropped: fx.store.dropped, corpses: world.corpses.length };
}

const stats = a => {
  const s = Array.from(a).sort((x, y) => x - y), sum = s.reduce((p, v) => p + v, 0);
  return { avg: sum / s.length, p95: s[Math.min(s.length - 1, Math.floor(s.length * .95))], max: s[s.length - 1] };
};
const f2 = v => v.toFixed(2);

run(SEED + 7919, 120, false);   // Aufwärmen (JIT), zählt nicht
const r = run(SEED, BENCH_STEPS, true);
const s = stats(r.times), fs = stats(r.fxTimes);
console.log(`scenario ${SCEN}  units ${SCEN === 'blastcrowd' ? 500 : N}  world ${BENCH_W}x${BENCH_H}  steps ${BENCH_STEPS}  seed ${SEED}`);
console.log(`avg step ms  ${f2(s.avg)}`);
console.log(`p95 step ms  ${f2(s.p95)}`);
console.log(`max step ms  ${f2(s.max)}`);
if (r.hot.length) { const h = stats(r.hot); console.log(`volley steps ${r.hot.length}  avg ${f2(h.avg)}  max ${f2(h.max)} ms  (20 mortar hits in one step)`); }
if (r.fill.length) { const h = stats(r.fill); console.log(`refill steps ${r.fill.length}  avg ${f2(h.avg)}  max ${f2(h.max)} ms  (swarm topped up to 500)`); }
console.log(`fx core ms   avg ${f2(fs.avg)}  p95 ${f2(fs.p95)}  max ${f2(fs.max)}  (consume + update, not in step; lod ${LOD})`);
console.log(`alive at end ${r.alive}  events/step avg ${r.evAvg.toFixed(1)} max ${r.maxEv}  particles ${r.particles} (dropped ${r.dropped})  corpses ${r.corpses}`);
if (PROFILE) {
  const tot = PH.reduce((p, k) => p + r.acc[k], 0);
  console.log('profile ms/step  ' + PH.map(k => `${k} ${(r.acc[k] / BENCH_STEPS).toFixed(2)} (${Math.round(100 * r.acc[k] / tot)}%)`).join('  '));
}
