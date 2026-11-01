// Serpent archetype: snake with raised front (cobra pose), slithering skinned body; hydra (heads > 1); worm.
import * as THREE from 'three';
import { basicMats, ell, mesh, pivot, eyes, coneGeo, tubeGeo, shapeGeo, skinnedTube, shade, clamp } from './rig.js';

const num = (v, d) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : d);

function snakeHead(ctx, parent, M, r, mats) {
  const head = pivot(parent);
  ell(ctx, head, [r * 1.25, r * 0.75, r * 1.7], mats.top, { pos: [0, r * 0.1, r * 0.9], n: 14 });
  ell(ctx, head, [r * 1.05, r * 0.4, r * 1.4], mats.belly, { pos: [0, -r * 0.2, r * 1.0] });
  for (const sd of [-1, 1]) ell(ctx, head, [r * 0.42, r * 0.18, r * 0.55], mats.top, { pos: [sd * r * 0.55, r * 0.62, r * 1.15] });
  eyes(ctx, head, M, { x: r * 0.72, y: r * 0.45, z: r * 1.45, r: r * 0.28, yaw: 0.9, iris: 0xf2d040, slit: true });
  for (const sd of [-1, 1]) ell(ctx, head, [r * 0.06, r * 0.04, r * 0.04], M.dark, { pos: [sd * r * 0.3, r * 0.35, r * 2.45], small: true });
  const jaw = pivot(head, 0, -r * 0.25, r * 0.3);
  ell(ctx, jaw, [r * 0.95, r * 0.25, r * 1.35], mats.belly, { pos: [0, -r * 0.08, r * 0.8] });
  ell(ctx, jaw, [r * 0.75, r * 0.1, r * 1.1], M.mouth, { pos: [0, r * 0.12, r * 0.85], shadow: false });
  for (const sd of [-1, 1]) mesh(ctx, head, coneGeo(ctx, 5), M.claw, { pos: [sd * r * 0.45, -r * 0.25, r * 2.0], rot: [Math.PI, 0, 0], scale: [r * 0.08, r * 0.4, r * 0.08], small: true });
  const tongue = pivot(head, 0, -r * 0.18, r * 2.3);
  const tg = tubeGeo(ctx, 'tongue', [[0, 0, 0], [0, 0, 0.5], [0, 0, 1]], () => 0.06, 4, 4);
  const tm = ctx.mat({ color: 0xd8304a, roughness: 0.4 });
  mesh(ctx, tongue, tg, tm, { scale: [r, r, r * 0.9], small: true });
  for (const sd of [-1, 1]) mesh(ctx, tongue, tg, tm, { pos: [0, 0, r * 0.85], rot: [0, sd * 0.4, 0], scale: [r, r, r * 0.35], small: true });
  return { head, jaw, tongue };
}

