// HUD: Palette, Zähler, Missionsleiste, Dialoge, Banner, Toasts, Charakterkarten und Lexikon. Markup kommt aus index.html.
// Liest den Spielzustand aus `game` (main.js) und ruft dessen Aktionen auf.
import { UNITS, TERRAIN, PLURAL, CATEGORIES, TEAMS, MSG_NO_PAINT } from './data.js';
import { CHAPTERS, chapterById, chapterProgress } from './campaign/index.js';
import { iconURL, TEAM_KEYS } from './render/rig.js';
import { unitCard, cardTypes, RETREAT_NOTE, fmtPts, formationCards, FORMATION_NOTE } from './cards.js';
import { createCardHover, hoverOver, hoverEnd, selected, paint, cardKey, nextChange } from './cardhover.js';
import { armyPoints } from './sim.js';
import { MEDALS, hasMedal } from './medals.js';
/* ---------- Editor (Audit 18.11.) ---------- */
import { openCustomList as openCustomListView } from './ui/customlist.js';
import { dailyCard, dailyResult } from './ui/daily.js';   // Tageschallenge (Audit 18.11.)
import { tr, unitName, unitPlural, dec } from './i18n.js';   // Sprache (18.11.)
import { modeCards } from './ui/modes.js';
import { openAchievements } from './ui/achievements.js';   // Spielmodi (25.11.)

const $ = id => document.getElementById(id);
const ICON_PAUSE = '<path d="M9 5v14M15 5v14"/>';
const ICON_PLAY = '<path d="M7 5l12 7-12 7z"/>';
const ICON_MUTED = '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l4 6M21 9l-4 6"/>';
const ICON_SOUND = '<path d="M4 9h4l5-4v14l-5-4H4zM17 8a5 5 0 010 8M19.5 5.5a9 9 0 010 13"/>';

/* ---------- Charakterkarten (Spez. #29) ---------- */
// Markup einer Karte aus unitCard (cards.js). pic(t) liefert das Sticker-Porträt (iconURL, gleiche Zeichnung
// wie der Rig-Atlas), mini(t) die kleinen Symbole für stark/schwach. Nur bei Bedarf gebaut, nie je Bild.
const fmt = v => dec(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10);
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const CAT_NAME = Object.fromEntries(CATEGORIES.map(([k, n]) => [k, tr(n)]));
// Lexikon: Karte einer Kritzel-Form mit dem Strich als Bild (Pinsel aufs Papier, Gegner rechts)
const FORM_SVG = {
  keil: '<polyline points="18,14 60,38 18,62"/>',
  kreis: '<circle cx="38" cy="38" r="24"/>',
  linie: '<line x1="10" y1="38" x2="66" y2="38"/>',
};
function formationHTML(f) {
  return `<div class="uc-hd">
    <div class="uc-pic"><svg viewBox="0 0 76 76" width="72" height="72" aria-hidden="true">${FORM_SVG[f.k] || ''}</svg></div>
    <div class="uc-tt"><div class="uc-nm" style="font-size:${f.name.length > 11 ? 20 : 25}px">${esc(f.name)}</div>
      <div class="uc-tags"><span class="cat">${tr('Formation')}</span></div></div>
  </div>
  <div class="uc-d"><b>${tr('So malst du sie:')}</b> ${esc(f.how)}</div>
  <div class="uc-ab"><div><b>${tr('Bonus')}</b> ${esc(f.effect)}</div></div>`;
}
function cardHTML(t, pic, mini, opt = {}) {
  const c = unitCard(t); if (!c) return '';
  const r = c.raw, st = c.stats;
  const row = (label, v, txt) => `<div class="s"><span>${label}</span><i><u style="width:${Math.max(3, v * 100).toFixed(1)}%"></u></i><b>${txt}</b></div>`;
  const vs = (cls, label, list) => `<div><span class="l ${cls}">${label}</span><span class="u">${list.length
    ? list.map(k => `<span><img src="${mini(k)}" alt="">${esc(unitName(k))}</span>`).join('')
    : '<em class="none">—</em>'}</span></div>`;
  const nameSize = c.name.length > 11 ? 20 : c.name.length > 8 ? 22 : 25;
  return `<div class="uc-hd">
    <div class="uc-pic"><img src="${pic(t)}" alt=""></div>
    <div class="uc-tt"><div class="uc-nm" style="font-size:${nameSize}px">${esc(c.name)}</div>
      <div class="uc-tags"><span class="cat">${esc(CAT_NAME[c.cat] || c.cat)}</span>${c.tags.map(x => `<span>${x}</span>`).join('')}</div></div>
    ${opt.key ? `<kbd class="uc-key" title="${tr('Taste')}">${opt.key}</kbd>` : ''}
  </div>
  <div class="uc-d">${esc(c.desc)}</div>
  <div class="uc-st">
    ${row(tr('Leben'), st.hp, r.hp)}
    ${row(r.heal ? tr('Heilung') : tr('Schaden'), st.dmg, fmt(r.dps) + '/s')}
    ${row(tr('Tempo'), st.speed, r.speed)}
    ${row(tr('Reichweite'), st.range, r.melee ? tr('nah') : r.range)}
    ${row(tr('Kosten'), st.cost, fmtPts(r.cost))}
  </div>
  ${c.abil.length ? `<div class="uc-ab">${c.abil.map(a => `<div><b>${esc(a.n)}</b> ${esc(a.d)}</div>`).join('')}</div>` : ''}
  ${c.syn && c.syn.length ? `<div class="uc-ab uc-syn">${c.syn.map(a => `<div><b>${esc(a.n)}</b> ${esc(a.d)}</div>`).join('')}</div>` : ''}
  <div class="uc-vs">${vs('s', tr('Stark gegen'), c.strong)}${vs('w', tr('Schwach gegen'), c.weak)}</div>
  ${opt.note ? `<div class="uc-note">${opt.note}</div>` : ''}`;
}

