// Code-Duell (18.11.): 1 gegen 1 nur mit Codes, ohne Live-Verbindung; geht für alle, auch über den öffentlichen Link.
// Ablauf und Datenformat: duel.js. Gemalt wird wie im Online-Spiel (battle.hot mit online: true, duel: true und
// def = Kategorie), A links als Blau, B rechts als Rot. Der Kampf läuft über main.js onlineFight mit der Saat aus dem Code.
import { roundDef, packArmy, CAT_NAME, ONLINE_BUDGETS, ONLINE_DEFAULT, budgetOf } from '../online.js';
import { RULES, RULE, MAPS, MAP, RULE_IDS, MAP_IDS, applyMap, mapSVG } from '../rules.js';
import { challengeData, answerData, duelList } from '../duel.js';
import { fmtPts } from '../cards.js';
import { tr } from '../i18n.js';

const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const SIDE_N = { blau: tr('Blau'), rot: tr('Rot') };

const CSS = `
.card.duelset{max-width:760px}
.vopts.r4{grid-template-columns:repeat(4,1fr)}
.vopts.small .btn{padding:7px 9px}.vopts.small .btn b{font-size:16px}
`;

export function createDuelUI({ game, world, ui, audio, online, onlineFight, clearWorld, undoStack, shareDlg, encode, enterBattle, editBattle, markAll }) {
  { const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }
  const $ = id => document.getElementById(id);
  // st: null oder { role: 'a' (fordert heraus) | 'b' (nimmt an) | 'view' (sieht die Antwort), cfg, a, data }
  let st = null, battleRef = null;

  /* ---------- Knopf ---------- */
  const btn = document.createElement('button');
  btn.className = 'btn'; btn.id = 'batDuel'; btn.textContent = tr('Code-Duell');
  btn.title = tr('1 gegen 1 ohne Anmeldung: Armee als Code verschicken, der Gegner malt verdeckt dagegen');
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
  const hideCard = () => { ov.hidden = true; card.classList.remove('duelset'); };
  const showCard = html => { card.classList.remove('duelset'); card.innerHTML = html; ov.hidden = false; };

  // Einstellungen: Regel, Karte (je auch „Zufall“) und Budget; der Code trägt sie zum Gegner
  const pick = { budget: ONLINE_DEFAULT, rule: 'zufall', map: 'zufall' };
  function openSetup() {
    const opt = (kind, id, inner) => `<button class="btn${pick[kind] === id ? ' on' : ''}" data-k="${kind}" data-v="${id}">${inner}</button>`;
    showCard(`<h2 id="duelTitle">${tr('Code-Duell')}</h2>
      <p class="muted">${tr('1 gegen 1 ohne Anmeldung: Du wählst Regel und Karte, malst deine Armee und bekommst einen Code für deinen Gegner (z. B. per WhatsApp). Er malt mit denselben Regeln dagegen, ohne deine Armee zu sehen, und schickt dir einen Antwort-Code mit dem Kampf zurück.')}</p>
      <h3>${tr('Was darf gemalt werden?')}</h3>
      <div class="vopts r4 small">${opt('rule', 'zufall', `<b>🎲 ${tr('Zufall')}</b><span>${tr('Lass dich überraschen')}</span>`)}${RULES.map(r => opt('rule', r.id, `<b>${esc(tr(r.n))}</b><span>${esc(tr(r.d))}</span>`)).join('')}</div>
      <h3>${tr('Karte')}</h3>
      <div class="vopts r4 small">${opt('map', 'zufall', `<b>🎲 ${tr('Zufall')}</b><span>${tr('Irgendeine Karte')}</span>`)}${MAPS.map(m => opt('map', m.id, `${mapSVG(m.id)}<b>${esc(tr(m.n))}</b>`)).join('')}</div>
      <h3>${tr('Budget')}</h3>
      <div class="hotbud">${ONLINE_BUDGETS.map(v => `<button class="btn${v === pick.budget ? ' on' : ''}" data-k="budget" data-v="${v}"><b>${v}</b><span>${tr('Punkte je Seite')}</span></button>`).join('')}</div>
      <div class="btnrow"><button class="go" id="duelStart">${tr('Los geht\'s')}</button><button class="btn" id="duelCancel">${tr('Abbrechen')}</button></div>`);
    card.classList.add('duelset');
    card.querySelectorAll('[data-k]').forEach(b => {
      b.onclick = () => { const k = b.dataset.k; pick[k] = k === 'budget' ? +b.dataset.v : b.dataset.v; openSetup(); };
    });
    $('duelStart').onclick = () => {
      const any = a => a[Math.floor(Math.random() * a.length)];
      startA({ cat: pick.rule === 'zufall' ? any(RULE_IDS) : pick.rule, map: pick.map === 'zufall' ? any(MAP_IDS) : pick.map, budget: pick.budget });
    };
    $('duelCancel').onclick = hideCard;
    $('duelStart').focus();
  }
  function paintCard(side, intro) {
    const c = st.cfg, mp = MAP[c.map] || MAP.feld;
    showCard(`<h2 id="duelTitle">${intro}: <span class="cat">${esc(tr(CAT_NAME[c.cat]))}</span></h2>
      <div class="row"><div class="mapprev">${mapSVG(mp.id, 220, 124)}</div><div><b>${esc(tr(mp.n))}</b><br><span class="muted">${esc(tr(mp.d))}</span></div></div>
      <p>${esc(tr(RULE[c.cat].d))}. ${tr('{n} Punkte', { n: budgetOf(c) })}. ${tr(side === 'blau' ? 'Du bist <b>{s}</b> (links).' : 'Du bist <b>{s}</b> (rechts).', { s: SIDE_N[side] })}
      ${side === 'blau' ? tr('Wenn du fertig bist, bekommst du den Code für deinen Gegner.') : tr('Die Armee deines Gegners bleibt verdeckt, bis du „Fertig“ drückst.')}</p>
      <div class="btnrow"><button class="go" id="duelOk">${tr('Los geht\'s')}</button></div>`);
    $('duelOk').onclick = hideCard; $('duelOk').focus();
  }

  /* ---------- Ablauf ---------- */
  function setup(role, cfg, side) {
    const b = game.battle;
    st = { role, cfg }; battleRef = b;
    b.phase = 'plan'; b.stats = null; b.result = null; b.endT = -1; b.t = 0; b.snap = null; b.batchRes = null;
    $('ovBat').hidden = true; document.body.classList.remove('bat-res');
    clearWorld(); world.teamMode = true; undoStack.length = 0;
    applyMap(world, cfg.map || 'feld'); markAll();
    b.hot = { online: true, duel: true, budget: budgetOf(cfg), step: side || 'online', spent: { blau: 0, rot: 0 }, def: roundDef(cfg) };
    game.setCat(cfg.cat);
    ui.updateBattle(); ui.updateCounts(); ui.updateControls();
  }
  // Herausforderung mit Regel, Karte und Budget (auch als Revanche mit dem Setup eines Duells)
  function startA({ cat, map, budget }) {
    hideCard();
    const b = game.battle; if (!b) return;
    setup('a', { r: 1, cat, map, budget, seed: (Math.random() * 2 ** 31) | 0 }, 'blau');
    audio.play('whoosh');
    paintCard('blau', tr('Code-Duell'));
  }
  function finish() {
    const h = game.battle.hot, side = h.step;
    if (!world.units.some(u => u.alive && u.team === side)) { ui.toast(tr('Male zuerst deine Armee ({c}).', { c: tr(CAT_NAME[st.cfg.cat]) })); return; }
    const packed = packArmy(world, side);
    h.step = 'online'; undoStack.length = 0;
    if (st.role === 'a') { st.a = packed; showChallenge(); sync(); return; }
    // B: Kampf mit beiden Armeen, Antwort-Code bereithalten
    st.data = answerData({ cfg: st.cfg, a: st.a }, packed);
    let list;
    try { list = duelList(st.data, world.W, world.H); } catch (e) { ui.toast(tr('Der Code ist beschädigt.')); return; }
    onlineFight(list, st.cfg.seed, st.cfg.map || 'feld');
    ui.toast(tr('Aufgedeckt!'));
    sync();
  }
  const showChallenge = () => shareDlg.showCode(encode(challengeData(st.cfg, st.a)), tr('Herausforderung'),
    tr('Kategorie {c}, {n} Punkte. Schick diesen Code deinem Gegner. Er öffnet das Spiel, klickt „Code laden“ und fügt ihn ein. Seinen Antwort-Code lädst du danach genauso, dann siehst du euren Kampf.', { c: tr(CAT_NAME[st.cfg.cat]), n: budgetOf(st.cfg) }));
  const showAnswer = () => shareDlg.showCode(encode(st.data), tr('Antwort-Code'),
    tr('Schick diesen Code zurück an deinen Gegner. Mit „Code laden“ sieht er genau diesen Kampf.'));

  // Code aus „Code laden“ (main.js loadCode)
  function load(d) {
    if (online.active()) online.leave(null);
    if (!game.battle) enterBattle(); else if (game.battle.phase !== 'plan') editBattle();
    if (d.k === 'duel') {
      setup('b', d.cfg, 'rot');
      st.a = d.a;
      audio.play('whoosh');
      paintCard('rot', tr('Herausforderung'));
      return;
    }
    // Antwort: den Kampf zeigen
    setup('view', d.cfg, null);
    st.data = d;
    onlineFight(duelList(d, world.W, world.H), d.cfg.seed, d.cfg.map || 'feld');
    ui.toast(tr('Antwort geladen: euer Kampf läuft.'));
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
    ui.toast(tr('Code-Duell beendet.'));
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
    const note = tr(w === 'draw' ? 'Unentschieden.' : w === me ? 'Du gewinnst das Duell!' : 'Dein Gegner gewinnt das Duell.');
    box.innerHTML = `<div><div class="muted">${tr('Code-Duell')} · ${esc(tr(CAT_NAME[st.cfg.cat]))} · ${tr('{n} Punkte', { n: budgetOf(st.cfg) })} · ${tr('du bist {s}', { s: SIDE_N[me] })}</div>
        <div class="sc">${esc(note)}</div>
        <div class="muted">${st.role === 'b' ? tr('Schick den Antwort-Code zurück, dann sieht dein Gegner diesen Kampf. Revanche: gleiches Setup, du malst neu und schickst eine neue Herausforderung.') : tr('Revanche: gleiche Regel, Karte und Budget, du malst neu und schickst eine neue Herausforderung.')}</div></div>
      <div class="btnrow">${st.role === 'b' ? `<button class="go" id="duelAnswer">${tr('Antwort-Code')}</button>` : ''}<button class="go" id="duelRematch">${tr('Revanche')}</button><button class="btn" id="duelEnd">${tr('Duell beenden')}</button></div>`;
    if ($('duelAnswer')) $('duelAnswer').onclick = showAnswer;
    $('duelRematch').onclick = () => { const c = st.cfg; startA({ cat: c.cat, map: c.map || 'feld', budget: c.budget }); };
    $('duelEnd').onclick = stop;
  }

  /* ---------- Anzeige ---------- */
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  function sync() {
    const b = game.battle, plan = !!b && b.phase === 'plan';
    const on = !!st && !!b && b === battleRef && !!b.hot && b.hot.duel;
    btn.hidden = !b || (!on && (!plan || !!b.hot));
    btn.textContent = on ? tr('Duell beenden') : tr('Code-Duell');
    btn.classList.toggle('on', on);
    if (!on) return;
    for (const id of ['batHot', 'batOnl', 'batSwap', 'batShare']) if ($(id)) $(id).hidden = true;
    const h = b.hot, side = h.step === 'blau' || h.step === 'rot' ? h.step : null, c = st.cfg;
    $('batClear').hidden = !side;
    const label = tr(side ? 'Fertig' : st.role === 'a' ? 'Code zeigen' : st.role === 'b' && b.phase === 'done' ? 'Antwort-Code' : b.phase === 'fight' ? 'Kampf läuft' : 'Fertig');
    setText(go, label);
    go.disabled = !(side || (st.role === 'a' && st.a) || (st.role === 'b' && st.data && b.phase === 'done'));
    const head = `${tr('Code-Duell')} · ${tr(CAT_NAME[c.cat])} · ${tr((MAP[c.map] || MAP.feld).n)}`;
    const tail = side ? tr(side === 'blau' ? 'du malst links: {a} / {b} Punkte' : 'du malst rechts: {a} / {b} Punkte', { a: fmtPts(h.spent[side]), b: budgetOf(c) })
      : tr(st.role === 'a' ? 'Code verschickt · die Antwort mit „Code laden“ einfügen'
      : b.phase === 'fight' ? 'Kampf läuft' : 'Kampf vorbei');
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
