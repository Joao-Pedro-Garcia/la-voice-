// Rig + geometry helpers shared by every creature archetype.
import * as THREE from 'three';
import { getGeometry, getMaterial } from './materials.js';
import { noiseTexture } from './textures.js';
import { ELEMENTS } from '../../../shared/elements.js';

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const smooth = (t) => t * t * (3 - 2 * t);
const r3 = (v) => Math.round(v * 1000) / 1000;

function toHex(c, fallback) {
  if (c == null) return fallback;
  try {
    return new THREE.Color(c).getHex();
  } catch {
    return fallback;
  }
}

export function shade(hex, k) {
  const c = new THREE.Color(hex);
  if (k >= 0) c.lerp(new THREE.Color(0xffffff), k);
  else c.multiplyScalar(1 + k);
  return c.getHex();
}

export function createCtx(spec, quality) {
  const detail = clamp(Math.round(quality?.detail ?? 2), 0, 2);
  const colors = spec.colors || {};
  const ctx = {
    spec,
    p: spec.params || {},
    c: {
      primary: toHex(colors.primary, 0x888888),
      secondary: toHex(colors.secondary, 0xcccccc),
      accent: toHex(colors.accent, 0x222222),
    },
    detail,
    texSize: detail === 0 ? 128 : 256,
    element: (spec.element && ELEMENTS[spec.element]) || null,
    elementId: spec.element && ELEMENTS[spec.element] ? spec.element : null,
    small: [],
    eyes: [],
    anchors: { back: [], mouth: null, head: null },
    disposables: [],
    segs(n) {
      return Math.max(3, Math.round(n * [0.55, 0.75, 1][detail]));
    },
    mat(opts) {
      return getMaterial(opts);
    },
    // accent parts get a subtle element-themed emissive tint
    accentMat(color, opts = {}) {
      const el = ctx.element;
      return getMaterial({ color, roughness: 0.5, ...opts, ...(el ? { emissive: el.color, emissiveIntensity: 0.35 } : {}) });
    },
  };
  return ctx;
}

// Standard palette used by most builders.
export function basicMats(ctx, noise = 'fur') {
  const map = noiseTexture(noise, ctx.texSize >= 256 ? 128 : 64);
  const glowEye = ctx.elementId && ['shadow', 'lightning', 'arcane', 'fire'].includes(ctx.elementId);
  return {
    body: ctx.mat({ color: ctx.c.primary, map, roughness: 0.8 }),
    belly: ctx.mat({ color: ctx.c.secondary, map, roughness: 0.85 }),
    accent: ctx.accentMat(ctx.c.accent),
    dark: ctx.mat({ color: 0x1d1a1a, roughness: 0.5 }),
    eyeWhite: ctx.mat({ color: 0xffffff, roughness: 0.2 }),
    pupil: glowEye
      ? ctx.mat({ color: 0x111111, emissive: ctx.element.glow, emissiveIntensity: 0.9, roughness: 0.2 })
      : ctx.mat({ color: 0x141218, roughness: 0.12 }),
    highlight: ctx.mat({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.8 }),
    claw: ctx.mat({ color: 0xf2ead8, roughness: 0.4 }),
    nose: ctx.mat({ color: 0x2a2224, roughness: 0.35 }),
    pink: ctx.mat({ color: 0xe88a9a, roughness: 0.6 }),
    mouth: ctx.mat({ color: 0x5a1f28, roughness: 0.6 }),
  };
}

// ---------- geometry ----------
export function sphereGeo(ctx, n = 16) {
  const w = ctx.segs(n);
  const h = Math.max(3, Math.round(w * 0.7));
  return getGeometry(`sph:${w}:${h}`, () => new THREE.SphereGeometry(1, w, h));
}

// Sphere rotated so its poles are on Z (body/coat UV convention: v along the spine).
export function bodyGeo(ctx, n = 18) {
  const w = ctx.segs(n);
  const h = Math.max(4, Math.round(w * 0.7));
  return getGeometry(`bsph:${w}:${h}`, () => new THREE.SphereGeometry(1, w, h).rotateX(Math.PI / 2));
}

export function coneGeo(ctx, n = 10) {
  const w = ctx.segs(n);
  return getGeometry(`cone:${w}`, () => new THREE.ConeGeometry(1, 1, w, 1).translate(0, 0.5, 0));
}

export function cylGeo(ctx, n = 12, rTop = 1) {
  const w = ctx.segs(n);
  return getGeometry(`cyl:${w}:${rTop}`, () => new THREE.CylinderGeometry(rTop, 1, 1, w, 1).translate(0, 0.5, 0));
}

export function torusGeo(ctx, tube = 0.15, n = 16) {
  const w = ctx.segs(n);
  return getGeometry(`tor:${tube}:${w}`, () => new THREE.TorusGeometry(1, tube, Math.max(3, Math.round(w / 3)), w));
}

