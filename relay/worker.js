// Kritzelschlacht-Relay (25.11.): verteilt die presence-Objekte der Spieler eines Raums, sonst nichts.
// Ein Durable Object je Raumname, WebSockets mit Hibernation (kostet im Leerlauf nichts). Der Server speichert keine
// Spieldaten: Kommt jemand neu dazu, meldet er "join", und alle anderen schicken ihre presence noch einmal.
//   Client → Server: { t: 'p', p: {...} }            eigene presence (vollständig)
//   Server → Client: { t: 'hello', me, peers: [id] }  nach dem Verbinden
//                    { t: 'join', id } / { t: 'bye', id } / { t: 'p', id, p }
// Verbindung: wss://<worker>/r/<raum>?id=<peer-id>. Gleiche id ersetzt die alte Verbindung (Neuverbindung).
//
// Dazu ein kleiner Speicher (Klasse Store, eine Instanz) für Bestenliste und König des Hügels: wss://<worker>/d?key=<geheim>.
// Die Spieler-id ist sha256(key) (16 Hex-Zeichen): Wer seinen key nicht kennt, kann fremde Einträge nicht überschreiben.
//   Client → Server: { t: 'sub'|'unsub', path } · { t: 'get', q, path } · { t: 'set', q, path, data } · { t: 'acq', q, path, ttl }
//   Server → Client: { t: 'hello', me } · { t: 'snap', path, data } · { t: 'res', q, ok, data, acquired, err }
// Erlaubte Pfade: scores (Sammlung), scores/<eigene id> (schreiben), hill/<JJJJ-MM-TT> (lesen und schreiben für alle).

const MAX_PEERS = { lobby: 300, room: 8 };
const MAX_MSG = 6000;            // Zeichen je Nachricht (presence im Spiel ≤ 4 KiB)
const RATE = { n: 40, ms: 10000 }; // höchstens so viele Nachrichten je Verbindung und Fenster
const ROOM_RE = /^[a-z0-9-]{0,40}$/;
const ID_RE = /^[a-z0-9]{6,24}$/;
// Seiten, die verbinden dürfen (Origin-Header). itch.io bettet HTML5-Spiele von *.itch.zone ein.
const ORIGIN_OK = [/^https:\/\/([a-z0-9-]+\.)*itch\.zone$/, /^https:\/\/([a-z0-9-]+\.)*itch\.io$/, /^https:\/\/([a-z0-9-]+\.)*hwcdn\.net$/,
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/];

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/' || url.pathname === '/health') return new Response('kritzelschlacht relay ok\n');
    if (url.pathname === '/d') {
      const key = url.searchParams.get('key') || '';
      if (!/^[A-Za-z0-9_-]{16,64}$/.test(key)) return new Response('bad request', { status: 400 });
      if (!ORIGIN_OK.some(r => r.test(req.headers.get('Origin') || ''))) return new Response('forbidden', { status: 403 });
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
      return env.STORE.get(env.STORE.idFromName('main')).fetch(req);
    }
    const m = url.pathname.match(/^\/r\/(.*)$/);
    if (!m) return new Response('not found', { status: 404 });
    const room = decodeURIComponent(m[1]), id = url.searchParams.get('id') || '';
    if (!ROOM_RE.test(room) || !ID_RE.test(id)) return new Response('bad request', { status: 400 });
    const origin = req.headers.get('Origin') || '';
    if (!ORIGIN_OK.some(r => r.test(origin))) return new Response('forbidden', { status: 403 });
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected websocket', { status: 426 });
    return env.ROOMS.get(env.ROOMS.idFromName(room || '_lobby')).fetch(req);
  },
};

export class Room {
  constructor(ctx) { this.ctx = ctx; }
  async fetch(req) {
    const url = new URL(req.url), id = url.searchParams.get('id');
    const lobby = url.pathname === '/r/';
    const old = this.ctx.getWebSockets(id);
    for (const ws of old) try { ws.close(4000, 'replaced'); } catch (e) { /* weg */ }
    if (this.ctx.getWebSockets().length - old.length >= MAX_PEERS[lobby ? 'lobby' : 'room']) return new Response('room full', { status: 503 });
    const pair = new WebSocketPair(), ws = pair[1];
    this.ctx.acceptWebSocket(ws, [id]);
    ws.serializeAttachment({ id, w: Date.now(), n: 0 });
    const peers = [...new Set(this.ctx.getWebSockets().map(s => this.idOf(s)).filter(x => x && x !== id))];
    ws.send(JSON.stringify({ t: 'hello', me: id, peers }));
    this.cast(ws, { t: 'join', id });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  idOf(ws) { try { return (ws.deserializeAttachment() || {}).id; } catch (e) { return null; } }
  cast(from, msg) {
    const txt = JSON.stringify(msg);
    for (const s of this.ctx.getWebSockets()) if (s !== from) try { s.send(txt); } catch (e) { /* weg */ }
  }
  webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > MAX_MSG) return ws.close(1009, 'too big');
    const a = ws.deserializeAttachment() || {}, now = Date.now();
    if (now - a.w > RATE.ms) { a.w = now; a.n = 0; }
    if (++a.n > RATE.n) return ws.close(4008, 'rate');
    ws.serializeAttachment(a);
    let msg; try { msg = JSON.parse(data); } catch (e) { return; }
    if (msg && msg.t === 'p' && msg.p && typeof msg.p === 'object') this.cast(ws, { t: 'p', id: a.id, p: msg.p });
    else if (msg && msg.t === 'ping') ws.send('{"t":"pong"}');
  }
  // Close-Handshake selbst beantworten, sonst bleibt der Client im Zustand CLOSING hängen
  webSocketClose(ws, code) { try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch (e) { /* schon zu */ } this.bye(ws); }
  webSocketError(ws) { this.bye(ws); }
  bye(ws) {
    const id = this.idOf(ws);
    if (!id) return;
    // nur „bye“, wenn keine neuere Verbindung mit derselben id lebt
    if (this.ctx.getWebSockets(id).some(s => s !== ws && s.readyState === 1)) return;
    this.cast(ws, { t: 'bye', id });
  }
}

