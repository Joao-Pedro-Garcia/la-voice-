// Renderizador, cena, câmera e laço principal, com qualidade adaptativa.
import * as THREE from 'three';
import { AdaptiveQuality, makeQuality, detectTier } from './quality.js';

export class Engine {
  constructor(canvas, settings) {
    this.settings = settings;
    const tier = settings.get('quality') === 'auto' ? detectTier() : settings.get('quality');
    this.quality = makeQuality(tier);
    if (!settings.get('shadows')) this.quality.shadows = false;
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.antialias, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = this.quality.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1500);
    this.clock = new THREE.Clock();
    this.updaters = new Set();
    this.running = false;
    this.fps = 60;
    this.adaptive = new AdaptiveQuality(this.quality, {
      enabled: settings.get('adaptive'),
      onChange: (q, dir, what) => {
        this.applyQuality();
        this.onQualityChange?.(q, dir, what);
      },
    });
    this.resize = this.resize.bind(this);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  applyQuality() {
    const q = this.quality;
    const pr = Math.min(window.devicePixelRatio || 1, q.pixelRatio) * (q.resolutionScale || 1);
    this.renderer.setPixelRatio(Math.max(0.4, pr));
    if (this.renderer.shadowMap.enabled !== q.shadows) {
      this.renderer.shadowMap.enabled = q.shadows;
      this.scene.traverse((o) => o.material && (o.material.needsUpdate = true));
    }
    this.resize();
  }

  setTier(tier) {
    const keep = { resolutionScale: 1 };
    Object.assign(this.quality, makeQuality(tier), keep);
    if (!this.settings.get('shadows')) this.quality.shadows = false;
    this.applyQuality();
    this.onQualityChange?.(this.quality, 'set', tier);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = Math.min(window.devicePixelRatio || 1, this.quality.pixelRatio) * (this.quality.resolutionScale || 1);
    this.renderer.setPixelRatio(Math.max(0.4, pr));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < h ? 72 : 60; // retrato no celular: campo de visão maior
    this.camera.updateProjectionMatrix();
  }

  add(fn) {
    this.updaters.add(fn);
    return () => this.updaters.delete(fn);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.clock.getDelta();
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      const rawDt = this.clock.getDelta();
      const dt = Math.min(rawDt, 0.1);
      this.adaptive.sample(rawDt);
      this.fps = this.fps * 0.95 + (1 / Math.max(rawDt, 1e-3)) * 0.05;
      for (const fn of this.updaters) fn(dt);
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  info() {
    const i = this.renderer.info;
    return { fps: Math.round(this.fps), calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, tier: this.quality.tier, scale: this.quality.resolutionScale };
  }
}
