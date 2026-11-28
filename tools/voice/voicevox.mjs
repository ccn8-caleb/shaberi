// VOICEVOX recipes for Shaberi's model voices (build-time tooling, never shipped).
//
// Run the engine locally first:
//   docker run -d --rm --name voicevox -p 127.0.0.1:50021:50021 voicevox/voicevox_engine:cpu-latest
//
// Three ways a voice can say something:
//   speak()  plain speech (accents set from our own phrase data)
//   onGrid() speech with every mora locked to a beat grid, for rhythm games
//   sing()   singing from a score, in the voice's chosen singing style
//
// Singing in VOICEVOX is two steps: a singing model (trained on 波音リツ, speaker
// 6000) turns notes into a pitch curve, then the chosen voice renders that curve.
// The model has a floor around E3 (165 Hz). Below it, it doesn't sing the note but
// jumps 1.5–3.5 octaves up. Each singing style below is a decision about that.

import { OnsetDetector } from '../../site/js/engine/onset.js';

export const API = 'http://127.0.0.1:50021';
export const SAMPLE_RATE = 24000;
export const FRAME_RATE = SAMPLE_RATE / 256; // VOICEVOX singing frames per second
export const SINGING_MODEL = 6000;
export const SINGING_FLOOR_KEY = 52; // E3: the singing model is reliable from here up

// Singing styles.
//   'as-sung':      the singing model's own performance in the written key. Natural phrasing.
//   'octave-lift':  composed an octave up (where the model is reliable), then the pitch
//                   curve is lowered back down before the voice renders it. For low voices.
//   'goofy':        composed straight into a low key, below the model's floor, so notes
//                   wobble between octaves. Deliberately silly; only for comic moments.
export const SING_STYLES = {
  'as-sung': { shift: 0 },
  'octave-lift': { shift: 12 },
  goofy: { shift: 0 },
};

// The voices and their chosen styles (decided 2026-11-27 after listening tests).
export const VOICES = {
  kenzaki: {
    name: '剣崎雌雄',
    credit: 'VOICEVOX:剣崎雌雄',
    talk: 21,
    sing: 3021,
    singing: { default: 'octave-lift', goofy: 'goofy' },
    singKey: 48, // C3: his natural singing range
  },
  tsumugi: {
    name: '春日部つむぎ',
    credit: 'VOICEVOX:春日部つむぎ',
    talk: 8,
    sing: 3008,
    singing: { default: 'as-sung' },
    singKey: 60, // C4
  },
};

// --- pure helpers (tested in tests/voice.test.mjs) -------------------------------------

export const hz = (key) => 440 * 2 ** ((key - 69) / 12);

// notes: [{ lyric, key, beats }] (key null = rest) → a VOICEVOX singing score. Frames
// are rounded cumulatively, so long songs don't drift off the beat.
export function buildScore(notes, { bpm = 100, leadIn = 0.15, tail = 0.25, shift = 0 } = {}) {
  const beat = 60 / bpm;
  let acc = 0;
  let prev = 0;
  const frames = (sec) => {
    acc += sec * FRAME_RATE;
    const f = Math.round(acc) - prev;
    prev = Math.round(acc);
    return f;
  };
  const out = [{ key: null, frame_length: frames(leadIn), lyric: '' }];
  for (const n of notes) {
    const rest = n.key === null || n.key === undefined || !n.lyric;
    out.push({ key: rest ? null : n.key + shift, frame_length: frames(n.beats * beat), lyric: rest ? '' : n.lyric });
  }
  out.push({ key: null, frame_length: frames(tail), lyric: '' });
  return { notes: out };
}

// Undo a score shift on the singing model's pitch curve (Hz per frame; 0 = unvoiced).
export const shiftCurve = (f0, semitones) => (semitones ? f0.map((v) => v * 2 ** (-semitones / 12)) : f0);

