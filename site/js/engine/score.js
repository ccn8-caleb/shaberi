// Scoring one attempt. Pure; every part returns a 0..1 score (or null when it
// couldn't be measured) plus the details the result screen explains.
//
// * words:  what the speech recogniser heard vs. the phrase (lenient: recognisers
//           auto-correct towards real Japanese, so this mostly catches missing or
//           wrong words, not accent).
// * pitch:  does the voice rise and fall where the Tokyo accent pattern does?
// * rhythm: overall speed vs. the model, and pauses in the middle.

import { levelRuns } from './mora.js';
import { median, percentile, semitones } from './pitch.js';

const clamp01 = (x) => Math.max(0, Math.min(1, x));

// Natural polite speech is about 7 mora per second.
export const DEFAULT_MORA_RATE = 7;

// --- Pitch -------------------------------------------------------------------------

// A rise or fall counts fully at FULL_STEP_ST semitones, partly from a little below
// zero (a nearly level step still earns something), and not at all the wrong way.
// Real accent falls are 2–5 semitones; initial rises are smaller, and learners are
// often subtler, so this is deliberately forgiving.
const FULL_STEP_ST = 1;
const STEP_SLACK_ST = 0.25;
const stepScore = (signed) => clamp01((signed + STEP_SLACK_ST) / (FULL_STEP_ST + STEP_SLACK_ST));

// Time window of mora [from, to) when the speech span is divided evenly into mora.
// Japanese mora are roughly equal in length, which is what makes this workable.
function moraWindow(span, moraCount, from, to) {
  const u = (span.end - span.start) / moraCount;
  return [span.start + from * u, span.start + to * u];
}

export function pitchScore(analysis, mora, reference = null) {
  const { span, frames, medianF0 } = analysis;
  if (!span || !medianF0 || mora.length < 2) return { score: null, transitions: [], contour: [], flat: false };
  if (reference?.contour?.length && reference.morae?.length === mora.length) {
    const r = pitchAgainstModel(analysis, mora, reference);
    if (r) return r;
  }
  const M = mora.length;
  const voiced = frames.filter((f) => f.f0 && f.t >= span.start && f.t <= span.end);
  const st = (f) => semitones(f.f0, medianF0);

  // Median pitch of each level run, from its middle 70% (edges blur into neighbours).
  const runs = levelRuns(mora).map((run) => {
    const [a, b] = moraWindow(span, M, run.start, run.end);
    const trim = (b - a) * 0.15;
    const vals = voiced.filter((f) => f.t >= a + trim && f.t <= b - trim).map(st);
    return { ...run, level: vals.length >= 2 ? median(vals) : null };
  });

  const transitions = [];
  for (let i = 1; i < runs.length; i++) {
    const prev = runs[i - 1];
    const next = runs[i];
    if (prev.high === next.high) continue; // unit boundary with no change: nothing to check
    const dir = next.high ? 'rise' : 'fall';
    if (prev.level === null || next.level === null) {
      transitions.push({ at: next.start, dir, diff: null, score: null });
      continue;
    }
    const diff = next.level - prev.level;
    const signed = dir === 'rise' ? diff : -diff;
    transitions.push({ at: next.start, dir, diff, score: stepScore(signed) });
  }
  const measured = transitions.filter((tr) => tr.score !== null);

  // Per-mora pitch for drawing (null where unvoiced).
  const contour = mora.map((_, i) => {
    const [a, b] = moraWindow(span, M, i, i + 1);
    const vals = voiced.filter((f) => f.t >= a && f.t < b).map(st);
    return vals.length ? median(vals) : null;
  });
  const all = voiced.map(st);
  const flat = all.length > 5 && percentile(all, 0.9) - percentile(all, 0.1) < 1.2;

  const score = measured.length ? measured.reduce((s, tr) => s + tr.score, 0) / measured.length : null;
  return { score, transitions, contour, flat };
}

// --- Pitch against the model's recording ------------------------------------------------
//
// reference: { contour: semitones from the model's median every 20 ms from the start
// of its speech (null = unvoiced), morae: when each mora starts (seconds, same clock) }.
// Your pitch curve is lined up with the model's by dynamic time warping, so you don't
// need its exact timing. Then: do you rise and fall at the accent's moves (60%), and
// how closely does the shape of your pitch follow the model's (40%)?

