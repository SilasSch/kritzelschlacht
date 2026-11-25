// Online 1 gegen 1 (18.11.): Knopf in der Schlachtleiste, Lobby (Raum erstellen, Code eingeben, offene Räume),
// Rundenkarte, Leiste während des Spiels und Punktestand im Ergebnis. Regeln und Ablauf: online.js (rein); Verbindung:
// net.js. Gemalt wird wie im Hotseat (battle.hot mit online: true und def = Kategorie der Runde), nur die eigene Hälfte;
// die Armee des Gegners kommt erst zum Kampf in die Welt.
import {
  createMatch, view, hostStart, markReady, finishFight, wantNext, onPeer, officialWinner, pickPeer, openRooms,
  makeCode, normCode, roomName, roundDef, packArmy, CAT_NAME, ONLINE_BUDGETS, ONLINE_DEFAULT, PROTO, castVote, budgetOf, giveUp, canGiveUp,
  EMOTES, sendEmote, cleanSet, setDiff, proposeSet, answerProp, matchWinner, myPick, PICKS, MAP_MODES, TIMES, GOALS,
} from '../online.js';
import { RULE, MAP, applyMap, mapSVG, RULE_GROUPS, rulePool } from '../rules.js';
import { getRoom } from '../net.js';
// Live-Version des Artefakts (mit room-Capability, nur auf Einladung); die öffentliche Version verweist darauf
const LIVE_URL = 'https://claude.ai/artifact/HnB3bdhDEz8psMDZ3GGP5W';
import { fmtPts } from '../cards.js';
import { tr } from '../i18n.js';

const CSS = `
.card.vote{max-width:680px}
.vopts{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;width:100%}
@media (max-width:600px){.vopts{grid-template-columns:1fr}}
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
.onlemo{position:fixed;right:16px;top:50%;transform:translateY(-50%);z-index:59;display:flex;flex-direction:column;gap:6px;padding:6px;
  border:2px solid var(--ink);border-radius:999px;background:#fff;box-shadow:0 4px 0 var(--ink);pointer-events:auto}
.onlemo[hidden]{display:none}
.onlemo button{width:44px;height:44px;border:0;border-radius:50%;background:none;font-size:26px;line-height:1;cursor:pointer;padding:0}
.onlemo button:hover{background:var(--sel)}
.onlemo button:active{transform:scale(.88)}
.card.onl.lobby{max-width:780px}
.onlmodes{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;width:100%}
.onlmodes .btn{display:flex;flex-direction:column;align-items:flex-start;gap:3px;text-align:left;padding:10px 12px;min-height:92px}
.onlmodes .btn .ic{font-size:24px;line-height:1}
.onlmodes .btn b{font-family:var(--f-logo);font-weight:400;font-size:17px;letter-spacing:.4px;line-height:1.1}
.onlmodes .btn span{font-size:11.5px;color:var(--muted);font-weight:600;line-height:1.25}
.onlmodes .btn.on{background:var(--sel);border-color:var(--selb);box-shadow:0 0 0 2px var(--selb)}
.onlmodes .btn:disabled{opacity:.55}
#onlSetBox{width:100%}
.onlset{box-sizing:border-box;display:grid;grid-template-columns:auto 1fr;gap:8px 14px;align-items:center;width:100%;padding:12px 14px;border:1.5px solid var(--line);border-radius:14px;background:#fbfbfd}
.onlset .k{font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
.onlset .opts{display:flex;flex-wrap:wrap;gap:6px}
.onlset .opts button{border:1.5px solid var(--line);background:#fff;border-radius:999px;padding:5px 12px;font:700 13.5px var(--f-ui);color:var(--ink);cursor:pointer}
.onlset .opts button small{color:var(--muted);font-weight:700;margin-left:4px}
.onlset .opts button.on{background:var(--ink);border-color:var(--ink);color:#fff}
.onlset .opts button.on small{color:#cfd3dc}
.onlset .hint{grid-column:2;font-size:12px;color:var(--muted);margin-top:-4px}
.card.onl .rooms .btn small{color:var(--muted);font-weight:600}
.onldiff{display:flex;flex-direction:column;gap:4px;margin:4px 0 8px;font-weight:700}
.onldiff s{color:var(--muted);font-weight:600}
#onlRules.wait{background:#fff3b0}
.onlbox .match{font-family:var(--f-logo);font-size:20px;color:var(--go)}
.onlfly{position:fixed;z-index:58;font-size:64px;line-height:1;pointer-events:none;animation:onlFly 2.4s ease-out forwards;filter:drop-shadow(0 3px 2px rgba(0,0,0,.25))}
.onlfly small{display:block;font:800 13px var(--f-ui);text-align:center;color:var(--ink)}
@keyframes onlFly{0%{transform:translate(-50%,0) scale(.3);opacity:0}12%{transform:translate(-50%,-30px) scale(1.15);opacity:1}
  75%{opacity:1}100%{transform:translate(-50%,-220px) scale(1);opacity:0}}
@media (prefers-reduced-motion:reduce){.onlfly{animation-duration:1.6s}}
@media (prefers-reduced-motion:reduce){.onlban.hi,.onlask .card,.onlbox .peer{animation:none}}
`;
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SIDE_N = { blau: tr('Blau'), rot: tr('Rot') };
// Einstellungen der Partie (Lobby und „Regeln ändern“, 25.11.)
const pickN = v => (v === 'random' ? tr('Zufall') : v === 'loser' ? tr('Verlierer wählt') : tr('Abstimmung'));
const pickD = v => (v === 'random' ? tr('Regel und Karte werden ausgelost, sofort malen.') : v === 'loser' ? tr('Wer die letzte Runde verloren hat, sucht allein aus.') : tr('Ihr stimmt beide über Regel und Karte ab.'));
const mapsN = v => (v === 'feld' ? tr('Nur offenes Feld') : tr('Alle Karten'));
const timeN = t => (t ? (t % 60 ? tr('{n} s', { n: t }) : tr('{n} min', { n: t / 60 })) : tr('Ohne Limit'));
const goalN = g => (g ? tr('Best of {n}', { n: g * 2 - 1 }) : tr('Endlos'));
const SET_KEY = 'kritzelschlacht-online-set';
const loadSet = () => { try { return cleanSet(JSON.parse(localStorage.getItem(SET_KEY) || 'null')); } catch (e) { return cleanSet(null); } };
const saveSet = st => { try { localStorage.setItem(SET_KEY, JSON.stringify(st)); } catch (e) { /* ohne Speicher */ } };
const rulesN = groups => (groups.length === RULE_GROUPS.length ? tr('alle Regeln') : groups.map(g => tr(RULE_GROUPS.find(x => x.id === g).n)).join(' + '));
// Kurzfassung für Raumliste, Warten und Kopfzeile
function setSummary(st) {
  const a = [tr('{n} Punkte', { n: st.budget }), pickN(st.pick), rulesN(st.rules)];
  if (st.maps !== 'alle') a.push(mapsN(st.maps));
  if (st.time) a.push(tr('{t} malen', { t: timeN(st.time) }));
  if (st.goal) a.push(goalN(st.goal));
  return a.join(' · ');
}
// Eine Änderung in Worten: „Budget: 150 → 400“
const setK = k => ({ budget: tr('Budget'), pick: tr('Regelwahl'), rules: tr('Regeln'), maps: tr('Karten'), time: tr('Malzeit'), goal: tr('Match') })[k];
function setVal(k, v) {
  return k === 'budget' ? tr('{n} Punkte', { n: v }) : k === 'pick' ? pickN(v) : k === 'rules' ? rulesN(v)
    : k === 'maps' ? mapsN(v) : k === 'time' ? timeN(v) : goalN(v);
}
// Formular: Zeilen mit Knöpfen; onChange bekommt die neuen Einstellungen
function setFormHTML(st) {
  const row = (k, label, items, hint = '') => `<span class="k">${setK(k)}</span><div class="opts" data-k="${k}">${items}</div>${hint ? `<span></span><div class="hint">${hint}</div>` : ''}`;
  const opt = (k, v, on, html, title = '') => `<button type="button" data-k="${k}" data-v="${esc(JSON.stringify(v))}" class="${on ? 'on' : ''}"${title ? ` title="${esc(title)}"` : ''}>${html}</button>`;
  return `<div class="onlset">
    ${row('budget', '', ONLINE_BUDGETS.map(v => opt('budget', v, v === st.budget, `${v}<small>${tr('Pkt')}</small>`)).join(''))}
    ${row('pick', '', PICKS.map(v => opt('pick', v, v === st.pick, pickN(v), pickD(v))).join(''), esc(pickD(st.pick)))}
    ${row('rules', '', RULE_GROUPS.map(g => opt('rules', g.id, st.rules.includes(g.id), `${tr(g.n)}<small>${rulePool([g.id]).length}</small>`, tr(g.d))).join(''), tr('{n} Regeln im Topf', { n: rulePool(st.rules).length }))}
    ${row('maps', '', MAP_MODES.map(v => opt('maps', v, v === st.maps, mapsN(v))).join(''))}
    ${row('time', '', TIMES.map(v => opt('time', v, v === st.time, timeN(v))).join(''))}
    ${row('goal', '', GOALS.map(v => opt('goal', v, v === st.goal, goalN(v))).join(''))}
  </div>`;
}
function wireSetForm(root, get, set) {
  root.querySelectorAll('.onlset button').forEach(b => {
    b.onclick = () => {
      const k = b.dataset.k, v = JSON.parse(b.dataset.v), st = { ...get() };
      if (k === 'rules') {   // Gruppen an/aus, mindestens eine bleibt
        const has = st.rules.includes(v), next = has ? st.rules.filter(x => x !== v) : [...st.rules, v];
        if (!next.length) return;
        st.rules = next;
      } else st[k] = v;
      set(cleanSet(st));
    };
  });
}
const GONE_MS = 6000;      // so lange darf der Gegner fehlen (Neuverbindung), bevor die Karte „Gegner ist weg“ kommt
const JOIN_MS = 8000;      // so lange sucht der Gast nach dem Host

