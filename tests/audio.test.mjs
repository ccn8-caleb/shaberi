// The generated model audio stays in step with the phrase data.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

import { AUDIO, VOICES } from '../site/js/data/audio.js';
import { PHRASES } from '../site/js/data/phrases.js';
import { phraseMora } from '../site/js/engine/mora.js';
import { VOICES as RECIPES } from '../tools/voice/voicevox.mjs';

test('every phrase has a recording in every voice', () => {
  assert.deepEqual(Object.keys(AUDIO.clips).sort(), Object.keys(RECIPES).sort());
  for (const voice of Object.keys(RECIPES)) {
    for (const p of PHRASES) {
      const c = AUDIO.clips[voice][p.id];
      assert.ok(c, `${voice}/${p.id} missing: run node tools/voice/build-phrases.mjs`);
      assert.ok(fs.existsSync(new URL(`../site/${c.src}`, import.meta.url)), `${c.src} not on disk`);
    }
  }
});

test('recordings are a learner-friendly pace and start promptly', () => {
  for (const [voice, clips] of Object.entries(AUDIO.clips)) {
    for (const p of PHRASES) {
      const c = clips[p.id];
      const rate = phraseMora(p.units).length / c.speech;
      assert.ok(rate > 5.5 && rate < 9.5, `${voice}/${p.id}: ${rate.toFixed(1)} mora/s`);
      assert.ok(c.start >= 0 && c.start < 0.3, `${voice}/${p.id}: starts at ${c.start}s`);
    }
  }
});

test('recordings were made from the current phrase text and accents', () => {
  // build-phrases.mjs hashes the text and units into each clip; any edit to a phrase
  // without regenerating its audio changes this list.
  const stale = [];
  for (const [voice, clips] of Object.entries(AUDIO.clips)) {
    for (const p of PHRASES) {
      const settingsAgnostic = JSON.stringify([p.text, p.units]);
      const c = clips[p.id];
      if (c.made !== crypto.createHash('sha1').update(settingsAgnostic).digest('hex').slice(0, 12)) stale.push(`${voice}/${p.id}`);
    }
  }
  assert.deepEqual(stale, [], 'phrases changed since their audio was made: run node tools/voice/build-phrases.mjs');
});

test('credits name every voice the way its terms require', () => {
  for (const [id, v] of Object.entries(VOICES)) assert.equal(v.credit, `VOICEVOX:${RECIPES[id].name}`);
});
