// Personagem humanoide estilizado (~1.8 m) totalmente procedural, com esqueleto hierárquico
// e animações procedurais (idle, walk, run, jump, fall, fly, attack*, cast, block, dodge, hit, ko).
// Contrato: docs/CONTRACTS.md — createCharacterModel(appearance, quality).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const DEFAULT_APPEARANCE = { skin: '#f1c7a5', shirt: '#d94a4a', pants: '#2f3e66', hair: '#3b2416', hairStyle: 'short', accessory: 'none' };
const TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const lerp = (a, b, t) => a + (b - a) * t;

// -------------------------------------------------------------- geometria com cor por vértice
class PartList {
  constructor() {
    this.parts = [];
  }

  add(geo, color, matrix) {
    if (matrix) geo.applyMatrix4(matrix);
    for (const k of Object.keys(geo.attributes)) if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k);
    if (!geo.index) {
      const idx = [];
      for (let i = 0; i < geo.attributes.position.count; i++) idx.push(i);
      geo.setIndex(idx);
    }
    const c = new THREE.Color(color);
    const n = geo.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = c.r;
      arr[i * 3 + 1] = c.g;
      arr[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    this.parts.push(geo);
    return geo;
  }

  build() {
    if (!this.parts.length) return null;
    const g = mergeGeometries(this.parts, false);
    this.parts.forEach((p) => p.dispose());
    this.parts = [];
    g.computeBoundingSphere();
    return g;
  }
}

const M4 = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
  new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));

// Membro torneado (lathe) de y=0 até y=-len, com perfil de raios [t, r].
function limb(profile, len, seg, zScale = 1) {
  const pts = profile.map(([t, r]) => new THREE.Vector2(Math.max(r, 0.0001), -t * len));
  // tampas arredondadas
  pts.unshift(new THREE.Vector2(0.0001, profile[0][1] * 0.6));
  pts.push(new THREE.Vector2(0.0001, -len - profile[profile.length - 1][1] * 0.6));
  pts.reverse();
  const g = new THREE.LatheGeometry(pts, seg);
  if (zScale !== 1) g.scale(1, 1, zScale);
  g.computeVertexNormals();
  return g;
}

function ellipsoid(rx, ry, rz, ws, hs) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}

function darker(hex, k) {
  return new THREE.Color(hex).multiplyScalar(k);
}

