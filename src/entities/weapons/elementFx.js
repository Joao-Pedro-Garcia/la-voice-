// Decorações elementais das armas: geometria extra + materiais animados + partículas idle.
// Cada função recebe o contexto D e registra animações em D.anims.
import * as THREE from 'three';
import { NOISE_GLSL, mulberry32 } from '../../fx/util.js';
import { SHAPE } from '../../fx/particles.js';
import { BeamRibbon, makeBeamMaterial, jaggedPath } from '../../fx/ribbon.js';
import { crystalGeometry, rockGeometry } from '../../fx/shapes.js';
import { glowTexture, rayTexture, runeCircleTexture } from '../../fx/textures.js';
import { elementSurfaceTexture, studioEnvMap, texSize } from './textures.js';
import { lathe } from './geometry.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

// ---------- Casca (shell) com shader por elemento ----------
const SHELL_VERT = /* glsl */`
uniform float uInflate;
varying vec3 vN; varying vec3 vV; varying vec3 vObj;
void main(){
  vObj = position;
  vec3 p = position + normal * uInflate;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - wp.xyz);
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const SHELL_FRAG = /* glsl */`
uniform vec3 uColor; uniform vec3 uGlow; uniform float uTime; uniform float uMode; uniform float uBoost; uniform float uScale;
${NOISE_GLSL}
varying vec3 vN; varying vec3 vV; varying vec3 vObj;
void main(){
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
  vec3 p = vObj * uScale;
  vec3 col; float a;
  if (uMode < 0.5) { // água: fluxo cáustico
    float n = fxFbm(p * vec3(30.0, 8.0, 30.0) + vec3(0.0, -uTime * 1.8, uTime * 0.4));
    float c = smoothstep(0.55, 0.75, n);
    col = mix(uColor, uGlow, c + f * 0.5);
    a = 0.28 + f * 0.5 + c * 0.45;
  } else if (uMode < 1.5) { // gelo: geada
    float n = fxNoise(p * 90.0);
    col = mix(uColor, vec3(1.0), f * 0.7 + n * 0.3);
    a = f * 0.75 + step(0.82, n) * 0.35;
  } else if (uMode < 2.5) { // sombra: fumaça escura
    float n = fxFbm(p * vec3(18.0, 6.0, 18.0) + vec3(0.0, -uTime * 0.9, uTime * 0.3));
    col = mix(vec3(0.02, 0.0, 0.05), uGlow, f * 0.8);
    a = smoothstep(0.35, 0.75, n) * 0.85 + f * 0.4;
  } else if (uMode < 3.5) { // elétrico: tremulação
    float n = fxNoise(p * 40.0 + vec3(uTime * 25.0));
    col = mix(uColor, vec3(1.0), f);
    a = f * (0.4 + 0.6 * step(0.5, n));
  } else { // luz / arcano: halo suave
    col = mix(uColor, vec3(1.0), f * 0.6);
    a = f * 0.8;
  }
  gl_FragColor = vec4(col * (1.0 + uBoost), clamp(a * (1.0 + uBoost * 0.5), 0.0, 1.0));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
const SHELL_MODES = { water: 0, ice: 1, shadow: 2, lightning: 3, light: 4, arcane: 4 };

function shellMaterial(D, mode, color, glow, { additive = true, inflate = 0.003 } = {}) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uGlow: { value: new THREE.Color(glow) }, uTime: { value: 0 },
      uMode: { value: SHELL_MODES[mode] ?? 4 }, uBoost: { value: 0 }, uInflate: { value: inflate }, uScale: { value: 1 },
    },
    vertexShader: SHELL_VERT, fragmentShader: SHELL_FRAG, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
  });
  D.fxMats.push(m);
  return m;
}

/** Clona as malhas de papel 'blade' com um material de casca. */
function addShells(D, mat, scale = [1.12, 1.01, 1.6]) {
  for (const b of D.bladeMeshes) {
    const s = new THREE.Mesh(b.geometry, mat);
    s.position.copy(b.position); s.rotation.copy(b.rotation);
    s.scale.copy(b.scale).multiply(V(...scale));
    s.renderOrder = 3;
    s.userData.sharedGeo = true;
    D.pivot.add(s);
  }
}

