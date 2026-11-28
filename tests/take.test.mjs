// The take recorder decides when you've started and finished speaking.
import test from 'node:test';
import assert from 'node:assert/strict';
import { record } from '../site/js/audio/take.js';

const SR = 48000;
const BLOCK = 2048;
const BLOCK_MS = (BLOCK / SR) * 1000;

// A fake mic fed block by block, on a fake clock.
function fakeTake(opts) {
  let cb = null;
  let t = 0;
  let stopped = false;
  const mic = { sampleRate: SR, start: (fn) => (cb = fn), stop: () => ((stopped = true), new Float32Array(0)) };
  const take = record(mic, { maxSeconds: 60, clock: () => t, ...opts });
  const feed = (ms, amp) => {
    for (let elapsed = 0; elapsed < ms && !stopped; elapsed += BLOCK_MS) {
      const b = new Float32Array(BLOCK);
      for (let i = 0; i < BLOCK; i++) b[i] = amp ? amp * Math.sin((2 * Math.PI * 150 * i) / SR) : (Math.random() - 0.5) * 2e-4;
      cb(b, amp ? amp / Math.SQRT2 : 1e-4);
      t += BLOCK_MS;
    }
  };
  return { take, feed, stopped: () => stopped, now: () => t };
}

test("a pop when the mic opens, or a stray click, doesn't end the take", async () => {
  const f = fakeTake({ silenceMs: 450 });
  f.feed(45, 0.3); // switch-on pop
  f.feed(600, 0); // quiet
  f.feed(45, 0.3); // a click
  f.feed(900, 0); // quiet: before the fix the take had ended by now
  assert.equal(f.stopped(), false, 'still listening');
  f.feed(500, 0.2); // the answer
  f.feed(600, 0);
  assert.equal(f.stopped(), true, 'ends after the answer');
  assert.equal((await f.take.done).heardSpeech, true);
});

test('silence alone never counts as heard', async () => {
  const f = fakeTake({ silenceMs: 450 });
  f.feed(45, 0.3);
  f.feed(1000, 0);
  f.take.stop();
  assert.equal((await f.take.done).heardSpeech, false);
});

test('a short real word still counts', async () => {
  const f = fakeTake({ silenceMs: 450 });
  f.feed(400, 0);
  f.feed(200, 0.2); // a quick 「はい」
  f.feed(500, 0);
  assert.equal(f.stopped(), true);
  assert.equal((await f.take.done).heardSpeech, true);
});
