// Perfis de qualidade gráfica + detecção automática + ajuste adaptativo pelo FPS real.
// Ordem de degradação (para não piorar tudo de uma vez): resolução dinâmica → partículas →
// distância de vegetação → sombras. Personagens, armas e criaturas próximas mantêm o detalhe.

export const PRESETS = {
  low: {
    tier: 'low', label: 'Celular básico', shadows: false, shadowMapSize: 512, treeDensity: 0.35, drawDistance: 140,
    particleBudget: 600, pixelRatio: 0.8, terrainSegments: 128, textureSize: 256, detail: 0, antialias: false, water: 'simple',
  },
  mid: {
    tier: 'mid', label: 'Celular intermediário', shadows: true, shadowMapSize: 1024, treeDensity: 0.6, drawDistance: 220,
    particleBudget: 1500, pixelRatio: 1.0, terrainSegments: 192, textureSize: 512, detail: 1, antialias: false, water: 'simple',
  },
  high: {
    tier: 'high', label: 'Celular avançado', shadows: true, shadowMapSize: 2048, treeDensity: 0.85, drawDistance: 320,
    particleBudget: 3000, pixelRatio: 1.5, terrainSegments: 256, textureSize: 1024, detail: 2, antialias: true, water: 'fancy',
  },
  ultra: {
    tier: 'ultra', label: 'Computador', shadows: true, shadowMapSize: 4096, treeDensity: 1, drawDistance: 450,
    particleBudget: 6000, pixelRatio: 2, terrainSegments: 320, textureSize: 1024, detail: 2, antialias: true, water: 'fancy',
  },
};

export const TIER_ORDER = ['low', 'mid', 'high', 'ultra'];

export function detectTier(env = globalThis) {
  const nav = env.navigator || {};
  const ua = nav.userAgent || '';
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (nav.maxTouchPoints > 1 && /Macintosh/.test(ua));
  const cores = nav.hardwareConcurrency || 4;
  const mem = nav.deviceMemory || (mobile ? 3 : 8);
  if (!mobile) return cores >= 6 && mem >= 8 ? 'ultra' : 'high';
  if (cores >= 8 && mem >= 6) return 'high';
  if (cores >= 6 && mem >= 4) return 'mid';
  return 'low';
}

export function makeQuality(tier) {
  return { ...(PRESETS[tier] || PRESETS.mid), resolutionScale: 1 };
}

// Controlador adaptativo: recebe o dt de cada frame e decide quando subir/baixar.
export class AdaptiveQuality {
  constructor(quality, { onChange, target = 50, enabled = true } = {}) {
    this.q = quality;
    this.onChange = onChange;
    this.target = target;
    this.enabled = enabled;
    this.frames = 0;
    this.acc = 0;
    this.cooldown = 3; // segundos sem ajuste após mudança
    this.history = [];
    this.lastFps = 60;
  }

  sample(dt) {
    if (dt <= 0 || dt > 1) return;
    this.frames++;
    this.acc += dt;
    this.cooldown -= dt;
    if (this.acc < 2) return;
    const fps = this.frames / this.acc;
    this.lastFps = fps;
    this.frames = 0;
    this.acc = 0;
    this.history.push(fps);
    if (this.history.length > 5) this.history.shift();
    if (!this.enabled || this.cooldown > 0) return;
    if (fps < this.target - 8) this.degrade(fps);
    else if (fps > this.target + 12 && this.history.length >= 3 && this.history.every((f) => f > this.target + 10)) this.improve();
  }

  degrade(fps) {
    const q = this.q;
    const steps = [
      () => q.resolutionScale > 0.7 && ((q.resolutionScale = Math.max(0.7, q.resolutionScale - 0.15)), 'resolução'),
      () => q.particleBudget > 500 && ((q.particleBudget = Math.floor(q.particleBudget * 0.6)), 'partículas'),
      () => q.drawDistance > 140 && ((q.drawDistance = Math.floor(q.drawDistance * 0.75)), 'distância'),
      () => q.shadows && q.shadowMapSize > 1024 && ((q.shadowMapSize = q.shadowMapSize / 2), 'sombras'),
      () => q.shadows && fps < 30 && ((q.shadows = false), 'sombras off'),
      () => q.resolutionScale > 0.5 && ((q.resolutionScale = Math.max(0.5, q.resolutionScale - 0.1)), 'resolução'),
    ];
    for (const s of steps) {
      const what = s();
      if (what) {
        this.cooldown = 4;
        this.history = [];
        this.onChange?.(q, 'down', what);
        return what;
      }
    }
    return null;
  }

  improve() {
    const q = this.q;
    const base = PRESETS[q.tier];
    let what = null;
    if (q.resolutionScale < 1) {
      q.resolutionScale = Math.min(1, q.resolutionScale + 0.1);
      what = 'resolução';
    } else if (q.particleBudget < base.particleBudget) {
      q.particleBudget = Math.min(base.particleBudget, Math.floor(q.particleBudget * 1.4));
      what = 'partículas';
    } else if (q.drawDistance < base.drawDistance) {
      q.drawDistance = Math.min(base.drawDistance, Math.floor(q.drawDistance * 1.25));
      what = 'distância';
    }
    if (what) {
      this.cooldown = 6;
      this.history = [];
      this.onChange?.(q, 'up', what);
    }
    return what;
  }
}
