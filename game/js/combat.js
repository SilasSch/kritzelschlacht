// Reiner Kampf: KI, Waffen, Geschosse, Schaden/Rüstung, Explosionen, Mauertreffer.
// Port aus kritzelschlacht.html. Kein DOM, Zufall nur über world.rng(). Effekte und Töne
// werden als Ereignisse in world.events geschrieben.
import { CELL } from './data.js';
import { factionOf, cellIndex, query, nearestEnemy } from './world.js';

// Typen, die in Reihe marschieren bzw. vor Nahkämpfern zurückweichen
export const LINE = new Set(['krieger', 'ritter', 'soldat']);
export const KITE = new Set(['schuetze', 'soldat', 'sniper']);

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rnd = (world, a, b) => a + world.rng() * (b - a);
const emit = (world, e) => { world.events.push(e); };
const sound = (world, k) => { world.events.push({ type: 'sound', k }); };

// Geschossarten: [Grundflugzeit, Tempo, Bogenhöhe je Distanz, Streuung, Ton]
const SHOT = {
  arrow: [.25, 520, .16, 8, 'twang'],
  bomb: [.55, 450, .35, 14, 'throw'],
  fire: [0, 330, 0, 14, 'fire'],
  bullet: [0, 1100, 0, 5, 'shot'],
  rocket: [0, 520, 0, 6, 'whoosh'],
  shell: [0, 850, 0, 6, 'cannon'],
  mortar: [.9, 500, .55, 18, 'thump'],
};

/* ---------- Schaden ---------- */
export function hurt(world, v, a, kind, src) {
  if (!v.alive) return 0;
  let m = 1; const t = v.type;
  if (t === 'ritter') {
    m *= kind === 'arrow' ? .35 : kind === 'melee' ? .7 : kind === 'bullet' ? .8 : 1.5;
    if (v.wall && (kind === 'arrow' || kind === 'melee')) m *= .65;
  }
  if (t === 'panzer') m *= kind === 'bullet' ? .25 : kind === 'arrow' ? .2 : kind === 'melee' ? .7 : kind === 'rocket' ? 1.6 : kind === 'fire' ? .6 : .8;
  if (t === 'heli') m *= kind === 'rocket' ? 1.4 : kind === 'arrow' || kind === 'melee' ? .5 : 1;
  if (t === 'geist' && kind !== 'fire') m *= .5;
  // Wald gibt Bodentruppen Deckung gegen Fernkampf und Explosionen
  if (!v.T.fly && world.terr[cellIndex(world, v.x, v.y)] === 3 &&
      (kind === 'arrow' || kind === 'blast' || kind === 'bullet' || kind === 'rocket')) m *= .5;
  const d = a * m; v.hp -= d; v.hitT = .15;   // Treffer-Quetschen (rig.js)
  if (v.hp <= 0) { if (src) src.kills++; die(world, v, src); }
  return d;
}

function die(world, v, src) {
  v.alive = false; world.dead = (world.dead || 0) + 1;
  emit(world, {
    type: 'death', x: v.x, y: v.y, unitType: v.type, team: v.team,
    killerId: src ? src.id : null, killerType: src ? src.type : null,
    killerTeam: src ? src.team : null, killerKills: src ? src.kills : null,
  });
  sound(world, 'die');
}

// Rückstoß: wird in u.vx/u.vy gesammelt und in move() abgebaut
function knock(v, nx, ny, f) {
  if (v.type === 'drache' || v.type === 'panzer') f *= .15;
  else if (v.type === 'baer' || v.type === 'ritter') f *= .5;
  v.vx += nx * f; v.vy += ny * f;
}

