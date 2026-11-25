// 2 gegen 2 online (25.11.): Lobby mit vier Sitzen, Malen im eigenen Bereich, Duelle und Finale (Staffel) oder ein
// gemeinsamer Kampf (Feld), Punktestand. Regeln und Ablauf: team.js (rein); Verbindung: net.js (Live-Raum).
// Einstieg: team.open() (Lobby) oder team.join(code). Gemalt wird wie im Online-1v1 (battle.hot mit online: true,
// team2: true, def = Regel des Sitzes, zoneY = Viertel im Feld-Modus).
import {
  createTeamMatch, teamView, KS, teamPeers, hostStart, teamReady, teamResult, teamNext, full, missing, openTeamRooms,
  seatDef, seatBudget, seatZone, roundLists, winners, createRun, finaleList, staffelWinner, roomName, SEAT_TEAM, MODES, BUDGETS, BUDGET_DEFAULT, duelOf, mate,
} from '../team.js';
import { makeCode, normCode, packArmy, CAT_NAME } from '../online.js';
import { MAP, applyMap, mapSVG } from '../rules.js';
import { cleanName, NAME_MAX } from '../dailyboard.js';
import { getRoom } from '../net.js';
import { fmtPts } from '../cards.js';
import { tr } from '../i18n.js';

const LIVE_URL = 'https://claude.ai/artifact/HnB3bdhDEz8psMDZ3GGP5W';
const NAME_KEY = 'kritzel-hill-name';   // derselbe Name wie auf dem Hügel
const GONE_MS = 8000;
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const TEAM_N = { blau: tr('Team Blau'), rot: tr('Team Rot') };
const MODE_N = { staffel: tr('Staffel'), feld: tr('Gemeinsames Feld') };
const MODE_D = {
  staffel: tr('Zwei Duelle gleichzeitig, danach kämpfen alle Überlebenden im Finale weiter.'),
  feld: tr('Ein Feld, jeder malt sein Viertel mit einer eigenen Kategorie.'),
};
const AREA_N = [tr('links oben'), tr('links unten'), tr('rechts oben'), tr('rechts unten')];

const CSS = `
.card.t2{max-width:640px;align-items:flex-start}
.t2seats{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%}
.t2team{border:2px solid var(--ink);border-radius:14px;padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.t2team.blau{background:#eaf0ff}.t2team.rot{background:#ffecec}
.t2team h4{margin:0;font-family:var(--f-logo);font-weight:400;font-size:18px;letter-spacing:.5px}
.t2team.blau h4{color:#2a5fd6}.t2team.rot h4{color:#d63a3a}
.t2seat{background:#fff;border:1.5px solid var(--line);border-radius:10px;padding:6px 10px;font-weight:800;min-height:20px}
.t2seat.empty{color:var(--muted);font-weight:600;border-style:dashed}
.t2seat.me{box-shadow:0 0 0 2px var(--selb)}
.card.t2 input.t2n{font:800 15px var(--f-ui);letter-spacing:0;text-transform:none;width:170px}
.t2duel{display:grid;grid-template-columns:1fr 1fr;gap:8px;width:100%}
.t2duel div{border:2px solid var(--ink);border-radius:12px;padding:8px 10px;background:#fffbe9}
#batTeam.on{background:var(--sel);border-color:var(--selb)}
`;

