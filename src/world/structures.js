// Construções procedurais a partir de STRUCTURES (shared/world.js): casas (3 variantes), poço,
// torre, pilares da arena (com braseiros), ruínas e píer. Mesmas w/d/h/rot dos colliders.
// Geometrias são mescladas por material e por área => poucos draw calls.
import * as THREE from 'three';
import { STRUCTURES, terrainHeight, WATER_LEVEL, ARENA } from '../../shared/world.js';
import { mulberry32 } from '../../shared/math.js';
import { GeometryBucket, worldBoxUV, worldUniforms } from './common.js';
import { surfaceTexture, glowTexture } from './textures.js';

function makeMaterials(quality) {
  const ts = Math.min(512, quality.textureSize);
  const Std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });
  const withWeather = (m) => {
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uSnowCover = worldUniforms.uSnowCover;
      shader.uniforms.uWet = worldUniforms.uWet;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vUpW;')
        .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvUpW = normalize(mat3(modelMatrix) * objectNormal).y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uSnowCover; uniform float uWet; varying float vUpW;')
        .replace(
          '#include <map_fragment>',
          '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - uWet * 0.25), vec3(0.93,0.95,0.98), uSnowCover * smoothstep(0.35, 0.8, vUpW) * 0.92);'
        );
    };
    return m;
  };
  const M = {
    plaster: Std({ map: surfaceTexture('plaster', ts), color: 0xfffaf0 }),
    timber: Std({ map: surfaceTexture('wood', ts), color: 0x8a6448 }),
    stone: Std({ map: surfaceTexture('stone', ts), color: 0xf0ebe2 }),
    ruinStone: Std({ map: surfaceTexture('stone', ts), color: 0xb8bea6 }),
    brick: Std({ map: surfaceTexture('brick', ts), color: 0xe8e0d4 }),
    planks: Std({ map: surfaceTexture('planks', ts), color: 0xffffff }),
    darkWood: Std({ map: surfaceTexture('planks', ts), color: 0x8a6a55 }),
    roofRed: Std({ map: surfaceTexture('roof', ts), color: 0xd0583a, roughness: 0.75 }),
    roofBlue: Std({ map: surfaceTexture('roof', ts), color: 0x5872a8, roughness: 0.7 }),
    roofGreen: Std({ map: surfaceTexture('roof', ts), color: 0x4f8f5c, roughness: 0.75 }),
    roofTower: Std({ map: surfaceTexture('roof', ts), color: 0x9c3a4a, roughness: 0.7 }),
    iron: Std({ color: 0x3a3a40, roughness: 0.5, metalness: 0.7 }),
    gold: Std({ color: 0xe0b04a, roughness: 0.35, metalness: 0.9 }),
    clothRed: Std({ color: 0xc23a3a, roughness: 0.95, side: THREE.DoubleSide }),
    clothBlue: Std({ color: 0x2f5fb0, roughness: 0.95, side: THREE.DoubleSide }),
    waterDark: Std({ color: 0x173a4a, roughness: 0.15 }),
    glass: new THREE.MeshStandardMaterial({ color: 0x2b3a4a, emissive: 0xffa448, emissiveIntensity: 0.05, roughness: 0.2, metalness: 0.1 }),
    shutterA: Std({ map: surfaceTexture('planks', ts), color: 0x5f9fd0 }),
    shutterB: Std({ map: surfaceTexture('planks', ts), color: 0x6ab06a }),
    shutterC: Std({ map: surfaceTexture('planks', ts), color: 0xd06a5a }),
  };
  for (const [k, m] of Object.entries(M)) {
    m.name = k;
    if (k !== 'glass' && k !== 'iron' && k !== 'gold') withWeather(m);
  }
  M.glass.userData.noShadow = true;
  return M;
}

// ---- helpers de geometria (local) ----
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);
function mat(x, y, z, rx = 0, ry = 0, rz = 0) {
  _e.set(rx, ry, rz);
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

class Builder {
  constructor(bucket) {
    this.bucket = bucket;
    this.parent = new THREE.Matrix4();
  }

  setParent(m) {
    this.parent.copy(m);
  }

  // adiciona geometria já posicionada em coords locais (aplica uv em metros e depois o pai)
  add(material, geo, local, uvScale = 2) {
    if (local) geo.applyMatrix4(local);
    if (uvScale) worldBoxUV(geo, uvScale);
    this.bucket.add(material, geo, this.parent);
  }

  box(material, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0, uvScale = 2) {
    this.add(material, new THREE.BoxGeometry(w, h, d), mat(x, y, z, rx, ry, rz), uvScale);
  }

  cyl(material, rt, rb, h, seg, x, y, z, rx = 0, ry = 0, rz = 0, uvScale = 0) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    if (!uvScale) {
      // uv cilíndrico em metros
      const uv = g.attributes.uv;
      const circ = Math.PI * 2 * Math.max(rt, rb);
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / 2, (uv.getY(i) * h) / 2);
      g.applyMatrix4(mat(x, y, z, rx, ry, rz));
      this.bucket.add(material, g, this.parent);
    } else this.add(material, g, mat(x, y, z, rx, ry, rz), uvScale);
  }
}

