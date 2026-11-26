// 散歩しましょう！ (Let's Take a Walk!) on screen.
//
// Each round: the walker strolls on (scenery scrolls) → the model says the phrase
// with a karaoke sweep → your turn against the fuse. Keep up and the next round is
// faster; slip up and it's the desk: your hand reaches for the pencil, 「ダメです！」,
// and the proctor's hand knocks it away. Three pencils.

import { t } from '../core/prefs.js';
import { analyze } from '../engine/pitch.js';
import { PHRASE, LIVES, speedAt, estimateDuration, timeLimit, judgeTake, payout } from '../game/sanpo.js';
import { record } from '../audio/take.js';
import { listen } from '../audio/recognizer.js';
import { hasVoice, loadVoice, speak } from '../audio/tts.js';
import * as sfx from '../audio/sfx.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DESK_MS = 2600; // length of the desk animation (css/arcade.css)

const PENCIL = `<svg viewBox="0 0 40 14" aria-hidden="true"><rect x="8" y="2" width="24" height="10" fill="#ffc93c"/><rect x="8" y="6" width="24" height="2" fill="#f4a521"/><polygon points="32,2 39,7 32,12" fill="#f3d3a8"/><polygon points="36.5,5.5 39,7 36.5,8.5" fill="#2b1d4a"/><rect x="5" y="2" width="4" height="10" fill="#c4cad4"/><rect x="0" y="2" width="6" height="10" rx="2" fill="#ff8fb1"/></svg>`;

const REASONS = {
  silent: { ja: '聞こえなかった！', en: "Didn't hear you!" },
  partial: { ja: '最後まで言えてない！', en: 'Say the whole thing!' },
  slow: { ja: 'おそい！', en: 'Too slow!' },
  words: { ja: '言葉がちがう！', en: 'Wrong words!' },
};

export function runSanpo({ mic }) {
  const ctx = mic.ctx;
  const scene = $('walk-scene');
  const text = $('sanpo-text');
  const cue = $('sanpo-cue');
  const msg = $('sanpo-msg');
  const desk = $('desk-scene');
  const ok = $('sanpo-ok');
  const fuse = $('sanpo-fuse');
  const fill = $('sanpo-fuse-fill');
  let aborted = false;
  let take = null;
  let listener = null;
  let fuseRaf = 0;

  let lives = LIVES;
  let cleared = 0;
  let round = 0;
  let topSpeed = speedAt(0);

  const renderHud = () => {
    $('sanpo-pencils').innerHTML = Array.from({ length: LIVES }, (_, i) => PENCIL.replace('<svg ', `<svg class="${i >= lives ? 'lost' : ''}" `)).join('');
    $('sanpo-speed').textContent = `×${speedAt(round).toFixed(1)}`;
    $('sanpo-cleared').textContent = cleared;
  };

  const setCue = (label, you = false) => {
    cue.textContent = label;
    cue.classList.toggle('you', you);
  };

  const sweep = (seconds, you) => {
    text.classList.remove('sweep', 'you');
    void text.offsetWidth; // restart the animation
    text.style.setProperty('--dur', `${seconds}s`);
    text.classList.toggle('you', you);
    text.classList.add('sweep');
  };
  const resetSweep = () => text.classList.remove('sweep', 'you');

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
    fill.style.width = '100%';
  };

  async function walk(speed, ms) {
    scene.classList.remove('listening');
    scene.style.setProperty('--pace', `${(0.55 / speed).toFixed(3)}s`);
    scene.classList.add('walking');
    await sleep(ms);
    scene.classList.remove('walking');
  }

  // The model reads the phrase; returns its duration in seconds.
  async function model(speed) {
    setCue(t('お手本', 'Listen'));
    const estimate = estimateDuration(speed);
    sweep(estimate, false);
    const spoken = hasVoice() ? await speak(PHRASE.text, { rate: speed }) : (await sleep(estimate * 1000), null);
    // Voices can't always go as fast as asked: trust the measured time when we have it.
    return spoken && spoken > 0.4 ? spoken : estimate;
  }

  async function yourTurn(modelDuration) {
    setCue(t('どうぞ！', 'Your turn!'), true);
    sweep(modelDuration * 1.15, true);
    scene.classList.add('listening');
    const limit = timeLimit(modelDuration);
    startFuse(limit);
    listener = listen();
    take = record(mic, { maxSeconds: limit, silenceMs: Math.max(350, Math.min(700, 600 / speedAt(round))) });
    const { pcm } = await take.done;
    take = null;
    stopFuse();
    scene.classList.remove('listening');
    setCue('');
    const heard = await listener.stop(900);
    listener = null;
    return judgeTake({ analysis: analyze(pcm, mic.sampleRate), heard, modelDuration });
  }

  async function dame(reason) {
    desk.hidden = false;
    desk.classList.remove('play');
    void desk.offsetWidth;
    desk.classList.add('play');
    // In step with the animation: grab (≈0.8 s), the voice, the smack (≈1.1 s), the pencil flies.
    setTimeout(() => !aborted && hasVoice() && speak('ダメです！', { rate: 1.15 }), DESK_MS * 0.29);
    setTimeout(() => !aborted && sfx.smack(ctx), DESK_MS * 0.42);
    setTimeout(() => !aborted && sfx.whoosh(ctx), DESK_MS * 0.46);
    msg.textContent = t(REASONS[reason].ja, REASONS[reason].en);
    await sleep(DESK_MS + 200);
    desk.hidden = true;
    desk.classList.remove('play');
  }

  async function loop() {
    await loadVoice();
    $('sanpo-en').textContent = PHRASE.en;
    resetSweep();
    renderHud();
    setCue(t('いくよ！', 'Here we go!'));
    msg.textContent = t('お手本のあとにリピート。どんどん速くなるよ！', 'Repeat after the model. It keeps getting faster!');
    await walk(speedAt(0), 1800);

    while (lives > 0 && !aborted) {
      const speed = speedAt(round);
      topSpeed = Math.max(topSpeed, speed);
      renderHud();
      msg.textContent = '';
      const modelDuration = await model(speed);
      if (aborted) break;
      const result = await yourTurn(modelDuration);
      if (aborted) break;

      if (result.ok) {
        cleared++;
        round++;
        sfx.chime(ctx);
        ok.hidden = false;
        await sleep(550);
        ok.hidden = true;
        renderHud();
        resetSweep();
        if (round % 3 === 0) sfx.speedUp(ctx);
        msg.textContent = t(`スピード ×${speedAt(round).toFixed(1)}`, `Speed ×${speedAt(round).toFixed(1)}`);
        await walk(speedAt(round), Math.max(700, 1500 / speedAt(round)));
      } else {
        lives--;
        renderHud();
        await dame(result.reason);
        resetSweep();
        if (lives > 0) await walk(speed, 900);
      }
    }
    return {
      score: cleared,
      points: payout(cleared),
      detail: t(`${cleared} 回クリア ・ 最高スピード ×${topSpeed.toFixed(1)}`, `${cleared} cleared · top speed ×${topSpeed.toFixed(1)}`),
    };
  }

  return {
    done: loop(),
    abort() {
      aborted = true;
      stopFuse();
      window.speechSynthesis?.cancel();
      take?.stop();
      listener?.stop(0);
      scene.classList.remove('walking', 'listening');
      desk.hidden = true;
      ok.hidden = true;
    },
  };
}
