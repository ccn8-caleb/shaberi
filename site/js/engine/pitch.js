// Pitch (F0) and loudness tracking for a mono recording. Pure: runs in the page
// and under Node (tests/).
//
// The signal is first downsampled to ~16 kHz (speech F0 is below 500 Hz), then
// every hop gets a loudness (RMS) and, if loud enough, a YIN pitch estimate.

export const F0_MIN = 70;
export const F0_MAX = 500;
export const HOP_S = 0.01;

// Box-filter downsample to roughly 16 kHz. Good enough for F0; not for listening.
export function downsample(pcm, sampleRate, target = 16000) {
  const factor = Math.max(1, Math.round(sampleRate / target));
  if (factor === 1) return { data: pcm, sampleRate };
  const n = Math.floor(pcm.length / factor);
  const data = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = 0; j < factor; j++) s += pcm[i * factor + j];
    data[i] = s / factor;
  }
  return { data, sampleRate: sampleRate / factor };
}

export function rms(buf, start = 0, end = buf.length) {
  let s = 0;
  for (let i = start; i < end; i++) s += buf[i] * buf[i];
  return end > start ? Math.sqrt(s / (end - start)) : 0;
}

// Window length (samples) that YIN needs at this rate: two periods of F0_MIN plus a margin.
export const windowSize = (sampleRate) => 2 * Math.ceil(sampleRate / F0_MIN) + 64;

// YIN (de Cheveigné & Kawahara 2002) on buf[start .. start+size).
// Returns { f0, aperiodicity } — f0 is null when no clear period is found.
export function yin(buf, sampleRate, start = 0, size = buf.length - start, threshold = 0.15) {
  const tauMin = Math.floor(sampleRate / F0_MAX);
  const tauMax = Math.min(Math.ceil(sampleRate / F0_MIN), size >> 1);
  const w = size - tauMax;
  const d = new Float32Array(tauMax + 1);
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = start; i < start + w; i++) {
      const x = buf[i] - buf[i + tau];
      s += x * x;
    }
    d[tau] = s;
  }
  // Cumulative mean normalised difference.
  const cm = new Float32Array(tauMax + 1);
  cm[0] = 1;
  let run = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    run += d[tau];
    cm[tau] = run > 0 ? (d[tau] * tau) / run : 1;
  }
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cm[t] < threshold) {
      while (t + 1 <= tauMax && cm[t + 1] < cm[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau < 0) return { f0: null, aperiodicity: 1 };
  let best = tau;
  if (tau > 1 && tau < tauMax) {
    const a = cm[tau - 1];
    const b = cm[tau];
    const c = cm[tau + 1];
    const den = a + c - 2 * b;
    if (den) best = tau + (a - c) / (2 * den);
  }
  return { f0: sampleRate / best, aperiodicity: cm[tau] };
}

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const percentile = (xs, p) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(p * s.length))];
};
export { median, percentile };

// Analyse a whole recording.
// Returns {
//   frames: [{ t, rms, f0 }]  (f0 null when unvoiced or quiet),
//   threshold, span: { start, end } | null  (seconds, first/last loud frame),
//   pauses: [{ start, end }]  (silences inside the span longer than minPause),
//   medianF0
// }
export function analyze(pcm, sampleRate, { minPause = 0.3 } = {}) {
  const { data, sampleRate: sr } = downsample(pcm, sampleRate);
  const size = windowSize(sr);
  const hop = Math.round(sr * HOP_S);
  const frames = [];
  for (let start = 0; start + size <= data.length; start += hop) {
    frames.push({ t: (start + size / 2) / sr, rms: rms(data, start, start + size), start });
  }
  const levels = frames.map((f) => f.rms);
  const peak = Math.max(0, ...levels);
  // Loud = well above the noise floor and not far below the loudest part.
  const threshold = Math.max(percentile(levels, 0.1) * 3, peak * 0.08, 0.001);

  for (const f of frames) {
    f.f0 = f.rms >= threshold ? yin(data, sr, f.start, size).f0 : null;
    delete f.start;
  }
  fixOctaves(frames);

  // Speech span: first and last run of at least 3 loud frames.
  const loud = frames.map((f) => f.rms >= threshold);
  const runStart = (i) => loud[i] && loud[i + 1] && loud[i + 2];
  let first = -1;
  let last = -1;
  for (let i = 0; i + 2 < frames.length; i++) if (runStart(i)) { first = i; break; }
  for (let i = frames.length - 1; i >= 2; i--) if (loud[i] && loud[i - 1] && loud[i - 2]) { last = i; break; }
  const span = first >= 0 && last > first ? { start: frames[first].t, end: frames[last].t } : null;

  const pauses = [];
  if (span) {
    let quietFrom = null;
    for (let i = first; i <= last; i++) {
      if (!loud[i] && quietFrom === null) quietFrom = frames[i].t;
      if (loud[i] && quietFrom !== null) {
        if (frames[i].t - quietFrom >= minPause) pauses.push({ start: quietFrom, end: frames[i].t });
        quietFrom = null;
      }
    }
  }
  const medianF0 = median(frames.filter((f) => f.f0).map((f) => f.f0));
  return { frames, threshold, span, pauses, medianF0 };
}

// YIN sometimes locks onto half or double the real period. Pull outliers back
// towards the speaker's median, then smooth with a 5-frame median.
export function fixOctaves(frames) {
  const med = median(frames.filter((f) => f.f0).map((f) => f.f0));
  if (!med) return;
  for (const f of frames) {
    if (!f.f0) continue;
    if (f.f0 > med * 1.8) f.f0 /= 2;
    else if (f.f0 < med * 0.55) f.f0 *= 2;
  }
  const raw = frames.map((f) => f.f0);
  for (let i = 0; i < frames.length; i++) {
    if (!raw[i]) continue;
    const near = raw.slice(Math.max(0, i - 2), i + 3).filter(Boolean);
    frames[i].f0 = median(near);
  }
}

// Semitones relative to a reference frequency.
export const semitones = (f0, ref) => 12 * Math.log2(f0 / ref);
