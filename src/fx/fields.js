// Campos e auras: escudo, aura, cura, chão congelado, barreira, distorção temporal.
import * as THREE from 'three';
import { elementPalette, clamp01, easeOutBack, easeOutCubic, mulberry32, NOISE_GLSL } from './util.js';
import { SHAPE } from './particles.js';
import { GEO, flash, groundRing, particleBurst, sharedGeo, FRESNEL_VERT } from './common.js';
import { runeDecal, wallMaterial } from './blasts.js';
import { crystalGeometry } from './shapes.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Centro aproximado de um objeto (offset em relação à origem de mundo dele). */
function centerOffset(obj, fallbackY) {
  const off = V(0, fallbackY, 0);
  if (!obj) return off;
  try {
    obj.updateWorldMatrix(true, true);
    const box = new THREE.Box3().setFromObject(obj);
    if (!box.isEmpty()) {
      const c = box.getCenter(V());
      const o = obj.getWorldPosition(V());
      off.subVectors(c, o);
    }
  } catch { /* objeto sem geometria */ }
  return off;
}

// ---------- Escudo ----------
const SHIELD_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uTime; uniform float uOpacity; uniform float uHit;
varying vec3 vN; varying vec3 vV; varying vec3 vPos; varying vec2 vUv;
float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); }
vec4 hexCoords(vec2 uv){
  vec2 r = vec2(1.0, 1.7320508); vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h; vec2 b = mod(uv - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  return vec4(gv, uv - gv);
}
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  vec4 hc = hexCoords(vec2(vUv.x * 28.0, vUv.y * 14.0));
  float edge = smoothstep(0.42, 0.5, hexDist(hc.xy));
  float cellRand = fract(sin(dot(hc.zw, vec2(12.9898, 78.233))) * 43758.5453);
  float cellPulse = 0.5 + 0.5 * sin(uTime * 2.0 + cellRand * 6.28);
  float ripple = 0.5 + 0.5 * sin(vPos.y * 9.0 - uTime * 4.0);
  float scan = smoothstep(0.92, 1.0, sin(vPos.y * 2.0 - uTime * 2.5));
  float a = f * 0.9 + edge * (0.12 + 0.35 * f) * (0.5 + 0.5 * cellPulse) + scan * 0.15 + ripple * 0.04 + uHit * (0.35 + edge);
  vec3 col = mix(uColor, vec3(1.0), f * 0.45 + edge * 0.25 + uHit * 0.4);
  gl_FragColor = vec4(col, a * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export function shieldBubble(ctx, obj, radius = 1.3, color = 0x7fd8ff) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uOpacity: { value: 1 }, uHit: { value: 0 } },
    vertexShader: FRESNEL_VERT, fragmentShader: SHIELD_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const m = new THREE.Mesh(GEO.sphere(), mat);
  m.renderOrder = 15;
  ctx.scene.add(m);
  const off = centerOffset(obj, radius * 0.65);
  const p = V();
  let t = 0, closing = -1, alive = true;
  const follow = () => { if (obj) obj.getWorldPosition(p); m.position.copy(p).add(off); };
  follow();
  flash(ctx, m.position.clone(), color, radius * 3, 0.35);
  const handle = {
    mesh: m,
    pulse() { mat.uniforms.uHit.value = 1; },
    dispose() {
      if (closing < 0 && alive) { closing = 0; particleBurst(ctx, m.position, { colors: [color, 0xffffff], count: 30, speed: 4, size: 0.14, life: 0.5, shape: SHAPE.SPARK }); }
    },
  };
  ctx.add({
    update(dt) {
      t += dt;
      follow();
      mat.uniforms.uTime.value = t;
      mat.uniforms.uHit.value = Math.max(0, mat.uniforms.uHit.value - dt * 3);
      let s = radius * easeOutBack(clamp01(t / 0.35));
      if (closing >= 0) {
        closing += dt;
        const k = clamp01(closing / 0.25);
        s = radius * (1 + 0.25 * k);
        mat.uniforms.uOpacity.value = 1 - k;
        if (k >= 1) return false;
      }
      m.scale.setScalar(Math.max(0.001, s));
      return true;
    },
    dispose() { alive = false; m.removeFromParent(); mat.dispose(); },
  });
  return handle;
}

