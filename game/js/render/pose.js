// Reine Darstellungs-Mathematik: Pose der Figuren-Rigs, Schatten nach Höhe, Aussehen der Leichen,
// Bildschirmlage der Geschosse. Kein DOM, kein PIXI, kein Math.random.
// poseUnit(u, t[, out]) liest nur die Einheit und die Zeit t (Sekunden, Echtzeit des Renderers)
// und schreibt das Ergebnis in out (wird für 2000 Einheiten pro Bild wiederverwendet).
//
// Bewegung: Laufen und Neigung kommen aus u.mx/u.my (Laufgeschwindigkeit, die think() setzt).
// Rückstoß u.vx/u.vy zählt bewusst nicht: wer weggeschubst wird, läuft nicht.
// In der Luft (state 'air') dreht sich der Körper (spin), betäubt ('stun') wackelt er und schaut im Kreis.
// Liegen (MG, Scharfschütze, combat.PRONE): prone 0..1 (Hinlegen/Aufstehen weich überblendet), der Körper
// wird platt (sx, sy), lie (kleine Neigung in Blickrichtung, Gesicht bleibt oben), weaponLie (Waffe dreht
// die Neigung zurück und liegt flach nach vorn am Boden).
import { GRAVITY, CORPSE_FADE, SINK_T, ASH_T } from '../physics.js';
import { MUZZLE_Z, PRONE_DOWN_T, PRONE_UP_T } from '../combat.js';

export const RIG_PARTS = ['shadow', 'body', 'pupilL', 'pupilR', 'lid', 'headgear', 'weapon'];

export const WALK_SQUASH = .08;   // sy pendelt 1 ± 0.08, sx = 1/sy
const RIGID_SQUASH = .03;         // Panzer: Ketten rumpeln statt Federn
export const TILT_MAX = .12;      // rad bei voller Laufgeschwindigkeit
export const HIT_SX = 1.15, HIT_SY = .85;
export const RECOIL = 3, RECOIL_T = .12;
export const BLINK_EVERY = 3.2, BLINK_T = .12;
export const LOOK = .35;          // Pupillenversatz in Augenradien
export const SWING_T = .25, SWING_ROT = -1.1;
export const FLIP_V = 200;        // ab dieser Fluggeschwindigkeit (px/s) ein ganzer Überschlag je Flug
export const AIR_LEAN = .5;       // darunter nur Kippen bis 0.5 rad und zurück
export const STUN_WOBBLE = .15, STUN_HZ = 2.2;   // Taumeln betäubter Figuren (rad, Hz)
const DIZZY_HZ = 1.6;             // Pupillen kreisen
export const PRONE_SX = 1.25, PRONE_SY = .6;   // liegend: breit und platt (um die Füße gestaucht, bleibt am Boden)
export const PRONE_TILT = .25;    // rad Neigung in Blickrichtung
export const PRONE_DROP = .1;     // liegend zusätzlich r · 0.1 tiefer
export const PRONE_GUN = [.25, .3];    // liegend: Waffe in r-Einheiten (lokal) nach vorn und zum Boden verschoben

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// Anteil des Liegens 0..1 aus Haltung und Restzeit des Übergangs (smoothstep)
export function proneOf(u) {
  const s = u.stance;
  if (s === 'prone') return 1;
  let q;
  if (s === 'down') q = 1 - clamp(u.stanceT / PRONE_DOWN_T, 0, 1);
  else if (s === 'up') q = clamp(u.stanceT / PRONE_UP_T, 0, 1);
  else return 0;
  return q * q * (3 - 2 * q);
}

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
  // Luft: Flugfortschritt aus der Energie (vz²/2 + g·z = vmax²/2), ohne Gedächtnis; 0 beim Abheben, 1 bei
  // der Landung. Schnelle Flüge überschlagen sich einmal ganz (landen also aufrecht), langsame kippen nur.
  const st = u.state;
  out.air = st === 'air'; out.dizzy = st === 'stun'; out.spin = 0;
  if (out.air) {
    const vz = u.vz || 0, z = u.z > 0 ? u.z : 0, vmax = Math.sqrt(vz * vz + 2 * GRAVITY * z);
    const q = vmax > 1e-6 ? clamp((vmax - vz) / (2 * vmax), 0, 1) : 0;
    const s = (u.vx || 0) < 0 ? -1 : 1;
    out.spin = vmax >= FLIP_V ? s * TAU * q : s * AIR_LEAN * Math.sin(Math.PI * q);
  } else if (out.dizzy) {
    out.spin = Math.sin(TAU * STUN_HZ * t + u.seed) * STUN_WOBBLE;
  }
  if (out.air || out.dizzy) {
    const a = TAU * DIZZY_HZ * t + u.seed;
    out.lookX = Math.cos(a) * LOOK; out.lookY = Math.sin(a) * LOOK;
  }
  // Liegen: platt (sx → 1.25, sy → 0.6), um PRONE_TILT in Blickrichtung geneigt, ohne Laufneigung; die
  // Waffe dreht die Neigung zurück (liegt flach nach vorn). Blick in Weltrichtung: um −lie zurückgedreht.
  // (in der Luft oder betäubt nie: think setzt die Haltung erst im nächsten Denkschritt zurück)
  const pr = out.air || out.dizzy ? 0 : proneOf(u);
  out.prone = pr; out.lie = 0; out.weaponLie = 0;
  if (pr > 0) {
    const a = (u.face < 0 ? -1 : 1) * pr * PRONE_TILT, c = Math.cos(a), s = Math.sin(a);
    out.lie = a; out.weaponLie = -pr * PRONE_TILT;
    out.sx *= 1 + (PRONE_SX - 1) * pr; out.sy *= 1 + (PRONE_SY - 1) * pr; out.tilt *= 1 - pr;
    const lx = out.lookX, ly = out.lookY;
    out.lookX = lx * c + ly * s; out.lookY = -lx * s + ly * c;
  }
  return out;
}

