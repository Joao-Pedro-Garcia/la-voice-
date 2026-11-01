// Golem archetype: rock/crystal giant (chunks, crystals) and ogre/troll (params.ogre).
import * as THREE from 'three';
import { getGeometry } from './materials.js';
import { basicMats, ell, mesh, pivot, eyes, limbGeo, coneGeo, cylGeo, rockGeo, tubeGeo, torusGeo, shade } from './rig.js';

const num = (v, d) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : d);
const octa = () => getGeometry('octa', () => new THREE.OctahedronGeometry(1, 0));

export function buildGolem(ctx) {
  if (ctx.p.ogre) return buildOgre(ctx);
  const p = ctx.p;
  const { primary, secondary, accent } = ctx.c;
  const M = basicMats(ctx, 'rock');
  const rock = ctx.mat({ color: primary, map: M.body.map, roughness: 0.95, flat: true });
  const rock2 = ctx.mat({ color: secondary, map: M.body.map, roughness: 0.95, flat: true });
  const crystal = ctx.mat({ color: accent, emissive: accent, emissiveIntensity: 0.9, roughness: 0.15, flat: true, transparent: true, opacity: 0.9 });
  const moss = ctx.mat({ color: 0x5f8f3a, roughness: 1 });
  const group = new THREE.Group();
  const legH = 0.75;
  const hips = pivot(group, 0, legH, 0);
  const torso = pivot(hips);
  mesh(ctx, torso, rockGeo(ctx, 1), rock2, { pos: [0, 0.1, 0], scale: [0.42, 0.28, 0.32] });
  mesh(ctx, torso, rockGeo(ctx, 2), rock, { pos: [0, 0.65, 0.02], scale: [0.75, 0.55, 0.5] });
  mesh(ctx, torso, rockGeo(ctx, 3), rock2, { pos: [0, 0.75, -0.25], scale: [0.55, 0.4, 0.3] });
  // glowing core
  const core = mesh(ctx, torso, octa(), crystal, { pos: [0, 0.65, 0.42], scale: [0.12, 0.16, 0.08], shadow: false });
  const chunks = Math.min(20, Math.round(num(p.chunks, 10)));
  for (let i = 0; i < Math.min(chunks, 8); i++) {
    const a = i * 2.4;
    mesh(ctx, torso, rockGeo(ctx, 10 + (i % 4), 0), i % 2 ? rock : rock2, { pos: [Math.cos(a) * 0.55, 0.45 + (i % 3) * 0.2, Math.sin(a) * 0.35], scale: 0.16 + (i % 3) * 0.04, rot: [a, a * 2, 0] });
  }
  ell(ctx, torso, [0.35, 0.06, 0.25], moss, { pos: [0.1, 1.08, -0.05], small: true });
  const head = pivot(torso, 0, 1.12, 0.12);
  mesh(ctx, head, rockGeo(ctx, 4), rock, { scale: [0.26, 0.22, 0.24] });
  ell(ctx, head, [0.24, 0.06, 0.1], rock2, { pos: [0, 0.07, 0.17] });
  const eyeM = ctx.mat({ color: accent, emissive: accent, emissiveIntensity: 1.6 });
  for (const sd of [-1, 1]) ell(ctx, head, [0.05, 0.035, 0.03], eyeM, { pos: [sd * 0.09, 0.0, 0.21] });
  if (p.crystals !== false) {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI - Math.PI / 2;
      mesh(ctx, torso, octa(), crystal, { pos: [Math.sin(a) * 0.4, 1.0 + Math.cos(a) * 0.1, -0.25 - (i % 2) * 0.1], rot: [-0.5, 0, Math.sin(a) * 0.6], scale: [0.07, 0.24 + (i % 3) * 0.06, 0.07], shadow: false });
    }
  }
  const arms = [];
  for (const sd of [-1, 1]) {
    const sh = pivot(torso, sd * 0.78, 0.8, 0);
    mesh(ctx, sh, rockGeo(ctx, 5), rock2, { scale: [0.3, 0.26, 0.28] });
    const up = pivot(sh);
    mesh(ctx, up, rockGeo(ctx, 6), rock, { pos: [0, -0.3, 0], scale: [0.2, 0.3, 0.2] });
    const el = pivot(up, 0, -0.55, 0);
    mesh(ctx, el, rockGeo(ctx, 7), rock, { pos: [0, -0.25, 0], scale: [0.2, 0.3, 0.2] });
    mesh(ctx, el, rockGeo(ctx, 8), rock2, { pos: [0, -0.62, 0.03], scale: [0.3, 0.26, 0.3] });
    arms.push({ up, el, sd });
  }
  const legs = [];
  for (const sd of [-1, 1]) {
    const up = pivot(hips, sd * 0.28, 0, 0);
    mesh(ctx, up, rockGeo(ctx, 9), rock, { pos: [0, -0.25, 0], scale: [0.22, 0.28, 0.22] });
    const kn = pivot(up, 0, -0.45, 0);
    mesh(ctx, kn, rockGeo(ctx, 11), rock2, { pos: [0, -0.15, 0.04], scale: [0.26, 0.2, 0.32] });
    legs.push({ up, kn });
  }
  ctx.anchors.back = [0.5, 0.85].map((y) => ({ parent: torso, pos: [0, y, -0.45], s: 0.18, rot: [-1.2, 0, 0] }));
  ctx.anchors.mouth = { parent: head, pos: [0, -0.1, 0.22], s: 0.06 };
  ctx.anchors.head = { parent: head, pos: [0, 0.4, 0], s: 0.3 };
  function animate(s) {
    const t = s.t, mv = s.move, ph = s.phase;
    hips.position.y = legH + Math.abs(Math.cos(ph)) * 0.05 * mv;
    torso.rotation.z = Math.sin(ph) * 0.06 * mv;
    torso.rotation.x = 0.08 + s.wind * -0.25 + s.strike * 0.35;
    torso.position.y = s.breath * 0.01;
    core.scale.set(0.12, 0.16, 0.08).multiplyScalar(1 + Math.sin(t * 3) * 0.12);
    head.rotation.y = Math.sin(t * 0.4) * 0.25 * (1 - mv);
    legs.forEach((L, i) => {
      const q = ph + i * Math.PI;
      L.up.rotation.x = -Math.sin(q) * 0.4 * mv;
      L.kn.rotation.x = Math.max(0, Math.cos(q)) * 0.5 * mv;
    });
    arms.forEach((A, i) => {
      A.up.rotation.x = Math.sin(ph + (i ? 0 : Math.PI)) * 0.35 * mv - s.wind * 2.4 + s.strike * 1.9;
      A.up.rotation.z = A.sd * 0.12;
      A.el.rotation.x = -0.3 - s.wind * 0.5;
    });
  }
  return { group, flying: false, stride: 1.4, animate };
}

