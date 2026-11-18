// Hotseat-Versus (Audit 18.11.): Knopf in der Schlachtleiste, Budgetwahl, Deckkarten zwischen den Zügen, Anzeige von
// Budget und Seite. Die Regeln stehen in hotseat.js (rein); main.js ruft paintAt, clear, onUndo, spent und frame auf.
// Zustand: game.battle.hot (createHot) oder nichts (freie Schlacht wie bisher).
import { createHot, painter, hiddenTeam, hotPaint, finishSide, clearSide, HOT_BUDGETS, HOT_DEFAULT, SIDE_NAME } from '../hotseat.js';
import { fmtPts } from '../cards.js';

const CSS = `
.ov.hot-cover{background:#fff;backdrop-filter:none;-webkit-backdrop-filter:none;z-index:7}
.card.hot{max-width:520px;align-items:flex-start}
.card.hot h2.blau{color:#3f7cff}.card.hot h2.rot{color:#ff4d4d}
.hotbud{display:flex;gap:8px;flex-wrap:wrap}
.hotbud .btn.on{background:var(--sel);border-color:var(--selb)}
.hotbud .btn b{display:block;font-family:var(--f-logo);font-weight:400;font-size:22px;letter-spacing:.5px}
.hotbud .btn span{font-size:12px;color:var(--muted)}
#batHot.on{background:var(--sel);border-color:var(--selb)}
`;

