// 相づちグルーヴ (Aizuchi Groove): a friend tells a story to the beat; you answer each
// line with an aizuchi (うん, へえ, ほんと？…) on beat 4. Pure: the song, its timeline
// and the timing judge. The page plays it and feeds in voice onsets.
//
// Made for learners: every line comes twice. First a demo bar (the friend says the
// line, the model voice answers on beat 4), then your bar (the same line, and you
// answer, with a 3-2-1 countdown on screen). Practice lines at the start measure your
// device's audio delay and aren't scored.

export const COUNT_IN = 4; // beats before the first bar

// Bars are always 4 beats (what anyone used to music expects).
export const BAR = 4;

// Tempos. Faster ones: the beat is quicker, the timing windows (a share of the beat)
// get tighter, and points are multiplied. turn = beats per turn (the friend's line, then
// you answer on its last beat): one bar at the slower tempos; at the fast ones, two bars,
// so the lines still fit at a natural speaking speed. The first two are open from the
// start; scoring UNLOCK_SCORE on your fastest open tempo opens the next.
export const TEMPOS = [
  { bpm: 84, turn: 4, ja: 'ゆっくり', en: 'Easy', points: 1 },
  { bpm: 100, turn: 4, ja: 'ふつう', en: 'Normal', points: 1.25 },
  { bpm: 116, turn: 8, ja: 'はやめ', en: 'Quick', points: 1.5 },
  { bpm: 132, turn: 8, ja: 'ネイティブ', en: 'Native', points: 2 },
];
// The countdown on screen before your answer: 3・2・1・いま！
export const COUNTDOWN = 3;
export const OPEN_AT_START = 2;
export const DEFAULT_BPM = 100;
export const UNLOCK_SCORE = 80;
export const tempoOf = (bpm) => TEMPOS.find((x) => x.bpm === bpm) || TEMPOS.find((x) => x.bpm === DEFAULT_BPM);
export const answerBeat = (bpm) => tempoOf(bpm).turn - 1; // 0-based: the last beat of the turn

export const spb = (bpm) => 60 / bpm; // seconds per beat
// Timing windows (seconds either way), as shares of a beat: at 84 BPM that's ±0.10
// perfect, ±0.20 good, ±0.35 at most.
export const judgeWindows = (bpm) => ({ perfect: 0.14 * spb(bpm), good: 0.28 * spb(bpm), ok: 0.49 * spb(bpm) });
export const POINTS = { perfect: 3, good: 2, ok: 1, miss: 0 };

// A line must finish this long before the answer window opens, so its sound has died
// away before you're expected to speak (see lineMax).
export const GATE_S = 0.2;
export const MAX_LATENCY = 0.2;
// Longest a spoken line may be at a tempo (it starts on beat 1).
export const lineMax = (bpm) => answerBeat(bpm) * spb(bpm) - judgeWindows(bpm).ok - GATE_S - MAX_LATENCY;
// Longest a model answer may be: it must end before the next bar's line starts.
export const answerMax = (bpm) => spb(bpm) * 0.85;

// Every song starts with these (they measure your device's delay and aren't scored).
export const PRACTICE = [
  { practice: true, line: 'いちにさん', you: 'はい！' },
  { practice: true, line: 'いちにさん', you: 'はい！' },
];

// Original stories, one per song, picked at random. line: what the friend says (kana,
// short enough to say naturally in about three beats); you: your aizuchi (at most four
// morae: it has to fit in a beat at the fastest tempo).
export const STORIES = [
  {
    id: 'neko', ja: 'でんしゃの ねこ', en: 'The cat on the train',
    lines: [
      { line: 'きのうね', you: 'うん' },
      { line: 'ねこを みたの', you: 'へえ！' },
      { line: 'おおきい ねこ', you: 'ほんと？' },
      { line: 'ぼうし つきで', you: 'えー！' },
      { line: 'でんしゃに のった', you: 'すごい！' },
      { line: 'ほんとうだよ', you: 'なるほど' },
    ],
  },
  {
    id: 'cafe', ja: 'カフェの おまけ', en: 'A café treat',
    lines: [
      { line: 'けさ カフェでね', you: 'うん' },
      { line: 'ケーキ たのんだら', you: 'うん' },
      { line: 'ふたつ きたの', you: 'えー！' },
      { line: 'おまけ だって', you: 'いいね！' },
      { line: 'ぜんぶ たべた', you: 'すごい！' },
      { line: 'おなか いっぱい', you: 'わかる' },
    ],
  },
  {
    id: 'ame', ja: 'あめの ひ', en: 'A rainy day',
    lines: [
      { line: 'きょう あめでしょ', you: 'うん' },
      { line: 'かさ わすれて', you: 'えー！' },
      { line: 'えきまで はしった', you: 'まじで？' },
      { line: 'でも ついたら', you: 'うん' },
      { line: 'あめ やんでた', you: 'うそ！' },
      { line: 'ついてないよね', you: 'たしかに' },
    ],
  },
  {
    id: 'test', ja: 'あしたの テスト', en: "Tomorrow's test",
    lines: [
      { line: 'あしたの テスト', you: 'うん' },
      { line: 'ぜんぜん してない', you: 'えー！' },
      { line: 'でも だいじょうぶ', you: 'ほんと？' },
      { line: 'もんだいを ぜんぶ', you: 'うん' },
      { line: 'よそう したから', you: 'すごい！' },
      { line: 'たぶん ね', you: 'なるほど' },
    ],
  },
  {
    id: 'yama', ja: 'やまの さる', en: 'The mountain monkey',
    lines: [
      { line: 'しゅうまつ ね', you: 'うん' },
      { line: 'やまに いったの', you: 'へえ！' },
      { line: 'さるが いてね', you: 'ほんと？' },
      { line: 'おにぎり とられた', you: 'うそ！' },
      { line: 'でも かわいかった', you: 'そっか' },
      { line: 'また いきたい', you: 'いいね！' },
    ],
  },
  {
    id: 'shigoto', ja: 'あたらしい しごと', en: 'The new job',
    lines: [
      { line: 'あたらしい しごと', you: 'うん' },
      { line: 'きょうから なの', you: 'へえ！' },
      { line: 'せんぱいが やさしい', you: 'よかった！' },
      { line: 'ひるも おごって', you: 'いいね！' },
      { line: 'あさが はやい', you: 'たいへん！' },
      { line: 'がんばるね', you: 'うん！' },
    ],
  },
];

