# Kritzelschlacht – Engine-Overhaul (Physik & Optik)

Stand: 2026-11-15, im Gespräch abgestimmt und vom Nutzer bestätigt.

Das Spielprinzip bleibt: Einheiten malen, zuschauen, Missionen mit Punktebudget. Darunter wird die Engine erneuert.

## Entscheidungen

| # | Entscheidung |
|---|---|
| 1 | Physik heißt: Einheiten haben Masse und schieben (ein Panzer schiebt Soldaten weg, ein Bär rempelt Krieger um). Explosionen schleudern Einheiten durch die Luft, Gefallene fliegen und kullern. Geschosse fliegen wirklich und treffen das Erste im Weg, auch eigene Leute und Mauern als Deckung. Trümmer. Keine volle Starrkörper-Simulation. |
| 2 | Der Stil bleibt: runde Sticker-Figuren mit Glubschaugen auf weißem Feld, Umrisse in `#2a2a33`, nur polierter. |
| 3 | Draufsicht mit echter Höhenachse z: Bögen, fliegende Körper, Schatten und Flughöhe. |
| 4 | Ziel: rund 2.000 Einheiten mit 60 fps und vollen Effekten im Laptop-Browser. Handy wird nicht berücksichtigt. |
| 5 | Friendly Fire. Danach werden alle Einheiten und alle 9 Missionen per Simulation neu kalibriert. |
| 6 | Rendering mit WebGL über PixiJS aus dem erlaubten CDN. |
| 7 | Eigene, schlanke Physik: Kreise mit Masse, Impulse, Reibung, Schwerkraft auf z, Kollision mit dem Geländeraster. Keine Physik-Bibliothek. |
| 8 | Sterben im Cartoon-Stil: Der Körper fliegt, dreht sich, prallt auf und rutscht aus. Helm, Waffe oder Schild fliegen als eigene Teile weg. Dazu das Geist-Seelchen. |
| 9 | Bögen fliegen über Köpfe: Pfeile, Granaten, Mörser, Panzergranaten. Gerade Schüsse treffen das Erste im Weg: Kugeln, Raketen, Feuerbälle. Schützen mit geraden Schüssen feuern nicht, wenn ein Verbündeter in der Schusslinie steht, und gehen seitlich in Position. |
| 10 | Kamera: Mausrad zoomt zur Mausposition. Leertaste+Ziehen oder Mitteltaste verschiebt. Pinselgröße mit `+`/`−` (Hauptreihe und Ziffernblock) und Shift+Mausrad. Q/E wechseln die Kategorie. `P` pausiert. |
| 11 | Gefallene bleiben als flach gedrückte, leicht ausgegraute Sticker liegen. Ab etwa 1.500 Körpern verblassen die ältesten. Sie sind kein Hindernis. |
| 12 | Krater sind nur optisch. Mauern zerbrechen in physikalisch fliegende Brocken, die niemanden verletzen. Das Spielraster des Geländes ändert sich sonst nicht. |
| 13 | Prozedurale Animation statt zwei Bildern: Figuren aus Teilen (Körper, Augen, Kopfbedeckung, Waffe). Squash & Stretch beim Laufen, Neigung in Laufrichtung, Waffenschwung, Rückstoß, Blinzeln, Pupillen folgen dem Ziel, Treffer drücken die Figur zusammen. |
| 14 | Effekte mit Maß: weiches Glühen nur bei Feuer, Explosionen und Mündungsblitzen. Explosionen beleuchten kurz den Boden. Staub und Rauch steigen auf und verwehen. Schatten wachsen mit der Höhe und werden weicher. Bildschirmwackeln nach Stärke. Kein Dauer-Bloom, keine Farbfilter auf dem ganzen Bild. |
| 15 | Wer durch die Luft fliegt, ist bis nach der Landung außer Gefecht, je nach Fallhöhe 0,3 bis 0,8 s. Normale Treffer schubsen nur leicht und betäuben nicht. |
| 16 | Abgeschossene Flieger stürzen ab. Der Hubschrauber explodiert beim Aufschlag mit kleinem Flächenschaden. Der Drache schleudert beim Aufschlag Einheiten weg. |
| 17 | Wasser und Lava reagieren nur optisch auf Körper: Spritzer, Treiben, Versinken; in Lava Zischen und Asche. Die Regeln für Lebende bleiben: Wasser bremst, Lava verbrennt. |
| 18 | Sound-Overhaul ist zurückgestellt. Nur neue Geräusche für Aufprall, Landung, Platschen und Absturz. |
| 19 | Lieferung in 3 Etappen, jede veröffentlicht: (a) Renderer, Kamera und Animation, (b) Physik, (c) Effekte und Neukalibrierung. |
| 20 | Gleicher Artifact-Link, gespeicherte Sterne bleiben, die alte Version bleibt über den Versionsverlauf erreichbar. |

## Nachtrag (2026-11-16, vom Nutzer gewünscht)

| # | Entscheidung |
|---|---|
| 21 | Drachenfeuer wird deutlich wuchtiger dargestellt. Getroffene brennen einige Sekunden nach, und Feuer springt in begrenztem Maß auf nahe Einheiten über: mit abnehmender Chance pro Sprung und höchstens 3 Generationen. Ein dichter Schwarm fängt gut Feuer, eine verteilte Armee kaum. |
| 22 | MG-Schützen und Scharfschützen legen sich hin, wenn kein Nahkämpfer in der Nähe ist. Liegend sind sie schwerer zu treffen, zielen genauer und schießen weiter, können sich aber nicht bewegen. Kommt ein Nahkämpfer nahe, müssen sie erst aufstehen und schießen in der Zeit nicht. |
| 23 | Panzer, Drache und Hubschrauber bekommen ein eigenes „Boss-Sticker“-Design im gleichen Stil, aber größer und detaillierter: Panzer mit Ketten, drehbarem Turm und Rückstoß; Hubschrauber mit sichtbar kreisendem Rotor und Kufen; Drache mit Hals, Flügelschlag und Schweif. Dazu eigene Bewegungen statt Hüpfen. |
| 24 | Pathfinding: Bodentruppen umgehen Mauern über ein geteiltes Flussfeld pro Fraktion, statt sofort einzuschlagen. Wasser kostet mehr, Lava wird stark gemieden, Wald kostet etwas mehr. Eingeschlagen wird nur, wenn es keinen sinnvollen Umweg gibt. Flieger ignorieren das Gelände. |

## Angenommen

- Gelände-Raster und -Regeln bleiben: Wasser bremst auf 40 %, Lava verbrennt, Wald gibt Deckung, Mauern blockieren.
- Alle bisherigen Funktionen bleiben: Missionen, Teamkampf, Rückgängig, Tastenkürzel, Zufallsschlacht, Heldenkrone, Stärkebalken, Schildwall, Rudel, Flankenritt, Schwarm, Einkreisen, Angriffe von hinten.
- Nahkämpfer erreichen weiterhin keine Hubschrauber.
- PixiJS in einer festen 7er-Version von cdnjs.
- Auf dem Handy darf das Spiel schlechter laufen.
- Neukalibrierung mit einem Simulations-Prüfstand; die Missionen bleiben inhaltlich gleich.

## Zurückgestellt

- Sound-Overhaul.
- Optimierung fürs Handy.
