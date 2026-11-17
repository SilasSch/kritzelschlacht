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

## Nachtrag 2 (2026-11-17, vom Nutzer gewünscht)

Ziel: Die Römer sollen vor allem cool aussehen: ein disziplinierter Block gegen chaotische Horden. Der Boden soll nach großen Schlachten nicht zugemüllt wirken.

| # | Entscheidung |
|---|---|
| 25 | Neue Einheit **Römer** (Legionär, Kategorie Armee): großes rechteckiges Schild in Teamfarbe, Helm mit Kamm, Kurzschwert. Römer marschieren als geschlossener Block im Gleichschritt, alle im Tempo des Langsamsten; fällt einer, rückt der Hintermann in die Lücke. Kurz vor dem Zusammenstoß wirft jeder Römer einmal einen Speer (Bogenwurf), dann löst sich die Formation und sie stürmen. Die Schilde wirken **nur in Formation**: In einem Block aus mindestens 4 Römern halten sie fast alle Pfeile, Kugeln und Speere ab, die von vorn kommen, und die Geschosse prallen sichtbar ab. Einzeln, nach dem Auflösen, bei Treffern von der Seite oder von hinten und gegen Explosionen, Feuerbälle und Feuer schützt das Schild nicht. Konter: Grenadiere, Magier, Mörser, Reiter über die Flanke. |
| 26 | **Bodenmüll verblasst** mit der Zeit (ersetzt das dauerhafte Liegenbleiben aus #11 und #12): Krater und Flecken nach etwa 60 s, Gefallene nach etwa 30 s, Mauertrümmer nach etwa 10 s. Die Deckel aus #11 bleiben als Obergrenze. |
| 27 | **Rückzug und Erholung für alle Einheiten:**<ul><li>Ab 25 % Leben bricht eine Einheit ab. Sie rennt vom nächsten Feind weg zu den eigenen Truppen, etwa 20 % schneller als sonst, und greift nicht an.</li><li>Sichtbar wird das durch Angstaugen und einen Schweißtropfen.</li><li>Ist 2 s kein Feind in der Nähe, erholt sie sich langsam. Ab 60 % Leben kehrt sie in den Kampf zurück.</li><li>Sanitäter heilen Fliehende bevorzugt.</li><li>Wer in die Ecke gedrängt oder eingeholt wird, wehrt sich.</li><li>Römer im Block halten bis 15 % durch.</li><li>Panzer, Hubschrauber und Drache ziehen sich ebenfalls zurück.</li></ul> |
| 28 | **Scharfschützen sind geduldiger:**<ul><li>Sie gehen nur so weit vor, bis ein Ziel gerade in Reichweite ist.</li><li>Sie bleiben hinter der eigenen Frontlinie.</li><li>Kommt ein Feind näher als 60 % ihrer Reichweite, weichen sie zurück.</li><li>Ohne Ziel warten sie zuerst etwa 3 s, bevor sie vorrücken.</li><li>Das Hinlegen (#22) bleibt.</li></ul> |
| 29 | **Charakterkarten:**<ul><li>Wählt man eine Einheit aus oder fährt mit der Maus darüber, zeigt eine Karte das Sticker-Porträt, Balken für Leben, Schaden, Tempo, Reichweite und Kosten, die Fähigkeiten und Zauber sowie „stark gegen“ und „schwach gegen“ aus den Kontern.</li><li>Ein Lexikon-Knopf zeigt alle Karten als Sammlung.</li><li>Die Karten lesen alles aus den Spieldaten, sodass neue Einheiten automatisch erscheinen.</li></ul> |

Ansätze, die erwogen wurden:
- Römerformation: (a) feste Plätze in einem Block je Römergruppe, der als Ganzes zum Feind marschiert. Gewählt, weil der Nutzer „streng in Formation“ will. (b) Die bestehende lockere Reihenglättung der Krieger verstärken. Verworfen: sie hält keinen Block mit Reihen und Gliedern.
- Krater und Flecken: (a) Die gesammelte Decal-Fläche wird regelmäßig ein Stück blasser. Gewählt, weil es nichts kostet und alte Spuren zuerst verschwinden. (b) Jeden Fleck einzeln speichern und neu zeichnen. Verworfen: teuer bei vielen Flecken und ohne sichtbaren Vorteil.

Nicht Teil dieses Nachtrags (folgt in einer eigenen Runde): Spezialfähigkeiten allgemein (zum Beispiel 4 Raketen des Hubschraubers alle 25 s), mehr Magier-Fähigkeiten, Vampire, mehr Tiere.

## Nachtrag 3 (2026-11-17, vom Nutzer gewünscht): Fähigkeiten, Magier, Vampire, neue Tiere und Kreaturen

**Absicht:**
- Schlachten sollen abwechslungsreicher und cooler aussehen.
- Einheiten bekommen dort eine Besonderheit, wo es zu ihnen passt, nicht überall.
- Alle Kategorien sollen gut gefüllt sein.
- Die Charakterkarten (#29) zeigen das alles, ohne Zusatzarbeit.

**Ziele:**
- Seltene, gut sichtbare Momente.
- Klare Rollen und Konter für jede neue Einheit.
- Alles läuft automatisch: Man malt und schaut zu.

**Nicht-Ziele:**
- Vom Spieler ausgelöste Fähigkeiten.
- Neue Missionen.
- Ein Sound-Overhaul (#18 bleibt). Neue Effekte nutzen vorhandene Geräusche.

**Anti-Ziele, also Fehlschläge, auch wenn es technisch läuft:**
- Dauergeflacker, bei dem überall ständig etwas aufblitzt.
- Eine Einheit, die allein eine Schlacht kippt, zum Beispiel ein Vampir mit endlosen Ghulen.
- Eine Einheit, die eine bestehende Mission trivial macht.
- Spürbar weniger fps bei 2.000 Einheiten.

| # | Entscheidung |
|---|---|
| 30 | **Fähigkeiten, wo es passt.** Sie lösen automatisch aus, haben eine Abklingzeit und sind gut sichtbar.<ul><li>**Hubschrauber:** 4 Raketen schnell hintereinander, alle 25 s.</li><li>**Schütze:** Brandpfeil-Salve, Getroffene fangen Feuer (Brand aus #21), alle 20 s.</li><li>**Sanitäter:** Heilwelle für Verbündete im Umkreis, alle 20 s.</li><li>**Soldat:** Handgranate, alle 15 s.</li><li>**Mörser:** Sperrfeuer, 3 Granaten kurz nacheinander, alle 30 s.</li><li>**Panzer:** Ramme, fährt durch die Reihen und schiebt alles weg, alle 25 s.</li><li>**Wolf:** Heulen, das Rudel wird kurz schneller und beißt härter, alle 25 s.</li><li>**Bär:** Brüllen, nahe Feinde fliehen kurz (Rückzug aus #27), alle 20 s.</li><li>**Geist:** Spuk, eine Einheit gerät in Panik und flieht, alle 15 s.</li><li>**Drache:** Sturzflug, landet und schleudert alles im Kreis weg, alle 30 s.</li></ul>Ohne eigene Fähigkeit bleiben Krieger, Ritter, Reiter, Grenadier, Bienen, MG, Scharfschütze und Panzerfaust. Die Abklingzeiten sind Richtwerte für die Balance. |
| 31 | **Magier mit Zauberbuch.** Bei jedem Wurf wählt der Magier nach der Lage, mit etwas Zufall:<ul><li>**Feuerball** gegen dichte Gruppen: Flächenschaden, setzt in Brand.</li><li>**Blitz** gegen einzelne Ziele, Flieger und Schwärme: trifft sofort und springt auf bis zu 3 nahe Feinde.</li><li>**Windstoß**, wenn Nahkämpfer zu nah kommen: ein Kegel, der Feinde zurückschleudert und Bienen wegpustet.</li><li>**Steinwand**, wenn er angestürmt wird und der Windstoß noch lädt: eine kurze Mauer zwischen ihm und den Angreifern, die nach etwa 12 s zerbröselt.</li></ul>**Gruppenzauber Meteor:** Ab 3 Magiern nah beieinander zaubern sie sichtbar gemeinsam, ihre Strahlen laufen zusammen. Dann schlägt ein großer Meteor in die dichteste Feindgruppe ein, höchstens alle 30 s. |
| 32 | **Vampir** (Mythisch):<ul><li>**Nahkampf mit Lebensraub:** Jeder Biss heilt ihn um die Hälfte des Schadens.</li><li>**Fledermausform:** Auf langen Wegen und auf der Flucht (#27) zerfällt er in einen Fledermausschwarm. Der fliegt schnell, Nahkämpfer erreichen ihn nicht, und am Ziel setzt er sich wieder zusammen.</li><li>**Ghule:** Wen ein Vampir tötet, steht als Ghul in seiner Farbe auf. Ghule sind langsam, schwach und hirnlos und zerfallen mit der Zeit. Ein Vampir hat höchstens 3 Ghule gleichzeitig. Ghule kann man nicht malen.</li><li>**Schwäche:** Feuer macht doppelten Schaden.</li></ul> |
| 33 | **Neue Tiere:**<ul><li>**Elefant:** großes Panzer-Tier im Boss-Sticker-Stil (#23), langsam und sehr zäh. **Trampeln** alle 20 s: stürmt durch die Reihen und schleudert Einheiten zur Seite. Vor Bienen erschrickt er und flieht kurz.</li><li>**Krokodil:** im Wasser schnell und fast unsichtbar, an Land langsam. **Packen:** ein harter Biss aus dem Hinterhalt, der das Opfer kurz festhält.</li><li>**Gorilla:** starker Nahkämpfer. **Wurf** alle 12 s: packt einen Gegner und wirft ihn in die Menge. **Brustklopfen:** schwächere Feinde in der Nähe fliehen kurz.</li><li>**Adler:** Flieger. **Sturzflug** auf einzelne Ziele, am liebsten Schützen und Scharfschützen. Schütze, Soldat und MG holen ihn runter.</li><li>**Büffel:** Herdentier. **Stampede:** Ab 3 Büffeln stürmen sie gemeinsam los und rammen alles um. Einzeln sind sie eher harmlos.</li></ul> |
| 34 | **Neue Kreaturen** (Mythisch):<ul><li>**Troll:** zäh mit Keule. Heilt sich ständig selbst, Feuer stoppt die Heilung.</li><li>**Zyklop:** mythische Artillerie. Wirft Felsbrocken im Bogen über alles hinweg, die Trümmer liegen lassen. Im Nahkampf unbeholfen.</li><li>**Hexe:** Fliegerin auf dem Besen mit einem normalen Angriffszauber. **Froschfluch:** verwandelt einen Gegner für ein paar Sekunden in einen harmlosen Frosch.</li><li>**Phönix:** Feuervogel mit Feuerspur. Steht einmal pro Schlacht aus seiner Asche wieder auf.</li><li>**Einhorn:** schneller Sturmläufer mit dem Horn voran. Heilt Verbündete in der Nähe ein wenig.</li></ul> |

**Einschränkungen:**
- Die Regeln aus den Entscheidungen 1–29 bleiben:
  - reine, deterministische Logikmodule;
  - gleiche Einheitenform beim Spawn;
  - 2.000 Einheiten mit 60 fps;
  - Sticker-Stil (#2);
  - Friendly Fire (#5): Flächenfähigkeiten treffen auch Eigene, sofern nicht anders gesagt;
  - Rückzug (#27);
  - Balance-Prüfung an allen 6 Fensterformen.
- Neue Einheiten sind in Missionen verfügbar, wenn deren Kategorie erlaubt ist (z. B. die neuen Tiere in „Wilde Jagd“). Keine neue Einheit darf eine Mission billig lösen: Je Mission wird geprüft, dass der Spam einer einzelnen neuen Einheit mit vollem Budget nicht ≥ 6/8 gewinnt, wo der bestehende Spam-Plan verlieren muss.
- Jede neue Einheit bekommt mindestens einen Konter, den sie schlägt, und einen, der sie schlägt, als Duell im Prüfstand.
- Tastenkürzel 1–9 je Kategorie: Mythisch bekommt 9 Einheiten (Magier, Geist, Drache, Vampir, Troll, Zyklop, Hexe, Phönix, Einhorn) und Tiere 8 (Wolf, Bär, Bienen, Elefant, Krokodil, Gorilla, Adler, Büffel). Ghule und Frösche sind nicht malbar.

**Festlegungen nach der Prüfung des Entwurfs.** Das sind Entscheidungen von Claude. Der Nutzer kann sie korrigieren.

1. **Vorrang der Zustände:** tot > betäubt oder fliegend > Schreck > Rückzug (#27) > laufende Fähigkeit > normales Verhalten. Das Fähigkeiten-Modul führt diesen Vorrang an einer Stelle.
   - Fliehende lösen keine Fähigkeit aus. Ausnahme ist die Fledermausform des Vampirs, die gerade die Flucht ist.
   - **Schreck** ist ein kurzer erzwungener Rückzug von 1,5–2,5 s, unabhängig vom Leben und ohne Erholung. Er kommt von Brüllen, Brustklopfen, Spuk und vom Elefanten vor Bienen.
2. **Friendly Fire:**
   - Schadensflächen treffen auch Eigene (#5): Feuerball, Meteor, Granaten, Sperrfeuer, Raketen und Felsbrocken.
   - Der Blitz springt nur auf Feinde.
   - Windstoß, Ramme, Trampeln und Stampede schieben alle Körper weg, verletzen aber nur Feinde.
   - Schreckwirkungen treffen nur Feinde, Heilungen nur Verbündete.
   - Der Magier wählt keinen Feuerball oder Meteor, wenn im Einschlagkreis mehr Eigene als Feinde stehen.
3. **Ghule und Frösche:**
   - **Ghule:**
     - Sie sind Einheiten in UNITS mit dem Merkmal „nicht malbar“ und zählen für Stärkebalken, Sieg und Niederlage wie normale Einheiten ihres Teams.
     - Nur der tödliche Biss eines Vampirs erzeugt einen Ghul. Das Opfer hinterlässt dann keine Leiche.
   - **Frösche:**
     - Der Frosch behält die LP des Opfers und wird danach wieder zur Einheit.
     - Immun sind Panzer, Hubschrauber, Drache und Elefant.
   - Beide erscheinen im Lexikon mit dem Hinweis, wie sie entstehen.
4. **Gruppen:**
   - Meteor: ab 3 Magiern innerhalb von 90 px. Sie kanalisieren 1,5 s und stehen dabei still. Der Zauber bricht ab, wenn weniger als 3 übrig sind. Jeder Teilnehmer bekommt 30 s Abklingzeit.
   - Büffel: Herden über die vorhandene Gruppierung wie beim Wolfsrudel. Die ganze Herde stürmt, danach hat sie 20 s Abklingzeit.
5. **Steinwand und Felsen:**
   - Die Steinwand setzt echte, vorübergehende Mauerzellen. Sie blockiert Bodentruppen, und das Flussfeld rechnet neu.
   - Sie wird nie auf Einheiten gesetzt. Nach etwa 12 s zerfällt sie in Brocken, die niemanden verletzen.
   - Felsbrocken des Zyklopen verletzen beim Einschlag. Die liegenbleibenden Trümmer sind nur optisch (#12).
6. **Flieger:**
   - Adler, Hexe und Phönix fliegen niedrig wie Bienen und Geist. Nahkämpfer erreichen sie. Nur der Hubschrauber bleibt für Nahkämpfer unerreichbar.
   - Die Wiedergeburt des Phönix zählt nicht als Tod für den Sieg. Sie gilt einmal je Phönix.
7. **Feuer:** Die vorhandenen Feuerarten (Feuerball, Drachenatem, Brand, Brandpfeile, Phönixspur) tragen ein gemeinsames Merkmal „Feuer“. Auch der Brand über Zeit zählt als Feuer: Er stoppt die Troll-Heilung und trifft den Vampir doppelt.
8. **Krokodil:** Im Wasser kann es erst anvisiert werden, wenn ein Feind näher als 60 px ist oder es gerade zugebissen hat. An Land ist es langsam und sichtbar. Es ist überall verfügbar, und seine Kosten spiegeln das wider.
9. **Kalibrierung:**
   - Werte und Abklingzeiten bestehender Einheiten dürfen angepasst werden, ebenso Budget und Par von Missionen. Der Inhalt der Missionen bleibt gleich.
   - Die Spam-Prüfung neuer Einheiten nutzt das Budget der jeweiligen Mission.

**Ansätze für die Fähigkeiten:**
- (a) **Gewählt:** ein eigenes reines Modul mit einer Tabelle je Einheit (Abklingzeit, Auslösebedingung, Wirkung). combat.think fragt es pro Einheit ab. Das hält combat.js überschaubar, macht die Fähigkeiten einzeln testbar, und die Karten (#29) lesen Name und Text daraus.
- (b) **Verworfen:** jede Fähigkeit einzeln in combat.think einbauen. combat.js ist schon groß, und Karten und Tests müssten die Texte doppelt führen.

**Dem Bauenden überlassen:**
- genaue Werte, Reichweiten, Dauer und Kosten (vom Prüfstand kalibriert);
- die Sticker-Gestaltung der neuen Figuren;
- welche vorhandenen Geräusche für die neuen Effekte genutzt werden.

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
