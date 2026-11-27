// Sound check: plays test sounds through each audio route the app uses, with and
// without the microphone open, so a "can't hear anything" report says which route
// fails on that device.

import { t } from '../core/prefs.js';
import { escapeHtml } from '../core/util.js';
import { AUDIO } from '../data/audio.js';
import { Mic } from '../audio/mic.js';
import { initShell } from './shell.js';

const $ = (id) => document.getElementById(id);
const mic = new Mic();
const media = new Audio();
media.setAttribute('playsinline', '');
const sample = AUDIO.clips.kenzaki?.normal?.ohayou?.src || Object.values(Object.values(AUDIO.clips)[0])[0].src;

const results = {}; // test id -> { status, heard }
let plainCtx = null;

// A two-tone beep (or a single side, for the left/right test) on an AudioContext.
function beep(ctx, pan = 0, seconds = 0.8) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
  o.type = 'triangle';
  const t0 = ctx.currentTime + 0.05;
  o.frequency.setValueAtTime(660, t0);
  o.frequency.setValueAtTime(880, t0 + seconds / 2);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.4, t0 + 0.02);
  g.gain.setValueAtTime(0.4, t0 + seconds - 0.05);
  g.gain.linearRampToValueAtTime(0, t0 + seconds);
  if (p) {
    p.pan.value = pan;
    o.connect(g).connect(p).connect(ctx.destination);
  } else o.connect(g).connect(ctx.destination);
  o.start(t0);
  o.stop(t0 + seconds + 0.05);
  return new Promise((r) => setTimeout(r, (seconds + 0.2) * 1000));
}

const playMedia = () =>
  new Promise((resolve, reject) => {
    media.src = sample;
    media.onended = resolve;
    media.onerror = () => reject(media.error || new Error('media error'));
    media.play().catch(reject);
  });

async function plain() {
  plainCtx ||= new AudioContext();
  if (plainCtx.state === 'suspended') await plainCtx.resume();
  return plainCtx;
}
async function micCtx() {
  await mic.open();
  return mic.ctx;
}

const TESTS = [
  { id: 'A', ja: '声（ふつうのメディア再生）', en: 'Voice (normal media playback)', note: { ja: 'マイクなし', en: 'mic off' }, run: () => playMedia() },
  { id: 'B', ja: 'ピッ（Web Audio）', en: 'Beep (Web Audio)', note: { ja: 'マイクなし', en: 'mic off' }, run: async () => beep(await plain()) },
  { id: 'C', ja: 'マイクをオンにする', en: 'Turn the microphone on', note: { ja: '許可を求められたら「許可」', en: 'allow it if asked' }, run: async () => void (await micCtx()), noSound: true },
  { id: 'D', ja: '声（ふつうのメディア再生）', en: 'Voice (normal media playback)', note: { ja: 'マイクオン', en: 'mic on' }, run: async () => { await micCtx(); return playMedia(); } },
  { id: 'E', ja: 'ピッ（ゲームと同じ音の出し方）', en: 'Beep (the way games play sound)', note: { ja: 'マイクオン', en: 'mic on' }, run: async () => beep(await micCtx()) },
  { id: 'F', ja: '左だけ → 右だけ', en: 'Left only → right only', note: { ja: 'マイクオン', en: 'mic on' }, run: async () => { const c = await micCtx(); await beep(c, -1, 0.7); await beep(c, 1, 0.7); } },
];