// ---------- Aura ----------
const AURA_FRAG = /* glsl */`
uniform vec3 uColor; uniform vec3 uGlow; uniform float uTime; uniform float uOpacity;
${NOISE_GLSL}
varying vec2 vUv;
void main(){
  float v = vUv.y;
  float n = fxFbm(vec3(vUv.x * 8.0, v * 3.0 - uTime * 1.6, uTime * 0.3));
  float flame = smoothstep(0.25, 0.8, n + (1.0 - v) * 0.55 - v * 0.35);
  float a = flame * pow(1.0 - v, 0.7) * uOpacity;
  vec3 col = mix(uColor, uGlow, flame * (1.0 - v));
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export function aura(ctx, obj, element, duration = 6) {
  const pal = elementPalette(element);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: pal.color.clone() }, uGlow: { value: pal.glow.clone() }, uTime: { value: Math.random() * 9 }, uOpacity: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: AURA_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const shellGeo = sharedGeo('auraShell', () => {
    const pts = [];
    for (let i = 0; i <= 12; i++) { const y = i / 12; pts.push(new THREE.Vector2(0.55 + 0.25 * Math.sin(y * Math.PI) - y * 0.25, y)); }
    return new THREE.LatheGeometry(pts, 32);
  });
  const shell = new THREE.Mesh(shellGeo, mat);
  shell.renderOrder = 12;
  ctx.scene.add(shell);
  const p = V();
  let t = 0, acc = 0, ringAcc = 0, stopAt = -1;
  groundRing(ctx, obj ? obj.getWorldPosition(V()) : V(), pal.color, 2, 0.6);
  const handle = { dispose() { if (stopAt < 0) stopAt = t; } };
  ctx.add({
    update(dt) {
      t += dt; acc += dt; ringAcc += dt;
      if (obj) obj.getWorldPosition(p);
      const sc = obj ? Math.max(0.3, obj.scale.y) : 1;
      shell.position.copy(p);
      shell.scale.set(sc, 2.1 * sc, sc);
      shell.rotation.y += dt * 0.6;
      const fadeOut = stopAt >= 0 ? clamp01((t - stopAt) / 0.4) : clamp01((t - duration + 0.5) / 0.5);
      const env = Math.min(1, t / 0.4) * (1 - fadeOut);
      mat.uniforms.uOpacity.value = 0.6 * env;
      mat.uniforms.uTime.value += dt;
      if (acc > 0.04 && env > 0.2) {
        acc = 0;
        const a = ctx.rng() * Math.PI * 2;
        ctx.glow.emit({ pos: V(p.x + Math.cos(a) * 0.5 * sc, p.y + ctx.rng() * 0.4, p.z + Math.sin(a) * 0.5 * sc), vel: V(0, 1.6 * sc, 0), orbit: [0.05, a, 2, 0.1], life: 1.0, color: pal.particle[(ctx.rng() * 3) | 0], color1: pal.glow, size: 0.14 * sc, size1: 0.02, shape: ctx.rng() < 0.3 ? SHAPE.SPARK : SHAPE.DOT });
      }
      if (ringAcc > 1.2 && env > 0.5) { ringAcc = 0; groundRing(ctx, p, pal.color, 1.6 * sc, 0.8, { width: 0.05, fill: 0 }); }
      return fadeOut < 1;
    },
    dispose() { shell.removeFromParent(); mat.dispose(); },
  });
  return handle;
}

export function healAura(ctx, obj, duration = 2.6) {
  const green = 0x7dff9a, white = 0xeaffef, gold = 0xfff3a0;
  const p = obj ? obj.getWorldPosition(V()) : V();
  runeDecal(ctx, p, 0x5dff8a, 1.5, duration);
  groundRing(ctx, p, green, 2.2, 0.8, { width: 0.06 });
  aura(ctx, obj, 'poison', duration);
  let t = 0, acc = 0;
  const q = V();
  ctx.add({
    update(dt) {
      t += dt; acc += dt;
      if (obj) obj.getWorldPosition(q); else q.copy(p);
      if (acc > 0.025 && t < duration - 0.4) {
        acc = 0;
        const a = ctx.rng() * Math.PI * 2;
        ctx.glow.emit({ pos: V(q.x, q.y + 0.1, q.z), vel: V(0, 1.4 + ctx.rng(), 0), orbit: [0.7, a, 3.5, -0.25], life: 1.2, color: ctx.rng() < 0.3 ? gold : green, color1: white, size: 0.15, size1: 0.03, shape: SHAPE.SPARK });
      }
      return t < duration;
    },
    dispose() {},
  });
  flash(ctx, V(p.x, p.y + 1, p.z), green, 2.5, 0.5);
}

// ---------- Chão congelado ----------
const ICE_FRAG = /* glsl */`
uniform float uTime; uniform float uOpacity; uniform float uGrow;
varying vec2 vP;
vec2 hash2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
void main(){
  float d = length(vP);
  if (d > uGrow) discard;
  vec2 g = vP * 5.0;
  vec2 i = floor(g), f = fract(g);
  float m1 = 8.0, m2 = 8.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 r = o + hash2(i + o) - f;
    float dd = dot(r, r);
    if (dd < m1) { m2 = m1; m1 = dd; } else if (dd < m2) m2 = dd;
  }
  float crack = 1.0 - smoothstep(0.0, 0.06, sqrt(m2) - sqrt(m1));
  float frost = 0.5 + 0.5 * sin(vP.x * 40.0 + vP.y * 33.0) * sin(vP.y * 27.0 - vP.x * 18.0);
  vec3 base = mix(vec3(0.55, 0.82, 0.95), vec3(0.88, 0.97, 1.0), sqrt(m1));
  vec3 col = base + crack * vec3(0.6, 0.85, 1.0) + frost * 0.05;
  float edge = smoothstep(uGrow, uGrow - 0.12, d);
  float rim = smoothstep(uGrow - 0.04, uGrow, d) * 0.8;
  float spark = step(0.995, fract(sin(dot(floor(vP * 60.0), vec2(12.9, 78.2))) * 43758.5 + uTime * 0.3));
  gl_FragColor = vec4(col + spark + rim, (0.55 + crack * 0.35) * edge * uOpacity + rim * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export function iceField(ctx, pos, radius = 10, duration = 7) {
  const root = new THREE.Group();
  root.position.copy(pos);
  ctx.scene.add(root);
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 1 }, uGrow: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: ICE_FRAG, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
  });
  const disc = new THREE.Mesh(GEO.disc(), mat);
  disc.scale.setScalar(radius);
  disc.position.y = 0.03;
  disc.renderOrder = 8;
  root.add(disc);
  // espinhos de gelo
  const rng = mulberry32((Math.random() * 1e9) | 0);
  const count = Math.round((ctx.detail > 0 ? 26 : 12) * Math.min(1.6, radius / 8));
  const geo = sharedGeo('iceSpike', () => crystalGeometry(0.22, 1.6, 6, 0.4, 0.9));
  const spikeMat = new THREE.MeshStandardMaterial({ color: 0xbfeaff, emissive: 0x3a9ad0, emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.1, transparent: true, opacity: 0.85, flatShading: true });
  const inst = new THREE.InstancedMesh(geo, spikeMat, count);
  inst.castShadow = false;
  const spikes = [];
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2, d = radius * (0.25 + 0.72 * Math.sqrt(rng()));
    spikes.push({
      x: Math.cos(a) * d, z: Math.sin(a) * d, s: 0.5 + rng() * 1.1, delay: (d / radius) * 0.45 + rng() * 0.1,
      q: new THREE.Quaternion().setFromEuler(new THREE.Euler((rng() - 0.5) * 0.7, rng() * 6.28, (rng() - 0.5) * 0.7)),
    });
  }
  root.add(inst);
  const mtx = new THREE.Matrix4(), sc = V(), ps = V();
  let t = 0, acc = 0;
  groundRing(ctx, pos, 0xd9f6ff, radius * 1.1, 0.7, { width: 0.04 });
  particleBurst(ctx, V(pos.x, pos.y + 0.3, pos.z), { colors: [0xffffff, 0xbdefff], count: 40, speed: radius * 1.2, size: 0.2, life: 0.8, drag: 2, shape: SHAPE.SPARK });
  ctx.add({
    update(dt) {
      t += dt; acc += dt;
      const grow = easeOutCubic(clamp01(t / 0.5));
      const out = clamp01((t - duration + 0.6) / 0.6);
      mat.uniforms.uGrow.value = grow;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uOpacity.value = 1 - out;
      for (let i = 0; i < count; i++) {
        const s = spikes[i];
        const k = easeOutBack(clamp01((t - s.delay) / 0.3)) * (1 - out);
        ps.set(s.x, -0.05, s.z);
        sc.set(s.s * Math.max(0.001, k), s.s * Math.max(0.001, k), s.s * Math.max(0.001, k));
        mtx.compose(ps, s.q, sc);
        inst.setMatrixAt(i, mtx);
      }
      inst.instanceMatrix.needsUpdate = true;
      spikeMat.opacity = 0.85 * (1 - out);
      if (acc > 0.06 && out === 0) {
        acc = 0;
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * radius;
        ctx.glow.emit({ pos: V(pos.x + Math.cos(a) * d, pos.y + 0.1 + rng() * 1.5, pos.z + Math.sin(a) * d), vel: V(0, 0.15, 0), life: 1.4, color: 0xffffff, color1: 0x9fdfff, size: 0.16, size1: 0.0, shape: SHAPE.SPARK, rot: rng() * 3 });
        if (rng() < 0.4) ctx.solid.emit({ pos: V(pos.x + Math.cos(a) * d, pos.y + 0.1, pos.z + Math.sin(a) * d), vel: V((rng() - 0.5) * 0.4, 0.1, (rng() - 0.5) * 0.4), life: 2.2, color: 0xe8f8ff, size: 1.2, size1: 2.4, shape: SHAPE.SMOKE, alpha: 0.25, rot: rng() * 6, spin: 0.3 });
      }
      if (out > 0 && !this._shattered) {
        this._shattered = true;
        for (const s of spikes) particleBurst(ctx, V(pos.x + s.x, pos.y + 0.6 * s.s, pos.z + s.z), { solid: true, colors: [0xffffff, 0xbfeaff], count: 5, speed: 3, size: 0.12, size1: 0.1, life: 0.7, gravity: -10, shape: SHAPE.SHARD, spin: 15 });
      }
      return t < duration;
    },
    dispose() { root.removeFromParent(); mat.dispose(); spikeMat.dispose(); inst.dispose(); },
  });
}

