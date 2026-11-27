// 相づちグルーヴ (Aizuchi Groove) on screen. Every sound (beat, the friend's lines, the
// model's answers) is decoded first, then scheduled on the AudioContext clock; the mic's
// blocks carry times on the same clock, so each voice onset is compared with its beat
// exactly. Visuals follow what the player hears (the clock minus the output latency).

import { t } from '../core/prefs.js';
import { OnsetDetector } from '../engine/onset.js';
import { grade as letterGrade } from '../engine/score.js';
import { timeline, Judge, isEcho, JUDGE, SPB } from '../game/groove.js';
import { GROOVE_AUDIO } from '../data/groove-audio.js';
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

// Decode every clip the song uses into AudioBuffers (before the music starts).
export async function loadGroove(ctx) {
  const all = [...Object.values(GROOVE_AUDIO.lines), ...Object.values(GROOVE_AUDIO.answers)];
  const buffers = new Map();
  await Promise.all(
    all.map(async (c) => {
      const r = await fetch(c.src);
      if (!r.ok) throw new Error(`${c.src}: HTTP ${r.status}`);
      buffers.set(c.src, await ctx.decodeAudioData(await r.arrayBuffer()));
    })
  );
  return buffers;
}

export function runGroove({ mic, buffers }) {
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

  // ---- schedule the music and voices
  const sounds = []; // [{ start, end }] absolute times, for the echo filter
  const play = (clip, at) => {
    const src = ctx.createBufferSource();
    src.buffer = buffers.get(clip.src);
    const gain = ctx.createGain();
    gain.gain.value = 1;
    src.connect(gain).connect(ctx.destination);
    const begin = Math.max(ctx.currentTime, at - clip.onset);
    src.start(begin);
    sounds.push({ start: at, end: begin + clip.end });
    playing.push(src);
  };
  const playing = [];
  for (const cue of cues) {
    const at = start + cue.t;
    if (cue.kind === 'count') {
      sfx.tick(ctx, at, cue.beat === 0);
      sounds.push({ start: at, end: at + 0.06 });
    } else if (cue.kind === 'kick') {
      sfx.kick(ctx, at);
      sounds.push({ start: at, end: at + 0.14 });
    } else if (cue.kind === 'line') play(GROOVE_AUDIO.lines[cue.text], at);
    else if (cue.kind === 'demo') play(GROOVE_AUDIO.answers[cue.text], at);
    // Your beat stays silent: anything heard there is you.
  }

  // ---- visuals
  const friend = $('groove-friend');
  const you = $('groove-you');
  const youName = you.querySelector('.name');
  const friendBubble = $('groove-friend-bubble');
  const youBubble = $('groove-you-bubble');
  const dots = [...$('groove-beats').children];
  const pop = $('groove-judge');
  const banner = $('groove-banner');
  const phase = $('groove-phase');
  const cue = $('groove-cue');

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
  const showCue = (text, now = false) => {
    cue.textContent = text;
    cue.className = `cue-count${now ? ' now' : ''}`;
    void cue.offsetWidth;
    cue.classList.add('go');
  };
  const bounce = (actor) => {
    actor.classList.add('bounce');
    setTimeout(() => actor.classList.remove('bounce'), 140);
  };
  const talk = (actor, ms) => {
    actor.classList.add('talk');
    clearTimeout(actor.talkTimer);
    actor.talkTimer = setTimeout(() => actor.classList.remove('talk'), ms);
  };

  phase.textContent = t('れんしゅう', 'Practice');
  friendBubble.className = 'bubble';
  youBubble.className = 'bubble';
  youName.textContent = t('あなた', 'You');
  banner.hidden = true;
  cue.textContent = '';

  let nextCue = 0;
  const frame = () => {
    if (aborted) return;
    const heardNow = ctx.currentTime - start - (ctx.outputLatency || ctx.baseLatency || 0);
    while (nextCue < cues.length && cues[nextCue].t <= heardNow) {
      const c = cues[nextCue++];
      if (c.kind === 'count') {
        showBanner(c.text, SPB * 900);
        continue;
      }
      if (c.kind === 'kick') {
        dots.forEach((d, i) => {
          d.classList.toggle('on', i === c.beat);
          d.classList.remove('you');
        });
        continue;
      }
      if (c.kind === 'line') {
        friendBubble.textContent = c.text;
        friendBubble.className = 'bubble show';
        talk(friend, GROOVE_AUDIO.lines[c.text].end * 1000);
        bounce(friend);
        // Demo bar: the model will answer. Your bar: get ready to answer.
        youBubble.textContent = c.turn === 'demo' ? '…' : targets.find((x) => x.t > c.t)?.text || '';
        youBubble.className = c.turn === 'demo' ? 'bubble' : 'bubble ready';
        youName.textContent = c.turn === 'demo' ? t('お手本', 'Model') : t('あなたの番', 'Your turn');
        you.classList.toggle('demo', c.turn === 'demo');
        continue;
      }
      if (c.kind === 'countdown') {
        showCue(c.text);
        continue;
      }
      dots.forEach((d, i) => {
        d.classList.toggle('on', i === c.beat);
        d.classList.toggle('you', i === c.beat && c.kind === 'you');
      });
      if (c.kind === 'demo') {
        youBubble.textContent = c.text;
        youBubble.className = 'bubble show demo';
        talk(you, GROOVE_AUDIO.answers[c.text].end * 1000);
        bounce(you);
      }
      if (c.kind === 'you') {
        youBubble.textContent = c.text;
        youBubble.className = 'bubble now';
        showCue(t('いま！', 'Now!'), true);
      }
    }
    // Misses
    for (const m of judge.expire(ctx.currentTime - start)) if (!m.practice || !calibrated) showJudge('miss');
    // Practice over: learn the delay, then the real story.
    if (!calibrated && ctx.currentTime - start > lastPractice + JUDGE.ok + 0.15) {
      calibrated = true;
      judge.calibrate();
      phase.textContent = t('本番', 'Live!');
      showBanner(t('本番スタート！', 'Here we go!'), 1400);
    }
    if (ctx.currentTime - start > end + 0.4) return stop();
    raf = requestAnimationFrame(frame);
  };
  raf = requestAnimationFrame(frame);

  // ---- listen
  const detector = new OnsetDetector(mic.sampleRate);
  mic.start((block, level, time) => {
    if (aborted) return;
    you.style.setProperty('--lvl', Math.min(1, level * 6).toFixed(2));
    for (const at of detector.feed(block, time)) {
      if (isEcho(at, sounds, judge.latency)) continue;
      const hit = judge.onset(at - start);
      if (!hit) continue;
      bounce(you);
      talk(you, 220);
      if (hit.result === 'perfect' || hit.result === 'good') showJudge(hit.result);
      else showJudge(hit.error < 0 ? 'early' : 'late');
      if (hit.result === 'perfect') sfx.pop(ctx);
    }
  });

  function stop() {
    cancelAnimationFrame(raf);
    if (mic.recording) mic.stop();
    const s = judge.summary();
    finish({
      score: s.score,
      grade: letterGrade(s.score),
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
      playing.forEach((s) => {
        try {
          s.stop();
        } catch (_) {}
      });
      sfx.cut();
      if (mic.recording) mic.stop();
    },
  };
}
