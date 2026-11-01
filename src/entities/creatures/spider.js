// Spider archetype: spider, scorpion (params.scorpion), crab (params.crab), ant (params.ant).
import * as THREE from 'three';
import { basicMats, ell, mesh, pivot, eyes, limbGeo, sphereGeo, coneGeo, tubeGeo, shade, TAU } from './rig.js';
import { coatTexture } from './textures.js';

const num = (v, d) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : d);

function pincer(ctx, parent, mat, size) {
  const arm = pivot(parent);
  mesh(ctx, arm, limbGeo(ctx, size * 0.6, size * 0.13, size * 0.11), mat, { rot: [-Math.PI / 2, 0, 0] });
  const wrist = pivot(arm, 0, 0, size * 0.6);
  ell(ctx, wrist, [size * 0.24, size * 0.18, size * 0.34], mat, { pos: [0, 0, size * 0.25] });
  mesh(ctx, wrist, coneGeo(ctx, 7), mat, { pos: [size * 0.08, 0, size * 0.5], rot: [Math.PI / 2, 0, 0], scale: [size * 0.09, size * 0.38, size * 0.08] });
  const finger = pivot(wrist, -size * 0.1, 0, size * 0.45);
  mesh(ctx, finger, coneGeo(ctx, 7), mat, { rot: [Math.PI / 2, 0, 0], scale: [size * 0.08, size * 0.36, size * 0.07] });
  return { arm, finger };
}

