import test from 'node:test';
import assert from 'node:assert/strict';

import { PHRASE, MORA, speedAt, estimateDuration, timeLimit, judgeTake, payout, MAX_SPEED } from '../site/js/game/sanpo.js';
import { analyze } from '../site/js/engine/pitch.js';
import { sayPattern } from './synth.mjs';

const say = (rate) => analyze(sayPattern(MORA, { rate }), 48000);

test('sanpo phrase: 15 mora, Tokyo accent', () => {
  assert.equal(MORA.length, 15);
  assert.equal(MORA.map((m) => (m.high ? 'H' : 'L')).join(''), 'HLLL' + 'HLLL' + 'LHHHHHL');
});

test('sanpo speed climbs then caps', () => {
  assert.equal(speedAt(0), 0.9);
  assert.equal(speedAt(3), 1.2);
  assert.equal(speedAt(100), MAX_SPEED);
  assert.ok(estimateDuration(2) < estimateDuration(1));
  assert.ok(timeLimit(2) > 2 * 1.5);
});

test('sanpo judge: keeping up passes, too slow / partial / silent / wrong words fail', () => {
  const model = estimateDuration(1); // ~2.1 s
  assert.equal(judgeTake({ analysis: say(7), heard: null, modelDuration: model }).ok, true);
  assert.equal(judgeTake({ analysis: say(3.5), heard: null, modelDuration: model }).reason, 'slow');
  const part = analyze(sayPattern(MORA.slice(0, 4)), 48000);
  assert.equal(judgeTake({ analysis: part, heard: null, modelDuration: model }).reason, 'partial');
  assert.equal(judgeTake({ analysis: { span: null }, heard: null, modelDuration: model }).reason, 'silent');
  assert.equal(judgeTake({ analysis: say(7), heard: ['天気がいいから散歩しましょう'], modelDuration: model }).ok, true);
  assert.equal(judgeTake({ analysis: say(7), heard: ['今日はいい天気ですね'], modelDuration: model }).reason, 'words');
  // At ×2 the same natural pace is too slow.
  assert.equal(judgeTake({ analysis: say(6), heard: null, modelDuration: estimateDuration(2.2) }).reason, 'slow');
});

test('sanpo payout', () => {
  assert.equal(payout(0), 0);
  assert.equal(payout(5), 100);
  assert.equal(payout(10), 220);
  assert.ok(PHRASE.text.includes('散歩'));
});
