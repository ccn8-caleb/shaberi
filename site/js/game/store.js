// Progress, kept in this browser (no account).
//
//   points:  spendable balance (practice and games add, unlocks spend)
//   earned:  lifetime points (never goes down)
//   bestRun, runs, bests: practice runs and each phrase's best score
//   streak:  { days, last: 'YYYY-MM-DD' } days in a row with a practice run
//   unlocked: arcade cabinet ids;  highs: { cabinetId: best score }

import { STORAGE_KEYS, SCHEMA_VERSION } from '../core/constants.js';

const empty = () => ({
  v: SCHEMA_VERSION,
  points: 0,
  earned: 0,
  bestRun: 0,
  runs: 0,
  bests: {},
  streak: { days: 0, last: null },
  unlocked: [],
  highs: {},
});

// v1 (the first PoC) had no spending: its points were all earned.
function migrate(data) {
  if (data.v === 1) data = { ...data, v: 2, earned: data.points };
  return data;
}

export function load() {
  try {
    const data = migrate(JSON.parse(localStorage.getItem(STORAGE_KEYS.PROGRESS)));
    if (data && data.v === SCHEMA_VERSION) return { ...empty(), ...data };
  } catch (_) {}
  return empty();
}

function save(p) {
  try {
    localStorage.setItem(STORAGE_KEYS.PROGRESS, JSON.stringify(p));
  } catch (_) {}
}

export const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Today's streak as it would be shown now (a missed day shows 0 until you play).
export function currentStreak(p, now = new Date()) {
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  return p.streak.last === dayKey(now) || p.streak.last === dayKey(y) ? p.streak.days : 0;
}

// The day's first practice run earns a bonus that grows with the streak it extends.
export const dailyBonus = (streakDays) => 50 + 10 * Math.min(streakDays - 1, 10);
export const hasPracticedToday = (p, now = new Date()) => p.streak.last === dayKey(now);

// Record a finished practice run. Returns { progress, newBest, bonus }.
export function recordRun(run, now = new Date()) {
  const p = load();
  const newBest = run.points > p.bestRun;
  if (newBest) p.bestRun = run.points;
  p.runs += 1;
  run.results.forEach((r) => (p.bests[r.id] = Math.max(p.bests[r.id] || 0, r.total)));
  let bonus = 0;
  if (!hasPracticedToday(p, now)) {
    p.streak = { days: currentStreak(p, now) + 1, last: dayKey(now) };
    bonus = dailyBonus(p.streak.days);
  }
  p.points += run.points + bonus;
  p.earned += run.points + bonus;
  save(p);
  return { progress: p, newBest, bonus };
}

// Spend points on a cabinet. Returns false if already unlocked or not enough points.
export function unlock(id, cost) {
  const p = load();
  if (p.unlocked.includes(id) || p.points < cost) return false;
  p.points -= cost;
  p.unlocked.push(id);
  save(p);
  return true;
}

// Record an arcade game. Returns { progress, newHigh }.
export function recordGame(id, score, points) {
  const p = load();
  const newHigh = score > (p.highs[id] || 0);
  if (newHigh) p.highs[id] = score;
  p.points += points;
  p.earned += points;
  save(p);
  return { progress: p, newHigh };
}
