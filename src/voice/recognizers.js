// Camada 1 — Reconhecimento (áudio → texto). Implementações intercambiáveis:
//  - WebSpeechRecognizer: API de reconhecimento do navegador (Chrome/Edge/Safari).
//    Observação: no Chrome o áudio é processado pelo serviço do Google; no Safari
//    pode ser processado no próprio aparelho.
//  - ServerRecognizer: grava o trecho detectado pelo VAD e envia para /api/stt
//    (servidor do jogo → serviço de transcrição configurado). Opcional.
//  - Entrada de texto (fallback universal) é tratada pela interface.

export class WebSpeechRecognizer {
  static supported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  }

  constructor({ lang = 'pt-BR' } = {}) {
    this.lang = lang;
    this.active = false;
    this.listeners = {};
    this.restartDelay = 250;
    this.failures = 0;
  }

  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }

  emit(ev, d) {
    for (const fn of this.listeners[ev] || []) fn(d);
  }

  create() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const r = new SR();
    r.lang = this.lang;
    // modo "uma frase" (tocar para falar, ideal no celular) ou contínuo
    r.continuous = !this.once;
    r.interimResults = true;
    r.maxAlternatives = 3;
    r.onresult = (ev) => {
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const res = ev.results[i];
        const alts = [...res].map((a) => ({ text: a.transcript.trim(), confidence: a.confidence || 0 }));
        if (res.isFinal) {
          this.failures = 0;
          this.emit('final', { text: alts[0].text, confidence: alts[0].confidence, alternatives: alts });
        } else this.emit('interim', { text: alts[0].text });
      }
    };
    r.onspeechstart = () => this.emit('speechstart');
    r.onspeechend = () => this.emit('speechend');
    r.onaudiostart = () => this.emit('listening');
    r.onerror = (ev) => {
      if (ev.error === 'aborted') return;
      if (ev.error === 'no-speech') {
        if (this.once) this.emit('nospeech');
        return;
      }
      this.failures++;
      this.emit('error', { code: ev.error });
      // sem permissão, sem microfone livre ou falhas de rede repetidas: para de tentar
      if (['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(ev.error) || this.failures >= 6) this.active = false;
    };
    r.onend = () => {
      // o reconhecimento contínuo para sozinho de tempos em tempos: reinicia
      if (this.active && !this.once) {
        const delay = Math.min(8000, this.restartDelay * Math.pow(2, Math.min(this.failures, 5)));
        setTimeout(() => this.active && this.safeStart(), delay);
      } else {
        this.active = false;
        this.emit('stopped');
      }
    };
    return r;
  }

  safeStart() {
    try {
      this.rec = this.create();
      this.rec.start();
    } catch (err) {
      this.emit('error', { code: 'start-failed', message: err.message });
    }
  }

  start({ once = false } = {}) {
    if (this.active) return;
    this.once = once;
    this.active = true;
    this.safeStart();
  }

  stop() {
    this.active = false;
    try {
      this.rec?.abort();
    } catch {}
  }

  setLang(lang) {
    this.lang = lang;
    if (this.active) {
      this.stop();
      setTimeout(() => this.start(), 300);
    }
  }
}

export class ServerRecognizer {
  static supported() {
    return typeof MediaRecorder !== 'undefined';
  }

  constructor({ microphone, endpoint = '/api/stt', lang = 'pt' } = {}) {
    this.mic = microphone;
    this.endpoint = endpoint;
    this.lang = lang;
    this.listeners = {};
    this.active = false;
    this.chunks = [];
    this.mic.on('speechstart', () => this.active && this.begin());
    this.mic.on('speechend', (e) => this.active && this.finish(e));
  }

  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }

  emit(ev, d) {
    for (const fn of this.listeners[ev] || []) fn(d);
  }

  begin() {
    if (!this.mic.stream || this.recorder?.state === 'recording') return;
    const mime = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
    this.recorder = new MediaRecorder(this.mic.stream, mime ? { mimeType: mime } : undefined);
    this.chunks = [];
    this.recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.recorder.start();
    this.emit('interim', { text: '…' });
  }

  async finish({ valid }) {
    const rec = this.recorder;
    if (!rec || rec.state !== 'recording') return;
    await new Promise((resolve) => {
      rec.onstop = resolve;
      rec.stop();
    });
    if (!valid) return;
    const blob = new Blob(this.chunks, { type: rec.mimeType || 'audio/webm' });
    try {
      const res = await fetch(`${this.endpoint}?lang=${this.lang}`, { method: 'POST', body: blob, headers: { 'content-type': blob.type } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { text } = await res.json();
      if (text) this.emit('final', { text, confidence: 0.8, alternatives: [{ text, confidence: 0.8 }] });
    } catch (err) {
      this.emit('error', { code: 'network', message: err.message });
    }
  }

  start() {
    this.active = true;
  }

  stop() {
    this.active = false;
    if (this.recorder?.state === 'recording') this.recorder.stop();
  }

  setLang(lang) {
    this.lang = lang.slice(0, 2);
  }
}
