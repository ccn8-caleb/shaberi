# Changelog

Versions follow [semver](https://semver.org/). The version lives in
`site/js/core/version.js`; every release needs an entry here (CI checks it). Each
deploy also carries a build id (commit hash), shown next to the version in the app.

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
