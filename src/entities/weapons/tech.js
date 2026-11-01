// Armas de energia e manopla: blaster, rifle, cannon, gauntlet.
// Armas de fogo: cano ao longo de +Y, "topo" da arma em +Z; empunhadura na origem.
import * as THREE from 'three';
import { lathe, extrude, shapeFrom } from './geometry.js';
import { band, gem } from './parts.js';

/** Extrusão de perfil lateral: shape (x = Z do mundo, y = Y do mundo), espessura em X. */
function side(B, pts, depth, mat, o = {}) {
  const g = extrude(shapeFrom(pts), depth, { bevel: o.bevel ?? 0.006, bevelSeg: 2, curveSeg: 8 });
  return B.add(g, mat, { pos: [o.x || 0, 0, 0], rot: [0, -Math.PI / 2, 0], role: o.role || 'body' });
}

/** Torneado ao longo de Y deslocado em Z. */
function barrel(B, pts, z, mat, role = 'barrel', segs = 16) {
  return B.add(lathe(pts, B.seg(segs)), mat, { pos: [0, 0, z], role });
}

function grip(B, mat) {
  side(B, [[-0.075, -0.05], [-0.082, -0.03, 'q', -0.085, -0.045], [-0.075, -0.006], [0.06, 0.03], [0.06, -0.035], [-0.03, -0.045, 'q', 0.0, -0.05]], 0.03, mat, { role: 'grip' });
  // sulcos para os dedos
  B.small(1, () => {
    for (let i = 0; i < 3; i++) B.add(new THREE.CylinderGeometry(0.004, 0.004, 0.034, 6).rotateZ(Math.PI / 2), mat, { pos: [0, -0.002 + i * 0.01 - 0.018 + i * 0.002, -0.045 + i * 0.03], role: 'grip', shadow: false });
  });
}

function trigger(B, z0) {
  const { P } = B;
  const g = new THREE.TorusGeometry(0.026, 0.0035, 6, B.seg(16), Math.PI);
  B.add(g, P.techDark, { pos: [0, 0.035, z0], rot: [0, Math.PI / 2, Math.PI / 2], role: 'metal', shadow: false });
  side(B, [[z0 + 0.02, 0.03], [z0 - 0.002, 0.035], [z0 + 0.003, 0.042], [z0 + 0.02, 0.04]], 0.006, P.accent, { bevel: 0.001 });
}

export function buildBlaster(B) {
  const { P } = B;
  grip(B, P.techDark);
  // corpo
  side(B, [[0.052, -0.075], [0.052, 0.19], [0.08, 0.215, 'q', 0.06, 0.215], [0.128, 0.2, 'q', 0.12, 0.215], [0.14, 0.06], [0.13, -0.055], [0.1, -0.085, 'q', 0.125, -0.08]], 0.046, P.tech);
  side(B, [[0.128, -0.04], [0.16, -0.03], [0.165, 0.12], [0.135, 0.17]], 0.012, P.accent, { bevel: 0.003 });
  trigger(B, 0.03);
  // cano
  const zb = 0.095;
  barrel(B, [[0, 0.17], [0.022, 0.17], [0.019, 0.2], [0.019, 0.29], [0.024, 0.3], [0.026, 0.325], [0.016, 0.33], [0.014, 0.31], [0, 0.31]], zb, P.techDark);
  for (let i = 0; i < 3; i++) B.add(new THREE.TorusGeometry(0.023, 0.0045, 6, B.seg(20)), P.energy, { pos: [0, 0.21 + i * 0.027, zb], rot: [Math.PI / 2, 0, 0], role: 'energy', shadow: false });
  B.add(new THREE.CircleGeometry(0.014, 16), P.energy, { pos: [0, 0.312, zb], rot: [-Math.PI / 2, 0, 0], role: 'energy', shadow: false });
  // célula de energia lateral
  for (const s of [-1, 1]) {
    B.add(new THREE.CapsuleGeometry(0.009, 0.12, 4, 10), P.energy, { pos: [s * 0.028, 0.06, 0.1], role: 'energy', shadow: false });
    B.add(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 10), P.accent, { pos: [s * 0.028, -0.005, 0.1], role: 'metal', shadow: false });
    B.add(new THREE.CylinderGeometry(0.013, 0.013, 0.012, 10), P.accent, { pos: [s * 0.028, 0.125, 0.1], role: 'metal', shadow: false });
  }
  // aletas traseiras
  B.small(1, () => { for (const s of [-1, 1]) side(B, [[0.07, -0.07], [0.12, -0.06], [0.11, -0.12], [0.08, -0.1]], 0.006, P.accent, { x: s * 0.026, bevel: 0.002 }); });
  gem(B, [0.0, 0.0, 0.142], 0.01, { axis: 'y' });
  return { length: 0.42, tip: [0, 0.335, zb], axis: { from: [0, 0.0, zb], to: [0, 0.32, zb], width: 0.03 }, style: 'gun' };
}

