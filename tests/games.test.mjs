import test from 'node:test';
import assert from 'node:assert/strict';

import { OnsetDetector } from '../site/js/engine/onset.js';
import { timeline, Judge, isEcho, grade, spb, SONG, TEMPOS, DEFAULT_BPM, judgeWindows, MAX_LATENCY, STORIES, PRACTICE, songOf, pickStory, BAR, COUNTDOWN } from '../site/js/game/groove.js';
import { splitMora } from '../site/js/engine/mora.js';
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

test('groove timeline: 4-beat count-in and bars, each line twice (demo, then your turn), at every tempo', () => {
  for (const { bpm, turn } of TEMPOS) {
    assert.equal(turn % BAR, 0, `${bpm}: turns are whole 4-beat bars`);
    const { cues, targets, end } = timeline(SONG, bpm);
    assert.equal(cues.filter((c) => c.kind === 'count').length, 4);
    assert.equal(targets.length, SONG.length);
    assert.equal(cues.filter((c) => c.kind === 'demo').length, SONG.length);
    // Your first answer: the last beat of the turn after the demo turn.
    assert.ok(Math.abs(targets[0].t - (4 + turn + turn - 1) * spb(bpm)) < 1e-9, `${bpm}`);
    assert.ok(end > targets[targets.length - 1].t);
    // Every answer lands on beat 4 of a bar, after a 3-2-1 countdown.
    for (const tg of targets) {
      assert.equal(Math.round(tg.t / spb(bpm)) % BAR, BAR - 1, `${bpm}: answer on beat 4`);
      const cd = cues.filter((c) => c.kind === 'countdown' && c.bar === tg.bar).map((c) => c.text);
      assert.deepEqual(cd, Array.from({ length: COUNTDOWN }, (_, i) => String(COUNTDOWN - i)));
    }
  }
});

test('groove stories: several, all different, short answers, never the same one twice running', () => {
  assert.ok(STORIES.length >= 5);
  assert.equal(new Set(STORIES.map((s) => s.id)).size, STORIES.length);
  for (const s of STORIES) {
    assert.ok(s.ja && s.en && s.lines.length >= 5, s.id);
    assert.ok(songOf(s).slice(0, PRACTICE.length).every((x) => x.practice));
    for (const l of s.lines) assert.ok(splitMora(l.you.replace(/[！？]/g, '')).length <= 5, `${s.id}: "${l.you}" too long to answer in a beat`);
  }
  for (let i = 0; i < 50; i++) {
    const last = STORIES[i % STORIES.length].id;
    assert.notEqual(pickStory(Math.random, last).id, last);
  }
});

test('groove voices fit at every tempo, spoken at a natural speed', () => {
  for (const { bpm } of TEMPOS) {
    const set = GROOVE_AUDIO.tempos[bpm];
    assert.ok(set, `no recordings for ${bpm} BPM: run node tools/voice/build-groove.mjs`);
    for (const story of STORIES) {
    const { cues, targets } = timeline(songOf(story), bpm);
    const ok = judgeWindows(bpm).ok;
    for (const tg of targets) {
      const line = cues.find((c) => c.kind === 'line' && c.bar === tg.bar);
      const clip = set.lines[line.text];
      const sound = { start: line.t, end: line.t - clip.onset + clip.end };
      // Even with the worst device delay, an answer at the start of the window isn't taken for an echo.
      assert.ok(!isEcho(tg.t - ok + MAX_LATENCY, [sound], MAX_LATENCY), `${bpm}: "${line.text}" runs too long (${clip.end}s)`);
      assert.ok(clip.speed <= 1.45, `${bpm}: "${line.text}" had to be sped up ×${clip.speed}`);
    }
    for (const s of songOf(story)) assert.ok(set.answers[s.you], `${bpm}: no recording for "${s.you}"`);
    }
  }
});

test('groove judge: grades by timing (windows scale with the beat), first onset wins, misses expire', () => {
  const bpm = 84;
  const w = judgeWindows(bpm);
  assert.ok(Math.abs(w.perfect - 0.1) < 0.002 && Math.abs(w.ok - 0.35) < 0.002);
  assert.ok(judgeWindows(132).ok < w.ok, 'faster tempos are stricter');
  const { targets } = timeline(SONG, bpm);
  const j = new Judge(targets, w);
  const [a, b, c] = targets;
  assert.equal(j.onset(a.t + 0.05).result, 'perfect');
  assert.equal(j.onset(a.t + 0.08), null); // a is taken and b is far away
  assert.equal(j.onset(b.t - 0.15).result, 'good');
  assert.equal(j.expire(c.t + w.ok + 0.01)[0], j.targets[2]);
  assert.equal(j.targets[2].result, 'miss');
  assert.deepEqual([0.08, -0.18, 0.3, 0.4].map((e) => grade(e, w)), ['perfect', 'good', 'ok', null]);
});

test('groove calibration: practice delay is learned and corrects later beats', () => {
  const { targets } = timeline(SONG, DEFAULT_BPM);
  const j = new Judge(targets, judgeWindows(DEFAULT_BPM));
  const practice = targets.filter((t) => t.practice);
  practice.forEach((t) => j.onset(t.t + 0.15)); // a mic/speaker delay of 150 ms
  assert.ok(Math.abs(j.calibrate() - 0.15) < 1e-9);
  const real = targets.filter((t) => !t.practice);
  real.forEach((t) => j.onset(t.t + 0.15));
  const s = j.summary();
  assert.equal(s.counts.perfect, real.length);
  assert.equal(s.score, 100);
});

test('groove summary: practice lines do not count', () => {
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
  const { load, recordRun, unlock, recordGame, dailyBonus, recordGrooveTempo } = await import('../site/js/game/store.js');
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

  // Groove tempos: two open; 80+ on the fastest open one opens the next.
  assert.equal(load().groove.open, 2);
  assert.equal(recordGrooveTempo(84, 95).opened, null); // not your fastest open tempo
  assert.equal(recordGrooveTempo(100, 70).opened, null); // under 80
  assert.equal(recordGrooveTempo(100, 85).opened.bpm, 116);
  assert.equal(load().groove.open, 3);
  assert.equal(load().groove.best[100], 85);
  delete globalThis.localStorage;
});
