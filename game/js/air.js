// Lufteinheiten der Kategorie Modern (18.11.): Kampfjet, Kampfdrohne, Bomber. Eigene Zielwahl und Flugbahn statt combat.think
// (das ruft stepAir und kehrt zurück). Alle drei fliegen hoch (UNITS[t].high): Nahkämpfer am Boden visieren sie nicht an.
//
// Jet und Bomber fliegen nie still: konstante Geschwindigkeit in Blickrichtung (u.hx, u.hy), höchstens TURN rad/s Drehung
// zum Ziel; liegt das Ziel hinter ihnen und nah, fliegen sie PASS s geradeaus weiter (Überflug), dann drehen sie. Am
// Feldrand (EDGE px) drehen sie zur Mitte. Der Jet feuert, solange das Ziel in Reichweite und vor der Nase liegt (Kegel
// AIM, cos), gegen Flieger mit AIR-fachem, gegen Bodentruppen mit GROUND-fachem Schaden; er jagt zuerst Flieger.
// Die Drohne fliegt geradewegs aufs teuerste Ziel im Umkreis SEEK (Gleichstand: das nähere), sinkt im letzten Stück auf
// dessen Höhe und explodiert bei Berührung (Explosion als Rakete, trifft alle im Umkreis T.splash).
// Der Bomber sucht die dichteste Gruppe am Boden (Feinde minus doppelt Eigene im Umkreis GROUP_R) und wirft, wenn der
// Landepunkt seiner Bomben nah am Ziel liegt, N Bomben im Abstand GAP s (Fall aus seiner Höhe, FALL px/s²). Danach
// T.cd s Pause. Flieger trifft er nicht.
import { factionOf, query, unseen } from './world.js';
import { fire, clearShot, blast, hurt } from './combat.js';

export const AIR = new Set(['jet', 'kampfdrohne', 'bomber']);
export const JET = { TURN: 2.4, PASS: .55, PASS_D: 90, AIM: .93, AIR: 3, GROUND: 1, EDGE: 70 };
export const BOMBER = { TURN: 1.2, PASS: 1.6, PASS_D: 70, EDGE: 90, N: 6, GAP: .25, FALL: 320, GROUP_R: 45, HIT_D: 40 };
export const DRONE = { SEEK: 380, DIVE: 40, RETARGET: .6, SHARE: 6 };
const RETARGET = .5;

const enemy = (world, u, v, f) => v.alive && v !== u && factionOf(world, v) !== f && !(v.ashT > 0) && !(v.hidden && unseen(u, v));

// Zielwahl über alle Einheiten (höchstens alle RETARGET s je Flieger): kleinster Wert score(v, d²) gewinnt
function pick(world, u, score) {
  const f = factionOf(world, u);
  let best = null, bs = Infinity;
  for (const v of world.units) {
    if (!enemy(world, u, v, f)) continue;
    const s = score(v, (v.x - u.x) ** 2 + (v.y - u.y) ** 2);
    if (s < bs) { bs = s; best = v; }
  }
  return best;
}
const jetScore = (v, d2) => (v.T.fly ? d2 : d2 * 9 + 4e5);
// Drohne: im Umkreis SEEK das teuerste Ziel, je Drohne, die es schon anfliegt, wie DRONE.SHARE Punkte billiger (verteilt den
// Schwarm); außerhalb das nächste
const droneScore = (v, d2) => (d2 > DRONE.SEEK * DRONE.SEEK ? 1e9 + d2 : -(v.T.cost - DRONE.SHARE * (v.droneN || 0)) * 1e6 + d2);
function countDrones(world, u) {
  for (const v of world.units) v.droneN = 0;
  for (const v of world.units) if (v.alive && v !== u && v.type === 'kampfdrohne' && v.tg && v.team === u.team) v.tg.droneN++;
}
let G_W = null, G_F = null, G_S = 0, G_X = 0, G_Y = 0, G_R2 = 0;
const groupTest = v => { if (v.alive && !v.T.fly && (v.x - G_X) ** 2 + (v.y - G_Y) ** 2 <= G_R2) G_S += factionOf(G_W, v) === G_F ? -2 : 1; };
function groupAt(world, f, x, y, R) { G_W = world; G_F = f; G_X = x; G_Y = y; G_R2 = R * R; G_S = 0; query(world, x, y, R, groupTest); G_W = null; G_F = null; return G_S; }
function bomberTarget(world, u) {
  const f = factionOf(world, u);
  let best = null, bs = -Infinity;
  for (const v of world.units) {
    if (v.T.fly || !enemy(world, u, v, f)) continue;
    // dichte Gruppe zuerst, bei gleicher Dichte die nähere (1 Feind mehr ≈ 300 px Umweg)
    const s = groupAt(world, f, v.x, v.y, BOMBER.GROUP_R) - Math.hypot(v.x - u.x, v.y - u.y) / 300;
    if (s > bs) { bs = s; best = v; }
  }
  return best;
}