/* ---------- Schatten ---------- */
// Spez. #14 (R13): Schatten wachsen mit der Höhe und werden weicher und blasser.
// Größe 1 + min(z/200, 0.6) (bis 1.6×), Deckkraft 0.13 · (1 − 0.5 · min(z/200, 1));
// Stufe 0 scharf (z < 6), 1 weich (< 36), 2 sehr weich.
export const SHADOW_ALPHA = .13;
export const SHADOW_SOFT_Z = 6, SHADOW_VSOFT_Z = 36;
export function shadowParams(z, out = {}) {
  const h = z > 0 ? z / 200 : 0;
  out.scale = 1 + Math.min(h, .6); out.alpha = SHADOW_ALPHA * (1 - .5 * Math.min(h, 1));
  out.level = z < SHADOW_SOFT_Z ? 0 : z < SHADOW_VSOFT_Z ? 1 : 2;
  return out;
}

/* ---------- Leichen ---------- */
// Aussehen einer Leiche bzw. eines Teils (physics.makeCorpse) zur Renderer-Zeit t:
// sy (Stauchung, liegend REST_SY nach kurzem Plattdrücken), tint, alpha (fade, Versinken, Asche),
// dy (Versatz nach unten auf dem Bildschirm: Wippen, Versinken), rot.
export const REST_SY = .55, REST_TINT = 0xbfbfc4, ASH_TINT = 0x4a4a52;
const SQUASH_T = .15;             // s bis ganz plattgedrückt
export function corpseLook(c, t, out = {}) {
  const st = c.state;
  let sy = 1, tint = 0xffffff, alpha = 1, dy = 0, rot = c.rot;
  if (st !== 'fly') {
    sy = st === 'rest' ? 1 - (1 - REST_SY) * Math.min(1, c.t / SQUASH_T) : REST_SY;
    tint = st === 'ash' ? ASH_TINT : REST_TINT;
    if (st === 'float' || st === 'sink') {
      // Wippen mit eigener Phase aus der Lage (ändert sich im Wasser nicht)
      const ph = c.x * .07 + c.y * .05;
      dy = Math.sin(TAU * .6 * t + ph) * 1.2;
      rot += Math.sin(TAU * .4 * t + ph) * .08;
      if (st === 'sink') { const q = clamp(c.t / SINK_T, 0, 1); alpha = 1 - q; dy += q * 4; }
    } else if (st === 'ash') alpha = 1 - clamp(c.t / ASH_T, 0, 1);
  }
  if (c.fade > 0) alpha *= Math.min(1, c.fade / CORPSE_FADE);
  out.sy = sy; out.tint = tint; out.alpha = alpha; out.dy = dy; out.rot = rot;
  return out;
}

/* ---------- Geschosse ---------- */
// Bildschirmlage (x, y − z) und Flugwinkel a eines Geschosses aus combat.js.
// Bögen: Logiklage p.x/p.y/p.z (Mündung → Zielpunkt, Höhe sin(q·π)·h); Pfeile auf Flieger steigen dazu
// linear zur Zielhöhe tz. Gerade Schüsse: Logiklage am Boden plus Mündungsversatz (x0 − sx, y0 − sy),
// Höhe über der Laufhöhe MUZZLE_Z hebt sie an (Flieger schießen aus ihrer Höhe schräg nach unten).
export function projScreen(p, out = {}) {
  if (p.arc) {
    const q = p.t < p.dur ? p.t / p.dur : 1, tz = p.kind === 'arrow' ? p.tz || 0 : 0;
    const x = p.x0 + (p.x1 - p.x0) * q, y = p.y0 + (p.y1 - p.y0) * q;
    out.x = x; out.y = y - Math.sin(q * Math.PI) * p.h - q * tz;
    out.a = Math.atan2(p.y1 - p.y0 - Math.PI * Math.cos(q * Math.PI) * p.h - tz, p.x1 - p.x0);
  } else {
    out.x = p.x + p.x0 - p.sx;
    out.y = p.y + p.y0 - p.sy - (p.z - MUZZLE_Z);
    out.a = Math.atan2(p.ny - (p.zt - p.z0) / (p.el || 1), p.nx);
  }
  return out;
}
