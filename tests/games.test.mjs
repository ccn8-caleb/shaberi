import test from 'node:test';
import assert from 'node:assert/strict';

import { OnsetDetector } from '../site/js/engine/onset.js';
import { timeline, Judge, isEcho, grade, SPB, SONG, JUDGE, MAX_LATENCY } from '../site/js/game/groove.js';
import { GROOVE_AUDIO } from '../site/js/data/groove-audio.js';
import { deck, matches, timeLimit, payout, level, MIN_SECONDS } from '../site/js/game/flash.js';
import { REPLIES, COUNTS, ACCENT_PAIRS } from '../site/js/data/micro.js';
import { phraseMora } from '../site/js/engine/mora.js';
import { CABINETS, nextUnlock, visibleCabinets } from '../site/js/game/arcade.js';
import { synth } from './synth.mjs';

// ------------------------------------------------------------------ onsets

function detectAll(pcm, sr = 48000, blockSize = 2048) {
  const d = new OnsetDetector(sr);
  const out = [];
  for (let i = 0; i < pcm.length; i += blockSize) out.push(...d.feed(pcm.subarray(i, i + blockSize), i / sr));
  return out;
}

test('onsets: one per word, at the word start, across block boundaries', () => {
  const pcm = synth([{ silence: 0.5 }, { f0: 160, dur: 0.25 }, { silence: 0.4 }, { f0: 200, dur: 0.35 }, { silence: 0.5 }]);
  const on = detectAll(pcm);
  assert.equal(on.length, 2, JSON.stringify(on));
  assert.ok(Math.abs(on[0] - 0.5) < 0.012, `first ${on[0]}`);
  assert.ok(Math.abs(on[1] - 1.15) < 0.012, `second ${on[1]}`);
});

test('onsets: a word with internal dips is still one onset', () => {
  // ほ・ん・と: three voiced bits with 40 ms gaps
  const pcm = synth([{ silence: 0.4 }, { f0: 180, dur: 0.1 }, { silence: 0.04 }, { f0: 170, dur: 0.1 }, { silence: 0.04 }, { f0: 160, dur: 0.12 }, { silence: 0.5 }]);
  assert.equal(detectAll(pcm).length, 1);
});

test('onsets: silence gives none', () => {
  assert.equal(detectAll(synth([{ silence: 2 }])).length, 0);
});

// ------------------------------------------------------------------ groove

test('groove timeline: count-in, then each line twice (demo, then your turn)', () => {
  const { cues, targets, end } = timeline();
  assert.equal(cues.filter((c) => c.kind === 'count').length, 4);
  assert.equal(targets.length, SONG.length); // one answer of yours per line
  assert.equal(cues.filter((c) => c.kind === 'demo').length, SONG.length);
  // Your answer is on beat 4 of the bar after the demo.
  assert.ok(Math.abs(targets[0].t - (4 + 4 + 3) * SPB) < 1e-9);
  assert.ok(end > targets[targets.length - 1].t);
  // A 3-2-1 countdown before each of your answers.
  for (const tg of targets) {
    const cd = cues.filter((c) => c.kind === 'countdown' && c.bar === tg.bar).map((c) => c.text);
    assert.deepEqual(cd, ['3', '2', '1']);
  }
});

test('groove voices fit: every line has died away before your answer window opens', () => {
  const { cues, targets } = timeline();
  for (const tg of targets) {
    const line = cues.find((c) => c.kind === 'line' && c.bar === tg.bar);
    const clip = GROOVE_AUDIO.lines[line.text];
    assert.ok(clip, `no recording for "${line.text}": run node tools/voice/build-groove.mjs`);
    const sound = { start: line.t, end: line.t - clip.onset + clip.end };
    // Even with the worst device delay, an answer at the start of the window isn't taken for an echo.
    assert.ok(!isEcho(tg.t - JUDGE.ok + MAX_LATENCY, [sound], MAX_LATENCY), `"${line.text}" runs too long (${clip.end}s)`);
    assert.ok(clip.speed <= 1.1, `"${line.text}" had to be sped up ×${clip.speed}`);
  }
  for (const s of SONG) assert.ok(GROOVE_AUDIO.answers[s.you], `no recording for "${s.you}"`);
});

test('groove judge: grades by timing, first onset wins, misses expire', () => {
  const { targets } = timeline();
  const j = new Judge(targets);
  const [a, b, c] = targets;
  assert.equal(j.onset(a.t + 0.05).result, 'perfect');
  assert.equal(j.onset(a.t + 0.08), null); // a is taken and b is far away
  assert.equal(j.onset(b.t - 0.15).result, 'good');
  assert.equal(j.expire(c.t + JUDGE.ok + 0.01)[0], j.targets[2]);
  assert.equal(j.targets[2].result, 'miss');
  // Generous windows for learners: a third of a second either way still counts.
  assert.deepEqual([0.08, -0.18, 0.3, 0.4].map(grade), ['perfect', 'good', 'ok', null]);
});

