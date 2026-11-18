# Baut die Seiten fürs Claude-Artefakt aus game/index.html: ohne Dokumentgerüst, Schriften von Google Fonts, Pixi von cdnjs.
# Aufruf: python3 tools/artifact-pages.py game/index.html <öffentlich.html> <live.html>  (siehe README)
import re,sys
src,pub,live=sys.argv[1:4]
s=open(src).read()
for t in ['<!doctype html>\n','<html lang="de">\n','<head>\n','<meta charset="utf-8">\n','</head>\n','</body>\n','</html>\n']:
    s=s.replace(t,'',1)
s=re.sub(r'<meta name="viewport"[^>]*>\n','',s,count=1)
s=re.sub(r'<body[^>]*>\n','',s,count=1)
s=re.sub(r"/\* Schriften liegen im Repo.*?\*/\n","",s,count=1,flags=re.S)
s=re.sub(r"@font-face\{[^}]*\}\n","",s)
s=s.replace('<meta name="claude:viewport-fit-sides" content="cover">\n','<meta name="claude:viewport-fit-sides" content="cover">\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Luckiest+Guy&family=Nunito:wght@600;700;800&display=swap">\n',1)
s=s.replace('<script src="vendor/pixi.min.js"></script>','<script src="https://cdnjs.cloudflare.com/ajax/libs/pixi.js/7.4.2/pixi.min.js"></script>')
assert '@font-face' not in s and 'cdnjs' in s and '<body' not in s
open(pub,'w').write(s)
open(live,'w').write(s.replace('<title>Kritzelschlacht</title>','<title>Kritzelschlacht Live</title>',1))
