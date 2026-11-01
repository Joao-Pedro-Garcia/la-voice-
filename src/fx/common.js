// Primitivas visuais compartilhadas entre os efeitos (flash, anel de choque, esfera fresnel...).
import * as THREE from 'three';
import { glowTexture, rayTexture } from './textures.js';
import { NOISE_GLSL, easeOutCubic, clamp01 } from './util.js';
import { SHAPE } from './particles.js';

const geoCache = new Map();
export function sharedGeo(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); g.userData.shared = true; geoCache.set(key, g); }
  return g;
}
export const GEO = {
  sphere: () => sharedGeo('sphere', () => new THREE.SphereGeometry(1, 32, 20)),
  sphereLow: () => sharedGeo('sphereLow', () => new THREE.SphereGeometry(1, 16, 10)),
  disc: () => sharedGeo('disc', () => new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2)),
  plane: () => sharedGeo('plane', () => new THREE.PlaneGeometry(1, 1)),
  cylinderOpen: () => sharedGeo('cylOpen', () => new THREE.CylinderGeometry(1, 1, 1, 40, 1, true).translate(0, 0.5, 0)),
  dome: () => sharedGeo('dome', () => new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2)),
};

// ---------- Esfera fresnel aditiva (flash / bolha / domo) ----------
const FRESNEL_VERT = /* glsl */`
varying vec3 vN; varying vec3 vV; varying vec3 vPos; varying vec2 vUv;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  vPos = position; vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const FRESNEL_FRAG = /* glsl */`
uniform vec3 uColor; uniform vec3 uCore; uniform float uOpacity; uniform float uPower; uniform float uFill;
varying vec3 vN; varying vec3 vV;
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), uPower);
  vec3 col = mix(uCore, uColor, f);
  gl_FragColor = vec4(col, (uFill + f) * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export function fresnelMaterial({ color = 0xffffff, core = 0xffffff, opacity = 1, power = 2, fill = 0.25, side = THREE.FrontSide } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uCore: { value: new THREE.Color(core) },
      uOpacity: { value: opacity }, uPower: { value: power }, uFill: { value: fill },
    },
    vertexShader: FRESNEL_VERT, fragmentShader: FRESNEL_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side,
  });
}
export { FRESNEL_VERT };

// ---------- Bola de fogo / núcleo de explosão (ruído) ----------
const BLAST_VERT = /* glsl */`
uniform float uTime; uniform float uDisp;
${NOISE_GLSL}
varying float vNoise; varying vec3 vN; varying vec3 vV;
void main(){
  float n = fxFbm(position * 2.2 + vec3(0.0, -uTime * 1.8, uTime * 0.6));
  vNoise = n;
  vec3 p = position * (1.0 + (n - 0.5) * uDisp);
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const BLAST_FRAG = /* glsl */`
uniform vec3 uHot; uniform vec3 uMid; uniform vec3 uCool; uniform float uBurn; uniform float uOpacity;
varying float vNoise; varying vec3 vN; varying vec3 vV;
void main(){
  float facing = abs(dot(normalize(vN), normalize(vV)));
  float heat = clamp(vNoise * 1.35 + facing * 0.35 - 0.12 - uBurn, 0.0, 1.0);
  if (heat < 0.06) discard;
  vec3 col = heat > 0.5 ? mix(uMid, uHot, (heat - 0.5) * 2.0) : mix(uCool, uMid, heat * 2.0);
  gl_FragColor = vec4(col * (0.45 + heat * 0.75), smoothstep(0.06, 0.45, heat) * (0.35 + 0.5 * facing) * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export function blastMaterial(pal, { additive = true } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: Math.random() * 10 }, uDisp: { value: 0.55 },
      uHot: { value: pal.particle[0].clone() }, uMid: { value: pal.particle[1].clone() }, uCool: { value: pal.particle[2].clone() },
      uBurn: { value: 0 }, uOpacity: { value: 1 },
    },
    vertexShader: BLAST_VERT, fragmentShader: BLAST_FRAG,
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
}

