// VAD com sinais sintéticos: silêncio, ruído, voz (banda da fala) e efeitos do jogo.
import { describe, it, expect } from 'vitest';
import { VoiceActivityDetector } from '../../src/voice/vad.js';

const BINS = 512;
const SR = 48000;
const binHz = SR / 1024;

function frame({ rms, speechBand = true }) {
  const f = new Float32Array(BINS).fill(-120);
  for (let i = 1; i < BINS; i++) {
    const hz = i * binHz;
    const inBand = hz >= 300 && hz <= 3400;
    if (speechBand ? inBand : hz < 200 || hz > 6000) f[i] = 20 * Math.log10(rms + 1e-9) - 10;
  }
  return f;
}

function run(vad, seq) {
  const events = [];
  vad.on('start', () => events.push('start'));
  vad.on('end', (e) => events.push(e.valid ? 'end' : 'end-short'));
  for (const [ms, opts] of seq) for (let t = 0; t < ms; t += 30) vad.process({ freqDb: frame(opts), rms: opts.rms, dtMs: 30, gameOutput: opts.game || 0 });
  return events;
}

describe('VAD', () => {
  it('não dispara com silêncio/ruído baixo', () => {
    const v = new VoiceActivityDetector({ sampleRate: SR });
    expect(run(v, [[3000, { rms: 0.002 }]])).toEqual([]);
  });
  it('detecta início e fim de fala', () => {
    const v = new VoiceActivityDetector({ sampleRate: SR });
    expect(run(v, [[1500, { rms: 0.002 }], [900, { rms: 0.05 }], [1200, { rms: 0.002 }]])).toEqual(['start', 'end']);
  });
  it('estalos curtos não viram fala válida', () => {
    const v = new VoiceActivityDetector({ sampleRate: SR });
    const ev = run(v, [[1500, { rms: 0.002 }], [120, { rms: 0.08 }], [1200, { rms: 0.002 }]]);
    expect(ev.includes('end')).toBe(false);
  });
  it('som fora da banda de voz (explosão grave) é ignorado', () => {
    const v = new VoiceActivityDetector({ sampleRate: SR });
    expect(run(v, [[1500, { rms: 0.002 }], [1000, { rms: 0.1, speechBand: false }]])).toEqual([]);
  });
  it('som alto do próprio jogo eleva o limiar', () => {
    const v = new VoiceActivityDetector({ sampleRate: SR });
    expect(run(v, [[1500, { rms: 0.002 }], [1000, { rms: 0.03, game: 1 }]])).toEqual([]);
  });
  it('pausas curtas não cortam a frase', () => {
    const v = new VoiceActivityDetector({ sampleRate: SR });
    const ev = run(v, [[1500, { rms: 0.002 }], [600, { rms: 0.05 }], [300, { rms: 0.002 }], [600, { rms: 0.05 }], [1200, { rms: 0.002 }]]);
    expect(ev).toEqual(['start', 'end']);
  });
});
