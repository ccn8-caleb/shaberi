// Content for 瞬間しゃべり (Flash Speak) microgames.
//
// answers: what counts as right, matched against the recogniser's text after
// normalising (kana folded to hiragana, punctuation dropped), as substrings, so
// "あ、ただいま！" still counts for ただいま.

// Quick Reply: react to a situation.
export const REPLIES = [
  { id: 'eat', ja: 'これから食べる！', en: 'About to eat!', answers: ['いただきます', '頂きます'], hint: 'いただきます', art: 'bowl' },
  { id: 'ate', ja: 'ごはんを食べ終わった', en: 'Just finished eating', answers: ['ごちそうさま', 'ご馳走様', 'ごちそう様'], hint: 'ごちそうさま', art: 'bowl' },
  { id: 'leave', ja: '家を出る', en: 'Leaving home', answers: ['いってきます', '行ってきます', 'いってまいります'], hint: 'いってきます', art: 'door' },
  { id: 'home', ja: '家に帰ってきた', en: 'Back home', answers: ['ただいま', '只今'], hint: 'ただいま', art: 'door' },
  { id: 'bump', ja: '人にぶつかった！', en: 'Bumped into someone!', answers: ['すみません', 'ごめんなさい', 'ごめん', '済みません', 'すいません'], hint: 'すみません', art: 'bump' },
  { id: 'meet', ja: 'はじめて会う人', en: 'Meeting someone new', answers: ['はじめまして', '初めまして'], hint: 'はじめまして', art: 'wave' },
  { id: 'gift', ja: 'プレゼントをもらった', en: 'You got a present', answers: ['ありがとう', '有難う', 'どうも'], hint: 'ありがとう', art: 'gift' },
  { id: 'morning', ja: '朝、友だちに会った', en: 'Morning, you see a friend', answers: ['おはよう'], hint: 'おはよう', art: 'sun' },
  { id: 'night', ja: 'もう寝る', en: 'Off to bed', answers: ['おやすみ', 'お休み'], hint: 'おやすみ', art: 'moon' },
  { id: 'evening', ja: '夜、近所の人に会った', en: 'Evening, you see a neighbour', answers: ['こんばんは', '今晩は'], hint: 'こんばんは', art: 'moon' },
  { id: 'phone', ja: '電話に出る', en: 'Answering the phone', answers: ['もしもし'], hint: 'もしもし', art: 'phone' },
  { id: 'work', ja: '同僚が仕事を終えた', en: 'A coworker finished work', answers: ['おつかれ', 'お疲れ'], hint: 'おつかれさま', art: 'wave' },
];

// Count it!: native counting with 〜つ.
export const COUNTS = [
  { n: 1, answers: ['ひとつ', '一つ', '1つ'] },
  { n: 2, answers: ['ふたつ', '二つ', '2つ'] },
  { n: 3, answers: ['みっつ', '三つ', '3つ'] },
  { n: 4, answers: ['よっつ', '四つ', '4つ'] },
  { n: 5, answers: ['いつつ', '五つ', '5つ'] },
  { n: 6, answers: ['むっつ', '六つ', '6つ'] },
  { n: 7, answers: ['ななつ', '七つ', '7つ'] },
  { n: 8, answers: ['やっつ', '八つ', '8つ'] },
  { n: 9, answers: ['ここのつ', '九つ', '9つ'] },
];
export const COUNT_THINGS = [
  { ja: 'りんご', en: 'apples', color: '#ff4d8d' },
  { ja: 'みかん', en: 'oranges', color: '#ff9f1c' },
  { ja: 'おにぎり', en: 'rice balls', color: '#14b8a6' },
  { ja: 'ボール', en: 'balls', color: '#3a86ff' },
];

// Accent Snap: words that differ only in pitch accent, said with が so the
// difference is audible (Tokyo accent numbers).
export const ACCENT_PAIRS = [
  [{ text: '雨が', kana: 'あめが', accent: 1, en: 'rain' }, { text: '飴が', kana: 'あめが', accent: 0, en: 'candy' }],
  [{ text: '箸が', kana: 'はしが', accent: 1, en: 'chopsticks' }, { text: '橋が', kana: 'はしが', accent: 2, en: 'bridge' }],
  [{ text: '牡蠣が', kana: 'かきが', accent: 1, en: 'oyster' }, { text: '柿が', kana: 'かきが', accent: 0, en: 'persimmon' }],
  [{ text: '神が', kana: 'かみが', accent: 1, en: 'god' }, { text: '紙が', kana: 'かみが', accent: 2, en: 'paper' }],
  [{ text: '鮭が', kana: 'さけが', accent: 1, en: 'salmon' }, { text: '酒が', kana: 'さけが', accent: 0, en: 'sake' }],
  [{ text: '今が', kana: 'いまが', accent: 1, en: 'now' }, { text: '居間が', kana: 'いまが', accent: 2, en: 'living room' }],
];