export function blast(world, x, y, R, dmg, f, src, kind, wallMul) {
  query(world, x, y, R + 16, v => {
    if (factionOf(world, v) === f) return;
    const dx = v.x - x, dy = v.y - y, d = Math.hypot(dx, dy);
    if (d > R + v.T.r) return;
    hurt(world, v, dmg * (1 - .5 * Math.min(1, d / R)), kind, src);
    knock(v, dx / (d || 1), dy / (d || 1), 180);
  });
  if (wallMul) {
    const { GW, GH, terr } = world;
    const g0x = Math.max(0, (x - R) / CELL | 0), g1x = Math.min(GW - 1, (x + R) / CELL | 0);
    const g0y = Math.max(0, (y - R) / CELL | 0), g1y = Math.min(GH - 1, (y + R) / CELL | 0);
    let any = false;
    for (let gy = g0y; gy <= g1y; gy++) for (let gx = g0x; gx <= g1x; gx++) {
      const i = gy * GW + gx; if (terr[i] !== 4) continue;
      const cx = gx * CELL + 5, cy = gy * CELL + 5;
      if ((cx - x) ** 2 + (cy - y) ** 2 > R * R) continue;
      if (hitWall(world, i, dmg * wallMul, x, y, false)) any = true;
    }
    if (any) emit(world, { type: 'terrain', gx0: Math.max(0, g0x - 1), gy0: Math.max(0, g0y - 1), gx1: Math.min(GW - 1, g1x + 1), gy1: Math.min(GH - 1, g1y + 1) });
  }
  emit(world, { type: 'blast', x, y, R, kind, shake: kind === 'fire' ? 3 : 5 });
  sound(world, kind === 'fire' ? 'fire' : 'boom');
}

// Ab hier zeigt die Mauer Risse (Darstellung im Renderer)
export const WALL_CRACK_HP = 70;

// fromX/fromY: Herkunft des Treffers (Flugrichtung der Trümmer).
// Liefert true, wenn sich das Aussehen geändert hat (Risse ab WALL_CRACK_HP oder zerbrochen);
// nur dann gibt es ein terrain-Ereignis.
export function hitWall(world, i, d, fromX, fromY, emitTerrain = true) {
  const { GW, GH } = world;
  const before = world.whp[i];
  world.whp[i] -= d;
  const gx = i % GW, gy = i / GW | 0;
  let broken = false;
  if (world.whp[i] <= 0) { world.terr[i] = 0; world.towner[i] = 0; broken = true; }
  emit(world, { type: 'wallHit', i, x: gx * CELL + 5, y: gy * CELL + 5, fromX, fromY, broken });
  const changed = broken || (before >= WALL_CRACK_HP && world.whp[i] < WALL_CRACK_HP);
  if (changed && emitTerrain) emit(world, { type: 'terrain', gx0: Math.max(0, gx - 1), gy0: Math.max(0, gy - 1), gx1: Math.min(GW - 1, gx + 1), gy1: Math.min(GH - 1, gy + 1) });
  return changed;
}

/* ---------- Waffen ---------- */
export function fire(world, u, t, kind) {
  const T = u.T, K = SHOT[kind];
  const d = Math.hypot(t.x - u.x, t.y - u.y) || 1;
  const dur = K[0] + d / K[1], h = d * K[2];
  const px = t.x + t.mx * dur * .8, py = t.y + t.my * dur * .8, sp = K[3];
  const mx = u.x + u.face * T.r * (T.r > 15 ? 1.3 : .9), my = u.y - T.r * (T.fly ? .6 : .3);
  const x1 = px + rnd(world, -sp, sp), y1 = py + rnd(world, -sp, sp);
  u.fireT = 0;   // Rückstoß (rig.js)
  world.proj.push({ kind, x0: mx, y0: my, x1, y1, t: 0, dur, h, f: factionOf(world, u), src: u, dmg: T.dmg, R: T.splash || 0 });
  emit(world, { type: 'shot', kind, x: mx, y: my, face: u.face, tx: x1, ty: y1, shake: kind === 'shell' ? 2 : 0 });
  sound(world, K[4]);
}

// Drachenfeuer: Kegel vor dem Drachen
function breath(world, u, nx, ny) {
  const T = u.T, f = factionOf(world, u);
  u.fireT = 0;
  query(world, u.x, u.y, T.range + 30, v => {
    if (factionOf(world, v) === f) return;
    const dx = v.x - u.x, dy = v.y - u.y, d = Math.hypot(dx, dy);
    if (d > T.range + v.T.r) return;
    if ((dx * nx + dy * ny) / (d || 1) < .82) return;
    hurt(world, v, T.dmg, 'fire', u);
  });
  emit(world, { type: 'shot', kind: 'breath', x: u.x + nx * T.r, y: u.y - T.r * .6 + ny * T.r, face: u.face, nx, ny });
  sound(world, 'fire');
}

