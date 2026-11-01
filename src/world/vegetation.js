// Vegetação: árvores (pinheiro, carvalho, bétula) instanciadas em chunks de 64 m com 2 LODs,
// pedras instanciadas (icosaedros deformados) e grama/flores posicionadas na GPU ao redor da câmera.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { treePositions, rockPositions, WATER_LEVEL, ARENA, VILLAGE, WORLD_HALF } from '../../shared/world.js';
import { mulberry32 } from '../../shared/math.js';
import { worldUniforms, displace, nextFrame } from './common.js';
import { noiseTexture } from './textures.js';

const CHUNK = 64;

// ---------------------------------------------------------------- geometrias de árvore
function colorize(g, fn) {
  const pos = g.attributes.position;
  if (!g.attributes.normal) g.computeVertexNormals();
  const nor = g.attributes.normal;
  const col = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    fn(c, pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i), i);
    col[i * 3] = c.r;
    col[i * 3 + 1] = c.g;
    col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function clean(g) {
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'color') g.deleteAttribute(k);
  if (!g.index) {
    const idx = [];
    for (let i = 0; i < g.attributes.position.count; i++) idx.push(i);
    g.setIndex(idx);
  }
  return g;
}

function merge(parts) {
  const g = mergeGeometries(parts.map(clean), false);
  parts.forEach((p) => p.dispose());
  g.computeBoundingSphere();
  g.computeBoundingBox();
  return g;
}

function trunk(r0, r1, h, seg, color, darkBase = 0.55, hseg = 1) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, hseg, true);
  g.translate(0, h / 2, 0);
  const base = new THREE.Color(color);
  return colorize(g, (c, x, y) => c.copy(base).multiplyScalar(darkBase + (1 - darkBase) * Math.min(1, y / (h * 0.6))));
}

// Camada de pinheiro: cone com borda estrelada e caída (silhueta "serrilhada").
function pineTier(r, h, seg, y, rand, colTop, colBot) {
  const verts = [0, h, 0];
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2 + rand() * 0.15;
    const rr = r * (i % 2 === 0 ? 1 : 0.72) * (0.9 + rand() * 0.2);
    verts.push(Math.cos(a) * rr, (i % 2 === 0 ? -0.18 : 0.05) * h * (0.8 + rand() * 0.4), Math.sin(a) * rr);
  }
  verts.push(0, h * 0.18, 0);
  const idx = [];
  const center = seg + 1;
  for (let i = 0; i < seg; i++) {
    const a = 1 + i;
    const b = 1 + ((i + 1) % seg);
    idx.push(0, b, a);
    idx.push(center, a, b);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.translate(0, y, 0);
  const top = new THREE.Color(colTop);
  const bot = new THREE.Color(colBot);
  return colorize(g, (c, px, py, pz, nx, ny, nz, i) => {
    if (i === 0) c.copy(top).multiplyScalar(1.12);
    else if (i === center) c.copy(bot).multiplyScalar(0.45);
    else c.copy(bot).lerp(top, 0.25 + rand() * 0.2);
  });
}

function blob(r, detail, seed, cx, cy, cz, sy, colA, colB, yMin, yMax, displaceAmt = 0.22) {
  let g = new THREE.IcosahedronGeometry(r, detail);
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = displace(g, r * displaceAmt, 1.6 / r, seed);
  g.scale(1, sy, 1);
  g.translate(cx, cy, cz);
  g.computeVertexNormals();
  const a = new THREE.Color(colA);
  const b = new THREE.Color(colB);
  return colorize(g, (c, x, y, z, nx, ny) => {
    const t = Math.min(1, Math.max(0, (y - yMin) / (yMax - yMin)));
    c.copy(b).lerp(a, t * 0.8 + Math.max(0, ny) * 0.25);
    c.multiplyScalar(0.62 + 0.38 * t + Math.max(0, ny) * 0.12);
  });
}

