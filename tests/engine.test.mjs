import test from 'node:test';
import assert from 'node:assert/strict';

import { splitMora, unitPattern, phraseMora, levelRuns } from '../site/js/engine/mora.js';
import { yin, analyze, downsample, windowSize } from '../site/js/engine/pitch.js';
import { pitchScore, rhythmScore, wordsScore, normalize, total, grade, scoreAttempt } from '../site/js/engine/score.js';
import { PHRASES } from '../site/js/data/phrases.js';
import { synth, sayPattern } from './synth.mjs';

const HL = (hl) => hl.map((h) => (h ? 'H' : 'L')).join('');

test('splitMora joins small kana and keeps っ/ん/ー', () => {
  assert.deepEqual(splitMora('きょうは'), ['きょ', 'う', 'は']);
  assert.deepEqual(splitMora('ちょっと'), ['ちょ', 'っ', 'と']);
  assert.deepEqual(splitMora('コーヒー'), ['コ', 'ー', 'ヒ', 'ー']);
  assert.deepEqual(splitMora('すみません'), ['す', 'み', 'ま', 'せ', 'ん']);
});

test('unitPattern follows Tokyo accent rules', () => {
  assert.equal(HL(unitPattern(4, 0)), 'LHHH'); // heiban
  assert.equal(HL(unitPattern(3, 1)), 'HLL'); // atamadaka
  assert.equal(HL(unitPattern(5, 2)), 'LHLLL'); // ありがとう
  assert.equal(HL(unitPattern(5, 4)), 'LHHHL'); // すみません
});

test('phraseMora resets pitch at each accent unit', () => {
  const m = phraseMora([['これを', 0], ['ください', 2]]);
  assert.equal(HL(m.map((x) => x.high)), 'LHH' + 'LHLL');
  assert.deepEqual(
    levelRuns(m).map((r) => [r.start, r.end, r.high]),
    [[0, 1, false], [1, 3, true], [3, 4, false], [4, 5, true], [5, 7, false]]
  );
});

test('every phrase has sensible data', () => {
  const ids = new Set();
  for (const p of PHRASES) {
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.text && p.en, p.id);
    for (const [kana, accent] of p.units) {
      assert.match(kana, /^[ぁ-ゖァ-ヺー]+$/, `${p.id}: unit must be kana`);
      assert.ok(accent >= 0 && accent <= splitMora(kana).length, `${p.id}: accent ${accent} out of range for ${kana}`);
    }
    // The written form must match its own kana closely enough once read aloud.
    assert.ok(wordsScore([p.units.map((u) => u[0]).join('')], p).score === 1, p.id);
  }
});

test('yin finds the pitch of a steady tone', () => {
  for (const f of [90, 140, 220, 330]) {
    const { data, sampleRate } = downsample(synth([{ f0: f, dur: 0.2 }]), 48000);
    const { f0 } = yin(data, sampleRate, 0, windowSize(sampleRate));
    assert.ok(Math.abs(f0 - f) / f < 0.02, `${f} Hz -> ${f0}`);
  }
});

test('analyze finds the speech span, pauses and no pitch in silence', () => {
  const pcm = synth([{ silence: 0.5 }, { f0: 150, dur: 0.4 }, { silence: 0.45 }, { f0: 150, dur: 0.4 }, { silence: 0.5 }]);
  const a = analyze(pcm, 48000);
  assert.ok(Math.abs(a.span.start - 0.5) < 0.05, `start ${a.span.start}`);
  assert.ok(Math.abs(a.span.end - 1.75) < 0.05, `end ${a.span.end}`);
  assert.equal(a.pauses.length, 1);
  assert.ok(a.frames.filter((f) => f.t < 0.4).every((f) => f.f0 === null));
  assert.ok(Math.abs(a.medianF0 - 150) < 3);
});

test('analyze of silence has no span and scores as silent', () => {
  const a = analyze(synth([{ silence: 1 }]), 48000);
  assert.equal(a.span, null);
  const p = PHRASES[0];
  const r = scoreAttempt({ analysis: a, mora: phraseMora(p.units), phrase: p, heard: null });
  assert.equal(r.silent, true);
  assert.equal(r.total, 0);
});

test('pitch: the right accent scores high, the upside-down one low', () => {
  for (const p of PHRASES) {
    const mora = phraseMora(p.units);
    const good = pitchScore(analyze(sayPattern(mora), 48000), mora);
    const bad = pitchScore(analyze(sayPattern(mora, { flip: true }), 48000), mora);
    assert.ok(good.score >= 0.9, `${p.id}: good ${good.score}`);
    assert.ok(bad.score <= 0.2, `${p.id}: flipped ${bad.score}`);
  }
});