// Lock every mora of a speech query to a grid step (seconds), so it lands on the beat.
export function lockToGrid(query, step) {
  for (const ap of query.accent_phrases) {
    for (const m of ap.moras) {
      const c = m.consonant_length ? Math.min(m.consonant_length, 0.06) : 0;
      if (m.consonant_length) m.consonant_length = c;
      m.vowel_length = step - c;
    }
    ap.pause_mora = null;
  }
  query.prePhonemeLength = 0;
  query.postPhonemeLength = 0.04;
  return query;
}

// Where the voice actually becomes audible in a clip. Consonants start softly, so
// clips are placed this much early to sound on the beat.
export function onsetOf(pcm, sampleRate = SAMPLE_RATE) {
  const pad = new Float32Array(Math.round(sampleRate * 0.1));
  const all = new Float32Array(pad.length + pcm.length);
  all.set(pcm, pad.length);
  return Math.max(0, new OnsetDetector(sampleRate).feed(all, -0.1)[0] ?? 0);
}

export function decodeWav(buf) {
  const pcm = new Float32Array((buf.length - 44) / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = buf.readInt16LE(44 + i * 2) / 32768;
  return pcm;
}

// --- engine calls ------------------------------------------------------------------------

async function post(path, body) {
  const r = await fetch(API + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (!r.ok) throw new Error(`VOICEVOX ${path}: ${r.status} ${await r.text()}`);
  return r;
}
const audio = async (path, body) => decodeWav(Buffer.from(await (await post(path, body)).arrayBuffer()));

export async function query(voice, text) {
  const q = await (await post(`/audio_query?speaker=${VOICES[voice].talk}&text=${encodeURIComponent(text)}`)).json();
  q.outputSamplingRate = SAMPLE_RATE;
  return q;
}

// Plain speech. units ([kana, accent] pairs, as in site/js/data/phrases.js) set the
// accents from our data instead of VOICEVOX's guesses, which are sometimes wrong.
export async function speak(voice, text, { units = null, speed = 1, pre = null, post = null } = {}) {
  const q = units ? await accentQuery(voice, units) : await query(voice, text);
  q.speedScale = speed;
  if (pre !== null) q.prePhonemeLength = pre;
  if (post !== null) q.postPhonemeLength = post;
  return audio(`/synthesis?speaker=${VOICES[voice].talk}`, q);
}

// Like speak(), plus when each mora starts in the rendered file (seconds). VOICEVOX
// scales everything, the silence before and after included, by speedScale.
export async function speakTimed(voice, text, { units = null, speed = 1, pre = 0.1, post = 0.1 } = {}) {
  const q = units ? await accentQuery(voice, units) : await query(voice, text);
  q.speedScale = speed;
  q.prePhonemeLength = pre;
  q.postPhonemeLength = post;
  const moraStarts = [];
  let t = pre;
  for (const ap of q.accent_phrases) {
    for (const m of ap.moras) {
      moraStarts.push(t / speed);
      t += (m.consonant_length || 0) + m.vowel_length;
    }
    if (ap.pause_mora) t += ap.pause_mora.vowel_length;
  }
  const pcm = await audio(`/synthesis?speaker=${VOICES[voice].talk}`, q);
  return { pcm, moraStarts, end: t / speed };
}

export async function engineVersion() {
  return (await fetch(API + '/version')).json();
}

export function encodeWav(pcm, sampleRate = SAMPLE_RATE) {
  const buf = Buffer.alloc(44 + pcm.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + pcm.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(pcm.length * 2, 40);
  pcm.forEach((v, i) => buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), 44 + i * 2));
  return buf;
}

// VOICEVOX's kana notation has no ー: spell a long vowel out (コーヒー → コオヒイ).
const VOWEL_OF = { ア: 'アカガサザタダナハバパマヤラワャァ', イ: 'イキギシジチヂニヒビピミリィ', ウ: 'ウクグスズツヅヌフブプムユルュゥヴ', エ: 'エケゲセゼテデネヘベペメレェ', オ: 'オコゴソゾトドノホボポモヨロヲョォ' };
const vowelOf = (mora) => Object.keys(VOWEL_OF).find((v) => VOWEL_OF[v].includes(mora[mora.length - 1])) || 'ウ';

// Kana in VOICEVOX's notation (as pronounced) with our accents (' after the accent nucleus, / between
// accent phrases). Heiban (0) puts the mark after the last mora: no fall inside the phrase.
export function accentKana(units) {
  const toKata = (s) => s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60));
  const SMALL = 'ャュョァィゥェォヮ';
  return units
    .map(([k, accent, opts]) => {
      // This notation reads kana literally, so the particles は and へ at the end of an
      // accent unit (きょうは, えきへ, こんにちは) must be written as said: ワ, エ. A unit
      // that really ends in "ha" can give its reading: ['はは', 1, { read: 'はは' }].
      const said = opts?.read ?? (k.length > 1 ? k.replace(/は$/, 'わ').replace(/へ$/, 'え') : k);
      const mora = [];
      for (const ch of toKata(said)) {
        if (SMALL.includes(ch) && mora.length) mora[mora.length - 1] += ch;
        else if (ch === 'ー' && mora.length) mora.push(vowelOf(mora[mora.length - 1]));
        else mora.push(ch);
      }
      const at = accent === 0 ? mora.length : accent;
      return mora.slice(0, at).join('') + "'" + mora.slice(at).join('');
    })
    .join('/');
}

