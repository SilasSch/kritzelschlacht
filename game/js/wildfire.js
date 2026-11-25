// Waldbrand (Ideenrunde 18.11.): Feuer springt auf Wald über, breitet sich aus und lässt Asche ohne Deckung zurück.
// Rein, kein DOM, Zufall nur über world.rng().
//
// Zündquellen: Feuer-Explosionen (combat.blast mit gen ≥ 0: Feuerball, Meteor, Drachenatem am Ziel) entzünden Waldzellen
// bis IGNITE_R px um den Einschlag; eine brennende Einheit auf einer Waldzelle (combat.stepBurn) entzündet ihre Zelle.
// Eine brennende Zelle brennt BURN_T s. Alle SPREAD_DT s springt das Feuer mit SPREAD_P je Nachbarzelle (4 Richtungen)
// auf Wald über, und es zündet Bodentruppen auf der Zelle an (Generation UNIT_GEN: deren Feuer springt nicht weiter).
// Danach wird die Zelle Asche (TERRAIN.asche): frei begehbar, keine Deckung mehr.
// Zustand: world.cfire (Restbrennzeit je Zelle, s) und world.blaze (Indizes brennender Zellen). Beides gehört zur Welt,
// wird bei Größenänderung (world.resizeWorld) und in clearBattle neu angelegt.
// Für die Darstellung: Ereignis 'blaze' (je brennender Zelle höchstens FX_HZ mal je s, fxcore: Flammen und Rauch) und
// 'terrain' für die neu verbrannte Zelle.
import { TERRAIN, CELL } from './data.js';
import { query, touchTerrain } from './world.js';
import { ignite } from './combat.js';

export const WILDFIRE = { BURN_T: 5, SPREAD_DT: .5, SPREAD_P: .3, IGNITE_R: 26, UNIT_GEN: 2, FX_HZ: 3 };
const WALD = TERRAIN.wald.id, ASH = TERRAIN.asche.id;

function cells(world) {
  const n = world.GW * world.GH;
  if (!world.cfire || world.cfire.length !== n) { world.cfire = new Float32Array(n); world.blaze = []; }
  return world.cfire;
}

// Zelle i entzünden, wenn sie Wald ist und noch nicht brennt; true bei Erfolg
export function igniteCell(world, i) {
  const cf = cells(world);
  if (world.terr[i] !== WALD || cf[i] > 0 || world.weather === 'regen') return false;   // Regen (25.11.): kein Waldbrand
  cf[i] = WILDFIRE.BURN_T;
  world.blaze.push(i);
  const gx = i % world.GW, gy = i / world.GW | 0;
  world.events.push({ type: 'ignite', x: gx * CELL + 5, y: gy * CELL + 5, z: 0 });
  return true;
}

// Waldzellen bis R px um (x, y) entzünden (Feuer-Explosion)
export function igniteArea(world, x, y, R = WILDFIRE.IGNITE_R) {
  const { GW, GH, terr } = world;
  const gx0 = Math.max(0, (x - R) / CELL | 0), gx1 = Math.min(GW - 1, (x + R) / CELL | 0);
  const gy0 = Math.max(0, (y - R) / CELL | 0), gy1 = Math.min(GH - 1, (y + R) / CELL | 0);
  for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
    const i = gy * GW + gx;
    if (terr[i] !== WALD) continue;
    const dx = gx * CELL + 5 - x, dy = gy * CELL + 5 - y;
    if (dx * dx + dy * dy <= R * R) igniteCell(world, i);
  }
}

// Brennende Einheit am Boden auf (x, y): Waldzelle darunter entzünden
export function igniteUnder(world, x, y) {
  const gx = x / CELL | 0, gy = y / CELL | 0;
  if (gx < 0 || gy < 0 || gx >= world.GW || gy >= world.GH) return;
  const i = gy * world.GW + gx;
  if (world.terr[i] === WALD) igniteCell(world, i);
}

let BZ_W = null;
function burnUnit(v) { if (!v.T.fly && v.alive && v.z < 4) ignite(BZ_W, v, WILDFIRE.UNIT_GEN, null); }

// Ein Schritt (sim.step, nach den Geschossen)
export function stepWildfire(world, dt) {
  const list = world.blaze;
  if (!list || !list.length) return;
  const cf = world.cfire, { GW, GH, terr } = world, W = WILDFIRE;
  const tick = Math.floor(world.time / W.SPREAD_DT) !== Math.floor((world.time - dt) / W.SPREAD_DT);
  const fxTick = Math.floor(world.time * W.FX_HZ) !== Math.floor((world.time - dt) * W.FX_HZ);
  const n = list.length;   // in diesem Schritt neu entzündete Zellen beginnen erst im nächsten
  let keep = 0, turned = false;
  for (let k = 0; k < n; k++) {
    const i = list[k];
    if (terr[i] !== WALD) { cf[i] = 0; continue; }
    cf[i] -= dt;
    const gx = i % GW, gy = i / GW | 0, x = gx * CELL + 5, y = gy * CELL + 5;
    if (cf[i] <= 0) {
      cf[i] = 0; terr[i] = ASH; turned = true;
      world.events.push({ type: 'terrain', gx0: Math.max(0, gx - 1), gy0: Math.max(0, gy - 1), gx1: Math.min(GW - 1, gx + 1), gy1: Math.min(GH - 1, gy + 1) });
      continue;
    }
    list[keep++] = i;
    if (fxTick) world.events.push({ type: 'blaze', x, y, t: cf[i] / W.BURN_T });
    if (!tick) continue;
    if (gx > 0 && terr[i - 1] === WALD && world.rng() < W.SPREAD_P) igniteCell(world, i - 1);
    if (gx < GW - 1 && terr[i + 1] === WALD && world.rng() < W.SPREAD_P) igniteCell(world, i + 1);
    if (gy > 0 && terr[i - GW] === WALD && world.rng() < W.SPREAD_P) igniteCell(world, i - GW);
    if (gy < GH - 1 && terr[i + GW] === WALD && world.rng() < W.SPREAD_P) igniteCell(world, i + GW);
    BZ_W = world; query(world, x, y, 8, burnUnit); BZ_W = null;
  }
  // neu entzündete Zellen (hinter n) nachrücken
  for (let k = n; k < list.length; k++) list[keep++] = list[k];
  list.length = keep;
  if (turned) touchTerrain(world);
}

// Neue Schlacht: kein Brand mehr (Asche bleibt, wie zerbrochene Mauern)
export function clearWildfire(world) {
  if (!world.cfire) return;
  for (const i of world.blaze) world.cfire[i] = 0;
  world.blaze = [];
}
