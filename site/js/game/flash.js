// 瞬間しゃべり (Flash Speak): a stream of few-second voice microgames. Lose a life
// for each miss; every few clears the clock gets shorter. Pure rules + deck; the page
// runs the microgames.

import { REPLIES, COUNTS, COUNT_THINGS, ACCENT_PAIRS } from '../data/micro.js';
import { normalize } from '../engine/score.js';
import { rng } from './run.js';

export const LIVES = 4;
export const SPEEDUP_EVERY = 5;
// Generous for learners: 7 s to start, never under 4 s.
export const START_SECONDS = 7;
export const MIN_SECONDS = 4;
// A hint (the answer) appears once this share of the time has gone.
export const HINT_AT = 0.55;

// Seconds allowed for the next microgame after `cleared` clears.
export const timeLimit = (cleared) => Math.max(MIN_SECONDS, START_SECONDS * 0.9 ** Math.floor(cleared / SPEEDUP_EVERY));
export const level = (cleared) => 1 + Math.floor(cleared / SPEEDUP_EVERY);

// Does what the recogniser heard contain one of the answers?
export function matches(heard, answers) {
  const h = normalize(heard);
  return answers.some((a) => h.includes(normalize(a)));
}

// Points for a finished game: 15 a clear, plus 5 more for each clear past every speed-up.
export const payout = (cleared) => cleared * 15 + Math.max(0, cleared - SPEEDUP_EVERY) * 5;

// An endless deck of microgames. kinds: which types can be played (speech recognition
// is needed for 'reply' and 'count'; 'accent' only needs the mic). Never the same
// item twice in a row.
export function deck(seed, kinds = ['reply', 'count', 'accent']) {
  const rand = rng(seed);
  const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  let lastKey = null;
  return () => {
    for (;;) {
      const kind = pick(kinds);
      let game;
      if (kind === 'reply') {
        const r = pick(REPLIES);
        game = { kind, key: `reply:${r.id}`, ...r };
      } else if (kind === 'count') {
        const c = pick(COUNTS);
        game = { kind, key: `count:${c.n}`, n: c.n, answers: c.answers, thing: pick(COUNT_THINGS) };
      } else {
        const word = pick(pick(ACCENT_PAIRS));
        game = { kind, key: `accent:${word.text}`, ...word };
      }
      if (game.key !== lastKey) {
        lastKey = game.key;
        return game;
      }
    }
  };
}
