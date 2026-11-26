// AudioWorklet: passes the microphone's samples to the page in 2048-sample blocks,
// each with the AudioContext frame of its first sample (so the rhythm game can line
// voice onsets up with the beats it schedules on the same clock).
// (Loaded with audioWorklet.addModule, so it can't import anything.)

const BLOCK = 2048;

class Capture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buf = new Float32Array(BLOCK);
    this.n = 0;
    this.frame = 0;
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) {
      for (let i = 0; i < ch.length; i++) {
        if (this.n === 0) this.frame = currentFrame + i;
        this.buf[this.n++] = ch[i];
        if (this.n === BLOCK) {
          this.port.postMessage({ data: this.buf, frame: this.frame }, [this.buf.buffer]);
          this.buf = new Float32Array(BLOCK);
          this.n = 0;
        }
      }
    }
    return true;
  }
}

registerProcessor('shaberi-capture', Capture);
