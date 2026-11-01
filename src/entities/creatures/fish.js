// Fish archetype: fish (piranha...), shark, whale (orca), dolphin. Swims with a skinned body wave.
import * as THREE from 'three';
import { basicMats, ell, mesh, pivot, eyes, coneGeo, shapeGeo, skinnedTube, teeth, shade, lerp } from './rig.js';

const num = (v, d) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : d);

export function buildFish(ctx) {
  const p = ctx.p;
  const v = ['shark', 'whale', 'dolphin', 'fish'].includes(p.variant) ? p.variant : 'fish';
  const { primary, secondary, accent } = ctx.c;
  const M = basicMats(ctx, 'skin');
  const L = 1; // natural length (normalised by height later)
  const prof = {
    fish: { r: (t) => 0.2 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 1.05)), 0.75) * (1 - 0.75 * Math.max(0, t - 0.7) / 0.3) + 0.012, sx: 0.5, sy: 1 },
    shark: { r: (t) => 0.11 * (t < 0.3 ? Math.pow(t / 0.3, 0.55) : 1 - 0.85 * Math.pow((t - 0.3) / 0.7, 1.3)) + 0.008, sx: 0.85, sy: 1 },
    whale: { r: (t) => 0.13 * (t < 0.2 ? Math.pow(t / 0.2, 0.45) : 1 - 0.88 * Math.pow((t - 0.2) / 0.8, 1.6)) + 0.008, sx: 1, sy: 0.88 },
    dolphin: { r: (t) => 0.1 * (t < 0.08 ? 0.35 + (t / 0.08) * 0.1 : t < 0.32 ? 0.45 + 0.55 * Math.sin(((t - 0.08) / 0.24) * Math.PI / 2) : 1 - 0.85 * Math.pow((t - 0.32) / 0.68, 1.4)) + 0.006, sx: 0.85, sy: 1 },
  }[v];
  const colorFn = (t, s) => {
    const k = THREE.MathUtils.smoothstep(-s, -0.15, 0.25);
    const c = new THREE.Color(primary).lerp(new THREE.Color(secondary), k);
    return c.getHex();
  };
  const bodyMat = ctx.mat({ vertexColors: true, map: M.body.map, roughness: v === 'fish' ? 0.35 : 0.45 });
  const finMat = ctx.mat({ color: v === 'fish' ? accent === 0x1b1b1b ? shade(primary, 0.1) : shade(primary, -0.1) : shade(primary, -0.08), roughness: 0.5, side: THREE.DoubleSide });
  const tube = skinnedTube(ctx, `fish:${v}:${primary}:${secondary}`, { length: L, bones: 7, rfn: prof.r, sx: prof.sx, sy: prof.sy, lenSeg: 26, radSeg: 14, colorFn }, bodyMat);
  const group = new THREE.Group();
  const swim = pivot(group);
  const holder = pivot(swim, 0, 0, L * 0.45);
  holder.rotation.y = Math.PI;
  holder.add(tube.mesh);
  const B = tube.bones;
  const head = B[0];
  const at = (t) => B[Math.min(B.length - 1, Math.round(t * (B.length - 1)))];
  const R = (t) => prof.r(t);

  // eyes & mouth
  let jaw = null;
  if (v === 'fish') {
    eyes(ctx, head, M, { x: R(0.15) * prof.sx * 0.85, y: R(0.15) * 0.25, z: 0.13, r: 0.045, yaw: Math.PI - 1.25, iris: 0xf2d060 });
    jaw = pivot(head, 0, -0.03, 0.03);
    ell(ctx, jaw, [0.035, 0.018, 0.04], ctx.mat({ color: shade(secondary, -0.1), roughness: 0.5 }), { pos: [0, 0, -0.01] });
    ell(ctx, head, [0.04, 0.022, 0.04], ctx.mat({ color: shade(primary, -0.1), roughness: 0.5 }), { pos: [0, 0.0, 0.02] });
    if (ctx.spec.species === 'piranha' || secondary === 0xd94a3a) teeth(ctx, jaw, M.claw, { n: 5, w: 0.04, y: 0.01, z: -0.04, size: 0.012, down: false });
  } else {
    const er = v === 'whale' ? 0.018 : v === 'shark' ? 0.016 : 0.022;
    eyes(ctx, head, M, { x: R(0.13) * prof.sx * 0.88, y: R(0.13) * 0.15, z: 0.13, r: er, yaw: Math.PI - 1.3, iris: null });
    jaw = pivot(head, 0, -R(0.1) * 0.45, 0.1);
    ell(ctx, jaw, [R(0.1) * prof.sx * 0.8, R(0.1) * 0.25, 0.1], ctx.mat({ color: secondary, roughness: 0.5 }), { pos: [0, -0.005, -0.06] });
    ell(ctx, jaw, [R(0.1) * prof.sx * 0.6, R(0.1) * 0.12, 0.08], M.mouth, { pos: [0, 0.015, -0.055], shadow: false });
    if (v === 'shark') {
      teeth(ctx, head, M.claw, { n: 7, w: R(0.08) * 1.2, y: -R(0.1) * 0.42, z: 0.045, size: 0.012 });
      for (let i = 0; i < 4; i++) for (const sd of [-1, 1]) ell(ctx, B[1], [0.004, 0.035, 0.008], ctx.mat({ color: shade(primary, -0.35) }), { pos: [sd * R(0.22) * prof.sx * 0.98, 0, -0.02 + i * 0.018], rot: [0.2, 0, 0], small: true });
    }
    if (v === 'whale' && luminance(primary) < 0.15) {
      for (const sd of [-1, 1]) ell(ctx, head, [0.01, 0.025, 0.05], ctx.mat({ color: accent, roughness: 0.5 }), { pos: [sd * R(0.16) * 0.97, R(0.16) * 0.35, 0.17], rot: [0, 0, 0] });
    }
    if (v === 'whale') ell(ctx, B[1], [0.012, 0.006, 0.02], M.dark, { pos: [0, R(0.25) * prof.sy * 0.99, 0.0], small: true });
  }
  // fins
  const vFin = (key, pts) => shapeGeo(ctx, key, pts, 0.012, 0.006);
  const dorsal = {
    fish: [[0, 0], [0.05, 0.11], [0.2, 0.12], [0.3, 0.02]],
    shark: [[0, 0], [0.07, 0.12], [0.1, 0.14], [0.1, 0.1], [0.14, 0]],
    whale: [[0, 0], [0.04, 0.03], [0.06, 0.035], [0.08, 0]],
    dolphin: [[0, 0], [0.05, 0.07], [0.09, 0.09], [0.075, 0.05], [0.11, 0]],
  }[v];
  if (ctx.spec.species === 'orca' || (v === 'whale' && luminance(primary) < 0.15)) dorsal.splice(0, dorsal.length, [0, 0], [0.03, 0.14], [0.05, 0.16], [0.08, 0]);
  const dz = v === 'fish' ? 0.3 : v === 'whale' ? 0.62 : 0.4;
  mesh(ctx, at(dz), vFin(`dorsal:${v}:${dorsal.length}`, dorsal), finMat, { pos: [0, R(dz) * prof.sy * 0.85, -0.04], rot: [0, -Math.PI / 2, 0] });
  const tail = B[B.length - 1];
  if (v === 'fish' || v === 'shark') {
    const tf = v === 'fish' ? [[0, 0], [0.12, 0.13], [0.17, 0.14], [0.11, 0], [0.17, -0.14], [0.12, -0.13]] : [[0, 0], [0.12, 0.18], [0.15, 0.19], [0.08, 0.0], [0.1, -0.1], [0.08, -0.09]];
    mesh(ctx, tail, vFin(`tailv:${v}`, tf), finMat, { pos: [0, 0, -0.03], rot: [0, -Math.PI / 2, 0] });
    if (v === 'fish') mesh(ctx, B[4], vFin('anal', [[0, 0], [0.04, -0.07], [0.12, -0.06], [0.14, 0]]), finMat, { pos: [0, -R(0.6) * 0.85, 0], rot: [0, -Math.PI / 2, 0] });
  } else {
    const fl = [[0, -0.02], [0.08, 0.04], [0.17, 0.11], [0.14, 0.13], [0.05, 0.09], [0, 0.11], [-0.05, 0.09], [-0.14, 0.13], [-0.17, 0.11], [-0.08, 0.04]];
    mesh(ctx, tail, vFin('fluke', fl), finMat, { pos: [0, 0, -0.03], rot: [Math.PI / 2, 0, 0] });
  }
  const pecs = [];
  for (const sd of [-1, 1]) {
    const pz = v === 'fish' ? 0.32 : 0.28;
    const pv = pivot(at(pz), sd * R(pz) * prof.sx * 0.8, -R(pz) * prof.sy * 0.45, 0);
    const pts = v === 'fish' ? [[0, 0], [0.06, 0.03], [0.1, 0.09], [0.04, 0.07]] : v === 'shark' ? [[0, 0], [0.09, 0.07], [0.12, 0.13], [0.05, 0.06]] : [[0, 0], [0.06, 0.05], [0.09, 0.1], [0.03, 0.06]];
    mesh(ctx, pv, vFin(`pec:${v}:${sd}`, pts.map(([x, y]) => [x * sd, y])), finMat, { rot: [Math.PI / 2, 0, -sd * 0.5] });
    pecs.push(pv);
  }
  ctx.anchors.back = [0.25, 0.45, 0.6].map((t) => ({ parent: at(t), pos: [0, R(t) * prof.sy * 0.9, 0], s: R(0.3) * 0.35 }));
  ctx.anchors.mouth = { parent: head, pos: [0, -0.01, 0.0], s: 0.02 };
  ctx.anchors.head = { parent: head, pos: [0, R(0.2) * 2.2, 0.12], s: R(0.2) * 0.8 };

  const horizontal = v === 'whale' || v === 'dolphin';
  function animate(s) {
    const mv = s.move, t = s.t;
    const f = 1.4 + mv * 2.2 + s.run * 2;
    const amp = 0.07 + mv * 0.1 + s.run * 0.06;
    B.forEach((b, i) => {
      const w = Math.sin(t * f * 3 - i * 0.75) * amp * (0.2 + i / B.length);
      if (horizontal) {
        b.rotation.x = w;
        b.rotation.y = 0;
      } else {
        b.rotation.y = w;
        b.rotation.x = 0;
      }
    });
    B[0].rotation.y = horizontal ? 0 : Math.sin(t * f * 3 + 0.6) * amp * 0.25;
    swim.position.y = Math.sin(t * 1.3) * 0.02;
    swim.position.z = s.strike * 0.18 - s.wind * 0.05;
    swim.rotation.x = horizontal ? Math.sin(t * f * 3) * 0.03 * (1 + mv) : 0;
    if (jaw) jaw.rotation.x = -(0.05 + s.wind * 0.55 + (s.atk < 0 ? Math.max(0, Math.sin(t * 2)) * 0.12 : 0));
    pecs.forEach((pv, i) => (pv.rotation.z = Math.sin(t * 3 + i * Math.PI) * 0.25));
  }
  return { group, flying: true, stride: 1, animate, center: new THREE.Vector3(0, 0, 0) };
}

function luminance(c) {
  const col = new THREE.Color(c);
  return 0.3 * col.r + 0.59 * col.g + 0.11 * col.b;
}
