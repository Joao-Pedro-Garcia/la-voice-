// Arco e armas mágicas: bow, staff, wand.
import * as THREE from 'three';
import { lathe, extrude, taperedTube, shapeFrom } from './geometry.js';
import { wrappedGrip, band, gem } from './parts.js';

export function buildBow(B) {
  const { P } = B;
  // linha central do arco (eixo X), cordas voltadas para -Y, pontas recurvas para +Y
  const H = 0.66;
  const center = (x) => {
    const u = Math.abs(x) / H;
    return -0.2 * u * u + 0.06 * Math.pow(Math.max(0, (u - 0.82) / 0.18), 2) * 1.6;
  };
  const thick = (x) => { const u = Math.abs(x) / H; return 0.012 + 0.03 * Math.pow(1 - u, 2.2) + (u < 0.12 ? 0.02 * (1 - u / 0.12) : 0); };
  const top = [], bot = [];
  const n = B.seg(40);
  for (let i = 0; i <= n; i++) {
    const x = -H + (2 * H * i) / n;
    const dx = 0.001;
    const slope = (center(x + dx) - center(x - dx)) / (2 * dx);
    const len = Math.hypot(1, slope);
    const nx = -slope / len, ny = 1 / len;
    const t = thick(x) / 2;
    const cy = center(x);
    top.push([x + nx * t, cy + ny * t]);
    bot.push([x - nx * t, cy - ny * t]);
  }
  const outline = top.concat(bot.reverse());
  B.add(extrude(shapeFrom(outline), 0.03, { bevel: 0.004, bevelSeg: 1 }), P.darkWood, { role: 'blade' });
  // empunhadura
  wrappedGrip(B, -0.055, 0.055, 0.021, P.leather, { ridges: 6, swell: 0.05 }).rotation.z = Math.PI / 2;
  // pontas ornamentais
  const tipY = center(H);
  for (const s of [-1, 1]) {
    B.add(lathe([[0, 0], [0.012, 0.0], [0.01, 0.03], [0.003, 0.05], [0, 0.055]], B.seg(8)), P.accent, { pos: [s * (H - 0.01), tipY - 0.005, 0], rot: [0, 0, -s * 1.2], role: 'metal' });
  }
  // corda
  const strY = tipY - 0.012;
  const str = new THREE.CylinderGeometry(0.0018, 0.0018, 2 * (H - 0.02), 4).rotateZ(Math.PI / 2);
  const strMat = P.element ? P.energy : P.steel;
  B.add(str, strMat, { pos: [0, strY, 0], role: 'string', shadow: false });
  // flecha encaixada
  const arrowY0 = strY, arrowY1 = 0.55;
  B.add(new THREE.CylinderGeometry(0.0045, 0.0045, arrowY1 - arrowY0, 6).translate(0, (arrowY0 + arrowY1) / 2, 0), P.wood, { pos: [0, 0, 0.022], role: 'arrow', shadow: false });
  B.add(lathe([[0, 0], [0.012, 0.0], [0.004, 0.05], [0, 0.065]], 4), P.element ? P.blade : P.steel, { pos: [0, arrowY1, 0.022], role: 'arrowhead' });
  for (let i = 0; i < 3; i++) {
    const f = extrude(shapeFrom([[0, 0], [0.018, 0.012], [0.018, 0.07], [0, 0.06]]), 0.002, { bevel: 0 });
    const m = B.add(f, P.cloth, { pos: [0, arrowY0 + 0.012, 0.022], role: 'cloth', shadow: false });
    m.rotation.y = (i / 3) * Math.PI * 2;
  }
  gem(B, [0, 0.0, 0.02], 0.012);
  return { length: 2 * H, tip: [0, arrowY1 + 0.06, 0.022], axis: { from: [-H * 0.85, center(H * 0.85), 0], to: [H * 0.85, center(H * 0.85), 0], width: 0.02 }, style: 'bow' };
}

