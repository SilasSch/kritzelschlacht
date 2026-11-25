// Live-Verbindung für Online 1 gegen 1 (18.11.). Im Claude-Artefakt: die room-Capability (window.claude.use('room'),
// beim Veröffentlichen capabilities: { room: {} } angeben). Sie verbindet angemeldete Betrachter mit Zugriff auf das
// Artefakt; ohne sie (lokale Kopie, öffentlicher Link) gibt es kein Online-Spiel.
// Zum Testen ohne Artefakt: ?nettest ersetzt den Raum durch BroadcastChannel (mehrere Tabs desselben Browsers).
// Außerhalb von Claude (itch.io, 25.11.): Setzt die Seite window.KS_RELAY = 'wss://…', läuft dieselbe Schnittstelle über
// den eigenen WebSocket-Relay (relay/worker.js, Cloudflare). Das Artefakt setzt KS_RELAY nie und bleibt beim room.
// Genutzt wird nur, was online.js braucht: join(name) → { presence, peers, onPeers, leave }, dazu presence/peers/onPeers
// der Lobby.

let roomP = null, storeP = null;
const relayUrl = () => typeof window !== 'undefined' && typeof window.KS_RELAY === 'string' && /^wss?:\/\//.test(window.KS_RELAY) && window.KS_RELAY;

// Gespeicherte Daten für alle (Bestenliste, König des Hügels): { db, user } oder null.
// Im Artefakt die db- und user-Capability, auf itch.io der Speicher im Relay (gleiche Teilmenge der Schnittstelle).
export function getStore() {
  if (storeP) return storeP;
  const relay = relayUrl();
  if (relay) storeP = Promise.resolve(relayStore(relay));
  else if (typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function') {
    const C = window.claude;
    storeP = Promise.all([C.use('db').catch(() => null), C.use('user').catch(() => null)]).then(([db, user]) => (db ? { db, user } : null), () => null);
  } else storeP = Promise.resolve(null);
  return storeP;
}
export function getRoom() {
  if (roomP) return roomP;
  const test = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nettest');
  const relay = relayUrl();
  if (test) roomP = Promise.resolve(mockRoom());
  else if (relay) roomP = relayRoom(relay).catch(() => { roomP = null; return null; });
  else if (typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function') {
    roomP = window.claude.use('room').then(r => r || null, () => null);
  } else roomP = Promise.resolve(null);
  return roomP;
}

/* ---------- Testraum über BroadcastChannel ---------- */
// Jede Seite ist ein Teilnehmer; presence wird bei jeder Änderung und jede Sekunde gesendet, wer 4 s schweigt, ist weg.
function mockRoom() {
  const me = Math.random().toString(36).slice(2, 10);
  const bc = new BroadcastChannel('ks-nettest');
  const rooms = new Map();   // name → Raumobjekt
  function makeRoom(name) {
    const st = { mine: {}, others: new Map(), subs: new Set(), snap: [] };
    const rebuild = () => {
      const now = Date.now();
      for (const [k, v] of st.others) if (now - v.seen > 4000) st.others.delete(k);
      st.snap = Object.freeze([
        Object.freeze({ peer: me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze({ ...st.mine }), updatedAt: now }),
        ...[...st.others.entries()].map(([peer, v]) => Object.freeze({ peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: v.presence, updatedAt: v.at })),
      ]);
      for (const f of st.subs) f({ peers: st.snap, joined: [], left: [], updated: [] });
    };
    const send = () => bc.postMessage({ room: name, peer: me, presence: st.mine });
    const iv = setInterval(() => { send(); rebuild(); }, 1000);
    const R = {
      name, st, rebuild,
      presence(patch) {
        for (const [k, v] of Object.entries(patch)) { if (v === null) delete st.mine[k]; else st.mine[k] = v; }
        if (new TextEncoder().encode(JSON.stringify(st.mine)).length > 4096) return Promise.reject({ code: 'invalid_argument', message: 'presence > 4 KiB' });
        send(); setTimeout(rebuild, 0); return Promise.resolve();
      },
      peers: () => st.snap,
      onPeers(f) { st.subs.add(f); setTimeout(() => f({ peers: st.snap, joined: st.snap, left: [], updated: [] }), 0); return () => st.subs.delete(f); },
      connected: () => true,
      leave() { clearInterval(iv); bc.postMessage({ room: name, peer: me, bye: true }); rooms.delete(name); st.subs.clear(); return Promise.resolve(); },
    };
    rooms.set(name, R); send(); rebuild();
    return R;
  }
  bc.onmessage = e => {
    const d = e.data, R = rooms.get(d && d.room);
    if (!R || d.peer === me) return;
    if (d.bye) R.st.others.delete(d.peer);
    else {
      const old = R.st.others.get(d.peer), txt = JSON.stringify(d.presence);
      R.st.others.set(d.peer, { presence: old && old.txt === txt ? old.presence : Object.freeze(d.presence), txt, seen: Date.now(), at: old && old.txt === txt ? old.at : Date.now() });
    }
    R.rebuild();
  };
  const lobby = makeRoom('');
  return {
    presence: p => lobby.presence(p).catch(() => {}), peers: lobby.peers, onPeers: f => lobby.onPeers(f), connected: () => true,
    join: name => Promise.resolve(rooms.get(name) || makeRoom(name)),
  };
}

