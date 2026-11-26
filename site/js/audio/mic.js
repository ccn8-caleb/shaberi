// Microphone capture. Opened once per session (one permission prompt), then
// start()/stop() record individual attempts as raw mono PCM.

import { rms } from '../engine/pitch.js';

export class Mic {
  constructor() {
    this.ctx = null;
    this.stream = null;
    this.chunks = [];
    this.recording = false;
    this.onBlock = null; // (block, level, time) while recording; time = context seconds of block[0]
  }

  get sampleRate() {
    return this.ctx ? this.ctx.sampleRate : 48000;
  }

  // Must be called from a user gesture (iOS won't start audio otherwise).
  async open() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') await this.ctx.resume();
      return;
    }
    this.stream = await navigator.mediaDevices.getUserMedia({
      // Noise suppression and echo cancellation smear pitch; gain control is harmless.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 },
    });
    this.ctx = new AudioContext();
    // Same ?v= as this module (stamped at deploy), so a cached old worklet can't pair with new code.
    const version = new URL(import.meta.url).search;
    await this.ctx.audioWorklet.addModule(new URL(`./capture-worklet.js${version}`, import.meta.url));
    const source = this.ctx.createMediaStreamSource(this.stream);
    const node = new AudioWorkletNode(this.ctx, 'shaberi-capture');
    node.port.onmessage = (e) => {
      if (!this.recording) return;
      const { data, frame } = e.data;
      this.chunks.push(data);
      this.onBlock?.(data, rms(data), frame / this.ctx.sampleRate);
    };
    source.connect(node);
    // The node outputs silence; connecting it keeps the graph pulling audio through it.
    node.connect(this.ctx.destination);
    if (this.ctx.state === 'suspended') await this.ctx.resume();
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
    this.recording = false;
    this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.stream = null;
  }
}
