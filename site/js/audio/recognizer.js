// Speech recognition (Web Speech API) for the "words" score.
//
// Chrome sends the audio to Google's servers and needs a connection; Safari uses
// Apple's recogniser; Firefox has none. When it isn't there or fails, the words
// score is simply left out and the other parts carry the attempt.

const SR = typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null;

export const recognitionAvailable = () => Boolean(SR);

// Errors that mean "couldn't measure", not "you said nothing".
const UNAVAILABLE = new Set(['network', 'not-allowed', 'service-not-allowed', 'language-not-supported', 'audio-capture']);

// Hand the recogniser our own microphone track where the browser supports it
// (SpeechRecognition.start(audioTrack)). Otherwise it opens the mic itself, which on
// Android can fail while we're also recording. Browsers without support ignore the
// argument, so passing it is always safe.
function begin(rec, track) {
  if (track && track.readyState === 'live') {
    try {
      rec.start(track);
      return;
    } catch (_) {
      // Supported but refused (e.g. a track it can't use): let it open the mic itself.
    }
  }
  rec.start();
}

// Start listening. stop() resolves with the alternatives heard (best first, possibly
// empty), or null when recognition wasn't available.
//   track: the MediaStreamTrack we're already recording from (optional)
export function listen(track = null) {
  if (!SR) return { stop: async () => null };
  const rec = new SR();
  rec.lang = 'ja-JP';
  rec.continuous = true;
  rec.interimResults = false;
  rec.maxAlternatives = 5;

  let results = [];
  let unavailable = false;
  let ended;
  const done = new Promise((r) => (ended = r));

  rec.onresult = (e) => {
    results = [...e.results].filter((r) => r.isFinal);
  };
  rec.onerror = (e) => {
    if (UNAVAILABLE.has(e.error)) unavailable = true;
  };
  rec.onend = () => ended();
  try {
    begin(rec, track);
  } catch (_) {
    unavailable = true;
    ended();
  }

  return {
    // waitMs: how long to wait for the final result after stopping (games keep it short).
    async stop(waitMs = 3000) {
      try {
        rec.stop();
      } catch (_) {}
      // The final result can arrive a moment after stop().
      await Promise.race([done, new Promise((r) => setTimeout(r, waitMs))]);
      if (unavailable && !results.length) return null;
      if (results.length === 1) return [...results[0]].map((a) => a.transcript);
      // Several pieces: join the best guess of each.
      return results.length ? [results.map((r) => r[0].transcript).join('')] : [];
    },
  };
}

// Continuous listening for microgames: onText(text, isFinal) fires for every interim
// and final guess, so an answer can be accepted the moment it's heard. Restarts
// itself when the browser ends the session (Chrome does after a silence).
//
// onState(state, detail) reports what the recogniser is doing, for on-screen feedback:
//   'listening' (mic open, waiting) · 'hearing' (sound or speech detected) ·
//   'paused' · 'error' (detail = the browser's error code)
//
// On Android the recogniser is a separate system service that needs the microphone to
// itself: don't hold the mic (Mic.release()) while it should be listening, and pause()
// it while you record with the mic yourself.
//
// Returns { stop(), pause(), resume(), working }, or null when recognition isn't available.
export function stream(onText, { onState = () => {} } = {}) {
  if (!SR) return null;
  let active = true;
  let paused = false;
  let rec = null;
  let failures = 0;
  const run = () => {
    if (!active || paused) return;
    rec = new SR();
    rec.lang = 'ja-JP';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 3;
    rec.onaudiostart = () => onState('listening');
    rec.onsoundstart = () => onState('hearing');
    rec.onspeechstart = () => onState('hearing');
    rec.onsoundend = () => onState('listening');
    rec.onresult = (e) => {
      failures = 0;
      onState('hearing');
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        for (const alt of r) onText(alt.transcript, r.isFinal);
      }
    };
    rec.onerror = (e) => {
      if (UNAVAILABLE.has(e.error)) failures += 3;
      if (e.error !== 'no-speech' && e.error !== 'aborted') onState('error', e.error);
    };
    rec.onend = () => {
      if (active && !paused && failures < 6) setTimeout(run, 50);
    };
    try {
      rec.start();
    } catch (_) {
      failures++;
    }
  };
  run();
  const halt = () => {
    try {
      rec?.abort();
    } catch (_) {}
  };
  return {
    // False once the browser keeps refusing (offline, blocked, unsupported).
    get working() {
      return active && failures < 6;
    },
    pause() {
      paused = true;
      halt();
      onState('paused');
    },
    resume() {
      if (!paused) return;
      paused = false;
      run();
    },
    stop() {
      active = false;
      halt();
    },
  };
}