/* ---------- Speicher: Bestenliste und Hügel ---------- */
const DOC_MAX = 32000;           // Zeichen je Dokument
const COLL_MAX = 2000;           // Dokumente je Sammlung im Snapshot
const COLLS = ['scores', 'hill'];
const pathOk = p => p === 'scores' || /^scores\/[0-9a-f]{16}$/.test(p) || /^hill\/\d{4}-\d{2}-\d{2}$/.test(p);
const writeOk = (p, me) => p === 'scores/' + me || /^hill\/\d{4}-\d{2}-\d{2}$/.test(p);
async function uidOf(key) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('ks:' + key)));
  return [...h.slice(0, 8)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export class Store {
  constructor(ctx) { this.ctx = ctx; this.leases = new Map(); }
  async fetch(req) {
    const me = await uidOf(new URL(req.url).searchParams.get('key'));
    if (this.ctx.getWebSockets().length >= 500) return new Response('busy', { status: 503 });
    const pair = new WebSocketPair(), ws = pair[1];
    this.ctx.acceptWebSocket(ws);
    ws.serializeAttachment({ me, subs: [], w: Date.now(), n: 0 });
    ws.send(JSON.stringify({ t: 'hello', me }));
    return new Response(null, { status: 101, webSocket: pair[0] });
  }
  async snap(path) {
    if (COLLS.includes(path)) {
      const m = await this.ctx.storage.list({ prefix: path + '/', limit: COLL_MAX });
      return { docs: Object.fromEntries([...m].map(([k, v]) => [k.slice(path.length + 1), v])) };
    }
    const v = await this.ctx.storage.get(path);
    return { doc: v === undefined ? null : v };
  }
  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > DOC_MAX + 500) return ws.close(1009, 'too big');
    const a = ws.deserializeAttachment() || {}, now = Date.now();
    if (now - a.w > RATE.ms) { a.w = now; a.n = 0; }
    if (++a.n > RATE.n) return ws.close(4008, 'rate');
    let msg; try { msg = JSON.parse(data); } catch (e) { return; }
    if (!msg || typeof msg !== 'object') return;
    const { t, q, path } = msg;
    const res = o => ws.send(JSON.stringify({ t: 'res', q, ...o }));
    if (t === 'ping') { ws.serializeAttachment(a); return ws.send('{"t":"pong"}'); }
    if (typeof path !== 'string' || !pathOk(path)) { ws.serializeAttachment(a); return t === 'sub' || t === 'unsub' ? undefined : res({ ok: false, err: 'path' }); }
    if (t === 'sub') {
      if (!a.subs.includes(path) && a.subs.length < 10) a.subs.push(path);
      ws.serializeAttachment(a);
      ws.send(JSON.stringify({ t: 'snap', path, data: await this.snap(path) }));
    } else if (t === 'unsub') {
      a.subs = a.subs.filter(x => x !== path); ws.serializeAttachment(a);
    } else if (t === 'get') {
      ws.serializeAttachment(a);
      res({ ok: true, data: (await this.snap(path)).doc });
    } else if (t === 'set') {
      ws.serializeAttachment(a);
      if (!writeOk(path, a.me)) return res({ ok: false, err: 'denied' });
      if (!msg.data || typeof msg.data !== 'object' || JSON.stringify(msg.data).length > DOC_MAX) return res({ ok: false, err: 'invalid' });
      await this.ctx.storage.put(path, msg.data);
      res({ ok: true });
      const coll = path.split('/')[0];
      for (const s of this.ctx.getWebSockets()) {
        const sa = s.deserializeAttachment() || {};
        if (!sa.subs) continue;
        if (sa.subs.includes(path)) try { s.send(JSON.stringify({ t: 'snap', path, data: { doc: msg.data } })); } catch (e) { /* weg */ }
        if (sa.subs.includes(coll)) try { s.send(JSON.stringify({ t: 'snap', path: coll, data: { id: path.slice(coll.length + 1), doc: msg.data } })); } catch (e) { /* weg */ }
      }
    } else if (t === 'acq') {
      ws.serializeAttachment(a);
      const l = this.leases.get(path), ttl = Math.max(500, Math.min(10000, +msg.ttl || 5000));
      if (l && l.until > now && l.holder !== a.me) return res({ ok: true, acquired: false });
      this.leases.set(path, { holder: a.me, until: now + ttl });
      res({ ok: true, acquired: true });
    }
  }
  webSocketClose(ws, code) { try { ws.close(code === 1005 || code === 1006 ? 1000 : code, 'bye'); } catch (e) { /* schon zu */ } }
  webSocketError() { /* nichts */ }
}
