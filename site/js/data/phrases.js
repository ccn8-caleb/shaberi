// Everyday phrases for the PoC.
//
//   text:  written form (also what speech recognisers tend to return)
//   units: accent phrases as [kana, Tokyo accent number]; particles and です/ます
//          belong to the unit before them
//   alt:   other written forms a recogniser might return
//   en:    meaning;  scene: where you'd say it (for a future map of places)
//
// Accent numbers are hand-entered for the PoC. Before growing this list, they should
// come from (or be checked against) an accent dictionary.

export const PHRASES = [
  { id: 'ohayou', text: 'おはようございます', units: [['おはようございます', 8]], en: 'Good morning.', scene: 'home' },
  { id: 'arigatou', text: 'ありがとうございます', units: [['ありがとう', 2], ['ございます', 4]], en: 'Thank you very much.', scene: 'home' },
  { id: 'sumimasen', text: 'すみません', units: [['すみません', 4]], alt: ['済みません'], en: 'Excuse me. / Sorry.', scene: 'street' },
  { id: 'itadakimasu', text: 'いただきます', units: [['いただきます', 5]], alt: ['頂きます'], en: 'Let’s eat. (before a meal)', scene: 'home' },
  { id: 'gochisousama', text: 'ごちそうさまでした', units: [['ごちそうさまでした', 8]], alt: ['ご馳走様でした', 'ごちそう様でした'], en: 'Thank you for the meal.', scene: 'home' },
  { id: 'ittekimasu', text: 'いってきます', units: [['いってきます', 5]], alt: ['行ってきます'], en: 'I’m off! (leaving home)', scene: 'home' },
  { id: 'hajimemashite', text: 'はじめまして', units: [['はじめまして', 4]], alt: ['初めまして'], en: 'Nice to meet you.', scene: 'office' },
  { id: 'yoroshiku', text: 'よろしくおねがいします', units: [['よろしく', 0], ['おねがいします', 6]], alt: ['よろしくお願いします'], en: 'I look forward to working with you.', scene: 'office' },
  { id: 'otsukaresama', text: 'おつかれさまです', units: [['おつかれさまです', 7]], alt: ['お疲れ様です', 'お疲れさまです'], en: 'Thanks for your hard work.', scene: 'office' },
  { id: 'osakini', text: 'おさきにしつれいします', units: [['おさきに', 0], ['しつれいします', 6]], alt: ['お先に失礼します'], en: 'Excuse me for leaving first.', scene: 'office' },
  { id: 'daijoubu', text: 'だいじょうぶです', units: [['だいじょうぶです', 3]], alt: ['大丈夫です'], en: 'I’m fine. / No problem.', scene: 'street' },
  { id: 'eki', text: '駅はどこですか', units: [['えきは', 1], ['どこですか', 1]], en: 'Where is the station?', scene: 'station' },
  { id: 'ikura', text: 'いくらですか', units: [['いくらですか', 1]], alt: ['幾らですか'], en: 'How much is it?', scene: 'konbini' },
  { id: 'kore', text: 'これをください', units: [['これを', 0], ['ください', 2]], alt: ['これを下さい'], en: 'This one, please.', scene: 'konbini' },
  { id: 'omizu', text: 'お水をください', units: [['おみずを', 0], ['ください', 2]], alt: ['おみずをください', 'お水を下さい'], en: 'Water, please.', scene: 'cafe' },
  { id: 'coffee', text: 'コーヒーをひとつください', units: [['コーヒーを', 3], ['ひとつ', 2], ['ください', 2]], alt: ['コーヒーを一つください', 'コーヒーを1つください'], en: 'One coffee, please.', scene: 'cafe' },
  { id: 'chotto', text: 'ちょっとまってください', units: [['ちょっと', 1], ['まってください', 1]], alt: ['ちょっと待ってください', 'ちょっと待って下さい'], en: 'Please wait a moment.', scene: 'street' },
  { id: 'tenki', text: '今日はいい天気ですね', units: [['きょうは', 1], ['いい', 1], ['てんきですね', 1]], alt: ['今日はいいてんきですね', 'きょうはいい天気ですね'], en: 'Nice weather today, isn’t it?', scene: 'street' },
  { id: 'mataashita', text: 'またあした', units: [['また', 0], ['あした', 3]], alt: ['また明日'], en: 'See you tomorrow.', scene: 'office' },
  { id: 'wakarimashita', text: 'わかりました', units: [['わかりました', 4]], alt: ['分かりました'], en: 'Understood.', scene: 'office' },
];
