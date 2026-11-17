// Reine Darstellungs-Mathematik: Pose der Figuren-Rigs, Schatten nach Höhe, Aussehen der Leichen,
// Bildschirmlage der Geschosse. Kein DOM, kein PIXI, kein Math.random.
// poseUnit(u, t[, out[, mem]]) liest nur die Einheit und die Zeit t (Sekunden, Echtzeit des Renderers)
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
import { BOSS_VIS, BOSS_SQUASH, HEAD_MAX, TANK_ELEV_MAX, TILT_MAX, DRAGON_GEO, dragonHead, tankAim, headAim, tipOffset } from '../muzzle.js';

export const RIG_PARTS = ['shadow', 'body', 'pupilL', 'pupilR', 'lid', 'headgear', 'weapon'];

export const WALK_SQUASH = .08;   // sy pendelt 1 ± 0.08, sx = 1/sy
export { TILT_MAX };              // rad bei voller Laufgeschwindigkeit (muzzle.js)
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

/* ---------- Römer (Spez. #25, Task 4) ----------
   Im marschierenden Block (formOn, nicht formFree) wippen alle im gleichen Takt: die Schrittphase kommt aus
   der Zeit t und der Block-id (blockPhase), nicht aus u.seed. t ist die eine Uhr, mit der der Renderer alle
   Einheiten eines Bilds stellt; so laufen alle Mitglieder eines Blocks gleich und jeder Block hat seinen Takt.
   Schild (eigenes Rig-Teil, um seine Mitte gezeichnet): Lage shieldX/shieldY (r-Einheiten, lokal in
   Blickrichtung), Drehung shieldRot, Breite shieldSx. shieldFront 1: im Block vor dem Körper (über Körper und
   Waffe, die Augen schauen über den Rand); 0: seitlich am Rücken, hinter dem Körper und etwas schmaler
   (charge, allein, freigegeben), Kurzschwert frei. weaponFrame 1: Speer in der Hand (im Block, solange er
   nicht geworfen ist), sonst 0 (Kurzschwert).
   Wurf (pilum 0, fireT < THROW_T): der Arm (die Waffe) hebt sich um THROW_LIFT · r und dreht um THROW_ROT,
   Verlauf sin(π · fireT / THROW_T). Kein Schusswaffen-Rückstoß. Alle anderen: 0. */
export const SHIELD_FRONT = [.72, .5, 0, 1];   // x, y (r), Drehung, Breite: vor dem Körper
export const SHIELD_SIDE = [-.62, .36, -.18, .78]; // seitlich hinter dem Körper, etwas gedreht
export const THROW_T = .35, THROW_ROT = -1.2, THROW_LIFT = .35;
const blockPhase = id => frac(id * .6180339887);

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function frac(v) { return v - Math.floor(v); }

/* ---------- Boss-Sticker (Task 12c, Spez. #23) ----------
   Panzer, Hubschrauber und Drache: gleicher Sticker-Stil, aber größer gezeichnet (BOSS_VIS × r; Logik-
   Radius und Kollision bleiben) und mit eigenen Bewegungen statt Hüpfen. Geometrie und Mündungen teilen
   Logik und Darstellung in ../muzzle.js. poseUnit liefert für alle Einheiten zusätzlich (sonst 0):
     turretFlip Panzerturm: Breite in Weltrichtung −1..1 (Seite des Ziels; beim Seitenwechsel in TURN_T
                schmal werden und umklappen), die Kuppel bleibt waagrecht
     turretRot  Rohrwinkel im Turm (+ = nach unten), zum Ziel, höchstens ±TANK_ELEV_MAX
     rotorRot / tailRotor  Drehwinkel von Haupt- und Heckrotor (0..2π, gleichmäßig pro Zeit)
     wingPhase  Phase des Flügelschlags 0..1 (WING_HZ, im Flug bis + WING_HZ_MOVE), wing = sin(2π·Phase)
     tailSwing  Schweifausschlag (rad): Schwingen TAIL_AMP mit Verzug TAIL_LAG hinter dem Flügel, dazu
                Nachziehen bis TAIL_TRAIL gegen die Flugrichtung
     headRot    Drachenkopf: lokaler Winkel zum Ziel (±HEAD_MAX)
     track      Kettenphase 0..1 (ein Kettenglied je TRACK_PITCH px Weg); frame = Bild 0..TRACK_FRAMES−1
   Ohne Gedächtnis (mem) ist alles rein aus u und t. Mit mem (bossMemory(), vom Renderer je Einheit
   gehalten; u bleibt unverändert) wird weich nachgeführt: Turm dreht sich in TURN_T um, Rohrwinkel,
   Heli-Neigung, Schweif und Kopf mit Verzug, Kettenweg und Flügelphase aufintegriert.
   Schuss-Moment = Logik (muzzle.bossMuzzle): sobald u.fireT kleiner wird als im letzten Bild (neuer Schuss),
   sind Turm und Rohr sofort am Ziel; das Rohr stößt erst danach zurück (KICK), die Wanne wippt erst danach;
   der Drache hält beim Feuerspeien (fireT < BREATH_HOLD) den Kopf ungeglättet zum Ziel und ohne Auf und Ab;
   der Heli neigt sich um seine Mündung. So startet jeder Schuss an der gezeichneten Mündung. */
