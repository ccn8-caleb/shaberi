// 相づちグルーヴ (Aizuchi Groove) on screen. Every sound is scheduled up front on the
// AudioContext clock; the mic's blocks carry times on the same clock, so each voice
// onset is compared with its beat exactly. Visuals follow what the player hears
// (the clock minus the output latency).

import { t } from '../core/prefs.js';
import { splitMora } from '../engine/mora.js';
import { OnsetDetector } from '../engine/onset.js';
import { grade as letterGrade } from '../engine/score.js';
import { timeline, Judge, isEcho, SPB, JUDGE } from '../game/groove.js';
import * as sfx from '../audio/sfx.js';

const $ = (id) => document.getElementById(id);
const LEAD_S = 0.8; // from pressing Start to the first count-in beat

const LABELS = {
  perfect: { ja: 'ぴったり！', en: 'Perfect!' },
  good: { ja: 'いいね！', en: 'Nice!' },
  early: { ja: 'はやい', en: 'Early' },
  late: { ja: 'おそい', en: 'Late' },
  miss: { ja: 'ミス', en: 'Miss' },
};

export function runGroove({ mic }) {
  const ctx = mic.ctx;
  const { cues, targets, end } = timeline();
  const judge = new Judge(targets);
  const start = ctx.currentTime + LEAD_S;
  const lastPractice = Math.max(...targets.filter((x) => x.practice).map((x) => x.t));
  let calibrated = false;
  let aborted = false;
  let raf = 0;
  let finish;
  const done = new Promise((r) => (finish = r));

  // ---- schedule the music
  const soundTimes = [];
  for (const cue of cues) {
    const at = start + cue.t;
    if (cue.kind === 'count') {
      sfx.tick(ctx, at, cue.beat === 0);
      soundTimes.push(at);
    } else if (cue.kind === 'friend') {
      sfx.kick(ctx, at);
      const n = Math.min(3, Math.max(1, splitMora(cue.text.replace(/[、。？！]/g, '')).length >> 1));
      soundTimes.push(at, ...sfx.blips(ctx, at, n, { step: SPB / 6 }));
    } else if (cue.kind === 'rest') {
      sfx.kick(ctx, at);
      soundTimes.push(at);
    }
    // Your beats stay silent: anything heard there is you.
  }

  // ---- visuals
  const friend = $('groove-friend');
  const you = $('groove-you');
  const friendBubble = $('groove-friend-bubble');
  const youBubble = $('groove-you-bubble');
  const dots = [...$('groove-beats').children];
  const pop = $('groove-judge');
  const banner = $('groove-banner');
  const phase = $('groove-phase');

  const showJudge = (kind) => {
    const l = LABELS[kind];
    pop.className = `judge-pop ${kind === 'early' || kind === 'late' ? 'ok' : kind}`;
    pop.textContent = t(l.ja, l.en);
    void pop.offsetWidth;
    pop.classList.add('go');
  };
  const showBanner = (text, ms = 900) => {
    banner.textContent = text;
    banner.hidden = false;
    clearTimeout(showBanner.timer);
    showBanner.timer = setTimeout(() => (banner.hidden = true), ms);
  };
  const bounce = (actor) => {
    actor.classList.add('bounce');
    setTimeout(() => actor.classList.remove('bounce'), 120);
  };

  phase.textContent = t('れんしゅう', 'Practice');
  friendBubble.className = 'bubble';
  youBubble.className = 'bubble';
  banner.hidden = true;

  let nextCue = 0;
  const frame = () => {
    if (aborted) return;
    const heardNow = ctx.currentTime - start - (ctx.outputLatency || ctx.baseLatency || 0);
    while (nextCue < cues.length && cues[nextCue].t <= heardNow) {
      const cue = cues[nextCue++];
      dots.forEach((d, i) => {
        d.classList.toggle('on', i === cue.beat);
        d.classList.toggle('you', i === cue.beat && cue.kind === 'you');
      });
      if (cue.kind === 'count') showBanner(cue.text, SPB * 900);
      if (cue.kind === 'friend') {
        friendBubble.textContent = cue.text;
        friendBubble.className = 'bubble show';
        friend.classList.add('talk');
        setTimeout(() => friend.classList.remove('talk'), 220);
        bounce(friend);
        youBubble.className = 'bubble';
      }
      if (cue.kind === 'you') {
        youBubble.textContent = cue.text;
        youBubble.className = 'bubble now';
      }
      // A beat early, show what you'll say next.
      const upcoming = cues[nextCue];
      if (upcoming?.kind === 'you' && cue.kind !== 'you') {
        youBubble.textContent = upcoming.text;
        youBubble.className = 'bubble ready';
      }
    }
    // Misses
    for (const m of judge.expire(ctx.currentTime - start)) if (!m.practice || !calibrated) showJudge('miss');
    // Practice over: learn the delay, then the real song.
    if (!calibrated && ctx.currentTime - start > lastPractice + JUDGE.ok + 0.15) {
      calibrated = true;
      judge.calibrate();
      phase.textContent = t('本番', 'Live!');
      showBanner(t('本番スタート！', "Here we go!"), 1200);
    }
    if (ctx.currentTime - start > end + 0.4) return stop();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  // ---- listen
  const detector = new OnsetDetector(mic.sampleRate);
  mic.start((block, level, time) => {
    if (aborted) return;
    for (const at of detector.feed(block, time)) {
      if (isEcho(at, soundTimes, judge.latency)) continue;
      const hit = judge.onset(at - start);
      if (!hit) continue;
      bounce(you);
      you.classList.add('talk');
      setTimeout(() => you.classList.remove('talk'), 200);
      if (hit.result === 'perfect' || hit.result === 'good') showJudge(hit.result);
      else showJudge(hit.error < 0 ? 'early' : 'late');
      if (hit.result === 'perfect') sfx.pop(ctx);
    }
  });

  function stop() {
    cancelAnimationFrame(raf);
    if (mic.recording) mic.stop();
    const s = judge.summary();
    const g = letterGrade(s.score);
    finish({
      score: s.score,
      grade: g,
      detail: t(
        `ぴったり ${s.counts.perfect} ・ いいね ${s.counts.good} ・ おしい ${s.counts.ok} ・ ミス ${s.counts.miss}`,
        `Perfect ${s.counts.perfect} · Nice ${s.counts.good} · Close ${s.counts.ok} · Miss ${s.counts.miss}`
      ),
      points: Math.round(s.score * 3),
      latency: judge.latency,
    });
  }

  return {
    done,
    abort() {
      aborted = true;
      cancelAnimationFrame(raf);
      sfx.cut();
      if (mic.recording) mic.stop();
    },
  };
}