export function rockGeo(ctx, seed = 1, n = 1) {
  const det = ctx.detail === 0 ? 0 : n;
  return getGeometry(`rock:${seed}:${det}`, () => {
    const g = new THREE.IcosahedronGeometry(1, det);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    const map = new Map();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const k = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      if (!map.has(k)) {
        const s = Math.sin(v.x * 12.9898 * seed + v.y * 78.233 + v.z * 37.719) * 43758.5453;
        map.set(k, 0.8 + (s - Math.floor(s)) * 0.35);
      }
      v.multiplyScalar(map.get(k));
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}

// Tapered capsule hanging from y=0 down to y=-len (pivot at top joint).
export function limbGeo(ctx, len, r0, r1, n = 9) {
  const w = ctx.segs(n);
  const key = `limb:${r3(len)}:${r3(r0)}:${r3(r1)}:${w}`;
  return getGeometry(key, () => {
    const pts = [];
    const cap = 3;
    for (let i = 0; i <= cap; i++) {
      const a = -Math.PI / 2 + (i / cap) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * r1 + 1e-4, -len + Math.sin(a) * r1));
    }
    for (let i = 0; i <= cap; i++) {
      const a = (i / cap) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.cos(a) * r0 + 1e-4, Math.sin(a) * r0));
    }
    return new THREE.LatheGeometry(pts, w);
  });
}

// Lathe around Y from a profile [[r, y], ...].
export function latheGeo(ctx, key, profile, n = 16) {
  const w = ctx.segs(n);
  return getGeometry(`lathe:${key}:${w}`, () => new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(Math.max(1e-4, r), y)), w));
}

// Tapered tube along a Catmull-Rom path. rfn(t) -> radius.
export function tubeGeo(ctx, key, points, rfn, tubSeg = 16, radSeg = 8) {
  const ts = ctx.segs(tubSeg), rs = Math.max(3, ctx.segs(radSeg));
  return getGeometry(`tube:${key}:${ts}:${rs}`, () => {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => (p.isVector3 ? p : new THREE.Vector3(...p))));
    const frames = curve.computeFrenetFrames(ts, false);
    const pos = [], nor = [], uv = [], idx = [];
    const P = new THREE.Vector3(), N = new THREE.Vector3();
    for (let i = 0; i <= ts; i++) {
      const t = i / ts;
      curve.getPointAt(t, P);
      const r = rfn(t);
      for (let j = 0; j <= rs; j++) {
        const a = (j / rs) * TAU;
        N.copy(frames.normals[i]).multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[i], Math.sin(a)).normalize();
        pos.push(P.x + N.x * r, P.y + N.y * r, P.z + N.z * r);
        nor.push(N.x, N.y, N.z);
        uv.push(j / rs, t);
      }
    }
    for (let i = 0; i < ts; i++) {
      for (let j = 0; j < rs; j++) {
        const a = i * (rs + 1) + j, b = a + rs + 1;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  });
}

// Flat-ish extruded shape (wings, fins, ears, frills). pts: [[x,y],...] in the XY plane.
export function shapeGeo(ctx, key, pts, depth = 0.04, bevel = 0.02, smoothPts = true) {
  const d = ctx.detail;
  return getGeometry(`shape:${key}:${d}`, () => {
    const shape = new THREE.Shape();
    if (smoothPts) {
      const curve = new THREE.SplineCurve(pts.map(([x, y]) => new THREE.Vector2(x, y)));
      const sp = curve.getPoints(pts.length * [2, 3, 5][d]);
      shape.setFromPoints(sp);
    } else shape.setFromPoints(pts.map(([x, y]) => new THREE.Vector2(x, y)));
    const g = new THREE.ExtrudeGeometry(shape, {
      depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: d === 0 ? 1 : 2, curveSegments: 4,
    });
    g.translate(0, 0, -depth / 2);
    g.computeVertexNormals();
    return g;
  });
}

// ---------- meshes ----------
export function mesh(ctx, parent, geo, mat, o = {}) {
  const m = new THREE.Mesh(geo, mat);
  if (o.pos) m.position.set(...o.pos);
  if (o.rot) m.rotation.set(...o.rot);
  if (o.scale != null) Array.isArray(o.scale) ? m.scale.set(...o.scale) : m.scale.setScalar(o.scale);
  m.castShadow = o.shadow !== false && !o.small;
  m.receiveShadow = false;
  m.userData.mainShadow = m.castShadow;
  if (o.small) ctx.small.push(m);
  parent.add(m);
  return m;
}

export function ell(ctx, parent, s, mat, o = {}) {
  return mesh(ctx, parent, o.body ? bodyGeo(ctx, o.n ?? 14) : sphereGeo(ctx, o.n ?? (o.small ? 7 : 10)), mat, { ...o, scale: s });
}

