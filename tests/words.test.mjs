import test from 'node:test';
import assert from 'node:assert/strict';
import { toScore, to16k, FULL, ZERO } from '../site/js/asr/words.js';

test('on-device closeness maps to a 0..1 word score', () => {
  // Measured on the model recordings: right phrases ≥ −1.5 (typically ~−0.1),
  // wrong phrases ≤ −1.85 (typically ~−3.6).
  assert.equal(toScore(-0.1), 1);
  assert.equal(toScore(FULL), 1);
  assert.equal(toScore(ZERO), 0);
  assert.equal(toScore(-3.6), 0);
  assert.equal(toScore(-0.85), 1); // right phrase via a real mic chain
  assert.ok(toScore(-1.5) > 0.4 && toScore(-1.5) < 0.6);
  assert.ok(toScore(-1.85) < 0.25);
  assert.equal(toScore(-2.56), 0); // a wrong phrase via a real mic chain
});

test('to16k keeps duration and averages samples', () => {
  const pcm = new Float32Array(48000).fill(0.5);
  const out = to16k(pcm, 48000);
  assert.equal(out.length, 16000);
  assert.ok(Math.abs(out[100] - 0.5) < 1e-6);
  assert.equal(to16k(pcm, 16000), pcm);
});