const REF_STEP = 0.02;
let WARP_BAND = 0.08; // narrow: wider bands bend any curve into the model's shape (tested on mirrored references)
export const setWarpBand = (b) => (WARP_BAND = b); // for tuning experiments

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
const std = (xs) => {
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};

// Your speech as semitones from your median every 20 ms (null when unvoiced), lightly smoothed.
function userCurve(analysis) {
  const { frames, span, medianF0 } = analysis;
  const pts = [];
  for (let t = span.start; t <= span.end + 1e-9; t += REF_STEP) {
    let best = null;
    for (const f of frames) if (Math.abs(f.t - t) <= 0.006) best = f;
    pts.push(best?.f0 ? semitones(best.f0, medianF0) : null);
  }
  return cleanCurve(pts);
}

// Tidy a pitch curve (semitones, null = unvoiced, one point per 20 ms) before it's
// scored or drawn: readings far from the voice's own range are misreads (octave
// slips, clicks) and go; voiced bits shorter than 60 ms are noise, not syllables; the
// rest is smoothed with a median of five.
export function cleanCurve(pts) {
  const voiced = pts.filter((v) => v !== null);
  if (!voiced.length) return pts;
  const mid = median(voiced);
  let out = pts.map((v) => (v !== null && Math.abs(v - mid) > 8 ? null : v));
  out = out.map((v, i) => {
    if (v === null) return null;
    let a = i;
    let b = i;
    while (a > 0 && out[a - 1] !== null) a--;
    while (b < out.length - 1 && out[b + 1] !== null) b++;
    return b - a + 1 < 3 ? null : v;
  });
  return out.map((v, i) => {
    if (v === null) return null;
    return median(out.slice(Math.max(0, i - 2), i + 3).filter((x) => x !== null));
  });
}

// Dynamic time warping between two curves (null = unvoiced), within a band.
// Returns the path as [i, j] pairs, or null.
export function warp(a, b, { band = 0.35 } = {}) {
  const n = a.length;
  const m = b.length;
  if (n < 3 || m < 3) return null;
  if (band === 0) {
    // No warping: your speech stretched evenly onto the model's.
    return a.map((_, i) => [i, Math.round((i * (m - 1)) / (n - 1))]);
  }
  const voicedA = a.filter((x) => x !== null);
  const voicedB = b.filter((x) => x !== null);
  if (voicedA.length < 3 || voicedB.length < 3) return null;
  // Compare shapes, not pitch ranges: scale each by its own spread (at least 0.8 st,
  // so a nearly flat voice isn't blown up into a shape it doesn't have).
  const sa = Math.max(std(voicedA), 0.8);
  const sb = Math.max(std(voicedB), 0.8);
  const cost = (x, y) => (x === null && y === null ? 0 : x === null || y === null ? 0.8 : Math.min(Math.abs(x / sa - y / sb), 3));
  const D = Array.from({ length: n }, () => new Float64Array(m).fill(Infinity));
  const inBand = (i, j) => Math.abs(i / (n - 1) - j / (m - 1)) <= band;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < m; j++) {
      if (!inBand(i, j)) continue;
      const c = cost(a[i], b[j]);
      if (i === 0 && j === 0) D[i][j] = c;
      else {
        const diag = i > 0 && j > 0 ? D[i - 1][j - 1] : Infinity;
        const up = i > 0 ? D[i - 1][j] + 0.15 : Infinity;
        const left = j > 0 ? D[i][j - 1] + 0.15 : Infinity;
        D[i][j] = c + Math.min(diag, up, left);
      }
    }
  }
  if (!Number.isFinite(D[n - 1][m - 1])) return null;
  const path = [[n - 1, m - 1]];
  let i = n - 1;
  let j = m - 1;
  while (i > 0 || j > 0) {
    const diag = i > 0 && j > 0 ? D[i - 1][j - 1] : Infinity;
    const up = i > 0 ? D[i - 1][j] : Infinity;
    const left = j > 0 ? D[i][j - 1] : Infinity;
    if (diag <= up && diag <= left) {
      i--;
      j--;
    } else if (up <= left) i--;
    else j--;
    path.push([i, j]);
  }
  return path.reverse();
}

