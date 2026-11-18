// Bonus-Ziele je Level (Audit 18.11.): drei Medaillen zusätzlich zu den Sternen, für jedes Level gleich. Rein: kein DOM.
// Im Spielstand als Bitmaske je Level-id (save.medals), einmal verdient bleibt eine Medaille.
export const MEDALS = [
  { id: 'verlustarm', icon: '🛡', n: 'Verlustarm', d: 'Gewinne mit höchstens 25 % Verlusten.', test: r => r.lost <= r.deployed * .25 },
  { id: 'blitz', icon: '⚡', n: 'Blitzsieg', d: 'Gewinne in höchstens 45 Sekunden.', test: r => r.time <= 45 },
  { id: 'spezialist', icon: '🎯', n: 'Spezialist', d: 'Gewinne mit höchstens zwei Einheitentypen.', test: r => r.types <= 2 },
];
export const ALL_MEDALS = (1 << MEDALS.length) - 1;

// r = { win, lost (eigene Verluste), deployed (eingesetzte Einheiten), time (s), types (verschiedene Einheitentypen) }
// Liefert die Bitmaske der in diesem Kampf verdienten Medaillen (nur bei Sieg).
export function earnedMedals(r) {
  if (!r.win || !(r.deployed > 0)) return 0;
  return MEDALS.reduce((m, x, i) => (x.test(r) ? m | (1 << i) : m), 0);
}
export const medalCount = mask => MEDALS.reduce((n, _, i) => n + ((mask >> i) & 1), 0);
export const hasMedal = (mask, i) => !!((mask >> i) & 1);
