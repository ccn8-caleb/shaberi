// The VOICEVOX recipes' pure parts (no engine needed).
import test from 'node:test';
import assert from 'node:assert/strict';

import { VOICES, SING_STYLES, SINGING_FLOOR_KEY, FRAME_RATE, buildScore, shiftCurve, lockToGrid, accentKana, belowFloor, hz } from '../tools/voice/voicevox.mjs';
import { PHRASES } from '../site/js/data/phrases.js';

test('voices keep the singing styles chosen in listening tests', () => {
  assert.equal(VOICES.kenzaki.singing.default, 'octave-lift');
  assert.equal(VOICES.kenzaki.singing.goofy, 'goofy');
  assert.equal(VOICES.tsumugi.singing.default, 'as-sung');
  for (const v of Object.values(VOICES)) {
    assert.match(v.credit, /^VOICEVOX:/);
    for (const style of Object.values(v.singing)) assert.ok(SING_STYLES[style], style);
  }
});

test('octave-lift keeps 剣崎 above the singing model floor; his goofy style does not', () => {
  const song = [0, 2, 4, 5, 7, 9].map((s) => ({ lyric: 'ら', key: VOICES.kenzaki.singKey + s, beats: 1 }));
  assert.equal(belowFloor(song, 'octave-lift').length, 0);
  assert.ok(belowFloor(song, 'goofy').length > 0);
  // つむぎ sings as-sung in her own range, all above the floor.
  const hers = song.map((n) => ({ ...n, key: n.key + VOICES.tsumugi.singKey - VOICES.kenzaki.singKey }));
  assert.equal(belowFloor(hers, 'as-sung').length, 0);
  assert.equal(SINGING_FLOOR_KEY, 52);
});

test('buildScore: frames stay on the beat over a long song, and shift moves keys', () => {
  const notes = Array.from({ length: 200 }, (_, i) => ({ lyric: 'ら', key: 60, beats: i % 3 === 0 ? 1.5 : 0.5 }));
  const score = buildScore(notes, { bpm: 97, leadIn: 0.15, tail: 0.25 });
  const total = score.notes.reduce((s, n) => s + n.frame_length, 0);
  const seconds = 0.15 + notes.reduce((s, n) => s + (n.beats * 60) / 97, 0) + 0.25;
  assert.ok(Math.abs(total - seconds * FRAME_RATE) <= 1, `${total} vs ${seconds * FRAME_RATE}`);
  assert.equal(score.notes[0].key, null);
  assert.equal(buildScore([{ lyric: 'ら', key: 48, beats: 1 }], { shift: 12 }).notes[1].key, 60);
  assert.equal(buildScore([{ lyric: '', key: null, beats: 1 }]).notes[1].key, null);
});

test('shiftCurve lowers the pitch curve and leaves unvoiced frames alone', () => {
  const out = shiftCurve([hz(60), 0, hz(64)], 12);
  assert.ok(Math.abs(out[0] - hz(48)) < 1e-9);
  assert.equal(out[1], 0);
  assert.ok(Math.abs(out[2] - hz(52)) < 1e-9);
  assert.deepEqual(shiftCurve([100, 0], 0), [100, 0]);
});

test('lockToGrid gives every mora exactly one grid step', () => {
  const q = {
    accent_phrases: [
      { moras: [{ consonant_length: 0.09, vowel_length: 0.1 }, { consonant_length: null, vowel_length: 0.07 }], pause_mora: { vowel_length: 0.3 } },
      { moras: [{ consonant_length: 0.03, vowel_length: 0.2 }], pause_mora: null },
    ],
  };
  lockToGrid(q, 0.15);
  for (const ap of q.accent_phrases) {
    assert.equal(ap.pause_mora, null);
    for (const m of ap.moras) assert.ok(Math.abs((m.consonant_length || 0) + m.vowel_length - 0.15) < 1e-9);
  }
  assert.equal(q.prePhonemeLength, 0);
});

test("accentKana writes our accents in VOICEVOX's kana notation", () => {
  assert.equal(accentKana([['すみません', 4]]), "スミマセ'ン");
  assert.equal(accentKana([['きょうは', 1]]), "キョ'ウワ");
  assert.equal(accentKana([['これを', 0], ['ください', 2]]), "コレヲ'/クダ'サイ");
  assert.equal(accentKana([['コーヒーを', 3]]), "コオヒ'イヲ"); // no ー in this notation
  // Particles are written as said: は → ワ, へ → エ.
  assert.equal(accentKana([['きょうは', 1], ['いい', 1]]), "キョ'ウワ/イ'イ");
  assert.equal(accentKana([['えきへ', 1]]), "エ'キエ");
  assert.equal(accentKana([['はは', 1, { read: 'はは' }]]), "ハ'ハ");
  for (const p of PHRASES) assert.equal(accentKana(p.units).split('/').length, p.units.length, p.id);
});