/* ---------- KI ---------- */
function groupInfo(world, u) {
  const R = u.type === 'wolf' ? 170 : u.type === 'biene' ? 60 : 70, f = factionOf(world, u);
  let cx = 0, cy = 0, n = 0;
  query(world, u.x, u.y, R, v => { if (v.type === u.type && factionOf(world, v) === f) { cx += v.x; cy += v.y; n++; } });
  u.gx = n ? cx / n : u.x; u.gy = n ? cy / n : u.y; u.gn = n; u.gt = .25 + world.rng() * .1;
}

function toward(u, px, py) { const x = px - u.x, y = py - u.y, l = Math.hypot(x, y) || 1; return [x / l, y / l]; }

export function think(world, u, dt) {
  const T = u.T;
  u.cd -= dt; u.rt -= dt; u.gt -= dt; if (u.st > 0) u.st -= dt; u.mx = 0; u.my = 0;
  // Animations-Timer für die Rigs (render/pose.js): seit dem Schuss, Rest von Schwung und Treffer
  if (u.fireT < 1) u.fireT += dt;
  u.swingT = u.swingT > dt ? u.swingT - dt : 0;
  u.hitT = u.hitT > dt ? u.hitT - dt : 0;
  if (u.gt <= 0) groupInfo(world, u);
  u.wall = u.type === 'ritter' && u.gn >= 3;
  if (T.heal) { healer(world, u, dt); return; }
  if (u.rt <= 0 || !u.tg || !u.tg.alive || factionOf(world, u.tg) === factionOf(world, u)) {
    u.tg = nearestEnemy(world, u); u.rt = .35 + world.rng() * .3;
  }
  const t = u.tg;
  if (!t) return;
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1, nx = dx / d, ny = dy / d;
  u.face = dx < 0 ? -1 : 1; u.fx = nx; u.fy = ny;
  const reach = T.range + T.r + t.T.r;
  // Reiter reiten nach dem Sturmangriff durch die Reihen und wenden dann
  if (u.type === 'reiter' && u.st > 0) { u.mx = u.cvx; u.my = u.cvy; u.face = u.cvx < 0 ? -1 : 1; return; }
  // Mörser halten Mindestabstand
  if (u.type === 'moerser' && d < 90) { u.mx = -nx * T.speed; u.my = -ny * T.speed; return; }
  if (d <= reach) {
    attack(world, u, t, d, dx, dy);
    if (KITE.has(u.type) && u.cd > .3 && d < T.range * .35 && t.T.range < 20 && !t.T.fly) { u.mx = -nx * T.speed * .5; u.my = -ny * T.speed * .5; }
    else if (u.type === 'drache' || u.type === 'heli') { const s = u.id % 2 ? 1 : -1; u.mx = -ny * s * T.speed * .5; u.my = nx * s * T.speed * .5; }
    return;
  }
  // Vor einer Mauer festgesteckt: draufhauen
  if (!T.fly && u.blk > .45 && world.terr[u.bcell] === 4) {
    if (u.cd <= 0) { u.cd = T.cd; u.swingT = .25; hitWall(world, u.bcell, (T.dmg || 8) * (T.splash ? 2.5 : 1.3), u.x, u.y); sound(world, 'hit'); }
    return;
  }
  let a = [nx, ny], sp = T.speed;
  switch (u.type) {
    case 'wolf':
      // Rudel: fächert sich um die Beute auf und greift von den Seiten und von hinten an
      if (u.gn >= 3 && d > 40) {
        const base = Math.atan2(u.gy - t.y, u.gx - t.x) + ((u.id % 5) - 2) * .55, R = Math.max(8, d * .45);
        a = toward(u, t.x + Math.cos(base) * R, t.y + Math.sin(base) * R);
      }
      break;
    case 'reiter':
      // Flankenritt: erst seitlich am Ziel vorbei, dann Sturmangriff
      if (d > 140) { const s = u.id % 2 ? 1 : -1, R = Math.min(130, d * .5); a = toward(u, t.x - ny * s * R, t.y + nx * s * R); }
      break;
    case 'biene': {
      // Schwarm: kreist ums Ziel, bleibt zusammen, schwirrt
      const s = u.id % 2 ? 1 : -1, o = d < 60 ? .45 : .3;
      const ax = nx - ny * s * o + (u.gx - u.x) * .01 + rnd(world, -.5, .5);
      const ay = ny + nx * s * o + (u.gy - u.y) * .01 + rnd(world, -.5, .5);
      const l = Math.hypot(ax, ay) || 1; a = [ax / l, ay / l]; break;
    }
    case 'krieger': case 'ritter': case 'geist': case 'baer':
      // Einkreisen: ist das Ziel schon umringt, sucht man sich einen freien Platz drumherum
      if (t.att > 3 && d < 130) {
        const g = Math.atan2(u.y - t.y, u.x - t.x) + ((u.id % 3) - 1) * .6, R = reach * .9;
        a = toward(u, t.x + Math.cos(g) * R, t.y + Math.sin(g) * R);
      }
      break;
  }
  // Reihe halten: wer vor der Gruppe läuft, wartet; wer hinterherhängt, schließt auf
  if (LINE.has(u.type) && u.gn >= 3 && d > reach + 20) { const depth = (u.x - u.gx) * nx + (u.y - u.gy) * ny; sp *= clamp(1 - depth / 45, .35, 1.3); }
  u.mx = a[0] * sp; u.my = a[1] * sp;
  u.run += dt;
}

