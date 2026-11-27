// A run: a handful of random phrases, scored one by one, with a combo multiplier.
// Pure (no DOM, no storage) so it's tested under Node.

export const RUN_LENGTH = 5;
export const COMBO_SCORE = 75; // this score or better keeps the combo going
export const MAX_COMBO_BONUS = 10; // ×2.0 at a 10-phrase combo

// Small seeded PRNG (mulberry32), so a run can be replayed from its seed
// (and a daily run can be the same for everyone).
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// "2026-11-26" -> a stable seed.
export function dateSeed(date = new Date()) {
  const key = `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
  let h = 2166136261;
  for (const ch of key) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

// n distinct phrases (all of them if there are fewer).
export function pickPhrases(phrases, seed, n = RUN_LENGTH) {
  const rand = rng(seed);
  const pool = [...phrases];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

export const multiplier = (combo) => 1 + Math.min(combo, MAX_COMBO_BONUS) * 0.1;

const GRADE_BONUS = { S: 50, A: 20, B: 0, C: 0, D: 0 };

export function newRun(phrases, seed = (Math.random() * 2 ** 32) >>> 0) {
  return { seed, phrases: pickPhrases(phrases, seed), index: 0, combo: 0, maxCombo: 0, points: 0, results: [] };
}

// Points an attempt is worth before the combo: score + grade bonus, times the speed
// multiplier it was spoken at (result.speedPoints, from game/speed.js).
export const basePoints = (result) => (result.total + GRADE_BONUS[result.grade]) * (result.speedPoints ?? 1);

// Commit a phrase's final attempt. Returns the points it earned.
// The multiplier uses the combo going into this phrase, plus this one if it counts.
export function commit(run, result) {
  const keeps = result.total >= COMBO_SCORE;
  run.combo = keeps ? run.combo + 1 : 0;
  run.maxCombo = Math.max(run.maxCombo, run.combo);
  const earned = Math.round(basePoints(result) * multiplier(run.combo));
  run.points += earned;
  run.results.push({ id: run.phrases[run.index].id, total: result.total, grade: result.grade, earned, combo: run.combo });
  run.index++;
  return earned;
}

export const isOver = (run) => run.index >= run.phrases.length;
