// Efeitos instantâneos: burst, appear, explosion, shockwave, impact, confetti, teleport.
import * as THREE from 'three';
import { elementPalette, clamp01, easeOutCubic, mulberry32 } from './util.js';
import { SHAPE } from './particles.js';
import { GEO, flash, sphereFlash, groundRing, particleBurst, blastMaterial } from './common.js';
import { BeamRibbon, makeBeamMaterial, jaggedPath } from './ribbon.js';
import { runeCircleTexture } from './textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export function burst(ctx, pos, opts = {}) {
  particleBurst(ctx, pos, {
    colors: opts.colors, count: opts.count ?? 30, speed: opts.speed ?? 4, size: opts.size ?? 0.18,
    life: opts.life ?? 0.8, gravity: opts.gravity ?? 0, spread: opts.spread ?? 1, dir: opts.dir,
    shape: opts.shape ?? SHAPE.DOT,
  });
}

export function appear(ctx, pos, element) {
  const pal = elementPalette(element);
  const c = pal.color, g = pal.glow;
  flash(ctx, V(pos.x, pos.y + 0.6, pos.z), g, 2.2, 0.5, { rays: true, grow: 1.8 });
  sphereFlash(ctx, V(pos.x, pos.y + 0.5, pos.z), c, 1.0, 0.45, { from: 0.1 });
  groundRing(ctx, pos, c, 2.0, 0.7, { width: 0.06 });
  // runa no chão girando
  runeDecal(ctx, pos, c, 1.6, 1.1);
  // espiral subindo
  const n = ctx.n(48);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 4;
    ctx.glow.emit({
      pos: V(pos.x, pos.y + 0.05, pos.z), vel: V(0, 1.6 + ctx.rng() * 1.6, 0), life: 0.9 + ctx.rng() * 0.4,
      orbit: [0.9, a, 5, -0.6], color: pal.particle[i % 3], color1: g, size: 0.16, size1: 0.04,
      shape: i % 3 === 0 ? SHAPE.SPARK : SHAPE.DOT, delay: (i / n) * 0.25,
    });
  }
  particleBurst(ctx, V(pos.x, pos.y + 0.6, pos.z), { colors: pal.particle, count: 26, speed: 3, size: 0.12, life: 0.7, shape: SHAPE.SPARK });
}

export function runeDecal(ctx, pos, color, radius, life) {
  const mat = new THREE.MeshBasicMaterial({
    map: runeCircleTexture(3), color: new THREE.Color(color), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2,
  });
  const m = new THREE.Mesh(GEO.disc(), mat);
  m.position.set(pos.x, pos.y + 0.03, pos.z);
  m.renderOrder = 11;
  ctx.scene.add(m);
  let t = 0;
  ctx.add({
    update(dt) {
      t += dt;
      const k = clamp01(t / life);
      m.scale.setScalar(radius * (0.6 + 0.4 * easeOutCubic(Math.min(1, k * 3))));
      m.rotation.y += dt * 1.5;
      mat.opacity = Math.min(1, k * 6) * (1 - k);
      return t < life;
    },
    dispose() { m.removeFromParent(); mat.dispose(); },
  });
}

const FLAVOR = {
  fire: { smoke: 0x2e2826, debris: 0x2a1a12, smokeAlpha: 0.55 },
  ice: { smoke: 0xdff5ff, debris: 0xbfeaff, smokeAlpha: 0.5, shards: true },
  lightning: { smoke: 0x3a4766, debris: 0x99b6ff, smokeAlpha: 0.4, arcs: true },
  poison: { smoke: 0x4f8a2a, debris: 0x2f5a1a, smokeAlpha: 0.6, linger: true },
  arcane: { smoke: 0x5a2f8a, debris: 0xd8b6ff, smokeAlpha: 0.45, runes: true },
  light: { smoke: 0xfff2c8, debris: 0xfff6d8, smokeAlpha: 0.35, rays: true },
  shadow: { smoke: 0x1a1226, debris: 0x2a1d45, smokeAlpha: 0.85 },
  water: { smoke: 0xcfeaff, debris: 0x3f9bff, smokeAlpha: 0.4, splash: true },
  earth: { smoke: 0x8a7458, debris: 0x5a4630, smokeAlpha: 0.8, rocks: true },
  wind: { smoke: 0xe8fff8, debris: 0xd8fff4, smokeAlpha: 0.35, swirl: true },
  none: { smoke: 0x55504c, debris: 0x3a3632, smokeAlpha: 0.7 },
};

