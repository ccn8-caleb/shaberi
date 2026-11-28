// How fast the model speaks. Faster earns more points, but the rhythm check gets
// stricter as it nears native speed.
//
//   scale:  VOICEVOX's own speed setting for the recordings (1 = the voice as is;
//           nothing else about its delivery is changed)
//   points: multiplier on the points a phrase earns
//   fit:    rhythm tolerance, as your time ÷ the model's time
//           min..max         full marks
//           fallFast/Slow    how far past min/max the score falls to zero

export const SPEEDS = [
  { id: 'slow', ja: 'ゆっくり', en: 'Slow', scale: 0.85, points: 0.8, fit: { min: 0.75, max: 1.45, fallFast: 0.45, fallSlow: 1.0 } },
  { id: 'normal', ja: 'ふつう', en: 'Normal', scale: 1, points: 1, fit: { min: 0.8, max: 1.3, fallFast: 0.4, fallSlow: 0.9 } },
  { id: 'quick', ja: 'はやめ', en: 'Quick', scale: 1.12, points: 1.25, fit: { min: 0.85, max: 1.2, fallFast: 0.3, fallSlow: 0.6 } },
  { id: 'native', ja: 'ネイティブ', en: 'Native', scale: 1.25, points: 1.5, fit: { min: 0.9, max: 1.12, fallFast: 0.2, fallSlow: 0.4 } },
];

export const DEFAULT_SPEED = 'normal';

export const speedById = (id) => SPEEDS.find((s) => s.id === id) || SPEEDS.find((s) => s.id === DEFAULT_SPEED);

// One step slower / faster (stays put at the ends).
export function step(id, by) {
  const i = SPEEDS.findIndex((s) => s.id === speedById(id).id);
  return SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + by))].id;
}
