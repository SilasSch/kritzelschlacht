# Videos (Remotion)

Trailer und Clips für X und itch.io, gebaut mit [Remotion](https://www.remotion.dev/) (Videos aus React-Code).
Liegt bewusst außerhalb von `game/`: das Spiel selbst braucht keinen Build-Schritt und lädt nichts von hier.

## Ablauf

```bash
cd video
npm install
node capture.mjs            # Spielszenen aufnehmen -> public/clips/*.mp4 (alle aus clips.mjs)
node capture.mjs romans     # nur eine Szene
npm run studio              # Vorschau im Browser, Texte und Timing live ändern
npm run render              # out/trailer.mp4, 1920x1080, H.264
npm run render:vertical     # out/trailer-vertical.mp4, 1080x1920
```

Braucht Node 20+, ffmpeg und Playwright mit Chromium (lokal oder global installiert).

## Wie die Spielszenen entstehen

`capture.mjs` öffnet `game/index.html?debug` in einem Headless-Chromium und ersetzt die Uhr der Seite
(`performance.now`, `Date.now`, `requestAnimationFrame`). Jedes Bild ist genau 1/30 s Spielzeit, egal wie langsam
der Browser zeichnet. Die Schlachten sind deterministisch, eine Szene sieht bei jeder Aufnahme gleich aus.
Die Szenen stehen in `clips.mjs`: Armeen (`place(type, n, x0, y0, x1, y1, team)`), Wetter, Kamerafahrt,
oder Mausstriche zum Malen (`paint`).

## Schnitt

`src/Trailer.jsx`, Liste `SHOTS`: Reihenfolge, Länge, Clip-Ausschnitt und Text jedes Shots.
Texte im Video sind Englisch. Hoch- und Querformat kommen aus derselben Liste.

## Lizenz

Remotion ist nicht Open Source, sondern hat eine eigene Lizenz: kostenlos für Einzelpersonen und Firmen bis
3 Personen, sonst Company License (https://www.remotion.dev/docs/license). Unser Code hier steht wie das Repo unter MIT.
Die Schriften in `public/fonts` sind die des Spiels (SIL OFL, Lizenztexte daneben).