function buildTreeGeometries(detail) {
  const rand = mulberry32(77);
  const near = {};
  const far = {};
  // pinheiro (~9 m)
  {
    const parts = [trunk(0.3, 0.14, 3.2, detail >= 2 ? 7 : 5, '#6b4a33')];
    const tiers = detail >= 1 ? 4 : 3;
    for (let t = 0; t < tiers; t++) {
      const k = t / (tiers - 1);
      parts.push(pineTier(2.5 - k * 1.55, 3.0 - k * 0.7, detail >= 2 ? 14 : 10, 1.6 + t * (6 / tiers), rand, '#4f9a55', '#1f5537'));
    }
    near.pine = merge(parts);
    far.pine = merge([trunk(0.3, 0.16, 2.4, 4, '#6b4a33'), pineTier(2.4, 4.2, 6, 1.6, rand, '#3f8a4b', '#1f5537'), pineTier(1.6, 3.6, 6, 4.4, rand, '#4f9a55', '#22603c')]);
  }
  // carvalho (~7.5 m), copa arredondada com vários volumes
  {
    const parts = [trunk(0.42, 0.26, 3.6, detail >= 2 ? 8 : 6, '#6e4c32', 0.5)];
    const br1 = trunk(0.17, 0.08, 2.0, 5, '#6e4c32', 0.9);
    br1.rotateZ(0.9);
    br1.translate(0.2, 2.6, 0);
    const br2 = trunk(0.15, 0.07, 1.8, 5, '#6e4c32', 0.9);
    br2.rotateX(-0.85);
    br2.translate(0, 2.8, 0.2);
    parts.push(br1, br2);
    const d = detail >= 2 ? 2 : 1;
    const crown = [
      [1.9, 0, 5.2, 0],
      [1.5, 1.4, 4.6, 0.4],
      [1.45, -1.2, 4.8, 0.6],
      [1.4, 0.2, 4.7, -1.3],
      [1.3, -0.4, 6.3, -0.3],
      [1.2, 0.6, 6.1, 0.8],
    ];
    crown.forEach(([r, x, y, z], i) => parts.push(blob(r, d, 10 + i, x, y, z, 0.85, '#8cc65a', '#2f6a2c', 3.4, 7.4)));
    near.oak = merge(parts);
    far.oak = merge([trunk(0.42, 0.26, 3.6, 5, '#6e4c32', 0.5), blob(2.4, 0, 3, 0, 5.2, 0, 0.8, '#7cb850', '#2f6a2c', 3.4, 7.4, 0.12), blob(1.4, 0, 4, 0.5, 6.4, 0.2, 0.8, '#8cc65a', '#356f30', 3.4, 7.4, 0.12)]);
  }
  // bétula (~8 m), tronco branco com marcas escuras, copa amarelo-esverdeada
  {
    const hs = 8;
    const t = new THREE.CylinderGeometry(0.12, 0.2, 6.5, detail >= 2 ? 7 : 5, hs, true);
    t.translate(0, 3.25, 0);
    const marks = [];
    for (let i = 0; i <= hs; i++) marks.push(rand());
    colorize(t, (c, x, y, z) => {
      const ring = Math.round((y / 6.5) * hs);
      const ang = Math.atan2(z, x);
      const dark = marks[ring] > 0.55 && Math.sin(ang * 3 + ring) > 0.2;
      c.set(dark ? '#3a3632' : '#ecebe4');
    });
    const parts = [t];
    const d = detail >= 2 ? 2 : 1;
    const crown = [
      [1.25, 0, 6.6, 0, 1.35],
      [1.0, 0.8, 5.4, 0.3, 1.2],
      [0.95, -0.7, 5.6, -0.4, 1.25],
      [0.8, 0.1, 7.9, 0.2, 1.2],
    ];
    crown.forEach(([r, x, y, z, sy], i) => parts.push(blob(r, d, 30 + i, x, y, z, sy, '#d2dc5c', '#5f8f2c', 4.2, 8.8)));
    near.birch = merge(parts);
    const tf = trunk(0.2, 0.12, 6, 4, '#e6e4dc', 0.85);
    far.birch = merge([tf, blob(1.6, 0, 33, 0, 6.3, 0, 1.4, '#c8d65a', '#5f8f2c', 4.2, 8.8, 0.1)]);
  }
  return { near, far };
}

