// Insect archetype: bee (also mosquito-like variants), butterfly, ladybug. Flying; origin at body centre.
import * as THREE from 'three';
import { basicMats, ell, mesh, pivot, eyes, limbGeo, coneGeo, tubeGeo, shapeGeo, shade } from './rig.js';
import { coatTexture, butterflyWingTexture } from './textures.js';

export function buildInsect(ctx) {
  const p = ctx.p;
  const v = ['bee', 'butterfly', 'ladybug'].includes(p.variant) ? p.variant : 'bee';
  const { primary, secondary, accent } = ctx.c;
  const M = basicMats(ctx, 'fur');
  const group = new THREE.Group();
  const body = pivot(group);
  const dark = ctx.mat({ color: v === 'ladybug' ? secondary : 0x1e1a18, roughness: 0.5 });
  const wings = [];
  let stinger = null;
  if (v === 'bee') {
    const stripes = coatTexture({ base: primary, mark: secondary, pattern: 'bands', noise: 'fur', size: 128, seed: 2, wrap: true });
    ell(ctx, body, [0.22, 0.2, 0.3], ctx.mat({ map: stripes, roughness: 0.85 }), { body: true, pos: [0, -0.02, -0.3], n: 16 });
    ell(ctx, body, [0.17, 0.16, 0.17], ctx.mat({ color: shade(primary, -0.1), map: M.body.map, roughness: 0.95 }), { pos: [0, 0.02, 0.05] });
    stinger = mesh(ctx, body, coneGeo(ctx, 6), dark, { pos: [0, -0.04, -0.58], rot: [-Math.PI / 2, 0, 0], scale: [0.03, 0.1, 0.03] });
  } else if (v === 'butterfly') {
    ell(ctx, body, [0.06, 0.06, 0.35], dark, { pos: [0, 0, -0.15] });
    ell(ctx, body, [0.08, 0.08, 0.1], dark, { pos: [0, 0, 0.12] });
  } else {
    const shell = ctx.mat({ color: primary, roughness: 0.2 });
    ell(ctx, body, [0.3, 0.2, 0.34], shell, { pos: [0, 0.05, -0.1], n: 18 });
    ell(ctx, body, [0.28, 0.1, 0.3], dark, { pos: [0, -0.05, -0.1] });
    mesh(ctx, body, limbGeo(ctx, 0.36, 0.008, 0.008, 4), dark, { pos: [0, 0.255, 0.22], rot: [Math.PI / 2 + 0.25, 0, 0] });
    for (const [x, z, r] of [[0.13, 0.05, 0.06], [0.16, -0.18, 0.055], [0.08, -0.32, 0.045], [0, 0.12, 0.05]]) for (const sd of x ? [-1, 1] : [1]) {
      ell(ctx, body, [r, r * 0.4, r], dark, { pos: [sd * x, 0.21 - Math.abs(z + 0.1) * 0.12 - x * 0.25, z], rot: [-(z + 0.1) * 0.6, 0, -sd * x * 3] });
    }
    ell(ctx, body, [0.1, 0.06, 0.04], ctx.mat({ color: 0xffffff }), { pos: [0, 0.04, 0.27], small: true });
  }
  const head = pivot(body, 0, v === 'ladybug' ? -0.02 : 0.02, v === 'butterfly' ? 0.25 : v === 'ladybug' ? 0.26 : 0.25);
  ell(ctx, head, [0.13, 0.12, 0.12], v === 'butterfly' || v === 'ladybug' ? dark : ctx.mat({ color: shade(secondary, 0.05), roughness: 0.6 }), { n: 12 });
  eyes(ctx, head, M, { x: 0.08, y: 0.03, z: 0.07, r: 0.065, yaw: 0.6 });
  const ants = [];
  for (const sd of [-1, 1]) {
    const an = pivot(head, sd * 0.04, 0.09, 0.06);
    mesh(ctx, an, tubeGeo(ctx, 'iant', [[0, 0, 0], [0, 0.12, 0.05], [0.03, 0.22, 0.12]], () => 0.01, 8, 4), dark, { scale: [sd, 1, 1] });
    ell(ctx, an, [0.025, 0.025, 0.025], v === 'butterfly' ? dark : dark, { pos: [sd * 0.03, 0.22, 0.12] });
    ants.push(an);
  }
  // wings
  if (v === 'butterfly') {
    const tex = butterflyWingTexture(primary, secondary, accent);
    const wm = ctx.mat({ map: tex, roughness: 0.6, side: THREE.DoubleSide });
    for (const sd of [-1, 1]) {
      const root = pivot(body, sd * 0.05, 0.05, 0.0);
      const fw = shapeGeo(ctx, `bfw:${sd}`, [[0, 0.05], [0.35 * sd, 0.4], [0.75 * sd, 0.55], [0.8 * sd, 0.2], [0.45 * sd, -0.05]], 0.01, 0);
      const hw = shapeGeo(ctx, `bhw:${sd}`, [[0, 0], [0.45 * sd, -0.05], [0.6 * sd, -0.35], [0.35 * sd, -0.55], [0.1 * sd, -0.3]], 0.01, 0);
      remapUV(fw, sd);
      remapUV(hw, sd);
      mesh(ctx, root, fw, wm, { rot: [-Math.PI / 2, 0, 0], scale: 0.9, shadow: true });
      mesh(ctx, root, hw, wm, { rot: [-Math.PI / 2, 0, 0], scale: 0.9 });
      wings.push({ root, sd });
    }
  } else {
    const wm = ctx.mat({ color: v === 'ladybug' ? 0xe8eef2 : accent === 0x111111 ? 0xe3f2fd : 0xe3f2fd, roughness: 0.1, transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false });
    for (const sd of [-1, 1]) {
      const root = pivot(body, sd * 0.1, v === 'ladybug' ? 0.15 : 0.15, v === 'ladybug' ? -0.05 : 0.02);
      ell(ctx, root, [0.3, 0.01, 0.12], wm, { pos: [sd * 0.28, 0, -0.08], rot: [0, sd * -0.35, 0], shadow: false });
      ell(ctx, root, [0.2, 0.01, 0.09], wm, { pos: [sd * 0.18, -0.01, -0.22], rot: [0, sd * -0.7, 0], shadow: false });
      wings.push({ root, sd });
    }
  }
  const legs = [];
  for (let i = 0; i < 3; i++) for (const sd of [-1, 1]) {
    const l = pivot(body, sd * 0.08, -0.1, 0.12 - i * 0.1);
    l.rotation.set(0.3 - i * 0.3, 0, sd * 0.7);
    mesh(ctx, l, limbGeo(ctx, 0.14, 0.014, 0.011, 5), dark);
    const k = pivot(l, 0, -0.14, 0);
    k.rotation.z = -sd * 1.1;
    mesh(ctx, k, limbGeo(ctx, 0.14, 0.011, 0.008, 5), dark);
    legs.push(l);
  }
  ctx.anchors.back = [{ parent: body, pos: [0, 0.2, -0.25], s: 0.06 }, { parent: body, pos: [0, 0.16, 0.05], s: 0.05 }];
  ctx.anchors.mouth = { parent: head, pos: [0, -0.05, 0.12], s: 0.03 };
  ctx.anchors.head = { parent: head, pos: [0, 0.32, 0], s: 0.12 };
  function animate(s) {
    const t = s.t, mv = s.move;
    if (v === 'butterfly') {
      const f = Math.sin(s.flap * 1.6);
      wings.forEach((w) => (w.root.rotation.z = w.sd * (0.2 + f * 0.95)));
      body.position.y = -f * 0.06;
    } else {
      const f = Math.sin(t * 60);
      wings.forEach((w) => (w.root.rotation.z = w.sd * (0.3 + f * 0.45)));
      body.position.y = Math.sin(t * 3) * 0.04;
    }
    body.rotation.x = mv * 0.25 - s.wind * 0.4 + s.strike * 0.6;
    body.position.z = s.strike * 0.25;
    if (stinger) stinger.position.z = -0.58 - s.strike * 0.05;
    ants.forEach((a, i) => (a.rotation.x = Math.sin(t * 2 + i) * 0.1));
    legs.forEach((l, i) => (l.rotation.x = 0.3 - Math.floor(i / 2) * 0.3 + Math.sin(t * 3 + i) * 0.08 + mv * 0.4));
  }
  return { group, flying: true, stride: 1, animate, center: new THREE.Vector3(0, 0, 0) };
}

// planar UVs for butterfly wings: u = |x| (distance from body), v from y
function remapUV(g, sd) {
  if (g.userData.uvDone) return;
  g.userData.uvDone = true;
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, Math.abs(pos.getX(i)) / 0.85, (pos.getY(i) + 0.6) / 1.2);
  uv.needsUpdate = true;
}
