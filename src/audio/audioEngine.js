// Áudio procedural (Web Audio API): efeitos, criaturas, ambiente e música generativa.
// Nenhum arquivo de áudio: tudo é sintetizado. Sons 3D usam PannerNode (HRTF).
// Expõe getOutputLevel() para o VAD não confundir os sons do jogo com a voz do jogador.

const ELEMENT_TONE = { fire: 1, ice: 1.6, lightning: 2.2, poison: 0.8, arcane: 1.3, light: 1.9, shadow: 0.6, water: 1.1, earth: 0.5, wind: 1.4 };

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ready = false;
    this.listenerPos = { x: 0, y: 0, z: 0 };
    this.active = 0;
    this.maxVoices = 48;
    this.weather = 'clear';
    this.tod = 12;
  }

  // Precisa ser chamado após um gesto do usuário (política de autoplay).
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    const c = this.ctx;
    this.master = c.createGain();
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 6;
    this.analyser = c.createAnalyser();
    this.analyser.fftSize = 256;
    this.master.connect(this.comp);
    this.comp.connect(this.analyser);
    this.analyser.connect(c.destination);
    this.buses = {};
    for (const b of ['sfx', 'music', 'ambient', 'ui']) {
      this.buses[b] = c.createGain();
      this.buses[b].connect(this.master);
    }
    this.duckGain = c.createGain();
    this.duckGain.connect(this.master);
    this.buses.sfx.disconnect();
    this.buses.sfx.connect(this.duckGain);
    this.buses.music.disconnect();
    this.buses.music.connect(this.duckGain);
    this.noiseBuf = this.makeNoise(2);
    this.reverb = this.makeReverb();
    this.applyVolumes();
    this.levelBuf = new Float32Array(this.analyser.fftSize);
    this.ready = true;
    this.startAmbient();
    if (this.settings.get('music')) this.startMusic();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const s = this.settings;
    this.master.gain.value = s.get('volMaster');
    this.buses.sfx.gain.value = s.get('volSfx');
    this.buses.music.gain.value = s.get('music') ? s.get('volMusic') : 0;
    this.buses.ambient.gain.value = s.get('volAmbient');
    this.buses.ui.gain.value = s.get('volSfx') * 0.8;
  }

  getOutputLevel() {
    if (!this.analyser) return 0;
    this.analyser.getFloatTimeDomainData(this.levelBuf);
    let sum = 0;
    for (let i = 0; i < this.levelBuf.length; i++) sum += this.levelBuf[i] ** 2;
    return Math.min(1, Math.sqrt(sum / this.levelBuf.length) * 4);
  }

  // Abaixa música/efeitos enquanto o jogador fala (melhora o reconhecimento)
  duck(on) {
    if (!this.ctx) return;
    this.duckGain.gain.setTargetAtTime(on ? 0.35 : 1, this.ctx.currentTime, on ? 0.05 : 0.4);
  }

  setListener(pos, forward) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    this.listenerPos = pos;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t);
      l.positionY.setValueAtTime(pos.y, t);
      l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(forward.x, t);
      l.forwardY.setValueAtTime(forward.y, t);
      l.forwardZ.setValueAtTime(forward.z, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(forward.x, forward.y, forward.z, 0, 1, 0);
    }
  }

  makeNoise(sec) {
    const c = this.ctx;
    const buf = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  makeReverb() {
    const c = this.ctx;
    const len = c.sampleRate * 1.6;
    const buf = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5);
    }
    const conv = c.createConvolver();
    conv.buffer = buf;
    const g = c.createGain();
    g.gain.value = 0.25;
    conv.connect(g);
    g.connect(this.buses.sfx);
    return conv;
  }

  // Cria a saída de um som: espacial (com posição) ou direta.
  out(bus = 'sfx', pos = null, gain = 1) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.value = gain;
    if (pos) {
      const dx = pos.x - this.listenerPos.x;
      const dz = pos.z - this.listenerPos.z;
      if (dx * dx + dz * dz > 120 * 120) return null; // longe demais: não toca
      const p = c.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = 4;
      p.maxDistance = 120;
      p.rolloffFactor = 1.2;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p);
      p.connect(this.buses[bus]);
      if (bus === 'sfx') p.connect(this.reverb);
    } else g.connect(this.buses[bus]);
    return g;
  }

  voice(dur) {
    if (this.active >= this.maxVoices) return false;
    this.active++;
    setTimeout(() => this.active--, dur * 1000 + 50);
    return true;
  }

  tone({ type = 'sine', f0 = 440, f1 = f0, dur = 0.3, vol = 0.3, attack = 0.005, dest, delay = 0, curve = 'exp' }) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) {
      if (curve === 'exp') o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
      else o.frequency.linearRampToValueAtTime(f1, t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  noise({ dur = 0.3, vol = 0.3, filter = 'bandpass', f0 = 1000, f1 = f0, q = 1, attack = 0.005, dest, delay = 0 }) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const fl = c.createBiquadFilter();
    fl.type = filter;
    fl.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) fl.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    fl.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(fl);
    fl.connect(g);
    g.connect(dest);
    src.start(t, Math.random());
    src.stop(t + dur + 0.05);
  }

  // ---------------------------------------------------------------- biblioteca de sons
  play(name, opts = {}) {
    if (!this.ready || this.ctx.state !== 'running') return;
    const fn = SOUNDS[name];
    if (!fn) return;
    const dur = 1.5;
    if (!this.voice(dur)) return;
    const dest = this.out(opts.bus || (name.startsWith('ui_') ? 'ui' : 'sfx'), opts.pos || null, opts.volume ?? 1);
    if (!dest) return;
    try {
      fn(this, dest, opts);
    } catch {
      /* som é opcional */
    }
  }

  creature(species, kind, opts = {}) {
    if (!this.ready) return;
    const size = opts.size || 1;
    const base = CREATURE_VOICE[species] || CREATURE_VOICE.default;
    const dest = this.out('sfx', opts.pos, kind === 'attack' ? 0.9 : 0.6);
    if (!dest || !this.voice(1.2)) return;
    const pitch = base.pitch / Math.sqrt(size);
    const dur = base.dur * (kind === 'die' ? 1.5 : kind === 'hurt' ? 0.5 : 1) * Math.sqrt(size);
    if (base.kind === 'roar') {
      this.tone({ type: 'sawtooth', f0: pitch * 1.4, f1: pitch * (kind === 'die' ? 0.4 : 0.8), dur, vol: 0.25, attack: 0.04, dest });
      this.noise({ dur, vol: 0.25, f0: pitch * 4, f1: pitch * 2, q: 2, attack: 0.03, dest });
    } else if (base.kind === 'chirp') {
      for (let i = 0; i < 3; i++) this.tone({ type: 'sine', f0: pitch * (1.4 - i * 0.1), f1: pitch * 1.8, dur: 0.08, vol: 0.2, dest, delay: i * 0.09 });
    } else if (base.kind === 'squish') {
      this.tone({ type: 'sine', f0: pitch * 2, f1: pitch * 0.6, dur: 0.25, vol: 0.3, dest });
    } else if (base.kind === 'robot') {
      this.tone({ type: 'square', f0: pitch, f1: pitch * 1.5, dur: 0.15, vol: 0.12, dest });
      this.tone({ type: 'square', f0: pitch * 1.5, f1: pitch * 0.7, dur: 0.2, vol: 0.12, dest, delay: 0.15 });
    } else if (base.kind === 'hiss') {
      this.noise({ dur, vol: 0.3, filter: 'highpass', f0: 3000, f1: 5000, dest, attack: 0.05 });
    } else if (base.kind === 'ghost') {
      this.tone({ type: 'sine', f0: pitch, f1: pitch * 1.5, dur: dur * 1.5, vol: 0.18, attack: 0.2, dest, curve: 'lin' });
    } else {
      this.tone({ type: 'triangle', f0: pitch * 1.2, f1: pitch * 0.9, dur: dur * 0.6, vol: 0.25, dest });
      this.noise({ dur: dur * 0.5, vol: 0.12, f0: pitch * 3, q: 3, dest });
    }
  }

  // ---------------------------------------------------------------- ambiente
  startAmbient() {
    const c = this.ctx;
    const mk = (filterType, freq, q) => {
      const src = c.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = c.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = 0;
      src.connect(f);
      f.connect(g);
      g.connect(this.buses.ambient);
      src.start();
      return { src, f, g };
    };
    this.amb = { wind: mk('lowpass', 400, 0.5), rain: mk('highpass', 1200, 0.3) };
    this.ambTimer = setInterval(() => this.ambientTick(), 700);
  }

  setEnvironment(weather, tod) {
    this.weather = weather;
    this.tod = tod;
    if (!this.amb) return;
    const t = this.ctx.currentTime;
    const rain = weather === 'rain' ? 0.35 : weather === 'thunderstorm' ? 0.55 : 0;
    const wind = weather === 'snow' ? 0.18 : weather === 'thunderstorm' ? 0.25 : 0.07;
    this.amb.rain.g.gain.setTargetAtTime(rain, t, 1.5);
    this.amb.wind.g.gain.setTargetAtTime(wind, t, 1.5);
    this.amb.wind.f.frequency.setTargetAtTime(300 + Math.random() * 300, t, 2);
  }

  ambientTick() {
    if (!this.ready || this.ctx.state !== 'running') return;
    const dest = this.buses.ambient;
    const day = this.tod > 6 && this.tod < 19;
    if (this.weather === 'clear' || this.weather === 'fog') {
      if (day && Math.random() < 0.3) {
        // canto de pássaro
        const f = 2200 + Math.random() * 1800;
        const n = 2 + Math.floor(Math.random() * 4);
        for (let i = 0; i < n; i++) this.tone({ type: 'sine', f0: f, f1: f * (1.1 + Math.random() * 0.3), dur: 0.07, vol: 0.04, dest, delay: i * 0.11 });
      } else if (!day && Math.random() < 0.6) {
        // grilos
        for (let i = 0; i < 6; i++) this.tone({ type: 'triangle', f0: 4300, dur: 0.025, vol: 0.015, dest, delay: i * 0.05 });
      }
    }
  }

  thunder(distance = 0.5) {
    if (!this.ready) return;
    const dest = this.buses.ambient;
    const delay = distance * 1.5;
    this.noise({ dur: 2.5, vol: 0.5 * (1 - distance * 0.5), filter: 'lowpass', f0: 300, f1: 60, attack: 0.02, dest, delay });
    this.noise({ dur: 0.3, vol: 0.3, filter: 'highpass', f0: 2000, f1: 800, dest, delay });
  }

  // ---------------------------------------------------------------- música generativa
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const scale = [0, 2, 4, 7, 9, 12, 14, 16];
    const roots = [220, 196, 174.6, 196];
    let bar = 0;
    let step = 0;
    const tick = () => {
      if (!this.ready || this.ctx.state !== 'running') return;
      const dest = this.buses.music;
      const root = roots[bar % roots.length];
      if (step % 16 === 0) {
        // pad
        for (const iv of [0, 7, 12, 16]) this.tone({ type: 'sine', f0: root * Math.pow(2, iv / 12) / 2, dur: 3.6, vol: 0.035, attack: 0.8, dest });
      }
      if (step % 2 === 0 && Math.random() < 0.7) {
        const n = scale[Math.floor(Math.random() * scale.length)];
        this.tone({ type: 'triangle', f0: root * Math.pow(2, n / 12), dur: 0.5, vol: 0.03, attack: 0.01, dest });
      }
      step++;
      if (step % 16 === 0) bar++;
    };
    this.musicTimer = setInterval(tick, 230);
  }

  stopMusic() {
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  setMusic(on) {
    this.settings.set('music', on);
    this.applyVolumes();
    if (on) this.startMusic();
    else this.stopMusic();
  }
}

