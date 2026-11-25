// KI-Gegner im Online-1-gegen-1 (25.11.): ein Raum wie net.js ihn liefert ({ presence, peers, onPeers, leave }), in dem
// außer mir nur die KI sitzt. Die KI ist ein vollwertiger Gast: Sie läuft durch dieselbe Zustandsmaschine wie ein Mensch
// (online.js createMatch/onPeer), stimmt ab, malt verdeckt, tauscht die Armee in Stücken, will Revanche oder eine neue
// Runde, beantwortet Regeländerungen und schickt Emotes. So gibt es im Spiel gegen die KI alles, was es online gibt,
// ohne Netz (geht auch im öffentlichen Artefakt und offline). Rein bis auf die Uhr; timers sind für Tests austauschbar.
//
// soloRoom(): leerer Raum nur mit mir (2v2 nur mit KI-Mitspielern, ohne Live-Verbindung).
import {
  createMatch, view, onPeer, castVote, markReady, finishFight, wantNext, answerProp, sendEmote, myPick, budgetOf, packUnits, PROTO,
} from './online.js';
import { createBotArmy, makeCtx, botVote, botEmote, thinkMs, isLevel } from './bot.js';

const ME = 'me', BOT = 'ki';
const defaultTimers = () => ({
  set: (f, ms) => setTimeout(f, ms), clear: id => clearTimeout(id), now: () => Date.now(),
  perf: () => (globalThis.performance ? globalThis.performance.now() : Date.now()),
});

// Raum mit festen Teilnehmern: mine (eigene presence) und others() (Liste weiterer Teilnehmer)
function baseRoom(others = () => []) {
  const st = { mine: {}, subs: new Set(), closed: false };
  const peers = () => Object.freeze([
    Object.freeze({ peer: ME, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: true, presence: Object.freeze({ ...st.mine }), updatedAt: Date.now() }),
    ...others(),
  ]);
  const notify = () => { if (st.closed) return; const p = peers(); for (const f of st.subs) try { f({ peers: p, joined: [], left: [], updated: [] }); } catch (e) { /* Abonnent */ } };
  const R = {
    local: true, st, notify, peers,
    presence(patch) {
      if (st.closed) return Promise.resolve();
      for (const [k, v] of Object.entries(patch || {})) { if (v === null) delete st.mine[k]; else st.mine[k] = v; }
      if (R.onMine) R.onMine(st.mine);
      setTimeout(notify, 0);
      return Promise.resolve();
    },
    onPeers(f) { st.subs.add(f); setTimeout(() => { if (st.subs.has(f)) f({ peers: peers(), joined: [], left: [], updated: [] }); }, 0); return () => st.subs.delete(f); },
    connected: () => true,
    leave() { st.closed = true; st.subs.clear(); if (R.onLeave) R.onLeave(); return Promise.resolve(); },
  };
  return R;
}
export const soloRoom = () => baseRoom();

