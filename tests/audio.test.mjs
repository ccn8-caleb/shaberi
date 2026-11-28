// The generated model audio stays in step with the phrase data and speed levels.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';

import { AUDIO, VOICES } from '../site/js/data/audio.js';
import { PHRASES } from '../site/js/data/phrases.js';
import { SPEEDS } from '../site/js/game/speed.js';
import { phraseMora } from '../site/js/engine/mora.js';
import { VOICES as RECIPES } from '../tools/voice/voicevox.mjs';

const each = (fn) => {
  for (const voice of Object.keys(RECIPES)) for (const sp of SPEEDS) for (const p of PHRASES) fn(voice, sp, p, AUDIO.clips[voice]?.[sp.id]?.[p.id]);
};

test('every phrase has a recording in every voice at every speed', () => {
  assert.deepEqual(Object.keys(AUDIO.clips).sort(), Object.keys(RECIPES).sort());
  each((voice, sp, p, c) => {
    assert.ok(c, `${voice}/${sp.id}/${p.id} missing: run node tools/voice/build-phrases.mjs`);
    assert.ok(fs.existsSync(new URL(`../site/${c.src}`, import.meta.url)), `${c.src} not on disk`);
  });
});

test("each recording is the voice as is, at its level's speed setting", () => {
  each((voice, sp, p, c) => {
    assert.equal(c.speed, sp.scale, `${voice}/${sp.id}/${p.id}: speed ×${c.speed}`);
    // A natural pace for its level, by the engine's own timing (VOICEVOX talks at about
    // 8 morae a second as is). Our speech detector misses whispered endings, so it
    // isn't used for this.
    assert.ok(c.rate > 5 && c.rate < 12.5, `${voice}/${sp.id}/${p.id}: ${c.rate} mora/s`);
    assert.ok(c.start >= 0 && c.start < 0.35, `${voice}/${sp.id}/${p.id}: starts at ${c.start}s`);
  });
  // Faster levels really are faster, phrase by phrase.
  for (const voice of Object.keys(RECIPES)) for (const p of PHRASES) {
    const paces = SPEEDS.map((sp) => AUDIO.clips[voice][sp.id][p.id].rate);
    for (let i = 1; i < paces.length; i++) assert.ok(paces[i] > paces[i - 1], `${voice}/${p.id}: ${paces}`);
  }
});

test('recordings were made from the current phrase text and accents', () => {
  // build-phrases.mjs hashes the text and units into each clip; any edit to a phrase
  // without regenerating its audio shows up here.
  const stale = [];
  each((voice, sp, p, c) => {
    const want = crypto.createHash('sha1').update(JSON.stringify([p.text, p.units])).digest('hex').slice(0, 12);
    if (c.made !== want) stale.push(`${voice}/${sp.id}/${p.id}`);
  });
  assert.deepEqual(stale, [], 'phrases changed since their audio was made: run node tools/voice/build-phrases.mjs');
});

test('credits name every voice the way its terms require', () => {
  for (const [id, v] of Object.entries(VOICES)) assert.equal(v.credit, `VOICEVOX:${RECIPES[id].name}`);
});