export function explosion(ctx, pos, element = 'fire', radius = 3) {
  const pal = elementPalette(element);
  const fl = FLAVOR[element] || FLAVOR.none;
  const R = Math.max(0.5, radius);
  const center = V(pos.x, pos.y + R * 0.35, pos.z);
  sphereFlash(ctx, center, pal.glow, R * 0.9, 0.16, { from: 0.3, fill: 0.5 });
  flash(ctx, center, pal.glow, R * 3.2, 0.3, { rays: true, grow: 1.6, opacity: 0.7 });
  flash(ctx, center, pal.color, R * 4.5, 0.5, { grow: 1.2, opacity: 0.3 });
  // núcleo de fogo com ruído
  const mat = blastMaterial(pal);
  const core = new THREE.Mesh(GEO.sphere(), mat);
  core.position.copy(center);
  core.renderOrder = 12;
  ctx.scene.add(core);
  let t = 0;
  const life = 0.95;
  ctx.add({
    update(dt) {
      t += dt;
      const k = clamp01(t / life);
      core.scale.setScalar(R * (0.15 + 0.7 * easeOutCubic(Math.min(1, k * 1.6))));
      core.position.y = center.y + k * R * 0.35;
      mat.uniforms.uTime.value += dt;
      mat.uniforms.uBurn.value = k * 1.3;
      mat.uniforms.uOpacity.value = 1 - k * 0.3;
      return t < life;
    },
    dispose() { core.removeFromParent(); mat.dispose(); },
  });
  groundRing(ctx, pos, pal.color, R * 2.4, 0.7, { width: 0.05 });
  groundRing(ctx, pos, pal.glow, R * 1.6, 0.45, { width: 0.1, fill: 2 });
  // faíscas rápidas
  particleBurst(ctx, center, { colors: pal.particle, count: 70, speed: R * 7, size: 0.16 * Math.sqrt(R), life: 0.8, drag: 2.2, gravity: -6, shape: SHAPE.SPARK });
  // brasas
  particleBurst(ctx, center, { colors: pal.particle, count: 40, speed: R * 3, size: 0.12, life: 1.6, drag: 1, gravity: 1.2, up: true });
  // detritos
  particleBurst(ctx, center, { solid: true, colors: [fl.debris], count: fl.rocks ? 50 : 26, speed: R * 5, size: 0.14 * Math.sqrt(R), size1: 0.12, life: 1.3, drag: 0.4, gravity: -14, up: 0.8, shape: SHAPE.SHARD, spin: 14 });
  // fumaça
  const smokeN = ctx.n(fl.linger ? 34 : 22);
  for (let i = 0; i < smokeN; i++) {
    const r = ctx.rng;
    const a = r() * Math.PI * 2, d = r() * R * 0.6;
    ctx.solid.emit({
      pos: V(center.x + Math.cos(a) * d, center.y + (r() - 0.3) * R * 0.5, center.z + Math.sin(a) * d),
      vel: V(Math.cos(a) * R * 1.4, 0.8 + r() * 1.5, Math.sin(a) * R * 1.4),
      drag: 1.6, gravity: 0.4, life: (fl.linger ? 3.5 : 2.0) + r() * 1.2,
      color: fl.smoke, color1: fl.smoke, size: R * 0.9, size1: R * 2.2, shape: SHAPE.SMOKE, alpha: fl.smokeAlpha,
      rot: r() * 6.28, spin: (r() - 0.5) * 1.2, delay: 0.06,
    });
  }
  if (fl.shards) particleBurst(ctx, center, { solid: true, colors: [0xffffff, 0xbfeaff, 0x8fdcff], count: 40, speed: R * 6, size: 0.2, size1: 0.15, life: 1, gravity: -12, drag: 0.6, shape: SHAPE.SHARD, spin: 20 });
  if (fl.splash) particleBurst(ctx, pos, { colors: pal.particle, count: 60, speed: R * 4, size: 0.16, life: 1.1, gravity: -12, drag: 0.4, up: 2.5 });
  if (fl.swirl) {
    for (let i = 0; i < ctx.n(50); i++) ctx.glow.emit({ pos: V(pos.x, pos.y + 0.2, pos.z), vel: V(0, 2 + ctx.rng() * 3, 0), orbit: [0.3, ctx.rng() * 6.28, 8, R * 1.2], life: 0.9, color: pal.particle[i % 3], size: 0.18, size1: 0.05 });
  }
  if (fl.runes) runeDecal(ctx, pos, pal.color, R * 1.8, 1.0);
  if (fl.arcs) {
    for (let i = 0; i < 5; i++) {
      const a = ctx.rng() * Math.PI * 2;
      miniBolt(ctx, center, V(center.x + Math.cos(a) * R * 1.6, pos.y, center.z + Math.sin(a) * R * 1.6), pal.color, 0.3);
    }
  }
  ctx.shake(Math.min(1.2, 0.25 + R * 0.12));
}

