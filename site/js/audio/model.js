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

// Two ways to play a recording:
//   media:    an <audio> element. Uses the phone's normal media route (the one music
//             apps use), which keeps working when a page has the microphone open.
//             The default.
//   webaudio: decoded into the microphone's AudioContext. Kept as a fallback: on some
//             Android phones with Bluetooth earbuds this route was silent.
const media = typeof Audio !== 'undefined' ? new Audio() : null;
if (media) {
  media.preload = 'auto';
  media.setAttribute('playsinline', '');
}
const buffers = new Map(); // src -> Promise<AudioBuffer>
let playing = null; // the Web Audio source, when that route is playing
let unlocked = false;

// Call synchronously inside a tap (e.g. スタート) before anything is awaited: iOS only
// lets an <audio> element play later if it was started from a user gesture once.
export function unlock() {
  if (!media || unlocked) return;
  const any = Object.values(AUDIO.clips)[0];
  const first = any && Object.values(Object.values(any)[0])[0];
  if (!first) return;
  media.muted = true;
  media.src = first.src;
  const p = media.play();
  // Only undo our own silent playback: a real phrase may have started meanwhile.
  const ours = () => media.muted && media.src.endsWith(first.src);
  if (p) {
    p.then(() => {
      unlocked = true;
      if (ours()) {
        media.pause();
        media.muted = false;
      }
    }).catch(() => {
      if (ours()) media.muted = false;
    });
  }
}

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

// Fetch ahead of time so playback starts instantly (the service worker keeps it).
export function preload(ctx, phraseId, voice = getVoice(), speed = getSpeed()) {
  const c = clip(phraseId, voice, speed);
  if (c) fetch(c.src).catch(() => {});
}

function playMedia(src) {
  return new Promise((resolve, reject) => {
    media.muted = false;
    media.src = src;
    media.currentTime = 0;
    media.onended = () => resolve();
    media.onerror = () => reject(media.error || new Error('media error'));
    media.onpause = () => {
      if (!media.ended) resolve(); // stopped early (e.g. recording started)
    };
    const p = media.play();
    if (p) p.catch(reject);
  });
}

async function playWebAudio(ctx, src) {
  const buffer = await load(ctx, src);
  if (ctx.state === 'suspended') await ctx.resume();
  const node = ctx.createBufferSource();
  node.buffer = buffer;
  node.connect(ctx.destination);
  const done = new Promise((resolve) => (node.onended = resolve));
  playing = node;
  node.start();
  await done;
  if (playing === node) playing = null;
}

// Play a phrase; resolves when it has finished, with the phrase's speech length.
// Tries the media route, then Web Audio, then the browser's own speech.
export async function play(ctx, phrase, voice = getVoice(), speed = getSpeed()) {
  stop();
  const c = clip(phrase.id, voice, speed);
  if (c && media) {
    try {
      await playMedia(c.src);
      return c.speech;
    } catch (err) {
      console.warn('[model voice] media route failed, trying Web Audio', err);
    }
  }
  if (c && ctx) {
    try {
      await playWebAudio(ctx, c.src);
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
    if (media && !media.paused) media.pause();
  } catch (_) {}
  try {
    playing?.stop();
  } catch (_) {}
  playing = null;
  window.speechSynthesis?.cancel();
}