/* ---------- Relay über WebSocket (itch.io) ---------- */
// Jeder Raum ist eine WebSocket-Verbindung zu wss://<relay>/r/<name>?id=<meine id>. Der Server leitet nur presence weiter
// und meldet join/bye; kommt jemand dazu, schickt jeder seine presence erneut. Bricht die Verbindung ab, wird mit derselben
// id neu verbunden (der Gegner sieht kurz niemanden, online.js wartet ein paar Sekunden, bevor es „weg“ meldet).
const enc = s => new TextEncoder().encode(s).length;
export function relayRoom(base, WS = typeof WebSocket !== 'undefined' ? WebSocket : null) {
  if (!WS) return Promise.reject(new Error('no websocket'));
  base = base.replace(/\/+$/, '');
  const me = (Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)).replace(/[^a-z0-9]/g, '').slice(0, 16).padEnd(8, '0');
  function open(name) {
    const st = { mine: {}, others: new Map(), subs: new Set(), snap: [], ws: null, ok: false, closed: false, tries: 0, ka: 0 };
    let firstRes, firstRej;
    const first = new Promise((res, rej) => { firstRes = res; firstRej = rej; });
    const rebuild = (joined = [], left = []) => {
      const now = Date.now();
      st.snap = Object.freeze([
        Object.freeze({ peer: me, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: true, presence: Object.freeze({ ...st.mine }), updatedAt: now }),
        ...[...st.others.entries()].filter(([, v]) => v.presence).map(([peer, v]) => Object.freeze({ peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: true, presence: v.presence, updatedAt: v.at })),
      ]);
      for (const f of st.subs) try { f({ peers: st.snap, joined, left, updated: [] }); } catch (e) { /* Abonnent */ }
    };
    const sendMine = () => { if (st.ok && st.ws.readyState === 1) try { st.ws.send(JSON.stringify({ t: 'p', p: st.mine })); } catch (e) { /* zu */ } };
    function connect() {
      const ws = new WS(`${base}/r/${encodeURIComponent(name)}?id=${me}`);
      st.ws = ws;
      let last = Date.now(), done = false;
      // Verbindung tot (kein hello in 8 s, nichts gehört seit 60 s, Fehler, Schließen): einmal neu verbinden
      const drop = () => {
        if (done) return; done = true;
        clearTimeout(timer); clearInterval(st.ka);
        ws.onmessage = ws.onclose = ws.onerror = null;
        try { ws.close(); } catch (e) { /* weg */ }
        const was = st.ok; st.ok = false;
        if (st.closed || st.ws !== ws) return;
        if (!was && ++st.tries >= 3) firstRej(new Error('relay unreachable'));
        setTimeout(() => { if (!st.closed) connect(); }, Math.min(8000, 500 * 2 ** st.tries));
      };
      const timer = setTimeout(drop, 8000);
      ws.onmessage = e => {
        last = Date.now();
        let d; try { d = JSON.parse(e.data); } catch (x) { return; }
        if (!d || typeof d !== 'object') return;
        if (d.t === 'hello' && Array.isArray(d.peers)) {
          clearTimeout(timer); st.ok = true; st.tries = 0;
          for (const k of [...st.others.keys()]) if (!d.peers.includes(k)) st.others.delete(k);
          for (const k of d.peers) if (!st.others.has(k)) st.others.set(k, { presence: null, txt: '', at: 0 });
          sendMine(); rebuild();
          // presence der anderen trifft kurz danach ein; join() wartet etwas, damit „Raum voll“ stimmt
          setTimeout(firstRes, d.peers.length ? 700 : 0);
          clearInterval(st.ka);
          st.ka = setInterval(() => {
            if (Date.now() - last > 60000) return drop();
            try { ws.send('{"t":"ping"}'); } catch (x) { drop(); }
          }, 25000);
        } else if (d.t === 'join' && typeof d.id === 'string') {
          if (!st.others.has(d.id)) st.others.set(d.id, { presence: null, txt: '', at: 0 });
          sendMine();
        } else if (d.t === 'bye' && typeof d.id === 'string') {
          if (st.others.delete(d.id)) rebuild([], [d.id]);
        } else if (d.t === 'p' && typeof d.id === 'string' && d.p && typeof d.p === 'object') {
          const old = st.others.get(d.id), txt = JSON.stringify(d.p);
          if (old && old.txt === txt) return;
          st.others.set(d.id, { presence: Object.freeze(d.p), txt, at: Date.now() });
          rebuild(old && old.presence ? [] : [d.id]);
        }
      };
      ws.onclose = drop;
      ws.onerror = drop;
    }
    const R = {
      name,
      presence(patch) {
        const next = { ...st.mine };
        for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete next[k]; else next[k] = v; }
        if (enc(JSON.stringify(next)) > 4096) return Promise.reject({ code: 'invalid_argument', message: 'presence > 4 KiB' });
        st.mine = next;
        if (!st.ok || st.ws.readyState !== 1) { setTimeout(rebuild, 0); return Promise.reject({ code: 'unavailable', message: 'offline' }); }
        sendMine(); setTimeout(rebuild, 0); return Promise.resolve();
      },
      peers: () => st.snap,
      onPeers(f) { st.subs.add(f); setTimeout(() => f({ peers: st.snap, joined: st.snap, left: [], updated: [] }), 0); return () => st.subs.delete(f); },
      connected: () => st.ok,
      leave() { st.closed = true; clearInterval(st.ka); st.subs.clear(); try { st.ws.close(1000); } catch (e) { /* weg */ } return Promise.resolve(); },
    };
    rebuild(); connect();
    return first.then(() => R, e => { R.leave(); throw e; });
  }
  // Lobby = Raum mit leerem Namen (offene Räume); fällt sie aus, geht das Spiel per Code trotzdem
  return open('').then(lobby => ({
    presence: p => lobby.presence(p).catch(() => {}), peers: lobby.peers, onPeers: f => lobby.onPeers(f), connected: lobby.connected,
    join: name => open(name), close: () => lobby.leave(),
  }));
}

