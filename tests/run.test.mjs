import test from 'node:test';
import assert from 'node:assert/strict';

import { rng, dateSeed, pickPhrases, newRun, commit, isOver, multiplier, RUN_LENGTH } from '../site/js/game/run.js';
import { PHRASES } from '../site/js/data/phrases.js';

test('rng and pickPhrases are deterministic per seed', () => {
  assert.equal(rng(42)(), rng(42)());
  assert.deepEqual(pickPhrases(PHRASES, 7).map((p) => p.id), pickPhrases(PHRASES, 7).map((p) => p.id));
  assert.notDeepEqual(pickPhrases(PHRASES, 7).map((p) => p.id), pickPhrases(PHRASES, 8).map((p) => p.id));
  const ids = pickPhrases(PHRASES, 1).map((p) => p.id);
  assert.equal(new Set(ids).size, RUN_LENGTH);
});

test('dateSeed is the same all day and differs between days', () => {
  assert.equal(dateSeed(new Date(2026, 10, 26, 1)), dateSeed(new Date(2026, 10, 26, 23)));
  assert.notEqual(dateSeed(new Date(2026, 10, 26)), dateSeed(new Date(2026, 10, 27)));
});

test('combo grows on good scores, resets on a miss, and multiplies points', () => {
  const run = newRun(PHRASES, 3);
  assert.equal(commit(run, { total: 80, grade: 'A' }), Math.round(100 * multiplier(1)));
  assert.equal(run.combo, 1);
  commit(run, { total: 92, grade: 'S' });
  assert.equal(run.combo, 2);
  commit(run, { total: 40, grade: 'D' });
  assert.equal(run.combo, 0);
  assert.equal(run.maxCombo, 2);
  commit(run, { total: 70, grade: 'B' });
  commit(run, { total: 70, grade: 'B' });
  assert.ok(isOver(run));
  assert.equal(run.points, run.results.reduce((s, r) => s + r.earned, 0));
});
