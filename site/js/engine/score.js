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

// A rise or fall counts fully at this many semitones, and not at all at 0 or the
// wrong way. Real accent falls are 2–5 semitones; initial rises are smaller.
const FULL_STEP_ST = 1.5;

// Time window of mora [from, to) when the speech span is divided evenly into mora.
// Japanese mora are roughly equal in length, which is what makes this workable.
function moraWindow(span, moraCount, from, to) {
  const u = (span.end - span.start) / moraCount;
  return [span.start + from * u, span.start + to * u];
}

export function pitchScore(analysis, mora) {
  const { span, frames, medianF0 } = analysis;
  if (!span || !medianF0 || mora.length < 2) return { score: null, transitions: [], contour: [], flat: false };
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
    transitions.push({ at: next.start, dir, diff, score: clamp01(signed / FULL_STEP_ST) });
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

// --- Rhythm ------------------------------------------------------------------------

export function rhythmScore(analysis, moraCount, refDuration = null) {
  const { span, pauses } = analysis;
  if (!span) return { score: null, ratio: null, duration: 0, pauses: [], feedback: [] };
  const duration = span.end - span.start;
  const ref = refDuration && refDuration > 0.3 ? refDuration : moraCount / DEFAULT_MORA_RATE;
  const ratio = duration / ref;
  // Anything from a little quicker to a little slower than the model is full marks.
  let score = 1;
  if (ratio < 0.8) score = 1 - (0.8 - ratio) / 0.4;
  else if (ratio > 1.3) score = 1 - (ratio - 1.3) / 0.9;
  score -= pauses.length * 0.15;
  const feedback = [];
  // Far shorter than the phrase can be said: we only caught part of it.
  if (ratio < 0.45) feedback.push('partial');
  else if (ratio < 0.8) feedback.push('fast');
  if (ratio > 1.3) feedback.push('slow');
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
export function scoreAttempt({ analysis, mora, phrase, heard, refDuration }) {
  if (!analysis.span) {
    return { total: 0, grade: 'D', silent: true, words: { score: null }, pitch: { score: null }, rhythm: { score: null } };
  }
  const rhythm = rhythmScore(analysis, mora.length, refDuration);
  const missed = recognizerMissed(heard, rhythm);
  const parts = {
    words: missed ? { score: null, heard: null, missed: true } : wordsScore(heard, phrase),
    pitch: pitchScore(analysis, mora),
    rhythm,
  };
  const t = total(parts);
  return { ...parts, total: t, grade: grade(t), silent: false };
}
