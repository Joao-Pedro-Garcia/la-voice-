// Sistema de partículas na GPU: um único THREE.Points por pool, buffer circular.
// A CPU só escreve atributos no nascimento da partícula; posição, cor, tamanho e alpha
// ao longo da vida são calculados no vertex shader (balística com arrasto + órbita).
import * as THREE from 'three';
import { particleAtlas } from './textures.js';

export const SHAPE = { DOT: 0, SPARK: 1, SMOKE: 2, SHARD: 3 };

const VERT = /* glsl */`
uniform float uTime;
uniform float uScale;
attribute vec3 aVel;
attribute vec4 aPhys;   // gravidade(y), arrasto, nascimento, vida
attribute vec4 aOrbit;  // raio, ângulo0, velocidade angular, crescimento do raio
attribute vec3 aColor0;
attribute vec3 aColor1;
attribute vec4 aSize;   // tamanho inicial, final, forma, alpha
attribute vec2 aRot;    // rotação inicial, giro
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
varying float vAngle;
void main() {
  float age = uTime - aPhys.z;
  float life = aPhys.w;
  float k = age / max(life, 1e-4);
  if (life <= 0.0 || k < 0.0 || k > 1.0) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    gl_PointSize = 0.0;
    vAlpha = 0.0;
    return;
  }
  vec3 p = position;
  float drag = aPhys.y;
  if (drag > 0.001) {
    float f = (1.0 - exp(-drag * age)) / drag;
    p += aVel * f;
    p.y += aPhys.x * (age - f) / drag;
  } else {
    p += aVel * age;
    p.y += 0.5 * aPhys.x * age * age;
  }
  float r = aOrbit.x + aOrbit.w * age;
  if (abs(r) > 1e-5) {
    float a = aOrbit.y + aOrbit.z * age;
    p.x += cos(a) * r;
    p.z += sin(a) * r;
  }
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float size = mix(aSize.x, aSize.y, k);
  gl_PointSize = clamp(size * uScale / max(-mv.z, 0.05), 0.0, 360.0);
  vColor = mix(aColor0, aColor1, k);
  vAlpha = aSize.w * smoothstep(0.0, 0.06, k) * (1.0 - smoothstep(0.55, 1.0, k));
  vShape = aSize.z;
  vAngle = aRot.x + aRot.y * age;
}
`;

