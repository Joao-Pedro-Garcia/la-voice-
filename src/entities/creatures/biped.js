// Biped archetype: dinosaurs (trex, raptor, kaiju) and gorilla/minotaur.
// Humanoid variants (knight family, robot, drone) live in humanoid.js.
import * as THREE from 'three';
import { basicMats, ell, mesh, pivot, eyes, limbGeo, coneGeo, tubeGeo, skinnedTube, teeth, shade, lerp, TAU } from './rig.js';
import { coatTexture, luminance } from './textures.js';
import { buildHumanoid } from './humanoid.js';

export function buildBiped(ctx) {
  const v = ctx.p.variant || 'knight';
  if (v === 'trex' || v === 'raptor') return buildDino(ctx, v === 'raptor');
  if (v === 'gorilla') return buildGorilla(ctx);
  return buildHumanoid(ctx, v);
}

// ---------------------------------------------------------------- dinosaurs
function buildDino(ctx, raptor) {
  const p = ctx.p;
  const { primary, secondary, accent } = ctx.c;
  const M = basicMats(ctx, 'scales');
  const coat = coatTexture({ base: primary, belly: secondary, mark: shade(primary, -0.3), pattern: raptor ? 'stripes' : 'none', noise: 'scales', size: ctx.texSize, seed: 9 });
  const skin = ctx.mat({ map: coat, roughness: 0.65 });
  const plain = ctx.mat({ color: primary, map: M.body.map, roughness: 0.65 });
  const group = new THREE.Group();
  const legH = raptor ? 0.95 : 1.05;
  const hip = pivot(group, 0, legH, 0);
  const body = pivot(hip);
  body.rotation.x = raptor ? -0.05 : -0.22;
  const bR = raptor ? 0.3 : 0.48;
  ell(ctx, body, [bR * 0.95, bR, bR * (raptor ? 2.1 : 1.75)], skin, { body: true, n: 18, pos: [0, 0, bR * 0.4] });
  ell(ctx, body, [bR * 0.8, bR * 0.85, bR * 0.9], skin, { body: true, pos: [0, bR * 0.1, bR * 1.35] });
  // neck & head
  const neck = pivot(body, 0, bR * 0.35, bR * (raptor ? 2.0 : 1.9));
  neck.rotation.x = raptor ? -0.55 : -0.9;
  const nL = raptor ? 0.45 : 0.42;
  mesh(ctx, neck, limbGeo(ctx, nL, bR * 0.6, bR * (raptor ? 0.35 : 0.5)), plain, { rot: [Math.PI, 0, 0] });
  const head = pivot(neck, 0, nL, 0);
  head.rotation.x = -(neck.rotation.x + body.rotation.x) + 0.12;
  const hs = raptor ? 0.2 : 0.38;
  ell(ctx, head, [hs * 0.85, hs * 0.85, hs * 1.0], plain, { n: 14 });
  ell(ctx, head, [hs * 0.72, hs * 0.55, hs * (raptor ? 1.25 : 1.05)], plain, { pos: [0, hs * 0.05, hs * 0.95] });
  for (const sd of [-1, 1]) ell(ctx, head, [hs * 0.2, hs * 0.14, hs * 0.4], ctx.mat({ color: shade(primary, -0.2), roughness: 0.6 }), { pos: [sd * hs * 0.45, hs * 0.45, hs * 0.35] });
  for (const sd of [-1, 1]) ell(ctx, head, [hs * 0.07, hs * 0.04, hs * 0.05], M.dark, { pos: [sd * hs * 0.25, hs * 0.3, hs * 1.95], small: true });
  eyes(ctx, head, M, { x: hs * 0.55, y: hs * 0.3, z: hs * 0.4, r: hs * 0.2, yaw: 0.7, iris: 0xf2c14e, slit: true });
  teeth(ctx, head, M.claw, { n: raptor ? 7 : 9, w: hs * 1.0, y: -hs * 0.25, z: hs * 1.8, size: hs * 0.11 });
  const jaw = pivot(head, 0, -hs * 0.3, hs * 0.1);
  ell(ctx, jaw, [hs * 0.62, hs * 0.28, hs * (raptor ? 1.15 : 0.98)], ctx.mat({ color: secondary, map: M.body.map, roughness: 0.6 }), { pos: [0, -hs * 0.05, hs * 0.85] });
  ell(ctx, jaw, [hs * 0.5, hs * 0.1, hs * 0.85], M.mouth, { pos: [0, hs * 0.18, hs * 0.85], shadow: false });
  teeth(ctx, jaw, M.claw, { n: raptor ? 6 : 8, w: hs * 0.85, y: hs * 0.22, z: hs * 1.65, size: hs * 0.09, down: false });
  // arms
  const arms = [];
  for (const sd of [-1, 1]) {
    const sh = pivot(body, sd * bR * 0.7, -bR * 0.25, bR * 1.6);
    const a = pivot(sh);
    a.rotation.x = -0.9;
    const aL = raptor ? 0.42 : 0.3;
    mesh(ctx, a, limbGeo(ctx, aL * 0.5, bR * 0.16, bR * 0.11), plain);
    const fore = pivot(a, 0, -aL * 0.5, 0);
    fore.rotation.x = -0.9;
    mesh(ctx, fore, limbGeo(ctx, aL * 0.5, bR * 0.11, bR * 0.08), plain);
    for (const k of [-1, 1]) mesh(ctx, fore, coneGeo(ctx, 5), M.claw, { pos: [k * bR * 0.04, -aL * 0.5, 0], rot: [Math.PI - 0.4, 0, 0], scale: [bR * 0.03, bR * 0.15, bR * 0.03], small: true });
    arms.push({ a, fore });
  }
  // legs (digitigrade)
  const legs = [];
  const tR = raptor ? 0.14 : 0.24;
  for (const sd of [-1, 1]) {
    const h = pivot(hip, sd * bR * 0.65, 0, 0);
    const thigh = pivot(h);
    ell(ctx, thigh, [tR * 1.3, tR * 2.1, tR * 1.6], skin, { pos: [0, -tR * 0.9, 0] });
    const u = legH * 0.44, s2 = legH * 0.42, m = legH * 0.28;
    const k = legH / (u * Math.cos(0.45) + s2 * Math.cos(0.6) + m * Math.cos(0.05));
    mesh(ctx, thigh, limbGeo(ctx, u * k, tR, tR * 0.7), plain);
    const knee = pivot(thigh, 0, -u * k, 0);
    mesh(ctx, knee, limbGeo(ctx, s2 * k, tR * 0.7, tR * 0.45), plain);
    const ankle = pivot(knee, 0, -s2 * k, 0);
    mesh(ctx, ankle, limbGeo(ctx, m * k, tR * 0.45, tR * 0.35), plain);
    const foot = pivot(ankle, 0, -m * k, 0);
    for (const a of [-0.45, 0, 0.45]) {
      const toe = pivot(foot);
      toe.rotation.set(-Math.PI / 2 + 0.05, a, 0);
      mesh(ctx, toe, limbGeo(ctx, tR * 1.3, tR * 0.32, tR * 0.2, 6), plain);
      mesh(ctx, toe, coneGeo(ctx, 5), M.claw, { pos: [0, -tR * 1.5, 0], rot: [Math.PI, 0, 0], scale: [tR * 0.15, tR * 0.4, tR * 0.15], small: true });
    }
    if (raptor) mesh(ctx, foot, coneGeo(ctx, 5), M.claw, { pos: [sd * tR * 0.3, tR * 0.3, tR * 0.2], rot: [-0.6, 0, 0], scale: [tR * 0.1, tR * 0.7, tR * 0.2], small: true });
    legs.push({ thigh, knee, ankle, foot, a: [-0.45, 1.05, -0.65] });
  }
  // tail
  const tLen = raptor ? 1.6 : 1.7;
  const tail = skinnedTube(ctx, `dtail:${raptor}`, { length: tLen, bones: 7, rfn: (t) => bR * 0.75 * Math.pow(1 - t, 1.2) + 0.015, lenSeg: 20, radSeg: 10 }, plain);
  const th = pivot(body, 0, bR * 0.05, -bR * 1.1);
  th.rotation.y = Math.PI;
  th.add(tail.mesh);
  // dorsal spikes / plates
  if (p.spikes || !raptor) {
    const plate = ctx.accentMat(p.spikes ? accent : shade(primary, -0.25), { roughness: 0.5 });
    const n = p.spikes ? 7 : 5;
    for (let i = 0; i < n; i++) {
      const z = bR * (1.6 - i * 0.42);
      const big = p.spikes ? 1 : 0.45;
      mesh(ctx, body, coneGeo(ctx, 6), plate, { pos: [0, bR * 0.92, z], scale: [bR * 0.08, bR * 0.45 * big * (1 - Math.abs(i - 2) * 0.1), bR * 0.25 * big] });
    }
    for (let i = 1; i < 5; i++) mesh(ctx, tail.bones[i], coneGeo(ctx, 6), plate, { pos: [0, bR * 0.65 * (1 - i / 7), 0], scale: [bR * 0.06, bR * 0.35 * (p.spikes ? 1 : 0.4) * (1 - i / 6), bR * 0.18], small: !p.spikes });
  }
  if (raptor) {
    const fm = ctx.mat({ color: accent, roughness: 0.8 });
    for (let i = 0; i < 3; i++) mesh(ctx, head, coneGeo(ctx, 5), fm, { pos: [0, hs * 0.75, -hs * (0.2 + i * 0.25)], rot: [-1.2, 0, 0], scale: [hs * 0.08, hs * 0.55, hs * 0.05] });
  }
  for (let i = 0; i < 4; i++) ctx.anchors.back.push({ parent: body, pos: [bR * 0.35 * (i % 2 ? 1 : -1), bR * 0.85, bR * (1.4 - i * 0.55)], s: bR * 0.3 });
  ctx.anchors.mouth = { parent: head, pos: [0, -hs * 0.2, hs * 1.6], s: hs * 0.25 };
  ctx.anchors.head = { parent: head, pos: [0, hs * 1.2, 0], s: hs * 0.9 };

  const baseBody = body.rotation.x;
  function animate(s) {
    const t = s.t, mv = s.move, ph = s.phase;
    body.scale.set(1 + s.breath * 0.015, 1 + s.breath * 0.02, 1);
    legs.forEach((L, i) => {
      const q = ph + i * Math.PI;
      const sw = Math.sin(q) * (0.5 + s.run * 0.25) * mv;
      const lift = Math.max(0, Math.cos(q)) * mv * (0.8 + s.run * 0.4);
      L.thigh.rotation.x = L.a[0] - sw - lift * 0.3;
      L.knee.rotation.x = L.a[1] + lift * 0.5;
      L.ankle.rotation.x = L.a[2] - lift * 0.4;
      L.foot.rotation.x = lift * 0.3;
    });
    hip.position.y = legH + Math.abs(Math.cos(ph)) * 0.05 * mv - mv * 0.04;
    hip.rotation.z = Math.sin(ph) * 0.05 * mv;
    body.rotation.x = baseBody + s.run * mv * 0.18 + s.wind * 0.15 + s.strike * 0.12;
    hip.position.z = s.strike * 0.35;
    head.rotation.x = -(neck.rotation.x + baseBody) + 0.12 + Math.sin(t * 1.3) * 0.04 - s.wind * 0.35 + s.strike * 0.25;
    head.rotation.y = Math.sin(t * 0.5) * 0.2 * (1 - mv);
    jaw.rotation.x = 0.05 + s.wind * 0.75 + (s.atk < 0 ? Math.max(0, Math.sin(t * 0.6)) ** 6 * 0.4 : 0);
    arms.forEach((A, i) => (A.a.rotation.x = -0.9 + Math.sin(t * 2 + i) * 0.08 + s.wind * 0.3));
    tail.bones.forEach((b, i) => {
      b.rotation.y = Math.sin(t * 1.8 + ph * 0.5 - i * 0.5) * (0.06 + mv * 0.08);
      b.rotation.x = i === 0 ? 0.2 - mv * 0.1 - s.run * 0.1 : -0.03;
    });
  }
  return { group, flying: false, stride: legH * 2.0, animate };
}