// -------------------------------------------------------------- construção do modelo
export function createCharacterModel(appearance = {}, quality = {}) {
  const ap = { ...DEFAULT_APPEARANCE, ...appearance };
  const detail = quality.detail ?? 2;
  const seg = detail >= 2 ? 14 : detail === 1 ? 10 : 7; // segmentos radiais
  const sph = detail >= 2 ? [20, 14] : detail === 1 ? [14, 10] : [10, 7];

  const skin = new THREE.Color(ap.skin);
  const shirt = new THREE.Color(ap.shirt);
  const pants = new THREE.Color(ap.pants);
  const hair = new THREE.Color(ap.hair);
  const boots = new THREE.Color('#4a3020');
  const leather = new THREE.Color('#5a3a22');
  const gold = new THREE.Color('#f2c14e');

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.0 });
  material.name = 'character';
  const rimU = { value: 0.22 };
  const rimCol = { value: new THREE.Color(0.75, 0.85, 1.0) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = rimU;
    shader.uniforms.uRimCol = rimCol;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim; uniform vec3 uRimCol;')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
  { float rim = 1.0 - max(dot(normal, normalize(vViewPosition)), 0.0);
    totalEmissiveRadiance += uRimCol * pow(rim, 3.0) * uRim * diffuseColor.rgb; }`
      );
  };
  // olhos: material próprio (brilho e piscar)
  const eyeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0 });
  eyeMat.name = 'character-eyes';

  const root = new THREE.Group();
  root.name = 'character';
  const body = new THREE.Group(); // pivô no quadril (para rolar/voar/cair)
  body.name = 'body';
  const HIP_Y = 0.95;
  body.position.y = HIP_Y;
  root.add(body);

  const J = {};
  const joint = (name, parent, x, y, z) => {
    const o = new THREE.Group();
    o.name = name;
    o.position.set(x, y, z);
    parent.add(o);
    J[name] = o;
    return o;
  };
  joint('hips', body, 0, 0, 0);
  joint('spine', J.hips, 0, 0.1, 0);
  joint('chest', J.spine, 0, 0.16, 0);
  joint('neck', J.chest, 0, 0.27, -0.01);
  joint('head', J.neck, 0, 0.08, 0.01);
  joint('uArmL', J.chest, 0.205, 0.215, -0.01);
  joint('lArmL', J.uArmL, 0, -0.29, 0);
  joint('handL', J.lArmL, 0, -0.255, 0);
  joint('uArmR', J.chest, -0.205, 0.215, -0.01);
  joint('lArmR', J.uArmR, 0, -0.29, 0);
  joint('handR', J.lArmR, 0, -0.255, 0);
  joint('uLegL', J.hips, 0.098, -0.04, 0);
  joint('lLegL', J.uLegL, 0, -0.43, 0);
  joint('footL', J.lLegL, 0, -0.43, 0);
  joint('uLegR', J.hips, -0.098, -0.04, 0);
  joint('lLegR', J.uLegR, 0, -0.43, 0);
  joint('footR', J.lLegR, 0, -0.43, 0);

  const meshes = [];
  const smallMeshes = []; // escondidas em detalhe 0
  const attach = (bone, parts, mat = material, small = false) => {
    const g = parts.build();
    if (!g) return null;
    const m = new THREE.Mesh(g, mat);
    m.castShadow = !small;
    m.receiveShadow = false;
    bone.add(m);
    meshes.push(m);
    if (small) smallMeshes.push(m);
    return m;
  };

  // ---- quadril (calça + barra da túnica + cinto)
  {
    const p = new PartList();
    const pelvis = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.0001, -0.13),
        new THREE.Vector2(0.11, -0.12),
        new THREE.Vector2(0.155, -0.06),
        new THREE.Vector2(0.162, 0.02),
        new THREE.Vector2(0.148, 0.12),
        new THREE.Vector2(0.0001, 0.13),
      ],
      seg
    );
    pelvis.scale(1, 1, 0.72);
    p.add(pelvis, pants);
    // túnica (barra que abre um pouco)
    const hem = new THREE.LatheGeometry([new THREE.Vector2(0.172, -0.09), new THREE.Vector2(0.162, 0.02), new THREE.Vector2(0.15, 0.12)], seg);
    hem.scale(1, 1, 0.76);
    p.add(hem, shirt.clone().multiplyScalar(0.92));
    const belt = new THREE.TorusGeometry(0.152, 0.022, 6, seg * 2);
    belt.rotateX(Math.PI / 2);
    belt.scale(1, 1, 0.76);
    p.add(belt, leather, M4(0, 0.08, 0));
    p.add(new THREE.BoxGeometry(0.06, 0.05, 0.02), gold, M4(0, 0.08, 0.122));
    if (detail >= 1) p.add(new THREE.BoxGeometry(0.07, 0.08, 0.05), leather, M4(0.13, 0.03, 0.04, 0, 0.6, 0)); // bolsinha
    attach(J.hips, p);
  }
  // ---- tronco (camisa), pescoço
  {
    const p = new PartList();
    const torso = new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.0001, -0.06),
        new THREE.Vector2(0.14, -0.05),
        new THREE.Vector2(0.148, 0.05),
        new THREE.Vector2(0.172, 0.17),
        new THREE.Vector2(0.18, 0.24),
        new THREE.Vector2(0.165, 0.3),
        new THREE.Vector2(0.11, 0.34),
        new THREE.Vector2(0.0001, 0.355),
      ].map((v) => new THREE.Vector2(v.x, v.y)),
      seg
    );
    torso.scale(1, 1, 0.7);
    p.add(torso, shirt, M4(0, -0.16 + 0.16, 0));
    // ombros arredondados
    for (const sx of [-1, 1]) p.add(ellipsoid(0.072, 0.07, 0.07, sph[0] - 4, sph[1] - 4), shirt, M4(sx * 0.19, 0.215, -0.01));
    // gola
    const collar = new THREE.TorusGeometry(0.068, 0.018, 6, seg);
    collar.rotateX(Math.PI / 2);
    p.add(collar, shirt.clone().multiplyScalar(0.75), M4(0, 0.345, -0.005));
    if (detail >= 1) {
      // detalhes da túnica: faixa central e cordão
      p.add(new THREE.BoxGeometry(0.03, 0.26, 0.012), shirt.clone().multiplyScalar(0.72), M4(0, 0.17, 0.124, -0.08, 0, 0));
      // alça de mochila/bainha cruzando o peito
      const strap = new THREE.BoxGeometry(0.035, 0.46, 0.02);
      p.add(strap, leather, M4(0.0, 0.17, 0.123, 0, 0, 0.62));
      p.add(strap.clone(), leather, M4(0.0, 0.17, -0.118, 0, 0, -0.62));
    }
    attach(J.chest, p);
    const n = new PartList();
    n.add(new THREE.CylinderGeometry(0.048, 0.056, 0.13, seg), skin, M4(0, 0.04, 0));
    attach(J.neck, n);
  }
  // ---- cabeça
  let eyesGroup;
  let faceMesh;
  const headH = 0.135;
  {
    const p = new PartList();
    const hg = new THREE.SphereGeometry(0.122, sph[0] + 4, sph[1] + 2);
    const pos = hg.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      let x = pos.getX(i);
      let y = pos.getY(i);
      let z = pos.getZ(i);
      y *= 1.1;
      if (y < 0) {
        const t = -y / 0.134;
        const k = 1 - 0.32 * t * t;
        x *= k;
        z *= 1 - 0.18 * t * t;
        if (z > 0) z *= 1 + 0.08 * t;
      }
      if (z > 0.02 && y > -0.02 && y < 0.05) z *= 0.97; // leve concavidade dos olhos
      pos.setXYZ(i, x, y, z);
    }
    hg.computeVertexNormals();
    p.add(hg, skin, M4(0, headH - 0.01, 0));
    // nariz, orelhas
    p.add(ellipsoid(0.018, 0.024, 0.02, 8, 6), skin.clone().multiplyScalar(0.96), M4(0, headH - 0.025, 0.118));
    for (const sx of [-1, 1]) p.add(ellipsoid(0.018, 0.032, 0.02, 8, 6), skin.clone().multiplyScalar(0.93), M4(sx * 0.12, headH - 0.012, -0.005, 0, sx * 0.3, 0));
    // cabelo
    const style = ap.hairStyle;
    if (style !== 'bald') {
      const cap = new THREE.SphereGeometry(0.132, sph[0] + 4, sph[1] + 2, 0, TAU, 0, Math.PI * 0.56);
      const cp = cap.attributes.position;
      for (let i = 0; i < cp.count; i++) {
        let y = cp.getY(i) * 1.08;
        const z = cp.getZ(i);
        // franja: na frente sobe a linha do cabelo, atrás desce
        if (z > 0) y = Math.max(y, 0.035 + (z / 0.132) * 0.025);
        cp.setY(i, y);
      }
      cap.computeVertexNormals();
      p.add(cap, hair, M4(0, headH + 0.005, -0.006, -0.12));
      // nuca
      p.add(ellipsoid(0.124, 0.1, 0.1, sph[0], sph[1]), hair, M4(0, headH - 0.015, -0.035));
      if (style === 'short' || style === 'long') {
        // mechas da franja
        for (let k = -2; k <= 2; k++) {
          p.add(ellipsoid(0.04, 0.026, 0.03, 8, 6), hair, M4(k * 0.035, headH + 0.075 - Math.abs(k) * 0.008, 0.1 - Math.abs(k) * 0.012, 0.4, 0, -k * 0.25));
        }
        for (const sx of [-1, 1]) p.add(ellipsoid(0.02, 0.05, 0.03, 8, 6), hair, M4(sx * 0.118, headH + 0.02, 0.035));
      }
      if (style === 'long') {
        const back = ellipsoid(0.13, 0.2, 0.07, sph[0], sph[1]);
        p.add(back, hair, M4(0, headH - 0.13, -0.075, 0.12));
        for (const sx of [-1, 1]) p.add(ellipsoid(0.035, 0.13, 0.045, 10, 8), hair, M4(sx * 0.115, headH - 0.08, 0.02, 0, 0, sx * -0.08));
      }
      if (style === 'spiky') {
        const spikes = detail >= 1 ? 11 : 7;
        for (let k = 0; k < spikes; k++) {
          const a = (k / spikes) * TAU;
          const tilt = 0.6 + (k % 2) * 0.25;
          const cone = new THREE.ConeGeometry(0.045, 0.14 + (k % 3) * 0.03, 6);
          cone.translate(0, 0.07, 0);
          // inclina para fora e para trás
          const m = M4(Math.sin(a) * 0.06, headH + 0.08, Math.cos(a) * 0.06 - 0.02, Math.cos(a) * tilt - 0.35, 0, -Math.sin(a) * tilt);
          p.add(cone, hair, m);
        }
        const top = new THREE.ConeGeometry(0.05, 0.17, 6);
        top.translate(0, 0.085, 0);
        p.add(top, hair, M4(0, headH + 0.1, -0.01, -0.3));
      }
    }
    // acessórios
    const acc = ap.accessory;
    const capTop = headH + (style === 'spiky' ? 0.13 : style === 'bald' ? 0.115 : 0.135);
    if (acc === 'hat') {
      const hatCol = new THREE.Color('#7a5232');
      p.add(new THREE.CylinderGeometry(0.25, 0.26, 0.018, seg * 2), hatCol, M4(0, capTop - 0.035, -0.005, -0.08));
      const crown = new THREE.CylinderGeometry(0.11, 0.142, 0.13, seg * 2);
      p.add(crown, hatCol.clone().multiplyScalar(1.08), M4(0, capTop + 0.03, -0.01, -0.08));
      p.add(new THREE.CylinderGeometry(0.143, 0.146, 0.035, seg * 2), darker(ap.shirt, 0.8), M4(0, capTop - 0.008, -0.009, -0.08));
      if (detail >= 1) p.add(ellipsoid(0.012, 0.07, 0.03, 6, 6), new THREE.Color('#f4e9d0'), M4(0.13, capTop + 0.04, -0.03, 0.2, 0, -0.5)); // pena
    } else if (acc === 'crown') {
      const ring = new THREE.CylinderGeometry(0.118, 0.112, 0.05, seg * 2, 1, true);
      p.add(ring, gold, M4(0, capTop - 0.01, 0, -0.06));
      const n = 7;
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU;
        const cone = new THREE.ConeGeometry(0.022, 0.06, 4);
        p.add(cone, gold, M4(Math.sin(a) * 0.115, capTop + 0.04, Math.cos(a) * 0.115 - 0.003, -0.06));
        if (detail >= 1) p.add(ellipsoid(0.011, 0.011, 0.011, 6, 5), k % 2 ? new THREE.Color('#e0283c') : new THREE.Color('#2a7bff'), M4(Math.sin(a) * 0.121, capTop - 0.01, Math.cos(a) * 0.121));
      }
    } else if (acc === 'headband') {
      const band = new THREE.TorusGeometry(0.127, 0.014, 6, seg * 2);
      band.rotateX(Math.PI / 2);
      const bandCol = new THREE.Color(ap.shirt).getHSL({}).l > 0.5 ? new THREE.Color('#2a2a3a') : new THREE.Color('#e8e4da');
      p.add(band, bandCol, M4(0, headH + 0.045, -0.005, -0.18));
      for (const sx of [-1, 1]) p.add(new THREE.BoxGeometry(0.025, 0.12, 0.006), bandCol, M4(sx * 0.03, headH - 0.0, -0.135, 0.3, 0, sx * 0.35));
    }
    attach(J.head, p);

    // olhos (piscam)
    eyesGroup = new THREE.Group();
    eyesGroup.position.set(0, headH + 0.008, 0);
    J.head.add(eyesGroup);
    const e = new PartList();
    const iris = new THREE.Color('#3b2a1e').lerp(hair, 0.25);
    for (const sx of [-1, 1]) {
      e.add(ellipsoid(0.024, 0.029, 0.014, 12, 8), new THREE.Color('#fbfbf8'), M4(sx * 0.045, 0, 0.103));
      e.add(ellipsoid(0.0155, 0.019, 0.008, 10, 8), iris, M4(sx * 0.044, -0.002, 0.113));
      e.add(ellipsoid(0.009, 0.011, 0.006, 8, 6), new THREE.Color('#0d0b0a'), M4(sx * 0.044, -0.002, 0.118));
      if (detail >= 1) e.add(ellipsoid(0.0045, 0.0045, 0.003, 6, 4), new THREE.Color('#ffffff'), M4(sx * 0.044 + 0.006, 0.006, 0.122));
    }
    const eyes = new THREE.Mesh(e.build(), eyeMat);
    eyesGroup.add(eyes);
    meshes.push(eyes);
    // sobrancelhas + boca
    const f = new PartList();
    for (const sx of [-1, 1]) f.add(new THREE.BoxGeometry(0.046, 0.011, 0.012), hair.clone().multiplyScalar(0.8), M4(sx * 0.046, headH + 0.048, 0.112, -0.1, 0, sx * 0.12));
    const mouth = new THREE.TorusGeometry(0.02, 0.0045, 4, 10, Math.PI);
    f.add(mouth, new THREE.Color('#8a3b32'), M4(0, headH - 0.052, 0.104, 0, 0, Math.PI));
    faceMesh = attach(J.head, f, material, true);
  }
  // ---- braços
  for (const side of ['L', 'R']) {
    const sx = side === 'L' ? 1 : -1;
    const up = new PartList();
    up.add(limb([[0, 0.062], [0.3, 0.058], [0.75, 0.05], [1, 0.046]], 0.29, seg, 0.92), shirt);
    attach(J[`uArm${side}`], up);
    const lo = new PartList();
    lo.add(limb([[0, 0.046], [0.25, 0.047], [1, 0.036]], 0.255, seg, 0.9), skin);
    // manga dobrada / bracelete de couro
    const cuff = new THREE.CylinderGeometry(0.044, 0.048, 0.08, seg);
    lo.add(cuff, leather, M4(0, -0.2, 0));
    attach(J[`lArm${side}`], lo);
    const hd = new PartList();
    hd.add(ellipsoid(0.043, 0.05, 0.038, sph[0] - 4, sph[1] - 2), skin, M4(0, -0.05, 0.004));
    if (detail >= 1) {
      // dedos dobrados (punho) + polegar
      hd.add(ellipsoid(0.04, 0.022, 0.03, 10, 6), skin.clone().multiplyScalar(0.97), M4(0, -0.085, 0.022, 0.5));
      hd.add(ellipsoid(0.014, 0.03, 0.014, 8, 6), skin, M4(-sx * 0.0, -0.05, 0.04, 0.7, 0, sx * 0.3));
    }
    attach(J[`hand${side}`], hd);
  }
  // ---- pernas
  for (const side of ['L', 'R']) {
    const up = new PartList();
    up.add(limb([[0, 0.088], [0.35, 0.084], [1, 0.064]], 0.43, seg, 0.95), pants);
    attach(J[`uLeg${side}`], up);
    const lo = new PartList();
    lo.add(limb([[0, 0.064], [0.3, 0.062], [1, 0.05]], 0.43, seg, 0.95), pants);
    // bota (cano)
    const shaft = new THREE.CylinderGeometry(0.066, 0.06, 0.22, seg);
    lo.add(shaft, boots, M4(0, -0.33, 0));
    if (detail >= 1) {
      const fold = new THREE.TorusGeometry(0.066, 0.014, 5, seg);
      fold.rotateX(Math.PI / 2);
      lo.add(fold, boots.clone().multiplyScalar(1.25), M4(0, -0.22, 0));
    }
    attach(J[`lLeg${side}`], lo);
    const ft = new PartList();
    const foot = new THREE.CapsuleGeometry(0.052, 0.12, 4, seg);
    foot.rotateX(Math.PI / 2);
    foot.scale(1, 0.75, 1);
    ft.add(foot, boots, M4(0, -0.035, 0.05));
    ft.add(new THREE.BoxGeometry(0.1, 0.02, 0.21), boots.clone().multiplyScalar(0.55), M4(0, -0.074, 0.052));
    attach(J[`foot${side}`], ft);
  }

  // pontos de fixação das armas: +Y local aponta para fora do punho (para frente com o braço solto)
  const rightHand = new THREE.Object3D();
  rightHand.name = 'rightHandAttach';
  rightHand.position.set(0, -0.07, 0.025);
  rightHand.rotation.x = Math.PI / 2;
  J.handR.add(rightHand);
  const leftHand = new THREE.Object3D();
  leftHand.name = 'leftHandAttach';
  leftHand.position.set(0, -0.07, 0.025);
  leftHand.rotation.x = Math.PI / 2;
  J.handL.add(leftHand);
  const head = new THREE.Object3D();
  head.name = 'headAttach';
  head.position.set(0, headH + 0.02, 0);
  J.head.add(head);

  // ------------------------------------------------------------ animação
  const JOINTS = ['hips', 'spine', 'chest', 'neck', 'head', 'uArmL', 'lArmL', 'handL', 'uArmR', 'lArmR', 'handR', 'uLegL', 'lLegL', 'footL', 'uLegR', 'lLegR', 'footR'];
  const mkPose = () => {
    const p = { body: { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 } };
    for (const j of JOINTS) p[j] = { x: 0, y: 0, z: 0 };
    return p;
  };
  const target = mkPose();
  const cur = mkPose();
  let lastAnim = '';
  let animTime = 0;
  let phase = 0;
  let blinkT = 2 + Math.random() * 3;
  let blink = 0;
  let flashT = 0;
  const flashColor = new THREE.Color();
  let lookT = 0;
  let lookY = 0;
  let lookX = 0;
  const seed = Math.random() * 100;

  function resetTarget() {
    for (const j of JOINTS) {
      const o = target[j];
      o.x = o.y = o.z = 0;
    }
    const b = target.body;
    b.x = b.y = b.z = b.rx = b.ry = b.rz = 0;
  }

  // braços em repouso: levemente abertos e cotovelo dobrado
  function restArms(t, amp = 1) {
    target.uArmL.z = 0.1 * amp;
    target.uArmR.z = -0.1 * amp;
    target.lArmL.x = -0.18;
    target.lArmR.x = -0.22;
    target.uArmL.x = 0.02 + Math.sin(t * 1.7) * 0.015;
    target.uArmR.x = 0.02 + Math.sin(t * 1.7 + 0.5) * 0.015;
  }

  function legsGait(ph, amp, knee, lift) {
    const s = Math.sin(ph);
    const c = Math.cos(ph);
    target.uLegL.x = -s * amp;
    target.uLegR.x = s * amp;
    target.lLegL.x = 0.08 + knee * Math.pow(Math.max(0, c), 1.4) + lift * Math.max(0, -s) * 0.3;
    target.lLegR.x = 0.08 + knee * Math.pow(Math.max(0, -c), 1.4) + lift * Math.max(0, s) * 0.3;
    target.footL.x = -(target.uLegL.x + target.lLegL.x) * 0.55 + Math.max(0, s) * 0.25;
    target.footR.x = -(target.uLegR.x + target.lLegR.x) * 0.55 + Math.max(0, -s) * 0.25;
  }

  function attackPose(style, t) {
    // fases: preparo 0–0.3, golpe 0.3–0.55, retorno 0.55–1
    const wind = smooth(0, 0.3, t);
    const strike = smooth(0.28, 0.5, t);
    const rec = smooth(0.6, 1, t);
    const k = (a, b, c) => lerp(lerp(a, b, wind), c, strike) * (1 - rec) + a * rec; // a=neutro, b=preparo, c=golpe
    // base de combate: pernas afastadas
    target.uLegL.x = -0.25;
    target.uLegR.x = 0.2;
    target.lLegL.x = 0.3;
    target.lLegR.x = 0.25;
    target.footL.x = -0.05;
    target.footR.x = -0.4;
    target.body.y = -0.04;
    target.uArmL.x = -0.4;
    target.uArmL.z = 0.25;
    target.lArmL.x = -1.0;
    switch (style) {
      case 'heavy':
        target.uArmR.x = k(-0.3, -2.9, -0.7);
        target.uArmL.x = k(-0.3, -2.9, -0.7);
        target.uArmR.z = k(-0.1, 0.25, 0.3);
        target.uArmL.z = k(0.1, -0.25, -0.3);
        target.lArmR.x = k(-0.3, -0.6, -0.2);
        target.lArmL.x = k(-0.3, -0.6, -0.2);
        target.handR.x = k(0, 0.3, -0.4);
        target.chest.x = k(0, -0.25, 0.45);
        target.spine.x = k(0, -0.1, 0.2);
        target.body.y = k(-0.04, 0.02, -0.18);
        target.lLegL.x = k(0.3, 0.2, 0.7);
        target.lLegR.x = k(0.25, 0.2, 0.6);
        target.uLegL.x = k(-0.25, -0.2, -0.6);
        break;
      case 'thrust':
        target.uArmR.x = k(-0.5, -0.4, -1.55);
        target.uArmR.z = k(-0.15, -0.35, 0.05);
        target.lArmR.x = k(-0.9, -1.9, -0.05);
        target.handR.x = k(0.6, 1.0, 1.45);
        target.chest.y = k(0, 0.55, -0.35);
        target.spine.y = k(0, 0.2, -0.15);
        target.body.z = k(0, -0.08, 0.22);
        target.uLegL.x = k(-0.25, -0.2, -0.75);
        target.lLegL.x = k(0.3, 0.3, 0.75);
        target.uLegR.x = k(0.2, 0.2, 0.45);
        target.body.y = k(-0.04, -0.03, -0.14);
        break;
      case 'shoot':
        target.uArmR.x = k(-1.0, -1.5, -1.62);
        target.uArmR.z = k(0, 0.1, 0.12);
        target.lArmR.x = k(-0.5, -0.15, -0.1) + Math.max(0, 1 - Math.abs(t - 0.45) * 8) * -0.35;
        target.handR.x = k(1.0, 1.5, 1.45);
        target.uArmL.x = k(-0.9, -1.3, -1.35);
        target.uArmL.z = k(0.1, -0.35, -0.38);
        target.lArmL.x = k(-0.9, -0.8, -0.75);
        target.chest.y = k(0, 0.15, 0.2);
        target.chest.x = -Math.max(0, 1 - Math.abs(t - 0.42) * 7) * 0.12; // coice
        target.head.y = k(0, -0.1, -0.15);
        break;
      case 'punch':
        target.uArmR.x = k(-0.6, 0.3, -1.6);
        target.uArmR.z = k(-0.2, -0.3, 0.12);
        target.lArmR.x = k(-1.8, -2.2, -0.05);
        target.handR.x = k(0.3, 0.3, 1.2);
        target.uArmL.x = -0.75;
        target.uArmL.z = 0.1;
        target.lArmL.x = -2.1;
        target.chest.y = k(0, 0.45, -0.55);
        target.spine.y = k(0, 0.15, -0.2);
        target.body.z = k(0, -0.05, 0.15);
        break;
      case 'cast':
        target.uArmR.x = k(-0.4, -0.6, -1.45);
        target.uArmL.x = k(-0.4, -0.6, -1.45);
        target.uArmR.z = k(-0.1, 0.4, 0.22);
        target.uArmL.z = k(0.1, -0.4, -0.22);
        target.lArmR.x = k(-0.4, -2.0, -0.1);
        target.lArmL.x = k(-0.4, -2.0, -0.1);
        target.handR.x = k(0, 0.4, -0.9);
        target.handL.x = k(0, 0.4, -0.9);
        target.chest.x = k(0, -0.12, 0.15);
        break;
      case 'slash':
      default:
        target.uArmR.x = k(-0.5, -2.3, -1.0);
        target.uArmR.z = k(-0.15, -0.9, 0.55);
        target.uArmR.y = k(0, -0.4, 0.6);
        target.lArmR.x = k(-0.5, -0.9, -0.15);
        target.handR.x = k(0.3, 0.6, 0.9);
        target.handR.z = k(0, -0.3, 0.4);
        target.chest.y = k(0, 0.6, -0.65);
        target.spine.y = k(0, 0.2, -0.25);
        target.chest.x = k(0, -0.05, 0.12);
        break;
    }
  }

  function computePose(state, dt) {
    const t = state.time ?? animTime;
    const anim = state.anim || 'idle';
    resetTarget();
    let stiff = 14;
    // respiração em todas as poses de pé
    const breathe = Math.sin(t * 2.1 + seed) * 0.022;
    target.chest.x = -breathe;
    target.head.x = breathe * 0.6;

    switch (anim) {
      case 'walk':
      case 'run': {
        const run = anim === 'run';
        const sp = Math.max(run ? 4 : 1, state.speed || (run ? 6.5 : 2.4));
        const stride = run ? 2.7 : 1.45;
        phase += dt * TAU * (sp / stride);
        const amp = run ? Math.min(1.05, 0.65 + sp * 0.05) : Math.min(0.62, 0.35 + sp * 0.07);
        legsGait(phase, amp, run ? 1.5 : 0.85, run ? 1 : 0.4);
        const s = Math.sin(phase);
        target.uArmL.x = s * amp * (run ? 1.0 : 0.8);
        target.uArmR.x = -s * amp * (run ? 1.0 : 0.8);
        target.uArmL.z = 0.12;
        target.uArmR.z = -0.12;
        target.lArmL.x = run ? -1.45 : -0.3 - Math.max(0, -s) * 0.35;
        target.lArmR.x = run ? -1.45 : -0.3 - Math.max(0, s) * 0.35;
        target.chest.y = s * (run ? 0.18 : 0.1);
        target.hips.y = -s * (run ? 0.12 : 0.08);
        target.spine.x = run ? 0.22 : 0.04;
        target.head.x = run ? -0.15 : 0;
        target.body.y = -Math.abs(Math.cos(phase)) * (run ? 0.07 : 0.035) + (run ? 0.0 : 0.012);
        target.body.rz = s * 0.03;
        stiff = run ? 22 : 16;
        break;
      }
      case 'jump': {
        const a = smooth(0, 0.25, animTime);
        target.uLegL.x = -1.0 * a;
        target.lLegL.x = 1.5 * a;
        target.uLegR.x = -0.25 * a;
        target.lLegR.x = 0.7 * a;
        target.footL.x = -0.3;
        target.uArmL.x = -2.4 * a;
        target.uArmR.x = -2.0 * a;
        target.uArmL.z = 0.35;
        target.uArmR.z = -0.35;
        target.lArmL.x = -0.4;
        target.lArmR.x = -0.5;
        target.spine.x = -0.1;
        target.head.x = -0.15;
        stiff = 16;
        break;
      }
      case 'fall': {
        const w = Math.sin(t * 9) * 0.25;
        target.uArmL.z = 1.7 + w;
        target.uArmR.z = -1.7 + w;
        target.uArmL.x = -0.4;
        target.uArmR.x = -0.4;
        target.lArmL.x = -0.6;
        target.lArmR.x = -0.6;
        target.uLegL.x = -0.35 + Math.sin(t * 7) * 0.2;
        target.uLegR.x = 0.1 - Math.sin(t * 7) * 0.2;
        target.lLegL.x = 0.7;
        target.lLegR.x = 0.5;
        target.uLegL.z = 0.12;
        target.uLegR.z = -0.12;
        target.spine.x = -0.15;
        target.head.x = 0.2;
        break;
      }
      case 'fly': {
        // pose de super-herói: corpo inclinado para frente, braço direito estendido à frente
        const hover = Math.sin(t * 2.2) * 0.04;
        target.body.rx = 1.25;
        target.body.y = 0.15 + hover;
        target.uArmR.x = -3.0;
        target.uArmR.z = 0.05;
        target.lArmR.x = -0.05;
        target.handR.x = 0.1;
        target.uArmL.x = 0.25;
        target.uArmL.z = 0.18;
        target.lArmL.x = -0.3;
        target.uLegL.x = 0.12;
        target.uLegR.x = 0.02;
        target.lLegL.x = 0.45 + Math.sin(t * 2.2) * 0.08;
        target.lLegR.x = 0.12;
        target.footL.x = 0.6;
        target.footR.x = 0.6;
        target.head.x = -0.9; // olha para frente
        target.neck.x = -0.25;
        target.chest.x = 0;
        stiff = 10;
        break;
      }
      case 'attack': {
        const at = state.attackT >= 0 ? state.attackT : clamp01(animTime / 0.6);
        attackPose(state.attackStyle || 'slash', at);
        stiff = 30;
        break;
      }
      case 'cast': {
        const ct = state.castT >= 0 ? state.castT : clamp01(animTime / 1.2);
        const raise = smooth(0, 0.35, ct);
        const push = smooth(0.62, 0.78, ct);
        const rec = smooth(0.85, 1, ct);
        const tremble = Math.sin(t * 30) * 0.04 * raise * (1 - push);
        target.uArmL.x = lerp(lerp(0, -2.5, raise), -1.5, push) * (1 - rec) + tremble;
        target.uArmR.x = lerp(lerp(0, -2.5, raise), -1.5, push) * (1 - rec) - tremble;
        target.uArmL.z = lerp(0.6 * raise, -0.15, push) * (1 - rec) + 0.1 * rec;
        target.uArmR.z = lerp(-0.6 * raise, 0.15, push) * (1 - rec) - 0.1 * rec;
        target.lArmL.x = -0.25;
        target.lArmR.x = -0.25;
        target.handL.x = lerp(0, -1.0, push);
        target.handR.x = lerp(0, -1.0, push);
        target.chest.x = lerp(-0.18 * raise, 0.18, push) * (1 - rec);
        target.head.x = lerp(-0.25 * raise, 0, push);
        target.body.y = -0.03 * raise;
        target.uLegL.x = -0.15;
        target.uLegR.x = 0.15;
        target.lLegL.x = 0.15;
        target.lLegR.x = 0.15;
        stiff = 20;
        break;
      }
      case 'block': {
        target.uArmL.x = -1.25;
        target.uArmR.x = -1.25;
        target.uArmL.z = -0.35;
        target.uArmR.z = 0.35;
        target.lArmL.x = -1.75;
        target.lArmR.x = -1.75;
        target.lArmL.y = 0.3;
        target.lArmR.y = -0.3;
        target.chest.x = 0.15;
        target.head.x = 0.15;
        target.body.y = -0.07;
        target.uLegL.x = -0.35;
        target.uLegR.x = 0.25;
        target.lLegL.x = 0.45;
        target.lLegR.x = 0.35;
        target.footR.x = -0.4;
        stiff = 24;
        break;
      }
      case 'dodge': {
        // rolamento para frente (~0.55 s) e recuperação agachado
        const d = clamp01(animTime / 0.55);
        const tuck = Math.sin(Math.min(1, d) * Math.PI);
        target.body.rx = easeOut(d) * TAU;
        target.body.y = -0.42 * tuck;
        target.uLegL.x = -1.9 * tuck;
        target.uLegR.x = -1.7 * tuck;
        target.lLegL.x = 2.3 * tuck;
        target.lLegR.x = 2.2 * tuck;
        target.uArmL.x = -1.2 * tuck;
        target.uArmR.x = -1.2 * tuck;
        target.lArmL.x = -1.6 * tuck;
        target.lArmR.x = -1.6 * tuck;
        target.spine.x = 0.5 * tuck;
        target.chest.x = 0.4 * tuck;
        target.head.x = 0.5 * tuck;
        if (d >= 1) {
          target.body.y = -0.08;
          target.lLegL.x = 0.4;
          target.lLegR.x = 0.4;
          target.uLegL.x = -0.3;
          target.uLegR.x = -0.1;
        }
        stiff = 40;
        break;
      }
      case 'hit': {
        const k = Math.exp(-animTime * 4);
        const s = 0.35 + 0.65 * k;
        target.chest.x = -0.45 * s;
        target.spine.x = -0.2 * s;
        target.head.x = -0.4 * s;
        target.head.z = 0.15 * s;
        target.uArmL.z = 0.7 * s;
        target.uArmR.z = -0.7 * s;
        target.uArmL.x = -0.6 * s;
        target.uArmR.x = -0.5 * s;
        target.lArmL.x = -0.8;
        target.lArmR.x = -0.8;
        target.body.z = -0.12 * s;
        target.body.y = -0.04;
        target.uLegL.x = -0.3;
        target.lLegL.x = 0.4;
        target.uLegR.x = 0.15;
        stiff = 26;
        break;
      }
      case 'ko': {
        // cai de costas e fica deitado (não gráfico)
        const d = smooth(0, 0.75, animTime);
        target.body.rx = -Math.PI / 2 * d;
        target.body.y = lerp(0, -(HIP_Y - 0.13), d) + Math.sin(Math.min(1, animTime / 0.75) * Math.PI) * 0.12;
        target.uArmL.z = 1.25 * d;
        target.uArmR.z = -1.1 * d;
        target.uArmL.x = -0.3 * d;
        target.lArmL.x = -0.5 * d;
        target.lArmR.x = -0.2 * d;
        target.uLegL.x = -0.1;
        target.uLegR.x = 0.05;
        target.uLegL.z = 0.15 * d;
        target.uLegR.z = -0.1 * d;
        target.lLegL.x = 0.25 * d;
        target.head.y = 0.6 * d;
        target.head.x = -0.1 * d;
        target.footL.x = -0.6 * d;
        target.footR.x = -0.6 * d;
        stiff = 12;
        break;
      }
      case 'idle':
      default: {
        restArms(t);
        target.body.y = Math.sin(t * 2.1 + seed) * 0.006;
        target.hips.z = Math.sin(t * 0.6 + seed) * 0.02;
        target.spine.z = -target.hips.z * 0.8;
        target.uLegL.z = 0.03;
        target.uLegR.z = -0.03;
        target.uLegL.x = -0.03;
        target.lLegL.x = 0.06;
        target.lLegR.x = 0.04;
        // olhar ao redor de vez em quando
        lookT -= dt;
        if (lookT <= 0) {
          lookT = 2 + Math.random() * 4;
          lookY = (Math.random() - 0.5) * 0.9;
          lookX = (Math.random() - 0.5) * 0.25;
        }
        target.head.y = lookY;
        target.head.x += lookX;
        target.neck.y = lookY * 0.3;
        stiff = 8;
        break;
      }
    }
    return stiff;
  }

  function applyPose() {
    for (const j of JOINTS) {
      const c = cur[j];
      J[j].rotation.set(c.x, c.y, c.z);
    }
    body.position.set(cur.body.x, HIP_Y + cur.body.y, cur.body.z);
    body.rotation.set(cur.body.rx, cur.body.ry, cur.body.rz);
  }

  const state0 = { anim: 'idle', speed: 0, attackT: -1, attackStyle: 'slash', castT: -1, time: 0 };
  let opacity = 1;

  const api = {
    root,
    rightHand,
    leftHand,
    head,
    height: 1.8,
    joints: J,
    update(dt, state = state0) {
      dt = Math.min(Math.max(dt || 0, 0), 0.1);
      const anim = state.anim || 'idle';
      if (anim !== lastAnim) {
        if (lastAnim === 'dodge' || cur.body.rx > Math.PI || cur.body.rx < -Math.PI) {
          cur.body.rx = Math.atan2(Math.sin(cur.body.rx), Math.cos(cur.body.rx));
        }
        lastAnim = anim;
        animTime = 0;
      } else animTime += dt;
      const stiff = computePose(state, dt);
      const k = 1 - Math.exp(-dt * stiff);
      for (const j of JOINTS) {
        const c = cur[j];
        const tg = target[j];
        c.x += (tg.x - c.x) * k;
        c.y += (tg.y - c.y) * k;
        c.z += (tg.z - c.z) * k;
      }
      const cb = cur.body;
      const tb = target.body;
      const kb = anim === 'dodge' ? 1 - Math.exp(-dt * 60) : k;
      for (const key of ['x', 'y', 'z', 'rx', 'ry', 'rz']) cb[key] += (tb[key] - cb[key]) * kb;
      applyPose();

      // piscar (olhos fechados no KO)
      blinkT -= dt;
      if (blinkT <= 0) {
        blink = 0.14;
        blinkT = 2.5 + Math.random() * 3.5;
      }
      if (blink > 0) blink -= dt;
      const closed = anim === 'ko' && animTime > 0.4;
      eyesGroup.scale.y = closed ? 0.12 : blink > 0 ? 0.15 : anim === 'hit' && animTime < 0.4 ? 0.4 : 1;

      // flash de dano
      if (flashT > 0) {
        flashT = Math.max(0, flashT - dt);
        const f = flashT / 0.35;
        material.emissive.copy(flashColor).multiplyScalar(f * 1.6);
        eyeMat.emissive.copy(flashColor).multiplyScalar(f);
      }
    },
    setOpacity(a) {
      a = clamp01(a);
      if (a === opacity) return;
      const wasT = opacity < 1;
      opacity = a;
      const isT = a < 1;
      for (const m of [material, eyeMat]) {
        m.opacity = a;
        m.transparent = isT;
        m.depthWrite = a > 0.5;
        if (wasT !== isT) m.needsUpdate = true;
      }
      root.visible = a > 0.01;
      for (const m of meshes) m.castShadow = a > 0.35 && currentDetail > 0 && !smallMeshes.includes(m);
    },
    flash(colorHex = 0xff3030) {
      flashColor.set(colorHex);
      flashT = 0.35;
    },
    setDetail(level) {
      currentDetail = level;
      for (const m of smallMeshes) m.visible = level >= 1;
      for (const m of meshes) if (!smallMeshes.includes(m)) m.castShadow = level >= 1 && opacity > 0.35;
      rimU.value = level >= 1 ? 0.22 : 0.12;
    },
    dispose() {
      for (const m of meshes) m.geometry.dispose();
      material.dispose();
      eyeMat.dispose();
      root.removeFromParent();
    },
  };
  let currentDetail = 2;
  api.update(0, state0);
  return api;
}
