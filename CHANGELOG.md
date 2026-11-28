# Changelog

Versions follow [semver](https://semver.org/). The version lives in
`site/js/core/version.js`; every release needs an entry here (CI checks it). Each
deploy also carries a build id (commit hash), shown next to the version in the app.

## [0.1.10] — 2026-11-28 — Playtest fixes

### Fixed
- **は sounded like "ha"** in 「今日はいい天気ですね」 and 「駅はどこですか」. The model
  recordings now say the particles は and へ as わ and え (both voices, every speed).
- **瞬間しゃべり stuck on 「音声認識のエラー（network）」.** That error means the browser's
  speech recognition can't reach its server (always in Brave, and in Chrome when
  offline). The game now stops retrying straight away, doesn't count the round, and,
  if the on-device check is on, uses it for the reply and counting rounds: it records
  your answer and checks whether it's closer to the right answer than to any other.
  Without it, a clear message explains how to turn it on.
- **The live pitch line was jumpy and laggy.** It now takes a reading every 10 ms
  instead of every 43 ms, smooths out one-off misreads, starts from your usual pitch
  (remembered from your last attempt), and spans the graph the way the scored curve
  does, so it no longer jumps when the result appears.
- **Stray marks on the scored pitch curve** (and the pitch score they affected):
  readings far outside your voice's range and specks shorter than 60 ms are dropped.

### Changed
- **相づちグルーヴ keeps a steady 4-beat feel** at every tempo: the count-in and bars are
  always 4 beats. At はやめ and ネイティブ each turn spans two bars (you answer on the
  4th beat of the second) instead of using 5-beat bars.
- **相づちグルーヴ has six stories** (the cat on the train, a café treat, a rainy day,
  tomorrow's test, the mountain monkey, the new job), picked at random and never the
  same one twice in a row. The story's title shows when the scored part starts.
- The しゃべり logo at the top left now goes back to the home screen.

## [0.1.9] — 2026-11-27 — Earbuds stay earbuds; Groove tempos

### Fixed
- **Bluetooth earbuds went silent after a practice run**, even for other pages, until
  Bluetooth was restarted. With earbuds connected, the default microphone is the
  earbuds' own, and using it puts them into call mode, which could get stuck. Shaberi
  now records with the phone's own microphone whenever a Bluetooth microphone is
  present (better quality for pitch, too), and doesn't use the browser's speech
  recognition in practice or 瞬間しゃべり then (it would use the earbuds' mic). Use the
  on-device word check for words. The sound check explains how to recover if earbuds
  are already stuck (turn Bluetooth off and on).

### Added
- **相づちグルーヴ tempos:** ゆっくり 84 · ふつう 100 · はやめ 116 · ネイティブ 132 BPM,
  with points ×1 to ×2. The first two are open; 80+ on your fastest open tempo opens
  the next. Faster tempos have tighter timing windows (a share of the beat) and the
  friend speaks a little faster; the two fastest use 5-beat bars (4·3·2·1·いま！) so
  the lines still fit at a natural speaking speed. Each tempo has its own recordings
  and best score. ふつう is the new default.

## [0.1.8] — 2026-11-27 — Words on any device

### Added
- **Word scoring on the device itself** (home screen card, optional one-time download
  of about 50 MB). A small speech model (Whisper tiny) checks your recording right on
  the phone, so words are scored in any browser, Android and Brave included, and
  your voice never leaves the device. Because Shaberi knows the phrase you're
  practising, it asks "how close is this to the expected phrase?" rather than
  transcribing freely, which is far more reliable: in tests, right phrases scored
  79–100 and wrong phrases 0. When it's on, the browser's own speech recognition
  isn't used in practice (which is what clashed with the pitch recording on
  Android).

## [0.1.7] — 2026-11-27 — Friendlier arcade

### Changed
- **相づちグルーヴ, rebuilt for learners:**
  - Real voices: 春日部つむぎ tells the story, 剣崎雌雄 demonstrates each aizuchi.
  - Every line comes twice: first the model answers (お手本), then it's your turn,
    with a 「3・2・1・いま！」 countdown on screen.
  - Slower (84 BPM) with much wider timing windows: ±0.1 s for ぴったり, ±0.2 s
    for いいね, up to ±0.35 s.
  - Shorter story lines spoken at natural speed, a step-by-step how-to on the
    start screen, and a note that Bluetooth earbuds may go silent (the mic stays
    on for the whole song).
- **瞬間しゃべり, easier to start:** 7 seconds per round at first (never under 4),
  and a hint with the answer appears partway through each round.

### Fixed
- **瞬間しゃべり didn't hear you on Android.** Speech recognition there needs the
  microphone to itself, and the game was holding it. The mic now opens only for
  accent rounds. A new indicator shows 「聞いています…」, then 「声が聞こえています！」
  as soon as a voice is detected, or an error if recognition can't start.

## [0.1.6] — 2026-11-27 — Earbuds and friendlier pitch

### Fixed
- **No model voice through Bluetooth earbuds.** While a page holds the microphone,
  Android switches earbuds into call mode and ordinary playback stops reaching them.
  The microphone is now opened only while you're recording (「準備中…」 shows while it
  starts) and released straight after, so the model always plays with it closed. The
  arcade also lets go of it when a game ends.
- **Pitch scoring was too strict.** It now compares the shape of your pitch with the
  model recording's: your attempt is lined up with the model by time-warping (so your
  syllables needn't be evenly timed) and scored on rising and falling where the accent
  does (60%) and on how closely your pitch follows the model's shape (40%). A rise or
  fall now counts fully at 1 semitone instead of 1.5, and partly even when slight.
  The warping is kept narrow, so it can't bend a wrong accent into a right one.
- **Rhythm alone could give an S** when pitch couldn't be heard (e.g. a Bluetooth
  call microphone) and words weren't available. Such scores are now capped at 60,
  with a note saying why.

### Changed
- Your pitch curve on the graph is drawn lined up under the model's syllables.
- Each recording now carries its pitch curve and syllable timings for scoring.

## [0.1.5] — 2026-11-27 — Fairer timing

### Fixed
- **Short phrases scored 0 for rhythm and pitch** when a stray sound (a tap, a breath,
  an earbud crackle) landed before or after the speech: the app measured from the first
  loud sound to the last, so one blip stretched "your speech" to several times its
  length. It now finds the main burst of speech and leaves small isolated sounds out;
  a real pause mid-phrase is still counted and flagged.

### Added
- **▶ 自分の声 / ▶ お手本** on the result card: play back exactly what the microphone
  recorded, and the model again, to compare.
- **くわしく (Details)** on the result card: recording and speech length, the model's
  length, the ratio, pauses, your pitch and which microphone was used.

### Changed
- The model recordings' rhythm targets are now measured on the final files the app
  plays, with the same speech detection as your voice.

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
