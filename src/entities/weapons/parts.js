// Peças reutilizáveis: cabo envolto, pomo, guarda, gema engastada, anéis.
import * as THREE from 'three';
import { lathe, extrude, mirroredShape } from './geometry.js';

/** Contexto de construção. */
export function makeBuilder(P, quality, group) {
  const detail = quality?.detail ?? 2;
  const B = {
    P, detail, group,
    seg: (n) => Math.max(5, Math.round(n * (detail === 0 ? 0.55 : detail === 1 ? 0.8 : 1))),
    add(geo, mat, o = {}) {
      const m = new THREE.Mesh(geo, mat);
      if (o.pos) m.position.set(o.pos[0], o.pos[1], o.pos[2]);
      if (o.rot) m.rotation.set(o.rot[0], o.rot[1], o.rot[2], o.order || 'XYZ');
      if (o.scale != null) { if (Array.isArray(o.scale)) m.scale.set(...o.scale); else m.scale.setScalar(o.scale); }
      m.castShadow = o.shadow !== false && detail > 0;
      m.receiveShadow = false;
      m.userData.role = o.role || 'part';
      (o.parent || group).add(m);
      return m;
    },
    /** Só adiciona em detalhe >= minDetail (peças pequenas) */
    small(minDetail, fn) { if (detail >= minDetail) fn(); },
  };
  return B;
}

/** Cabo com envoltório (cristas helicoidais simuladas pelo perfil). */
export function wrappedGrip(B, y0, y1, r, mat, { ridges = 9, swell = 0.12, oval = 1 } = {}) {
  const pts = [];
  const n = ridges * 4;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bulge = 1 + swell * Math.sin(t * Math.PI);
    const ridge = 1 + 0.07 * Math.abs(Math.sin(t * ridges * Math.PI));
    pts.push([r * bulge * ridge, y0 + (y1 - y0) * t]);
  }
  pts.unshift([0, y0]); pts.push([0, y1]);
  const m = B.add(lathe(pts, B.seg(14)), mat, { role: 'grip' });
  if (oval !== 1) m.scale.set(1, 1, oval);
  return m;
}

/** Anel/colar torneado. */
export function band(B, y, r, h, mat, { bevel = 0.3, role = 'metal' } = {}) {
  const b = h * bevel;
  return B.add(lathe([[0, y - h / 2], [r - b * 0.5, y - h / 2], [r, y - h / 2 + b], [r, y + h / 2 - b], [r - b * 0.5, y + h / 2], [0, y + h / 2]], B.seg(18)), mat, { role });
}

/** Gema facetada com engaste. */
export function gem(B, pos, r, { axis = 'z', bezel = true, mat } = {}) {
  const g = new THREE.OctahedronGeometry(r, 0);
  g.scale(1, 1.25, 0.6);
  const rot = axis === 'z' ? [0, 0, 0] : axis === 'x' ? [0, Math.PI / 2, 0] : [Math.PI / 2, 0, 0];
  const m = B.add(g, mat || B.P.gem, { pos, rot, role: 'gem', shadow: false });
  if (bezel && B.detail > 0) {
    const t = new THREE.TorusGeometry(r * 0.95, r * 0.18, 6, B.seg(16));
    t.scale(1, 1.25, 1);
    B.add(t, B.P.accent, { pos, rot, role: 'metal', shadow: false });
  }
  return m;
}