export function createOnlineUI({ game, world, ui, audio, hotseat, onlineFight, clearWorld, undoStack, markAll }) {
  const $ = id => document.getElementById(id);
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);

  let room = null, lobby = null, net = null, m = null, battleRef = null, unsubs = [], lastPub = '', peerSeen = 0, joinT = 0;
  let lobbyUnsub = null, roundT = 0, peerRef = null, goneAck = false, pubRetry = 0;
  let paintEnd = 0, paintWarned = false, lastSec = -1;   // Malzeit (Einstellung time)

  /* ---------- Knopf ---------- */
  const btn = document.createElement('button');
  btn.className = 'btn'; btn.id = 'batOnl'; btn.innerHTML = '<svg viewBox="0 0 24 24" class="ico"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/></svg><span></span>'; const lab = btn.lastChild; lab.textContent = tr('Online');
  btn.title = tr('Zwei Spieler auf zwei Geräten: jede Runde eine zufällige Kategorie, gleiches Budget, verdeckt malen');
  { const vs = $('batVs'); if (vs) vs.append(btn); else $('batGo').before(btn); }   // Gruppe „Zu zweit“ in der Leiste (UX 20.11.)
  btn.onclick = () => { if (m) confirmLeave(); else { const b = game.battle; if (b && b.phase === 'plan' && !b.hot) openLobby(); } };

  // Aufgeben: Runde an den Gegner (beim Malen, Warten oder im Kampf)
  const giveBtn = document.createElement('button');
  giveBtn.className = 'btn'; giveBtn.id = 'onlGive'; giveBtn.textContent = '🏳️ ' + tr('Aufgeben'); giveBtn.hidden = true;
  giveBtn.title = tr('Diese Runde aufgeben: der Punkt geht an deinen Gegner');
  $('batGo').before(giveBtn);
  giveBtn.onclick = () => { if (canGiveUp(m)) giveCard(); };
  // Regeln im Spiel ändern (25.11.): Vorschlag an den Gegner, gilt ab der nächsten Auslosung
  const rulesBtn = document.createElement('button');
  rulesBtn.className = 'btn'; rulesBtn.id = 'onlRules'; rulesBtn.textContent = '⚙️ ' + tr('Regeln'); rulesBtn.hidden = true;
  rulesBtn.title = tr('Einstellungen der Partie ansehen oder eine Änderung vorschlagen');
  giveBtn.before(rulesBtn);
  rulesBtn.onclick = () => { if (m && m.cfg) rulesCard(); };

  // „Los!“: im Online-Spiel Fertig / Nächste Runde (vor dem Hotseat-Haken, der sonst Deckkarten zeigt)
  const go = $('batGo'), goPrev = go.onclick;
  go.onclick = e => {
    if (!m) { if (goPrev) goPrev.call(go, e); return; }
    e.currentTarget.blur();
    if (m.phase === 'paint') ready();
    else if (m.phase === 'vote') voteCard();
    else if (m.phase === 'result') { act(wantNext(m)); }
  };

  /* ---------- Emotes ---------- */
  // Leiste rechts; eigene fliegen auf der eigenen Seite hoch, die des Gegners auf seiner
  const emoBar = document.createElement('div'); emoBar.className = 'onlemo'; emoBar.id = 'onlEmo'; emoBar.hidden = true;
  emoBar.innerHTML = EMOTES.map((e, k) => `<button data-k="${k}" aria-label="${e}">${e}</button>`).join('');
  emoBar.title = tr('Reaktion senden: dein Gegner sieht sie sofort');
  document.body.append(emoBar);
  emoBar.onclick = e => {
    const b = e.target.closest('button'); if (!b || !m) return;
    if (sendEmote(m, +b.dataset.k)) { flyEmote(EMOTES[+b.dataset.k], m.side, true); publish(); }
  };
  function flyEmote(ch, side, mine) {
    const el = document.createElement('div'); el.className = 'onlfly';
    el.style.left = `${(side === 'blau' ? 25 : 75) + (Math.random() * 10 - 5)}%`;
    el.style.top = `${62 + Math.random() * 8}%`;
    el.textContent = ch;
    const who = document.createElement('small'); who.textContent = mine ? tr('Du') : tr('Gegner'); el.append(who);
    document.body.append(el);
    setTimeout(() => el.remove(), 2600);
  }

  /* ---------- Karte ---------- */
  const ov = document.createElement('div');
  ov.className = 'ov'; ov.id = 'ovOnl'; ov.hidden = true;
  ov.innerHTML = '<div class="card onl shadow" role="dialog" aria-modal="true" aria-labelledby="onlTitle"></div>';
  $('app').append(ov);
  const card = ov.firstChild;
  let shown = '';
  const hideCard = () => { ov.hidden = true; shown = ''; card.classList.remove('vote', 'lobby'); ov.classList.remove('onl-round'); if (lobbyUnsub) { lobbyUnsub(); lobbyUnsub = null; } };
  const showCard = (kind, html) => { if (kind !== 'vote') card.classList.remove('vote'); if (kind !== 'lobby') card.classList.remove('lobby'); card.innerHTML = html; shown = kind; ov.hidden = false; };

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
    if (m && m.peerProp) k = 'prop' + m.peerProp.n;
    else if (m && m.cfg && m.phase === 'result') {
      const waiting = m.want > m.cfg.r, pw = m.peerWant;
      if (pw === 'same' && !waiting) k = 'same';
      else if (pw === 'new' && waiting && m.same) k = 'declined';
      else if (pw === 'new' && !waiting) k = 'new';
      else if (waiting && !pw) k = m.same ? 'waitSame' : 'waitNew';
    }
    const pk = m && m.prop ? m.prop.n : 0;
    if (k + '|' + pk === askKey) return;
    askKey = k + '|' + pk;
    const box = ask.firstChild;
    if (k.startsWith('prop')) {
      const d = setDiff(m.set, m.peerProp.s);
      box.innerHTML = `<div class="big">⚙️</div><h2 id="onlAskT">${tr('Dein Gegner will die Regeln ändern')}</h2>
        <div class="onldiff">${d.map(x => `<span>${setK(x.k)}: <s>${esc(setVal(x.k, x.a))}</s> → ${esc(setVal(x.k, x.b))}</span>`).join('')}</div>
        <p class="muted">${m.phase === 'vote' ? tr('Angenommen werden Regel und Karte sofort neu ausgelost.') : tr('Angenommen gilt es ab der nächsten Runde.')}</p>
        <div class="btnrow"><button class="go" id="onlAskYes">${tr('Annehmen')}</button><button class="btn" id="onlAskNo">${tr('Ablehnen')}</button></div>`;
      ask.hidden = false;
      $('onlAskYes').onclick = () => act(answerProp(m, true));
      $('onlAskNo').onclick = () => act(answerProp(m, false));
      $('onlAskYes').focus();
      chime(true);
    } else if (k === 'same' || k === 'declined') {
      box.innerHTML = k === 'same'
        ? `<div class="big">⚔️</div><h2 id="onlAskT">${tr('Dein Gegner will eine Revanche!')}</h2>
          <p>${tr('Gleiche Regel ({r}), gleiche Karte ({m}), gleiches Budget. Ihr malt beide neu.', { r: esc(tr(CAT_NAME[m.cfg.cat])), m: esc(tr(MAP[m.cfg.map].n)) })}</p>
          <div class="btnrow"><button class="go" id="onlAskYes">${tr('Revanche annehmen')}</button><button class="btn" id="onlAskNo">${tr('Ablehnen, neue Abstimmung')}</button></div>`
        : `<div class="big">🗳️</div><h2 id="onlAskT">${tr('Dein Gegner will lieber neu abstimmen')}</h2>
          <p>${tr('Keine Revanche: Ihr stimmt über eine neue Regel und Karte ab.')}</p>
          <div class="btnrow"><button class="go" id="onlAskNo">${tr('Okay, neue Abstimmung')}</button><button class="btn" id="onlAskLeave">${tr('Verlassen')}</button></div>`;
      ask.hidden = false;
      const y = $('onlAskYes'), n = $('onlAskNo'), l = $('onlAskLeave');
      if (y) y.onclick = () => act(wantNext(m, true));
      if (n) n.onclick = () => act(wantNext(m, false));
      if (l) l.onclick = () => { ask.hidden = true; askKey = ''; confirmLeave(); };
      (y || n).focus();
      chime(true);
    } else ask.hidden = true;
    if (k === 'new') {
      setSticky({ html: `<span>${tr('Dein Gegner will die nächste Runde.')}</span><button class="go" id="onlBanGo">${tr('Los')}</button>`, hi: true,
        wire: () => { $('onlBanGo').onclick = () => act(wantNext(m, false)); } });
      chime(false);
    } else if (k === 'waitSame') setSticky({ html: `<span>⏳ ${tr('Revanche angefragt, warte auf deinen Gegner …')}</span>` });
    else if (k === 'waitNew') setSticky({ html: `<span>⏳ ${tr('Warte auf deinen Gegner …')}</span>` });
    else if (m && m.prop) setSticky({ html: `<span>⚙️ ${tr('Regeländerung vorgeschlagen, warte auf deinen Gegner …')}</span><button class="btn" id="onlBanW">${tr('Zurückziehen')}</button>`,
      wire: () => { $('onlBanW').onclick = () => act(proposeSet(m, null)); } });
    else setSticky(null);
  }
  function clearNotes() { clearTimeout(banT); banT = 0; sticky = null; askKey = ''; ban.hidden = true; ask.hidden = true; }

  // Lobby (25.11.): Spielart wählen (1 gegen 1, 2 gegen 2, König des Hügels) und die Partie einstellen
  async function openLobby() {
    let st = loadSet();
    showCard('lobby', `<h2 id="onlTitle">${tr('Online spielen')}</h2><p class="muted">${tr('Verbinde …')}</p>`);
    net = await getRoom();
    if (shown !== 'lobby') return;
    if (!net) {
      showCard('lobby', `<h2 id="onlTitle">${tr('Online 1 gegen 1')}</h2>
        <p>${tr('Das Online-Spiel braucht die Live-Verbindung des Claude-Artefakts. Sie ist hier nicht verfügbar.')}</p>
        <p class="muted">${tr('Öffne das Spiel als Claude-Artefakt und melde dich an. Dein Gegner braucht ebenfalls Zugriff auf das Artefakt (Einladung) und muss angemeldet sein; über einen öffentlichen Link geht es nicht.')}</p>
        <p>${tr('Live spielen: in der <a href="{u}" target="_blank" rel="noopener">Live-Version</a> (nur mit Einladung).', { u: LIVE_URL })}</p>
        <p>${tr('<b>Ohne Anmeldung:</b> Nimm das <b>Code-Duell</b> (Knopf daneben). Du verschickst deine Armee als Code, dein Gegner malt verdeckt dagegen.')}</p>
        <div class="btnrow"><button class="btn" id="onlCancel">${tr('Schließen')}</button></div>`);
      $('onlCancel').onclick = hideCard; return;
    }
    const team = game.teamUI, hill = game.hillUI;
    const modes = [
      { id: '1v1', ic: '⚔️', n: tr('1 gegen 1'), d: tr('Du gegen einen Freund, Runde für Runde'), on: true },
      { id: 'tft', ic: '🤝', n: tr('2 gegen 2: Staffel'), d: tr('Zwei Duelle, die Überlebenden helfen dem Teamkollegen'), open: team && (() => team.open('tft')) },
      { id: 'feld', ic: '🗺️', n: tr('2 gegen 2: Ein Feld'), d: tr('Alle vier auf einem Feld, jeder mit eigener Kategorie'), open: team && (() => team.open('feld')) },
      { id: 'hill', ic: '👑', n: tr('König des Hügels'), d: tr('Setz dich auf den Thron und verteidige ihn'), open: hill && (() => hill.open()) },
    ];
    card.classList.add('lobby');
    showCard('lobby', `<h2 id="onlTitle">${tr('Online spielen')}</h2>
      <h3>${tr('Spielart')}</h3>
      <div class="onlmodes">${modes.map(o => `<button class="btn${o.on ? ' on' : ''}" data-m="${o.id}"${!o.on && !o.open ? ` disabled title="${tr('Kommt bald')}"` : ''}><span class="ic">${o.ic}</span><b>${o.n}</b><span>${o.d}</span></button>`).join('')}</div>
      <h3>${tr('Einstellungen')}</h3>
      <div id="onlSetBox"></div>
      <div class="row"><button class="go" id="onlCreate">${tr('Raum erstellen')}</button><span class="muted">${tr('oder')}</span><input id="onlCode" maxlength="6" placeholder="CODE" autocomplete="off" spellcheck="false" aria-label="${tr('Raumcode')}"><button class="btn" id="onlJoin">${tr('Beitreten')}</button></div>
      <div class="rooms" id="onlRooms"></div>
      <div class="btnrow"><button class="btn" id="onlCancel">${tr('Abbrechen')}</button></div>`);
    card.querySelectorAll('.onlmodes [data-m]').forEach(b => {
      const o = modes.find(x => x.id === b.dataset.m);
      if (o.open) b.onclick = () => { hideCard(); o.open(); };
    });
    const drawSet = () => { const box = $('onlSetBox'); box.innerHTML = setFormHTML(st); wireSetForm(box, () => st, v => { st = v; saveSet(st); drawSet(); }); };
    drawSet();
    $('onlCreate').onclick = () => start('host', makeCode(), st);
    const join = () => { const c = normCode($('onlCode').value); if (!c) { ui.toast(tr('Der Code hat 4 Zeichen, z. B. KX7P.')); return; } start('guest', c); };
    $('onlJoin').onclick = join;
    $('onlCode').onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') join(); };
    $('onlCancel').onclick = hideCard;
    // offene Räume aus der Lobby: 1 gegen 1 (mit Einstellungen) und 2 gegen 2
    const render = () => {
      const box = $('onlRooms'); if (!box) return;
      const rs = openRooms(net.peers()).map(r => ({ ...r, kind: '1v1', txt: r.set ? setSummary(r.set) : tr('{n} Punkte', { n: r.budget }) }));
      if (team) for (const p of net.peers() || []) {
        const o = p && !p.isMe && p.presence && p.presence.ks === 'ks2v2' ? p.presence.open : null;
        const c = o && normCode(o.code);
        if (c && (o.mode === 'tft' || o.mode === 'feld')) rs.push({ code: c, kind: o.mode, txt: `${tr(o.mode === 'tft' ? '2 gegen 2: Staffel' : '2 gegen 2: Ein Feld')} · ${tr('{n} von 4 Spielern', { n: Math.max(1, Math.min(4, o.n | 0)) })}` });
      }
      box.innerHTML = rs.length ? `<span class="muted">${tr('Offene Räume')}</span>${rs.map(r => `<button class="btn" data-c="${esc(r.code)}" data-kind="${r.kind}"><span>${r.kind === '1v1' ? '⚔️' : '🤝'} ${tr('Raum {c}', { c: esc(r.code) })} <small>${esc(r.txt)}</small></span><span>${tr('Beitreten')}</span></button>`).join('')}`
        : `<span class="muted">${tr('Gerade wartet niemand. Erstelle einen Raum und gib deinem Gegner den Code.')}</span>`;
      box.querySelectorAll('[data-c]').forEach(b => {
        b.onclick = () => { if (b.dataset.kind === '1v1') start('guest', b.dataset.c); else { hideCard(); team.join(b.dataset.c); } };
      });
    };
    try { lobbyUnsub = net.onPeers(render, () => {}); } catch (e) { /* ohne Lobby-Liste */ }
    render();
    $('onlCreate').focus();
  }

  function waitCard() {
    if (m.role === 'host') {
      showCard('wait', `<h2 id="onlTitle">${tr('Warte auf Gegner')}</h2><p>${tr('Gib deinem Gegner diesen Code. Er öffnet das Spiel, geht auf Schlacht → Online und tritt bei.')}</p>
        <div class="code">${esc(m.code)}</div><p class="muted">${esc(setSummary(m.set))} · ${tr('du bist Blau (links)')}</p>
        <div class="btnrow"><button class="btn" id="onlCancel">${tr('Abbrechen')}</button></div>`);
    } else {
      const late = Date.now() - joinT > JOIN_MS;
      showCard('wait', `<h2 id="onlTitle">${tr('Raum {c}', { c: esc(m.code) })}</h2><p>${late ? tr('<span class="warn">Hier ist noch niemand.</span> Stimmt der Code? Du kannst weiter warten.') : tr('Verbinde mit dem Gegner …')}</p>
        <p class="muted">${tr('Du bist Rot (rechts).')}</p><div class="btnrow"><button class="btn" id="onlCancel">${tr('Abbrechen')}</button></div>`);
    }
    $('onlCancel').onclick = () => leave(tr('Online-Spiel abgebrochen.'));
  }
  // Abstimmung: drei Regeln und drei Karten; gleiche Wahl gewinnt, sonst das Los
  let pickR = null, pickM = null;
  function voteCard() {
    const c = m.cfg, mine = myPick(m), done = !!m.vote || !mine;
    const chooserTxt = c.chooser ? (mine ? tr('Du hast die letzte Runde verloren: Du suchst Regel und Karte allein aus.') : tr('{s} hat die letzte Runde verloren und sucht Regel und Karte aus.', { s: SIDE_N[c.chooser] })) : '';
    if (!m.vote && mine) { if (!c.opts.rules.includes(pickR)) pickR = c.opts.rules[0]; if (!c.opts.maps.includes(pickM)) pickM = c.opts.maps[0]; }
    const selR = m.vote ? m.vote.rule : mine ? pickR : null, selM = m.vote ? m.vote.map : mine ? pickM : null;
    card.classList.add('vote');
    showCard('vote', `<h2 id="onlTitle">${tr('Runde {r}: Abstimmung', { r: c.r })}</h2>
      <p class="muted">${chooserTxt || tr('Ihr wählt beide. Gleiche Wahl gewinnt, sonst entscheidet das Los zwischen euren beiden Stimmen.')} ${scoreText()}.</p>
      <h3>${tr('Was darf gemalt werden?')}</h3>
      <div class="vopts" id="vRules">${c.opts.rules.map(id => `<button class="btn${id === selR ? ' on' : ''}" data-v="${id}"${done ? ' disabled' : ''}><b>${esc(tr(RULE[id].n))}</b><span>${esc(tr(RULE[id].d))}</span></button>`).join('')}</div>
      <h3>${tr('Karte')}</h3>
      <div class="vopts" id="vMaps">${c.opts.maps.map(id => `<button class="btn${id === selM ? ' on' : ''}" data-v="${id}"${done ? ' disabled' : ''}>${mapSVG(id)}<b>${esc(tr(MAP[id].n))}</b><span>${esc(tr(MAP[id].d))}</span></button>`).join('')}</div>
      <div class="btnrow">${done ? `<button class="go" disabled>${mine ? tr('Warte auf die Stimme deines Gegners …') : tr('Dein Gegner wählt …')}</button>` : `<button class="go" id="onlVote">${c.chooser ? tr('Auswählen') : tr('Abstimmen')}</button>`}<button class="btn" id="onlVRules">⚙️ ${tr('Regeln')}</button><button class="btn" id="onlCancel">${tr('Spiel verlassen')}</button></div>`);
    $('onlVRules').onclick = () => rulesCard();
    if (!done) {
      card.querySelectorAll('#vRules .btn').forEach(b => { b.onclick = () => { pickR = b.dataset.v; voteCard(); }; });
      card.querySelectorAll('#vMaps .btn').forEach(b => { b.onclick = () => { pickM = b.dataset.v; voteCard(); }; });
      $('onlVote').onclick = () => act(castVote(m, pickR, pickM));
    }
    $('onlCancel').onclick = () => confirmLeave();
  }
  function roundCard() {
    const c = m.cfg, ag = c.agreed || {};
    const how = (ok, what) => tr(ok ? '{w}: ihr wart euch einig.' : '{w}: das Los hat entschieden.', { w: what });
    const why = c.rematch ? tr('Gleiches Setup wie eben, ihr malt beide neu.') : c.drawn ? tr('Regel und Karte wurden ausgelost.')
      : c.chooser ? tr('{s} hat ausgesucht.', { s: SIDE_N[c.chooser] }) : `${how(ag.rule, tr('Regel'))} ${how(ag.map, tr('Karte'))}`;
    ov.classList.add('onl-round');
    showCard('round', `<h2 id="onlTitle">${c.rematch ? tr('Revanche') : tr('Runde {r}', { r: c.r })}: <span class="cat">${esc(tr(CAT_NAME[c.cat]))}</span></h2>
      <div class="row"><div class="mapprev">${mapSVG(c.map, 220, 124)}</div><div><b>${esc(tr(MAP[c.map].n))}</b><br><span class="muted">${esc(tr(MAP[c.map].d))}</span></div></div>
      <p>${esc(tr(RULE[c.cat].d))}. ${tr('{n} Punkte', { n: budgetOf(c) })}. ${tr(m.side === 'blau' ? 'Du bist <b>{s}</b> (links). Dein Gegner sieht nichts, bis beide fertig sind.' : 'Du bist <b>{s}</b> (rechts). Dein Gegner sieht nichts, bis beide fertig sind.', { s: SIDE_N[m.side] })}</p>
      <p class="muted">${why}${c.time ? ' ' + tr('Ihr habt {t} zum Malen.', { t: timeN(c.time) }) : ''}</p>
      <div class="btnrow"><button class="go" id="onlOk">${tr('Los geht\'s')}</button></div>`);
    $('onlOk').onclick = hideCard; $('onlOk').focus();
    clearTimeout(roundT); roundT = setTimeout(() => { if (shown === 'round') hideCard(); }, 5000);
  }
  // Einstellungen im Spiel: ansehen, ändern, vorschlagen (oder den eigenen Vorschlag zurückziehen)
  function rulesCard() {
    let st = m.prop ? m.prop.s : m.set;
    const when = m.phase === 'vote' && !(m.vote && (m.cfg.chooser || m.peerVote)) ? tr('Angenommen gilt es sofort: Regel und Karte werden neu ausgelost.') : tr('Angenommen gilt es ab der nächsten Runde.');
    const draw = () => {
      const diff = setDiff(m.set, st), pending = !!m.prop;
      card.classList.add('lobby');
      showCard('rules', `<h2 id="onlTitle">⚙️ ${tr('Regeln der Partie')}</h2>
        <p class="muted">${tr('Ändere, was du willst, und schick es deinem Gegner als Vorschlag. {w}', { w: when })}</p>
        <div id="onlSetBox">${setFormHTML(st)}</div>
        ${diff.length ? `<div class="onldiff">${diff.map(d => `<span>${setK(d.k)}: <s>${esc(setVal(d.k, d.a))}</s> → ${esc(setVal(d.k, d.b))}</span>`).join('')}</div>` : `<p class="muted">${tr('So wird gerade gespielt.')}</p>`}
        <div class="btnrow">${pending && !diff.length ? '' : `<button class="go" id="onlPropose"${diff.length ? '' : ' disabled'}>${pending ? tr('Neuen Vorschlag schicken') : tr('Vorschlagen')}</button>`}
          ${pending ? `<button class="btn" id="onlWithdraw">${tr('Vorschlag zurückziehen')}</button>` : ''}<button class="btn" id="onlClose">${tr('Schließen')}</button></div>`);
      card.classList.add('lobby');
      wireSetForm($('onlSetBox'), () => st, v => { st = v; draw(); });
      const pb = $('onlPropose'); if (pb) pb.onclick = () => { hideCard(); act(proposeSet(m, st)); };
      const wb = $('onlWithdraw'); if (wb) wb.onclick = () => { hideCard(); act(proposeSet(m, null)); };
      $('onlClose').onclick = hideCard;
    };
    draw();
  }
  function goneCard() {
    chime(true);
    showCard('gone', `<h2 id="onlTitle">${tr('Gegner ist weg')}</h2><p>${tr('Die Verbindung zum Gegner ist abgerissen. Kommt er zurück, geht es weiter.')}</p>
      <div class="btnrow"><button class="btn" id="onlStay">${tr('Warten')}</button><button class="go" id="onlCancel">${tr('Spiel verlassen')}</button></div>`);
    $('onlStay').onclick = () => { goneAck = true; hideCard(); };
    $('onlCancel').onclick = () => leave(tr('Online-Spiel beendet.'));
  }
  function giveCard() {
    showCard('giveq', `<h2 id="onlTitle">${tr('Runde aufgeben?')}</h2><p>${tr('Die Runde und der Punkt gehen an deinen Gegner. Danach geht es mit Revanche oder einer neuen Runde weiter.')}</p>
      <div class="btnrow"><button class="go" id="onlGiveYes">🏳️ ${tr('Aufgeben')}</button><button class="btn" id="onlStay">${tr('Weiterspielen')}</button></div>`);
    $('onlStay').onclick = hideCard;
    $('onlGiveYes').onclick = () => { if (canGiveUp(m)) act(giveUp(m)); else hideCard(); };
  }
  // Kampf anhalten (Runde durch Aufgeben vorbei); das Feld bleibt stehen, malen geht nicht (step 'online')
  function stopFight() {
    const b = game.battle; if (!b || b !== battleRef) return;
    game.endReplay(true);
    if (b.hot) b.hot.step = 'online';
    if (b.phase !== 'plan') { b.phase = 'plan'; b.result = null; b.endT = -1; }
    $('ovBat').hidden = true; document.body.classList.remove('bat-res');
    ui.updateBattle(); ui.updateControls();
  }
  // Ergebnis nach Aufgeben (eigenes oder des Gegners), mit Revanche / Nächste Runde
  function gaveCard() {
    if (!m || !m.cfg || m.phase !== 'result') return;
    const mine = !!m.gave, other = m.side === 'blau' ? 'rot' : 'blau', waiting = m.want > m.cfg.r;
    showCard('gave', `<h2 id="onlTitle">${mine ? '🏳️ ' + tr('Du gibst auf') : '🏆 ' + tr('Dein Gegner gibt auf!')}</h2>
      <p>${tr('Runde {r} geht an <b>{s}</b>. Stand: {x}.', { r: m.cfg.r, s: SIDE_N[mine ? other : m.side], x: scoreText() })}</p>
      ${waiting ? `<p class="muted">${m.same ? tr('Du willst Revanche, warte auf deinen Gegner …') : tr('Warte auf deinen Gegner …')}</p>` : ''}
      <div class="btnrow"><button class="go" id="onlGSame"${waiting && m.same ? ' disabled' : ''} title="${tr('Gleiche Regel, gleiche Karte, gleiches Budget: beide malen neu')}">${tr('Revanche')}</button>
        <button class="go" id="onlGNext"${waiting && !m.same ? ' disabled' : ''}>${tr('Nächste Runde')}</button><button class="btn" id="onlGLeave">${tr('Verlassen')}</button></div>`);
    $('onlGSame').onclick = () => act(wantNext(m, true));
    $('onlGNext').onclick = () => act(wantNext(m, false));
    $('onlGLeave').onclick = () => confirmLeave();
  }
  function confirmLeave() {
    showCard('leave', `<h2 id="onlTitle">${tr('Online-Spiel verlassen?')}</h2><p>${tr('Stand: {x}.', { x: scoreText() })}</p>
      <div class="btnrow"><button class="go" id="onlCancel">${tr('Verlassen')}</button><button class="btn" id="onlStay">${tr('Weiterspielen')}</button></div>`);
    $('onlStay').onclick = hideCard;
    $('onlCancel').onclick = () => leave(tr('Online-Spiel beendet.'));
  }
  const scoreText = () => (m ? `${SIDE_N.blau} ${m.score.blau} : ${m.score.rot} ${SIDE_N.rot}` : '');

  /* ---------- Verbindung ---------- */
  let joining = false;
  async function start(role, code, set) {
    if (joining || m) return;
    const b = game.battle; if (!b || b.phase !== 'plan' || b.hot) return;
    joining = true;
    let canceled = false;
    showCard('joining', `<h2 id="onlTitle">${tr('Online 1 gegen 1')}</h2><p class="muted">${tr('Verbinde …')}</p>
      <div class="btnrow"><button class="btn" id="onlCancel">${tr('Abbrechen')}</button></div>`);
    $('onlCancel').onclick = () => { canceled = true; hideCard(); };
    try {
      net = net || await getRoom();
      if (canceled || !net || game.battle !== b || b.phase !== 'plan' || b.hot || m) { hideCard(); return; }
      let newRoom;
      try { newRoom = await net.join(roomName(code)); } catch (e) { if (!canceled) { hideCard(); ui.toast(tr('Keine Verbindung zum Raum. Versuch es gleich noch mal.')); } return; }
      if (canceled || game.battle !== b || b.phase !== 'plan' || b.hot || m) {
        try { newRoom.leave(); } catch (e) { /* weg */ }
        hideCard(); return;
      }
      // voll? (zwei andere Spieler schon drin)
      const others = newRoom.peers().filter(p => !p.isMe && p.presence && p.presence.ks === PROTO);
      if (others.length >= 2 || (role === 'host' && others.length)) {
        newRoom.leave(); hideCard();
        ui.toast(role === 'host' ? tr('Code schon vergeben, bitte noch einmal.') : tr('Der Raum ist schon voll.'));
        return;
      }
      room = newRoom;
      m = createMatch(role, set); m.code = code; battleRef = b; peerSeen = 0; peerRef = null; goneAck = false; joinT = Date.now(); lastPub = '';
      game.clear(); undoStack.length = 0;
      b.hot = { online: true, budget: m.budget, step: 'online', spent: { blau: 0, rot: 0 }, def: null };
      unsubs.push(room.onPeers(onPeers, () => {}));
      if (role === 'host') try { net.presence({ ks: PROTO, open: { code, budget: m.budget, set: m.set } }); } catch (e) { /* ohne Lobby */ }
      publish(); waitCard(); sync();
    } finally { joining = false; }
  }
  function leave(msg) {
    clearTimeout(pubRetry); pubRetry = 0;
    for (const u of unsubs) try { u(); } catch (e) { /* weg */ }
    unsubs = [];
    if (room) try { room.leave(); } catch (e) { /* weg */ }
    if (net) try { net.presence({ open: null }); } catch (e) { /* weg */ }
    room = null; m = null; goneAck = false; paintEnd = 0;
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
  const oppRole = () => (m && m.role === 'host' ? 'guest' : 'host');
  function publish() {
    if (!room || !m) return;
    const v = view(m), txt = JSON.stringify(v);
    if (txt === lastPub) return;
    clearTimeout(pubRetry); pubRetry = 0;
    lastPub = txt;
    room.presence(v).catch(() => {
      if (lastPub === txt) lastPub = '';
      if (room && m && !pubRetry) pubRetry = setTimeout(() => { pubRetry = 0; publish(); }, 1500);
    });
  }
  function onPeers() {
    if (!m || !room) return;
    const p = pickPeer(room.peers(), oppRole(), peerRef);
    if (p) {
      if (peerRef && peerRef !== p.peer && m.cfg) { /* neuer Tab des Gegners: läuft mit der Runde weiter */ }
      peerRef = p.peer; peerSeen = Date.now(); goneAck = false;
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
      else if (e === 'error') ui.toast(tr('Die Armee des Gegners war ungültig ({e}). Sie kämpft nicht mit.', { e: tr(m.error) }));
      else if (e === 'peerres' || e === 'score' || e === 'result' || e === 'peerwant' || e === 'want') { decorate(); if (shown === 'gave') gaveCard(); }
      else if (e === 'emote') flyEmote(EMOTES[m.peerEmo], m.side === 'blau' ? 'rot' : 'blau', false);
      else if (e === 'gave') { stopFight(); gaveCard(); }
      else if (e === 'peergave') { stopFight(); gaveCard(); chime(true); }
      else if (e === 'peerready') flash('✅ ' + tr('Dein Gegner ist fertig mit Malen!'));
      else if (e === 'propok') flash('✅ ' + tr('Dein Gegner hat die neuen Regeln angenommen.'));
      else if (e === 'propno') flash('❌ ' + tr('Dein Gegner will bei den alten Regeln bleiben.'));
      else if (e === 'set') { if (m.cfg && !evs.includes('propok')) flash('⚙️ ' + tr('Neue Regeln: {s}', { s: setSummary(m.set) })); if (shown === 'rules') rulesCard(); decorate(); }
      else if (e === 'peervoted' && m.phase === 'vote') flash('🗳️ ' + (m.vote ? tr('Dein Gegner hat auch abgestimmt') : tr('Dein Gegner hat abgestimmt, jetzt du!')));
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
    paintEnd = m.cfg.time ? Date.now() + m.cfg.time * 1000 + 3000 : 0; paintWarned = false;   // 3 s für die Rundenkarte
    ui.updateBattle(); ui.updateCounts(); ui.updateControls();
    audio.play('whoosh');
    roundCard();
  }
  function ready(timeUp = false) {
    const b = game.battle; if (!b || !m || m.phase !== 'paint') return;
    if (!timeUp && !world.units.some(u => u.alive && u.team === m.side)) { ui.toast(tr('Male zuerst deine Armee ({c}).', { c: tr(CAT_NAME[m.cfg.cat]) })); return; }
    b.hot.step = 'online';   // nicht mehr malen
    undoStack.length = 0;
    act(markReady(m, packArmy(world, m.side)));
  }
  function beginFight() {
    if (!m || !m.fight) return;
    hideCard();
    onlineFight(m.fight.units, m.fight.seed, m.fight.map);
    ui.toast(tr('Aufgedeckt!'));
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
    const note = !off ? tr('Warte auf das Ergebnis des Gegners …')
      : off !== mine && mine ? tr('Gewertet wird das Ergebnis von Blau ({w}); auf deinem Gerät lief der Kampf etwas anders.', { w: off === 'draw' ? tr('unentschieden') : tr('{s} gewinnt', { s: SIDE_N[off] }) })
      : off === 'draw' ? tr('Unentschieden, kein Punkt.') : off === m.side ? tr('Du gewinnst die Runde!') : tr('Dein Gegner gewinnt die Runde.');
    const waiting = m.want > m.cfg.r, pw = m.peerWant;
    const peerTxt = pw === 'same' ? tr('Dein Gegner will eine Revanche.') : pw === 'new' ? tr('Dein Gegner will die nächste Runde.') : '';
    const myTxt = waiting ? (m.same ? (pw === 'new' ? tr('Du willst Revanche, dein Gegner eine neue Runde: drück „Nächste Runde“, um weiterzumachen.') : tr('Du willst Revanche, warte auf deinen Gegner …')) : tr('Warte auf deinen Gegner …')) : '';
    const mw = m.phase === 'result' ? matchWinner(m) : null;
    const matchTxt = mw ? (mw === m.side ? '🏆 ' + tr('Du gewinnst das Match!') : tr('{s} gewinnt das Match.', { s: SIDE_N[mw] })) : '';
    box.innerHTML = `<div>${matchTxt ? `<div class="match">${esc(matchTxt)}</div>` : ''}<div class="muted">${tr('Runde {r}', { r: m.cfg.r })}${m.set.goal ? ' · ' + goalN(m.set.goal) : ''} · ${esc(tr(CAT_NAME[m.cfg.cat]))} · ${esc(tr(MAP[m.cfg.map].n))} · ${tr('du bist {s}', { s: SIDE_N[m.side] })}</div>
        <div class="sc"><span class="blau">${SIDE_N.blau} ${m.score.blau}</span> : <span class="rot">${m.score.rot} ${SIDE_N.rot}</span></div><div class="muted">${esc(note)}</div>
        ${peerTxt ? `<div class="peer">${esc(peerTxt)}</div>` : ''}${myTxt ? `<div class="muted">${esc(myTxt)}</div>` : ''}</div>
      <div class="btnrow"><button class="go" id="onlSame"${waiting && m.same ? ' disabled' : ''} title="${tr('Gleiche Regel, gleiche Karte, gleiches Budget: beide malen neu')}">${tr('Revanche')}</button>
        <button class="go" id="onlNext"${waiting && !m.same ? ' disabled' : ''} title="${tr('Neue Abstimmung über Regel und Karte')}">${mw ? tr('Neues Match') : tr('Nächste Runde')}</button><button class="btn" id="onlRRules">⚙️ ${tr('Regeln')}</button><button class="btn" id="onlLeave">${tr('Verlassen')}</button></div>`;
    $('onlRRules').onclick = () => rulesCard();
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
    lab.textContent = on ? tr('Online verlassen') : tr('Online');
    btn.classList.toggle('on', on);
    giveBtn.hidden = !on || !canGiveUp(m);
    rulesBtn.hidden = !on || !m.cfg;
    rulesBtn.classList.toggle('wait', !!(m && m.prop));
    emoBar.hidden = !on || !m.cfg;
    if (!on) return;
    go.classList.remove('stop');   // eigene Beschriftungen (Fertig, Nächste Runde …) bleiben Hauptknopf
    $('batHot').hidden = true; $('batSwap').hidden = true; $('batShare').hidden = true; $('batQuick').hidden = true;
    const c = m.cfg, ph = m.phase;
    $('batClear').hidden = ph !== 'paint';
    setText(go, tr(ph === 'paint' ? 'Fertig' : ph === 'vote' ? 'Abstimmung' : ph === 'result' ? (m.want > c.r ? 'Warte auf Gegner …' : 'Nächste Runde') : ph === 'fight' ? 'Kampf läuft' : 'Warte …'));
    go.disabled = !(ph === 'paint' || ph === 'vote' || (ph === 'result' && m.want <= c.r));
    const head = c && c.cat ? `Online · ${tr('Runde {r}', { r: c.r })} · ${tr(CAT_NAME[c.cat])} · ${tr(MAP[c.map].n)} · ${scoreText()}` : c ? `Online · ${tr('Runde {r}', { r: c.r })} · ${scoreText()}` : `Online · ${tr('Raum {c}', { c: m.code })}`;
    const clock = ph === 'paint' && paintEnd ? ` · ⏰ ${Math.max(0, Math.ceil((paintEnd - Date.now()) / 1000))} s` : '';
    const tail = ph === 'paint' ? tr(m.side === 'blau' ? 'du malst links: {a} / {b} Punkte' : 'du malst rechts: {a} / {b} Punkte', { a: fmtPts(b.hot.spent[m.side]), b: budgetOf(c) })
      : tr(ph === 'wait' ? 'warte auf Gegner' : ph === 'vote' ? (!myPick(m) ? 'dein Gegner wählt' : m.vote ? 'warte auf die Stimme des Gegners' : 'stimmt über Regel und Karte ab')
      : ph === 'ready' ? 'fertig, der Gegner malt noch' : ph === 'xfer' ? 'decke auf …' : ph === 'fight' ? 'Kampf läuft' : 'Runde vorbei');
    setText($('batHint'), `${head} · ${tail}${clock}`);
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
    if (m.phase === 'paint' && paintEnd) {
      const left = Math.ceil((paintEnd - now) / 1000);
      if (left <= 0) { paintEnd = 0; flash('⏰ ' + tr('Zeit um! Deine Armee ist fertig.'), true); ready(true); }
      else {
        if (left <= 10 && !paintWarned) { paintWarned = true; flash('⏰ ' + tr('Noch 10 Sekunden!')); }
        if (left !== lastSec) { lastSec = left; sync(); }
      }
    }
    if (m.phase === 'wait' && m.role === 'guest' && shown === 'wait' && now - joinT > JOIN_MS && !card.querySelector('.warn')) waitCard();
    if (peerSeen && !goneAck && now - peerSeen > GONE_MS && shown !== 'gone' && shown !== 'leave') {
      const p = room && pickPeer(room.peers(), oppRole(), peerRef);
      if (p) peerSeen = now; else goneCard();
    }
  }
  const covered = () => !ov.hidden && shown !== 'round';
  return { frame, covered, active: () => !!m, leave };
}
