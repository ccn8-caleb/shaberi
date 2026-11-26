// 散歩しましょう！ (Let's Take a Walk!): one phrase, faster every round. The model
// says it, you repeat it before the fuse burns out. Miss and the proctor takes your
// pencil (3 pencils = 3 lives). Pure rules; the page runs the show.
//
// The phrase is the well-known sound-check line from the JLPT listening section.

import { phraseMora } from '../engine/mora.js';
import { wordsScore } from '../engine/score.js';

export const PHRASE = {
  id: 'sanpo',
  text: '天気がいいから散歩しましょう',
  units: [['てんきが', 1], ['いいから', 1], ['さんぽしましょう', 6]],
  alt: ['天気が良いから散歩しましょう', '天気がいいからさんぽしましょう'],
  en: 'The weather’s nice, so let’s go for a walk.',
};
export const MORA = phraseMora(PHRASE.units);

export const LIVES = 3;
export const MAX_SPEED = 2.2;
export const MAX_RATIO = 1.5; // you may take up to 1.5× the model's time
export const MIN_RATIO = 0.45; // shorter than this: you didn't say all of it
export const WORDS_PASS = 0.7;

// Model speed for a round (0-based): ×0.9, ×1.0, ×1.1 … up to ×2.2.
export const speedAt = (round) => Math.min(MAX_SPEED, Math.round((0.9 + 0.1 * round) * 10) / 10);

// Estimated model duration when the voice can't report it (≈7 mora/s at ×1).
export const estimateDuration = (speed) => MORA.length / (7 * speed);

// Seconds the player gets: time to react, then up to MAX_RATIO of the model.
export const timeLimit = (modelDuration) => 1 + modelDuration * MAX_RATIO + 0.6;

// Did this take keep up? reason: null when ok, else 'silent' | 'partial' | 'slow' | 'words'.
export function judgeTake({ analysis, heard, modelDuration }) {
  if (!analysis.span) return { ok: false, reason: 'silent', ratio: 0, words: null };
  const ratio = (analysis.span.end - analysis.span.start) / modelDuration;
  const words = wordsScore(heard, PHRASE).score;
  let reason = null;
  if (ratio < MIN_RATIO) reason = 'partial';
  else if (ratio > MAX_RATIO) reason = 'slow';
  else if (words !== null && words < WORDS_PASS) reason = 'words';
  return { ok: reason === null, reason, ratio, words };
}

export const payout = (cleared) => cleared * 20 + Math.max(0, cleared - 8) * 10;
