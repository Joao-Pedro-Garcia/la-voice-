// Armas de haste: axe, hammer, mace, spear, trident, scythe.
import * as THREE from 'three';
import { loftBlade, lathe, extrude, shapeFrom, mirroredShape, taperedTube } from './geometry.js';
import { wrappedGrip, band, gem, pommel } from './parts.js';

function haft(B, y0, y1, r0, r1, mat, knots = 0) {
  const pts = [[0, y0]];
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    let r = r0 + (r1 - r0) * t;
    if (knots) r *= 1 + 0.08 * Math.pow(Math.max(0, Math.sin(t * Math.PI * knots)), 8);
    pts.push([r, y0 + (y1 - y0) * t]);
  }
  pts.push([0, y1]);
  return B.add(lathe(pts, B.seg(12)), mat, { role: 'haft' });
}

export function buildAxe(B) {
  const { P } = B;
  haft(B, -0.34, 0.66, 0.021, 0.018, P.wood);
  B.add(lathe([[0, -0.38], [0.012, -0.375], [0.025, -0.35], [0.024, -0.33], [0, -0.33]], B.seg(12)), P.accent, { role: 'metal' });
  wrappedGrip(B, -0.09, 0.1, 0.0225, P.leather, { ridges: 7, swell: 0.04 });
  band(B, 0.24, 0.024, 0.014, P.accent);
  // olho/encaixe
  const sock = B.add(extrude(shapeFrom([[-0.032, -0.07], [0.032, -0.07], [0.04, 0.0], [0.032, 0.07], [-0.032, 0.07], [-0.04, 0]]), 0.05, { bevel: 0.006 }), P.darkSteel, { pos: [0, 0.54, 0], role: 'metal' });
  void sock;
  // lâmina barbada (crescente)
  const blade = shapeFrom([
    [0.03, 0.045], [0.1, 0.06, 'q', 0.07, 0.07], [0.205, 0.2, 'q', 0.15, 0.12], [0.24, 0.02, 'q', 0.26, 0.12],
    [0.19, -0.17, 'q', 0.25, -0.1], [0.12, -0.08, 'q', 0.13, -0.15], [0.03, -0.045, 'q', 0.07, -0.05],
  ]);
  B.add(extrude(blade, 0.014, { bevel: 0.006, bevelSeg: 2, curveSeg: B.seg(14) }), P.blade, { pos: [0, 0.54, 0], role: 'blade' });
  // espigão traseiro
  B.add(extrude(shapeFrom([[-0.03, 0.035], [-0.11, 0.004], [-0.12, 0], [-0.11, -0.004], [-0.03, -0.035]]), 0.024, { bevel: 0.005 }), P.accent, { pos: [0, 0.54, 0], role: 'metal' });
  // ponta superior
  B.add(lathe([[0, 0.6], [0.016, 0.61], [0.014, 0.63], [0.006, 0.68], [0, 0.7]], B.seg(10)), P.accent, { role: 'metal' });
  if (P.ornate) { gem(B, [0, 0.54, 0.032], 0.013); gem(B, [0, 0.54, -0.032], 0.013); }
  return { length: 1.08, tip: [0.24, 0.56, 0], axis: { from: [0.2, 0.37, 0], to: [0.21, 0.74, 0], width: 0.06 }, style: 'head' };
}

export function buildHammer(B) {
  const { P } = B;
  haft(B, -0.32, 0.6, 0.022, 0.02, P.darkWood);
  pommel(B, -0.33, 0.028, 'cap');
  wrappedGrip(B, -0.1, 0.1, 0.0235, P.leather, { ridges: 7, swell: 0.04 });
  band(B, 0.32, 0.026, 0.02, P.accent);
  // langetas
  for (const s of [-1, 1]) B.add(extrude(shapeFrom([[-0.008, 0], [0.008, 0], [0.006, 0.2], [0, 0.215], [-0.006, 0.2]]), 0.006, { bevel: 0.002 }), P.accent, { pos: [0, 0.4, s * 0.021], role: 'metal', shadow: false });
  // cabeça: prisma octogonal chanfrado ao longo de X
  const oct = new THREE.Shape();
  const r = 0.085;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + Math.PI / 8; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) oct.lineTo(x, y); else oct.moveTo(x, y); }
  oct.closePath();
  B.add(extrude(oct, 0.24, { bevel: 0.012, bevelSeg: 2 }), P.blade, { pos: [0, 0.66, 0], rot: [0, Math.PI / 2, 0], role: 'blade' });
  // faces de impacto
  for (const s of [-1, 1]) {
    B.add(lathe([[0, 0], [0.09, 0], [0.098, 0.012], [0.094, 0.028], [0.07, 0.036], [0, 0.036]], 8), P.accent, { pos: [s * 0.12, 0.66, 0], rot: [0, 0, -s * Math.PI / 2], role: 'metal' });
  }
  // aros dourados e coroa
  for (const s of [-1, 1]) B.add(new THREE.TorusGeometry(0.094, 0.009, 6, 8), P.ornate ? P.gold : P.bronze, { pos: [s * 0.055, 0.66, 0], rot: [0, Math.PI / 2, Math.PI / 8], role: 'metal' });
  B.add(lathe([[0, 0.74], [0.035, 0.745], [0.03, 0.765], [0.012, 0.8], [0, 0.83]], 4), P.accent, { role: 'metal', rot: [0, Math.PI / 4, 0] });
  gem(B, [0, 0.66, 0.088], 0.02);
  gem(B, [0, 0.66, -0.088], 0.02);
  return { length: 1.17, tip: [0, 0.79, 0], axis: { from: [-0.15, 0.66, 0], to: [0.15, 0.66, 0], width: 0.09 }, style: 'blunt' };
}

