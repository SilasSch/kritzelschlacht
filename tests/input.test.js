// Tastenkürzel (input.js): Ziffern, Q/E, X, P, +/−, Strg+Z. Bei offenem Dialog (Lexikon, actions.keysBlocked)
// lösen sie nichts aus (finale Prüfung der Römer-Runde: vorher feuerten sie hinter dem Lexikon weiter).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bindInput } from '../game/js/input.js';

function setup(blocked) {
  const win = {}, calls = [];
  globalThis.window = { addEventListener: (k, f) => { win[k] = f; } };
  const canvas = { addEventListener() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };
  const rec = name => (...a) => calls.push([name, ...a]);
  const actions = {
    paintAt: rec('paintAt'), strokeStart: rec('strokeStart'), strokeEnd: rec('strokeEnd'), brushDelta: rec('brushDelta'),
    brushRadius: () => 10, setCat: rec('setCat'), pickSlot: rec('pickSlot'), eraser: rec('eraser'), undo: rec('undo'),
    togglePause: rec('togglePause'), hover: rec('hover'), keysBlocked: () => blocked.on,
  };
  bindInput(canvas, { x: 0, y: 0, zoom: 1, viewW: 800, viewH: 600 }, actions);
  const key = (k, o = {}) => win.keydown({ key: k, code: o.code || '', ctrlKey: !!o.ctrl, metaKey: false, altKey: false, shiftKey: false, repeat: false, target: {}, preventDefault() {} });
  return { calls, key };
}

test('Tastenkürzel: wirken ohne Dialog, bei offenem Lexikon nicht', () => {
  const blocked = { on: false };
  const { calls, key } = setup(blocked);
  const press = () => { key('3'); key('q'); key('e'); key('x'); key('p'); key('+'); key('z', { ctrl: true }); };
  press();
  assert.deepEqual(calls.map(c => c[0]), ['pickSlot', 'setCat', 'setCat', 'eraser', 'togglePause', 'brushDelta', 'undo']);
  calls.length = 0;
  blocked.on = true;
  press();
  assert.deepEqual(calls, [], 'Lexikon offen: nichts');
  blocked.on = false;
  key('5');
  assert.deepEqual(calls, [['pickSlot', 5]], 'wieder zu: wirkt wieder');
  delete globalThis.window;
});