export const BOSS = new Set(['panzer', 'heli', 'drache']);
export { BOSS_VIS, BOSS_SQUASH, HEAD_MAX, TANK_ELEV_MAX, DRAGON_GEO, dragonHead };
export const TURN_T = .15, ELEV_RATE = 10;                            // s Umdrehen des Turms, 1/s Rohr
// Totbereich (nur Darstellung, zwischen Schüssen): liegt das Ziel weniger als TURN_DEADBAND px seitlich, bleibt
// der Turm auf seiner Seite (kein Flackern, wenn jemand genau über/unter dem Panzer steht)
export const TURN_DEADBAND = 4;
export const TANK_RECOIL = 7, TANK_RECOIL_T = .35, TANK_ROCK = .05;   // px Rohr-Rückstoß, s, rad Wippen
export const KICK = .12;                // Anteil von RECOIL_T bis zum vollen Rückstoß (Stoß nach dem Schuss)
export const TRACK_PITCH = 5, TRACK_FRAMES = 4;
export const ROTOR_SPEED = 28, TAIL_ROTOR_SPEED = 42;                 // rad/s
export const HELI_LEAN = .25, LEAN_RATE = 4;                          // rad, 1/s
export const WING_HZ = 1.6, WING_HZ_MOVE = 1.1;
export const TAIL_AMP = .16, TAIL_LAG = 1.1, TAIL_TRAIL = .3, TAIL_RATE = 2.5;
export const HEAD_RATE = 8, DRAGON_BOB = 2, BREATH_HOLD = .3;

export const bossMemory = () => ({ t: -1, track: 0, wing: 0, tail: 0, lean: 0, head: 0, side: 1, from: 1, turnT: 1, elev: 0, fireT: 1 });
// Rückstoß-Verlauf 0..1 über q = fireT / Dauer: 0 im Schuss-Moment, voll bei KICK, dann zurück
export const kick = q => (q >= 1 || q < 0 ? 0 : q < KICK ? q / KICK : ((1 - q) / (1 - KICK)) ** 2);

// Gezeichnete Mündung (Bildschirm) aus einer Pose p von poseUnit: muzzle.tipOffset mit denselben Werten,
// mit denen der Renderer die Teile setzt
const TQ = { face: 1, sx: 1, sy: 1, rot: 0, bob: 0, flip: 1, elev: 0, recoil: 0, head: 0 };
export function drawnMuzzle(u, p, out = {}) {
  TQ.face = u.face; TQ.sx = p.sx; TQ.sy = p.sy; TQ.rot = p.tilt + p.spin; TQ.bob = p.bob;
  TQ.flip = p.turretFlip; TQ.elev = p.turretRot; TQ.recoil = p.recoil; TQ.head = p.headRot;
  tipOffset(u.type, TQ, out);
  out.x += u.x; out.y += u.y - (u.z || 0);
  return out;
}