function buildOgre(ctx) {
  const { primary, secondary, accent } = ctx.c;
  const M = basicMats(ctx, 'skin');
  const skin = ctx.mat({ color: primary, map: M.body.map, roughness: 0.75 });
  const cloth = ctx.mat({ color: secondary, map: M.body.map, roughness: 0.95 });
  const tusk = ctx.mat({ color: accent, roughness: 0.4 });
  const wood = ctx.mat({ color: 0x6a4a2a, roughness: 0.9, map: M.body.map });
  const group = new THREE.Group();
  const legH = 0.6;
  const hips = pivot(group, 0, legH, 0);
  const torso = pivot(hips);
  ell(ctx, torso, [0.42, 0.3, 0.35], cloth, { pos: [0, 0.05, 0] });
  ell(ctx, torso, [0.5, 0.5, 0.45], skin, { pos: [0, 0.48, 0.05], n: 14 });
  ell(ctx, torso, [0.42, 0.4, 0.38], skin, { pos: [0, 0.4, 0.17] });
  ell(ctx, torso, [0.05, 0.05, 0.03], ctx.mat({ color: shade(primary, -0.3) }), { pos: [0, 0.32, 0.55], small: true });
  mesh(ctx, torso, torusGeo(ctx, 0.12, 16), ctx.mat({ color: 0x4a3020, roughness: 0.8 }), { pos: [0, 0.18, 0.02], rot: [Math.PI / 2, 0, 0], scale: [0.46, 0.4, 0.4] });
  const head = pivot(torso, 0, 0.95, 0.2);
  ell(ctx, head, [0.2, 0.2, 0.2], skin, { n: 14 });
  ell(ctx, head, [0.2, 0.12, 0.16], skin, { pos: [0, -0.1, 0.08] });
  ell(ctx, head, [0.06, 0.07, 0.06], skin, { pos: [0, 0.0, 0.2] });
  ell(ctx, head, [0.19, 0.04, 0.06], skin, { pos: [0, 0.1, 0.15] });
  for (const sd of [-1, 1]) {
    mesh(ctx, head, coneGeo(ctx, 6), tusk, { pos: [sd * 0.09, -0.13, 0.18], rot: [-0.2, 0, sd * 0.15], scale: [0.025, 0.1, 0.025] });
    mesh(ctx, head, coneGeo(ctx, 6), skin, { pos: [sd * 0.2, 0.02, 0], rot: [0, 0, -sd * 1.2], scale: [0.05, 0.15, 0.03] });
  }
  ell(ctx, head, [0.12, 0.02, 0.03], M.mouth, { pos: [0, -0.12, 0.2], shadow: false });
  eyes(ctx, head, M, { x: 0.08, y: 0.04, z: 0.16, r: 0.04, yaw: 0.25, iris: 0xe0c040 });
  const arms = [];
  for (const sd of [-1, 1]) {
    const sh = pivot(torso, sd * 0.5, 0.72, 0.05);
    const up = pivot(sh);
    ell(ctx, up, [0.15, 0.17, 0.15], skin);
    mesh(ctx, up, limbGeo(ctx, 0.42, 0.13, 0.11), skin);
    const el = pivot(up, 0, -0.42, 0);
    mesh(ctx, el, limbGeo(ctx, 0.4, 0.12, 0.1), skin);
    const hand = pivot(el, 0, -0.45, 0);
    ell(ctx, hand, [0.1, 0.1, 0.1], skin);
    arms.push({ up, el, sd, hand });
  }
  const club = pivot(arms[1].hand);
  club.rotation.x = Math.PI / 2;
  mesh(ctx, club, tubeGeo(ctx, 'club', [[0, -0.15, 0], [0, 0.3, 0], [0, 0.75, 0]], (t) => 0.035 + t * t * 0.09, 10, 8), wood);
  const legs = [];
  for (const sd of [-1, 1]) {
    const up = pivot(hips, sd * 0.22, 0, 0);
    mesh(ctx, up, limbGeo(ctx, 0.3, 0.15, 0.12), skin);
    const kn = pivot(up, 0, -0.3, 0);
    mesh(ctx, kn, limbGeo(ctx, 0.25, 0.12, 0.1), skin);
    ell(ctx, kn, [0.11, 0.06, 0.17], skin, { pos: [0, -0.28, 0.06] });
    legs.push({ up, kn });
  }
  ctx.anchors.back = [0.4, 0.7].map((y) => ({ parent: torso, pos: [0, y, -0.4], s: 0.12, rot: [-1.2, 0, 0] }));
  ctx.anchors.mouth = { parent: head, pos: [0, -0.12, 0.22], s: 0.05 };
  ctx.anchors.head = { parent: head, pos: [0, 0.35, 0], s: 0.22 };
  function animate(s) {
    const t = s.t, mv = s.move, ph = s.phase;
    hips.position.y = legH + Math.abs(Math.cos(ph)) * 0.04 * mv;
    torso.rotation.z = Math.sin(ph) * 0.07 * mv;
    torso.rotation.x = 0.1 + s.strike * 0.3 - s.wind * 0.2;
    torso.scale.set(1 + s.breath * 0.02, 1, 1 + s.breath * 0.02);
    head.rotation.y = Math.sin(t * 0.5) * 0.3 * (1 - mv);
    legs.forEach((L, i) => {
      const q = ph + i * Math.PI;
      L.up.rotation.x = -Math.sin(q) * 0.45 * mv;
      L.kn.rotation.x = Math.max(0, Math.cos(q)) * 0.6 * mv;
    });
    arms.forEach((A, i) => {
      let rx = Math.sin(ph + (i ? 0 : Math.PI)) * 0.35 * mv;
      if (i === 1) rx += -0.3 - s.wind * 2.4 + s.strike * 2.0;
      A.up.rotation.set(rx, 0, A.sd * 0.2);
      A.el.rotation.x = -0.3;
    });
  }
  return { group, flying: false, stride: 1.2, animate };
}