export function buildRifle(B) {
  const { P } = B;
  grip(B, P.techDark);
  // coronha
  side(B, [[0.03, -0.09], [0.115, -0.07], [0.12, -0.2], [0.115, -0.42], [0.075, -0.44, 'q', 0.11, -0.445], [-0.02, -0.41], [-0.03, -0.37], [0.03, -0.3], [0.05, -0.15]], 0.036, P.techDark);
  B.add(new THREE.CapsuleGeometry(0.006, 0.12, 4, 8), P.energy, { pos: [0.019, -0.27, 0.07], rot: [0, 0, 0], role: 'energy', shadow: false });
  // corpo
  side(B, [[0.05, -0.09], [0.05, 0.38], [0.085, 0.4], [0.128, 0.38], [0.138, 0.0], [0.12, -0.1]], 0.05, P.tech);
  trigger(B, 0.03);
  // empunhadura frontal
  side(B, [[0.05, 0.22], [-0.03, 0.235], [-0.035, 0.26], [0.05, 0.28]], 0.026, P.techDark, { bevel: 0.004 });
  // cano com dissipadores
  const zb = 0.09;
  barrel(B, [[0, 0.36], [0.019, 0.36], [0.016, 0.38], [0.016, 0.72], [0.022, 0.73], [0.022, 0.76], [0.012, 0.765], [0, 0.765]], zb, P.techDark);
  const nfins = B.detail > 0 ? 8 : 4;
  for (let i = 0; i < nfins; i++) B.add(lathe([[0.016, 0], [0.032, 0.002], [0.032, 0.008], [0.016, 0.01]], B.seg(14)), P.accent, { pos: [0, 0.41 + i * (0.17 / nfins), zb], role: 'metal', shadow: false });
  for (let i = 0; i < 2; i++) B.add(new THREE.TorusGeometry(0.02, 0.004, 6, B.seg(18)), P.energy, { pos: [0, 0.64 + i * 0.04, zb], rot: [Math.PI / 2, 0, 0], role: 'energy', shadow: false });
  // luneta
  barrel(B, [[0, 0.04], [0.016, 0.04], [0.02, 0.05], [0.014, 0.08], [0.014, 0.22], [0.019, 0.25], [0.019, 0.27], [0, 0.27]], 0.172, P.techDark, 'scope', 14);
  B.add(new THREE.CircleGeometry(0.016, 14), P.energy, { pos: [0, 0.271, 0.172], rot: [-Math.PI / 2, 0, 0], role: 'energy', shadow: false });
  for (const y of [0.1, 0.2]) side(B, [[0.13, y - 0.01], [0.16, y - 0.008], [0.16, y + 0.008], [0.13, y + 0.01]], 0.012, P.accent, { bevel: 0.002 });
  // câmara de energia
  B.add(new THREE.CylinderGeometry(0.016, 0.016, 0.16, 12), P.energy, { pos: [0.03, 0.16, 0.085], role: 'energy', shadow: false });
  const glass = P.gem.clone(); glass.transparent = true; glass.opacity = 0.4; glass.depthWrite = false; P.list.push(glass);
  B.add(new THREE.CylinderGeometry(0.022, 0.022, 0.17, 12), glass, { pos: [0.03, 0.16, 0.085], role: 'glass', shadow: false });
  return { length: 1.2, tip: [0, 0.77, zb], axis: { from: [0, 0.4, zb], to: [0, 0.75, zb], width: 0.03 }, style: 'gun' };
}

