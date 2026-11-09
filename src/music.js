/*
 * Procedural music (no audio files): a tiny lookahead step sequencer driving
 * synthesized instruments through WebAudio.
 *
 *  - "title": dark, slow D-minor pads in a big reverb, a heartbeat kick, a low
 *    drone and sparse bells.
 *  - "game":  an angsty E-minor groove whose layers follow the chaos on screen:
 *    bass + hats when calm, drums when you start hitting things, a lead riff
 *    and crashes in full carnage or when the mannequin panics.
 *
 * Slow-mo muffles the mix. The 🎵 button toggles it (remembered).
 */

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const _ = null;

const TRACKS = {
  title: {
    bpm: 68,
    reverb: 0.55,
    bars: 4,
    chords: [
      [50, 53, 57, 62], // Dm
      [46, 53, 58, 62], // Bb
      [43, 50, 55, 58], // Gm
      [45, 52, 57, 61], // A
    ],
    bells: [
      { 8: 69 },
      { 4: 77, 12: 74 },
      { 8: 67, 14: 70 },
      { 0: 76, 6: 73 },
    ],
    drone: [26, 26, 31, 33],
    schedule(m, bar, step, t, sd) {
      const chord = this.chords[bar];
      if (step === 0) {
        m.pad(t, chord.map(mtof), sd * 16 * 1.02, 0.075);
        m.bass(t, mtof(this.drone[bar]), sd * 16, 0.17, 220, 'sine');
      }
      // Heartbeat: lub-dub.
      if (step === 0) m.kick(t, 0.5, 70);
      if (step === 3) m.kick(t, 0.32, 70);
      const bell = this.bells[bar][step];
      if (bell) m.bell(t, mtof(bell), 2.6, 0.1);
      if (step === 10 && bar === 3) m.bell(t, mtof(81), 3, 0.035);
    },
  },

  game: {
    bpm: 118,
    reverb: 0.14,
    bars: 4,
    roots: [40, 36, 43, 38], // Em C G D
    lead: [
      [64, _, 67, _, 69, _, 67, 64, _, _, 62, _, 64, _, _, _],
      [64, _, 67, _, 69, _, 71, 69, _, _, 67, _, 64, _, _, _],
      [67, _, 71, _, 74, _, 71, 67, _, _, 69, _, 71, _, _, _],
      [74, _, 72, _, 71, _, 69, 67, _, _, 66, _, 62, _, 64, _],
    ],
    schedule(m, bar, step, t, sd, I) {
      const root = this.roots[bar];
      // Bass: driving eighths with octave pops; brighter as intensity rises.
      if (step % 2 === 0) {
        const n = step === 6 || step === 14 ? root + 12 : root;
        m.bass(t, mtof(n), sd * 1.6, 0.16, 300 + I * 1500, 'sawtooth');
      }
      // Hats: eighths, sixteenths when it gets wild.
      if (step % 2 === 0 || I > 0.55) m.hat(t, (step % 4 === 2 ? 0.05 : 0.03) * (0.6 + I * 0.6));
      if (step === 14 && I > 0.3) m.hat(t, 0.05, true);
      // Drums come in once things get going.
      if (step === 0 || (I > 0.25 && step === 8) || (I > 0.55 && (step === 10 || step === 3))) m.kick(t, 0.75, 52);
      if (I > 0.25 && (step === 4 || step === 12)) m.snare(t, 0.32);
      if (I > 0.6 && bar === 3 && step >= 13) m.snare(t, 0.16 + (step - 13) * 0.06); // fill
      // Power-chord stabs.
      if (I > 0.15 && (step === 0 || step === 10)) {
        m.pluck(t, mtof(root + 12), sd * 3, 0.045 + I * 0.03, 'sawtooth', 900 + I * 1800);
        m.pluck(t, mtof(root + 19), sd * 3, 0.035 + I * 0.025, 'sawtooth', 900 + I * 1800);
      }
      // Lead riff in full chaos.
      if (I > 0.6) {
        const n = this.lead[bar][step];
        if (n) m.pluck(t, mtof(n), sd * 1.8, 0.05 * Math.min(1, (I - 0.6) * 4), 'square', 2600);
        if (bar === 0 && step === 0) m.crash(t, 0.12);
      }
    },
  },
};

