# Kampagne: Anleitung für Kapitel-Autoren

Die Kampagne (Spez. #52) besteht aus Kapiteln. Jedes Kapitel ist **eine eigene Datei** in `game/js/campaign/`:

| Datei | Kapitel | id-Präfix |
|---|---|---|
| `grundausbildung.js` | Grundausbildung (die alten 9 Missionen, nicht ändern) | `ga-` |
| `burgen.js` | Burgen & Ritter | `burg-` |
| `rom.js` | Rom gegen die Barbaren | `rom-` |
| `wildnis.js` | Wildnis | `wild-` |
| `akademie.js` | Magierakademie | `aka-` |
| `vampire.js` | Nacht der Vampire | `vamp-` |
| `modern.js` | Moderner Krieg | `mod-` |
| `finale.js` | Finale | `fin-` |

Wer ein Kapitel baut, ändert nur seine eigene Datei. `campaign/index.js` lädt alle Kapitel schon in der richtigen Reihenfolge. Ein Kapitel ohne Level zeigt in der Übersicht „Bald verfügbar“.

```js
import { F, B, Md, Deep } from './areas.js';

export default {
  id: 'burgen', n: 'Burgen & Ritter', d: 'Kurze Beschreibung für die Kapitelkarte.',
  levels: [ /* 4–5 Level */ ],
};
```

## Felder eines Levels

| Feld | Pflicht | Bedeutung |
|---|---|---|
| `id` | ja | Feste id, z. B. `'burg-1'`. An ihr hängen die Sterne im Spielstand. Nach dem Veröffentlichen nie mehr ändern. |
| `n` | ja | Name, z. B. `'Das Tor'`. |
| `hint` | ja | Ein bis zwei Sätze Hinweis in der Missionsleiste. Er nennt die erlaubten Einheiten und deutet die Lösung an. |
| `budget` | ja | Punktebudget des Spielers. |
| `par` | ja | Drei Sterne bei höchstens `par` Punkten, zwei bei höchstens 1,25 × `par`. Es gilt `par ≤ budget`. |
| `place` | ja | Gegner (Team Rot) und Gelände, wie in `data.js` `MISSIONS`. x ist ein Anteil des Missionsrahmens, y ein Anteil der Höhe, Radien sind Anteile der Höhe. Möglich sind `['rect', typ, n, x0, y0, x1, y1]`, `['circle', typ, n, cx, cy, r]`, `['unit', typ, x, y]`, `['tRect', gelände, x0, y0, x1, y1]` und `['tCircle', gelände, cx, cy, r, innen?]`. Gelände: `wasser`, `wald`, `lava`, `mauer`. Der Spieler malt nur links von x = 0,42. Gegner gehören rechts davon hin. |
| `units` | empfohlen | Erlaubte Einheitentypen, z. B. `['ritter', 'schuetze', 'grenadier']`. Nur diese erscheinen in der Malleiste, die Tasten 1–9 folgen den sichtbaren Plätzen, und nur diese lassen sich stempeln. |
| `cats` | nein | Erlaubte Kategorien: `armee`, `tiere`, `mythisch`, `modern`, `gelaende`. Sind `units` und `cats` beide gesetzt, muss eine Einheit beide erfüllen. **Gelände** hängt nur an `cats`: Ohne `cats` darf der Spieler Gelände malen. Mit `cats` darf er es nur, wenn `'gelaende'` darin steht. Der Radierer geht immer. |
| `plan` | ja | Lösungsplan für die Balance-Prüfung: `{ smart: [...], spam: [...] }`, siehe unten. `spam` ist optional. |
| `answer` | nein | Einheiten, die als Masse die gewollte Lösung sind, z. B. `['zyklop']`. Für sie gilt die Spam-Regel nicht. |
| `spamMustLose` | nein | Standard `true`: Der Spam-Plan und jede einzelne erlaubte Einheit mit vollem Budget müssen verlieren. Nur in begründeten Ausnahmen `false` setzen. |

Nur in der Grundausbildung gibt es außerdem `spamMustWin` (M1) und `spamMaxWins` (M3).

## Einen Lösungsplan schreiben

Ein Plan ist eine Liste blauer Rechtecke `[typ, anzahl, x0, y0, x1, y1]`. Die Koordinaten haben dasselbe Format wie bei `place`. In `areas.js` stehen fertige Rechtecke: `F` (Front), `Md` (Mitte), `B` (hinten) und `Deep` (ganz hinten, über die ganze Höhe).

```js
plan: {
  smart: [['ritter', 8, ...F], ['schuetze', 10, ...B]],   // die gewollte Lösung, kostet höchstens par
  spam: [['krieger', 45, ...F]],                         // billige Masse, muss verlieren
},
```

- **smart** ist die Lösung, die der Hinweis meint. Sie kostet höchstens `par` und nutzt nur erlaubte Einheiten. Die Kosten sind die Summe aus Anzahl × `UNITS[typ].cost`.
- **spam** ist die naheliegende, dumme Lösung, meist viel von der billigsten erlaubten Einheit an der Front.
- Erst die Gegner bauen, dann den Smart-Plan finden, dann `par` knapp über die Kosten des Smart-Plans setzen. `budget` liegt etwa bei 1,3–1,5 × `par`.
- Hilft eine Einheit nur in einer bestimmten Aufstellung, gehört das in den `hint`, etwa „hinten und breit verteilt“.

## Prüfen

Die Datenprüfung und alle Tests laufen mit:

```sh
node --test tests/*.test.js
```

Der Test `Kapiteldaten sind gültig` prüft ids, Pflichtfelder, `place`, erlaubte Einheiten im Plan und ob smart höchstens `par` kostet.

Die Balance-Prüfung läuft nur für das eigene Kapitel. Während der Arbeit genügt eine Form, vor dem Abschluss müssen alle 6 Formen bestehen:

```sh
node tools/balance.mjs missions 8 1400x875 --chapter=burgen   # schnell, eine Form
node tools/balance.mjs newspam 8 1400x875 --chapter=burgen
node tools/balance.mjs missions 8 --chapter=burgen             # alle 6 Formen parallel
node tools/balance.mjs newspam 8 --chapter=burgen
```

- `missions` spielt `plan.smart` und `plan.spam`, je 8 Läufe. Die Spalten sind Name, Siege/Läufe und Kosten, beim Smart-Plan dazu die mittlere Kampfdauer.
- `newspam` setzt jede einzelne erlaubte Einheit mit vollem Budget an die Front. Mit `SPAM_TYPES=ritter,krieger` (Umgebungsvariable) prüft es nur diese Typen.
- Der Exitcode ist 0, wenn alles besteht. Zeilen mit `FAIL` nennen den Grund.

## Regeln für neue Kapitel

1. **Thema wie in der Spez.:** Burgen & Ritter, Rom gegen die Barbaren, Wildnis, Magierakademie, Nacht der Vampire, Moderner Krieg, Finale. Gegner, Gelände und erlaubte Einheiten passen zum Thema.
2. **4–5 Level je Kapitel**, aufeinander aufbauend und steigend schwer. Das erste Level führt das Thema ein, das letzte verlangt alles, was das Kapitel gelehrt hat.
3. **Einheiten einschränken:** Jedes Level setzt `units` (oder `cats`). Die Auswahl ist klein genug, dass der Spieler nachdenken muss.
4. **Smart gewinnt:** `plan.smart` gewinnt an **allen 6 Formen mindestens 6/8** und kostet **höchstens `par`**.
5. **Spam verliert:** `plan.spam` verliert mindestens 6/8. In `newspam` verliert jede erlaubte Einheit allein mit vollem Budget mindestens 6/8. Ausgenommen ist nur eine Einheit, die als Masse wirklich die Lösung ist; sie steht dann in `answer`.
6. **Nichts außerhalb der eigenen Datei ändern.** Gibt es Fehler in Einheiten oder Engine, werden sie gemeldet und nicht im Kapitel umgangen.