export function buildSerpent(ctx) {
  const p = ctx.p;
  const { primary, secondary, accent } = ctx.c;
  const M = basicMats(ctx, 'scales');
  const heads = clamp(Math.round(num(p.heads, 1)), 1, 5);
  const len = num(p.length, 8);
  const nb = clamp(Math.round(num(p.segments, 16)), 8, 24);
  const r = len * 0.028;
  const worm = ctx.elementId === 'earth' && heads === 1 && ctx.spec.species !== 'serpent';
  const colorFn = (t, s) => {
    const c = new THREE.Color(primary);
    const belly = THREE.MathUtils.smoothstep(-s, 0.1, 0.5);
    if (worm) {
      if (Math.sin(t * 90) > 0.7) c.lerp(new THREE.Color(secondary), 0.6);
      return c.getHex();
    }
    if (s > 0.15 && Math.sin(t * 46) > 0.35) c.lerp(new THREE.Color(accent), 0.75);
    return c.lerp(new THREE.Color(secondary), belly).getHex();
  };
  const bodyMat = ctx.mat({ vertexColors: true, map: M.body.map, roughness: 0.45 });
  const mats = { top: ctx.mat({ color: primary, map: M.body.map, roughness: 0.45 }), belly: ctx.mat({ color: secondary, map: M.body.map, roughness: 0.5 }) };
  const group = new THREE.Group();
  const heads3 = [];
  let body, raiseBones = 0;
  if (heads === 1) {
    const rf = (t) => r * (t < 0.04 ? 0.75 + t * 5 : 1 - 0.85 * Math.pow(Math.max(0, t - 0.45) / 0.55, 1.4)) + 0.01;
    body = skinnedTube(ctx, `snake:${len}:${nb}:${primary}:${secondary}:${accent}:${worm}`, { length: len, bones: nb, rfn: rf, lenSeg: nb * 3, radSeg: 12, colorFn }, bodyMat);
    raiseBones = worm ? 4 : 5;
    const holder = pivot(group, 0, 0, 0);
    holder.rotation.y = Math.PI;
    holder.add(body.mesh);
    const h = snakeHead(ctx, body.bones[0], M, r * (worm ? 0.9 : 1.15), worm ? { top: mats.top, belly: mats.top } : mats);
    h.head.rotation.y = Math.PI;
    heads3.push(h);
    if (p.hood) mesh(ctx, body.bones[1], shapeGeo(ctx, 'hood', [[-1, 0], [-0.8, 0.8], [0, 1.1], [0.8, 0.8], [1, 0], [0, -0.4]], 0.05, 0.03), mats.top, { scale: r * 2.2, rot: [0, 0, 0] });
  } else {
    const blen = len * 0.55;
    const rf = (t) => r * 1.35 * (t < 0.05 ? 0.8 + t * 4 : 1 - 0.85 * Math.pow(Math.max(0, t - 0.3) / 0.7, 1.3)) + 0.01;
    body = skinnedTube(ctx, `hydra:${len}:${primary}:${secondary}:${accent}`, { length: blen, bones: 10, rfn: rf, lenSeg: 30, radSeg: 12, colorFn }, bodyMat);
    const holder = pivot(group, 0, r * 1.2, 0);
    holder.rotation.y = Math.PI;
    holder.add(body.mesh);
    ell(ctx, body.bones[0], [r * 1.5, r * 1.4, r * 1.6], mats.top, { pos: [0, 0, r * 0.3] });
    const nlen = len * 0.42;
    for (let k = 0; k < heads; k++) {
      const off = heads === 1 ? 0 : k / (heads - 1) - 0.5;
      const root = pivot(group, off * r * 2.4, r * 1.6, r * 0.6);
      root.rotation.z = -off * 0.8;
      const neck = skinnedTube(ctx, `hneck:${len}:${primary}:${secondary}:${accent}`, { length: nlen, bones: 6, rfn: (t) => r * (1.1 - t * 0.35), lenSeg: 16, radSeg: 10, colorFn }, bodyMat);
      const nh = pivot(root);
      nh.rotation.x = -Math.PI / 2 + 0.25;
      nh.add(neck.mesh);
      const h = snakeHead(ctx, neck.bones[5], M, r * 1.25, mats);
      h.neck = neck;
      h.lean = 0.25;
      h.k = k;
      heads3.push(h);
    }
  }
  const B = body.bones;
  const seg = (heads === 1 ? len : len * 0.55) / (B.length - 1);
  // element anchors along the back
  for (let i = 2; i < B.length - 2; i += 3) ctx.anchors.back.push({ parent: B[i], pos: [0, r * 0.9, 0], s: r * 0.6 });
  const h0 = heads3[0];
  ctx.anchors.mouth = { parent: h0.head, pos: [0, -r * 0.1, r * 2.2], s: r * 0.4 };
  ctx.anchors.head = { parent: h0.head, pos: [0, r * 2.2, r * 1.0], s: r * 1.4 };

  function animate(s) {
    const t = s.t, mv = s.move;
    const f = 1.2 + mv * 2.5 + s.run * 2;
    const amp = 0.18 + mv * 0.25;
    // raise profile (single head) + slither wave on the ground part
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      let rx = 0;
      if (heads === 1 && i >= 1 && i <= raiseBones * 2) {
        const up = i <= raiseBones ? 1 : -1;
        rx = (worm ? 0.28 : 0.34) * up * (1 - mv * 0.35) + (i === 1 ? s.wind * -0.25 + s.strike * 0.35 : 0);
      }
      b.rotation.x = rx;
      const ground = heads > 1 || i > raiseBones;
      const wave = Math.sin(t * f - i * 0.55);
      b.rotation.y = ground ? wave * amp * (i === raiseBones + 1 ? 0.5 : 1) : Math.sin(t * 1.4 - i * 0.6) * 0.08;
    }
    if (heads === 1) {
      const h = heads3[0];
      h.head.rotation.x = -s.strike * 0.2 + Math.sin(t * 1.1) * 0.04;
      h.jaw.rotation.x = s.wind * 0.9 + (s.atk < 0 ? 0 : 0);
      group.position.z = s.strike * seg * 1.2;
    } else {
      heads3.forEach((h) => {
        const nb2 = h.neck.bones;
        let sum = h.lean;
        nb2.forEach((b, i) => {
          b.rotation.x = i === 0 ? 0 : 0.12 + Math.sin(t * 1.3 + h.k * 2 - i * 0.5) * 0.06 + (i > 2 ? s.wind * -0.15 + s.strike * 0.2 : 0);
          b.rotation.y = Math.sin(t * 0.9 + h.k * 1.7 - i * 0.4) * 0.06;
          sum += b.rotation.x;
        });
        h.head.rotation.x = Math.PI / 2 - sum + 0.1;
        h.jaw.rotation.x = Math.max(s.wind, Math.max(0, Math.sin(t * 0.8 + h.k * 2.1)) ** 6 * 0.4) * 0.9;
      });
    }
    // tongue flick
    heads3.forEach((h, k) => {
      const fl = Math.sin(t * 1.7 + k * 1.3);
      h.tongue.scale.setScalar(fl > 0.6 ? 1 : 0.001);
      h.tongue.rotation.x = Math.sin(t * 30) * 0.15;
    });
  }
  return { group, flying: false, stride: len * 0.25, animate };
}