export function buildCannon(B) {
  const { P } = B;
  grip(B, P.darkWood);
  const zb = 0.14;
  // corpo do canhão (torneado ornamentado)
  barrel(B, [
    [0, -0.42], [0.05, -0.42], [0.075, -0.4], [0.098, -0.35], [0.1, -0.3], [0.088, -0.25], [0.092, -0.22], [0.08, -0.18], [0.078, 0.2],
    [0.088, 0.22], [0.088, 0.26], [0.074, 0.28], [0.07, 0.48], [0.085, 0.53], [0.115, 0.6], [0.112, 0.63], [0.068, 0.62], [0.06, 0.52], [0, 0.52],
  ], zb, P.blade, 'blade', 22);
  // aros
  for (const y of [-0.22, 0.0, 0.24, 0.47]) B.add(new THREE.TorusGeometry(0.082, 0.009, 8, B.seg(24)), P.accent, { pos: [0, y, zb], rot: [Math.PI / 2, 0, 0], role: 'metal', shadow: false });
  B.add(new THREE.TorusGeometry(0.075, 0.006, 6, B.seg(28)), P.energy, { pos: [0, 0.58, zb], rot: [Math.PI / 2, 0, 0], role: 'energy', shadow: false });
  B.add(new THREE.CircleGeometry(0.066, 20), P.energy, { pos: [0, 0.53, zb], rot: [-Math.PI / 2, 0, 0], role: 'energy', shadow: false });
  // berço que liga ao cabo
  side(B, [[0.04, -0.12], [0.07, -0.13], [0.07, 0.12], [0.04, 0.1]], 0.05, P.accent);
  // empunhadura frontal
  side(B, [[0.07, 0.2], [-0.02, 0.215], [-0.024, 0.245], [0.07, 0.26]], 0.03, P.darkWood, { bevel: 0.005 });
  // núcleo arcano na culatra
  B.add(new THREE.SphereGeometry(0.035, 16, 12), P.energy, { pos: [0, -0.43, zb], role: 'core', shadow: false });
  const shellMat = P.gem.clone(); shellMat.transparent = true; shellMat.opacity = 0.5; shellMat.depthWrite = false; P.list.push(shellMat);
  B.add(new THREE.IcosahedronGeometry(0.052, 1), shellMat, { pos: [0, -0.44, zb], role: 'orb', shadow: false });
  // aletas laterais
  for (const s of [-1, 1]) {
    B.add(extrude(shapeFrom([[0, 0], [0.09, -0.04], [0.11, -0.13], [0.05, -0.08], [0, -0.1]]), 0.01, { bevel: 0.004 }), P.accent, { pos: [s * 0.07, 0.42, zb], scale: [s, 1, 1], role: 'metal' });
  }
  gem(B, [0, -0.3, zb + 0.1], 0.016, { axis: 'y' });
  return { length: 1.06, tip: [0, 0.64, zb], axis: { from: [0, -0.2, zb], to: [0, 0.58, zb], width: 0.1 }, style: 'gun' };
}

export function buildGauntlet(B) {
  const { P } = B;
  const plate = P.blade;
  // punho/antebraço (cone alargado)
  B.add(lathe([[0, -0.3], [0.058, -0.3], [0.066, -0.29], [0.062, -0.25], [0.054, -0.18], [0.046, -0.1], [0.05, -0.085], [0.044, -0.075], [0, -0.075]], B.seg(20)), P.accent, { role: 'metal', scale: [1, 1, 0.82] });
  for (const y of [-0.255, -0.2, -0.145]) B.add(lathe([[0.0, y - 0.012], [0.062 - (y + 0.3) * 0.12, y - 0.012], [0.066 - (y + 0.3) * 0.12, y], [0.06 - (y + 0.3) * 0.12, y + 0.014], [0, y + 0.014]], B.seg(20)), plate, { role: 'blade', scale: [1, 1, 0.84] });
  // dorso da mão
  B.add(extrude(shapeFrom([[-0.046, -0.075], [0.046, -0.075], [0.05, 0.02], [0.044, 0.05], [-0.044, 0.05], [-0.05, 0.02]]), 0.05, { bevel: 0.01 }), P.darkSteel, { pos: [0, 0, 0], role: 'metal' });
  B.add(extrude(shapeFrom([[-0.04, -0.07], [0.04, -0.07], [0.045, 0.01], [0, 0.045], [-0.045, 0.01]]), 0.01, { bevel: 0.006 }), plate, { pos: [0, 0, 0.032], role: 'blade' });
  // dedos fechados (quatro, duas falanges)
  for (let i = 0; i < 4; i++) {
    const x = -0.034 + i * 0.0227;
    B.add(new THREE.CapsuleGeometry(0.0115, 0.032, 4, 10), P.darkSteel, { pos: [x, 0.062, 0.0], rot: [Math.PI / 2, 0, 0], role: 'metal' });
    B.add(new THREE.CapsuleGeometry(0.0105, 0.02, 4, 10), P.darkSteel, { pos: [x, 0.044, -0.03], rot: [0.5, 0, 0], role: 'metal', shadow: false });
    // placa de junta com cravo
    B.add(extrude(shapeFrom([[-0.011, -0.008], [0.011, -0.008], [0.012, 0.006], [0, 0.012], [-0.012, 0.006]]), 0.03, { bevel: 0.004 }), plate, { pos: [x, 0.074, 0.006], rot: [Math.PI / 2, 0, 0], role: 'blade' });
    B.add(lathe([[0, 0], [0.006, 0], [0.002, 0.018], [0, 0.022]], 6), P.accent, { pos: [x, 0.084, 0.012], role: 'metal', shadow: false });
  }
  // polegar
  B.add(new THREE.CapsuleGeometry(0.012, 0.04, 4, 10), P.darkSteel, { pos: [0.04, 0.03, -0.035], rot: [0, 0, 1.25], role: 'metal' });
  gem(B, [0, -0.02, 0.043], 0.016);
  return { length: 0.4, tip: [0, 0.095, 0], axis: { from: [0, -0.26, 0], to: [0, 0.08, 0], width: 0.06 }, style: 'fist' };
}
