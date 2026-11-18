# Battle-Modus – Implementierungsplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Einen Modus „Schlacht“ bauen, in dem man zwei Armeen frei aufbaut, sie per „Los!“ kämpfen lässt und danach eine Auswertung bekommt, mit „Nochmal“ und „10× auswerten“.

**Architecture:**
- Das neue reine Modul `game/js/stats.js` sammelt die Statistik aus `world.events` und aus Zählern je Einheit (ausgeteilter Schaden, Kills).
- main.js bekommt einen dritten Modus `battle` mit Planungsphase, Schnappschuss, Kampf und Ergebnis. Er nutzt die Abläufe der Missionen wieder (snapshot, retry) und baut sie für zwei Seiten aus.
- ui.js zeigt den Reiter, die Punktanzeige und den Auswertungsbildschirm mit Tabelle und einem kleinen SVG-Graphen.
- „10× auswerten“ lässt die Simulation ohne Zeichnen in Häppchen pro Frame laufen, damit die Seite bedienbar bleibt.

**Spec:** `docs/superpowers/specs/2026-11-15-engine-overhaul-design.md`, Nachtrag 6 (#45, #46).

## Global Constraints
- Logikmodule bleiben rein und deterministisch, nur `world.rng()`. Das gilt auch für stats.js: kein DOM, kein PIXI. Gleiche Einheitenform bei `spawn`: neue Felder starten als Double.
- Bestehende Modi (Sandkasten, Missionen), Sterne-Speicherstand, Tasten und Karten bleiben unverändert.
- Leistung: `node tools/bench.mjs mixed` bleibt unter 2,0 ms. Das Mitzählen der Statistik darf den Kampf nicht spürbar verlangsamen.
- Deutsche Texte, Stil der bestehenden Oberfläche (weiße Pillen, Nunito, Luckiest Guy).
- Kein npx, keine neuen Abhängigkeiten, `kritzelschlacht.html` bleibt unverändert, LF-Zeilenenden.

## Review Focus
1. „Nochmal“ und „10× auswerten“ stellen exakt den Ausgangsstand wieder her: Einheiten, Gelände, keine Reste wie Leichen, Formationen, Zauberwände, Ghule oder Brand.
2. Ein Kampf endet immer: Steht nach 180 s keine Seite allein da, gewinnt die höhere verbleibende Armeestärke. Bei Gleichstand ist es ein Unentschieden.
3. Statistik: Ghule zählen zur Seite, aber nicht als eingesetzt. Frösche zählen als ihr ursprünglicher Typ. Phönix-Asche zählt nicht als Tod. Friendly Fire zählt nicht als Kill.
4. Wechsel zwischen den Modi mitten in einem Kampf oder in einer 10×-Auswertung hinterlässt keinen laufenden Hintergrundlauf und keine Statistikreste.
5. Malen nur in der Planungsphase. Die Seite ergibt sich aus der Hälfte. Gelände ist überall erlaubt.

---

### Task 1: Statistik-Modul und Modus-Logik

**Files:** Create `game/js/stats.js`; modify `game/js/main.js`, `game/js/combat.js` (Schadens- und Kill-Zähler am Verursacher), `game/js/world.js` (Felder), `game/js/paint.js` (Seite aus der Hälfte im Battle-Modus); Test `tests/stats.test.js`, `tests/battle.test.js`.

**Interfaces:**
- `createStats(world)` liefert `{ onEvents(events), tick(world, dt), result(world) }`.
  - Der Verlauf wird alle 0,5 s als Punktwert der Lebenden je Seite gespeichert.
  - `result` liefert `{ winner: 'blau' | 'rot' | 'draw', time, survivors: { blau, rot }, table: [{ side, type, deployed, survived, dmg, kills, dmgPerPt }], timeline: [{ t, blau, rot }], hero: { type, side, kills } | null }`.
- Unit-Felder `dmgOut: 0`, `killsOut` (vorhandenes `kills` darf genutzt werden) und `orig: null` (Typ beim Einsatz, für Frösche). In `hurt` wird der tatsächlich angerichtete Schaden dem Verursacher gutgeschrieben, ohne Friendly Fire.
- `battleWinner(world, t)` in sim.js: Nach 180 s gilt die höhere Armeestärke.
- main.js: `game.battle = { phase: 'plan' | 'fight' | 'done', snap, stats, batch }` und `enterBattle()`, `startBattle()`, `retryBattle()`, `runBatch(n = 10)`.
  - `runBatch` simuliert ohne Rendern in Häppchen von etwa 8 ms pro Frame und mit verschiedenen Zufallswerten.
  - Es liefert `{ wins: { blau, rot, draw }, avgTime }`.
  - Es lässt sich abbrechen.

- [ ] Failing tests:
  - stats: Kills und Schaden je Typ; kein Kill durch Friendly Fire; der Ghul zählt nicht als eingesetzt; ein Frosch zählt als Ursprungstyp; die Asche zählt nicht als Tod; der Verlauf hat einen Punkt alle 0,5 s.
  - battle: `retryBattle` stellt die Einheiten exakt wieder her (gleiche Typen und Positionen; keine Leichen, Wände oder Ghule); nach 180 s gilt die höhere Stärke; `runBatch(4)` liefert die Summe 4 und ist deterministisch bei gleicher Startzahl; Malen rechts der Mitte ergibt Rot.
- [ ] Implementieren; `node --test tests/*.test.js` grün; bench < 2,0 ms.
- [ ] Commit `feat: battle mode logic and stats`

### Task 2: Oberfläche des Battle-Modus

**Files:** modify `game/index.html`, `game/js/ui.js`.

- Ein Reiter „Schlacht“ neben „Sandkasten“ und „Missionen“.
- In der Planungsphase:
  - Die Mittellinie ist gestrichelt.
  - Oben steht eine Pille „Blau 120 Pkt · Rot 95 Pkt“.
  - Es gibt die Knöpfe „Los!“, „Leeren“ und „Seiten tauschen“ (optional, nur wenn es billig ist).
- Nach dem Kampf erscheint eine Auswertungskarte. Sie zeigt:
  - Gewinner, Dauer und Überlebende;
  - eine Tabelle je Seite mit dem Typ-Icon (vorhandenes `iconURL`) und den Spalten eingesetzt, überlebt, Schaden, Kills und Schaden/Pkt;
  - den Verlauf als kleinen SVG-Graphen mit zwei Linien in den Teamfarben;
  - den Helden;
  - die Knöpfe „Nochmal“, „10× auswerten“ und „Aufstellung ändern“ (zurück in die Planung mit derselben Aufstellung).
- Während „10× auswerten“ läuft:
  - Ein Fortschritt „3/10“ wird angezeigt, und es gibt einen Abbrechen-Knopf.
  - Danach wird das Ergebnis angezeigt: „Blau 7 · Rot 3 · Unentschieden 0, Ø 34 s“.
- Am Laptop lesbar (1280×800).

- [ ] Umsetzen; im Browser prüfen: Aufbau, Los, Ergebnis, Nochmal, 10× und Moduswechsel mittendrin; Screenshots nach `.superpowers/`.
- [ ] Commit `feat: battle mode UI with result screen and 10x evaluation`