function pitchAgainstModel(analysis, mora, reference) {
  const you = userCurve(analysis);
  const model = reference.contour;
  const path = warp(you, model, { band: reference.band ?? WARP_BAND });
  if (!path) return null;
  const M = mora.length;
  const moraOf = (j) => {
    const t = j * REF_STEP;
    let k = 0;
    while (k + 1 < M && reference.morae[k + 1] <= t) k++;
    return k;
  };
  // Where each model frame sits along the phrase (0..1), for drawing your curve
  // under the right syllables.
  const xOf = (j) => {
    const k = moraOf(j);
    const t = j * REF_STEP;
    const start = reference.morae[k];
    const end = k + 1 < M ? reference.morae[k + 1] : model.length * REF_STEP;
    return (k + Math.min(1, Math.max(0, (t - start) / Math.max(end - start, REF_STEP)))) / M;
  };

  // Your pitch on each level run of the accent pattern (middle 70% of its model frames).
  const runs = levelRuns(mora).map((run) => {
    const js = [];
    for (let j = 0; j < model.length; j++) {
      const k = moraOf(j);
      if (k >= run.start && k < run.end) js.push(j);
    }
    const trim = Math.floor(js.length * 0.15);
    const keep = new Set(js.slice(trim, js.length - trim || undefined));
    const vals = path.filter(([i, j]) => keep.has(j) && you[i] !== null).map(([i]) => you[i]);
    return { ...run, level: vals.length >= 2 ? median(vals) : null };
  });
  const transitions = [];
  for (let r = 1; r < runs.length; r++) {
    const prev = runs[r - 1];
    const next = runs[r];
    if (prev.high === next.high) continue;
    const dir = next.high ? 'rise' : 'fall';
    if (prev.level === null || next.level === null) {
      transitions.push({ at: next.start, dir, diff: null, score: null });
      continue;
    }
    const diff = next.level - prev.level;
    transitions.push({ at: next.start, dir, diff, score: stepScore(dir === 'rise' ? diff : -diff) });
  }
  const measured = transitions.filter((tr) => tr.score !== null);
  const moves = measured.length ? mean(measured.map((tr) => tr.score)) : null;

  // Shape: how well your pitch follows the model's along the alignment.
  const pairs = path.filter(([i, j]) => you[i] !== null && model[j] !== null);
  let shape = null;
  if (pairs.length >= 8) {
    const xs = pairs.map(([i]) => you[i]);
    const ys = pairs.map(([, j]) => model[j]);
    const mx = mean(xs);
    const my = mean(ys);
    const cov = mean(xs.map((x, k) => (x - mx) * (ys[k] - my)));
    const r = cov / ((std(xs) || 1e-9) * (std(ys) || 1e-9));
    shape = clamp01((r - 0.1) / 0.7);
  }
  const score = moves !== null && shape !== null ? 0.6 * moves + 0.4 * shape : moves ?? shape;

  const contour = mora.map((_, k) => {
    const vals = path.filter(([i, j]) => moraOf(j) === k && you[i] !== null).map(([i]) => you[i]);
    return vals.length ? median(vals) : null;
  });
  const seen = new Set();
  const aligned = [];
  for (const [i, j] of path) {
    if (seen.has(i)) continue;
    seen.add(i);
    aligned.push({ x: xOf(j), st: you[i] });
  }
  const voiced = you.filter((v) => v !== null);
  const flat = voiced.length > 5 && percentile(voiced, 0.9) - percentile(voiced, 0.1) < 1.2;
  return { score, transitions, contour, flat, aligned, moves, shape, method: 'model' };
}

// --- Rhythm ------------------------------------------------------------------------

// Rhythm tolerance (your time ÷ the model's): full marks from min to max, falling to
// zero over fallFast below min and fallSlow above max. Faster model speeds use tighter
// ones (game/speed.js); this is the "normal" one.
export const NORMAL_FIT = { min: 0.8, max: 1.3, fallFast: 0.4, fallSlow: 0.9 };