// Boss-Teil der Pose (nach der allgemeinen Pose; Luft, Betäubung und Drehung bleiben)
const TA = {};
function bossPose(u, t, out, mem, mx, my) {
  const T = u.T, type = u.type, face = u.face < 0 ? -1 : 1;
  const first = !mem || !(mem.t >= 0) || t < mem.t;
  const dt = first ? 0 : Math.min(.1, t - mem.t);
  const shot = !!mem && !first && u.fireT < mem.fireT;   // seit dem letzten Bild geschossen
  if (mem) { mem.t = t; mem.fireT = u.fireT; }
  const sp = Math.sqrt(mx * mx + my * my), q = clamp(sp / T.speed, 0, 1);
  const hit = u.hitT > 0;
  const tg = u.tg, dx = tg ? tg.x - u.x : 0, dy = tg ? tg.y - u.y : 0;
  // fast kein Squash: Treffer drückt nur um BOSS_SQUASH, kein Federn beim Fahren
  out.sx = hit ? 1 + BOSS_SQUASH : 1; out.sy = hit ? 1 - BOSS_SQUASH : 1;
  if (type === 'panzer') {
    out.bob = 0; out.frame = 0;
    tankAim(dx, dy, face, TA);
    let flip = TA.side, elev = TA.elev;
    if (mem) {
      if (first) { mem.side = mem.from = TA.side; mem.turnT = TURN_T; mem.elev = TA.elev; }
      else {
        const side = tg && Math.abs(dx) < TURN_DEADBAND ? mem.side : TA.side;
        if (side === mem.side) mem.turnT += dt;
        else if (mem.turnT < TURN_T) {
          // Umkehr mitten im Umdrehen: zurück ab der aktuellen Breite (cos-Verlauf gespiegelt), kein Sprung
          mem.from = mem.side; mem.side = side; mem.turnT = TURN_T - mem.turnT;
        } else { mem.from = mem.side; mem.side = side; mem.turnT = 0; }
        mem.elev += (TA.elev - mem.elev) * (1 - Math.exp(-ELEV_RATE * dt));
        // Schuss: Turm ganz auf der Seite der Logik (muzzle.tankAim, ohne Totbereich), Rohr am Ziel
        if (shot) { mem.side = mem.from = TA.side; mem.turnT = TURN_T; mem.elev = TA.elev; }
      }
      // Umdrehen: schmal werden (cos), in der Mitte umklappen, wieder breit
      const k = Math.min(1, mem.turnT / TURN_T), c = Math.cos(Math.PI * k);
      flip = k < .5 ? mem.from * c : -mem.side * c; elev = mem.elev;
    }
    out.turretFlip = flip; out.turretRot = elev;
    // Ketten: Weg vorwärts (in Blickrichtung) bzw. rückwärts
    const v = mx * face < -1e-9 ? -sp : sp;
    let tr;
    if (mem) { if (first) mem.track = frac(u.seed); mem.track = frac(mem.track + v * dt / TRACK_PITCH); tr = mem.track; }
    else tr = frac(u.seed + v * t / TRACK_PITCH);
    out.track = tr; out.frame = Math.floor(tr * TRACK_FRAMES) % TRACK_FRAMES;
    // Rückstoß: im Schuss-Moment liegt das Rohr vorn, dann Stoß TANK_RECOIL und langsamer Rücklauf;
    // die Wanne wippt dabei zurück (0 im Schuss-Moment)
    const fq = u.fireT / TANK_RECOIL_T;
    out.recoil = TANK_RECOIL * kick(fq);
    out.tilt = fq < 1 ? -face * TANK_ROCK * Math.sin(Math.PI * fq) : 0;
  } else if (type === 'heli') {
    out.rotorRot = frac((ROTOR_SPEED * t + u.seed) / TAU) * TAU;
    out.tailRotor = frac((TAIL_ROTOR_SPEED * t + u.seed) / TAU) * TAU;
    const lean = clamp(mx / T.speed, -1, 1) * HELI_LEAN;
    if (mem) { mem.lean = first ? lean : mem.lean + (lean - mem.lean) * (1 - Math.exp(-LEAN_RATE * dt)); out.tilt = mem.lean; }
    else out.tilt = lean;
    out.bob = 0; out.frame = 0;
    out.recoil = RECOIL * kick(u.fireT / RECOIL_T);
  } else {
    const hz = WING_HZ + WING_HZ_MOVE * q;
    let ph;
    if (mem) { if (first) mem.wing = frac(u.seed); mem.wing = frac(mem.wing + hz * dt); ph = mem.wing; }
    else ph = frac(u.seed + hz * t);
    out.wingPhase = ph; out.wing = Math.sin(TAU * ph);
    // hebt sich beim Abschlag; beim Feuerspeien ruhig (blendet danach in 0.3 s wieder ein)
    const calm = clamp((u.fireT - BREATH_HOLD) / .3, 0, 1);
    out.bob = DRAGON_BOB * Math.cos(TAU * ph) * calm;
    const trail = -clamp(mx / T.speed, -1, 1) * TAIL_TRAIL;
    let tl = 0;
    if (mem) { mem.tail = first ? trail : mem.tail + (trail - mem.tail) * (1 - Math.exp(-TAIL_RATE * dt)); tl = mem.tail; }
    out.tailSwing = TAIL_AMP * Math.sin(TAU * ph - TAIL_LAG) + tl;
    const h = headAim(dx, dy, face);
    if (mem) {
      mem.head = first || u.fireT < BREATH_HOLD ? h : mem.head + (h - mem.head) * (1 - Math.exp(-HEAD_RATE * dt));
      out.headRot = mem.head;
    } else out.headRot = h;
  }
}

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

