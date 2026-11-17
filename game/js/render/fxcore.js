// Reine Effekt-Logik (Task 12): Ereignisse → Partikel und Decals, Partikel altern lassen, Aussehen je
// Partikel, Bildschirmwackeln. Kein DOM, kein PIXI; fx.js zeichnet die Partikel (QuadBatches, quads.js) und
// malt die Decals, die es über hooks.decal / hooks.crater bekommt.
//
// Spez. #14 "Effekte mit Maß": Glühen (additiv) nur bei Feuer, Explosionen, Mündungsblitzen und dem kurzen
// Bodenlicht (GLOW_KINDS); alles andere normal gemischt. Auf dem weißen Feld bleibt additives Licht
// unsichtbar (Weiß bleibt Weiß); sichtbar sind die normal gemischten Kerne, Rauch, Staub und Krater.
// Deckel: höchstens FX_CAP lebende Partikel; je consume() höchstens FRAME_LIMITS Ereignisse je Art mit
// Partikeln bzw. Decals (500 land-Ereignisse in einem Bild kosten so nur 24 Staubwolken).
import { UNITS } from '../data.js';
import { HELI_CRASH_R, DRAGON_CRASH_R, MUZZLE_Z } from '../combat.js';
import { shade } from './rig.js';
import { projScreen, BOSS, BOSS_VIS, CHANNEL_LIFT } from './pose.js';
import { METEOR, WIND } from '../spells.js';

export const FX_CAP = 3000;
export const FRAME_LIMITS = { blast: 32, crash: 8, land: 24, splash: 24, death: 64, shot: 96, decal: 48, misc: 160, jet: 24, ignite: 48, ability: 24, spell: 24 };

/* ---------- Wackeln ---------- */
// Explosion: max(shake, min(12, R/6)). Abklingen je Sekunde wie früher ×0.85 je Bild bei 60 fps.
export const SHAKE_MAX = 12;
export const SHAKE_DECAY = -Math.log(.85) * 60;
export const blastShake = R => Math.min(SHAKE_MAX, (R > 0 ? R : 0) / 6);
export function decayShake(s, dt) {
  const v = s * Math.exp(-SHAKE_DECAY * (dt > 0 ? dt : 0));
  return v < .05 ? 0 : v;
}

/* ---------- Rauch, Staub, Bodenlicht ---------- */
// Rauch: grau, normal gemischt, steigt mit rise px/s, Wind wind px/s nach rechts, wächst auf grow, life s.
export const SMOKE = { life: 2.5, rise: 20, wind: 12, grow: 2.5, alpha: .3 };
export const DUST = { life: .8, rise: 8, wind: 6, grow: 2, alpha: .45 };
export const CRASH_SMOKE_MUL = 2;   // Absturz: Rauch doppelt so lang
// Wolke zur Zeit age: Größe wächst (schnell, dann langsamer) von 1 auf grow; Deckkraft blendet kurz ein
// und läuft bis zum Ende auf 0 aus.
export function puffLook(age, life, grow, alpha, out) {
  const q = age <= 0 ? 0 : age >= life ? 1 : age / life;
  out.scale = 1 + (grow - 1) * (1 - (1 - q) * (1 - q));
  out.alpha = alpha * Math.min(1, q / .08) * (1 - q);
  return out;
}
// Bodenlicht einer Explosion: additiver Radialverlauf, Radius 3·R, Deckkraft 0.5 → 0 in 0.25 s
export const LIGHT_T = .25, LIGHT_ALPHA = .5, LIGHT_RMUL = 3, LIGHT_LIVE_MAX = 12;
export const groundLight = age => (age >= LIGHT_T ? 0 : LIGHT_ALPHA * (1 - (age > 0 ? age : 0) / LIGHT_T));
// Warmes Licht (normal gemischt), damit Explosionen den Boden auch auf dem weißen Feld kurz beleuchten:
// Scheibe #ffb347 mit Verlauf zum Rand, Radius 3·R, Deckkraft 0.35 → 0 in LIGHT_T (danach bleibt Weiß weiß).
// Mündungsblitz und Feuer: kleiner warmer Halo, 2.5× so groß, Deckkraft HALO_ALPHA, so kurz wie das Partikel.
export const WARM_TINT = 0xffb347, WARM_ALPHA = .35, HALO_ALPHA = .25, HALO_RMUL = 2.5;
export const groundWarm = age => (age >= LIGHT_T ? 0 : WARM_ALPHA * (1 - (age > 0 ? age : 0) / LIGHT_T));

// Staub nach einer Landung: Anzahl und Größe nach Aufprallgeschwindigkeit (px/s), sanfte Landungen ohne
export const DUST_MIN_IMPACT = 60;
export function landDust(impact, out = {}) {
  if (!(impact >= DUST_MIN_IMPACT)) { out.n = 0; out.r = 0; return out; }
  out.n = Math.min(6, 1 + Math.floor((impact - DUST_MIN_IMPACT) / 80));
  out.r = Math.min(9, 2.5 + impact / 80);
  return out;
}
/* ---------- Drachenfeuer (Spez. #21) ---------- */
// Flammenstrahl je Atemstoß (alle 0,2 s je Drache): JET_N Flammen ('jet', additiv glühend mit warmem Halo)
// von der Mündung zum Ziel, gestreut im Kegel ±JET_SPREAD, Dämpfung JET_DRAG; sie wachsen, werden von
// weißgelb zu rot und enden grob am Ziel. Dazu Funken ('spark', fallen), Hitzeflimmern ('haze', zart,
// normal gemischt), etwas Rauch am Ende und ein kurzes Bodenlicht am Ziel.
export const JET_N = 20, JET_SPARKS = 5, JET_HAZE = 2, JET_SPREAD = .42, JET_DRAG = 2.4;
// Brennende Einheiten (u.burnT > 0): je Bild höchstens BURN_FX_UNITS Einheiten (reihum), Flammen
// ('flame') mit FLAME_RATE + FLAME_RATE_R · r je s auf dem Körper und ein Rauchfaden ('wisp', WISP_RATE je s).
export const BURN_FX_UNITS = 160, FLAME_RATE = 9, FLAME_RATE_R = .9, WISP_RATE = 3.5;
export const WISP = { life: 1.2, rise: 26, wind: 10, grow: 2.2, alpha: .28 };
/* ---------- Boss-Effekte (Task 12c, Spez. #23) ---------- */
// Je Bild höchstens BOSS_FX_UNITS Bosse (reihum): Panzer stoßen beim Anfahren EXHAUST_T s lang Abgas am
// Heck aus (EXHAUST_RATE je s), Hubschrauber unter WASH_Z Flughöhe werfen Rotorwind-Staub am Boden unter
// sich (WASH_RATE je s, ringförmig nach außen), Drachen gelegentliche Flügelböen (GUST_RATE je s). Zart:
// Staub 'wash' höchstens WASH.alpha, Abgas 'exhaust' grau und kurz.
export const BOSS_FX_UNITS = 24, EXHAUST_T = .5, EXHAUST_RATE = 14, WASH_RATE = 7, WASH_Z = 60, GUST_RATE = 2.5;
export const EXHAUST_BURST = 2;
export const WASH = { life: .9, grow: 2.2, alpha: .22 };
export const EXHAUST = { life: .9, grow: 2.6, alpha: .34 };

// Glut je Explosion: 14 bis 22, mit dem Radius mehr
export const emberCount = R => 14 + Math.min(8, Math.round((R > 0 ? R : 0) / 10));

/* ---------- Detailstufe (Task 13) ----------
   Stufe 0: alles. Stufe 1 (langsame Bilder): Rauch aus (alle Wolken-Arten LOD_OFF, große halbtransparente
   Sprites mit viel Überzeichnung) und von allen übrigen Partikeln nur jedes zweite (×0,5 je Ereignis und je
   Bild bei Brand und Bossen), außer den einzelnen Zeichen LOD_KEEP (Bodenlicht, Kern, Seelchen, Pfeil).
   Wann gesenkt wird, entscheidet der Regler createLodGovernor aus der Arbeitszeit je Bild. */
export const LOD_MAX = 1;
export const LOD_OFF = new Set(['smoke', 'dust', 'wisp', 'exhaust', 'wash']);
// Zauber (spells.js): Blitzbögen, Kanalstrahlen, Kugel, Meteor und Zielkreis werden nie ausgedünnt (sonst Lücken im
// Bogen bzw. Flackern der je Bild neu gesetzten Teile)
export const LOD_KEEP = new Set(['light', 'core', 'soul', 'arrow', 'pilum', 'wave', 'bang', 'bolt', 'boltc', 'beam', 'beamc', 'orb', 'meteor', 'mrock', 'mring', 'mark', 'mtrail']);
// Regler: update(workMs, frameMs). Gewertet wird die gemessene Arbeitszeit je Bild (Simulation, Effekte,
// Zeichnen; ms), nicht der Bildabstand: ein auf 30 Hz begrenzter Browser hat 33 ms Abstand, aber wenig Arbeit.
// Gleitendes Mittel der Arbeitszeit (Gewicht LOD_EMA); länger als LOD_SLOW_T s (Echtzeit aus frameMs) über
// LOD_SLOW_MS (ein 60-Hz-Bild) → eine Stufe tiefer; LOD_RECOVER_T s unter LOD_OK_MS → eine Stufe zurück.
// Jedes weitere Senken verdoppelt die Wartezeit bis zur Rückkehr (bis LOD_RECOVER_MAX), damit die Stufe
// nicht im Sekundentakt springt. Bilder mit Abstand über LOD_IGNORE_MS (Tab im Hintergrund, Haltepunkt)
// zählen nicht. Ohne frameMs gilt frameMs = workMs.
export const LOD_SLOW_MS = 16, LOD_SLOW_T = .3, LOD_OK_MS = 12, LOD_RECOVER_T = 3, LOD_RECOVER_MAX = 24;
export const LOD_EMA = .1, LOD_IGNORE_MS = 250;
// Decal-Generationen: zwei Leinwände, alle gen s tauscht die alte (gelöscht) mit der aktuellen. Die alte blendet
// linear über gen s aus; ein Fleck lebt so gen bis 2·gen s. Rein: tick gibt true, wenn getauscht werden muss.
// at(simT): tick mit der Spielzeit (world.time) seit dem letzten Aufruf statt der Bildzeit, damit Krater in der
// Pause nicht verblassen (wie die Gefallenen, physics.stepCorpses). Höchstens AGER_MAX_DT s je Aufruf; läuft die
// Zeit zurück (neue Welt) oder ist es der erste Aufruf (auch nach reset), zählt der Aufruf 0 s.
export const AGER_MAX_DT = 1;
export function createDecalAger(gen = 30) {
  let since = 0, swapped = false, last = -1;
  const ager = {
    tick(dt) {
      since += dt;
      if (since < gen) return false;
      since = 0; swapped = true;
      return true;
    },
    at(simT) {
      const dt = last < 0 || simT < last ? 0 : Math.min(AGER_MAX_DT, simT - last);
      last = simT;
      return ager.tick(dt);
    },
    oldAlpha: () => (swapped ? 1 - since / gen : 0),
    reset() { since = 0; swapped = false; last = -1; },
  };
  return ager;
}

