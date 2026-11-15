// HUD: Palette, Zähler, Missionsleiste, Dialoge, Banner, Toasts. Markup kommt aus index.html.
// Liest den Spielzustand aus `game` (main.js) und ruft dessen Aktionen auf.
import { UNITS, TERRAIN, PLURAL, CATEGORIES, TEAMS, MISSIONS } from './data.js';
import { iconURL } from './render/rig.js';

const $ = id => document.getElementById(id);
const ICON_PAUSE = '<path d="M9 5v14M15 5v14"/>';
const ICON_PLAY = '<path d="M7 5l12 7-12 7z"/>';
const ICON_MUTED = '<path d="M4 9h4l5-4v14l-5-4H4zM17 9l4 6M21 9l-4 6"/>';
const ICON_SOUND = '<path d="M4 9h4l5-4v14l-5-4H4zM17 8a5 5 0 010 8M19.5 5.5a9 9 0 010 13"/>';

export function createUI(game) {
  const icons = {};
  const icon = k => icons[k] || (icons[k] = iconURL(k));
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
    game.catKeys(game.cat).forEach((k, idx) => {
      const D = UNITS[k] || TERRAIN[k];
      const b = document.createElement('button');
      b.className = 'ub' + (k === game.sel ? ' on' : '');
      b.title = D.n + ' (Taste ' + (idx + 1) + ')';
      b.setAttribute('aria-label', D.n);
      const img = document.createElement('img'); img.src = icon(k); img.alt = ''; b.append(img);
      if (mis && UNITS[k]) { const s = document.createElement('small'); s.textContent = UNITS[k].cost; b.append(s); }
      b.onclick = () => game.select(k);
      box.append(b);
    });
    updateInfo();
  }

  function updateInfo() {
    const el = $('info'), sel = game.sel, mis = game.mission;
    if (UNITS[sel]) {
      const T = UNITS[sel];
      el.innerHTML = `<b>${T.n}</b> · LP ${T.hp} · ${T.heal ? 'Heilung ' + T.heal : 'Schaden ' + T.dmg}${mis ? ' · Kosten ' + T.cost : ''} — ${T.d}`;
    } else {
      const T = TERRAIN[sel];
      el.innerHTML = `<b>${T.n}</b>${mis && T.cost ? ' · Kosten ' + T.cost + ' je Feld' : ''} — ${T.d}${sel !== 'radierer' ? '' : ' Rechtsklick radiert auch.'}`;
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
    $('budTxt').textContent = `${Math.round(mis.spent * 10) / 10} / ${mis.budget} Punkte`;
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
    $('resStats').innerHTML = `<li><span>Eingesetzte Punkte</span>${Math.round(r.spent * 10) / 10} von ${r.budget}</li>
    <li><span>Drei Sterne bei höchstens</span>${r.par} Punkten</li>
    <li><span>Eigene Verluste</span>${stats.lostBlue}</li><li><span>Besiegte Gegner</span>${stats.lostRed}</li>
    <li><span>Kampfdauer</span>${Math.round(r.time)} s</li>
    ${stats.heroType ? `<li><span>Held der Schlacht</span>${UNITS[stats.heroType].n} mit ${stats.heroK} Siegen</li>` : ''}`;
    $('resNext').hidden = !(r.win && r.hasNext);
    $('resRetry').textContent = r.win ? 'Besser planen' : 'Nochmal planen';
    $('ovRes').hidden = false;
  }

  function hideOverlays() { $('ovList').hidden = true; $('ovRes').hidden = true; }

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
    hideOverlays, resetBattle, onEvent,
  };
}