function prismGeometry(width, depth, height) {
  // prisma triangular: base em z (depth), altura y, extrudado em x (width), centrado
  const shape = new THREE.Shape();
  shape.moveTo(-depth / 2, 0);
  shape.lineTo(depth / 2, 0);
  shape.lineTo(0, height);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  g.rotateY(Math.PI / 2);
  g.translate(-width / 2, 0, 0);
  g.computeVertexNormals();
  return g;
}

function groundUnder(s, local) {
  // altura máx/mín do terreno sobre a pegada da construção
  const c = Math.cos(s.rot);
  const sn = Math.sin(s.rot);
  let max = -Infinity;
  let min = Infinity;
  for (const [lx, lz] of local) {
    const x = s.x + lx * c + lz * sn;
    const z = s.z - lx * sn + lz * c;
    const h = terrainHeight(x, z);
    max = Math.max(max, h);
    min = Math.min(min, h);
  }
  return { max, min };
}

function footprint(w, d) {
  const pts = [];
  for (const fx of [-0.5, 0, 0.5]) for (const fz of [-0.5, 0, 0.5]) pts.push([fx * w, fz * d]);
  return pts;
}

// ---------------------------------------------------------------- casa
function buildHouse(b, M, s, detail, rand) {
  const { w: W, d: D, h: H } = s;
  const g = groundUnder(s, footprint(W, D));
  const base = g.max + 0.3;
  b.setParent(mat(s.x, base, s.z, 0, s.rot, 0));
  const v = s.variant;
  const wallH = Math.max(2.8, H * 0.52);
  const roofH = Math.max(1.8, H - wallH - 0.3);
  // fundação
  b.box(M.stone, W + 0.35, base - g.min + 0.5, D + 0.35, 0, -(base - g.min + 0.5) / 2 + 0.05, 0, 0, 0, 0, 1.6);
  const wallMat = v === 0 ? M.plaster : v === 1 ? M.plaster : M.planks;
  if (v === 1) {
    // térreo de pedra + andar de reboco
    const sh = wallH * 0.45;
    b.box(M.stone, W + 0.12, sh, D + 0.12, 0, sh / 2, 0, 0, 0, 0, 1.6);
    b.box(M.plaster, W, wallH - sh, D, 0, sh + (wallH - sh) / 2, 0);
    b.box(M.timber, W + 0.22, 0.22, D + 0.22, 0, sh, 0, 0, 0, 0, 1.5);
  } else {
    b.box(wallMat, W, wallH, D, 0, wallH / 2, 0, 0, 0, 0, v === 2 ? 1.6 : 2);
  }
  // empena (prisma)
  b.add(v === 2 ? M.planks : M.plaster, prismGeometry(W, D, roofH), mat(0, wallH, 0), v === 2 ? 1.6 : 2);
  // enxaimel
  if (v === 0 && detail >= 1) {
    const bt = 0.16;
    for (const sz of [-1, 1]) {
      const z = sz * (D / 2 + 0.03);
      const n = Math.max(2, Math.round(W / 1.7));
      for (let i = 0; i <= n; i++) b.box(M.timber, bt, wallH, bt * 0.6, -W / 2 + (i / n) * W, wallH / 2, z, 0, 0, 0, 1.5);
      b.box(M.timber, W + 0.1, bt, bt * 0.6, 0, wallH * 0.5, z, 0, 0, 0, 1.5);
      b.box(M.timber, W + 0.1, bt, bt * 0.6, 0, wallH - 0.05, z, 0, 0, 0, 1.5);
      // diagonais
      const cw = W / n;
      const ang = Math.atan2(wallH * 0.5, cw);
      const len = Math.hypot(cw, wallH * 0.5);
      for (let i = 0; i < n; i++) {
        if (i % 2 === 1) continue;
        b.box(M.timber, len, bt * 0.8, bt * 0.5, -W / 2 + (i + 0.5) * cw, wallH * 0.75, z, 0, 0, i % 4 === 0 ? ang : -ang, 1.5);
      }
    }
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 + 0.03);
      const n = Math.max(2, Math.round(D / 1.7));
      for (let i = 0; i <= n; i++) b.box(M.timber, bt * 0.6, wallH, bt, x, wallH / 2, -D / 2 + (i / n) * D, 0, 0, 0, 1.5);
      b.box(M.timber, bt * 0.6, bt, D + 0.1, x, wallH * 0.5, 0, 0, 0, 0, 1.5);
      b.box(M.timber, bt * 0.6, bt, D + 0.1, x, wallH - 0.05, 0, 0, 0, 0, 1.5);
    }
  } else {
    // cantoneiras
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(v === 2 ? M.darkWood : M.timber, 0.3, wallH + 0.05, 0.3, sx * W / 2, wallH / 2, sz * D / 2, 0, 0, 0, 1);
  }
  // telhado: duas águas ao longo de X
  const over = 0.55;
  const run = D / 2 + over;
  const ang = Math.atan2(roofH, D / 2);
  const len = run / Math.cos(ang);
  const roofMat = v === 0 ? M.roofRed : v === 1 ? M.roofBlue : M.roofGreen;
  const thick = 0.18;
  for (const sz of [-1, 1]) {
    const cz = sz * (run / 2 - over * 0.0) - sz * 0.0;
    const zc = sz * (D / 2 - (run * 0.5 - over));
    void cz;
    const yc = wallH + roofH - Math.tan(ang) * Math.abs(zc) + thick * 0.5;
    b.box(roofMat, W + over * 2, thick, len, 0, yc, zc, sz * ang, 0, 0, 1.4);
  }
  b.box(M.timber, W + over * 2 + 0.1, 0.22, 0.26, 0, wallH + roofH + 0.12, 0, Math.PI / 4, 0, 0, 1.5); // cumeeira
  // chaminé
  if (detail >= 1 || v !== 2) {
    const cx = W * 0.28 * (v === 1 ? -1 : 1);
    const cz = D * 0.18;
    const top = wallH + roofH + 0.9;
    b.box(M.brick, 0.8, top - wallH + 0.2, 0.8, cx, wallH + (top - wallH) / 2, cz, 0, 0, 0, 1);
    b.box(M.stone, 1.0, 0.2, 1.0, cx, top + 0.1, cz, 0, 0, 0, 1);
  }
  // porta na face -Z (voltada para a praça)
  const doorW = 1.2;
  const doorH = 2.1;
  b.box(M.darkWood, doorW, doorH, 0.12, 0, doorH / 2, -D / 2 - 0.04, 0, 0, 0, 1.2);
  b.box(M.timber, doorW + 0.3, 0.2, 0.2, 0, doorH + 0.08, -D / 2 - 0.08, 0, 0, 0, 1);
  b.box(M.timber, 0.16, doorH, 0.2, -doorW / 2 - 0.08, doorH / 2, -D / 2 - 0.08, 0, 0, 0, 1);
  b.box(M.timber, 0.16, doorH, 0.2, doorW / 2 + 0.08, doorH / 2, -D / 2 - 0.08, 0, 0, 0, 1);
  b.box(M.stone, doorW + 0.8, 0.25, 0.7, 0, -0.1, -D / 2 - 0.45, 0, 0, 0, 1);
  if (detail >= 1) b.box(M.gold, 0.08, 0.08, 0.08, doorW * 0.3, doorH * 0.5, -D / 2 - 0.13, 0, 0, 0, 0);
  // janelas
  const shutter = [M.shutterA, M.shutterB, M.shutterC][Math.floor(rand() * 3)];
  const winY = v === 1 ? wallH * 0.7 : wallH * 0.55;
  const win = (x, z, ry) => {
    const ww = 0.9;
    const wh = 1.0;
    const P = mat(x, winY, z, 0, ry, 0);
    const add = (m, gw, gh, gd, lx, ly, lz) => {
      const geo = new THREE.BoxGeometry(gw, gh, gd);
      geo.applyMatrix4(mat(lx, ly, lz));
      geo.applyMatrix4(P);
      worldBoxUV(geo, 1);
      b.bucket.add(m, geo, b.parent);
    };
    add(M.glass, ww, wh, 0.06, 0, 0, 0.0);
    add(M.timber, ww + 0.22, 0.14, 0.18, 0, wh / 2 + 0.05, 0.03);
    add(M.timber, ww + 0.3, 0.12, 0.3, 0, -wh / 2 - 0.05, 0.08);
    if (detail >= 1) {
      add(M.timber, 0.07, wh, 0.1, 0, 0, 0.04);
      add(M.timber, ww, 0.07, 0.1, 0, 0, 0.04);
      add(shutter, ww * 0.5, wh + 0.05, 0.06, -ww * 0.78, 0, 0.06);
      add(shutter, ww * 0.5, wh + 0.05, 0.06, ww * 0.78, 0, 0.06);
    }
  };
  const nW = W > 9 ? 2 : 1;
  for (let i = 0; i < nW; i++) {
    const x = nW === 1 ? W * 0.3 : (i === 0 ? -W * 0.3 : W * 0.3);
    win(x, D / 2 + 0.02, 0);
    if (nW === 2 || i === 0) win(nW === 2 ? x : -W * 0.3, -D / 2 - 0.02, Math.PI);
  }
  win(W / 2 + 0.02, 0, Math.PI / 2);
  win(-W / 2 - 0.02, 0, -Math.PI / 2);
  // janela redonda na empena
  if (detail >= 1) {
    for (const sx of [-1, 1]) {
      const geo = new THREE.CylinderGeometry(0.35, 0.35, 0.1, 12);
      geo.applyMatrix4(mat(sx * (W / 2 + 0.03), wallH + roofH * 0.42, 0, 0, 0, Math.PI / 2));
      b.bucket.add(M.glass, geo, b.parent);
    }
  }
  // detalhes: barris/caixotes ao lado
  if (detail >= 2) {
    const bx = W / 2 + 0.6;
    b.cyl(M.darkWood, 0.35, 0.38, 0.9, 10, bx, 0.45 - 0.3, D * 0.25);
    b.box(M.planks, 0.7, 0.7, 0.7, bx + 0.1, 0.35 - 0.3, D * 0.25 + 0.9, 0, 0.3, 0, 0.7);
  }
}