export class Music {
  constructor(game) {
    this.game = game;
    game.music = this;
    let saved = null;
    try {
      saved = localStorage.getItem('ai-music');
    } catch {
      /* storage unavailable */
    }
    this.enabled = saved !== 'off';
    this.track = null;
    this.buses = {};
    this.intensity = 0.15;
    this.chaos = 0;
    this.lastStats = { severed: 0, booms: 0 };
    this.timer = null;
    document.addEventListener('visibilitychange', () => {
      const ctx = this.ctx;
      if (!ctx) return;
      if (document.hidden && ctx.state === 'running') {
        this.pausedByHide = true;
        ctx.suspend();
      } else if (!document.hidden && this.pausedByHide) {
        this.pausedByHide = false;
        ctx.resume();
      }
    });
  }

  get ctx() {
    return this.game.sfx.ctx;
  }

  /** Create the audio graph (the context may still be suspended until a user gesture). */
  ensure() {
    const sfx = this.game.sfx;
    if (!sfx.ctx) sfx.unlock();
    const ctx = this.ctx;
    if (!ctx || this.out) return !!ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.enabled ? 0.32 : 0;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 18000;
    this.out.connect(this.tone).connect(ctx.destination);
    // Reverb: generated impulse response.
    const len = ctx.sampleRate * 2.6;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = ir;
    this.reverb.connect(this.out);
    return true;
  }

  setEnabled(on) {
    this.enabled = on;
    try {
      localStorage.setItem('ai-music', on ? 'on' : 'off');
    } catch {
      /* storage unavailable */
    }
    if (on) this.game.sfx.unlock();
    if (this.out) {
      const t = this.ctx.currentTime;
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setTargetAtTime(on ? 0.32 : 0, t, 0.15);
    }
  }

  /** Switch tracks with a crossfade. */
  play(name) {
    if (!this.ensure() || this.track === name) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (const [n, bus] of Object.entries(this.buses)) {
      if (n === name) continue;
      bus.gain.gain.cancelScheduledValues(t);
      bus.gain.gain.setTargetAtTime(0, t, 0.4);
    }
    let bus = this.buses[name];
    if (!bus) {
      bus = this.buses[name] = { gain: ctx.createGain(), send: ctx.createGain() };
      bus.gain.gain.value = 0;
      bus.gain.connect(this.out);
      bus.gain.connect(bus.send);
      bus.send.gain.value = TRACKS[name].reverb;
      bus.send.connect(this.reverb);
    }
    bus.gain.gain.cancelScheduledValues(t);
    bus.gain.gain.setTargetAtTime(1, t, 0.3);
    this.track = name;
    this.step = 0;
    this.nextTime = t + 0.08;
    if (!this.timer) this.timer = setInterval(() => this.pump(), 25);
  }

  /** Lookahead scheduler. */
  pump() {
    const ctx = this.ctx;
    if (!ctx || !this.track) return;
    if (ctx.state !== 'running') {
      this.nextTime = ctx.currentTime + 0.06;
      return;
    }
    const tr = TRACKS[this.track];
    const sd = 60 / tr.bpm / 4; // sixteenth
    const bus = this.buses[this.track].gain;
    const m = this.instruments(bus);
    if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.02; // after a stall
    while (this.nextTime < ctx.currentTime + 0.12) {
      const bar = Math.floor(this.step / 16) % tr.bars;
      if (this.enabled) tr.schedule(m, bar, this.step % 16, this.nextTime, sd, this.intensity);
      this.nextTime += sd;
      this.step++;
    }
  }

  /** Called every frame: track the chaos and the slow-mo filter. */
  update(dt) {
    const game = this.game;
    const s = game.stats;
    this.chaos += (s.severed - this.lastStats.severed) * 0.22 + (s.booms - this.lastStats.booms) * 0.35;
    this.lastStats = { severed: s.severed, booms: s.booms };
    this.chaos = Math.min(1.2, Math.max(0, this.chaos - dt * 0.07));
    const life = game.life;
    const target = Math.min(1, Math.max(0.15, this.chaos, (life?.fear || 0) * 0.65, (life?.anxiety || 0) * 0.4));
    const rate = target > this.intensity ? 1.5 : 0.12;
    this.intensity += (target - this.intensity) * Math.min(1, dt * rate);
    if (this.tone) {
      const want = game.timeScale < 1 ? 650 : 18000;
      const t = this.ctx.currentTime;
      if (want !== this.toneWant) {
        this.toneWant = want;
        this.tone.frequency.cancelScheduledValues(t);
        this.tone.frequency.setTargetAtTime(want, t, 0.2);
      }
    }
  }

