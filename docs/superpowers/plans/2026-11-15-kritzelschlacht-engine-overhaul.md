# Kritzelschlacht Engine-Overhaul – Umsetzungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die Ein-Datei-Canvas-Engine von Kritzelschlacht wird zu einer modularen WebGL-Engine (PixiJS) mit Höhenachse, Masse-Physik, physischen Geschossen, Cartoon-Sterben, prozeduraler Animation und dosierten Effekten. Spielprinzip und alle Funktionen bleiben, die Balance wird neu kalibriert.

**Architecture:** Die Spiellogik (Daten, Welt, Physik, Kampf, Simulation) sind reine ES-Module ohne DOM, deterministisch über einen Seed-Zufall und mit `node --test` testbar. Die Logik schreibt Ereignisse in `world.events`. Renderer, Effekte und Ton lesen sie nur. Die Darstellung (PixiJS, Kamera, Eingabe, Oberfläche) läuft nur im Browser und wird dort geprüft. Veröffentlicht wird als Artifact mit mehreren Dateien unter dem bestehenden Link.

**Tech Stack:** Vanilla ES-Module, PixiJS 7.4.2 (global `PIXI` von cdnjs), Node 24 (`node --test`) für Logik-Tests und Werkzeuge, Git.

**Spec:** `docs/superpowers/specs/2026-11-15-engine-overhaul-design.md`

## Global Constraints

- Artifact-Link bleibt `https://claude.ai/artifact/QtMYbLk6di6csuGhk7YStf`. Veröffentlicht wird `game/index.html` mit `url` (anderer Pfad als bisher, also vorher `action: "read"`). Die JS-Dateien gehen über `files` mit, z. B. `{"js/main.js": "game/js/main.js", …}`.
- PixiJS wird geladen mit `<script src="https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.4.2/pixi.min.js"></script>` vor `<script type="module" src="js/main.js">`. Keine anderen externen Skripte. Schriften kommen weiter von Google Fonts (Luckiest Guy, Nunito).
- Ziel sind rund 2.000 Einheiten mit 60 fps im Laptop-Browser (Chrome/Edge). Handy wird nicht berücksichtigt.
- Stil: weißes Feld, runde Sticker-Figuren mit Glubschaugen, Umriss `#2a2a33`. Kein Dauer-Bloom, keine Farbfilter auf dem ganzen Bild.
- Tasten (deutsche Tastatur):
  - Mausrad zoomt zur Mausposition.
  - Leertaste+Ziehen oder Mitteltaste verschiebt.
  - `+`/`−` (Hauptreihe und Ziffernblock) und Shift+Mausrad ändern den Pinsel (10–150).
  - Q/E wechseln die Kategorie, 1–9 wählen die Einheit, X den Radierer.
  - Strg+Z macht rückgängig, `P` pausiert.
  - Rechtsklick radiert.
- Speicherstand bleibt unter dem localStorage-Schlüssel `kritzelschlacht-v1` mit dem Format `{stars:{[missionIndex]:0..3}, muted:boolean}`, Zugriff immer in try/catch.
- Alle Texte in der Oberfläche sind deutsch. Einheiten-, Kategorie- und Missionsnamen bleiben wie in `kritzelschlacht.html`.
- Sound-Overhaul ist ausgeschlossen. Neu sind nur die Geräusche `land`, `splash`, `crash` und `impact`.
- Die alte `kritzelschlacht.html` bleibt bis Task 6 unverändert als Referenz liegen. Werte und Texte werden daraus übernommen.
- Logik-Module (`data`, `world`, `physics`, `combat`, `sim`, `camera`, `rig`-Pose) dürfen weder `window`, `document`, `PIXI` noch `Math.random` verwenden. Zufall kommt immer aus `world.rng()`.

## Review Focus

1. **Malen bei Zoom und Verschiebung:** Der Pinsel muss genau unter dem Mauszeiger landen, auch die Missionsgrenze bei x = 0,42·W gilt in Weltkoordinaten. → Test in Task 3 (`screenToWorld` nach `zoomAt` und `pan`).
2. **Fenstergröße ändert sich mitten in der Schlacht:** Einheiten, Leichen, Trümmer und Gelände bleiben erhalten, alles liegt danach innerhalb der neuen Welt. → Test in Task 1 (`resizeWorld`).
3. **Körper wird in eine Mauer oder über den Rand geschleudert:** Er landet in einer freien Zelle innerhalb der Welt und steckt nie fest. → Test in Task 7.
4. **Schütze mit geraden Schüssen dauerhaft von Verbündeten verdeckt (Gedränge):** Er friert nicht ein und schießt nie durch Verbündete. Nach 2 s sucht er ein anderes Ziel mit freier Linie. → Test in Task 8.
5. **Massenexplosion im Gedränge** (500 Bienen, 20 Mörsertreffer im selben Takt): Ereignisse und Partikel sind gedeckelt, der Simulationsschritt bleibt begrenzt. → Bench-Szenario in Task 13.

---

## Dateistruktur

```
package.json                 {"type":"module","scripts":{"test":"node --test tests/","balance":"node tools/balance.mjs","bench":"node tools/bench.mjs"}}
game/index.html              Markup, CSS (aus kritzelschlacht.html), lädt PixiJS + js/main.js
game/js/data.js              Einheiten, Gelände, Kategorien, Teams, Missionen als Daten, Konstanten
game/js/rng.js               Seed-Zufall
game/js/world.js             Weltzustand, Spawn, Geländeraster, Spatial Hash, Zielsuche, Größenänderung
game/js/physics.js           Höhenachse, Masse, Impulse, Kollision, Mauern, Landung/Betäubung, Leichen, Trümmer
game/js/combat.js            KI-Verhalten, Waffen, Geschosse, Schaden/Rüstung, Explosionen, Schusslinie
game/js/sim.js               Simulationsschritt, Missionsaufbau, Missionsergebnis, Sieger im Sandkasten
game/js/camera.js            Kamera-Mathematik (rein)
game/js/render/rig.js        Teile-Texturen pro Einheitentyp + reine Funktion poseUnit()
game/js/render/renderer.js   PixiJS-Ebenen, Gelände-Textur, Einheiten, Geschosse, Leichen, Pinsel
game/js/render/fx.js         Partikel, Glühen, Licht, Rauch, Krater, Wackeln
game/js/input.js             Maus/Tastatur → Kamera, Pinsel, Aktionen
game/js/ui.js                DOM-Oberfläche: Palette, Zähler, Missionen, Ergebnis, Toasts, Speicher
game/js/audio.js             WebAudio-Effekte
game/js/main.js              Start, Hauptschleife, Verdrahtung
tests/*.test.js              Logik-Tests (node:test)
tools/plans.mjs              Testarmeen pro Mission + Konter-Erwartungen
tools/balance.mjs            Duelle & Missionen headless
tools/bench.mjs              Leistungsmessung der Simulation
```

## Gemeinsame Datentypen

Die Datentypen gelten für alle Tasks. Jeder Task ergänzt nur die Felder, die er besitzt.

