// Raios, laser, tempestade, rastro de golpe e rastro de velocidade.
import * as THREE from 'three';
import { mulberry32, clamp01, NOISE_GLSL } from './util.js';
import { SHAPE } from './particles.js';
import { flash, groundRing, particleBurst, sharedGeo } from './common.js';
import { BeamRibbon, makeBeamMaterial, jaggedPath, SwingTrail } from './ribbon.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Aceita Vector3, Object3D ou função e devolve a posição em `out`. */
export function resolvePos(src, out) {
  if (!src) return out;
  if (typeof src === 'function') { const r = src(out); if (r && r !== out && r.isVector3) out.copy(r); return out; }
  if (src.isVector3) return out.copy(src);
  if (src.isObject3D) return src.getWorldPosition(out);
  if (typeof src.x === 'number') return out.set(src.x, src.y, src.z);
  return out;
}

export function lightningBolt(ctx, from, to, color = 0x9fc4ff, duration = 0.35) {
  const a = from.clone ? from.clone() : V(from.x, from.y, from.z);
  const b = to.clone ? to.clone() : V(to.x, to.y, to.z);
  const len = a.distanceTo(b);
  const rng = mulberry32((Math.random() * 1e9) | 0);
  const wMain = Math.min(0.5, 0.08 + len * 0.012);
  const NB = ctx.detail > 0 ? 3 : 1;
  const ribbons = [];
  const mk = (n, c, core, op) => { const r = new BeamRibbon(n, makeBeamMaterial({ color: c, core, opacity: op })); ctx.scene.add(r.mesh); ribbons.push(r); return r; };
  const mainGlow = mk(40, color, 0.3, 0.9), mainCore = mk(40, 0xffffff, 1, 1);
  const br = [];
  for (let i = 0; i < NB; i++) br.push([mk(16, color, 0.3, 0.7), mk(16, 0xffffff, 1, 0.8)]);
  const regen = () => {
    const pts = jaggedPath(a, b, rng, { segments: Math.min(38, 10 + (len * 1.2) | 0), jitter: 0.09 });
    mainGlow.setPoints(pts, (t) => wMain * 5 * (1 - t * 0.3));
    mainCore.setPoints(pts, (t) => wMain * (1 - t * 0.3));
    for (const [g, c] of br) {
      const i0 = 2 + ((rng() * (pts.length - 6)) | 0);
      const s = pts[i0];
      const dir = V().subVectors(b, a).normalize();
      const side = V(rng() - 0.5, rng() - 0.5, rng() - 0.5).normalize();
      const e = s.clone().addScaledVector(dir, len * (0.12 + rng() * 0.15)).addScaledVector(side, len * (0.1 + rng() * 0.12));
      const bp = jaggedPath(s, e, rng, { segments: 8, jitter: 0.2 });
      g.setPoints(bp, (t) => wMain * 3 * (1 - t));
      c.setPoints(bp, (t) => wMain * 0.6 * (1 - t));
    }
  };
  regen();
  flash(ctx, b, color, 2.2, Math.max(0.2, duration), { rays: true, grow: 1.3 });
  flash(ctx, a, color, 1.2, 0.2);
  flash(ctx, V().lerpVectors(a, b, 0.5), color, len * 0.9, 0.18, { opacity: 0.35 });
  particleBurst(ctx, b, { colors: [0xffffff, color, 0xfff27a], count: 26, speed: 7, size: 0.12, life: 0.45, drag: 3, gravity: -6, shape: SHAPE.SPARK });
  groundRing(ctx, b, color, 2.2, 0.4, { width: 0.06 });
  let t = 0, acc = 0;
  ctx.add({
    update(dt) {
      t += dt; acc += dt;
      if (acc > 0.055) { acc = 0; regen(); }
      const k = clamp01(t / duration);
      const flick = (1 - k) * (rng() < 0.2 ? 0.35 : 1);
      for (const r of ribbons) r.material.uniforms.uOpacity.value = flick;
      return t < duration;
    },
    dispose() { for (const r of ribbons) { r.dispose(); r.material.dispose(); } },
  });
}