const FRAG = /* glsl */`
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
varying float vShape;
varying float vAngle;
void main() {
  if (vAlpha <= 0.002) discard;
  vec2 c = gl_PointCoord - 0.5;
  float s = sin(vAngle), co = cos(vAngle);
  c = mat2(co, -s, s, co) * c;
  c = clamp(c + 0.5, 0.01, 0.99);
  float idx = floor(vShape + 0.5);
  vec2 cell = vec2(mod(idx, 2.0), 1.0 - floor(idx / 2.0));
  vec4 t = texture2D(uMap, (cell + c) * 0.5);
  gl_FragColor = vec4(vColor * t.rgb, t.a * vAlpha);
  if (gl_FragColor.a < 0.003) discard;
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const _v = new THREE.Vector3();
const _c = new THREE.Color();

export class ParticlePool {
  /**
   * @param {number} capacity máximo absoluto alocado
   * @param {{additive?: boolean, worldSpace?: boolean}} opts
   */
  constructor(capacity, { additive = true, worldSpace = true, renderOrder = 10 } = {}) {
    this.time = 0;
    this.cursor = 0;
    this.additive = additive;
    this._alloc(Math.max(16, capacity | 0));
    this.budget = this.capacity;
    this.material = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uMap: { value: particleAtlas() } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = renderOrder;
    if (worldSpace) {
      // Ignora a transformação do pai: partículas sempre em coordenadas de mundo.
      this.points.matrixAutoUpdate = false;
      this.points.updateMatrixWorld = function () { this.matrixWorld.identity(); };
    }
    const mat = this.material;
    this.points.onBeforeRender = (renderer, scene, camera) => {
      renderer.getDrawingBufferSize(this._size || (this._size = new THREE.Vector2()));
      const proj = camera.projectionMatrix.elements[5] || 1;
      mat.uniforms.uScale.value = proj * this._size.y * 0.5;
    };
  }

  _alloc(cap) {
    this.capacity = cap;
    const g = new THREE.BufferGeometry();
    const mk = (n) => { const a = new THREE.BufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    g.setAttribute('position', mk(3));
    g.setAttribute('aVel', mk(3));
    g.setAttribute('aPhys', mk(4));
    g.setAttribute('aOrbit', mk(4));
    g.setAttribute('aColor0', mk(3));
    g.setAttribute('aColor1', mk(3));
    g.setAttribute('aSize', mk(4));
    g.setAttribute('aRot', mk(2));
    this.attrs = g.attributes;
    this._names = ['position', 'aVel', 'aPhys', 'aOrbit', 'aColor0', 'aColor1', 'aSize', 'aRot'];
    this.geometry = g;
    this._dirtyMin = Infinity; this._dirtyMax = -1;
    if (this.points) {
      const old = this.points.geometry;
      this.points.geometry = g;
      old.dispose();
    }
  }

  setBudget(n) {
    n = Math.max(16, n | 0);
    if (n > this.capacity) {
      this._alloc(n);
      this.cursor = 0;
    }
    this.budget = n;
    if (this.cursor >= n) this.cursor = 0;
    this.geometry.setDrawRange(0, n);
  }

  /**
   * Emite uma partícula.
   * o = { pos, vel, gravity, drag, life, color, color1, size, size1, shape, alpha, orbit:[r,a0,w,grow], rot, spin }
   */
  emit(o) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.budget;
    const A = this.attrs;
    const p = o.pos;
    A.position.array.set([p.x, p.y, p.z], i * 3);
    const v = o.vel;
    if (v) A.aVel.array.set([v.x, v.y, v.z], i * 3); else A.aVel.array.set([0, 0, 0], i * 3);
    A.aPhys.array.set([o.gravity || 0, o.drag || 0, this.time + (o.delay || 0), o.life || 1], i * 4);
    const orb = o.orbit;
    if (orb) A.aOrbit.array.set([orb[0], orb[1], orb[2], orb[3] || 0], i * 4); else A.aOrbit.array.set([0, 0, 0, 0], i * 4);
    const c0 = o.color && o.color.isColor ? o.color : _c.set(o.color ?? 0xffffff);
    A.aColor0.array.set([c0.r, c0.g, c0.b], i * 3);
    const c1 = o.color1 == null ? c0 : (o.color1.isColor ? o.color1 : _c.set(o.color1));
    A.aColor1.array.set([c1.r, c1.g, c1.b], i * 3);
    const s = o.size ?? 0.2;
    A.aSize.array.set([s, o.size1 ?? s * 0.4, o.shape || 0, o.alpha ?? 1], i * 4);
    A.aRot.array.set([o.rot ?? 0, o.spin ?? 0], i * 2);
    if (i < this._dirtyMin) this._dirtyMin = i;
    if (i > this._dirtyMax) this._dirtyMax = i;
  }

  update(dt) {
    this.time += dt;
    this.material.uniforms.uTime.value = this.time;
    if (this._dirtyMax >= 0) {
      const start = this._dirtyMin, count = this._dirtyMax - this._dirtyMin + 1;
      for (const n of this._names) {
        const a = this.attrs[n];
        a.clearUpdateRanges();
        a.addUpdateRange(start * a.itemSize, count * a.itemSize);
        a.needsUpdate = true;
      }
      this._dirtyMin = Infinity; this._dirtyMax = -1;
    }
  }

  dispose() {
    this.points.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
  }
}

export { _v as _tmpVec };
