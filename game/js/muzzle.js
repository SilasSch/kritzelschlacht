// Mündungen der Boss-Sticker (Task 12c, Spez. #23): eine gemeinsame Stelle für Logik und Darstellung.
// Rein (kein DOM, kein PIXI, kein Zufall, kein Darstellungs-Zustand). Enthält die Geometrie, die
// rig.js (Zeichnung), pose.js (Pose), renderer.js (Teile setzen) und combat.js (Schuss-Startpunkt) teilen,
// und die Umrechnung "Pose → Bildschirmpunkt der Mündung" (tipOffset). combat.fire/breath rufen
// bossMuzzle mit der Schuss-Pose aus dem Zustand der Einheit auf; pose.drawnMuzzle ruft tipOffset mit
// der gezeichneten Pose auf. Beide müssen im Schuss-Moment übereinstimmen (tests/muzzle.test.js).
//
// Einheiten: Geometrie in r · BOSS_VIS (Zeichenradius), lokal im ungespiegelten Rig (Blick nach rechts).
// Ergebnis: Bildschirm-Versatz zu (u.x, u.y − u.z).
import { UNITS } from './data.js';

export const BOSS_VIS = { panzer: 1.35, heli: 1.35, drache: 1.3 };
export const TILT_MAX = .12;          // rad Laufneigung bei voller Geschwindigkeit (auch der Drache)
export const BOSS_SQUASH = .02;       // Boss-Treffer: sx 1 + 0.02, sy 1 − 0.02
export const HEAD_MAX = .6;           // Drachenkopf: lokaler Winkel zum Ziel höchstens ±0.6 rad
export const TANK_ELEV_MAX = .35;     // Panzerrohr: Erhöhung/Senkung höchstens ±0.35 rad
export const TURN_SQUASH = .12;       // Turm beim Umdrehen: so viel höher, wenn er ganz schmal ist

// Panzer: Turm-Mitte in der Wanne, Schildzapfen (Drehpunkt des Rohrs) und Mündung im Turm, Kettenboden
export const TANK_GEO = { turret: [-.12, -.38], trunnion: [.42, 0], tip: [1.13, 0], pivotY: .74 };
// Hubschrauber: Mast, Heckrotor, Kanonen-Halterung und Mündung (in der Halterung). Der Rumpf neigt sich
// um die Mündung (pivot), damit sie bei jeder Neigung gleich liegt.
export const HELI_GEO = { mast: [0, -.95], tailRotor: [-1.76, -.38], gun: [.55, .4], gunTip: [.58, 0], rotorFlat: .26 };
HELI_GEO.pivot = [HELI_GEO.gun[0] + HELI_GEO.gunTip[0], HELI_GEO.gun[1] + HELI_GEO.gunTip[1]];
// Drache: Hals-Ansatz am Rumpf, Halslänge und -winkel (folgt dem Kopf zu neckFollow), Maul im Kopf
// (Drehpunkt = Halsende), Schultern der Flügel, Schweif-Ansatz
export const DRAGON_GEO = { neck: [.5, -.12], neckLen: .55, neckAng: -.95, neckFollow: .35, mouth: [.8, .2],
  wingF: [-.05, -.3], wingB: [.2, -.4], tail: [-.78, .22] };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const visR = t => UNITS[t].r * (BOSS_VIS[t] || 1);

// Halsende (jx, jy), Halswinkel na und Maul (mx, my) des Drachen für den lokalen Kopfwinkel h
export function dragonHead(h, out) {
  const G = DRAGON_GEO, na = G.neckAng + h * G.neckFollow;
  out.jx = G.neck[0] + Math.cos(na) * G.neckLen; out.jy = G.neck[1] + Math.sin(na) * G.neckLen; out.na = na;
  const c = Math.cos(h), s = Math.sin(h);
  out.mx = out.jx + G.mouth[0] * c - G.mouth[1] * s; out.my = out.jy + G.mouth[0] * s + G.mouth[1] * c;
  return out;
}
// Panzerturm zum Ziel (dx, dy = Ziel − Einheit): Seite in der Welt (±1; ohne Ziel bzw. genau darüber:
// Blickrichtung) und Rohrwinkel lokal (+ = nach unten), begrenzt auf ±TANK_ELEV_MAX
export function tankAim(dx, dy, face, out) {
  out.side = dx > 1e-9 ? 1 : dx < -1e-9 ? -1 : face < 0 ? -1 : 1;
  out.elev = dx * dx + dy * dy > 1e-12 ? clamp(Math.atan2(dy, Math.abs(dx)), -TANK_ELEV_MAX, TANK_ELEV_MAX) : 0;
  return out;
}
// Drachenkopf: lokaler Winkel zum Ziel im gespiegelten Rig, begrenzt auf ±HEAD_MAX
export const headAim = (dx, dy, face) => (dx * dx + dy * dy > 1e-12 ? clamp(Math.atan2(dy, dx * (face < 0 ? -1 : 1)), -HEAD_MAX, HEAD_MAX) : 0);

