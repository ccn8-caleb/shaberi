// Generate the model audio for every practice phrase in every voice.
//
//   docker run -d --rm --name voicevox -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest
//   node tools/voice/build-phrases.mjs            # only what changed
//   node tools/voice/build-phrases.mjs --all      # everything
//
// Writes site/audio/<voice>/<speed>/<phrase id>.mp3, one per speed level in
// site/js/game/speed.js, each tuned to that level's exact mora rate, and the manifest
// site/js/data/audio.js (where each clip's speech starts and how long it lasts).
// Needs ffmpeg. Accents come from our phrase data, not VOICEVOX's guesses.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VOICES, SAMPLE_RATE, speakTimed, engineVersion, encodeWav, nominalSeconds } from './voicevox.mjs';
import { PHRASES } from '../../site/js/data/phrases.js';
import { analyze, semitones } from '../../site/js/engine/pitch.js';
import { phraseMora } from '../../site/js/engine/mora.js';
import { SPEEDS } from '../../site/js/game/speed.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const AUDIO_DIR = path.join(ROOT, 'site/audio');
const MANIFEST = path.join(ROOT, 'site/js/data/audio.js');
const SETTINGS = { pre: 0.08, post: 0.18, loudness: -18, bitrate: '48k', pitch: 'accent-shaped v1', tune: 'engine-timed v2', measure: 'final mp3 v1', reference: 'contour 20ms v1' };
const all = process.argv.includes('--all');

const previous = fs.existsSync(MANIFEST) ? (await import(MANIFEST + '?t=' + Date.now())).AUDIO : { clips: {} };
const engine = await engineVersion();
const clips = {};
let made = 0;
let kept = 0;

const render = (voice, p, speed) => speakTimed(voice, p.text, { units: p.units, speed, pre: SETTINGS.pre, post: SETTINGS.post });
const rateOf = (pcm, moraCount) => {
  const { span } = analyze(pcm, SAMPLE_RATE);
  if (!span) throw new Error('no speech found in the render');
  return { span, rate: moraCount / (span.end - span.start) };
};

for (const [voice, v] of Object.entries(VOICES)) {
  clips[voice] = {};
  for (const p of PHRASES) {
    const moraCount = phraseMora(p.units).length;
    // `made` records the phrase text and accents only, so tests can spot audio that's
    // out of date with the phrase data without needing the engine.
    const madeFrom = crypto.createHash('sha1').update(JSON.stringify([p.text, p.units])).digest('hex').slice(0, 12);
    let nominal = null; // this phrase's length at speedScale 1, from the engine
    for (const sp of SPEEDS) {
      clips[voice][sp.id] ||= {};
      fs.mkdirSync(path.join(AUDIO_DIR, voice, sp.id), { recursive: true });
      const hash = crypto.createHash('sha1').update(JSON.stringify([engine, v.talk, p.text, p.units, sp.rate, SETTINGS])).digest('hex').slice(0, 12);
      const rel = `audio/${voice}/${sp.id}/${p.id}.mp3`;
      const file = path.join(ROOT, 'site', rel);
      const old = previous.clips?.[voice]?.[sp.id]?.[p.id];
      if (!all && old && old.hash === hash && fs.existsSync(file)) {
        clips[voice][sp.id][p.id] = { ...old, made: madeFrom };
        kept++;
        continue;
      }
      // Speed for exactly the target mora rate, from the engine's own timing.
      nominal ??= await nominalSeconds(voice, p.text, p.units);
      const speed = nominal / (moraCount / sp.rate);
      const { pcm, moraStarts, end } = await render(voice, p, speed);
      if (moraStarts.length !== moraCount) throw new Error(`${voice}/${p.id}: ${moraStarts.length} morae from the engine, ${moraCount} in our data`);
      let got = rateOf(pcm, moraCount);
      const tmp = path.join(AUDIO_DIR, `.${voice}-${sp.id}-${p.id}.wav`);
      fs.writeFileSync(tmp, encodeWav(pcm));
      // Same loudness for every clip and both voices; small mono MP3s play everywhere.
      execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', tmp, '-af', `loudnorm=I=${SETTINGS.loudness}:TP=-1.5:LRA=11`, '-ar', String(SAMPLE_RATE), '-ac', '1', '-c:a', 'libmp3lame', '-b:a', SETTINGS.bitrate, file]);
      fs.unlinkSync(tmp);
      // Measure the file the app actually plays (after loudness and encoding), with the
      // same speech detection the app applies to your own voice.
      const final = execFileSync('ffmpeg', ['-loglevel', 'error', '-i', file, '-f', 's16le', '-ac', '1', '-ar', String(SAMPLE_RATE), '-']);
      const played = new Float32Array(final.length / 2);
      for (let i = 0; i < played.length; i++) played[i] = final.readInt16LE(i * 2) / 32768;
      got = rateOf(played, moraCount);
      // The model's pitch curve within its speech (semitones from its own median, every
      // 20 ms, null when unvoiced): what your attempt is compared against.
      const a = analyze(played, SAMPLE_RATE);
      const ref = a.frames.filter((f, i) => i % 2 === 0 && f.t >= got.span.start && f.t <= got.span.end);
      const contour = ref.map((f) => (f.f0 ? +semitones(f.f0, a.medianF0).toFixed(1) : null));
      clips[voice][sp.id][p.id] = {
        src: rel,
        start: +got.span.start.toFixed(3), // seconds of lead-in before the voice
        speech: +(got.span.end - got.span.start).toFixed(3), // how long the phrase takes: the rhythm target
        speed: +speed.toFixed(3), // VOICEVOX speedScale for the target rate
        rate: +(moraCount / (nominal / speed)).toFixed(2), // the engine's own pace (mora/s)
        morae: moraStarts.map((t) => +(t - got.span.start).toFixed(3)), // when each mora starts, from the speech start
        contour,
        hash,
        made: madeFrom,
      };
      made++;
      process.stdout.write(`${voice}/${sp.id}/${p.id} `);
    }
  }
}

// Recordings from before speed levels (site/audio/<voice>/<id>.mp3) are no longer used.
for (const voice of Object.keys(VOICES)) {
  for (const f of fs.readdirSync(path.join(AUDIO_DIR, voice))) if (f.endsWith('.mp3')) fs.unlinkSync(path.join(AUDIO_DIR, voice, f));
}

const credits = Object.fromEntries(Object.entries(VOICES).map(([k, v]) => [k, { name: v.name, credit: v.credit }]));
fs.writeFileSync(
  MANIFEST,
  `// Generated by tools/voice/build-phrases.mjs: do not edit by hand.
// Model audio for each practice phrase, per voice and speed level (game/speed.js).
// start = seconds before the voice begins in the file; speech = how long the phrase
// takes (the rhythm target).
// The audio is made with VOICEVOX and is not covered by this project's MIT licence
// (see site/audio/README.md).

export const VOICES = ${JSON.stringify(credits, null, 2)};

export const AUDIO = ${JSON.stringify({ engine, clips }, null, 2)};
`
);
console.log(`\n${made} generated, ${kept} unchanged, engine ${engine}`);