export function buildMace(B) {
  const { P } = B;
  haft(B, -0.2, 0.44, 0.018, 0.016, P.darkSteel, 6);
  pommel(B, -0.215, 0.026, 'spike');
  wrappedGrip(B, -0.1, 0.1, 0.0205, P.leather, { ridges: 8 });
  band(B, 0.12, 0.023, 0.016, P.accent);
  band(B, 0.4, 0.024, 0.02, P.accent);
  // núcleo
  B.add(lathe([[0, 0.42], [0.03, 0.43], [0.048, 0.47], [0.052, 0.52], [0.046, 0.57], [0.028, 0.6], [0, 0.61]], B.seg(16)), P.accent, { role: 'metal' });
  // flanges
  const fl = shapeFrom([[0, 0], [0.03, 0.01, 'q', 0.02, -0.005], [0.075, 0.07, 'q', 0.07, 0.01], [0.06, 0.15, 'q', 0.09, 0.12], [0, 0.18, 'q', 0.04, 0.18]]);
  const fg = extrude(fl, 0.008, { bevel: 0.004, curveSeg: B.seg(10) });
  const n = 7;
  for (let i = 0; i < n; i++) {
    B.add(fg, P.blade, { pos: [0, 0.43, 0], rot: [0, (i / n) * Math.PI * 2, 0], role: 'blade' });
  }
  // ponta
  B.add(lathe([[0, 0.6], [0.02, 0.6], [0.012, 0.64], [0, 0.69]], B.seg(10)), P.blade, { role: 'blade' });
  return { length: 0.92, tip: [0, 0.66, 0], axis: { from: [0, 0.44, 0], to: [0, 0.64, 0], width: 0.08 }, style: 'blunt' };
}

export function buildSpear(B) {
  const { P } = B;
  haft(B, -0.74, 1.14, 0.0165, 0.0155, P.wood);
  B.add(lathe([[0, -0.86], [0.006, -0.84], [0.016, -0.75], [0.018, -0.74], [0, -0.74]], B.seg(10)), P.accent, { role: 'metal' });
  wrappedGrip(B, -0.1, 0.18, 0.0185, P.leather, { ridges: 10, swell: 0.02 });
  band(B, 0.6, 0.02, 0.014, P.accent);
  // alvado
  B.add(lathe([[0, 1.12], [0.02, 1.12], [0.022, 1.14], [0.017, 1.2], [0.012, 1.25], [0, 1.25]], B.seg(12)), P.accent, { role: 'metal' });
  // borla (fios de tecido)
  B.small(1, () => {
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(Math.cos(a) * 0.02, 1.13, Math.sin(a) * 0.02), new THREE.Vector3(Math.cos(a) * 0.035, 1.07, Math.sin(a) * 0.035), new THREE.Vector3(Math.cos(a) * 0.04, 0.99 - (i % 3) * 0.01, Math.sin(a) * 0.04)]);
      B.add(taperedTube(curve, 6, 4, (t) => 0.006 * (1 - t * 0.6)), P.cloth, { role: 'cloth', shadow: false });
    }
    band(B, 1.13, 0.024, 0.012, P.accent);
  });
  B.add(loftBlade({
    length: 0.38, y0: 1.24, steps: B.seg(18), section: 'diamond',
    profile: [{ t: 0, w: 0.01, th: 0.008 }, { t: 0.12, w: 0.03, th: 0.008 }, { t: 0.35, w: 0.042, th: 0.0085 }, { t: 0.7, w: 0.026, th: 0.006 }, { t: 1, w: 0, th: 0.0005 }],
  }), P.blade, { role: 'blade' });
  return { length: 2.48, tip: [0, 1.62, 0], axis: { from: [0, 1.28, 0], to: [0, 1.58, 0], width: 0.04 }, style: 'pole' };
}

