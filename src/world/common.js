// Utilidades compartilhadas pelo módulo de mundo: uniforms globais (tempo, vento, neve,
// umidade), espera cooperativa entre etapas de construção e helpers de geometria.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Uniforms compartilhados por TODOS os shaders do mundo (mesmo objeto => uma atualização por frame).
export const worldUniforms = {
  uTime: { value: 0 },
  uWind: { value: 1 }, // força do vento (1 = brisa)
  uSnowCover: { value: 0 }, // 0..1 acumulação de neve em superfícies voltadas pra cima
  uWet: { value: 0 }, // 0..1 chão molhado pela chuva
};

export const nextFrame = () =>
  new Promise((resolve) => {
    // setTimeout para não depender de rAF (aba em segundo plano também progride)
    setTimeout(resolve, 0);
  });

export function srgb(hex) {
  return new THREE.Color(hex);
}

// UVs em metros (projeção pela normal dominante) — paredes/telhados repetem a textura sem esticar.
export function worldBoxUV(geometry, scale = 1, offset = new THREE.Vector3()) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + offset.x;
    const y = pos.getY(i) + offset.y;
    const z = pos.getZ(i) + offset.z;
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    let u;
    let v;
    if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else if (nx >= nz) {
      u = z;
      v = y;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

// Normaliza a geometria para poder ser mesclada (indexada, só position/normal/uv[/color]).
export function normalizeGeometry(g, withColor = false) {
  if (!g.index) {
    const idx = new Array(g.attributes.position.count);
    for (let i = 0; i < idx.length; i++) idx[i] = i;
    g.setIndex(idx);
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal' && name !== 'uv' && !(withColor && name === 'color')) g.deleteAttribute(name);
  }
  if (withColor && !g.attributes.color) {
    const c = new Float32Array(g.attributes.position.count * 3).fill(1);
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  }
  g.morphAttributes = {};
  g.clearGroups();
  return g;
}

// Pinta toda a geometria com uma cor (atributo color) — usado para árvores/rochas.
export function paint(g, color, jitter = 0, rand = Math.random) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const j = jitter ? 1 + (rand() - 0.5) * jitter : 1;
    arr[i * 3] = c.r * j;
    arr[i * 3 + 1] = c.g * j;
    arr[i * 3 + 2] = c.b * j;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

// Balde de geometrias por material: no fim vira 1 mesh por material (poucos draw calls).
export class GeometryBucket {
  constructor() {
    this.map = new Map(); // key -> { material, geos: [] }
  }

  add(material, geometry, matrix, withColor = false) {
    let entry = this.map.get(material);
    if (!entry) {
      entry = { material, geos: [], withColor };
      this.map.set(material, entry);
    }
    const g = normalizeGeometry(geometry, entry.withColor);
    if (matrix) g.applyMatrix4(matrix);
    entry.geos.push(g);
  }

  build(group, { castShadow = true, receiveShadow = true, name = 'bucket' } = {}) {
    const meshes = [];
    for (const { material, geos } of this.map.values()) {
      if (!geos.length) continue;
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      if (!merged) continue;
      merged.computeBoundingSphere();
      merged.computeBoundingBox();
      const mesh = new THREE.Mesh(merged, material);
      mesh.name = `${name}:${material.name || 'mat'}`;
      mesh.castShadow = castShadow && !material.userData.noShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.matrixAutoUpdate = false;
      mesh.updateMatrix();
      group.add(mesh);
      meshes.push(mesh);
    }
    this.map.clear();
    return meshes;
  }
}

// Ruído determinístico 3D simples para deformar geometrias (pedras, copas).
export function hash3(x, y, z, seed = 0) {
  let h = Math.imul(Math.floor(x * 73.1) | 0, 374761393) ^ Math.imul(Math.floor(y * 51.7) | 0, 668265263) ^ Math.imul(Math.floor(z * 91.3) | 0, 1442695041) ^ Math.imul(seed, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function smoothNoise3(x, y, z, seed = 0) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fy = y - iy;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const h = (a, b, c) => {
    let v = Math.imul(ix + a, 374761393) + Math.imul(iy + b, 668265263) + Math.imul(iz + c, 1442695041) + Math.imul(seed, 974711);
    v = Math.imul(v ^ (v >>> 13), 1274126177);
    v ^= v >>> 16;
    return (v >>> 0) / 4294967296;
  };
  const l = (a, b, t) => a + (b - a) * t;
  const x00 = l(h(0, 0, 0), h(1, 0, 0), ux);
  const x10 = l(h(0, 1, 0), h(1, 1, 0), ux);
  const x01 = l(h(0, 0, 1), h(1, 0, 1), ux);
  const x11 = l(h(0, 1, 1), h(1, 1, 1), ux);
  return l(l(x00, x10, uy), l(x01, x11, uy), uz) * 2 - 1;
}

// Desloca vértices ao longo da normal com ruído (geometria precisa estar "mesclada" por posição).
export function displace(g, amount, freq, seed = 0) {
  const merged = mergeVerticesSimple(g);
  const pos = merged.attributes.position;
  merged.computeVertexNormals();
  const nor = merged.attributes.normal;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const n = smoothNoise3(x * freq, y * freq, z * freq, seed) + 0.5 * smoothNoise3(x * freq * 2.1, y * freq * 2.1, z * freq * 2.1, seed + 7);
    const d = n * amount;
    pos.setXYZ(i, x + nor.getX(i) * d, y + nor.getY(i) * d, z + nor.getZ(i) * d);
  }
  merged.computeVertexNormals();
  return merged;
}

// Une vértices com mesma posição (para deformar sem rasgar a malha).
export function mergeVerticesSimple(g) {
  const src = g.index ? g.toNonIndexed() : g;
  const pos = src.attributes.position;
  const map = new Map();
  const verts = [];
  const index = [];
  for (let i = 0; i < pos.count; i++) {
    const key = `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
    let id = map.get(key);
    if (id === undefined) {
      id = verts.length / 3;
      map.set(key, id);
      verts.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    }
    index.push(id);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  out.setIndex(index);
  if (src !== g) src.dispose();
  return out;
}

export function disposeObject(root) {
  const mats = new Set();
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => mats.add(m));
  });
  for (const m of mats) {
    for (const k of Object.keys(m)) {
      const v = m[k];
      if (v && v.isTexture && !v.userData.shared) v.dispose();
    }
    m.dispose();
  }
}
