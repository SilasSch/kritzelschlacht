// Code-Duell (18.11.): 1 gegen 1 nur mit Codes, ohne Live-Verbindung; geht für alle, auch über den öffentlichen Link.
// Ablauf und Datenformat: duel.js. Gemalt wird wie im Online-Spiel (battle.hot mit online: true, duel: true und
// def = Kategorie), A links als Blau, B rechts als Rot. Der Kampf läuft über main.js onlineFight mit der Saat aus dem Code.
import { nextRound, roundDef, packArmy, CAT_NAME, ONLINE_BUDGETS, ONLINE_DEFAULT } from '../online.js';
import { challengeData, answerData, duelList } from '../duel.js';
import { fmtPts } from '../cards.js';

const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SIDE_N = { blau: 'Blau', rot: 'Rot' };

export function createDuelUI({ game, world, ui, audio, online, onlineFight, clearWorld, undoStack, shareDlg, encode, enterBattle, editBattle }) {
  const $ = id => document.getElementById(id);
  // st: null oder { role: 'a' (fordert heraus) | 'b' (nimmt an) | 'view' (sieht die Antwort), cfg, a, data }
  let st = null, battleRef = null;

  /* ---------- Knopf ---------- */
  const btn = document.createElement('button');
  btn.className = 'btn'; btn.id = 'batDuel'; btn.textContent = 'Code-Duell';
  btn.title = '1 gegen 1 ohne Anmeldung: Armee als Code verschicken, der Gegner malt verdeckt dagegen';
  $('batGo').before(btn);
  btn.onclick = () => { if (st) stop(); else { const b = game.battle; if (b && b.phase === 'plan' && !b.hot) openSetup(); } };

  const go = $('batGo'), goPrev = go.onclick;
  go.onclick = e => {
    if (!st) { if (goPrev) goPrev.call(go, e); return; }
    e.currentTarget.blur();
    const h = game.battle && game.battle.hot;
    if (h && (h.step === 'blau' || h.step === 'rot')) finish();
    else if (st.role === 'a' && st.a) showChallenge();
    else if (st.role === 'b' && st.data && game.battle.phase === 'done') showAnswer();
  };

  /* ---------- Karte ---------- */
  const ov = document.createElement('div');
  ov.className = 'ov'; ov.id = 'ovDuel'; ov.hidden = true; ov.style.zIndex = 7;
  ov.innerHTML = '<div class="card onl shadow" role="dialog" aria-modal="true" aria-labelledby="duelTitle"></div>';
  $('app').append(ov);
  const card = ov.firstChild;
  const hideCard = () => { ov.hidden = true; };
  const showCard = html => { card.innerHTML = html; ov.hidden = false; };

  function openSetup() {
    let pick = ONLINE_DEFAULT;
    showCard(`<h2 id="duelTitle">Code-Duell</h2>
      <p>1 gegen 1 ohne Anmeldung. Es wird eine Kategorie ausgelost, du malst deine Armee und bekommst einen Code. Den schickst du deinem Gegner (z. B. per WhatsApp).</p>
      <p class="muted">Er fügt ihn mit „Code laden“ ein und malt mit derselben Kategorie und demselben Budget dagegen, ohne deine Armee zu sehen. Dann kämpfen beide, und er schickt dir einen Antwort-Code mit dem Kampf zurück.</p>
      <div class="hotbud">${ONLINE_BUDGETS.map(v => `<button class="btn${v === pick ? ' on' : ''}" data-v="${v}"><b>${v}</b><span>Punkte je Seite</span></button>`).join('')}</div>
      <div class="btnrow"><button class="go" id="duelStart">Kategorie auslosen</button><button class="btn" id="duelCancel">Abbrechen</button></div>`);
    card.querySelectorAll('.hotbud .btn').forEach(b => {
      b.onclick = () => { pick = +b.dataset.v; card.querySelectorAll('.hotbud .btn').forEach(x => x.classList.toggle('on', x === b)); };
    });
    $('duelStart').onclick = () => startA(pick);
    $('duelCancel').onclick = hideCard;
    $('duelStart').focus();
  }
  function paintCard(side, intro) {
    const c = st.cfg;
    showCard(`<h2 id="duelTitle">${intro}: <span class="cat">${esc(CAT_NAME[c.cat])}</span></h2>
      <p>Male deine Armee nur aus <b>${esc(CAT_NAME[c.cat])}</b>, ${c.budget} Punkte. Du bist <b>${SIDE_N[side]}</b> (${side === 'blau' ? 'links' : 'rechts'}).
      ${side === 'blau' ? 'Wenn du fertig bist, bekommst du den Code für deinen Gegner.' : 'Die Armee deines Gegners bleibt verdeckt, bis du „Fertig“ drückst.'}</p>
      <div class="btnrow"><button class="go" id="duelOk">Los geht's</button></div>`);
    $('duelOk').onclick = hideCard; $('duelOk').focus();
  }

  /* ---------- Ablauf ---------- */
  function setup(role, cfg, side) {
    const b = game.battle;
    st = { role, cfg }; battleRef = b;
    b.phase = 'plan'; b.stats = null; b.result = null; b.endT = -1; b.t = 0; b.snap = null; b.batchRes = null;
    $('ovBat').hidden = true; document.body.classList.remove('bat-res');
    clearWorld(); world.teamMode = true; undoStack.length = 0;
    b.hot = { online: true, duel: true, budget: cfg.budget, step: side || 'online', spent: { blau: 0, rot: 0 }, def: roundDef(cfg) };
    game.setCat(cfg.cat);
    ui.updateBattle(); ui.updateCounts(); ui.updateControls();
  }
  function startA(budget) {
    hideCard();
    const b = game.battle; if (!b || b.phase !== 'plan') return;
    setup('a', nextRound(null, budget), 'blau');
    audio.play('whoosh');
    paintCard('blau', 'Code-Duell');
  }
  function finish() {
    const h = game.battle.hot, side = h.step;
    if (!world.units.some(u => u.alive && u.team === side)) { ui.toast(`Male zuerst deine Armee (${CAT_NAME[st.cfg.cat]}).`); return; }
    const packed = packArmy(world, side);
    h.step = 'online'; undoStack.length = 0;
    if (st.role === 'a') { st.a = packed; showChallenge(); sync(); return; }
    // B: Kampf mit beiden Armeen, Antwort-Code bereithalten
    st.data = answerData({ cfg: st.cfg, a: st.a }, packed);
    let list;
    try { list = duelList(st.data, world.W, world.H); } catch (e) { ui.toast('Der Code ist beschädigt.'); return; }
    onlineFight(list, st.cfg.seed);
    ui.toast('Aufgedeckt!');
    sync();
  }
  const showChallenge = () => shareDlg.showCode(encode(challengeData(st.cfg, st.a)), 'Herausforderung',
    `Kategorie ${CAT_NAME[st.cfg.cat]}, ${st.cfg.budget} Punkte. Schick diesen Code deinem Gegner. Er öffnet das Spiel, klickt „Code laden“ und fügt ihn ein. Seinen Antwort-Code lädst du danach genauso, dann siehst du euren Kampf.`);
  const showAnswer = () => shareDlg.showCode(encode(st.data), 'Antwort-Code',
    'Schick diesen Code zurück an deinen Gegner. Mit „Code laden“ sieht er genau diesen Kampf.');

  // Code aus „Code laden“ (main.js loadCode)
  function load(d) {
    if (online.active()) online.leave(null);
    if (!game.battle) enterBattle(); else if (game.battle.phase !== 'plan') editBattle();
    if (d.k === 'duel') {
      setup('b', d.cfg, 'rot');
      st.a = d.a;
      audio.play('whoosh');
      paintCard('rot', 'Herausforderung');
      return;
    }
    // Antwort: den Kampf zeigen
    setup('view', d.cfg, null);
    st.data = d;
    onlineFight(duelList(d, world.W, world.H), d.cfg.seed);
    ui.toast('Antwort geladen: euer Kampf läuft.');
    sync();
  }
  function stop() {
    const b = battleRef; st = null; battleRef = null; hideCard();
    if (b && game.battle === b) {
      b.hot = null;
      if (b.phase !== 'plan') { b.phase = 'plan'; b.stats = null; b.result = null; b.endT = -1; b.t = 0; }
      $('ovBat').hidden = true; document.body.classList.remove('bat-res');
      clearWorld(); world.teamMode = true;
      ui.renderUnits(); ui.updateBattle(); ui.updateCounts(); ui.updateControls();
    }
    ui.toast('Code-Duell beendet.');
    sync();
  }

  /* ---------- Ergebnis ---------- */
  const prevShow = ui.showBattleResult;
  ui.showBattleResult = r => { prevShow(r); decorate(r); };
  function decorate(r) {
    let box = $('duelRes');
    const on = !!st && game.battle === battleRef && (st.role === 'b' || st.role === 'view');
    if (!on) { if (box) box.remove(); return; }
    for (const id of ['batAgain', 'batTen', 'batEdit']) $(id).hidden = true;
    if (!box) { box = document.createElement('div'); box.className = 'onlbox'; box.id = 'duelRes'; $('ovBat').querySelector('.btnrow').before(box); }
    const me = st.role === 'b' ? 'rot' : 'blau', w = r && r.winner;
    const note = w === 'draw' ? 'Unentschieden.' : w === me ? 'Du gewinnst das Duell!' : 'Dein Gegner gewinnt das Duell.';
    box.innerHTML = `<div><div class="muted">Code-Duell · ${esc(CAT_NAME[st.cfg.cat])} · ${st.cfg.budget} Punkte · du bist ${SIDE_N[me]}</div>
        <div class="sc">${esc(note)}</div>
        <div class="muted">${st.role === 'b' ? 'Schick den Antwort-Code zurück, dann sieht dein Gegner diesen Kampf.' : 'Für eine Revanche: Code-Duell starten und neuen Code schicken.'}</div></div>
      <div class="btnrow">${st.role === 'b' ? '<button class="go" id="duelAnswer">Antwort-Code</button>' : ''}<button class="btn" id="duelEnd">Duell beenden</button></div>`;
    if ($('duelAnswer')) $('duelAnswer').onclick = showAnswer;
    $('duelEnd').onclick = stop;
  }

  /* ---------- Anzeige ---------- */
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  function sync() {
    const b = game.battle, plan = !!b && b.phase === 'plan';
    const on = !!st && !!b && b === battleRef && !!b.hot && b.hot.duel;
    btn.hidden = !b || (!on && (!plan || !!b.hot));
    btn.textContent = on ? 'Duell beenden' : 'Code-Duell';
    btn.classList.toggle('on', on);
    if (!on) return;
    for (const id of ['batHot', 'batOnl', 'batSwap', 'batShare']) if ($(id)) $(id).hidden = true;
    const h = b.hot, side = h.step === 'blau' || h.step === 'rot' ? h.step : null, c = st.cfg;
    $('batClear').hidden = !side;
    const label = side ? 'Fertig' : st.role === 'a' ? 'Code zeigen' : st.role === 'b' && b.phase === 'done' ? 'Antwort-Code' : b.phase === 'fight' ? 'Kampf läuft' : 'Fertig';
    setText(go, label);
    go.disabled = !(side || (st.role === 'a' && st.a) || (st.role === 'b' && st.data && b.phase === 'done'));
    const head = `Code-Duell · ${CAT_NAME[c.cat]}`;
    const tail = side ? `du malst ${side === 'blau' ? 'links' : 'rechts'}: ${fmtPts(h.spent[side])} / ${c.budget} Punkte`
      : st.role === 'a' ? 'Code verschickt · die Antwort mit „Code laden“ einfügen'
      : b.phase === 'fight' ? 'Kampf läuft' : 'Kampf vorbei';
    setText($('batHint'), `${head} · ${tail}`);
    if (plan && side) {
      const other = side === 'blau' ? 'rot' : 'blau';
      setText($(side === 'blau' ? 'ptsB' : 'ptsR'), fmtPts(h.spent[side]));
      setText($(other === 'blau' ? 'ptsB' : 'ptsR'), '?');
    }
  }
  const prevSync = game.onlineUI;
  game.onlineUI = () => { if (prevSync) prevSync(); sync(); };

  function frame() {
    if (st && game.battle !== battleRef) { st = null; battleRef = null; hideCard(); }
  }
  return { load, frame, covered: () => !ov.hidden, active: () => !!st };
}
