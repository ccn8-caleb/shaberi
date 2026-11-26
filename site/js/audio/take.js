// One recorded attempt ("take"): records from an open Mic until the speaker has
// finished (a short silence after speech) or a time limit, with live pitch on the way.
// Used by the practice run and by voice microgames.

import { downsample, windowSize, yin, median, semitones } from '../engine/pitch.js';

// Live pitch from the most recent audio: feed() each block, get F0 (or null) back,
// plus the semitone offset from the speaker's running median.
export class LivePitch {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.need = Math.ceil(windowSize(16000) * (sampleRate / 16000)) + 64;
    this.tail = new Float32Array(0);
    this.voiced = [];
  }

  feed(block, speaking) {
    const joined = new Float32Array(this.tail.length + block.length);
    joined.set(this.tail);
    joined.set(block, this.tail.length);
    this.tail = joined.slice(-this.need);
    if (!speaking) return { f0: null, st: null };
    const { data, sampleRate } = downsample(this.tail, this.sr);
    const size = Math.min(windowSize(sampleRate), data.length);
    const { f0 } = yin(data, sampleRate, data.length - size, size);
    if (f0) this.voiced.push(f0);
    const med = median(this.voiced.slice(-200));
    return { f0, st: f0 && med ? semitones(f0, med) : null };
  }
}

// record(mic, opts) -> { done: Promise<{ pcm, heardSpeech }>, stop() }
//   maxSeconds: hard limit;  silenceMs: stop this long after speech ends
//   onBlock({ level, speaking, sinceSpeech, f0, st }): per block, for meters and graphs
export function record(mic, { maxSeconds = 5, silenceMs = 900, onBlock } = {}) {
  const live = new LivePitch(mic.sampleRate);
  const startedAt = performance.now();
  let floor = Infinity;
  let speechAt = null;
  let quietSince = null;
  let finish;
  const done = new Promise((r) => (finish = r));
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(limit);
    finish({ pcm: mic.stop(), heardSpeech: speechAt !== null });
  };
  const limit = setTimeout(stop, maxSeconds * 1000);

  mic.start((block, level) => {
    if (stopped) return;
    const now = performance.now();
    // Noise floor from the quietest blocks; speech is well above it.
    floor = Math.min(floor, Math.max(level, 1e-4));
    const speaking = level > Math.max(floor * 4, 0.008);
    if (speaking) {
      speechAt ??= now;
      quietSince = null;
    } else if (speechAt !== null) {
      quietSince ??= now;
    }
    const { f0, st } = live.feed(block, speaking);
    onBlock?.({ level, speaking, sinceSpeech: speechAt === null ? null : (now - speechAt) / 1000, f0, st, elapsed: (now - startedAt) / 1000 });
    if (quietSince !== null && now - quietSince > silenceMs) stop();
  });

  return { done, stop };
}
