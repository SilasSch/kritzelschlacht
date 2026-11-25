// Relay-Transport für itch.io (net.js): Raum (presence) und Speicher (db) gegen einen nachgebauten Relay im Speicher.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relayRoom, relayStore } from '../game/js/net.js';

const wait = (ms = 20) => new Promise(r => setTimeout(r, ms));

// Mini-Relay: dieselben Nachrichten wie relay/worker.js (Room und Store), ohne Netz
function fakeRelay() {
  const rooms = new Map(), store = new Map(), subs = new Set();
  class WS {
    constructor(url) {
      this.url = url; this.readyState = 0;
      const u = new URL(url.replace(/^ws/, 'http'));
      setTimeout(() => {
        this.readyState = 1;
        if (u.pathname === '/d') { this.me = 'u' + u.searchParams.get('key').slice(0, 15); this.subs = []; subs.add(this); this.emit({ t: 'hello', me: this.me }); return; }
        this.room = decodeURIComponent(u.pathname.slice(3)); this.id = u.searchParams.get('id');
        const set = rooms.get(this.room) || new Set(); rooms.set(this.room, set);
        this.emit({ t: 'hello', me: this.id, peers: [...set].map(s => s.id) });
        for (const s of set) s.emit({ t: 'join', id: this.id });
        set.add(this);
      }, 1);
    }
    emit(d) { setTimeout(() => this.onmessage && this.onmessage({ data: JSON.stringify(d) }), 1); }
    send(txt) {
      const d = JSON.parse(txt);
      if (this.room !== undefined) {
        if (d.t === 'p') for (const s of rooms.get(this.room)) if (s !== this) s.emit({ t: 'p', id: this.id, p: d.p });
        return;
      }
      if (d.t === 'sub') { this.subs.push(d.path); this.emit({ t: 'snap', path: d.path, data: d.path === 'scores' ? { docs: Object.fromEntries([...store].filter(([k]) => k.startsWith('scores/')).map(([k, v]) => [k.slice(7), v])) } : { doc: store.get(d.path) ?? null } }); }
      else if (d.t === 'set') {
        if (d.path.startsWith('scores/') && d.path !== 'scores/' + this.me) return this.emit({ t: 'res', q: d.q, ok: false, err: 'denied' });
        store.set(d.path, d.data); this.emit({ t: 'res', q: d.q, ok: true });
        for (const s of subs) {
          if (s.subs.includes(d.path)) s.emit({ t: 'snap', path: d.path, data: { doc: d.data } });
          if (s.subs.includes('scores') && d.path.startsWith('scores/')) s.emit({ t: 'snap', path: 'scores', data: { id: d.path.slice(7), doc: d.data } });
        }
      } else if (d.t === 'get') this.emit({ t: 'res', q: d.q, ok: true, data: store.get(d.path) ?? null });
      else if (d.t === 'acq') this.emit({ t: 'res', q: d.q, ok: true, acquired: true });
    }
    close() {
      if (this.readyState === 3) return; this.readyState = 3; subs.delete(this);
      const set = rooms.get(this.room);
      if (set && set.delete(this)) for (const s of set) s.emit({ t: 'bye', id: this.id });
      setTimeout(() => this.onclose && this.onclose(), 1);
    }
  }
  return { WS, rooms };
}

test('Relay-Raum: presence kommt beim anderen an, Verlassen meldet bye', async () => {
  const { WS } = fakeRelay();
  const a = await relayRoom('ws://relay.test', WS), b = await relayRoom('ws://relay.test', WS);
  const ra = await a.join('ks1v1-abcd');
  await ra.presence({ ks: 2, role: 'host' });
  const rb = await b.join('ks1v1-abcd');
  await wait(50);
  const seen = rb.peers().filter(p => !p.isMe);
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].presence, { ks: 2, role: 'host' });
  let left = null; rb.onPeers(e => { if (e.left.length) left = e.left; });
  await rb.presence({ ks: 2, role: 'guest', big: null });
  await wait(30);
  assert.equal(ra.peers().find(p => !p.isMe).presence.role, 'guest');
  await ra.leave(); await wait(30);
  assert.equal(rb.peers().filter(p => !p.isMe).length, 0);
  assert.ok(left && left.length === 1);
  await rb.leave(); a.close(); b.close();
});

test('Relay-Raum: presence über 4 KiB wird abgelehnt', async () => {
  const { WS } = fakeRelay();
  const net = await relayRoom('ws://relay.test', WS), r = await net.join('x');
  await assert.rejects(r.presence({ big: 'x'.repeat(5000) }));
  await r.leave(); net.close();
});

test('Relay-Speicher: Sammlung, Dokument, Sperre und Schreibrecht nur für das eigene Dokument', async () => {
  const { WS } = fakeRelay();
  const A = relayStore('ws://relay.test', WS, 'a'.repeat(24)), B = relayStore('ws://relay.test', WS, 'b'.repeat(24));
  const meA = await A.user.id(), meB = await B.user.id();
  assert.notEqual(meA, meB);
  let snap = null; B.db.collection('scores').onSnapshot(s => { snap = s; });
  await A.db.collection('scores').doc(meA).set({ n: 'Silas', days: {} });
  await wait(30);
  assert.deepEqual(snap.docs.map(d => [d.id, d.exists, d.data().n]), [[meA, true, 'Silas']]);
  await assert.rejects(B.db.collection('scores').doc(meA).set({ n: 'fremd' }));
  const ref = A.db.doc('hill/2026-11-25');
  let hill = null; B.db.doc('hill/2026-11-25').onSnapshot(s => { hill = s; });
  await wait(20);
  assert.equal(hill.exists, false);
  assert.equal((await ref.acquire({ ttlMs: 5000 })).acquired, true);
  await ref.set({ k: { n: 'Silas' } });
  await wait(30);
  assert.equal(hill.data().k.n, 'Silas');
  assert.equal((await B.db.doc('hill/2026-11-25').get()).data().k.n, 'Silas');
  assert.deepEqual(await A.user.profiles([meA]), {});
  A.close(); B.close();
});
