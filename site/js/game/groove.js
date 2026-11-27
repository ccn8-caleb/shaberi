// 相づちグルーヴ (Aizuchi Groove): a friend tells a story to the beat; you answer each
// line with an aizuchi (うん, へえ, ほんと？…) on beat 4. Pure: the song, its timeline
// and the timing judge. The page plays it and feeds in voice onsets.
//
// Made for learners: every line comes twice. First a demo bar (the friend says the
// line, the model voice answers on beat 4), then your bar (the same line, and you
// answer, with a 3-2-1 countdown on screen). Practice lines at the start measure your
// device's audio delay and aren't scored.

export const BPM = 84;
export const SPB = 60 / BPM; // seconds per beat
export const BEATS_PER_BAR = 4;
export const COUNT_IN = 4; // beats before the first bar
export const ANSWER_BEAT = 3; // 0-based: beat 4 of the bar

// Generous windows (seconds either way).
export const JUDGE = { perfect: 0.1, good: 0.2, ok: 0.35 };
export const POINTS = { perfect: 3, good: 2, ok: 1, miss: 0 };

// A line must finish this long before the answer beat, so its sound has died away
// before you're expected to speak (see LINE_MAX).
export const GATE_S = 0.2;
export const MAX_LATENCY = 0.2;
// Longest a spoken line may be (it starts on beat 1).
export const LINE_MAX = ANSWER_BEAT * SPB - JUDGE.ok - GATE_S - MAX_LATENCY; // ≈1.39 s at 84 BPM

// Original story. line: what the friend says; you: your answer.
export const SONG = [
  { practice: true, line: 'いちにさん', you: 'はい！' },
  { practice: true, line: 'いちにさん', you: 'はい！' },
  { line: 'きのうね', you: 'うん' },
  { line: 'ねこを みたの', you: 'へえ！' },
  { line: 'おおきい ねこ', you: 'ほんと？' },
  { line: 'ぼうし つきで', you: 'えー！' },
  { line: 'でんしゃに のった', you: 'すごい！' },
  { line: 'ほんとうだよ', you: 'なるほど' },
];

// Everything that happens, in seconds from the song's start:
//   cues:    [{ t, bar, beat, kind, text, practice }]
//            kind: 'count' | 'line' (friend speaks) | 'demo' (model answers) |
//                  'countdown' (your bar's 3-2-1, text = '3' / '2' / '1') | 'you' (your beat) | 'kick'
//   targets: [{ t, bar, practice, text }]  (your beats)
//   end:     seconds
export function timeline(song = SONG) {
  const cues = [];
  const targets = [];
  for (let b = 0; b < COUNT_IN; b++) cues.push({ t: b * SPB, bar: -1, beat: b, kind: 'count', text: String(COUNT_IN - b) });
  let bar = 0;
  song.forEach((s) => {
    for (const turn of ['demo', 'you']) {
      const t0 = (COUNT_IN + bar * BEATS_PER_BAR) * SPB;
      const base = { bar, practice: Boolean(s.practice) };
      cues.push({ ...base, t: t0, beat: 0, kind: 'line', text: s.line, turn });
      for (let beat = 0; beat < ANSWER_BEAT; beat++) {
        cues.push({ ...base, t: t0 + beat * SPB, beat, kind: 'kick' });
        if (turn === 'you') cues.push({ ...base, t: t0 + beat * SPB, beat, kind: 'countdown', text: String(ANSWER_BEAT - beat) });
      }
      const at = t0 + ANSWER_BEAT * SPB;
      if (turn === 'demo') cues.push({ ...base, t: at, beat: ANSWER_BEAT, kind: 'demo', text: s.you });
      else {
        cues.push({ ...base, t: at, beat: ANSWER_BEAT, kind: 'you', text: s.you });
        targets.push({ ...base, t: at, text: s.you });
      }
      bar++;
    }
  });
  cues.sort((a, b) => a.t - b.t);
  return { cues, targets, end: (COUNT_IN + bar * BEATS_PER_BAR) * SPB };
}

// Onsets during or right after the game's own sounds are probably the speakers leaking
// into the mic: ignore them. sounds: [{ start, end }] in the same clock as t.
export const isEcho = (t, sounds, latency = 0) => sounds.some((s) => t >= s.start && t <= s.end + GATE_S + latency);

export function grade(error) {
  const e = Math.abs(error);
  if (e <= JUDGE.perfect) return 'perfect';
  if (e <= JUDGE.good) return 'good';
  if (e <= JUDGE.ok) return 'ok';
  return null;
}

// Stateful judge: give it onsets as they arrive; it matches each to the nearest open
// target (first onset per target wins) and reports the judgement.
export class Judge {
  constructor(targets) {
    this.targets = targets.map((t) => ({ ...t, result: null, error: null }));
    this.latency = 0;
  }

  // raw: the onset as heard by the mic (song seconds); the device delay is subtracted here.
  onset(raw) {
    const t = raw - this.latency;
    let best = null;
    for (const target of this.targets) {
      if (target.result) continue;
      const err = t - target.t;
      if (Math.abs(err) <= JUDGE.ok && (!best || Math.abs(err) < Math.abs(best.err))) best = { target, err };
    }
    if (!best) return null;
    best.target.result = grade(best.err);
    best.target.error = best.err;
    best.target.raw = raw;
    return best.target;
  }

  // Targets whose window has passed with no onset become misses.
  expire(now) {
    const missed = [];
    for (const target of this.targets) {
      if (!target.result && now - this.latency > target.t + JUDGE.ok) {
        target.result = 'miss';
        missed.push(target);
      }
    }
    return missed;
  }

  // After the practice lines: the player's typical delay (median error of practice
  // hits, measured before any correction), kept within a sane range.
  calibrate() {
    const errs = this.targets.filter((t) => t.practice && t.raw !== undefined).map((t) => t.raw - t.t);
    if (errs.length < 2) return this.latency;
    errs.sort((a, b) => a - b);
    const med = errs[errs.length >> 1];
    this.latency = Math.max(0, Math.min(MAX_LATENCY, med));
    return this.latency;
  }

  // Score over the real (non-practice) lines: 0..100 plus counts.
  summary() {
    const scored = this.targets.filter((t) => !t.practice);
    const counts = { perfect: 0, good: 0, ok: 0, miss: 0 };
    for (const t of scored) counts[t.result || 'miss']++;
    const max = scored.length * POINTS.perfect;
    const got = scored.reduce((s, t) => s + POINTS[t.result || 'miss'], 0);
    return { score: max ? Math.round((got / max) * 100) : 0, counts, total: scored.length };
  }
}