export function miniBolt(ctx, a, b, color, life = 0.25, width = 0.12) {
  const rng = mulberry32((Math.random() * 1e9) | 0);
  const glow = new BeamRibbon(24, makeBeamMaterial({ color, core: 0.5, opacity: 0.8 }));
  const core = new BeamRibbon(24, makeBeamMaterial({ color: 0xffffff, core: 1, opacity: 1 }));
  ctx.scene.add(glow.mesh, core.mesh);
  let t = 0, acc = 1;
  ctx.add({
    update(dt) {
      t += dt; acc += dt;
      if (acc > 0.05) {
        acc = 0;
        const pts = jaggedPath(a, b, rng, { segments: 14, jitter: 0.16 });
        glow.setPoints(pts, width * 3);
        core.setPoints(pts, width * 0.7);
      }
      const o = (1 - t / life) * (0.6 + 0.4 * Math.random());
      glow.material.uniforms.uOpacity.value = o;
      core.material.uniforms.uOpacity.value = o;
      return t < life;
    },
    dispose() { glow.dispose(); core.dispose(); glow.material.dispose(); core.material.dispose(); },
  });
}

export function shockwave(ctx, pos, radius = 6, element) {
  const pal = elementPalette(element);
  const R = Math.max(1, radius);
  groundRing(ctx, pos, pal.color, R, 0.75, { width: 0.05 });
  groundRing(ctx, pos, pal.glow, R * 0.85, 0.6, { width: 0.025, fill: 0 });
  // parede cilíndrica que se expande (aparência de distorção)
  const wall = new THREE.Mesh(GEO.cylinderOpen(), wallMaterial(pal.color));
  wall.position.set(pos.x, pos.y, pos.z);
  wall.renderOrder = 12;
  ctx.scene.add(wall);
  let t = 0;
  const life = 0.7;
  ctx.add({
    update(dt) {
      t += dt;
      const k = clamp01(t / life);
      const r = R * (0.1 + 0.9 * easeOutCubic(k));
      wall.scale.set(r, 0.4 + R * 0.12 * (1 - k), r);
      wall.material.uniforms.uOpacity.value = (1 - k) * 0.9;
      wall.material.uniforms.uTime.value += dt;
      return t < life;
    },
    dispose() { wall.removeFromParent(); wall.material.dispose(); },
  });
  // poeira levantada na borda
  const n = ctx.n(40);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    ctx.glow.emit({
      pos: V(pos.x, pos.y + 0.15, pos.z), vel: V(Math.cos(a) * R * 1.8, 0.8 + ctx.rng(), Math.sin(a) * R * 1.8),
      drag: 1.8, life: 0.7, color: pal.particle[i % 3], color1: pal.color, size: 0.25, size1: 0.05,
    });
  }
  flash(ctx, V(pos.x, pos.y + 0.6, pos.z), pal.glow, 2.4, 0.3);
  ctx.shake(Math.min(0.8, 0.2 + R * 0.05));
}

