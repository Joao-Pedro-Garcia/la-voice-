// Construtores de geometria para armas: lâminas por "loft", torneados, extrusões, tubos afunilados.
import * as THREE from 'three';

/**
 * Lâmina por loft de seção transversal ao longo de +Y.
 * profile: array de { t (0..1), w (meia-largura), th (meia-espessura), x (deslocamento lateral), f (fuller 0..1) }
 * section: 'double' | 'single' | 'diamond'
 */
export function loftBlade({ length, profile, section = 'double', steps = 24, y0 = 0 }) {
  const samples = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    let a = profile[0], b = profile[profile.length - 1];
    for (let k = 0; k < profile.length - 1; k++) if (t >= profile[k].t && t <= profile[k + 1].t) { a = profile[k]; b = profile[k + 1]; break; }
    const u = b.t > a.t ? (t - a.t) / (b.t - a.t) : 0;
    const lerp = (p, q) => p + (q - p) * u;
    samples.push({ y: y0 + t * length, w: lerp(a.w, b.w), th: lerp(a.th, b.th), x: lerp(a.x || 0, b.x || 0), f: lerp(a.f || 0, b.f || 0), t });
  }
  const sect = (s) => {
    const { w, th, f } = s;
    if (section === 'single') {
      return [[w, 0], [w * 0.25, th * 0.9], [-w * 0.9, th * 0.75], [-w, th * 0.35], [-w, -th * 0.35], [-w * 0.9, -th * 0.75], [w * 0.25, -th * 0.9]];
    }
    if (section === 'diamond') return [[w, 0], [w * 0.45, th * 0.7], [0, th], [-w * 0.45, th * 0.7], [-w, 0], [-w * 0.45, -th * 0.7], [0, -th], [w * 0.45, -th * 0.7]];
    const c = th * (1 - 0.6 * f);
    return [[w, 0], [w * 0.62, th * 0.62], [w * 0.28, th], [0, c], [-w * 0.28, th], [-w * 0.62, th * 0.62], [-w, 0],
      [-w * 0.62, -th * 0.62], [-w * 0.28, -th], [0, -c], [w * 0.28, -th], [w * 0.62, -th * 0.62]];
  };
  const maxW = Math.max(...samples.map((s) => s.w)) || 1;
  const pos = [], uv = [];
  const rings = samples.map((s) => sect(s).map(([x, z]) => [x + s.x, s.y, z, x / maxW * 0.5 + 0.5, s.t]));
  const quad = (a, b, c, d) => {
    for (const p of [a, b, c, a, c, d]) { pos.push(p[0], p[1], p[2]); uv.push(p[3], p[4]); }
  };
  for (let i = 0; i < rings.length - 1; i++) {
    const r0 = rings[i], r1 = rings[i + 1], n = r0.length;
    for (let j = 0; j < n; j++) {
      const j2 = (j + 1) % n;
      quad(r0[j], r1[j], r1[j2], r0[j2]);
    }
  }
  // tampa da base
  const r0 = rings[0];
  const cx = samples[0].x, cy = samples[0].y;
  for (let j = 0; j < r0.length; j++) {
    const a = r0[(j + 1) % r0.length], b = r0[j];
    pos.push(cx, cy, 0, b[0], b[1], b[2], a[0], a[1], a[2]);
    uv.push(0.5, 0, b[3], b[4], a[3], a[4]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

/** Torneado ao longo de +Y. pts: [[r, y], ...] */
export function lathe(pts, segs = 16) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(Math.max(0, r), y)), segs);
}

/** Extrusão de uma Shape (no plano XY) centralizada em Z, com UV planar normalizado. */
export function extrude(shape, depth, { bevel = 0.006, bevelSeg = 2, curveSeg = 16 } = {}) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevelSeg, curveSegments: curveSeg, steps: 1,
  });
  g.translate(0, 0, -depth / 2);
  planarUV(g);
  return g;
}

export function planarUV(g) {
  g.computeBoundingBox();
  const bb = g.boundingBox, pos = g.attributes.position;
  const w = bb.max.x - bb.min.x || 1, h = bb.max.y - bb.min.y || 1;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = (pos.getX(i) - bb.min.x) / w; uv[i * 2 + 1] = (pos.getY(i) - bb.min.y) / h; }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

/** Tubo com raio variável ao longo de uma curva. radius(t) */
export function taperedTube(curve, segments, radial, radius, closed = false) {
  const frames = curve.computeFrenetFrames(segments, closed);
  const pos = [], nor = [], uv = [], idx = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3();
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    curve.getPointAt(t, P);
    const r = radius(t);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const s = Math.sin(a), c = -Math.cos(a);
      N.set(0, 0, 0).addScaledVector(frames.normals[i], c).addScaledVector(frames.binormals[i], s).normalize();
      pos.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r);
      nor.push(N.x, N.y, N.z);
      uv.push(j / radial, t);
    }
  }
  for (let i = 0; i < segments; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

/** Shape a partir de lista de pontos (com curvas quadráticas opcionais: [x,y,'q',cx,cy]). */
export function shapeFrom(points) {
  const s = new THREE.Shape();
  points.forEach((p, i) => {
    if (i === 0) s.moveTo(p[0], p[1]);
    else if (p[2] === 'q') s.quadraticCurveTo(p[3], p[4], p[0], p[1]);
    else s.lineTo(p[0], p[1]);
  });
  s.closePath();
  return s;
}

/** Shape espelhada no eixo X a partir do lado direito (x >= 0), de baixo para cima. */
export function mirroredShape(right) {
  const pts = right.map((p) => [p[0], p[1]]);
  const left = right.slice().reverse().filter((p) => Math.abs(p[0]) > 1e-6).map((p) => [-p[0], p[1]]);
  return shapeFrom(pts.concat(left));
}
