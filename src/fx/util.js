// Utilidades compartilhadas pelos efeitos e pelas armas (sem dependências além do three).
import * as THREE from 'three';
import { elementInfo } from '../../shared/elements.js';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rand() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

const _paletteCache = new Map();
/** Paleta de cores de um elemento como THREE.Color (cache). */
export function elementPalette(element) {
  const key = element || 'none';
  let p = _paletteCache.get(key);
  if (!p) {
    const info = elementInfo(element);
    p = {
      id: info.id,
      color: new THREE.Color(info.color),
      glow: new THREE.Color(info.glow),
      particle: info.particle.map((c) => new THREE.Color(c)),
    };
    _paletteCache.set(key, p);
  }
  return p;
}

export function toColor(c, fallback = 0xffffff) {
  if (c == null) return new THREE.Color(fallback);
  if (c.isColor) return c;
  return new THREE.Color(c);
}

export const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t) => t * t * t;
export const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
export const smooth = (a, b, t) => { const x = clamp01((t - a) / (b - a)); return x * x * (3 - 2 * x); };

export function randomInSphere(rng, out = new THREE.Vector3()) {
  for (;;) {
    out.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
    if (out.lengthSq() <= 1) return out;
  }
}

export function randomOnSphere(rng, out = new THREE.Vector3()) {
  const u = rng() * 2 - 1, th = rng() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  return out.set(s * Math.cos(th), u, s * Math.sin(th));
}

/** Libera geometria/material (não texturas compartilhadas marcadas com userData.shared). */
export function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose();
    const m = o.material;
    if (m) {
      const list = Array.isArray(m) ? m : [m];
      for (const mat of list) {
        if (mat.userData?.shared) continue;
        for (const k of Object.keys(mat)) {
          const v = mat[k];
          if (v && v.isTexture && !v.userData?.shared) v.dispose();
        }
        mat.dispose();
      }
    }
  });
}

// Trecho GLSL de ruído (value noise 3D + fbm), barato.
export const NOISE_GLSL = /* glsl */`
float fxHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float fxNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(fxHash(i + vec3(0,0,0)), fxHash(i + vec3(1,0,0)), f.x),
                 mix(fxHash(i + vec3(0,1,0)), fxHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(fxHash(i + vec3(0,0,1)), fxHash(i + vec3(1,0,1)), f.x),
                 mix(fxHash(i + vec3(0,1,1)), fxHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fxFbm(vec3 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++){ s += a * fxNoise(p); p *= 2.03; a *= 0.5; } return s; }
`;