// ---------------------------------------------------------------- poço
function buildWell(b, M, s, detail) {
  const base = terrainHeight(s.x, s.z);
  b.setParent(mat(s.x, base, s.z, 0, s.rot, 0));
  const prof = [
    new THREE.Vector2(0.95, -0.3),
    new THREE.Vector2(1.3, -0.3),
    new THREE.Vector2(1.3, 0.85),
    new THREE.Vector2(1.38, 0.95),
    new THREE.Vector2(1.38, 1.05),
    new THREE.Vector2(0.9, 1.05),
    new THREE.Vector2(0.95, 0.95),
    new THREE.Vector2(0.95, -0.3),
  ];
  const lathe = new THREE.LatheGeometry(prof, detail >= 1 ? 20 : 12);
  const uv = lathe.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4, uv.getY(i) * 0.9);
  b.bucket.add(M.stone, lathe, b.parent);
  b.cyl(M.waterDark, 0.95, 0.95, 0.05, 16, 0, 0.45, 0);
  for (const sx of [-1, 1]) b.box(M.timber, 0.2, 2.4, 0.2, sx * 1.15, 1.2, 0, 0, 0, 0, 1);
  b.cyl(M.timber, 0.08, 0.08, 2.6, 6, 0, 2.05, 0, 0, 0, Math.PI / 2);
  // telhadinho
  for (const sz of [-1, 1]) b.box(M.roofRed, 2.9, 0.1, 1.15, 0, 2.62, sz * 0.48, sz * 0.62, 0, 0, 1);
  if (detail >= 1) {
    b.cyl(M.darkWood, 0.2, 0.16, 0.32, 8, 0.3, 1.45, 0);
    b.cyl(M.iron, 0.01, 0.01, 0.5, 3, 0.3, 1.83, 0);
  }
}