const CREATURE_VOICE = {
  default: { kind: 'growl', pitch: 160, dur: 0.6 },
  dragon: { kind: 'roar', pitch: 90, dur: 1.2 },
  dinosaur: { kind: 'roar', pitch: 70, dur: 1.3 },
  raptor: { kind: 'roar', pitch: 260, dur: 0.5 },
  lion: { kind: 'roar', pitch: 110, dur: 1.0 },
  tiger: { kind: 'roar', pitch: 120, dur: 0.9 },
  bear: { kind: 'roar', pitch: 95, dur: 0.9 },
  gorilla: { kind: 'growl', pitch: 120, dur: 0.7 },
  wolf: { kind: 'growl', pitch: 220, dur: 0.6 },
  dog: { kind: 'growl', pitch: 320, dur: 0.25 },
  cat: { kind: 'chirp', pitch: 700, dur: 0.3 },
  eagle: { kind: 'chirp', pitch: 1600, dur: 0.4 },
  phoenix: { kind: 'chirp', pitch: 1200, dur: 0.5 },
  bat: { kind: 'chirp', pitch: 3000, dur: 0.2 },
  chicken: { kind: 'chirp', pitch: 900, dur: 0.3 },
  bee: { kind: 'hiss', pitch: 300, dur: 0.4 },
  serpent: { kind: 'hiss', pitch: 0, dur: 0.8 },
  spider: { kind: 'hiss', pitch: 0, dur: 0.4 },
  slime: { kind: 'squish', pitch: 200, dur: 0.3 },
  frog: { kind: 'squish', pitch: 180, dur: 0.3 },
  ghost: { kind: 'ghost', pitch: 330, dur: 1 },
  robot: { kind: 'robot', pitch: 300, dur: 0.4 },
  golem: { kind: 'roar', pitch: 55, dur: 1.2 },
  elephant: { kind: 'roar', pitch: 260, dur: 1.1 },
  whale: { kind: 'ghost', pitch: 120, dur: 2 },
  shark: { kind: 'growl', pitch: 90, dur: 0.5 },
};

