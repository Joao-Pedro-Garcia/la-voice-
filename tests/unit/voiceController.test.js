// Fluxo de voz no celular: "tocar para falar" sem abrir um segundo fluxo de microfone.
import { describe, it, expect, beforeEach } from 'vitest';
import { VoiceController, detectPlatform } from '../../src/voice/voiceController.js';
import { Settings } from '../../src/save/storage.js';

// Reconhecedor de voz falso (no lugar do window.webkitSpeechRecognition do navegador)
class FakeSR {
  static last = null;
  constructor() {
    FakeSR.last = this;
    this.started = false;
  }
  start() {
    this.started = true;
    setTimeout(() => this.onaudiostart?.(), 0);
  }
  stop() {
    this.onend?.();
  }
  abort() {
    this.onend?.();
  }
  say(text) {
    this.onspeechstart?.();
    const alt = { transcript: text, confidence: 0.9 };
    const res = Object.assign([alt], { isFinal: true });
    this.onresult?.({ resultIndex: 0, results: [res] });
    this.onspeechend?.();
    if (!this.continuous) this.onend?.();
  }
}

beforeEach(() => {
  globalThis.window = { webkitSpeechRecognition: FakeSR };
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { mediaDevices: { getUserMedia: () => Promise.reject(new Error('não deveria abrir o microfone')) } } });
});

const android = { ios: false, android: true, mobile: true };
const desktop = { ios: false, android: false, mobile: false };

describe('voz no celular', () => {
  it('detecta Android e iPhone pelo navegador', () => {
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) Chrome/130 Mobile' }).android).toBe(true);
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Safari/604.1' }).ios).toBe(true);
    expect(detectPlatform({ userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130' }).mobile).toBe(false);
  });

  it('modo automático vira "tocar para falar" no celular e contínuo no computador', () => {
    const s = new Settings();
    expect(new VoiceController({ settings: s, platform: android }).mode).toBe('tap');
    expect(new VoiceController({ settings: s, platform: desktop }).mode).toBe('continuous');
  });

  it('tocar para falar ouve uma frase e entrega o texto, sem abrir microfone paralelo', async () => {
    const v = new VoiceController({ settings: new Settings(), platform: android });
    const got = [];
    v.on('transcript', (t) => got.push(t.text));
    expect(v.usesOwnMic).toBe(false);
    await v.tapTalk();
    expect(FakeSR.last.started).toBe(true);
    expect(FakeSR.last.continuous).toBe(false);
    FakeSR.last.say('espada de fogo');
    expect(got).toEqual(['espada de fogo']);
    expect(v.engine.active).toBe(false);
    expect(v.status()).toBe('tap');
  });

  it('permissão negada vira estado "bloqueado" com orientação', async () => {
    const v = new VoiceController({ settings: new Settings(), platform: android });
    await v.tapTalk();
    FakeSR.last.onerror({ error: 'not-allowed' });
    expect(v.status()).toBe('denied');
  });

  it('sem reconhecimento de voz no navegador, informa e cai para digitação', () => {
    globalThis.window = {};
    const v = new VoiceController({ settings: new Settings(), platform: android });
    expect(v.status()).toBe('unsupported');
  });
});
