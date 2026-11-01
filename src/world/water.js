// Água: encontra as bacias abaixo de WATER_LEVEL (lago principal + lagoas) e cria um patch por
// bacia com shader próprio (ondas, fresnel, reflexo do céu, brilho do sol, espuma na margem).
import * as THREE from 'three';
import { terrainHeight, WATER_LEVEL, WORLD_HALF } from '../../shared/world.js';
import { worldUniforms } from './common.js';
import { waterNormalTexture } from './textures.js';

const VERT = /* glsl */ `
attribute float aDepth;
uniform float uTime; uniform float uWaveAmp;
varying vec3 vW; varying float vDepth; varying vec3 vN;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float amp = uWaveAmp * smoothstep(0.2, 2.5, aDepth);
  vec2 d1 = normalize(vec2(1.0, 0.35)); vec2 d2 = normalize(vec2(-0.4, 1.0)); vec2 d3 = normalize(vec2(0.7, -0.8));
  float k1 = 0.28, k2 = 0.45, k3 = 0.8;
  float f1 = dot(d1, p.xz) * k1 + uTime * 1.1;
  float f2 = dot(d2, p.xz) * k2 + uTime * 1.5;
  float f3 = dot(d3, p.xz) * k3 + uTime * 2.1;
  p.y += amp * (sin(f1) * 0.5 + sin(f2) * 0.3 + sin(f3) * 0.15);
  vec2 g = amp * (d1 * k1 * cos(f1) * 0.5 + d2 * k2 * cos(f2) * 0.3 + d3 * k3 * cos(f3) * 0.15);
  vN = normalize(vec3(-g.x, 1.0, -g.y));
  vW = p;
  vDepth = aDepth;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;

const FRAG = /* glsl */ `
uniform sampler2D uNormal;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform vec3 uSky; uniform vec3 uHorizon;
uniform vec3 uDeep; uniform vec3 uShallow; uniform float uTime; uniform float uLight; uniform float uWet;
varying vec3 vW; varying float vDepth; varying vec3 vN;
#include <common>
#include <fog_pars_fragment>
void main() {
  if (vDepth < -0.15) discard;
  vec2 uv1 = vW.xz * 0.045 + vec2(uTime * 0.018, uTime * 0.011);
  vec3 t1 = texture2D(uNormal, uv1).xyz * 2.0 - 1.0;
#ifdef SIMPLE
  vec3 tn = t1 * 0.6;
#else
  vec2 uv2 = vW.xz * 0.12 - vec2(uTime * 0.015, -uTime * 0.022);
  vec3 t2 = texture2D(uNormal, uv2).xyz * 2.0 - 1.0;
  vec2 uv3 = vW.xz * 0.6 + vec2(uTime * 0.05, uTime * 0.04);
  vec3 t3 = texture2D(uNormal, uv3).xyz * 2.0 - 1.0;
  vec3 tn = t1 * 0.55 + t2 * 0.4 + t3 * (0.12 + uWet * 0.5);
#endif
  vec3 n = normalize(vN + vec3(tn.x, 0.0, tn.y) * 0.45);
  vec3 V = normalize(cameraPosition - vW);
  float ndv = max(dot(n, V), 0.0);
  float fres = 0.04 + 0.96 * pow(1.0 - ndv, 5.0);
  fres = clamp(fres * 1.15, 0.0, 1.0);
  vec3 R = reflect(-V, n);
  vec3 refl = mix(uHorizon, uSky, smoothstep(-0.05, 0.6, R.y));
  float sd = max(dot(R, uSunDir), 0.0);
  float spec = pow(sd, 280.0) * 4.0 + pow(sd, 40.0) * 0.18;
  vec3 body = mix(uShallow, uDeep, smoothstep(0.0, 3.2, vDepth)) * uLight;
  // espuma da margem animada
  float fn = texture2D(uNormal, vW.xz * 0.2 + uTime * 0.02).z;
  float edge = 1.0 - smoothstep(0.0, 0.28 + fn * 0.25, vDepth);
  float band = smoothstep(0.55, 0.9, sin(vDepth * 14.0 - uTime * 2.2) * 0.5 + 0.5) * (1.0 - smoothstep(0.0, 0.8, vDepth));
  float foam = clamp(edge + band * 0.45, 0.0, 1.0);
  vec3 col = mix(body, refl, fres) + uSunColor * spec;
  col = mix(col, vec3(0.92, 0.96, 1.0) * max(uLight, 0.25), foam * 0.75);
  float alpha = mix(0.5, 0.9, smoothstep(0.0, 2.8, vDepth));
  alpha = max(alpha, fres * 0.95);
  alpha = max(alpha, foam * 0.85);
  alpha *= smoothstep(-0.15, 0.05, vDepth);
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}`;

function findBasins(step = 4) {
  const N = Math.floor((WORLD_HALF * 2) / step);
  const wet = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const x = -WORLD_HALF + (i + 0.5) * step;
      const z = -WORLD_HALF + (j + 0.5) * step;
      if (terrainHeight(x, z) < WATER_LEVEL + 0.1) wet[j * N + i] = 1;
    }
  }
  const seen = new Uint8Array(N * N);
  const basins = [];
  for (let s = 0; s < N * N; s++) {
    if (!wet[s] || seen[s]) continue;
    const stack = [s];
    seen[s] = 1;
    let minI = N;
    let maxI = 0;
    let minJ = N;
    let maxJ = 0;
    let n = 0;
    while (stack.length) {
      const c = stack.pop();
      const i = c % N;
      const j = (c / N) | 0;
      n++;
      if (i < minI) minI = i;
      if (i > maxI) maxI = i;
      if (j < minJ) minJ = j;
      if (j > maxJ) maxJ = j;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= N || jj >= N) continue;
        const k = jj * N + ii;
        if (wet[k] && !seen[k]) {
          seen[k] = 1;
          stack.push(k);
        }
      }
    }
    basins.push({
      n,
      minX: -WORLD_HALF + minI * step - step,
      maxX: -WORLD_HALF + (maxI + 1) * step + step,
      minZ: -WORLD_HALF + minJ * step - step,
      maxZ: -WORLD_HALF + (maxJ + 1) * step + step,
    });
  }
  return basins;
}

function basinGeometry(b, cell) {
  const w = b.maxX - b.minX;
  const d = b.maxZ - b.minZ;
  const nx = Math.max(2, Math.ceil(w / cell));
  const nz = Math.max(2, Math.ceil(d / cell));
  const pos = [];
  const depth = [];
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const x = b.minX + (i / nx) * w;
      const z = b.minZ + (j / nz) * d;
      pos.push(x, WATER_LEVEL, z);
      depth.push(WATER_LEVEL - terrainHeight(x, z));
    }
  }
  const idx = [];
  const row = nx + 1;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * row + i;
      const bb = a + 1;
      const c = a + row;
      const dd = c + 1;
      const any = Math.max(depth[a], depth[bb], depth[c], depth[dd]);
      if (any < -0.2) continue; // todo acima do terreno: não desenha
      idx.push(a, c, bb, bb, c, dd);
    }
  }
  if (!idx.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aDepth', new THREE.Float32BufferAttribute(depth, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

export function buildWater(scene, quality) {
  const group = new THREE.Group();
  group.name = 'water';
  scene.add(group);
  const simple = quality.water === 'simple';
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  Object.assign(uniforms, {
    uNormal: { value: waterNormalTexture(simple ? 128 : 256) },
    uTime: worldUniforms.uTime,
    uWet: worldUniforms.uWet,
    uWaveAmp: { value: simple ? 0 : 0.09 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uSky: { value: new THREE.Color('#3d82df') },
    uHorizon: { value: new THREE.Color('#bcdcf3') },
    uDeep: { value: new THREE.Color('#0f4c6e') },
    uShallow: { value: new THREE.Color('#2fa3a8') },
    uLight: { value: 1 },
  });
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    fog: true,
    defines: simple ? { SIMPLE: '' } : {},
  });
  mat.name = 'water';
  const basins = findBasins(4).filter((b) => b.n >= 3);
  const cell = simple ? 5 : 2.5;
  const meshes = [];
  for (const b of basins) {
    const g = basinGeometry(b, cell);
    if (!g) continue;
    const mesh = new THREE.Mesh(g, mat);
    mesh.renderOrder = 1;
    mesh.name = `water-${meshes.length}`;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    meshes.push(mesh);
  }
  return {
    group,
    meshes,
    // env: cores do céu atuais (vindas de sky.update)
    update(env) {
      uniforms.uSunDir.value.copy(env.lightDir);
      uniforms.uSunColor.value.copy(env.sunColor).multiplyScalar(env.sunSpec);
      uniforms.uSky.value.copy(env.zenith);
      uniforms.uHorizon.value.copy(env.horizon);
      uniforms.uLight.value = env.light;
      uniforms.uWaveAmp.value = simple ? 0 : 0.09 + env.wind * 0.08;
    },
    dispose() {
      scene.remove(group);
      meshes.forEach((m) => m.geometry.dispose());
      mat.dispose();
    },
  };
}
