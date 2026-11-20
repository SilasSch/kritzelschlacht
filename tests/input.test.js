// Tastenkürzel (input.js): Ziffern, Q/E, X, P, +/−, Strg+Z. Bei offenem Dialog (Lexikon, actions.keysBlocked)
// lösen sie nichts aus (finale Prüfung der Römer-Runde: vorher feuerten sie hinter dem Lexikon weiter).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindInput } from '../game/js/input.js';

function setup(blocked) {
  const win = {}, cv = {}, calls = [];
  globalThis.window = { addEventListener: (k, f) => { win[k] = f; } };
  const canvas = {
    addEventListener: (k, f) => { cv[k] = f; },
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
    setPointerCapture() {}, releasePointerCapture() {},
  };
  const rec = name => (...a) => calls.push([name, ...a]);
  const actions = {
    paintAt: rec('paintAt'), strokeStart: rec('strokeStart'), strokeEnd: rec('strokeEnd'), brushDelta: rec('brushDelta'),
    brushRadius: () => 10, setCat: rec('setCat'), pickSlot: rec('pickSlot'), eraser: rec('eraser'), undo: rec('undo'),
    togglePause: rec('togglePause'), toggleRanges: rec('toggleRanges'), hover: rec('hover'), keysBlocked: () => blocked.on,
  };
  const cam = { x: 0, y: 0, zoom: 1, fit: 1, viewW: 800, viewH: 600, worldW: 1600, worldH: 900 };
  bindInput(canvas, cam, actions);
  const key = (k, o = {}) => {
    let prevented = false;
    win.keydown({ key: k, code: o.code || '', ctrlKey: !!o.ctrl, metaKey: false, altKey: false, shiftKey: false, repeat: false, target: o.target || {}, preventDefault() { prevented = true; } });
    return prevented;
  };
  const ptr = (ev, id, x, y, o = {}) => cv[ev]({ pointerId: id, pointerType: o.type || 'touch', button: o.button ?? 0, clientX: x, clientY: y, preventDefault() {} });
  return { calls, key, ptr, cam };
}

test('Tastenkürzel: wirken ohne Dialog, bei offenem Lexikon nicht; R und Space auf Buttons (#72)', () => {
  const blocked = { on: false };
  const { calls, key } = setup(blocked);
  const press = () => { key('3'); key('q'); key('e'); key('x'); key('p'); key('r'); key('+'); key('z', { ctrl: true }); };
  press();
  assert.deepEqual(calls.map(c => c[0]), ['pickSlot', 'setCat', 'setCat', 'eraser', 'togglePause', 'toggleRanges', 'brushDelta', 'undo']);
  // Space auf fokussiertem Button/Checkbox wird nicht blockiert
  const btn = { tagName: 'BUTTON', closest: sel => (sel.includes('button') ? btn : null) };
  assert.equal(key(' ', { code: 'Space', target: btn }), false);
  assert.equal(key(' ', { code: 'Space' }), true);
  calls.length = 0;
  blocked.on = true;
  press();
  assert.deepEqual(calls, [], 'Lexikon offen: nichts');
  blocked.on = false;
  key('5');
  assert.deepEqual(calls, [['pickSlot', 5]], 'wieder zu: wirkt wieder');
  delete globalThis.window;
});

test('Multi-Touch: zweiter Finger beendet Strich sauber und zoomt/verschiebt statt Undo zu zerstören (#82)', () => {
  const { calls, ptr, cam } = setup({ on: false });
  ptr('pointerdown', 1, 200, 200);
  ptr('pointermove', 1, 240, 200);
  // Zweiter Finger dazu: kein zweites strokeStart, erster Strich sauber per strokeEnd abgeschlossen
  ptr('pointerdown', 2, 400, 200);
  assert.equal(calls.filter(c => c[0] === 'strokeStart').length, 1);
  assert.equal(calls.filter(c => c[0] === 'strokeEnd').length, 1);
  const z0 = cam.zoom;
  ptr('pointermove', 2, 500, 200);
  assert.ok(cam.zoom > z0, '2-Finger-Spread zoomt hinein');
  assert.equal(calls.filter(c => c[0] === 'strokeStart').length, 1);
  ptr('pointerup', 2, 500, 200);
  ptr('pointerup', 1, 240, 200);
  delete globalThis.window;
});