export function buildSpider(ctx) {
  const p = ctx.p;
  const kind = p.scorpion ? 'scorpion' : p.crab ? 'crab' : p.ant ? 'ant' : 'spider';
  const { primary, secondary, accent } = ctx.c;
  const M = basicMats(ctx, kind === 'spider' ? 'fur' : 'skin');
  const shell = ctx.mat({ color: primary, map: M.body.map, roughness: kind === 'spider' ? 0.85 : 0.35 });
  const shell2 = ctx.mat({ color: secondary, map: M.body.map, roughness: kind === 'spider' ? 0.85 : 0.4 });
  const group = new THREE.Group();
  const span = num(p.legSpan, 3) / (ctx.spec.height || 1.2);
  const bodyH = kind === 'crab' ? 0.35 : kind === 'ant' ? 0.42 : 0.4;
  const body = pivot(group, 0, bodyH, 0);
  let head = body, fangs = [], claws = [], tail = null, jawParts = [];
  const nLegs = kind === 'crab' ? 6 : kind === 'ant' ? 6 : 8;
  let legZ0 = 0.18, legZ1 = -0.18, legR = 0.035, legLen = 0.38 * Math.min(1.6, span / 2.6);
  if (kind === 'spider') {
    ell(ctx, body, [0.22, 0.16, 0.25], shell, { pos: [0, 0, 0.12], n: 14 });
    const abd = coatTexture({ base: primary, mark: accent, pattern: 'spots', noise: 'fur', size: 128, seed: 4, wrap: true });
    const ab = ell(ctx, body, [0.36, 0.32, 0.42], ctx.mat({ map: abd, roughness: 0.8 }), { body: true, pos: [0, 0.12, -0.45], n: 16 });
    ab.rotation.x = -0.35;
    ell(ctx, body, [0.1, 0.14, 0.04], ctx.accentMat(accent), { pos: [0, 0.1, -0.86], rot: [0.5, 0, 0] });
    head = pivot(body, 0, 0.02, 0.3);
    eyes(ctx, head, M, { x: 0.06, y: 0.07, z: 0.06, r: 0.045, yaw: 0.2 });
    for (const [x, y] of [[0.13, 0.06], [0.03, 0.13], [0.12, 0.12]]) for (const sd of [-1, 1]) ell(ctx, head, [0.022, 0.022, 0.022], M.pupil, { pos: [sd * x, y, 0.02], small: true });
    for (const sd of [-1, 1]) {
      const f = pivot(head, sd * 0.06, -0.06, 0.06);
      ell(ctx, f, [0.045, 0.06, 0.045], shell2, { pos: [0, -0.02, 0] });
      if (p.fangs !== false) mesh(ctx, f, coneGeo(ctx, 6), ctx.accentMat(accent), { pos: [0, -0.07, 0.01], rot: [Math.PI + 0.3, 0, -sd * 0.2], scale: [0.02, 0.07, 0.02] });
      fangs.push(f);
      const palp = pivot(head, sd * 0.11, -0.03, 0.06);
      palp.rotation.set(-0.6, 0, sd * 0.3);
      mesh(ctx, palp, limbGeo(ctx, 0.14, 0.022, 0.018), shell);
    }
  } else if (kind === 'scorpion') {
    for (let i = 0; i < 4; i++) ell(ctx, body, [0.24 - i * 0.02, 0.1, 0.13], i % 2 ? shell2 : shell, { pos: [0, 0, 0.12 - i * 0.16] });
    head = pivot(body, 0, 0, 0.28);
    ell(ctx, head, [0.2, 0.09, 0.14], shell, {});
    eyes(ctx, head, M, { x: 0.05, y: 0.08, z: 0.06, r: 0.035, yaw: 0.2 });
    for (const sd of [-1, 1]) {
      const pv = pivot(head, sd * 0.15, 0, 0.05);
      pv.rotation.y = sd * 0.5;
      claws.push({ ...pincer(ctx, pv, shell, 0.42), sd, pv });
    }
    legLen *= 0.75;
    legZ0 = 0.1;
    legZ1 = -0.3;
    // tail: chain of segments curling over the back
    tail = [];
    let par = pivot(body, 0, 0.02, -0.5);
    for (let i = 0; i < 6; i++) {
      const seg = pivot(par);
      seg.rotation.x = -0.55;
      ell(ctx, seg, [0.075 - i * 0.004, 0.075, 0.1], i % 2 ? shell2 : shell, { pos: [0, 0, -0.08] });
      tail.push(seg);
      par = pivot(seg, 0, 0, -0.16);
    }
    const sting = ctx.accentMat(accent, { roughness: 0.3 });
    ell(ctx, par, [0.07, 0.07, 0.09], sting, { pos: [0, 0, -0.05] });
    mesh(ctx, par, coneGeo(ctx, 6), sting, { pos: [0, 0, -0.1], rot: [-2.2, 0, 0], scale: [0.025, 0.14, 0.025] });
  } else if (kind === 'crab') {
    ell(ctx, body, [0.42, 0.16, 0.3], shell, { n: 16 });
    ell(ctx, body, [0.38, 0.07, 0.26], shell2, { pos: [0, -0.1, 0] });
    for (const sd of [-1, 1]) {
      const st = pivot(body, sd * 0.1, 0.12, 0.22);
      mesh(ctx, st, limbGeo(ctx, 0.12, 0.018, 0.015), shell, { rot: [Math.PI, 0, 0] });
    }
    eyes(ctx, body, M, { x: 0.1, y: 0.26, z: 0.22, r: 0.04, yaw: 0.2 });
    ell(ctx, body, [0.06, 0.02, 0.02], M.mouth, { pos: [0, -0.03, 0.29], shadow: false });
    for (const sd of [-1, 1]) {
      const pv = pivot(body, sd * 0.3, -0.02, 0.18);
      pv.rotation.y = sd * 0.7;
      claws.push({ ...pincer(ctx, pv, shell, 0.5), sd, pv });
    }
    legZ0 = 0.1;
    legZ1 = -0.18;
    legR = 0.03;
  } else {
    const shiny = ctx.mat({ color: primary, roughness: 0.25 });
    const gaster = ctx.mat({ color: secondary, roughness: 0.25 });
    ell(ctx, body, [0.14, 0.12, 0.2], shiny, { pos: [0, 0.02, 0.02] });
    ell(ctx, body, [0.06, 0.06, 0.06], shiny, { pos: [0, 0.03, -0.2] });
    const g = ell(ctx, body, [0.22, 0.2, 0.3], gaster, { pos: [0, 0.1, -0.45] });
    g.rotation.x = -0.4;
    head = pivot(body, 0, 0.07, 0.3);
    ell(ctx, head, [0.15, 0.13, 0.14], shiny, { n: 14 });
    eyes(ctx, head, M, { x: 0.11, y: 0.03, z: 0.07, r: 0.05, yaw: 0.9 });
    for (const sd of [-1, 1]) {
      const m = pivot(head, sd * 0.06, -0.06, 0.12);
      mesh(ctx, m, coneGeo(ctx, 6), ctx.mat({ color: shade(primary, -0.3), roughness: 0.3 }), { rot: [Math.PI / 2, 0, -sd * 0.9], scale: [0.025, 0.1, 0.02] });
      jawParts.push({ m, sd });
      const an = tubeGeo(ctx, 'antenna', [[0, 0, 0], [0, 0.2, 0.02], [0, 0.25, 0.2], [0, 0.2, 0.32]], () => 0.012, 10, 5);
      mesh(ctx, head, an, shiny, { pos: [sd * 0.05, 0.1, 0.06], rot: [0, sd * 0.4, 0] });
    }
    legZ0 = 0.12;
    legZ1 = -0.08;
    legR = 0.025;
    legLen *= 1.1;
  }
  // legs
  const legs = [];
  const per = nLegs / 2;
  for (let i = 0; i < per; i++) {
    const k = per === 1 ? 0 : i / (per - 1);
    const z = legZ0 + (legZ1 - legZ0) * k;
    const alpha = 0.75 - 1.5 * k;
    for (const sd of [-1, 1]) {
      const root = pivot(body, sd * (kind === 'crab' ? 0.33 : 0.12), 0, z);
      const baseYaw = sd > 0 ? -alpha : Math.PI + alpha;
      root.rotation.y = baseYaw;
      const fem = pivot(root);
      const femLen = legLen * 0.9, tibLen = legLen * 1.25;
      mesh(ctx, fem, limbGeo(ctx, femLen, legR, legR * 0.85), shell);
      const kn = pivot(fem, 0, -femLen, 0);
      mesh(ctx, kn, sphereGeo(ctx, 6), shell2, { scale: legR * 1.1 });
      mesh(ctx, kn, limbGeo(ctx, tibLen, legR * 0.85, legR * 0.45), shell);
      const r0 = 2.35, r1 = -1.9 - (kind === 'crab' ? 0.1 : 0);
      fem.rotation.z = r0;
      kn.rotation.z = r1;
      legs.push({ root, fem, kn, baseYaw, r0, r1, group: (i + (sd > 0 ? 0 : 1)) % 2, side: sd });
    }
  }
  ctx.anchors.back = kind === 'spider' ? [-0.3, -0.5, -0.65].map((z) => ({ parent: body, pos: [0, 0.42 + (z + 0.45) * 0.3, z], s: 0.07 })) : [0.1, -0.1].map((z) => ({ parent: body, pos: [0, 0.14, z], s: 0.06 }));
  ctx.anchors.mouth = { parent: head, pos: [0, -0.05, 0.12], s: 0.04 };
  ctx.anchors.head = { parent: head, pos: [0, 0.3, 0], s: 0.15 };
  const crab = kind === 'crab';
  function animate(s) {
    const t = s.t, mv = s.move, ph = s.phase * 1.4;
    body.position.y = bodyH + Math.abs(Math.sin(ph)) * 0.015 * mv + s.breath * 0.004;
    body.rotation.x = s.wind * -0.15 + s.strike * 0.15;
    body.position.z = s.strike * 0.12;
    legs.forEach((L) => {
      const q = ph + L.group * Math.PI;
      const lift = Math.max(0, Math.sin(q)) * mv;
      L.root.rotation.y = L.baseYaw + Math.cos(q) * 0.3 * mv * (crab ? 0.4 : 1) * L.side;
      L.fem.rotation.z = L.r0 + lift * 0.35 + Math.sin(t * 2 + L.group) * 0.02;
      L.kn.rotation.z = L.r1 - lift * 0.2;
    });
    if (crab) body.rotation.z = Math.sin(ph) * 0.05 * mv;
    fangs.forEach((f, i) => (f.rotation.x = s.wind * 0.5 - s.strike * 0.3 + Math.sin(t * 3 + i) * 0.05));
    jawParts.forEach((j) => (j.m.rotation.y = j.sd * (0.3 * s.wind + Math.max(0, Math.sin(t * 2)) * 0.1)));
    claws.forEach((c) => {
      c.arm.rotation.x = -0.25 - s.wind * 0.6 + s.strike * 0.3 + Math.sin(t * 1.2 + c.sd) * 0.05;
      c.finger.rotation.y = c.sd * (0.15 + s.wind * 0.4 + Math.max(0, Math.sin(t * 1.7 + c.sd)) ** 6 * 0.3);
    });
    if (tail) tail.forEach((seg, i) => (seg.rotation.x = -0.55 - (i > 3 ? s.wind * 0.3 - s.strike * 0.5 : 0) + Math.sin(t * 1.5 - i * 0.4) * 0.04));
  }
  return { group, flying: false, stride: legLen * 1.6, animate };
}