export function createHotseatUI({ game, world, ui, renderer, audio, pointer, startBattle, markAll, rebuildHash, undoStack }) {
  const $ = id => document.getElementById(id);
  const style = document.createElement('style'); style.textContent = CSS; document.head.append(style);
  const hot = () => (game.battle ? game.battle.hot || null : null);

  /* ---------- Knopf in der Schlachtleiste ---------- */
  const btn = document.createElement('button');
  btn.className = 'btn'; btn.id = 'batHot'; btn.textContent = 'Hotseat';
  btn.title = 'Zwei Spieler an einem Gerät: jede Seite malt verdeckt mit eigenem Budget';
  $('batGo').before(btn);
  btn.onclick = () => { const b = game.battle; if (!b || b.phase !== 'plan') return; if (b.hot) stop(); else openSetup(); };

  // „Los!“ wird in der Hotseat-Planung zu „Fertig“
  const go = $('batGo'), goPrev = go.onclick;
  go.onclick = e => {
    const h = hot();
    if (h && painter(h) && game.battle.phase === 'plan') { e.currentTarget.blur(); done(); return; }
    if (goPrev) goPrev.call(go, e);
  };

  /* ---------- Karten: Budgetwahl und Deckkarten ---------- */
  const ov = document.createElement('div');
  ov.className = 'ov'; ov.id = 'ovHot'; ov.hidden = true;
  ov.innerHTML = '<div class="card hot shadow" role="dialog" aria-modal="true" aria-labelledby="hotTitle"></div>';
  $('app').append(ov);
  const card = ov.firstChild;
  let shown = '';   // was die Karte gerade zeigt ('setup', 'coverRot', 'coverGo' oder '')

  function openSetup() {
    let pick = HOT_DEFAULT;
    card.innerHTML = `<h2 id="hotTitle">Hotseat</h2>
      <p>Zwei Spieler, ein Gerät. Erst malt Blau links, dann Rot rechts, ohne Blaus Armee zu sehen. Jede Seite hat dasselbe Budget, Gelände kostet mit.</p>
      <div class="hotbud">${HOT_BUDGETS.map(v => `<button class="btn${v === pick ? ' on' : ''}" data-v="${v}"><b>${v}</b><span>Punkte je Seite</span></button>`).join('')}</div>
      <div class="btnrow"><button class="go" id="hotStart">Blau beginnt</button><button class="btn" id="hotCancel">Abbrechen</button></div>`;
    card.querySelectorAll('.hotbud .btn').forEach(b => {
      b.onclick = () => { pick = +b.dataset.v; card.querySelectorAll('.hotbud .btn').forEach(x => x.classList.toggle('on', x === b)); };
    });
    $('hotStart').onclick = () => start(pick);
    $('hotCancel').onclick = () => hideCard();
    ov.classList.remove('hot-cover');
    shown = 'setup'; ov.hidden = false;
    $('hotStart').focus();
  }
  function cover(step) {
    const rot = step === 'coverRot';
    card.innerHTML = rot
      ? `<h2 id="hotTitle" class="rot">Rot ist dran</h2><p><b>Blau, bitte wegschauen!</b> Rot malt jetzt rechts mit ${game.battle.hot.budget} Punkten. Blaus Armee bleibt versteckt.</p>
         <div class="btnrow"><button class="go" id="hotNext">Ich bin Rot</button></div>`
      : `<h2 id="hotTitle">Bereit?</h2><p>Beide Armeen stehen. <b>Beide schauen hin</b>: Jetzt werden sie aufgedeckt.</p>
         <div class="btnrow"><button class="go" id="hotNext">Los!</button></div>`;
    $('hotNext').onclick = () => (rot ? beginRot() : fightNow());
    ov.classList.add('hot-cover');
    shown = step; ov.hidden = false;
    $('hotNext').focus();
  }
  function hideCard() { ov.hidden = true; shown = ''; }

  /* ---------- Ablauf ---------- */
  const clearUndo = () => { undoStack.length = 0; };
  function start(budget) {
    const b = game.battle; if (!b || b.phase !== 'plan') { hideCard(); return; }
    // frisches Feld: die freie Aufstellung bleibt nicht stehen (sonst sähe Rot sie)
    game.clear();
    b.hot = createHot(budget);
    clearUndo(); hideCard(); sync();
    ui.toast(`Blau malt links: ${b.hot.budget} Punkte.`);
  }
  function stop() {
    const b = game.battle; if (!b) return;
    b.hot = null; hideCard(); sync();
    ui.toast('Hotseat beendet: freie Schlacht.');
  }
  function done() {
    const h = hot(); if (!h) return;
    const msg = finishSide(world, h);
    if (msg) { ui.toast(msg); return; }
    clearUndo(); sync();
  }
  function beginRot() { const h = hot(); if (!h) return; h.step = 'rot'; clearUndo(); hideCard(); sync(); }
  function fightNow() {
    const h = hot(); if (!h) return;
    h.step = 'fight'; hideCard(); sync();
    if (!startBattle()) { h.step = 'rot'; sync(); }
  }

  /* ---------- Anzeige ---------- */
  const setText = (el, v) => { if (el.textContent !== v) el.textContent = v; };
  // nach ui.updateBattle (Haken in ui.js): Leiste, Punktepille, Knopf; nach der Schlacht zurück in die Planung = Ende
  function sync() {
    const b = game.battle, h = b ? b.hot : null;
    if (b && h && h.step === 'fight' && b.phase === 'plan') { b.hot = null; ui.toast('Hotseat beendet: freie Aufstellung.'); }
    const hh = b ? b.hot : null, side = painter(hh), plan = !!b && b.phase === 'plan';
    btn.hidden = !plan;
    btn.textContent = hh ? 'Hotseat beenden' : 'Hotseat';
    btn.classList.toggle('on', !!hh);
    if (!b) return;
    if (hh && plan) {
      $('batSwap').hidden = true;
      $('batClear').hidden = !side;
      setText(go, side ? 'Fertig' : 'Los!');
      setText($('batHint'), side ? `Hotseat · ${SIDE_NAME[side]} malt ${side === 'blau' ? 'links' : 'rechts'} · ${fmtPts(hh.spent[side])} / ${hh.budget} Punkte` : 'Hotseat · gleich geht es los');
      setText($('ptsB'), hiddenTeam(hh) === 'blau' ? '?' : fmtPts(hh.spent.blau));
      setText($('ptsR'), fmtPts(hh.spent.rot));
    }
  }
  // je Bild (main.js frame): versteckte Seite im Renderer, Zählerkasten, Deckkarte passend zum Schritt
  let lastHidden = null;
  function frame() {
    const h = hot(), hid = h && game.battle.phase === 'plan' ? hiddenTeam(h) : null;
    if (hid !== lastHidden) {
      renderer.setOverlay({ hiddenTeam: hid });
      $('counts').hidden = !!hid;
      lastHidden = hid;
    }
    const want = h && (h.step === 'coverRot' || h.step === 'coverGo') && game.battle.phase === 'plan' ? h.step : '';
    if (want && shown !== want) cover(want);
    else if (!want && shown && shown !== 'setup') hideCard();
    else if (shown === 'setup' && !(game.battle && game.battle.phase === 'plan')) hideCard();
  }

  /* ---------- Malen ---------- */
  // true: der Tupfer gehört dem Hotseat (gemalt oder gesperrt), main.js malt dann nicht selbst
  function paintAt(stroke, wx, wy, erase) {
    const b = game.battle, h = hot();
    if (!h || !b || b.phase !== 'plan') return false;
    if (!painter(h)) { stroke.blocked = true; return true; }
    const first = stroke.first; stroke.first = false;
    pointer.erasing = erase;
    const sel = erase ? 'radierer' : game.sel;
    const r = hotPaint(world, h, stroke, wx, wy, game.brush, sel, first);
    if (r.blocked) { stroke.blocked = true; if (r.warning) ui.toast(r.warning); return true; }
    if (r.changed && r.cells) renderer.markTerrainDirty(r.cells.gx0, r.cells.gy0, r.cells.gx1, r.cells.gy1);
    if (r.placed) audio.play('pop');
    if (r.placed || r.changed) ui.updateBattle();
    if (r.warning) ui.toast(r.warning);
    return true;
  }
  // „Leeren“: nur die eigene Hälfte. true: erledigt (oder gesperrt), main.js leert dann nicht selbst
  function clear() {
    const h = hot(); if (!h || game.battle.phase !== 'plan') return false;
    if (!painter(h)) return true;
    clearSide(world, h); clearUndo();
    markAll(); rebuildHash(world); ui.updateBattle(); ui.updateCounts();
    return true;
  }
  const spent = () => { const h = hot(), s = painter(h); return s ? h.spent[s] : 0; };
  function onUndo(v) { const h = hot(), s = painter(h); if (s) { h.spent[s] = v; ui.updateBattle(); } }
  const covered = () => !ov.hidden;

  game.hotseatUI = sync;
  return { paintAt, clear, spent, onUndo, frame, covered, painter: () => painter(hot()), start, stop, done, beginRot, fightNow };
}