  /** Bump the chaos meter directly (used by tools that don't sever or explode). */
  bump(x) {
    this.chaos = Math.min(1.2, this.chaos + x);
  }

  /* ------------------------------ instruments ------------------------------ */

  instruments(dest) {
    const ctx = this.ctx;
    const noise = this.game.sfx.noiseBuf;
    const env = (g, t, a, peak, d) => {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + a);
      g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    };
    const osc = (type, f, t, end) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.setValueAtTime(f, t);
      o.start(t);
      o.stop(end);
      return o;
    };
    const noiseSrc = (t, end) => {
      const n = ctx.createBufferSource();
      n.buffer = noise;
      n.start(t, Math.random() * 0.5);
      n.stop(end);
      return n;
    };
    return {
      kick(t, vol, f0 = 55) {
        const o = osc('sine', f0 * 2.6, t, t + 0.5);
        o.frequency.exponentialRampToValueAtTime(f0, t + 0.12);
        const g = ctx.createGain();
        env(g, t, 0.004, vol, 0.38);
        o.connect(g).connect(dest);
      },
      snare(t, vol) {
        const n = noiseSrc(t, t + 0.25);
        const f = ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 2200;
        f.Q.value = 0.8;
        const g = ctx.createGain();
        env(g, t, 0.002, vol, 0.18);
        n.connect(f).connect(g).connect(dest);
        const o = osc('triangle', 190, t, t + 0.15);
        const g2 = ctx.createGain();
        env(g2, t, 0.002, vol * 0.5, 0.08);
        o.connect(g2).connect(dest);
      },
      hat(t, vol, open = false) {
        const d = open ? 0.25 : 0.045;
        const n = noiseSrc(t, t + d + 0.05);
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 7500;
        const g = ctx.createGain();
        env(g, t, 0.001, vol, d);
        n.connect(f).connect(g).connect(dest);
      },
      crash(t, vol) {
        const n = noiseSrc(t, t + 1.8);
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 4000;
        const g = ctx.createGain();
        env(g, t, 0.003, vol, 1.6);
        n.connect(f).connect(g).connect(dest);
      },
      bass(t, f, dur, vol, cutoff, type = 'sawtooth') {
        const o = osc(type, f, t, t + dur + 0.1);
        const o2 = osc('square', f / 2, t, t + dur + 0.1);
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(cutoff * 2.2, t);
        flt.frequency.exponentialRampToValueAtTime(Math.max(60, cutoff * 0.6), t + dur);
        flt.Q.value = 4;
        const g = ctx.createGain();
        env(g, t, 0.006, vol, dur);
        const g2 = ctx.createGain();
        g2.gain.value = 0.35;
        o.connect(flt);
        o2.connect(g2).connect(flt);
        flt.connect(g).connect(dest);
      },
      pluck(t, f, dur, vol, type, cutoff) {
        const o = osc(type, f, t, t + dur + 0.1);
        const o2 = osc(type, f * 1.006, t, t + dur + 0.1);
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(cutoff, t);
        flt.frequency.exponentialRampToValueAtTime(Math.max(200, cutoff * 0.25), t + dur);
        const g = ctx.createGain();
        env(g, t, 0.004, vol, dur);
        o.connect(flt);
        o2.connect(flt);
        flt.connect(g).connect(dest);
      },
      pad(t, freqs, dur, vol) {
        const flt = ctx.createBiquadFilter();
        flt.type = 'lowpass';
        flt.frequency.setValueAtTime(500, t);
        flt.frequency.linearRampToValueAtTime(1100, t + dur * 0.5);
        flt.frequency.linearRampToValueAtTime(500, t + dur);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.35);
        g.gain.setValueAtTime(vol, t + dur * 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 1.1);
        for (const f of freqs) {
          for (const det of [-7, 7]) {
            const o = osc('sawtooth', f, t, t + dur * 1.15);
            o.detune.value = det;
            o.connect(flt);
          }
        }
        flt.connect(g).connect(dest);
      },
      bell(t, f, dur, vol) {
        // Simple FM bell.
        const car = osc('sine', f, t, t + dur);
        const mod = osc('sine', f * 3.5, t, t + dur);
        const mg = ctx.createGain();
        mg.gain.setValueAtTime(f * 1.4, t);
        mg.gain.exponentialRampToValueAtTime(1, t + dur * 0.6);
        mod.connect(mg).connect(car.frequency);
        const g = ctx.createGain();
        env(g, t, 0.003, vol, dur);
        car.connect(g).connect(dest);
      },
    };
  }
}