export function pivot(parent, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

// Pair of glossy cartoon eyes. Returns [left, right] groups (registered for blinking).
export function eyes(ctx, parent, M, { x, y, z, r, yaw = 0.35, iris = null, slit = false, pitch = 0 }) {
  const out = [];
  for (const side of [-1, 1]) {
    const g = pivot(parent, x * side, y, z);
    g.rotation.set(pitch, yaw * side, 0);
    const inner = pivot(g);
    mesh(ctx, inner, sphereGeo(ctx, 11), M.eyeWhite, { scale: r, shadow: false });
    if (iris != null) {
      const im = ctx.mat({ color: iris, roughness: 0.25 });
      mesh(ctx, inner, sphereGeo(ctx, 10), im, { pos: [0, 0, r * 0.52], scale: [r * 0.66, r * 0.66, r * 0.5], shadow: false });
      mesh(ctx, inner, sphereGeo(ctx, 8), M.pupil, { pos: [0, 0, r * 0.74], scale: slit ? [r * 0.12, r * 0.5, r * 0.3] : [r * 0.34, r * 0.34, r * 0.3], shadow: false });
    } else {
      mesh(ctx, inner, sphereGeo(ctx, 9), M.pupil, { pos: [0, 0, r * 0.5], scale: [r * 0.68, r * 0.72, r * 0.55], shadow: false });
    }
    mesh(ctx, inner, sphereGeo(ctx, 5), M.highlight, { pos: [r * 0.28 * side, r * 0.32, r * 0.92], scale: r * 0.17, small: true });
    ctx.eyes.push(inner);
    out.push(g);
  }
  return out;
}

// ---------- skinned tube (tails, serpents, fish bodies, tentacles) ----------
// Built along +Z from z=0 (t=0, root bone) to z=length (t=1).
// opts: { length, bones, rfn(t), sx, sy, yfn(t), lenSeg, radSeg, colorFn(t, s) -> hex (s: -1 belly .. 1 back) }
export function skinnedTube(ctx, key, opts, material) {
  const { length, bones: B = 8, rfn, sx = 1, sy = 1, yfn = null, colorFn = null } = opts;
  const L = ctx.segs(opts.lenSeg ?? 24), R = Math.max(4, ctx.segs(opts.radSeg ?? 12));
  const geo = getGeometry(`skt:${key}:${L}:${R}`, () => {
    const pos = [], col = [], uv = [], si = [], sw = [], idx = [];
    const rings = [];
    rings.push({ t: 0, r: 0 });
    for (let i = 0; i <= L; i++) rings.push({ t: i / L, r: rfn(i / L) });
    rings.push({ t: 1, r: 0 });
    const c = new THREE.Color();
    rings.forEach((ring, i) => {
      const z = ring.t * length;
      const yo = yfn ? yfn(ring.t) : 0;
      const f = ring.t * (B - 1);
      const b0 = Math.min(B - 2, Math.floor(f));
      const w = f - b0;
      for (let j = 0; j <= R; j++) {
        const a = (j / R) * TAU;
        const s = Math.sin(a);
        pos.push(Math.cos(a) * ring.r * sx, s * ring.r * sy + yo, z);
        uv.push(j / R, ring.t);
        if (colorFn) {
          c.setHex(colorFn(ring.t, s));
          col.push(c.r, c.g, c.b);
        }
        si.push(b0, b0 + 1, 0, 0);
        sw.push(1 - w, w, 0, 0);
      }
      if (i > 0) {
        for (let j = 0; j < R; j++) {
          const a = (i - 1) * (R + 1) + j, b = a + R + 1;
          idx.push(a, a + 1, b, b, a + 1, b + 1);
        }
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    if (colorFn) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  });
  const bones = [];
  for (let i = 0; i < B; i++) {
    const b = new THREE.Bone();
    if (i > 0) {
      b.position.z = length / (B - 1);
      bones[i - 1].add(b);
    }
    bones.push(b);
  }
  const m = new THREE.SkinnedMesh(geo, material);
  m.add(bones[0]);
  m.bind(new THREE.Skeleton(bones));
  m.castShadow = true;
  m.userData.mainShadow = true;
  m.frustumCulled = false;
  ctx.disposables.push({ dispose: () => m.skeleton.dispose() });
  return { mesh: m, bones };
}

// Teeth row helper: small cones along an arc.
export function teeth(ctx, parent, mat, { n = 6, w = 0.2, y = 0, z = 0, size = 0.03, down = true }) {
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : -w / 2 + (w * i) / (n - 1);
    const zz = z - Math.abs(x) * 0.6;
    mesh(ctx, parent, coneGeo(ctx, 5), mat, { pos: [x, y, zz], rot: [down ? Math.PI : 0, 0, 0], scale: [size * 0.6, size * 1.5, size * 0.6], small: true });
  }
}

// Gait helpers ---------------------------------------------------------
// Swing angle (forward/back) and lift for a leg with phase p (radians).
export function legSwing(p) {
  return Math.sin(p);
}
export function legLift(p) {
  return Math.max(0, Math.cos(p));
}
