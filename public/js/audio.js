// Sound. Plays /sfx/<name>.mp3 when the file exists, otherwise a small synthesized stand-in.
// Everything is quiet by default; the page asks for one click before any sound (browser rule).

const FILES = ['whip', 'chisel', 'place', 'thud', 'magic', 'hiss', 'frogs', 'thunder', 'horn', 'boom', 'sand', 'cheer', 'decree', 'fizzle', 'dark', 'locusts', 'capstone', 'stretch', 'gulp', 'gather', 'sink', 'stone'];

export class Sound {
  constructor() {
    this.ctx = null; this.on = false; this.buffers = new Map(); this.vol = 0.55; this.last = new Map();
  }

  async enable() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination);
      this.noiseBuf = this.makeNoise();
      this.loadFiles();
    }
    await this.ctx.resume();
    this.on = true;
  }

  disable() { this.on = false; }

  async loadFiles() {
    for (const name of FILES) {
      try {
        const res = await fetch(`sfx/${name}.mp3`);
        if (!res.ok) continue;
        const buf = await this.ctx.decodeAudioData(await res.arrayBuffer());
        this.buffers.set(name, buf);
      } catch { /* synth stand-in */ }
    }
  }

  makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  // name, { x: world x for stereo position, gain }
  play(name, opts = {}) {
    if (!this.on || !this.ctx) return;
    const now = this.ctx.currentTime;
    const minGap = { chisel: 0.12, place: 0.08, thud: 0.1, whip: 0.1 }[name] || 0.05;
    if ((this.last.get(name) || 0) + minGap > now) return;
    this.last.set(name, now);
    const out = this.ctx.createStereoPanner();
    out.pan.value = opts.x != null ? Math.max(-0.8, Math.min(0.8, (opts.x / 640) * 1.6 - 0.8)) : 0;
    const g = this.ctx.createGain();
    g.gain.value = (opts.gain || 1) * (LEVEL[name] || 0.7);
    g.connect(out); out.connect(this.master);
    const buf = this.buffers.get(name);
    if (buf) {
      const s = this.ctx.createBufferSource(); s.buffer = buf;
      s.playbackRate.value = name === 'chisel' || name === 'place' ? 0.92 + Math.random() * 0.16 : 1;
      s.connect(g); s.start(now);
      return;
    }
    const fn = SYNTH[name];
    if (fn) fn(this, g, now);
  }

  // helpers for the synth recipes
  osc(type, f0, f1, t0, dur, dest, vol = 0.5) {
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest); o.start(t0); o.stop(t0 + dur + 0.02);
    return o;
  }
  noise(t0, dur, dest, { type = 'bandpass', f = 1000, q = 1, vol = 0.5, f1, attack = 0.005 } = {}) {
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, t0); flt.Q.value = q;
    if (f1) flt.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(flt); flt.connect(g); g.connect(dest);
    s.start(t0, Math.random()); s.stop(t0 + dur + 0.05);
  }
}

const LEVEL = { whip: 0.9, chisel: 0.25, place: 0.5, thud: 0.45, magic: 0.45, hiss: 0.35, frogs: 0.5, thunder: 0.8, horn: 0.6, boom: 0.9, sand: 0.4, cheer: 0.5, decree: 0.5, fizzle: 0.4, dark: 0.6, locusts: 0.45, capstone: 0.6, stretch: 0.5, gulp: 0.5, gather: 0.5, sink: 0.5, stone: 0.6 };

