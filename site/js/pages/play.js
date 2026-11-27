// The play page: home → a run of phrases (listen, speak, score) → summary.

import { t } from '../core/prefs.js';
import { escapeHtml } from '../core/util.js';
import { PHRASES } from '../data/phrases.js';
import { phraseMora } from '../engine/mora.js';
import { analyze, semitones } from '../engine/pitch.js';
import { scoreAttempt, DEFAULT_MORA_RATE } from '../engine/score.js';
import { newRun, commit, isOver, multiplier, basePoints } from '../game/run.js';
import { SPEEDS, speedById, step } from '../game/speed.js';
import { recordRun, currentStreak, hasPracticedToday, dailyBonus } from '../game/store.js';
import { nextUnlock } from '../game/arcade.js';
import { Mic } from '../audio/mic.js';
import { record } from '../audio/take.js';
import * as model from '../audio/model.js';
import { wavBlob } from '../audio/wav.js';
import { listen, recognitionAvailable } from '../audio/recognizer.js';
import { drawGraph } from './graph.js';
import { confetti, floatPoints } from './fx.js';
import { initShell, renderHud } from './shell.js';

const $ = (id) => document.getElementById(id);

const SCENES = {
  home: { ja: '家で', en: 'At home', color: 'var(--orange)' },
  street: { ja: '街で', en: 'Out and about', color: 'var(--teal)' },
  office: { ja: '職場で', en: 'At work', color: 'var(--blue)' },
  station: { ja: '駅で', en: 'At the station', color: 'var(--purple)' },
  konbini: { ja: 'コンビニで', en: 'At the konbini', color: 'var(--pink)' },
  cafe: { ja: 'カフェで', en: 'At the café', color: 'var(--orange-deep)' },
};

const mic = new Mic();
let run = null;
let current = null; // { phrase, mora, graph, refDuration, best, last }
let recording = null; // { take, listener }
let screen = 'home';

// ---------------------------------------------------------------- screens

function show(name) {
  screen = name;
  for (const s of ['home', 'play', 'summary']) $(`screen-${s}`).hidden = s !== name;
  window.scrollTo({ top: 0 });
}

function renderHome() {
  const p = renderHud();
  const streak = currentStreak(p);
  $('stat-points').textContent = p.points.toLocaleString();
  $('stat-best').textContent = p.bestRun.toLocaleString();
  $('stat-streak').textContent = streak;

  // Today's bonus, as a reason to come back every day.
  const done = hasPracticedToday(p);
  $('daily').classList.toggle('done', done);
  $('daily-text').textContent = done
    ? t('今日のボーナスはゲット済み！また明日', "Today's bonus collected. See you tomorrow!")
    : t(`今日の初ランで +${dailyBonus(streak + 1)} ボーナス`, `First run today: +${dailyBonus(streak + 1)} bonus`);

  // The next arcade cabinet to save up for.
  const next = nextUnlock(p.unlocked);
  $('goal').hidden = !next;
  if (next) {
    const ready = p.points >= next.cost;
    $('goal-title').textContent = ready ? t(`「${next.ja}」を解放できます！`, `You can unlock ${next.en}!`) : t(`次の解放：${next.ja}`, `Next unlock: ${next.en}`);
    $('goal-count').textContent = `${Math.min(p.points, next.cost).toLocaleString()} / ${next.cost.toLocaleString()}`;
    $('goal-fill').style.width = `${Math.min(100, (p.points / next.cost) * 100)}%`;
    $('goal').classList.toggle('ready', ready);
  }
}

function renderChecks() {
  const items = [];
  const secure = window.isSecureContext && navigator.mediaDevices?.getUserMedia;
  items.push(secure ? ['ok', t('マイクが使えます', 'Microphone available')] : ['bad', t('マイクが使えません（HTTPSが必要）', 'No microphone access (needs HTTPS)')]);
  items.push(
    recognitionAvailable()
      ? ['ok', t('音声認識あり（言葉も採点）', 'Speech recognition on (words are scored)')]
      : ['warn', t('このブラウザは音声認識なし：アクセントとリズムだけ採点', 'No speech recognition here: only pitch and rhythm are scored')]
  );
  items.push(['ok', t('静かな場所で、普通の声で話してください', 'Find a quiet spot and speak at a normal volume')]);
  $('checks').innerHTML = items.map(([cls, text]) => `<li class="${cls}">${escapeHtml(text)}</li>`).join('');
}

// ---------------------------------------------------------------- run