// ---------------------------------------------------------------- torre
function buildTower(b, M, s, detail) {
  const g = groundUnder(s, footprint(s.w, s.d));
  const base = g.min;
  b.setParent(mat(s.x, base, s.z, 0, s.rot, 0));
  const r = Math.min(s.w, s.d) / 2;
  const H = s.h;
  const seg = 8;
  b.cyl(M.stone, r * 1.0, r * 1.02, 1.2 + (g.max - g.min), seg, 0, (1.2 + (g.max - g.min)) / 2 - 0.4, 0, 0, Math.PI / 8);
  const bodyH = H * 0.72;
  b.cyl(M.stone, r * 0.86, r * 0.95, bodyH, seg, 0, bodyH / 2, 0, 0, Math.PI / 8);
  // faixas
  b.cyl(M.brick, r * 0.97, r * 0.97, 0.35, seg, 0, bodyH * 0.35, 0, 0, Math.PI / 8);
  // balcão superior com mísulas
  const topY = bodyH;
  b.cyl(M.stone, r * 1.08, r * 0.9, 0.6, seg, 0, topY + 0.3, 0, 0, Math.PI / 8);
  const upH = 2.2;
  b.cyl(M.plaster, r * 0.98, r * 0.98, upH, seg, 0, topY + 0.6 + upH / 2, 0, 0, Math.PI / 8);
  if (detail >= 1) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      b.box(M.timber, 0.2, upH, 0.2, Math.cos(a) * r * 0.99, topY + 0.6 + upH / 2, Math.sin(a) * r * 0.99, 0, -a, 0, 1);
    }
  }
  // telhado cônico
  const roofH = H - (topY + 0.6 + upH);
  const cone = new THREE.ConeGeometry(r * 1.25, roofH, seg, 1);
  const uv = cone.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 6, uv.getY(i) * 3);
  cone.applyMatrix4(mat(0, topY + 0.6 + upH + roofH / 2, 0, 0, Math.PI / 8, 0));
  b.bucket.add(M.roofTower, cone, b.parent);
  // janelas em seteira (brilham à noite)
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + 0.3;
    for (const y of [bodyH * 0.3, bodyH * 0.62]) {
      const geo = new THREE.BoxGeometry(0.35, 1.1, 0.2);
      geo.applyMatrix4(mat(Math.cos(a) * r * 0.86, y + k * 0.4, Math.sin(a) * r * 0.86, 0, -a + Math.PI / 2, 0));
      b.bucket.add(M.glass, geo, b.parent);
    }
    const geo = new THREE.BoxGeometry(0.9, 1.0, 0.2);
    geo.applyMatrix4(mat(Math.cos(a + 0.4) * r * 0.99, topY + 1.7, Math.sin(a + 0.4) * r * 0.99, 0, -(a + 0.4) + Math.PI / 2, 0));
    b.bucket.add(M.glass, geo, b.parent);
  }
  // porta
  b.box(M.darkWood, 1.5, 2.6, 0.3, 0, 1.3, -r * 0.9, 0, 0, 0, 1);
  b.box(M.stone, 2.1, 0.4, 0.5, 0, 2.75, -r * 0.92, 0, 0, 0, 1);
  // mastro + bandeira
  b.cyl(M.iron, 0.06, 0.06, 3, 5, 0, H + 1.3, 0);
  b.cyl(M.gold, 0.15, 0.15, 0.3, 8, 0, H + 2.85, 0);
  const flag = new THREE.PlaneGeometry(1.8, 1.0, 4, 1);
  const pos = flag.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin((pos.getX(i) + 0.9) * 2.5) * 0.15);
  flag.computeVertexNormals();
  flag.applyMatrix4(mat(0.95, H + 2.2, 0));
  b.bucket.add(M.clothRed, flag, b.parent);
}