// ---------------------------------------------------------------- gorilla / minotaur
function buildGorilla(ctx) {
  const p = ctx.p;
  const { primary, secondary, accent } = ctx.c;
  const M = basicMats(ctx, 'fur');
  const fur = M.body;
  const face = ctx.mat({ color: p.horns ? shade(primary, 0.15) : luminance(secondary) > luminance(primary) ? secondary : shade(primary, 0.25), roughness: 0.7 });
  const group = new THREE.Group();
  const legH = 0.55;
  const hips = pivot(group, 0, legH, 0);
  const torso = pivot(hips);
  torso.rotation.x = 0.55;
  ell(ctx, torso, [0.38, 0.32, 0.3], fur, { pos: [0, 0.15, 0], n: 14 });
  ell(ctx, torso, [0.52, 0.45, 0.42], fur, { pos: [0, 0.55, 0.02], n: 14 });
  ell(ctx, torso, [0.32, 0.3, 0.12], face, { pos: [0, 0.5, 0.32] });
  const head = pivot(torso, 0, 0.92, 0.18);
  head.rotation.x = -0.55;
  ell(ctx, head, [0.22, 0.24, 0.22], fur, { n: 14, pos: [0, 0.05, -0.02] });
  ell(ctx, head, [0.19, 0.17, 0.12], face, { pos: [0, -0.02, 0.15] });
  ell(ctx, head, [0.22, 0.06, 0.1], fur, { pos: [0, 0.12, 0.16] });
  if (p.horns) {
    ell(ctx, head, [0.16, 0.12, 0.16], face, { pos: [0, -0.1, 0.24] });
    for (const sd of [-1, 1]) ell(ctx, head, [0.03, 0.02, 0.02], M.dark, { pos: [sd * 0.06, -0.06, 0.39], small: true });
    mesh(ctx, head, tubeGeo(ctx, 'nosering', [[-0.06, 0, 0], [-0.04, -0.07, 0], [0.04, -0.07, 0], [0.06, 0, 0]], () => 0.012, 10, 5), ctx.accentMat(accent, { metalness: 0.8, roughness: 0.3 }), { pos: [0, -0.15, 0.39], small: true });
    const g = tubeGeo(ctx, 'mhorn', [[0, 0, 0], [0.4, 0.1, 0], [0.7, 0.4, 0.15], [0.75, 0.75, 0.25]], (t) => 0.12 * (1 - t) + 0.015, 12, 8);
    for (const sd of [-1, 1]) mesh(ctx, head, g, ctx.accentMat(accent, { roughness: 0.4 }), { pos: [sd * 0.17, 0.18, 0], scale: [sd * 0.38, 0.38, 0.38] });
    for (const sd of [-1, 1]) ell(ctx, head, [0.07, 0.04, 0.03], fur, { pos: [sd * 0.24, 0.08, 0], rot: [0, 0, sd * 0.4] });
  } else {
    for (const sd of [-1, 1]) ell(ctx, head, [0.035, 0.025, 0.02], M.dark, { pos: [sd * 0.04, -0.03, 0.27], small: true });
    ell(ctx, head, [0.13, 0.03, 0.03], M.mouth, { pos: [0, -0.1, 0.25], shadow: false });
    for (const sd of [-1, 1]) ell(ctx, head, [0.05, 0.06, 0.03], face, { pos: [sd * 0.21, 0.02, 0.02] });
  }
  eyes(ctx, head, M, { x: 0.08, y: 0.06, z: 0.2, r: 0.045, yaw: 0.2 });
  const arms = [];
  for (const sd of [-1, 1]) {
    const sh = pivot(torso, sd * 0.5, 0.72, 0.0);
    const up = pivot(sh);
    ell(ctx, up, [0.17, 0.2, 0.17], fur, { pos: [0, -0.05, 0] });
    mesh(ctx, up, limbGeo(ctx, 0.48, 0.15, 0.12), fur);
    const el = pivot(up, 0, -0.48, 0);
    mesh(ctx, el, limbGeo(ctx, 0.5, 0.13, 0.11), fur);
    const hand = pivot(el, 0, -0.5, 0);
    ell(ctx, hand, [0.12, 0.09, 0.13], face, { pos: [0, -0.07, 0.03] });
    arms.push({ sh, up, el, sd });
  }
  const legs = [];
  for (const sd of [-1, 1]) {
    const h = pivot(hips, sd * 0.24, 0.05, 0);
    const up = pivot(h);
    mesh(ctx, up, limbGeo(ctx, 0.3, 0.15, 0.12), fur);
    const kn = pivot(up, 0, -0.3, 0);
    mesh(ctx, kn, limbGeo(ctx, 0.26, 0.12, 0.1), fur);
    ell(ctx, kn, [0.11, 0.06, 0.17], face, { pos: [0, -0.3, 0.06] });
    legs.push({ up, kn });
  }
  ctx.anchors.back = [0.2, 0.5, 0.8].map((y) => ({ parent: torso, pos: [0, y, -0.38], s: 0.12, rot: [-1.2, 0, 0] }));
  ctx.anchors.mouth = { parent: head, pos: [0, -0.1, 0.28], s: 0.05 };
  ctx.anchors.head = { parent: head, pos: [0, 0.35, 0], s: 0.2 };
  function animate(s) {
    const t = s.t, mv = s.move, ph = s.phase;
    torso.scale.set(1 + s.breath * 0.02, 1 + s.breath * 0.015, 1 + s.breath * 0.02);
    torso.rotation.x = 0.55 + mv * 0.25 + s.run * 0.15 - s.wind * 0.6 + s.strike * 0.5;
    hips.position.y = legH + Math.abs(Math.sin(ph)) * 0.04 * mv;
    head.rotation.x = -torso.rotation.x + Math.sin(t * 0.9) * 0.05;
    head.rotation.y = Math.sin(t * 0.4) * 0.3 * (1 - mv);
    legs.forEach((L, i) => {
      const q = ph + i * Math.PI;
      L.up.rotation.x = -Math.sin(q) * 0.5 * mv - 0.15;
      L.kn.rotation.x = Math.max(0, Math.cos(q)) * 0.7 * mv + 0.2;
    });
    arms.forEach((A, i) => {
      const q = ph + (i ? 0 : Math.PI);
      const knuckle = -torso.rotation.x * 0.55;
      const beat = s.atk >= 0 ? 0 : 0;
      A.up.rotation.x = knuckle - Math.sin(q) * 0.5 * mv - s.wind * 2.0 + s.strike * 0.8 + beat;
      A.up.rotation.z = A.sd * (0.12 + s.wind * 0.3);
      A.el.rotation.x = -0.25 - s.wind * 0.6;
    });
  }
  return { group, flying: false, stride: 1.3, animate };
}