async function startRun() {
  model.unlock(); // must run inside the tap, before anything is awaited (iOS)
  $('start-error').hidden = true;
  $('btn-start').disabled = true;
  try {
    await mic.open();
  } catch (err) {
    console.warn('[mic]', err);
    $('start-error').textContent = t('マイクを許可してください。', 'Please allow microphone access.');
    $('start-error').hidden = false;
    $('btn-start').disabled = false;
    return;
  }
  // Permission granted: let go of the mic until there's something to record, so the
  // model voice plays on the normal route (Bluetooth earbuds go silent otherwise).
  mic.release();
  $('btn-start').disabled = false;
  run = newRun(PHRASES);
  model.preload(mic.ctx, run.phrases[0].id);
  show('play');
  loadPhrase();
}

function loadPhrase() {
  const phrase = run.phrases[run.index];
  const mora = phraseMora(phrase.units);
  const graph = drawGraph($('pitch-graph'), mora);
  current = { phrase, mora, graph, refDuration: model.speechLength(phrase.id), best: null, last: null };
  // Get the next phrase's recording ready too.
  const upcoming = run.phrases[run.index + 1];
  if (upcoming) model.preload(mic.ctx, upcoming.id);
  renderPhrase();
  renderRunBar();
  $('result').hidden = true;
  $('controls').hidden = false;
  setStatus(t('まず聞いて、それから話そう', 'Listen first, then speak'));
  // Play the model once on arrival.
  setTimeout(playModel, 350);
}

function renderPhrase() {
  const { phrase } = current;
  const scene = SCENES[phrase.scene] || SCENES.street;
  $('phrase-card').style.setProperty('--scene', scene.color);
  $('phrase-scene').textContent = t(scene.ja, scene.en);
  $('phrase-text').textContent = phrase.text;
  $('phrase-en').textContent = phrase.en;
}

function renderRunBar() {
  $('run-dots').innerHTML = run.phrases
    .map((_, i) => {
      const r = run.results[i];
      return `<span class="dot ${r ? `g-${r.grade}` : i === run.index ? 'now' : ''}"></span>`;
    })
    .join('');
  $('run-points').textContent = run.points.toLocaleString();
  $('combo').hidden = run.combo < 2;
  $('combo-n').textContent = run.combo;
  $('combo-x').textContent = `×${multiplier(run.combo).toFixed(1)}`;
}

const setStatus = (text) => ($('status').textContent = text);

async function playModel() {
  if (!current || recording) return;
  const btn = $('btn-listen');
  btn.classList.add('playing');
  const duration = await model.play(mic.ctx, current.phrase);
  btn.classList.remove('playing');
  // The recording's own length is the target; browser speech only when there's none.
  if (duration && current && !current.refDuration) current.refDuration = duration;
}

// ---------------------------------------------------------------- recording

const refDuration = () => current.refDuration || current.mora.length / DEFAULT_MORA_RATE;

async function startRecording() {
  if (recording || !current) return;
  recording = { pending: true };
  selfAudio?.pause();
  model.stop();
  $('btn-listen').classList.remove('playing');
  current.graph.clear();
  $('result').hidden = true;
  const btn = $('btn-rec');
  btn.classList.add('recording');
  // The mic opens only now (and closes after), so earbuds keep playing the model.
  setStatus(t('準備中…', 'Getting ready…'));
  try {
    await mic.open();
    await mic.waitForAudio();
  } catch (err) {
    console.warn('[mic]', err);
    recording = null;
    btn.classList.remove('recording');
    setStatus(t('マイクを使えませんでした。許可を確認してください。', "Couldn't use the microphone. Check its permission."));
    return;
  }
  if (!current || recording?.pending !== true) return;
  setStatus(t('どうぞ！話し終わったら自動で止まります', 'Go! It stops by itself when you finish'));

  const points = [];
  const listener = listen(mic.track);
  const take = record(mic, {
    maxSeconds: Math.max(5, refDuration() * 3),
    onBlock: ({ level, speaking, sinceSpeech, st }) => {
      btn.style.setProperty('--lvl', (1 + Math.min(level * 6, 0.35)).toFixed(3));
      if (sinceSpeech === null) return;
      if (speaking) points.push({ x: sinceSpeech / (refDuration() * 1.25), st });
      else if (points.length && points[points.length - 1].st !== null) points.push({ x: 0, st: null });
      current.graph.setVoice(points);
    },
  });
  recording = { take, listener };
  take.done.then(({ pcm }) => finishRecording(pcm, listener));
}