// Flugbahn: Blickrichtung höchstens turn·dt zum Punkt (tx, ty) drehen (am Rand zur Mitte), Tempo halten
function steer(world, u, tx, ty, dt, turn, edge, straight) {
  if (u.hx === 0 && u.hy === 0) { u.hx = u.face < 0 ? -1 : 1; u.hy = 0; }
  const { W, H } = world;
  let dx = tx - u.x, dy = ty - u.y;
  const out = u.x < edge || u.x > W - edge || u.y < edge || u.y > H - edge;
  if (out) { dx = W / 2 - u.x; dy = H / 2 - u.y; }
  if (!straight || out) {
    const cur = Math.atan2(u.hy, u.hx);
    let da = Math.atan2(dy, dx) - cur;
    if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
    const a = cur + Math.max(-turn * dt, Math.min(turn * dt, da));
    u.hx = Math.cos(a); u.hy = Math.sin(a);
  }
  const sp = u.T.speed;
  u.mx = u.hx * sp; u.my = u.hy * sp;
  u.face = u.hx < 0 ? -1 : 1; u.fx = u.hx; u.fy = u.hy;
}
// Überflug: liegt das Ziel hinter der Nase und näher als passD, PASS s geradeaus
function passing(world, u, t, dt, P) {
  if (u.passT > 0) { u.passT -= dt; return true; }
  const dx = t.x - u.x, dy = t.y - u.y;
  if (dx * u.hx + dy * u.hy < 0 && dx * dx + dy * dy < P.PASS_D * P.PASS_D) {
    u.passT = P.PASS;
    if (u.type === 'jet') world.events.push({ type: 'sound', k: 'jet', x: u.x, y: u.y });   // Donner im Überflug
    return true;
  }
  return false;
}
const valid = (world, u, t) => t && t.alive && factionOf(world, t) !== factionOf(world, u) && !(t.ashT > 0);

export function stepAir(world, u, dt) {
  if (u.type === 'jet') stepJet(world, u, dt);
  else if (u.type === 'kampfdrohne') stepDrone(world, u, dt);
  else stepBomber(world, u, dt);
}

function stepJet(world, u, dt) {
  const T = u.T;
  if (u.rt <= 0 || !valid(world, u, u.tg)) { u.tg = pick(world, u, jetScore); u.rt = RETARGET; }
  const t = u.tg;
  if (!t) { steer(world, u, world.W / 2, world.H / 2, dt, JET.TURN, JET.EDGE, false); return; }
  steer(world, u, t.x, t.y, dt, JET.TURN, JET.EDGE, passing(world, u, t, dt, JET));
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1;
  if (u.cd > 0 || d > T.range + T.r + t.T.r || (dx * u.hx + dy * u.hy) / d < JET.AIM) return;
  const a = clearShot(world, u, t, 'bullet');
  if (!a) return;
  u.cd = T.cd * (.85 + world.rng() * .3);
  fire(world, u, t, 'bullet', a.x, a.y, T.dmg * (t.T.fly ? JET.AIR : JET.GROUND));
  world.events.push({ type: 'sound', k: 'shot' });
}

