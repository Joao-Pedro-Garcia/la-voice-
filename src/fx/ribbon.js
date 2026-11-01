// Fitas (ribbons): linhas grossas voltadas para a câmera (raios, lasers, rastros)
// e rastro de golpe (duas bordas explícitas: ponta e base da lâmina).
import * as THREE from 'three';
import { NOISE_GLSL } from './util.js';

const BEAM_VERT = /* glsl */`
attribute vec3 aDir;
attribute float aSide;
attribute float aWidth;
attribute float aAlong;
varying vec2 vUv;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 t = (modelViewMatrix * vec4(aDir, 0.0)).xyz;
  vec3 viewDir = normalize(-mv.xyz);
  vec3 n = cross(t, viewDir);
  float l = length(n);
  n = l > 1e-5 ? n / l : vec3(1.0, 0.0, 0.0);
  mv.xyz += n * aSide * aWidth * 0.5;
  vUv = vec2(aAlong, aSide * 0.5 + 0.5);
  gl_Position = projectionMatrix * mv;
}
`;

const BEAM_FRAG = /* glsl */`
uniform vec3 uColor;
uniform float uOpacity;
uniform float uCore;
uniform float uTime;
uniform float uScroll;
uniform float uFadeEnds;
${NOISE_GLSL}
varying vec2 vUv;
void main() {
  float across = abs(vUv.y * 2.0 - 1.0);
  float glow = pow(1.0 - across, 1.6);
  float core = smoothstep(0.55, 0.95, 1.0 - across);
  float flow = 1.0;
  if (uScroll > 0.0) flow = 0.65 + 0.7 * fxNoise(vec3(vUv.x * 18.0 - uTime * uScroll, vUv.y * 3.0, uTime * 2.0));
  float ends = uFadeEnds > 0.0 ? smoothstep(0.0, uFadeEnds, vUv.x) * smoothstep(1.0, 1.0 - uFadeEnds, vUv.x) : 1.0;
  vec3 col = mix(uColor, vec3(1.0), core * uCore);
  gl_FragColor = vec4(col * flow, glow * uOpacity * ends);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function makeBeamMaterial({ color = 0xffffff, opacity = 1, core = 1, scroll = 0, fadeEnds = 0 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uOpacity: { value: opacity },
      uCore: { value: core },
      uTime: { value: 0 },
      uScroll: { value: scroll },
      uFadeEnds: { value: fadeEnds },
    },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

/** Fita poligonal voltada para a câmera. */
export class BeamRibbon {
  constructor(maxPoints, material) {
    this.max = maxPoints;
    const n = maxPoints * 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aDir', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSide', new THREE.BufferAttribute(new Float32Array(n), 1));
    g.setAttribute('aWidth', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlong', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    const side = g.attributes.aSide.array;
    for (let i = 0; i < maxPoints; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
    const idx = [];
    for (let i = 0; i < maxPoints - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    g.setIndex(idx);
    this.geometry = g;
    this.material = material;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 12;
  }

  /**
   * @param {THREE.Vector3[]} pts
   * @param {number|((t:number,i:number)=>number)} width
   */
  setPoints(pts, width) {
    const n = Math.min(pts.length, this.max);
    const P = this.geometry.attributes.position.array;
    const D = this.geometry.attributes.aDir.array;
    const W = this.geometry.attributes.aWidth.array;
    const L = this.geometry.attributes.aAlong.array;
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      let dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      if (dx * dx + dy * dy + dz * dz < 1e-12) { dx = 0; dy = 1; dz = 0; }
      const t = n > 1 ? i / (n - 1) : 0;
      const w = typeof width === 'function' ? width(t, i) : width;
      for (let s = 0; s < 2; s++) {
        const k = i * 2 + s;
        P[k * 3] = p.x; P[k * 3 + 1] = p.y; P[k * 3 + 2] = p.z;
        D[k * 3] = dx; D[k * 3 + 1] = dy; D[k * 3 + 2] = dz;
        W[k] = w; L[k] = t;
      }
    }
    const at = this.geometry.attributes;
    at.position.needsUpdate = at.aDir.needsUpdate = at.aWidth.needsUpdate = at.aAlong.needsUpdate = true;
    this.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
  }
}

const TRAIL_VERT = /* glsl */`
attribute float aAge;
attribute float aEdge;
varying float vAge;
varying float vEdge;
void main() {
  vAge = aAge; vEdge = aEdge;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const TRAIL_FRAG = /* glsl */`
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uOpacity;
varying float vAge;
varying float vEdge;
void main() {
  float a = pow(clamp(1.0 - vAge, 0.0, 1.0), 1.6);
  float edge = smoothstep(0.0, 1.0, vEdge);
  float hot = smoothstep(0.7, 1.0, vEdge) * (1.0 - vAge);
  vec3 col = mix(uColor2, uColor, edge);
  col = mix(col, vec3(1.0), hot * 0.8);
  gl_FragColor = vec4(col, a * (0.15 + 0.85 * edge) * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Rastro de golpe: amostras (base, ponta) com idade 0..1. */
export class SwingTrail {
  constructor(maxSamples, color, color2) {
    this.max = maxSamples;
    const n = maxSamples * 2;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAge', new THREE.BufferAttribute(new Float32Array(n), 1).setUsage(THREE.DynamicDrawUsage));
    const edge = new Float32Array(n);
    for (let i = 0; i < maxSamples; i++) { edge[i * 2] = 0; edge[i * 2 + 1] = 1; }
    g.setAttribute('aEdge', new THREE.BufferAttribute(edge, 1));
    const idx = [];
    for (let i = 0; i < maxSamples - 1; i++) {
      const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
    g.setIndex(idx);
    this.geometry = g;
    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) },
        uColor2: { value: new THREE.Color(color2 ?? color) },
        uOpacity: { value: 1 },
      },
      vertexShader: TRAIL_VERT,
      fragmentShader: TRAIL_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 13;
    this.samples = []; // {base, tip, t}
  }

  /** samples: [{base:Vector3, tip:Vector3, age:0..1}] do mais novo ao mais velho */
  write(samples) {
    const n = Math.min(samples.length, this.max);
    const P = this.geometry.attributes.position.array;
    const A = this.geometry.attributes.aAge.array;
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      P.set([s.base.x, s.base.y, s.base.z, s.tip.x, s.tip.y, s.tip.z], i * 6);
      A[i * 2] = A[i * 2 + 1] = s.age;
    }
    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aAge.needsUpdate = true;
    this.geometry.setDrawRange(0, Math.max(0, (n - 1) * 6));
  }

  dispose() {
    this.mesh.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** Polilinha recortada de raio com ramificações (deslocamento de ponto médio). */
export function jaggedPath(a, b, rng, { segments = 16, jitter = 0.18 } = {}) {
  const pts = [];
  const dir = new THREE.Vector3().subVectors(b, a);
  const len = dir.length();
  const up = Math.abs(dir.y / (len || 1)) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const n1 = new THREE.Vector3().crossVectors(dir, up).normalize();
  const n2 = new THREE.Vector3().crossVectors(dir, n1).normalize();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = new THREE.Vector3().copy(a).addScaledVector(dir, t);
    if (i > 0 && i < segments) {
      const env = Math.sin(t * Math.PI);
      const j = len * jitter * env;
      p.addScaledVector(n1, (rng() - 0.5) * 2 * j).addScaledVector(n2, (rng() - 0.5) * 2 * j);
    }
    pts.push(p);
  }
  return pts;
}