export function poseUnit(u, t, out = {}, mem) {
  const T = u.T, fly = !!T.fly;
  const mx = u.mx || 0, my = u.my || 0;
  const walking = !fly && Math.abs(mx) + Math.abs(my) > 1;
  let sx = 1, sy = 1, bob = 0, frame = 0;
  const roman = u.type === 'roemer', inBlock = roman && u.form > 0 && u.formOn && !u.formFree;
  if (fly) {
    // Flieger schweben und flattern (Flügel, Rotor) immer
    bob = Math.sin(TAU * 1.3 * t + u.seed) * 1.5;
    frame = ((t * 10 + u.seed) | 0) % 2;
  } else if (walking) {
    // Schrittfrequenz wächst mit dem Tempo des Typs; ein Federn je Schritt, Füße wechseln je Schritt
    // (Römer im Block: Phase des Blocks, Gleichschritt)
    const q = t * (2 + T.speed / 30) + (inBlock ? blockPhase(u.form) : u.seed), s = Math.sin(TAU * q);
    sy = 1 + WALK_SQUASH * s;
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
  out.turretFlip = 0; out.turretRot = 0; out.rotorRot = 0; out.tailRotor = 0; out.wingPhase = 0; out.wing = 0; out.tailSwing = 0;
  out.headRot = 0; out.track = 0;
  out.shieldFront = 0; out.shieldX = 0; out.shieldY = 0; out.shieldRot = 0; out.shieldSx = 1; out.weaponFrame = 0; out.weaponLift = 0;
  if (roman) {
    const S = inBlock ? SHIELD_FRONT : SHIELD_SIDE;
    out.shieldFront = inBlock ? 1 : 0; out.shieldX = S[0]; out.shieldY = S[1]; out.shieldRot = S[2]; out.shieldSx = S[3];
    out.weaponFrame = u.formOn && u.pilum === 1 ? 1 : 0;
    out.recoil = 0;
    const q = u.fireT / THROW_T;
    if (u.pilum === 0 && q >= 0 && q < 1) {
      const k = Math.sin(Math.PI * q);
      out.weaponLift = THROW_LIFT * k; out.weaponRot = THROW_ROT * k;
    }
  }
  if (BOSS.has(u.type)) bossPose(u, t, out, mem, mx, my);
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
// Bögen: Logiklage p.x/p.y/p.z (Mündung → Zielpunkt, Höhe sin(q·π)·h); Pfeile und Speere auf Flieger steigen dazu
// linear zur Zielhöhe tz. Gerade Schüsse: Logiklage am Boden plus Mündungsversatz (x0 − sx, y0 − sy),
// Höhe über der Laufhöhe MUZZLE_Z hebt sie an (Flieger schießen aus ihrer Höhe schräg nach unten).
export function projScreen(p, out = {}) {
  if (p.arc) {
    const q = p.t < p.dur ? p.t / p.dur : 1, tz = p.kind === 'arrow' || p.kind === 'pilum' ? p.tz || 0 : 0;
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