function stepDrone(world, u, dt) {
  const T = u.T;
  if (u.rt <= 0 || !valid(world, u, u.tg)) { countDrones(world, u); u.tg = pick(world, u, droneScore); u.rt = DRONE.RETARGET; }
  const t = u.tg;
  if (!t) { u.fz = T.flyZ; return; }
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1, gap = d - T.r - t.T.r;
  u.face = dx < 0 ? -1 : 1; u.fx = dx / d; u.fy = dy / d;
  // Sturz: im letzten Stück auf die Höhe des Ziels
  u.fz = gap < DRONE.DIVE ? Math.max(2, t.z) : T.flyZ;
  if (gap <= T.range) { detonate(world, u, t); return; }
  u.mx = dx / d * T.speed; u.my = dy / d * T.speed;
}
function detonate(world, u, t) {
  const x = t.x, y = t.y;
  // gezielte Ladung: trifft nur Feinde (keine Kettenreaktion im eigenen Schwarm), dazu der übliche Knall
  const f = factionOf(world, u), R = u.T.splash, dmg = u.T.dmg;
  query(world, x, y, R + 30, v => {
    if (!v.alive || factionOf(world, v) === f) return;
    const d = Math.hypot(v.x - x, v.y - y);
    if (d <= R + v.T.r) hurt(world, v, dmg * (1 - .5 * Math.min(1, d / R)), 'rocket', u);
  });
  world.events.push({ type: 'blast', x, y, R, kind: 'rocket', shake: 4, water: false });
  world.events.push({ type: 'sound', k: 'boom' });
  hurt(world, u, 1e9, 'blast', null);
}

function stepBomber(world, u, dt) {
  const T = u.T, B = BOMBER;
  // neues Ziel nur beim Nachladen (sonst kreist er zwischen zwei Gruppen) oder wenn das alte fällt
  if ((u.rt <= 0 && u.cd > 0) || !valid(world, u, u.tg) || u.tg.T.fly) { u.tg = bomberTarget(world, u); u.rt = RETARGET * 2; }
  const t = u.tg;
  // Bombenteppich: läuft weiter, auch ohne Ziel
  if (u.bombK > 0) { u.bombT -= dt; if (u.bombT <= 0) { dropBomb(world, u); u.bombK--; u.bombT = B.GAP; if (u.bombK === 0) u.cd = T.cd; } }
  if (!t) { steer(world, u, world.W / 2, world.H / 2, dt, B.TURN, B.EDGE, false); return; }
  // Anflug auf den Abwurfpunkt: so weit vor dem Ziel, wie die Bombe im Fall noch vorwärts fliegt (plus halber Teppich)
  const fall = Math.sqrt(2 * Math.max(1, u.z) / B.FALL), lead = T.speed * (fall + B.N * B.GAP * .5);
  steer(world, u, t.x - u.hx * lead, t.y - u.hy * lead, dt, B.TURN, B.EDGE, passing(world, u, t, dt, B));
  if (u.cd > 0 || u.bombK > 0) return;
  // Landepunkt einer jetzt geworfenen Bombe (Fallzeit aus der Höhe) nah am Ziel: Teppich beginnen
  // (Mitte des Teppichs), oder als Gelegenheit: dort mehr Feinde als Eigene am Boden
  const lx = u.x + u.mx * (fall + B.N * B.GAP * .5), ly = u.y + u.my * (fall + B.N * B.GAP * .5);
  if ((lx - t.x) ** 2 + (ly - t.y) ** 2 > B.HIT_D * B.HIT_D && groupAt(world, factionOf(world, u), lx, ly, B.GROUP_R) < 1) return;
  u.bombK = B.N; u.bombT = 0;
  world.events.push({ type: 'sound', k: 'whistle', x: u.x, y: u.y });
}
function dropBomb(world, u) {
  const dur = Math.sqrt(2 * Math.max(1, u.z) / BOMBER.FALL), T = u.T;
  const v = T.speed, x1 = u.x + u.hx * v * dur + (world.rng() - .5) * 8, y1 = u.y + u.hy * v * dur + (world.rng() - .5) * 8;
  world.proj.push({ kind: 'airbomb', arc: true, x0: u.x, y0: u.y, x1, y1, t: 0, dur, h: 0, drop: u.z,
    x: u.x, y: u.y, z: u.z, tz: 0, f: factionOf(world, u), src: u, dmg: T.dmg, R: T.splash, dg: true });
}
