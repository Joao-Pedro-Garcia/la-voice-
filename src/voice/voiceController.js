// Orquestra microfone + reconhecedor + filtros contra falsos reconhecimentos.
// Emite: 'state' (estado geral), 'level' (nível do mic), 'interim' (texto parcial),
// 'transcript' (fala final aceita), 'rejected' (fala descartada e motivo), 'error'.
import { Microphone } from './microphone.js';
import { WebSpeechRecognizer, ServerRecognizer } from './recognizers.js';

export class VoiceController {
  constructor({ audio, settings, serverStt = false }) {
    this.audio = audio;
    this.settings = settings;
    this.serverStt = serverStt;
    this.listeners = {};
    this.enabled = false;
    this.pushHeld = false;
    this.pushReleasedAt = 0;
    this.lastText = '';
    this.lastTextAt = 0;
    this.mic = new Microphone({ getGameOutputLevel: () => audio?.getOutputLevel() || 0, sensitivity: settings.get('micSensitivity') });
    this.mic.on('level', (r) => this.emit('level', r));
    this.mic.on('state', () => this.emitState());
    this.mic.on('speechstart', () => {
      this.audio?.duck(true);
      this.emit('speech', true);
    });
    this.mic.on('speechend', () => {
      this.audio?.duck(false);
      this.emit('speech', false);
    });
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

  wire(rec, kind) {
    rec.kind = kind;
    rec.on('interim', (d) => this.accepting() && this.emit('interim', d));
    rec.on('final', (d) => this.onFinal(d, kind));
    rec.on('error', (e) => {
      this.emit('error', e);
      if (e.code === 'not-allowed' || e.code === 'service-not-allowed') {
        this.enabled = false;
        this.emitState('denied');
      }
    });
    return rec;
  }

  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }

  emit(ev, d) {
    for (const fn of this.listeners[ev] || []) fn(d);
  }

  get mode() {
    return this.settings.get('voiceMode'); // continuous | push
  }

  status() {
    if (!this.engine) return 'unsupported';
    if (this.mic.state === 'denied') return 'denied';
    if (this.mic.state === 'requesting') return 'requesting';
    if (!this.enabled) return 'off';
    if (this.mode === 'push' && !this.pushHeld) return 'standby';
    return this.mic.speaking ? 'hearing' : 'listening';
  }

  emitState(forced) {
    this.emit('state', forced || this.status());
  }

  accepting() {
    if (!this.enabled) return false;
    if (this.mode === 'push') return this.pushHeld || performance.now() - this.pushReleasedAt < 1800;
    return true;
  }

  async enable() {
    if (!this.engine) {
      this.emitState();
      return false;
    }
    const ok = await this.mic.start();
    // Se o VAD próprio não conseguir o microfone, o reconhecedor do navegador ainda pode funcionar.
    if (!ok && this.mic.state === 'denied') {
      this.emitState();
      return false;
    }
    this.enabled = true;
    if (this.mode === 'continuous') this.engine.start();
    this.emitState();
    return true;
  }

  disable() {
    this.enabled = false;
    this.engine?.stop();
    this.emitState();
  }

  async toggle() {
    return this.enabled ? (this.disable(), false) : this.enable();
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
    if (!this.enabled) return;
    if (mode === 'continuous') this.engine?.start();
    else this.engine?.stop();
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
    // Filtro anti-falso-positivo: só aceita se o VAD detectou voz humana recentemente
    // (efeitos sonoros do jogo não passam pela banda/limiar do VAD).
    if (this.mic.state === 'ready' && kind === 'browser' && !this.mic.recentSpeech(3000)) {
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
