# しゃべり Shaberi

Speak everyday Japanese and score points for it. Shaberi plays a short everyday
phrase, listens while you say it back, and scores the attempt on **words**, **pitch
accent** and **rhythm**. Runs, combos, a best score and a daily streak turn the
practice into a game.

Everything runs in the browser from static files. There are no accounts, no server
and no build step. Sister apps: [Kanji Nexus](https://kanjinexus.concatn8.com/) and
[Reibun](https://reibun.concatn8.com/).

## Arcade

Practice points unlock arcade games for good, and the games pay out points too.

| Game | Style | What you practise |
| :--- | :--- | :--- |
| **瞬間しゃべり Flash Speak** | Few-second microgames, 4 lives, faster every 5 clears | Set phrases for everyday situations, counting with 〜つ, pitch accent (雨が vs 飴が) |
| **相づちグルーヴ Aizuchi Groove** | Rhythm game: answer on your beat while a friend tells a story | Aizuchi (うん, へえ, ほんと？) and conversational timing |

Flash Speak's Reply and Count rounds need speech recognition. Aizuchi Groove only
needs the microphone: it times when your voice starts, measured on the same audio
clock as the music, after practice bars that learn your device's delay.

The first practice run each day also earns a bonus that grows with your streak.

## How scoring works

| Part | How | Weight |
| :--- | :--- | :--- |
| **Words** | The browser's speech recognition (Web Speech API), compared with the phrase's written form, its kana and known variants. Chrome sends audio to Google, Safari uses Apple's recogniser and Firefox has none. Without it, this part is skipped. | 40% |
| **Pitch accent** | Your pitch is tracked on the device (YIN), the speech is divided evenly into mora, and each rise and fall of the Tokyo accent pattern is checked: about 1.5 semitones in the right direction gets full marks. | 35% |
| **Rhythm** | How long you took compared with the model, with a penalty for pauses in the middle. | 25% |

The pitch and rhythm analysis never leaves the device.

## Running it

The microphone only works on `localhost` or HTTPS.

```bash
docker compose up -d            # nginx on http://localhost:8890
node --test tests/*.test.mjs    # engine tests (Node 22)
```

## Licences

The model voices are recordings made with VOICEVOX (VOICEVOX:剣崎雌雄, VOICEVOX:春日部つむぎ).
They live in `site/audio/`, are **not** covered by the MIT licence, and may not be
redistributed; see `site/audio/README.md`. Regenerate them with
`node tools/voice/build-phrases.mjs` (instructions in the file).

Code: MIT. Latin text uses a subset of [Inter](https://rsms.me/inter/) (SIL Open Font
License, `site/fonts/inter-LICENSE.txt`); icons follow [Lucide](https://lucide.dev) (ISC).