const stopRecording = () => recording?.take?.stop();

async function finishRecording(pcm, listener) {
  recording = null;
  mic.release();
  const btn = $('btn-rec');
  btn.classList.remove('recording');
  btn.style.removeProperty('--lvl');
  btn.disabled = true;
  setStatus(t('採点中…', 'Scoring…'));

  const heard = await listener.stop();
  const analysis = analyze(pcm, mic.sampleRate);
  const speed = speedById(model.getSpeed());
  const c = model.clip(current.phrase.id);
  const reference = c?.contour ? { contour: c.contour, morae: c.morae } : null;
  const scored = scoreAttempt({ analysis, mora: current.mora, phrase: current.phrase, heard, refDuration: current.refDuration, fit: speed.fit, reference });
  const result = { ...scored, speed: speed.id, speedPoints: speed.points };
  btn.disabled = false;

  current.last = result;
  current.take = { pcm, sampleRate: mic.sampleRate, analysis };
  // The best attempt is the one worth the most points (a faster speed can win).
  if (!current.best || basePoints(result) > basePoints(current.best)) current.best = result;
  showResult(result, analysis);
}

// ---------------------------------------------------------------- results

function voicePoints(analysis, result) {
  // Scored against the model: draw your pitch lined up under the model's syllables.
  if (result?.pitch?.aligned?.length) return result.pitch.aligned;
  const { span, frames, medianF0 } = analysis;
  if (!span || !medianF0) return [];
  const dur = span.end - span.start;
  return frames
    .filter((f) => f.t >= span.start && f.t <= span.end)
    .map((f) => ({ x: (f.t - span.start) / dur, st: f.f0 ? semitones(f.f0, medianF0) : null }));
}

function bar(label, part, color) {
  const na = part.score === null || part.score === undefined;
  const pct = na ? 0 : Math.round(part.score * 100);
  return `<div class="bar${na ? ' na' : ''}" style="--c:${color}">
    <span>${escapeHtml(label)}</span>
    <span class="bar-track"><span class="bar-fill" data-w="${pct}"></span></span>
    <span class="bar-val">${na ? '—' : pct}</span>
  </div>`;
}

function tipsFor(result) {
  const { mora } = current;
  const tips = [];
  if (result.silent) return [t('声が聞こえませんでした。マイクを確認して、もう少し大きな声で。', "We couldn't hear you. Check the mic and speak a little louder.")];
  for (const tr of result.pitch.transitions || []) {
    if (tr.score === null || tr.score >= 0.5 || tips.length >= 2) continue;
    if (tr.dir === 'fall') tips.push(t(`「${mora[tr.at - 1].mora}」のあとで音を下げましょう`, `Drop your pitch after “${mora[tr.at - 1].mora}”`));
    else tips.push(t(`「${mora[tr.at].mora}」で音を上げましょう`, `Raise your pitch on “${mora[tr.at].mora}”`));
  }
  if (result.pitch.flat) tips.push(t('声が平らです。上がり下がりを大げさに！', 'Your voice is quite flat. Exaggerate the ups and downs!'));
  const fb = result.rhythm.feedback || [];
  if (fb.includes('partial')) tips.push(t('一部しか聞き取れませんでした。ボタンを押してから、全部言ってください。', 'We only caught part of it. Tap first, then say the whole phrase.'));
  if (fb.includes('fast')) tips.push(t('少し速すぎます。お手本のスピードで。', 'A bit fast. Match the model’s speed.'));
  if (fb.includes('slow')) {
    tips.push(t('もう少しテンポよく。', 'Try a bit quicker, more smoothly.'));
    if (model.getSpeed() !== SPEEDS[0].id) tips.push(t('このスピードが難しければ「速すぎる」でお手本をゆっくりに。', 'If this speed is too much, tap “Too fast” to slow the model down.'));
  }
  if (fb.includes('pause')) tips.push(t('途中で止まらずに、一息で言ってみよう。', 'Try to say it in one breath, without stopping.'));
  if (result.limited) tips.push(t('声の高さがはっきり聞き取れなかったので、点数は60までです。マイクに近づくか、スピーカーで試してみて。', "Your pitch didn't come through clearly, so this score is capped at 60. Try closer to the mic, or without Bluetooth earbuds."));
  if (result.words.missed) tips.push(t('音声認識が今回の声を受け取れなかったので、言葉は採点していません。', "Speech recognition didn't receive this attempt, so words weren't scored."));
  else if (result.words.score !== null && result.words.score < 0.7) tips.push(t('言葉がはっきり聞き取れませんでした。', "Some words didn't come through clearly."));
  return tips;
}

