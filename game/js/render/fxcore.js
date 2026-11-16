// Reine Effekt-Logik (Task 12): Ereignisse → Partikel und Decals, Partikel altern lassen, Aussehen je
// Partikel, Bildschirmwackeln. Kein DOM, kein PIXI; fx.js zeichnet die Partikel (ParticleContainer) und
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
import { projScreen } from './pose.js';

export const FX_CAP = 3000;
export const FRAME_LIMITS = { blast: 32, crash: 8, land: 24, splash: 24, death: 64, shot: 96, decal: 48, misc: 160 };

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

// Staub nach einer Landung: Anzahl und Größe nach Aufprallgeschwindigkeit (px/s), sanfte Landungen ohne
export const DUST_MIN_IMPACT = 60;
export function landDust(impact, out = {}) {
  if (!(impact >= DUST_MIN_IMPACT)) { out.n = 0; out.r = 0; return out; }
  out.n = Math.min(6, 1 + Math.floor((impact - DUST_MIN_IMPACT) / 80));
  out.r = Math.min(9, 2.5 + impact / 80);
  return out;
}
// Glut je Explosion: 14 bis 22, mit dem Radius mehr
export const emberCount = R => 14 + Math.min(8, Math.round((R > 0 ? R : 0) / 10));

/* ---------- Partikelspeicher ---------- */
// Lebende Partikel in live (Zeichenreihenfolge = Entstehung), tote zurück in den Vorrat: keine Allokation
// im laufenden Spiel. Über cap wird nicht mehr erzeugt (dropped zählt). Bewegung je dt: Dämpfung
// exp(−drag·dt), Beschleunigung ay (Tropfen fallen), Drehung vrot.
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
      p.age = 0; p.life = life; p.r = 1; p.col = 0xffffff; p.rot = 0; p.vrot = 0;
      live.push(p);
      return p;
    },
    step(dt) {
      let n = 0;
      for (let i = 0; i < live.length; i++) {
        const p = live[i];
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
export const F = { disc: 0, soft: 1, puff: 2, ring: 3, plus: 4, soul: 5, arrow: 6 };
export const GLOW_KINDS = new Set(['ember', 'fire', 'flash', 'core', 'light']);
const PL = {};
// Aussehen eines Partikels in out: normales Sprite (frame, x, y, r = Anzeigeradius, rot, tint, alpha,
// ax = Anker x) und das additive Glühen (gR, gTint, gAlpha; gLight: im Bodenlicht-Layer unter den Figuren).
// alpha 0 bzw. gAlpha 0: kein Sprite.
export function look(p, o) {
  const q = p.age / p.life, a = 1 - q;
  o.frame = F.disc; o.x = p.x; o.y = p.y; o.r = p.r; o.rot = p.rot; o.tint = p.col; o.alpha = a; o.ax = .5;
  o.gR = 0; o.gTint = 0xffffff; o.gAlpha = 0; o.gLight = false;
  switch (p.k) {
    case 'ember':
      o.r = p.r * (1.6 - a * .6); o.tint = a > .55 ? 0xffd84d : a > .3 ? 0xff8a3d : 0x9aa0aa;
      if (a > .3) { o.gR = p.r * 3; o.gTint = 0xff9a3d; o.gAlpha = (a - .3) / .7 * .6; }
      break;
    case 'fire':
      o.r = p.r * (.6 + a * .6); o.tint = a > .6 ? 0xffe066 : a > .3 ? 0xff8a3d : 0xe5574f;
      o.gR = p.r * 2.6; o.gTint = 0xff7a2a; o.gAlpha = a * .5;
      break;
    case 'flash':
      o.tint = 0xffe066; o.gR = p.r * 3.5; o.gTint = 0xffcf66; o.gAlpha = a * .9;
      break;
    case 'core':
      o.r = p.r * (1 + q * .5); o.tint = 0xffe27a; o.alpha = a * .9;
      o.gR = p.r * 2.6; o.gTint = 0xffb060; o.gAlpha = a * .7;
      break;
    case 'light':
      o.alpha = 0; o.gR = p.r; o.gTint = 0xffcf8a; o.gAlpha = groundLight(p.age); o.gLight = true;
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
    // 'dot', 'drop': Scheibe in p.col
  }
  return o;
}

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
  let shake = 0, lightLive = 0;
  const rnd = (a, b) => a + rand() * (b - a);

  const take = k => {
    const u = used[k] || 0;
    if (u >= limits[k]) { skipped[k] = (skipped[k] || 0) + 1; return false; }
    used[k] = u + 1; return true;
  };
  const decal = (x, y, r, col, a) => { if (take('decal') && hooks.decal) hooks.decal(x, y, r, col, a); };
  const crater = (x, y, R) => { if (take('decal') && hooks.crater) hooks.crater(x, y, R); };
  const add = (k, x, y, life, r, col = 0xffffff) => {
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
        if (e.kind !== 'breath' && e.kind !== 'bullet' && e.kind !== 'shell' && e.kind !== 'rocket') break;
        if (!take('shot')) break;
        // Flieger schießen aus ihrer Höhe (wie pose.projScreen am Start der Bahn)
        const y = e.y - ((e.z || 0) > MUZZLE_Z ? e.z - MUZZLE_Z : 0), face = e.face < 0 ? -1 : 1;
        if (e.kind === 'breath') {
          const by = e.y - (e.z || 0);
          for (let i = 0; i < 4; i++) {
            const a = Math.atan2(e.ny || 0, e.nx || face) + rnd(-.5, .5), s = rnd(140, 260);
            const p = add('fire', e.x, by, rnd(.3, .5), rnd(3, 6)); if (!p) break;
            p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.drag = DRAG;
          }
          break;
        }
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
        // Asche einer in Lava verbrannten Leiche: dunkler Fleck; andere terrain-Ereignisse gehen ans Gelände
        if (e.kind === 'ash') decal(e.x, e.y, 9, ASH, .14);
        break;
      case 'death': {
        const T = UNITS[e.unitType]; if (!T) break;
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
      case 'charge': if (take('misc')) add('ring', e.x, e.y, .25, 16, OUTLINE); break;
      case 'heal': if (take('misc')) { const p = add('plus', e.x + rnd(-4, 4), e.y, .7, 5); if (p) p.vy = -30; } break;
      case 'miss':
        if (!take('misc')) break;
        if (e.kind === 'arrow') { const p = add('arrow', e.x, e.y, 2.5, 8); if (p) p.rot = e.a || 0; }
        else dots(e.x, e.y, 1, 20, .25, 1.5, 1.5, 0xb8a98a);
        break;
      case 'burn': if (take('misc')) { const p = add('fire', e.x + rnd(-4, 4), e.y, .4, 3); if (p) p.vy = -40; } break;
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
        if (p.kind !== 'fire' && p.kind !== 'rocket') continue;
        projScreen(p, TR);
        if (p.kind === 'fire') {
          if (rand() < dt * 30) { const f = add('fire', TR.x, TR.y, .25, rnd(2, 4)); if (f) { f.vx = rnd(-15, 15); f.vy = rnd(-15, 15); f.drag = DRAG; } }
        } else if (rand() < dt * 36) puff('smoke', TR.x - Math.cos(TR.a) * 6, TR.y - Math.sin(TR.a) * 6, 1, rnd(2, 3.5));
      }
    }
    if (dt > 0) store.step(dt);
    let nl = 0;
    const live = store.live;
    for (let i = 0; i < live.length; i++) if (live[i].k === 'light') nl++;
    lightLive = nl;
  }

  function clear() { store.clear(); shake = 0; lightLive = 0; for (const k in skipped) delete skipped[k]; }

  return {
    store, consume, update, clear,
    get shake() { return shake; },
    set shake(v) { shake = v; },
    decay(dt) { shake = decayShake(shake, dt); },
    stats() { return { skipped: Object.assign({}, skipped), dropped: store.dropped, lights: lightLive }; },
  };
}

const colNum = new Map();
function colorNum(s) {
  let v = colNum.get(s);
  if (v === undefined) { v = parseInt(String(s).slice(1), 16) || 0; colNum.set(s, v); }
  return v;
}