export function buildTrident(B) {
  const { P } = B;
  haft(B, -0.72, 0.98, 0.016, 0.016, P.bronze, 5);
  pommel(B, -0.74, 0.022, 'spike');
  wrappedGrip(B, -0.1, 0.16, 0.019, P.leather, { ridges: 9 });
  band(B, 0.97, 0.024, 0.03, P.accent);
  // travessa em U
  const bar = shapeFrom([
    [-0.13, 0.11], [-0.115, 0.03, 'q', -0.13, 0.05], [0, -0.02, 'q', -0.07, -0.02], [0.115, 0.03, 'q', 0.07, -0.02], [0.13, 0.11, 'q', 0.13, 0.05],
    [0.105, 0.11], [0.09, 0.05, 'q', 0.1, 0.07], [0, 0.02, 'q', 0.05, 0.02], [-0.09, 0.05, 'q', -0.05, 0.02], [-0.105, 0.11, 'q', -0.1, 0.07],
  ]);
  B.add(extrude(bar, 0.022, { bevel: 0.005, curveSeg: B.seg(10) }), P.accent, { pos: [0, 0.99, 0], role: 'guard' });
  // barbatana ondulada
  B.small(1, () => {
    B.add(extrude(mirroredShape([[0, -0.07], [0.02, -0.04], [0.06, -0.01], [0.04, 0.0], [0, 0.0]]), 0.008, { bevel: 0.003 }), P.accent, { pos: [0, 0.99, 0], role: 'metal' });
  });
  const prong = (x, len, w) => {
    const geo = loftBlade({ length: len, steps: B.seg(14), section: 'diamond', profile: [{ t: 0, w: w * 0.6, th: 0.009 }, { t: 0.55, w: w * 0.55, th: 0.008 }, { t: 0.72, w: w, th: 0.008 }, { t: 1, w: 0, th: 0.0005 }] });
    B.add(geo, P.blade, { pos: [x, 1.08, 0], role: 'blade' });
    // farpa
    if (x !== 0) B.add(extrude(shapeFrom([[0, 0], [0.026 * Math.sign(-x), -0.04], [0.012 * Math.sign(-x), 0.004]]), 0.008, { bevel: 0.002 }), P.blade, { pos: [x + Math.sign(x) * -0.005, 1.08 + len * 0.72, 0], role: 'blade' });
  };
  prong(0, 0.36, 0.028);
  prong(-0.118, 0.27, 0.022);
  prong(0.118, 0.27, 0.022);
  // haste central até o dente do meio
  B.add(lathe([[0, 0.99], [0.013, 0.99], [0.013, 1.08], [0, 1.08]], B.seg(10)), P.accent, { role: 'metal' });
  gem(B, [0, 1.03, 0.014], 0.012);
  return { length: 2.2, tip: [0, 1.44, 0], axis: { from: [0, 1.1, 0], to: [0, 1.42, 0], width: 0.13 }, style: 'pole' };
}

export function buildScythe(B) {
  const { P } = B;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.85, 0), new THREE.Vector3(0.03, -0.3, 0), new THREE.Vector3(0, 0.3, 0), new THREE.Vector3(-0.04, 0.8, 0), new THREE.Vector3(-0.02, 1.15, 0),
  ]);
  B.add(taperedTube(curve, B.seg(28), B.seg(10), (t) => 0.019 - 0.003 * t + 0.0015 * Math.sin(t * 40)), P.darkWood, { role: 'haft' });
  B.add(lathe([[0, -0.9], [0.014, -0.88], [0.022, -0.85], [0.02, -0.82], [0, -0.82]], B.seg(10)), P.accent, { role: 'metal' });
  wrappedGrip(B, -0.1, 0.12, 0.022, P.leather, { ridges: 8, swell: 0.03 });
  // manopla lateral (nib)
  B.add(lathe([[0, 0], [0.012, 0], [0.013, 0.09], [0.017, 0.1], [0.012, 0.12], [0, 0.12]], B.seg(10)), P.darkWood, { pos: [0.0, 0.5, 0], rot: [Math.PI / 2, 0, 0], role: 'haft' });
  band(B, 0.5, 0.024, 0.02, P.accent);
  // colar superior
  B.add(lathe([[0, 1.08], [0.026, 1.08], [0.03, 1.12], [0.026, 1.18], [0, 1.2]], B.seg(12)), P.accent, { pos: [-0.02, 0, 0], role: 'metal' });
  // lâmina em crescente
  const blade = shapeFrom([
    [0.03, 0.05], [-0.4, 0.06, 'q', -0.15, 0.13], [-0.72, -0.2, 'q', -0.62, -0.02],
    [-0.38, -0.04, 'q', -0.55, -0.08], [0.0, -0.035, 'q', -0.2, -0.04],
  ]);
  B.add(extrude(blade, 0.012, { bevel: 0.006, curveSeg: B.seg(20) }), P.blade, { pos: [-0.02, 1.13, 0], role: 'blade' });
  // ornamento lua no dorso
  B.small(1, () => {
    const moon = new THREE.Shape();
    moon.absarc(0, 0, 0.04, 0, Math.PI * 2, false);
    const h = new THREE.Path(); h.absarc(0.016, 0.008, 0.034, 0, Math.PI * 2, true); moon.holes.push(h);
    B.add(extrude(moon, 0.012, { bevel: 0.003 }), P.accent, { pos: [0.035, 1.2, 0], role: 'metal' });
  });
  gem(B, [-0.02, 1.13, 0.016], 0.014);
  return { length: 2.1, tip: [-0.74, 0.93, 0], axis: { from: [-0.08, 1.15, 0], to: [-0.66, 1.0, 0], width: 0.05 }, style: 'blade' };
}
