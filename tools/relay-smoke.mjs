// Prüft einen laufenden Relay (relay/worker.js): zwei Spieler im selben Raum sehen ihre presence, der Speicher antwortet.
//   node tools/relay-smoke.mjs wss://kritzelschlacht-relay.kritzelschlacht.workers.dev
const base = (process.argv[2] || '').replace(/\/+$/, '');
if (!/^wss?:\/\//.test(base)) { console.error('Relay-URL fehlt'); process.exit(2); }
const headers = { Origin: 'https://html-classic.itch.zone' };
const open = path => new Promise((res, rej) => {
  const ws = new WebSocket(base + path, { headers }), msgs = [];
  ws.onmessage = e => msgs.push(JSON.parse(e.data));
  ws.onopen = () => res({ ws, msgs });
  ws.onerror = e => rej(new Error('Verbindung fehlgeschlagen: ' + path));
  setTimeout(() => rej(new Error('Zeitüberschreitung: ' + path)), 10000);
});
const wait = ms => new Promise(r => setTimeout(r, ms));
const room = 'smoke-' + Math.random().toString(36).slice(2, 8);
const a = await open(`/r/${room}?id=smoketesta1`), b = await open(`/r/${room}?id=smoketestb2`);
await wait(800);
a.ws.send(JSON.stringify({ t: 'p', p: { hi: 1 } }));
await wait(800);
const got = b.msgs.find(m => m.t === 'p' && m.id === 'smoketesta1' && m.p.hi === 1);
const s = await open('/d?key=smoketest-key-0001');
s.ws.send(JSON.stringify({ t: 'sub', path: 'scores' }));
await wait(1000);
const hello = s.msgs.find(m => m.t === 'hello'), snap = s.msgs.find(m => m.t === 'snap');
for (const x of [a, b, s]) x.ws.close();
console.log(`Raum: ${got ? 'ok' : 'FEHLT'} · Speicher: ${hello && snap ? `ok (${Object.keys(snap.data.docs || {}).length} Einträge)` : 'FEHLT'}`);
process.exit(got && hello && snap ? 0 : 1);