export function rhythmScore(analysis, moraCount, refDuration = null, fit = NORMAL_FIT) {
  const { span, pauses } = analysis;
  if (!span) return { score: null, ratio: null, duration: 0, pauses: [], feedback: [] };
  const duration = span.end - span.start;
  const ref = refDuration && refDuration > 0.3 ? refDuration : moraCount / DEFAULT_MORA_RATE;
  const ratio = duration / ref;
  // Anything from a little quicker to a little slower than the model is full marks.
  let score = 1;
  if (ratio < fit.min) score = 1 - (fit.min - ratio) / fit.fallFast;
  else if (ratio > fit.max) score = 1 - (ratio - fit.max) / fit.fallSlow;
  score -= pauses.length * 0.15;
  const feedback = [];
  // Far shorter than the phrase can be said: we only caught part of it.
  if (ratio < 0.45) feedback.push('partial');
  else if (ratio < fit.min) feedback.push('fast');
  if (ratio > fit.max) feedback.push('slow');
  if (pauses.length) feedback.push('pause');
  return { score: clamp01(score), ratio, duration, pauses, feedback };
}

// --- Words -------------------------------------------------------------------------

const toHira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
export const normalize = (s) =>
  toHira(String(s || '').normalize('NFKC'))
    .replace(/[\s。、！？!?,.・「」『』（）()〜~]/g, '')
    .toLowerCase();

export function levenshtein(a, b) {
  const A = [...a];
  const B = [...b];
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[B.length];
}

const similarity = (a, b) => {
  const len = Math.max([...a].length, [...b].length);
  return len ? 1 - levenshtein(a, b) / len : 0;
};

// heard: the recogniser's alternatives (best first), or null if it isn't available.
// The phrase matches in its written form, its kana, or any listed variant.
export function wordsScore(heard, phrase) {
  if (heard === null) return { score: null, heard: null };
  const targets = [phrase.text, phrase.units.map((u) => u[0]).join(''), ...(phrase.alt || [])].map(normalize);
  let best = { score: 0, heard: heard[0] || '' };
  for (const h of heard) {
    const n = normalize(h);
    if (!n) continue;
    for (const target of targets) {
      const s = similarity(n, target);
      if (s > best.score) best = { score: s, heard: h };
    }
  }
  return best;
}

// --- Total -------------------------------------------------------------------------

export const WEIGHTS = { words: 0.4, pitch: 0.35, rhythm: 0.25 };
export const LIMITED_MAX = 60;

// 0..100, weighting only the parts that could be measured.
export function total(parts) {
  let sum = 0;
  let weight = 0;
  for (const [key, w] of Object.entries(WEIGHTS)) {
    const s = parts[key]?.score;
    if (s === null || s === undefined) continue;
    sum += s * w;
    weight += w;
  }
  return weight ? Math.round((sum / weight) * 100) : 0;
}

export function grade(score) {
  if (score >= 90) return 'S';
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  return 'D';
}

// The recogniser came back empty although we clearly heard a whole attempt. On
// Android Chrome this usually means it couldn't get the microphone while we were
// recording, not that you said nothing, so the words are left unscored.
export const recognizerMissed = (heard, rhythm) =>
  Array.isArray(heard) && !heard.some((h) => normalize(h)) && rhythm.ratio !== null && rhythm.ratio >= 0.45;

// Score one attempt end to end.
// words: an already-made word score ({ score 0..1, ... }, e.g. from the on-device
// check) to use instead of the recogniser's `heard`.
export function scoreAttempt({ analysis, mora, phrase, heard, refDuration, fit = NORMAL_FIT, reference = null, words = null }) {
  if (!analysis.span) {
    return { total: 0, grade: 'D', silent: true, words: { score: null }, pitch: { score: null }, rhythm: { score: null } };
  }
  const rhythm = rhythmScore(analysis, mora.length, refDuration, fit);
  const missed = !words && recognizerMissed(heard, rhythm);
  const parts = {
    words: words ? { heard: null, ...words } : missed ? { score: null, heard: null, missed: true } : wordsScore(heard, phrase),
    pitch: pitchScore(analysis, mora, reference),
    rhythm,
  };
  // Rhythm alone can't earn a top grade: with neither pitch nor words measurable
  // (a poor microphone, no speech recognition) the score is capped.
  const limited = parts.pitch.score === null && parts.words.score === null;
  const t = limited ? Math.min(total(parts), LIMITED_MAX) : total(parts);
  return { ...parts, total: t, grade: grade(t), silent: false, limited };
}