// ---------------------------------------------------------------- material com vento/neve
export function foliageMaterial(quality, { sway = 1, name = 'foliage' } = {}) {
  const Mat = quality.tier === 'low' ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const mat = new Mat({ vertexColors: true });
  if (mat.isMeshStandardMaterial) {
    mat.roughness = 0.88;
    mat.metalness = 0;
  }
  mat.name = name;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = worldUniforms.uTime;
    shader.uniforms.uWind = worldUniforms.uWind;
    shader.uniforms.uSnowCover = worldUniforms.uSnowCover;
    shader.uniforms.uWet = worldUniforms.uWet;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uWind; varying float vUpN;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vUpN = objectNormal.y;
#ifdef USE_INSTANCING
  float ph = instanceMatrix[3].x * 0.11 + instanceMatrix[3].z * 0.07;
#else
  float ph = 0.0;
#endif
  float hy = max(transformed.y - 1.0, 0.0);
  float bend = hy * hy * 0.0035 * ${sway.toFixed(3)} * uWind;
  float gust = 0.6 + 0.4 * sin(uTime * 0.37 + ph * 0.5);
  transformed.x += sin(uTime * 1.25 + ph) * bend * gust;
  transformed.z += cos(uTime * 0.93 + ph * 1.3) * bend * 0.6 * gust;
  transformed.y += sin(uTime * 4.0 + ph + position.x * 2.0) * 0.015 * hy * uWind * 0.3;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSnowCover; uniform float uWet; varying float vUpN;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - uWet * 0.15), vec3(0.93, 0.95, 0.98), uSnowCover * smoothstep(0.25, 0.75, vUpN) * 0.9);`
      );
  };
  return mat;
}

function rockMaterial(quality) {
  return foliageMaterial(quality, { sway: 0, name: 'rocks' });
}

// ---------------------------------------------------------------- árvores em chunks
export async function buildTrees(scene, quality, onStep) {
  const group = new THREE.Group();
  group.name = 'trees';
  scene.add(group);
  const geos = buildTreeGeometries(quality.detail);
  const mat = foliageMaterial(quality);
  const trees = treePositions(quality.treeDensity);
  const chunks = new Map();
  for (const t of trees) {
    const cx = Math.floor(t.x / CHUNK);
    const cz = Math.floor(t.z / CHUNK);
    const key = `${cx},${cz}`;
    let ch = chunks.get(key);
    if (!ch) {
      ch = { cx, cz, list: { pine: [], oak: [], birch: [] } };
      chunks.set(key, ch);
    }
    ch.list[t.kind].push(t);
  }
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const out = [];
  let i = 0;
  for (const ch of chunks.values()) {
    const chunk = {
      group: new THREE.Group(),
      near: [],
      far: [],
      min: new THREE.Vector3(Infinity, Infinity, Infinity),
      max: new THREE.Vector3(-Infinity, -Infinity, -Infinity),
      lod: -1,
    };
    chunk.group.name = `trees-chunk-${ch.cx},${ch.cz}`;
    for (const kind of ['pine', 'oak', 'birch']) {
      const list = ch.list[kind];
      if (!list.length) continue;
      const near = new THREE.InstancedMesh(geos.near[kind], mat, list.length);
      const far = new THREE.InstancedMesh(geos.far[kind], mat, list.length);
      const rand = mulberry32(ch.cx * 9973 + ch.cz * 131 + kind.length);
      list.forEach((t, k) => {
        e.set((rand() - 0.5) * 0.06, t.rot, (rand() - 0.5) * 0.06);
        q.setFromEuler(e);
        const sy = t.scale * (0.9 + rand() * 0.25);
        s.set(t.scale, sy, t.scale);
        p.set(t.x, t.y - 0.15, t.z);
        m.compose(p, q, s);
        near.setMatrixAt(k, m);
        const hueJ = (rand() - 0.5) * 0.06;
        const l = 0.88 + rand() * 0.24;
        col.setRGB(l, l, l).offsetHSL(hueJ, 0, 0);
        col.r = l * (1 + hueJ * 2);
        col.b = l * (1 - hueJ * 2);
        near.setColorAt(k, col);
        chunk.min.min(p);
        chunk.max.max(p);
        chunk.max.y = Math.max(chunk.max.y, p.y + 10 * sy);
      });
      far.instanceMatrix = near.instanceMatrix;
      far.instanceColor = near.instanceColor;
      near.computeBoundingSphere();
      far.computeBoundingSphere();
      near.castShadow = !!quality.shadows;
      near.receiveShadow = quality.tier !== 'low';
      far.castShadow = false;
      far.receiveShadow = false;
      near.name = `${kind}-near`;
      far.name = `${kind}-far`;
      chunk.near.push(near);
      chunk.far.push(far);
      chunk.group.add(near, far);
    }
    chunk.min.x -= 4;
    chunk.min.z -= 4;
    chunk.max.x += 4;
    chunk.max.z += 4;
    group.add(chunk.group);
    out.push(chunk);
    if (++i % 12 === 0) {
      onStep?.(i / chunks.size);
      await nextFrame();
    }
  }

  const lodDist = { low: 55, mid: 75, high: 105, ultra: 140 };
  let lodNear = lodDist[quality.tier] || 80;
  let drawDistance = quality.drawDistance;
  const box = new THREE.Box3();
  function update(camera) {
    for (const ch of out) {
      box.min.copy(ch.min);
      box.max.copy(ch.max);
      const d = box.distanceToPoint(camera.position);
      const visible = d < drawDistance;
      ch.group.visible = visible;
      if (!visible) continue;
      const lod = d < lodNear ? 0 : 1;
      if (lod !== ch.lod) {
        ch.lod = lod;
        for (const n of ch.near) n.visible = lod === 0;
        for (const f of ch.far) f.visible = lod === 1;
      }
    }
  }
  return {
    group,
    chunks: out,
    count: trees.length,
    update,
    setQuality(qq) {
      drawDistance = qq.drawDistance;
      lodNear = lodDist[qq.tier] || 80;
      for (const ch of out) for (const n of ch.near) n.castShadow = !!qq.shadows;
    },
    dispose() {
      scene.remove(group);
      Object.values(geos.near).forEach((g) => g.dispose());
      Object.values(geos.far).forEach((g) => g.dispose());
      mat.dispose();
      for (const ch of out) for (const n of ch.near) n.dispose();
    },
  };
}

// ---------------------------------------------------------------- pedras
export function buildRocks(scene, quality) {
  const group = new THREE.Group();
  group.name = 'rocks';
  scene.add(group);
  const VARIANTS = 4;
  const detail = 1;
  const geos = [];
  for (let v = 0; v < VARIANTS; v++) {
    let g = new THREE.IcosahedronGeometry(1, detail);
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    g = displace(g, 0.32, 1.1 + v * 0.25, 100 + v);
    g.scale(1 + v * 0.12, 0.62 + (v % 2) * 0.15, 0.85);
    // facetas planas aqui e ali (corte) para parecer rocha
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) > 0.45) pos.setY(i, 0.45 + (pos.getY(i) - 0.45) * 0.35);
    }
    g.computeVertexNormals();
    const rand = mulberry32(55 + v);
    colorize(g, (c, x, y, z, nx, ny) => {
      const n = 0.82 + rand() * 0.18;
      c.set('#8c877f').multiplyScalar(n * (0.7 + 0.3 * (y + 0.6)));
      if (ny > 0.55) c.lerp(new THREE.Color('#5d8a3a'), Math.min(1, (ny - 0.55) * 2.2) * 0.75);
    });
    clean(g);
    geos.push(g);
  }
  const mat = rockMaterial(quality);
  const rocks = rockPositions(quality.tier === 'low' ? 0.5 : quality.tier === 'mid' ? 0.75 : 1).filter((r) => Math.hypot(r.x - VILLAGE.x, r.z - VILLAGE.z) > 20);
  const buckets = Array.from({ length: VARIANTS }, () => []);
  rocks.forEach((r) => buckets[r.seed % VARIANTS].push(r));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const p = new THREE.Vector3();
  const s = new THREE.Vector3();
  const col = new THREE.Color();
  const meshes = buckets.map((list, v) => {
    const mesh = new THREE.InstancedMesh(geos[v], mat, Math.max(1, list.length));
    const rand = mulberry32(900 + v);
    list.forEach((r, k) => {
      e.set((rand() - 0.5) * 0.4, r.rot, (rand() - 0.5) * 0.4);
      q.setFromEuler(e);
      s.set(r.scale * (0.8 + rand() * 0.5), r.scale * (0.7 + rand() * 0.5), r.scale * (0.8 + rand() * 0.5));
      p.set(r.x, r.y - r.scale * 0.22, r.z);
      m.compose(p, q, s);
      mesh.setMatrixAt(k, m);
      const l = 0.85 + rand() * 0.3;
      const under = r.y < WATER_LEVEL ? 0.75 : 1;
      col.setRGB(l * under, l * under * (0.98 + rand() * 0.04), l * under * (0.95 + rand() * 0.08));
      mesh.setColorAt(k, col);
    });
    mesh.count = list.length;
    mesh.computeBoundingSphere();
    mesh.castShadow = !!quality.shadows;
    mesh.receiveShadow = quality.tier !== 'low';
    mesh.name = `rocks-${v}`;
    group.add(mesh);
    return mesh;
  });
  return {
    group,
    meshes,
    setQuality(qq) {
      meshes.forEach((mm) => (mm.castShadow = !!qq.shadows));
    },
    dispose() {
      scene.remove(group);
      geos.forEach((g) => g.dispose());
      mat.dispose();
      meshes.forEach((mm) => mm.dispose());
    },
  };
}

// ---------------------------------------------------------------- grama e flores (GPU)
function tuftGeometry(blades, rand) {
  const pos = [];
  const tip = []; // 0 base .. 1 ponta
  const idx = [];
  for (let b = 0; b < blades; b++) {
    const a = rand() * Math.PI * 2;
    const r = rand() * 0.12;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    const h = 0.38 + rand() * 0.32;
    const w = 0.05 + rand() * 0.025;
    const lean = 0.12 + rand() * 0.22;
    const la = rand() * Math.PI * 2;
    const lx = Math.cos(la) * lean;
    const lz = Math.sin(la) * lean;
    const fa = la + Math.PI / 2;
    const fx = Math.cos(fa) * w;
    const fz = Math.sin(fa) * w;
    const base = pos.length / 3;
    const pts = [
      [bx - fx, 0, bz - fz, 0],
      [bx + fx, 0, bz + fz, 0],
      [bx - fx * 0.7 + lx * 0.35, h * 0.55, bz - fz * 0.7 + lz * 0.35, 0.55],
      [bx + fx * 0.7 + lx * 0.35, h * 0.55, bz + fz * 0.7 + lz * 0.35, 0.55],
      [bx + lx, h, bz + lz, 1],
    ];
    for (const [x, y, z, t] of pts) {
      pos.push(x, y, z);
      tip.push(t);
    }
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setAttribute('aTip', new THREE.Float32BufferAttribute(tip, 1));
  g.setIndex(idx);
  return g;
}

function flowerGeometry() {
  const parts = [];
  const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.42, 3, 1, true);
  stem.translate(0, 0.21, 0);
  colorize(stem, (c) => c.setRGB(0.25, 0.55, 0.2));
  parts.push(stem);
  // corola: disco de 5 pétalas (estrela suave) + miolo
  const petals = new THREE.CircleGeometry(0.075, 10);
  const pp = petals.attributes.position;
  for (let i = 1; i < pp.count; i++) {
    const a = Math.atan2(pp.getY(i), pp.getX(i));
    const k = 0.55 + 0.45 * Math.abs(Math.cos(a * 2.5));
    pp.setXY(i, pp.getX(i) * k, pp.getY(i) * k);
  }
  petals.rotateX(-Math.PI / 2 + 0.25);
  petals.translate(0, 0.43, 0);
  colorize(petals, (c) => c.setRGB(1, 1, 1)); // tingida no shader
  parts.push(petals);
  const center = new THREE.ConeGeometry(0.025, 0.03, 5);
  center.translate(0, 0.445, 0);
  colorize(center, (c) => c.setRGB(1.0, 0.75, 0.15).multiplyScalar(-1)); // negativo = cor fixa (miolo)
  parts.push(center);
  const merged = mergeGeometries(parts.map(clean));
  parts.forEach((p) => p.dispose());
  const g = new THREE.InstancedBufferGeometry();
  g.index = merged.index;
  g.setAttribute('position', merged.attributes.position);
  g.setAttribute('normal', merged.attributes.normal);
  g.setAttribute('color', merged.attributes.color);
  const pos = merged.attributes.position;
  const tip = new Float32Array(pos.count);
  for (let i = 0; i < pos.count; i++) tip[i] = Math.min(1, pos.getY(i) / 0.44);
  g.setAttribute('aTip', new THREE.BufferAttribute(tip, 1));
  return g;
}

export function buildGrass(scene, quality, heightInfo, pathMask) {
  if (quality.tier === 'low') return null;
  const cfg = {
    mid: { count: 5000, flowers: 500, tile: 48, blades: 4 },
    high: { count: 11000, flowers: 1100, tile: 66, blades: 5 },
    ultra: { count: 20000, flowers: 2000, tile: 86, blades: 5 },
  }[quality.tier] || { count: 8000, flowers: 800, tile: 60, blades: 4 };
  const group = new THREE.Group();
  group.name = 'grass';
  scene.add(group);
  const rand = mulberry32(4321);
  const uniforms = {
    uCenter: { value: new THREE.Vector3() },
    uTile: { value: cfg.tile },
    uHeight: { value: heightInfo.texture },
    uHN: { value: heightInfo.N },
    uHStep: { value: heightInfo.step },
    uHalf: { value: WORLD_HALF },
    uNoise: { value: noiseTexture(Math.min(512, quality.textureSize)) },
    uMask: { value: pathMask.texture },
    uWater: { value: WATER_LEVEL },
    uArena: { value: new THREE.Vector3(ARENA.x, ARENA.z, ARENA.radius + 1.2) },
    uGrassA: { value: new THREE.Color('#5aa23a') },
    uGrassB: { value: new THREE.Color('#a5c552') },
    uGrassDark: { value: new THREE.Color('#2f7034') },
    uTime: worldUniforms.uTime,
    uWind: worldUniforms.uWind,
    uSnowCover: worldUniforms.uSnowCover,
    uFlowerCols: {
      value: [new THREE.Color('#ffd23f'), new THREE.Color('#ffffff'), new THREE.Color('#ff7eb6'), new THREE.Color('#9b7bff'), new THREE.Color('#ff5a4f'), new THREE.Color('#7ec8ff')],
    },
  };

  const commonVert = /* glsl */ `