async function accentQuery(voice, units) {
  const r = await post(`/accent_phrases?speaker=${VOICES[voice].talk}&text=${encodeURIComponent(accentKana(units))}&is_kana=true`);
  const q = await query(voice, units.map((u) => u[0]).join(''));
  // Our accent marks only: the engine's own melody and timing are left as they are
  // (shaping the pitch made the voices sound stiff).
  q.accent_phrases = await r.json();
  return q;
}

// How long a phrase takes at speedScale 1, from the engine's own mora lengths
// (pauses inside the phrase included, silence before and after not). Exact, so the
// speed for a target pace can be calculated instead of found by trial and error.
export async function nominalSeconds(voice, text, units = null) {
  const q = units ? await accentQuery(voice, units) : await query(voice, text);
  let total = 0;
  for (const ap of q.accent_phrases) {
    for (const m of ap.moras) total += (m.consonant_length || 0) + m.vowel_length;
    if (ap.pause_mora) total += ap.pause_mora.vowel_length;
  }
  return total;
}

// Speech locked to a beat grid. Returns { pcm, onset }: place it at (beat time − onset).
export async function onGrid(voice, text, step) {
  const q = lockToGrid(await query(voice, text), step);
  const pcm = await audio(`/synthesis?speaker=${VOICES[voice].talk}`, q);
  return { pcm, onset: onsetOf(pcm) };
}

// Singing. notes: [{ lyric, key, beats }] written in the voice's own range.
// style: 'default', 'goofy', or any SING_STYLES name. Returns { pcm, lead } where
// lead is the silence before the first note (seconds).
export async function sing(voice, notes, { bpm = 100, style = 'default' } = {}) {
  const v = VOICES[voice];
  const name = v.singing[style] || style;
  const recipe = SING_STYLES[name];
  if (!recipe) throw new Error(`unknown singing style "${style}" for ${voice}`);
  const leadIn = 0.15;
  const score = buildScore(notes, { bpm, leadIn, shift: recipe.shift });
  const q = await (await post(`/sing_frame_audio_query?speaker=${SINGING_MODEL}`, score)).json();
  q.f0 = shiftCurve(q.f0, recipe.shift);
  q.outputSamplingRate = SAMPLE_RATE;
  return { pcm: await audio(`/frame_synthesis?speaker=${v.sing}`, q), lead: leadIn };
}

// Notes that a style would send below the singing model's floor (for warnings).
export const belowFloor = (notes, style) =>
  notes.filter((n) => n.key !== null && n.key !== undefined && n.key + SING_STYLES[style].shift < SINGING_FLOOR_KEY);
