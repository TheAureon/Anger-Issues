// Procedural soundtrack: a looping D-minor march synthesised live with WebAudio (no audio files).
// Three moods: 0 = menu (pads + bass), 1 = battle (adds drums, arpeggio, melody),
// 2 = danger (your king is threatened: faster hats, snare rolls, a low pulse).

const BPM = 100;
const STEP = 60 / BPM / 4; // one 16th note
const LOOKAHEAD = 0.12;

const midi = (n) => 440 * 2 ** ((n - 69) / 12);

// i – VI – III – VII in D minor: Dm, Bb, F, C. Each chord lasts one bar.
const CHORDS = [
  { root: 38, notes: [62, 65, 69] },
  { root: 34, notes: [58, 62, 65] },
  { root: 41, notes: [60, 65, 69] },
  { root: 36, notes: [60, 64, 67] },
];
// Melody over 4 bars, as [step within the 4 bars, midi note, length in steps].
const MELODY = [
  [0, 74, 3], [4, 72, 2], [6, 74, 2], [8, 77, 4], [12, 76, 2], [14, 74, 2],
  [16, 74, 3], [20, 70, 2], [22, 72, 2], [24, 74, 6], [30, 72, 2],
  [32, 72, 3], [36, 69, 2], [38, 72, 2], [40, 77, 4], [44, 76, 2], [46, 77, 2],
  [48, 79, 4], [52, 76, 4], [56, 72, 6], [62, 74, 2],
];
const MELODY_B = [
  [0, 69, 4], [6, 70, 2], [8, 69, 4], [14, 65, 2], [16, 70, 6], [24, 69, 4], [28, 65, 4],
  [32, 69, 4], [38, 72, 2], [40, 69, 4], [46, 67, 2], [48, 67, 8], [56, 64, 4], [60, 62, 4],
];
const BASS = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0]; // 16th pattern
const ARP = [0, 1, 2, 1, 0, 1, 2, 3, 0, 1, 2, 1, 2, 3, 2, 1];

export class Music {
  constructor() {
    this.ctx = null;
    this.mood = 0;
    this.enabled = true;
    this.volume = 1;
    this.step = 0;
    this.next = 0;
    this.timer = null;
  }

  // Called once the shared AudioContext exists (after a user gesture).
  attach(ctx, destination, noiseBuf) {
    if (this.ctx) return;
    this.ctx = ctx;
    this.noiseBuf = noiseBuf;
    this.bus = ctx.createGain();
    this.bus.gain.value = this.level();
    // Gentle echo for space.
    const delay = ctx.createDelay(1);
    delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.25;
    const wet = ctx.createGain();
    wet.gain.value = 0.22;
    this.fx = ctx.createGain();
    this.fx.connect(delay).connect(fb).connect(delay);
    delay.connect(wet).connect(this.bus);
    this.bus.connect(destination);
    this.next = ctx.currentTime + 0.1;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  level() {
    return this.enabled ? 0.3 * this.volume : 0;
  }

  setEnabled(on) {
    this.enabled = on;
    if (this.bus) this.bus.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.2);
  }

  setVolume(v) {
    this.volume = v;
    if (this.bus) this.bus.gain.setTargetAtTime(this.level(), this.ctx.currentTime, 0.05);
  }

  setMood(m) {
    this.mood = m;
  }

  schedule() {
    const ctx = this.ctx;
    if (ctx.state !== 'running' || !this.enabled) {
      this.next = ctx.currentTime + 0.05;
      return;
    }
    while (this.next < ctx.currentTime + LOOKAHEAD) {
      this.playStep(this.step, this.next);
      this.step = (this.step + 1) % 128; // 8 bars: melody A then melody B
      this.next += STEP;
    }
  }

  playStep(step, t) {
    const s16 = step % 16;
    const bar = Math.floor(step / 16) % 4;
    const chord = CHORDS[bar];
    const mood = this.mood;

    if (s16 === 0) this.pad(chord.notes, t, STEP * 16);
    if (BASS[s16]) this.bass(midi(chord.root + (s16 === 14 ? 12 : 0)), t, STEP * 1.6, mood ? 0.5 : 0.35);

    if (mood >= 1) {
      if (s16 % 2 === 0) {
        const n = chord.notes[ARP[s16] % 3] + (ARP[s16] === 3 ? 12 : 0) + 12;
        this.pluck(midi(n), t, mood === 2 ? 0.07 : 0.05);
      }
      const mel = step < 64 ? MELODY : MELODY_B;
      const local = step % 64;
      for (const [at, note, len] of mel) if (at === local) this.lead(midi(note), t, STEP * len);

      if (s16 === 0 || s16 === 8 || (s16 === 10 && bar === 3)) this.kick(t);
      if (s16 === 4 || s16 === 12) this.snare(t, 0.35);
      if (s16 % 2 === 0 || mood === 2) this.hat(t, s16 % 4 === 2 ? 0.12 : 0.06);
    }
    if (mood === 2) {
      if (s16 >= 12 && bar === 3) this.snare(t, 0.12 + (s16 - 12) * 0.05);
      if (s16 % 4 === 0) this.bass(midi(chord.root - 12), t, STEP * 3, 0.4);
    }
  }

  env(t, attack, dur, peak) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  osc(type, freq, t, dur, out, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  pad(notes, t, dur) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = this.mood === 2 ? 1300 : 800;
    const g = this.env(t, 0.6, dur, 0.07);
    f.connect(g).connect(this.bus);
    for (const n of notes) {
      this.osc('sawtooth', midi(n - 12), t, dur, f, -7);
      this.osc('sawtooth', midi(n - 12), t, dur, f, 7);
    }
  }

  bass(freq, t, dur, peak) {
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(900, t);
    f.frequency.exponentialRampToValueAtTime(180, t + dur);
    const g = this.env(t, 0.01, dur, peak);
    f.connect(g).connect(this.bus);
    this.osc('sawtooth', freq, t, dur, f);
    this.osc('triangle', freq / 2, t, dur, g);
  }

  pluck(freq, t, peak) {
    const g = this.env(t, 0.005, STEP * 1.8, peak);
    g.connect(this.bus);
    g.connect(this.fx);
    this.osc('square', freq, t, STEP * 1.8, g);
  }

  lead(freq, t, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.03);
    g.gain.setValueAtTime(0.09, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(this.bus);
    g.connect(this.fx);
    // Slight vibrato.
    const o = this.ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = freq;
    const lfo = this.ctx.createOscillator();
    lfo.frequency.value = 5.5;
    const depth = this.ctx.createGain();
    depth.gain.value = freq * 0.006;
    lfo.connect(depth).connect(o.frequency);
    o.connect(g);
    o.start(t);
    lfo.start(t);
    o.stop(t + dur + 0.05);
    lfo.stop(t + dur + 0.05);
  }

  kick(t) {
    const o = this.ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    const g = this.env(t, 0.002, 0.25, 0.7);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.3);
  }

  noise(t, dur, type, freq, peak) {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = this.env(t, 0.002, dur, peak);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  snare(t, peak) {
    this.noise(t, 0.16, 'bandpass', 1800, peak);
    const body = this.env(t, 0.002, 0.08, peak * 0.6);
    body.connect(this.bus);
    this.osc('triangle', 190, t, 0.08, body);
  }

  hat(t, peak) {
    this.noise(t, 0.04, 'highpass', 7000, peak);
  }
}