/* ---------- Speicher über den Relay (itch.io) ---------- */
// Nachbau der Teilmenge der db-Capability, die hill.js und dailyboard.js nutzen:
//   db.doc(path): onSnapshot(cb, err), get(), set(data), acquire({ ttlMs })
//   db.collection(name): onSnapshot(cb, err) mit snap.docs [{ id, exists, data() }], doc(id).set(data)
//   user: id() (aus einem geheimen Schlüssel im Browser), profiles() → {} (Namen stehen im Dokument)
function relayKey() {
  const fresh = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), b => 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_'[b & 63]).join('');
  try {
    let k = localStorage.getItem('ks-relay-key');
    if (!k || !/^[A-Za-z0-9_-]{16,64}$/.test(k)) { k = fresh(); localStorage.setItem('ks-relay-key', k); }
    return k;
  } catch (e) { return fresh(); }
}
export function relayStore(base, WS = typeof WebSocket !== 'undefined' ? WebSocket : null, key = relayKey()) {
  base = base.replace(/\/+$/, '');
  const st = { ws: null, ok: false, me: null, subs: new Map(), reqs: new Map(), q: 0, tries: 0, ka: 0, closed: false };
  let meRes; const meP = new Promise(r => { meRes = r; });
  const failAll = () => { for (const [, r] of st.reqs) r.rej(new Error('offline')); st.reqs.clear(); };
  function connect() {
    if (!WS) return;
    const ws = new WS(`${base}/d?key=${encodeURIComponent(key)}`);
    st.ws = ws;
    let last = Date.now(), done = false;
    const drop = () => {
      if (done) return; done = true;
      clearTimeout(timer); clearInterval(st.ka);
      ws.onmessage = ws.onclose = ws.onerror = null;
      try { ws.close(); } catch (e) { /* weg */ }
      st.ok = false; failAll();
      if (++st.tries === 3) for (const s of st.subs.values()) for (const f of s.errs) try { f(new Error('offline')); } catch (e) { /* Abonnent */ }
      if (!st.closed) setTimeout(() => { if (!st.closed) connect(); }, Math.min(15000, 500 * 2 ** st.tries));
    };
    const timer = setTimeout(drop, 8000);
    ws.onmessage = e => {
      last = Date.now();
      let d; try { d = JSON.parse(e.data); } catch (x) { return; }
      if (!d || typeof d !== 'object') return;
      if (d.t === 'hello') {
        clearTimeout(timer); st.ok = true; st.tries = 0; st.me = d.me; meRes(d.me);
        for (const path of st.subs.keys()) ws.send(JSON.stringify({ t: 'sub', path }));
        clearInterval(st.ka);
        st.ka = setInterval(() => { if (Date.now() - last > 60000) return drop(); try { ws.send('{"t":"ping"}'); } catch (x) { drop(); } }, 25000);
      } else if (d.t === 'res') {
        const r = st.reqs.get(d.q); if (!r) return;
        st.reqs.delete(d.q);
        if (d.ok) r.res(d); else r.rej(new Error(d.err || 'error'));
      } else if (d.t === 'snap' && st.subs.has(d.path)) {
        const s = st.subs.get(d.path), v = d.data || {};
        if (v.docs) s.docs = new Map(Object.entries(v.docs));
        else if ('id' in v) s.docs.set(v.id, v.doc);
        else s.doc = v.doc;
        s.loaded = true;
        for (const f of s.cbs) try { f(snapOf(d.path, s)); } catch (x) { /* Abonnent */ }
      }
    };
    ws.onclose = drop; ws.onerror = drop;
  }
  const docSnap = (id, v) => ({ id, exists: v !== null && v !== undefined, data: () => v, metadata: { fromCache: false } });
  function snapOf(path, s) {
    if (s.docs) return { docs: [...s.docs].map(([id, v]) => docSnap(id, v)), metadata: { fromCache: false } };
    return docSnap(path.split('/').pop(), s.doc);
  }
  function ask(msg) {
    if (!st.ok) return Promise.reject(new Error('offline'));
    const q = ++st.q;
    return new Promise((res, rej) => {
      st.reqs.set(q, { res, rej });
      try { st.ws.send(JSON.stringify({ ...msg, q })); } catch (e) { st.reqs.delete(q); rej(e); }
      setTimeout(() => { if (st.reqs.delete(q)) rej(new Error('timeout')); }, 10000);
    });
  }
  function subscribe(path, coll, cb, err) {
    let s = st.subs.get(path);
    if (!s) { s = { cbs: new Set(), errs: new Set(), docs: coll ? new Map() : null, doc: null, loaded: false }; st.subs.set(path, s); if (st.ok) st.ws.send(JSON.stringify({ t: 'sub', path })); }
    s.cbs.add(cb); if (err) s.errs.add(err);
    if (s.loaded) setTimeout(() => cb(snapOf(path, s)), 0);
    return () => {
      s.cbs.delete(cb); if (err) s.errs.delete(err);
      if (!s.cbs.size) { st.subs.delete(path); if (st.ok) try { st.ws.send(JSON.stringify({ t: 'unsub', path })); } catch (e) { /* zu */ } }
    };
  }
  const doc = path => ({
    onSnapshot: (cb, err) => subscribe(path, false, cb, err),
    get: () => ask({ t: 'get', path }).then(r => docSnap(path.split('/').pop(), r.data)),
    set: data => ask({ t: 'set', path, data: JSON.parse(JSON.stringify(data)) }).then(() => undefined),
    acquire: (o = {}) => ask({ t: 'acq', path, ttl: o.ttlMs }).then(r => ({ acquired: !!r.acquired })),
  });
  const db = {
    doc,
    collection: name => ({ onSnapshot: (cb, err) => subscribe(name, true, cb, err), doc: id => doc(`${name}/${id}`) }),
  };
  const user = { id: () => st.me ? Promise.resolve(st.me) : Promise.race([meP, new Promise((_, rej) => setTimeout(() => rej(new Error('offline')), 10000))]), profiles: () => Promise.resolve({}) };
  connect();
  const close = () => { st.closed = true; clearInterval(st.ka); failAll(); try { st.ws.close(1000); } catch (e) { /* weg */ } };
  return { db, user, close };
}
