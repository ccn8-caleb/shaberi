// App-wide constants.

export const APP_NAME = { ja: 'しゃべり', en: 'Shaberi' };

export const STORAGE_KEYS = {
  LANG: 'shaberi_lang',
  THEME: 'shaberi_theme',
  PROGRESS: 'shaberi_progress', // points, best run, per-phrase bests (see game/store.js)
  VOICE: 'shaberi_voice', // which model voice plays the phrases (see audio/model.js)
  SPEED: 'shaberi_speed', // the model's speaking speed (see game/speed.js)
  WORDS: 'shaberi_words', // 'on' when the on-device word check is wanted (see asr/words.js)
};

export const SCHEMA_VERSION = 2;

// Sister apps.
export const FAMILY = [
  { id: 'kanji-nexus', ja: '漢字ネクサス', en: 'Kanji Nexus', url: 'https://kanjinexus.concatn8.com/' },
  { id: 'reibun', ja: '例文', en: 'Reibun', url: 'https://reibun.concatn8.com/' },
];
