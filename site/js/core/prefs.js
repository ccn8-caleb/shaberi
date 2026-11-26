// Interface language and theme, shared by every page and synced across tabs.
//
// Static markup is translated declaratively:
//   <button data-ja="追加" data-en="Add">            -> textContent
//   <input data-placeholder-ja="…" data-placeholder-en="…">
// Dynamic text uses t('日本語', 'English').

import { STORAGE_KEYS } from './constants.js';

const listeners = new Set();
const read = (key, allowed, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v) ? v : fallback;
  } catch (_) {
    return fallback;
  }
};

let lang = read(STORAGE_KEYS.LANG, ['ja', 'en'], 'ja');
let theme = read(STORAGE_KEYS.THEME, ['light', 'dark'], 'light');

export const getLang = () => lang;
export const getTheme = () => theme;
export const isEn = () => lang === 'en';
export const t = (ja, en) => (lang === 'en' ? en : ja);
// Pick the ja/en field of a metadata object ({ ja, en }).
export const tr = (meta) => (lang === 'en' ? meta.en : meta.ja);

export function applyStaticText(root = document) {
  root.querySelectorAll('[data-ja][data-en]').forEach((el) => {
    el.textContent = lang === 'en' ? el.dataset.en : el.dataset.ja;
  });
  root.querySelectorAll('[data-placeholder-ja]').forEach((el) => {
    el.placeholder = lang === 'en' ? el.dataset.placeholderEn : el.dataset.placeholderJa;
  });
}

function applyToDocument() {
  const html = document.documentElement;
  html.setAttribute('data-theme', theme);
  html.setAttribute('data-lang', lang);
  html.setAttribute('lang', lang);
  // Browser chrome / status bar colour follows the app theme, not just the OS setting.
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    m.removeAttribute('media');
    m.content = theme === 'dark' ? '#1a1033' : '#fff7ec';
  });
  applyStaticText();
}

function emit(what) {
  applyToDocument();
  for (const fn of listeners) fn(what);
}

export function setLang(next) {
  lang = next === 'en' ? 'en' : 'ja';
  try {
    localStorage.setItem(STORAGE_KEYS.LANG, lang);
  } catch (_) {}
  emit('lang');
}

export function setTheme(next) {
  theme = next === 'dark' ? 'dark' : 'light';
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  } catch (_) {}
  emit('theme');
}

export const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');

// fn('lang' | 'theme')
export function onPrefsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEYS.LANG && e.newValue && e.newValue !== lang) {
    lang = e.newValue === 'en' ? 'en' : 'ja';
    emit('lang');
  } else if (e.key === STORAGE_KEYS.THEME && e.newValue && e.newValue !== theme) {
    theme = e.newValue === 'dark' ? 'dark' : 'light';
    emit('theme');
  }
});

applyToDocument();
