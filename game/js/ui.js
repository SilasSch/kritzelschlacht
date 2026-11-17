// HUD: Palette, Zähler, Missionsleiste, Dialoge, Banner, Toasts, Charakterkarten und Lexikon. Markup kommt aus index.html.
// Liest den Spielzustand aus `game` (main.js) und ruft dessen Aktionen auf.
import { UNITS, TERRAIN, PLURAL, CATEGORIES, TEAMS, MISSIONS, MSG_NO_PAINT } from './data.js';
import { iconURL, TEAM_KEYS } from './render/rig.js';
import { unitCard, cardTypes, RETREAT_NOTE, fmtPts } from './cards.js';
import { createCardHover, hoverOver, hoverEnd, selected, paint, cardKey, nextChange } from './cardhover.js';

const $ = id => document.getElementById(id);
const ICON_PAUSE = '<path d="M9 5v14M15 5v14"/>';
const ICON_PLAY = '<path d="M7 5l12 7-12 7z"/>';
const ICON_MUTED = '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l4 6M21 9l-4 6"/>';
const ICON_SOUND = '<path d="M4 9h4l5-4v14l-5-4H4zM17 8a5 5 0 010 8M19.5 5.5a9 9 0 010 13"/>';

/* ---------- Charakterkarten (Spez. #29) ---------- */
// Markup einer Karte aus unitCard (cards.js). pic(t) liefert das Sticker-Porträt (iconURL, gleiche Zeichnung
// wie der Rig-Atlas), mini(t) die kleinen Symbole für stark/schwach. Nur bei Bedarf gebaut, nie je Bild.
const fmt = v => String(v >= 10 ? Math.round(v) : Math.round(v * 10) / 10).replace('.', ',');
const esc = v => String(v).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const CAT_NAME = Object.fromEntries(CATEGORIES);
function cardHTML(t, pic, mini, opt = {}) {
  const c = unitCard(t); if (!c) return '';
  const r = c.raw, st = c.stats;
  const row = (label, v, txt) => `<div class="s"><span>${label}</span><i><u style="width:${Math.max(3, v * 100).toFixed(1)}%"></u></i><b>${txt}</b></div>`;
  const vs = (cls, label, list) => `<div><span class="l ${cls}">${label}</span><span class="u">${list.length
    ? list.map(k => `<span><img src="${mini(k)}" alt="">${esc(UNITS[k].n)}</span>`).join('')
    : '<em class="none">—</em>'}</span></div>`;
  const nameSize = c.name.length > 11 ? 20 : c.name.length > 8 ? 22 : 25;
  return `<div class="uc-hd">
    <div class="uc-pic"><img src="${pic(t)}" alt=""></div>
    <div class="uc-tt"><div class="uc-nm" style="font-size:${nameSize}px">${esc(c.name)}</div>
      <div class="uc-tags"><span class="cat">${esc(CAT_NAME[c.cat] || c.cat)}</span>${c.tags.map(x => `<span>${x}</span>`).join('')}</div></div>
    ${opt.key ? `<kbd class="uc-key" title="Taste">${opt.key}</kbd>` : ''}
  </div>
  <div class="uc-d">${esc(c.desc)}</div>
  <div class="uc-st">
    ${row('Leben', st.hp, r.hp)}
    ${row(r.heal ? 'Heilung' : 'Schaden', st.dmg, fmt(r.dps) + '/s')}
    ${row('Tempo', st.speed, r.speed)}
    ${row('Reichweite', st.range, r.melee ? 'nah' : r.range)}
    ${row('Kosten', st.cost, fmtPts(r.cost))}
  </div>
  ${c.abil.length ? `<div class="uc-ab">${c.abil.map(a => `<div><b>${esc(a.n)}</b> ${esc(a.d)}</div>`).join('')}</div>` : ''}
  <div class="uc-vs">${vs('s', 'Stark gegen', c.strong)}${vs('w', 'Schwach gegen', c.weak)}</div>
  ${opt.note ? `<div class="uc-note">${opt.note}</div>` : ''}`;
}

