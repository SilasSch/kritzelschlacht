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
// Luft-Luft-Raketen des Jets (18.11.): gegen Flieger in Reichweite RANGE vor der Nase (cos ≥ AIM) N Raketen im Abstand GAP s,
// dann CD s Pause. Die Rakete lenkt mit höchstens TURN rad/s ihrem Ziel nach (SPEED px/s, Höhe folgt dem Ziel), trifft bei
// Berührung (Abstand ≤ Radius + HIT px) mit DMG Schaden als Rakete und verpufft nach LIFE s, wenn das Ziel ausweicht oder fällt.
export const MISSILE = { RANGE: 340, AIM: .6, N: 2, GAP: .3, CD: 6, SPEED: 430, TURN: 4.5, DMG: 40, HIT: 6, LIFE: 2.4 };
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
// Schwarm); außerhalb das nächste. Ein Ziel, das schon genug Drohnen hat (Wert ≤ 0), zählt nur noch nach Entfernung
// (25.11.): sonst teilte ein großer Schwarm zwei gleiche Ziele nach Reihenfolge statt nach Lage auf, die Hälften flogen
// über Kreuz durcheinander und blieben als Klumpen in der Mitte hängen.
let DRONE_CUR = null, DC_W = null, DC_T = -1, DC_TEAM = null;
const droneScore = (v, d2) => {
  const n = (v.droneN || 0) - (DRONE_CUR && DRONE_CUR.tg === v ? 1 : 0);
  return d2 > DRONE.SEEK * DRONE.SEEK ? 1e9 + d2 : -Math.max(0, v.T.cost - DRONE.SHARE * n) * 1e6 + d2;
};
function countDrones(world, u) {
  const f = factionOf(world, u);
  if (DC_W === world && DC_T === world.time && DC_TEAM === f) return;
  for (const v of world.units) v.droneN = 0;
  for (const v of world.units) if (v.alive && v.type === 'kampfdrohne' && v.tg && factionOf(world, v) === f) v.tg.droneN++;
  DC_W = world; DC_T = world.time; DC_TEAM = f;
}
let G_W = null, G_F = null, G_S = 0, G_X = 0, G_Y = 0, G_R2 = 0;
const groupTest = v => { if (v.alive && !v.T.fly && (v.x - G_X) ** 2 + (v.y - G_Y) ** 2 <= G_R2) G_S += factionOf(G_W, v) === G_F ? -2 : 1; };
function groupAt(world, f, x, y, R) { G_W = world; G_F = f; G_X = x; G_Y = y; G_R2 = R * R; G_S = 0; query(world, x, y, R, groupTest); G_W = null; G_F = null; return G_S; }
function bomberTarget(world, u) {
  const f = factionOf(world, u), hash = world.hash;
  let best = null, bs = -Infinity;
  for (let i = 0; i < hash.length; i++) {
    const cell = hash[i];
    if (!cell.length) continue;
    let rep = null;
    for (let k = 0; k < cell.length; k++) {
      const v = cell[k];
      if (!v.T.fly && enemy(world, u, v, f)) { rep = v; break; }
    }
    if (!rep) continue;
    // dichte Gruppe zuerst, bei gleicher Dichte die nähere (1 Feind mehr ≈ 300 px Umweg)
    const s = groupAt(world, f, rep.x, rep.y, BOMBER.GROUP_R) - Math.hypot(rep.x - u.x, rep.y - u.y) / 300;
    if (s > bs) { bs = s; best = rep; }
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

// Jet-Rework (25.11., Silas: „useless und uncool“): drei Teile, alle hier und in combat (Ausweichen, Tiefflug-Treffer).
// A Tiefflug-Angriff: ohne Flieger als Ziel wählt er die dichteste Feindgruppe am Boden (wie der Bomber). Im Anflug
//   (Ziel näher als STRAFE.DIVE und vor der Nase, cos ≥ STRAFE.AIM_DIVE) sinkt er auf STRAFE.LOW px; ab STRAFE.START px
//   zieht er STRAFE.DUR s lang eine Garbe: alle STRAFE.GAP s eine Kugel auf einen Bodenpunkt vor der Nase, der mit dem
//   Anflug über das Ziel läuft (strafeFire), die Einschläge laufen also als Streifen durch die Gruppe. Danach zieht er hoch
//   (Flughöhe zurück, STRAFE.CLIMB s geradeaus) und hat STRAFE.CD s Pause bis zum nächsten Anflug. Unter
//   STRAFE.EXPOSED_Z px Höhe trifft ihn alles STRAFE.EXPOSED-fach (combat.hurt) und er weicht nicht aus.
// B Überschallknall: zu Beginn jeder Garbe (höchstens alle BOOM.CD s) durchbricht er die Schallmauer: Bodentruppen
//   (ohne Schwergewichte, Masse ≥ BOOM.MASS) in einem Streifen BOOM.LEN px vor ihm, BOOM.W px breit, fallen BOOM.STUN s
//   um; dazu Nachbrenner (Tempo ×BOOM.BURN für BOOM.BURN_T s).
// C Ausweichen: Kugeln und Pfeile verfehlen ihn mit EVADE.BULLET (Fassrolle, u.rollT für die Optik); kommt eine
//   Rakete oder Luft-Luft-Rakete auf ihn zu (näher als EVADE.FLARE_D), wirft er Täuschkörper (höchstens alle EVADE.FLARE_CD
//   s): Luft-Luft-Raketen verlieren das Ziel, gerade Raketen gehen EVADE.FLARE_T s lang an ihm vorbei.
export const STRAFE = { DIVE: 420, AIM_DIVE: .5, START: 230, AIM: .8, LOW: 24, DUR: .8, GAP: .05, NEAR: 40, REACH: 200, SPREAD: 10, DMG: 8,
  CLIMB: .7, CD: 2.2, EXPOSED_Z: 40, EXPOSED: 1.15, HIT_R: 40 };
export const BOOM = { CD: 7, LEN: 220, W: 45, STUN: 1.2, MASS: 20, BURN: 1.4, BURN_T: 1.2 };
export const EVADE = { BULLET: .45, FLARE_D: 170, FLARE_CD: 7, FLARE_T: 1.2, ROLL_T: .5 };

function stepJet(world, u, dt) {
  const T = u.T;
  if (u.strCd > 0) u.strCd -= dt;
  if (u.boomCd > 0) u.boomCd -= dt;
  if (u.ngT > 0) u.ngT -= dt;
  if (u.rollT > 0) u.rollT -= dt;
  if (u.flareT > 0) u.flareT -= dt;
  if (u.flareCd > 0) u.flareCd -= dt;
  jetFlares(world, u);
  // Garbe läuft: geradeaus tief über den Boden, feuern
  if (u.strT > 0) {
    u.strT -= dt; u.fz = STRAFE.LOW;
    steer(world, u, u.x + u.hx, u.y + u.hy, dt, JET.TURN, JET.EDGE, true);
    strafeFire(world, u, dt);
    if (u.strT <= 0) { u.strT = 0; u.fz = T.flyZ; u.passT = STRAFE.CLIMB; u.strCd = STRAFE.CD; }
    speedUp(u);
    return;
  }
  if (u.rt <= 0 || !valid(world, u, u.tg)) {
    let t = pick(world, u, jetScore);
    if (t && !t.T.fly) t = bomberTarget(world, u) || t;   // Bodenziel: die dichteste Gruppe
    u.tg = t; u.rt = RETARGET;
  }
  const t = u.tg;
  if (!t) { u.fz = T.flyZ; steer(world, u, world.W / 2, world.H / 2, dt, JET.TURN, JET.EDGE, false); speedUp(u); return; }
  const pass = passing(world, u, t, dt, JET);
  steer(world, u, t.x, t.y, dt, JET.TURN, JET.EDGE, pass);
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1, cos = (dx * u.hx + dy * u.hy) / d;
  speedUp(u);
  if (!t.T.fly) {
    // Anflug: sinken, wenn das Ziel vorn liegt; Garbe ab START px
    const diving = !pass && u.strCd <= 0 && d < STRAFE.DIVE && cos >= STRAFE.AIM_DIVE;
    u.fz = diving ? STRAFE.LOW : T.flyZ;
    if (diving && d < STRAFE.START && cos >= STRAFE.AIM) startStrafe(world, u);
    return;
  }
  u.fz = T.flyZ;
  jetMissiles(world, u, t, dx, dy, d, dt);
  if (u.cd > 0 || d > T.range + T.r + t.T.r || cos < JET.AIM) return;
  const a = clearShot(world, u, t, 'bullet');
  if (!a) return;
  u.cd = T.cd * (.85 + world.rng() * .3);
  fire(world, u, t, 'bullet', a.x, a.y, T.dmg * JET.AIR);
  world.events.push({ type: 'sound', k: 'shot' });
}
// Nachbrenner: Tempo ×BOOM.BURN, solange u.ngT läuft
function speedUp(u) { if (u.ngT > 0) { u.mx *= BOOM.BURN; u.my *= BOOM.BURN; } }

function startStrafe(world, u) {
  u.strT = STRAFE.DUR; u.strK = 0;
  if (u.boomCd > 0) return;
  // Überschallknall: Streifen vor der Nase
  u.boomCd = BOOM.CD; u.ngT = BOOM.BURN_T;
  const f = factionOf(world, u), L = BOOM.LEN, W = BOOM.W, cx = u.x + u.hx * L * .5, cy = u.y + u.hy * L * .5;
  query(world, cx, cy, L * .5 + W, v => {
    if (!v.alive || v.T.fly || factionOf(world, v) === f || (v.T.mass || 1) >= BOOM.MASS || v.state !== 'ok') return;
    const rx = v.x - u.x, ry = v.y - u.y, along = rx * u.hx + ry * u.hy, side = Math.abs(rx * u.hy - ry * u.hx);
    if (along < 0 || along > L || side > W + v.T.r) return;
    v.state = 'stun'; v.stunT = Math.max(v.stunT || 0, BOOM.STUN); v.vx = 0; v.vy = 0;
  });
  world.events.push({ type: 'jetfx', k: 'boom', x: u.x, y: u.y, z: u.z, hx: u.hx, hy: u.hy, L, W, shake: 3 });
  world.events.push({ type: 'sound', k: 'sonic', x: u.x, y: u.y });
}

// Garbe: Kugel auf einen Bodenpunkt vor der Nase. Der Punkt liegt so weit vorn, wie das Ziel (u.tg) entlang der
// Flugrichtung entfernt ist (zwischen STRAFE.NEAR und STRAFE.REACH px), läuft also mit dem Anflug über das Ziel.
// Getroffen wird der nächste Feind am Punkt, mit Vorhalt auf seine Bewegung (combat.fire ohne Zielpunkt); nur ohne
// Feind dort schlägt die Kugel in den Boden. Fix 25.11. (Silas: „trifft einzelne Units einfach nie“): vorher lag der Punkt
// fest 60 px vor der Nase, mit ±14 px Streuung und ohne Vorhalt; einzelne laufende Ziele lagen fast nie auf der Linie.
let SF_BEST = null, SF_BD = 0, SF_X = 0, SF_Y = 0, SF_F = null, SF_W = null;
const sfTest = v => {
  if (!v.alive || v.T.fly || factionOf(SF_W, v) === SF_F || (v.hidden && !(v.seenT > 0))) return;
  const d = (v.x - SF_X) ** 2 + (v.y - SF_Y) ** 2; if (d < SF_BD) { SF_BD = d; SF_BEST = v; }
};
function strafeFire(world, u, dt) {
  u.strG = (u.strG || 0) - dt;
  if (u.strG > 0) return;
  u.strG += STRAFE.GAP;
  const t = u.tg && u.tg.alive && !u.tg.T.fly ? u.tg : null;
  const ahead = t ? (t.x - u.x) * u.hx + (t.y - u.y) * u.hy : STRAFE.NEAR;
  const L = Math.max(STRAFE.NEAR, Math.min(STRAFE.REACH, ahead)), sp = STRAFE.SPREAD;
  const px = u.x + u.hx * L + (world.rng() - .5) * 2 * sp, py = u.y + u.hy * L + (world.rng() - .5) * 2 * sp;
  SF_W = world; SF_F = factionOf(world, u); SF_X = px; SF_Y = py; SF_BEST = null; SF_BD = STRAFE.HIT_R * STRAFE.HIT_R;
  query(world, px, py, STRAFE.HIT_R, sfTest); SF_W = null; SF_F = null;
  const v = SF_BEST; SF_BEST = null;
  if (v) {
    fire(world, u, v, 'bullet', undefined, undefined, STRAFE.DMG);
  } else {
    world.events.push({ type: 'shot', kind: 'bullet', x: u.x + u.hx * u.T.r, y: u.y, z: u.z, face: u.face, tx: px, ty: py, shake: 0, mg: false, ut: 'jet' });
    world.events.push({ type: 'miss', kind: 'bullet', x: px, y: py, a: Math.atan2(u.hy, u.hx), ut: 'jet', wall: false });
  }
  if ((u.strK = (u.strK || 0) + 1) % 3 === 1) world.events.push({ type: 'sound', k: 'shot' });
}

// Täuschkörper gegen anfliegende Raketen
function jetFlares(world, u) {
  if (u.flareCd > 0 || u.z < STRAFE.EXPOSED_Z) return;
  const D2 = EVADE.FLARE_D * EVADE.FLARE_D, proj = world.proj;
  let hit = false;
  for (let i = 0; i < proj.length; i++) {
    const p = proj[i];
    if (p.tg !== u || (p.kind !== 'rocket' && p.kind !== 'aam')) continue;
    if ((p.x - u.x) ** 2 + (p.y - u.y) ** 2 < D2) { hit = true; break; }
  }
  if (!hit) return;
  u.flareCd = EVADE.FLARE_CD; u.flareT = EVADE.FLARE_T; u.rollT = EVADE.ROLL_T;
  for (let i = 0; i < proj.length; i++) if (proj[i].tg === u && proj[i].kind === 'aam') proj[i].tg = null;
  world.events.push({ type: 'jetfx', k: 'flare', x: u.x, y: u.y, z: u.z, hx: u.hx, hy: u.hy });
  world.events.push({ type: 'sound', k: 'flare', x: u.x, y: u.y });
}
// Weicht der Jet diesem geraden Geschoss aus? (combat.stepProjectiles, ein Wurf je Geschoss und Körper)
export function jetEvades(world, v, p) {
  if (v.type !== 'jet' || v.z < STRAFE.EXPOSED_Z || v.state !== 'ok') return false;
  if (p.kind === 'rocket') return v.flareT > 0;
  if (p.kind !== 'bullet') return false;
  if (world.rng() >= EVADE.BULLET) return false;
  if (!(v.rollT > 0)) v.rollT = EVADE.ROLL_T;
  return true;
}

// Raketensalve gegen Flieger: läuft angefangen zu Ende (auf das aktuelle Ziel, wenn es noch fliegt)
function jetMissiles(world, u, t, dx, dy, d, dt) {
  const M = MISSILE;
  if (u.mslCd > 0) u.mslCd -= dt;
  if (u.mslK > 0) {
    u.mslT -= dt;
    if (u.mslT <= 0) { if (t.T.fly) launch(world, u, t); u.mslK--; u.mslT = M.GAP; if (u.mslK === 0) u.mslCd = M.CD; }
    return;
  }
  if (u.mslCd > 0 || !t.T.fly || d > M.RANGE || (dx * u.hx + dy * u.hy) / d < M.AIM) return;
  u.mslK = M.N; u.mslT = 0;
}
function launch(world, u, t) {
  const M = MISSILE, s = world.rng() < .5 ? -1 : 1;
  // startet unter dem Flügel, leicht zur Seite, in Flugrichtung
  world.proj.push({ kind: 'aam', arc: false, homing: true, x: u.x - u.hy * s * 6, y: u.y + u.hx * s * 6, z: u.z - 4,
    vx: u.hx * M.SPEED, vy: u.hy * M.SPEED, t: 0, life: M.LIFE, tg: t, src: u, f: null, dmg: M.DMG, R: 0 });
  world.events.push({ type: 'sound', k: 'rocket', x: u.x, y: u.y });
}
// Schritt einer Luft-Luft-Rakete (combat.stepProjectiles); true = fertig (Treffer oder verpufft)
export function stepMissile(world, p, dt) {
  const M = MISSILE, t = p.tg;
  if (t && t.alive && !(t.ashT > 0)) {
    const cur = Math.atan2(p.vy, p.vx);
    let da = Math.atan2(t.y - p.y, t.x - p.x) - cur;
    if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
    const a = cur + Math.max(-M.TURN * dt, Math.min(M.TURN * dt, da));
    p.vx = Math.cos(a) * M.SPEED; p.vy = Math.sin(a) * M.SPEED;
    p.z += Math.max(-80 * dt, Math.min(80 * dt, t.z - p.z));
  }
  p.x += p.vx * dt; p.y += p.vy * dt;
  if (t && t.alive && Math.hypot(t.x - p.x, t.y - p.y) <= t.T.r + M.HIT && Math.abs(t.z - p.z) < t.T.r + 16) {
    hurt(world, t, p.dmg, 'rocket', p.src && p.src.alive ? p.src : null);
    world.events.push({ type: 'blast', x: t.x, y: t.y - t.z, R: 16, kind: 'rocket', shake: 2, water: false, air: true });
    world.events.push({ type: 'sound', k: 'boom' });
    return true;
  }
  if (p.t >= p.life || p.x < -40 || p.y < -40 || p.x > world.W + 40 || p.y > world.H + 40) {
    world.events.push({ type: 'blast', x: p.x, y: p.y - p.z, R: 8, kind: 'rocket', shake: 0, water: false, air: true });
    return true;
  }
  return false;
}

function stepDrone(world, u, dt) {
  const T = u.T;
  if (u.rt <= 0 || !valid(world, u, u.tg)) {
    countDrones(world, u);
    const prev = u.tg;
    DRONE_CUR = u; u.tg = pick(world, u, droneScore); DRONE_CUR = null;
    if (prev !== u.tg) {
      if (prev && prev.droneN > 0) prev.droneN--;
      if (u.tg) u.tg.droneN = (u.tg.droneN || 0) + 1;
    }
    u.rt = DRONE.RETARGET;
  }
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