export function createLodGovernor() {
  const g = {
    level: 0, ema: 0, slowT: 0, okT: 0, hold: LOD_RECOVER_T, drops: 0,
    // ein Bild werten (Arbeitszeit und Bildabstand in ms); liefert die (neue) Stufe
    update(ms, frameMs = ms) {
      if (!(ms > 0) || !(frameMs > 0) || frameMs > LOD_IGNORE_MS) return g.level;
      g.ema = g.ema > 0 ? g.ema + (ms - g.ema) * LOD_EMA : ms;
      const dt = frameMs / 1000;
      if (g.ema > LOD_SLOW_MS) { g.slowT += dt; g.okT = 0; }
      else { g.slowT = 0; g.okT = g.ema < LOD_OK_MS ? g.okT + dt : 0; }
      if (g.level < LOD_MAX && g.slowT >= LOD_SLOW_T) {
        g.level++; g.slowT = 0; g.okT = 0;
        if (g.drops++ > 0) g.hold = Math.min(LOD_RECOVER_MAX, g.hold * 2);
      } else if (g.level > 0 && g.okT >= g.hold) { g.level--; g.okT = 0; }
      return g.level;
    },
  };
  return g;
}

/* ---------- Partikelspeicher ---------- */
// Lebende Partikel in live (Zeichenreihenfolge = Entstehung), tote zurück in den Vorrat: keine Allokation
// im laufenden Spiel. Über cap wird nicht mehr erzeugt (dropped zählt). Bewegung je dt: Dämpfung
// exp(−drag·dt), Beschleunigung ay (Tropfen fallen), Drehung vrot. step(dt, hold): mit hold altern Partikel mit p.hold
// nicht (je Bild neu gesetzte Teile der Zauber bleiben in der Pause stehen, solange die Welt steht).
export function createParticles(cap = FX_CAP) {
  const live = [], free = [];
  let dropped = 0;
  return {
    live, cap,
    get count() { return live.length; },
    get dropped() { return dropped; },
    spawn(k, x, y, life) {
      if (live.length >= cap) { dropped++; return null; }
      const p = free.pop() || {};
      p.k = k; p.x = x; p.y = y; p.x0 = x; p.y0 = y; p.vx = 0; p.vy = 0; p.ay = 0; p.drag = 0;
      p.age = 0; p.life = life; p.r = 1; p.col = 0xffffff; p.rot = 0; p.vrot = 0; p.sy = 1; p.a0 = 1; p.hold = false;
      live.push(p);
      return p;
    },
    step(dt, hold = false) {
      let n = 0;
      for (let i = 0; i < live.length; i++) {
        const p = live[i];
        if (hold && p.hold) { live[n++] = p; continue; }
        p.age += dt;
        if (p.age >= p.life) { free.push(p); continue; }
        if (p.drag) { const f = Math.exp(-p.drag * dt); p.vx *= f; p.vy *= f; }
        if (p.ay) p.vy += p.ay * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.vrot) p.rot += p.vrot * dt;
        live[n++] = p;
      }
      live.length = n;
    },
    clear() { for (const p of live) free.push(p); live.length = 0; dropped = 0; },
    countByKind() { const o = {}; for (const p of live) o[p.k] = (o[p.k] || 0) + 1; return o; },
  };
}

/* ---------- Aussehen ---------- */
// Bildteile des Atlas in fx.js
// wave: dünner Ring (Wellen der Fähigkeiten), note: Achtelnote (Heulen), bang: Ausrufezeichen (Schreck)
export const F = { disc: 0, soft: 1, puff: 2, ring: 3, plus: 4, soul: 5, arrow: 6, warm: 7, streak: 8, pilum: 9, wave: 10, note: 11, bang: 12 };
// Einheitsradius je Bildteil (F) in Atlas-px: ein Partikel mit r = FRAME_R[f] wird in Originalgröße gezeichnet
export const FRAME_R = [30, 32, 26, 26, 30, 24, 58, 32, 30, 32, 28, 30, 30];
// Zauber (Spez. #31): Blitz (bolt, zap), Kanalfunken (mote), Kugel am Himmel (orb) und Meteor glühen auch
export const GLOW_KINDS = new Set(['ember', 'fire', 'flash', 'core', 'light', 'jet', 'spark', 'flame', 'bolt', 'zap', 'mote', 'orb', 'meteor']);
export const WARM_KINDS = new Set(['light', 'flash', 'fire', 'jet', 'flame']);
const PL = {};
// Aussehen eines Partikels in out: normales Sprite (frame, x, y, r = Anzeigeradius, rot, tint, alpha,
// ax = Anker x), das additive Glühen (gR, gTint, gAlpha; gLight: im Bodenlicht-Layer unter den Figuren) und
// das warme Licht, normal gemischt unter dem Glühen (wR, wTint, wAlpha; wGround: am Boden unter den Figuren).
// sy: Stauchung quer (1 = rund; Striche der Zauber: Breite unabhängig von der Länge).
// alpha, gAlpha bzw. wAlpha 0: kein Sprite.
export function look(p, o) {
  const q = p.age / p.life, a = 1 - q;
  o.frame = F.disc; o.x = p.x; o.y = p.y; o.r = p.r; o.rot = p.rot; o.tint = p.col; o.alpha = a; o.ax = .5;
  o.gR = 0; o.gTint = 0xffffff; o.gAlpha = 0; o.gLight = false;
  o.wR = 0; o.wTint = WARM_TINT; o.wAlpha = 0; o.wGround = false; o.sy = 1;
  switch (p.k) {
    case 'ember':
      o.r = p.r * (1.6 - a * .6); o.tint = a > .55 ? 0xffd84d : a > .3 ? 0xff8a3d : 0x9aa0aa;
      if (a > .3) { o.gR = p.r * 3; o.gTint = 0xff9a3d; o.gAlpha = (a - .3) / .7 * .6; }
      break;
    case 'fire':
      o.r = p.r * (.6 + a * .6); o.tint = a > .6 ? 0xffe066 : a > .3 ? 0xff8a3d : 0xe5574f;
      o.gR = p.r * 2.6; o.gTint = 0xff7a2a; o.gAlpha = a * .5;
      o.wR = p.r * HALO_RMUL; o.wAlpha = HALO_ALPHA * a;
      break;
    case 'jet': {
      // wächst entlang des Strahls, weißgelb → orange → rot
      o.r = p.r * (.55 + q * 1.25); o.alpha = a > .15 ? .95 : a / .15 * .95;
      o.tint = q < .22 ? 0xfff1a8 : q < .48 ? 0xffc23d : q < .75 ? 0xff7a2a : 0xd8432f;
      o.gR = o.r * 2.4; o.gTint = 0xff8a3a; o.gAlpha = a * .55;
      o.wR = o.r * HALO_RMUL; o.wAlpha = HALO_ALPHA * a * .6;
      break;
    }
    case 'spark':
      o.tint = a > .5 ? 0xffe680 : 0xff9a3d; o.gR = p.r * 3.2; o.gTint = 0xffb050; o.gAlpha = a * .8;
      break;
    case 'haze':
      // Hitzeflimmern: zarte warme Scheibe, die zittert und wächst
      o.frame = F.warm; o.x = p.x + Math.sin(p.age * 40 + p.rot) * 2; o.y = p.y + Math.cos(p.age * 33 + p.rot) * 1.2;
      o.r = p.r * (1 + q * .8); o.tint = 0xffe2b8; o.alpha = .12 * Math.min(1, .2 + q / .15) * a;
      break;
    case 'flame':
      o.r = p.r * (.5 + a * .7); o.tint = a > .6 ? 0xffe066 : a > .3 ? 0xff8a3d : 0xe5574f;
      o.gR = p.r * 2.4; o.gTint = 0xff7a2a; o.gAlpha = a * .5;
      o.wR = p.r * HALO_RMUL; o.wAlpha = HALO_ALPHA * a * .6;
      break;
    case 'wash': case 'exhaust': {
      const P = p.k === 'wash' ? WASH : EXHAUST;
      puffLook(p.age, p.life, P.grow, P.alpha, PL);
      o.frame = F.puff; o.r = p.r * PL.scale; o.alpha = PL.alpha;
      break;
    }
    case 'wisp':
      puffLook(p.age, p.life, WISP.grow, WISP.alpha, PL);
      o.frame = F.puff; o.r = p.r * PL.scale; o.alpha = PL.alpha;
      break;
    case 'flash':
      o.tint = 0xffe066; o.gR = p.r * 3.5; o.gTint = 0xffcf66; o.gAlpha = a * .9;
      o.wR = p.r * HALO_RMUL; o.wAlpha = HALO_ALPHA * a;
      break;
    case 'core':
      o.r = p.r * (1 + q * .5); o.tint = 0xffe27a; o.alpha = a * .9;
      o.gR = p.r * 2.6; o.gTint = 0xffb060; o.gAlpha = a * .7;
      break;
    case 'light':
      o.alpha = 0; o.gR = p.r; o.gTint = 0xffcf8a; o.gAlpha = groundLight(p.age); o.gLight = true;
      o.wR = p.r; o.wAlpha = groundWarm(p.age); o.wGround = true;
      break;
    case 'smoke': case 'dust': {
      const P = p.k === 'smoke' ? SMOKE : DUST;
      puffLook(p.age, p.life, P.grow, P.alpha, PL);
      o.frame = F.puff; o.r = p.r * PL.scale; o.alpha = PL.alpha;
      break;
    }
    case 'ring': o.frame = F.ring; o.r = p.r * (1.15 - a * .5); o.alpha = a * .8; break;
    case 'plus': o.frame = F.plus; o.tint = 0x2fbf6b; break;
    case 'soul': o.frame = F.soul; o.x = p.x + Math.sin(p.age * 6) * 2; o.tint = 0xffffff; o.alpha = a * .85; break;
    case 'arrow': o.frame = F.arrow; o.ax = 1; o.tint = 0xffffff; o.alpha = Math.min(1, a * 2); o.r = 8; break;
    // steckender Römerspeer: länger als der Pfeil, Spitze am Landepunkt (Anker rechts)
    case 'pilum': o.frame = F.pilum; o.ax = 1; o.tint = 0xffffff; o.alpha = Math.min(1, a * 2); o.r = 8; break;
    // Schildblock: heller Querstrich (wächst kurz), Splitter (dreht sich, in p.col)
    case 'glint': o.frame = F.streak; o.tint = 0xfff6c8; o.r = p.r * (1 + q * .5); o.alpha = a; break;
    case 'shard': o.frame = F.streak; o.alpha = Math.min(1, a * 3); break;
    // Fähigkeiten (abilities.js): Welle wächst schnell auf ihren Radius p.r und blendet aus; Note schwankt beim
    // Steigen; Ausrufezeichen springt kurz auf und blendet am Ende aus; Rufstrich (Brüllen) fliegt nach außen
    case 'wave': o.frame = F.wave; o.r = p.r * (.2 + .8 * (1 - a * a)); o.alpha = a * .75; break;
    case 'note': o.frame = F.note; o.x = p.x + Math.sin(p.age * 9 + p.rot) * 2.5; o.rot = 0; o.alpha = Math.min(1, a * 2.5); break;
    case 'bang': o.frame = F.bang; o.r = p.r * (q < .12 ? 1.35 - q / .12 * .35 : 1); o.alpha = Math.min(1, a * 3); break;
    case 'shout': o.frame = F.streak; o.r = p.r * (.6 + q * .6); o.alpha = a * .9; break;
    // Zauber (spells.js, siehe SPELL_FX): Blitzbogen blau mit weißem Kern, kurz voll da und dann aus; Funken am Treffer;
    // Windschliere (wächst, blendet ein und aus); Kanalstrahl, Kugel, Meteor und Zielkreis werden je Bild neu gesetzt
    // (Deckkraft p.a0, kein Altern sichtbar); Kanalfunken steigen zum Sammelpunkt
    case 'bolt':
      o.frame = F.streak; o.tint = 0x2e64e8; o.alpha = q < .45 ? 1 : a / .55; o.sy = p.sy;
      o.gR = p.r * .9; o.gTint = 0x8fbaff; o.gAlpha = a * .55;
      o.wR = p.r * 1.1; o.wTint = 0xc4dcff; o.wAlpha = .18 * a;
      break;
    case 'boltc': o.frame = F.streak; o.tint = 0xffffff; o.alpha = q < .45 ? 1 : a / .55; o.sy = p.sy; break;
    case 'zap': o.tint = a > .5 ? 0xeaf4ff : 0x8fbaff; o.gR = p.r * 3; o.gTint = 0x7fb0ff; o.gAlpha = a * .8; break;
    case 'gust': o.frame = F.streak; o.tint = p.col; o.r = p.r * (.7 + q * .6); o.alpha = .85 * Math.min(1, q / .15) * a; o.sy = p.sy; break;
    case 'beam': case 'beamc': case 'mtrail': o.frame = F.streak; o.alpha = p.a0; o.sy = p.sy; break;
    case 'mote': o.tint = 0xe6dcff; o.gR = p.r * 3.2; o.gTint = 0xa47cff; o.gAlpha = a * .75; break;
    case 'orb':
      o.alpha = p.a0; o.gR = p.r * 2.8; o.gTint = 0xff9a3d; o.gAlpha = .65 * p.a0;
      o.wR = p.r * 2.4; o.wAlpha = .35 * p.a0;
      break;
    case 'meteor':
      o.alpha = p.a0; o.gR = p.r * 3.2; o.gTint = 0xff7a2a; o.gAlpha = .8 * p.a0;
      o.wR = p.r * 2.6; o.wAlpha = .4 * p.a0;
      break;
    case 'mrock': o.alpha = p.a0; break;
    case 'mring': case 'mark': o.frame = p.k === 'mark' ? F.wave : F.ring; o.alpha = p.a0; break;
    // 'dot', 'drop': Scheibe in p.col
  }
  return o;
}