test('groove calibration: practice delay is learned and corrects later beats', () => {
  const { targets } = timeline();
  const j = new Judge(targets);
  const practice = targets.filter((t) => t.practice);
  practice.forEach((t) => j.onset(t.t + 0.15)); // a mic/speaker delay of 150 ms
  assert.ok(Math.abs(j.calibrate() - 0.15) < 1e-9);
  const real = targets.filter((t) => !t.practice);
  real.forEach((t) => j.onset(t.t + 0.15));
  const s = j.summary();
  assert.equal(s.counts.perfect, real.length);
  assert.equal(s.score, 100);
});

test('groove summary: practice bars do not count', () => {
  const j = new Judge(timeline().targets);
  j.expire(1e9);
  const s = j.summary();
  assert.equal(s.score, 0);
  assert.equal(s.total, timeline().targets.filter((t) => !t.practice).length);
});

// ------------------------------------------------------------------ flash

test('flash matching: substrings after normalising', () => {
  const home = REPLIES.find((r) => r.id === 'home');
  assert.ok(matches('あ、ただいま！', home.answers));
  assert.ok(matches('タダイマ', home.answers));
  assert.ok(!matches('ただ', home.answers));
  const three = COUNTS.find((c) => c.n === 3);
  assert.ok(matches('3つ', three.answers));
  assert.ok(matches('三つです', three.answers));
  assert.ok(!matches('ふたつ', three.answers));
});

test('flash counts: no answer of one number matches another', () => {
  for (const a of COUNTS) for (const b of COUNTS) if (a !== b) for (const ans of a.answers) assert.ok(!matches(ans, b.answers), `${ans} vs ${b.n}`);
});

test('flash accent pairs really differ in pattern', () => {
  for (const [x, y] of ACCENT_PAIRS) {
    const hx = phraseMora([[x.kana, x.accent]]).map((m) => m.high).join();
    const hy = phraseMora([[y.kana, y.accent]]).map((m) => m.high).join();
    assert.notEqual(hx, hy, `${x.text} / ${y.text}`);
  }
});

test('flash deck: deterministic, never repeats back to back, respects kinds', () => {
  const a = deck(5);
  const b = deck(5);
  let prev = null;
  for (let i = 0; i < 200; i++) {
    const g = a();
    assert.equal(g.key, b().key);
    assert.notEqual(g.key, prev);
    prev = g.key;
  }
  const only = deck(1, ['accent']);
  for (let i = 0; i < 50; i++) assert.equal(only().kind, 'accent');
});

test('flash speed and payout', () => {
  assert.equal(timeLimit(0), 7);
  assert.ok(timeLimit(5) < timeLimit(4));
  assert.equal(timeLimit(500), MIN_SECONDS);
  assert.equal(level(0), 1);
  assert.equal(level(10), 3);
  assert.equal(payout(0), 0);
  assert.equal(payout(4), 60);
  assert.equal(payout(10), 175);
});

// ------------------------------------------------------------------ arcade + store

test('arcade: next unlock is the cheapest real cabinet still locked', () => {
  assert.equal(nextUnlock([]).id, 'flash');
  assert.equal(nextUnlock(['flash']).id, 'groove'); // sanpo is shelved
  assert.ok(!visibleCabinets().some((c) => c.id === 'sanpo'));
  assert.equal(nextUnlock(CABINETS.map((c) => c.id)), null);
});

test('store: migration, daily bonus once a day, unlock spends, games pay', async () => {
  const mem = new Map();
  globalThis.localStorage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  const { load, recordRun, unlock, recordGame, dailyBonus } = await import('../site/js/game/store.js');
  mem.set('shaberi_progress', JSON.stringify({ v: 1, points: 300, bestRun: 300, runs: 1, bests: {}, streak: { days: 1, last: '2026-11-25' } }));
  let p = load();
  assert.equal(p.v, 2);
  assert.equal(p.earned, 300);
  assert.deepEqual(p.unlocked, []);

  const run = { points: 200, results: [] };
  const day = new Date(2026, 10, 26, 9);
  const first = recordRun(run, day);
  assert.equal(first.bonus, dailyBonus(2));
  assert.equal(first.progress.streak.days, 2);
  assert.equal(recordRun(run, new Date(2026, 10, 26, 20)).bonus, 0);
  p = load();
  assert.equal(p.points, 300 + 200 + dailyBonus(2) + 200);

  assert.equal(unlock('flash', 400), true);
  assert.equal(unlock('flash', 400), false);
  assert.equal(load().points, p.points - 400);
  assert.equal(unlock('groove', 1e6), false);

  const g = recordGame('flash', 12, 100);
  assert.equal(g.newHigh, true);
  assert.equal(recordGame('flash', 3, 10).newHigh, false);
  assert.equal(load().highs.flash, 12);
  assert.equal(load().earned, p.earned + 110);
  delete globalThis.localStorage;
});
