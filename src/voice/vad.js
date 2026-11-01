// Detecção de atividade de voz (VAD) — função pura sobre quadros de espectro.
// Combina: energia acima de um piso de ruído adaptativo, proporção de energia na banda
// da fala (300–3400 Hz), tempo mínimo de ataque e "hangover" para não cortar pausas curtas.
// Também recebe o nível de saída do próprio jogo para não confundir efeitos sonoros com fala.

export class VoiceActivityDetector {
  constructor({
    sampleRate = 48000,
    fftSize = 1024,
    attackMs = 90,
    releaseMs = 650,
    minSpeechMs = 220,
    sensitivity = 0.5, // 0..1 (configurável pelo jogador)
  } = {}) {
    this.sampleRate = sampleRate;
    this.fftSize = fftSize;
    this.attackMs = attackMs;
    this.releaseMs = releaseMs;
    this.minSpeechMs = minSpeechMs;
    this.setSensitivity(sensitivity);
    this.noiseFloor = 0.002;
    this.speaking = false;
    this.aboveMs = 0;
    this.belowMs = 0;
    this.segmentMs = 0;
    this.level = 0;
    this.listeners = {};
  }

  setSensitivity(s) {
    this.sensitivity = Math.min(1, Math.max(0, s));
    // maior sensibilidade = limiar menor
    this.ratio = 4.2 - this.sensitivity * 2.6;
  }

  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
    return () => (this.listeners[ev] = this.listeners[ev].filter((f) => f !== fn));
  }

  emit(ev, data) {
    for (const fn of this.listeners[ev] || []) fn(data);
  }

  // freqDb: Float32Array (dB) de AnalyserNode.getFloatFrequencyData
  // rms: energia RMS do quadro no domínio do tempo
  // gameOutput: 0..1 nível atual do áudio do jogo (para supressão do próprio som)
  process({ freqDb, rms, dtMs, gameOutput = 0 }) {
    const binHz = this.sampleRate / this.fftSize;
    const lo = Math.floor(300 / binHz);
    const hi = Math.min(freqDb.length - 1, Math.ceil(3400 / binHz));
    let band = 0;
    let total = 0;
    for (let i = 1; i < freqDb.length; i++) {
      const p = Math.pow(10, (freqDb[i] > -160 ? freqDb[i] : -160) / 10);
      total += p;
      if (i >= lo && i <= hi) band += p;
    }
    const bandRatio = total > 0 ? band / total : 0;
    this.level = rms;
    // piso de ruído adaptativo: sobe devagar, desce rápido
    if (!this.speaking) {
      const k = rms < this.noiseFloor ? 0.2 : 0.01;
      this.noiseFloor += (rms - this.noiseFloor) * k * (dtMs / 30);
      this.noiseFloor = Math.max(0.0008, Math.min(this.noiseFloor, 0.08));
    }
    // som do jogo saindo pelas caixas eleva o limiar
    const threshold = this.noiseFloor * this.ratio + gameOutput * 0.06;
    const voiced = rms > threshold && bandRatio > 0.45;
    this.lastVoiced = voiced;
    this.lastThreshold = threshold;
    if (voiced) {
      this.aboveMs += dtMs;
      this.belowMs = 0;
    } else {
      this.belowMs += dtMs;
      if (!this.speaking) this.aboveMs = Math.max(0, this.aboveMs - dtMs * 2);
    }
    if (this.speaking) this.segmentMs += dtMs;
    if (!this.speaking && this.aboveMs >= this.attackMs) {
      this.speaking = true;
      this.segmentMs = this.aboveMs;
      this.emit('start', { at: Date.now() });
    } else if (this.speaking && this.belowMs >= this.releaseMs) {
      this.speaking = false;
      const valid = this.segmentMs - this.releaseMs >= this.minSpeechMs;
      this.emit('end', { durationMs: this.segmentMs, valid });
      this.aboveMs = 0;
      this.segmentMs = 0;
    }
    return { speaking: this.speaking, voiced, threshold, bandRatio, level: rms };
  }
}