export function laserBeam(ctx, getFrom, getTo, color = 0xffe9a3, duration = 2) {
  const outer = new BeamRibbon(2, makeBeamMaterial({ color, core: 0.2, opacity: 0.7, scroll: 6 }));
  const mid = new BeamRibbon(2, makeBeamMaterial({ color, core: 0.6, opacity: 1, scroll: 10 }));
  const core = new BeamRibbon(2, makeBeamMaterial({ color: 0xffffff, core: 1, opacity: 1 }));
  const list = [outer, mid, core];
  for (const r of list) ctx.scene.add(r.mesh);
  const muzzle = flash(ctx, V(), color, 1, duration + 0.05, { grow: 1, opacity: 1 });
  const hit = flash(ctx, V(), color, 1, duration + 0.05, { grow: 1, opacity: 1, rays: true });
  const a = V(), b = V();
  let t = 0, acc = 0;
  const col = new THREE.Color(color);
  ctx.add({
    update(dt) {
      t += dt; acc += dt;
      resolvePos(getFrom, a); resolvePos(getTo, b);
      const k = clamp01(t / duration);
      const env = Math.min(1, t / 0.12) * (1 - clamp01((t - duration + 0.25) / 0.25));
      const pulse = 1 + 0.15 * Math.sin(t * 40);
      const pts = [a, b];
      outer.setPoints(pts, 0.9 * env * pulse);
      mid.setPoints(pts, 0.35 * env * pulse);
      core.setPoints(pts, 0.12 * env);
      for (const r of list) r.material.uniforms.uTime.value = t;
      muzzle.position.copy(a); muzzle.scale.setScalar(0.9 * env * pulse);
      hit.position.copy(b); hit.scale.setScalar(1.6 * env * pulse);
      hit.material.rotation += dt * 4;
      if (acc > 0.03 && env > 0.3) {
        acc = 0;
        for (let i = 0; i < 3; i++) {
          ctx.glow.emit({ pos: b, vel: V((ctx.rng() - 0.5) * 6, ctx.rng() * 5, (ctx.rng() - 0.5) * 6), gravity: -9, drag: 1.5, life: 0.4, color: i ? col : 0xffffff, color1: col, size: 0.12, size1: 0.02, shape: SHAPE.SPARK });
        }
        ctx.glow.emit({ pos: V().lerpVectors(a, b, ctx.rng()), vel: V(0, 0.4, 0), life: 0.35, color: col, size: 0.2, size1: 0.0, alpha: 0.6 });
      }
      void k;
      return t < duration;
    },
    dispose() { for (const r of list) { r.dispose(); r.material.dispose(); } },
  });
}