function renderTests() {
  $('tests').innerHTML = TESTS.map((x) => {
    const r = results[x.id] || {};
    const heardBtns = x.noSound
      ? ''
      : `<div class="heard" role="group">
          <button type="button" class="chip${r.heard === 'yes' ? ' on yes' : ''}" data-heard="yes" data-id="${x.id}">${escapeHtml(t('聞こえた', 'Heard it'))}</button>
          <button type="button" class="chip${r.heard === 'no' ? ' on no' : ''}" data-heard="no" data-id="${x.id}">${escapeHtml(t('聞こえない', "Didn't hear it"))}</button>
          ${x.id === 'F' ? `<button type="button" class="chip${r.heard === 'left' ? ' on yes' : ''}" data-heard="left" data-id="F">${escapeHtml(t('左だけ聞こえた', 'Left only'))}</button><button type="button" class="chip${r.heard === 'right' ? ' on yes' : ''}" data-heard="right" data-id="F">${escapeHtml(t('右だけ聞こえた', 'Right only'))}</button>` : ''}
        </div>`;
    return `<li class="test">
      <div class="test-head">
        <span class="tag">${x.id}</span>
        <div><b>${escapeHtml(t(x.ja, x.en))}</b><small>${escapeHtml(t(x.note.ja, x.note.en))}</small></div>
        <button type="button" class="play" data-run="${x.id}">${escapeHtml(x.noSound ? t('オン', 'On') : t('再生', 'Play'))}</button>
      </div>
      <p class="status">${escapeHtml(r.status || '')}</p>
      ${heardBtns}
    </li>`;
  }).join('');
}

$('tests').addEventListener('click', async (e) => {
  const run = e.target.closest('[data-run]');
  const heard = e.target.closest('[data-heard]');
  if (heard) {
    const r = (results[heard.dataset.id] ||= {});
    r.heard = heard.dataset.heard;
    renderTests();
    return renderReport();
  }
  if (!run) return;
  const test = TESTS.find((x) => x.id === run.dataset.run);
  const r = (results[test.id] ||= {});
  r.status = t('再生中…', 'Playing…');
  renderTests();
  try {
    await test.run();
    r.status = test.noSound ? t('マイクがオンになりました', 'Microphone is on') : t('再生しました。聞こえましたか？', 'Played. Did you hear it?');
  } catch (err) {
    r.status = `${t('エラー', 'Error')}: ${err.name || ''} ${err.message || err}`.trim();
  }
  renderTests();
  renderReport();
});

async function deviceInfo() {
  const lines = [`ua: ${navigator.userAgent}`];
  if (mic.ctx) {
    const c = mic.ctx;
    lines.push(`mic context: ${c.state}, ${c.sampleRate} Hz, out channels ${c.destination.maxChannelCount}, baseLatency ${c.baseLatency ?? '?'}, outputLatency ${c.outputLatency ?? '?'}`);
  }
  const track = mic.track;
  if (track) {
    const s = track.getSettings ? track.getSettings() : {};
    lines.push(`mic: "${track.label}" ${track.readyState}, echoCancellation ${s.echoCancellation}, noiseSuppression ${s.noiseSuppression}, autoGainControl ${s.autoGainControl}, ${s.sampleRate || '?'} Hz`);
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    for (const kind of ['audiooutput', 'audioinput']) {
      const names = devices.filter((d) => d.kind === kind).map((d) => d.label || '(hidden until the mic is on)');
      lines.push(`${kind}: ${names.join(' | ') || '(none listed)'}`);
    }
  } catch (_) {}
  return lines;
}

async function renderReport() {
  const lines = TESTS.filter((x) => !x.noSound).map((x) => {
    const r = results[x.id] || {};
    return `${x.id} ${x.en} [${x.note.en}]: ${r.heard || '-'}${r.status?.startsWith('Error') || r.status?.startsWith('エラー') ? ` (${r.status})` : ''}`;
  });
  $('report').textContent = [...lines, '', ...(await deviceInfo())].join('\n');
}

$('btn-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('report').textContent);
    $('copy-status').textContent = t('コピーしました。', 'Copied.');
  } catch (_) {
    const range = document.createRange();
    range.selectNodeContents($('report'));
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    $('copy-status').textContent = t('選択しました。長押しでコピーしてください。', 'Selected: long-press to copy.');
  }
});

initShell({ onPrefs: () => { renderTests(); renderReport(); } });
renderTests();
renderReport();
