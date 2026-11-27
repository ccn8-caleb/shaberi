// The model voice: pre-generated VOICEVOX recordings of each phrase (site/audio/,
// made by tools/voice/build-phrases.mjs), played through Web Audio on the context
// the microphone already unlocked. Falls back to the browser's own speech only if a
// recording can't be played.

import { STORAGE_KEYS } from '../core/constants.js';
import { AUDIO, VOICES } from '../data/audio.js';
import { speedById, DEFAULT_SPEED } from '../game/speed.js';
import * as tts from './tts.js';

export const VOICE_IDS = Object.keys(VOICES);
export const DEFAULT_VOICE = 'kenzaki';
export { VOICES };

export function getVoice() {
  try {
    const v = localStorage.getItem(STORAGE_KEYS.VOICE);
    if (VOICE_IDS.includes(v)) return v;
  } catch (_) {}
  return DEFAULT_VOICE;
}

export function setVoice(v) {
  if (!VOICE_IDS.includes(v)) return;
  try {
    localStorage.setItem(STORAGE_KEYS.VOICE, v);
  } catch (_) {}
}

// The model's speaking speed (a game/speed.js level id), remembered per browser.
export function getSpeed() {
  try {
    return speedById(localStorage.getItem(STORAGE_KEYS.SPEED) || DEFAULT_SPEED).id;
  } catch (_) {
    return DEFAULT_SPEED;
  }
}

export function setSpeed(id) {
  try {
    localStorage.setItem(STORAGE_KEYS.SPEED, speedById(id).id);
  } catch (_) {}
}

export const clip = (phraseId, voice = getVoice(), speed = getSpeed()) => AUDIO.clips[voice]?.[speed]?.[phraseId] || null;

// How long the model takes to say a phrase (seconds): the rhythm target.
export const speechLength = (phraseId, voice = getVoice(), speed = getSpeed()) => clip(phraseId, voice, speed)?.speech ?? null;

const buffers = new Map(); // src -> Promise<AudioBuffer>
let playing = null;

function load(ctx, src) {
  if (!buffers.has(src)) {
    const p = fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error(`${src}: HTTP ${r.status}`);
        return r.arrayBuffer();
      })
      .then((data) => ctx.decodeAudioData(data));
    p.catch(() => buffers.delete(src)); // allow a retry later (e.g. back online)
    buffers.set(src, p);
  }
  return buffers.get(src);
}

// Fetch and decode ahead of time so playback starts instantly.
export function preload(ctx, phraseId, voice = getVoice(), speed = getSpeed()) {
  const c = clip(phraseId, voice, speed);
  if (ctx && c) load(ctx, c.src).catch(() => {});
}

// Play a phrase; resolves when it has finished, with the phrase's speech length.
export async function play(ctx, phrase, voice = getVoice(), speed = getSpeed()) {
  stop();
  const c = clip(phrase.id, voice, speed);
  if (ctx && c) {
    try {
      const buffer = await load(ctx, c.src);
      if (ctx.state === 'suspended') await ctx.resume();
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      const done = new Promise((resolve) => (src.onended = resolve));
      playing = src;
      src.start();
      await done;
      if (playing === src) playing = null;
      return c.speech;
    } catch (err) {
      console.warn('[model voice] falling back to browser speech', err);
    }
  }
  await tts.loadVoice();
  return tts.speak(phrase.text);
}

export function stop() {
  try {
    playing?.stop();
  } catch (_) {}
  playing = null;
  window.speechSynthesis?.cancel();
}