// ---------- utilidades de eixo ----------
function axisInfo(info) {
  const a = V(...info.axis.from), b = V(...info.axis.to);
  const dir = V().subVectors(b, a);
  const len = dir.length();
  dir.normalize();
  const normal = V(0, 0, 1);
  const lateral = V().crossVectors(dir, normal).normalize();
  if (lateral.lengthSq() < 0.5) lateral.set(1, 0, 0);
  return { a, b, dir, len, lateral, normal, width: info.axis.width, wb: Math.min(info.axis.width, 0.045), at: (t) => V().copy(a).addScaledVector(dir, t * len) };
}

function sprite(D, tex, color, size, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map: tex, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity });
  D.fxMats.push(m);
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  s.renderOrder = 4;
  D.pivot.add(s);
  return s;
}

// ---------- GELO ----------
function ice(D) {
  const X = D.ax, rng = D.rng;
  const env = studioEnvMap();
  const mat = new THREE.MeshStandardMaterial({ color: 0xdcf5ff, emissive: 0x58b8f0, emissiveIntensity: 0.55, roughness: 0.08, metalness: 0.15, transparent: true, opacity: 0.86, flatShading: true, envMap: env, envMapIntensity: 1.8, map: elementSurfaceTexture('ice', texSize(D.quality)) });
  D.mats.push(mat);
  const n = [5, 9, 14][D.detail];
  const up = V(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const t = 0.04 + 0.86 * (i / n) + rng() * 0.05;
    const side = i % 2 ? 1 : -1;
    const p = X.at(t).addScaledVector(X.lateral, side * X.width * (0.6 + rng() * 0.3)).addScaledVector(X.normal, (rng() - 0.5) * X.width * 0.4);
    const d = V().copy(X.lateral).multiplyScalar(side).addScaledVector(X.dir, 0.55 + rng() * 0.5).addScaledVector(X.normal, (rng() - 0.5) * 0.9).normalize();
    const h = Math.max(0.03, X.wb * (1.4 + rng() * 1.6) * (1 - t * 0.45));
    const g = crystalGeometry(h * 0.17, h, 6, 0.35, 0.7);
    const m = new THREE.Mesh(g, mat);
    m.position.copy(p);
    m.quaternion.setFromUnitVectors(up, d);
    m.castShadow = false;
    m.userData.role = 'ice';
    D.pivot.add(m);
  }
  // aglomerado de cristais na base
  for (let i = 0; i < [2, 3, 5][D.detail]; i++) {
    const h = X.width * (1.2 + rng());
    const m = new THREE.Mesh(crystalGeometry(h * 0.2, h, 6, 0.35, 0.7), mat);
    m.position.copy(X.a).addScaledVector(X.lateral, (rng() - 0.5) * X.width * 2);
    m.quaternion.setFromUnitVectors(up, V(rng() - 0.5, 0.6, rng() - 0.5).normalize());
    D.pivot.add(m);
  }
  addShells(D, shellMaterial(D, 'ice', 0x9fe0ff, 0xffffff), [1.18, 1.01, 1.8]);
  D.emitEvery(0.07, () => {
    const p = X.at(rng()).addScaledVector(X.lateral, (rng() - 0.5) * X.width * 3);
    D.emit(p, { vel: V((rng() - 0.5) * 0.05, -0.05 - rng() * 0.08, (rng() - 0.5) * 0.05), life: 1.4, color: 0xffffff, color1: 0x8fdcff, size: 0.05, size1: 0.0, shape: SHAPE.SPARK, rot: rng() * 3, spin: 2 });
  });
  D.emitEvery(0.18, () => {
    const p = X.at(rng());
    D.emit(p, { vel: V(0, -0.12, 0), drag: 0.5, life: 1.6, color: 0xe8f8ff, size: X.width * 2.2, size1: X.width * 5, shape: SHAPE.SMOKE, alpha: 0.18, rot: rng() * 6, spin: 0.5, solid: true });
  });
}

