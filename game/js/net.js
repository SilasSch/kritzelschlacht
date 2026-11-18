// Live-Verbindung für Online 1 gegen 1 (18.11.). Im Claude-Artefakt: die room-Capability (window.claude.use('room'),
// beim Veröffentlichen capabilities: { room: {} } angeben). Sie verbindet angemeldete Betrachter mit Zugriff auf das
// Artefakt; ohne sie (lokale Kopie, öffentlicher Link) gibt es kein Online-Spiel.
// Zum Testen ohne Artefakt: ?nettest ersetzt den Raum durch BroadcastChannel (mehrere Tabs desselben Browsers).
// Genutzt wird nur, was online.js braucht: join(name) → { presence, peers, onPeers, leave }, dazu presence/peers/onPeers
// der Lobby.

let roomP = null;
export function getRoom() {
  if (roomP) return roomP;
  const test = typeof location !== 'undefined' && new URLSearchParams(location.search).has('nettest');
  if (test) roomP = Promise.resolve(mockRoom());
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
    presence: p => lobby.presence(p), peers: lobby.peers, onPeers: f => lobby.onPeers(f), connected: () => true,
    join: name => Promise.resolve(rooms.get(name) || makeRoom(name)),
  };
}
