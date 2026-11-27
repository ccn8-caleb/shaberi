// Fallback model voice: the browser's own Japanese text-to-speech. Phrases normally
// play the VOICEVOX recordings (audio/model.js); this is used only when a recording
// can't be played, and by the shelved walk game, which varies its speed.

const PREFERRED = /Google|Kyoko|Otoya|O-ren|Nanami|Keita|Haruka|Ayumi|Ichiro|Sayaka/i;

let voice = null;

function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const ja = speechSynthesis.getVoices().filter((v) => /^ja\b|^ja-/i.test(v.lang));
  voice = ja.find((v) => PREFERRED.test(v.name) && v.localService) || ja.find((v) => PREFERRED.test(v.name)) || ja[0] || null;
  return voice;
}

// Voices load asynchronously in Chrome; resolves with the voice or null.
export function loadVoice(timeoutMs = 1500) {
  if (!('speechSynthesis' in window)) return Promise.resolve(null);
  if (pickVoice()) return Promise.resolve(voice);
  return new Promise((resolve) => {
    const done = () => resolve(pickVoice());
    speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, timeoutMs);
  });
}

export const hasVoice = () => Boolean(voice);

// Speak; resolves with the spoken duration in seconds (null if it couldn't play).
export function speak(text, { rate = 0.95 } = {}) {
  if (!voice) return Promise.resolve(null);
  speechSynthesis.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    u.voice = voice;
    u.lang = voice.lang;
    u.rate = rate;
    let started = 0;
    const guard = setTimeout(() => resolve(null), 10000);
    u.onstart = () => (started = performance.now());
    u.onend = () => {
      clearTimeout(guard);
      resolve(started ? (performance.now() - started) / 1000 : null);
    };
    u.onerror = () => {
      clearTimeout(guard);
      resolve(null);
    };
    speechSynthesis.speak(u);
  });
}
