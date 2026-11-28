// On-device word check (see asr/worker.js): an optional ~50 MB download, then words are
// scored on the phone itself, in any browser, without needing the microphone at the
// same time as the pitch recording (which Android's speech recognition does).

import { STORAGE_KEYS } from '../core/constants.js';

// closeness → 0..1: full marks from FULL up, nothing at ZERO and below.
export const FULL = -0.9; // the right phrase through a real mic chain measured about −0.8
export const ZERO = -2.1;
export const toScore = (c) => Math.max(0, Math.min(1, (c - ZERO) / (FULL - ZERO)));

let worker = null;
let state = 'off'; // off | loading | ready | error
let progress = 0;
let nextId = 1;
const pending = new Map();
const listeners = new Set();
const files = new Map(); // file -> { loaded, total }

const emit = () => listeners.forEach((fn) => fn({ state, progress }));
export const onChange = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const status = () => ({ state, progress });

export function wanted() {
  try {
    return localStorage.getItem(STORAGE_KEYS.WORDS) === 'on';
  } catch (_) {
    return false;
  }
}
function remember(on) {
  try {
    localStorage.setItem(STORAGE_KEYS.WORDS, on ? 'on' : 'off');
  } catch (_) {}
}

function call(msg) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ ...msg, id });
  });
}

// Start (or resume) loading the model. Safe to call again.
export function enable() {
  remember(true);
  if (worker) return call({ type: 'load' });
  state = 'loading';
  progress = 0;
  emit();
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === 'progress') {
      files.set(m.file, { loaded: m.loaded, total: m.total });
      let loaded = 0;
      let total = 0;
      for (const f of files.values()) {
        loaded += f.loaded;
        total += f.total;
      }
      progress = total ? loaded / total : 0;
      return emit();
    }
    const p = pending.get(m.id);
    if (m.type === 'ready') {
      state = 'ready';
      progress = 1;
      emit();
    }
    if (m.type === 'error') {
      if (state === 'loading') {
        state = 'error';
        emit();
      }
      p?.reject(new Error(m.message));
    } else p?.resolve(m);
    pending.delete(m.id);
  };
  worker.onerror = (e) => {
    state = 'error';
    emit();
    pending.forEach((p) => p.reject(new Error(e.message || 'worker failed')));
    pending.clear();
  };
  return call({ type: 'load' });
}

export function disable() {
  remember(false);
  worker?.terminate();
  worker = null;
  state = 'off';
  emit();
}

// Mono PCM at any rate → 16 kHz (what Whisper expects), averaging to avoid aliasing.
export function to16k(pcm, rate) {
  if (rate === 16000) return pcm;
  const ratio = rate / 16000;
  const out = new Float32Array(Math.floor(pcm.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio);
    const b = Math.max(a + 1, Math.floor((i + 1) * ratio));
    let s = 0;
    for (let k = a; k < b && k < pcm.length; k++) s += pcm[k];
    out[i] = s / (b - a);
  }
  return out;
}

// Which of several candidate answers a recording is (for 瞬間しゃべり): closeness of
// the best right form and the best wrong one, or null if the check isn't ready.
//   right: forms that count as the answer;  wrong: plausible other answers
export async function choose(pcm, rate, right, wrong, span = null) {
  if (state !== 'ready') return null;
  let audio = pcm;
  if (span) {
    const a = Math.max(0, Math.floor((span.start - 0.25) * rate));
    const b = Math.min(pcm.length, Math.ceil((span.end + 0.35) * rate));
    audio = pcm.subarray(a, b);
  }
  const { closeness } = await call({ type: 'rank', audio: to16k(audio, rate), forms: [...right, ...wrong] });
  const best = Math.max(...closeness.slice(0, right.length));
  const rival = wrong.length ? Math.max(...closeness.slice(right.length)) : -Infinity;
  return { best, rival, score: toScore(best) };
}

// Score a recording against a phrase: { score 0..1, closeness }, or null if the
// on-device check isn't ready. Only the speech (plus a little margin) is sent.
export async function check(pcm, rate, phrase, span = null) {
  if (state !== 'ready') return null;
  let audio = pcm;
  if (span) {
    const a = Math.max(0, Math.floor((span.start - 0.25) * rate));
    const b = Math.min(pcm.length, Math.ceil((span.end + 0.35) * rate));
    audio = pcm.subarray(a, b);
  }
  const forms = [phrase.text, phrase.units.map((u) => u[0]).join('')];
  const { closeness } = await call({ type: 'check', audio: to16k(audio, rate), forms });
  return { score: toScore(closeness), closeness };
}