// Raum mit KI-Gast. opts: { level, W, H, rand, timers, onState }
export function createBotRoom(opts) {
  const level = isLevel(opts.level) ? opts.level : 'mittel';
  const rand = opts.rand || Math.random, tm = opts.timers || defaultTimers();
  const W = opts.W, H = opts.H;
  const bm = createMatch('guest');
  let botPres = Object.freeze(view(bm)), timers = new Set(), search = null, readyAt = 0, hostReadyAt = 0, searchEnd = 0, known = [], seenFight = 0;
  let voteT = null, propT = null, wantT = null, pumpT = null, lastHost = null;
  const room = baseRoom(() => [Object.freeze({ peer: BOT, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: true, presence: botPres, updatedAt: Date.now() })]);
  room.bot = { level, match: bm, get search() { return search; } };
  const later = (f, ms) => { const id = tm.set(() => { timers.delete(id); f(); }, ms); timers.add(id); return id; };
  const cancel = id => { if (id != null) { tm.clear(id); timers.delete(id); } };
  const publish = () => {
    const v = view(bm);
    if (JSON.stringify(v) === JSON.stringify(botPres)) return;
    botPres = Object.freeze(v);
    room.notify();
    if (opts.onState) opts.onState(bm);
  };
  const emote = ev => { const k = botEmote(ev, level, rand); if (k !== null && sendEmote(bm, k, tm.now())) publish(); };

  // Malen: Armee suchen (schwer: in Häppchen), dann nach der Bedenkzeit fertig melden
  function startPaint() {
    const c = bm.cfg;
    const ctx = makeCtx({ W, H, side: bm.side, cat: c.cat, budget: budgetOf(c), map: c.map });
    search = createBotArmy(ctx, level, rand, { known, same: !!c.rematch, seed: c.seed ^ 0x5bd1 });
    let think = thinkMs(level, rand);
    if (c.time) think = Math.min(think, c.time * 1000 * .5);
    readyAt = tm.now() + think;
    // spätestens dann nimmt die schwere KI das bisher Beste (Malzeit: vor Ablauf)
    searchEnd = tm.now() + (c.time ? c.time * 1000 * .7 : 45000);
    pump();
  }
  function pump() {
    cancel(pumpT); pumpT = null;
    if (!search || bm.phase !== 'paint') return;
    // Ist der Mensch schon fertig, rechnet die KI mehr am Stück und wartet höchstens noch kurz
    if (!search.done) search.pump(hostReadyAt ? 14 : 8, tm.perf);
    const now = tm.now();
    const due = Math.min(readyAt, hostReadyAt ? hostReadyAt + 2500 : Infinity);
    if (!search.done && now >= (hostReadyAt ? Math.min(searchEnd, hostReadyAt + 10000) : searchEnd)) search.finish();
    if (search.done && now >= due) {
      const ev = markReady(bm, packUnits(search.result, W, H));
      search = null;
      if (ev.length) { publish(); tick(); }
      return;
    }
    pumpT = later(pump, search.done ? Math.max(50, Math.min(500, due - now)) : 16);
  }

  // Auf die presence des Hosts reagieren (wie ui/online.js onPeers beim Menschen)
  function tick() {
    const p = lastHost;
    if (!p || p.ks !== PROTO) return;
    const ev = onPeer(bm, p, W, H);
    const r = bm.cfg ? bm.cfg.r : 0;
    if (ev.includes('round') || (bm.phase === 'paint' && !search && bm.mine === null)) { hostReadyAt = 0; startPaint(); }
    if (ev.includes('peerready')) { hostReadyAt = tm.now(); pump(); }
    if (bm.phase === 'vote' && myPick(bm) && !bm.vote && voteT == null) {
      voteT = later(() => {
        voteT = null;
        if (bm.phase !== 'vote' || bm.vote || !myPick(bm)) return;
        const v = botVote(bm.cfg.opts, level, rand);
        if (castVote(bm, v.rule, v.map).length) publish();
      }, 1200 + rand() * 2500);
    }
    if (ev.includes('fight') && seenFight < r) {
      seenFight = r;
      // Was der Gegner aufgedeckt hat, merkt sich die KI (schwer kontert es später)
      const theirs = bm.fight.units.filter(u => u.team !== bm.side);
      if (theirs.length) known = [theirs, ...known].slice(0, 3);
      later(() => emote('reveal'), 1500 + rand() * 3000);
    }
    // Kampf: gewertet wird das Ergebnis des Hosts; die KI übernimmt es
    if (bm.phase === 'fight' && p.res && p.res.r === r) {
      if (finishFight(bm, p.res.w).length) {
        later(() => emote(p.res.w === bm.side ? 'win' : p.res.w === 'draw' ? null : 'lose'), 800 + rand() * 1500);
      }
    }
    if (ev.includes('peergave')) later(() => emote('win'), 900);
    // Regeländerung: die KI ist umgänglich und nimmt an
    if (bm.peerProp && propT == null) propT = later(() => { propT = null; if (bm.peerProp && answerProp(bm, true).length) { publish(); tick(); } }, 1500 + rand() * 1500);
    // Nach der Runde: die KI will, was der Mensch will (Revanche oder neue Runde)
    if (bm.phase === 'result' && bm.peerWant && bm.want <= r && wantT == null) {
      wantT = later(() => { wantT = null; if (bm.phase === 'result' && bm.peerWant && bm.want <= bm.cfg.r) { wantNext(bm, bm.peerWant === 'same'); publish(); } }, 700 + rand() * 1200);
    }
    if (ev.includes('emote') && rand() < .3) later(() => emote(rand() < .5 ? 'win' : 'lose'), 900 + rand() * 1200);
    publish();
  }
  room.onMine = mine => { lastHost = JSON.parse(JSON.stringify(mine)); later(tick, 30 + rand() * 60); };
  room.onLeave = () => { for (const id of timers) tm.clear(id); timers.clear(); search = null; };
  publish();
  return room;
}
