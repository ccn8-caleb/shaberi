# Changelog

Versions follow [semver](https://semver.org/). The version lives in
`site/js/core/version.js`; every release needs an entry here (CI checks it). Each
deploy also carries a build id (commit hash), shown next to the version in the app.

## [0.1.4] — 2026-11-27 — Speed levels

### Added
- **「速すぎる」/「遅すぎる」 buttons** under the practice controls. They slow the model
  voice down or speed it up a step and play it again. Four levels, remembered:
  ゆっくり (6 morae/s), ふつう (7), はやめ (8) and ネイティブ (9).
- **Faster pays more:** a phrase's points are ×0.8, ×1, ×1.25 or ×1.5 by speed (shown
  on the result card and in the Next button's points).
- **Faster is stricter:** the rhythm check's full-marks window narrows with speed,
  from 0.75–1.45× the model's time at ゆっくり to 0.9–1.12× at ネイティブ, and the
  score falls off faster outside it. If you're too slow for the level, the result
  suggests slowing the model down.

- **サウンドチェック (sound check):** linked from the home screen as 「音が聞こえない？」.
  It plays test sounds through each way the app makes sound, with and without the
  microphone on, plus a left/right test, and builds a copyable report with your
  answers and the device's audio details.

### Fixed
- **No model voice through Bluetooth earbuds on some Android phones** (reported with
  one earbud in). The voice now plays like music apps do (an ordinary media player)
  instead of through the microphone's audio session, which falls back to the old
  route, then to the phone's own speech.

### Changed
- Every phrase is recorded at each speed (160 recordings, 1.9 MB), timed from the
  voice engine's own syllable lengths so each level is exactly its pace. The new
  ふつう is a touch brisker than 0.1.3's recordings; ゆっくり is close to the old pace.

## [0.1.3] — 2026-11-27 — Real model voices

### Added
- **The 聞く button plays real recordings** of every practice phrase, in two VOICEVOX
  voices: 剣崎雌雄 (male) and 春日部つむぎ (female). Pick one on the home screen. They
  sound the same on every device, work offline, and no longer depend on the phone
  having a Japanese voice. Credits are in the footer.
- Each recording says the phrase with exactly the pitch accent shown in the graph,
  at a learner-friendly pace (about 7 syllables a second), and its length is now the
  rhythm target.

### Fixed
- ください had the wrong accent in three phrases' pitch graphs (it falls after さ,
  not after だ).

## [0.1.2] — 2026-11-26 — Words on Android

### Fixed
- **Words scored 0 on Android Chrome** even when you said the phrase well. Android's
  speech recognition often can't use the microphone while Shaberi is recording it,
  so it heard nothing. Shaberi now hands the recogniser its own microphone track
  where the browser supports that. When the recogniser still comes back empty after
  a clear, full-length attempt, Words is left unscored (with a note saying so)
  instead of counting as 0. Wrong words still score low.
- The section tabs no longer float over the phrase card when you scroll.
- Long phrases break between words (コーヒーを／ひとつください) instead of in the
  middle of one (くださ／い).

## [0.1.1] — 2026-11-26 — Arcade

### Added
- **ゲーセン (Arcade):** a new tab where practice points unlock games for good
  (tap twice to confirm). Playing them earns points too, and each keeps a high score.
  The practice home screen shows progress towards the next unlock.
- **瞬間しゃべり (Flash Speak):** quick voice microgames against a burning fuse, with
  4 lives and a speed-up every 5 clears. *Reply* (say the right set phrase for a
  situation), *Count* (count objects with 〜つ) and *Accent Snap* (say 雨が vs 飴が
  with the pitch pattern shown). Reply and Count are won the moment the speech
  recogniser hears the answer; without speech recognition only Accent Snap is used.
- **相づちグルーヴ (Aizuchi Groove):** a rhythm game. A friend tells a story to the
  beat and you answer うん／へえ／ほんと？ on your beat, judged on when your voice
  starts (Perfect / Nice / Early / Late / Miss). Three practice bars measure your
  device's audio delay first. Headphones recommended.
- **Daily bonus:** the first practice run each day earns +50, plus 10 per streak day
  (up to +150).

### Changed
- Points are now a spendable balance; lifetime points are kept separately. Saves
  from 0.1.0 carry over.

## [0.1.0] — 2026-11-26 — Proof of concept

### Added
- **Runs of 5 everyday phrases:** hear the model (browser text-to-speech), say it back,
  get a grade (S–D), a 0–100 score and tips; retry as often as you like, and the best
  attempt counts.
- **Scoring on three parts:** words (speech recognition, where the browser has it),
  pitch accent (your pitch rises and falls vs. the Tokyo accent pattern, drawn live
  over the model) and rhythm (speed vs. the model, pauses).
- **Game layer:** points, combo multiplier (up to ×2), grade bonuses, best run and a
  daily streak, kept in this browser (no account). Confetti for S and A.
- Installable PWA with offline support, light/dark theme, Japanese/English UI.
