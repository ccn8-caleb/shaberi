// The arcade page: a lobby of cabinets bought with points, and the games themselves.

import { t, tr } from '../core/prefs.js';
import { escapeHtml } from '../core/util.js';
import { icon } from '../core/icons.js';
import { visibleCabinets, cabinet } from '../game/arcade.js';
import { load, unlock, recordGame } from '../game/store.js';
import { Mic } from '../audio/mic.js';
import { recognitionAvailable } from '../audio/recognizer.js';
import * as sfx from '../audio/sfx.js';
import { runFlash } from '../games/flash-ui.js';
import { runGroove } from '../games/groove-ui.js';
import { runSanpo } from '../games/sanpo-ui.js';
import { confetti } from './fx.js';
import { initShell, renderHud } from './shell.js';

const $ = (id) => document.getElementById(id);

const mic = new Mic();
let screen = 'lobby';
let confirming = null; // cabinet id waiting for a second tap to buy
let game = null; // { id, run: { done, abort } }
let lastPlayed = null;

function show(name) {
  screen = name;
  for (const s of ['lobby', 'flash', 'sanpo', 'groove', 'over']) $(`screen-${s}`).hidden = s !== name;
  document.querySelector('.tabs').hidden = ['flash', 'sanpo', 'groove'].includes(name);
  window.scrollTo({ top: 0 });
}

// ---------------------------------------------------------------- lobby

function renderLobby() {
  const p = renderHud();
  $('cabinets').innerHTML = visibleCabinets().map((c) => {
    const owned = p.unlocked.includes(c.id);
    const high = p.highs[c.id];
    let foot;
    if (c.soon) {
      foot = `<span class="cab-high">${escapeHtml(t('近日公開', 'Coming soon'))}</span><button class="cab-btn" disabled>${icon('lock')} ${c.cost.toLocaleString()}</button>`;
    } else if (owned) {
      const hs = high ? escapeHtml(t(`ハイスコア ${high}`, `High score ${high}`)) : escapeHtml(t('まだ遊んでいません', 'Not played yet'));
      foot = `<span class="cab-high">${hs}</span><button class="cab-btn" data-play="${c.id}">${icon('play')} ${escapeHtml(t('あそぶ', 'Play'))}</button>`;
    } else if (p.points >= c.cost) {
      const label = confirming === c.id ? t(`★${c.cost} 使う？`, `Spend ★${c.cost}?`) : t(`★${c.cost} で解放`, `Unlock ★${c.cost}`);
      foot = `<span class="cab-high">${escapeHtml(t('解放できます！', 'Ready to unlock!'))}</span><button class="cab-btn${confirming === c.id ? ' confirm' : ''}" data-unlock="${c.id}">${icon('lock')} ${escapeHtml(label)}</button>`;
    } else {
      const pct = Math.round((p.points / c.cost) * 100);
      foot = `<span class="cab-progress" title="${p.points} / ${c.cost}"><span style="width:${pct}%"></span></span><button class="cab-btn" disabled>${icon('lock')} ${escapeHtml(t(`あと ${c.cost - p.points}`, `${c.cost - p.points} to go`))}</button>`;
    }
    return `<article class="cabinet${owned ? '' : ' locked'}${c.soon ? ' soon' : ''}" id="cab-${c.id}" style="--c1:${c.colors[0]};--c2:${c.colors[1]}">
      <span class="cab-tag">${escapeHtml(tr(c.tag))}</span>
      <h2 class="cab-title" lang="ja">${escapeHtml(c.ja)}<small>${escapeHtml(c.en)}</small></h2>
      <p class="cab-desc">${escapeHtml(tr(c.desc))}</p>
      <div class="cab-foot">${foot}</div>
    </article>`;
  }).join('');

  const notes = [t('ヘッドホンを使うとリズムゲームの判定が正確になります。', 'Headphones make the rhythm game more accurate.')];
  if (!recognitionAvailable()) notes.push(t('このブラウザは音声認識がないので、瞬間しゃべりはアクセント問題だけになります。', 'No speech recognition in this browser: Flash Speak will only use accent challenges.'));
  $('lobby-note').textContent = notes.join(' ');
}