export function attack(world, u, t, d, dx, dy) {
  const T = u.T; if (u.cd > 0) return;
  u.cd = T.cd * (.85 + world.rng() * .3);
  switch (u.type) {
    case 'schuetze': fire(world, u, t, 'arrow'); break;
    case 'grenadier': fire(world, u, t, 'bomb'); break;
    case 'magier': fire(world, u, t, 'fire'); break;
    case 'soldat': case 'mg': case 'sniper': case 'heli': fire(world, u, t, 'bullet'); break;
    case 'panzerfaust': fire(world, u, t, 'rocket'); break;
    case 'panzer': fire(world, u, t, 'shell'); break;
    case 'moerser': fire(world, u, t, 'mortar'); break;
    case 'drache': breath(world, u, dx / d, dy / d); break;
    case 'baer': {
      // Prankenhieb trifft mehrere
      const f = factionOf(world, u);
      query(world, t.x, t.y, T.splash + 20, v => {
        if (factionOf(world, v) === f) return;
        const ex = v.x - t.x, ey = v.y - t.y;
        if (ex * ex + ey * ey > (T.splash + v.T.r) ** 2) return;
        hurt(world, v, T.dmg * (.85 + world.rng() * .3), 'melee', u); knock(v, dx / d, dy / d, 140);
      });
      u.swingT = .25;
      emit(world, { type: 'hit', x: t.x, y: t.y, flank: false, kind: 'melee', shake: 2 });
      sound(world, 'thud'); break;
    }
    default: {
      u.swingT = .25;
      let a = T.dmg * (.85 + world.rng() * .3);
      // Treffer von hinten
      const flank = t.fx !== undefined && ((u.x - t.x) * t.fx + (u.y - t.y) * t.fy) / d < -.3;
      if (flank) a *= 1.35;
      // Sturmangriff der Reiter, danach Durchritt
      if (u.type === 'reiter' && u.run > .7) {
        a *= 2.6; knock(t, dx / d, dy / d, 260);
        emit(world, { type: 'charge', x: t.x, y: t.y });
        u.st = .6; u.cvx = dx / d * T.speed; u.cvy = dy / d * T.speed;
      }
      // Rudelbonus
      if (u.type === 'wolf') {
        let n = 0; query(world, u.x, u.y, 70, v => { if (v.type === 'wolf' && v.team === u.team && ++n >= 3) return true; });
        if (n >= 3) a *= 1.4;
      }
      const dealt = hurt(world, t, a, 'melee', u);
      if (u.type === 'geist') u.hp = Math.min(T.hp, u.hp + dealt);
      emit(world, { type: 'hit', x: t.x, y: t.y, flank, kind: 'melee' });
      sound(world, u.type === 'krieger' || u.type === 'ritter' ? 'clink' : 'hit');
    }
  }
  u.run = 0;
}