// ---------- Barreira ----------
const BARRIER_FRAG = /* glsl */`
uniform vec3 uColor; uniform vec3 uGlow; uniform float uTime; uniform float uOpacity; uniform float uRise; uniform float uAspect; uniform float uHit;
${NOISE_GLSL}
varying vec2 vUv;
float hexDist(vec2 p){ p = abs(p); return max(dot(p, normalize(vec2(1.0, 1.7320508))), p.x); }
void main(){
  if (vUv.y > uRise) discard;
  vec2 uv = vec2(vUv.x * uAspect, vUv.y) * 7.0;
  vec2 r = vec2(1.0, 1.7320508); vec2 h = r * 0.5;
  vec2 a = mod(uv, r) - h; vec2 b = mod(uv - h, r) - h;
  vec2 gv = dot(a, a) < dot(b, b) ? a : b;
  float hex = smoothstep(0.4, 0.5, hexDist(gv));
  float flow = fxFbm(vec3(vUv.x * uAspect * 3.0, vUv.y * 3.0 - uTime * 0.8, uTime * 0.2));
  float edgeX = smoothstep(0.06, 0.0, min(vUv.x, 1.0 - vUv.x));
  float edgeB = smoothstep(0.08, 0.0, vUv.y);
  float top = smoothstep(uRise - 0.04, uRise, vUv.y);
  float scan = smoothstep(0.96, 1.0, sin((vUv.y - uTime * 0.25) * 30.0));
  float fade = 1.0 - smoothstep(0.6, 1.0, vUv.y) * 0.5;
  float al = (0.16 + hex * 0.35 + flow * 0.25 + scan * 0.25) * fade + edgeX * 0.8 + edgeB * 0.9 + top * 0.9 + uHit * 0.5;
  vec3 col = mix(uColor, uGlow, hex * 0.6 + edgeX + edgeB + top + scan * 0.5);
  gl_FragColor = vec4(col, al * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export function barrierWall(ctx, pos, rotY = 0, width = 6, height = 3, duration = 15, element = 'arcane') {
  const pal = elementPalette(element || 'arcane');
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: pal.color.clone() }, uGlow: { value: pal.glow.clone() }, uTime: { value: 0 }, uOpacity: { value: 1 },
      uRise: { value: 0 }, uAspect: { value: width / height }, uHit: { value: 0 },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: BARRIER_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const geo = new THREE.PlaneGeometry(width, height).translate(0, height / 2, 0);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.copy(pos);
  mesh.rotation.y = rotY;
  mesh.renderOrder = 14;
  mesh.userData.fx = 'barrier';
  ctx.scene.add(mesh);
  // pilares nas pontas (cristais)
  const pylonGeo = sharedGeo('pylon', () => crystalGeometry(0.16, 1, 6, 0.25, 1.1));
  const pylonMat = new THREE.MeshStandardMaterial({ color: pal.color, emissive: pal.color, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.3, flatShading: true });
  const pylons = [-1, 1].map((sgn) => {
    const p = new THREE.Mesh(pylonGeo, pylonMat);
    p.position.set(sgn * width / 2, 0, 0);
    mesh.add(p);
    return p;
  });
  groundRing(ctx, pos, pal.color, width * 0.6, 0.6);
  let t = 0, acc = 0, closing = -1;
  const right = V(Math.cos(rotY), 0, -Math.sin(rotY));
  const handle = {
    mesh,
    hit() { mat.uniforms.uHit.value = 1; },
    dispose() { if (closing < 0) closing = 0; },
  };
  ctx.add({
    update(dt) {
      t += dt; acc += dt;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uHit.value = Math.max(0, mat.uniforms.uHit.value - dt * 3);
      const rise = easeOutCubic(clamp01(t / 0.45));
      mat.uniforms.uRise.value = rise * 1.001;
      for (const p of pylons) p.scale.set(1, (height + 0.4) * rise, 1);
      if (t > duration && closing < 0) closing = 0;
      if (closing >= 0) {
        closing += dt;
        const k = clamp01(closing / 0.5);
        mat.uniforms.uOpacity.value = 1 - k;
        mat.uniforms.uRise.value = 1 - k;
        for (const p of pylons) p.scale.y = (height + 0.4) * (1 - k) + 0.001;
        if (k >= 1) return false;
      }
      if (acc > 0.05 && closing < 0) {
        acc = 0;
        const f = ctx.rng() - 0.5;
        ctx.glow.emit({ pos: V(pos.x + right.x * f * width, pos.y + 0.05, pos.z + right.z * f * width), vel: V(0, 1.2 + ctx.rng(), 0), life: 1.1, color: pal.glow, color1: pal.color, size: 0.14, size1: 0.02, shape: SHAPE.SPARK });
      }
      return true;
    },
    dispose() { mesh.removeFromParent(); geo.dispose(); mat.dispose(); pylonMat.dispose(); },
  });
  return handle;
}

// ---------- Distorção temporal ----------
const CLOCK_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uTime; uniform float uOpacity;
varying vec2 vP;
float seg(vec2 p, vec2 a, vec2 b, float w){ vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return smoothstep(w, 0.0, length(pa - ba * h)); }
void main(){
  float d = length(vP);
  if (d > 1.0) discard;
  float a = atan(vP.y, vP.x);
  float ring = smoothstep(0.015, 0.0, abs(d - 0.95)) + smoothstep(0.01, 0.0, abs(d - 0.82)) * 0.7 + smoothstep(0.008, 0.0, abs(d - 0.35)) * 0.5;
  float tick = step(0.86, d) * step(d, 0.95) * smoothstep(0.42, 0.47, abs(fract(a / 6.2831853 * 60.0) - 0.5));
  float bigTick = step(0.74, d) * step(d, 0.95) * smoothstep(0.46, 0.485, abs(fract(a / 6.2831853 * 12.0) - 0.5));
  float h1 = uTime * -0.4, h2 = uTime * -3.0;
  float hands = seg(vP, vec2(0.0), vec2(cos(h1), sin(h1)) * 0.55, 0.025) + seg(vP, vec2(0.0), vec2(cos(h2), sin(h2)) * 0.78, 0.015);
  float glow = smoothstep(1.0, 0.0, d) * 0.12;
  float v = ring + tick * 0.6 + bigTick + hands + glow;
  gl_FragColor = vec4(mix(uColor, vec3(1.0), clamp(ring + hands, 0.0, 1.0) * 0.5), v * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
const DOME_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uTime; uniform float uOpacity;
varying vec3 vN; varying vec3 vV; varying vec3 vPos; varying vec2 vUv;
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.5);
  float waves = 0.5 + 0.5 * sin(vPos.y * 30.0 - uTime * 3.0 + sin(atan(vPos.z, vPos.x) * 6.0 + uTime) * 1.5);
  float bands = smoothstep(0.9, 1.0, sin(vPos.y * 12.0 + uTime * 1.2));
  gl_FragColor = vec4(mix(uColor, vec3(1.0), f * 0.3), (f * 0.4 + waves * 0.04 + bands * 0.08) * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export function timeWarp(ctx, pos, radius = 20, duration = 5) {
  const col = new THREE.Color(0x8fe3ff), gold = new THREE.Color(0xffd86b);
  const root = new THREE.Group();
  root.position.copy(pos);
  ctx.scene.add(root);
  const clockMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: gold.clone() }, uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: 'varying vec2 vP; void main(){ vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: CLOCK_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const clock = new THREE.Mesh(GEO.disc(), clockMat);
  clock.position.y = 0.05; clock.scale.setScalar(radius);
  root.add(clock);
  const domeMat = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: col.clone() }, uTime: { value: 0 }, uOpacity: { value: 0 } },
    vertexShader: FRESNEL_VERT, fragmentShader: DOME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  const dome = new THREE.Mesh(GEO.dome(), domeMat);
  root.add(dome);
  const ringGeo = sharedGeo('twRing', () => new THREE.TorusGeometry(1, 0.012, 6, 96));
  const rings = [];
  const ringMats = [];
  for (let i = 0; i < 5; i++) {
    const m = new THREE.MeshBasicMaterial({ color: i % 2 ? gold : col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
    ringMats.push(m);
    const r = new THREE.Mesh(ringGeo, m);
    const lat = 0.12 + i * 0.16;
    r.userData = { lat, speed: (i % 2 ? -1 : 1) * (0.25 + i * 0.12), tilt: (i - 2) * 0.12 };
    root.add(r);
    rings.push(r);
  }
  let t = 0, acc = 0;
  flash(ctx, V(pos.x, pos.y + 2, pos.z), col, radius * 1.2, 0.6, { rays: true });
  ctx.add({
    update(dt) {
      t += dt; acc += dt;
      const env = easeOutCubic(clamp01(t / 0.6)) * (1 - clamp01((t - duration + 0.6) / 0.6));
      const R = radius * (0.2 + 0.8 * easeOutCubic(clamp01(t / 0.6)));
      dome.scale.setScalar(R);
      clockMat.uniforms.uTime.value = t; clockMat.uniforms.uOpacity.value = env;
      domeMat.uniforms.uTime.value = t; domeMat.uniforms.uOpacity.value = env;
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i], u = r.userData;
        const yy = Math.sin(u.lat * Math.PI / 2 * 1.6) * 0.95;
        const rr = Math.sqrt(Math.max(0.01, 1 - yy * yy));
        r.position.y = yy * R;
        r.scale.setScalar(rr * R);
        r.rotation.set(Math.PI / 2 + u.tilt * Math.sin(t * 0.7 + i), 0, t * u.speed);
        ringMats[i].opacity = env * 0.8;
      }
      if (acc > 0.05 && env > 0.3) {
        acc = 0;
        const a = ctx.rng() * Math.PI * 2, d = Math.sqrt(ctx.rng()) * R * 0.9;
        ctx.glow.emit({ pos: V(pos.x + Math.cos(a) * d, pos.y + ctx.rng() * R * 0.5, pos.z + Math.sin(a) * d), vel: V(0, 0.05, 0), life: 2.0, color: ctx.rng() < 0.5 ? gold : col, size: 0.18, size1: 0.1, shape: SHAPE.SPARK, alpha: 0.9 });
      }
      return t < duration;
    },
    dispose() { root.removeFromParent(); clockMat.dispose(); domeMat.dispose(); for (const m of ringMats) m.dispose(); },
  });
}
