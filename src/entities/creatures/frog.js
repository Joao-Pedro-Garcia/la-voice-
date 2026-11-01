// Frog / toad (quadruped params.frog): squat body, bulging eyes, folded hind legs, hopping gait.
import * as THREE from 'three';
import { basicMats, ell, mesh, pivot, eyes, limbGeo, torusGeo, shade } from './rig.js';
import { getGeometry } from './materials.js';

export function buildFrog(ctx) {
  const { primary, secondary } = ctx.c;
  const M = basicMats(ctx, 'skin');
  const skin = ctx.mat({ color: primary, map: M.body.map, roughness: 0.35 });
  const belly = ctx.mat({ color: secondary, map: M.body.map, roughness: 0.5 });
  const dark = ctx.mat({ color: shade(primary, -0.35), roughness: 0.4 });
  const group = new THREE.Group();
  const body = pivot(group, 0, 0.24, 0);
  const tilt = pivot(body);
  tilt.rotation.x = -0.3;
  ell(ctx, tilt, [0.3, 0.21, 0.34], skin, { body: true, n: 18 });
  ell(ctx, tilt, [0.25, 0.14, 0.28], belly, { pos: [0, -0.09, 0.03] });
  for (const [x, z, r] of [[0.12, -0.1, 0.05], [-0.15, 0.05, 0.04], [0.05, 0.15, 0.035], [-0.05, -0.2, 0.04]]) ell(ctx, tilt, [r, r * 0.4, r], dark, { pos: [x, 0.19, z], small: true });
  const head = pivot(tilt, 0, 0.06, 0.26);
  ell(ctx, head, [0.3, 0.16, 0.24], skin, { n: 16 });
  ell(ctx, head, [0.24, 0.08, 0.2], belly, { pos: [0, -0.08, 0.02] });
  const arc = getGeometry('frogMouth', () => new THREE.TorusGeometry(1, 0.03, 4, 18, Math.PI * 0.9).rotateZ(Math.PI * 1.05));
  mesh(ctx, head, arc, M.mouth, { pos: [0, -0.01, 0.0], rot: [Math.PI / 2 - 0.15, 0, 0], scale: [0.27, 0.22, 0.5], shadow: false });
  for (const sd of [-1, 1]) ell(ctx, head, [0.1, 0.1, 0.1], skin, { pos: [sd * 0.15, 0.12, 0.02] });
  eyes(ctx, head, M, { x: 0.15, y: 0.15, z: 0.06, r: 0.09, yaw: 0.45, iris: 0xe8c040 });
  const sac = ell(ctx, head, [0.15, 0.08, 0.12], belly, { pos: [0, -0.12, 0.06] });
  const front = [], hind = [];
  for (const sd of [-1, 1]) {
    const sh = pivot(body, sd * 0.2, -0.04, 0.17);
    const arm = pivot(sh);
    arm.rotation.set(0.2, 0, sd * 0.15);
    mesh(ctx, arm, limbGeo(ctx, 0.22, 0.05, 0.035), skin);
    for (const a of [-0.5, 0, 0.5]) ell(ctx, arm, [0.025, 0.015, 0.05], skin, { pos: [Math.sin(a) * 0.05, -0.22, Math.cos(a) * 0.05] });
    front.push(arm);
    const hip = pivot(body, sd * 0.22, -0.02, -0.18);
    const thigh = pivot(hip);
    ell(ctx, thigh, [0.1, 0.12, 0.2], skin, { pos: [sd * 0.04, -0.02, 0.05], rot: [0.5, 0, 0] });
    const shin = pivot(thigh, sd * 0.06, -0.08, 0.18);
    mesh(ctx, shin, limbGeo(ctx, 0.2, 0.05, 0.035), skin, { rot: [-2.3, 0, 0] });
    const foot = pivot(shin, 0, -0.12, -0.12);
    for (const a of [-0.4, 0, 0.4]) ell(ctx, foot, [0.03, 0.015, 0.11], skin, { pos: [Math.sin(a) * 0.08 + sd * 0.02, -0.03, 0.06 + Math.cos(a) * 0.04], rot: [0, a, 0] });
    hind.push({ thigh, shin, foot });
  }
  ctx.anchors.back.push(...[0.12, -0.05, -0.2].map((z) => ({ parent: tilt, pos: [0, 0.2, z], s: 0.07 })));
  ctx.anchors.mouth = { parent: head, pos: [0, -0.05, 0.22], s: 0.05 };
  ctx.anchors.head = { parent: head, pos: [0, 0.3, 0], s: 0.15 };
  function animate(s) {
    const hop = s.move > 0.05 ? Math.max(0, Math.sin(s.phase)) : 0;
    const strike = s.strike;
    body.position.y = 0.24 + hop * (0.35 + s.run * 0.25) * s.move + s.strike * 0.05;
    body.position.z = s.strike * 0.12;
    body.rotation.x = -hop * 0.35 * s.move - s.wind * 0.15;
    sac.scale.set(0.15 + Math.max(0, Math.sin(s.t * 3)) * 0.04 * (1 - s.move), 0.08 + Math.max(0, Math.sin(s.t * 3)) * 0.05 * (1 - s.move), 0.12);
    hind.forEach((h) => {
      const ext = hop * s.move;
      h.thigh.rotation.x = ext * 0.9;
      h.shin.rotation.x = ext * 1.4;
    });
    front.forEach((a) => (a.rotation.x = 0.2 - hop * 0.8 * s.move));
    head.rotation.x = -s.wind * 0.3 + strike * 0.2;
  }
  return { group, flying: false, stride: 0.9, animate };
}