attribute vec2 aOff; attribute float aTip;
uniform vec3 uCenter; uniform float uTile; uniform sampler2D uHeight; uniform float uHN; uniform float uHStep; uniform float uHalf;
uniform sampler2D uNoise; uniform sampler2D uMask; uniform float uWater; uniform vec3 uArena;
uniform vec3 uGrassA; uniform vec3 uGrassB; uniform vec3 uGrassDark;
uniform float uTime; uniform float uWind; uniform float uSnowCover;
varying vec3 vGCol; varying float vTipV;
float gH(vec2 p) { vec2 uv = ((p + uHalf) / uHStep + 0.5) / uHN; return texture2D(uHeight, uv).r; }
float gHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
`;
  const placeVert = (isFlower) => /* glsl */ `
  vec2 wp = aOff + uTile * floor((uCenter.xz - aOff) / uTile + 0.5);
  float rnd = gHash(wp);
  float h = gH(wp);
  float hx = gH(wp + vec2(1.5, 0.0)) - h; float hz = gH(wp + vec2(0.0, 1.5)) - h;
  float slope = length(vec2(hx, hz)) / 1.5;
  vec4 nB = texture2D(uNoise, wp * 0.0045); vec4 nM = texture2D(uNoise, wp * 0.031);
  vec4 mask = texture2D(uMask, (wp + uHalf) / (2.0 * uHalf));
  float dens = smoothstep(${isFlower ? '0.55, 0.7' : '0.32, 0.5'}, nM.g * 0.6 + nB.r * 0.6 + rnd * 0.15);
  float keep = dens;
  keep *= smoothstep(uWater + 1.3, uWater + 2.3, h) * (1.0 - smoothstep(0.35, 0.55, slope)) * (1.0 - smoothstep(30.0, 38.0, h));
  keep *= 1.0 - smoothstep(0.08, 0.35, max(max(mask.r, mask.g), mask.b * 0.8));
  keep *= step(uArena.z, length(wp - uArena.xy));
  float dist = length(wp - uCenter.xz);
  keep *= 1.0 - smoothstep(uTile * 0.32, uTile * 0.48, dist);
  float sc = keep * (0.55 + rnd * 0.45) * (1.0 - uSnowCover * 0.6);
  float ang = rnd * 6.2831;
  float ca = cos(ang); float sa = sin(ang);
  vec3 p = position * sc;
  p.xz = mat2(ca, -sa, sa, ca) * p.xz;
  float w = aTip * aTip * uWind;
  float ph = wp.x * 0.21 + wp.y * 0.17;
  float gust = 0.55 + 0.45 * sin(uTime * 0.8 + wp.x * 0.05 - wp.y * 0.03);
  p.x += sin(uTime * 2.1 + ph) * 0.11 * w * gust * sc;
  p.z += cos(uTime * 1.7 + ph) * 0.07 * w * gust * sc;
  transformed = p + vec3(wp.x, h - 0.04, wp.y);
  float big = nB.g; float mid = nM.r;
  vec3 g = mix(uGrassDark, uGrassA, smoothstep(0.28, 0.62, big + (mid - 0.5) * 0.3));
  g = mix(g, uGrassB, smoothstep(0.58, 0.78, mid * 0.55 + nB.r * 0.6) * 0.8);
  vGCol = g;
  vTipV = aTip;