/* ---------- Schildblock der Römer (Spez. #25) ----------
   block-Ereignis (combat.shieldHit: x, y am Schild, kind, a = Abprallwinkel): ein heller Querstrich quer zu a
   ('glint'), BLOCK_FX.sparks kleine Funken ('spark', glühen und fallen) und ein Splitter ('shard': Holz bei
   Pfeil und Speer, grau bei Kugeln), der in Richtung a abprallt, mit kleinem Hüpfer nach oben (shardUp px/s).
   Budget-Art misc. */
export const BLOCK_FX = { sparks: 2, shardUp: 40, shardV: [80, 130], sparkV: [50, 110] };
const SHARD_COL = { bullet: 0x9aa0aa, arrow: 0xa5692f, pilum: 0xc9a26b, firearrow: 0xa5692f };

/* ---------- Fähigkeiten (Spez. #30, Task 2) ----------
   ability-Ereignis (abilities.js: k, x, y, z, R): je Art ein kurzes Zeichen, alles unter ABILITY_FX.life s, Budget-Art
   ability. heal: grüne Welle bis R und Pluszeichen; roar: braune Welle und 8 Rufstriche nach außen; howl: zarte graue
   Welle und 3 steigende Noten; spook: fahle Welle um das Opfer und Wölkchen; ram: dunkler Ring und Staub hinter dem
   Panzer (dazu Staub an den Ketten, solange er rammt: bossFx); dive: Staubwelle bis R und Staub am Rand.
   fear-Ereignis (Erschreckter): rotes Ausrufezeichen über dem Kopf (Budget misc). */
const ABILITY_FX = { life: 1, waveT: .5, notes: 3, shouts: 8, ramDust: 18 };
/* ---------- Vampir und Ghul (Spez. #32, Task 4) ----------
   vamp-Ereignis (abilities.js), Budget-Art ability. bat: Verwandlung (beide Richtungen), dunkelviolette Rauchfäden und
   kleine dunkle Fetzen. rise: ein Ghul steht auf, dunkler Erdfleck, hochgeworfene Erdbrocken und grünlicher Nebel.
   crumble: ein Ghul zerfällt, Staubwolken und fallende grünlich-graue Brocken. Alles unter 1,2 s. */
export const VAMP_FX = {
  batWisps: 6, batBits: 5, batSmoke: 0x6a5a78, batDark: 0x3a2f45,
  riseClods: 7, riseWisps: 4, riseSoil: '#4a4036', riseClod: 0x7a6a55, riseMist: 0xb6c7a8,
  dust: 4, bits: 6, bitCol: 0x8f9c84,
};
const WAVE_COL = { heal: 0x2fbf6b, roar: 0x8b5a3c, howl: 0x8d939e, spook: 0x9b8fd6, dive: 0xb8a98a };
/* ---------- Task 6: Kreaturen (Spez. #34) ----------
   creature-Ereignis (abilities.js, combat.js), Budget-Art ability. boulder: Felseinschlag ohne Feuer (Staubwelle bis R,
   Staubwolken am Rand, Steinsplitter, Krater, Wackeln über e.shake); frog / unfrog: grünes Wölkchen mit Funkeln (Fluch
   bzw. Ende); curse: grüner Strahl von der Hexe zum Ziel mit Funkeln; hexhit: grüne Funken am Treffer; ash: der Phönix
   zerfällt zu Asche (Flammen, Glut, dunkler Fleck); rise: er steht auf (Feuerwelle, Flammen nach oben, Funken); trail:
   Feuerspur (Flammen und Glut am Boden unter ihm, kleiner Brandfleck); aura: Glitzern in Regenbogenfarben um das Einhorn.
   Alles unter 1,2 s. Fliegende Hexenzauber ziehen grüne Funken (update). */
export const CREATURE_FX = {
  hex: 0x7be06a, hexDark: 0x3f9a4a, frogPuff: 0xa8e29a, rainbow: [0xff6b6b, 0xffb84d, 0xffe066, 0x6fd36f, 0x6fb7ff, 0xb48cff],
  rock: 0x8d929c, rockDark: 0x6d727c, scorch: '#3a3d45', trailRate: 26,
};

/* ---------- Zauber der Magier (Spez. #31, Task 3) ----------
   spell-Ereignis (spells.js), Budget-Art spell:
   bolt     Zickzack-Bogen (x0, y0 − z0) → (x1, y1 − z1): etwa BOLT_SEG px je Stück, quer um bis BOLT_JAG px versetzt,
            manchmal eine kurze Gabel; je Stück ein blauer Strich (Breite BOLT_W) mit weißem Kern (BOLT_CORE), dazu
            Glühen und ein blasser Halo (auf Weiß sichtbar), Funken und ein Lichtblitz am Treffer. Lebt BOLT_LIFE s.
   wind     GUST_N Schlieren (blaugrau) fliegen im Kegel (spells.WIND) nach außen und werden langsamer, Staub am Rand.
   wall     Staub entlang der neuen Mauer, Steinsplitter springen hoch.
   channel  kurze rote Welle am Zielpunkt (der Zielkreis selbst kommt je Bild aus world.casts, siehe unten).
   meteor   Einschlag (dazu kommt das blast-Ereignis: Kern, Glut, Rauch, Krater, Wackeln): Staubwelle bis 1,4 · R, Staub
            am Rand, fliegende Brocken, Glutfunken und ein Brandfleck.
   fizzle   abgebrochener Meteor: Rauchwölkchen und fallende violette Funken am Sammelpunkt.
   Meteor-Kanal (update mit world.casts, höchstens CAST_FX_MAX Kanäle je Bild): Zielkreis am Boden (rot, wird kräftiger),
   von jedem Magier ein violetter Strahl vom Stab zum Sammelpunkt (sx, sy) mit aufsteigenden Funken, dort eine
   wachsende Feuerkugel; in den letzten FALL s fällt der Meteor (Glut mit dunklem Kern und Umriss) beschleunigt zum
   Ziel und zieht einen Schweif (zwei Striche bis TAIL_L px zurück, Flammen mit TAIL_RATE je s, Rauch). Diese Teile werden je Bild neu gesetzt (Lebensdauer PER_LIFE Bilder). */
