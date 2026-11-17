// Wann zeigt die Leiste welche Charakterkarte (Spez. #29, Nachtrag 5, #43)? Rein, kein DOM: ui.js meldet die
// Zeiger- und Fensterereignisse und fragt mit cardKey, welche Einheit die Karte gerade zeigt (oder null).
//
// - Hover hat Vorrang: über einem Einheitenknopf zeigt die Karte diese Einheit.
// - Lücken zwischen den Knöpfen (Zeiger über der Leiste, aber auf keinem Knopf): die Karte bleibt GAP_MS lang, damit
//   sie beim Wechsel zum Nachbarknopf nicht flackert; bleibt der Zeiger in der Lücke, verschwindet sie.
// - Verlässt der Zeiger die Leiste, das Fenster oder die Seite, verliert das Fenster den Fokus, wird gescrollt,
//   die Größe geändert oder auf dem Feld gemalt: Hover endet sofort (hoverEnd).
// - Eine neue Auswahl (Klick, Taste, Kategorie) zeigt ihre Karte SEL_SHOW_MS lang, wenn kein Hover aktiv ist.
//   Malen auf dem Feld beendet auch das (paint).
export const SEL_SHOW_MS = 4500, GAP_MS = 150;

export const createCardHover = () => ({ hoverK: null, gapUntil: 0, selUntil: 0 });

// Zeiger über einem Knopf der Einheit k, oder über der Leiste ohne Knopf (k null: Lücke)
export function hoverOver(s, k, now) {
  if (k) { s.hoverK = k; s.gapUntil = 0; }
  else if (s.hoverK && !s.gapUntil) s.gapUntil = now + GAP_MS;
}
// Zeiger hat die Leiste verlassen, Fenster ohne Fokus, Scrollen, Größenänderung
export function hoverEnd(s) { s.hoverK = null; s.gapUntil = 0; }
// Neue Auswahl: Karte SEL_SHOW_MS lang
export function selected(s, now) { s.selUntil = now + SEL_SHOW_MS; }
// Malen auf dem Feld: alles aus
export function paint(s) { hoverEnd(s); s.selUntil = 0; }

// Einheit, die die Karte jetzt zeigt (sel: aktuelle Auswahl), oder null
export function cardKey(s, sel, now) {
  if (s.gapUntil && now >= s.gapUntil) hoverEnd(s);
  if (s.hoverK) return s.hoverK;
  return now < s.selUntil ? sel : null;
}
// ms bis zur nächsten Änderung ohne neues Ereignis (Ende der Lücke oder der Auswahlanzeige), sonst -1
export function nextChange(s, now) {
  let t = Infinity;
  if (s.gapUntil > now) t = s.gapUntil - now;
  if (!s.hoverK && s.selUntil > now) t = Math.min(t, s.selUntil - now);
  return t === Infinity ? -1 : t;
}
