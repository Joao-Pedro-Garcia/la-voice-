// Captura do microfone com cancelamento de eco, supressão de ruído e VAD contínuo.
import { VoiceActivityDetector } from './vad.js';

export class Microphone {
  constructor({ getGameOutputLevel = () => 0, sensitivity = 0.5 } = {}) {
    this.getGameOutputLevel = getGameOutputLevel;
    this.vad = new VoiceActivityDetector({ sensitivity });
    this.state = 'off'; // off | requesting | ready | denied | unavailable | error
    this.stream = null;
    this.ctx = null;
    this.analyser = null;
    this.timer = null;
    this.level = 0;
    this.lastSpeechAt = 0;
    this.speechStartAt = 0;
    this.listeners = {};
    this.vad.on('start', () => {
      this.speechStartAt = performance.now();
      this.emit('speechstart');
    });
    this.vad.on('end', (e) => {
      this.lastSpeechAt = performance.now();
      this.emit('speechend', e);
    });
  }

  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }

  emit(ev, data) {
    for (const fn of this.listeners[ev] || []) fn(data);
  }

  static supported() {
    return !!navigator.mediaDevices?.getUserMedia;
  }

  async start() {
    if (this.stream) return true;
    if (!Microphone.supported()) {
      this.state = 'unavailable';
      this.emit('state', this.state);
      return false;
    }
    this.state = 'requesting';
    this.emit('state', this.state);
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
    } catch (err) {
      this.state = err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'error';
      this.error = err;
      this.emit('state', this.state);
      return false;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    this.ctx = new Ctx();
    if (this.ctx.state === 'suspended') await this.ctx.resume().catch(() => {});
    const src = this.ctx.createMediaStreamSource(this.stream);
    // filtro passa-altas remove ronco grave (ventilador, vento)
    const hp = this.ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 120;
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.analyser.smoothingTimeConstant = 0.2;
    src.connect(hp);
    hp.connect(this.analyser);
    this.vad.sampleRate = this.ctx.sampleRate;
    this.vad.fftSize = this.analyser.fftSize;
    const freq = new Float32Array(this.analyser.frequencyBinCount);
    const time = new Float32Array(this.analyser.fftSize);
    let last = performance.now();
    this.timer = setInterval(() => {
      const now = performance.now();
      const dtMs = now - last;
      last = now;
      this.analyser.getFloatFrequencyData(freq);
      this.analyser.getFloatTimeDomainData(time);
      let sum = 0;
      for (let i = 0; i < time.length; i++) sum += time[i] * time[i];
      const rms = Math.sqrt(sum / time.length);
      const r = this.vad.process({ freqDb: freq, rms, dtMs, gameOutput: this.getGameOutputLevel() });
      this.level = rms;
      this.voiced = r.voiced;
      this.emit('level', r);
    }, 30);
    this.state = 'ready';
    this.emit('state', this.state);
    this.stream.getAudioTracks()[0]?.addEventListener('ended', () => {
      this.stop();
      this.state = 'error';
      this.emit('state', this.state);
    });
    return true;
  }

  get speaking() {
    return this.vad.speaking;
  }

  // Houve fala real (VAD) recentemente? Usado para aceitar/rejeitar transcrições.
  recentSpeech(windowMs = 2500) {
    return this.vad.speaking || performance.now() - this.lastSpeechAt < windowMs;
  }

  setSensitivity(s) {
    this.vad.setSensitivity(s);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.state = 'off';
    this.emit('state', this.state);
  }
}