const SOUNDS = {
  ui_click: (a, d) => a.tone({ type: 'sine', f0: 900, f1: 1200, dur: 0.07, vol: 0.2, dest: d }),
  ui_hover: (a, d) => a.tone({ type: 'sine', f0: 1400, dur: 0.04, vol: 0.06, dest: d }),
  ui_open: (a, d) => {
    a.tone({ type: 'triangle', f0: 500, f1: 900, dur: 0.18, vol: 0.15, dest: d });
  },
  ui_error: (a, d) => a.tone({ type: 'square', f0: 220, f1: 160, dur: 0.18, vol: 0.08, dest: d }),
  mic_on: (a, d) => {
    a.tone({ type: 'sine', f0: 660, dur: 0.08, vol: 0.18, dest: d });
    a.tone({ type: 'sine', f0: 990, dur: 0.1, vol: 0.18, dest: d, delay: 0.08 });
  },
  mic_off: (a, d) => {
    a.tone({ type: 'sine', f0: 990, dur: 0.08, vol: 0.15, dest: d });
    a.tone({ type: 'sine', f0: 660, dur: 0.1, vol: 0.15, dest: d, delay: 0.08 });
  },
  heard: (a, d) => a.tone({ type: 'sine', f0: 1320, f1: 1760, dur: 0.12, vol: 0.12, dest: d }),
  not_understood: (a, d) => {
    a.tone({ type: 'triangle', f0: 400, f1: 300, dur: 0.15, vol: 0.12, dest: d });
    a.tone({ type: 'triangle', f0: 350, f1: 250, dur: 0.2, vol: 0.12, dest: d, delay: 0.15 });
  },
  appear: (a, d, o) => {
    const k = ELEMENT_TONE[o.element] || 1;
    for (let i = 0; i < 5; i++) a.tone({ type: 'sine', f0: 523 * k * Math.pow(1.26, i), dur: 0.35, vol: 0.12, dest: d, delay: i * 0.06 });
    a.noise({ dur: 0.6, vol: 0.12, filter: 'highpass', f0: 3000, f1: 8000, dest: d, attack: 0.1 });
  },
  summon: (a, d) => {
    a.tone({ type: 'sawtooth', f0: 110, f1: 330, dur: 0.8, vol: 0.12, attack: 0.2, dest: d });
    a.noise({ dur: 0.9, vol: 0.2, f0: 400, f1: 2000, q: 1.5, dest: d, attack: 0.2 });
  },
  swing: (a, d, o) => a.noise({ dur: 0.22, vol: 0.35 * (o.size || 1), f0: 600, f1: 2500, q: 1.2, dest: d, attack: 0.03 }),
  swing_heavy: (a, d) => a.noise({ dur: 0.4, vol: 0.45, f0: 250, f1: 900, q: 1, dest: d, attack: 0.06 }),
  punch: (a, d) => a.noise({ dur: 0.12, vol: 0.4, filter: 'lowpass', f0: 800, dest: d }),
  hit: (a, d, o) => {
    a.noise({ dur: 0.15, vol: 0.5, filter: 'lowpass', f0: 1800, f1: 300, dest: d });
    a.tone({ type: 'triangle', f0: 180, f1: 60, dur: 0.15, vol: 0.4, dest: d });
    if (o.element) SOUNDS[`el_${o.element}`]?.(a, d, o);
  },
  block: (a, d) => {
    a.tone({ type: 'square', f0: 1200, f1: 900, dur: 0.15, vol: 0.12, dest: d });
    a.noise({ dur: 0.2, vol: 0.3, f0: 3500, q: 6, dest: d });
  },
  miss: (a, d) => a.noise({ dur: 0.15, vol: 0.15, f0: 2000, f1: 4000, q: 1, dest: d }),
  arrow: (a, d) => {
    a.tone({ type: 'triangle', f0: 180, f1: 120, dur: 0.12, vol: 0.3, dest: d });
    a.noise({ dur: 0.3, vol: 0.15, f0: 2500, f1: 1200, q: 2, dest: d });
  },
  blaster: (a, d, o) => a.tone({ type: 'square', f0: 1600 * (ELEMENT_TONE[o.element] || 1), f1: 200, dur: 0.18, vol: 0.12, dest: d }),
  orb: (a, d, o) => {
    a.tone({ type: 'sine', f0: 400 * (ELEMENT_TONE[o.element] || 1), f1: 900, dur: 0.3, vol: 0.2, dest: d });
    a.noise({ dur: 0.3, vol: 0.1, filter: 'highpass', f0: 4000, dest: d });
  },
  beam: (a, d) => {
    a.tone({ type: 'sawtooth', f0: 880, f1: 440, dur: 0.4, vol: 0.12, dest: d });
    a.tone({ type: 'sine', f0: 1760, f1: 1500, dur: 0.4, vol: 0.1, dest: d });
  },
  cannon: (a, d) => {
    a.tone({ type: 'sine', f0: 120, f1: 40, dur: 0.5, vol: 0.6, dest: d });
    a.noise({ dur: 0.5, vol: 0.4, filter: 'lowpass', f0: 1200, f1: 200, dest: d });
  },
  explosion: (a, d, o) => {
    const s = Math.min(2, (o.radius || 4) / 4);
    a.tone({ type: 'sine', f0: 90, f1: 30, dur: 1.0 * s, vol: 0.7, dest: d });
    a.noise({ dur: 1.2 * s, vol: 0.6, filter: 'lowpass', f0: 2500, f1: 100, attack: 0.005, dest: d });
  },
  lightning: (a, d) => {
    a.noise({ dur: 0.35, vol: 0.5, filter: 'highpass', f0: 1500, f1: 400, dest: d });
    a.noise({ dur: 1.2, vol: 0.35, filter: 'lowpass', f0: 400, f1: 60, dest: d, delay: 0.05 });
  },
  shield: (a, d) => {
    a.tone({ type: 'sine', f0: 300, f1: 600, dur: 0.6, vol: 0.2, attack: 0.1, dest: d });
    a.tone({ type: 'sine', f0: 450, f1: 900, dur: 0.6, vol: 0.12, attack: 0.1, dest: d });
  },
  shield_break: (a, d) => a.noise({ dur: 0.5, vol: 0.4, filter: 'highpass', f0: 3000, f1: 800, dest: d }),
  heal: (a, d) => {
    for (let i = 0; i < 4; i++) a.tone({ type: 'sine', f0: 660 * Math.pow(1.335, i), dur: 0.5, vol: 0.12, dest: d, delay: i * 0.08 });
  },
  freeze: (a, d) => {
    a.noise({ dur: 0.8, vol: 0.3, filter: 'highpass', f0: 5000, f1: 2000, dest: d });
    for (let i = 0; i < 6; i++) a.tone({ type: 'sine', f0: 2000 + Math.random() * 3000, dur: 0.1, vol: 0.05, dest: d, delay: i * 0.07 });
  },
  wind: (a, d) => a.noise({ dur: 1.5, vol: 0.35, f0: 300, f1: 1200, q: 0.8, attack: 0.3, dest: d }),
  quake: (a, d) => a.noise({ dur: 2, vol: 0.7, filter: 'lowpass', f0: 150, f1: 40, attack: 0.1, dest: d }),
  teleport: (a, d) => {
    a.tone({ type: 'sine', f0: 200, f1: 2000, dur: 0.25, vol: 0.2, dest: d });
    a.tone({ type: 'sine', f0: 2000, f1: 300, dur: 0.25, vol: 0.15, dest: d, delay: 0.2 });
  },
  powerup: (a, d) => {
    a.tone({ type: 'sawtooth', f0: 220, f1: 880, dur: 0.5, vol: 0.12, dest: d });
    a.tone({ type: 'sine', f0: 440, f1: 1760, dur: 0.6, vol: 0.12, dest: d });
  },
  laser: (a, d) => a.tone({ type: 'sawtooth', f0: 1200, f1: 1100, dur: 2, vol: 0.08, attack: 0.05, dest: d }),
  bomb_tick: (a, d) => {
    for (let i = 0; i < 4; i++) a.tone({ type: 'square', f0: 1000 + i * 150, dur: 0.05, vol: 0.12, dest: d, delay: i * 0.45 });
  },
  pickup: (a, d) => {
    a.tone({ type: 'sine', f0: 880, dur: 0.08, vol: 0.2, dest: d });
    a.tone({ type: 'sine', f0: 1320, dur: 0.12, vol: 0.2, dest: d, delay: 0.08 });
  },
  levelup: (a, d) => {
    [523, 659, 784, 1047].forEach((f, i) => a.tone({ type: 'triangle', f0: f, dur: 0.4, vol: 0.2, dest: d, delay: i * 0.1 }));
  },
  achievement: (a, d) => {
    [784, 988, 1175, 1568].forEach((f, i) => a.tone({ type: 'sine', f0: f, dur: 0.5, vol: 0.15, dest: d, delay: i * 0.07 }));
  },
  wave_start: (a, d) => {
    a.tone({ type: 'sawtooth', f0: 110, dur: 0.8, vol: 0.15, dest: d });
    a.tone({ type: 'sawtooth', f0: 165, dur: 0.8, vol: 0.12, dest: d, delay: 0.4 });
  },
  wave_clear: (a, d) => {
    [392, 523, 659, 784].forEach((f, i) => a.tone({ type: 'triangle', f0: f, dur: 0.5, vol: 0.18, dest: d, delay: i * 0.12 }));
  },
  ko: (a, d) => a.tone({ type: 'triangle', f0: 400, f1: 80, dur: 0.8, vol: 0.25, dest: d }),
  respawn: (a, d) => a.tone({ type: 'sine', f0: 300, f1: 900, dur: 0.6, vol: 0.2, dest: d }),
  jump: (a, d) => a.tone({ type: 'sine', f0: 200, f1: 400, dur: 0.12, vol: 0.1, dest: d }),
  land: (a, d) => a.noise({ dur: 0.12, vol: 0.2, filter: 'lowpass', f0: 500, dest: d }),
  step: (a, d) => a.noise({ dur: 0.07, vol: 0.08, filter: 'lowpass', f0: 700 + Math.random() * 300, dest: d }),
  splash: (a, d) => a.noise({ dur: 0.5, vol: 0.3, f0: 1500, f1: 500, q: 0.8, dest: d }),
  dodge: (a, d) => a.noise({ dur: 0.25, vol: 0.2, f0: 800, f1: 2000, q: 1, dest: d }),
  launch: (a, d) => a.tone({ type: 'sine', f0: 150, f1: 900, dur: 0.4, vol: 0.25, dest: d }),
  confetti: (a, d) => {
    for (let i = 0; i < 8; i++) a.tone({ type: 'sine', f0: 800 + Math.random() * 1600, dur: 0.08, vol: 0.08, dest: d, delay: i * 0.04 });
  },
  el_fire: (a, d) => a.noise({ dur: 0.4, vol: 0.2, filter: 'lowpass', f0: 1200, f1: 400, dest: d }),
  el_ice: (a, d) => a.tone({ type: 'sine', f0: 3000, f1: 2500, dur: 0.15, vol: 0.08, dest: d }),
  el_lightning: (a, d) => a.noise({ dur: 0.15, vol: 0.25, filter: 'highpass', f0: 3000, dest: d }),
  el_poison: (a, d) => a.tone({ type: 'sine', f0: 300, f1: 150, dur: 0.2, vol: 0.12, dest: d }),
};
