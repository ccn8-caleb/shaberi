// On-device word check (module Web Worker). Whisper (tiny, quantised, ~42 MB, from
// Hugging Face) via transformers.js. Nothing you say leaves the device.
//
// We know what you were meant to say, so instead of transcribing freely we ask: how
// close is the expected phrase to what the model would most expect to hear? For each
// token of the expected text, how far its score falls below the model's favourite at
// that point, averaged. 0 = exactly what it expected; a different phrase is far below.
// (Tested on the 40 model recordings: right phrases ≥ −1.5, wrong ones ≤ −1.85.)

import { AutoProcessor, AutoTokenizer, WhisperForConditionalGeneration, Tensor, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2/dist/transformers.min.js';

const MODEL = 'onnx-community/whisper-tiny';
env.allowLocalModels = false;

let ready = null;
let processor, tokenizer, model, prefix, eot;

function load() {
  ready ||= (async () => {
    const progress_callback = (p) => {
      if (p.status === 'progress' && p.total) postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
    };
    processor = await AutoProcessor.from_pretrained(MODEL, { progress_callback });
    tokenizer = await AutoTokenizer.from_pretrained(MODEL, { progress_callback });
    model = await WhisperForConditionalGeneration.from_pretrained(MODEL, { dtype: 'q8', progress_callback });
    prefix = tokenizer.convert_tokens_to_ids(['<|startoftranscript|>', '<|ja|>', '<|transcribe|>', '<|notimestamps|>']);
    eot = tokenizer.convert_tokens_to_ids(['<|endoftext|>'])[0];
  })();
  return ready;
}

async function closeness(features, text) {
  const ids = tokenizer.encode(text, { add_special_tokens: false });
  const seq = [...prefix, ...ids];
  const input = new Tensor('int64', BigInt64Array.from(seq.map(BigInt)), [1, seq.length]);
  const { logits } = await model({ input_features: features, decoder_input_ids: input });
  const V = logits.dims[2];
  const targets = [...ids, eot];
  let deficit = 0;
  for (let k = 0; k < targets.length; k++) {
    const pos = prefix.length - 1 + k;
    const row = logits.data.subarray(pos * V, (pos + 1) * V);
    let max = -Infinity;
    for (const v of row) if (v > max) max = v;
    deficit += max - row[targets[k]];
  }
  return -deficit / targets.length;
}

onmessage = async (e) => {
  const { type, id } = e.data;
  try {
    if (type === 'load') {
      await load();
      postMessage({ type: 'ready', id });
    } else if (type === 'check') {
      await load();
      const { input_features } = await processor(e.data.audio);
      let best = -Infinity;
      for (const text of e.data.forms) best = Math.max(best, await closeness(input_features, text));
      postMessage({ type: 'result', id, closeness: best });
    }
  } catch (err) {
    postMessage({ type: 'error', id, message: String(err?.message || err) });
  }
};