// ---------- Tempestade ----------
const CLOUD_FRAG = /* glsl */`
uniform float uTime; uniform float uOpacity; uniform float uFlash; uniform vec3 uTint;
${NOISE_GLSL}
varying vec2 vUv;
void main(){
  vec2 p = vUv * 2.0 - 1.0;
  float d = length(p);
  float ang = atan(p.y, p.x) + uTime * 0.15 + d * 1.5;
  vec2 q = vec2(cos(ang), sin(ang)) * d * 3.0;
  float n = fxFbm(vec3(q, uTime * 0.1));
  float a = smoothstep(1.0, 0.45, d) * smoothstep(0.25, 0.65, n) * uOpacity;
  vec3 col = mix(vec3(0.07, 0.08, 0.11), vec3(0.32, 0.34, 0.42), n);
  col += uTint * uFlash * n * 1.6;
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
const RAIN_VERT = /* glsl */`
uniform float uTime; uniform float uH; uniform float uSpeed;
attribute float aSeed; attribute float aTop;
varying float vTop;
void main(){
  vec3 p = position;
  float y = mod(aSeed * uH - uTime * uSpeed, uH);
  p.y += y + aTop * 0.9;
  p.x += aTop * 0.12;
  vTop = aTop;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;
const RAIN_FRAG = /* glsl */`
uniform float uOpacity; varying float vTop;
void main(){ gl_FragColor = vec4(vec3(0.75, 0.82, 0.95), (0.15 + 0.4 * vTop) * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export function storm(ctx, getCenter, radius = 18, duration = 10) {
  const center = V();
  resolvePos(getCenter, center);
  const H = 16;
  const root = new THREE.Group();
  root.position.copy(center);
  ctx.scene.add(root);
  const cloudMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uFlash: { value: 0 }, uTint: { value: new THREE.Color(0x9fc4ff) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  const cloud = new THREE.Mesh(sharedGeo('cloudPlane', () => new THREE.PlaneGeometry(2, 2).rotateX(Math.PI / 2)), cloudMat);
  cloud.position.y = H;
  cloud.scale.setScalar(radius * 1.5);
  cloud.renderOrder = 9;
  root.add(cloud);
  // chuva
  const N = ctx.detail > 0 ? 700 : 300;
  const pos = new Float32Array(N * 2 * 3), seed = new Float32Array(N * 2), top = new Float32Array(N * 2);
  const rng = mulberry32((Math.random() * 1e9) | 0);
  for (let i = 0; i < N; i++) {
    const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * radius, s = rng();
    for (let k = 0; k < 2; k++) {
      pos.set([Math.cos(a) * d, 0, Math.sin(a) * d], (i * 2 + k) * 3);
      seed[i * 2 + k] = s; top[i * 2 + k] = k;
    }
  }
  const rg = new THREE.BufferGeometry();
  rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  rg.setAttribute('aTop', new THREE.BufferAttribute(top, 1));
  const rainMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uH: { value: H }, uSpeed: { value: 22 }, uOpacity: { value: 0 } },
    vertexShader: RAIN_VERT, fragmentShader: RAIN_FRAG, transparent: true, depthWrite: false,
  });
  const rain = new THREE.LineSegments(rg, rainMat);
  rain.frustumCulled = false;
  root.add(rain);
  let t = 0, next = 0.5;
  const tmp = V();
  ctx.add({
    update(dt) {
      t += dt;
      resolvePos(getCenter, tmp);
      root.position.lerp(tmp, Math.min(1, dt * 2));
      const env = Math.min(1, t / 1.2) * (1 - clamp01((t - duration + 1.5) / 1.5));
      cloudMat.uniforms.uTime.value = t;
      cloudMat.uniforms.uOpacity.value = env;
      cloudMat.uniforms.uFlash.value = Math.max(0, cloudMat.uniforms.uFlash.value - dt * 5);
      rainMat.uniforms.uTime.value = t;
      rainMat.uniforms.uOpacity.value = env;
      next -= dt;
      if (next <= 0 && t < duration - 1) {
        next = 0.35 + rng() * 0.8;
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * radius * 0.9;
        const g = V(root.position.x + Math.cos(a) * d, root.position.y, root.position.z + Math.sin(a) * d);
        const s = V(g.x + (rng() - 0.5) * 6, root.position.y + H - 0.5, g.z + (rng() - 0.5) * 6);
        lightningBolt(ctx, s, g, 0x9fc4ff, 0.3);
        cloudMat.uniforms.uFlash.value = 1;
        particleBurst(ctx, g, { solid: true, colors: [0x5a4a3a], count: 8, speed: 4, size: 0.1, size1: 0.08, life: 0.8, gravity: -12, shape: SHAPE.SHARD, up: true, spin: 10 });
        ctx.shake(0.18);
      }
      return t < duration;
    },
    dispose() { root.removeFromParent(); cloudMat.dispose(); rainMat.dispose(); rg.dispose(); },
  });
}

// ---------- Rastro de golpe ----------
export function slashTrail(ctx, tipObj, color = 0xffffff, duration = 0.3) {
  const col = new THREE.Color(color);
  const col2 = col.clone().multiplyScalar(0.35);
  const trail = new SwingTrail(48, col, col2);
  ctx.scene.add(trail.mesh);
  const samples = [];
  const FADE = 0.2;
  let t = 0;
  const tip = V(), base = V(), lastTip = V(), lastBase = V();
  let has = false;
  const push = (b, p, time) => { samples.unshift({ base: b.clone(), tip: p.clone(), time, age: 0 }); if (samples.length > 48) samples.pop(); };
  ctx.add({
    update(dt) {
      t += dt;
      if (t <= duration && tipObj && tipObj.parent) {
        tipObj.updateWorldMatrix(true, false);
        tipObj.getWorldPosition(tip);
        tipObj.parent.getWorldPosition(base);
        base.lerp(tip, 0.3);
        if (has) {
          const d = tip.distanceTo(lastTip);
          const steps = Math.min(4, Math.floor(d / 0.12));
          for (let i = 1; i <= steps; i++) {
            const f = i / (steps + 1);
            push(V().lerpVectors(lastBase, base, f), V().lerpVectors(lastTip, tip, f), t - dt * (1 - f));
          }
        }
        push(base, tip, t);
        lastTip.copy(tip); lastBase.copy(base); has = true;
        if (ctx.rng() < 0.6) ctx.glow.emit({ pos: tip, vel: V((ctx.rng() - 0.5), ctx.rng() * 0.8, (ctx.rng() - 0.5)), life: 0.35, color: 0xffffff, color1: col, size: 0.1, size1: 0.0, shape: SHAPE.SPARK, drag: 2 });
      }
      for (const s of samples) s.age = (t - s.time) / FADE;
      while (samples.length && samples[samples.length - 1].age > 1) samples.pop();
      trail.write(samples);
      return t < duration + FADE;
    },
    dispose() { trail.dispose(); },
  });
}

// ---------- Rastro de velocidade ----------
export function speedTrail(ctx, obj, duration = 5) {
  const OFFS = [0.35, 0.95, 1.45];
  const ribs = OFFS.map(() => {
    const r = new BeamRibbon(24, makeBeamMaterial({ color: 0x9fe8ff, core: 0.7, opacity: 0.8 }));
    ctx.scene.add(r.mesh); return r;
  });
  const hist = [];
  let t = 0, acc = 0;
  const p = V();
  ctx.add({
    update(dt) {
      t += dt; acc += dt;
      if (obj) obj.getWorldPosition(p);
      hist.unshift({ p: p.clone(), t });
      while (hist.length > 2 && t - hist[hist.length - 1].t > 0.35) hist.pop();
      const env = Math.min(1, t / 0.2) * (1 - clamp01((t - duration) / 0.35));
      const scale = obj ? Math.max(0.3, obj.scale.y) : 1;
      OFFS.forEach((h, i) => {
        const pts = hist.map((s) => V(s.p.x, s.p.y + h * scale, s.p.z));
        if (pts.length < 2) pts.push(pts[0].clone());
        ribs[i].setPoints(pts, (k) => (0.22 - i * 0.04) * scale * (1 - k));
        ribs[i].material.uniforms.uOpacity.value = 0.75 * env;
      });
      const moving = hist.length > 2 && hist[0].p.distanceTo(hist[2].p) > 0.02;
      if (moving && acc > 0.03 && t < duration) {
        acc = 0;
        ctx.glow.emit({ pos: V(p.x + (ctx.rng() - 0.5) * 0.6, p.y + ctx.rng() * 1.8 * scale, p.z + (ctx.rng() - 0.5) * 0.6), vel: V(0, 0.2, 0), life: 0.4, color: 0xffffff, color1: 0x6ad6ff, size: 0.12, size1: 0, shape: SHAPE.SPARK });
      }
      return t < duration + 0.35;
    },
    dispose() { for (const r of ribs) { r.dispose(); r.material.dispose(); } },
  });
}

