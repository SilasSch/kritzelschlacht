// Online 1 gegen 1 (18.11.): Knopf in der Schlachtleiste, Lobby (Raum erstellen, Code eingeben, offene Räume),
// Rundenkarte, Leiste während des Spiels und Punktestand im Ergebnis. Regeln und Ablauf: online.js (rein); Verbindung:
// net.js. Gemalt wird wie im Hotseat (battle.hot mit online: true und def = Kategorie der Runde), nur die eigene Hälfte;
// die Armee des Gegners kommt erst zum Kampf in die Welt.
import {
  createMatch, view, hostStart, markReady, finishFight, wantNext, onPeer, officialWinner, pickPeer, openRooms,
  makeCode, normCode, roomName, roundDef, packArmy, CAT_NAME, ONLINE_BUDGETS, ONLINE_DEFAULT, PROTO,
} from '../online.js';
import { getRoom } from '../net.js';
import { fmtPts } from '../cards.js';

const CSS = `
#ovOnl{z-index:7}
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
`;
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SIDE_N = { blau: 'Blau', rot: 'Rot' };
const GONE_MS = 6000;      // so lange darf der Gegner fehlen (Neuverbindung), bevor die Karte „Gegner ist weg“ kommt
const JOIN_MS = 8000;      // so lange sucht der Gast nach dem Host

export function createOnlineUI({ game, world, ui, audio, hotseat, onlineFight, clearWorld, undoStack }) {
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
    else if (m.phase === 'result') { act(wantNext(m)); }
  };

  /* ---------- Karte ---------- */
  const ov = document.createElement('div');
  ov.className = 'ov'; ov.id = 'ovOnl'; ov.hidden = true;
  ov.innerHTML = '<div class="card onl shadow" role="dialog" aria-modal="true" aria-labelledby="onlTitle"></div>';
  $('app').append(ov);
  const card = ov.firstChild;
  let shown = '';
  const hideCard = () => { ov.hidden = true; shown = ''; ov.classList.remove('onl-round'); if (lobbyUnsub) { lobbyUnsub(); lobbyUnsub = null; } };
  const showCard = (kind, html) => { card.innerHTML = html; shown = kind; ov.hidden = false; };

  async function openLobby() {
    let pick = ONLINE_DEFAULT;
    showCard('lobby', `<h2 id="onlTitle">Online 1 gegen 1</h2><p class="muted">Verbinde …</p>`);
    net = await getRoom();
    if (shown !== 'lobby') return;
    if (!net) {
      showCard('lobby', `<h2 id="onlTitle">Online 1 gegen 1</h2>
        <p>Das Online-Spiel braucht die Live-Verbindung des Claude-Artefakts. Sie ist hier nicht verfügbar.</p>
        <p class="muted">Öffne das Spiel als Claude-Artefakt und melde dich an. Dein Gegner braucht ebenfalls Zugriff auf das Artefakt (Einladung) und muss angemeldet sein; über einen öffentlichen Link geht es nicht.</p>
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
  function roundCard() {
    const c = m.cfg;
    ov.classList.add('onl-round');
    showCard('round', `<h2 id="onlTitle">Runde ${c.r}: <span class="cat">${esc(CAT_NAME[c.cat])}</span></h2>
      <p>Male deine Armee nur aus <b>${esc(CAT_NAME[c.cat])}</b>, ${c.budget} Punkte. Du bist <b>${SIDE_N[m.side]}</b> (${m.side === 'blau' ? 'links' : 'rechts'}). Dein Gegner sieht nichts, bis beide fertig sind.</p>
      <div class="btnrow"><button class="go" id="onlOk">Los geht's</button></div>`);
    $('onlOk').onclick = hideCard; $('onlOk').focus();
    clearTimeout(roundT); roundT = setTimeout(() => { if (shown === 'round') hideCard(); }, 5000);
  }
  function goneCard() {
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
    hideCard();
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
      if (e === 'round') beginRound();
      else if (e === 'fight') beginFight();
      else if (e === 'error') ui.toast(`Die Armee des Gegners war ungültig (${m.error}). Sie kämpft nicht mit.`);
      else if (e === 'peerres' || e === 'score' || e === 'result') decorate();
    }
    publish(); sync();
  }
  function beginRound() {
    const b = game.battle; if (!b || !m) return;
    game.endReplay(true);
    $('ovBat').hidden = true; document.body.classList.remove('bat-res');
    b.phase = 'plan'; b.stats = null; b.result = null; b.endT = -1; b.t = 0; b.snap = null; b.batchRes = null;
    clearWorld(); world.teamMode = true; undoStack.length = 0;
    b.hot = { online: true, budget: m.cfg.budget, step: m.side, spent: { blau: 0, rot: 0 }, def: roundDef(m.cfg) };
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
    onlineFight(m.fight.units, m.fight.seed);
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
    box.innerHTML = `<div><div class="muted">Runde ${m.cfg.r} · ${esc(CAT_NAME[m.cfg.cat])} · du bist ${SIDE_N[m.side]}</div>
        <div class="sc"><span class="blau">Blau ${m.score.blau}</span> : <span class="rot">${m.score.rot} Rot</span></div><div class="muted">${esc(note)}</div></div>
      <div class="btnrow"><button class="go" id="onlNext"${m.want > m.cfg.r ? ' disabled' : ''}>${m.want > m.cfg.r ? 'Warte auf Gegner …' : 'Nächste Runde'}</button><button class="btn" id="onlLeave">Verlassen</button></div>`;
    $('onlNext').onclick = () => act(wantNext(m));
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
    setText(go, ph === 'paint' ? 'Fertig' : ph === 'result' ? (m.want > c.r ? 'Warte auf Gegner …' : 'Nächste Runde') : ph === 'fight' ? 'Kampf läuft' : 'Warte …');
    go.disabled = !(ph === 'paint' || (ph === 'result' && m.want <= c.r));
    const head = c ? `Online · Runde ${c.r} · ${CAT_NAME[c.cat]} · ${scoreText()}` : `Online · Raum ${m.code}`;
    const tail = ph === 'wait' ? 'warte auf Gegner'
      : ph === 'paint' ? `du malst ${m.side === 'blau' ? 'links' : 'rechts'}: ${fmtPts(b.hot.spent[m.side])} / ${c.budget} Punkte`
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
