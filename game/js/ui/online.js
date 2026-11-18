// Online 1 gegen 1 (18.11.): Knopf in der Schlachtleiste, Lobby (Raum erstellen, Code eingeben, offene Räume),
// Rundenkarte, Leiste während des Spiels und Punktestand im Ergebnis. Regeln und Ablauf: online.js (rein); Verbindung:
// net.js. Gemalt wird wie im Hotseat (battle.hot mit online: true und def = Kategorie der Runde), nur die eigene Hälfte;
// die Armee des Gegners kommt erst zum Kampf in die Welt.
import {
  createMatch, view, hostStart, markReady, finishFight, wantNext, onPeer, officialWinner, pickPeer, openRooms,
  makeCode, normCode, roomName, roundDef, packArmy, CAT_NAME, ONLINE_BUDGETS, ONLINE_DEFAULT, PROTO, castVote, budgetOf,
} from '../online.js';
import { RULE, MAP, applyMap, mapSVG } from '../rules.js';
import { getRoom } from '../net.js';
// Live-Version des Artefakts (mit room-Capability, nur auf Einladung); die öffentliche Version verweist darauf
const LIVE_URL = 'https://claude.ai/artifact/HnB3bdhDEz8psMDZ3GGP5W';
import { fmtPts } from '../cards.js';

const CSS = `
#ovOnl{z-index:7}
.card.vote{max-width:680px}
.vopts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%}
.vopts .btn{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;padding:10px 12px}
.vopts .btn b{font-family:var(--f-logo);font-weight:400;font-size:19px;letter-spacing:.5px}
.vopts .btn span{font-size:12px;color:var(--muted);font-weight:600;line-height:1.3}
.vopts .btn svg{width:100%;height:auto;border-radius:6px}
.vopts .btn.on{background:var(--sel);border-color:var(--selb);box-shadow:0 0 0 2px var(--selb)}
.vopts .btn:disabled{opacity:1}
.card.onl h3{margin:4px 0 0;font-size:14px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.card.onl .mapprev svg{width:220px;height:auto;border-radius:8px;display:block}
.card.onl{max-width:520px;align-items:flex-start}
.card.onl .code{font-family:var(--f-logo);font-size:44px;letter-spacing:6px;line-height:1;padding:8px 16px;border:2px dashed var(--ink);border-radius:14px;background:#fffbe9}
.card.onl .row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.card.onl input{font:800 20px var(--f-ui);letter-spacing:4px;text-transform:uppercase;width:120px;padding:8px 10px;border:1.5px solid var(--line);border-radius:12px}
.card.onl .rooms{display:flex;flex-direction:column;gap:6px;width:100%}
.card.onl .rooms .btn{display:flex;justify-content:space-between;gap:12px;width:100%}
.card.onl .muted{color:var(--muted);font-size:13px}
.card.onl .warn{color:#b3261e;font-weight:700}
.card.onl h2 .cat{color:var(--go)}
.ov.onl-round{background:rgba(255,255,255,.75)}
.onlbox{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;border:2px solid var(--ink);border-radius:14px;padding:10px 14px;background:#fffbe9}
.onlbox .sc{font-family:var(--f-logo);font-size:30px;letter-spacing:1px}
.onlbox .sc .blau{color:#3f7cff}.onlbox .sc .rot{color:#ff4d4d}
.onlbox .muted{color:var(--muted);font-size:12.5px}
#batOnl.on{background:var(--sel);border-color:var(--selb)}
.onlban{position:fixed;left:50%;top:84px;transform:translateX(-50%);z-index:60;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);
  padding:12px 20px;border:2.5px solid var(--ink);border-radius:999px;background:#fff3b0;box-shadow:0 6px 0 var(--ink),0 10px 30px rgba(0,0,0,.2);
  font:800 17px var(--f-ui);color:var(--ink);pointer-events:auto}
.onlban[hidden]{display:none}
.onlban.hi{animation:onlPulse 1.1s ease-in-out 3}
.onlban .btn,.onlban .go{padding:6px 14px;font-size:15px}
.onlask{position:fixed;inset:0;z-index:61;display:flex;align-items:center;justify-content:center;background:rgba(20,20,30,.35);pointer-events:auto}
.onlask[hidden]{display:none}
.onlask .card{max-width:440px;align-items:center;text-align:center;border-width:3px;animation:onlPop .35s cubic-bezier(.2,1.6,.4,1),onlRing 1.4s ease-out .35s infinite}
.onlask .big{font-size:54px;line-height:1}
.onlask h2{margin:0}
.onlask .btnrow{justify-content:center}
.onlask .go{font-size:19px;padding:12px 22px}
.onlbox .peer{display:inline-block;margin-top:4px;padding:4px 10px;border-radius:999px;background:#fff3b0;border:2px solid var(--ink);font-weight:800;color:var(--ink);animation:onlPulse 1.1s ease-in-out infinite}
@keyframes onlPulse{0%,100%{transform:translateX(var(--tx,0)) scale(1)}50%{transform:translateX(var(--tx,0)) scale(1.06)}}
.onlban{--tx:-50%}
@keyframes onlPop{from{transform:scale(.6);opacity:0}to{transform:scale(1);opacity:1}}
@keyframes onlRing{0%{box-shadow:0 0 0 0 rgba(255,196,0,.8)}100%{box-shadow:0 0 0 26px rgba(255,196,0,0)}}
@media (prefers-reduced-motion:reduce){.onlban.hi,.onlask .card,.onlbox .peer{animation:none}}
`;
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SIDE_N = { blau: 'Blau', rot: 'Rot' };
const GONE_MS = 6000;      // so lange darf der Gegner fehlen (Neuverbindung), bevor die Karte „Gegner ist weg“ kommt
const JOIN_MS = 8000;      // so lange sucht der Gast nach dem Host

