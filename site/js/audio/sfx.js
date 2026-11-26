// Game sounds, synthesised with Web Audio (no files to download). Every function
// takes the AudioContext and an optional start time on its clock, so the rhythm game
// can schedule sounds exactly on the beat.

let master = null;

function out(ctx) {
  if (!master || master.context !== ctx) {
    master = ctx.createGain();
    master.gain.value = 0.3;
    master.connect(ctx.destination);
  }
  return master;
}

function tone(ctx, { t = ctx.currentTime, freq = 440, to = null, dur = 0.12, type = 'triangle', gain = 0.6 }) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(out(ctx));
  o.start(t);
  o.stop(t + dur + 0.02);
}

// Metronome tick; accent = the first beat of a bar.
export const tick = (ctx, t, accent = false) => tone(ctx, { t, freq: accent ? 1500 : 1000, dur: 0.05, type: 'square', gain: 0.25 });

// A friendly sing-song "voice": n short syllable blips starting at t, spaced `step`.
export function blips(ctx, t, n, { base = 420, step = 0.1 } = {}) {
  const times = [];
  for (let i = 0; i < n; i++) {
    const freq = base * 2 ** ((((i * 5) % 7) - 3) / 12); // a little melody, not random
    tone(ctx, { t: t + i * step, freq, to: freq * 0.92, dur: 0.08, type: 'triangle', gain: 0.55 });
    times.push(t + i * step);
  }
  return times;
}

export const chime = (ctx, t = ctx.currentTime) => {
  tone(ctx, { t, freq: 880, dur: 0.12, type: 'sine', gain: 0.6 });
  tone(ctx, { t: t + 0.08, freq: 1320, dur: 0.2, type: 'sine', gain: 0.6 });
};
export const buzz = (ctx, t = ctx.currentTime) => tone(ctx, { t, freq: 220, to: 110, dur: 0.3, type: 'sawtooth', gain: 0.35 });
export const pop = (ctx, t = ctx.currentTime) => tone(ctx, { t, freq: 600, to: 1200, dur: 0.08, type: 'sine', gain: 0.5 });

export function fanfare(ctx, t = ctx.currentTime) {
  [523, 659, 784, 1047].forEach((f, i) => tone(ctx, { t: t + i * 0.09, freq: f, dur: i === 3 ? 0.4 : 0.12, type: 'triangle', gain: 0.55 }));
}
export function speedUp(ctx, t = ctx.currentTime) {
  [392, 523, 659, 784, 1047, 1319].forEach((f, i) => tone(ctx, { t: t + i * 0.05, freq: f, dur: 0.08, type: 'square', gain: 0.25 }));
}

// Silence everything already scheduled (leaving a song half-way).
export function cut() {
  master?.disconnect();
  master = null;
}

// A soft kick drum to keep the beat.
export const kick = (ctx, t) => tone(ctx, { t, freq: 150, to: 50, dur: 0.12, type: 'sine', gain: 0.9 });

// A slap: a burst of filtered noise on top of a low thump.
export function smack(ctx, t = ctx.currentTime) {
  const len = Math.round(ctx.sampleRate * 0.12);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const band = ctx.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 1800;
  band.Q.value = 0.8;
  const g = ctx.createGain();
  g.gain.value = 2.2;
  src.connect(band).connect(g).connect(out(ctx));
  src.start(t);
  tone(ctx, { t, freq: 180, to: 60, dur: 0.15, type: 'sine', gain: 0.9 });
}

// A cartoon whoosh (the pencil flying away).
export const whoosh = (ctx, t = ctx.currentTime) => tone(ctx, { t, freq: 300, to: 1600, dur: 0.35, type: 'sine', gain: 0.3 });