/* Mündung aus einer Pose q = { face, sx, sy, rot, bob, flip, elev, recoil, head } (wie poseUnit: flip =
   Turm-Breite in Weltrichtung −1..1, elev = Rohrwinkel, recoil px, head = Kopfwinkel; rot = Drehung des
   Einheiten-Containers). Transform wie renderer.bodies: Drehpunkt pivot, Lage (u.x + face·pivot.x,
   u.y − u.z + pivot.y + bob), Maßstab (sx·face, sy), Drehung rot; im Panzer der Turm (Breite flip·face,
   Höhe 1 + TURN_SQUASH·(1 − |flip|)) und darin das Rohr um den Schildzapfen. */
const DH = {};
export function tipOffset(type, q, out) {
  const R = visR(type), face = q.face < 0 ? -1 : 1;
  let lx, ly, px = 0, py = 0;
  if (type === 'panzer') {
    const G = TANK_GEO, fl = q.flip * face, sq = 1 + TURN_SQUASH * (1 - Math.abs(q.flip));
    const c = Math.cos(q.elev), s = Math.sin(q.elev), L = G.tip[0] - G.trunnion[0] - (q.recoil || 0) / R;
    lx = G.turret[0] + fl * (G.trunnion[0] + L * c); ly = G.turret[1] + sq * (G.trunnion[1] + L * s);
    py = G.pivotY;
  } else if (type === 'heli') {
    const G = HELI_GEO;
    px = G.pivot[0]; py = G.pivot[1];
    lx = px - (q.recoil || 0) * .6 / R; ly = py;
  } else {
    dragonHead(q.head, DH); lx = DH.mx; ly = DH.my;
  }
  const X = (lx - px) * R * q.sx * face, Y = (ly - py) * R * q.sy, c = Math.cos(q.rot), s = Math.sin(q.rot);
  out.x = face * px * R + X * c - Y * s;
  out.y = py * R + (q.bob || 0) + X * s + Y * c;
  return out;
}

/* Schuss-Startpunkt für die Logik: Pose im Schuss-Moment nur aus dem Zustand der Einheit u und dem
   Zielpunkt (tx, ty): Turm ganz zum Ziel gedreht, Rohr ohne Rückstoß (er beginnt erst danach), Wanne
   ungeneigt; Heli neigt sich um die Mündung (Neigung egal); Drache: Kopf ungeglättet zum Ziel, beim
   Feuerspeien ohne Auf und Ab, Neigung aus der Laufgeschwindigkeit; Treffer-Quetschen aus u.hitT.
   Ergebnis: Bildschirm-Versatz (x, y) zu (u.x, u.y − u.z). */
const Q = { face: 1, sx: 1, sy: 1, rot: 0, bob: 0, flip: 1, elev: 0, recoil: 0, head: 0 }, TA = {};
export function bossMuzzle(u, tx, ty, out = {}) {
  const T = u.T, face = u.face < 0 ? -1 : 1, dx = tx - u.x, dy = ty - u.y, hit = u.hitT > 0;
  Q.face = face; Q.sx = hit ? 1 + BOSS_SQUASH : 1; Q.sy = hit ? 1 - BOSS_SQUASH : 1;
  Q.rot = 0; Q.bob = 0; Q.recoil = 0; Q.flip = 1; Q.elev = 0; Q.head = 0;
  if (u.type === 'panzer') { tankAim(dx, dy, face, TA); Q.flip = TA.side; Q.elev = TA.elev; }
  else if (u.type === 'drache') { Q.head = headAim(dx, dy, face); Q.rot = clamp((u.mx || 0) / T.speed, -1, 1) * TILT_MAX; }
  return tipOffset(u.type, Q, out);
}
export const hasMuzzle = t => t === 'panzer' || t === 'heli' || t === 'drache';