function sfxContext() {
  // Sounds for the lobby; games use the mic's context.
  sfxContext.ctx ||= mic.ctx || new AudioContext();
  return sfxContext.ctx;
}

$('cabinets').addEventListener('click', async (e) => {
  const buy = e.target.closest('[data-unlock]');
  const play = e.target.closest('[data-play]');
  if (buy) {
    const id = buy.dataset.unlock;
    if (confirming !== id) {
      confirming = id;
      return renderLobby();
    }
    confirming = null;
    if (unlock(id, cabinet(id).cost)) {
      renderLobby();
      renderHud({ animate: true });
      const card = $(`cab-${id}`);
      card.classList.add('just-unlocked');
      const r = card.getBoundingClientRect();
      confetti(r.left + r.width / 2, r.top + r.height / 2, 160);
      sfx.fanfare(sfxContext());
    } else renderLobby();
  } else if (play) {
    startGame(play.dataset.play);
  }
});

// ---------------------------------------------------------------- games

async function openMic() {
  try {
    await mic.open();
    return true;
  } catch (err) {
    console.warn('[mic]', err);
    $('lobby-note').textContent = t('マイクを許可してください。', 'Please allow microphone access.');
    show('lobby');
    return false;
  }
}

async function startGame(id) {
  if (!load().unlocked.includes(id) || cabinet(id)?.shelved) return;
  lastPlayed = id;
  if (id === 'groove') {
    // The groove waits on its own Start button (a moment to put headphones on).
    show('groove');
    $('groove-intro').hidden = false;
    $('groove-tip').innerHTML = `${icon('headphones', 'ico')} ${escapeHtml(t('ヘッドホン推奨', 'Headphones recommended'))}`;
    return;
  }
  if (!(await openMic())) return;
  show(id);
  game = { id, run: id === 'sanpo' ? runSanpo({ mic }) : runFlash({ mic }) };
  const result = await game.run.done;
  if (game?.id === id && screen === id) gameOver(id, { grade: null, detail: '', ...result });
}

$('groove-start').addEventListener('click', async () => {
  if (!(await openMic())) return;
  $('groove-intro').hidden = true;
  game = { id: 'groove', run: runGroove({ mic }) };
  const result = await game.run.done;
  if (game?.id === 'groove' && screen === 'groove') gameOver('groove', result);
});

function gameOver(id, result) {
  game = null;
  const { newHigh } = recordGame(id, result.score, result.points);
  renderHud({ animate: true });
  show('over');
  $('over-title').textContent = id === 'groove' ? t('おつかれさま！', 'Nice session!') : t('ゲームオーバー', 'Game over');
  $('over-high').hidden = !newHigh || !result.score;
  const g = result.grade || null;
  $('over-score').innerHTML =
    (g ? `<span class="grade g-${g}">${g}</span>` : '') +
    `<span>${result.score}${id === 'groove' ? '<small style="font-size:1rem">/100</small>' : ''}</span>`;
  $('over-detail').textContent = id === 'flash' ? t(`${result.score} 問クリア`, `${result.score} cleared`) : result.detail;
  $('over-points').textContent = `+${result.points} ★`;
  $('over-points').hidden = !result.points;
  if (newHigh && result.score) confetti(window.innerWidth / 2, window.innerHeight / 3, 140);
  if (g === 'S' || g === 'A') sfx.fanfare(mic.ctx);
}

function leaveGame() {
  game?.run.abort();
  game = null;
  renderLobby();
  show('lobby');
}

document.querySelectorAll('[data-back]').forEach((b) => {
  b.innerHTML = icon('back');
  b.addEventListener('click', leaveGame);
});
$('over-lobby').addEventListener('click', () => {
  renderLobby();
  show('lobby');
});
$('over-again').addEventListener('click', () => startGame(lastPlayed));

initShell({ onPrefs: () => screen === 'lobby' && renderLobby() });
renderLobby();