export function buildStaff(B) {
  const { P } = B;
  // cajado de madeira escura com nós e vinha torcida
  const pts = [[0, -0.8]];
  const n = 40;
  for (let i = 0; i <= n; i++) {
    const t = i / n; const y = -0.8 + 1.85 * t;
    const knot = Math.pow(Math.max(0, Math.sin(t * Math.PI * 7 + 0.5)), 10) * 0.004;
    pts.push([0.017 + 0.004 * t + knot, y]);
  }
  pts.push([0, 1.05]);
  B.add(lathe(pts, B.seg(12)), P.darkWood, { role: 'haft' });
  B.add(lathe([[0, -0.86], [0.01, -0.85], [0.02, -0.8], [0.021, -0.76], [0, -0.76]], B.seg(10)), P.accent, { role: 'metal' });
  wrappedGrip(B, -0.1, 0.16, 0.02, P.leather, { ridges: 9, swell: 0.02 });
  band(B, 0.2, 0.023, 0.014, P.accent);
  band(B, 0.98, 0.026, 0.02, P.accent);
  B.small(1, () => {
    const helix = [];
    for (let i = 0; i <= 40; i++) { const t = i / 40, a = t * Math.PI * 7; helix.push(new THREE.Vector3(Math.cos(a) * 0.023, 0.45 + t * 0.53, Math.sin(a) * 0.023)); }
    B.add(taperedTube(new THREE.CatmullRomCurve3(helix), B.seg(80), 5, (t) => 0.0045 * (0.6 + 0.4 * Math.sin(t * Math.PI))), P.ornate ? P.gold : P.wood, { role: 'metal', shadow: false });
  });
  // garras segurando o orbe
  const k = 4;
  for (let i = 0; i < k; i++) {
    const a = (i / k) * Math.PI * 2 + Math.PI / 4;
    const c = (r, y) => new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const curve = new THREE.CatmullRomCurve3([c(0.016, 1.0), c(0.06, 1.07), c(0.082, 1.15), c(0.06, 1.24), c(0.025, 1.28)]);
    B.add(taperedTube(curve, B.seg(16), 6, (t) => 0.009 * (1 - 0.7 * t)), P.accent, { role: 'metal' });
  }
  B.add(lathe([[0, 0.99], [0.03, 1.0], [0.035, 1.03], [0.02, 1.06], [0, 1.065]], B.seg(14)), P.accent, { role: 'metal' });
  // orbe: núcleo energético + casca de cristal
  B.add(new THREE.SphereGeometry(0.036, 16, 12), P.energy, { pos: [0, 1.16, 0], role: 'core', shadow: false });
  const shell = new THREE.IcosahedronGeometry(0.062, 1);
  const shellMat = P.gem.clone();
  shellMat.transparent = true; shellMat.opacity = 0.55; shellMat.depthWrite = false;
  P.list.push(shellMat);
  B.add(shell, shellMat, { pos: [0, 1.16, 0], role: 'orb', shadow: false });
  return { length: 2.14, tip: [0, 1.16, 0], axis: { from: [0, 1.05, 0], to: [0, 1.27, 0], width: 0.08 }, style: 'magic', orb: [0, 1.16, 0] };
}

export function buildWand(B) {
  const { P } = B;
  B.add(lathe([
    [0, -0.1], [0.008, -0.1], [0.012, -0.093], [0.01, -0.086], [0.011, -0.06], [0.0095, -0.02], [0.012, 0.0], [0.0105, 0.04], [0.013, 0.055], [0.01, 0.07],
  ], B.seg(14)), P.darkWood, { role: 'grip' });
  B.add(lathe([[0, 0.065], [0.0085, 0.065], [0.0055, 0.2], [0.0035, 0.31], [0, 0.315]], B.seg(10)), P.wood, { role: 'haft' });
  band(B, -0.096, 0.0135, 0.008, P.accent);
  band(B, 0.0, 0.0135, 0.006, P.accent);
  band(B, 0.06, 0.0145, 0.008, P.accent);
  B.small(1, () => {
    const helix = [];
    for (let i = 0; i <= 30; i++) { const t = i / 30, a = t * Math.PI * 6; helix.push(new THREE.Vector3(Math.cos(a) * 0.0115, -0.085 + t * 0.14, Math.sin(a) * 0.0115)); }
    B.add(taperedTube(new THREE.CatmullRomCurve3(helix), B.seg(60), 4, () => 0.0018), P.ornate ? P.gold : P.bronze, { role: 'metal', shadow: false });
  });
  // estrela/cristal na ponta
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.011 : 0.026; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) star.lineTo(x, y); else star.moveTo(x, y); }
  B.add(extrude(star, 0.006, { bevel: 0.003 }), P.gem, { pos: [0, 0.34, 0], role: 'gem', shadow: false });
  B.add(new THREE.SphereGeometry(0.008, 10, 8), P.energy, { pos: [0, 0.34, 0], role: 'core', shadow: false });
  return { length: 0.47, tip: [0, 0.34, 0], axis: { from: [0, 0.12, 0], to: [0, 0.33, 0], width: 0.015 }, style: 'magic', orb: [0, 0.34, 0] };
}