/** Pomo. style: 'round' | 'disc' | 'faceted' | 'ring' | 'spike' | 'cap' */
export function pommel(B, y, r, style = 'round', mat = B.P.accent) {
  switch (style) {
    case 'disc': {
      B.add(lathe([[0, y - r * 0.7], [r * 0.5, y - r * 0.7], [r, y - r * 0.3], [r, y + r * 0.3], [r * 0.5, y + r * 0.6], [r * 0.35, y + r]], B.seg(20)), mat, { role: 'metal', scale: [1, 1, 0.55] });
      if (B.detail > 0) gem(B, [0, y, r * 0.55 * 0.62], r * 0.35);
      break;
    }
    case 'faceted': {
      B.add(lathe([[0, y - r * 1.2], [r * 0.6, y - r * 1.0], [r, y - r * 0.2], [r * 0.8, y + r * 0.6], [r * 0.4, y + r * 1.1]], 8), mat, { role: 'metal' });
      break;
    }
    case 'ring': {
      B.add(new THREE.TorusGeometry(r, r * 0.25, 8, B.seg(22)), mat, { pos: [0, y - r, 0], role: 'metal' });
      B.add(lathe([[0, y - r * 0.1], [r * 0.3, y - r * 0.1], [r * 0.4, y + r * 0.3], [0, y + r * 0.4]], B.seg(10)), mat, { role: 'metal' });
      break;
    }
    case 'spike': {
      B.add(lathe([[0, y - r * 2.2], [r * 0.25, y - r * 1.4], [r * 0.9, y - r * 0.4], [r, y], [r * 0.6, y + r * 0.5], [0, y + r * 0.6]], B.seg(12)), mat, { role: 'metal' });
      break;
    }
    case 'cap': {
      B.add(lathe([[0, y - r * 0.5], [r * 0.85, y - r * 0.5], [r, y - r * 0.1], [r, y + r * 0.4], [0, y + r * 0.4]], B.seg(16)), mat, { role: 'metal' });
      break;
    }
    default: {
      const pts = [];
      for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI; pts.push([Math.cos(a) * r, y + Math.sin(a) * r * 0.9]); }
      pts.push([r * 0.4, y + r * 1.05]);
      pts.push([0, y + r * 1.05]);
      B.add(lathe(pts, B.seg(18)), mat, { role: 'metal' });
      if (B.P.ornate) {
        gem(B, [0, y, r * 0.88], r * 0.38);
        gem(B, [0, y, -r * 0.88], r * 0.38);
      }
    }
  }
}

/**
 * Guarda transversal extrudada (plano XY, espessura em Z).
 * style: 'arc' (pontas para cima), 'down' (pontas para baixo), 'wing' (angular), 'straight'
 */
export function crossguard(B, y, half, h, depth, style = 'arc', mat = B.P.accent) {
  let right;
  if (style === 'down') {
    right = [[0, -h * 0.6], [half * 0.5, -h * 0.55], [half * 0.85, -h * 1.1], [half, -h * 1.8], [half * 1.02, -h * 1.0], [half * 0.85, -h * 0.2], [half * 0.5, h * 0.35], [half * 0.18, h * 0.5], [0, h * 0.9]];
  } else if (style === 'wing') {
    right = [[0, -h * 0.9], [half * 0.25, -h * 0.5], [half * 0.7, -h * 0.4], [half, -h * 1.4], [half * 0.92, h * 0.1], [half * 0.98, h * 1.2], [half * 0.6, h * 0.45], [half * 0.22, h * 0.7], [0, h * 1.3]];
  } else if (style === 'straight') {
    right = [[0, -h * 0.5], [half * 0.9, -h * 0.4], [half, -h * 0.15], [half, h * 0.15], [half * 0.9, h * 0.4], [0, h * 0.5]];
  } else {
    right = [[0, -h * 0.7], [half * 0.45, -h * 0.55], [half * 0.82, -h * 0.15], [half * 0.98, h * 0.6], [half, h * 1.3], [half * 0.88, h * 0.95], [half * 0.72, h * 0.35], [half * 0.4, h * 0.25], [half * 0.15, h * 0.55], [0, h * 0.8]];
  }
  const shape = mirroredShape(right);
  const m = B.add(extrude(shape, depth, { bevel: Math.min(depth, h) * 0.25, bevelSeg: 2 }), mat, { pos: [0, y, 0], role: 'guard' });
  // pontas arredondadas (remates)
  if (B.detail > 0 && style !== 'straight') {
    const tip = right.reduce((a, b) => (Math.abs(b[1]) > Math.abs(a[1]) && b[0] > half * 0.8 ? b : a), right[0]);
    for (const s of [-1, 1]) B.add(new THREE.SphereGeometry(depth * 0.55, 10, 8), mat, { pos: [s * tip[0], y + tip[1], 0], role: 'metal', shadow: false });
  }
  return m;
}