```js
// Unit (world.units[i])
{ id, type, T /* = UNITS[type] */, team, x, y, z, vx, vy, vz, mx, my /* KI-Wunschgeschwindigkeit */,
  hp, alive, state /* 'ok'|'air'|'stun' */, stunT, peakZ, face /* ±1 */, aimX, aimY,
  tg /* Unit|null */, cd, rt, kills, hitT, fireT, swingT, seed, gx, gy, gn, gt, att, st, cvx, cvy,
  run, blk, bcell, wall, blockedT }
// World
{ W, H, rng, time, teamMode, units, proj, corpses, debris, events,
  GW, GH, terr /* Uint8Array */, towner, whp /* Float32Array */,
  HW, HH, hash, facCount /* Map */, totalAlive }
// Event (world.events, von Renderer/Fx/Audio pro Frame gelesen und geleert)
{ type: 'shot'|'hit'|'blast'|'death'|'land'|'splash'|'crash'|'debris'|'heal'|'wallHit'|'terrain'|'sound', x, y, z?, ...payload }
```

---

## Etappe (a): Renderer, Kamera, Animation

### Task 1: Gerüst, Daten und Welt als reine Module

**Files:**
- Create: `package.json`, `.gitignore` (`node_modules/`), `game/js/data.js`, `game/js/rng.js`, `game/js/world.js`, `tests/world.test.js`

**Interfaces:**
- Produces:
  - `data.js`:
    - Konstanten: `UNITS`, `PLURAL`, `TERRAIN`, `CATEGORIES`, `TEAMS`, `TINT` (Set der Typen mit Teamfarbe am Körper, wie in der alten Datei), `MISSIONS`, `CELL = 10`, `HASH_CELL = 40`.
    - `UNITS[type]` hat zusätzlich `mass` und bei Fliegern `flyZ`.
    - Missionen als Daten: `{n, budget, par, cats?, hint, place: Placement[]}` mit `Placement` gleich `['rect',type,n,x0,y0,x1,y1] | ['circle',type,n,cx,cy,rr] | ['unit',type,x,y] | ['tRect',terKey,x0,y0,x1,y1] | ['tCircle',terKey,cx,cy,rr,inner?]`. Koordinaten wie bisher in Anteilen von W/H, Radien in Anteilen von H.
  - `rng.js`: `createRng(seed: number): () => number` (mulberry32, Werte in [0,1)).
  - `world.js`:
    - `createWorld(W, H, seed = 1): World`
    - `spawn(world, type, x, y, team): Unit`
    - `factionOf(world, u): string`
    - `cellIndex(world, x, y): number`
    - `setCell(world, i, terrainId, owner = 0): void`
    - `rebuildHash(world): void`
    - `query(world, x, y, r, cb): void` (cb gibt `true` zurück → Abbruch)
    - `nearestEnemy(world, u): Unit|null`
    - `resizeWorld(world, W, H): void`

- [ ] **Step 1: Repo anlegen** mit `git init`, `package.json` und `.gitignore` wie oben. Prüfen: `npm test` läuft, „0 tests“ ist ok.
- [ ] **Step 2: Failing Tests schreiben** in `tests/world.test.js`:

```js
test('spawn setzt Startwerte', () => { const w = createWorld(1400, 800, 7);
  const u = spawn(w, 'krieger', 100, 100, 'blau');
  assert.equal(u.hp, UNITS.krieger.hp); assert.equal(u.z, 0); assert.equal(u.state, 'ok');
  assert.equal(spawn(w, 'heli', 50, 50, 'rot').z, UNITS.heli.flyZ); });
test('Seed macht Welt reproduzierbar', () => { assert.equal(createWorld(10,10,3).rng(), createWorld(10,10,3).rng()); });
test('nearestEnemy: nächster Gegner, keine Verbündeten', ...);           // 3 Einheiten, erwartete id
test('Nahkämpfer am Boden zielen nie auf Hubschrauber', ...);             // krieger + heli → null
test('Geist bevorzugt Fernkämpfer (Faktor 0.45)', ...);                  // krieger bei 100 px, schuetze bei 140 px → schuetze
test('Teammodus: Fraktion = Team, sonst = Typ', ...);
test('resizeWorld behält Gelände und klemmt Einheiten', () => {
  const w = createWorld(1000, 600); setCell(w, cellIndex(w, 55, 55), 1); const u = spawn(w,'krieger',990,590,'blau');
  resizeWorld(w, 800, 500);
  assert.equal(w.terr[cellIndex(w,55,55)], 1); assert.ok(u.x <= 800 && u.y <= 500); });
```

- [ ] **Step 3: Testlauf schlägt fehl.** `npm test` meldet „Cannot find module …/world.js“.
- [ ] **Step 4: Implementieren.**
  - `data.js`: Werte, Texte, Kategorien inklusive `modern` und alle 9 Missionen 1:1 aus `kritzelschlacht.html` übernehmen.
  - `mass` pro Einheit: krieger 1, schuetze 1, ritter 2, grenadier 1, reiter 3, sani 1, wolf 0.8, baer 6, biene 0.1, magier 1, geist 0.6, drache 30, soldat 1, mg 1.3, sniper 1, panzerfaust 1, moerser 1, panzer 40, heli 12.
  - `flyZ`: biene 14, geist 18, heli 46, drache 60.
  - `world.js`: Logik aus `rebuildHash`, `query`, `nearestEnemy` (Bevorzugung, `att`-Gewichtung, Heli-Regel) und `setTerrain` der alten Datei übernehmen, aber auf `world` statt Globals.
- [ ] **Step 5: Tests laufen grün.** `npm test` meldet alle PASS.
- [ ] **Step 6: Commit** mit `git commit -m "feat: pure data and world modules"`.

### Task 2: Kampf und Simulation portieren, Balance-Werkzeug als Regressionstor

Der Port übernimmt das heutige Verhalten unverändert (noch ohne neue Physik). Nur Partikel und `sfx()` werden zu Ereignissen.

**Files:**
- Create: `game/js/combat.js`, `game/js/sim.js`, `tests/combat.test.js`, `tests/sim.test.js`, `tools/plans.mjs`, `tools/balance.mjs`

**Interfaces:**
- Consumes: alles aus Task 1.
- Produces:
  - `combat.js`:
    - `think(world, u, dt)`, `attack(world, u, t, d, dx, dy)`
    - `fire(world, u, t, kind)` mit kind ∈ `arrow|bomb|fire|bullet|rocket|shell|mortar`
    - `stepProjectiles(world, dt)`
    - `hurt(world, v, amount, kind, src) → dealt`
    - `blast(world, x, y, R, dmg, faction, src, kind, wallMul)`
    - `hitWall(world, i, dmg, fromX, fromY)` (Herkunft des Treffers, für die Flugrichtung der Trümmer in Task 10)
  - `sim.js`:
    - `step(world, dt)`, `buildMission(world, missionIndex)`
    - `missionResult(world, battleTime) → 'win'|'lose'|null` (Blau 0 → lose, Rot 0 → win, >180 s → lose)
    - `sandboxWinner(world) → faction|null`
  - `tools/plans.mjs`: `MISSION_PLANS[i] = {smart: Plan, spam: Plan}`, `COUNTERS = [[a, b, points], …]` und `placePlan(world, plan) → spentPoints`, mit `Plan = Array<[type, n, x0, y0, x1, y1]>` (blaue Rechtecke).
  - `tools/balance.mjs`: CLI `node tools/balance.mjs missions|duels [runs=8]`, gibt pro Zeile `name  wins/runs  spent` aus und endet mit Exitcode 1, wenn eine Erwartung verfehlt ist.

