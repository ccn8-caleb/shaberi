// 瞬間しゃべり (Flash Speak) on screen: splash → microgame with a burning fuse →
// verdict, until the lives run out. Reply/Count are won the moment the speech
// recogniser hears an answer; Accent Snap records a take and checks its pitch.

import { t } from '../core/prefs.js';
import { escapeHtml } from '../core/util.js';
import { icon } from '../core/icons.js';
import { phraseMora } from '../engine/mora.js';
import { analyze } from '../engine/pitch.js';
import { pitchScore } from '../engine/score.js';
import { deck, matches, timeLimit, level, payout, LIVES, SPEEDUP_EVERY, HINT_AT } from '../game/flash.js';
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

  // "Is it hearing me?": what the recogniser (or, in accent rounds, the mic) is doing.
  const ear = $('flash-ear');
  const setEar = (state, detail = '') => {
    const words = {
      listening: t('聞いています…', 'Listening…'),
      hearing: t('声が聞こえています！', 'Hearing you!'),
      recording: t('録音中…', 'Recording…'),
      starting: t('マイク準備中…', 'Starting the mic…'),
      paused: '',
      off: t('音声認識が使えないので、アクセント問題だけです', 'No speech recognition here: accent rounds only'),
      error: t(`音声認識のエラー（${detail}）`, `Speech recognition error (${detail})`),
    };
    ear.dataset.state = state;
    ear.querySelector('span:last-child').textContent = words[state] ?? '';
  };

  // The recogniser needs the microphone to itself on Android, so ours stays closed
  // except during accent rounds (see audio/recognizer.js).
  mic.release();
  const recog = stream(
    (text) => {
      if (aborted) return;
      heard.textContent = `「${text}」`;
      if (active?.answers && matches(text, active.answers)) active.settle('win');
    },
    { onState: (s, d) => !aborted && setEar(s, d) }
  );
  setEar(recog ? 'listening' : 'off');
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
        clearTimeout(hintTimer);
        active = null;
        resolve(v);
      };
      let timer = null;
      // A hint for learners once part of the time has gone.
      const hintTimer = setTimeout(() => {
        if (!done && !aborted) stage.insertAdjacentHTML('beforeend', `<p class="mg-hint">${escapeHtml(t('ヒント', 'Hint'))}：<b lang="ja">${escapeHtml(answerHint(g))}</b></p>`);
      }, seconds * HINT_AT * 1000);
      if (g.kind === 'accent') {
        const started = performance.now();
        active = { settle: () => settle('lose') };
        (async () => {
          // Our own recording: the recogniser steps aside, the mic opens.
          recog?.pause();
          setEar('starting');
          try {
            await mic.open();
            await mic.waitForAudio(800);
          } catch (err) {
            console.warn('[mic]', err);
            mic.release();
            recog?.resume();
            return settle('void');
          }
          if (done) {
            mic.release();
            recog?.resume();
            return;
          }
          setEar('recording');
          const mora = phraseMora([[g.kana, g.accent]]);
          const graph = drawGraph($('flash-graph'), mora);
          const points = [];
          const left = Math.max(1.5, seconds - (performance.now() - started) / 1000);
          const take = record(mic, {
            maxSeconds: left,
            silenceMs: 450,
            onBlock: ({ level, speaking, sinceSpeech, st }) => {
              ear.style.setProperty('--lvl', Math.min(1, level * 8).toFixed(2));
              if (speaking) ear.dataset.state = 'hearing';
              if (sinceSpeech === null) return;
              if (speaking) points.push({ x: sinceSpeech / (mora.length / 6), st });
              graph.setVoice(points);
            },
          });
          // Aborting stops the take, which settles the microgame.
          active = { settle: () => take.stop() };
          const { pcm, heardSpeech } = await take.done;
          mic.release();
          ear.style.removeProperty('--lvl');
          recog?.resume();
          if (!recog) setEar('off');
          if (!heardSpeech) return settle('lose');
          const p = pitchScore(analyze(pcm, mic.sampleRate), mora);
          settle(p.score !== null && p.score >= ACCENT_PASS ? 'win' : 'lose');
        })();
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
      mic.release();
    },
  };
}
