# Kritzelschlacht

Ein Physik-Schlachtspiel im Browser: Armeen mit dem Pinsel aufs Papier malen und zusehen, wie sie kämpfen.
Reines JavaScript (ES-Module) mit PixiJS 7.4.2, ohne Build-Schritt und ohne Server-Abhängigkeiten.

## Starten

```sh
python3 -m http.server 8000 -d game
# dann http://localhost:8000 öffnen (?debug zeigt Testszenen und Bench-HUD)
```

Alles liegt lokal in `game/`: Pixi in `game/vendor/`, Schriften in `game/fonts/` (OFL). Kein CDN nötig.

## Tests und Balance

```sh
npm test                                         # node --test tests/*.test.js (läuft auch in CI, Node 22)
node tools/balance.mjs missions 8                # jedes Level: kluger Plan muss ≥6/8 gewinnen, Spam ≥6/8 verlieren
node tools/balance.mjs missions 8 --chapter=rom  # nur ein Kapitel
node tools/bench.mjs                             # Simulations-Benchmark
```

Die Simulation ist deterministisch (`world.rng`, fester Schritt 1/60 s, Welt fest 1600×900). Darauf beruhen Balance-Läufe und das Replay.

## Aufbau

| Bereich | Dateien |
|---|---|
| Einstieg, Spielfluss | `js/main.js`, `js/ui.js`, `js/ui/*` (Tutorial-Blasen, Editor-Leiste, Teilen-Dialog, Tageschallenge, Hotseat) |
| Simulation (ohne DOM) | `sim.js`, `world.js`, `combat.js`, `physics.js`, `pathing.js`, `morale.js`, `spells.js`, `abilities.js`, `battle.js` |
| Inhalte | `data.js` (Einheiten, Gelände, Konter), `campaign/*` (Kapitel, Tutorial), `docs/kampagne.md` |
| Features (rein, getestet) | `shapes.js` (Kritzel-Formen), `medals.js`, `hints.js`, `share.js` (Codes `KS1.…`), `daily.js`, `editor.js`, `hotseat.js`, `save.js` |
| Darstellung | `render/*`, `camera.js` (Zoom auf feste Welt), `glguard.js` (WebGL-Kontextverlust) |
| Debug | `debug/scenes.js`, `benchhud.js`, `sandbox.js` |

## Als Claude-Artefakt veröffentlichen

Das Spiel läuft als Multi-File-Artefakt: `game/index.html` ist die Seite, alle übrigen Dateien unter `game/`
(`js/**`) gehen mit ihrem Pfad relativ zu `game/` in `files`.
Neue Module müssen dort mit aufgenommen werden, sonst fehlen sie im Artefakt.

Wichtig fürs öffentliche Teilen: Die Prüfung lässt nur gängige Bild-, Video- und Audioformate zu. Schriftdateien (`.woff2`)
und das lokale `pixi.min.js` (enthält data:-URIs für AVIF/WebM) lassen sie scheitern, dann ist der Link nur noch privat.
Für das Artefakt daher den `@font-face`-Block durch den Google-Fonts-Link ersetzen, Pixi von
`https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.4.2/pixi.min.js` laden und `fonts/` sowie `vendor/` nicht mit hochladen.
