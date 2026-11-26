// Small, dependency-free helpers shared across pages.

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function toHiragana(str) {
  return String(str || '').replace(/[ァ-ヶ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60)
  );
}

export function toKatakana(str) {
  return String(str || '').replace(/[ぁ-ゖ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) + 0x60)
  );
}

export const isKanji = (ch) => /\p{Script=Han}/u.test(ch);
export const hasKana = (str) => /[ぁ-ゟ]/.test(str);

// Unique kanji in a word, resolving the iteration mark 々 to the preceding character.
export function extractKanji(text) {
  const chars = [...String(text || '')];
  const result = [];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] === '々' && i > 0 ? chars[i - 1] : chars[i];
    if (isKanji(ch) && !result.includes(ch)) result.push(ch);
  }
  return result;
}

// A word key may carry a disambiguating suffix for homographs: "生物#なまもの".
export const labelOf = (key) => String(key).split('#')[0];

// Readings are stored as arrays; the UI edits them as "コウ・ゴウ".
export const joinReadings = (list) => (list || []).join('・');
export function splitReadings(text) {
  return String(text || '')
    .split(/[・、,，/／\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Search normalisation: lowercase + katakana folded to hiragana.
export const fold = (str) => toHiragana(String(str || '').toLowerCase());

export function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
