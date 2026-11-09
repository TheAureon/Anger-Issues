// Synthesised sounds (no audio files): gunshots per weapon, shatters, ricochets, moves.
let ctx = null;
let master = null;
let noiseBuf = null;
export let muted = false;

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}
export function unlock() {
  ensure();
}
export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.55;
}

function noise(t, dur, { freq = 1200, q = 0.7, type = 'lowpass', gain = 1, attack = 0.002 } = {}) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
  return f;
}
function tone(t, dur, f0, f1, { type = 'sine', gain = 0.5 } = {}) {
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const GUN = {
  p: { freq: 2600, dur: 0.16, thump: 140, gain: 0.8 },
  k: { freq: 1800, dur: 0.3, thump: 110, gain: 1 },
  n: { freq: 2200, dur: 0.22, thump: 120, gain: 0.9 },
  b: { freq: 3000, dur: 0.32, thump: 100, gain: 0.9 },
  r: { freq: 1500, dur: 0.55, thump: 70, gain: 1.1 },
  q: { freq: 2000, dur: 0.4, thump: 85, gain: 1.05 },
};
export function gunshot(type) {
  if (!ensure() || muted) return;
  const t = ctx.currentTime;
  const s = GUN[type] || GUN.p;
  noise(t, s.dur, { freq: s.freq, gain: s.gain });
  noise(t, s.dur * 2.2, { freq: 500, gain: 0.35 });
  tone(t, 0.18, s.thump, 35, { gain: 0.9 });
}
export function shatter() {
  if (!ensure() || muted) return;
  const t = ctx.currentTime;
  noise(t, 0.35, { freq: 3500, type: 'bandpass', q: 1.2, gain: 0.9 });
  for (let i = 0; i < 6; i++) tone(t + i * 0.035 + Math.random() * 0.02, 0.08, 1800 + Math.random() * 2400, 900, { type: 'triangle', gain: 0.18 });
  tone(t, 0.3, 160, 50, { gain: 0.6 });
}
export function ricochet() {
  if (!ensure() || muted) return;
  const t = ctx.currentTime;
  tone(t, 0.45, 3200, 1100, { type: 'sine', gain: 0.25 });
  noise(t, 0.06, { freq: 5000, type: 'highpass', gain: 0.5 });
}
export function thud() {
  if (!ensure() || muted) return;
  const t = ctx.currentTime;
  noise(t, 0.12, { freq: 700, gain: 0.5 });
}
export function move() {
  if (!ensure() || muted) return;
  const t = ctx.currentTime;
  tone(t, 0.09, 520, 300, { type: 'triangle', gain: 0.35 });
  noise(t, 0.05, { freq: 1500, gain: 0.3 });
}
export function step() {
  if (!ensure() || muted) return;
  tone(ctx.currentTime, 0.06, 300, 200, { type: 'triangle', gain: 0.25 });
}
export function check() {
  if (!ensure() || muted) return;
  const t = ctx.currentTime;
  tone(t, 0.18, 880, 870, { type: 'square', gain: 0.12 });
  tone(t + 0.2, 0.25, 660, 650, { type: 'square', gain: 0.12 });
}
export function click() {
  if (!ensure() || muted) return;
  tone(ctx.currentTime, 0.04, 1400, 1200, { type: 'square', gain: 0.06 });
}
export function fanfare(win) {
  if (!ensure() || muted) return;
  const t = ctx.currentTime;
  const notes = win ? [523, 659, 784, 1046] : [392, 349, 311, 262];
  notes.forEach((f, i) => tone(t + i * 0.16, 0.3, f, f, { type: 'triangle', gain: 0.25 }));
}