// ---------------------------------------------------------------- pilar da arena
function bannerTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#b8323a';
  ctx.fillRect(0, 0, 64, 128);
  ctx.fillStyle = '#e8b84a';
  ctx.fillRect(0, 0, 64, 8);
  ctx.fillRect(4, 10, 3, 108);
  ctx.fillRect(57, 10, 3, 108);
  ctx.beginPath();
  ctx.moveTo(32, 30);
  ctx.lineTo(46, 56);
  ctx.lineTo(32, 82);
  ctx.lineTo(18, 56);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#7a1e28';
  ctx.beginPath();
  ctx.arc(32, 56, 6, 0, Math.PI * 2);
  ctx.fill();
  // ponta em V
  ctx.globalCompositeOperation = 'destination-out';
  ctx.beginPath();
  ctx.moveTo(0, 128);
  ctx.lineTo(32, 108);
  ctx.lineTo(64, 128);
  ctx.closePath();
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildPillar(b, M, s, detail, extras) {
  const g = groundUnder(s, footprint(s.w, s.d));
  const base = g.max;
  b.setParent(mat(s.x, base, s.z, 0, s.rot, 0));
  const W = s.w;
  const H = s.h;
  const plinthH = 0.9;
  b.box(M.stone, W, plinthH + (g.max - g.min) + 0.5, W, 0, plinthH / 2 - ((g.max - g.min) + 0.5) / 2, 0, 0, 0, 0, 1.2);
  b.box(M.stone, W * 0.85, 0.35, W * 0.85, 0, plinthH + 0.17, 0, 0, 0, 0, 1.2);
  const shaftH = H - plinthH - 0.35 - 1.1;
  // fuste canelado
  const seg = detail >= 1 ? 16 : 10;
  const shaft = new THREE.CylinderGeometry(W * 0.3, W * 0.34, shaftH, seg, 1);
  const pos = shaft.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const a = Math.atan2(z, x);
    const rr = Math.hypot(x, z);
    if (rr < 1e-3) continue;
    const k = 1 - 0.06 * (0.5 + 0.5 * Math.cos(a * seg));
    pos.setX(i, x * k);
    pos.setZ(i, z * k);
  }
  shaft.computeVertexNormals();
  const uv = shaft.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 3, uv.getY(i) * shaftH * 0.5);
  shaft.applyMatrix4(mat(0, plinthH + 0.35 + shaftH / 2, 0));
  b.bucket.add(M.stone, shaft, b.parent);
  b.box(M.stone, W * 0.82, 0.4, W * 0.82, 0, H - 1.1 + 0.2, 0, 0, 0, 0, 1.2);
  b.box(M.stone, W * 0.95, 0.7, W * 0.95, 0, H - 0.35, 0, 0, 0, 0, 1.2);
  b.box(M.gold, W * 0.97, 0.12, W * 0.97, 0, H - 0.72, 0, 0, 0, 0, 0);
  if (s.variant === 1) {
    // braseiro
    const bowl = new THREE.LatheGeometry(
      [new THREE.Vector2(0.15, 0), new THREE.Vector2(0.5, 0.1), new THREE.Vector2(0.95, 0.55), new THREE.Vector2(1.0, 0.7), new THREE.Vector2(0.85, 0.65), new THREE.Vector2(0.15, 0.25)],
      detail >= 1 ? 16 : 10
    );
    bowl.applyMatrix4(mat(0, H, 0));
    b.bucket.add(M.iron, bowl, b.parent);
    extras.torches.push(new THREE.Vector3(0, H + 0.55, 0).applyMatrix4(b.parent));
  } else if (detail >= 1) {
    // estandarte voltado para o centro da arena (face -X local)
    extras.banners.push(new THREE.Matrix4().multiplyMatrices(b.parent, mat(-W * 0.36, H - 3.2, 0, 0, -Math.PI / 2, 0)));
  }
}