- [ ] **Step 1: Failing Tests schreiben.**
  - `combat.test.js`:
    - Rüstungstabelle: Ritter nimmt von `arrow` 0.35, von `melee` 0.7 und von `bullet` 0.8 des Schadens.
    - Schildwall nimmt bei `arrow` noch ×0.65.
    - Panzer nimmt von `rocket` 1.6 und von `bullet` 0.25.
    - Heli nimmt von `rocket` 1.4.
    - Geist nimmt von Nicht-Feuer 0.5.
    - Wald gibt Deckung ×0.5 gegen `arrow|blast|bullet|rocket`.
    - `blast` hat Abfall auf 50 % am Rand.
  - `sim.test.js`:

```js
test('Mission 1: 9 Ritter gewinnen in 60 s Simulation', () => {
  const w = createWorld(1400, 820, 11); buildMission(w, 0); w.teamMode = true;
  placePlan(w, [['ritter', 9, .3, .4, .34, .6]]);           // Hilfsfunktion aus tools/plans.mjs
  let t = 0; while (t < 60 && !missionResult(w, t)) { step(w, 1/60); t += 1/60; }
  assert.equal(missionResult(w, t), 'win'); });
```

- [ ] **Step 2: Testlauf schlägt fehl.** `npm test` meldet FAIL.
- [ ] **Step 3: Implementieren.**
  - `think`, `attack`, `healer`, `groupInfo`, `shoot`, `updateProj`, `hurt`, `blast`, `knock`, `hitWall`, `separate`, `move`, `step` aus `kritzelschlacht.html` portieren.
  - Partikel werden zu `world.events.push({type:…})`, `sfx(k)` wird zu `{type:'sound', k}`.
  - `tools/plans.mjs` bekommt die Pläne und Erwartungen aus dem Gespräch:
    - Smart-Pläne: M1 `ritter 9`, M2 `ritter 10 + grenadier 6`, M3 `biene 160`, M4 `reiter 30`, M5 `magier 14`, M6 `biene 180`, M7 `schuetze 30`, M8 `schuetze 14 + magier 16`, M9 `soldat 16 + panzerfaust 12`.
    - Spam-Pläne: M2 `krieger 50`, M4 `krieger 60`, M5 `krieger 55`, M7 `krieger 55`, M8 `krieger 85`, M9 `krieger 75`.
- [ ] **Step 4: Tests grün, Balance-Regression grün.**
  - `npm test` meldet PASS.
  - `node tools/balance.mjs missions 8`: Jeder Smart-Plan gewinnt mindestens 6/8, jeder gelistete Spam-Plan verliert mindestens 6/8, Exitcode 0. So ist der Stand vor dem Overhaul festgehalten.
- [ ] **Step 5: Commit** mit `git commit -m "feat: port combat and sim as pure modules with balance gate"`.

### Task 3: Kamera und Eingabe

**Files:**
- Create: `game/js/camera.js`, `game/js/input.js`, `tests/camera.test.js`

**Interfaces:**
- Produces:
  - `camera.js` (rein):
    - `createCamera(viewW, viewH, worldW, worldH) → Camera {x, y, zoom, fit, viewW, viewH, worldW, worldH}`. Die Startansicht zeigt die ganze Welt, `fit = min(viewW/worldW, viewH/worldH)`.
    - `screenToWorld(cam, sx, sy) → {x, y}`, `worldToScreen(cam, wx, wy) → {x, y}`
    - `zoomAt(cam, sx, sy, factor)`: Zoom bleibt in [fit, fit·4], der Weltpunkt unter (sx, sy) bleibt fest.
    - `pan(cam, dxScreen, dyScreen)`
    - `clampCamera(cam)`: Die Welt bleibt im Bild, bei `zoom = fit` zentriert.
    - `resizeCamera(cam, viewW, viewH, worldW, worldH)`
  - `input.js`: `bindInput(canvas, cam, actions)` mit `actions = {paintAt(wx, wy, erase), strokeStart(), strokeEnd(), brushDelta(d), setCat(dir), pickSlot(n), eraser(), undo(), togglePause()}`.

- [ ] **Step 1: Failing Tests schreiben** in `tests/camera.test.js`:

```js
test('zoomAt hält den Punkt unter dem Mauszeiger fest', () => {
  const c = createCamera(1200, 750, 1400, 820); const before = screenToWorld(c, 300, 200);
  zoomAt(c, 300, 200, 2); const after = screenToWorld(c, 300, 200);
  assert.ok(Math.abs(before.x - after.x) < 1e-6 && Math.abs(before.y - after.y) < 1e-6); });
test('Zoom bleibt in [fit, fit*4]', ...);
test('pan + screenToWorld: Missionsgrenze 0.42*W bleibt an derselben Weltstelle', ...);
test('clampCamera hält die Welt im Bild', ...);
```

- [ ] **Step 2: Testlauf schlägt fehl.**
- [ ] **Step 3: Implementieren.**
  - `camera.js`: reine Mathematik.
  - `input.js`: Tastenbelegung wie in den Global Constraints.
  - Leertaste gedrückt plus Ziehen bedeutet Verschieben (kein Pausieren mehr).
  - `+` liefert `e.key === '+'`, `−` liefert `e.key === '-'`, zusätzlich `NumpadAdd`/`NumpadSubtract`. Schrittweite 8.
  - Malen arbeitet nur mit Weltkoordinaten aus `screenToWorld`.
- [ ] **Step 4: Tests grün.**
- [ ] **Step 5: Commit** mit `git commit -m "feat: camera math and input bindings"`.

### Task 4: PixiJS-Renderer und Oberfläche, spielbare Parität

**Files:**
- Create: `game/index.html`, `game/js/render/renderer.js`, `game/js/render/rig.js` (vorerst nur `bakeUnitTextures`), `game/js/ui.js`, `game/js/audio.js`, `game/js/main.js`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces:
  - `renderer.js`:
    - `createRenderer(canvasHost) → Renderer` mit `resize(viewW, viewH)`, `markTerrainDirty(gx0, gy0, gx1, gy1)`, `draw(world, cam, t)`, `setOverlay({brushX, brushY, brushR, erase, missionZoneX|null})`.
    - Ebenen in Zeichenreihenfolge: `terrain`, `decals`, `corpses`, `shadows`, `ground`, `projectiles`, `air`, `fx`, `overlay`.
  - `rig.js` (Zwischenstand): `bakeUnitTextures(renderer, resolution)` übernimmt die heutigen `paint()`-Funktionen, liefert Texturen pro `type|team|flip|frame` und wird in Task 5 ersetzt.
  - `ui.js`: `createUI(game) → {refresh(), toast(msg), banner(msg), showResult(r), openMissionList()}`. Markup und CSS werden aus `kritzelschlacht.html` übernommen. Der Tasten-Hinweis lautet jetzt `Tasten: 1–9 Einheit · Q/E Kategorie · X Radierer · +/− Pinsel · Strg+Z zurück · P Pause · Mausrad Zoom · Leertaste+Ziehen verschieben`.
  - `audio.js`: `createAudio() → {init(), play(kind), muted}` mit den bisherigen Klängen.
  - `main.js`: Schleife mit festem Schritt 1/60, Tempo 1/2/4×, Zeitlupe 0,3×, Pause. Liest `world.events` jeden Frame an Fx, Audio und UI weiter und leert sie danach.

