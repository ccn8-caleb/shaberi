// Microphone capture. The audio context lives for the session; the microphone itself
// is opened only while it's needed and released straight after (release()).
//
// Why: while a page holds the microphone, Android puts Bluetooth earbuds into call
// mode, and the model voice (ordinary media playback) stops reaching them. So the
// practice run opens the mic for each recording and releases it before the model plays.

import { rms } from '../engine/pitch.js';

// With Bluetooth earbuds connected, the default microphone is the earbuds' headset
// mic. Using it switches the earbuds into call mode (Bluetooth SCO): narrow-band audio,
// and on Android the earbuds can stay silent for ordinary playback afterwards, even
// across pages. So when a Bluetooth input is present, record with the phone's own mic.
const BLUETOOTH = /bluetooth|\bbt\b|airpods|buds/i;
const BUILT_IN = /speakerphone|built-?in|internal|内蔵|本体|phone|マイク/i;

// The deviceId to record from, or null for the browser's default. Labels are only
// visible once microphone permission has been granted.
export async function preferredInput() {
  try {
    const inputs = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput' && d.label);
    if (!inputs.some((d) => BLUETOOTH.test(d.label))) return null;
    const own = inputs.find((d) => BUILT_IN.test(d.label) && !BLUETOOTH.test(d.label) && !/earpiece/i.test(d.label));
    return own ? own.deviceId : null;
  } catch (_) {
    return null;
  }
}

// Is a Bluetooth microphone connected (so the browser's speech recognition, which
// uses the default mic, would put the earbuds into call mode)?
export async function bluetoothInput() {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).some((d) => d.kind === 'audioinput' && BLUETOOTH.test(d.label));
  } catch (_) {
    return false;
  }
}

export class Mic {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.source = null;
    this.node = null;
    this.chunks = [];
    this.recording = false;
    this.onBlock = null; // (block, level, time) while recording; time = context seconds of block[0]
    this.waiters = new Set(); // (block level) => void, for waitForAudio()
  }

  // The live microphone track (shared with speech recognition where supported).
  get track() {
    const t = this.stream?.getAudioTracks()[0];
    return t && t.readyState === 'live' ? t : null;
  }

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 48000;
  }

  get isOpen() {
    return Boolean(this.track);
  }

  // Must first be called from a user gesture (iOS won't start audio otherwise).
  async open() {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      // Same ?v= as this module (stamped at deploy), so a cached old worklet can't pair with new code.
      const version = new URL(import.meta.url).search;
      await this.ctx.audioWorklet.addModule(new URL(`./capture-worklet.js${version}`, import.meta.url));
      this.node = new AudioWorkletNode(this.ctx, 'shaberi-capture');
      this.node.port.onmessage = (e) => {
        const { data, frame } = e.data;
        if (this.waiters.size) {
          const level = rms(data);
          this.waiters.forEach((w) => w(level));
        }
        if (!this.recording) return;
        this.chunks.push(data);
        this.onBlock?.(data, rms(data), frame / this.ctx.sampleRate);
      };
      // The node outputs silence; connecting it keeps the graph pulling audio through it.
      this.node.connect(this.ctx.destination);
    }
    if (!this.isOpen) {
      // Noise suppression and echo cancellation smear pitch; gain control is harmless.
      const audio = { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 };
      const deviceId = await preferredInput();
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ audio: deviceId ? { ...audio, deviceId: { exact: deviceId } } : audio });
      } catch (err) {
        if (!deviceId) throw err;
        this.stream = await navigator.mediaDevices.getUserMedia({ audio });
      }
      this.source = this.ctx.createMediaStreamSource(this.stream);
      this.source.connect(this.node);
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  // Resolves once real sound is arriving from the microphone (or after maxMs).
  // Bluetooth headsets take a moment to switch over and send silence until then.
  waitForAudio(maxMs = 1500) {
    return new Promise((resolve) => {
      const started = performance.now();
      const w = (level) => {
        if (level > 1e-4 || performance.now() - started > maxMs) {
          this.waiters.delete(w);
          resolve();
        }
      };
      this.waiters.add(w);
      setTimeout(() => {
        if (this.waiters.delete(w)) resolve();
      }, maxMs + 100);
    });
  }

  // Stop using the microphone (the audio context stays, for sounds and the next open()).
  release() {
    this.recording = false;
    try {
      this.source?.disconnect();
    } catch (_) {}
    this.stream?.getTracks().forEach((t) => t.stop());
    this.source = null;
    this.stream = null;
  }

  start(onBlock) {
    this.chunks = [];
    this.onBlock = onBlock;
    this.recording = true;
  }

  // The recording as one Float32Array.
  stop() {
    this.recording = false;
    this.onBlock = null;
    const n = this.chunks.reduce((s, c) => s + c.length, 0);
    const pcm = new Float32Array(n);
    let o = 0;
    for (const c of this.chunks) {
      pcm.set(c, o);
      o += c.length;
    }
    this.chunks = [];
    return pcm;
  }

  async close() {
    this.release();
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.node = null;
  }
}