function showResult(result, analysis) {
  current.graph.setVoice(voicePoints(analysis, result));
  current.graph.markMisses(result.pitch.transitions || []);

  const g = $('grade');
  g.className = `grade g-${result.grade}`;
  g.textContent = result.grade;
  g.style.animation = 'none';
  void g.offsetWidth;
  g.style.animation = '';
  $('result-total').textContent = result.total;
  const sp = speedById(result.speed);
  $('result-speed').textContent = t(`スピード：${sp.ja}（ポイント×${sp.points}）`, `Speed: ${sp.en} (points ×${sp.points})`);

  $('bars').innerHTML = [
    bar(t('言葉', 'Words'), result.words, 'var(--teal)'),
    bar(t('アクセント', 'Pitch'), result.pitch, 'var(--pink)'),
    bar(t('リズム', 'Rhythm'), result.rhythm, 'var(--orange)'),
  ].join('');
  requestAnimationFrame(() => $('bars').querySelectorAll('.bar-fill').forEach((f) => (f.style.width = `${f.dataset.w}%`)));

  const heard = result.words?.heard;
  $('heard').hidden = !heard;
  if (heard) $('heard').innerHTML = `${escapeHtml(t('聞こえた言葉：', 'Heard: '))}<b lang="ja">${escapeHtml(heard)}</b>`;

  renderDetails(result, analysis);
  const tips = tipsFor(result);
  $('tips').innerHTML = tips.length
    ? tips.map((tip) => `<li>${escapeHtml(tip)}</li>`).join('')
    : `<li class="good">${escapeHtml(t('完璧！その調子！', 'Perfect! Keep it up!'))}</li>`;

  // What "Next" will earn with the best attempt so far.
  const preview = { ...run, results: [...run.results] };
  $('next-points').textContent = `+${commit(preview, current.best)}`;
  $('btn-next').querySelector('span').textContent = isOver(preview) ? t('結果へ', 'Finish') : t('次へ', 'Next');

  $('result').hidden = false;
  setStatus('');
  if (result.grade === 'S') confetti(window.innerWidth / 2, g.getBoundingClientRect().top, 120);
  else if (result.grade === 'A') confetti(window.innerWidth / 2, g.getBoundingClientRect().top, 50);
  $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// What the app measured, for "why did I get this score?" (and bug reports).
function renderDetails(result, analysis) {
  const take = current.take;
  const recorded = take ? take.pcm.length / take.sampleRate : 0;
  const speech = analysis.span ? analysis.span.end - analysis.span.start : 0;
  const ref = current.refDuration;
  const f = (x) => x.toFixed(2);
  const parts = [
    t(`録音 ${f(recorded)}秒`, `Recorded ${f(recorded)} s`),
    t(`声 ${f(speech)}秒`, `Speech ${f(speech)} s`) + (analysis.span ? t(`（${f(analysis.span.start)}〜${f(analysis.span.end)}秒）`, ` (${f(analysis.span.start)}–${f(analysis.span.end)} s)`) : ''),
    ref ? t(`お手本 ${f(ref)}秒`, `Model ${f(ref)} s`) : null,
    result.rhythm.ratio ? t(`比 ×${f(result.rhythm.ratio)}`, `ratio ×${f(result.rhythm.ratio)}`) : null,
    t(`間 ${analysis.pauses.length}`, `pauses ${analysis.pauses.length}`),
    analysis.medianF0 ? t(`声の高さ ${Math.round(analysis.medianF0)}Hz`, `pitch ${Math.round(analysis.medianF0)} Hz`) : null,
    mic.track?.label ? t(`マイク：${mic.track.label}`, `mic: ${mic.track.label}`) : null,
  ];
  $('details').textContent = parts.filter(Boolean).join(' · ');
}

// Play back what the microphone captured.
const selfAudio = typeof Audio !== 'undefined' ? new Audio() : null;
let selfUrl = null;
$('btn-self').addEventListener('click', () => {
  if (!current?.take || !selfAudio) return;
  model.stop();
  if (selfUrl) URL.revokeObjectURL(selfUrl);
  selfUrl = URL.createObjectURL(wavBlob(current.take.pcm, current.take.sampleRate));
  selfAudio.src = selfUrl;
  selfAudio.play().catch((err) => console.warn('[self playback]', err));
});
$('btn-model-again').addEventListener('click', () => {
  selfAudio?.pause();
  playModel();
});

function next() {
  if (!current?.best) return;
  const earned = commit(run, current.best);
  floatPoints(`+${earned}`, $('btn-next'));
  if (isOver(run)) return finishRun();
  loadPhrase();
}

function finishRun() {
  const { newBest, bonus, progress } = recordRun(run);
  renderHud({ animate: true });
  show('summary');
  $('sum-points').textContent = run.points.toLocaleString();
  $('new-best').hidden = !newBest;
  $('sum-bonus').hidden = !bonus;
  $('sum-bonus').textContent = t(`今日のボーナス +${bonus}（${progress.streak.days}日連続）`, `Daily bonus +${bonus} (${progress.streak.days}-day streak)`);
  $('sum-grades').innerHTML = run.results.map((r) => `<span class="grade g-${r.grade}">${r.grade}</span>`).join('');
  $('sum-combo').textContent = t(`最大コンボ ${run.maxCombo}`, `Best combo ${run.maxCombo}`);
  confetti(window.innerWidth / 2, window.innerHeight / 3, newBest ? 200 : 90);
  current = null;
}

// ---------------------------------------------------------------- wiring

$('btn-start').addEventListener('click', startRun);
$('btn-listen').addEventListener('click', playModel);
$('btn-rec').addEventListener('click', () => (recording ? stopRecording() : startRecording()));
$('btn-retry').addEventListener('click', () => {
  $('result').hidden = true;
  current.graph.clear();
  setStatus(t('もう一回どうぞ', 'Have another go'));
});
$('btn-next').addEventListener('click', next);
$('btn-again').addEventListener('click', startRun);
$('btn-home').addEventListener('click', () => {
  renderHome();
  show('home');
});

// Desktop: Space to speak / stop, L to listen.
document.addEventListener('keydown', (e) => {
  if (screen !== 'play' || e.repeat || e.target.closest('button')) return;
  if (e.code === 'Space') {
    e.preventDefault();
    if (!$('btn-rec').disabled) recording ? stopRecording() : startRecording();
  } else if (e.key === 'l' || e.key === 'L') playModel();
});

initShell({
  onPrefs: () => {
    renderChecks();
    renderHome();
    renderVoicePicker();
    renderSpeed();
    if (screen === 'play' && current) renderPhrase();
  },
});
// ---------------------------------------------------------------- speed

function renderSpeed() {
  const now = speedById(model.getSpeed());
  const i = SPEEDS.indexOf(now);
  $('speed-name').textContent = t(now.ja, now.en);
  $('speed-points').textContent = t(`${now.rate}拍/秒・ポイント×${now.points}`, `${now.rate} morae/s · points ×${now.points}`);
  $('speed-dots').innerHTML = SPEEDS.map((s, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('');
  $('speed-bar').dataset.level = now.id;
  $('btn-too-fast').disabled = i === 0;
  $('btn-too-slow').disabled = i === SPEEDS.length - 1;
}

// "Too fast" slows the model down a step; "Too slow" speeds it up. Then hear it again.
function changeSpeed(by) {
  const next = step(model.getSpeed(), by);
  if (next === model.getSpeed()) return;
  model.setSpeed(next);
  renderSpeed();
  if (!current) return;
  current.refDuration = model.speechLength(current.phrase.id);
  const upcoming = run?.phrases[run.index + 1];
  if (upcoming) model.preload(mic.ctx, upcoming.id);
  if (!recording) playModel();
}
$('btn-too-fast').addEventListener('click', () => changeSpeed(-1));
$('btn-too-slow').addEventListener('click', () => changeSpeed(1));

// Model voice picker (home screen).
function renderVoicePicker() {
  const now = model.getVoice();
  $('voice-picker').innerHTML = model.VOICE_IDS.map((id) => {
    const v = model.VOICES[id];
    const label = id === 'kenzaki' ? t('男性', 'Male') : t('女性', 'Female');
    return `<button type="button" class="voice-chip${id === now ? ' on' : ''}" data-voice="${id}" aria-pressed="${id === now}"><b lang="ja">${escapeHtml(v.name)}</b><small>${escapeHtml(label)}</small></button>`;
  }).join('');
}
$('voice-picker').addEventListener('click', (e) => {
  const b = e.target.closest('[data-voice]');
  if (!b) return;
  model.setVoice(b.dataset.voice);
  renderVoicePicker();
});

renderHome();
renderChecks();
renderVoicePicker();
renderSpeed();