- [ ] **Step 1: Index und Start.**
  - `index.html` enthält `<title>Kritzelschlacht</title>`, `<meta name="claude:viewport-fit-sides" content="cover">`, das CSS und HUD-Markup der alten Datei, den PixiJS-Tag aus den Global Constraints und `<script type="module" src="js/main.js">`.
  - Pixi-Canvas füllt `#app`, die Hintergrundfarbe ist `0xffffff`.
- [ ] **Step 2: Renderer und Oberfläche implementieren.**
  - Das Gelände wird auf eine Offscreen-Canvas gezeichnet, Code aus `drawTerrain` der alten Datei. `PIXI.Texture.from(canvas)` mit `texture.update()` nach `markTerrainDirty`.
  - Einheiten sind Sprites aus einem Pool, sortiert nach y, Flieger in der Ebene `air`.
- [ ] **Step 3: Lokal prüfen.**
  - `python -m http.server 8765 --directory game` starten und im Browser-Fenster `http://localhost:8765/` öffnen.
  - Erwartet, alles ohne Konsolenfehler:
    - Die Demo-Schlacht läuft.
    - Alle 5 Kategorien und das Gelände lassen sich malen.
    - Mission 1 lässt sich bis zum Ergebnisdialog spielen.
    - Rückgängig, Teamkampf, Zufallsschlacht, Heldenkrone und Stärkebalken funktionieren.
    - Schildwall-Linien, Rudel, Flankenritt und Schwarm sind sichtbar.
    - Zoomen, Verschieben und Malen bei Zoom 3× treffen die Mausposition.
- [ ] **Step 4: Leistung grob prüfen.** Mit `?fps` blendet `main.js` die Bildrate ein. Bei der Demo-Schlacht muss sie mindestens 55 sein.
- [ ] **Step 5: Commit** mit `git commit -m "feat: pixi renderer and UI parity"`.

### Task 5: Figuren aus Teilen, prozedurale Animation

**Files:**
- Modify: `game/js/render/rig.js` (ersetzt `bakeUnitTextures`)
- Modify: `game/js/render/renderer.js` (Einheit = Container aus Teilen)
- Modify: `game/js/combat.js` (setzt `u.fireT = 0` beim Schuss, `u.swingT = 0.25` beim Nahkampfschlag, `u.hitT = 0.15` bei Treffer)
- Create: `tests/rig.test.js`

**Interfaces:**
- Produces:
  - `rig.js`:
    - `RIG_PARTS = ['shadow','body','pupilL','pupilR','lid','headgear','weapon']`.
    - `bakeRigTextures(renderer, resolution) → Map<type, {[part]: PIXI.Texture, anchors}>`. Der Körper enthält das Augenweiß, die Pupillen sind eigene Sprites. `lid` ist ein Lid in Körperfarbe, das nur beim Blinzeln sichtbar ist.
    - Rein: `poseUnit(u, t) → Pose {sx, sy, tilt, bob, weaponRot, recoil, blink, lookX, lookY}`.
  - Teamfarbe wird über `tint` auf `body` angewendet, wenn `TINT.has(type)` gilt, dazu ein Teamring im `shadow`-Teil.

- [ ] **Step 1: Failing Tests schreiben** in `tests/rig.test.js`:

```js
test('Laufen: Squash & Stretch hält die Fläche (sx*sy≈1) und schwingt', ...);   // sy pendelt zwischen 0.92 und 1.08
test('Neigung folgt der Laufrichtung, max 0.12 rad', ...);
test('Treffer drückt zusammen: hitT>0 → sx=1.15, sy=0.85', ...);
test('Rückstoß: fireT<0.12 → recoil = 3*(1-fireT/0.12), sonst 0', ...);
test('Blinzeln: blink true genau für 0.12 s je 3.2 s, Phase über u.seed versetzt', ...);
test('Pupillen schauen zum Ziel: |look| = 0.35, Richtung = Ziel', ...);
test('Schwung: swingT>0 → weaponRot sinkt linear von -1.1 auf 0', ...);
```

- [ ] **Step 2: Testlauf schlägt fehl.**
- [ ] **Step 3: Implementieren.**
  - `poseUnit` als reine Funktion.
  - Die heutigen `paint()`-Zeichnungen werden pro Typ in die Teile aufgeteilt: Körper mit Augenweiß, Kopfbedeckung, Waffe.
  - Der Renderer nutzt pro Einheit einen gepoolten Container mit diesen Sprites und setzt Skalierung, Rotation und Positionen aus der Pose.
- [ ] **Step 4: Tests grün, im Browser prüfen.**
  - `npm test` meldet PASS.
  - Bei Zoom 3× sichtbar:
    - Figuren federn beim Laufen, neigen sich und blinzeln.
    - Pupillen zeigen zum Ziel.
    - Gewehre zucken beim Schuss, Schwerter schwingen.
    - Treffer quetschen kurz.
  - Bildrate der Demo mindestens 55.
- [ ] **Step 5: Commit** mit `git commit -m "feat: part-based rigs with procedural animation"`.

### Task 6: Etappe (a) veröffentlichen

- [ ] **Step 1: Artifact lesen.** `Artifact action:"read"` auf den Link aus den Global Constraints.
- [ ] **Step 2: Veröffentlichen.**
  - `file_path: game/index.html`, `url` auf den bestehenden Link.
  - `files` mit allen `game/js/**`-Dateien unter ihren relativen Pfaden.
  - `label: "Etappe a: WebGL + Animation"`.
- [ ] **Step 3: Nutzer bitten,** Etappe (a) zu testen: Optik, Kamera, Tasten. Erst nach seinem Okay geht es mit Etappe (b) weiter.
- [ ] **Step 4: Commit** mit `git commit -m "chore: publish stage a"`.

---

## Etappe (b): Physik

### Task 7: Physik-Kern

**Files:**
- Create: `game/js/physics.js`, `tests/physics.test.js`
- Modify: `game/js/sim.js` (`step` nutzt Physik statt `move`/`separate`)

**Interfaces:**
- Produces in `physics.js`:
  - Konstanten: `GRAVITY = 900` (px/s²), `GROUND_FRICTION = 8` (je s, `v *= exp(-8·dt)` auf Fremdgeschwindigkeit am Boden), `WALL_CLEAR_Z = 12`.
  - `applyImpulse(u, ix, iy, iz)`: setzt `v += I/mass`. Bei `iz > 0` gilt `state = 'air'` und `peakZ` wird ab hier gemessen.
  - `integrate(world, dt)`:
    - Am Boden und `state === 'ok'` wirkt die Wunschbewegung (`mx`, `my`) plus Fremdgeschwindigkeit mit Reibung.
    - In der Luft wirken Schwerkraft auf `vz` und Luftwiderstand 0,4/s.
    - Flieger halten ihre `flyZ`.
    - Bei der Landung (`z ≤ 0`, `vz < 0`) wird `z = 0`. Bei einer Aufprallgeschwindigkeit über 250 gibt es einen Abpraller mit `vz = -vz·0.25` (einmal).
    - Danach `state = 'stun'`, `stunT = clamp(0.3 + 0.5·peakZ/120, 0.3, 0.8)` und das Ereignis `{type:'land', x, y, impact}`.
  - `collide(world)`: Kreise mit Massenanteil. Der Anteil, den u ausweicht, ist `m_v/(m_u+m_v)`. Boden mit Boden, Flieger mit Fliegern. Körper in der Luft mit `z > r` werden übersprungen.
  - `collideWalls(world, u)`: Am Boden und mit `z < WALL_CLEAR_Z` gleiten Einheiten an Mauerzellen entlang wie bisher (`blk`, `bcell` bleiben für die KI). Landet ein Körper in einer Mauerzelle, wird er in die nächste freie Zelle verschoben (Suche in Ringen bis Radius 6 Zellen).
  - Kartenrand: Klemmen auf [6, W−6] × [6, H−6], die Geschwindigkeitskomponente nach außen wird 0.
