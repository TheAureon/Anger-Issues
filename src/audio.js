/**
 * Tiny WebAudio synth: every sound is generated, so there are no audio files.
 */
export class Sfx {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.last = {};
    this.loops = new Set();
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.55;
      const comp = this.ctx.createDynamicsCompressor();
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.master) this.master.gain.value = on ? 0.55 : 0;
  }

  ok(name, gap = 0.04) {
    if (!this.ctx || !this.enabled) return false;
    const now = this.ctx.currentTime;
    if (this.last[name] && now - this.last[name] < gap) return false;
    this.last[name] = now;
    return true;
  }

  env(g, t, attack, dur, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  }

  noise({ dur = 0.2, freq = 1000, to = null, q = 1, type = 'lowpass', gain = 0.5, attack = 0.003, rate = 1 }) {
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rate;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur);
    f.Q.value = q;
    const g = c.createGain();
    this.env(g, t, attack, dur, gain);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + dur + 0.05);
  }

  tone({ freq = 440, to = null, dur = 0.2, type = 'sine', gain = 0.3, attack = 0.005 }) {
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + attack + dur);
    const g = c.createGain();
    this.env(g, t, attack, dur, gain);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + attack + dur + 0.05);
  }

  thud(i = 0.5) {
    if (!this.ok('thud', 0.06)) return;
    this.tone({ freq: 140 + Math.random() * 40, to: 50, dur: 0.18, gain: 0.25 + i * 0.5 });
    this.noise({ dur: 0.08, freq: 900, gain: 0.15 + i * 0.3 });
  }
  knock() {
    if (!this.ok('knock', 0.05)) return;
    this.tone({ freq: 380 + Math.random() * 120, to: 200, dur: 0.07, type: 'triangle', gain: 0.35 });
    this.noise({ dur: 0.05, freq: 2500, type: 'bandpass', q: 2, gain: 0.25 });
  }
  crack() {
    if (!this.ok('crack', 0.03)) return;
    this.noise({ dur: 0.12, freq: 3000, to: 600, type: 'bandpass', q: 1.5, gain: 0.7 });
    this.tone({ freq: 700 + Math.random() * 300, to: 150, dur: 0.08, type: 'square', gain: 0.12 });
  }
  slice() {
    if (!this.ok('slice', 0.05)) return;
    this.noise({ dur: 0.18, freq: 6000, to: 1500, type: 'highpass', gain: 0.4 });
  }
  whoosh() {
    if (!this.ok('whoosh', 0.08)) return;
    this.noise({ dur: 0.22, freq: 400, to: 2500, type: 'bandpass', q: 0.8, gain: 0.35, attack: 0.05 });
  }
  boom(size = 1) {
    if (!this.ok('boom', 0.05)) return;
    this.noise({ dur: 0.5 + size * 0.6, freq: 1200, to: 60, gain: 0.9, rate: 0.6 });
    this.tone({ freq: 90, to: 30, dur: 0.5 + size * 0.3, gain: 0.7 });
  }
  pop() {
    if (!this.ok('pop', 0.02)) return;
    this.noise({ dur: 0.07, freq: 2500, to: 400, gain: 0.55 });
  }
  clank() {
    if (!this.ok('clank', 0.06)) return;
    this.tone({ freq: 880, to: 600, dur: 0.25, type: 'triangle', gain: 0.25 });
    this.tone({ freq: 1320, to: 1000, dur: 0.15, type: 'sine', gain: 0.15 });
  }
  twang() {
    if (!this.ok('twang', 0.05)) return;
    this.tone({ freq: 220, to: 120, dur: 0.25, type: 'sawtooth', gain: 0.2 });
  }
  boing() {
    if (!this.ok('boing', 0.12)) return;
    this.tone({ freq: 160, to: 520, dur: 0.3, type: 'sine', gain: 0.35 });
  }
  click() {
    if (!this.ok('click', 0.03)) return;
    this.tone({ freq: 1200, dur: 0.03, type: 'square', gain: 0.08 });
  }
  whistle() {
    if (!this.ok('whistle', 0.2)) return;
    this.tone({ freq: 1800, to: 500, dur: 0.9, type: 'sine', gain: 0.1, attack: 0.05 });
  }
  hiss() {
    if (!this.ok('hiss', 0.1)) return;
    this.noise({ dur: 0.4, freq: 5000, type: 'highpass', gain: 0.18, attack: 0.02 });
  }

  /** Continuous sound: kind = buzz | grind | rocket | wind. Returns { stop() }. */
  loop(kind) {
    if (!this.ctx || !this.enabled) return { stop() {} };
    const c = this.ctx;
    const t = c.currentTime;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(kind === 'wind' ? 0.35 : 0.22, t + 0.08);
    g.connect(this.master);
    const nodes = [];
    if (kind === 'buzz' || kind === 'grind') {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = kind === 'buzz' ? 95 : 60;
      const lfo = c.createOscillator();
      lfo.frequency.value = kind === 'buzz' ? 22 : 9;
      const lg = c.createGain();
      lg.gain.value = 18;
      lfo.connect(lg).connect(o.frequency);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1400;
      o.connect(f).connect(g);
      o.start();
      lfo.start();
      nodes.push(o, lfo);
    }
    if (kind !== 'buzz') {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = kind === 'wind' ? 'bandpass' : 'lowpass';
      f.frequency.value = kind === 'rocket' ? 900 : kind === 'wind' ? 500 : 2000;
      f.Q.value = kind === 'wind' ? 0.7 : 1;
      src.connect(f).connect(g);
      src.start();
      nodes.push(src);
    }
    const handle = {
      stop: () => {
        if (handle.stopped) return;
        handle.stopped = true;
        const n = c.currentTime;
        g.gain.cancelScheduledValues(n);
        g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), n);
        g.gain.exponentialRampToValueAtTime(0.0001, n + 0.15);
        for (const x of nodes) x.stop(n + 0.2);
        this.loops.delete(handle);
      },
    };
    this.loops.add(handle);
    return handle;
  }

  stopAll() {
    for (const l of [...this.loops]) l.stop();
  }
}