export function createTeamUI({ game, world, ui, audio, onlineFight, clearWorld, undoStack, markAll }) {
  { const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }
  const $ = id => document.getElementById(id);
  let net = null, room = null, m = null, battleRef = null, unsubs = [], lastPub = '', pubRetry = 0, lobbyUnsub = null;
  let name = '';
  try { name = cleanName(localStorage.getItem(NAME_KEY) || ''); } catch (e) { /* ohne Speicher */ }
  // Kampf-Ablauf der Runde: { stage: 'duel' | 'finale' | 'done', runs, results, finale, winner }
  let fx = null, goneSince = 0, goneAck = false;

  /* ---------- Knopf: nur im laufenden 2v2 sichtbar (Verlassen); hinein geht es über die Online-Lobby ---------- */
  const btn = document.createElement('button');
  btn.className = 'btn'; btn.id = 'batTeam'; btn.innerHTML = '<span class="ico" aria-hidden="true">👥</span><span></span>'; const lab = btn.lastChild; lab.textContent = tr('2v2');
  btn.title = tr('2 gegen 2 online: zwei Teams, vier Geräte');
  { const vs = $('batVs'); if (vs) vs.append(btn); else $('batGo').before(btn); }
  btn.onclick = () => { if (m) confirmLeave(); else open(); };

  const go = $('batGo'), goPrev = go.onclick;
  go.onclick = e => {
    if (!m) { if (goPrev) goPrev.call(go, e); return; }
    e.currentTarget.blur();
    if (m.phase === 'paint') ready();
    else if (m.phase === 'result') act(teamNext(m));
  };

  /* ---------- Karte ---------- */
  const ov = document.createElement('div');
  ov.className = 'ov'; ov.id = 'ovTeam'; ov.hidden = true;
  ov.innerHTML = '<div class="card onl t2 shadow" role="dialog" aria-modal="true" aria-labelledby="t2Title"></div>';
  $('app').append(ov);
  const card = ov.firstChild;
  let shown = '';
  const hideCard = () => { ov.hidden = true; shown = ''; if (lobbyUnsub) { lobbyUnsub(); lobbyUnsub = null; } };
  const showCard = (kind, html) => { card.innerHTML = html; shown = kind; ov.hidden = false; };
  const nameRow = () => `<div class="row"><label class="muted" for="t2Name">${tr('Dein Name')}</label><input class="t2n" id="t2Name" maxlength="${NAME_MAX}" placeholder="${tr('Name')}" autocomplete="off" spellcheck="false" value="${esc(name)}"></div>`;
  function wireName() {
    const inp = $('t2Name'); if (!inp) return;
    inp.oninput = () => { name = cleanName(inp.value); try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* egal */ } if (m) { m.name = name; publish(); } };
    inp.onkeydown = e => e.stopPropagation();
  }

  // Einstieg: Modus, Budget, Raum erstellen oder beitreten
  const pick = { mode: 'staffel', budget: BUDGET_DEFAULT };
  // mode: 'tft' | 'staffel' | 'feld' (vorgewählt) oder leer
  async function open(mode) {
    if (mode === 'tft') mode = 'staffel';
    if (MODES.includes(mode)) pick.mode = mode;
    const b = game.battle; if (!b || b.phase !== 'plan' || b.hot) return;
    showCard('open', `<h2 id="t2Title">${tr('2 gegen 2')}</h2><p class="muted">${tr('Verbinde …')}</p>`);
    net = await getRoom();
    if (shown !== 'open') return;
    if (!net) {
      showCard('open', `<h2 id="t2Title">${tr('2 gegen 2')}</h2>
        <p>${tr('2 gegen 2 braucht die Live-Verbindung. Spiel es in der <a href="{u}" target="_blank" rel="noopener">Live-Version</a> (nur mit Einladung).', { u: LIVE_URL })}</p>
        <div class="btnrow"><button class="btn" id="t2Close">${tr('Schließen')}</button></div>`);
      $('t2Close').onclick = hideCard; return;
    }
    const opt = (k, v, inner) => `<button class="btn${pick[k] === v ? ' on' : ''}" data-k="${k}" data-v="${v}">${inner}</button>`;
    showCard('open', `<h2 id="t2Title">${tr('2 gegen 2')}</h2>
      <p>${tr('Vier Spieler, zwei Teams. Ihr malt verdeckt, aufgedeckt wird beim Kampf.')}</p>
      <h3>${tr('Modus')}</h3>
      <div class="vopts" style="grid-template-columns:1fr 1fr">${MODES.map(id => opt('mode', id, `<b>${esc(MODE_N[id])}</b><span>${esc(MODE_D[id])}</span>`)).join('')}</div>
      <h3>${tr('Budget')}</h3>
      <div class="hotbud">${BUDGETS.map(v => opt('budget', v, `<b>${v}</b><span>${tr('Punkte je Spieler')}</span>`)).join('')}</div>
      ${nameRow()}
      <div class="row"><button class="go" id="t2Create">${tr('Raum erstellen')}</button></div>
      <div class="row"><input id="t2Room" maxlength="6" placeholder="CODE" autocomplete="off" spellcheck="false" aria-label="${tr('Raumcode')}"><button class="btn" id="t2Join">${tr('Beitreten')}</button></div>
      <div class="rooms" id="t2Rooms"></div>
      <div class="btnrow"><button class="btn" id="t2Close">${tr('Abbrechen')}</button></div>`);
    card.querySelectorAll('[data-k]').forEach(b2 => { b2.onclick = () => { const k = b2.dataset.k; pick[k] = k === 'budget' ? +b2.dataset.v : b2.dataset.v; open(); }; });
    wireName();
    $('t2Create').onclick = () => start('host', makeCode());
    const joinIt = () => { const c = normCode($('t2Room').value); if (!c) { ui.toast(tr('Der Code hat 4 Zeichen, z. B. KX7P.')); return; } start('guest', c); };
    $('t2Join').onclick = joinIt;
    $('t2Room').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') joinIt(); };
    $('t2Close').onclick = hideCard;
    const render = () => {
      const box = $('t2Rooms'); if (!box) return;
      const rs = openTeamRooms(net.peers());
      box.innerHTML = rs.length ? `<span class="muted">${tr('Offene 2v2-Räume')}</span>${rs.map(r => `<button class="btn" data-c="${esc(r.code)}"><span>${tr('Raum {c}', { c: esc(r.code) })} · ${esc(MODE_N[r.mode])}</span><span>${r.n}/4 · ${tr('Beitreten')}</span></button>`).join('')}` : '';
      box.querySelectorAll('[data-c]').forEach(b2 => { b2.onclick = () => start('guest', b2.dataset.c); });
    };
    try { lobbyUnsub = net.onPeers(render, () => {}); } catch (e) { /* ohne Liste */ }
    render();
  }
  async function join(code) { const c = normCode(code); if (!c) return; net = net || await getRoom(); if (net) start('guest', c); }

  let joining = false;
  async function start(role, code) {
    if (joining || m) return;
    const b = game.battle; if (!b || b.phase !== 'plan' || b.hot) return;
    if (!name) { ui.toast(tr('Gib zuerst deinen Namen ein.')); if ($('t2Name')) $('t2Name').focus(); return; }
    joining = true;
    try {
      showCard('joining', `<h2 id="t2Title">${tr('2 gegen 2')}</h2><p class="muted">${tr('Verbinde …')}</p>`);
      let r;
      try { r = await net.join(roomName(code)); } catch (e) { hideCard(); ui.toast(tr('Keine Verbindung zum Raum. Versuch es gleich noch mal.')); return; }
      if (game.battle !== b || b.hot || m) { try { r.leave(); } catch (e) { /* weg */ } hideCard(); return; }
      room = r;
      m = createTeamMatch(role, pick.mode, pick.budget);
      m.code = code; m.name = name;
      const meP = room.peers().find(p => p.isMe);
      m.me = meP ? meP.peer : null;
      if (role === 'host') m.seats[0] = m.me;
      battleRef = b; lastPub = ''; fx = null; goneSince = 0; goneAck = false;
      game.clear(); undoStack.length = 0;
      b.hot = { online: true, team2: true, budget: 0, step: 'online', spent: { blau: 0, rot: 0 }, def: null };
      unsubs.push(room.onPeers(onPeers, () => {}));
      publish(); lobbyCard(); sync();
    } finally { joining = false; }
  }
  function leave(msg) {
    clearTimeout(pubRetry); pubRetry = 0;
    for (const u of unsubs) try { u(); } catch (e) { /* weg */ }
    unsubs = [];
    if (room) try { room.leave(); } catch (e) { /* weg */ }
    if (net && m && m.openK && m.openK !== 'null') try { net.presence({ open: null }); } catch (e) { /* weg */ }
    room = null; m = null; fx = null;
    hideCard();
    const b = battleRef; battleRef = null;
    if (b && game.battle === b) {
      game.endReplay(true);
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
    const v = teamView(m), txt = JSON.stringify(v);
    if (txt === lastPub) return;
    lastPub = txt; clearTimeout(pubRetry); pubRetry = 0;
    room.presence(v).catch(() => { if (lastPub === txt) lastPub = ''; if (room && m && !pubRetry) pubRetry = setTimeout(() => { pubRetry = 0; publish(); }, 1500); });
    // Lobby-Eintrag „offener Raum“ (Host, solange Sitze frei sind)
    if (m.role === 'host' && net) {
      // Lobby-Eintrag wie beim 1v1 (open), mit mode, damit die gemeinsame Online-Lobby ihn als 2v2-Raum zeigt
      const n = m.seats.filter(Boolean).length, open = m.phase === 'lobby' && n < 4 ? { code: m.code, budget: m.budget, mode: m.mode === 'staffel' ? 'tft' : 'feld', n } : null;
      const k = JSON.stringify(open);
      if (k !== m.openK) { m.openK = k; try { net.presence({ ks: KS, open }); } catch (e) { /* ohne Lobby */ } }
    }
  }
  function onPeers() {
    if (!m || !room) return;
    const peers = room.peers();
    if (!m.me) { const meP = peers.find(p => p.isMe); if (meP) { m.me = meP.peer; if (m.role === 'host') m.seats[0] = m.me; } }
    act(teamPeers(m, peers, world.W, world.H));
  }

  /* ---------- Ablauf ---------- */
  function act(evs) {
    for (const e of evs) {
      if (e === 'seats' || e === 'mode') { if (m.phase === 'lobby' && shown === 'lobby') lobbyCard(); }
      else if (e === 'round') beginRound();
      else if (e === 'fight') beginFight();
      else if (e === 'error') ui.toast(tr('Eine Armee war ungültig und kämpft nicht mit.'));
      else if (e === 'score' || e === 'result') decorate();
    }
    publish(); sync();
  }
  function lobbyCard() {
    if (!m) return;
    const seat = i => {
      const id = m.seats[i], me = i === m.seat;
      return id ? `<div class="t2seat${me ? ' me' : ''}">${esc(m.names[i] || tr('Spieler {n}', { n: i + 1 }))}${me ? ` <span class="muted">(${tr('du')})</span>` : ''}${i === 0 ? ' 👑' : ''}</div>` : `<div class="t2seat empty">${tr('frei')}</div>`;
    };
    const team = t => `<div class="t2team ${t}"><h4>${TEAM_N[t]}</h4>${[0, 1, 2, 3].filter(i => SEAT_TEAM[i] === t).map(seat).join('')}
      ${m.role !== 'host' ? `<button class="btn" data-team="${t}"${m.pref === t ? ' disabled' : ''}>${tr('In dieses Team')}</button>` : ''}</div>`;
    const n = m.seats.filter(Boolean).length;
    showCard('lobby', `<h2 id="t2Title">${tr('2 gegen 2')}: <span class="cat">${esc(MODE_N[m.mode])}</span></h2>
      <div class="row"><div class="code">${esc(m.code)}</div><div class="muted">${tr('Gib deinen drei Mitspielern diesen Code.')}<br>${esc(MODE_D[m.mode])} ${tr('{n} Punkte je Spieler.', { n: m.budget })}</div></div>
      <div class="t2seats">${team('blau')}${team('rot')}</div>
      ${nameRow()}
      <div class="btnrow">${m.role === 'host' ? `<button class="go" id="t2Start"${full(m) ? '' : ' disabled'}>${full(m) ? tr('Spiel starten') : tr('Warte auf Spieler ({n}/4) …', { n })}</button>` : `<button class="go" disabled>${tr('Warte auf den Start …')}</button>`}
        <button class="btn" id="t2Leave">${tr('Verlassen')}</button></div>`);
    wireName();
    card.querySelectorAll('[data-team]').forEach(b => { b.onclick = () => { m.pref = b.dataset.team; publish(); lobbyCard(); }; });
    if ($('t2Start')) $('t2Start').onclick = () => act(hostStart(m));
    $('t2Leave').onclick = () => leave(tr('2v2 verlassen.'));
  }
  function resetField() {
    const b = game.battle; if (!b) return null;
    game.endReplay(true);
    $('ovBat').hidden = true; document.body.classList.remove('bat-res');
    b.phase = 'plan'; b.stats = null; b.result = null; b.endT = -1; b.t = 0; b.snap = null; b.batchRes = null;
    clearWorld(); world.teamMode = true; undoStack.length = 0;
    return b;
  }
  function beginRound() {
    const b = resetField(); if (!b || m.seat < 0) return;
    const c = m.cfg, side = SEAT_TEAM[m.seat], z = seatZone(c.mode, m.seat);
    fx = null;
    applyMap(world, c.map); markAll();
    b.hot = { online: true, team2: true, budget: seatBudget(c, m.seat), step: side, spent: { blau: 0, rot: 0 }, def: seatDef(c, m.seat), zoneY: c.mode === 'feld' ? [z.y[0] * world.H, z.y[1] * world.H] : null };
    game.setCat(c.cats[m.seat]);
    ui.updateBattle(); ui.updateCounts(); ui.updateControls();
    audio.play('whoosh');
    roundCard();
  }
  function roundCard() {
    const c = m.cfg, side = SEAT_TEAM[m.seat];
    const where = c.mode === 'feld' ? tr('Du malst {a}.', { a: AREA_N[m.seat] }) : tr(side === 'blau' ? 'Du malst links gegen {o}.' : 'Du malst rechts gegen {o}.', { o: esc(m.names[m.seat ^ 2] || tr('Spieler {n}', { n: (m.seat ^ 2) + 1 })) });
    const cats = c.mode === 'feld' ? `<p>${[0, 1, 2, 3].map(i => `<b class="${SEAT_TEAM[i]}">${esc(m.names[i] || '?')}</b>: ${esc(tr(CAT_NAME[c.cats[i]]))}`).join(' · ')}</p>` : '';
    showCard('round', `<h2 id="t2Title">${tr('Runde {r}', { r: c.r })}: <span class="cat">${esc(tr(CAT_NAME[c.cats[m.seat]]))}</span></h2>
      <div class="row"><div class="mapprev">${mapSVG(c.map, 220, 124)}</div><div><b>${esc(tr(MAP[c.map].n))}</b><br><span class="muted">${esc(MODE_N[c.mode])} · ${TEAM_N[side]}</span></div></div>
      <p>${where} ${tr('{n} Punkte', { n: seatBudget(c, m.seat) })}. ${c.mode === 'staffel' ? tr('Danach treffen sich alle Überlebenden im Finale.') : ''}</p>${cats}
      <div class="btnrow"><button class="go" id="t2Ok">${tr('Los geht\'s')}</button></div>`);
    $('t2Ok').onclick = hideCard; $('t2Ok').focus();
  }
  function ready() {
    if (!m || m.phase !== 'paint') return;
    if (!world.units.some(u => u.alive && u.team === SEAT_TEAM[m.seat])) { ui.toast(tr('Male zuerst deine Armee ({c}).', { c: tr(CAT_NAME[m.cfg.cats[m.seat]]) })); return; }
    game.battle.hot.step = 'online'; undoStack.length = 0;
    act(teamReady(m, packArmy(world, SEAT_TEAM[m.seat])));
    // gleich noch einmal auswerten: vielleicht sind die anderen schon fertig
    onPeers();
  }
  // Alle Armeen da: Kämpfe rechnen (im Hintergrund, in Häppchen) und den eigenen zeigen
  function beginFight() {
    hideCard();
    const c = m.cfg, lists = roundLists(c, m.armies), seeds = [c.seed, c.seed2 + 1];
    fx = { stage: 'duel', runs: lists.map((l, k) => createRun(l, c.map, seeds[k], world.W, world.H)), results: null, finale: null, winner: null, lists };
    const k = c.mode === 'feld' ? 0 : duelOf(m.seat);
    onlineFight(lists[k], seeds[k], c.map);
    ui.toast(c.mode === 'feld' ? tr('Aufgedeckt!') : tr('Duell {k}: du gegen {o}', { k: k + 1, o: m.names[m.seat ^ 2] || '?' }));
  }
  function startFinale() {
    const c = m.cfg, fl = finaleList(fx.results, world.W);
    if (!fl) { fx.stage = 'done'; fx.winner = staffelWinner(fx.results); act(teamResult(m, fx.winner)); showEnd(); return; }
    fx.stage = 'finale';
    fx.finale = createRun(fl, c.map, c.seed2, world.W, world.H);
    hideCard();
    onlineFight(fl, c.seed2, c.map);
    ui.toast(tr('Finale: alle Überlebenden!'));
  }
  function duelCard() {
    const c = m.cfg, r = fx.results;
    const line = k => {
      const res = r[k], b = k, red = k + 2, n = winners(res).length;
      const w = res.winner === 'draw' ? tr('Unentschieden') : tr('{t} gewinnt', { t: TEAM_N[res.winner] });
      return `<div><b>${tr('Duell {k}', { k: k + 1 })}</b>: ${esc(m.names[b] || '?')} – ${esc(m.names[red] || '?')}<br>${w}<br><span class="muted">${tr('{n} Überlebende laufen ins Finale', { n })}</span></div>`;
    };
    showCard('duels', `<h2 id="t2Title">${tr('Duelle vorbei')}</h2><div class="t2duel">${line(0)}${line(1)}</div>
      <p class="muted">${tr('Die Überlebenden beider Duelle treffen sich jetzt im Finale.')}</p>
      <div class="btnrow"><button class="go" id="t2Fin">${tr('Zum Finale')}</button></div>`);
    $('t2Fin').onclick = startFinale; $('t2Fin').focus();
    fx.autoT = setTimeout(() => { if (fx && fx.stage === 'duel' && shown === 'duels') startFinale(); }, 4000);
    void c;
  }
  function showEnd() {
    const b = game.battle;
    if (b && b.phase === 'done' && b.result) ui.showBattleResult(b.result); else decorate();
  }

  /* ---------- Ergebnis ---------- */
  const origShow = ui.showBattleResult;
  ui.showBattleResult = r => {
    // Staffel: das Ergebnis des eigenen Duells erst zeigen, wenn die Runde ganz vorbei ist
    if (m && fx && m.cfg && m.cfg.mode === 'staffel' && fx.stage === 'duel') return;
    origShow(r); decorate();
  };
  function decorate() {
    const on = !!m && !!game.battle && game.battle === battleRef;
    let box = $('t2Res');
    if (!on || m.phase !== 'result') { if (box) box.remove(); return; }
    for (const id of ['batAgain', 'batTen', 'batEdit']) $(id).hidden = true;
    if (!box) { box = document.createElement('div'); box.className = 'onlbox'; box.id = 't2Res'; $('ovBat').querySelector('.btnrow').before(box); }
    const my = SEAT_TEAM[m.seat], w = m.last, waiting = m.want > m.cfg.r;
    const note = w === 'draw' ? tr('Unentschieden, kein Punkt.') : w === my ? tr('Euer Team gewinnt die Runde!') : tr('Das andere Team gewinnt die Runde.');
    box.innerHTML = `<div><div class="muted">${tr('2 gegen 2')} · ${esc(MODE_N[m.cfg.mode])} · ${tr('Runde {r}', { r: m.cfg.r })} · ${TEAM_N[my]}</div>
        <div class="sc"><span class="blau">${TEAM_N.blau} ${m.score.blau}</span> : <span class="rot">${m.score.rot} ${TEAM_N.rot}</span></div><div class="muted">${esc(note)}</div>
        ${waiting ? `<div class="muted">${tr('Warte auf die anderen …')}</div>` : ''}</div>
      <div class="btnrow"><button class="go" id="t2Next"${waiting ? ' disabled' : ''}>${tr('Nächste Runde')}</button><button class="btn" id="t2Out">${tr('Verlassen')}</button></div>`;
    $('t2Next').onclick = () => act(teamNext(m));
    $('t2Out').onclick = () => confirmLeave();
  }
  function confirmLeave() {
    showCard('leave', `<h2 id="t2Title">${tr('2v2 verlassen?')}</h2><p>${m ? `${TEAM_N.blau} ${m.score.blau} : ${m.score.rot} ${TEAM_N.rot}` : ''}</p>
      <div class="btnrow"><button class="go" id="t2Yes">${tr('Verlassen')}</button><button class="btn" id="t2Stay">${tr('Weiterspielen')}</button></div>`);
    $('t2Stay').onclick = hideCard;
    $('t2Yes').onclick = () => leave(tr('2v2 verlassen.'));
  }

  /* ---------- Anzeige ---------- */
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  function sync() {
    const b = game.battle, plan = !!b && b.phase === 'plan';
    const on = !!m && !!b && b === battleRef && !!b.hot && b.hot.team2;
    btn.hidden = !on;   // Einstieg über die Online-Lobby (ui/online.js); der Knopf dient nur noch zum Verlassen
    lab.textContent = on ? tr('2v2 verlassen') : tr('2v2');
    btn.classList.toggle('on', on);
    if (!on) return;
    go.classList.remove('stop');
    for (const id of ['batHot', 'batOnl', 'batDuel', 'batHill', 'batSwap', 'batShare']) if ($(id)) $(id).hidden = true;
    const ph = m.phase, c = m.cfg;
    $('batClear').hidden = ph !== 'paint';
    setText(go, tr(ph === 'paint' ? 'Fertig' : ph === 'result' ? (m.want > c.r ? 'Warte …' : 'Nächste Runde') : ph === 'fight' ? 'Kampf läuft' : 'Warte …'));
    go.disabled = !(ph === 'paint' || (ph === 'result' && m.want <= c.r));
    const head = c ? `2v2 · ${MODE_N[c.mode]} · ${tr('Runde {r}', { r: c.r })} · ${TEAM_N.blau} ${m.score.blau} : ${m.score.rot} ${TEAM_N.rot}` : `2v2 · ${tr('Raum {c}', { c: m.code })}`;
    const tail = ph === 'paint' ? `${tr(CAT_NAME[c.cats[m.seat]])} · ${c.mode === 'feld' ? AREA_N[m.seat] : SEAT_TEAM[m.seat] === 'blau' ? tr('links') : tr('rechts')}: ${fmtPts(b.hot.spent[SEAT_TEAM[m.seat]])} / ${seatBudget(c, m.seat)}`
      : ph === 'ready' ? tr('fertig, {n} von 4 sind bereit', { n: m.readyN || 1 }) : ph === 'fight' ? (fx && fx.stage === 'finale' ? tr('Finale') : tr('Kampf läuft')) : ph === 'lobby' ? tr('Lobby') : tr('Runde vorbei');
    setText($('batHint'), `${head} · ${tail}`);
    if (plan && ph === 'paint') {
      const side = SEAT_TEAM[m.seat], other = side === 'blau' ? 'rot' : 'blau';
      setText($(side === 'blau' ? 'ptsB' : 'ptsR'), fmtPts(b.hot.spent[side]));
      setText($(other === 'blau' ? 'ptsB' : 'ptsR'), '?');
    }
  }
  const prevSync = game.onlineUI;
  game.onlineUI = () => { if (prevSync) prevSync(); sync(); };

  // je Bild: Kämpfe weiterrechnen, Duelle → Finale → Ergebnis, fehlende Spieler
  function frame() {
    if (!m) return;
    const b = game.battle;
    if (!b || b !== battleRef) { leave(null); return; }
    if (fx && m.phase === 'fight') {
      if (fx.stage === 'duel') {
        let all = true;
        for (const r of fx.runs) if (!r.done) { r.pump(4); all = all && r.done; }
        const shownDone = b.phase === 'done' && b.result;
        if (all && shownDone) {
          fx.results = fx.runs.map(r => r.result);
          if (m.cfg.mode === 'feld') { fx.stage = 'done'; fx.winner = fx.results[0].winner; act(teamResult(m, fx.winner)); showEnd(); }
          else if (shown !== 'duels') duelCard();
        }
      } else if (fx.stage === 'finale') {
        if (!fx.finale.done) fx.finale.pump(4);
        if (fx.finale.done && b.phase === 'done' && b.result) { fx.stage = 'done'; fx.winner = fx.finale.result.winner; act(teamResult(m, fx.winner)); showEnd(); }
      }
    }
    if (room && m.phase !== 'lobby') {
      const gone = missing(m, room.peers());
      if (gone.length) {
        if (!goneSince) goneSince = Date.now();
        if (!goneAck && Date.now() - goneSince > GONE_MS && shown !== 'gone' && shown !== 'leave') {
          showCard('gone', `<h2 id="t2Title">${tr('Ein Spieler ist weg')}</h2><p>${esc(gone.map(i => m.names[i] || tr('Spieler {n}', { n: i + 1 })).join(', '))}: ${tr('Die Verbindung ist abgerissen. Kommt er zurück, geht es weiter.')}</p>
            <div class="btnrow"><button class="btn" id="t2Wait">${tr('Warten')}</button><button class="go" id="t2Yes">${tr('Verlassen')}</button></div>`);
          $('t2Wait').onclick = () => { goneAck = true; hideCard(); };
          $('t2Yes').onclick = () => leave(tr('2v2 verlassen.'));
        }
      } else { goneSince = 0; goneAck = false; if (shown === 'gone') hideCard(); }
    }
  }
  const covered = () => !ov.hidden && shown !== 'round';
  const api = { open, join, frame, covered, active: () => !!m, leave, mate };
  game.teamUI = api;   // Einstieg für die gemeinsame Online-Lobby (ui/online.js)
  return api;
}