- Sonstiges:
  - `combat.think` überspringt Einheiten mit `state !== 'ok'`.
  - `combat.knock` wird zu `applyImpulse` mit `iz = 0` (normale Treffer schubsen nur, kein Betäuben).

- [ ] **Step 1: Failing Tests schreiben** in `tests/physics.test.js`:

```js
test('Senkrechter Impuls: Flugzeit ≈ 2·vz/g, danach stun 0.3–0.8 s', ...);
test('Höherer Flug → längere Betäubung, gedeckelt bei 0.8 s', ...);
test('Panzer schiebt Soldat: Soldat weicht ≥ 10× weiter aus als Panzer', ...);
test('Normaler Treffer (iz=0) betäubt nicht', ...);
test('Gegen Mauer geschoben: Körper bleibt außerhalb der Mauerzellen', ...);
test('In Mauerzelle gelandet → steht danach in freier Zelle', ...);        // Review Focus 3
test('Über den Rand geschleudert → landet innerhalb der Welt', ...);      // Review Focus 3
test('Flieger bleiben auf flyZ und kollidieren nicht mit Bodentruppen', ...);
```

- [ ] **Step 2: Testlauf schlägt fehl.**
- [ ] **Step 3: Implementieren** und `sim.step` umstellen. Reihenfolge: `rebuildHash` → `att` zählen → `think` → `integrate` → `collide` → `collideWalls` → `stepProjectiles`. `stepCorpses` (Task 9) und `stepDebris` (Task 10) werden dort angehängt, sobald es sie gibt.
- [ ] **Step 4: Tests grün.**
  - `npm test` meldet PASS.
  - `node tools/balance.mjs missions 8` laufen lassen und Abweichungen nur notieren, nicht reparieren. Neukalibriert wird in Task 14.
- [ ] **Step 5: Commit** mit `git commit -m "feat: physics core with height axis, mass and stun"`.

### Task 8: Physische Geschosse, Friendly Fire, Schusslinie

**Files:**
- Modify: `game/js/combat.js`
- Create: `tests/projectiles.test.js`

**Interfaces:**
- Produces in `combat.js`:
  - `PROJECTILES = {arrow:{arc:true,speed:520}, bomb:{arc:true,speed:450}, mortar:{arc:true,speed:500}, shell:{arc:true,speed:850}, bullet:{arc:false,speed:1100}, rocket:{arc:false,speed:520}, fire:{arc:false,speed:330}}`
  - Bögen (`arc: true`) fliegen auf einer Bahn mit z-Höhe (`h = d·{arrow:.16, bomb:.35, mortar:.55, shell:.08}`) und treffen nur am Zielpunkt.
  - Gerade Schüsse (`arc: false`) bewegen sich pro Schritt und prüfen das Segment gegen Körper **jeder** Fraktion (außer dem Schützen), wenn `|body.z − shot.z| < r + 10`. Treffer ist der erste Körper oder die erste Mauerzelle. Raketen und Feuerbälle explodieren dort, Kugeln enden dort.
  - `raycast(world, x0, y0, x1, y1, z, ignore: Set<Unit>) → {unit: Unit|null, cell: number, t: number}`
  - `hasLineOfFire(world, u, target) → boolean`: falsch, wenn der erste Treffer zur Fraktion von u gehört.
  - Friendly Fire: `blast` trifft alle Fraktionen. Der Schütze selbst bekommt ×0.5.
  - Verhalten:
    - Hat ein Schütze mit geraden Schüssen keine freie Linie, feuert er nicht und weicht seitlich aus (senkrecht zur Zielrichtung, Seite über `id % 2`, Tempo ×0.7) und zählt dabei `u.blockedT`.
    - Ab `blockedT ≥ 2` s wählt er unter den 8 nächsten Gegnern den nächsten mit freier Linie. Gibt es keinen, hält er das Feuer und `blockedT` wird zurückgesetzt.

- [ ] **Step 1: Failing Tests schreiben** in `tests/projectiles.test.js`:

```js
test('Pfeil fliegt über einen Verbündeten hinweg und trifft das Ziel', ...);
test('Kugel trifft den ersten Körper im Weg – auch einen Verbündeten', ...);  // Verbündeter läuft nach dem Schuss in die Bahn
test('Soldat hinter eigener Reihe feuert nicht und bewegt sich seitlich', ...);
test('Dauerhaft verdeckt: nach 2 s neues Ziel mit freier Linie, nie Schuss durch Verbündete', ...); // Review Focus 4
test('Mauer stoppt Kugel; Rakete explodiert an der Mauer und beschädigt sie', ...);
test('Explosion verletzt auch eigene Einheiten im Radius', ...);
test('Flieger: Kugel auf Heli fliegt in Heli-Höhe und trifft keine Bodentruppen dazwischen', ...);
```

- [ ] **Step 2: Testlauf schlägt fehl.**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Tests grün.**
- [ ] **Step 5: Commit** mit `git commit -m "feat: physical projectiles, friendly fire, line of fire"`.

### Task 9: Explosionen schleudern, Cartoon-Sterben, liegende Körper

**Files:**
- Modify: `game/js/combat.js` (`blast`, `die`), `game/js/physics.js` (`stepCorpses`)
- Create: `tests/corpses.test.js`

**Interfaces:**
- Produces:
  - `blast(…)` schleudert alle Einheiten im Radius:
    - Horizontaler Impuls `I = dmg · 9 · falloff` mit `falloff = 1 − 0.5·d/R`, Richtung vom Zentrum weg.
    - Senkrechter Impuls `iz = 0.6·I`, angewendet über `applyImpulse`.
  - `die(world, u, src)` erzeugt eine Leiche in `world.corpses`:
    - `{type, team, x, y, z, vx, vy, vz, rot, vrot, state:'fly'|'rest'|'float'|'sink'|'ash', t, fade}` mit der Geschwindigkeit der Einheit plus `vrot = ±(4…10)` rad/s.
    - Dazu Teile laut `PARTS[type]` (z. B. `krieger: ['headgear','weapon']`, `ritter: ['headgear','shield']`, `panzer: ['turret']`) als eigene Leichen-Teile mit Zufallsimpuls (`kind: 'part'`).
    - Ereignis `{type:'death', …}`, das Seelchen gehört dem Renderer.
  - `stepCorpses(world, dt)`:
    - Schwerkraft, Abprall (×0.3), Bodenreibung, Drehung gebremst.
    - Ruhezustand bei `|v| < 5` und `z = 0`.
    - Leichen kollidieren nicht.
    - Deckel `CORPSE_CAP = 1500`: Darüber bekommen die ältesten `fade = 1` s und werden danach entfernt.
  - `clearBattle(world)`: leert `units`, `proj`, `corpses`, `debris` und `events` (für Wiederholen und Laden einer Mission).

