// What every page shares: the header (points, streak, language, theme), the footer,
// and the service worker.

import { t, getLang, setLang, toggleTheme, getTheme, onPrefsChange } from '../core/prefs.js';
import { registerServiceWorker } from '../core/pwa.js';
import { escapeHtml } from '../core/util.js';
import { versionLabel } from '../core/version.js';
import { FAMILY } from '../core/constants.js';
import { load, currentStreak } from '../game/store.js';
import { VOICES } from '../data/audio.js';
import { bump } from './fx.js';

const $ = (id) => document.getElementById(id);

export function renderHud({ animate = false } = {}) {
  const p = load();
  const points = $('hud-points');
  points.querySelector('b').textContent = p.points.toLocaleString();
  $('hud-streak').querySelector('b').textContent = currentStreak(p);
  if (animate) bump(points);
  return p;
}

function renderTopButtons() {
  $('btn-lang').textContent = getLang() === 'ja' ? 'EN' : '日本';
  $('btn-theme').textContent = getTheme() === 'dark' ? '☀' : '☾';
}

function renderFooter() {
  const family = FAMILY.map((f) => `<a href="${f.url}">${escapeHtml(t(f.ja, f.en))}</a>`).join(' · ');
  const credits = Object.values(VOICES).map((v) => escapeHtml(v.credit)).join(' · ');
  $('foot').innerHTML = `${escapeHtml(versionLabel())} · ${family}<br>${escapeHtml(t('お手本の声', 'Voices'))}: ${credits}`;
}

// onPrefs: called after language/theme changes, to re-render dynamic text.
export function initShell({ onPrefs } = {}) {
  $('btn-lang').addEventListener('click', () => setLang(getLang() === 'ja' ? 'en' : 'ja'));
  $('btn-theme').addEventListener('click', toggleTheme);
  onPrefsChange(() => {
    renderTopButtons();
    renderFooter();
    onPrefs?.();
  });
  renderTopButtons();
  renderFooter();
  renderHud();
  registerServiceWorker();
}
