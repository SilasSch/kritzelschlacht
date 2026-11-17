# Römer und verblassender Boden – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Neue Einheit Römer (Blockformation im Gleichschritt, Speerwurf, Schilde nur in Formation), Bodenmüll, der mit der Zeit verblasst, Rückzug und Erholung für alle Einheiten und geduldige Scharfschützen.

**Architecture:** Die Formationslogik kommt in ein neues reines Modul `game/js/formation.js`. sim.step ruft es einmal je Schritt vor `think` auf. Es setzt Felder auf den Römern, die `combat.think` liest. Schildblock und Speer sitzen in den bestehenden Trefferpfaden von combat.js. Das Verblassen besteht aus drei Teilen:
- Leichen und Trümmer altern in physics.js.
- Krater und Flecken liegen in zwei Decal-Generationen: Die alte Leinwand blendet aus, während auf die neue gemalt wird.
- Das Altern der Decals sitzt in einem reinen Helfer in fxcore.js; fx.js zeigt es an.

**Tech Stack:** Vanilla ES modules, PixiJS 7.4.2 (cdnjs), Node 24 `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-15-engine-overhaul-design.md`, Nachtrag 2 (#25, #26).

## Global Constraints

- Logikmodule (world, physics, combat, sim, pathing, muzzle, bench, formation, fxcore-Logik) sind rein und deterministisch. Sie verwenden kein DOM, kein PIXI und kein Math.random, sondern nur `world.rng()`.
- Gleiche Einheitenform bei `spawn`: Jedes neue Unit-Feld wird in `world.spawn` mit einer Zahl, einem Boolean oder null angelegt. Der Test „Einheiten behalten ihre Form“ (tests/bench.test.js) muss grün bleiben.
- Stil laut Spez. #2: runde Sticker-Figuren mit Glubschaugen, Umrisse `#2a2a33`, Teamfarbe am Körper.
- Leistung laut Spez. #4: 2.000 Einheiten mit 60 fps. `node tools/bench.mjs mixed` darf nicht spürbar langsamer werden (Durchschnitt < 2,0 ms).
- Balance: `node tools/balance.mjs duels 4` und `node tools/balance.mjs missions 8` enden mit Exitcode 0, an allen 6 Formen.
- Deutsche Texte. Tastenkürzel 1–9 je Kategorie bleiben gültig (Armee hat dann 7 Einheiten).
- `kritzelschlacht.html` wird nicht verändert. Kein npx, keine neuen Abhängigkeiten.

## Review Focus

1. **Gemischte Gruppen:** Römer unter anderen Einheiten oder nur 2–3 Römer bilden keinen Block mit Schildbonus (MIN 4). Sie verhalten sich dann wie normale Nahkämpfer. Test in Task 2.
2. **Block an einer Mauer oder an Lava:** Der Block darf nicht festhängen. Er folgt dem Flussfeld der Fraktion. Kommt er 3 s nicht voran, löst er sich auf, und jeder läuft einzeln. Test in Task 2.
3. **Teamkampf mit 4 Teams:** Blöcke bilden sich nur je Fraktion (`factionOf`). Römer zweier Teams mischen sich nie in einem Block. Test in Task 2.
4. **Pause, Rückgängig, neue Mission:** Formationen und Decal-Generationen werden zurückgesetzt. `world.formations` wird von `clearBattle` geleert, und `fx.clear()` leert beide Leinwände. Test in Task 2 (clearBattle) und Task 1 (Helfer reset).
5. **Speer auf Verbündete:** Der Speer ist ein Bogenwurf und fliegt über die eigenen Reihen. Er trifft wie ein Pfeil nur am Landepunkt (Friendly Fire möglich, Spez. #5). Ein Römer wirft nur, wenn das Ziel 90–160 px entfernt ist, nie im Nahkampf. Test in Task 3.

---

### Task 1: Bodenmüll verblasst (Spez. #26)

**Files:**
- Modify: `game/js/physics.js` (Leichen-Altern, `DEBRIS_REST`)
- Modify: `game/js/render/fxcore.js` (reiner Helfer `createDecalAger`)
- Modify: `game/js/render/fx.js` (zwei Decal-Leinwände)
- Test: `tests/corpses.test.js`, `tests/fx.test.js`

**Interfaces:**
- Produces: `CORPSE_REST = 29` (s im Zustand rest, float oder ash, danach `fade = CORPSE_FADE`). Die Leiche verschwindet also nach etwa 30 s Liegen. `DEBRIS_REST = 9` (vorher 6).
- Produces: `createDecalAger(gen = 30)` in fxcore.js mit:
  - `tick(dt)`: gibt `true` zurück, wenn die Generationen getauscht werden müssen.
  - `oldAlpha()`: Deckkraft der alten Generation, linear 1→0 über `gen` Sekunden seit dem Tausch.
  - `reset()`.
- Ein Fleck lebt also 30–60 s und blendet in seiner zweiten Hälfte aus.

- [ ] **Step 1: Failing tests**
  - corpses.test.js „Leichen verblassen nach CORPSE_REST“: Eine Leiche liegt in `rest`, nach `CORPSE_REST + CORPSE_FADE + 0.1` s Schritten ist `world.corpses.length === 0`. Nach `CORPSE_REST - 1` s ist sie noch da, mit `fade === 0`. Dasselbe für `float` (Wasser) und `ash` (Lava).
  - fx.test.js „Decal-Generationen“: `const a = createDecalAger(30)`. `tick(29)` liefert false. `tick(2)` liefert true, `oldAlpha() === 1`. Nach `tick(15)` ist `oldAlpha()` ≈ .5, nach `tick(15)` liefert es true (nächster Tausch), und `reset()` setzt alles auf den Anfang.
- [ ] **Step 2:** `node --test tests/corpses.test.js tests/fx.test.js` → FAIL (CORPSE_REST bzw. createDecalAger fehlen).
- [ ] **Step 3: Physik**
  - In `stepCorpses` setzt eine liegende Leiche (`rest`, `float` nach dem Treiben, `ash`) `c.fade = CORPSE_FADE`, sobald ihr `t >= CORPSE_REST` ist.
  - Die Zustände `sink` und `ash` behalten ihre eigenen Abläufe. Das Altern zählt erst ab dem endgültigen Liegen.
  - `DEBRIS_REST = 9`.
- [ ] **Step 4: Decals**
  - fx.js führt zwei Offscreen-Leinwände und zwei Sprites, `cur` und `old`. Gemalt wird nur auf `cur`.
  - Wenn `ager.tick(dt)` true liefert: Inhalt von `old` löschen, die Rollen tauschen und `old` neu hochladen.
  - `oldSprite.alpha = ager.oldAlpha()`.
  - `clear()` und `resize()` leeren beide Leinwände und rufen `ager.reset()` auf.
  - Die Upload-Drossel `DECAL_UPLOAD` gilt weiter für `cur`.
  - Der Debug-Zähler `decals` bleibt.
- [ ] **Step 5:** `node --test tests/*.test.js` → alle grün.
- [ ] **Step 6: Commit** `feat: ground clutter fades (corpses ~30 s, debris ~10 s, decals 30-60 s)`

### Task 2: Römer – Daten und Blockformation (Spez. #25)

**Files:**
- Create: `game/js/formation.js`
- Modify: `game/js/data.js` (UNITS.roemer, PLURAL, TINT)
- Modify: `game/js/world.js` (spawn-Felder, clearBattle)
- Modify: `game/js/sim.js` (Aufruf in step)
- Modify: `game/js/combat.js` (think liest die Formation)
- Modify: `game/js/bench.js` (Römer in der Szene mixed)
- Test: `tests/formation.test.js`

**Interfaces:**
- Produces in data.js:
  - Startwerte (Task 5 kalibriert sie): `roemer: {n:'Römer', cat:'armee', col:'#c94a3a', r:10, hp:80, dmg:13, range:3, speed:46, cd:.9, cost:3, mass:1.4, pilum:16, d:'Marschiert als Block im Gleichschritt und wirft vor dem Angriff Speere. In Formation halten die Schilde Pfeile und Kugeln von vorn ab.'}`.
  - `PLURAL.roemer = 'Römer'`; `'roemer'` kommt in `TINT`.
- Produces in formation.js: `export const FORM = { MIN: 4, LINK: 46, SPACING: 22, ENGAGE: 90, PILUM_MIN: 90, PILUM_MAX: 160, REFORM: .5, STUCK: 3 }`.
- Produces: `export function updateFormations(world, dt)`.
  - Aufruf in `sim.step` direkt nach `updateFlow`.
  - Blöcke entstehen alle `FORM.REFORM` s neu: Römer derselben Fraktion, deren Abstand verkettet ≤ `LINK` ist, bilden eine Gruppe, die Suche läuft über den Hash.
  - Nur Gruppen mit ≥ MIN Römern im Zustand `ok` werden Blöcke.
- Produces: `world.formations` als Array von `{ id, faction, n, cx, cy, ax, ay, speed, state: 'march' | 'charge', stuckT }`:
  - `(ax, ay)`: Einheitsvektor zur nächsten feindlichen Einheit vom Blockzentrum aus.
  - `speed`: Minimum der Tempi.
  - `state` wird `'charge'`, sobald ein Feind ≤ ENGAGE px vor der Blockfront ist, oder wenn `stuckT ≥ STUCK`. Danach bleibt der Block aufgelöst, bis kein Feind mehr in ENGAGE·2 ist.
- Produces auf jedem Römer (in spawn angelegt):
  - `form: 0` (Block-id oder 0) und `formOn: false` (Block mit ≥ MIN Mitgliedern im Zustand march);
  - `slotX: 0`, `slotY: 0` (Zielpunkt in px);
  - `formAx: 0`, `formAy: 0` (Blickrichtung des Blocks);
  - `pilum: 1` (Speere übrig). Für Nicht-Römer bleiben die Felder auf ihren Startwerten.
- Slots:
  - Spalten `cols = clamp(round(sqrt(n·2.5)), 2, 10)`, Reihenabstand und Spaltenabstand je `SPACING`, die erste Reihe vorn in Richtung (ax, ay).
  - Zuordnung stabil: Mitglieder nach Tiefe entlang der Blickrichtung sortieren, dann in jeder Reihe nach Seitenlage.
  - Fällt ein Mitglied aus, rücken die Hinteren beim nächsten REFORM nach.
- Bewegung des Blocks: Das Zentrum folgt dem Flussfeld der Fraktion (pathing wie bei Bodentruppen) mit `speed`. Der Slot ist Zentrum plus gedrehter Versatz.
- Consumes in combat.think: Bei einem Römer mit `formOn` und Blockzustand `march` steuert die Einheit auf `(slotX, slotY)` mit höchstens `speed · 1.25`, um aufzuholen. Sie sucht kein eigenes Ziel und schlägt nicht zu. Bei `charge` oder ohne Block verhält sie sich wie ein Krieger.
- `clearBattle` leert `world.formations`.

- [ ] **Step 1: Failing tests** in `tests/formation.test.js`:
  - „Block ab 4 Römern“: 6 Römer blau eng beieinander, 1 Krieger rot 600 px entfernt. Nach 0,6 s haben alle 6 `formOn === true` und dieselbe `form`-id. Mit 3 Römern ist `formOn` überall false.
  - „Gleichschritt“: 12 Römer marschieren 2 s. Die Standardabweichung der Abstände zum jeweiligen Slot ist < 6 px, und die Tempi aller Mitglieder liegen innerhalb von 10 % zueinander.
  - „Lücke schließt“: Aus einem Block von 12 wird ein Römer der ersten Reihe getötet. Nach `REFORM + 1` s ist die erste Reihe wieder voll belegt (cols Römer mit minimaler Tiefe).
  - „Auflösen vor dem Feind“: Ein Feind kommt näher als ENGAGE. Danach ist `state === 'charge'`, und die Römer haben ein Ziel `tg`.
  - „Fraktionen getrennt“: Im Teamkampf stehen 4 Römer blau und 4 Römer rot nebeneinander. Es entstehen zwei Blöcke, keiner hat gemischte Mitglieder.
  - „Mauer: kein Festhängen“: Ein Block steht vor einer durchgehenden Mauer ohne Umweg. Nach STUCK + .5 s ist der Block aufgelöst.
  - „clearBattle leert Formationen“.
  - „Form bleibt gleich“: bestehender Test in bench.test.js, mit Römern.
- [ ] **Step 2:** `node --test tests/formation.test.js` → FAIL.
- [ ] **Step 3:** Daten in data.js, Felder in world.spawn, formation.js, Aufruf in sim.step, Pfad in think.
- [ ] **Step 4:** `node --test tests/*.test.js` → alle grün. `node tools/bench.mjs mixed`: Durchschnitt < 2,0 ms (bench.js nimmt Römer in mixed auf).
- [ ] **Step 5: Commit** `feat: Roemer march in a block formation`

### Task 3: Römer – Speerwurf und Schilde (Spez. #25)

**Files:**
- Modify: `game/js/combat.js` (PROJECTILES.pilum, Wurf, Treffer, Schildblock)
- Modify: `game/js/formation.js` (reiner Test `shieldBlocks`)
- Test: `tests/formation.test.js`, `tests/projectiles.test.js`

**Interfaces:**
- Consumes: `formOn`, `formAx/formAy`, `pilum` aus Task 2.
- Produces:
  - `PROJECTILES.pilum = { arc: true, speed: 430 }`. Der Speer landet wie ein Pfeil (`landArc`, gleicher Zweig wie `'arrow'`) mit Schaden `UNITS.roemer.pilum`.
  - Der Wurf in think: Ein Römer mit `formOn`, `pilum === 1` und Ziel in `[PILUM_MIN, PILUM_MAX]` px wirft einmal, dann `pilum = 0`. Die erste Reihe wirft zuerst, die Reihe dahinter 0,15 s später (Versatz nach Tiefe).
- Produces: `export const SHIELD_KINDS = new Set(['arrow', 'bullet', 'pilum'])`, `SHIELD_MUL = .1`, `SHIELD_COS = .5` (±60°).
- Produces: `export function shieldBlocks(v, kind, dx, dy)`. Dabei ist (dx, dy) die Flugrichtung des Geschosses. Die Funktion liefert true, wenn alle diese Bedingungen gelten:
  - `v.type === 'roemer'` und `v.formOn`;
  - `SHIELD_KINDS.has(kind)`;
  - `-(dx·formAx + dy·formAy)/|d| ≥ SHIELD_COS`.
- Treffer von Pfeil, Kugel und Speer: Bei `shieldBlocks` wird der Schaden mit SHIELD_MUL multipliziert, und statt `hit` geht `{ type: 'block', x, y, kind, a }` an world.events, wobei a der Abprallwinkel ist.
- Explosionen, Feuerball (`fire`), Rakete, Brand, Nahkampf und Treffer aus mehr als 60° zur Seite: kein Schildblock.

- [ ] **Step 1: Failing tests**
  - „shieldBlocks“:
    - true für Pfeil, Kugel und Speer von vorn;
    - false von hinten und von 90° seitlich;
    - false bei `formOn === false`;
    - false für 'fire', 'rocket' und 'blast'.
  - „Block hält Pfeile ab“: 10 Römer im Block gegen 10 Schützen. Nach 4 s Beschuss von vorn ist der mittlere Schaden je Römer ≤ 15 % des Schadens ohne Formation (gleiche Seeds, 3 Römer einzeln).
  - „Speer einmal“: Ein Römer im Block wirft genau einen Speer, wenn ein Feind 120 px vor ihm steht. Das bedeutet ein `shot`-Event mit `kind 'pilum'`, und danach ist `pilum === 0`. Bei 60 px wirft er nicht.
  - „Speer über eigene Reihen“: Ein Speer aus der dritten Reihe trifft bei Ziel 140 px keinen eigenen Römer der ersten Reihe.
- [ ] **Step 2:** `node --test tests/formation.test.js tests/projectiles.test.js` → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `node --test tests/*.test.js` → alle grün.
- [ ] **Step 5: Commit** `feat: Roemer pila volley and shields that only work in formation`

### Task 4: Römer – Aussehen und Effekte

**Files:**
- Modify: `game/js/render/rig.js` (Rig `roemer`)
- Modify: `game/js/render/pose.js` (Gleichschritt, Schildhaltung)
- Modify: `game/js/render/renderer.js` (Speer als Projektil)
- Modify: `game/js/render/fxcore.js` (`block`-Funkeln)
- Modify: `game/js/audio.js` (`block` → vorhandenes Geräusch)
- Modify: `game/js/main.js` (Debug-Szene `roemer`: 24 Römer blau gegen 20 Schützen und 10 Krieger rot)
- Test: `tests/rig.test.js`, `tests/fx.test.js`

**Interfaces:**
- Consumes: `formOn`, `formAx/formAy` (Schild zeigt in Blickrichtung), Event `block`, Projektil `kind 'pilum'`.
- Rig `roemer` im Sticker-Stil:
  - großer rechteckiger, leicht gewölbter Schild (Scutum) in Teamfarbe mit Buckel und hellem Rand;
  - Helm mit rotem Querkamm;
  - Kurzschwert;
  - Umriss `#2a2a33`.
- Pose:
  - Im Block wippen alle im gleichen Takt, abgeleitet von `world.time` und der Block-id, nicht von der eigenen Phase.
  - Der Schild hängt vorn vor dem Körper.
  - Beim Wurf hebt sich der Arm kurz.
  - Bei `charge` gilt die normale Laufpose mit dem Schild seitlich.
- Speer im Flug: ein dünner Schaft mit Spitze, der sich entlang der Flugbahn neigt (wie der Pfeil, aber länger).
- `block`: kleiner Funke plus Querstrich am Schild, abprallender Splitter in Richtung `a`, Budget-Typ `misc`. Ton: das vorhandene `'hit'`-Geräusch, leiser oder höher, falls audio das kann; sonst `'hit'`.

- [ ] **Step 1: Failing tests**
  - rig.test.js „roemer hat Schild, Helm, Schwert“: Teile vorhanden, Teamfarbe am Schild.
  - fx.test.js „block erzeugt Funken innerhalb des misc-Budgets“.
- [ ] **Step 2:** `node --test tests/rig.test.js tests/fx.test.js` → FAIL.
- [ ] **Step 3:** Implementieren. Ein Kontaktbogen (PNG) mit Römer in allen 4 Teamfarben, im Block, beim Wurf und bei charge kommt nach `.superpowers/` (nicht ins Repo). Der Controller prüft ihn.
- [ ] **Step 4:** `node --test tests/*.test.js` → alle grün.
- [ ] **Step 5: Commit** `feat: Roemer sticker rig, lockstep pose, pilum and shield-block fx`

### Task 5: Rückzug und Erholung (Spez. #27)

**Files:**
- Create: `game/js/morale.js` (rein)
- Modify: `game/js/world.js` (spawn-Felder), `game/js/combat.js` (think, Sanitäter-Zielwahl), `game/js/formation.js` (Fliehende verlassen den Block)
- Modify: `game/js/render/pose.js`, `game/js/render/rig.js` oder `renderer.js` (Angstaugen, Schweißtropfen)
- Test: `tests/morale.test.js`

**Interfaces:**
- Produces in morale.js:
  - `export const MORALE = { FLEE: .25, FLEE_FORM: .15, BACK: .6, SAFE_R: 200, SAFE_T: 2, REGEN: .05, SPEED: 1.2, CORNER_T: 1.5 }`. REGEN ist der Anteil der vollen LP pro Sekunde.
  - `export function updateMorale(world, u, dt)`. Liefert true, solange die Einheit flieht. think ruft sie zuerst auf und steuert bei true die Flucht statt des normalen Verhaltens.
- Unit-Felder (in spawn anlegen): `flee: false`, `safeT: 0`, `cornerT: 0`.
- Regeln:
  - Flucht beginnt bei `hp ≤ FLEE · T.hp`. Römer mit `formOn` fliehen erst bei FLEE_FORM; ein fliehender Römer verlässt den Block.
  - Fluchtrichtung: weg vom nächsten Feind, gemischt mit der Richtung zum Schwerpunkt der eigenen Fraktion. Sie meidet Lava und Mauern wie bei Bodentruppen. Flieger ignorieren das Gelände.
  - Tempo × SPEED. Keine Angriffe, außer wenn ein Feind seit CORNER_T in Nahkampfreichweite klebt (eingeholt oder in die Ecke gedrängt): dann schlägt sie zurück.
  - Erholung: ist SAFE_T s kein Feind innerhalb SAFE_R, steigen die LP um `REGEN · T.hp` pro Sekunde. Ab `BACK · T.hp` endet die Flucht.
  - Sanitäter wählen fliehende Verbündete vor allen anderen.
  - Liegende Einheiten (#22) stehen erst auf und fliehen dann.
  - Gilt für alle Typen, auch Panzer, Hubschrauber und Drache.
- Aussehen: Wenn `flee` gesetzt ist, zeigt der Sticker Angstaugen (kleine Pupillen, hochgezogene Lider) und einen Schweißtropfen.

- [ ] **Step 1: Failing tests** in `tests/morale.test.js`:
  - „Flucht ab 25 %“: Ein Krieger mit 14/60 LP und ein Feind in 30 px. Nach 0,5 s ist der Abstand gewachsen, `flee === true`, und er hat nicht zugeschlagen (keine `hit`-Events von ihm).
  - „Erholung“: Ein Fliehender ohne Feind in 200 px. Nach SAFE_T + 4 s sind seine LP gestiegen; bei ≥ 60 % ist `flee === false`.
  - „Eingeholt wehrt sich“: Ein schnellerer Feind klebt an ihm. Nach CORNER_T + .5 s gibt es mindestens einen Treffer von ihm.
  - „Römer im Block halten länger“: Bei 20 % LP und `formOn` flieht er nicht, bei 14 % schon.
  - „Keine Flucht in Lava“: Lava hinter dem Fliehenden. Er betritt keine Lava-Zelle.
  - „Sanitäter bevorzugt Fliehende“.
  - „Panzer flieht auch“.
- [ ] **Step 2:** `node --test tests/morale.test.js` → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `node --test tests/*.test.js` → alle grün. `node tools/bench.mjs mixed` < 2,0 ms im Durchschnitt.
- [ ] **Step 5: Commit** `feat: units retreat at low health and recover`

### Task 6: Geduldige Scharfschützen (Spez. #28)

**Files:**
- Modify: `game/js/combat.js` (think für `sniper`)
- Test: `tests/prone.test.js` oder neu `tests/sniper.test.js`

**Interfaces:**
- Produces in combat.js: `export const SNIPER = { HOLD: .95, KEEP: .6, WAIT: 3, BEHIND: 40 }`.
- Regeln für den Typ `sniper`:
  - Ist ein Ziel in Reichweite, bewegt er sich nicht weiter vor. Er hält bei höchstens `HOLD · range` zum Ziel.
  - Ohne Ziel in Reichweite wartet er WAIT s und rückt dann vor, aber nie weiter als bis BEHIND px hinter die eigene Frontlinie. Die Frontlinie ist die größte Projektion eigener Bodentruppen (ohne Scharfschützen) auf die Richtung zum feindlichen Schwerpunkt.
  - Ist ein Feind näher als `KEEP · range`, weicht er zurück, wie das bestehende Ausweichen (KITE).
  - Hinlegen (#22) und Rückzug (#27) bleiben vorrangig.

- [ ] **Step 1: Failing tests**
  - „Hält Abstand zum Ziel“: Ein Scharfschütze und ein stehendes Ziel in 300 px (range 380). Nach 3 s hat er sich weniger als 10 px bewegt.
  - „Wartet ohne Ziel“: Der Feind ist 600 px entfernt. In den ersten 2,5 s bewegt er sich weniger als 5 px, danach rückt er vor.
  - „Bleibt hinter der Front“: 10 eigene Krieger stehen bei x = 500, der Feind bei x = 1200. Der Scharfschütze überschreitet x = 460 nicht.
  - „Weicht zurück“: Ein Feind auf 0,5 · range. Der Abstand wächst.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `node --test tests/*.test.js` → alle grün.
- [ ] **Step 5: Commit** `feat: snipers hold back and wait`

### Task 7: Balance, Hinweise, Prüfung im Browser

**Files:**
- Modify: `tools/plans.mjs` (COUNTERS)
- Modify: `game/js/data.js` (Werte, Hinweistexte)

**Interfaces:**
- COUNTERS bekommt neue Einträge bei 60 Punkten, jeweils a schlägt b mit mindestens 3/4:
  - `roemer > schuetze`
  - `roemer > krieger`
  - `grenadier > roemer`
  - `reiter > roemer`
  - `magier > roemer`
- Missionen bleiben inhaltlich gleich. Römer sind dort nur verfügbar, wo die Kategorie Armee erlaubt ist.

- [ ] **Step 1:** `node tools/balance.mjs duels 4` und `node tools/balance.mjs missions 8` → Ist-Stand sichern.
- [ ] **Step 2:** Römerwerte anpassen (hp, dmg, cd, cost, speed, pilum), bis beide Befehle an allen 6 Formen mit 0 enden. Bestehende Einheiten nur, wenn ein Römer-Konter anders nicht hält. Begründung je Änderung im Bericht.
- [ ] **Step 3:** Prüfen, ob sich durch die Römer der Spam- oder Smart-Ausgang einer Mission ändert. Die Pläne verwenden keine Römer, also sollte sich nichts ändern. Falls doch: Grund im Bericht.
- [ ] **Step 4:** `node --test tests/*.test.js` → alle grün. `node tools/bench.mjs mixed` < 2,0 ms im Durchschnitt.
- [ ] **Step 5: Commit** `balance: Roemer counters`
- [ ] **Step 6 (Controller):** Browser-Prüfung mit der Szene `roemer` und einer Rückzugsszene unter `?debug` (aus Task 4) und ein Leistungslauf. Veröffentlicht wird nach Task 8.


### Task 8: Charakterkarten und Lexikon (Spez. #29)

**Files:**
- Create: `game/js/cards.js` (reine Kartendaten aus UNITS, COUNTERS und Fähigkeitstexten)
- Modify: `game/js/data.js` (je Einheit optional `abil: [{n, d}]`, kurze deutsche Texte für Besonderheiten wie Schildwall, Hinlegen, Speersalve oder Rückzug)
- Modify: `game/js/ui.js`, `game/index.html` (Karte bei Auswahl oder Hover, Lexikon-Knopf und -Ansicht)
- Modify: `tools/plans.mjs` → `COUNTERS` nach `game/js/data.js` verschieben (oder dort re-exportieren), damit das Spiel sie lesen kann
- Test: `tests/cards.test.js`

**Interfaces:**
- Produces: `export function unitCard(type)` in cards.js. Liefert `{ type, name, cat, desc, stats: { hp, dmg, speed, range, cost } (je 0..1 relativ zum Maximum aller Einheiten), raw: {…}, abil: [{n, d}], strong: [type], weak: [type] }`. strong und weak kommen aus COUNTERS.
- Porträt: das Sticker-Bild aus dem Rig-Atlas des Renderers. Es wird nicht neu gezeichnet.
- Aussehen: im Stil der bestehenden Oberfläche (weiße Pillen, Nunito, Luckiest Guy für den Namen, Umrisse `#2a2a33`), Akzent in Teamfarbe.
- Die Karte erscheint beim Hover über eine Einheit in der Leiste und bei Auswahl, ohne das Malen zu stören. Das Lexikon ist ein Overlay mit allen Karten nach Kategorie und schließt mit Esc.
- Am Laptop lesbar (1280×800). Kein Layout-Sprung in der Leiste.

- [ ] **Step 1: Failing tests** in `tests/cards.test.js`:
  - „jede Einheit hat eine Karte“: für alle Schlüssel in UNITS ein Name, Werte in 0..1 und `raw.hp === UNITS[t].hp`.
  - „Konter“: `unitCard('ritter').strong` enthält `'krieger'`, `unitCard('ritter').weak` enthält `'biene'`.
  - „Fähigkeiten“: `unitCard('roemer').abil` nennt Speersalve und Schilde.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `node --test tests/*.test.js` → alle grün. Ein Screenshot von Karte und Lexikon kommt nach `.superpowers/`, der Controller prüft ihn.
- [ ] **Step 5: Commit** `feat: character cards and unit lexicon`
- [ ] **Step 6 (Controller):** Browser-Prüfung, danach Veröffentlichung unter demselben Link.