export function createUI(game) {
  const icons = {};
  const icon = k => icons[k] || (icons[k] = iconURL(k));
  // Porträts der Karten: größer gezeichnet (scharf auf HiDPI) und in der Teamvariante des Atlas, wenn Teamkampf läuft
  const portraits = {};
  const teamVi = () => (game.world.teamMode && !game.mission ? Math.max(0, TEAM_KEYS.indexOf(game.curTeam)) : 0);
  const portrait = k => { const vi = teamVi(), id = k + '|' + vi; return portraits[id] || (portraits[id] = iconURL(k, 176, vi)); };
  const accent = () => TEAMS[game.mission ? 'blau' : game.curTeam].c;
  // Kampfstatistik einer Mission, aus death-Ereignissen abgeleitet
  const stats = { lostBlue: 0, lostRed: 0, heroK: 0, heroType: null };

  /* ---------- Palette ---------- */
  const tabs = $('tabs');
  for (const [k, n] of CATEGORIES) {
    const b = document.createElement('button');
    b.textContent = n; b.dataset.cat = k; b.setAttribute('role', 'tab');
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
      if (!UNITS[k]) b.title = D.n + ' (Taste ' + (idx + 1) + ')';
      b.setAttribute('aria-label', D.n);
      const img = document.createElement('img'); img.src = icon(k); img.alt = ''; b.append(img);
      if (mis && UNITS[k]) { const s = document.createElement('small'); s.textContent = fmtPts(UNITS[k].cost); b.append(s); }
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
    ucard.style.bottom = (app.bottom - pal.top + 12) + 'px';
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
    const id = teamVi() + '|' + accent() + '|' + (game.mission ? game.mission.idx : '-');
    if (id !== lexId) {
      $('lexNote').textContent = RETREAT_NOTE;
      $('lexBody').innerHTML = cardTypes().map(g => {
        const ok = game.catAllowed(g.cat);
        return `<section><h3>${esc(g.name)}</h3><div class="lexgrid">${g.types.map(t =>
          `<button class="uc lexc${ok ? '' : ' off'}" data-k="${t}" data-cat="${g.cat}"${ok ? '' : ' aria-disabled="true"'}>${cardHTML(t, portrait, icon, { note: ok ? '' : 'In dieser Mission nicht erlaubt' })}</button>`).join('')}</div></section>`;
      }).join('');
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
    if (b.classList.contains('off')) { toast('In dieser Mission nicht erlaubt.'); return; }
    if (UNITS[b.dataset.k] && UNITS[b.dataset.k].paint === false) { toast(MSG_NO_PAINT); return; }   // Ghul: nur ansehen
    closeLexicon();
    if (game.cat !== b.dataset.cat) game.setCat(b.dataset.cat);
    game.select(b.dataset.k);
  });
  $('ovLex').addEventListener('pointerdown', e => { if (e.target === $('ovLex')) closeLexicon(); });
  $('bLex').onclick = () => ($('ovLex').hidden ? openLexicon() : closeLexicon());
  $('lexClose').onclick = () => closeLexicon();
  // Esc ist sonst nirgends belegt (input.js); nur bei offenem Lexikon
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('ovLex').hidden) { e.preventDefault(); closeLexicon(); } });

  function updateInfo() {
    const el = $('info'), sel = game.sel, mis = game.mission;
    if (UNITS[sel]) {
      const T = UNITS[sel];
      el.innerHTML = `<b>${T.n}</b> · LP ${T.hp} · ${T.heal ? 'Heilung ' + T.heal : 'Schaden ' + T.dmg}${mis ? ' · Kosten ' + fmtPts(T.cost) : ''} — ${T.d}`;
    } else {
      const T = TERRAIN[sel];
      el.innerHTML = `<b>${T.n}</b>${mis && T.cost ? ' · Kosten ' + fmtPts(T.cost) + ' je Feld' : ''} — ${T.d}${sel !== 'radierer' ? '' : ' Rechtsklick radiert auch.'}`;
    }
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
    if (!world.units.length) { el.innerHTML = '<div class="empty">Wähle unten eine Einheit<br>und male aufs Feld.</div>'; return; }
    if (!m.size) { el.innerHTML = '<div class="empty">Keine Einheiten auf dem Feld.</div>'; return; }
    const rows = [...m.entries()].sort((a, b) => hp.get(b[0]) - hp.get(a[0])).slice(0, 10);
    const maxHp = Math.max(...hp.values());
    const bar = (f, c) => `<span class="pw" title="Verbleibende Lebenspunkte"><u style="width:${Math.max(4, hp.get(f) / maxHp * 100)}%;background:${c}"></u></span>`;
    const tc = f => { const c = UNITS[f].col; return c === '#f4f4f6' || c === '#eef3fa' ? '#9aa6b8' : c; };
    el.innerHTML = rows.map(([f, n]) => tm
      ? `<div class="row"><i class="dot" style="background:${TEAMS[f].c}"></i><b>${n}</b><span>${TEAMS[f].n}</span>${bar(f, TEAMS[f].c)}</div>`
      : `<div class="row"><img src="${icon(f)}" alt=""><b>${n}</b><span>${n === 1 ? UNITS[f].n : PLURAL[f]}</span>${bar(f, tc(f))}</div>`).join('');
  }

  /* ---------- Teams ---------- */
  function buildChips() {
    const box = $('chips'); box.innerHTML = '';
    for (const k in TEAMS) {
      const b = document.createElement('button');
      b.className = 'chip' + (k === game.curTeam ? ' on' : '');
      b.style.background = TEAMS[k].c; b.title = 'Team ' + TEAMS[k].n; b.setAttribute('aria-label', 'Team ' + TEAMS[k].n);
      b.onclick = () => game.setTeam(k);
      box.append(b);
    }
  }

  /* ---------- Modus, Mission, Steuerung ---------- */
  function updateMode() {
    const mis = game.mission;
    $('mMis').classList.toggle('on', !!mis); $('mSand').classList.toggle('on', !mis);
    $('misBar').hidden = !mis; $('bDice').hidden = !!mis; $('teamBox').hidden = !!mis;
    $('teamToggle').checked = game.world.teamMode;
    $('chips').hidden = !game.world.teamMode || !!mis;
    if (mis) { $('misName').textContent = `Mission ${mis.idx + 1} · ${mis.def.n}`; $('misHint').textContent = mis.def.hint; }
  }

  function updateMission() {
    const mis = game.mission; if (!mis) return;
    $('budTxt').textContent = `${fmtPts(mis.spent)} / ${mis.budget} Punkte`;
    const f = $('budFill');
    f.style.width = Math.min(100, mis.spent / mis.budget * 100) + '%';
    f.classList.toggle('over', mis.spent > mis.par);
    const g = $('misGo');
    g.textContent = mis.phase === 'plan' ? 'Los!' : 'Abbrechen';
    g.disabled = mis.phase === 'done';
  }

  function updateControls() {
    $('pauseIco').innerHTML = game.paused ? ICON_PLAY : ICON_PAUSE;
    $('bPause').classList.toggle('on', game.paused);
    $('bSpeed').textContent = game.speed + '×';
    $('bSlow').classList.toggle('on', game.slow);
    $('muteIco').innerHTML = game.save.muted ? ICON_MUTED : ICON_SOUND;
    $('bMute').classList.toggle('on', game.save.muted);
  }

  function syncBrush() { $('brush').value = game.brush; }

  function refresh() {
    renderUnits(); buildChips(); updateMode(); updateMission(); updateControls(); syncBrush(); updateCounts();
  }

  /* ---------- Meldungen ---------- */
  let toastTimer = 0;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 1800);
  }
  let bannerTimer = 0;
  function banner(msg) {
    const b = $('banner'); b.textContent = msg; b.hidden = false;
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(bannerTimer); bannerTimer = setTimeout(() => { b.hidden = true; }, 2600);
  }
  function closeBanner() { $('banner').hidden = true; }

  /* ---------- Missionen ---------- */
  function openMissionList() {
    const g = $('lvGrid'); g.innerHTML = '';
    MISSIONS.forEach((m, i) => {
      const b = document.createElement('button'); b.className = 'lv';
      const open = game.unlocked(i), s = game.save.stars[i] || 0;
      b.disabled = !open;
      b.innerHTML = `<span class="no">Mission ${i + 1}${open ? '' : ' · gesperrt'}</span><span class="nm">${m.n}</span><span class="st">${'★'.repeat(s)}<em>${'★'.repeat(3 - s)}</em></span>`;
      b.onclick = () => { $('ovList').hidden = true; game.loadMission(i); };
      g.append(b);
    });
    $('listClose').textContent = game.mission ? 'Zurück zum Sandkasten' : 'Schließen';
    $('ovList').hidden = false;
  }

  // r = { win, timeUp, stars, spent, budget, par, time, hasNext }
  function showResult(r) {
    const h = $('resTitle');
    h.textContent = r.win ? 'Sieg!' : r.timeUp ? 'Zeit abgelaufen' : 'Niederlage';
    h.className = r.win ? 'win' : '';
    $('resStars').innerHTML = [0, 1, 2].map(i => `<i class="${i < r.stars ? 'on' : ''}">★</i>`).join('');
    $('resStats').innerHTML = `<li><span>Eingesetzte Punkte</span>${fmtPts(r.spent)} von ${r.budget}</li>
    <li><span>Drei Sterne bei höchstens</span>${r.par} Punkten</li>
    <li><span>Eigene Verluste</span>${stats.lostBlue}</li><li><span>Besiegte Gegner</span>${stats.lostRed}</li>
    <li><span>Kampfdauer</span>${Math.round(r.time)} s</li>
    ${stats.heroType ? `<li><span>Held der Schlacht</span>${UNITS[stats.heroType].n} mit ${stats.heroK} Siegen</li>` : ''}`;
    $('resNext').hidden = !(r.win && r.hasNext);
    $('resRetry').textContent = r.win ? 'Besser planen' : 'Nochmal planen';
    $('ovRes').hidden = false;
  }

  function hideOverlays() { $('ovList').hidden = true; $('ovRes').hidden = true; closeLexicon(); }

  function resetBattle() { stats.lostBlue = 0; stats.lostRed = 0; stats.heroK = 0; stats.heroType = null; }

  // Verluste und Held nur während einer Missionsschlacht (inkl. Auslaufen bis zum Ergebnis)
  function onEvent(e) {
    if (e.type !== 'death') return;
    const mis = game.mission;
    if (!mis || mis.phase === 'plan') return;
    if (e.team === 'blau') stats.lostBlue++; else stats.lostRed++;
    if (e.killerTeam === 'blau' && e.killerKills > stats.heroK) { stats.heroK = e.killerKills; stats.heroType = e.killerType; }
  }

  /* ---------- Knöpfe ---------- */
  $('bPause').onclick = () => game.togglePause();
  $('bMute').onclick = () => game.toggleMute();
  $('bSpeed').onclick = () => game.cycleSpeed();
  $('bSlow').onclick = () => game.toggleSlow();
  $('bClear').onclick = () => game.clear();
  $('bDice').onclick = () => game.dice();
  $('bUndo').onclick = () => game.undo();
  $('brush').oninput = e => game.setBrush(+e.target.value);
  $('teamToggle').onchange = e => game.setTeamMode(e.target.checked);
  $('mSand').onclick = () => game.enterSandbox();
  $('mMis').onclick = () => openMissionList();
  $('misList').onclick = () => openMissionList();
  $('misGo').onclick = () => game.go();
  $('resRetry').onclick = () => { $('ovRes').hidden = true; game.retryMission(); };
  $('resNext').onclick = () => { $('ovRes').hidden = true; game.nextMission(); };
  $('resList').onclick = () => { $('ovRes').hidden = true; openMissionList(); };
  $('listClose').onclick = () => { $('ovList').hidden = true; if (game.mission) game.enterSandbox(); };

  return {
    refresh, toast, banner, closeBanner, showResult, openMissionList,
    renderUnits, updateCounts, updateMission, updateMode, updateControls, syncBrush, buildChips,
    hideOverlays, resetBattle, onEvent, openLexicon, closeLexicon, lexiconOpen: () => !$('ovLex').hidden,
  };
}