// ---------- Anel no chão (onda de choque) ----------
const RING_VERT = /* glsl */`varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uR; uniform float uW; uniform float uOpacity; uniform float uTime; uniform float uFillIn;
${NOISE_GLSL}
varying vec2 vP;
void main(){
  float d = length(vP);
  if (d > 1.0) discard;
  float ring = exp(-pow((d - uR) / max(uW, 1e-3), 2.0));
  float inner = uFillIn * smoothstep(uR, 0.0, d) * 0.25 * step(d, uR);
  float a = atan(vP.y, vP.x);
  float br = 0.6 + 0.6 * fxNoise(vec3(cos(a) * 3.0, sin(a) * 3.0, uTime * 3.0 + d * 4.0));
  vec3 col = mix(uColor, vec3(1.0), ring * ring * 0.35);
  gl_FragColor = vec4(col, (ring * br * 0.8 + inner) * uOpacity * smoothstep(1.0, 0.92, d));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export function ringMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uR: { value: 0 }, uW: { value: 0.08 },
      uOpacity: { value: 1 }, uTime: { value: 0 }, uFillIn: { value: 1 },
    },
    vertexShader: RING_VERT, fragmentShader: RING_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
}

/** Anel que se expande no chão. */
export function groundRing(ctx, pos, color, radius, life = 0.6, { width = 0.07, fill = 1, y = 0.04 } = {}) {
  const mat = ringMaterial(color);
  mat.uniforms.uW.value = width;
  mat.uniforms.uFillIn.value = fill;
  const m = new THREE.Mesh(GEO.disc(), mat);
  m.position.set(pos.x, pos.y + y, pos.z);
  m.scale.setScalar(radius);
  m.renderOrder = 11;
  ctx.scene.add(m);
  let t = 0;
  ctx.add({
    update(dt) {
      t += dt;
      const k = clamp01(t / life);
      mat.uniforms.uR.value = 0.08 + 0.88 * easeOutCubic(k);
      mat.uniforms.uOpacity.value = 1 - k * k;
      mat.uniforms.uTime.value += dt;
      return t < life;
    },
    dispose() { m.removeFromParent(); mat.dispose(); },
  });
  return m;
}

/** Sprite de brilho que cresce e some. */
export function flash(ctx, pos, color, size, life = 0.25, { rays = false, grow = 1.4, opacity = 1, follow = null } = {}) {
  const mat = new THREE.SpriteMaterial({
    map: rays ? rayTexture() : glowTexture(), color: new THREE.Color(color),
    blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity,
  });
  const s = new THREE.Sprite(mat);
  s.position.copy(pos);
  s.renderOrder = 14;
  ctx.scene.add(s);
  let t = 0;
  const rot = Math.random() * Math.PI;
  ctx.add({
    update(dt) {
      t += dt;
      const k = clamp01(t / life);
      if (follow) follow(s.position);
      s.scale.setScalar(size * (1 + (grow - 1) * easeOutCubic(k)));
      mat.opacity = opacity * (1 - k) * (1 - k);
      mat.rotation = rot + k * 0.6;
      return t < life;
    },
    dispose() { s.removeFromParent(); mat.dispose(); },
  });
  return s;
}

/** Esfera fresnel que expande (flash volumétrico). */
export function sphereFlash(ctx, pos, color, radius, life = 0.3, { from = 0.2, power = 1.5, fill = 0.5 } = {}) {
  const mat = fresnelMaterial({ color, core: 0xffffff, power, fill });
  const m = new THREE.Mesh(GEO.sphereLow(), mat);
  m.position.copy(pos);
  m.renderOrder = 13;
  ctx.scene.add(m);
  let t = 0;
  ctx.add({
    update(dt) {
      t += dt;
      const k = clamp01(t / life);
      m.scale.setScalar(radius * (from + (1 - from) * easeOutCubic(k)));
      mat.uniforms.uOpacity.value = Math.pow(1 - k, 2);
      return t < life;
    },
    dispose() { m.removeFromParent(); mat.dispose(); },
  });
  return m;
}

const _d = new THREE.Vector3();
/** Burst genérico no pool aditivo (ou sólido). */
export function particleBurst(ctx, pos, o = {}) {
  const pool = o.solid ? ctx.solid : ctx.glow;
  const count = ctx.n(o.count ?? 30);
  const colors = o.colors && o.colors.length ? o.colors : [0xffffff];
  const speed = o.speed ?? 4, size = o.size ?? 0.18, life = o.life ?? 0.8, spread = o.spread ?? 1;
  const dir = o.dir;
  for (let i = 0; i < count; i++) {
    const r = ctx.rng;
    _d.set(r() * 2 - 1, r() * 2 - 1, r() * 2 - 1);
    if (_d.lengthSq() > 1 || _d.lengthSq() < 1e-4) { i--; continue; }
    _d.normalize();
    if (dir) _d.multiplyScalar(spread).add(dir).normalize();
    else if (o.up) _d.y = Math.abs(_d.y) * (o.up === true ? 1 : o.up);
    const sp = speed * (0.35 + r() * 0.65);
    const c = colors[(r() * colors.length) | 0];
    pool.emit({
      pos: o.jitter ? new THREE.Vector3(pos.x + (r() - 0.5) * o.jitter, pos.y + (r() - 0.5) * o.jitter, pos.z + (r() - 0.5) * o.jitter) : pos,
      vel: _d.clone().multiplyScalar(sp),
      gravity: o.gravity ?? 0, drag: o.drag ?? 1.5,
      life: life * (0.6 + r() * 0.6),
      color: c, color1: o.color1 ?? c,
      size: size * (0.6 + r() * 0.8), size1: o.size1 != null ? o.size1 * (0.6 + r() * 0.8) : size * 0.2,
      shape: o.shape ?? SHAPE.DOT, alpha: o.alpha ?? 1,
      rot: r() * 6.28, spin: o.spin ? (r() - 0.5) * o.spin : 0,
    });
  }
}
