// König des Hügels (25.11.): Knopf in der Schlachtleiste, Thron-Karte, Herausfordern und Ergebnis. Regeln und Dokument:
// hill.js (rein). Gespeichert wird in der Datenbank des Artefakts (db-Capability, Dokument hill/<Datum>), live für alle.
// Ohne Datenbank (öffentlicher Link, lokale Kopie) verweist die Karte auf die Live-Version.
// Gemalt wird wie im Code-Duell (battle.hot mit online: true, hill: true, def = Regel des Tages), immer rechts als Rot;
// der König steht links und bleibt bis zum Kampf verdeckt.
import { getStore } from '../net.js';
import { roundDef, packArmy, CAT_NAME, budgetOf } from '../online.js';
import { RULE, MAP, applyMap, mapSVG } from '../rules.js';
import { hillCfg, hillSeed, kingOf, histOf, lastOf, hillList, crown, firstKing, sameKing, reign, HILL_COLL } from '../hill.js';
import { cleanName, NAME_MAX } from '../dailyboard.js';
import { dateKey, shortDate } from '../daily.js';
import { fmtPts } from '../cards.js';
import { tr } from '../i18n.js';

const LIVE_URL = 'https://claude.ai/artifact/HnB3bdhDEz8psMDZ3GGP5W';
const NAME_KEY = 'kritzel-hill-name';
const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

const CSS = `
.card.hill{max-width:600px}
.hillk{box-sizing:border-box;display:flex;align-items:center;gap:14px;width:100%;border:2px solid var(--ink);border-radius:14px;padding:10px 14px;background:#fffbe9}
.hillk .crown{font-size:44px;line-height:1}
.hillk b{font-family:var(--f-logo);font-weight:400;font-size:24px;letter-spacing:.5px}
.hillk.empty{background:#f4f4f4;border-style:dashed}
.hillk.me{background:#fff3b0;box-shadow:0 0 0 3px #ffc400}
.hillh{display:flex;flex-direction:column;gap:3px;width:100%;font-size:13px}
.hillh div{display:flex;justify-content:space-between;gap:10px;color:var(--muted)}
.card.hill input{font:800 15px var(--f-ui);letter-spacing:0;text-transform:none;padding:6px 10px;border:1.5px solid var(--line);border-radius:10px;width:180px}
#batHill.on{background:var(--sel);border-color:var(--selb)}
`;

