// The pitch graph on the phrase card: the model accent as high/low steps under each
// mora, and the player's voice drawn over it (live while recording, aligned after).

const NS = 'http://www.w3.org/2000/svg';
const COL = 56; // px per mora (SVG units)
const MID = 66; // y of the speaker's median pitch
const ST_PX = 16; // px per semitone: high/low steps sit ±1.5 semitones from the median
const HI_Y = MID - 1.5 * ST_PX;
const LO_Y = MID + 1.5 * ST_PX;
const LABEL_Y = 132;
const HEIGHT = 144;

const el = (name, attrs = {}, text) => {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
};

export function drawGraph(svg, mora) {
  const W = mora.length * COL;
  svg.replaceChildren();
  svg.setAttribute('viewBox', `0 0 ${W} ${HEIGHT}`);
  // Keep long phrases from shrinking into unreadable text.
  svg.style.maxWidth = `${Math.max(W, 220)}px`;
  svg.style.marginInline = 'auto';

  const misses = el('g');
  const model = el('g');
  const you = el('path', { class: 'you', d: '' });
  svg.append(misses, model, you);

  const y = (m) => (m.high ? HI_Y : LO_Y);
  mora.forEach((m, i) => {
    const x0 = i * COL + 9;
    const x1 = (i + 1) * COL - 9;
    if (i > 0 && mora[i - 1].unit === m.unit) {
      model.append(el('line', { class: 'link', x1: x0 - 18, y1: y(mora[i - 1]), x2: x0, y2: y(m) }));
    }
    const cls = m.high ? 'hi' : 'lo';
    model.append(el('line', { class: `step ${cls}`, x1: x0, y1: y(m), x2: x1, y2: y(m) }));
    model.append(el('text', { class: `mora ${cls}`, x: i * COL + COL / 2, y: LABEL_Y }, m.mora));
  });

  return {
    // points: [{ x: 0..1 across the phrase, st: semitones from the median | null }]
    setVoice(points) {
      let d = '';
      let pen = false;
      for (const p of points) {
        if (p.st === null || p.x < 0 || p.x > 1) {
          pen = false;
          continue;
        }
        const yy = Math.max(6, Math.min(LABEL_Y - 24, MID - p.st * ST_PX));
        d += `${pen ? 'L' : 'M'}${(p.x * W).toFixed(1)} ${yy.toFixed(1)}`;
        pen = true;
      }
      you.setAttribute('d', d);
    },
    // Highlight the mora boundaries where a rise or fall was missed.
    markMisses(transitions) {
      misses.replaceChildren();
      for (const tr of transitions) {
        if (tr.score === null || tr.score >= 0.5) continue;
        misses.append(el('rect', { class: 'miss', x: tr.at * COL - COL / 2, y: 4, width: COL, height: LABEL_Y - 16, rx: 12 }));
      }
    },
    clear() {
      you.setAttribute('d', '');
      misses.replaceChildren();
    },
  };
}