// ---------------------------------------------------------------- ruínas
function buildRuin(b, M, s, detail, rand) {
  const g = groundUnder(s, footprint(s.w, s.d));
  b.setParent(mat(s.x, g.min, s.z, 0, s.rot, 0));
  const W = s.w;
  const D = s.d;
  const H = s.h;
  const lift = g.max - g.min;
  if (s.variant === 2) {
    // colunas quebradas
    const n = W > 3 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : (i === 0 ? -W / 2 + 0.7 : W / 2 - 0.7);
      const hh = H * (i === 0 ? 1 : 0.55 + rand() * 0.3);
      b.box(M.ruinStone, 1.3, 0.6 + lift, 1.3, x, (0.6 + lift) / 2 - 0.2, 0, 0, 0, 0, 1);
      b.cyl(M.ruinStone, 0.45, 0.5, hh, detail >= 1 ? 12 : 8, x, hh / 2 + lift, 0, (rand() - 0.5) * 0.06, 0, (rand() - 0.5) * 0.06);
    }
    if (n === 2 && rand() < 0.6) b.box(M.ruinStone, W * 0.9, 0.6, 0.9, 0, H * 0.4 + lift, 0, 0, 0, 0.25, 1);
    b.cyl(M.ruinStone, 0.45, 0.45, 1.4, 10, 0.4, 0.4 + lift, D / 2 + 0.5, 0, 0.6, Math.PI / 2);
    return;
  }
  // muro de blocos com topo serrilhado
  const bh = 0.55;
  const rows = Math.max(1, Math.round((H + lift) / bh));
  let x0 = -W / 2;
  const cols = [];
  while (x0 < W / 2 - 0.1) {
    const bw = Math.min(W / 2 - x0, 0.7 + rand() * 0.7);
    cols.push([x0, bw]);
    x0 += bw;
  }
  cols.forEach(([cx, bw], ci) => {
    const t = (cx + bw / 2) / W + 0.5;
    const prof = 0.35 + 0.65 * Math.pow(Math.sin(Math.min(1, t * 1.1) * Math.PI * 0.95 + 0.15), 0.6);
    const top = Math.max(1, Math.round(rows * prof * (0.75 + rand() * 0.3)));
    for (let r = 0; r < top; r++) {
      const y = r * bh - lift * 0;
      const arch = s.variant === 1 && Math.abs(cx + bw / 2) < W * 0.18 && r >= 1 && r < Math.min(top - 1, 4);
      if (arch) continue;
      const jitter = (rand() - 0.5) * 0.06;
      const shift = r % 2 ? bw * 0.15 : 0;
      if (detail === 0 && r % 2) continue; // menos peças: blocos duplos
      const hh = detail === 0 ? bh * 2 : bh;
      b.box(M.ruinStone, bw - 0.04, hh - 0.04, D * (0.92 + rand() * 0.08), cx + bw / 2 + shift * 0, y + hh / 2, jitter, 0, (rand() - 0.5) * 0.04, 0, 1.2);
      void shift;
    }
    void ci;
  });
  if (s.variant === 1) b.box(M.ruinStone, W * 0.4, 0.35, D + 0.1, 0, 4 * bh + 0.15, 0, 0, 0, 0, 1);
  // blocos caídos
  if (detail >= 1) {
    for (let k = 0; k < 3; k++) {
      const sz = 0.4 + rand() * 0.4;
      b.box(M.ruinStone, sz * 1.4, sz, sz, (rand() - 0.5) * W, sz / 2 + lift * 0.3 - 0.1, (rand() < 0.5 ? -1 : 1) * (D / 2 + 0.6 + rand()), rand() * 0.3, rand() * 3, rand() * 0.3, 1);
    }
  }
}