- [ ] **Step 1: Failing Tests schreiben:**

```js
test('Explosion schleudert leichte Einheiten weiter als schwere', ...);       // biene vs ritter vs panzer
test('Geschleuderte Einheit landet betäubt (state stun)', ...);
test('Tote Einheit wird zur Leiche, die innerhalb von 3 s zur Ruhe kommt', ...);
test('Teile fliegen getrennt und kommen ebenfalls zur Ruhe', ...);
test('Leichen sind kein Hindernis: Einheit läuft ohne Ablenkung durch', ...);
test('Deckel: bei 1.600 Leichen verblassen die ältesten 100 und verschwinden', ...);
test('clearBattle leert Leichen und Trümmer', ...);
test('resizeWorld klemmt auch Leichen in die neue Welt', ...);              // Review Focus 2
```

- [ ] **Step 2: Testlauf schlägt fehl.**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Tests grün.**
- [ ] **Step 5: Commit** mit `git commit -m "feat: launching blasts, cartoon deaths, persistent corpses"`.

### Task 10: Abstürze, Mauertrümmer, Körper in Wasser und Lava

**Files:**
- Modify: `game/js/combat.js` (`die` für Flieger, `hitWall`), `game/js/physics.js` (`stepDebris`, Leichen auf Gelände)
- Create: `tests/crash.test.js`

**Interfaces:**
- Produces:
  - Abstürze:
    - Ein toter Flieger fällt aus seiner Höhe mit Drehung als `corpse` mit `crash: type`.
    - Beim Aufprall des Helis: `blast(world, x, y, 50, 60, null, null, 'blast', 2)` plus Ereignis `{type:'crash', kind:'heli'}`.
    - Beim Aufprall des Drachen: Impuls 900 im Radius 70 ohne Schaden plus `{type:'crash', kind:'drache'}`.
  - Trümmer:
    - `hitWall`: Fällt eine Zelle, entstehen 3 Brocken in `world.debris` `{x, y, z, vx, vy, vz, rot, vrot, t}` mit Geschwindigkeit nach außen (vom Zerstörer weg).
    - Brocken machen keinen Schaden, liegen 6 s und verblassen dann. Deckel 400.
  - Leichen auf Gelände:
    - Kommt eine Leiche auf Wasser zur Ruhe: `state = 'float'` für 2 s, dann `'sink'` (3 s), danach entfernt. Ereignis `{type:'splash'}` beim Eintauchen.
    - Auf Lava: `'ash'` für 2 s, dann entfernt. Ereignis `{type:'terrain', kind:'ash'}` für den Asche-Fleck.
    - Lebende, die ins Wasser geschleudert werden, lösen ebenfalls `splash` aus.

- [ ] **Step 1: Failing Tests schreiben:**

```js
test('Abgeschossener Heli fällt, explodiert am Boden und verletzt Einheiten im Radius 50', ...);
test('Abstürzender Drache schleudert Einheiten im Radius 70, ohne Schaden', ...);
test('Zerstörte Mauerzelle erzeugt 3 Brocken, die niemanden verletzen und nach 6 s verschwinden', ...);
test('Leiche im Wasser: float → sink → weg, mit splash-Ereignis', ...);
test('Leiche in Lava: ash → weg', ...);
```

- [ ] **Step 2: Testlauf schlägt fehl.**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Tests grün.**
- [ ] **Step 5: Commit** mit `git commit -m "feat: crashes, wall debris, water and lava corpses"`.

### Task 11: Physik darstellen, Etappe (b) veröffentlichen

**Files:**
- Modify: `game/js/render/renderer.js`, `game/js/audio.js` (neue Geräusche `land`, `splash`, `crash`, `impact`)

**Interfaces:**
- Consumes: Felder aus Tasks 7–10.
- Darstellung:
  - Bildschirm-y = `y − z`.
  - Schatten: Skalierung `1 − min(z/200, 0.6)` und Deckkraft `0.13·(1 − min(z/200, 0.6))`, dazu 3 vorgerenderte Schattenstufen (scharf, weich, sehr weich) nach z.
  - Leichen in einem `PIXI.ParticleContainer` mit Rotation. Ruhende Leichen mit `scale.y = 0.55` und `tint 0xbfbfc4`. `fade` wird zur Deckkraft, `float` wippt, `sink` und `ash` verblassen.
  - Teile und Brocken als eigene Sprites.
  - Seelchen beim Ereignis `death` wie bisher.

- [ ] **Step 1: Implementieren.**
- [ ] **Step 2: Im Browser prüfen.** Erwartet, ohne Konsolenfehler und mit mindestens 55 fps bei der Demo:
  - Granaten schleudern Krieger, die drehend fliegen, aufschlagen und kurz liegen bleiben.
  - Ein Panzer schiebt sich durch Soldaten.
  - Ein Heli stürzt ab und explodiert.
  - Mauern zerbröseln.
  - Leichen bleiben liegen, im Wasser treiben und versinken sie.
- [ ] **Step 3: Veröffentlichen** wie in Task 6 mit `label: "Etappe b: Physik"` und den Nutzer um Test bitten.
- [ ] **Step 4: Commit** mit `git commit -m "feat: render physics; publish stage b"`.

---

## Etappe (c): Effekte, Leistung, Neukalibrierung

### Task 12: Effekte

**Files:**
- Create: `game/js/render/fx.js`
- Modify: `game/js/render/renderer.js` (Ebenen `decals`, `fx`, Wackeln)

**Interfaces:**
- Produces: `createFx(renderer) → {consume(events), update(dt), shake: number}`

Ereignis → Effekt:

| Ereignis | Effekt |
|---|---|
| `blast` | Bodenlicht: additiver Radialverlauf, Radius 3·R, Deckkraft 0,5 → 0 in 0,25 s. 14–22 Glut-Partikel additiv. 6 Rauchwolken (normal, grau, steigen mit 20 px/s, Wind +12 px/s in x, wachsen, 2,5 s). Krater-Fleck in `decals` (dunkler Ring, Deckkraft 0,1). `shake = max(shake, min(12, R/6))` |
| `shot` mit `bullet\|shell\|rocket` | Mündungsblitz additiv, 0,07 s. `shell` mit Rauchstoß |
| `rocket` unterwegs | Rauchspur (normal) |
| `fire` | Feuerpartikel additiv mit weichem Glühen |
| `land` | Staubwolke, Größe nach `impact` |
| `crash` | wie `blast`, Rauch doppelt so lang |
| `splash` | 10 blaue Tropfen und ein Ring |
| `terrain` mit `ash` | dunkler Fleck in `decals` |
| `heal` | grüne Pluszeichen (wie bisher) |
| `death` | Seelchen (wie bisher) |

Glühen ist nur additive Mischung bei Feuer, Explosion und Mündungsblitz. Keine Filter auf der ganzen Bühne. Der Partikeldeckel liegt bei 3.000, Partikel stecken in `ParticleContainer`.

