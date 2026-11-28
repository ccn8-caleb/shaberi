// One recorded attempt ("take"): records from an open Mic until the speaker has
// finished (a short silence after speech) or a time limit, with live pitch on the way.
// Used by the practice run and by voice microgames.

import { downsample, windowSize, yin, median, semitones } from '../engine/pitch.js';

// The speaker's typical pitch from their last take, so the next live graph starts on
// a steady baseline instead of one that settles over the first syllables.
let lastMedian = null;

// Live pitch for drawing while you speak: a reading every 10 ms (not one per block),
// as semitones from the speaker's typical pitch, with single-frame spikes (octave
// slips, clicks) smoothed away by a running median of three.
export class LivePitch {
  constructor(sampleRate) {
    this.sr = sampleRate;
    this.need = Math.ceil(windowSize(16000) * (sampleRate / 16000)) + 64;
    this.hop = Math.round(sampleRate * 0.01);
    this.tail = new Float32Array(0);
    this.voiced = [];
    this.recent = []; // last raw readings (semitones), for the spike filter
  }

  reference() {
    if (this.voiced.length >= 20 || !lastMedian) return median(this.voiced.slice(-300));
    return lastMedian;
  }

  // Returns { f0, st } for the end of the block, and points: [{ back, st }] every 10 ms
  // through it (back = seconds before the block's end; st null where unvoiced).
  feed(block, speaking) {
    const joined = new Float32Array(this.tail.length + block.length);
    joined.set(this.tail);
    joined.set(block, this.tail.length);
    this.tail = joined.slice(-(this.need + block.length));
    const points = [];
    if (!speaking) {
      this.recent = [];
      return { f0: null, st: null, points };
    }
    let f0 = null;
    let st = null;
    for (let end = joined.length - Math.floor((block.length - 1) / this.hop) * this.hop; end <= joined.length; end += this.hop) {
      if (end < this.need) continue;
      const { data, sampleRate } = downsample(joined.subarray(end - this.need, end), this.sr);
      const size = Math.min(windowSize(sampleRate), data.length);
      f0 = yin(data, sampleRate, data.length - size, size).f0;
      st = null;
      if (f0) {
        this.voiced.push(f0);
        const raw = semitones(f0, this.reference());
        this.recent.push(raw);
        if (this.recent.length > 3) this.recent.shift();
        st = this.recent.length === 3 ? median(this.recent) : raw;
      } else this.recent = [];
      points.push({ back: (joined.length - end) / this.sr, st });
    }
    return { f0, st, points };
  }

  // Call when the take ends: remember this speaker's typical pitch.
  finish() {
    if (this.voiced.length >= 20) lastMedian = median(this.voiced);
  }
}

// record(mic, opts) -> { done: Promise<{ pcm, heardSpeech }>, stop() }
//   maxSeconds: hard limit;  silenceMs: stop this long after speech ends
//   onBlock({ level, speaking, sinceSpeech, f0, st, points }): per block, for meters
//   and graphs; points = [{ t: seconds since speech began, st }] every 10 ms
//
// Speech only counts once it has lasted minSpeechMs: a single loud block (the pop of
// the mic switching on, a tap, the last round's sound effect) used to start the
// "you've finished" countdown, and Flash Speak's short one then ended the take before
// the player had said anything. The first settleMs after the mic opens are ignored for
// the same reason, and a blip that dies away is forgotten.
export function record(mic, { maxSeconds = 5, silenceMs = 900, minSpeechMs = 150, settleMs = 250, onBlock, clock = () => performance.now() } = {}) {
  const live = new LivePitch(mic.sampleRate);
  const startedAt = clock();
  let floor = Infinity;
  let speechAt = null; // when the current stretch of sound began
  let speechMs = 0; // how much of it has been loud
  let confirmed = false; // it lasted long enough to be speech
  let quietSince = null;
  let finish;
  const done = new Promise((r) => (finish = r));
  let stopped = false;

  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(limit);
    live.finish();
    finish({ pcm: mic.stop(), heardSpeech: confirmed });
  };
  const limit = setTimeout(stop, maxSeconds * 1000);

  mic.start((block, level) => {
    if (stopped) return;
    const now = clock();
    const blockMs = (block.length / mic.sampleRate) * 1000;
    // Noise floor from the quietest blocks; speech is well above it.
    floor = Math.min(floor, Math.max(level, 1e-4));
    const speaking = now - startedAt >= settleMs && level > Math.max(floor * 4, 0.008);
    if (speaking) {
      speechAt ??= now;
      speechMs += blockMs;
      if (speechMs >= minSpeechMs) confirmed = true;
      quietSince = null;
    } else if (speechAt !== null) {
      quietSince ??= now;
      // A short blip that died away: not speech, forget it.
      if (!confirmed && now - quietSince > 300) {
        speechAt = null;
        speechMs = 0;
        quietSince = null;
      }
    }
    const { f0, st, points } = live.feed(block, speaking);
    const sinceSpeech = speechAt === null ? null : (now - speechAt) / 1000;
    onBlock?.({
      level,
      speaking,
      sinceSpeech,
      f0,
      st,
      points: sinceSpeech === null ? [] : points.map((p) => ({ t: Math.max(0, sinceSpeech - p.back), st: p.st })),
      elapsed: (now - startedAt) / 1000,
    });
    if (confirmed && quietSince !== null && now - quietSince > silenceMs) stop();
  });

  return { done, stop };
}
