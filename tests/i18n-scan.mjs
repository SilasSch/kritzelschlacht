// Quelltext-Scanner für tests/i18n.test.js: findet die Schlüssel in tr('…')-Aufrufen und deutsche Texte, die nicht in
// tr stehen. Kleiner JS-Tokenizer (Kommentare, Strings, Template-Literale mit ${…}, Regex-Literale), kein Parser.
// Liefert { keys: [{ s, line }], loose: [{ s, line }] }: keys sind feste Strings direkt in tr(...) (auch beide Zweige
// eines ?:), ohne die im Objekt der Platzhalter ({ … }) und ohne Vergleiche ('blau' === …); loose sind alle übrigen
// festen Texte (bei Templates die Teile außerhalb von ${…}).
export function scanSource(src) {
  const keys = [], loose = [];
  let i = 0, line = 1;
  const n = src.length;
  // Aufrufstapel: { tr: bool, depth (Klammern seit dem Aufruf), brace (geschweifte Klammern im Aufruf) }
  const calls = [];
  let prevSig = '';      // letztes bedeutsames Zeichen im Code (für Regex-Erkennung)
  let prevWord = '';
  const inTr = () => { const c = calls[calls.length - 1]; return !!c && c.tr && c.brace === 0; };
  const anyTr = () => calls.some(c => c.tr);
  function readString(q) {
    const before = /(===|!==|==|!=)\s*$/.test(src.slice(Math.max(0, i - 6), i)), l0 = line; i++;
    let s = '';
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') { s += src[i + 1] === 'n' ? '\n' : src[i + 1]; i += 2; continue; }
      if (src[i] === '\n') line++;
      s += src[i++];
    }
    i++;
    const after = /^\s*(===|!==|==|!=)/.test(src.slice(i, i + 6));
    return { s, line: l0, cmp: before || after };
  }
  function emit(tok, isKey) {
    if (isKey && !tok.cmp) keys.push({ s: tok.s, line: tok.line });
    else if (!anyTr()) loose.push({ s: tok.s, line: tok.line });
  }
  // Template-Literal ab src[i] === '`'; Teile außerhalb von ${…} sind Text, ${…} wird als Code gelesen
  function readTemplate() {
    const l0 = line; i++;
    let s = '', parts = [], hasExpr = false;
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { s += src[i + 1]; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        hasExpr = true; parts.push(s); s = ''; i += 2;
        const save = calls.slice();
        code('}');
        calls.length = 0; calls.push(...save);
        i++;   // }
        continue;
      }
      if (src[i] === '\n') line++;
      s += src[i++];
    }
    i++;
    parts.push(s);
    return { s: hasExpr ? null : parts[0], parts, line: l0, cmp: false };
  }
  function code(stop) {
    let braces = 0;
    while (i < n) {
      const ch = src[i];
      if (stop && ch === '}' && braces === 0) return;
      if (ch === '\n') { line++; i++; continue; }
      if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
      if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
      if (ch === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); for (let k = i; k < (e < 0 ? n : e); k++) if (src[k] === '\n') line++; i = e < 0 ? n : e + 2; continue; }
      if (ch === '/' && (/[(,=:[!&|?{};+\-*%<>~^]/.test(prevSig) || prevSig === '' || /^(return|typeof|case|in|of)$/.test(prevWord))) {
        // Regex-Literal
        i++; let cls = false;
        while (i < n) { const c = src[i]; if (c === '\\') { i += 2; continue; } if (c === '[') cls = true; else if (c === ']') cls = false; else if (c === '/' && !cls) break; else if (c === '\n') break; i++; }
        i++; while (/[a-z]/i.test(src[i] || '')) i++;
        prevSig = ')'; prevWord = ''; continue;
      }
      if (ch === "'" || ch === '"') {
        const key = inTr();
        const t = readString(ch);
        emit(t, key);
        prevSig = 'a'; prevWord = ''; continue;
      }
      if (ch === '`') {
        const key = inTr();
        const t = readTemplate();
        if (t.s !== null) emit(t, key);
        else if (!anyTr()) for (const p of t.parts) loose.push({ s: p, line: t.line, tpl: true });
        prevSig = 'a'; prevWord = ''; continue;
      }
      if (/[A-Za-z_$]/.test(ch)) {
        let w = ''; while (i < n && /[\w$]/.test(src[i])) w += src[i++];
        prevWord = w; prevSig = 'a';
        if (w === 'tr' && src[i - 3] !== '.') {
          let k = i; while (src[k] === ' ') k++;
          if (src[k] === '(') { i = k + 1; calls.push({ tr: true, depth: 0, brace: 0 }); prevSig = '('; }
        }
        continue;
      }
      if (ch === '(') { const c = calls[calls.length - 1]; if (c) c.depth++; calls.push({ tr: false, depth: 0, brace: 0, plain: true }); }
      else if (ch === ')') {
        const c = calls.pop();
        if (c && c.plain) { const p = calls[calls.length - 1]; if (p) p.depth--; }
      } else if (ch === '{') { braces++; const c = calls[calls.length - 1]; if (c) c.brace++; }
      else if (ch === '}') { braces--; const c = calls[calls.length - 1]; if (c) c.brace--; }
      prevSig = ch; prevWord = ''; i++;
    }
  }
  code(null);
  return { keys, loose };
}

// Sieht der Text wie deutscher Spieltext aus? (Umlaute, deutsche Anführungszeichen oder typische Wörter)
const DE_WORDS = /(^|[^A-Za-zÄÖÜäöüß])(der|die|das|und|nicht|mit|ist|ein|eine|einen|zu|auf|für|von|im|den|dem|des|wird|bitte|noch|kein|keine|Gegner|Einheit|Einheiten|Punkte|Runde|Male|malt|Code|zuerst|gewinnt|Armee)(?![A-Za-zÄÖÜäöüß])/;
export function looksGerman(s) {
  const t = String(s).replace(/<[^>]*>/g, ' ').replace(/&\w+;/g, ' ');
  if (!/[A-Za-zÄÖÜäöüß]{2,}/.test(t)) return false;
  if (/[{};]\s*$/.test(t.trim()) && /[:;{]/.test(t)) return false;   // CSS
  return /[äöüÄÖÜß„“]/.test(t) || DE_WORDS.test(t);
}
