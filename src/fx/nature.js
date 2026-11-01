// Fenômenos: tornado, meteoro, terremoto.
import * as THREE from 'three';
import { clamp01, easeOutCubic, easeOutBack, mulberry32, elementPalette, NOISE_GLSL } from './util.js';
import { SHAPE } from './particles.js';
import { GEO, flash, groundRing, particleBurst, sharedGeo, blastMaterial, ringMaterial } from './common.js';
import { explosion } from './blasts.js';
import { resolvePos } from './energy.js';
import { rockGeometry } from './shapes.js';
import { crackTexture, glowTexture } from './textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------- Tornado ----------
const FUNNEL_FRAG = /* glsl */`
uniform float uTime; uniform float uOpacity; uniform vec3 uColor; uniform float uTwist; uniform float uSpeed;
${NOISE_GLSL}
varying vec2 vUv;
void main(){
  float v = vUv.y;
  float u = vUv.x + v * uTwist + uTime * uSpeed;
  float n = fxFbm(vec3(u * 9.0, v * 4.0 - uTime * 0.7, uTime * 0.2));
  float streak = smoothstep(0.45, 0.85, fxNoise(vec3(u * 26.0, v * 2.0, uTime * 0.5)));
  float a = (n * 0.55 + streak * 0.55) * smoothstep(0.0, 0.12, v) * smoothstep(1.0, 0.75, v);
  vec3 col = uColor * (0.7 + 0.5 * n) + streak * 0.25;
  gl_FragColor = vec4(col, a * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export function tornado(ctx, getPos, duration = 8, radius = 4) {
  const root = new THREE.Group();
  ctx.scene.add(root);
  const H = radius * 3.6;
  const funnelGeo = sharedGeo('funnel', () => {
    const pts = [];
    for (let i = 0; i <= 24; i++) { const y = i / 24; pts.push(new THREE.Vector2(0.12 + 0.88 * Math.pow(y, 1.6) + 0.05 * Math.sin(y * 9), y)); }
    return new THREE.LatheGeometry(pts, 40);
  });
  const layers = [
    { s: 1.0, color: 0xd9e4e8, twist: 1.8, speed: 1.4, op: 0.75, add: false },
    { s: 0.78, color: 0xbfd2d8, twist: 2.6, speed: 2.1, op: 0.6, add: false },
    { s: 1.12, color: 0xffffff, twist: 1.2, speed: 1.0, op: 0.35, add: true },
  ];
  const mats = [];
  const shells = layers.map((L) => {
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: Math.random() * 9 }, uOpacity: { value: 0 }, uColor: { value: new THREE.Color(L.color) }, uTwist: { value: L.twist }, uSpeed: { value: L.speed } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: FUNNEL_FRAG, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: L.add ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    mats.push(m);
    const mesh = new THREE.Mesh(funnelGeo, m);
    mesh.scale.set(radius * L.s, H, radius * L.s);
    mesh.renderOrder = 10;
    mesh.userData.L = L;
    root.add(mesh);
    return mesh;
  });
  const p = V(), last = V();
  resolvePos(getPos, p); last.copy(p);
  root.position.copy(p);
  let t = 0, acc = 0, stopAt = -1;
  const handle = { dispose() { if (stopAt < 0) stopAt = t; } };
  ctx.add({
    update(dt) {
      t += dt; acc += dt;
      resolvePos(getPos, p);
      root.position.copy(p);
      const fade = stopAt >= 0 ? clamp01((t - stopAt) / 0.6) : clamp01((t - duration + 0.6) / 0.6);
      const env = easeOutCubic(clamp01(t / 0.7)) * (1 - fade);
      shells.forEach((s, i) => {
        const L = s.userData.L;
        mats[i].uniforms.uTime.value += dt;
        mats[i].uniforms.uOpacity.value = L.op * env;
        s.rotation.y += dt * (3 + i);
        s.scale.set(radius * L.s * (0.6 + 0.4 * env), H * env + 0.01, radius * L.s * (0.6 + 0.4 * env));
        s.position.x = Math.sin(t * 1.3 + i) * radius * 0.08;
        s.position.z = Math.cos(t * 1.1 + i) * radius * 0.08;
      });
      if (acc > 0.025 && env > 0.2) {
        acc = 0;
        const r = ctx.rng;
        // poeira na base
        ctx.solid.emit({ pos: V(p.x, p.y + 0.1, p.z), vel: V(0, 0.8 + r(), 0), orbit: [radius * 0.5, r() * 6.28, 3.5, radius * 0.3], drag: 0.5, life: 1.4, color: 0xa89a86, size: radius * 0.45, size1: radius * 0.9, shape: SHAPE.SMOKE, alpha: 0.45, rot: r() * 6, spin: 1 });
        // detritos e folhas subindo em espiral
        ctx.solid.emit({ pos: V(p.x, p.y + 0.2, p.z), vel: V(0, H * 0.45, 0), orbit: [radius * 0.25, r() * 6.28, 6 + r() * 3, radius * 0.25], drag: 0.2, life: 1.8, color: r() < 0.5 ? 0x6b5a3a : 0x4f7a3a, size: 0.14, size1: 0.12, shape: SHAPE.SHARD, rot: r() * 6, spin: 10 });
        ctx.glow.emit({ pos: V(p.x, p.y + r() * H * 0.3, p.z), vel: V(0, H * 0.35, 0), orbit: [radius * 0.3, r() * 6.28, 7, radius * 0.3], drag: 0.1, life: 1.4, color: 0xffffff, color1: 0xbff5e6, size: 0.12, size1: 0.03, alpha: 0.7 });
      }
      last.copy(p);
      return fade < 1;
    },
    dispose() { root.removeFromParent(); for (const m of mats) m.dispose(); },
  });
  return handle;
}

// ---------- Meteoro ----------
export function meteor(ctx, target, delay = 0, onImpact) {
  const tgt = V(target.x, target.y, target.z);
  const rng = mulberry32((Math.random() * 1e9) | 0);
  const dir = V(-0.45 + rng() * 0.3, -1, -0.3 + rng() * 0.3).normalize();
  const FALL = 1.1, DIST = 46;
  const start = tgt.clone().addScaledVector(dir, -DIST);
  const pal = elementPalette('fire');
  const root = new THREE.Group();
  root.visible = false;
  ctx.scene.add(root);
  const rockGeo = sharedGeo('meteorRock' + ((rng() * 3) | 0), () => rockGeometry(1, 1, 7 + ((rng() * 100) | 0), 0.3, 1));
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x2a201c, emissive: 0xff4a10, emissiveIntensity: 0.6, roughness: 0.9, flatShading: true });
  const rock = new THREE.Mesh(rockGeo, rockMat);
  rock.scale.setScalar(0.9);
  root.add(rock);
  const shellMat = blastMaterial(pal);
  shellMat.uniforms.uDisp.value = 0.8;
  shellMat.uniforms.uOpacity.value = 0.8;
  const shell = new THREE.Mesh(GEO.sphereLow(), shellMat);
  shell.scale.set(1.5, 1.5, 2.6);
  shell.position.z = -0.6;
  root.add(shell);
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: pal.glow, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
  const glow = new THREE.Sprite(glowMat);
  glow.scale.setScalar(6);
  root.add(glow);
  // marcador no chão
  const markMat = ringMaterial(0xff5a1f);
  markMat.uniforms.uW.value = 0.04; markMat.uniforms.uFillIn.value = 2;
  const mark = new THREE.Mesh(GEO.disc(), markMat);
  mark.position.set(tgt.x, tgt.y + 0.05, tgt.z);
  mark.scale.setScalar(3.5);
  ctx.scene.add(mark);
  let t = -delay, acc = 0, done = false;
  const look = tgt.clone();
  ctx.add({
    update(dt) {
      t += dt;
      const mk = clamp01((t + delay) / Math.max(0.3, delay + FALL));
      markMat.uniforms.uR.value = 0.95 - 0.6 * mk + 0.05 * Math.sin(t * 14);
      markMat.uniforms.uOpacity.value = 0.4 + 0.5 * mk;
      if (t < 0) return true;
      if (!done) {
        root.visible = true;
        const k = Math.min(1, t / FALL);
        const e = k * k * 0.4 + k * 0.6;
        root.position.lerpVectors(start, tgt, e);
        root.lookAt(look.copy(tgt).addScaledVector(dir, 10));
        rock.rotation.x += dt * 5; rock.rotation.y += dt * 3;
        shellMat.uniforms.uTime.value += dt * 3;
        acc += dt;
        while (acc > 0.012) {
          acc -= 0.012;
          const q = root.position;
          ctx.glow.emit({ pos: V(q.x + (rng() - 0.5) * 0.8, q.y + (rng() - 0.5) * 0.8, q.z + (rng() - 0.5) * 0.8), vel: V((rng() - 0.5) * 2, (rng() - 0.2) * 2, (rng() - 0.5) * 2), drag: 2, life: 0.55, color: pal.particle[(rng() * 3) | 0], color1: 0xff2a00, size: 1.1, size1: 0.2 });
          if (rng() < 0.5) ctx.solid.emit({ pos: V(q.x, q.y, q.z), vel: V((rng() - 0.5), 0.5, (rng() - 0.5)), drag: 1, life: 1.6, color: 0x2a2220, color1: 0x55504c, size: 1.0, size1: 2.6, shape: SHAPE.SMOKE, alpha: 0.6, rot: rng() * 6, spin: 1 });
        }
        if (k >= 1) {
          done = true;
          root.visible = false;
          explosion(ctx, tgt, 'fire', 3.6);
          crater(ctx, tgt, 3.2);
          particleBurst(ctx, tgt, { solid: true, colors: [0x3a2a20, 0x5a4630], count: 40, speed: 12, size: 0.25, size1: 0.2, life: 1.6, gravity: -16, drag: 0.3, up: 1.4, shape: SHAPE.SHARD, spin: 10 });
          ctx.shake(1.0);
          if (onImpact) { try { onImpact(tgt.clone()); } catch (e) { console.error(e); } }
          return false;
        }
      }
      return !done;
    },
    dispose() { root.removeFromParent(); mark.removeFromParent(); rockMat.dispose(); shellMat.dispose(); glowMat.dispose(); markMat.dispose(); },
  });
}

/** Cratera brilhante temporária (rachaduras incandescentes). */
export function crater(ctx, pos, radius, color = 0xff6a1f, life = 3) {
  const mat = new THREE.MeshBasicMaterial({
    map: crackTexture(9), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  const m = new THREE.Mesh(GEO.disc(), mat);
  m.position.set(pos.x, pos.y + 0.04, pos.z);
  m.rotation.y = Math.random() * 6.28;
  m.scale.setScalar(radius);
  ctx.scene.add(m);
  let t = 0;
  ctx.add({
    update(dt) { t += dt; const k = clamp01(t / life); m.scale.setScalar(radius * (0.4 + 0.6 * easeOutCubic(Math.min(1, t / 0.25)))); mat.opacity = (1 - k) * (0.8 + 0.2 * Math.sin(t * 20)); return t < life; },
    dispose() { m.removeFromParent(); mat.dispose(); },
  });
}

// ---------- Terremoto ----------
export function earthquake(ctx, pos, radius = 16) {
  const DUR = 3;
  crater(ctx, pos, radius * 0.75, 0xffa04a, DUR);
  groundRing(ctx, pos, 0xd2b48c, radius, 1.0, { width: 0.04 });
  const rng = mulberry32((Math.random() * 1e9) | 0);
  const count = ctx.detail > 0 ? 18 : 9;
  const rocks = [];
  const mats = [];
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a6248, roughness: 0.95, flatShading: true });
  mats.push(rockMat);
  const geos = [0, 1, 2].map((i) => sharedGeo('quakeRock' + i, () => rockGeometry(0.6, 0, 31 + i * 7, 0.35, 1.6)));
  for (let i = 0; i < count; i++) {
    const a = rng() * Math.PI * 2, d = radius * (0.15 + 0.75 * Math.sqrt(rng()));
    const m = new THREE.Mesh(geos[i % 3], rockMat);
    const s = 0.45 + rng() * 0.75;
    m.position.set(pos.x + Math.cos(a) * d, pos.y - 1.2 * s, pos.z + Math.sin(a) * d);
    m.rotation.set((rng() - 0.5) * 0.8, rng() * 6, (rng() - 0.5) * 0.8);
    m.scale.setScalar(s);
    m.castShadow = true;
    m.userData = { s, delay: (d / radius) * 0.6 + rng() * 0.2, base: pos.y };
    ctx.scene.add(m);
    rocks.push(m);
  }
  let t = 0, acc = 0, shakeAcc = 0;
  ctx.shake(1.0);
  ctx.add({
    update(dt) {
      t += dt; acc += dt; shakeAcc += dt;
      if (shakeAcc > 0.35 && t < DUR - 0.8) { shakeAcc = 0; ctx.shake(0.7 * (1 - t / DUR)); }
      for (const m of rocks) {
        const u = m.userData;
        const k = clamp01((t - u.delay) / 0.35);
        const out = clamp01((t - DUR + 0.9) / 0.9);
        const h = easeOutBack(k) * (1 - out);
        m.position.y = u.base - 1.2 * u.s + h * 1.3 * u.s;
        if (k > 0 && k < 1 && !u.puffed) {
          u.puffed = true;
          particleBurst(ctx, V(m.position.x, u.base + 0.2, m.position.z), { solid: true, colors: [0x5a4630, 0x8a6a42], count: 8, speed: 4, size: 0.12, size1: 0.1, life: 0.9, gravity: -14, up: 2, shape: SHAPE.SHARD, spin: 10 });
        }
      }
      if (acc > 0.04 && t < DUR - 0.6) {
        acc = 0;
        const a = rng() * Math.PI * 2, d = Math.sqrt(rng()) * radius;
        ctx.solid.emit({ pos: V(pos.x + Math.cos(a) * d, pos.y + 0.2, pos.z + Math.sin(a) * d), vel: V(0, 0.8 + rng(), 0), drag: 1.2, life: 2.0, color: 0x9a8466, size: 1.4, size1: 3.2, shape: SHAPE.SMOKE, alpha: 0.5, rot: rng() * 6, spin: 0.6 });
        ctx.solid.emit({ pos: V(pos.x + Math.cos(a) * d, pos.y + 0.1, pos.z + Math.sin(a) * d), vel: V((rng() - 0.5) * 2, 3 + rng() * 3, (rng() - 0.5) * 2), gravity: -14, life: 0.9, color: 0x5a4630, size: 0.1, size1: 0.09, shape: SHAPE.SHARD, spin: 10 });
      }
      return t < DUR;
    },
    dispose() { for (const m of rocks) m.removeFromParent(); for (const m of mats) m.dispose(); },
  });
  flash(ctx, V(pos.x, pos.y + 0.5, pos.z), 0xd2b48c, radius * 0.6, 0.4);
}
