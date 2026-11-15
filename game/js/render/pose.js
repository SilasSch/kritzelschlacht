// Reine Pose-Berechnung für die Figuren-Rigs. Kein DOM, kein PIXI, kein Math.random.
// poseUnit(u, t[, out]) liest nur die Einheit und die Zeit t (Sekunden, Echtzeit des Renderers)
// und schreibt das Ergebnis in out (wird für 2000 Einheiten pro Bild wiederverwendet).
//
// Bewegung: Laufen und Neigung kommen aus u.mx/u.my (Laufgeschwindigkeit, die think() setzt).
// Rückstoß u.vx/u.vy zählt bewusst nicht: wer weggeschubst wird, läuft nicht.

export const RIG_PARTS = ['shadow', 'body', 'pupilL', 'pupilR', 'lid', 'headgear', 'weapon'];

export const WALK_SQUASH = .08;   // sy pendelt 1 ± 0.08, sx = 1/sy
const RIGID_SQUASH = .03;         // Panzer: Ketten rumpeln statt Federn
export const TILT_MAX = .12;      // rad bei voller Laufgeschwindigkeit
export const HIT_SX = 1.15, HIT_SY = .85;
export const RECOIL = 3, RECOIL_T = .12;
export const BLINK_EVERY = 3.2, BLINK_T = .12;
export const LOOK = .35;          // Pupillenversatz in Augenradien
export const SWING_T = .25, SWING_ROT = -1.1;

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function poseUnit(u, t, out = {}) {
  const T = u.T, fly = !!T.fly;
  const mx = u.mx || 0, my = u.my || 0;
  const walking = !fly && Math.abs(mx) + Math.abs(my) > 1;
  let sx = 1, sy = 1, bob = 0, frame = 0;
  if (fly) {
    // Flieger schweben und flattern (Flügel, Rotor) immer
    bob = Math.sin(TAU * 1.3 * t + u.seed) * 1.5;
    frame = ((t * 10 + u.seed) | 0) % 2;
  } else if (walking) {
    // Schrittfrequenz wächst mit dem Tempo des Typs; ein Federn je Schritt, Füße wechseln je Schritt
    const q = t * (2 + T.speed / 30) + u.seed, s = Math.sin(TAU * q);
    sy = 1 + (u.type === 'panzer' ? RIGID_SQUASH : WALK_SQUASH) * s;
    sx = 1 / sy;
    bob = -1.5 * (s > 0 ? s : 0);
    frame = Math.floor(q * 2) % 2;
  }
  if (u.hitT > 0) { sx = HIT_SX; sy = HIT_SY; }
  out.sx = sx; out.sy = sy;
  out.tilt = clamp(mx / T.speed, -1, 1) * TILT_MAX;
  out.bob = bob;
  out.weaponRot = u.swingT > 0 ? SWING_ROT * Math.min(1, u.swingT / SWING_T) : 0;
  out.recoil = u.fireT < RECOIL_T ? RECOIL * (1 - u.fireT / RECOIL_T) : 0;
  const ph = (t + u.seed) % BLINK_EVERY;
  out.blink = (ph < 0 ? ph + BLINK_EVERY : ph) < BLINK_T;
  const tg = u.tg;
  const dx = tg ? tg.x - u.x : 0, dy = tg ? tg.y - u.y : 0, d = Math.sqrt(dx * dx + dy * dy);
  if (d > 1e-6) { out.lookX = dx / d * LOOK; out.lookY = dy / d * LOOK; }
  else { out.lookX = (u.face < 0 ? -1 : 1) * LOOK; out.lookY = 0; }
  out.frame = frame;
  return out;
}
