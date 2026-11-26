// Mora and Tokyo pitch-accent patterns.
//
// A phrase is a list of accent units: [kana, accent], where accent is the usual
// dictionary number (0 = heiban, 1 = atamadaka, n = the pitch falls after mora n).
// Each unit starts a new accent phrase, so its pitch resets (low again, unless
// it is atamadaka).

const SMALL = new Set([...'ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ']);

// "きょうは" -> ["きょ", "う", "は"]. っ, ん and ー are mora of their own.
export function splitMora(kana) {
  const out = [];
  for (const ch of String(kana || '')) {
    if (/\s/.test(ch)) continue;
    if (SMALL.has(ch) && out.length) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

// High (true) / low (false) for each mora of one accent unit.
export function unitPattern(moraCount, accent) {
  const hl = [];
  for (let i = 1; i <= moraCount; i++) {
    if (accent === 1) hl.push(i === 1);
    else if (accent === 0) hl.push(i > 1);
    else hl.push(i > 1 && i <= accent);
  }
  return hl;
}

// [{ mora, high, unit }] for a whole phrase.
export function phraseMora(units) {
  const out = [];
  units.forEach(([kana, accent], unit) => {
    const mora = splitMora(kana);
    unitPattern(mora.length, accent).forEach((high, i) => out.push({ mora: mora[i], high, unit }));
  });
  return out;
}

// Runs of consecutive mora on the same level: [{ start, end (exclusive), high }].
// A unit boundary always starts a new run, even when the level doesn't change.
export function levelRuns(mora) {
  const runs = [];
  mora.forEach((m, i) => {
    const last = runs[runs.length - 1];
    if (last && last.high === m.high && mora[i - 1].unit === m.unit) last.end = i + 1;
    else runs.push({ start: i, end: i + 1, high: m.high });
  });
  return runs;
}
