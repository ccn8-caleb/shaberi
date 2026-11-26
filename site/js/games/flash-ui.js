// 瞬間しゃべり (Flash Speak) on screen: splash → microgame with a burning fuse →
// verdict, until the lives run out. Reply/Count are won the moment the speech
// recogniser hears an answer; Accent Snap records a take and checks its pitch.

import { t } from '../core/prefs.js';
import { escapeHtml } from '../core/util.js';
import { icon } from '../core/icons.js';
import { phraseMora } from '../engine/mora.js';
import { analyze } from '../engine/pitch.js';
import { pitchScore } from '../engine/score.js';
import { deck, matches, timeLimit, level, payout, LIVES, SPEEDUP_EVERY } from '../game/flash.js';
import { stream } from '../audio/recognizer.js';
import { record } from '../audio/take.js';
import * as sfx from '../audio/sfx.js';
import { drawGraph } from '../pages/graph.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const COMMANDS = {
  reply: { ja: 'こたえて！', en: 'Reply!' },
  count: { ja: 'かぞえて！', en: 'Count!' },
  accent: { ja: 'アクセント！', en: 'Accent!' },
};
const ACCENT_PASS = 0.6;

export function runFlash({ mic }) {
  const ctx = mic.ctx;
  const stage = $('flash-stage');
  const fuse = $('flash-fuse');
  const fill = $('flash-fuse-fill');
  const heard = $('flash-heard');
  let aborted = false;
  let active = null; // the microgame waiting for an answer: { answers, settle }
  let fuseRaf = 0;

  const recog = stream((text) => {
    if (aborted) return;
    heard.textContent = `「${text}」`;
    if (active?.answers && matches(text, active.answers)) active.settle('win');
  });
  const seed = (Math.random() * 2 ** 32) >>> 0;
  const full = deck(seed);
  const accentOnly = deck(seed + 1, ['accent']);
  const draw = () => (recog?.working ? full() : accentOnly());

  let lives = LIVES;
  let cleared = 0;

  const renderHud = () => {
    $('flash-hearts').innerHTML = Array.from({ length: LIVES }, (_, i) => icon('heart', `ico${i >= lives ? ' lost' : ''}`)).join('');
    $('flash-level').textContent = level(cleared);
    $('flash-cleared').textContent = cleared;
  };

  const splash = async (cls, text, sub, ms) => {
    stage.innerHTML = `<div class="command ${cls}">${escapeHtml(text)}${sub ? `<small>${escapeHtml(sub)}</small>` : ''}</div>`;
    await sleep(ms);
  };

  const startFuse = (seconds) => {
    fuse.classList.remove('idle');
    const t0 = performance.now();
    const step = () => {
      const left = Math.max(0, 1 - (performance.now() - t0) / 1000 / seconds);
      fill.style.width = `${left * 100}%`;
      if (left > 0 && !aborted) fuseRaf = requestAnimationFrame(step);
    };
    step();
  };
  const stopFuse = () => {
    cancelAnimationFrame(fuseRaf);
    fuse.classList.add('idle');
  };

  function renderGame(g) {
    const kicker = `<span class="mg-kicker k-${g.kind}">${escapeHtml(t(COMMANDS[g.kind].ja, COMMANDS[g.kind].en))}</span>`;
    if (g.kind === 'reply') {
      stage.innerHTML = `${kicker}
        <div class="mg-art">${icon(g.art)}</div>
        <p class="mg-situation" lang="ja">${escapeHtml(g.ja)}</p>
        <p class="mg-sub">${escapeHtml(t('なんて言う？', g.en + ' — what do you say?'))}</p>`;
    } else if (g.kind === 'count') {
      const things = Array.from({ length: g.n }, (_, i) => `<span class="mg-thing" style="--thing:${g.thing.color};animation-delay:${i * 40}ms"></span>`).join('');
      stage.innerHTML = `${kicker}
        <div class="mg-things">${things}</div>
        <p class="mg-situation" lang="ja">${escapeHtml(g.thing.ja)}はいくつ？</p>
        <p class="mg-sub">${escapeHtml(t('「〜つ」で答えよう', `How many ${g.thing.en}? Answer with 〜つ`))}</p>`;
    } else {
      stage.innerHTML = `${kicker}
        <p class="mg-word" lang="ja">${escapeHtml(g.text)}<small>${escapeHtml(g.en)}</small></p>
        <svg class="pitch-graph" id="flash-graph"></svg>
        <p class="mg-sub">${escapeHtml(t('このアクセントで言おう', 'Say it with this pitch'))}</p>`;
    }
  }

  // Resolves 'win' | 'lose' | 'void' (couldn't be judged: recognition stopped working).
  function play(g, seconds) {
    return new Promise((resolve) => {
      let done = false;
      const settle = (v) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        active = null;
        resolve(v);
      };
      let timer = null;
      if (g.kind === 'accent') {
        const mora = phraseMora([[g.kana, g.accent]]);
        const graph = drawGraph($('flash-graph'), mora);
        const points = [];
        const take = record(mic, {
          maxSeconds: seconds,
          silenceMs: 450,
          onBlock: ({ speaking, sinceSpeech, st }) => {
            if (sinceSpeech === null) return;
            if (speaking) points.push({ x: sinceSpeech / (mora.length / 6), st });
            graph.setVoice(points);
          },
        });
        // Aborting stops the take, which settles the microgame.
        active = { settle: () => take.stop() };
        take.done.then(({ pcm, heardSpeech }) => {
          if (!heardSpeech) return settle('lose');
          const p = pitchScore(analyze(pcm, mic.sampleRate), mora);
          settle(p.score !== null && p.score >= ACCENT_PASS ? 'win' : 'lose');
        });
      } else {
        active = { answers: g.answers, settle };
        timer = setTimeout(() => settle(recog?.working ? 'lose' : 'void'), seconds * 1000);
      }
    });
  }

  function answerHint(g) {
    if (g.kind === 'reply') return g.hint;
    if (g.kind === 'count') return g.answers[0];
    return g.kana;
  }

  async function loop() {
    renderHud();
    await splash('k-speed', t('いくよ！', 'Ready?'), t('声で答えてね', 'Answer out loud'), 1100);
    while (lives > 0 && !aborted) {
      const g = draw();
      const seconds = timeLimit(cleared);
      const pace = seconds / 5;
      await splash(`k-${g.kind}`, t(COMMANDS[g.kind].ja, COMMANDS[g.kind].en), '', 650 * pace + 150);
      if (aborted) break;
      heard.textContent = '';
      renderGame(g);
      startFuse(seconds);
      const result = await play(g, seconds);
      stopFuse();
      if (aborted) break;

      if (result === 'win') {
        cleared++;
        sfx.chime(ctx);
        stage.insertAdjacentHTML('beforeend', `<div class="verdict win"><div>OK!<small>${escapeHtml(t('いいね！', 'Nice!'))}</small></div></div>`);
      } else if (result === 'lose') {
        lives--;
        sfx.buzz(ctx);
        stage.classList.remove('shake');
        void stage.offsetWidth;
        stage.classList.add('shake');
        stage.insertAdjacentHTML('beforeend', `<div class="verdict lose"><div>✕<small lang="ja">${escapeHtml(answerHint(g))}</small></div></div>`);
      } else {
        stage.insertAdjacentHTML('beforeend', `<div class="verdict lose"><div>…<small>${escapeHtml(t('音声認識が使えません', 'Speech recognition unavailable'))}</small></div></div>`);
      }
      renderHud();
      await sleep(result === 'lose' ? 1100 : 700);
      if (result === 'win' && cleared % SPEEDUP_EVERY === 0 && lives > 0) {
        sfx.speedUp(ctx);
        await splash('k-speed', t('スピードアップ！', 'Speed up!'), t(`レベル ${level(cleared)}`, `Level ${level(cleared)}`), 1100);
      }
    }
    recog?.stop();
    return { score: cleared, points: payout(cleared) };
  }

  return {
    done: loop(),
    abort() {
      aborted = true;
      stopFuse();
      recog?.stop();
      active?.settle?.('lose');
      if (mic.recording) mic.stop();
    },
  };
}
