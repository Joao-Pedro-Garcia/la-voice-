// Orquestra microfone + reconhecedor + filtros contra falsos reconhecimentos.
// Emite: 'state' (estado geral), 'level' (nível do mic), 'interim' (texto parcial),
// 'transcript' (fala final aceita), 'rejected' (fala descartada e motivo), 'error'.
//
// Celular (Android/iPhone): o reconhecedor do sistema precisa do microfone só para ele.
// Abrir o microfone em paralelo (para o detector de voz próprio) pode fazer o Android
// devolver "audio-capture" e o iOS cortar o áudio. Por isso, no celular com o reconhecedor
// do navegador, o jogo NÃO abre um segundo fluxo de microfone e usa o modo "tocar para
// falar": cada toque ouve uma frase. No computador continua o modo contínuo com VAD.
import { Microphone } from './microphone.js';
import { WebSpeechRecognizer, ServerRecognizer } from './recognizers.js';

export function detectPlatform(nav = globalThis.navigator || {}) {
  const ua = nav.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && nav.maxTouchPoints > 1);
  const android = /Android/.test(ua);
  return { ios, android, mobile: ios || android || /Mobile/.test(ua) };
}

export class VoiceController {
  constructor({ audio, settings, serverStt = false, platform = detectPlatform() }) {
    this.audio = audio;
    this.settings = settings;
    this.serverStt = serverStt;
    this.platform = platform;
    this.listeners = {};
    this.enabled = false;
    this.pushHeld = false;
    this.pushReleasedAt = 0;
    this.lastText = '';
    this.lastTextAt = 0;
    this.hearing = false;
    this.mic = new Microphone({ getGameOutputLevel: () => audio?.getOutputLevel() || 0, sensitivity: settings.get('micSensitivity') });
    this.mic.on('level', (r) => this.emit('level', r));
    this.mic.on('state', () => this.emitState());
    this.mic.on('speechstart', () => this.onSpeech(true));
    this.mic.on('speechend', () => this.onSpeech(false));
    this.engine = this.pickEngine();
  }

  pickEngine() {
    const pref = this.settings.get('recognizer'); // auto | browser | server
    if ((pref === 'server' || (pref === 'auto' && !WebSpeechRecognizer.supported())) && this.serverStt && ServerRecognizer.supported()) {
      return this.wire(new ServerRecognizer({ microphone: this.mic, lang: this.settings.get('voiceLang') }), 'server');
    }
    if (WebSpeechRecognizer.supported()) return this.wire(new WebSpeechRecognizer({ lang: this.settings.get('voiceLang') }), 'browser');
    return null;
  }

  // O detector de voz próprio (fluxo de microfone separado) só é usado onde não atrapalha.
  get usesOwnMic() {
    if (!this.engine) return false;
    if (this.engine.kind === 'server') return true;
    return !this.platform.mobile;
  }

  wire(rec, kind) {
    rec.kind = kind;
    rec.on('interim', (d) => this.accepting() && this.emit('interim', d));
    rec.on('final', (d) => this.onFinal(d, kind));
    rec.on('speechstart', () => !this.usesOwnMic && this.onSpeech(true));
    rec.on('speechend', () => !this.usesOwnMic && this.onSpeech(false));
    rec.on('listening', () => this.emitState());
    rec.on('nospeech', () => this.emit('nospeech'));
    rec.on('stopped', () => {
      if (this.hearing) this.onSpeech(false);
      this.tapActiveUntil = performance.now() + 1500;
      this.emitState();
    });
    rec.on('error', (e) => {
      this.emit('error', e);
      if (e.code === 'not-allowed' || e.code === 'service-not-allowed') {
        this.enabled = false;
        this.deniedByEngine = true;
      }
      this.emitState();
    });
    return rec;
  }