const WALL_FRAG = /* glsl */`
uniform vec3 uColor; uniform float uOpacity; uniform float uTime;
varying vec2 vUv;
void main(){
  float v = vUv.y;
  float band = pow(1.0 - v, 2.0);
  float stripes = 0.75 + 0.25 * sin(vUv.x * 120.0 + uTime * 8.0);
  vec3 col = mix(uColor, vec3(1.0), band * 0.5);
  gl_FragColor = vec4(col, band * stripes * uOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
export function wallMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uOpacity: { value: 1 }, uTime: { value: 0 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: WALL_FRAG,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
}

export function impact(ctx, pos, element) {
  const pal = elementPalette(element);
  flash(ctx, pos, pal.glow, 0.9, 0.16, { rays: true, grow: 1.5 });
  flash(ctx, pos, pal.color, 1.4, 0.25, { opacity: 0.6 });
  particleBurst(ctx, pos, { colors: pal.particle, count: 22, speed: 6, size: 0.1, life: 0.35, drag: 3, gravity: -8, shape: SHAPE.SPARK });
  particleBurst(ctx, pos, { colors: pal.particle, count: 10, speed: 2, size: 0.14, life: 0.5, drag: 2 });
  if (element === 'earth') particleBurst(ctx, pos, { solid: true, colors: [0x6b5238, 0x8a6a42], count: 10, speed: 3.5, size: 0.08, size1: 0.07, life: 0.7, gravity: -12, drag: 0.4, shape: SHAPE.SHARD, spin: 12 });
  if (element === 'ice') particleBurst(ctx, pos, { solid: true, colors: [0xffffff, 0xbfeaff], count: 10, speed: 3.5, size: 0.09, size1: 0.07, life: 0.6, gravity: -10, drag: 0.4, shape: SHAPE.SHARD, spin: 15 });
}

const CONFETTI = [0xff4d6d, 0xffc93c, 0x4dd4ff, 0x7cff6b, 0xb36bff, 0xff8a3d, 0xffffff];
export function confetti(ctx, pos) {
  const n = ctx.n(110);
  for (let i = 0; i < n; i++) {
    const r = ctx.rng;
    const a = r() * Math.PI * 2, up = 5 + r() * 6, out = 1 + r() * 3.5;
    const c = CONFETTI[(r() * CONFETTI.length) | 0];
    ctx.solid.emit({
      pos: V(pos.x, pos.y + 0.3, pos.z), vel: V(Math.cos(a) * out, up, Math.sin(a) * out),
      gravity: -5, drag: 1.6, life: 2.4 + r() * 1.4, color: c, color1: c,
      size: 0.16, size1: 0.14, shape: SHAPE.SHARD, rot: r() * 6.28, spin: (r() - 0.5) * 18,
    });
  }
  particleBurst(ctx, V(pos.x, pos.y + 0.5, pos.z), { colors: [0xffffff, 0xfff27a, 0xffd0f0], count: 30, speed: 5, size: 0.14, life: 0.8, shape: SHAPE.SPARK, up: true, gravity: -3 });
  flash(ctx, V(pos.x, pos.y + 0.5, pos.z), 0xfff3c4, 1.6, 0.3, { rays: true });
}

export function teleport(ctx, from, to) {
  const pal = elementPalette('arcane');
  for (const [p, implode] of [[from, true], [to, false]]) {
    lightColumn(ctx, p, pal.color, implode ? 0.7 : 0.9, implode ? 0 : 0.12);
    groundRing(ctx, p, pal.glow, 1.8, 0.6, { width: 0.07 });
    const n = ctx.n(40);
    for (let i = 0; i < n; i++) {
      const a = ctx.rng() * Math.PI * 2, h = ctx.rng() * 2;
      if (implode) {
        ctx.glow.emit({ pos: V(p.x, p.y + h, p.z), vel: V(0, 1.5, 0), orbit: [1.1, a, 6, -1.4], life: 0.75, color: pal.particle[i % 3], color1: 0xffffff, size: 0.14, size1: 0.02, shape: i % 4 ? SHAPE.DOT : SHAPE.SPARK });
      } else {
        ctx.glow.emit({ pos: V(p.x, p.y + h, p.z), vel: V(0, 0.6, 0), orbit: [0.1, a, -5, 1.6], life: 0.8, color: 0xffffff, color1: pal.particle[i % 3], size: 0.16, size1: 0.03, shape: i % 4 ? SHAPE.DOT : SHAPE.SPARK, delay: 0.12 });
      }
    }
  }
  // traço entre os pontos
  const a = V(from.x, from.y + 1, from.z), b = V(to.x, to.y + 1, to.z);
  const rib = new BeamRibbon(2, makeBeamMaterial({ color: pal.color, core: 0.9, opacity: 1, fadeEnds: 0.25 }));
  rib.setPoints([a, b], 0.5);
  ctx.scene.add(rib.mesh);
  let t = 0;
  ctx.add({
    update(dt) { t += dt; rib.material.uniforms.uOpacity.value = Math.max(0, 1 - t / 0.35); rib.setPoints([a, b], 0.5 * (1 - t / 0.35) + 0.05); return t < 0.35; },
    dispose() { rib.dispose(); rib.material.dispose(); },
  });
  flash(ctx, b, pal.glow, 2.5, 0.35, { rays: true });
}

export function lightColumn(ctx, pos, color, life = 0.8, delay = 0) {
  const mat = wallMaterial(color);
  const m = new THREE.Mesh(GEO.cylinderOpen(), mat);
  m.position.set(pos.x, pos.y, pos.z);
  m.renderOrder = 12;
  m.visible = false;
  ctx.scene.add(m);
  let t = -delay;
  ctx.add({
    update(dt) {
      t += dt;
      if (t < 0) return true;
      m.visible = true;
      const k = clamp01(t / life);
      const w = 0.7 * (1 - k) + 0.15;
      m.scale.set(w, 3.2 * easeOutCubic(Math.min(1, k * 4)), w);
      mat.uniforms.uOpacity.value = (1 - k) * 1.4;
      mat.uniforms.uTime.value += dt;
      return t < life;
    },
    dispose() { m.removeFromParent(); mat.dispose(); },
  });
}
