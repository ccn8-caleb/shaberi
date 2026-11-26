// Test helper: a crude "voice" (a few harmonics) following a pitch track, with
// optional silence. segments: [{ f0, dur }] or [{ silence: dur }]; f0 may be
// [from, to] for a glide.

export function synth(segments, sampleRate = 48000) {
  const total = segments.reduce((s, g) => s + (g.silence ?? g.dur), 0);
  const out = new Float32Array(Math.ceil(total * sampleRate));
  let i = 0;
  let phase = 0;
  for (const g of segments) {
    const n = Math.round((g.silence ?? g.dur) * sampleRate);
    for (let k = 0; k < n && i < out.length; k++, i++) {
      if (g.silence !== undefined) {
        out[i] = (Math.random() - 0.5) * 0.0005; // faint room noise
        continue;
      }
      const [a, b] = Array.isArray(g.f0) ? g.f0 : [g.f0, g.f0];
      const f = a + ((b - a) * k) / n;
      phase += (2 * Math.PI * f) / sampleRate;
      out[i] = 0.3 * (Math.sin(phase) + 0.5 * Math.sin(2 * phase) + 0.25 * Math.sin(3 * phase));
    }
  }
  return out;
}

const ST = (base, st) => base * 2 ** (st / 12);

// A voice saying `mora` (from phraseMora) at `rate` mora/s, high mora `step`
// semitones above low ones. flip=true says the pattern upside down.
export function sayPattern(mora, { base = 140, step = 3, rate = 7, flip = false, sampleRate = 48000 } = {}) {
  const dur = 1 / rate;
  const segs = [{ silence: 0.3 }];
  for (const m of mora) {
    const high = flip ? !m.high : m.high;
    segs.push({ f0: high ? ST(base, step) : base, dur });
  }
  segs.push({ silence: 0.3 });
  return synth(segs, sampleRate);
}
