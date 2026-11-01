// Espadas e lâminas: sword, greatsword, katana, dagger.
import * as THREE from 'three';
import { loftBlade, lathe, extrude, shapeFrom } from './geometry.js';
import { wrappedGrip, band, gem, pommel, crossguard } from './parts.js';

export function buildSword(B) {
  const { P } = B;
  const L = 0.84, base = 0.128;
  pommel(B, -0.125, 0.026, 'round');
  wrappedGrip(B, -0.1, 0.1, 0.0165, P.leather, { ridges: 8 });
  band(B, -0.1, 0.02, 0.012, P.accent);
  band(B, 0.1, 0.02, 0.012, P.accent);
  crossguard(B, 0.114, 0.125, 0.018, 0.026, 'arc');
  // langeta central sobre a lâmina
  B.add(extrude(shapeFrom([[-0.024, 0], [0.024, 0], [0.012, 0.035], [0, 0.045], [-0.012, 0.035]]), 0.03, { bevel: 0.004 }), P.accent, { pos: [0, 0.118, 0], role: 'guard' });
  gem(B, [0, 0.122, 0.021], 0.009);
  gem(B, [0, 0.122, -0.021], 0.009);
  B.add(loftBlade({
    length: L, y0: base, steps: B.seg(26), section: 'double',
    profile: [
      { t: 0, w: 0.029, th: 0.0075, f: 0 }, { t: 0.05, w: 0.028, th: 0.0072, f: 1 }, { t: 0.62, w: 0.0235, th: 0.0065, f: 1 },
      { t: 0.8, w: 0.019, th: 0.0058, f: 0.2 }, { t: 0.92, w: 0.011, th: 0.004, f: 0 }, { t: 1, w: 0.0, th: 0.0005 },
    ],
  }), P.blade, { role: 'blade' });
  return { length: base + L + 0.15, tip: [0, base + L, 0], axis: { from: [0, base + 0.05, 0], to: [0, base + L * 0.96, 0], width: 0.028 }, style: 'blade' };
}

export function buildGreatsword(B) {
  const { P } = B;
  const L = 1.22, base = 0.16;
  pommel(B, -0.355, 0.034, 'faceted');
  wrappedGrip(B, -0.33, 0.085, 0.019, P.leather, { ridges: 16, swell: 0.06 });
  band(B, -0.33, 0.024, 0.016, P.accent);
  band(B, 0.085, 0.024, 0.014, P.accent);
  crossguard(B, 0.1, 0.21, 0.022, 0.034, 'wing');
  B.add(extrude(shapeFrom([[-0.04, 0], [0.04, 0], [0.03, 0.05], [0, 0.075], [-0.03, 0.05]]), 0.036, { bevel: 0.005 }), P.accent, { pos: [0, 0.11, 0], role: 'guard' });
  gem(B, [0, 0.135, 0.024], 0.014);
  gem(B, [0, 0.135, -0.024], 0.014);
  // ricasso com couro e espigões de aparo
  wrappedGrip(B, base, base + 0.12, 0.0175, P.leather, { ridges: 5, swell: 0 }).scale.set(2.2, 1, 0.75);
  for (const s of [-1, 1]) {
    B.add(extrude(shapeFrom([[0, 0], [0.05, 0.015], [0.055, 0.03], [0, 0.022]]), 0.016, { bevel: 0.003 }), P.accent, { pos: [s * 0.03, base + 0.125, 0], scale: [s, 1, 1], role: 'guard' });
  }
  B.add(loftBlade({
    length: L, y0: base, steps: B.seg(30), section: 'double',
    profile: [
      { t: 0, w: 0.032, th: 0.009, f: 0 }, { t: 0.1, w: 0.032, th: 0.009, f: 0 }, { t: 0.13, w: 0.046, th: 0.0095, f: 1 },
      { t: 0.75, w: 0.042, th: 0.0085, f: 1 }, { t: 0.86, w: 0.034, th: 0.007, f: 0.3 }, { t: 0.95, w: 0.016, th: 0.0045, f: 0 }, { t: 1, w: 0, th: 0.0005 },
    ],
  }), P.blade, { role: 'blade' });
  return { length: base + L + 0.39, tip: [0, base + L, 0], axis: { from: [0, base + 0.18, 0], to: [0, base + L * 0.96, 0], width: 0.045 }, style: 'blade' };
}