// ---------- FOGO ----------
const FLAME_FRAG = /* glsl */`
uniform float uTime; uniform float uBoost; uniform vec3 uHot; uniform vec3 uMid; uniform vec3 uCool;
${NOISE_GLSL}
varying vec2 vUv;
void main(){
  float x = vUv.x * 2.0 - 1.0;
  float y = vUv.y;
  float n = fxFbm(vec3(vUv.x * 5.0, y * 4.0 - uTime * 2.6, uTime * 0.7));
  float n2 = fxNoise(vec3(vUv.x * 11.0, y * 9.0 - uTime * 4.0, 2.0));
  float body = 1.0 - abs(x) * (1.25 - 0.55 * n);
  float heat = body * (0.75 + 0.6 * n) - y * 0.35 + n2 * 0.15;
  heat *= smoothstep(0.0, 0.12, y) * smoothstep(1.0, 0.75, y);
  if (heat < 0.18) discard;
  vec3 col = heat > 0.6 ? mix(uMid, uHot, clamp((heat - 0.6) * 2.5, 0.0, 1.0)) : mix(uCool, uMid, (heat - 0.18) / 0.42);
  gl_FragColor = vec4(col * (1.2 + uBoost), smoothstep(0.18, 0.45, heat) * 0.9);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
function fire(D) {
  const X = D.ax, rng = D.rng;
  // planos cruzados de chama (sempre subindo em +Y local)
  const pa = X.a, pb = X.b;
  const minX = Math.min(pa.x, pb.x) - X.width * 1.6, maxX = Math.max(pa.x, pb.x) + X.width * 1.6;
  const minY = Math.min(pa.y, pb.y) - X.width * 0.5, maxY = Math.max(pa.y, pb.y) + X.width * 3 + 0.06;
  const w = maxX - minX, h = maxY - minY;
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: rng() * 10 }, uBoost: { value: 0 },
      uHot: { value: new THREE.Color(0xfff2b0) }, uMid: { value: new THREE.Color(0xff8a1a) }, uCool: { value: new THREE.Color(0xc62a00) },
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: FLAME_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  D.fxMats.push(mat);
  const geo = new THREE.PlaneGeometry(1, 1);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2, cz = (pa.z + pb.z) / 2;
  const planes = [];
  const pl = new THREE.Mesh(geo, mat); pl.position.set(cx, cy, cz); pl.scale.set(w, h, 1); planes.push(pl);
  const zw = Math.max(X.width * 3.2, 0.06);
  const p2 = new THREE.Mesh(geo, mat); p2.position.set(cx, cy, cz); p2.rotation.y = Math.PI / 2; p2.scale.set(zw, h, 1); planes.push(p2);
  for (const p of planes) { p.renderOrder = 5; D.pivot.add(p); }
  D.ownGeos.push(geo);
  D.anims.push((dt) => { mat.uniforms.uTime.value += dt; });
  D.emitEvery(0.05, () => {
    const p = X.at(rng()).addScaledVector(X.lateral, (rng() - 0.5) * X.width * 2.2);
    D.emit(p, { vel: V((rng() - 0.5) * 0.3, 0.5 + rng() * 0.6, (rng() - 0.5) * 0.3), drag: 0.8, life: 0.9 + rng() * 0.6, color: rng() < 0.5 ? 0xffe066 : 0xff8c1a, color1: 0xff3d00, size: 0.035, size1: 0.0, shape: SHAPE.DOT });
  });
  D.emitEvery(0.25, () => {
    const p = X.at(0.5 + rng() * 0.5);
    D.emit(p, { vel: V(0, 0.35, 0), drag: 0.6, life: 1.4, color: 0x3a2a24, size: X.width * 2, size1: X.width * 6, shape: SHAPE.SMOKE, alpha: 0.22, rot: rng() * 6, spin: 0.6, solid: true });
  });
}

// ---------- RAIO ----------
function lightning(D) {
  const X = D.ax, rng = D.rng;
  const nArcs = [1, 2, 3][D.detail];
  const arcs = [];
  for (let i = 0; i < nArcs; i++) {
    const glow = new BeamRibbon(14, makeBeamMaterial({ color: 0x7fb2ff, core: 0.3, opacity: 0.9 }));
    const core = new BeamRibbon(14, makeBeamMaterial({ color: 0xffffff, core: 1, opacity: 1 }));
    glow.mesh.renderOrder = core.mesh.renderOrder = 6;
    D.pivot.add(glow.mesh, core.mesh);
    D.fxMats.push(glow.material, core.material);
    D.ribbons.push(glow, core);
    arcs.push({ glow, core, life: 0 });
  }
  // núcleo brilhante ao longo do eixo
  const spine = new BeamRibbon(2, makeBeamMaterial({ color: 0x9fc4ff, core: 0.7, opacity: 0.55, scroll: 8, fadeEnds: 0.15 }));
  spine.setPoints([X.a, X.b], X.width * 2.6);
  D.pivot.add(spine.mesh);
  D.fxMats.push(spine.material);
  D.ribbons.push(spine);
  let frame = 0;
  const regen = (arc) => {
    const t1 = rng() * 0.85, t2 = Math.min(1, t1 + 0.12 + rng() * 0.35);
    const s1 = rng() < 0.5 ? -1 : 1;
    const p1 = X.at(t1).addScaledVector(X.lateral, s1 * X.width * 0.9);
    let p2 = X.at(t2).addScaledVector(X.lateral, -s1 * X.width * (0.9 + rng() * 1.6)).addScaledVector(X.normal, (rng() - 0.5) * X.width * 2);
    if (rng() < 0.2) p2 = X.at(1).addScaledVector(X.dir, X.width * (1 + rng() * 2)).addScaledVector(X.lateral, (rng() - 0.5) * X.width * 4);
    const pts = jaggedPath(p1, p2, rng, { segments: 10, jitter: 0.3 });
    const w = Math.max(0.004, X.width * 0.22);
    arc.glow.setPoints(pts, w * 4);
    arc.core.setPoints(pts, w);
    arc.life = 0.06 + rng() * 0.12;
  };
  for (const a of arcs) regen(a);
  D.anims.push((dt, t, boost) => {
    frame++;
    for (const a of arcs) {
      a.life -= dt;
      if (a.life <= 0 || frame % 3 === 0) { if (a.life <= 0 || rng() < 0.4) regen(a); }
      const o = (0.6 + 0.4 * rng()) * (1 + boost);
      a.glow.material.uniforms.uOpacity.value = 0.8 * o;
      a.core.material.uniforms.uOpacity.value = o;
    }
    spine.material.uniforms.uTime.value = t;
    spine.material.uniforms.uOpacity.value = 0.45 + 0.15 * Math.sin(t * 30) + boost;
  });
  addShells(D, shellMaterial(D, 'lightning', 0x7fb2ff, 0xffffff), [1.15, 1.01, 1.7]);
  D.emitEvery(0.09, () => {
    const p = X.at(rng()).addScaledVector(X.lateral, (rng() < 0.5 ? -1 : 1) * X.width);
    D.emit(p, { vel: V((rng() - 0.5) * 1.5, (rng() - 0.3) * 1.5, (rng() - 0.5) * 1.5), drag: 3, life: 0.25, color: 0xffffff, color1: 0x7fb2ff, size: 0.04, size1: 0, shape: SHAPE.SPARK });
  });
}

// ---------- VENENO ----------
function poison(D) {
  const X = D.ax, rng = D.rng;
  const dropMat = new THREE.MeshStandardMaterial({ color: 0x7dff4a, emissive: 0x4fd12a, emissiveIntensity: 0.9, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.85, envMap: studioEnvMap(), envMapIntensity: 1.5 });
  D.mats.push(dropMat);
  // gota: lágrima torneada (ponta para cima)
  const pts = [];
  for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI; pts.push([Math.sin(a) * 1, -Math.cos(a) * 1]); }
  pts.push([0.35, 1.4]); pts.push([0, 2.4]);
  const dropGeo = lathe(pts, 10);
  D.ownGeos.push(dropGeo);
  const drops = [];
  const nd = [2, 3, 5][D.detail];
  const r = Math.max(0.006, X.width * 0.28);
  for (let i = 0; i < nd; i++) {
    const m = new THREE.Mesh(dropGeo, dropMat);
    m.renderOrder = 2;
    D.pivot.add(m);
    drops.push({ m, phase: -rng() * 2, anchor: V(), fall: 0 });
  }
  const q = new THREE.Quaternion(), down = V(), wscale = V();
  const reset = (d) => {
    d.anchor.copy(X.at(0.1 + rng() * 0.8)).addScaledVector(X.lateral, (rng() < 0.5 ? -1 : 1) * X.width * 0.85);
    d.phase = 0; d.fall = 0; d.v = 0;
  };
  for (const d of drops) { reset(d); d.phase = -rng() * 1.5; }
  // bolhas (cascas fresnel)
  const bubMat = shellMaterial(D, 'light', 0xb6ff5c, 0xffffff);
  bubMat.uniforms.uInflate.value = 0;
  const bubGeo = new THREE.SphereGeometry(1, 10, 8);
  D.ownGeos.push(bubGeo);
  const bubbles = [];
  for (let i = 0; i < [2, 4, 6][D.detail]; i++) {
    const m = new THREE.Mesh(bubGeo, bubMat);
    D.pivot.add(m);
    bubbles.push({ m, t: rng(), base: V(), dur: 0.9 + rng() * 0.8 });
  }
  D.anims.push((dt) => {
    D.pivot.getWorldQuaternion(q).invert();
    D.pivot.getWorldScale(wscale);
    down.set(0, -1, 0).applyQuaternion(q);
    for (const d of drops) {
      d.phase += dt;
      if (d.phase < 0) { d.m.visible = false; continue; }
      d.m.visible = true;
      const grow = Math.min(1, d.phase / 0.9);
      d.m.scale.set(r * grow, r * grow * (1 + d.fall * 4), r * grow);
      if (d.phase > 1.2) {
        d.v += 9.8 * dt;
        d.fall += (d.v * dt) / Math.max(1e-3, wscale.y);
      }
      d.m.position.copy(d.anchor).addScaledVector(down, d.fall);
      d.m.quaternion.setFromUnitVectors(V(0, -1, 0), down);
      if (d.fall > 0.35) {
        D.emit(d.m.position.clone(), { vel: V(0, 0.4, 0), life: 0.3, color: 0xb6ff5c, size: 0.04, size1: 0, local: true });
        reset(d);
        d.phase = -rng() * 0.8;
      }
    }
    for (const b of bubbles) {
      b.t += dt / b.dur;
      if (b.t >= 1) {
        D.emit(b.m.position.clone(), { vel: V(0, 0.2, 0), life: 0.25, color: 0xc5ff7a, size: 0.03, size1: 0.0, shape: SHAPE.SPARK, local: true });
        b.t = 0; b.base.copy(X.at(rng())).addScaledVector(X.lateral, (rng() - 0.5) * X.width * 1.6).addScaledVector(X.normal, (rng() < 0.5 ? -1 : 1) * X.width * 0.3);
      }
      const s = Math.max(0.003, X.width * 0.25) * (0.3 + b.t);
      b.m.scale.setScalar(s);
      b.m.position.copy(b.base).addScaledVector(down, -b.t * 0.06);
    }
  });
  D.emitEvery(0.2, () => {
    const p = X.at(rng());
    D.emit(p, { vel: V(0, 0.1, 0), drag: 0.5, life: 1.8, color: 0x5fd13c, size: X.width * 2.5, size1: X.width * 6, shape: SHAPE.SMOKE, alpha: 0.2, rot: rng() * 6, spin: 0.5, solid: true });
  });
}

// ---------- ARCANO ----------
function arcane(D) {
  const X = D.ax, rng = D.rng;
  const rings = [];
  const n = [1, 2, 3][D.detail];
  const geo = new THREE.PlaneGeometry(1, 1);
  D.ownGeos.push(geo);
  const zAxis = V(0, 0, 1);
  for (let i = 0; i < n; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: runeCircleTexture(3 + i), color: i % 2 ? 0xe7c6ff : 0xb46bff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, opacity: 0.9 });
    D.fxMats.push(mat);
    const holder = new THREE.Group();
    holder.quaternion.setFromUnitVectors(zAxis, X.dir);
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = 5;
    const size = THREE.MathUtils.clamp(X.width * (4.5 + i * 1.2), 0.09, 0.3);
    m.scale.setScalar(size);
    holder.add(m);
    D.pivot.add(holder);
    rings.push({ holder, m, t0: [0.2, 0.62, 0.95][i] ?? 0.5, speed: (i % 2 ? -1 : 1) * (1.2 + i * 0.6), mat });
  }
  D.anims.push((dt, t, boost) => {
    for (const r of rings) {
      const tt = THREE.MathUtils.clamp(r.t0 + Math.sin(t * 0.8 + r.t0 * 6) * 0.06, 0, 1);
      r.holder.position.copy(X.at(tt));
      r.m.rotation.z += r.speed * dt;
      r.mat.opacity = 0.7 + 0.2 * Math.sin(t * 3 + r.t0 * 10) + boost * 0.5;
    }
  });
  addShells(D, shellMaterial(D, 'arcane', 0xb46bff, 0xffffff), [1.12, 1.01, 1.6]);
  D.emitEvery(0.08, () => {
    const p = X.at(rng());
    D.emit(p, { vel: V(0, 0.12, 0), orbit: [X.width * 2.5, rng() * 6.28, 2.5, 0], life: 1.2, color: 0xf0d9ff, color1: 0x6a2cff, size: 0.04, size1: 0.0, shape: SHAPE.SPARK, local: true });
  });
}

// ---------- LUZ ----------
function light(D) {
  const X = D.ax, rng = D.rng;
  const haloMat = new THREE.MeshBasicMaterial({ color: 0xffe9a3, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 });
  D.fxMats.push(haloMat);
  const R = THREE.MathUtils.clamp(X.width * 2.6, 0.06, 0.16);
  const hgeo = new THREE.TorusGeometry(R, Math.max(0.002, R * 0.045), 6, 48);
  D.ownGeos.push(hgeo);
  const holder = new THREE.Group();
  holder.quaternion.setFromUnitVectors(V(0, 0, 1), X.dir);
  holder.position.copy(D.info.style === 'blade' ? X.at(0.05) : X.at(0.5));
  const halo = new THREE.Mesh(hgeo, haloMat);
  const halo2 = new THREE.Mesh(hgeo, haloMat);
  halo2.scale.setScalar(0.72);
  holder.add(halo, halo2);
  D.pivot.add(holder);
  const glowS = sprite(D, glowTexture(), 0xfff3c4, R * 3, 0.6);
  glowS.position.copy(holder.position);
  const rays = sprite(D, rayTexture(), 0xffe9a3, Math.min(0.35, X.width * 5 + 0.08), 0.9);
  rays.position.copy(X.b);
  // radiância ao longo do eixo
  const beam = new BeamRibbon(2, makeBeamMaterial({ color: 0xfff3c4, core: 0.6, opacity: 0.35, fadeEnds: 0.2 }));
  beam.setPoints([X.at(-0.05), X.at(1.05)], Math.min(0.3, X.width * 5));
  D.pivot.add(beam.mesh);
  D.fxMats.push(beam.material);
  D.ribbons.push(beam);
  D.anims.push((dt, t, boost) => {
    halo.rotation.x = Math.sin(t * 0.9) * 0.25; halo.rotation.y = Math.cos(t * 0.7) * 0.25;
    halo2.rotation.x = -Math.sin(t * 1.1) * 0.3;
    rays.material.rotation += dt * 0.6;
    rays.material.opacity = 0.65 + 0.25 * Math.sin(t * 2.5) + boost;
    glowS.material.opacity = 0.6 + 0.2 * Math.sin(t * 1.7) + boost;
    beam.material.uniforms.uOpacity.value = 0.3 + 0.1 * Math.sin(t * 2) + boost * 0.5;
  });
  addShells(D, shellMaterial(D, 'light', 0xffe9a3, 0xffffff), [1.1, 1.01, 1.5]);
  D.emitEvery(0.09, () => {
    const p = X.at(rng()).addScaledVector(X.lateral, (rng() - 0.5) * X.width * 4);
    D.emit(p, { vel: V(0, 0.15, 0), drag: 0.5, life: 1.3, color: 0xffffff, color1: 0xffd86b, size: 0.045, size1: 0.0, shape: SHAPE.SPARK, rot: rng() * 3 });
  });
}

// ---------- SOMBRA ----------
function shadow(D) {
  const X = D.ax, rng = D.rng;
  addShells(D, shellMaterial(D, 'shadow', 0x2a1d45, 0x9d7bd8, { additive: false, inflate: 0.004 }), [1.3, 1.02, 2.2]);
  D.emitEvery(0.05, () => {
    const p = X.at(rng()).addScaledVector(X.lateral, (rng() - 0.5) * X.width * 2);
    D.emit(p, { vel: V((rng() - 0.5) * 0.1, 0.18 + rng() * 0.15, (rng() - 0.5) * 0.1), drag: 0.6, life: 1.4 + rng(), color: rng() < 0.5 ? 0x140c22 : 0x2a1d45, color1: 0x05030a, size: X.width * 2.2 + 0.02, size1: X.width * 5 + 0.05, shape: SHAPE.SMOKE, alpha: 0.75, rot: rng() * 6, spin: (rng() - 0.5) * 2, solid: true });
  });
  D.emitEvery(0.12, () => {
    const p = X.at(rng()).addScaledVector(X.lateral, (rng() - 0.5) * X.width * 2);
    D.emit(p, { vel: V(0, 0.3, 0), drag: 0.8, life: 0.9, color: 0x9d7bd8, color1: 0x5b3f8f, size: 0.03, size1: 0, shape: SHAPE.DOT });
  });
}

// ---------- ÁGUA ----------
function water(D) {
  const X = D.ax, rng = D.rng;
  const sheath = shellMaterial(D, 'water', 0x2f8fff, 0xcff0ff, { additive: false, inflate: 0.004 });
  addShells(D, sheath, [1.4, 1.02, 2.6]);
  const dropMat = new THREE.MeshStandardMaterial({ color: 0x8fd0ff, emissive: 0x2f8fff, emissiveIntensity: 0.6, roughness: 0.02, metalness: 0, transparent: true, opacity: 0.75, envMap: studioEnvMap(), envMapIntensity: 2 });
  D.mats.push(dropMat);
  const g = new THREE.SphereGeometry(1, 10, 8);
  D.ownGeos.push(g);
  const orbs = [];
  for (let i = 0; i < [2, 4, 6][D.detail]; i++) {
    const m = new THREE.Mesh(g, dropMat);
    m.scale.setScalar(Math.max(0.006, X.width * (0.18 + rng() * 0.15)));
    D.pivot.add(m);
    orbs.push({ m, ph: rng() * 6.28, sp: 1.5 + rng() * 1.5, r: X.width * (1.6 + rng() * 0.8) });
  }
  const perpA = X.lateral, perpB = X.normal;
  D.anims.push((dt, t) => {
    for (const o of orbs) {
      const a = o.ph + t * o.sp;
      const tt = 0.5 + 0.48 * Math.sin(a * 0.35);
      o.m.position.copy(X.at(tt)).addScaledVector(perpA, Math.cos(a) * o.r).addScaledVector(perpB, Math.sin(a) * o.r);
    }
  });
  D.emitEvery(0.08, () => {
    const p = X.at(rng()).addScaledVector(X.lateral, (rng() - 0.5) * X.width * 2);
    D.emit(p, { vel: V((rng() - 0.5) * 0.2, -0.2, (rng() - 0.5) * 0.2), gravity: -3, life: 0.6, color: 0xe0f4ff, color1: 0x5ab4ff, size: 0.035, size1: 0.01 });
  });
}

// ---------- TERRA ----------
function earth(D) {
  const X = D.ax, rng = D.rng;
  const mat = new THREE.MeshStandardMaterial({ map: elementSurfaceTexture('earth', texSize(D.quality)), color: 0xb09878, roughness: 0.95, metalness: 0.02, flatShading: true });
  D.mats.push(mat);
  const n = [3, 6, 9][D.detail];
  for (let i = 0; i < n; i++) {
    const t = 0.05 + 0.85 * (i / n) + rng() * 0.05;
    const s = X.wb * (0.6 + rng() * 0.7) * (1 - t * 0.4);
    const g = rockGeometry(1, 0, 11 + i * 13, 0.4, 0.75);
    D.ownGeos.push(g);
    const m = new THREE.Mesh(g, mat);
    m.position.copy(X.at(t)).addScaledVector(X.lateral, (i % 2 ? 1 : -1) * X.width * (0.55 + rng() * 0.4)).addScaledVector(X.normal, (rng() - 0.5) * X.width * 0.8);
    m.scale.set(s, s * (0.8 + rng() * 0.5), s * 0.9);
    m.rotation.set(rng() * 6, rng() * 6, rng() * 6);
    m.castShadow = D.detail > 0;
    D.pivot.add(m);
  }
  // pedrinhas flutuando
  const peb = [];
  for (let i = 0; i < [1, 3, 5][D.detail]; i++) {
    const g = rockGeometry(1, 0, 101 + i * 7, 0.45, 0.9);
    D.ownGeos.push(g);
    const m = new THREE.Mesh(g, mat);
    m.scale.setScalar(X.wb * (0.3 + rng() * 0.25));
    D.pivot.add(m);
    peb.push({ m, ph: rng() * 6.28, r: X.width * (2.2 + rng()), t: 0.2 + rng() * 0.7 });
  }
  D.anims.push((dt, t) => {
    for (const p of peb) {
      const a = p.ph + t * 0.9;
      p.m.position.copy(X.at(p.t + Math.sin(t * 0.7 + p.ph) * 0.04)).addScaledVector(X.lateral, Math.cos(a) * p.r).addScaledVector(X.normal, Math.sin(a) * p.r);
      p.m.rotation.x += dt; p.m.rotation.y += dt * 0.7;
    }
  });
  D.emitEvery(0.15, () => {
    const p = X.at(rng()).addScaledVector(X.lateral, (rng() - 0.5) * X.width * 2);
    D.emit(p, { vel: V(0, -0.1, 0), gravity: -2, life: 0.8, color: 0x8a6a42, size: 0.025, size1: 0.02, shape: SHAPE.SHARD, rot: rng() * 6, spin: 6, solid: true });
  });
}

// ---------- VENTO ----------
const WIND_FRAG = /* glsl */`
uniform float uTime; uniform float uSpeed; uniform float uBoost; uniform vec3 uColor;
varying vec2 vUv;
void main(){
  float s = fract(vUv.x * 2.0 - uTime * uSpeed);
  float dash = smoothstep(0.0, 0.5, s) * smoothstep(1.0, 0.55, s);
  float edge = 1.0 - abs(vUv.y * 2.0 - 1.0);
  float a = dash * edge * smoothstep(0.0, 0.1, vUv.x) * smoothstep(1.0, 0.9, vUv.x);
  gl_FragColor = vec4(mix(uColor, vec3(1.0), dash * 0.6) * (1.0 + uBoost), a * 0.85);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;
function wind(D) {
  const X = D.ax, rng = D.rng;
  const n = [1, 2, 3][D.detail];
  for (let k = 0; k < n; k++) {
    const pts = [];
    const turns = 1.6 + k * 0.4, R = X.width * 1.1 + X.wb * (0.9 + k * 0.5), ph = (k / n) * Math.PI * 2;
    for (let i = 0; i <= 40; i++) {
      const t = i / 40, a = ph + t * turns * Math.PI * 2;
      pts.push(X.at(-0.05 + t * 1.1).addScaledVector(X.lateral, Math.cos(a) * R * (0.7 + 0.3 * Math.sin(t * 3))).addScaledVector(X.normal, Math.sin(a) * R));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const g = new THREE.TubeGeometry(curve, 80, Math.max(0.002, X.width * 0.12), 3, false);
    // achata o tubo em fita: usamos uv.y para borda
    D.ownGeos.push(g);
    const mat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: rng() * 5 }, uSpeed: { value: 0.8 + k * 0.3 }, uBoost: { value: 0 }, uColor: { value: new THREE.Color(0x9fe8d5) } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: WIND_FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    D.fxMats.push(mat);
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 5;
    D.pivot.add(m);
    D.anims.push((dt) => { mat.uniforms.uTime.value += dt; });
  }
  D.emitEvery(0.1, () => {
    const p = X.at(rng());
    D.emit(p, { vel: V(0, 0.2, 0), orbit: [X.width * 2.4, rng() * 6.28, 6, 0.05], life: 0.8, color: 0xffffff, color1: 0x9fe8d5, size: 0.035, size1: 0.0, shape: SHAPE.SPARK, local: true });
  });
}

const BUILDERS = { ice, fire, lightning, poison, arcane, light, shadow, water, earth, wind };

/** Aplica a decoração elemental. */
export function applyElement(D) {
  D.ax = axisInfo(D.info);
  D.rng = mulberry32(((D.info.length * 1000) | 0) + 17);
  const fn = BUILDERS[D.element];
  if (fn) fn(D);
}

/** Aura de raridade (épico/lendário). */
export function applyRarityAura(D, color) {
  const X = D.ax || axisInfo(D.info);
  D.ax = X;
  const rng = D.rng || Math.random;
  const center = V().lerpVectors(V(0, 0, 0), X.b, 0.55);
  const size = D.info.length * 1.1;
  const s = sprite(D, glowTexture(), color, size, 0.32);
  s.position.copy(center);
  s.renderOrder = 1;
  let rays = null;
  if (D.rarity === 'lendario') {
    rays = sprite(D, rayTexture(), color, size * 0.8, 0.25);
    rays.position.copy(center);
    rays.renderOrder = 1;
  }
  D.anims.push((dt, t, boost) => {
    s.material.opacity = 0.26 + 0.08 * Math.sin(t * 2) + boost * 0.4;
    if (rays) { rays.material.rotation += dt * 0.3; rays.material.opacity = 0.18 + 0.08 * Math.sin(t * 1.3) + boost * 0.3; }
  });
  const col = new THREE.Color(color);
  D.emitEvery(D.rarity === 'lendario' ? 0.08 : 0.14, () => {
    const p = V().lerpVectors(V(0, 0, 0), X.b, rng()).add(V((rng() - 0.5) * 0.15, 0, (rng() - 0.5) * 0.15));
    D.emit(p, { vel: V(0, 0.12, 0), drag: 0.3, life: 1.5, color: 0xffffff, color1: col, size: 0.04, size1: 0.0, shape: SHAPE.SPARK, rot: rng() * 3 });
  });
}