- [ ] **Step 1: Implementieren.**
- [ ] **Step 2: Im Browser prüfen,** Vorher/Nachher-Screenshot einer Grenadier-gegen-Ritter-Schlacht. Erwartet:
  - Der Boden leuchtet kurz bei Explosionen.
  - Rauch steigt und verweht nach rechts.
  - Krater bleiben.
  - Kein Dauerglühen, der weiße Hintergrund bleibt weiß.
- [ ] **Step 3: Commit** mit `git commit -m "feat: effects pass"`.

### Task 12a: Drachenfeuer und brennende Einheiten (Spec #21)

**Files:**
- Modify: `game/js/combat.js` (`breath`, Brand-Zustand, Ausbreitung), `game/js/render/fx.js` (Flammenstrahl, Brand-Effekt), `game/js/render/renderer.js` (falls nötig)
- Create: `tests/fire.test.js`

**Interfaces:**
- Unit bekommt `burnT` (verbleibende Brenndauer in s) und `burnGen` (0 = direkt getroffen, 1–3 = übergesprungen).
- `ignite(world, u, gen, src)`:
  - setzt `burnT = 3` und `burnGen = gen`, nur wenn `gen ≤ 3` und die Einheit nicht schon mit einer niedrigeren Generation brennt.
  - Ereignis `{type:'ignite', x, y}`.
- Brennende Einheiten:
  - nehmen 8 Schaden/s als `'fire'` mit `src` = Verursacher. Für die Treffer-Quetschung zählt das wie Schaden über Zeit, also kein dauerhaftes Quetschen.
  - Alle 0,25 s darf eine brennende Einheit jede Nachbar-Einheit im Radius `r + v.r + 6` mit Chance `0.35 · 0.5^burnGen` anzünden (jede Fraktion, Flieger nur Flieger, Boden nur Boden). Die neue Generation ist `burnGen + 1`.
- Drachenatem zündet getroffene Einheiten mit Generation 0 an. Wasser löscht sofort.
- `burnT` und `burnGen` laufen über `world.rng()`, keine Allokation pro Schritt.
- Darstellung:
  - Der Flammenstrahl ist ein dichter, kegelförmiger, additiv leuchtender Strom mit Funken und Hitzeflimmern, nicht 4 Punkte.
  - Brennende Einheiten haben kleine Flammen auf dem Körper und einen Rauchfaden.

- [ ] **Step 1: Failing Tests schreiben** in `tests/fire.test.js`:
  - Drachenatem zündet an.
  - Brand macht Schaden über 3 s.
  - In einem dichten Bienenschwarm (60 Bienen, Radius 40) erreicht das Feuer weitere Bienen, aber höchstens Generation 3.
  - In einer verteilten Reihe (Abstand 40 px) springt es nicht über.
  - Wasser löscht.
  - Ein Seed ergibt reproduzierbare Ergebnisse.
- [ ] **Step 2: Testlauf schlägt fehl.**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Tests grün, `node --check`.** Der Controller prüft im Browser (`fx.debug()` zählt Flammen- und Brand-Partikel).
- [ ] **Step 5: Commit** mit `git commit -m "feat: dragon fire spreads and burns"`.

### Task 12b: MG und Scharfschütze legen sich hin (Spec #22)

**Files:**
- Modify: `game/js/combat.js` (Haltung, Treffer, Zielen), `game/js/render/pose.js` + `renderer.js` (liegende Pose)
- Create: `tests/prone.test.js`

**Interfaces:**
- Unit bekommt `stance` ∈ `'stand'|'down'|'prone'|'up'` und `stanceT` (Restzeit des Übergangs). Gilt für `mg` und `sniper`.
- Übergänge:
  - `'stand'` → `'down'` (0,6 s) → `'prone'`, wenn ein Ziel in Reichweite ist und kein Nahkampf-Gegner (Reichweite < 20) näher als 140 px.
  - `'prone'` → `'up'` (0,8 s) → `'stand'`, wenn ein Nahkampf-Gegner näher als 140 px kommt.
  - In `'down'` und `'up'` wird weder geschossen noch bewegt. In `'prone'` keine Bewegung.
- Liegend:
  - Eingehender Schaden durch `bullet`, `arrow`, `rocket` und `blast` ×0,5.
  - Gerade Schüsse, die nicht gezielt auf diese Einheit gehen, treffen sie nur mit 50 % Chance (`world.rng()`).
  - Streuung ×0,4, Reichweite ×1,15.
- Darstellung: Die Figur liegt flach auf dem Bauch (Pose um 90° gekippt, Waffe nach vorn), Auf- und Abtauchen sind animiert.

- [ ] **Step 1: Failing Tests schreiben:**
  - Hinlegen ohne Nahkämpfer.
  - Schaden halbiert.
  - Reichweite +15 %.
  - Während `'down'`/`'up'` kein Schuss.
  - Aufstehen, wenn ein Krieger näher als 140 px kommt.
  - Liegende Einheit bewegt sich nicht.
- [ ] **Step 2: Testlauf schlägt fehl.**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Tests grün.**
- [ ] **Step 5: Commit** mit `git commit -m "feat: prone stance for mg and sniper"`.

### Task 12c: Boss-Sticker für Panzer, Hubschrauber, Drache (Spec #23)

**Files:**
- Modify: `game/js/render/rig.js` (neue, größere Teile), `game/js/render/pose.js` (eigene Bewegungen), `game/js/render/renderer.js`
- Modify: `tests/rig.test.js`

**Interfaces:**
- Gleicher Sticker-Stil (Umriss `#2a2a33`, Glubschaugen bleiben), aber mehr Teile und mehr Details:
  - **Panzer:** Wanne mit Kettenlauf (Kettenglieder laufen beim Fahren), eigener Turm-Teil, der sich zum Ziel dreht (`turretRot`), Rohr mit Rückstoß beim Schuss, Abgaswolke beim Anfahren.
  - **Hubschrauber:** Rumpf, Heckausleger, Heckrotor, Kufen. Der Hauptrotor ist eine eigene, schnell rotierende Scheibe (`rotorRot`). Er neigt sich in Flugrichtung (bis 0,25 rad) und wirft Rotorwind-Staub, wenn er tief fliegt.
  - **Drache:** Rumpf, Hals und Kopf (Kopf zielt zum Ziel), zwei Flügel mit Flügelschlag (`wingPhase`, langsamer Takt), Schweif mit Nachschwingen.
- Kein Hüpfen: Squash & Stretch gibt es für diese drei nur minimal. Dafür haben sie die eigenen Bewegungen oben.
- `poseUnit` liefert für diese Typen zusätzlich `turretRot`, `rotorRot`, `wingPhase` und `tailSwing`.

- [ ] **Step 1: Failing Tests schreiben** in `tests/rig.test.js`:
  - Turm zeigt zum Ziel.
  - Rotor dreht sich pro Zeit.
  - Flügelphase läuft periodisch.
  - Panzer, Heli und Drache haben fast kein Squash.
- [ ] **Step 2: Testlauf schlägt fehl.**
- [ ] **Step 3: Implementieren.** Die Teile-Texturen werden im Atlas gebacken wie in Task 5.
- [ ] **Step 4: Tests grün.** Der Controller prüft die Darstellung im Browser.
- [ ] **Step 5: Commit** mit `git commit -m "feat: boss sticker rigs for tank, heli and dragon"`.

### Task 12d: Pathfinding mit Flussfeld (Spec #24)