test('pitch: a monotone voice is flagged flat and scores low', () => {
  const p = PHRASES.find((x) => x.id === 'sumimasen');
  const mora = phraseMora(p.units);
  const r = pitchScore(analyze(sayPattern(mora, { step: 0 }), 48000), mora);
  assert.equal(r.flat, true);
  assert.ok(r.score < 0.3, `monotone ${r.score}`);
});

test('pitch: works across voices (low and high)', () => {
  const p = PHRASES.find((x) => x.id === 'arigatou');
  const mora = phraseMora(p.units);
  for (const base of [95, 230]) {
    const r = pitchScore(analyze(sayPattern(mora, { base }), 48000), mora);
    assert.ok(r.score >= 0.9, `base ${base}: ${r.score}`);
  }
});

test('rhythm: natural speed is full marks, very slow is not', () => {
  const p = PHRASES.find((x) => x.id === 'yoroshiku');
  const mora = phraseMora(p.units);
  const ok = rhythmScore(analyze(sayPattern(mora, { rate: 7 }), 48000), mora.length);
  const slow = rhythmScore(analyze(sayPattern(mora, { rate: 3 }), 48000), mora.length);
  assert.equal(ok.score, 1);
  assert.ok(slow.score < 0.5 && slow.feedback.includes('slow'), JSON.stringify(slow));
  const cut = rhythmScore(analyze(sayPattern(mora.slice(0, 3)), 48000), mora.length);
  assert.ok(cut.feedback.includes('partial') && !cut.feedback.includes('fast'), JSON.stringify(cut));
});

test('words: matches written form, kana and variants; misses score low', () => {
  const p = PHRASES.find((x) => x.id === 'eki');
  assert.equal(wordsScore(['駅はどこですか。'], p).score, 1);
  assert.equal(wordsScore(['えきはどこですか'], p).score, 1);
  assert.ok(wordsScore(['ドコデスカ'], p).score < 0.8);
  assert.equal(wordsScore(null, p).score, null);
  assert.equal(normalize('コーヒー、ひとつ！'), 'こーひーひとつ');
});

test('total skips unmeasured parts; grades', () => {
  assert.equal(total({ words: { score: null }, pitch: { score: 1 }, rhythm: { score: 1 } }), 100);
  assert.equal(total({ words: { score: 0 }, pitch: { score: 1 }, rhythm: { score: 1 } }), 60);
  assert.deepEqual([95, 85, 70, 55, 10].map(grade), ['S', 'A', 'B', 'C', 'D']);
});

test('words: an empty recogniser result over a clear attempt is unscored, not 0', () => {
  const p = PHRASES.find((x) => x.id === 'coffee');
  const mora = phraseMora(p.units);
  const analysis = analyze(sayPattern(mora), 48000);
  const missed = scoreAttempt({ analysis, mora, phrase: p, heard: [] });
  assert.equal(missed.words.score, null);
  assert.equal(missed.words.missed, true);
  assert.ok(missed.total >= 90, `pitch + rhythm carry it: ${missed.total}`);
  // Heard something wrong: still scored (low).
  const wrong = scoreAttempt({ analysis, mora, phrase: p, heard: ['おはようございます'] });
  assert.ok(wrong.words.score < 0.5 && !wrong.words.missed);
  // A fragment with nothing recognised isn't excused.
  const part = analyze(sayPattern(mora.slice(0, 3)), 48000);
  assert.equal(scoreAttempt({ analysis: part, mora, phrase: p, heard: [] }).words.score, 0);
  // Recognition unavailable: unscored as before, without the "missed" note.
  assert.equal(scoreAttempt({ analysis, mora, phrase: p, heard: null }).words.missed, undefined);
});

test('rhythm: faster speeds are less forgiving of the same timing', async () => {
  const { SPEEDS } = await import('../site/js/game/speed.js');
  const p = PHRASES.find((x) => x.id === 'yoroshiku');
  const mora = phraseMora(p.units);
  const model = mora.length / 7;
  // 18% slower and 12% quicker than the model: fine when slow, penalised at native speed.
  for (const rate of [7 / 1.18, 7 / 0.88]) {
    const a = analyze(sayPattern(mora, { rate }), 48000);
    const scores = SPEEDS.map((s) => rhythmScore(a, mora.length, model, s.fit).score);
    assert.equal(scores[0], 1, `slow level at ${rate.toFixed(2)}: ${scores}`);
    for (let i = 1; i < scores.length; i++) assert.ok(scores[i] <= scores[i - 1], `${rate.toFixed(2)}: ${scores}`);
    assert.ok(scores[scores.length - 1] < 1, `native should penalise ${rate.toFixed(2)}: ${scores}`);
  }
});