  onSpeech(on) {
    this.hearing = on;
    this.audio?.duck(on);
    this.emit('speech', on);
    this.emitState();
  }

  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }

  emit(ev, d) {
    for (const fn of this.listeners[ev] || []) fn(d);
  }

  // continuous | push | tap; 'auto' escolhe tocar-para-falar no celular
  get mode() {
    const m = this.settings.get('voiceMode');
    if (m === 'auto' || !m) return this.platform.mobile && !this.usesOwnMic ? 'tap' : 'continuous';
    return m;
  }

  status() {
    if (!this.engine) return 'unsupported';
    if (this.mic.state === 'denied' || this.deniedByEngine) return 'denied';
    if (this.mic.state === 'requesting') return 'requesting';
    if (!this.enabled) return this.mode === 'tap' ? 'tap' : 'off';
    if (this.mode === 'tap') return this.engine.active ? (this.hearing ? 'hearing' : 'listening') : 'tap';
    if (this.mode === 'push' && !this.pushHeld) return 'standby';
    if (this.usesOwnMic) return this.mic.speaking ? 'hearing' : 'listening';
    return this.hearing ? 'hearing' : 'listening';
  }

  emitState(forced) {
    this.emit('state', forced || this.status());
  }

  accepting() {
    if (!this.enabled) return false;
    if (this.mode === 'push') return this.pushHeld || performance.now() - this.pushReleasedAt < 1800;
    if (this.mode === 'tap') return this.engine?.active || performance.now() < (this.tapActiveUntil || 0);
    return true;
  }

  async enable() {
    if (!this.engine) {
      this.emitState();
      return false;
    }
    this.deniedByEngine = false;
    if (this.usesOwnMic) {
      const ok = await this.mic.start();
      // Se o VAD próprio não conseguir o microfone, o reconhecedor do navegador ainda pode funcionar.
      if (!ok && this.mic.state === 'denied') {
        this.emitState();
        return false;
      }
    }
    this.enabled = true;
    if (this.mode === 'continuous') this.engine.start();
    this.emitState();
    return true;
  }

  disable() {
    this.enabled = false;
    this.engine?.stop();
    if (this.mic.stream) this.mic.stop();
    this.emitState();
  }

  async toggle() {
    return this.enabled ? (this.disable(), false) : this.enable();
  }

  // Tocar para falar: ouve uma frase e para sozinho (precisa ser chamado num toque/clique,
  // exigência do Safari/iOS e do Chrome Android para liberar o microfone).
  async tapTalk() {
    if (!this.engine) {
      this.emitState();
      return false;
    }
    if (!this.enabled) {
      this.enabled = true;
      this.deniedByEngine = false;
      if (this.usesOwnMic && !(await this.mic.start()) && this.mic.state === 'denied') {
        this.emitState();
        return false;
      }
    }
    if (this.engine.active) {
      this.engine.stop();
      return true;
    }
    this.engine.start({ once: true });
    this.emitState('listening');
    return true;
  }

  // Aperte-para-falar (tecla V ou botão na tela)
  async pushStart() {
    if (!this.enabled && !(await this.enable())) return;
    this.pushHeld = true;
    if (this.mode === 'push') this.engine?.start();
    this.emitState();
  }

  pushEnd() {
    this.pushHeld = false;
    this.pushReleasedAt = performance.now();
    if (this.mode === 'push') setTimeout(() => !this.pushHeld && this.engine?.stop(), 1500);
    this.emitState();
  }

  setMode(mode) {
    this.settings.set('voiceMode', mode);
    this.engine?.stop();
    if (this.enabled && this.mode === 'continuous') setTimeout(() => this.engine?.start(), 300);
    this.emitState();
  }

  setLang(lang) {
    this.settings.set('voiceLang', lang);
    this.engine?.setLang(lang);
  }

  setSensitivity(v) {
    this.settings.set('micSensitivity', v);
    this.mic.setSensitivity(v);
  }

  onFinal(d, kind) {
    const text = (d.text || '').trim();
    if (!text) return;
    if (!this.accepting()) return this.emit('rejected', { text, reason: 'desativado' });
    // Filtro anti-falso-positivo: no computador, só aceita se o VAD próprio detectou voz
    // humana recentemente (efeitos sonoros do jogo não passam pela banda/limiar do VAD).
    // No celular o próprio reconhecedor do sistema faz essa detecção.
    if (this.usesOwnMic && this.mic.state === 'ready' && kind === 'browser' && !this.mic.recentSpeech(3000)) {
      return this.emit('rejected', { text, reason: 'sem voz detectada' });
    }
    if (d.confidence && d.confidence < 0.25 && text.split(' ').length > 6) return this.emit('rejected', { text, reason: 'baixa confiança' });
    const now = performance.now();
    if (text.toLowerCase() === this.lastText && now - this.lastTextAt < 2000) return;
    this.lastText = text.toLowerCase();
    this.lastTextAt = now;
    this.emit('transcript', { text, confidence: d.confidence, source: kind, alternatives: d.alternatives });
  }
}
