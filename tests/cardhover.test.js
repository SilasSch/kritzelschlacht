// Charakterkarte in der Leiste (Nachtrag 5, #43): die Karte beim Drüberfahren verschwindet zuverlässig, sobald der
// Zeiger den Knopf oder die Leiste verlässt; eine Auswahl zeigt ihre Karte weiter SEL_SHOW_MS lang (cardhover.js, rein).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createCardHover, hoverOver, hoverEnd, selected, paint, cardKey, nextChange, SEL_SHOW_MS, GAP_MS } from '../game/js/cardhover.js';

test('Hover zeigt die Einheit unter dem Zeiger, Verlassen der Leiste blendet sofort aus', () => {
  const s = createCardHover();
  assert.equal(cardKey(s, 'krieger', 0), null, 'ohne Hover und Auswahl nichts');
  hoverOver(s, 'ritter', 10);
  assert.equal(cardKey(s, 'krieger', 20), 'ritter');
  hoverOver(s, 'reiter', 30);
  assert.equal(cardKey(s, 'krieger', 40), 'reiter', 'Nachbarknopf');
  hoverEnd(s);
  assert.equal(cardKey(s, 'krieger', 41), null, 'Leiste verlassen');
  assert.equal(nextChange(s, 41), -1, 'kein Zeitgeber nötig');
});

test('Lücke zwischen den Knöpfen: kurz halten (kein Flackern), dann ausblenden', () => {
  const s = createCardHover();
  hoverOver(s, 'ritter', 0);
  hoverOver(s, null, 100);                       // Zeiger in der Lücke
  assert.equal(cardKey(s, 'krieger', 100 + GAP_MS - 1), 'ritter', 'kurz noch da');
  assert.equal(nextChange(s, 100), GAP_MS, 'Zeitgeber bis zum Ende der Lücke');
  hoverOver(s, null, 120);                       // weitere Bewegung in der Lücke verlängert nicht
  assert.equal(cardKey(s, 'krieger', 100 + GAP_MS), null, 'bleibt der Zeiger in der Lücke: weg');
  hoverOver(s, 'ritter', 400); hoverOver(s, null, 410); hoverOver(s, 'reiter', 450);
  assert.equal(cardKey(s, 'krieger', 1000), 'reiter', 'Nachbarknopf erreicht: Lücke vergessen');
});

test('Auswahl zeigt ihre Karte SEL_SHOW_MS lang, Hover hat Vorrang, Malen blendet alles aus', () => {
  const s = createCardHover();
  selected(s, 1000);                              // Taste oder Kategorie, Zeiger nicht über der Leiste
  assert.equal(cardKey(s, 'krieger', 1001), 'krieger');
  assert.equal(nextChange(s, 1300), SEL_SHOW_MS - 300);
  assert.equal(cardKey(s, 'krieger', 1000 + SEL_SHOW_MS), null, 'nach SEL_SHOW_MS weg');
  hoverEnd(s);                                    // Scrollen o. ä. ohne Hover: harmlos
  selected(s, 2e4); hoverOver(s, 'reiter', 2e4 + 1); paint(s);
  assert.equal(cardKey(s, 'krieger', 2e4 + 2), null, 'Malen: alles aus');
});

test('Angeklickte Einheit: Karte verschwindet sofort, wenn der Zeiger die Leiste verlässt', () => {
  const s = createCardHover();
  hoverOver(s, 'ritter', 1000);
  selected(s, 1010);                              // Klick auf den Knopf unter dem Zeiger
  assert.equal(cardKey(s, 'ritter', 1100), 'ritter');
  hoverEnd(s);                                    // Leiste verlassen
  assert.equal(cardKey(s, 'ritter', 1101), null, 'nicht mehr SEL_SHOW_MS lang stehen bleiben');
  assert.equal(nextChange(s, 1101), -1);
  hoverOver(s, 'reiter', 2000); selected(s, 2001); hoverOver(s, null, 2100);   // Klick, dann Lücke
  assert.equal(cardKey(s, 'reiter', 2100 + GAP_MS), null, 'Lücke abgelaufen: auch weg');
});