// ---------------------------------------------------------------- píer
function buildPier(b, M, s, detail) {
  const deckY = WATER_LEVEL + s.h;
  b.setParent(mat(s.x, deckY, s.z, 0, s.rot, 0));
  const W = s.w;
  const D = s.d;
  if (detail >= 1) {
    const pw = 0.42;
    const n = Math.floor(W / pw);
    for (let i = 0; i < n; i++) {
      const x = -W / 2 + (i + 0.5) * pw;
      b.box(i % 7 === 3 ? M.darkWood : M.planks, pw - 0.04, 0.12, D * (0.98 + ((i * 37) % 5) * 0.01), x, -0.06, 0, 0, 0, 0, 1.2);
    }
  } else {
    b.box(M.planks, W, 0.12, D, 0, -0.06, 0, 0, 0, 0, 1.2);
  }
  b.box(M.darkWood, W, 0.2, 0.2, 0, -0.22, -D / 2 + 0.1, 0, 0, 0, 1);
  b.box(M.darkWood, W, 0.2, 0.2, 0, -0.22, D / 2 - 0.1, 0, 0, 0, 1);
  const c = Math.cos(s.rot);
  const sn = Math.sin(s.rot);
  for (let x = -W / 2 + 0.3; x <= W / 2; x += 3) {
    for (const sz of [-1, 1]) {
      const lz = sz * (D / 2 - 0.15);
      const wx = s.x + x * c + lz * sn;
      const wz = s.z - x * sn + lz * c;
      const ground = terrainHeight(wx, wz);
      const len = deckY - ground + 0.6;
      b.cyl(M.darkWood, 0.14, 0.16, len + 0.5, 7, x, -len / 2 + 0.25, lz);
    }
  }
  // poste de amarração + lanterna na ponta
  b.cyl(M.darkWood, 0.12, 0.12, 1.2, 7, W / 2 - 0.3, 0.6, D / 2 - 0.3);
  b.cyl(M.darkWood, 0.12, 0.12, 1.2, 7, W / 2 - 0.3, 0.6, -D / 2 + 0.3);
  if (detail >= 1) {
    b.cyl(M.darkWood, 0.07, 0.07, 1.8, 6, W / 2 - 0.3, 1.2 + 0.3, -D / 2 + 0.3);
    const lamp = new THREE.BoxGeometry(0.25, 0.32, 0.25);
    lamp.applyMatrix4(mat(W / 2 - 0.3, 2.3, -D / 2 + 0.3));
    b.bucket.add(M.glass, lamp, b.parent);
  }
}

// ---------------------------------------------------------------- chamas (braseiros)
const FLAME_VERT = /* glsl */ `
uniform float uTime; attribute float aSeed;
varying float vY; varying float vSeed;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  float t = uTime * 7.0 + aSeed * 10.0;
  float k = clamp(p.y / 1.4, 0.0, 1.0);
  p.x += sin(t + p.y * 4.0) * 0.12 * k;
  p.z += cos(t * 1.3 + p.y * 3.0) * 0.12 * k;
  p.y *= 0.85 + 0.25 * sin(t * 0.7 + aSeed);
  vY = k; vSeed = aSeed;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`;
const FLAME_FRAG = /* glsl */ `
varying float vY; varying float vSeed; uniform float uTime;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec3 core = vec3(1.0, 0.95, 0.6);
  vec3 mid = vec3(1.0, 0.55, 0.12);
  vec3 tip = vec3(0.9, 0.18, 0.05);
  vec3 col = mix(core, mid, smoothstep(0.0, 0.45, vY));
  col = mix(col, tip, smoothstep(0.45, 1.0, vY));
  float a = (1.0 - smoothstep(0.55, 1.0, vY)) * 0.9;
  gl_FragColor = vec4(col * 2.2, a);
  #include <fog_fragment>
}`;

