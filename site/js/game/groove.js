// 相づちグルーヴ (Aizuchi Groove): a friend tells a story to a beat; you answer with an
// aizuchi (うん, へえ, ほんと？…) exactly on your beat. Pure: the song, its timeline
// and the timing judge. The page plays it and feeds in voice onsets.
//
// A bar is 4 beats. `beats` marks each: 'f' the friend says the next chunk of `line`,
// 'y' you answer with `you`, '.' rest. Practice bars are used to measure the delay of
// the player's microphone and speakers, and aren't scored.

export const BPM = 96;
export const SPB = 60 / BPM; // seconds per beat
export const COUNT_IN = 4; // beats before the first bar

export const JUDGE = { perfect: 0.07, good: 0.14, ok: 0.24 }; // seconds either way
export const POINTS = { perfect: 3, good: 2, ok: 1, miss: 0 };

// Original story, chunked one chunk per friend beat.
export const SONG = [
  { practice: true, beats: 'fffy', line: ['いち', 'に', 'さん'], you: 'はい！' },
  { practice: true, beats: 'fffy', line: ['いち', 'に', 'さん'], you: 'はい！' },
  { practice: true, beats: 'fffy', line: ['いち', 'に', 'さん'], you: 'はい！' },
  { beats: 'fffy', line: ['きのう', 'ね、', 'えきで'], you: 'うん' },
  { beats: 'fffy', line: ['おおきな', 'ねこを', 'みたの'], you: 'へえ！' },
  { beats: 'fffy', line: ['しかも', 'ぼうしを', 'かぶってて'], you: 'ほんと？' },
  { beats: 'fyfy', line: ['あかい', 'ぼうし'], you: 'うん' },
  { beats: 'fffy', line: ['でんしゃに', 'のって', 'いったの'], you: 'えー！' },
  { beats: 'ff.y', line: ['どこに', 'いくのかな'], you: 'ふしぎ！' },
  { beats: 'fyfy', line: ['つぎの', 'えきで'], you: 'うん' },
  { beats: 'fffy', line: ['おばあさんに', 'せきを', 'ゆずったの'], you: 'すごい！' },
  { beats: 'fy.y', line: ['ねこが？'], you: 'ねこが！' },
  { beats: 'fffy', line: ['ほんとうの', 'はなし', 'だよ'], you: 'なるほど' },
];

// Everything that happens, in seconds from the song's start (beat 0 of the count-in):
//   cues:    [{ t, bar, beat, kind: 'count' | 'friend' | 'you' | 'rest', text }]
//   targets: [{ t, bar, practice, text }]  (your beats)
//   end:     seconds
export function timeline(song = SONG) {
  const cues = [];
  const targets = [];
  for (let b = 0; b < COUNT_IN; b++) cues.push({ t: b * SPB, bar: -1, beat: b, kind: 'count', text: String(COUNT_IN - b) });
  song.forEach((bar, bi) => {
    let chunk = 0;
    [...bar.beats].forEach((c, beat) => {
      const t = (COUNT_IN + bi * 4 + beat) * SPB;
      if (c === 'f') cues.push({ t, bar: bi, beat, kind: 'friend', text: bar.line[chunk++] || '' });
      else if (c === 'y') {
        cues.push({ t, bar: bi, beat, kind: 'you', text: bar.you });
        targets.push({ t, bar: bi, practice: Boolean(bar.practice), text: bar.you });
      } else cues.push({ t, bar: bi, beat, kind: 'rest', text: '' });
    });
  });
  return { cues, targets, end: (COUNT_IN + song.length * 4) * SPB };
}

// Onsets right after the game's own sounds are probably the speakers leaking into
// the mic: ignore them. soundTimes are cue times that made a sound.
export const GATE_S = 0.3;
export const isEcho = (t, soundTimes, latency = 0) => soundTimes.some((s) => t >= s && t <= s + GATE_S + latency);

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

  // onset already corrected? No: raw time; latency is subtracted here.
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

  // After the practice bars: the player's typical delay (median error of practice
  // hits, measured before any correction), kept within a sane range.
  calibrate() {
    const errs = this.targets.filter((t) => t.practice && t.raw !== undefined).map((t) => t.raw - t.t);
    if (errs.length < 2) return this.latency;
    errs.sort((a, b) => a - b);
    const med = errs[errs.length >> 1];
    this.latency = Math.max(0, Math.min(0.2, med));
    return this.latency;
  }

  // Score over the real (non-practice) bars: 0..100 plus counts.
  summary() {
    const scored = this.targets.filter((t) => !t.practice);
    const counts = { perfect: 0, good: 0, ok: 0, miss: 0 };
    for (const t of scored) counts[t.result || 'miss']++;
    const max = scored.length * POINTS.perfect;
    const got = scored.reduce((s, t) => s + POINTS[t.result || 'miss'], 0);
    return { score: max ? Math.round((got / max) * 100) : 0, counts, total: scored.length };
  }
}
