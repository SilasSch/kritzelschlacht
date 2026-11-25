# Kritzelschlacht-Relay

Online-Spiele außerhalb des Claude-Artefakts (itch.io) laufen über diesen Cloudflare-Worker. Er verteilt nur die
presence-Objekte der Spieler eines Raums (1v1, 2v2, Lobby) und speichert Bestenliste und König des Hügels.
Keine Accounts, keine persönlichen Daten: Spieler-ids sind Zufallsschlüssel aus dem Browser.

- `worker.js`: Klassen `Room` (ein Durable Object je Raum) und `Store` (eine Instanz, SQLite-Speicher)
- Client: `game/js/net.js` (`relayRoom`, `relayStore`), aktiv nur, wenn die Seite `window.KS_RELAY` setzt
  (das macht `tools/itch-zip.py`). Das Artefakt setzt es nie und nutzt weiter room/db.
- Deploy: `cd relay && npx wrangler deploy` (Cloudflare-Account von Silas, Free-Plan reicht)
- Lokal testen: `npx wrangler dev --port 8787`, dann `python3 tools/itch-zip.py ws://127.0.0.1:8787 /tmp/itch.zip`
  entpacken und per `python3 -m http.server` öffnen. Erlaubte Origins: itch.zone, itch.io, localhost.
