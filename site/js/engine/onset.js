// Voice onsets ("when did they start speaking?") for the rhythm game. Pure; streaming.
//
// Loudness is measured every 5 ms. An onset is the first loud hop after at least
// `quietMs` of quiet, where loud = well above an adaptive noise floor. Only the
// start of each word counts, so "ほんとに？" is one onset, not four.

const HOP_S = 0.005;

export class OnsetDetector {
  constructor(sampleRate, { quietMs = 120, ratio = 5, minLevel = 0.012 } = {}) {
    this.sr = sampleRate;
    this.hop = Math.round(sampleRate * HOP_S);
    this.quietHops = Math.round(quietMs / 1000 / HOP_S);
    this.ratio = ratio;
    this.minLevel = minLevel;
    this.floor = null;
    this.quiet = this.quietHops; // start armed
    this.carry = new Float32Array(0);
    this.carryTime = 0;
  }

  // block: samples; time: seconds of block[0] on the caller's clock.
  // Returns the onset times found in this block.
  feed(block, time) {
    // Keep a partial hop from the last block so hops stay evenly spaced.
    const data = new Float32Array(this.carry.length + block.length);
    data.set(this.carry);
    data.set(block, this.carry.length);
    const t0 = this.carry.length ? this.carryTime : time;
    const onsets = [];
    let i = 0;
    for (; i + this.hop <= data.length; i += this.hop) {
      let s = 0;
      for (let j = i; j < i + this.hop; j++) s += data[j] * data[j];
      const level = Math.sqrt(s / this.hop);
      if (this.floor === null) this.floor = level;
      const threshold = Math.max(this.floor * this.ratio, this.minLevel);
      if (level >= threshold) {
        if (this.quiet >= this.quietHops) onsets.push(t0 + i / this.sr);
        this.quiet = 0;
      } else {
        // Quiet: the floor follows quiet levels (fast down, slow up).
        if (level < threshold * 0.5) this.quiet++;
        this.floor = level < this.floor ? level * 0.5 + this.floor * 0.5 : this.floor * 0.995 + level * 0.005;
      }
    }
    this.carry = data.slice(i);
    this.carryTime = t0 + i / this.sr;
    return onsets;
  }
}