export function createUI(game) {
  const icons = {};
  const icon = k => icons[k] || (icons[k] = iconURL(k));
  // Porträts der Karten: größer gezeichnet (scharf auf HiDPI) und in der Teamvariante des Atlas, wenn Teamkampf läuft
  const portraits = {};
  const teamVi = () => (game.world.teamMode && !game.mission && !game.battle ? Math.max(0, TEAM_KEYS.indexOf(game.curTeam)) : 0);
  const portrait = k => { const vi = teamVi(), id = k + '|' + vi; return portraits[id] || (portraits[id] = iconURL(k, 176, vi)); };
  const accent = () => TEAMS[game.mission ? 'blau' : game.curTeam].c;
  // Kampfstatistik einer Mission, aus death-Ereignissen abgeleitet
  // killers: Typ des Verursachers -> eigene Verluste (Niederlage-Hinweis, hints.js)
  const stats = { lostBlue: 0, lostRed: 0, heroK: 0, heroType: null, killers: new Map() };

  /* ---------- Palette ---------- */
  const tabs = $('tabs');
  for (const [k, n] of CATEGORIES) {
    const b = document.createElement('button');
    b.textContent = tr(n); b.dataset.cat = k; b.setAttribute('role', 'tab');
    b.onclick = () => game.setCat(k);
    tabs.append(b);
  }

  function renderUnits() {
    const box = $('units'); box.innerHTML = '';
    const mis = game.mission;
    for (const b of tabs.children) {
      b.classList.toggle('on', b.dataset.cat === game.cat);
      b.disabled = !game.catAllowed(b.dataset.cat);
    }
    // nur malbare Einheiten (Vorgabe 3; catKeys filtert schon, hier noch einmal für die Leiste)
    game.catKeys(game.cat).filter(k => !UNITS[k] || UNITS[k].paint !== false).forEach((k, idx) => {
      const D = UNITS[k] || TERRAIN[k];
      const b = document.createElement('button');
      b.className = 'ub' + (k === game.sel ? ' on' : '');
      b.dataset.k = k; b.dataset.slot = idx + 1;
      if (!UNITS[k]) b.title = tr('{n} (Taste {k})', { n: tr(D.n), k: idx + 1 });
      b.setAttribute('aria-label', tr(D.n));
      const img = document.createElement('img'); img.src = icon(k); img.alt = ''; b.append(img);
      if ((mis || game.battle) && UNITS[k]) { const s = document.createElement('small'); s.textContent = fmtPts(UNITS[k].cost); b.append(s); }
      b.onclick = () => game.select(k);
      box.append(b);
    });
    updateInfo();
    // Neue Auswahl (Klick, Taste, Kategorie): Karte kurz zeigen; nicht beim allerersten Aufbau
    if (lastSel !== null && game.sel !== lastSel) selected(hov, performance.now());
    lastSel = game.sel;
    cardUpdate();
  }

  /* ---------- Karte bei Hover und Auswahl ---------- */
  // Schwebt über der Leiste und nimmt keine Zeiger-Ereignisse an (pointer-events: none). Wann sie welche Einheit zeigt,
  // entscheidet cardhover.js (rein, getestet): Hover hat Vorrang, Lücken halten sie kurz, sonst zeigt sie nach einer
  // Auswahl SEL_SHOW_MS lang die Auswahl. Ein Zeitgeber weckt cardUpdate zur nächsten Änderung (nextChange).
  const ucard = $('ucard'), unitsBox = $('units');
  const hov = createCardHover();
  let lastSel = null, shownId = '', cardTimer = 0;
  const btnFor = k => unitsBox.querySelector(`.ub[data-k="${k}"]`);
  function cardUpdate() {
    let k = null, btn = null;
    const now = performance.now();
    clearTimeout(cardTimer);
    const want = cardKey(hov, game.sel, now), wait = nextChange(hov, now);
    if (wait >= 0) cardTimer = setTimeout(cardUpdate, wait + 30);
    if ($('ovLex').hidden && want && UNITS[want]) { btn = btnFor(want); if (btn) k = want; }
    // Hover auf einem Knopf, der nicht (mehr) in der Leiste ist (Kategorie gewechselt): dann die Auswahl, wenn sie läuft
    if (!k && $('ovLex').hidden && want === hov.hoverK && UNITS[game.sel] && now < hov.selUntil) { btn = btnFor(game.sel); if (btn) k = game.sel; }
    if (!k) { ucard.hidden = true; shownId = ''; return; }
    const id = k + '|' + teamVi() + '|' + accent() + '|' + btn.dataset.slot;
    if (id !== shownId) {
      ucard.innerHTML = `<div class="uc wide">${cardHTML(k, portrait, icon, { key: btn.dataset.slot })}</div>`;
      ucard.style.setProperty('--tc', accent());
      ucard.classList.remove('pop'); void ucard.offsetWidth; ucard.classList.add('pop');
      shownId = id;
    }
    ucard.hidden = false;
    // Über der Leiste, waagrecht am Knopf ausgerichtet (im Bild gehalten), Pfeil zeigt auf den Knopf
    const app = $('app').getBoundingClientRect(), pal = unitsBox.closest('.palette').getBoundingClientRect();
    const b = btn.getBoundingClientRect(), w = ucard.offsetWidth, cx = b.left + b.width / 2 - app.left;
    const left = Math.max(8, Math.min(app.width - w - 8, cx - w / 2));
    ucard.style.left = left + 'px';
    // Über der Leiste; ist darüber kein Platz (Leiste nach oben verschoben, ui/dragbar.js), darunter
    const below = pal.top - app.top < ucard.offsetHeight + 20 && app.bottom - pal.bottom > pal.top - app.top;
    ucard.classList.toggle('below', below);
    ucard.style.bottom = below ? '' : (app.bottom - pal.top + 12) + 'px';
    ucard.style.top = below ? (pal.bottom - app.top + 12) + 'px' : '';
    ucard.style.setProperty('--ax', Math.max(18, Math.min(w - 18, cx - left)) + 'px');
  }
  // Knopf unter dem Zeiger (oder null: Lücke, kein Knopf)
  const ubAt = el => { const b = el && el.closest ? el.closest('.ub') : null; return b && unitsBox.contains(b) ? b.dataset.k : null; };
  const over = e => { const k = ubAt(e.target); if (k ? k !== hov.hoverK || hov.gapUntil : hov.hoverK && !hov.gapUntil) { hoverOver(hov, k, performance.now()); cardUpdate(); } };
  const end = () => { if (hov.hoverK || hov.gapUntil) { hoverEnd(hov); cardUpdate(); } };
  // pointermove auch: über einer Lücke kommt kein neues pointerover, wenn der Knopf darunter neu gebaut wurde
  unitsBox.addEventListener('pointerover', over);
  unitsBox.addEventListener('pointermove', over);
  unitsBox.addEventListener('pointerleave', end);
  unitsBox.addEventListener('pointercancel', end);
  // Sicherheitsnetz, falls pointerleave fehlt (schnelles Verlassen des Fensters oder Rahmens, neu gebaute Leiste):
  // jede Zeigerbewegung außerhalb der Leiste, das Verlassen der Seite, Fokusverlust, Scrollen und Größenänderung
  document.addEventListener('pointermove', e => { if (hov.hoverK && !unitsBox.contains(e.target)) end(); }, { passive: true });
  document.addEventListener('pointerout', e => { if (!e.relatedTarget) end(); });
  document.documentElement.addEventListener('pointerleave', end);
  window.addEventListener('blur', end);
  document.addEventListener('visibilitychange', () => { if (document.hidden) end(); });
  window.addEventListener('scroll', end, { capture: true, passive: true });
  window.addEventListener('resize', () => { end(); if (!ucard.hidden) cardUpdate(); });
  // Tastatur (Tab auf einen Einheitenknopf) zeigt die Karte wie Hover
  unitsBox.addEventListener('focusin', e => { const b = e.target.closest('.ub'); if (b && b.matches(':focus-visible')) { hoverOver(hov, b.dataset.k, performance.now()); cardUpdate(); } });
  unitsBox.addEventListener('focusout', () => { if (hov.hoverK && !unitsBox.matches(':hover')) end(); });
  // Malen auf dem Feld blendet die Karte sofort aus (Ereignis nur lesen, nichts verhindern)
  $('cv').addEventListener('pointerdown', () => { paint(hov); cardUpdate(); });

  /* ---------- Lexikon ---------- */
  // Alle Karten nach Kategorie, auch Einheiten, die die laufende Mission nicht erlaubt (gedimmt).
  // Klick auf eine erlaubte Karte wählt die Einheit. Schließt mit Esc, Knopf oder Klick daneben.
  let lexId = '';
  function openLexicon() {
    const def = game.battle && game.battle.hot && game.battle.hot.def;
    const ruleKey = def ? (def.id || (def.cats || []).join(',') + ':' + (def.units || []).join(',')) : '-';
    const id = teamVi() + '|' + accent() + '|' + (game.mission ? game.mission.id : '-') + '|' + ruleKey;
    if (id !== lexId) {
      $('lexNote').textContent = tr(RETREAT_NOTE);
      // erlaubt je Einheit (units und cats des Levels; nicht malbare wie der Ghul bleiben ansehbar, ui-Toast beim Klick)
      $('lexBody').innerHTML = `<section class="lexform"><h3>${tr('Formationen')}</h3><p class="fmnote">${esc(tr(FORMATION_NOTE))}</p><div class="lexgrid">${
        formationCards().map(f => `<div class="uc fmc">${formationHTML(f)}</div>`).join('')}</div></section>` + cardTypes().map(g => `<section><h3>${esc(g.name)}</h3><div class="lexgrid">${g.types.map(t => {
        const ok = UNITS[t].paint === false ? game.catAllowed(g.cat) : game.unitAllowed(t);
        return `<button class="uc lexc${ok ? '' : ' off'}" data-k="${t}" data-cat="${g.cat}"${ok ? '' : ' aria-disabled="true"'}>${cardHTML(t, portrait, icon, { note: ok ? '' : tr('In dieser Mission nicht erlaubt') })}</button>`;
      }).join('')}</div></section>`).join('');
      $('lexCard').style.setProperty('--tc', accent());
      lexId = id;
    }
    $('ovLex').hidden = false; $('bLex').classList.add('on');
    cardUpdate();
    $('lexClose').focus();
  }
  function closeLexicon() {
    if ($('ovLex').hidden) return;
    $('ovLex').hidden = true; $('bLex').classList.remove('on');
    $('bLex').focus();
  }
  $('lexBody').addEventListener('click', e => {
    const b = e.target.closest('.lexc'); if (!b) return;
    if (b.classList.contains('off')) { toast(tr('In dieser Mission nicht erlaubt.')); return; }
    if (UNITS[b.dataset.k] && UNITS[b.dataset.k].paint === false) { toast(MSG_NO_PAINT); return; }   // toast übersetzt   // Ghul: nur ansehen
    closeLexicon();
    if (game.cat !== b.dataset.cat) game.setCat(b.dataset.cat);
    game.select(b.dataset.k);
  });
  $('ovLex').addEventListener('pointerdown', e => { if (e.target === $('ovLex')) closeLexicon(); });
  $('bLex').onclick = () => ($('ovLex').hidden ? openLexicon() : closeLexicon());
  $('lexClose').onclick = () => closeLexicon();
  // Esc schließt den obersten schließbaren Dialog (shareDlg fängt Esc in Capture-Phase selbst ab)
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const click = id => { const b = $(id); if (b && !b.disabled) { e.preventDefault(); b.click(); return true; } return false; };
    const vis = id => $(id) && !$(id).hidden;
    if (vis('ovBoard')) { click('boardClose'); return; }
    if (vis('ovLex')) { e.preventDefault(); closeLexicon(); return; }
    if (vis('ovList')) { e.preventDefault(); $('ovList').hidden = true; return; }
    if (vis('ovHot')) { click('hotCancel'); return; }
    if (vis('ovDuel')) { if (!click('duelCancel')) click('duelOk'); return; }
    if (vis('ovOnl')) { if (!click('onlStay') && !click('onlOk')) click('onlCancel'); return; }
    if (vis('ovWelcome')) { click('welSkip'); return; }
    if (vis('ovBat')) { e.preventDefault(); hideBattleResult(); return; }
    if (game.replaying()) { e.preventDefault(); game.endReplay(); }
  });

  function updateInfo() {
    const el = $('info'), sel = game.sel, mis = game.mission || game.battle;
    if (UNITS[sel]) {
      const T = UNITS[sel];
      el.innerHTML = `<b>${esc(tr(T.n))}</b> · ${tr('LP')} ${T.hp} · ${T.heal ? tr('Heilung') + ' ' + T.heal : tr('Schaden') + ' ' + T.dmg}${mis ? ' · ' + tr('Kosten') + ' ' + fmtPts(T.cost) : ''} — ${esc(tr(T.d))}`;
    } else {
      const T = TERRAIN[sel];
      el.innerHTML = `<b>${esc(tr(T.n))}</b>${game.mission && T.cost ? ' · ' + tr('Kosten {p} je Feld', { p: fmtPts(T.cost) }) : ''} — ${esc(tr(T.d))}${sel !== 'radierer' ? '' : ' ' + tr('Rechtsklick radiert auch.')}`;
    }
    el.title = el.textContent;   // volle Beschreibung, die Zeile kürzt mit …
  }

  /* ---------- Zähler mit Stärkebalken ---------- */
  function updateCounts() {
    const el = $('counts'), world = game.world, tm = world.teamMode;
    const m = new Map(), hp = new Map();
    for (const u of world.units) {
      if (!u.alive) continue;
      const f = tm ? u.team : u.type;
      m.set(f, (m.get(f) || 0) + 1); hp.set(f, (hp.get(f) || 0) + u.hp);
    }
    if (!world.units.length) { el.innerHTML = `<div class="empty">${tr('Wähle unten eine Einheit<br>und male aufs Feld.')}</div>`; return; }
    if (!m.size) { el.innerHTML = `<div class="empty">${tr('Keine Einheiten auf dem Feld.')}</div>`; return; }
    const rows = [...m.entries()].sort((a, b) => hp.get(b[0]) - hp.get(a[0])).slice(0, 10);
    const maxHp = Math.max(...hp.values());
    const bar = (f, c) => `<span class="pw" title="${tr('Verbleibende Lebenspunkte')}"><u style="width:${Math.max(4, hp.get(f) / maxHp * 100)}%;background:${c}"></u></span>`;
    const tc = f => { const c = UNITS[f].col; return c === '#f4f4f6' || c === '#eef3fa' ? '#9aa6b8' : c; };
    el.innerHTML = rows.map(([f, n]) => tm
      ? `<div class="row"><i class="dot" style="background:${TEAMS[f].c}"></i><b>${n}</b><span>${tr(TEAMS[f].n)}</span>${bar(f, TEAMS[f].c)}</div>`
      : `<div class="row"><img src="${icon(f)}" alt=""><b>${n}</b><span>${n === 1 ? unitName(f) : unitPlural(f)}</span>${bar(f, tc(f))}</div>`).join('');
  }

  /* ---------- Teams ---------- */
  function buildChips() {
    const box = $('chips'); box.innerHTML = '';
    for (const k in TEAMS) {
      const b = document.createElement('button');
      b.className = 'chip' + (k === game.curTeam ? ' on' : '');
      b.style.background = TEAMS[k].c; b.title = tr('Team {t}', { t: tr(TEAMS[k].n) }); b.setAttribute('aria-label', b.title);
      b.onclick = () => game.setTeam(k);
      box.append(b);
    }
  }

  /* ---------- Modus, Mission, Steuerung ---------- */
  function updateMode() {
    const mis = game.mission, bat = game.battle;
    $('mMis').classList.toggle('on', !!mis); $('mSand').classList.toggle('on', !mis && !bat); $('mBat').classList.toggle('on', !!bat);
    $('misBar').hidden = !mis; $('batBar').hidden = !bat; $('bDice').hidden = !!mis || !!bat; $('bWatch').hidden = !!mis || !!bat || !!game.editor; $('teamBox').hidden = !!mis || !!bat;
    $('teamToggle').checked = game.world.teamMode;
    $('chips').hidden = !game.world.teamMode || !!mis || !!bat;
    if (bat) updateBattle();
    if (mis) {
      // Level ohne Kapitel (Tutorial, Tageschallenge, eigene Level): nur der Name
      if (mis.def.weekly) { const w = mis.def.weekly; $('misName').textContent = tr('Wochenchallenge · {w}', { w: w.key.slice(5) }); $('misHint').textContent = tr('Regel der Woche: {r} ({d}). Gewinne mit möglichst wenig Punkten.', { r: tr(w.ruleN), d: tr(w.ruleD) }); $('misName').title = ''; } else
      if (mis.def.run) { const r = mis.def.run; $('misName').textContent = tr('Feldzug · Schlacht {k}/{n}', { k: r.stage, n: game.runStages }) + (r.boss ? ' · ' + tr('Boss') : ''); $('misHint').textContent = tr('Gegner: {p} Punkte. Leben: {l}. Nach jedem Sieg wächst dein Heer.', { p: fmtPts(r.pts), l: game.save.run ? '♥'.repeat(game.save.run.lives) : '' }); $('misName').title = ''; } else
      if (mis.kind === 'waves') { $('misName').textContent = tr('Wellenmodus · Welle {k}', { k: mis.wave }); $('misHint').textContent = tr(mis.def.hint); $('misName').title = ''; } else
      $('misName').textContent = mis.chapter ? tr('Mission {i} · {n}', { i: mis.idx + 1, n: tr(mis.def.n) }) : tr(mis.def.n); $('misHint').textContent = tr(mis.def.hint);
      $('misName').title = mis.chapter ? tr(mis.chapter.n) : '';
    }
    if (game.editorUI) game.editorUI.update();   // Editor (Audit 18.11.)
  }

  function updateMission() {
    const mis = game.mission; if (!mis) return;
    $('budTxt').textContent = tr('{a} / {b} Punkte', { a: fmtPts(mis.spent), b: mis.budget });
    const f = $('budFill');
    f.style.width = Math.min(100, mis.spent / mis.budget * 100) + '%';
    f.classList.toggle('over', mis.spent > mis.par);
    const g = $('misGo');
    g.textContent = mis.phase === 'plan' ? tr('Los!') : tr('Abbrechen');
    g.disabled = mis.phase === 'done';
    g.classList.toggle('stop', mis.phase !== 'plan');   // Abbrechen ist kein Hauptknopf (UX 20.11.)
  }

  function updateControls() {
    $('pauseIco').innerHTML = game.paused ? ICON_PLAY : ICON_PAUSE;
    $('bPause').classList.toggle('on', game.paused);
    $('bSpeed').textContent = game.speed + '×';
    $('bSlow').classList.toggle('on', game.slow);
    $('bWatch').classList.toggle('on', !!game.watch); $('bWatch').setAttribute('aria-checked', String(!!game.watch));
    $('bWatchStop').hidden = !game.watch;
    $('muteIco').innerHTML = game.save.muted ? ICON_MUTED : ICON_SOUND;
    $('bMute').classList.toggle('on', game.save.muted);
    const vol = $('vol'); if (vol && document.activeElement !== vol) vol.value = Math.round((typeof game.save.volume === 'number' ? game.save.volume : .6) * 100);
  }

  function syncBrush() { $('brush').value = game.brush; }

  function refresh() {
    renderUnits(); buildChips(); updateMode(); updateMission(); updateBattle(); updateControls(); syncBrush(); updateCounts();
  }

  /* ---------- Meldungen ---------- */
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast'); t.textContent = tr(msg); t.hidden = false;   // tr: feste Meldungen anderer Module (Sicherheitsnetz)
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
  }
  let bannerTimer = 0;
  function banner(msg) {
    const b = $('banner'); b.textContent = tr(msg); b.hidden = false;
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, 2600);
  }
  function closeBanner() { $('banner').hidden = true; }

  /* ---------- Kampagne: Kapitel und Level (Spez. #52) ---------- */
  // Eine Übersicht (ovList) mit zwei Ansichten: die Kapitel als Karten (Titel, Beschreibung, Fortschritt, Schloss; leere
  // Kapitel „Bald verfügbar“), und die Level eines Kapitels mit Sternen und Schlössern wie früher die Missionsliste.
  const starRow = s => `${'★'.repeat(s)}<em>${'★'.repeat(3 - s)}</em>`;
  const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 018 0v3"/></svg>';
  // „Spielen“ (UX-Review 25.11.): Reiter Kampagne | Herausforderungen | Eigene Level | Erfolge statt 16 Kacheln untereinander
  let listTab = 'kampagne';
  function listTabs(t) {
    const el = $('listTabs');
    if (!t) { el.hidden = true; return; }
    listTab = t;
    const tabs = [['kampagne', tr('Kampagne')], ['modi', tr('Herausforderungen')], ['eigene', tr('Eigene Level')], ['erfolge', tr('Erfolge')]];
    el.innerHTML = tabs.map(([k, n]) => `<button role="tab" data-t="${k}" class="${k === t ? 'on' : ''}" aria-selected="${k === t}">${esc(n)}</button>`).join('');
    el.querySelectorAll('button').forEach(b => { b.onclick = () => openChapters(b.dataset.t); });
    el.hidden = false;
    $('listTut').hidden = t !== 'kampagne';
    $('listBack').hidden = true;
  }
  function openChapters(t = listTab) {
    if (t === 'eigene') { openCustomList(); listTabs('eigene'); return; }
    if (t === 'erfolge') { openAchievements(game); listTabs('erfolge'); return; }
    const g = $('lvGrid'); g.innerHTML = ''; g.className = 'chgrid';
    if (t === 'modi') {
      $('listTitle').textContent = tr('Herausforderungen');
      $('listText').textContent = tr('Tageschallenge, Wochenchallenge, Wellenmodus und Feldzug: unabhängig von der Kampagne spielbar.');
      dailyCard(g, game);   // Tageschallenge (Audit 18.11.)
      modeCards(g, game, m => m.id !== 'ach');   // Spielmodi (25.11.): Wellen, Wochenchallenge, Feldzug
    } else {
    t = 'kampagne';
    $('listTitle').textContent = tr('Kampagne');
    $('listText').textContent = tr('Kapitel für Kapitel: Jedes Level erlaubt nur bestimmte Einheiten. Schaffe das letzte Level eines Kapitels, um das nächste freizuschalten.');
    CHAPTERS.forEach((c, ci) => {
      const b = document.createElement('button'); b.className = 'ch'; b.dataset.ch = c.id;
      const p = chapterProgress(game.save.stars, c.id), empty = !p.total, open = !empty && game.chapterUnlocked(c.id);
      b.disabled = !open;
      if (empty) b.classList.add('soon'); else if (!open) b.classList.add('locked');
      if (p.total && p.done === p.total) b.classList.add('done');
      const state = empty ? `<span class="tag">${tr('Bald verfügbar')}</span>`
        : !open ? `<span class="tag lock">${LOCK}${tr('Gesperrt')}</span>`
        : `<span class="prog"><i style="width:${(p.done / p.total * 100).toFixed(1)}%"></i></span>
           <span class="cnt"><b class="st">★</b> ${p.stars}/${p.maxStars} · ${tr('{a}/{b} geschafft', { a: p.done, b: p.total })}</span>`;
      b.innerHTML = `<span class="no">${tr('Kapitel {i}', { i: ci + 1 })}</span><span class="nm">${esc(tr(c.n))}</span><span class="ds">${esc(tr(c.d))}</span><span class="foot">${state}</span>`;
      if (open) b.onclick = () => openChapter(c.id);
      g.append(b);
    });
    }
    listTabs(t);
    $('listClose').textContent = tr('Schließen');
    $('ovList').hidden = false;
  }
  function openChapter(id) {
    const c = chapterById(id);
    if (!c || !c.levels.length) { openChapters(); return; }
    $('listTitle').textContent = tr(c.n);
    $('listText').textContent = `${tr(c.d)} ${tr('Jede Mission gibt dir ein Punktebudget. Gewinne mit möglichst wenig Punkten für drei Sterne.')}`;
    const g = $('lvGrid'); g.innerHTML = ''; g.className = 'lvgrid';
    c.levels.forEach((m, i) => {
      const b = document.createElement('button'); b.className = 'lv'; b.dataset.id = m.id;
      const open = game.unlocked(m.id), s = game.save.stars[m.id] || 0;
      b.disabled = !open;
      const md = game.save.medals[m.id] || 0;
      b.innerHTML = `<span class="no">${tr('Mission {i}', { i: i + 1 })}${open ? '' : ' · ' + tr('gesperrt')}</span><span class="nm">${esc(tr(m.n))}</span><span class="st">${starRow(s)}</span>` +
        `<span class="md" title="${MEDALS.map((x, k) => `${esc(tr(x.n))}${hasMedal(md, k) ? ' ✓' : ''}`).join(' · ')}">${MEDALS.map((x, k) => `<i class="${hasMedal(md, k) ? 'on' : ''}">${x.icon}</i>`).join('')}</span>`;
      b.onclick = () => { $('ovList').hidden = true; game.loadMission(m.id); };
      g.append(b);
    });
    listTabs(null); $('listTut').hidden = false;
    $('listBack').hidden = false;
    $('listClose').textContent = tr('Schließen');
    $('ovList').hidden = false;
  }
  // Reiter „Missionen“: die Kapitel; „Übersicht“ in einer Mission: deren Kapitel
  // eigenes Level (Editor, Audit 18.11.): zurück zum Editor bzw. zur Liste der eigenen Level
  const openMissionList = () => (game.mission && game.mission.custom ? game.customBack()
    : game.mission && (game.mission.kind === 'waves' || game.mission.kind === 'run' || game.mission.kind === 'weekly') ? openChapters('modi')
    : game.mission && game.mission.chapter ? openChapter(game.mission.chapter.id) : openChapters());
  const openCustomList = () => { openCustomListView(game, () => openChapters('eigene')); listTabs('eigene'); };

  // r = { win, timeUp, stars, spent, budget, par, time, hasNext }
  function showResult(r) {
    const h = $('resTitle');
    h.textContent = r.win ? tr('Sieg!') : r.timeUp ? tr('Zeit abgelaufen') : tr('Niederlage');
    h.className = r.win ? 'win' : '';
    $('resStars').innerHTML = [0, 1, 2].map(i => `<i class="${i < r.stars ? 'on' : ''}">★</i>`).join('');
    $('resStats').innerHTML = `<li><span>${tr('Eingesetzte Punkte')}</span>${tr('{a} von {b}', { a: fmtPts(r.spent), b: r.budget })}</li>
    ${r.run ? '' : `<li><span>${tr('Drei Sterne bei höchstens')}</span>${tr('{n} Punkten', { n: r.par })}</li>`}
    <li><span>${tr('Eigene Verluste')}</span>${stats.lostBlue}</li><li><span>${tr('Besiegte Gegner')}</span>${stats.lostRed}</li>
    <li><span>${tr('Kampfdauer')}</span>${Math.round(r.time)} s</li>
    ${stats.heroType ? `<li><span>${tr('Held der Schlacht')}</span>${tr('{u} mit {k} Siegen', { u: esc(unitName(stats.heroType)), k: stats.heroK })}</li>` : ''}`;
    // Audit 18.11.: Hinweis nach einer Niederlage, Medaillen (r.medals = { mask, fresh }), Replay
    $('resHint').hidden = !r.hint; $('resHint').textContent = r.hint || '';
    const md = r.medals;
    $('resMedals').hidden = !md;
    if (md) $('resMedals').innerHTML = MEDALS.map((x, k) => `<span class="${hasMedal(md.mask, k) ? 'on' : ''}${hasMedal(md.fresh, k) ? ' new' : ''}" title="${esc(tr(x.d))}">${x.icon} ${esc(tr(x.n))}</span>`).join('');
    $('resReplay').hidden = !r.canReplay;
    $('resVideo').hidden = !r.canReplay;
    // nach dem letzten Level eines Kapitels führt „Weiter“ zur Kapitelübersicht
    $('resNext').hidden = !r.win || !!r.custom;   // eigene Level: keine nächste Mission
    $('resList').textContent = r.custom === 'editor' ? tr('Zum Editor') : r.custom ? tr('Eigene Level') : tr('Übersicht');
    $('resNext').textContent = r.nextLabel || (r.hasNext ? tr('Nächste Mission') : tr('Zu den Kapiteln'));
    $('resRetry').textContent = r.win ? tr('Besser planen') : tr('Nochmal planen');
    if (r.weekly) $('resStats').insertAdjacentHTML('beforeend', `<li><span>${tr('Gegnerarmee')}</span>${tr('{n} Punkten', { n: fmtPts(r.weekly.pts) })}</li>${r.weekly.best ? `<li><span>${tr('Bestwert der Woche')}</span>${tr('{p} Pkt', { p: fmtPts(r.weekly.best.spent) })} ${'★'.repeat(r.weekly.best.stars)}</li>` : ''}`);   // Wochenchallenge (25.11.)
    if (r.run) {   // Feldzug (25.11.)
      const f = r.run;
      h.textContent = f.won ? tr('Feldzug gewonnen!') : f.done ? tr('Feldzug verloren') : r.win ? tr('Schlacht {k} gewonnen!', { k: f.stage }) : tr('Niederlage');
      h.className = r.win ? 'win' : '';
      $('resStars').innerHTML = '';
      $('resStats').insertAdjacentHTML('afterbegin', `<li><span>${tr('Schlacht')}</span>${f.stage} / ${game.runStages}</li><li><span>${tr('Leben')}</span>${f.done && !f.won ? '–' : '♥'.repeat(f.lives)}</li>`);
      $('resNext').hidden = !(r.win && !f.done);
      $('resRetry').hidden = r.win && !f.done;
      $('resRetry').textContent = f.done ? tr('Neuer Feldzug') : tr('Nochmal versuchen');
      $('resList').textContent = tr('Übersicht');
    } else $('resRetry').hidden = false;
    if (r.waves) {   // Wellenmodus (25.11.)
      const w = r.waves;
      h.textContent = tr('Welle {k} erreicht', { k: w.reached + 1 }); h.className = w.fresh ? 'win' : '';
      $('resStars').innerHTML = '';
      $('resStats').innerHTML = `<li><span>${tr('Geschaffte Wellen')}</span>${w.reached}</li><li><span>${tr('Bestwert')}</span>${w.best}${w.fresh ? ' ★ ' + tr('neu!') : ''}</li>
        <li><span>${tr('Eingesetzte Punkte')}</span>${fmtPts(r.spent)}</li>`;
      $('resRetry').textContent = tr('Neuer Lauf'); $('resList').textContent = tr('Übersicht');
    }
    dailyResult(r, toast, game);   // Tageschallenge (Audit 18.11.): Bestwert, Ergebnis kopieren, ohne „Nächste Mission“
    $('ovRes').hidden = false;
  }

  function hideOverlays() { $('ovList').hidden = true; $('ovRes').hidden = true; $('ovBat').hidden = true; $('ovWelcome').hidden = true; document.body.classList.remove('bat-res'); closeLexicon(); }

  function resetBattle() { stats.lostBlue = 0; stats.lostRed = 0; stats.heroK = 0; stats.heroType = null; stats.killers.clear(); }

  // Verluste und Held nur während einer Missionsschlacht (inkl. Auslaufen bis zum Ergebnis)
  function onEvent(e) {
    if (e.type !== 'death') return;
    const mis = game.mission;
    if (!mis || mis.phase === 'plan') return;
    if (e.team === 'blau') stats.lostBlue++; else stats.lostRed++;
    if (e.team === 'blau' && e.killerType && e.killerTeam !== 'blau') stats.killers.set(e.killerType, (stats.killers.get(e.killerType) || 0) + 1);
    if (e.killerTeam === 'blau' && e.killerKills > stats.heroK) { stats.heroK = e.killerKills; stats.heroType = e.killerType; }
  }

  /* ---------- Knöpfe ---------- */
  $('bPause').onclick = () => game.togglePause();
  $('bMute').onclick = () => game.toggleMute();
  if ($('vol')) $('vol').oninput = e => game.setVolume(e.target.value / 100);
  $('bSpeed').onclick = () => game.cycleSpeed();
  $('bSlow').onclick = () => game.toggleSlow();
  $('bClear').onclick = () => game.clear();
  $('bDice').onclick = () => game.dice();
  $('bWatch').onclick = () => game.toggleWatch();   // Zuschau-Modus (25.11.)
  // Tastenzeile (UX-Review 25.11.): aus, bis „?“ sie einschaltet; die Wahl bleibt gespeichert
  {
    let on = false; try { on = localStorage.getItem('kritzelschlacht.keys') === '1'; } catch (e) { /* privat */ }
    const setKeys = v => { on = v; document.body.classList.toggle('show-keys', v); $('bKeys').setAttribute('aria-pressed', String(v)); try { localStorage.setItem('kritzelschlacht.keys', v ? '1' : '0'); } catch (e) { /* privat */ } };
    setKeys(on);
    $('bKeys').onclick = () => setKeys(!on);
  }
  $('bWatchStop').onclick = () => game.toggleWatch(false);
  // Mehr-Menüs (UX-Review 25.11.: obere Leiste, Schlacht-Leiste): auf/zu per Knopf, zu bei Klick daneben, Esc oder nach einer
  // Wahl (Wetter bleibt offen zum Durchschalten)
  for (const w of document.querySelectorAll('.morew')) {
    const more = w.querySelector('[aria-haspopup=menu]'), pop = w.querySelector('.morepop');
    const setMore = on => { pop.hidden = !on; more.setAttribute('aria-expanded', String(on)); more.classList.toggle('on', on); };
    more.onclick = e => { e.stopPropagation(); setMore(pop.hidden); };
    pop.addEventListener('click', e => { const b = e.target.closest('.mi'); if (b && b.id !== 'bWeather') setMore(false); });
    document.addEventListener('pointerdown', e => { if (!pop.hidden && !w.contains(e.target)) setMore(false); }, true);
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { setMore(false); more.focus(); e.stopPropagation(); } }, true);
  }
  $('bUndo').onclick = () => game.undo();
  $('brush').oninput = e => game.setBrush(+e.target.value);
  $('teamToggle').onchange = e => game.setTeamMode(e.target.checked);
  $('mSand').onclick = () => game.enterSandbox();
  $('mMis').onclick = () => openChapters();   // „Spielen“: zuletzt gewählter Reiter
  $('misList').onclick = () => openMissionList();
  $('misGo').onclick = () => game.go();
  $('resRetry').onclick = () => { $('ovRes').hidden = true; game.retryMission(); };
  $('resNext').onclick = () => { $('ovRes').hidden = true; game.nextMission(); };
  $('resList').onclick = () => { $('ovRes').hidden = true; openMissionList(); };
  // Schließen (UX-Review 25.11.): eine Mission in der Aufstellung bleibt offen, eine fertige führt zurück in den Sandkasten
  $('listClose').onclick = () => { $('ovList').hidden = true; if (game.mission && game.mission.phase !== 'plan') game.enterSandbox(); };
  $('listBack').onclick = () => openChapters('kampagne');
  $('mBat').onclick = () => game.enterBattle();
  /* ---------- Audit 18.11.: Reichweiten, Replay, Tutorial ---------- */
  $('misRange').onclick = () => game.toggleRanges();
  $('resReplay').onclick = () => { $('ovRes').hidden = true; game.replay(); };
  $('batReplay').onclick = () => game.replay();
  $('resVideo').onclick = () => { $('ovRes').hidden = true; game.videoReplay(); };   // Video (25.11.)
  $('batVideo').onclick = () => game.videoReplay();
  $('replaySkip').onclick = () => game.endReplay();
  $('welTut').onclick = () => { $('ovWelcome').hidden = true; game.startTutorial(); };
  $('welSkip').onclick = () => { $('ovWelcome').hidden = true; game.skipTutorial(); };
  $('listTut').onclick = () => { $('ovList').hidden = true; game.startTutorial(); };
  function showWelcome() { $('ovWelcome').hidden = false; }
  function replayBar(on, txt) { $('replayBar').hidden = !on; if (txt) $('replayTxt').textContent = txt; }
  function updateRanges() { const b = $('misRange'); b.classList.toggle('on', game.showRanges); b.setAttribute('aria-pressed', String(game.showRanges)); }
  // Auswertung schließen (Esc oder Klick daneben): das Schlachtfeld bleibt zu sehen, der Reiter "Schlacht" zeigt sie wieder
  function hideBattleResult() { $('ovBat').hidden = true; document.body.classList.remove('bat-res'); }
  $('ovBat').addEventListener('pointerdown', e => { if (e.target === $('ovBat')) hideBattleResult(); });
  // blur: sonst würde Enter auf dem fokussierten Knopf (jetzt "Abbrechen") den Kampf abbrechen
  $('batGo').onclick = e => { e.currentTarget.blur(); const b = game.battle; if (!b) return; if (b.phase === 'plan') game.startBattle(); else if (b.phase === 'fight') game.editBattle(); };
  $('batClear').onclick = () => game.clear();
  $('batSwap').onclick = () => game.swapSides();
  $('batQuick').onclick = () => game.quickEnemy();   // Schnelle Schlacht (25.11.)
  $('batAgain').onclick = () => game.retryBattle();
  $('batTen').onclick = () => game.runBatch(10);
  $('batEdit').onclick = () => game.editBattle();

  /* ---------- Schlacht (Spez. #45, #46) ---------- */
  // Leiste: Punktepille (laufend), Hinweis bzw. Kampfzeit, Leeren / Seiten tauschen / Los! (im Kampf: Abbrechen).
  // Auswertung: Titel, Dauer, Überlebende, je Seite eine Tabelle, Verlauf als SVG mit Hover, Held, 10× auswerten.
  const teamIcons = {};
  const tIcon = (k, side) => { const id = k + '|' + side; return teamIcons[id] || (teamIcons[id] = iconURL(k, 64, Math.max(0, TEAM_KEYS.indexOf(side)))); };
  const SIDE_N = { blau: tr('Blau'), rot: tr('Rot') }, SIDE_C = { blau: TEAMS.blau.c, rot: TEAMS.rot.c };
  const clock = t => { const s = Math.max(0, Math.floor(t)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  const secs = t => `${Math.round(t)} s`;
  const setText = (id, v) => { const el = $(id); if (el.textContent !== v) el.textContent = v; };

  function updateBattle() {
    const b = game.battle; if (!b) return;
    const p = armyPoints(game.world);
    setText('ptsB', fmtPts(p.blau)); setText('ptsR', fmtPts(p.rot));
    const plan = b.phase === 'plan';
    setText('batHint', plan ? tr('Blau malt links, Rot rechts · Gelände überall')
      : b.phase === 'fight' ? `${tr('Kampf läuft')} · ${clock(b.t)}${b.t > 150 ? ' · ' + tr('ab 3:00 entscheidet die Stärke') : ''}` : `${tr('Kampf vorbei')} · ${clock(b.t)}`);
    $('batClear').hidden = !plan; $('batSwap').hidden = !plan; $('batShare').hidden = !plan; $('batQuick').hidden = !plan || !!b.hot;
    const g = $('batGo');
    setText('batGo', plan ? tr('Los!') : tr('Abbrechen'));
    g.disabled = b.phase === 'done';
    g.classList.toggle('stop', !plan);   // Abbrechen ist kein Hauptknopf (UX 20.11.); Online/Duell nehmen es wieder weg
    if (game.hotseatUI) game.hotseatUI();   // Hotseat-Versus (Audit 18.11.): Leiste in der Hotseat-Planung
    if (game.onlineUI) game.onlineUI();     // Online 1 gegen 1 (18.11.): Leiste im Online-Spiel
  }

  // Verlauf: zwei Linien (Teamfarben, 2 px) über der Zeit, eine Achse; Namen am Linienende, Hover mit Fadenkreuz und Werten
  function graphSVG(tl) {
    const W = 320, H = 150, L = 30, R = 50, T = 10, B = 20, w = W - L - R, h = H - T - B;
    const tEnd = Math.max(.5, tl[tl.length - 1].t), max = Math.max(1, ...tl.map(p => Math.max(p.blau, p.rot)));
    const X = t => L + t / tEnd * w, Y = v => T + h - v / max * h;
    const line = k => tl.map((p, i) => `${i ? 'L' : 'M'}${X(p.t).toFixed(1)},${Y(p[k]).toFixed(1)}`).join('');
    const last = tl[tl.length - 1];
    let yb = Y(last.blau), yr = Y(last.rot);
    if (Math.abs(yb - yr) < 12) { const m = (yb + yr) / 2, s = last.blau >= last.rot ? -1 : 1; yb = m + s * 6; yr = m - s * 6; }
    return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${tr('Armeestärke beider Seiten über die Zeit')}">
      <line x1="${L}" y1="${T}" x2="${L + w}" y2="${T}" stroke="#e4e6ee" stroke-dasharray="3 3"/>
      <line x1="${L}" y1="${T + h}" x2="${L + w}" y2="${T + h}" stroke="#c9ccd6"/>
      <text x="${L - 5}" y="${T + 4}" text-anchor="end">${fmtPts(max)}</text>
      <text x="${L - 5}" y="${T + h + 3}" text-anchor="end">0</text>
      <text x="${L}" y="${H - 4}">0 s</text><text x="${L + w}" y="${H - 4}" text-anchor="end">${secs(tEnd)}</text>
      <path d="${line('blau')}" fill="none" stroke="${SIDE_C.blau}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <path d="${line('rot')}" fill="none" stroke="${SIDE_C.rot}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
      <text class="lab" x="${L + w + 5}" y="${yb + 3.5}">${SIDE_N.blau} ${fmtPts(last.blau)}</text>
      <text class="lab" x="${L + w + 5}" y="${yr + 3.5}">${SIDE_N.rot} ${fmtPts(last.rot)}</text>
      <g class="hov" visibility="hidden"><line y1="${T}" y2="${T + h}" stroke="#2a2a33" stroke-opacity=".35"/>
        <circle r="4" fill="${SIDE_C.blau}" stroke="#fff" stroke-width="2"/><circle r="4" fill="${SIDE_C.rot}" stroke="#fff" stroke-width="2"/></g>
      <rect x="${L}" y="0" width="${w}" height="${H}" fill="transparent"/>
    </svg><div class="gtip" hidden></div>`;
  }
  function bindGraph(box, tl) {
    const svg = box.querySelector('svg'), hov = svg.querySelector('.hov'), tip = box.querySelector('.gtip');
    const [ln, cb, cr] = hov.children, vb = svg.viewBox.baseVal;
    const L = 30, w = vb.width - 30 - 50, T = 10, h = vb.height - 10 - 20;
    const tEnd = Math.max(.5, tl[tl.length - 1].t), max = Math.max(1, ...tl.map(p => Math.max(p.blau, p.rot)));
    svg.onpointermove = e => {
      const r = svg.getBoundingClientRect(), sx = (e.clientX - r.left) / r.width * vb.width;
      const t = Math.max(0, Math.min(tEnd, (sx - L) / w * tEnd));
      let p = tl[0]; for (const q of tl) if (Math.abs(q.t - t) < Math.abs(p.t - t)) p = q;
      const x = L + p.t / tEnd * w, yb = T + h - p.blau / max * h, yr = T + h - p.rot / max * h;
      ln.setAttribute('x1', x); ln.setAttribute('x2', x);
      cb.setAttribute('cx', x); cb.setAttribute('cy', yb); cr.setAttribute('cx', x); cr.setAttribute('cy', yr);
      hov.setAttribute('visibility', 'visible');
      tip.textContent = `${secs(p.t)} · ${SIDE_N.blau} ${fmtPts(p.blau)} · ${SIDE_N.rot} ${fmtPts(p.rot)}`;
      const br = box.getBoundingClientRect(), z = box.offsetWidth ? br.width / box.offsetWidth : 1;
      tip.style.left = ((r.left - br.left + x / vb.width * r.width) / z) + 'px';
      tip.style.top = ((r.top - br.top + Math.min(yb, yr) / vb.height * r.height) / z - 8) + 'px';
      tip.hidden = false;
    };
    svg.onpointerleave = () => { hov.setAttribute('visibility', 'hidden'); tip.hidden = true; };
  }

  function tableHTML(side, rows) {
    const pts = rows.reduce((a, r) => a + r.deployed * UNITS[r.type].cost, 0);
    const sum = k => rows.reduce((a, r) => a + r[k], 0);
    const num = v => (v ? String(v) : '<span class="z">0</span>');
    const dmgPt = (d, p) => (p > 0 ? fmt(d / p) : '–');
    const trow = r => `<tr><td class="ty"><span><img src="${tIcon(r.type, side)}" alt="">${esc(r.deployed === 1 || (!r.deployed && r.survived === 1) ? unitName(r.type) : unitPlural(r.type))}${r.deployed ? '' : ` <small>${tr('beschworen')}</small>`}</span></td>
      <td>${r.deployed || '<span class="z">–</span>'}</td><td>${num(r.survived)}</td><td>${num(Math.round(r.dmg))}</td><td>${num(r.kills)}</td>
      <td>${r.deployed ? dmgPt(r.dmg, r.deployed * UNITS[r.type].cost) : '<span class="z">–</span>'}</td></tr>`;
    return `<table class="bt"><caption><i class="tdot ${side}"></i>${SIDE_N[side]} <em>${tr('{p} Pkt eingesetzt', { p: fmtPts(pts) })}</em></caption>
      <thead><tr><th>${tr('Typ')}</th><th>${tr('Eingesetzt')}</th><th>${tr('Überlebt')}</th><th>${tr('Schaden')}</th><th>${tr('Kills')}</th><th title="${tr('Ausgeteilter Schaden je investiertem Punkt')}">${tr('Schaden/Pkt')}</th></tr></thead>
      <tbody>${rows.map(trow).join('')}${rows.length > 1 ? `<tr class="sum"><td>${tr('Gesamt')}</td><td>${sum('deployed')}</td><td>${sum('survived')}</td><td>${Math.round(sum('dmg'))}</td><td>${sum('kills')}</td><td>${dmgPt(sum('dmg'), pts)}</td></tr>` : ''}</tbody></table>`;
  }

  function showBattleResult(r) {
    const h = $('batTitle');
    h.textContent = r.winner === 'draw' ? tr('Unentschieden') : tr('{s} gewinnt!', { s: SIDE_N[r.winner] });
    h.className = r.winner === 'draw' ? '' : r.winner;
    const timeUp = r.survivors.blau > 0 && r.survivors.rot > 0;
    $('batSub').textContent = `${tr('Dauer')} ${clock(r.time)}${timeUp ? ' · ' + tr('Zeit abgelaufen, entschieden nach Armeestärke') : ''}`;
    $('batSurv').innerHTML = ['blau', 'rot'].map(s => `<span><i class="tdot ${s}"></i>${tr('{n} überlebt', { n: r.survivors[s] })}</span>`).join('');
    $('batTables').innerHTML = ['blau', 'rot'].map(s => tableHTML(s, r.table.filter(x => x.side === s))).join('');
    const gb = $('batGraph'); gb.innerHTML = graphSVG(r.timeline); bindGraph(gb.parentElement, r.timeline);
    const he = r.hero;
    $('batHero').innerHTML = he
      ? `<div class="pic"><img src="${tIcon(he.type, he.side)}" alt=""></div><div><div class="k"><span class="crown">♛</span> ${tr('Held der Schlacht')}</div>
         <div class="n">${esc(unitName(he.type))}</div><div class="k">${SIDE_N[he.side]} · ${he.kills} ${he.kills === 1 ? 'Kill' : 'Kills'}</div></div>`
      : `<div class="k">${tr('Kein Held: niemand hat einen Gegner besiegt.')}</div>`;
    const bb = game.battle;
    if (bb && bb.batchRes) batchDone(bb.batchRes); else { $('batBatch').hidden = true; $('batTen').disabled = false; }
    $('batReplay').hidden = !game.canReplay();
    $('batVideo').hidden = !game.canReplay();
    document.body.classList.add('bat-res');
    $('ovBat').hidden = false;
  }

  // k < 0: abgebrochen; sonst Fortschritt k von n
  function batchProgress(k, n) {
    const box = $('batBatch');
    if (k < 0) { box.hidden = true; $('batTen').disabled = false; return; }
    box.innerHTML = `<div class="row"><b>${tr('Auswertung')}</b><span>${k}/${n}</span><div class="prog"><i style="width:${k / n * 100}%"></i></div><button class="mini" id="batCancel">${tr('Abbrechen')}</button></div>
      <div class="k" style="color:var(--muted);font-size:12.5px">${tr('Dieselbe Aufstellung kämpft {n}-mal mit anderen Zufallswerten.', { n })}</div>`;
    $('batCancel').onclick = () => game.cancelBatch();
    box.hidden = false; $('batTen').disabled = true;
  }
  function batchDone(res) {
    const box = $('batBatch'), w = res.wins, n = w.blau + w.rot + w.draw;
    const seg = (k, c) => (w[k] ? `<i style="flex:${w[k]};background:${c}" title="${k === 'draw' ? tr('Unentschieden') : SIDE_N[k]} ${w[k]}"></i>` : '');
    box.innerHTML = `<div class="row"><b>${tr('{n}× ausgewertet', { n })}</b></div>
      <div class="split">${seg('blau', SIDE_C.blau)}${seg('draw', '#c9ccd6')}${seg('rot', SIDE_C.rot)}</div>
      <div class="res">${SIDE_N.blau} ${w.blau} · ${SIDE_N.rot} ${w.rot} · ${tr('Unentschieden')} ${w.draw}, Ø ${secs(res.avgTime)}</div>`;
    box.hidden = false; $('batTen').disabled = false;
  }

  return {
    updateBattle, batchProgress, batchDone, showBattleResult,
    refresh, toast, banner, closeBanner, showResult, openMissionList, openChapters, openChapter, openCustomList,
    renderUnits, updateCounts, updateMission, updateMode, updateControls, syncBrush, buildChips,
    hideOverlays, resetBattle, onEvent, openLexicon, closeLexicon, lexiconOpen: () => !$('ovLex').hidden,
    killers: () => stats.killers, lostBlue: () => stats.lostBlue, showWelcome, replayBar, updateRanges,
  };
}
