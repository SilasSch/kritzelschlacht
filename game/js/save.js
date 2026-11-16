// Spielstand (rein, kein DOM): Schlüssel und Format wie im alten Spiel, { stars: { missionIndex: 1..3 }, muted }.
// main.js liest und schreibt localStorage[SAVE_KEY] damit.
export const SAVE_KEY = 'kritzelschlacht-v1';

// Text aus localStorage (oder null) → Spielstand; Unlesbares ergibt den leeren Stand.
export function parseSave(text) {
  const save = { stars: {}, muted: false };
  try {
    const s = JSON.parse(text || 'null');
    if (s && typeof s === 'object' && !Array.isArray(s)) Object.assign(save, s);
  } catch (e) { /* kein oder kaputter Speicher */ }
  if (!save.stars || typeof save.stars !== 'object' || Array.isArray(save.stars)) save.stars = {};
  return save;
}

export const serializeSave = save => JSON.stringify({ stars: save.stars, muted: save.muted });
