#!/usr/bin/env python3
"""Baut das HTML5-ZIP für itch.io (25.11.).

    python3 tools/itch-zip.py [relay-url] [out.zip]      (ohne relay-url: RELAY unten)

Nimmt game/ wie es ist (lokale Schriften und vendor/pixi.min.js sind auf itch.io erlaubt, anders als im Claude-Artefakt)
und setzt vor main.js window.KS_RELAY, damit Online 1v1 über den eigenen Relay (relay/worker.js) läuft.
index.html liegt im Wurzelverzeichnis des ZIPs. itch-Limits: ≤ 1000 Dateien, ≤ 500 MB, Pfade ≤ 240 Zeichen.
"""
import re, sys, zipfile
from pathlib import Path

# Adresse des Relays auf Silas' Cloudflare-Account (relay/worker.js)
RELAY = 'wss://kritzelschlacht-relay.kritzelschlacht.workers.dev'
ROOT = Path(__file__).resolve().parent.parent / 'game'
relay = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] else RELAY
out = Path(sys.argv[2] if len(sys.argv) > 2 else 'dist/kritzelschlacht-itch.zip')
if not re.fullmatch(r'wss://[a-z0-9.-]+(:\d+)?/?|ws://(localhost|127\.0\.0\.1)(:\d+)?/?', relay):
    sys.exit('Relay-URL fehlt oder ist ungültig (wss://…)')

html = (ROOT / 'index.html').read_text(encoding='utf-8')
tag = '<script type="module" src="js/main.js"></script>'
assert tag in html, 'main.js-Tag nicht gefunden'
html = html.replace(tag, f'<script>window.KS_RELAY = {relay.rstrip("/")!r};</script>\n{tag}'.replace("'", '"'))

files = sorted(p for p in ROOT.rglob('*') if p.is_file() and not p.name.startswith('.'))
assert len(files) < 1000, f'{len(files)} Dateien, itch erlaubt 1000'
out.parent.mkdir(parents=True, exist_ok=True)
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for p in files:
        rel = p.relative_to(ROOT).as_posix()
        assert len(rel) <= 240, rel
        if rel == 'index.html': z.writestr(rel, html)
        else: z.write(p, rel)
print(f'{out}: {len(files)} Dateien, {out.stat().st_size // 1024} KB, Relay {relay}')