export function buildKatana(B) {
  const { P } = B;
  const L = 0.74, base = 0.1;
  const sori = (t) => -0.045 * Math.pow(t, 1.6);
  // kashira (tampa do cabo) e tsuka com ito
  B.add(lathe([[0, -0.235], [0.015, -0.235], [0.019, -0.228], [0.019, -0.212], [0.0175, -0.205], [0, -0.205]], B.seg(16)), P.accent, { role: 'metal', scale: [1, 1, 0.78] });
  wrappedGrip(B, -0.205, 0.06, 0.0165, P.ito, { ridges: 11, swell: 0.05, oval: 0.78 });
  // fuchi
  B.add(lathe([[0, 0.058], [0.018, 0.058], [0.019, 0.07], [0, 0.07]], B.seg(16)), P.accent, { role: 'metal', scale: [1, 1, 0.78] });
  // tsuba: disco com recortes
  const ts = new THREE.Shape();
  const R = 0.042;
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * Math.PI * 2;
    const r = R * (1 + 0.06 * Math.cos(a * 4));
    const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.86;
    if (i === 0) ts.moveTo(x, y); else ts.lineTo(x, y);
  }
  const hole = (cx, cy, r) => { const h = new THREE.Path(); h.absarc(cx, cy, r, 0, Math.PI * 2, true); ts.holes.push(h); };
  hole(0.024, 0, 0.007); hole(-0.024, 0, 0.007);
  const slot = new THREE.Path();
  slot.moveTo(-0.004, -0.012); slot.lineTo(0.007, -0.012); slot.lineTo(0.007, 0.012); slot.lineTo(-0.004, 0.012); slot.closePath();
  ts.holes.push(slot);
  B.add(extrude(ts, 0.006, { bevel: 0.0015, curveSeg: 12 }), P.ornate ? P.gold : P.darkSteel, { pos: [0, 0.074, 0], rot: [Math.PI / 2, 0, 0], role: 'guard' });
  // habaki
  B.add(lathe([[0, 0.078], [0.012, 0.078], [0.011, 0.1], [0, 0.1]], 6), P.gold, { role: 'metal', scale: [1.3, 1, 0.75] });
  B.add(loftBlade({
    length: L, y0: base, steps: B.seg(30), section: 'single',
    profile: [
      { t: 0, w: 0.0165, th: 0.0068, x: sori(0) }, { t: 0.5, w: 0.0155, th: 0.006, x: sori(0.5) }, { t: 0.88, w: 0.0145, th: 0.0052, x: sori(0.88) },
      { t: 0.95, w: 0.011, th: 0.004, x: sori(0.95) - 0.002 }, { t: 1, w: 0.0, th: 0.0006, x: sori(1) - 0.012 },
    ],
  }), P.blade, { role: 'blade' });
  const tipX = sori(1) - 0.012;
  return { length: base + L + 0.235, tip: [tipX, base + L, 0], axis: { from: [0, base + 0.04, 0], to: [tipX * 0.9, base + L * 0.95, 0], width: 0.016 }, style: 'blade' };
}

export function buildDagger(B) {
  const { P } = B;
  const L = 0.27, base = 0.068;
  pommel(B, -0.072, 0.014, 'ring');
  wrappedGrip(B, -0.062, 0.058, 0.0135, P.leather, { ridges: 6, swell: 0.18 });
  crossguard(B, 0.063, 0.055, 0.011, 0.018, 'down');
  gem(B, [0, 0.064, 0.012], 0.007);
  B.add(loftBlade({
    length: L, y0: base, steps: B.seg(18), section: 'diamond',
    profile: [{ t: 0, w: 0.019, th: 0.006 }, { t: 0.3, w: 0.024, th: 0.0065 }, { t: 0.7, w: 0.016, th: 0.005 }, { t: 1, w: 0, th: 0.0005 }],
  }), P.blade, { role: 'blade' });
  return { length: base + L + 0.1, tip: [0, base + L, 0], axis: { from: [0, base + 0.02, 0], to: [0, base + L * 0.92, 0], width: 0.022 }, style: 'blade' };
}