function healer(world, u, dt) {
  const T = u.T, f = factionOf(world, u);
  if (u.rt <= 0 || !u.tg || !u.tg.alive || u.tg.hp >= u.tg.T.hp || factionOf(world, u.tg) !== f) {
    let best = null, bd = Infinity;
    query(world, u.x, u.y, 380, v => {
      if (v === u || factionOf(world, v) !== f || v.hp >= v.T.hp || v.T.heal) return;
      const d = (v.x - u.x) ** 2 + (v.y - u.y) ** 2; if (d < bd) { bd = d; best = v; }
    });
    if (!best) {
      query(world, u.x, u.y, 420, v => {
        if (v === u || factionOf(world, v) !== f || v.T.heal) return;
        const d = (v.x - u.x) ** 2 + (v.y - u.y) ** 2; if (d < bd) { bd = d; best = v; }
      });
      u.follow = true;
    } else u.follow = false;
    u.tg = best; u.rt = .4 + world.rng() * .2;
  }
  // Sanitäter halten sich aus dem Getümmel heraus
  let ex = 0, ey = 0;
  query(world, u.x, u.y, 110, v => {
    if (factionOf(world, v) === f) return;
    const qx = u.x - v.x, qy = u.y - v.y, q = Math.hypot(qx, qy) || 1; ex += qx / q; ey += qy / q;
  });
  if (ex || ey) { const l = Math.hypot(ex, ey); u.mx = ex / l * T.speed; u.my = ey / l * T.speed; u.face = ex < 0 ? -1 : 1; return; }
  const t = u.tg; if (!t) return;
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy) || 1; u.face = dx < 0 ? -1 : 1;
  const want = u.follow ? 55 : T.range * .6;
  if (d > want) { u.mx = dx / d * T.speed; u.my = dy / d * T.speed; }
  if (!u.follow && d <= T.range && u.cd <= 0) {
    u.cd = T.cd;
    query(world, t.x, t.y, 50, v => {
      if (factionOf(world, v) !== f || v.hp >= v.T.hp) return;
      v.hp = Math.min(v.T.hp, v.hp + T.heal);
      emit(world, { type: 'heal', x: v.x, y: v.y - v.T.r });
    });
  }
}

/* ---------- Geschosse ---------- */
export function stepProjectiles(world, dt) {
  const proj = world.proj;
  for (let i = proj.length - 1; i >= 0; i--) {
    const p = proj[i]; p.t += dt;
    if (p.t < p.dur) continue;
    proj.splice(i, 1);
    const src = p.src.alive ? p.src : null;
    if (p.kind === 'arrow' || p.kind === 'bullet') {
      let best = null, bd = Infinity;
      query(world, p.x1, p.y1, 26, v => {
        if (factionOf(world, v) === p.f) return;
        const d = Math.hypot(v.x - p.x1, v.y - p.y1) - v.T.r; if (d < 8 && d < bd) { bd = d; best = v; }
      });
      if (best) {
        hurt(world, best, p.dmg * (.85 + world.rng() * .3), p.kind, src);
        emit(world, { type: 'hit', x: best.x, y: best.y, flank: false, kind: p.kind });
        sound(world, 'hit');
      } else emit(world, { type: 'miss', kind: p.kind, x: p.x1, y: p.y1, a: Math.atan2(p.y1 - p.y0, p.x1 - p.x0) });
    } else {
      const kind = p.kind === 'fire' ? 'fire' : p.kind === 'rocket' ? 'rocket' : 'blast';
      blast(world, p.x1, p.y1, p.R, p.dmg, p.f, src, kind, p.kind === 'fire' ? 1.5 : p.kind === 'rocket' ? 2 : 3);
    }
  }
}