function buildFlames(group, torches, quality) {
  if (!torches.length) return null;
  const parts = [];
  torches.forEach((p, i) => {
    for (let k = 0; k < 3; k++) {
      const r = 0.55 - k * 0.12;
      const g = new THREE.ConeGeometry(r, 1.5 - k * 0.2, 8, 4, true);
      g.translate((k - 1) * 0.15, (1.5 - k * 0.2) / 2, (k % 2) * 0.12);
      g.translate(p.x, p.y, p.z);
      const seed = new Float32Array(g.attributes.position.count).fill(i * 3.1 + k * 1.7);
      g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      g.deleteAttribute('uv');
      g.deleteAttribute('normal');
      parts.push(g);
    }
  });
  const merged = new THREE.BufferGeometry();
  // merge manual simples
  let vCount = 0;
  let iCount = 0;
  for (const g of parts) {
    vCount += g.attributes.position.count;
    iCount += g.index.count;
  }
  const pos = new Float32Array(vCount * 3);
  const seed = new Float32Array(vCount);
  const idx = new Uint32Array(iCount);
  let vo = 0;
  let io = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, vo * 3);
    seed.set(g.attributes.aSeed.array, vo);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += g.attributes.position.count;
    io += g.index.count;
    g.dispose();
  }
  merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  merged.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  merged.setIndex(new THREE.BufferAttribute(idx, 1));
  merged.computeBoundingSphere();
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
  uniforms.uTime = worldUniforms.uTime;
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: FLAME_VERT,
    fragmentShader: FLAME_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: true,
  });
  const mesh = new THREE.Mesh(merged, mat);
  mesh.name = 'torch-flames';
  mesh.renderOrder = 5;
  group.add(mesh);
  // halos
  const sprites = [];
  const smat = new THREE.SpriteMaterial({ map: glowTexture(64), color: 0xff9a40, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.6 });
  for (const p of torches) {
    const sp = new THREE.Sprite(smat);
    sp.position.copy(p).add(new THREE.Vector3(0, 0.6, 0));
    sp.scale.setScalar(4.5);
    group.add(sp);
    sprites.push(sp);
  }
  // luzes pontuais reais só em high/ultra (compartilhadas, sem sombra)
  const lights = [];
  if (quality.tier === 'high' || quality.tier === 'ultra') {
    for (const p of torches) {
      const l = new THREE.PointLight(0xff8a3a, 0, 22, 1.6);
      l.position.copy(p).add(new THREE.Vector3(0, 1, 0));
      group.add(l);
      lights.push(l);
    }
  }
  return {
    update(time, night) {
      for (let i = 0; i < sprites.length; i++) {
        const f = 0.85 + Math.sin(time * 13 + i * 2) * 0.08 + Math.sin(time * 23.7 + i) * 0.06;
        sprites[i].scale.setScalar(4.5 * f * (0.7 + night * 0.6));
        if (lights[i]) lights[i].intensity = (8 + night * 30) * f;
      }
      smat.opacity = 0.35 + night * 0.5;
    },
    dispose() {
      merged.dispose();
      mat.dispose();
      smat.dispose();
    },
  };
}

// ---------------------------------------------------------------- principal
export function buildStructures(scene, quality) {
  const group = new THREE.Group();
  group.name = 'structures';
  scene.add(group);
  const M = makeMaterials(quality);
  const detail = quality.detail;
  const extras = { torches: [], banners: [] };
  const areas = new Map();
  const bucketFor = (area) => {
    if (!areas.has(area)) areas.set(area, new GeometryBucket());
    return areas.get(area);
  };
  const rand = mulberry32(2024);
  for (const s of STRUCTURES) {
    const area = s.type === 'house' || s.type === 'well' || s.type === 'tower' ? (s.type === 'tower' ? 'tower' : 'village') : s.type === 'pillar' ? 'arena' : s.type;
    const b = new Builder(bucketFor(area));
    if (s.type === 'house') buildHouse(b, M, s, detail, rand);
    else if (s.type === 'well') buildWell(b, M, s, detail);
    else if (s.type === 'tower') buildTower(b, M, s, detail);
    else if (s.type === 'pillar') buildPillar(b, M, s, detail, extras);
    else if (s.type === 'ruin') buildRuin(b, M, s, detail, rand);
    else if (s.type === 'pier') buildPier(b, M, s, detail);
  }
  for (const [area, bucket] of areas) bucket.build(group, { castShadow: !!quality.shadows, receiveShadow: true, name: area });

  // estandartes (plano com textura própria, um draw call)
  let bannerMesh = null;
  let bannerTex = null;
  if (extras.banners.length) {
    bannerTex = bannerTexture();
    const bm = new THREE.MeshStandardMaterial({ map: bannerTex, side: THREE.DoubleSide, roughness: 0.95, alphaTest: 0.5 });
    bannerMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.3, 3.2), bm, extras.banners.length);
    extras.banners.forEach((m, i) => bannerMesh.setMatrixAt(i, m));
    bannerMesh.computeBoundingSphere();
    bannerMesh.castShadow = !!quality.shadows;
    bannerMesh.name = 'arena-banners';
    group.add(bannerMesh);
  }
  const flames = buildFlames(group, extras.torches, quality);

  return {
    group,
    materials: M,
    torches: extras.torches,
    update(dt, time, night) {
      M.glass.emissiveIntensity = 0.04 + night * 1.6;
      flames?.update(time, night);
    },
    setQuality(q) {
      group.traverse((o) => {
        if (o.isMesh && o.material !== M.glass) o.castShadow = !!q.shadows && o.name !== 'torch-flames';
      });
    },
    dispose() {
      scene.remove(group);
      group.traverse((o) => {
        if (o.isMesh && o.geometry) o.geometry.dispose();
      });
      Object.values(M).forEach((m) => m.dispose());
      bannerMesh?.material.dispose();
      bannerTex?.dispose();
      flames?.dispose();
    },
  };
}

void ARENA;