export function createHillUI({ game, world, ui, audio, onlineFight, clearWorld, undoStack, markAll }) {
  { const s = document.createElement('style'); s.textContent = CSS; document.head.append(s); }
  const $ = id => document.getElementById(id);
  // live: Datenbank-Verbindung; st: laufende Herausforderung { role: 'paint' | 'fight' | 'view', date, cfg, king, b, done }
  const live = { db: null, me: null, state: 'off', date: '', doc: null, unsub: null, note: '' };
  let st = null, battleRef = null, name = '';
  try { name = cleanName(localStorage.getItem(NAME_KEY) || ''); } catch (e) { /* ohne Speicher */ }

  /* ---------- Knopf ---------- */
  const btn = document.createElement('button');
  btn.className = 'btn'; btn.id = 'batHill'; btn.innerHTML = '<span class="ico" aria-hidden="true">👑</span><span></span>'; const lab = btn.lastChild; lab.textContent = tr('Hügel');
  btn.title = tr('König des Hügels: schlag die Armee auf dem Thron und setz dich selbst drauf');
  { const vs = $('batVs'); if (vs) vs.append(btn); else $('batGo').before(btn); }
  btn.onclick = () => { if (st) stop(); else { const b = game.battle; if (b && b.phase === 'plan' && !b.hot) openThrone(); } };

  const go = $('batGo'), goPrev = go.onclick;
  go.onclick = e => {
    if (!st) { if (goPrev) goPrev.call(go, e); return; }
    e.currentTarget.blur();
    const h = game.battle && game.battle.hot;
    if (h && h.step === 'rot') finish();
    else if (game.battle && game.battle.phase === 'done' && game.battle.result) ui.showBattleResult(game.battle.result);
  };

  /* ---------- Karte ---------- */
  const ov = document.createElement('div');
  ov.className = 'ov'; ov.id = 'ovHill'; ov.hidden = true;
  ov.innerHTML = '<div class="card onl hill shadow" role="dialog" aria-modal="true" aria-labelledby="hillTitle"></div>';
  $('app').append(ov);
  const card = ov.firstChild;
  let shown = false;
  const hideCard = () => { ov.hidden = true; shown = false; };
  const showCard = html => { card.innerHTML = html; ov.hidden = false; shown = true; };

  /* ---------- Datenbank ---------- */
  let dbP = null;
  function connect() {
    if (dbP) return dbP;
    dbP = (async () => {
      try {
        const S = await getStore();
        if (!S) return null;
        const { db, user } = S;
        live.db = db;
        live.me = (user && await user.id().catch(() => null)) || 'anon-' + Math.random().toString(36).slice(2, 10);
        return db;
      } catch (e) { return null; }
    })();
    return dbP;
  }
  const docRef = date => live.db.doc(`${HILL_COLL}/${date}`);
  function watch(date) {
    if (live.date === date && live.unsub) return;
    if (live.unsub) { try { live.unsub(); } catch (e) { /* weg */ } }
    live.date = date; live.doc = null; live.state = 'load'; live.note = '';
    const timer = setTimeout(() => { if (live.state === 'load') { live.note = tr('Der Hügel ist gerade nicht erreichbar.'); refresh(); } }, 10000);
    live.unsub = docRef(date).onSnapshot(s => {
      if (!s.metadata || !s.metadata.fromCache) { clearTimeout(timer); live.note = ''; }
      live.state = 'on'; live.doc = s.exists ? s.data() : null;
      refresh();
    }, () => { clearTimeout(timer); live.state = 'off'; live.note = tr('Der Hügel ist gerade nicht erreichbar.'); refresh(); });
  }
  // Schreiben mit kurzer Sperre: nur, wenn der König noch der ist, gegen den gekämpft wurde
  async function write(date, make) {
    const ref = docRef(date);
    for (let i = 0; i < 4; i++) {
      let lease;
      try { lease = await ref.acquire({ holder: live.me, ttlMs: 5000 }); } catch (e) { return 'error'; }
      if (lease.acquired) {
        try {
          const s = await ref.get();
          const next = make(s.exists ? s.data() : null);
          if (!next) return 'changed';
          await ref.set(next);
          return 'ok';
        } catch (e) { return 'error'; }
      }
      await new Promise(r => setTimeout(r, 700 + Math.random() * 600));
    }
    return 'busy';
  }

  /* ---------- Thron-Karte ---------- */
  async function openThrone() {
    showCard(`<h2 id="hillTitle">👑 ${tr('König des Hügels')}</h2><p class="muted">${tr('Verbinde …')}</p>`);
    const db = await connect();
    if (!shown) return;
    if (!db) {
      showCard(`<h2 id="hillTitle">👑 ${tr('König des Hügels')}</h2>
        <p>${tr('Jeden Tag ein neuer Hügel: Wer den König schlägt, sitzt selbst auf dem Thron, bis ihn jemand stürzt.')}</p>
        <p class="muted">${tr('Der Thron wird für alle gespeichert. Das geht nur in der <a href="{u}" target="_blank" rel="noopener">Live-Version</a> (nur mit Einladung).', { u: LIVE_URL })}</p>
        <div class="btnrow"><button class="btn" id="hillClose">${tr('Schließen')}</button></div>`);
      $('hillClose').onclick = hideCard; return;
    }
    watch(dateKey());
    renderThrone();
  }
  function refresh() { if (shown && !st) renderThrone(); }
  function renderThrone() {
    const date = live.date || dateKey(), cfg = hillCfg(date), doc = live.doc;
    const k = kingOf(doc, date, world.W, world.H), hist = histOf(doc, date), last = lastOf(doc, date);
    const mine = !!k && k.by === live.me, mp = MAP[cfg.map];
    const rg = k ? reign(Date.now() - k.at) : null;
    const since = rg ? (rg.h ? tr('seit {h} Std. {m} Min.', rg) : tr('seit {m} Min.', rg)) : '';
    const who = n => esc(n || tr('Unbekannt'));
    const kingBox = live.state === 'load' && !doc ? `<div class="hillk empty"><span class="muted">${tr('Lade den Hügel …')}</span></div>`
      : k ? `<div class="hillk${mine ? ' me' : ''}"><span class="crown">👑</span><div><b>${who(k.n)}</b>${mine ? ` <span class="muted">(${tr('du')})</span>` : ''}<br>
          <span class="muted">${tr('regiert {s}', { s: since })} · ${tr(k.def === 1 ? '{n} Angriff abgewehrt' : '{n} Angriffe abgewehrt', { n: k.def })}</span></div></div>`
      : `<div class="hillk empty"><span class="crown">🪑</span><div><b>${tr('Der Thron ist leer')}</b><br><span class="muted">${tr('Male eine Armee und setz dich als Erster drauf.')}</span></div></div>`;
    const histHtml = hist.length ? `<h3>${tr('Gestürzt heute')}</h3><div class="hillh">${hist.slice(0, 5).map(h => {
      const r = reign(h.until - h.at);
      return `<div><span>${who(h.n)}</span><span>${r.h ? tr('{h} Std. {m} Min.', r) : tr('{m} Min.', r)} · ${tr(h.def === 1 ? '{n} Angriff abgewehrt' : '{n} Angriffe abgewehrt', { n: h.def })}</span></div>`;
    }).join('')}</div>` : '';
    showCard(`<h2 id="hillTitle">👑 ${tr('König des Hügels')}</h2>
      <div class="row"><div class="mapprev">${mapSVG(cfg.map, 220, 124)}</div><div><b>${tr('Hügel vom {d}', { d: shortDate(date) })}</b><br>
        <span class="cat">${esc(tr(CAT_NAME[cfg.cat]))}</span> · ${esc(tr(mp.n))}<br><span class="muted">${esc(tr(RULE[cfg.cat].d))}. ${tr('{n} Punkte', { n: budgetOf(cfg) })}.</span></div></div>
      ${kingBox}
      ${live.note ? `<p class="warn">${esc(live.note)}</p>` : ''}
      <div class="row"><label class="muted" for="hillName">${tr('Dein Name auf dem Thron')}</label><input id="hillName" maxlength="${NAME_MAX}" placeholder="${tr('Name')}" autocomplete="off" spellcheck="false" value="${esc(name)}"></div>
      ${histHtml}
      <p class="muted">${tr('Du malst rechts, ohne die Armee des Königs zu sehen. Gewinnst du, verteidigt deine Armee ab jetzt den Thron. Jeden Tag gibt es einen neuen Hügel.')}</p>
      <div class="btnrow">${mine ? `<button class="go" disabled>${tr('Du bist König')}</button>` : `<button class="go" id="hillGo"${live.state !== 'on' ? ' disabled' : ''}>${k ? tr('Herausfordern') : tr('Thron besteigen')}</button>`}
        ${last ? `<button class="btn" id="hillLast" title="${tr('Den Kampf der letzten Krönung ansehen')}">${tr('Letzte Krönung ansehen')}</button>` : ''}<button class="btn" id="hillClose">${tr('Schließen')}</button></div>`);
    const inp = $('hillName');
    inp.oninput = () => { name = cleanName(inp.value); try { localStorage.setItem(NAME_KEY, name); } catch (e) { /* ohne Speicher */ } };
    inp.onkeydown = e => e.stopPropagation();
    if ($('hillGo')) $('hillGo').onclick = () => startChallenge(date, k);
    if ($('hillLast')) $('hillLast').onclick = () => viewLast(date, last);
    $('hillClose').onclick = hideCard;
  }

  /* ---------- Ablauf ---------- */
  function setup(role, date, king) {
    const b = game.battle, cfg = hillCfg(date);
    st = { role, date, cfg, king, b: null, done: false }; battleRef = b;
    b.phase = 'plan'; b.stats = null; b.result = null; b.endT = -1; b.t = 0; b.snap = null; b.batchRes = null;
    $('ovBat').hidden = true; document.body.classList.remove('bat-res');
    clearWorld(); world.teamMode = true; undoStack.length = 0;
    applyMap(world, cfg.map); markAll();
    b.hot = { online: true, hill: true, budget: budgetOf(cfg), step: role === 'paint' ? 'rot' : 'online', spent: { blau: 0, rot: 0 }, def: roundDef(cfg) };
    game.setCat(cfg.cat);
    ui.updateBattle(); ui.updateCounts(); ui.updateControls();
  }
  function startChallenge(date, king) {
    if (!name) { ui.toast(tr('Gib zuerst deinen Namen ein.')); $('hillName').focus(); return; }
    hideCard();
    setup('paint', date, king);
    audio.play('whoosh');
    ui.toast(king ? tr('Male rechts deine Armee. Der König bleibt verdeckt, bis du „Fertig“ drückst.') : tr('Male rechts deine Armee. Mit „Fertig“ setzt du dich auf den Thron.'));
    sync();
  }
  async function finish() {
    const h = game.battle.hot;
    if (!world.units.some(u => u.alive && u.team === 'rot')) { ui.toast(tr('Male zuerst deine Armee ({c}).', { c: tr(CAT_NAME[st.cfg.cat]) })); return; }
    const packed = packArmy(world, 'rot');
    h.step = 'online'; undoStack.length = 0; st.b = packed;
    const me = { by: live.me, n: name };
    if (!st.king) {
      // leerer Thron: direkt hinsetzen (falls nicht inzwischen jemand anders sitzt)
      const date = st.date, res = await write(date, doc => (kingOf(doc, date, world.W, world.H) ? null : firstKing(doc, date, packed, me, Date.now(), world.W, world.H)));
      if (res === 'ok') { audio.play('whoosh'); ui.toast(tr('👑 Du sitzt auf dem Thron!')); stop(true); openThrone(); }
      else if (res === 'changed') { ui.toast(tr('Jemand war schneller und sitzt schon auf dem Thron. Fordere ihn heraus!')); stop(true); openThrone(); }
      else { h.step = 'rot'; ui.toast(tr('Speichern ging gerade nicht. Versuch es gleich noch mal.')); }
      sync(); return;
    }
    st.role = 'fight';
    let list;
    try { list = hillList(st.king.a, packed, st.cfg, world.W, world.H); } catch (e) { ui.toast(tr('Die Armee des Königs ist beschädigt.')); return; }
    onlineFight(list, hillSeed(st.date, st.king), st.cfg.map);
    ui.toast(tr('Aufgedeckt!'));
    sync();
  }
  // Kampf vorbei: Krönung oder abgewehrter Angriff speichern
  async function report(winner) {
    const s = st, date = s.date, old = s.king;
    s.result = 'saving'; decorate();
    let res;
    if (winner === 'rot') {
      res = await write(date, doc => (sameKing(kingOf(doc, date, world.W, world.H), old) ? crown(doc, date, old, s.b, { by: live.me, n: name }, Date.now(), world.W, world.H) : null));
      s.result = res === 'ok' ? 'crowned' : res === 'changed' ? 'changed' : 'failed';
      if (res === 'ok') audio.play('whoosh');
    } else {
      res = await write(date, doc => {
        const k = kingOf(doc, date, world.W, world.H);
        return sameKing(k, old) ? { ...doc, k: { ...doc.k, def: k.def + 1 } } : null;
      });
      s.result = 'lost';
    }
    if (st === s) decorate();
  }
  function viewLast(date, last) {
    hideCard();
    setup('view', date, null);
    let list;
    try { list = hillList(last.a, last.b, st.cfg, world.W, world.H); } catch (e) { stop(true); ui.toast(tr('Dieser Kampf lässt sich nicht mehr zeigen.')); return; }
    onlineFight(list, last.seed, st.cfg.map);
    st.last = last;
    ui.toast(tr('{n} stürzt {o}', { n: last.n || tr('Unbekannt'), o: last.old || tr('Unbekannt') }));
    sync();
  }
  function stop(silent = false) {
    const b = battleRef; st = null; battleRef = null; hideCard();
    if (b && game.battle === b) {
      b.hot = null;
      if (b.phase !== 'plan') { b.phase = 'plan'; b.stats = null; b.result = null; b.endT = -1; b.t = 0; }
      $('ovBat').hidden = true; document.body.classList.remove('bat-res');
      clearWorld(); world.teamMode = true;
      ui.renderUnits(); ui.updateBattle(); ui.updateCounts(); ui.updateControls();
    }
    if (!silent) ui.toast(tr('Hügel verlassen.'));
    sync();
  }

  /* ---------- Ergebnis ---------- */
  const prevShow = ui.showBattleResult;
  ui.showBattleResult = r => { prevShow(r); decorate(); };
  function decorate() {
    let box = $('hillRes');
    const on = !!st && game.battle === battleRef && st.role !== 'paint' && game.battle.phase === 'done';
    if (!on) { if (box) box.remove(); return; }
    for (const id of ['batAgain', 'batTen', 'batEdit']) $(id).hidden = true;
    if (!box) { box = document.createElement('div'); box.className = 'onlbox'; box.id = 'hillRes'; $('ovBat').querySelector('.btnrow').before(box); }
    const s = st, kn = esc((s.king && s.king.n) || tr('Unbekannt'));
    const head = s.role === 'view' ? tr('{n} stürzt {o}', { n: esc(s.last.n || tr('Unbekannt')), o: esc(s.last.old || tr('Unbekannt')) })
      : s.result === 'crowned' ? '👑 ' + tr('Du bist der neue König!')
      : s.result === 'saving' ? tr('Speichere …')
      : s.result === 'changed' ? tr('Gewonnen, aber der Thron hat gerade gewechselt')
      : s.result === 'failed' ? tr('Gewonnen, aber Speichern ging nicht')
      : tr('{n} bleibt König', { n: kn });
    const note = s.role === 'view' ? tr('Die letzte Krönung auf dem Hügel.')
      : s.result === 'crowned' ? tr('Deine Armee verteidigt jetzt den Thron gegen alle, die heute noch kommen.')
      : s.result === 'changed' ? tr('Jemand anders hat {n} kurz vor dir gestürzt. Fordere den neuen König heraus!', { n: kn })
      : s.result === 'failed' ? tr('Die Verbindung hat nicht geklappt. Versuch es noch mal.')
      : s.result === 'lost' ? tr('Versuch es mit einer anderen Armee: Gegen denselben König läuft der Kampf gleich ab, nur deine Armee ändert sich.') : '';
    box.innerHTML = `<div><div class="muted">👑 ${tr('König des Hügels')} · ${esc(tr(CAT_NAME[s.cfg.cat]))} · ${esc(tr(MAP[s.cfg.map].n))}</div>
        <div class="sc">${head}</div><div class="muted">${esc(note)}</div></div>
      <div class="btnrow">${s.role === 'fight' && s.result === 'lost' ? `<button class="go" id="hillAgain">${tr('Noch mal')}</button>` : ''}<button class="go" id="hillThrone">${tr('Zum Thron')}</button><button class="btn" id="hillEnd">${tr('Verlassen')}</button></div>`;
    if ($('hillAgain')) $('hillAgain').onclick = () => { const { date, king } = s; setup('paint', date, king); sync(); };
    $('hillThrone').onclick = () => { stop(true); openThrone(); };
    $('hillEnd').onclick = () => stop();
  }

  /* ---------- Anzeige ---------- */
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  function sync() {
    const b = game.battle, plan = !!b && b.phase === 'plan';
    const on = !!st && !!b && b === battleRef && !!b.hot && b.hot.hill;
    btn.hidden = !on;   // Einstieg über die Online-Lobby (ui/online.js); der Knopf dient nur noch zum Verlassen
    lab.textContent = on ? tr('Hügel verlassen') : tr('Hügel');
    btn.classList.toggle('on', on);
    if (!on) return;
    go.classList.remove('stop');
    for (const id of ['batHot', 'batOnl', 'batDuel', 'batSwap', 'batShare']) if ($(id)) $(id).hidden = true;
    const h = b.hot, painting = h.step === 'rot', c = st.cfg;
    $('batClear').hidden = !painting;
    setText(go, tr(painting ? 'Fertig' : b.phase === 'done' ? 'Ergebnis' : b.phase === 'fight' ? 'Kampf läuft' : 'Warte …'));
    go.disabled = !(painting || (b.phase === 'done' && b.result));
    const head = `👑 ${tr('Hügel')} · ${tr(CAT_NAME[c.cat])} · ${tr(MAP[c.map].n)}`;
    const tail = painting ? tr('du malst rechts: {a} / {b} Punkte', { a: fmtPts(h.spent.rot), b: budgetOf(c) })
      : tr(b.phase === 'fight' ? 'Kampf läuft' : 'Kampf vorbei');
    setText($('batHint'), `${head} · ${tail}`);
    if (plan && painting) { setText($('ptsR'), fmtPts(h.spent.rot)); setText($('ptsB'), '?'); }
  }
  const prevSync = game.onlineUI;
  game.onlineUI = () => { if (prevSync) prevSync(); sync(); };

  function frame() {
    if (!st) return;
    const b = game.battle;
    if (b !== battleRef) { st = null; battleRef = null; hideCard(); return; }
    if (st.role === 'fight' && !st.done && b.phase === 'done' && b.result) { st.done = true; report(b.result.winner); }
  }
  // Datum wechselt um Mitternacht: neuer Hügel
  setInterval(() => { if (live.db && shown && live.date && live.date !== dateKey()) { watch(dateKey()); refresh(); } }, 30000);
  const api = { open: () => { const b = game.battle; if (b && b.phase === 'plan' && !b.hot) openThrone(); }, frame, stop, covered: () => !ov.hidden, active: () => !!st };
  game.hillUI = api;   // Einstieg für die gemeinsame Online-Lobby (ui/online.js)
  return api;
}