`;
  const makeMat = (isFlower) => {
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, vertexColors: isFlower });
    mat.name = isFlower ? 'flowers' : 'grass';
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', `#include <common>\n${commonVert}${isFlower ? 'attribute float aFlower; uniform vec3 uFlowerCols[6]; varying vec3 vFCol;' : ''}`)
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>\n${placeVert(isFlower)}\n${isFlower ? 'int fi = int(mod(floor(rnd * 61.0), 6.0)); vFCol = uFlowerCols[fi];' : ''}`
        )
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);')
        .replace('#include <common>', `#include <common>\nvarying vec3 vGCol; varying float vTipV;${isFlower ? ' varying vec3 vFCol;' : ''}\nuniform float uSnowCover;`)
        .replace(
          '#include <color_fragment>',
          isFlower
            ? `#include <color_fragment>
  vec3 vc = diffuseColor.rgb;
  if (vc.r < 0.0) diffuseColor.rgb = -vc; else if (vc.g > 0.9 && vc.r > 0.9) diffuseColor.rgb = vFCol; else diffuseColor.rgb = vGCol * 0.9;`
            : `#include <color_fragment>
  diffuseColor.rgb = vGCol * mix(0.7, 1.2, vTipV);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.95, 1.0), uSnowCover * vTipV * 0.8);`
        );
    };
    return mat;
  };

  const tuft = tuftGeometry(cfg.blades, rand);
  const off = new Float32Array(cfg.count * 2);
  for (let i = 0; i < cfg.count; i++) {
    off[i * 2] = (rand() - 0.5) * cfg.tile;
    off[i * 2 + 1] = (rand() - 0.5) * cfg.tile;
  }
  tuft.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 2));
  tuft.instanceCount = cfg.count;
  const grassMat = makeMat(false);
  const grass = new THREE.Mesh(tuft, grassMat);
  grass.frustumCulled = false;
  grass.receiveShadow = quality.tier === 'ultra' || quality.tier === 'high';
  grass.name = 'grass';
  group.add(grass);

  const fgeo = flowerGeometry();
  const foff = new Float32Array(cfg.flowers * 2);
  for (let i = 0; i < cfg.flowers; i++) {
    foff[i * 2] = (rand() - 0.5) * cfg.tile;
    foff[i * 2 + 1] = (rand() - 0.5) * cfg.tile;
  }
  fgeo.setAttribute('aOff', new THREE.InstancedBufferAttribute(foff, 2));
  fgeo.instanceCount = cfg.flowers;
  const flowerMat = makeMat(true);
  const flowers = new THREE.Mesh(fgeo, flowerMat);
  flowers.frustumCulled = false;
  flowers.name = 'flowers';
  group.add(flowers);

  return {
    group,
    count: cfg.count,
    update(camera) {
      uniforms.uCenter.value.copy(camera.position);
      // muito alto (voando): grama some
      group.visible = camera.position.y - gHeightApprox(camera.position) < 60;
    },
    dispose() {
      scene.remove(group);
      tuft.dispose();
      fgeo.dispose();
      grassMat.dispose();
      flowerMat.dispose();
    },
  };
}

let _th = null;
function gHeightApprox(p) {
  return _th ? _th(p.x, p.z) : 0;
}
export function setHeightFn(fn) {
  _th = fn;
}

