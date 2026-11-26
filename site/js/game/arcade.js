// The arcade (ゲーセン): cabinets bought once with points, then free to play.
// `soon` cabinets are teasers with no game yet. `shelved` cabinets are built but
// hidden everywhere until they're ready (see the note on each).

export const CABINETS = [
  {
    id: 'flash',
    ja: '瞬間しゃべり',
    en: 'Flash Speak',
    tag: { ja: '反射神経', en: 'Reflexes' },
    desc: {
      ja: '数秒ごとに次のお題！あいさつ、数え方、アクセント。ライフ4つでどこまで行ける？',
      en: 'A new challenge every few seconds: greetings, counting, pitch accent. How far can you get on 4 lives?',
    },
    cost: 400,
    colors: ['#ff4d8d', '#ff9f1c'],
  },
  {
    id: 'sanpo',
    ja: '散歩しましょう！',
    en: 'Let’s Take a Walk!',
    tag: { ja: 'スピード', en: 'Speed' },
    desc: {
      ja: 'あの聴解テストの一文を、どんどん速くなるお手本についてリピート。ミスすると…「ダメです！」',
      en: 'Repeat the famous JLPT sound-check line as the model speeds up. Slip up and… 「ダメです！」',
    },
    cost: 600,
    colors: ['#3a86ff', '#14b8a6'],
    // Shelved: the game works, but the desk scene's hand art isn't good enough yet.
    shelved: true,
  },
  {
    id: 'groove',
    ja: '相づちグルーヴ',
    en: 'Aizuchi Groove',
    tag: { ja: 'リズム', en: 'Rhythm' },
    desc: {
      ja: '友だちの話にビートに乗って相づち！「うん」「へえ」「ほんと？」をジャストのタイミングで。',
      en: 'Back-channel on the beat while a friend tells a story: うん, へえ, ほんと? right on time.',
    },
    cost: 800,
    colors: ['#8338ec', '#3a86ff'],
  },
  {
    id: 'konbini',
    ja: 'コンビニラッシュ',
    en: 'Konbini Rush',
    tag: { ja: 'ロールプレイ', en: 'Role-play' },
    desc: { ja: 'レジの行列をさばけ！', en: 'Clear the checkout queue!' },
    cost: 1500,
    soon: true,
    colors: ['#14b8a6', '#ffc93c'],
  },
];

export const cabinet = (id) => CABINETS.find((c) => c.id === id);

// What the lobby shows.
export const visibleCabinets = () => CABINETS.filter((c) => !c.shelved);

// The cheapest cabinet still locked (for the "next unlock" progress on the home screen).
export function nextUnlock(unlocked) {
  return visibleCabinets().filter((c) => !c.soon && !unlocked.includes(c.id)).sort((a, b) => a.cost - b.cost)[0] || null;
}
