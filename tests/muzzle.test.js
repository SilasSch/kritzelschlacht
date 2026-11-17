// Mündungen der Boss-Sticker (Task 12c): Logik (combat.fire/breath über muzzle.js) und gezeichnete Pose
// (pose.drawnMuzzle aus poseUnit mit dem Gedächtnis des Renderers) liegen im Schuss-Moment beieinander.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, spawn, rebuildHash } from '../game/js/world.js';
import { attack } from '../game/js/combat.js';
import { poseUnit, bossMemory, drawnMuzzle, projScreen } from '../game/js/render/pose.js';
import { bossMuzzle, tipOffset, tankMgMuzzle, TANK_GEO, HELI_GEO, visR } from '../game/js/muzzle.js';
import { UNITS } from '../game/js/data.js';

const TOL = 2;
// MZ_LOG=1: Abstände ausgeben
const close = (a, b, msg) => {
  const d = Math.hypot(a.x - b.x, a.y - b.y);
  if (process.env.MZ_LOG) process.stderr.write(`MZ ${d.toFixed(3)} ${msg}\n`);
  assert.ok(d <= TOL, `${msg}: Logik (${a.x.toFixed(1)}, ${a.y.toFixed(1)}) gezeichnet (${b.x.toFixed(1)}, ${b.y.toFixed(1)})`);
};

// Einheit u (Boss) schießt auf t; vorher sah der Renderer sie (Gedächtnis), danach zeichnet er ein Bild.
// Liefert den Startpunkt des Schusses auf dem Bildschirm (Geschoss bzw. Flammenstrahl) und die gezeichnete Mündung.
function shoot(type, ux, uy, tx, ty, o = {}) {
  const w = createWorld(1600, 1000, 3);
  const u = spawn(w, type, ux, uy, 'blau'), t = spawn(w, o.tType || 'krieger', tx, ty, 'rot');
  Object.assign(u, o.u || {});
  rebuildHash(w);
  const dx = t.x - u.x, dy = t.y - u.y, d = Math.hypot(dx, dy);
  const mem = bossMemory(), pose = {};
  // Renderer sieht die Einheit erst mit einer anderen Blickrichtung (Turm muss sich umdrehen)
  const face0 = u.face;
  u.face = o.face0 ?? u.face; u.tg = o.tg0 || null;
  for (let k = 0; k < 20; k++) poseUnit(u, k / 60, pose, mem);
  u.face = dx < 0 ? -1 : 1; void face0; u.tg = t;   // wie think: Blick zum Ziel
  poseUnit(u, 20 / 60, pose, mem);                  // ein Bild mitten im Umdrehen
  u.cd = 0; w.events.length = 0; w.proj.length = 0;
  attack(w, u, t, d, dx, dy);
  let start;
  if (type === 'drache') {
    const e = w.events.find(v => v.type === 'shot' && v.kind === 'breath');
    start = { x: e.x, y: e.y - (e.z || 0) };
  } else {
    const p = w.proj[w.proj.length - 1]; p.t = 0;
    start = projScreen(p, {});
    const e = w.events.find(v => v.type === 'shot');
    const fy = e.y - ((e.z || 0) > 6 ? e.z - 6 : 0);   // Mündungsblitz (fxcore)
    close({ x: e.x, y: fy }, start, `${type} Blitz = Geschossstart`);
  }
  poseUnit(u, 21 / 60, pose, mem);                  // das Bild nach dem Schuss
  return { start, drawn: drawnMuzzle(u, pose, {}), u, pose };
}

test('Mündung: Panzergranate startet an der gezeichneten Rohrspitze (Seite, Rohrwinkel, Umdrehen)', () => {
  for (const [tx, ty, face0] of [[700, 300, 1], [700, 420, 1], [700, 160, -1], [200, 300, 1], [180, 460, 1], [260, 200, -1], [400, 520, 1]]) {
    const r = shoot('panzer', 400, 300, tx, ty, { face0, tg0: { x: 400 + face0 * 100, y: 300 } });
    close(r.start, r.drawn, `Panzer → (${tx}, ${ty})`);
    assert.equal(r.pose.turretFlip, tx === 400 ? r.u.face : Math.sign(tx - 400), 'Turm ganz umgedreht (genau darunter: Blickrichtung)');
  }
  // mit Treffer-Quetschen
  const r = shoot('panzer', 400, 300, 650, 380, { u: { hitT: .1 } });
  close(r.start, r.drawn, 'Panzer getroffen');
});

test('Mündung: Hubschrauber schießt aus der gezeichneten Kinnkanone, auch geneigt', () => {
  for (const [tx, ty, mx] of [[700, 300, 0], [150, 330, 0], [650, 200, UNITS.heli.speed], [200, 420, -UNITS.heli.speed]]) {
    const r = shoot('heli', 400, 300, tx, ty, { u: { mx } });
    close(r.start, r.drawn, `Heli → (${tx}, ${ty}) mx ${mx}`);
  }
  const r = shoot('heli', 400, 300, 700, 300, { u: { hitT: .1, mx: 60 } });
  close(r.start, r.drawn, 'Heli getroffen');
});

test('Mündung: Drachenfeuer beginnt am gezeichneten Maul (Kopf zum Ziel, Neigung, kein Auf und Ab beim Speien)', () => {
  for (const [tx, ty, mx] of [[480, 300, 0], [470, 360, 0], [330, 340, 0], [320, 240, -UNITS.drache.speed], [480, 330, UNITS.drache.speed]]) {
    const r = shoot('drache', 400, 300, tx, ty, { u: { mx }, tType: 'krieger' });
    close(r.start, r.drawn, `Drache → (${tx}, ${ty}) mx ${mx}`);
    assert.ok(Math.abs(r.pose.bob) < 1e-12, 'beim Speien kein Auf und Ab');
  }
});