export function createOnlineUI({ game, world, ui, audio, hotseat, onlineFight, clearWorld, undoStack, markAll }) {
  const $ = id => document.getElementById(id);
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);

  let room = null, lobby = null, net = null, m = null, battleRef = null, unsubs = [], lastPub = '', peerSeen = 0, joinT = 0;
  let lobbyUnsub = null, roundT = 0, peerRef = null;

  /* ---------- Knopf ---------- */
  const btn = document.createElement('button');
  btn.className = 'btn'; btn.id = 'batOnl'; btn.textContent = 'Online 1v1';
  btn.title = 'Zwei Spieler auf zwei Geräten: jede Runde eine zufällige Kategorie, gleiches Budget, verdeckt malen';
  $('batGo').before(btn);
  btn.onclick = () => { if (m) confirmLeave(); else { const b = game.battle; if (b && b.phase === 'plan' && !b.hot) openLobby(); } };

  // „Los!“: im Online-Spiel Fertig / Nächste Runde (vor dem Hotseat-Haken, der sonst Deckkarten zeigt)
  const go = $('batGo'), goPrev = go.onclick;
  go.onclick = e => {
    if (!m) { if (goPrev) goPrev.call(go, e); return; }
    e.currentTarget.blur();
    if (m.phase === 'paint') ready();
    else if (m.phase === 'vote') voteCard();
    else if (m.phase === 'result') { act(wantNext(m)); }
  };

  /* ---------- Karte ---------- */
  const ov = document.createElement('div');
  ov.className = 'ov'; ov.id = 'ovOnl'; ov.hidden = true;
  ov.innerHTML = '<div class="card onl shadow" role="dialog" aria-modal="true" aria-labelledby="onlTitle"></div>';
  $('app').append(ov);
  const card = ov.firstChild;
  let shown = '';
  const hideCard = () => { ov.hidden = true; shown = ''; card.classList.remove('vote'); ov.classList.remove('onl-round'); if (lobbyUnsub) { lobbyUnsub(); lobbyUnsub = null; } };
  const showCard = (kind, html) => { if (kind !== 'vote') card.classList.remove('vote'); card.innerHTML = html; shown = kind; ov.hidden = false; };

  /* ---------- Hinweise, die man nicht übersieht ---------- */
  // Leiste oben (kurz oder dauerhaft) und Abfrage in der Mitte (Revanche annehmen / ablehnen), mit Ton
  const ban = document.createElement('div'); ban.className = 'onlban'; ban.id = 'onlBan'; ban.hidden = true; ban.setAttribute('role', 'status');
  const ask = document.createElement('div'); ask.className = 'onlask'; ask.id = 'onlAsk'; ask.hidden = true;
  ask.innerHTML = '<div class="card shadow" role="alertdialog" aria-labelledby="onlAskT"></div>';
  document.body.append(ban, ask);
  let banT = 0, sticky = null, askKey = '';
  const chime = big => { try { audio.init(); audio.play('notify', { kind: big ? 'big' : '' }); } catch (e) { /* ohne Ton */ } };
  function showBan(o) {
    ban.innerHTML = o.html; ban.hidden = false;
    ban.classList.remove('hi'); if (o.hi) { void ban.offsetWidth; ban.classList.add('hi'); }
    if (o.wire) o.wire();
  }
  // kurzer Hinweis; danach wieder der dauerhafte (falls einer da ist)
  function flash(text, big = false, ms = 4000) {
    clearTimeout(banT);
    showBan({ html: `<span>${esc(text)}</span>`, hi: true });
    chime(big);
    banT = setTimeout(() => { banT = 0; if (sticky) showBan(sticky); else ban.hidden = true; }, ms);
  }
  function setSticky(o) { sticky = o; if (!banT) { if (o) showBan(o); else ban.hidden = true; } }
  // Stand nach dem Kampf: will der Gegner Revanche / weiter, warte ich, hat er abgelehnt?
  function updateAsk() {
    let k = '';
    if (m && m.cfg && m.phase === 'result') {
      const waiting = m.want > m.cfg.r, pw = m.peerWant;
      if (pw === 'same' && !waiting) k = 'same';
      else if (pw === 'new' && waiting && m.same) k = 'declined';
      else if (pw === 'new' && !waiting) k = 'new';
      else if (waiting && !pw) k = m.same ? 'waitSame' : 'waitNew';
    }
    if (k === askKey) return;
    askKey = k;
    const box = ask.firstChild;
    if (k === 'same' || k === 'declined') {
      box.innerHTML = k === 'same'
        ? `<div class="big">⚔️</div><h2 id="onlAskT">Dein Gegner will eine Revanche!</h2>
          <p>Gleiche Regel (${esc(CAT_NAME[m.cfg.cat])}), gleiche Karte (${esc(MAP[m.cfg.map].n)}), gleiches Budget. Ihr malt beide neu.</p>
          <div class="btnrow"><button class="go" id="onlAskYes">Revanche annehmen</button><button class="btn" id="onlAskNo">Ablehnen, neue Abstimmung</button></div>`
        : `<div class="big">🗳️</div><h2 id="onlAskT">Dein Gegner will lieber neu abstimmen</h2>
          <p>Keine Revanche: Ihr stimmt über eine neue Regel und Karte ab.</p>
          <div class="btnrow"><button class="go" id="onlAskNo">Okay, neue Abstimmung</button><button class="btn" id="onlAskLeave">Verlassen</button></div>`;
      ask.hidden = false;
      const y = $('onlAskYes'), n = $('onlAskNo'), l = $('onlAskLeave');
      if (y) y.onclick = () => act(wantNext(m, true));
      if (n) n.onclick = () => act(wantNext(m, false));
      if (l) l.onclick = () => { ask.hidden = true; askKey = ''; confirmLeave(); };
      (y || n).focus();
      chime(true);
    } else ask.hidden = true;
    if (k === 'new') {
      setSticky({ html: '<span>Dein Gegner will die nächste Runde.</span><button class="go" id="onlBanGo">Los</button>', hi: true,
        wire: () => { $('onlBanGo').onclick = () => act(wantNext(m, false)); } });
      chime(false);
    } else if (k === 'waitSame') setSticky({ html: '<span>⏳ Revanche angefragt, warte auf deinen Gegner …</span>' });
    else if (k === 'waitNew') setSticky({ html: '<span>⏳ Warte auf deinen Gegner …</span>' });
    else setSticky(null);
  }
  function clearNotes() { clearTimeout(banT); banT = 0; sticky = null; askKey = ''; ban.hidden = true; ask.hidden = true; }

  async function openLobby() {
    let pick = ONLINE_DEFAULT;
    showCard('lobby', `<h2 id="onlTitle">Online 1 gegen 1</h2><p class="muted">Verbinde …</p>`);
    net = await getRoom();
    if (shown !== 'lobby') return;
    if (!net) {
      showCard('lobby', `<h2 id="onlTitle">Online 1 gegen 1</h2>
        <p>Das Online-Spiel braucht die Live-Verbindung des Claude-Artefakts. Sie ist hier nicht verfügbar.</p>
        <p class="muted">Öffne das Spiel als Claude-Artefakt und melde dich an. Dein Gegner braucht ebenfalls Zugriff auf das Artefakt (Einladung) und muss angemeldet sein; über einen öffentlichen Link geht es nicht.</p>
        <p>Live spielen: in der <a href="${LIVE_URL}" target="_blank" rel="noopener">Live-Version</a> (nur mit Einladung).</p>
        <p><b>Ohne Anmeldung:</b> Nimm das <b>Code-Duell</b> (Knopf daneben). Du verschickst deine Armee als Code, dein Gegner malt verdeckt dagegen.</p>
        <div class="btnrow"><button class="btn" id="onlCancel">Schließen</button></div>`);
      $('onlCancel').onclick = hideCard; return;
    }
    showCard('lobby', `<h2 id="onlTitle">Online 1 gegen 1</h2>
      <p>Jede Runde wird eine Kategorie ausgelost. Beide malen gleichzeitig mit demselben Budget, ohne die Armee des anderen zu sehen. Aufgedeckt wird beim Kampf.</p>
      <div class="hotbud">${ONLINE_BUDGETS.map(v => `<button class="btn${v === pick ? ' on' : ''}" data-v="${v}"><b>${v}</b><span>Punkte je Seite</span></button>`).join('')}</div>
      <div class="row"><button class="go" id="onlCreate">Raum erstellen</button></div>
      <div class="row"><input id="onlCode" maxlength="6" placeholder="CODE" autocomplete="off" spellcheck="false" aria-label="Raumcode"><button class="btn" id="onlJoin">Beitreten</button></div>
      <div class="rooms" id="onlRooms"></div>
      <div class="btnrow"><button class="btn" id="onlCancel">Abbrechen</button></div>`);
    card.querySelectorAll('.hotbud .btn').forEach(b => {
      b.onclick = () => { pick = +b.dataset.v; card.querySelectorAll('.hotbud .btn').forEach(x => x.classList.toggle('on', x === b)); };
    });
    $('onlCreate').onclick = () => start('host', makeCode(), pick);
    const join = () => { const c = normCode($('onlCode').value); if (!c) { ui.toast('Der Code hat 4 Zeichen, z. B. KX7P.'); return; } start('guest', c); };
    $('onlJoin').onclick = join;
    $('onlCode').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') join(); };
    $('onlCancel').onclick = hideCard;
    // offene Räume aus der Lobby
    const render = () => {
      const box = $('onlRooms'); if (!box) return;
      const rs = openRooms(net.peers());
      box.innerHTML = rs.length ? `<span class="muted">Offene Räume</span>${rs.map(r => `<button class="btn" data-c="${esc(r.code)}"><span>Raum ${esc(r.code)}</span><span>${r.budget} Punkte · Beitreten</span></button>`).join('')}`
        : '<span class="muted">Gerade wartet niemand. Erstelle einen Raum und gib deinem Gegner den Code.</span>';
      box.querySelectorAll('[data-c]').forEach(b => { b.onclick = () => start('guest', b.dataset.c); });
    };
    try { lobbyUnsub = net.onPeers(render, () => {}); } catch (e) { /* ohne Lobby-Liste */ }
    render();
    $('onlCreate').focus();
  }

  function waitCard() {
    if (m.role === 'host') {
      showCard('wait', `<h2 id="onlTitle">Warte auf Gegner</h2><p>Gib deinem Gegner diesen Code. Er öffnet das Spiel, geht auf Schlacht → Online 1v1 und tritt bei.</p>
        <div class="code">${esc(m.code)}</div><p class="muted">${m.budget} Punkte je Seite · du bist Blau (links)</p>
        <div class="btnrow"><button class="btn" id="onlCancel">Abbrechen</button></div>`);
    } else {
      const late = Date.now() - joinT > JOIN_MS;
      showCard('wait', `<h2 id="onlTitle">Raum ${esc(m.code)}</h2><p>${late ? '<span class="warn">Hier ist noch niemand.</span> Stimmt der Code? Du kannst weiter warten.' : 'Verbinde mit dem Gegner …'}</p>
        <p class="muted">Du bist Rot (rechts).</p><div class="btnrow"><button class="btn" id="onlCancel">Abbrechen</button></div>`);
    }
    $('onlCancel').onclick = () => leave('Online-Spiel abgebrochen.');
  }
  // Abstimmung: drei Regeln und drei Karten; gleiche Wahl gewinnt, sonst das Los
  let pickR = null, pickM = null;
  function voteCard() {
    const c = m.cfg, done = !!m.vote;
    if (!done) { if (!c.opts.rules.includes(pickR)) pickR = c.opts.rules[0]; if (!c.opts.maps.includes(pickM)) pickM = c.opts.maps[0]; }
    const selR = done ? m.vote.rule : pickR, selM = done ? m.vote.map : pickM;
    card.classList.add('vote');
    showCard('vote', `<h2 id="onlTitle">Runde ${c.r}: Abstimmung</h2>
      <p class="muted">Ihr wählt beide. Gleiche Wahl gewinnt, sonst entscheidet das Los zwischen euren beiden Stimmen. ${scoreText()}.</p>
      <h3>Was darf gemalt werden?</h3>
      <div class="vopts" id="vRules">${c.opts.rules.map(id => `<button class="btn${id === selR ? ' on' : ''}" data-v="${id}"${done ? ' disabled' : ''}><b>${esc(RULE[id].n)}</b><span>${esc(RULE[id].d)}</span></button>`).join('')}</div>
      <h3>Karte</h3>
      <div class="vopts" id="vMaps">${c.opts.maps.map(id => `<button class="btn${id === selM ? ' on' : ''}" data-v="${id}"${done ? ' disabled' : ''}>${mapSVG(id)}<b>${esc(MAP[id].n)}</b><span>${esc(MAP[id].d)}</span></button>`).join('')}</div>
      <div class="btnrow">${done ? '<button class="go" disabled>Warte auf die Stimme deines Gegners …</button>' : '<button class="go" id="onlVote">Abstimmen</button>'}<button class="btn" id="onlCancel">Spiel verlassen</button></div>`);
    if (!done) {
      card.querySelectorAll('#vRules .btn').forEach(b => { b.onclick = () => { pickR = b.dataset.v; voteCard(); }; });
      card.querySelectorAll('#vMaps .btn').forEach(b => { b.onclick = () => { pickM = b.dataset.v; voteCard(); }; });
      $('onlVote').onclick = () => act(castVote(m, pickR, pickM));
    }
    $('onlCancel').onclick = () => confirmLeave();
  }
  function roundCard() {
    const c = m.cfg, ag = c.agreed || {};
    const how = (ok, what) => (ok ? `${what}: ihr wart euch einig.` : `${what}: das Los hat entschieden.`);
    ov.classList.add('onl-round');
    showCard('round', `<h2 id="onlTitle">${c.rematch ? 'Revanche' : `Runde ${c.r}`}: <span class="cat">${esc(CAT_NAME[c.cat])}</span></h2>
      <div class="row"><div class="mapprev">${mapSVG(c.map, 220, 124)}</div><div><b>${esc(MAP[c.map].n)}</b><br><span class="muted">${esc(MAP[c.map].d)}</span></div></div>
      <p>${esc(RULE[c.cat].d)}. ${budgetOf(c)} Punkte. Du bist <b>${SIDE_N[m.side]}</b> (${m.side === 'blau' ? 'links' : 'rechts'}). Dein Gegner sieht nichts, bis beide fertig sind.</p>
      <p class="muted">${c.rematch ? 'Gleiches Setup wie eben, ihr malt beide neu.' : `${how(ag.rule, 'Regel')} ${how(ag.map, 'Karte')}`}</p>
      <div class="btnrow"><button class="go" id="onlOk">Los geht's</button></div>`);
    $('onlOk').onclick = hideCard; $('onlOk').focus();
    clearTimeout(roundT); roundT = setTimeout(() => { if (shown === 'round') hideCard(); }, 5000);
  }
  function goneCard() {
    chime(true);
    showCard('gone', `<h2 id="onlTitle">Gegner ist weg</h2><p>Die Verbindung zum Gegner ist abgerissen. Kommt er zurück, geht es weiter.</p>
      <div class="btnrow"><button class="btn" id="onlStay">Warten</button><button class="go" id="onlCancel">Spiel verlassen</button></div>`);
    $('onlStay').onclick = hideCard;
    $('onlCancel').onclick = () => leave('Online-Spiel beendet.');
  }
  function confirmLeave() {
    showCard('leave', `<h2 id="onlTitle">Online-Spiel verlassen?</h2><p>Stand: ${scoreText()}.</p>
      <div class="btnrow"><button class="go" id="onlCancel">Verlassen</button><button class="btn" id="onlStay">Weiterspielen</button></div>`);
    $('onlStay').onclick = hideCard;
    $('onlCancel').onclick = () => leave('Online-Spiel beendet.');
  }
  const scoreText = () => (m ? `Blau ${m.score.blau} : ${m.score.rot} Rot` : '');

  /* ---------- Verbindung ---------- */
  async function start(role, code, budget) {
    hideCard();
    const b = game.battle; if (!b || b.phase !== 'plan') return;
    net = net || await getRoom(); if (!net) return;
    try { room = await net.join(roomName(code)); } catch (e) { ui.toast('Keine Verbindung zum Raum. Versuch es gleich noch mal.'); return; }
    // voll? (zwei andere Spieler schon drin)
    const others = room.peers().filter(p => !p.isMe && p.presence && p.presence.ks === PROTO);
    if (others.length >= 2 || (role === 'host' && others.length)) {
      room.leave(); room = null;
      ui.toast(role === 'host' ? 'Code schon vergeben, bitte noch einmal.' : 'Der Raum ist schon voll.');
      return;
    }
    m = createMatch(role, budget); m.code = code; battleRef = b; peerSeen = 0; peerRef = null; joinT = Date.now(); lastPub = '';
    game.clear(); undoStack.length = 0;
    b.hot = { online: true, budget: m.budget, step: 'online', spent: { blau: 0, rot: 0 }, def: null };
    unsubs.push(room.onPeers(onPeers, () => {}));
    if (role === 'host') try { net.presence({ ks: PROTO, open: { code, budget: m.budget } }); } catch (e) { /* ohne Lobby */ }
    publish(); waitCard(); sync();
  }
  function leave(msg) {
    for (const u of unsubs) try { u(); } catch (e) { /* weg */ }
    unsubs = [];
    if (room) try { room.leave(); } catch (e) { /* weg */ }
    if (net) try { net.presence({ open: null }); } catch (e) { /* weg */ }
    room = null; m = null;
    hideCard(); clearNotes();
    const b = battleRef; battleRef = null;
    if (b && game.battle === b) {
      b.hot = null;
      if (b.phase !== 'plan') { b.phase = 'plan'; b.stats = null; b.result = null; b.endT = -1; b.t = 0; }
      $('ovBat').hidden = true; document.body.classList.remove('bat-res');
      clearWorld(); world.teamMode = true;
      ui.renderUnits(); ui.updateBattle(); ui.updateCounts(); ui.updateControls();
    }
    if (msg) ui.toast(msg);
    sync();
  }
  function publish() {
    if (!room || !m) return;
    const v = view(m), txt = JSON.stringify(v);
    if (txt === lastPub) return;
    lastPub = txt;
    room.presence(v).catch(() => { lastPub = ''; });
  }
  function onPeers() {
    if (!m || !room) return;
    const p = pickPeer(room.peers());
    const okRole = p && p.presence.role === (m.role === 'host' ? 'guest' : 'host');
    if (okRole) {
      if (peerRef && peerRef !== p.peer && m.cfg) { /* neuer Tab des Gegners: läuft mit der Runde weiter */ }
      peerRef = p.peer; peerSeen = Date.now();
      if (shown === 'gone') hideCard();
      if (m.role === 'host' && !m.cfg) { try { net.presence({ open: null }); } catch (e) { /* egal */ } act(hostStart(m)); }
      act(onPeer(m, p.presence, world.W, world.H));
    }
    publish();
  }

  /* ---------- Ablauf ---------- */
  function act(evs) {
    for (const e of evs) {
      if (e === 'vote') beginVote();
      else if (e === 'voted') voteCard();
      else if (e === 'round') beginRound();
      else if (e === 'fight') beginFight();
      else if (e === 'error') ui.toast(`Die Armee des Gegners war ungültig (${m.error}). Sie kämpft nicht mit.`);
      else if (e === 'peerres' || e === 'score' || e === 'result' || e === 'peerwant' || e === 'want') decorate();
      else if (e === 'peerready') flash('✅ Dein Gegner ist fertig mit Malen!');
      else if (e === 'peervoted' && m.phase === 'vote') flash(m.vote ? '🗳️ Dein Gegner hat auch abgestimmt' : '🗳️ Dein Gegner hat abgestimmt, jetzt du!');
    }
    updateAsk(); publish(); sync();
  }
  // Neue Runde: Feld leeren, nicht malen, abstimmen
  function resetField(step, def) {
    const b = game.battle; if (!b || !m) return null;
    game.endReplay(true);
    $('ovBat').hidden = true; document.body.classList.remove('bat-res');
    b.phase = 'plan'; b.stats = null; b.result = null; b.endT = -1; b.t = 0; b.snap = null; b.batchRes = null;
    clearWorld(); world.teamMode = true; undoStack.length = 0;
    b.hot = { online: true, budget: m.cfg.cat ? budgetOf(m.cfg) : m.cfg.budget, step, spent: { blau: 0, rot: 0 }, def };
    return b;
  }
  function beginVote() {
    if (!resetField('online', null)) return;
    ui.updateBattle(); ui.updateCounts(); ui.updateControls();
    audio.play('whoosh');
    voteCard();
  }
  function beginRound() {
    const b = resetField(m.side, roundDef(m.cfg)); if (!b) return;
    applyMap(world, m.cfg.map); markAll();
    game.setCat(m.cfg.cat);
    ui.updateBattle(); ui.updateCounts(); ui.updateControls();
    audio.play('whoosh');
    roundCard();
  }
  function ready() {
    const b = game.battle; if (!b || !m || m.phase !== 'paint') return;
    if (!world.units.some(u => u.alive && u.team === m.side)) { ui.toast(`Male zuerst deine Armee (${CAT_NAME[m.cfg.cat]}).`); return; }
    b.hot.step = 'online';   // nicht mehr malen
    undoStack.length = 0;
    act(markReady(m, packArmy(world, m.side)));
  }
  function beginFight() {
    if (!m || !m.fight) return;
    hideCard();
    onlineFight(m.fight.units, m.fight.seed, m.fight.map);
    ui.toast('Aufgedeckt!');
  }

  /* ---------- Ergebnis ---------- */
  // Punktestand und Knöpfe in der Auswertung (ovBat); die Knöpfe der freien Schlacht sind im Online-Spiel aus
  const origShow = ui.showBattleResult;
  ui.showBattleResult = r => { origShow(r); decorate(); };
  function decorate() {
    const on = !!m && !!game.battle && game.battle.hot && game.battle.hot.online;
    for (const id of ['batAgain', 'batTen', 'batEdit']) $(id).hidden = on;
    let box = $('onlRes');
    if (!on || !m.cfg || (m.phase !== 'result' && m.phase !== 'fight')) { if (box) box.remove(); return; }
    if (!box) { box = document.createElement('div'); box.className = 'onlbox'; box.id = 'onlRes'; $('ovBat').querySelector('.btnrow').before(box); }
    const off = officialWinner(m), mine = m.res ? m.res.w : null;
    const note = !off ? 'Warte auf das Ergebnis des Gegners …'
      : off !== mine && mine ? `Gewertet wird das Ergebnis von Blau (${off === 'draw' ? 'unentschieden' : SIDE_N[off] + ' gewinnt'}); auf deinem Gerät lief der Kampf etwas anders.`
      : off === 'draw' ? 'Unentschieden, kein Punkt.' : off === m.side ? 'Du gewinnst die Runde!' : 'Dein Gegner gewinnt die Runde.';
    const waiting = m.want > m.cfg.r, pw = m.peerWant;
    const peerTxt = pw === 'same' ? 'Dein Gegner will eine Revanche.' : pw === 'new' ? 'Dein Gegner will die nächste Runde.' : '';
    const myTxt = waiting ? (m.same ? (pw === 'new' ? 'Du willst Revanche, dein Gegner eine neue Runde: drück „Nächste Runde“, um weiterzumachen.' : 'Du willst Revanche, warte auf deinen Gegner …') : 'Warte auf deinen Gegner …') : '';
    box.innerHTML = `<div><div class="muted">Runde ${m.cfg.r} · ${esc(CAT_NAME[m.cfg.cat])} · ${esc(MAP[m.cfg.map].n)} · du bist ${SIDE_N[m.side]}</div>
        <div class="sc"><span class="blau">Blau ${m.score.blau}</span> : <span class="rot">${m.score.rot} Rot</span></div><div class="muted">${esc(note)}</div>
        ${peerTxt ? `<div class="peer">${esc(peerTxt)}</div>` : ''}${myTxt ? `<div class="muted">${esc(myTxt)}</div>` : ''}</div>
      <div class="btnrow"><button class="go" id="onlSame"${waiting && m.same ? ' disabled' : ''} title="Gleiche Regel, gleiche Karte, gleiches Budget: beide malen neu">Revanche</button>
        <button class="go" id="onlNext"${waiting && !m.same ? ' disabled' : ''} title="Neue Abstimmung über Regel und Karte">Nächste Runde</button><button class="btn" id="onlLeave">Verlassen</button></div>`;
    $('onlNext').onclick = () => act(wantNext(m, false));
    $('onlSame').onclick = () => act(wantNext(m, true));
    $('onlLeave').onclick = () => confirmLeave();
  }

  /* ---------- Anzeige ---------- */
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  function sync() {
    const b = game.battle, plan = !!b && b.phase === 'plan';
    const on = !!m && !!b && b === battleRef && !!b.hot;
    btn.hidden = !b || (!on && (!plan || !!b.hot));
    btn.textContent = on ? 'Online verlassen' : 'Online 1v1';
    btn.classList.toggle('on', on);
    if (!on) return;
    $('batHot').hidden = true; $('batSwap').hidden = true; $('batShare').hidden = true;
    const c = m.cfg, ph = m.phase;
    $('batClear').hidden = ph !== 'paint';
    setText(go, ph === 'paint' ? 'Fertig' : ph === 'vote' ? 'Abstimmung' : ph === 'result' ? (m.want > c.r ? 'Warte auf Gegner …' : 'Nächste Runde') : ph === 'fight' ? 'Kampf läuft' : 'Warte …');
    go.disabled = !(ph === 'paint' || ph === 'vote' || (ph === 'result' && m.want <= c.r));
    const head = c && c.cat ? `Online · Runde ${c.r} · ${CAT_NAME[c.cat]} · ${MAP[c.map].n} · ${scoreText()}` : c ? `Online · Runde ${c.r} · ${scoreText()}` : `Online · Raum ${m.code}`;
    const tail = ph === 'wait' ? 'warte auf Gegner' : ph === 'vote' ? (m.vote ? 'warte auf die Stimme des Gegners' : 'stimmt über Regel und Karte ab')
      : ph === 'paint' ? `du malst ${m.side === 'blau' ? 'links' : 'rechts'}: ${fmtPts(b.hot.spent[m.side])} / ${budgetOf(c)} Punkte`
      : ph === 'ready' ? 'fertig, der Gegner malt noch' : ph === 'xfer' ? 'decke auf …' : ph === 'fight' ? 'Kampf läuft' : 'Runde vorbei';
    setText($('batHint'), `${head} · ${tail}`);
    // eigene Punkte zeigen, die des Gegners erst im Kampf
    if (plan) {
      const other = m.side === 'blau' ? 'rot' : 'blau';
      setText($(m.side === 'blau' ? 'ptsB' : 'ptsR'), fmtPts(b.hot.spent[m.side]));
      setText($(other === 'blau' ? 'ptsB' : 'ptsR'), '?');
    }
  }
  game.onlineUI = sync;

  // je Bild: Kampfende melden, Gegner weg, Modus verlassen (anderer Reiter)
  function frame() {
    if (!m) return;
    const b = game.battle;
    if (!b || b !== battleRef) { leave(null); return; }
    if (m.phase === 'fight' && b.phase === 'done' && b.result) act(finishFight(m, b.result.winner));
    const now = Date.now();
    if (m.phase === 'wait' && m.role === 'guest' && shown === 'wait' && now - joinT > JOIN_MS && !card.querySelector('.warn')) waitCard();
    if (peerSeen && now - peerSeen > GONE_MS && shown !== 'gone' && shown !== 'leave') {
      const p = room && pickPeer(room.peers());
      if (p) peerSeen = now; else goneCard();
    }
  }
  const covered = () => !ov.hidden && shown !== 'round';
  return { frame, covered, active: () => !!m, leave };
}
