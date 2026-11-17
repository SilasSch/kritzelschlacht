# Fähigkeiten, Magier, Vampire und neue Einheiten – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:**
- Fähigkeiten für die Einheiten, bei denen es passt.
- Zauberbuch und Meteor für die Magier.
- Vampir mit Ghulen.
- 5 neue Tiere und 5 neue Kreaturen.
- Alles kalibriert und auf den Charakterkarten sichtbar.

**Architecture:** Ein neues reines Modul `game/js/abilities.js` enthält eine Tabelle je Einheitentyp mit Abklingzeit, Auslösebedingung, Start, Ablauf und Texten für die Karten. Es führt außerdem den Vorrang der Zustände:

tot > betäubt/fliegend > Schreck > Rückzug > laufende Fähigkeit > normal.

`combat.think` fragt das Modul nach dem Rückzug-Check ab. Neue Einheiten sind Einträge in `UNITS`. Ihr Verhalten steht in `abilities.js` oder in einem schmalen `case` in think, ihr Aussehen in rig.js und pose.js, ihre Effekte in fxcore.js.

**Tech Stack:** Vanilla ES modules, PixiJS 7.4.2 (cdnjs), Node 24 `node --test`.

**Spec:** `docs/superpowers/specs/2026-11-15-engine-overhaul-design.md`, Nachtrag 3 (#30–#34) mit den „Festlegungen nach der Prüfung des Entwurfs“.

**Voraussetzung:** Der Plan `2026-11-17-roemer-und-verblassen.md` ist fertig. Daraus werden verwendet:
- `morale.js` mit `updateMorale` und dem Fluchtsteuern (#27);
- `cards.js` mit `unitCard` und `abil`-Texten (#29);
- `formation.js`.

## Vorgaben aus der Abschlussprüfung der Römer-Runde (verbindlich, vor Task 1 gelesen)

1. **Ein Prädikat für Fliehen und Schreck:**
   - `export const isFleeing = u => u.flee || u.fearT > 0` in morale.js.
   - Alle bisherigen Abfragen von `u.flee` nutzen es: Blockmitgliedschaft und Marsch (formation.js), Schwerpunkte, doppelte Zieldistanz (nearestEnemy), Sanitäter-Vorrang, `att`-Zählung in sim.js und die Angstaugen in pose.js.
   - `updateMorale` lässt den Schreck in Ruhe: Es beendet `fearT` nicht über die 60-%-Regel.
   - Schreck läuft über `combat.retreat` mit einem Merkmal „ohne Erholung“, damit Aufstehen aus dem Liegen und Gegenwehr in der Ecke auch beim Schreck gelten.
   - Schreck und Froschverwandlung setzen `formOn` und `formFree` zurück und nehmen die Einheit aus ihrem Block.
   - Das gehört zu Task 1 und wird dort getestet: Ein erschreckter Römer verliert den Schildschutz, und ein erschrecktes liegendes MG steht erst auf.
2. **Fähigkeitstexte an genau einer Stelle:**
   - Name und Text der Fähigkeiten bleiben in `data.js` (`ABIL` → `UNITS[t].abil`); die Karten lesen nur dort.
   - `abilities.js` enthält nur das Verhalten. Seine Tabelle heißt `ABILITY` (nicht `ABIL`) und hat keine `name`- oder `desc`-Felder.
   - Neue Fähigkeiten und Einheiten bekommen ihre Texte in data.js.
3. **Nicht malbare Einheiten (`paint: false`):** Gefiltert wird in main.js `catKeys` (Leiste und Tasten 1–9), in main.js `randomBattle`, in bench.js und in ui.js. Im Lexikon erscheinen sie mit dem Hinweis, wie sie entstehen (Task 4 und 6).
4. **Leistungsszene festhalten:** Die Szene `mixed` in bench.js bekommt keine neuen Einheitentypen. Die Grenze „< 2,0 ms“ bleibt damit vergleichbar. Neue Typen kommen in eine eigene Szene `mixed2`, die zusätzlich gemessen und berichtet wird.
5. **Brandpfeile und Schilde:** `firearrow` steht in `SHIELD_KINDS`. Ein abgeblockter Brandpfeil zündet nicht an.
6. **Spam-Prüfung:** `newspam` (Task 7) prüft alle malbaren Einheiten, nicht nur die neuen. Dazu kommt die Römer-Prüfung aus der Korrekturrunde.
7. **Kampfdauer:** Task 7 prüft auch, wie lange Schlachten dauern. Seit dem Rückzug brauchen manche Smart-Pläne doppelt so lange. Im Blick behalten wird REGEN (zum Beispiel .03).

## Global Constraints

- Logikmodule bleiben rein und deterministisch: kein DOM, kein PIXI, kein Math.random, nur `world.rng()`. Das gilt für world, physics, combat, sim, pathing, muzzle, bench, formation, morale, abilities und die Logik in fxcore.
- Gleiche Einheitenform bei `spawn`: Jedes neue Feld wird für alle Einheiten mit Zahl, Boolean oder null angelegt (bench.test.js „Einheiten behalten ihre Form“).
- Stil (#2): Sticker mit Glubschaugen, Umrisse `#2a2a33`, Teamfarbe. Der Elefant ist ein Boss-Sticker wie in #23.
- Leistung (#4): `node tools/bench.mjs mixed` bleibt im Durchschnitt unter 2,0 ms. Die Browser-Messung mit 2.000 Einheiten wird nicht spürbar langsamer.
- Friendly Fire (#5) und die Festlegung 2 aus Nachtrag 3 gelten.
- Keine neuen Geräusche (#18). Nur vorhandene Töne aus audio.js.
- Tastenkürzel 1–9: Mythisch hat am Ende 9 malbare Einheiten, Tiere 8. Ghul und Frosch sind nicht malbar.
- Balance an allen 6 Fensterformen:
  - `node tools/balance.mjs duels 4` und `missions 8` enden mit Exitcode 0.
  - Ab Task 7 kommt die Prüfung „Spam einer neuen Einheit“ je Mission dazu.
- Deutsche Texte. `kritzelschlacht.html` bleibt unverändert. Kein npx, keine neuen Abhängigkeiten, LF-Zeilenenden.

## Review Focus

1. **Gestapelte Zustände:** Eine Einheit wird mitten in ihrer Fähigkeit erschreckt, fällt unter 25 % oder wird weggeschleudert. Die Fähigkeit bricht sauber ab, und es bleibt kein Zustand hängen (kein ewiges `abOn`). Test in Task 1.
2. **Kettenreaktionen:** Ein Vampir tötet den Ghul eines anderen Vampirs. Ein Frosch wird gebissen. Ein Phönix wird in einen Frosch verwandelt. Ein Elefant flieht vor Bienen in Lava. Nichts davon darf Einheiten verdoppeln, Ghule ohne Grenze erzeugen oder ins Ungültige führen. Tests in den Tasks 4 und 6.
3. **Steinwand:** Sie entsteht nicht auf Einheiten, nicht in Missionsgelände und nicht über Lava. Rückgängig und Leeren entfernen sie. Ihr Ablauf ändert das Flussfeld. Test in Task 3.
4. **Viele gleichzeitig:** 200 Magier, 100 Büffel oder 50 Bären. Fähigkeiten dürfen nicht alle im selben Schritt auslösen (Abklingzeiten nach id versetzt), das fx-Budget hält, und die Kosten pro Schritt bleiben begrenzt. Test in Task 1, Messung in Task 7.
5. **Missionen:** Keine neue Einheit löst eine Mission billig. Das wird je Mission mit deren Budget geprüft (Task 7).

---

### Task 1: Fähigkeiten-Grundlage und Hubschrauber-Raketen (#30)

**Files:**
- Create: `game/js/abilities.js`
- Modify: `game/js/world.js` (spawn-Felder), `game/js/combat.js` (think ruft das Modul, Feuer-Merkmal in `hurt`), `game/js/data.js` (`abil`-Texte)
- Modify: `game/js/render/fxcore.js`, `game/js/render/renderer.js` (Raketenspur des Helis)
- Test: `tests/abilities.test.js`

**Interfaces:**
- Produces in abilities.js:
  - `export const ABILITY = { [type]: { cd, ready(world, u) → bool, start(world, u), update(world, u, dt) → bool (true = fertig) } }` (Texte in data.js, siehe Vorgabe 2);
  - `export function stepAbility(world, u, dt) → bool`: true, solange eine Fähigkeit die Steuerung übernimmt;
  - `export function scare(world, v, sec)`: Schreck nach Festlegung 1;
  - `export const FIRE_KINDS = new Set(['fire', 'breath', 'burn', 'firearrow', 'phoenix'])`;
  - `export const isFire = kind => FIRE_KINDS.has(kind)`.
- Unit-Felder:
  - `abCd`: Abklingzeit, beim Spawn `ABIL.cd · (0.3 + 0.7 · rng)`, damit nicht alle gleichzeitig auslösen;
  - `abOn: false`, `abT: 0`, `abK: 0` (Zähler, z. B. für die Raketen);
  - `fearT: 0`.
- think ruft in dieser Reihenfolge auf:
  1. `updateMorale` (Rückzug);
  2. bei `fearT > 0` das Fluchtsteuern aus morale.js;
  3. `stepAbility`;
  4. das normale Verhalten.
- Abbruch: Betäubung, Abheben, Rückzug oder Schreck setzen `abOn = false`. Die Abklingzeit läuft dann trotzdem neu.
- Brand-Schaden über Zeit läuft künftig mit `kind: 'burn'`. Bisher war das `'fire'` mit `dot = true`. Das Verhalten bleibt gleich.
- Hubschrauber: `cd 25`. Er schießt 4 Raketen im Abstand von 0,25 s auf sein Ziel oder die dichteste Feindgruppe in Reichweite. Es sind gerade Schüsse vom Typ `rocket` mit dem Schaden der Panzerfaust ÷ 2 und dem Splash der Panzerfaust.

- [ ] **Step 1: Failing tests** in `tests/abilities.test.js`:
  - „Heli feuert 4 Raketen“: genau 4 `shot`-Events mit `kind 'rocket'` von ihm in 1,2 s nach dem Auslösen, dann `abCd ≈ 25`.
  - „Abklingzeiten versetzt“: Bei 50 Helis gleichzeitig lösen in keinem Schritt mehr als 5 aus.
  - „Abbruch“: Ein Heli wird mitten in der Salve betäubt. `abOn` wird false, und danach kommen keine weiteren Raketen.
  - „scare“: Eine Einheit mit 100 % LP flieht `sec` Sekunden lang und kehrt dann zurück, ohne Regeneration.
  - „isFire“: Der Brand über Zeit zählt als Feuer.
  - „Form bleibt gleich“ (bench.test.js).
- [ ] **Step 2:** `node --test tests/abilities.test.js` → FAIL.
- [ ] **Step 3:** Implementieren. Die Raketenspur in fxcore nutzt den vorhandenen Raketen-Effekt.
- [ ] **Step 4:** `node --test tests/*.test.js` → alle grün. `node tools/bench.mjs mixed` < 2,0 ms.
- [ ] **Step 5: Commit** `feat: ability module with state priority, fear, fire tag; heli rocket salvo`

### Task 2: Fähigkeiten der bestehenden Einheiten (#30)

**Files:**
- Modify: `game/js/abilities.js`, `game/js/data.js` (`abil`-Texte), `game/js/render/fxcore.js` und `pose.js` (Effekte)
- Test: `tests/abilities.test.js`

**Interfaces:**
- Consumes: `ABIL`, `scare`, `isFire` aus Task 1, `ignite` und `blast` aus combat.js, `fling` und `applyImpulse` aus der Physik.
- Fähigkeiten (Abklingzeit in s) mit Wirkung und Test:

| Typ | cd | Wirkung | Test |
|---|---|---|---|
| schuetze | 20 | Brandpfeil-Salve: 3 Pfeile, Treffer zünden an (`ignite`, Generation 0) | ≥ 1 `ignite`-Event nach der Salve gegen 5 Krieger |
| sani | 20 | Heilwelle: Verbündete in 90 px +25 % ihrer max. LP | 3 verletzte Verbündete steigen um je 25 % (gedeckelt) |
| soldat | 15 | Handgranate: Bogenwurf `bomb`, R 36, Schaden 24 | 1 `shot` mit `kind 'bomb'` vom Soldaten |
| moerser | 30 | Sperrfeuer: 3 `mortar` im Abstand von 0,4 s um das Ziel | 3 Mörser-Schüsse in 1,2 s |
| panzer | 25 | Ramme: 1,2 s Tempo ×3 geradeaus aufs Ziel, schiebt alle Körper weg, Schaden 20 nur an Feinden | Eigene werden verschoben, aber nicht verletzt |
| wolf | 25 | Heulen: Rudelmitglieder in 120 px 5 s Tempo ×1,3, Schaden ×1,3 | Rudelmitglieder haben den Bonus, Fremde nicht |
| baer | 20 | Brüllen: Feinde in 80 px `scare` 2 s | Feinde in 80 px fliehen, außerhalb nicht |
| geist | 15 | Spuk: das nächste feindliche Ziel `scare` 2,5 s | genau 1 Einheit erschreckt |
| drache | 30 | Sturzflug: sinkt auf z = 6, landet, `fling` aller Körper in 90 px, Schaden 30 an Feinden, steigt wieder | Körper im Kreis fliegen weg, der Drache ist danach wieder auf flyZ |

- [ ] **Step 1: Failing tests** wie in der Tabelle.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren. Jede Fähigkeit bekommt einen gut sichtbaren, aber kurzen Effekt im vorhandenen fx-Budget, zum Beispiel einen Ring für Heilwelle und Brüllen oder Notenstriche fürs Heulen.
- [ ] **Step 4:** `node --test tests/*.test.js` → alle grün. bench < 2,0 ms.
- [ ] **Step 5: Commit** `feat: abilities for archer, medic, soldier, mortar, tank, wolf, bear, ghost, dragon`

### Task 3: Zauberbuch der Magier und Meteor (#31)

**Files:**
- Create: `game/js/spells.js` (rein: Zauberwahl, Blitzkette, Windkegel, Steinwand-Platzierung)
- Modify: `game/js/combat.js` (Magier-Angriff ruft die Zauberwahl), `game/js/world.js` (befristete Mauerzellen), `game/js/paint.js` (Rückgängig und Leeren entfernen Steinwände), `game/js/render/*` (Blitz, Wind, Meteor, Kanalstrahlen)
- Test: `tests/spells.test.js`

**Interfaces:**
- Produces: `export function chooseSpell(world, u, t) → 'fireball' | 'lightning' | 'wind' | 'wall'`.
  - Lage geht vor: ein Nahkämpfer in 60 px → wind (oder wall, falls wind noch lädt); dichte Gruppe (≥ 4 Feinde in 45 px ums Ziel) → fireball; Flieger oder Einzelziel → lightning.
  - Mit 20 % Wahrscheinlichkeit (`world.rng`) nimmt er den zweitbesten passenden Zauber.
  - Kein fireball, wenn im Einschlagkreis mehr Eigene als Feinde stehen.
- Die Zauber:
  - **lightning:** sofortiger Treffer, dann bis zu 3 Sprünge auf Feinde in 70 px. Schaden 18, je Sprung ×0,7.
  - **wind:** Kegel von 60°, 110 px. `fling` aller Körper, Schaden 4 nur an Feinden. Bienen werden weit weggeschleudert. Eigene Abklingzeit 6 s.
  - **wall:** 5–7 Mauerzellen quer zur Angriffsrichtung, 40 px vor dem Magier. Nur auf freien Zellen ohne Einheit, ohne Missionsgelände, ohne Lava. Sie stehen 12 s, dann zerfallen sie in Brocken (`hitWall`-Trümmer, ohne Schaden). Eigene Abklingzeit 10 s.
  - **Meteor:** ab 3 Magiern derselben Fraktion innerhalb von 90 px und mindestens 6 Feinden in 60 px um einen Punkt in Reichweite. Die Magier kanalisieren 1,5 s und stehen dabei still. Danach schlägt ein `blast` mit R 80, Schaden 70 und Brand ein. Er bricht ab, wenn weniger als 3 Magier übrig sind. Jeder Teilnehmer bekommt 30 s Abklingzeit.
- Befristete Mauer: `world.tempWalls` als Liste von `{ i, t }`. `touchTerrain` beim Setzen und beim Zerfall. Die Zelle trägt `towner = 2` (Zauber), damit Malen und Radierer sie wie eigenes Gelände behandeln.

- [ ] **Step 1: Failing tests** in `tests/spells.test.js`:
  - „Wahl nach Lage“: Nahkämpfer in 40 px → wind; 6 Feinde dicht → fireball; Adler oder Biene allein → lightning.
  - „kein Feuerball auf Eigene“: 3 Eigene und 2 Feinde im Kreis → nicht fireball.
  - „Blitz springt“: 4 Feinde in einer Kette im Abstand von 50 px → 4 `hit`-Events, Schaden abnehmend. Ein Eigener in der Kette wird übersprungen.
  - „Steinwand“: Die Zellen werden zu Mauern, keine auf einer Einheit oder über Lava. Nach 12,1 s sind sie wieder frei, `terrainVersion` ist gestiegen, und Trümmer sind entstanden.
  - „Meteor nur in Gruppe“: Mit 2 Magiern gibt es keinen Meteor. Mit 3 kommt ein `blast` mit R 80 nach 1,5 s Kanal. Stirbt einer während des Kanals, wird abgebrochen.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren, mit Effekten: Zickzack-Blitz mit Leuchten, Windschlieren, Meteor mit Feuerschweif, Kanalstrahlen, die am Himmel zusammenlaufen.
- [ ] **Step 4:** `node --test tests/*.test.js` → alle grün. bench < 2,0 ms.
- [ ] **Step 5: Commit** `feat: wizard spellbook (lightning, wind, stone wall) and group meteor`

### Task 4: Vampir und Ghul (#32)

**Files:**
- Modify: `game/js/data.js` (`vampir` malbar in Mythisch, `ghul` mit `paint: false`), `game/js/abilities.js` oder `combat.js` (Lebensraub, Fledermausform, Ghul-Erzeugung), `game/js/world.js`, `game/js/render/rig.js`, `pose.js`, `fxcore.js`
- Test: `tests/vampire.test.js`

**Interfaces:**
- `UNITS.ghul.paint === false`. ui.js zeigt Einheiten mit `paint === false` nicht in der Malleiste.
- Unit-Felder: `owner: null` (Vampir eines Ghuls), `ghouls: 0` (Anzahl lebender Ghule je Vampir), `batT: 0` (Fledermausform aktiv).
- Lebensraub: Ein Biss heilt den Vampir um 50 % des Schadens, gedeckelt auf seine max. LP.
- Fledermausform:
  - Sie beginnt, wenn das Ziel weiter als 220 px entfernt ist oder der Vampir flieht (#27).
  - In der Form gilt `fly`, flyZ 22, Tempo ×2. Nahkämpfer erreichen ihn nicht, und er greift nicht an.
  - Sie endet in 40 px am Ziel oder in Sicherheit.
  - Darstellung: 5–7 kleine Fledermäuse um die Position.
- Ghule:
  - Ein Kill durch den Biss eines Vampirs erzeugt einen Ghul seines Teams am Ort des Opfers. Bedingung: `ghouls < 3`, und das Opfer ist weder Boss noch Ghul. In dem Fall entsteht keine Leiche.
  - Ghule verlieren 4 % ihrer max. LP pro Sekunde.
  - Stirbt der Vampir, zerfallen seine Ghule.
- Feuer (`isFire`) trifft den Vampir doppelt.

- [ ] **Step 1: Failing tests** in `tests/vampire.test.js`:
  - „Lebensraub“: Die LP des Vampirs steigen um die Hälfte des Schadens.
  - „Ghul entsteht, höchstens 3“: 6 Kills ergeben 3 Ghule. Die Opfer mit Ghul hinterlassen keine Leiche.
  - „Ghul zerfällt“: Nach 25 s ohne Kampf lebt der Ghul nicht mehr. Stirbt der Vampir, zerfallen seine Ghule sofort.
  - „Fledermausform“: Ziel 400 px entfernt → fly, schneller, ein Krieger trifft ihn nicht. Am Ziel wird er wieder zum Vampir.
  - „Feuer doppelt“: Ein Feuerball macht doppelten Schaden, ebenso der Brand.
  - „Kein Ghul aus Ghul“: Tötet ein Vampir einen Ghul, entsteht kein neuer Ghul.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren. Rigs: Vampir mit Umhang, Kragen und Eckzähnen. Ghul grünlich-grau, gebückt. Fledermäuse.
- [ ] **Step 4:** `node --test tests/*.test.js` → alle grün. bench < 2,0 ms.
- [ ] **Step 5: Commit** `feat: vampire with lifesteal, bat form and ghouls`

### Task 5: Neue Tiere (#33)

**Files:**
- Modify: `game/js/data.js` (elefant, krokodil, gorilla, adler, bueffel in Tiere), `game/js/abilities.js`, `game/js/combat.js` (Krokodil unsichtbar im Wasser, Adler Sturzflug), `game/js/render/rig.js` (Elefant als Boss-Sticker), `pose.js`, `fxcore.js`
- Test: `tests/animals.test.js`

**Interfaces:**
- **Elefant:**
  - Boss-Sticker (Rüssel, Ohren, Stoßzähne), mass hoch.
  - Trampeln (cd 20): 1,5 s Ansturm, wirft Körper seitlich weg (`fling` quer zur Laufrichtung), Schaden nur an Feinden.
  - Bienen innerhalb von 50 px → `scare(…, 1.5)` beim Elefanten. Höchstens einmal je 6 s.
- **Krokodil:**
  - Im Wasser Tempo ×1,6 (keine Wasserbremse) und `hidden = true`.
  - Feinde wählen ein verstecktes Krokodil nur in 60 px oder bis 2 s nach seinem Biss.
  - Packen (cd 8): Schaden ×2 und Ziel 1 s betäubt (`stunT`).
  - An Land Tempo ×0,7.
- **Gorilla:**
  - Wurf (cd 12): packt einen Feind mit mass ≤ 2, wirft ihn 120 px weit in die dichteste Feindgruppe. Aufprall wie ein Flug mit Landung (#15).
  - Brustklopfen: beim ersten Kontakt einer Schlacht, danach alle 20 s. `scare(…, 1.5)` für Feinde mit LP < Gorilla-LP in 70 px.
- **Adler:**
  - fly, flyZ 30.
  - Sturzflug (cd 10) auf Ziele mit Vorliebe für `RANGED`: erster Treffer ×3 Schaden, danach steigt er wieder.
  - Nahkämpfer erreichen ihn nur während des Sturzflugs und kurz danach (flyZ ≤ 14).
- **Büffel:**
  - Herde über die Gruppierung (`GROUP_USERS`).
  - Stampede ab 3 Büffeln innerhalb von 60 px: Die ganze Herde stürmt 2 s mit Tempo ×2,2 in Richtung des Ziels und rammt alles beiseite. Danach hat die Herde 20 s Abklingzeit, als gemeinsamer Wert auf allen Mitgliedern.
- Unit-Felder: `hidden: false`, `grabbed: null`, `herdCd: 0`.

- [ ] **Step 1: Failing tests** in `tests/animals.test.js`:
  - Elefant trampelt Krieger zur Seite und flieht vor 10 Bienen.
  - Ein Krokodil im Wasser wird von einem Schützen in 200 px nicht anvisiert, in 50 px schon. Sein Biss betäubt.
  - Ein Gorilla wirft einen Krieger und einen Ritter (mass 2) mehr als 80 px weit, aber keinen Bären (mass 6) und keinen Panzer.
  - Ein Adler stößt auf einen Schützen herab, obwohl ein Krieger näher ist.
  - 3 Büffel stürmen, 2 nicht.
  - Form bleibt gleich.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren.
- [ ] **Step 4:** `node --test tests/*.test.js` → alle grün. bench < 2,0 ms.
- [ ] **Step 5: Commit** `feat: elephant, crocodile, gorilla, eagle and buffalo`

### Task 6: Neue Kreaturen (#34)

**Files:**
- Modify: `game/js/data.js` (troll, zyklop, hexe, phoenix, einhorn in Mythisch; `frosch` mit `paint: false`), `game/js/abilities.js`, `game/js/combat.js` (`boulder`-Projektil, Hexen-Zauber `hex`), `game/js/render/*`
- Test: `tests/creatures.test.js`

**Interfaces:**
- **Troll:** heilt ständig 3 % seiner max. LP pro Sekunde. Nach einem Feuer-Treffer (`isFire`) 4 s keine Heilung.
- **Zyklop:**
  - Projektil `boulder` (Bogen): `blast` mit R 34 beim Einschlag und 2 Trümmerbrocken ohne Schaden.
  - Im Nahkampf: Abklingzeit ×2 und Schaden ×0,5.
- **Hexe:**
  - fly, flyZ 24.
  - Normaler Angriff: gerades Projektil `hex` (grünlich, kein Feuer), Schaden 10.
  - Froschfluch (cd 14): Das Ziel wird für 5 s zum `frosch`. Die LP bleiben, und danach kommt die alte Einheit mit ihrem Typ zurück.
  - Immun: Panzer, Hubschrauber, Drache, Elefant, Ghul.
  - Umsetzung: Typwechsel `u.type`/`u.T` mit `frogFrom`.
- **Phönix:**
  - fly, flyZ 26. Hinterlässt eine Feuerspur, die Bodentruppen kurz anzündet (`ignite` Generation 2).
  - Wiedergeburt: Beim ersten Tod wird er zu Asche, ist 2 s nicht treffbar und steht dann mit 50 % LP wieder auf (`reborn: true`). Ein zweiter Tod ist endgültig.
  - Zählt während der Asche nicht als tot für den Sieg.
- **Einhorn:**
  - Sturmlauf wie der Reiter, mit dem Horn voran: erster Treffer ×1,5.
  - Aura: Verbündete in 70 px +2 LP pro Sekunde.
- Unit-Felder: `frogFrom: null`, `frogT: 0`, `reborn: false`, `ashT: 0`, `noHealT: 0`.

- [ ] **Step 1: Failing tests** in `tests/creatures.test.js`:
  - Troll heilt, nach Feuer 4 s nicht.
  - Ein Zyklopen-Felsen trifft im Bogen über eine Mauer.
  - Eine Hexe verwandelt einen Ritter in einen Frosch. Nach 5 s ist er wieder Ritter mit seinen LP. Panzer bleibt Panzer.
  - Ein Phönix steht einmal wieder auf, beim zweiten Tod ist er endgültig tot.
  - Einhorn heilt Verbündete in 70 px.
  - Ein Frosch ist nicht malbar, ein gebissener Frosch wird kein Ghul, und ein verwandelter Phönix behält `reborn`.
- [ ] **Step 2:** Tests → FAIL.
- [ ] **Step 3:** Implementieren, mit Rigs: Troll mit Keule und Warzen, Zyklop mit einem großen Auge, Hexe auf dem Besen mit Hut, Phönix mit Flammenschweif, Einhorn mit Regenbogenmähne, Frosch.
- [ ] **Step 4:** `node --test tests/*.test.js` → alle grün. bench < 2,0 ms.
- [ ] **Step 5: Commit** `feat: troll, cyclops, witch, phoenix and unicorn`

### Task 7: Balance, Missionsschutz, Karten und Veröffentlichung

**Files:**
- Modify: `tools/plans.mjs` (COUNTERS, Spam-Prüfung neuer Einheiten), `tools/balance.mjs`, `game/js/data.js` (Werte, Abklingzeiten, Hinweise, `abil`-Texte)

**Interfaces:**
- COUNTERS bekommt mindestens einen Eintrag „schlägt“ und einen „wird geschlagen“ je neuer Einheit. Startvorschlag (der Bauende darf begründet ändern):
  - `vampir > ritter`, `magier > vampir`;
  - `troll > krieger`, `magier > troll`;
  - `zyklop > ritter`, `reiter > zyklop`;
  - `hexe > ritter`, `schuetze > hexe`;
  - `phoenix > biene`, `soldat > phoenix`;
  - `einhorn > schuetze`, `ritter > einhorn`;
  - `elefant > krieger`, `panzerfaust > elefant`;
  - `krokodil > reiter`, `schuetze > krokodil`;
  - `gorilla > krieger`, `grenadier > gorilla`;
  - `adler > schuetze`, `mg > adler`;
  - `bueffel > schuetze`, `ritter > bueffel`.
- Neue Prüfung `node tools/balance.mjs newspam 8`: Für jede Mission in SPAM_MUST_LOSE und jede neue Einheit, die dort erlaubt ist, verliert ein Spam mit vollem Missionsbudget ≥ 6/8. Sie läuft an allen 6 Formen und hat den Exitcode 0, wenn alles hält.

- [ ] **Step 1:** Alle drei Prüfungen laufen lassen → Ist-Stand sichern.
- [ ] **Step 2:** Werte und Abklingzeiten anpassen, bis duels, missions und newspam an allen Formen mit 0 enden. Begründung je Änderung im Bericht.
- [ ] **Step 3:** Die `abil`-Texte aller Einheiten passen zu den Karten (#29). `node --test tests/*.test.js` → alle grün. bench < 2,0 ms.
- [ ] **Step 4: Commit** `balance: abilities and new units`
- [ ] **Step 5 (Controller):** Browser-Prüfung mit Szenen für Fähigkeiten, Magier, Vampir, Tiere und Kreaturen, ein Leistungslauf mit 2.000 Einheiten und alle Missionen einmal mit dem Smart-Plan. Danach Veröffentlichung unter demselben Link.