const SYNTH = {
  whip(a, d, t) {
    a.noise(t, 0.18, d, { type: 'lowpass', f: 600, f1: 2400, vol: 0.12, attack: 0.15 });
    a.noise(t + 0.17, 0.09, d, { type: 'highpass', f: 2200, vol: 1, attack: 0.002 });
    a.osc('square', 3400, 300, t + 0.17, 0.05, d, 0.3);
  },
  chisel(a, d, t) { a.osc('sine', 2600, 2500, t, 0.08, d, 0.4); a.osc('sine', 3900, 3800, t, 0.05, d, 0.2); a.noise(t, 0.03, d, { type: 'highpass', f: 3000, vol: 0.3 }); },
  place(a, d, t) { a.osc('sine', 120, 55, t, 0.18, d, 0.8); a.noise(t, 0.12, d, { type: 'lowpass', f: 500, vol: 0.5 }); },
  thud(a, d, t) { a.osc('sine', 90, 45, t, 0.25, d, 0.8); a.noise(t, 0.2, d, { type: 'lowpass', f: 300, vol: 0.6 }); },
  stone(a, d, t) { a.osc('sine', 70, 40, t, 0.4, d, 0.9); a.noise(t, 0.05, d, { type: 'highpass', f: 1500, vol: 0.4 }); },
  magic(a, d, t) { [1046, 1318, 1568, 2093, 2637, 3136].forEach((f, i) => a.osc('sine', f, f, t + i * 0.05, 0.5, d, 0.18)); a.noise(t, 0.6, d, { type: 'highpass', f: 6000, vol: 0.06, attack: 0.2 }); },
  hiss(a, d, t) { a.noise(t, 0.9, d, { type: 'bandpass', f: 6500, q: 3, vol: 0.4, attack: 0.1 }); },
  frogs(a, d, t) { for (let i = 0; i < 5; i++) { a.osc('square', 190, 120, t + i * 0.13, 0.08, d, 0.2); a.osc('square', 170, 110, t + i * 0.13 + 0.05, 0.06, d, 0.15); } },
  thunder(a, d, t) { a.noise(t, 2.2, d, { type: 'lowpass', f: 900, f1: 90, vol: 0.9, attack: 0.02 }); a.osc('sine', 55, 35, t, 1.5, d, 0.5); },
  horn(a, d, t) {
    const blast = (t0, f0, f1, dur) => {
      const o = a.ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f0, t0); o.frequency.linearRampToValueAtTime(f1, t0 + dur * 0.3);
      const flt = a.ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.frequency.setValueAtTime(400, t0); flt.frequency.linearRampToValueAtTime(1800, t0 + dur * 0.4);
      const g = a.ctx.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.08); g.gain.setValueAtTime(0.35, t0 + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(flt); flt.connect(g); g.connect(d); o.start(t0); o.stop(t0 + dur + 0.05);
    };
    blast(t, 196, 262, 0.7); blast(t + 0.75, 262, 392, 1.1);
  },
  gather(a, d, t) { a.osc('sine', 300, 900, t, 0.9, d, 0.3); a.osc('triangle', 450, 1350, t, 0.9, d, 0.12); },
  boom(a, d, t) {
    a.osc('sine', 80, 30, t, 1.2, d, 1); a.noise(t, 1.0, d, { type: 'lowpass', f: 2000, f1: 100, vol: 0.9, attack: 0.003 });
    [523, 659, 784, 1046].forEach((f) => a.osc('triangle', f, f, t + 0.05, 1.6, d, 0.12));
  },
  sand(a, d, t) { a.noise(t, 1.4, d, { type: 'bandpass', f: 1800, q: 0.6, vol: 0.35, attack: 0.2 }); },
  cheer(a, d, t) { for (let i = 0; i < 8; i++) a.noise(t + Math.random() * 0.5, 0.5 + Math.random() * 0.4, d, { type: 'bandpass', f: 600 + Math.random() * 900, q: 4, vol: 0.25, attack: 0.08 }); [523, 659, 784].forEach((f, i) => a.osc('triangle', f, f, t + i * 0.08, 0.5, d, 0.1)); },
  decree(a, d, t) { a.osc('sawtooth', 147, 147, t, 0.35, d, 0.18); a.osc('sawtooth', 196, 196, t + 0.3, 0.5, d, 0.18); },
  fizzle(a, d, t) { a.noise(t, 0.6, d, { type: 'bandpass', f: 3000, f1: 200, q: 2, vol: 0.4 }); },
  dark(a, d, t) { a.osc('sine', 55, 45, t, 2.5, d, 0.5); a.osc('sine', 82, 70, t, 2.5, d, 0.2); },
  locusts(a, d, t) {
    const s = a.ctx.createBufferSource(); s.buffer = a.noiseBuf;
    const flt = a.ctx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 2800; flt.Q.value = 2;
    const g = a.ctx.createGain(); const lfo = a.ctx.createOscillator(); lfo.frequency.value = 28; const lg = a.ctx.createGain(); lg.gain.value = 0.2;
    lfo.connect(lg); lg.connect(g.gain); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.35, t + 1); g.gain.linearRampToValueAtTime(0.0001, t + 6);
    s.connect(flt); flt.connect(g); g.connect(d); s.start(t); s.stop(t + 6.1); lfo.start(t); lfo.stop(t + 6.1);
  },
  capstone(a, d, t) { [523, 659, 784, 1046, 1318].forEach((f, i) => a.osc('sine', f, f, t + i * 0.09, 2.2, d, 0.2)); },
  stretch(a, d, t) { a.osc('sine', 380, 1300, t, 1.3, d, 0.25); },
  gulp(a, d, t) { a.osc('sine', 320, 110, t, 0.14, d, 0.5); },
  sink(a, d, t) { a.osc('sine', 220, 55, t, 1.0, d, 0.4); a.noise(t, 0.9, d, { type: 'lowpass', f: 700, vol: 0.3, attack: 0.1 }); },
};
