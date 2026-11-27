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

test("each recording is spoken at its level's pace", () => {
  each((voice, sp, p, c) => {
    // The engine's own timing: exact.
    assert.ok(Math.abs(c.rate / sp.rate - 1) < 0.01, `${voice}/${sp.id}/${p.id}: ${c.rate} mora/s, want ${sp.rate}`);
    // As our analyser hears it (it misses whispered endings, so a little faster).
    const heard = phraseMora(p.units).length / c.speech;
    assert.ok(heard > sp.rate * 0.95 && heard < sp.rate * 1.4, `${voice}/${sp.id}/${p.id}: heard at ${heard.toFixed(1)} mora/s`);
    assert.ok(c.start >= 0 && c.start < 0.35, `${voice}/${sp.id}/${p.id}: starts at ${c.start}s`);
  });
  // Faster levels really are faster, phrase by phrase.
  for (const voice of Object.keys(RECIPES)) for (const p of PHRASES) {
    const lengths = SPEEDS.map((sp) => AUDIO.clips[voice][sp.id][p.id].speech);
    for (let i = 1; i < lengths.length; i++) assert.ok(lengths[i] < lengths[i - 1], `${voice}/${p.id}: ${lengths}`);
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
