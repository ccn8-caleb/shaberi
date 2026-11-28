# Shaberi — notes for agents

Static, no-build PWA (vanilla ES modules in `site/`), sister to
`~/projects/japanese-tools/reibun` and `kanji-nexus`. `site/js/core/` (prefs, pwa, util,
version), `site/sw.js` and `tools/stamp-deploy.sh` come from those apps: when changing
shared pieces, check whether the same change belongs there too. Shaberi is the
*colourful* one: its theme (`site/css/base.css`) is its own and intentionally louder.

- Engine (`site/js/engine/`) and game rules (`site/js/game/run.js`) are pure and tested
  under Node: `node --test tests/*.test.mjs`. Audio tests use synthetic voices
  (`tests/synth.mjs`), so new scoring rules can be checked without a microphone.
- Scoring = words (Web Speech API, optional) + pitch accent (YIN pitch vs. the Tokyo
  accent pattern) + rhythm (duration vs. the model, pauses). See `engine/score.js`.
- Arcade (`arcade.html`): cabinets in `game/arcade.js`, rules in `game/flash.js` and
  `game/groove.js` (pure, tested), screens in `games/*-ui.js`. Groove timing relies on
  the capture worklet stamping each block with its AudioContext frame: keep music
  scheduled on `mic.ctx` and judge onsets on that same clock. Game sounds are
  synthesised (`audio/sfx.js`), so there are no audio files.
- Shelved: 散歩しましょう！ (`game/sanpo.js`, `games/sanpo-ui.js`, its screen in
  `arcade.html`) works and is tested but is hidden (`shelved: true` in `game/arcade.js`)
  until the desk scene's hand art is redone. Unshelve by removing the flag and adding
  a CHANGELOG entry.
- Voices: VOICEVOX 剣崎雌雄 (male) and 春日部つむぎ (female), generated at build time with
  `tools/voice/voicevox.mjs` (engine in Docker, see the file header); audio is never
  synthesised in the browser. Singing styles were picked by listening tests, so don't
  change them without asking: 剣崎 sings 'octave-lift' (the singing model can't go
  below ~E3), 'goofy' is his deliberately octave-wobbly style for comic moments only,
  and つむぎ sings 'as-sung' (no pitch cleanup: it sounds less natural). Set accents
  from our phrase data (`speak(..., { units })`), never VOICEVOX's guesses. **Speech is
  VOICEVOX as is** (the user's call, 2026-11-28): only our accent marks and the particle
  reading; no pitch shaping or re-timing, which made the voices sound stiff. Speed
  levels use VOICEVOX's plain speedScale. Pitch/timing edits are for singing only. Credit
  every voice used as 「VOICEVOX:名前」 in the app.
- Phrase audio: `node tools/voice/build-phrases.mjs` (only regenerates what changed)
  writes `site/audio/<voice>/<speed>/<id>.mp3` (one per level in `game/speed.js`, at its
  speedScale) and `site/js/data/audio.js`. Run it after any
  phrase edit; `tests/audio.test.mjs` fails until you do. The audio is not MIT (see `site/audio/README.md`).
- Speech recognition on Android is a separate system service that needs the mic to
  itself: while we hold the mic, it hears nothing. Flash Speak releases the mic for
  reply/count rounds (recognizer.stream has pause/resume). Practice can't recognise
  words on Android while it records for pitch.
- Groove voices: `node tools/voice/build-groove.mjs` (lines must die away before the
  answer window, see lineMax; tests/games.test.mjs checks the recordings fit). Bars are
  always 4 beats and every turn is one bar (the user found 5-beat bars irregular and
  two-bar turns too slow): at fast tempos the friend speaks faster instead. Stories live in `STORIES` in game/groove.js; add more there and rebuild.
- Voice kana: VOICEVOX's kana notation reads kana literally, so `accentKana` writes a
  unit-final は/へ as ワ/エ. A unit that really ends in "ha" takes `{ read }` as a third
  element.
- Flash Speak: Web Speech errors like 'network' (Brave always) mean it won't work this
  session; the game then uses the on-device check (`words.choose`, right answer vs.
  the other answers) for reply/count rounds.
- Words in practice: when the on-device check (`asr/words.js` + `asr/worker.js`,
  Whisper tiny via transformers.js 4.3.2 from jsDelivr) is ready, it scores the
  recording by how close the expected text is to the model's preferences (teacher
  forcing), not by free transcription; free transcription mis-kanji'd too often.
  Mapping: closeness ≥ −0.9 → full, ≤ −2.1 → 0 (tests/words.test.mjs has the measured
  values).
  Encode each recording once (`encode()` in the worker) and pass `encoder_outputs` for
  every candidate: passing `input_features` re-runs the encoder per candidate (×5 slower,
  which made Flash Speak time out). Batching candidates in one decoder pass changed the
  scores (up to 0.4), so it isn't used.
- Bluetooth: never record from the earbuds' mic (audio/mic.js preferredInput picks the
  phone's own, e.g. "Speakerphone", when a Bluetooth input exists) and don't start the
  browser's SpeechRecognition while one is connected. Using the BT mic put a user's
  earbuds into call mode that stayed stuck across pages.
- Microphone: practice opens it per recording and releases it after (`mic.release()`);
  holding it switches Android Bluetooth earbuds into call mode and the model voice
  stops reaching them. Keep it that way.
- Pitch scoring with a model reference (`pitchAgainstModel` in engine/score.js) uses
  DTW with a narrow band (0.08). Wider bands overfit: a correct reading scored ~1.0
  against a mirrored accent at 0.35 (see tests/engine.test.mjs "mirrored").
- Progress lives in localStorage (`game/store.js`). Bump SCHEMA_VERSION only with a
  migration in `migrate()`, so saves carry over.
- Phrases: `site/js/data/phrases.js`. Accent numbers are hand-entered; verify against an
  accent dictionary before adding many. Units carry their particles / です・ます.
- Run locally: `docker compose up -d` → http://localhost:8890 (the mic needs
  localhost or HTTPS).
- Versioning: patch bump per release in `site/js/core/version.js` plus a `## [x.y.z]`
  entry in CHANGELOG.md (CI enforces). Minor bumps only when the user calls a milestone.
- Branches: feature → `development` (checks only) → `master` (deploys).