export const SPELL_FX = {
  BOLT_SEG: 16, BOLT_JAG: 9, BOLT_W: 3.6, BOLT_CORE: 1.3, BOLT_LIFE: .2, FORK_P: .35,
  GUST_N: 14, CAST_FX_MAX: 6, MOTE_RATE: 18, FALL: .38, BEAM_W: 2.6, BEAM_CORE: .9, TAIL_RATE: 200, TAIL_L: 60,
};
const PER_LIFE = 1.5;   // je Bild neu gesetzte Teile leben 1,5 Bilder: genau einmal gezeichnet

/* ---------- Ereignisse → Effekte ---------- */
const TAU = Math.PI * 2;
const OUTLINE = 0x2a2a33, WATER = 0x62b9ea, ASH = '#3a3d45';
const SMOKE_COLS = [0x8d929c, 0xa3a8b2, 0x9aa0aa];
const DRAG = -Math.log(.9) * 60;    // wie früher ×0.9 je Bild bei 60 fps, jetzt je Sekunde

// hooks.decal(x, y, r, cssColor, alpha): Fleck; hooks.crater(x, y, R): dunkler Ring (Deckkraft 0.1).
// opt.rand (Zufall 0..1), opt.cap, opt.limits.
export function createFxCore(hooks = {}, opt = {}) {
  const rand = opt.rand || Math.random;
  const limits = Object.assign({}, FRAME_LIMITS, opt.limits);
  const store = createParticles(opt.cap || FX_CAP);
  const used = {}, skipped = {};
  const crashPts = [];
  let shake = 0, lightLive = 0, burnCursor = 0, burning = 0, burningAll = 0;
  let bossCursor = 0, bossDone = 0, bossAll = 0;
  const bossList = [];
  // Panzer: −1 = stand zuletzt, ≥ 0 = fährt (Rest der Abgaszeit in s)
  const drive = new WeakMap();
  const rnd = (a, b) => a + rand() * (b - a);

  const take = k => {
    const u = used[k] || 0;
    if (u >= limits[k]) { skipped[k] = (skipped[k] || 0) + 1; return false; }
    used[k] = u + 1; return true;
  };
  const decal = (x, y, r, col, a) => { if (take('decal') && hooks.decal) hooks.decal(x, y, r, col, a); };
  const crater = (x, y, R) => { if (take('decal') && hooks.crater) hooks.crater(x, y, R); };
  // Detailstufe: ausgelassene Partikel bekommen SINK (wird beschrieben, aber nie gezeichnet), damit die
  // Schleifen der Erzeuger weiterlaufen; null heißt weiterhin "Deckel voll".
  let lod = 0, thin = false, lodSkipped = 0;
  const SINK = {};
  const add = (k, x, y, life, r, col = 0xffffff) => {
    if (lod > 0 && !LOD_KEEP.has(k)) {
      if (LOD_OFF.has(k)) { lodSkipped++; return SINK; }
      thin = !thin;
      if (thin) { lodSkipped++; return SINK; }
    }
    const p = store.spawn(k, x, y, life);
    if (p) { p.r = r; p.col = col; }
    return p;
  };
  function dots(x, y, n, s, life, r0, r1, col) {
    for (let i = 0; i < n; i++) {
      const p = add('dot', x, y, life, rnd(r0, r1), col); if (!p) return;
      p.vx = rnd(-s, s); p.vy = rnd(-s, s); p.drag = DRAG;
    }
  }
  // Rauchwolke: steigt genau SMOKE.rise px/s und treibt SMOKE.wind px/s nach rechts
  function puff(k, x, y, life, r) {
    const P = k === 'smoke' ? SMOKE : DUST, p = add(k, x, y, life, r, k === 'smoke' ? SMOKE_COLS[(rand() * 3) | 0] : 0xcdc6b4);
    if (!p) return;
    p.vx = P.wind; p.vy = -P.rise; p.rot = rand() * TAU; p.vrot = rnd(-.4, .4);
  }

  // Rauchfaden (brennende Einheit) bzw. Dampf (gelöscht): steigt WISP.rise px/s
  function wisp(x, y, r, col) {
    const p = add('wisp', x, y, WISP.life * rnd(.8, 1.15), r, col); if (!p) return;
    p.vx = WISP.wind + rnd(-4, 4); p.vy = -WISP.rise * rnd(.8, 1.2); p.rot = rand() * TAU; p.vrot = rnd(-.6, .6);
  }
  // Dampfwölkchen (gelöschter Brand, Leiche in Lava)
  function steam(x, y) { for (let i = 0; i < 3; i++) wisp(x + rnd(-4, 4), y - rnd(2, 8), rnd(2.5, 4), 0xe3e8ee); }

  // Flammenstrahl eines Atemstoßes: Mündung (e.x, e.y − z; beim Boss-Drachen das gezeichnete Maul, muzzle.js)
  // → Ziel (tx, ty − tz), ohne Ziel 90 px voraus am Boden
  function jet(e) {
    const z = e.z || 0, sx = e.x, sy = e.y - z, face = e.face < 0 ? -1 : 1;
    const hasT = Number.isFinite(e.tx) && Number.isFinite(e.ty);
    const gx = hasT ? e.tx : e.x + (e.nx ?? face) * 90, gy = hasT ? e.ty : e.y + (e.ny || 0) * 90;
    const ex = gx, ey = gy - (hasT ? e.tz || 0 : 0);
    let L = Math.hypot(ex - sx, ey - sy); L = L < 40 ? 40 : L > 150 ? 150 : L;
    const ang = Math.atan2(ey - sy, ex - sx), ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i < JET_N; i++) {
      const life = rnd(.38, .55), reach = (1 - Math.exp(-JET_DRAG * life)) / JET_DRAG;
      const s = L * rnd(.7, 1.12) / reach, a = ang + (rand() + rand() - 1) * JET_SPREAD;
      const p = add('jet', sx + rnd(-2, 2), sy + rnd(-2, 2), life, rnd(3, 5.5)); if (!p) return;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.drag = JET_DRAG; p.rot = rand() * TAU;
    }
    for (let i = 0; i < JET_SPARKS; i++) {
      const life = rnd(.3, .6), s = L * rnd(1.4, 2.4), a = ang + (rand() + rand() - 1) * JET_SPREAD * 1.5;
      const p = add('spark', sx + ca * L * rnd(0, .5), sy + sa * L * rnd(0, .5), life, rnd(.9, 1.6)); if (!p) return;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 30; p.ay = 160; p.drag = 1.5;
    }
    for (let i = 0; i < JET_HAZE; i++) {
      const f = rnd(.3, .75), p = add('haze', sx + ca * L * f, sy + sa * L * f - 6, .35, L * rnd(.14, .2)); if (!p) return;
      p.vx = ca * 20; p.vy = sa * 20 - 14; p.rot = rand() * TAU;
    }
    if (rand() < .5) puff('smoke', ex + rnd(-6, 6), ey - rnd(0, 8), SMOKE.life * .5, rnd(4, 6));
    if (lightLive < LIGHT_LIVE_MAX && add('light', gx + rnd(-6, 6), gy + rnd(-4, 4), LIGHT_T, 34)) lightLive++;
  }

  // Brennende Einheit für dt: Flammen auf dem Körper (Bildschirm y − z), die mit ihr ziehen und steigen
  function burnFx(u, dt) {
    const r = u.T.r, bx = u.x, by = u.y - u.z;
    const vx = ((u.mx || 0) + (u.vx || 0)) * .8, vy = ((u.my || 0) + (u.vy || 0)) * .8;
    for (let n = dt * (FLAME_RATE + FLAME_RATE_R * r); n > 0; n -= 1) {
      if (n < 1 && rand() >= n) break;
      const p = add('flame', bx + rnd(-.6, .6) * r, by + rnd(-.9, .3) * r, rnd(.3, .5), rnd(.35, .55) * (r > 4 ? r : 4));
      if (!p) return;
      p.vx = vx + rnd(-8, 8); p.vy = vy - rnd(28, 50); p.drag = 1;
    }
    if (rand() < dt * WISP_RATE) wisp(bx + rnd(-.3, .3) * r, by - r * .9, rnd(1.6, 2.6) * (r > 9 ? r / 9 : 1), SMOKE_COLS[(rand() * 3) | 0]);
  }

  // Häufigkeit rate je s für dt: ganze Anzahl plus Zufallsrest
  const count = (rate, dt) => { const n = rate * dt, k = n | 0; return k + (rand() < n - k ? 1 : 0); };
  function bossFx(u, dt) {
    const r = u.T.r * (BOSS_VIS[u.type] || 1), face = u.face < 0 ? -1 : 1;
    if (u.type === 'panzer') {
      // Ramme (abilities.js): Staub an den Ketten, solange sie läuft
      if (u.abOn) for (let n = count(ABILITY_FX.ramDust, dt); n > 0; n--) puff('dust', u.x - face * r * rnd(.4, 1.1), u.y + r * rnd(.3, .6), DUST.life * .8, rnd(3, 5));
      const moving = Math.abs(u.mx || 0) + Math.abs(u.my || 0) > 1;
      let st = drive.get(u);
      if (st === undefined) st = -1;   // zuerst gesehen (Aufstellen): gilt als stehend, das erste Losfahren pufft
      const start = moving && st < 0;   // fährt gerade an: sofort EXHAUST_BURST Wölkchen, dann EXHAUST_RATE je s
      st = !moving ? -1 : start ? EXHAUST_T : Math.max(0, st - dt);
      drive.set(u, st);
      if (st > 0) for (let n = count(EXHAUST_RATE, dt) + (start ? EXHAUST_BURST : 0); n > 0; n--) {
        const p = add('exhaust', u.x - face * r * 1.42 + rnd(-2, 2), u.y - u.z - r * .14 + rnd(-1.5, 1.5), EXHAUST.life * rnd(.8, 1.2), rnd(2.2, 3.4), SMOKE_COLS[(rand() * 3) | 0] - 0x1a1a1a);
        if (!p) return;
        p.vx = -face * rnd(18, 32); p.vy = -rnd(10, 22); p.drag = 1.5; p.rot = rand() * TAU; p.vrot = rnd(-.6, .6);
      }
      return;
    }
    const heli = u.type === 'heli';
    if (!(u.z > 1) || (heli && u.z >= WASH_Z) || (!heli && u.z >= WASH_Z * 1.5)) return;
    const gy = u.y + r * 1.05;
    for (let n = count(heli ? WASH_RATE : GUST_RATE, dt); n > 0; n--) {
      const a = rand() * TAU, d = r * rnd(.55, 1.05), s = rnd(28, 50);
      const p = add('wash', u.x + Math.cos(a) * d, gy + Math.sin(a) * d * .35, WASH.life * rnd(.8, 1.2), rnd(2.5, 4), 0xd8d0bc);
      if (!p) return;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s * .35; p.drag = 2.2; p.rot = rand() * TAU; p.vrot = rnd(-.5, .5);
    }
  }

  // Explosion: Bodenlicht, heller Kern, Glut (Feuer: Flammen), Rauch, Krater, Wackeln
  function explosion(key, x, y, R, fire, smokeLife) {
    shake = Math.max(shake, blastShake(R));
    crater(x, y, R);
    if (!take(key)) return;
    if (lightLive < LIGHT_LIVE_MAX && add('light', x, y, LIGHT_T, LIGHT_RMUL * R)) lightLive++;
    add('core', x, y, .14, Math.max(4, R * .4));
    const n = emberCount(R);
    for (let i = 0; i < n; i++) {
      const a = rand() * TAU, s = rnd(30, 170) * (.7 + Math.min(R, 120) / 200);
      const p = add(fire ? 'fire' : 'ember', x, y, rnd(.3, .6), rnd(3, 7)); if (!p) break;
      p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.drag = DRAG;
    }
    const ns = fire ? 3 : 6;
    for (let i = 0; i < ns; i++) {
      const a = (i / ns) * TAU + rnd(-.4, .4), d = rnd(.1, .45) * R;
      puff('smoke', x + Math.cos(a) * d, y + Math.sin(a) * d * .6, smokeLife, Math.max(5, rnd(.28, .42) * R));
    }
  }

  // Effekt einer Fähigkeit (siehe ABILITY_FX)
  function wave(x, y, R, life, col) { add('wave', x, y, life, R, col); }
  // Vampir und Ghul (vamp-Ereignis, abilities.js; siehe VAMP_FX)
  function vamp(e) {
    const x = e.x, y = e.y - (e.z || 0), F = VAMP_FX;
    switch (e.k) {
      case 'bat':
        for (let i = 0; i < F.batWisps; i++) wisp(x + rnd(-7, 7), y - rnd(2, 14), rnd(3, 4.5), F.batSmoke);
        for (let i = 0; i < F.batBits; i++) {
          const a = rand() * TAU, s = rnd(40, 90), p = add('dot', x, y - 8, rnd(.3, .5), rnd(1.2, 2), F.batDark); if (!p) break;
          p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s * .7 - 20; p.drag = 3;
        }
        break;
      case 'rise':
        decal(x, e.y + 4, 9, F.riseSoil, .16);
        for (let i = 0; i < F.riseClods; i++) {
          const p = add('dot', x + rnd(-6, 6), e.y + rnd(-2, 3), rnd(.4, .6), rnd(1.3, 2.3), i % 2 ? F.riseClod : 0x5e5242); if (!p) break;
          p.vx = rnd(-35, 35); p.vy = -rnd(60, 120); p.ay = 380;
        }
        for (let i = 0; i < F.riseWisps; i++) wisp(x + rnd(-6, 6), e.y - rnd(0, 8), rnd(2.6, 3.8), F.riseMist);
        break;
      case 'crumble':
        for (let i = 0; i < F.dust; i++) puff('dust', x + rnd(-6, 6), y + rnd(-6, 4), DUST.life * rnd(.9, 1.2), rnd(3.5, 5.5));
        for (let i = 0; i < F.bits; i++) {
          const p = add('dot', x + rnd(-5, 5), y - rnd(2, 12), rnd(.4, .6), rnd(1.2, 2), F.bitCol); if (!p) break;
          p.vx = rnd(-25, 25); p.vy = -rnd(10, 40); p.ay = 300;
        }
        break;
    }
  }
  // Kreaturen (creature-Ereignis, Task 6; siehe CREATURE_FX)
  function creature(e) {
    const x = e.x, y = e.y - (e.z || 0), F = CREATURE_FX, R = e.R > 0 ? e.R : 30;
    switch (e.k) {
      case 'boulder':
        crater(x, e.y, R * .8);
        wave(x, e.y, R * 1.2, .45, 0xb8a98a);
        for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + rnd(-.3, .3), d = R * rnd(.35, .8); puff('dust', x + Math.cos(a) * d, e.y + Math.sin(a) * d * .6, DUST.life, rnd(4.5, 7)); }
        for (let i = 0; i < 6; i++) {
          const a = rand() * TAU, s = rnd(50, 120), p = add('dot', x, e.y - 3, rnd(.35, .55), rnd(1.3, 2.4), i % 2 ? F.rock : F.rockDark); if (!p) break;
          p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s * .5 - rnd(60, 110); p.ay = 420;
        }
        break;
      case 'frog': case 'unfrog':
        for (let i = 0; i < 5; i++) wisp(x + rnd(-7, 7), y - rnd(0, 12), rnd(3, 4.5), F.frogPuff);
        add('ring', x, y - 4, .35, 14, F.hex);
        for (let i = 0; i < 6; i++) {
          const a = rand() * TAU, s = rnd(30, 70), p = add('spark', x, y - 6, rnd(.3, .5), rnd(.9, 1.4)); if (!p) break;
          p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 20; p.drag = 2;
        }
        break;
      case 'curse': {
        const tx = e.tx, ty = e.ty - (e.tz || 0);
        if (Number.isFinite(tx) && Number.isFinite(ty)) {
          seg('gust', x, y, tx, ty, 2.2, .35, F.hex);
          for (let i = 0; i < 5; i++) { const q = rand(), p = add('dot', x + (tx - x) * q, y + (ty - y) * q, rnd(.3, .5), rnd(1, 1.8), F.hex); if (!p) break; p.vy = -rnd(10, 30); }
        }
        add('ring', x, y, .3, 9, F.hexDark);
        break;
      }
      case 'hexhit':
        for (let i = 0; i < 4; i++) {
          const a = rand() * TAU, s = rnd(30, 60), p = add('dot', x, y - 4, rnd(.25, .4), rnd(1, 1.7), i % 2 ? F.hex : F.hexDark); if (!p) break;
          p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.drag = 3;
        }
        break;
      case 'ash':
        decal(x, e.y + 3, 9, F.scorch, .16);
        for (let i = 0; i < 8; i++) { const p = add('flame', x + rnd(-6, 6), y + rnd(-6, 4), rnd(.3, .5), rnd(2.5, 4)); if (!p) break; p.vx = rnd(-20, 20); p.vy = -rnd(30, 60); p.drag = 1.5; }
        for (let i = 0; i < 6; i++) { const a = rand() * TAU, s = rnd(30, 80), p = add('ember', x, y, rnd(.4, .7), rnd(1.5, 2.5)); if (!p) break; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 20; p.ay = 120; }
        for (let i = 0; i < 2; i++) puff('smoke', x + rnd(-4, 4), y - rnd(0, 6), SMOKE.life * .5, rnd(4, 6));
        break;
      case 'rise':
        wave(x, e.y, 34, .45, 0xff8a3d);
        for (let i = 0; i < 12; i++) { const p = add('flame', x + rnd(-8, 8), e.y - rnd(0, 6), rnd(.35, .6), rnd(3, 5)); if (!p) break; p.vx = rnd(-25, 25); p.vy = -rnd(60, 120); p.drag = 1.2; }
        for (let i = 0; i < 8; i++) { const a = rand() * TAU, s = rnd(60, 120), p = add('spark', x, e.y - 8, rnd(.3, .6), rnd(1, 1.6)); if (!p) break; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 50; p.ay = 160; p.drag = 1.5; }
        if (lightLive < LIGHT_LIVE_MAX && add('light', x, e.y, LIGHT_T, 40)) lightLive++;
        break;
      case 'trail':
        decal(x + rnd(-3, 3), e.y + rnd(-2, 2), 5, F.scorch, .08);
        for (let i = 0; i < 3; i++) { const p = add('flame', x + rnd(-6, 6), e.y + rnd(-3, 3), rnd(.3, .5), rnd(2, 3.2)); if (!p) break; p.vy = -rnd(20, 40); p.drag = 1; }
        { const p = add('ember', x, y + 4, rnd(.3, .5), rnd(1.3, 2)); if (p) { p.vx = rnd(-15, 15); p.vy = rnd(10, 30); p.ay = 60; } }
        break;
      case 'aura':
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU + rnd(-.3, .3), d = R * rnd(.25, .6);
          const p = add('dot', x + Math.cos(a) * d, e.y + Math.sin(a) * d * .6 - 6, rnd(.5, .8), rnd(1.2, 1.8), F.rainbow[i % 6]); if (!p) break;
          p.vy = -rnd(16, 30);
        }
        break;
    }
  }
  function ability(e) {
    const z = e.z || 0, x = e.x, y = e.y - z, R = e.R > 0 ? e.R : 30;
    switch (e.k) {
      case 'heal':
        wave(x, e.y, R, ABILITY_FX.waveT, WAVE_COL.heal);
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * TAU + rnd(-.3, .3), d = R * rnd(.35, .7);
          const p = add('plus', x + Math.cos(a) * d, e.y + Math.sin(a) * d * .6 - 6, rnd(.5, .75), rnd(3.5, 5)); if (!p) break;
          p.vy = -rnd(22, 34);
        }
        break;
      case 'roar':
        wave(x, e.y, R, .4, WAVE_COL.roar);
        for (let i = 0; i < ABILITY_FX.shouts; i++) {
          const a = i / ABILITY_FX.shouts * TAU + rnd(-.15, .15), s = rnd(110, 150);
          const p = add('shout', x + Math.cos(a) * 16, y - 8 + Math.sin(a) * 12, .35, 5, OUTLINE); if (!p) break;
          p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s * .7; p.drag = 3; p.rot = Math.atan2(Math.sin(a) * .7, Math.cos(a));
        }
        break;
      case 'howl': {
        wave(x, e.y, R, .6, WAVE_COL.howl);
        const face = e.face < 0 ? -1 : 1;
        for (let i = 0; i < ABILITY_FX.notes; i++) {
          const p = add('note', x + face * rnd(4, 10), y - 4 - i * 5, rnd(.8, .95), rnd(5, 6.5), OUTLINE); if (!p) break;
          p.vx = face * rnd(10, 22); p.vy = -rnd(28, 40); p.rot = rand() * TAU;
        }
        break;
      }
      case 'spook':
        wave(x, y, Math.max(18, R * 2.6), .45, WAVE_COL.spook);
        for (let i = 0; i < 3; i++) wisp(x + rnd(-6, 6), y - rnd(0, 8), rnd(2.5, 3.5), 0xdde3f0);
        break;
      case 'ram': {
        add('ring', x, e.y, .3, Math.max(16, R * 1.2), OUTLINE);
        const nx = e.nx || 0, ny = e.ny || 0;
        for (let i = 0; i < 4; i++) puff('dust', x - nx * R * rnd(.8, 1.3) + rnd(-5, 5), e.y - ny * R + rnd(-3, 3), DUST.life, rnd(4, 6));
        break;
      }
      case 'dive':
        wave(x, e.y, R, ABILITY_FX.waveT, WAVE_COL.dive);
        for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + rnd(-.2, .2), d = R * rnd(.55, .9); puff('dust', x + Math.cos(a) * d, e.y + Math.sin(a) * d * .6, DUST.life, rnd(5, 8)); }
        break;
      default: animalFx(e, x, y, R);   // Task 5: Tiere
    }
  }
  /* --- Task 5: Tiere (abilities.js, Block "Task 5"), Budget-Art ability ---
     trample/stampede: Ring und Staubwolken hinter dem Ansturm (Richtung nx, ny); beat (Brustklopfen): braune Welle bis R
     und Rufstriche nach vorn; snap (Packen): heller Ring am Opfer und Spritzer; throw: Wirbelstriche am Abwurf; thrown:
     Staubring beim Aufprall; swoop: helle Striche beim Herabstoßen; swoopHit: Ring und Federstaub am Treffer. */
  function animalFx(e, x, y, R) {
    const nx = e.nx || 0, ny = e.ny || 0;
    switch (e.k) {
      case 'trample': case 'stampede': {
        add('ring', x, e.y, .3, Math.max(16, R * (e.k === 'trample' ? 1.3 : .6)), OUTLINE);
        const n = e.k === 'trample' ? 6 : 8, B = e.k === 'trample' ? R : 18;
        for (let i = 0; i < n; i++) puff('dust', x - nx * B * rnd(.6, 1.4) + rnd(-B * .5, B * .5), e.y - ny * B * rnd(.6, 1.2) + rnd(-4, 4), DUST.life, rnd(4, 7));
        break;
      }
      case 'beat': {
        wave(x, e.y, R, .45, WAVE_COL.roar);
        const face = e.face < 0 ? -1 : 1;
        for (let i = 0; i < 5; i++) {
          const a = (face > 0 ? 0 : Math.PI) + (i - 2) * .35, s = rnd(90, 120);
          const p = add('shout', x + Math.cos(a) * 12, y - 10 + Math.sin(a) * 8, .3, 4.5, OUTLINE); if (!p) break;
          p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s * .7; p.drag = 3; p.rot = Math.atan2(Math.sin(a) * .7, Math.cos(a));
        }
        break;
      }
      case 'snap':
        add('ring', x, e.y, .25, Math.max(10, R * 1.4), 0xf4f4f6);
        for (let i = 0; i < 4; i++) { const p = add('spark', x + rnd(-4, 4), y - 4, .35, rnd(1.5, 2.5), 0xbfe7f5); if (!p) break; p.vx = rnd(-40, 40); p.vy = -rnd(40, 80); p.ay = 300; }
        break;
      case 'throw':
        for (let i = 0; i < 3; i++) { const p = add('shout', x - nx * (8 + i * 6), y - 6 - ny * (8 + i * 6), .3, 4, OUTLINE); if (!p) break; p.rot = Math.atan2(ny, nx); }
        break;
      case 'thrown':
        add('ring', x, e.y, .3, R, OUTLINE);
        for (let i = 0; i < 6; i++) { const a = i / 6 * TAU, d = R * rnd(.4, .8); puff('dust', x + Math.cos(a) * d, e.y + Math.sin(a) * d * .6, DUST.life, rnd(3.5, 6)); }
        break;
      case 'swoop':
        for (let i = 0; i < 3; i++) { const p = add('shout', x + rnd(-6, 6), y - 4 + i * 4, .3, 5, 0xffffff); if (!p) break; p.vy = 40; p.rot = Math.PI / 2; }
        break;
      case 'swoopHit':
        add('ring', x, e.y, .25, Math.max(10, R * 1.5), OUTLINE);
        for (let i = 0; i < 4; i++) puff('dust', x + rnd(-6, 6), e.y + rnd(-3, 3), DUST.life * .7, rnd(3, 4.5));
        break;
    }
  }

  // Strich von (x0, y0) nach (x1, y1), Breite w px (Bildteil streak: halbe Länge ≈ r, Strichbreite 9/30 · r · sy)
  function seg(k, x0, y0, x1, y1, w, life, col) {
    const L = Math.hypot(x1 - x0, y1 - y0), r = Math.max(.5, L * .5);
    const p = add(k, (x0 + x1) / 2, (y0 + y1) / 2, life, r, col); if (!p) return null;
    p.rot = Math.atan2(y1 - y0, x1 - x0); p.sy = w * 30 / (9 * r);
    return p;
  }
  // Zickzack zwischen zwei Bildschirmpunkten (Gabel: dünner, weniger gezackt, ohne weitere Gabel)
  function zigzag(x0, y0, x1, y1, fork) {
    const S = SPELL_FX, L = Math.hypot(x1 - x0, y1 - y0);
    if (L < 1) return;
    const n = Math.max(2, Math.min(14, Math.round(L / S.BOLT_SEG))), nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
    const jag = Math.min(S.BOLT_JAG, L * .15) * (fork ? .6 : 1), w = fork ? .6 : 1;
    let px = x0, py = y0;
    for (let i = 1; i <= n; i++) {
      const f = i / n, o = i < n ? rnd(-1, 1) * jag : 0;
      const qx = x0 + (x1 - x0) * f + nx * o, qy = y0 + (y1 - y0) * f + ny * o;
      seg('bolt', px, py, qx, qy, S.BOLT_W * w, S.BOLT_LIFE, 0x2e64e8);
      seg('boltc', px, py, qx, qy, S.BOLT_CORE * w, S.BOLT_LIFE, 0xffffff);
      if (!fork && i > 1 && i < n && rand() < S.FORK_P * 2 / n) {
        const a = Math.atan2(y1 - y0, x1 - x0) + (rand() < .5 ? -1 : 1) * rnd(.5, 1), l = L * rnd(.15, .3);
        zigzag(qx, qy, qx + Math.cos(a) * l, qy + Math.sin(a) * l, true);
      }
      px = qx; py = qy;
    }
  }
  function spell(e) {
    switch (e.k) {
      case 'bolt': {
        const x1 = e.x1, y1 = e.y1 - (e.z1 || 0);
        zigzag(e.x0, e.y0 - (e.z0 || 0), x1, y1, false);
        add('flash', x1, y1, .1, 4.5);
        for (let i = 0; i < 5; i++) {
          const a = rand() * TAU, s = rnd(40, 110), p = add('zap', x1, y1, rnd(.15, .3), rnd(.8, 1.3)); if (!p) break;
          p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 20; p.drag = 3;
        }
        shake = Math.max(shake, 1.2);
        break;
      }
      case 'wind': {
        const nx = e.nx || 1, ny = e.ny || 0, base = Math.atan2(ny, nx), R = e.R > 0 ? e.R : WIND.R, half = WIND.ANGLE / 2;
        for (let i = 0; i < SPELL_FX.GUST_N; i++) {
          const a = base + rnd(-half, half), d0 = rnd(8, 26), s = rnd(1.6, 2.6) * R;
          const p = add('gust', e.x + Math.cos(a) * d0, e.y - 6 + Math.sin(a) * d0, rnd(.38, .5), rnd(6, 10), i % 3 ? 0x6f95ad : 0x9fbccd);
          if (!p) break;
          p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.drag = 3.2; p.rot = a; p.vrot = rnd(-.8, .8); p.sy = .5;
        }
        for (let i = 0; i < 4; i++) { const a = base + rnd(-half, half), d = R * rnd(.6, .95); puff('dust', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * .7, DUST.life, rnd(4, 6)); }
        break;
      }
      case 'wall': {
        const L = e.L || 30, n = 6;
        for (let i = 0; i < n; i++) {
          const s = (i / (n - 1) * 2 - 1) * L;
          puff('dust', e.x + e.px * s + rnd(-3, 3), e.y + e.py * s + rnd(-2, 2), DUST.life, rnd(4, 6.5));
          const p = add('dot', e.x + e.px * s, e.y + e.py * s - 4, rnd(.4, .6), rnd(1.4, 2.4), 0x8d929c); if (!p) break;
          p.vx = rnd(-30, 30); p.vy = -rnd(70, 130); p.ay = 420;
        }
        break;
      }
      case 'channel': wave(e.x, e.y, METEOR.R, .45, 0xe5574f); break;
      case 'meteor': {
        const R = e.R > 0 ? e.R : METEOR.R;
        wave(e.x, e.y, R * 1.4, .6, 0xb8a98a);
        decal(e.x, e.y, R * .55, ASH, .16);
        for (let i = 0; i < 14; i++) { const a = i / 14 * TAU + rnd(-.2, .2), d = R * rnd(.6, 1); puff('dust', e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * .6, DUST.life * 1.3, rnd(6, 9)); }
        for (let i = 0; i < 12; i++) {
          const a = rand() * TAU, s = rnd(80, 200), p = add('dot', e.x, e.y - 4, rnd(.5, .8), rnd(1.8, 3.2), i % 2 ? 0x5a4a44 : 0x8d929c); if (!p) break;
          p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s * .6 - rnd(120, 220); p.ay = 520;
        }
        for (let i = 0; i < 16; i++) {
          const a = rand() * TAU, s = rnd(120, 260), p = add('spark', e.x, e.y - 6, rnd(.4, .7), rnd(1.2, 1.8)); if (!p) break;
          p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s * .7 - 60; p.ay = 240; p.drag = 1.2;
        }
        break;
      }
      case 'fizzle':
        for (let i = 0; i < 3; i++) puff('smoke', e.x + rnd(-6, 6), e.y + rnd(-4, 4), SMOKE.life * .4, rnd(4, 6));
        for (let i = 0; i < 6; i++) { const p = add('mote', e.x + rnd(-6, 6), e.y, rnd(.4, .7), rnd(.8, 1.2)); if (!p) break; p.vx = rnd(-30, 30); p.vy = rnd(-10, 20); p.ay = 160; }
        break;
    }
  }

  // Meteor-Kanal eines Bilds (siehe SPELL_FX); per: je Bild neu gesetztes Teil mit Deckkraft a0
  function per(k, x, y, r, col, a0, dt) { const p = add(k, x, y, dt * PER_LIFE, r, col); if (p) { p.a0 = a0; p.hold = true; } return p; }
  function castFx(c, dt) {
    const S = SPELL_FX, M = METEOR, fall0 = M.CHANNEL - S.FALL, t = c.t, ramp = Math.min(1, t / .25);
    per('mark', c.x, c.y, M.R, 0xe5574f, .2 + .45 * Math.min(1, t / M.CHANNEL), dt);
    const beamA = ramp * (t < fall0 ? 1 : Math.max(0, 1 - (t - fall0) / (S.FALL * .5)));
    const m = c.m;
    for (let i = 0; i < m.length && i < M.MAX_M; i++) {
      const v = m[i];
      if (!v.alive || v.chanId !== c.id || beamA <= .01) continue;
      // Stabspitze (rig.js magier, angehoben um pose.CHANNEL_LIFT)
      const face = v.face < 0 ? -1 : 1, r = v.T.r, tx = v.x + face * r * 1.08, ty = v.y - (v.z || 0) - r * (1.32 + CHANNEL_LIFT);
      const b = seg('beam', tx, ty, c.sx, c.sy, S.BEAM_W, dt * PER_LIFE, 0x8a5cf0); if (b) { b.a0 = .6 * beamA; b.hold = true; }
      const bc = seg('beamc', tx, ty, c.sx, c.sy, S.BEAM_CORE, dt * PER_LIFE, 0xffffff); if (bc) { bc.a0 = .9 * beamA; bc.hold = true; }
      for (let n = count(S.MOTE_RATE, dt); n > 0; n--) {
        const life = rnd(.35, .5), p = add('mote', tx, ty, life, rnd(.9, 1.4)); if (!p) break;
        p.vx = (c.sx - tx) / life * rnd(.85, 1); p.vy = (c.sy - ty) / life * rnd(.85, 1);
      }
      per('orb', tx, ty, 2.4, 0xe6dcff, .9 * beamA, dt);
    }
    if (t < fall0) {
      // Feuerkugel am Sammelpunkt, wächst bis zum Fall
      per('orb', c.sx, c.sy, 4 + 8 * Math.min(1, t / fall0), 0xffd27a, ramp, dt);
      return;
    }
    // Fall: beschleunigt vom Sammelpunkt zum Ziel, Feuerschweif und Rauch
    const f = Math.min(1, (t - fall0) / S.FALL), e2 = f * f, hx = c.sx + (c.x - c.sx) * e2, hy = c.sy + (c.y - c.sy) * e2;
    // Schweif: zwei Striche zurück zum Sammelpunkt (orange breit, gelb schmal), dazu Flammen und Rauch
    const dl = Math.hypot(c.x - c.sx, c.y - c.sy) || 1, ux = (c.x - c.sx) / dl, uy = (c.y - c.sy) / dl, tl = S.TAIL_L * (.4 + .6 * f);
    const t1 = seg('mtrail', hx - ux * tl, hy - uy * tl, hx, hy, 11, dt * PER_LIFE, 0xff8a3d); if (t1) { t1.a0 = .55; t1.hold = true; }
    const t2 = seg('mtrail', hx - ux * tl * .7, hy - uy * tl * .7, hx, hy, 5, dt * PER_LIFE, 0xffe066); if (t2) { t2.a0 = .85; t2.hold = true; }
    for (let n = count(S.TAIL_RATE, dt); n > 0; n--) {
      const p = add('fire', hx + rnd(-5, 5), hy + rnd(-5, 5), rnd(.3, .5), rnd(4, 8)); if (!p) break;
      p.vx = rnd(-20, 20); p.vy = rnd(-30, 0); p.drag = DRAG;
    }
    if (rand() < dt * 30) puff('smoke', hx + rnd(-4, 4), hy + rnd(-4, 4), SMOKE.life * .5, rnd(4, 6));
    per('meteor', hx, hy, 13, 0xffc15a, 1, dt);
    per('mrock', hx + ux * 2, hy + uy * 2, 6, 0x5a4a44, 1, dt);
    per('mring', hx + ux * 2, hy + uy * 2, 6.3, OUTLINE, 1, dt);
  }

  function event(e) {
    switch (e.type) {
      case 'blast': {
        for (let i = 0; i < crashPts.length; i += 2) if (Math.abs(crashPts[i] - e.x) < 1 && Math.abs(crashPts[i + 1] - e.y) < 1) return;
        explosion('blast', e.x, e.y, e.R, e.kind === 'fire', SMOKE.life);
        return;
      }
      case 'crash': {
        // Heli: combat.crash zündet danach selbst einen blast am selben Ort; der zählt hier nicht noch einmal
        const R = e.kind === 'heli' ? HELI_CRASH_R : e.kind === 'drache' ? DRAGON_CRASH_R : 40;
        if (crashPts.length < 16) crashPts.push(e.x, e.y);
        if (!take('crash')) { shake = Math.max(shake, blastShake(R)); return; }
        explosion('blast', e.x, e.y, R, false, SMOKE.life * CRASH_SMOKE_MUL);
        dots(e.x, e.y, 10, 90, .6, 2, 4, 0x9aa0aa);
        return;
      }
      case 'shot': {
        if (e.kind === 'breath') { if (take('jet')) jet(e); break; }
        if (e.kind !== 'bullet' && e.kind !== 'shell' && e.kind !== 'rocket') break;
        if (!take('shot')) break;
        // Flieger schießen aus ihrer Höhe (wie pose.projScreen am Start der Bahn)
        const y = e.y - ((e.z || 0) > MUZZLE_Z ? e.z - MUZZLE_Z : 0), face = e.face < 0 ? -1 : 1;
        add('flash', e.x + face * 3, y, .07, e.kind === 'shell' ? 7 : 3.5);
        if (e.kind === 'shell') for (let i = 0; i < 3; i++) puff('smoke', e.x + face * rnd(5, 12), y + rnd(-3, 3), SMOKE.life * .5, rnd(4, 6));
        break;
      }
      case 'land': {
        const d = landDust(e.impact, LD);
        if (!d.n || !take('land')) break;
        for (let i = 0; i < d.n; i++) puff('dust', e.x + rnd(-1, 1) * d.r * 1.2, e.y + rnd(-.3, .5) * d.r, DUST.life * rnd(.8, 1.1), d.r * rnd(.7, 1.1));
        break;
      }
      case 'splash': {
        if (!take('splash')) break;
        for (let i = 0; i < 10; i++) {
          const p = add('drop', e.x, e.y, rnd(.35, .55), rnd(1.4, 2.6), WATER); if (!p) break;
          const a = rnd(-.9, .9);
          p.vx = Math.sin(a) * rnd(40, 90); p.vy = -rnd(70, 150); p.ay = 420;
        }
        add('ring', e.x, e.y, .4, 14, WATER);
        break;
      }
      case 'terrain':
        // Asche einer in Lava versunkenen Leiche: dunkler Fleck und Zischen (Dampfwölkchen wie bei extinguish,
        // Ton über audio.eventSound); andere terrain-Ereignisse gehen ans Gelände
        if (e.kind === 'ash') {
          decal(e.x, e.y, 9, ASH, .14);
          if (take('misc')) steam(e.x, e.y);
        }
        break;
      case 'death': {
        const T = UNITS[e.unitType]; if (!T) break;
        // aufgestanden als Ghul oder zerfallen (vamp-Ereignis zeigt das): kein Seelchen, kein Fleck
        if (e.ghoul || e.crumble) break;
        if (!take('death')) break;
        const y = e.y - (e.z || 0);   // Flieger sterben in ihrer Höhe
        decal(e.x, e.y + T.r * .7, T.r * 1.1, shade(T.col, -.25), .13);
        dots(e.x, y, 5, 60, .5, 1.5, 3.5, colorNum(T.col));
        const p = add('soul', e.x, y - T.r, 1.3, Math.min(9, T.r * .7 + 2));
        if (p) { p.vx = rnd(-8, 8); p.vy = -28; }
        break;
      }
      case 'hit':
        if (e.flank && take('misc')) { const p = add('dot', e.x, e.y - 10, .35, 2.6, 0xffb800); if (p) { p.vx = rnd(-20, 20); p.vy = -40; p.drag = DRAG; } }
        break;
      case 'block': {
        if (!take('misc')) break;
        const a = e.a || 0, ca = Math.cos(a), sa = Math.sin(a);
        const g = add('glint', e.x, e.y, .14, 4.5); if (g) g.rot = a + Math.PI / 2;
        for (let i = 0; i < BLOCK_FX.sparks; i++) {
          const b = a + rnd(-.6, .6), s = rnd(BLOCK_FX.sparkV[0], BLOCK_FX.sparkV[1]);
          const p = add('spark', e.x, e.y, rnd(.15, .28), rnd(.9, 1.3)); if (!p) break;
          p.vx = Math.cos(b) * s; p.vy = Math.sin(b) * s - 30; p.ay = 220; p.drag = 2;
        }
        const s = rnd(BLOCK_FX.shardV[0], BLOCK_FX.shardV[1]);
        const p = add('shard', e.x, e.y, .45, 2.4, SHARD_COL[e.kind] || SHARD_COL.arrow);
        if (p) { p.vx = ca * s; p.vy = sa * s - BLOCK_FX.shardUp; p.ay = 380; p.drag = 1; p.rot = a; p.vrot = (rand() < .5 ? -1 : 1) * rnd(10, 18); }
        break;
      }
      case 'charge': if (take('misc')) add('ring', e.x, e.y, .25, 16, OUTLINE); break;
      case 'spell': if (take('spell')) spell(e); break;
      case 'ability': if (take('ability')) ability(e); break;
      case 'vamp': if (take('ability')) vamp(e); break;
      case 'creature': if (take('ability')) creature(e); break;   // Task 6
      case 'fear': if (take('misc')) { const p = add('bang', e.x + rnd(-2, 2), e.y - (e.z || 0) - 10, .7, 7, 0xe5574f); if (p) p.vy = -14; } break;
      case 'heal': if (take('misc')) { const p = add('plus', e.x + rnd(-4, 4), e.y, .7, 5); if (p) p.vy = -30; } break;
      case 'miss':
        if (!take('misc')) break;
        if (e.kind === 'arrow' || e.kind === 'firearrow') {
          const p = add('arrow', e.x, e.y, 2.5, 8); if (p) p.rot = e.a || 0;
          // Brandpfeil: kurzes Flämmchen an der Einschlagstelle
          if (e.kind === 'firearrow') for (let i = 0; i < 2; i++) { const f = add('flame', e.x + rnd(-2, 2), e.y - rnd(0, 3), rnd(.3, .45), rnd(1.8, 2.6)); if (f) { f.vy = -rnd(20, 35); f.drag = 1; } }
        }
        // Speer: steckt schräg im Boden (Spitze nach unten, Schaft zeigt zurück zum Werfer)
        else if (e.kind === 'pilum') { const p = add('pilum', e.x, e.y, 2.5, 8), a = e.a || 0; if (p) p.rot = Math.atan2(Math.abs(Math.sin(a)) * .5 + .6, Math.cos(a)); }
        else dots(e.x, e.y, 1, 20, .25, 1.5, 1.5, 0xb8a98a);
        break;
      case 'ignite': {
        // Stichflamme beim Anzünden
        if (!take('ignite')) break;
        const y = e.y - (e.z || 0);
        for (let i = 0; i < 4; i++) {
          const p = add('flame', e.x + rnd(-4, 4), y + rnd(-4, 2), rnd(.25, .4), rnd(2.5, 4)); if (!p) break;
          p.vx = rnd(-30, 30); p.vy = -rnd(40, 80); p.drag = 2;
        }
        break;
      }
      case 'extinguish':
        // Dampfwölkchen
        if (take('misc')) steam(e.x, e.y);
        break;
      case 'burn': if (take('misc')) { const p = add('fire', e.x + rnd(-4, 4), e.y, .4, 3); if (p) p.vy = -40; } break;
      // Gift der Bienen (combat.poison): grüne Wölkchen beim Vergiften
      case 'poison': if (take('misc')) { const y = e.y - (e.z || 0); for (let i = 0; i < 3; i++) wisp(e.x + rnd(-4, 4), y - rnd(2, 10), rnd(2, 3.5), 0x7cc243); } break;
      case 'wallHit':
        if (e.broken && take('misc')) { dots(e.x, e.y, 3, 50, .5, 1.5, 3, 0x8d929c); puff('dust', e.x, e.y, DUST.life, 5); }
        break;
    }
    // übrige Ereignisse mit Wackeln (Granatschuss, schwerer Nahkampftreffer)
    if (e.shake && e.type !== 'blast') shake = Math.max(shake, e.shake);
  }
  const LD = {};

  function consume(events) {
    for (const k in used) used[k] = 0;
    crashPts.length = 0;
    for (let i = 0; i < events.length; i++) event(events[i]);
  }

  // Partikel altern lassen (Spielzeit dt); Flugspuren: Feuerbälle glühen, Raketen ziehen Rauch
  const TR = {};
  function update(dt, world) {
    if (world && dt > 0) {
      const proj = world.proj;
      for (let i = 0; i < proj.length; i++) {
        const p = proj[i];
        if (p.kind !== 'fire' && p.kind !== 'rocket' && p.kind !== 'firearrow') continue;
        projScreen(p, TR);
        if (p.kind === 'firearrow') {
          if (rand() < dt * 24) { const f = add('fire', TR.x, TR.y, .18, rnd(1.4, 2.2)); if (f) { f.vx = rnd(-8, 8); f.vy = -rnd(5, 15); f.drag = DRAG; } }
        } else if (p.kind === 'fire') {
          if (rand() < dt * 30) { const f = add('fire', TR.x, TR.y, .25, rnd(2, 4)); if (f) { f.vx = rnd(-15, 15); f.vy = rnd(-15, 15); f.drag = DRAG; } }
        } else if (rand() < dt * 36) puff('smoke', TR.x - Math.cos(TR.a) * 6, TR.y - Math.sin(TR.a) * 6, 1, rnd(2, 3.5));
      }
    }
    // Task 6: fliegende Hexenzauber ziehen grüne Funken
    if (world && dt > 0) {
      const proj = world.proj;
      for (let i = 0; i < proj.length; i++) {
        const p = proj[i];
        if (p.kind !== 'hex' || !(rand() < dt * CREATURE_FX.trailRate)) continue;
        projScreen(p, TR);
        const f = add('dot', TR.x + rnd(-1.5, 1.5), TR.y + rnd(-1.5, 1.5), .25, rnd(1, 1.6), CREATURE_FX.hex); if (f) { f.vy = -rnd(5, 15); f.drag = DRAG; }
      }
    }
    // Meteor-Kanäle (spells.js): Zielkreis, Strahlen, Kugel, fallender Meteor
    if (world && dt > 0 && world.casts) for (let k = 0; k < world.casts.length && k < SPELL_FX.CAST_FX_MAX; k++) castFx(world.casts[k], dt);
    // brennende Einheiten: höchstens BURN_FX_UNITS je Bild, reihum ab burnCursor
    if (world && dt > 0 && world.units) {
      const us = world.units, n = us.length;
      let done = 0, all = 0, next = 0;
      const i0 = n ? burnCursor % n : 0;
      for (let j = 0; j < n; j++) {
        const i = i0 + j < n ? i0 + j : i0 + j - n, u = us[i];
        if (!u.alive) continue;
        if (BOSS.has(u.type)) bossList.push(u);
        if (!(u.burnT > 0)) continue;
        all++;
        if (done >= BURN_FX_UNITS) continue;
        burnFx(u, dt); done++; next = i + 1;
      }
      burnCursor = all > done ? next : 0;
      burning = done; burningAll = all;
      // Bosse reihum, höchstens BOSS_FX_UNITS je Bild
      const nb = bossList.length, b0 = nb ? bossCursor % nb : 0;
      let bd = 0;
      for (let j = 0; j < nb && bd < BOSS_FX_UNITS; j++) { bossFx(bossList[b0 + j < nb ? b0 + j : b0 + j - nb], dt); bd++; }
      bossCursor = nb > bd ? b0 + bd : 0;
      bossDone = bd; bossAll = nb;
      bossList.length = 0;   // keine Verweise auf Einheiten festhalten
    }
    // ohne Welt (Pause, Planphase) bleiben die je Bild gesetzten Teile des Meteor-Kanals stehen
    if (dt > 0) store.step(dt, !world);
    let nl = 0;
    const live = store.live;
    for (let i = 0; i < live.length; i++) if (live[i].k === 'light') nl++;
    lightLive = nl;
  }

  function clear() { store.clear(); shake = 0; lightLive = 0; burnCursor = 0; burning = 0; burningAll = 0; bossCursor = 0; bossDone = 0; bossAll = 0; lodSkipped = 0; for (const k in skipped) delete skipped[k]; }

  return {
    store, consume, update, clear,
    get shake() { return shake; },
    set shake(v) { shake = v; },
    // Detailstufe 0..LOD_MAX (siehe oben)
    get lod() { return lod; },
    set lod(v) { lod = v > 0 ? Math.min(LOD_MAX, v | 0) : 0; },
    decay(dt) { shake = decayShake(shake, dt); },
    stats() { return { skipped: Object.assign({}, skipped), dropped: store.dropped, lights: lightLive, burning, burningAll, bosses: bossDone, bossesAll: bossAll, lodSkipped }; },
  };
}

const colNum = new Map();
function colorNum(s) {
  let v = colNum.get(s);
  if (v === undefined) { v = parseInt(String(s).slice(1), 16) || 0; colNum.set(s, v); }
  return v;
}