export const songOf = (story) => [...PRACTICE, ...story.lines];
// A random story, not the one played last time (lastId) when there's a choice.
export function pickStory(rand = Math.random, lastId = null) {
  const pool = STORIES.filter((x) => x.id !== lastId);
  return pool[Math.floor(rand() * pool.length)] || STORIES[0];
}
// Every line and answer in every story (for building the recordings).
export const ALL_LINES = [...new Set([...PRACTICE, ...STORIES.flatMap((x) => x.lines)].map((x) => x.line))];
export const ALL_ANSWERS = [...new Set([...PRACTICE, ...STORIES.flatMap((x) => x.lines)].map((x) => x.you))];

export const SONG = songOf(STORIES[0]);

// Everything that happens, in seconds from the song's start:
//   cues:    [{ t, bar, beat, kind, text, practice }]  (bar = turn number; beat within
//            the turn, so beat % BAR is the beat within the 4-beat bar)
//            kind: 'count' | 'line' (friend speaks) | 'demo' (model answers) |
//                  'countdown' (your bar's 3-2-1, text = '3' / '2' / '1') | 'you' (your beat) | 'kick'
//   targets: [{ t, bar, practice, text }]  (your beats)
//   end:     seconds
export function timeline(song = SONG, bpm = DEFAULT_BPM) {
  const SPB = spb(bpm);
  const BEATS_PER_TURN = tempoOf(bpm).turn;
  const ANSWER_BEAT = answerBeat(bpm);
  const cues = [];
  const targets = [];
  for (let b = 0; b < COUNT_IN; b++) cues.push({ t: b * SPB, bar: -1, beat: b, kind: 'count', text: String(COUNT_IN - b) });
  let bar = 0;
  song.forEach((s) => {
    for (const turn of ['demo', 'you']) {
      const t0 = (COUNT_IN + bar * BEATS_PER_TURN) * SPB;
      const base = { bar, practice: Boolean(s.practice) };
      cues.push({ ...base, t: t0, beat: 0, kind: 'line', text: s.line, turn });
      for (let beat = 0; beat < ANSWER_BEAT; beat++) {
        cues.push({ ...base, t: t0 + beat * SPB, beat, kind: 'kick' });
        if (turn === 'you' && ANSWER_BEAT - beat <= COUNTDOWN) cues.push({ ...base, t: t0 + beat * SPB, beat, kind: 'countdown', text: String(ANSWER_BEAT - beat) });
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
  return { cues, targets, end: (COUNT_IN + bar * BEATS_PER_TURN) * SPB };
}

// Onsets during or right after the game's own sounds are probably the speakers leaking
// into the mic: ignore them. sounds: [{ start, end }] in the same clock as t.
export const isEcho = (t, sounds, latency = 0) => sounds.some((s) => t >= s.start && t <= s.end + GATE_S + latency);

export function grade(error, windows = judgeWindows(DEFAULT_BPM)) {
  const e = Math.abs(error);
  if (e <= windows.perfect) return 'perfect';
  if (e <= windows.good) return 'good';
  if (e <= windows.ok) return 'ok';
  return null;
}

// Stateful judge: give it onsets as they arrive; it matches each to the nearest open
// target (first onset per target wins) and reports the judgement.
export class Judge {
  constructor(targets, windows = judgeWindows(DEFAULT_BPM)) {
    this.targets = targets.map((t) => ({ ...t, result: null, error: null }));
    this.windows = windows;
    this.latency = 0;
  }

  // raw: the onset as heard by the mic (song seconds); the device delay is subtracted here.
  onset(raw) {
    const t = raw - this.latency;
    let best = null;
    for (const target of this.targets) {
      if (target.result) continue;
      const err = t - target.t;
      if (Math.abs(err) <= this.windows.ok && (!best || Math.abs(err) < Math.abs(best.err))) best = { target, err };
    }
    if (!best) return null;
    best.target.result = grade(best.err, this.windows);
    best.target.error = best.err;
    best.target.raw = raw;
    return best.target;
  }

  // Targets whose window has passed with no onset become misses.
  expire(now) {
    const missed = [];
    for (const target of this.targets) {
      if (!target.result && now - this.latency > target.t + this.windows.ok) {
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
