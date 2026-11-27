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
  from our phrase data (`speak(..., { units })`), never VOICEVOX's guesses. Credit
  every voice used as 「VOICEVOX:名前」 in the app.
- Phrase audio: `node tools/voice/build-phrases.mjs` (only regenerates what changed)
  writes `site/audio/<voice>/<speed>/<id>.mp3` (one per level in `game/speed.js`, each
  timed from the engine's own mora lengths, so pace is exact) and `site/js/data/audio.js`. Run it after any
  phrase edit; `tests/audio.test.mjs` fails until you do. Pitch is shaped from our
  accent data (`shapePitch`) because VOICEVOX's own prediction peaks a mora late,
  especially for つむぎ. The audio is not MIT (see `site/audio/README.md`).
- - Microphone: practice opens it per recording and releases it after (`mic.release()`);
  holding it switches Android Bluetooth earbuds into call mode and the model voice
  stops reaching them. Keep it that way.
- Pitch scoring with a model reference (`pitchAgainstModel` in engine/score.js) uses
  DTW with a narrow band (0.08). Wider bands overfit: a correct reading scored ~1.0
  against a mirrored accent at 0.35 (see tests/engine.test.mjs "mirrored").
- - Progress lives in localStorage (`game/store.js`). Bump SCHEMA_VERSION only with a
  migration in `migrate()`, so saves carry over.
- Phrases: `site/js/data/phrases.js`. Accent numbers are hand-entered; verify against an
  accent dictionary before adding many. Units carry their particles / です・ます.
- Run locally: `docker compose up -d` → http://localhost:8890 (the mic needs
  localhost or HTTPS).
- Versioning: patch bump per release in `site/js/core/version.js` plus a `## [x.y.z]`
  entry in CHANGELOG.md (CI enforces). Minor bumps only when the user calls a milestone.
- Branches: feature → `development` (checks only) → `master` (deploys).