**Files:**
- Create: `game/js/pathing.js` (rein), `tests/pathing.test.js`
- Modify: `game/js/combat.js` (`think` nutzt das Flussfeld), `game/js/sim.js` (Aktualisierung)

**Interfaces:**
- `createFlow(world) → Flow` mit grobem Raster `PATH_CELL = 20` (je 2×2 Gelände-Zellen).
- Ein Pfad-Feld gilt als Mauer, wenn ≥ 2 seiner 4 Gelände-Zellen Mauer sind.
- Kosten pro Feld:
  - frei 1
  - Wald 1,3
  - Wasser 2,5
  - Lava 12
  - Mauer unpassierbar
- `updateFlow(world, flow, dt)`:
  - Pro Fraktion entsteht ein Distanzfeld per Dijkstra mit Bucket-Queue, mehrere Quellen von allen lebenden Gegner-Bodeneinheiten dieser Fraktion.
  - Neu berechnet wird gestaffelt alle 0,5 s pro Fraktion und sofort nach einer Geländeänderung (Ereignis `terrain` oder Malen).
  - Puffer werden pro Fraktion wiederverwendet, keine Allokation pro Aktualisierung.
- `flowDir(flow, faction, x, y) → {dx, dy}|null` gibt die Richtung zum günstigsten Nachbarfeld (8 Nachbarn) zurück, `null` wenn unerreichbar.
- In `think` (nur Bodentruppen, nicht Flieger):
  - Ist die direkte Linie zum Ziel frei von Mauerzellen (Gelände-Raycast), läuft die Einheit wie bisher direkt.
  - Sonst folgt sie `flowDir`.
  - Wand einschlagen (`blk > 0.45`) nur, wenn `flowDir` null ist oder der Flussweg mehr als 2,5× so lang ist wie die Luftlinie.
- Gruppenverhalten (Reihe, Rudel, Flanke) gilt weiterhin auf offener Fläche.
- Ein Flussfeld für 2.000 Einheiten kostet pro Aktualisierung ≤ 2 ms (Bench in Task 13).

- [ ] **Step 1: Failing Tests schreiben** in `tests/pathing.test.js`:
  - Mauer mit Lücke: Krieger geht durch die Lücke und schlägt nicht ein.
  - Geschlossener Ring: Krieger schlägt die Mauer ein.
  - Lava-Streifen mit Lücke (Lavafeld): Einheiten nehmen die Lücke.
  - Fluss: kurzer Weg durch Wasser wird gewählt, wenn der Umweg > 2,5× ist.
  - Flieger ignorieren Mauern.
  - Geländeänderung löst Neuberechnung aus.
  - Keine Allokation bei wiederholtem `updateFlow` (Puffer-Identität bleibt gleich).
- [ ] **Step 2: Testlauf schlägt fehl.**
- [ ] **Step 3: Implementieren.**
- [ ] **Step 4: Tests grün.** Balance laufen lassen und Abweichungen notieren (Kalibrierung in Task 14).
- [ ] **Step 5: Commit** mit `git commit -m "feat: flow-field pathfinding around walls and hazards"`.

### Task 13: Leistung für 2.000 Einheiten

**Files:**
- Create: `tools/bench.mjs`
- Modify: `game/js/main.js` (`?bench=2000`), `game/js/sim.js`/`combat.js` nach Bedarf

**Interfaces:**
- Produces:
  - `node tools/bench.mjs [units=2000] [scenario=mixed|blastcrowd]` gibt `avg step ms` und `p95 step ms` über 600 Schritte aus.
  - `game/index.html?bench=2000` startet die Szene `mixed` mit Anzeige von fps, Sim-ms und Render-ms.
  - Szenen:
    - `mixed`: 2.000 Einheiten in 4 Teams, alle Typen außer Drache gemischt, Mörser und Grenadiere dabei.
    - `blastcrowd`: 500 Bienen im Kreis mit Radius 80 und 20 gleichzeitige Mörsereinschläge.

- [ ] **Step 1: Bench schreiben und messen.** Ziel:
  - `mixed`: avg ≤ 6 ms, p95 ≤ 9 ms.
  - `blastcrowd`: p95 ≤ 10 ms (Review Focus 5).
- [ ] **Step 2: Optimieren, falls das Ziel verfehlt wird.** In dieser Reihenfolge, nach jedem Hebel neu messen:
  1. KI-Entscheidung (`think` ohne Bewegung) nur jeden 2. Schritt für Einheiten ohne Gegner im Umkreis von 300 px.
  2. `world.events` und Fx-Partikel deckeln (`blast` erzeugt höchstens 64 Ereignisse pro Schritt).
  3. Hash-Zellgröße 40 → 32 testen und die bessere behalten.
- [ ] **Step 3: Im Browser prüfen** mit `?bench=2000`. Die Anzeige muss mindestens 55 fps zeigen. Ist die Render-Zeit zu hoch: Fx-Detailstufe automatisch senken, wenn der Frame länger als 20 ms dauert (Partikel pro Ereignis ×0,5, Rauch aus).
- [ ] **Step 4: Commit** mit `git commit -m "perf: 2000-unit budget with bench"`.

### Task 14: Neukalibrierung, Etappe (c) veröffentlichen

**Files:**
- Modify: `game/js/data.js` (Werte, Missionen, Hinweistexte), `tools/plans.mjs` (`COUNTERS`)

**Interfaces:**
- `COUNTERS` (a schlägt b bei gleichen Punkten, mindestens 3/4 Siege, 60 Punkte, bei modernen Einheiten 90):
  - ritter > krieger, schuetze, reiter
  - biene > ritter, schuetze
  - krieger > biene
  - wolf > schuetze, grenadier
  - reiter > schuetze, grenadier
  - magier > krieger
  - grenadier > krieger
  - panzerfaust > panzer, heli
  - soldat > heli
  - panzer > krieger, soldat
  - mg > biene, krieger
  - sniper > ritter
- Missionsregeln (je 8 Läufe):
  - Smart-Plan mit Kosten ≤ par gewinnt ≥ 6/8.
  - Spam-Plan mit vollem Budget verliert ≥ 6/8 (M2, M4, M5, M7, M8, M9).
  - M1-Spam gewinnt (Einstieg).

- [ ] **Step 1: Ist-Stand messen** mit `node tools/balance.mjs duels 4` und `node tools/balance.mjs missions 8` und die Ausgabe sichern.
- [ ] **Step 2: Werte anpassen,** bis beide Befehle mit Exitcode 0 enden.
  - Erst Einheitenwerte (`hp`, `dmg`, `cd`, `cost`, `mass`), dann Missions-`budget`/`par`, zuletzt Gegnerarmeen.
  - Hinweistexte anpassen, wenn sich ein Konter ändert.
- [ ] **Step 3: Alle Tests grün** mit `npm test`.
- [ ] **Step 4: Im Browser** einmal jede Mission mit ihrem Smart-Plan spielen. Erwartet: Sieg und Sterne werden gespeichert.
- [ ] **Step 5: Veröffentlichen** wie in Task 6 mit `label: "Etappe c: Effekte + Balance"`. Danach `.claude/launch.json` und Testserver entfernen.
- [ ] **Step 6: Commit** mit `git commit -m "balance: recalibrate units and missions; publish stage c"`.