test('Mündung: Geometrie (tipOffset) passt zur Zeichnung', () => {
  // Panzer ohne Neigung, Turm nach rechts, Rohr waagrecht: Mündung = Turm + Rohrspitze
  const R = visR('panzer'), o = {};
  tipOffset('panzer', { face: 1, sx: 1, sy: 1, rot: 0, bob: 0, flip: 1, elev: 0, recoil: 0 }, o);
  assert.ok(Math.abs(o.x - (TANK_GEO.turret[0] + TANK_GEO.tip[0]) * R) < 1e-9 && Math.abs(o.y - TANK_GEO.turret[1] * R) < 1e-9);
  // Turm nach links: gespiegelt um die Turmmitte; Blick der Wanne egal
  tipOffset('panzer', { face: -1, sx: 1, sy: 1, rot: 0, bob: 0, flip: -1, elev: 0, recoil: 0 }, o);
  assert.ok(Math.abs(o.x + (TANK_GEO.turret[0] + TANK_GEO.tip[0]) * R) < 1e-9);
  tipOffset('panzer', { face: 1, sx: 1, sy: 1, rot: 0, bob: 0, flip: -1, elev: 0, recoil: 0 }, o);
  assert.ok(Math.abs(o.x - (TANK_GEO.turret[0] - TANK_GEO.tip[0]) * R) < 1e-9, 'Turm dreht sich gegen die Wanne');
  // Heli: Neigung dreht um die Mündung
  const H = visR('heli');
  for (const rot of [-.25, 0, .25]) {
    tipOffset('heli', { face: -1, sx: 1.02, sy: .98, rot, bob: 0, recoil: 0 }, o);
    assert.ok(Math.abs(o.x + HELI_GEO.pivot[0] * H) < 1e-9 && Math.abs(o.y - HELI_GEO.pivot[1] * H) < 1e-9);
  }
  // Logik ohne Darstellungs-Zustand: gleiche Einheit, gleiches Ergebnis
  const u = { type: 'drache', T: UNITS.drache, x: 0, y: 0, z: 60, face: 1, mx: 20, hitT: 0 };
  assert.deepEqual(bossMuzzle(u, 100, 30, {}), bossMuzzle(u, 100, 30, {}));
});

// Nachtrag 4 (#39): Bug-MG des Panzers
test('Bug-MG: Kugeln zwischen den Kanonenschüssen, aus der gezeichneten MG-Mündung, nicht durch Eigene', async () => {
  const { step } = await import('../game/js/sim.js');
  const { TANK_MG } = await import('../game/js/combat.js');
  assert.deepEqual(TANK_MG, { DMG: 3, CD: .15, RANGE: 200, RETRY: .25 });
  const w = createWorld(1400, 800, 3); w.teamMode = true;
  const p = spawn(w, 'panzer', 400, 400, 'blau'); p.abCd = 1e9;
  const es = []; for (let k = 0; k < 4; k++) { const e = spawn(w, 'krieger', 560, 370 + k * 20, 'rot'); e.hp = 1e9; e.T = { ...UNITS.krieger, speed: 0 }; es.push(e); }
  const seq = [];
  for (let i = 0; i < 60 * 8; i++) {
    step(w, 1 / 60);
    for (const e of w.events) if (e.type === 'shot') {
      seq.push(e.kind);
      if (e.kind === 'bullet') {
        const m = tankMgMuzzle(p, {});
        assert.ok(Math.abs(e.x - (p.x + m.x)) < 1e-6 && Math.abs(e.y - (p.y + m.y)) < 1e-6, 'Mündung = TANK_GEO.mg');
      }
    }
    w.events.length = 0;
  }
  const shells = seq.reduce((a, k, i) => (k === 'shell' ? a.concat(i) : a), []);
  assert.ok(shells.length >= 2, `Kanonenschüsse ${shells.length}`);
  const between = seq.slice(shells[0] + 1, shells[1]).filter(k => k === 'bullet').length;
  assert.ok(between >= 8, `Kugeln zwischen zwei Kanonenschüssen: ${between}`);
  // Zeichnung: Mündung vorn an der Wanne, in Blickrichtung
  const R = visR('panzer');
  p.face = 1; p.hitT = 0; assert.ok(Math.abs(tankMgMuzzle(p, {}).x - TANK_GEO.mg[0] * R) < 1e-9);
  p.face = -1; assert.ok(Math.abs(tankMgMuzzle(p, {}).x + TANK_GEO.mg[0] * R) < 1e-9);
  assert.ok(Math.abs(tankMgMuzzle(p, {}).y - TANK_GEO.mg[1] * R) < 1e-9);
  // Eigener Krieger in der Schusslinie: kein MG-Feuer
  const w2 = createWorld(1400, 800, 3); w2.teamMode = true;
  const p2 = spawn(w2, 'panzer', 400, 400, 'blau'); p2.abCd = 1e9; p2.cd = 1e9;
  const e2 = spawn(w2, 'krieger', 560, 400, 'rot'); e2.hp = 1e9; e2.T = { ...UNITS.krieger, speed: 0 };
  const own = spawn(w2, 'krieger', 480, 400, 'blau'); own.T = { ...UNITS.krieger, speed: 0 }; own.cd = 1e9; own.state = 'stun'; own.stunT = 1e9;
  let bullets = 0;
  for (let i = 0; i < 60 * 2; i++) { step(w2, 1 / 60); for (const e of w2.events) if (e.type === 'shot' && e.kind === 'bullet') bullets++; w2.events.length = 0; }
  assert.equal(bullets, 0);
  assert.equal(own.hp, UNITS.krieger.hp);
});
