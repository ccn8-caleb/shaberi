// Celebration effects: confetti bursts and floating "+points".

const COLORS = ['#ff4d8d', '#ff9f1c', '#ffc93c', '#14b8a6', '#3a86ff', '#8338ec'];
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let canvas;
let ctx;
let parts = [];
let raf = 0;

function frame() {
  const { width, height } = canvas;
  ctx.clearRect(0, 0, width, height);
  parts = parts.filter((p) => p.y < height + 20 && p.life > 0);
  for (const p of parts) {
    p.vy += 0.25 * p.dpr;
    p.vx *= 0.99;
    p.x += p.vx;
    p.y += p.vy;
    p.rot += p.vr;
    p.life -= 1;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.min(1, p.life / 30);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
    ctx.restore();
  }
  raf = parts.length ? requestAnimationFrame(frame) : 0;
}

// Burst from a point on screen (CSS px); count scales the party.
export function confetti(x = window.innerWidth / 2, y = window.innerHeight / 3, count = 80) {
  if (reduced()) return;
  canvas ||= document.getElementById('fx');
  ctx ||= canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  canvas.width = window.innerWidth * dpr;
  canvas.height = window.innerHeight * dpr;
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const v = (4 + Math.random() * 8) * dpr;
    parts.push({
      x: x * dpr,
      y: y * dpr,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v - 6 * dpr,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.4,
      size: (7 + Math.random() * 7) * dpr,
      color: COLORS[i % COLORS.length],
      life: 90 + Math.random() * 40,
      dpr,
    });
  }
  if (!raf) raf = requestAnimationFrame(frame);
}

export function floatPoints(text, anchor) {
  const r = anchor.getBoundingClientRect();
  const node = document.createElement('div');
  node.className = 'float-points';
  node.textContent = text;
  node.style.left = `${r.left + r.width / 2}px`;
  node.style.top = `${r.top - 10}px`;
  document.body.append(node);
  setTimeout(() => node.remove(), 1100);
}

export function bump(node) {
  node.classList.remove('bump');
  void node.offsetWidth; // restart the animation
  node.classList.add('bump');
}
