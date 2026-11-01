// Humanoid bipeds: knight (+ zombie / skeleton / viking horns / samurai / ninja), robot, drone.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { getGeometry } from './materials.js';
import { basicMats, ell, mesh, pivot, eyes, limbGeo, sphereGeo, coneGeo, cylGeo, torusGeo, tubeGeo, shapeGeo, latheGeo, shade, TAU } from './rig.js';
import { coatTexture } from './textures.js';

const rbox = (ctx, r = 0.15) => getGeometry(`rbox:${r}:${ctx.detail}`, () => new RoundedBoxGeometry(1, 1, 1, ctx.detail === 2 ? 2 : 1, r));

export function buildHumanoid(ctx, variant) {
  if (variant === 'drone') return buildDrone(ctx);
  const p = ctx.p;
  const robot = variant === 'robot';
  const kind = robot ? 'robot' : p.skeleton ? 'skeleton' : p.zombie ? 'zombie' : p.ninja ? 'ninja' : p.samurai ? 'samurai' : p.horns ? 'viking' : 'knight';
  const { primary, secondary, accent } = ctx.c;
  const M = basicMats(ctx, robot ? 'metal' : 'skin');
  const skinMat = ctx.mat({ color: kind === 'zombie' ? primary : 0xe0b48e, map: M.body.map, roughness: 0.7 });
  const metal = (c) => ctx.mat({ color: c, metalness: 0.75, roughness: 0.32, map: robot ? M.body.map : null });
  const cloth = (c) => ctx.mat({ color: c, roughness: 0.9, map: M.body.map });
  const glow = ctx.mat({ color: accent, emissive: accent, emissiveIntensity: 1.3, roughness: 0.3 });
  const bone = ctx.mat({ color: primary, roughness: 0.6, map: M.body.map });
  let mats;
  switch (kind) {
    case 'robot': mats = { torso: metal(primary), limb: metal(secondary), joint: metal(primary), boot: metal(secondary), head: metal(primary) }; break;
    case 'skeleton': mats = { torso: bone, limb: bone, joint: bone, boot: bone, head: bone }; break;
    case 'zombie': mats = { torso: cloth(secondary), limb: skinMat, joint: skinMat, boot: cloth(accent), head: skinMat, pants: cloth(accent) }; break;
    case 'ninja': mats = { torso: cloth(primary), limb: cloth(primary), joint: cloth(secondary), boot: cloth(secondary), head: cloth(primary) }; break;
    case 'samurai': mats = { torso: ctx.mat({ map: coatTexture({ base: primary, mark: shade(primary, -0.45), pattern: 'rings', noise: 'skin', size: 128, wrap: true }), roughness: 0.45 }), limb: cloth(secondary), joint: metal(secondary), boot: cloth(secondary), head: metal(secondary) }; break;
    case 'viking': mats = { torso: cloth(secondary), limb: cloth(primary), joint: cloth(primary), boot: cloth(shade(primary, -0.4)), head: metal(accent) }; break;
    default: mats = { torso: metal(primary), limb: metal(primary), joint: metal(shade(primary, -0.15)), boot: metal(shade(primary, -0.3)), head: metal(primary) };
  }
  const thin = kind === 'skeleton';
  const S = robot ? 1.15 : 1; // bulk
  const group = new THREE.Group();
  const legLen = robot ? 0.8 : 0.88;
  const hips = pivot(group, 0, legLen, 0);
  const spine = pivot(hips);
  // pelvis + torso
  if (thin) {
    ell(ctx, spine, [0.17, 0.08, 0.1], bone, { pos: [0, 0.02, 0] });
    mesh(ctx, spine, cylGeo(ctx, 6), bone, { scale: [0.03, 0.5, 0.03] });
    for (let i = 0; i < 4; i++) mesh(ctx, spine, torusGeo(ctx, 0.12, 12), bone, { pos: [0, 0.27 + i * 0.07, 0.02], rot: [Math.PI / 2, 0, 0], scale: [0.15 - i * 0.004 + (i === 1 ? 0.02 : 0), 0.11, 0.12] });
  } else if (robot) {
    mesh(ctx, spine, rbox(ctx), mats.limb, { pos: [0, 0.05, 0], scale: [0.36, 0.2, 0.24] });
    mesh(ctx, spine, rbox(ctx), mats.torso, { pos: [0, 0.45, 0], scale: [0.62, 0.52, 0.38] });
    mesh(ctx, spine, cylGeo(ctx, 16), glow, { pos: [0, 0.47, 0.18], rot: [Math.PI / 2, 0, 0], scale: [0.09, 0.04, 0.09] });
    mesh(ctx, spine, torusGeo(ctx, 0.15, 16), mats.limb, { pos: [0, 0.47, 0.2], scale: 0.1 });
    for (const sd of [-1, 1]) mesh(ctx, spine, rbox(ctx), mats.limb, { pos: [sd * 0.12, 0.62, 0.19], scale: [0.1, 0.05, 0.03], small: true });
  } else {
    ell(ctx, spine, [0.2, 0.14, 0.14], mats.pants || mats.torso, { pos: [0, 0.05, 0] });
    const torsoG = latheGeo(ctx, 'torso', [[0.001, -0.02], [0.17, 0.0], [0.19, 0.15], [0.22, 0.35], [0.24, 0.48], [0.18, 0.56], [0.001, 0.58]], 14);
    mesh(ctx, spine, torsoG, mats.torso, { pos: [0, 0.08, 0], scale: [1, 1, 0.72] });
    if (kind === 'knight') {
      const tab = shapeGeo(ctx, 'tabard', [[-0.17, 0.5], [0.17, 0.5], [0.15, -0.2], [0, -0.28], [-0.15, -0.2]], 0.02, 0.01, false);
      mesh(ctx, spine, tab, cloth(secondary), { pos: [0, 0.05, 0.16] });
      mesh(ctx, spine, shapeGeo(ctx, 'cross', [[-0.03, 0.1], [0.03, 0.1], [0.03, 0.02], [0.08, 0.02], [0.08, -0.03], [0.03, -0.03], [0.03, -0.12], [-0.03, -0.12], [-0.03, -0.03], [-0.08, -0.03], [-0.08, 0.02], [-0.03, 0.02]], 0.01, 0.005, false), ctx.accentMat(accent, { metalness: 0.6, roughness: 0.3 }), { pos: [0, 0.32, 0.18], small: true });
      mesh(ctx, spine, torusGeo(ctx, 0.12, 16), ctx.accentMat(accent, { metalness: 0.7, roughness: 0.3 }), { pos: [0, 0.08, 0], rot: [Math.PI / 2, 0, 0], scale: [0.2, 0.15, 0.2] });
    }
    if (kind === 'samurai' || kind === 'ninja' || kind === 'viking') mesh(ctx, spine, torusGeo(ctx, 0.14, 16), cloth(kind === 'samurai' ? accent : kind === 'ninja' ? accent : shade(primary, -0.4)), { pos: [0, 0.1, 0], rot: [Math.PI / 2, 0, 0], scale: [0.19, 0.15, 0.14] });
    if (kind === 'samurai') for (const sd of [-1, 1]) mesh(ctx, spine, shapeGeo(ctx, 'skirt', [[-0.1, 0], [0.1, 0], [0.12, -0.3], [-0.12, -0.3]], 0.02, 0.01, false), mats.torso, { pos: [sd * 0.1, 0.02, 0.1], rot: [0.15, sd * 0.4, 0] });
    if (kind === 'zombie') for (let i = 0; i < 4; i++) ell(ctx, spine, [0.05, 0.06, 0.03], mats.torso, { pos: [-0.12 + i * 0.08, 0.06 - (i % 2) * 0.03, 0.12] });
    if (kind === 'viking') ell(ctx, spine, [0.26, 0.1, 0.18], cloth(shade(primary, 0.2)), { pos: [0, 0.6, -0.02] });
  }
  const chestTop = robot ? 0.72 : 0.62;
  // head
  const neck = pivot(spine, 0, chestTop, 0);
  const head = pivot(neck, 0, robot ? 0.2 : 0.17, 0);
  const hr = robot ? 0.16 : 0.135;
  let jaw = null;
  if (robot) {
    mesh(ctx, neck, cylGeo(ctx, 10), mats.limb, { scale: [0.07, 0.12, 0.07] });
    mesh(ctx, head, rbox(ctx, 0.2), mats.head, { scale: [0.32, 0.26, 0.28] });
    mesh(ctx, head, rbox(ctx, 0.3), glow, { pos: [0, 0.02, 0.13], scale: [0.25, 0.08, 0.04] });
    mesh(ctx, head, cylGeo(ctx, 6), mats.limb, { pos: [0.1, 0.12, 0], scale: [0.012, 0.16, 0.012], small: true });
    mesh(ctx, head, sphereGeo(ctx, 8), glow, { pos: [0.1, 0.29, 0], scale: 0.03, small: true });
    for (const sd of [-1, 1]) mesh(ctx, head, cylGeo(ctx, 12), mats.limb, { pos: [sd * 0.16, 0, 0], rot: [0, 0, Math.PI / 2], scale: [0.06, 0.04, 0.06] });
  } else if (thin) {
    ell(ctx, head, [hr, hr * 1.05, hr * 1.05], bone, { n: 14, pos: [0, 0.03, 0] });
    for (const sd of [-1, 1]) {
      ell(ctx, head, [hr * 0.3, hr * 0.33, hr * 0.15], M.dark, { pos: [sd * hr * 0.38, hr * 0.08, hr * 0.85] });
      ell(ctx, head, [hr * 0.1, hr * 0.1, hr * 0.06], glow, { pos: [sd * hr * 0.38, hr * 0.08, hr * 0.95] });
    }
    ell(ctx, head, [hr * 0.1, hr * 0.12, hr * 0.06], M.dark, { pos: [0, -hr * 0.2, hr * 0.95] });
    jaw = pivot(head, 0, -hr * 0.45, hr * 0.1);
    ell(ctx, jaw, [hr * 0.6, hr * 0.22, hr * 0.6], bone, { pos: [0, -hr * 0.1, hr * 0.3] });
    for (let i = 0; i < 6; i++) ell(ctx, jaw, [hr * 0.06, hr * 0.08, hr * 0.04], bone, { pos: [-hr * 0.3 + i * hr * 0.12, hr * 0.12, hr * 0.82], small: true });
    mesh(ctx, neck, cylGeo(ctx, 6), bone, { scale: [0.03, 0.12, 0.03] });
  } else {
    mesh(ctx, neck, cylGeo(ctx, 10), skinMat, { scale: [0.06, 0.12, 0.06] });
    ell(ctx, head, [hr, hr * 1.1, hr * 1.05], kind === 'ninja' ? mats.head : skinMat, { n: 14 });
    if (kind === 'knight') {
      const helm = latheGeo(ctx, 'helm', [[0.15, -0.17], [0.16, -0.12], [0.16, 0.0], [0.14, 0.13], [0.09, 0.19], [0.001, 0.2]], 14);
      mesh(ctx, head, helm, mats.head, { pos: [0, 0.01, 0] });
      ell(ctx, head, [0.11, 0.015, 0.03], M.dark, { pos: [0, 0.02, 0.15] });
      mesh(ctx, head, cylGeo(ctx, 6), mats.head, { pos: [0, -0.1, 0.152], scale: [0.012, 0.11, 0.012] });
      const plume = tubeGeo(ctx, 'plume2', [[0, 0, 0.05], [0, 0.12, -0.02], [0, 0.12, -0.18], [0, 0.0, -0.28]], (t) => 0.045 * Math.sin(Math.PI * (0.1 + t * 0.85)) + 0.008, 12, 8);
      mesh(ctx, head, plume, cloth(secondary), { pos: [0, 0.18, 0] });
    } else if (kind === 'viking') {
      ell(ctx, head, [hr * 1.08, hr * 0.85, hr * 1.08], mats.head, { pos: [0, hr * 0.35, -0.01] });
      const hornG = tubeGeo(ctx, 'vhorn', [[0, 0, 0], [0.12, 0.05, 0], [0.2, 0.2, 0], [0.18, 0.32, 0]], (t) => 0.04 * (1 - t) + 0.006, 12, 7);
      for (const sd of [-1, 1]) mesh(ctx, head, hornG, ctx.mat({ color: 0xf2ead8, roughness: 0.4 }), { pos: [sd * hr * 0.9, hr * 0.45, 0], scale: [sd, 1, 1] });
      const beard = ctx.mat({ color: 0xc0602a, roughness: 0.95, map: M.body.map });
      ell(ctx, head, [hr * 0.85, hr * 0.8, hr * 0.55], beard, { pos: [0, -hr * 0.55, hr * 0.45] });
      ell(ctx, head, [hr * 0.4, hr * 0.12, hr * 0.15], beard, { pos: [0, -hr * 0.15, hr * 0.92] });
    } else if (kind === 'samurai') {
      const kabuto = latheGeo(ctx, 'kabuto', [[0.27, -0.11], [0.24, -0.08], [0.16, 0.0], [0.15, 0.08], [0.1, 0.16], [0.001, 0.17]], 16);
      mesh(ctx, head, kabuto, mats.head, { pos: [0, 0.02, -0.01] });
      const crest = tubeGeo(ctx, 'crest', [[-0.16, 0.18, 0], [-0.06, 0.03, 0], [0, 0, 0], [0.06, 0.03, 0], [0.16, 0.18, 0]], (t) => 0.018 * Math.sin(Math.PI * (0.05 + t * 0.9)) + 0.004, 14, 5);
      mesh(ctx, head, crest, ctx.accentMat(accent, { metalness: 0.8, roughness: 0.25 }), { pos: [0, 0.14, 0.13] });
      ell(ctx, head, [hr * 0.75, hr * 0.38, hr * 0.3], M.dark, { pos: [0, -hr * 0.45, hr * 0.72] });
    } else if (kind === 'ninja') {
      ell(ctx, head, [hr * 0.86, hr * 0.22, hr * 0.3], skinMat, { pos: [0, hr * 0.12, hr * 0.72] });
      mesh(ctx, head, torusGeo(ctx, 0.12, 16), cloth(accent), { pos: [0, hr * 0.42, 0], rot: [Math.PI / 2 - 0.1, 0, 0], scale: [hr * 1.03, hr * 1.03, hr * 0.8] });
      for (const sd of [-1, 1]) ell(ctx, head, [0.02, 0.1, 0.012], cloth(accent), { pos: [sd * 0.03, hr * 0.2, -hr * 1.05], rot: [0.6, 0, sd * 0.4] });
    } else if (kind === 'zombie') {
      for (const [x, y, r] of [[0.06, 0.08, 0.04], [-0.07, 0.1, 0.03]]) ell(ctx, head, [r, r * 0.6, r], ctx.mat({ color: shade(primary, -0.3), roughness: 0.8 }), { pos: [x, y, hr * 0.85], small: true });
      ell(ctx, head, [hr * 0.45, hr * 0.06, hr * 0.06], M.mouth, { pos: [0, -hr * 0.45, hr * 0.9] });
      for (let i = 0; i < 4; i++) mesh(ctx, head, cylGeo(ctx, 4), M.dark, { pos: [-hr * 0.24 + i * hr * 0.16, -hr * 0.52, hr * 0.92], scale: [0.004, 0.03, 0.004], small: true });
      ell(ctx, head, [hr * 0.9, hr * 0.3, hr * 0.9], ctx.mat({ color: 0x3a3028, roughness: 0.9 }), { pos: [0, hr * 0.85, -0.02] });
    }
    if (kind !== 'knight') eyes(ctx, head, M, { x: hr * 0.36, y: hr * 0.12, z: hr * 0.8, r: hr * (kind === 'zombie' ? 0.22 : 0.19), yaw: 0.25, iris: kind === 'zombie' ? 0xd8e060 : null });
  }
  // arms
  const arms = [];
  const shW = robot ? 0.4 : thin ? 0.2 : 0.25;
  for (const sd of [-1, 1]) {
    const sh = pivot(spine, sd * shW, chestTop - (robot ? 0.06 : 0.07), 0);
    const up = pivot(sh);
    const ua = robot ? 0.3 : 0.3, fa = robot ? 0.32 : 0.28;
    const ar = thin ? 0.022 : robot ? 0.07 : 0.055;
    if (robot) mesh(ctx, sh, sphereGeo(ctx, 12), mats.joint, { scale: 0.13 });
    else if (kind === 'knight' || kind === 'samurai') ell(ctx, sh, [0.12, 0.08, 0.12], kind === 'samurai' ? mats.torso : mats.joint, { pos: [sd * 0.03, 0.03, 0] });
    else if (!thin) ell(ctx, sh, [0.07, 0.07, 0.07], mats.limb);
    mesh(ctx, up, limbGeo(ctx, ua, ar * 1.15 * S, ar * S), mats.limb);
    const el = pivot(up, 0, -ua, 0);
    if (thin || robot) mesh(ctx, el, sphereGeo(ctx, 8), mats.joint, { scale: ar * 1.4 });
    mesh(ctx, el, limbGeo(ctx, fa, ar * S, ar * 0.85 * S), kind === 'ninja' || kind === 'zombie' ? (kind === 'zombie' ? skinMat : mats.limb) : robot || thin ? mats.limb : mats.joint);
    const hand = pivot(el, 0, -fa - 0.03, 0);
    if (robot) {
      mesh(ctx, hand, rbox(ctx, 0.3), mats.joint, { scale: [0.11, 0.1, 0.11] });
      for (const k of [-1, 1]) mesh(ctx, hand, rbox(ctx, 0.3), mats.limb, { pos: [0, -0.07, k * 0.035], scale: [0.04, 0.08, 0.025], small: true });
    } else ell(ctx, hand, [0.05, 0.055, 0.05], kind === 'knight' || kind === 'samurai' ? mats.joint : thin ? bone : kind === 'ninja' ? mats.joint : skinMat);
    arms.push({ sh, up, el, hand, sd });
  }
  // legs
  const legs = [];
  for (const sd of [-1, 1]) {
    const h = pivot(hips, sd * (robot ? 0.15 : 0.1), 0, 0);
    const up = pivot(h);
    const ul = legLen * 0.5, ll = legLen * 0.44;
    const lr = thin ? 0.025 : robot ? 0.08 : 0.07;
    mesh(ctx, up, limbGeo(ctx, ul, lr * 1.1, lr * 0.9), mats.pants || (kind === 'knight' ? mats.limb : mats.limb));
    const kn = pivot(up, 0, -ul, 0);
    if (thin || robot || kind === 'knight') mesh(ctx, kn, sphereGeo(ctx, 8), mats.joint, { scale: lr * 1.25 });
    mesh(ctx, kn, limbGeo(ctx, ll, lr * 0.9, lr * 0.75), kind === 'zombie' ? skinMat : mats.limb);
    const ft = pivot(kn, 0, -ll, 0);
    if (robot) mesh(ctx, ft, rbox(ctx, 0.3), mats.boot, { pos: [0, -0.02, 0.05], scale: [0.16, 0.1, 0.26] });
    else ell(ctx, ft, [thin ? 0.03 : 0.065, 0.045, thin ? 0.08 : 0.12], mats.boot, { pos: [0, -0.015, 0.05] });
    legs.push({ up, kn, ft });
  }
  // gear
  const R = arms[1].hand, L = arms[0].hand;
  let weapon = null;
  if (kind === 'knight' || kind === 'samurai' || kind === 'ninja') {
    weapon = pivot(R);
    weapon.rotation.x = Math.PI / 2;
    const blade = kind === 'knight'
      ? shapeGeo(ctx, 'sword', [[-0.03, 0], [0.03, 0], [0.025, 0.7], [0, 0.78], [-0.025, 0.7]], 0.012, 0.004, false)
      : shapeGeo(ctx, 'katana', [[-0.017, 0], [0.017, 0], [0.03, 0.4], [0.05, 0.72], [0.02, 0.7], [0.0, 0.4]], 0.008, 0.003, true);
    mesh(ctx, weapon, blade, ctx.mat({ color: 0xdfe6ee, metalness: 0.9, roughness: 0.2 }), { pos: [0, 0.08, 0] });
    mesh(ctx, weapon, cylGeo(ctx, 6), cloth(kind === 'knight' ? 0x4a3020 : 0x1a1a1a), { pos: [0, -0.08, 0], scale: [0.018, 0.16, 0.018] });
    if (kind === 'knight') mesh(ctx, weapon, rbox(ctx, 0.4), ctx.accentMat(accent, { metalness: 0.7 }), { pos: [0, 0.08, 0], scale: [0.18, 0.03, 0.04] });
    else mesh(ctx, weapon, cylGeo(ctx, 10), ctx.accentMat(accent, { metalness: 0.7 }), { pos: [0, 0.07, 0], scale: [0.04, 0.012, 0.04] });
  } else if (kind === 'viking') {
    weapon = pivot(R);
    weapon.rotation.x = Math.PI / 2;
    mesh(ctx, weapon, cylGeo(ctx, 6), cloth(0x6a4a2a), { pos: [0, -0.12, 0], scale: [0.02, 0.62, 0.02] });
    mesh(ctx, weapon, shapeGeo(ctx, 'axe', [[0, 0], [0.16, 0.08], [0.2, 0.0], [0.16, -0.16], [0, -0.06]], 0.02, 0.006), ctx.mat({ color: 0xc8d0d8, metalness: 0.85, roughness: 0.3 }), { pos: [0.01, 0.42, 0], rot: [0, Math.PI / 2, 0] });
  }
  if (kind === 'knight' || kind === 'viking') {
    const shield = pivot(L, -0.05, 0.05, 0.05);
    shield.rotation.set(0, -Math.PI / 2 + 0.3, 0);
    if (kind === 'knight') {
      mesh(ctx, shield, shapeGeo(ctx, 'heater', [[-0.2, 0.2], [0.2, 0.2], [0.19, -0.05], [0.0, -0.3], [-0.19, -0.05]], 0.03, 0.015), cloth(secondary), {});
      mesh(ctx, shield, shapeGeo(ctx, 'heater2', [[-0.08, 0.1], [0.08, 0.1], [0.07, -0.03], [0.0, -0.13], [-0.07, -0.03]], 0.02, 0.01), ctx.accentMat(accent, { metalness: 0.7, roughness: 0.3 }), { pos: [0, 0.02, 0.03] });
    } else {
      mesh(ctx, shield, cylGeo(ctx, 18), cloth(0x8a5a2a), { rot: [Math.PI / 2, 0, 0], scale: [0.24, 0.03, 0.24] });
      mesh(ctx, shield, sphereGeo(ctx, 10), ctx.mat({ color: 0xc8d0d8, metalness: 0.8, roughness: 0.3 }), { pos: [0, 0, 0.02], scale: [0.06, 0.06, 0.04] });
      mesh(ctx, shield, torusGeo(ctx, 0.05, 20), ctx.mat({ color: 0x9aa4ad, metalness: 0.8, roughness: 0.3 }), { scale: 0.24 });
    }
  }
  if (kind === 'ninja') {
    const back = pivot(spine, 0, 0.35, -0.13);
    back.rotation.z = 0.7;
    mesh(ctx, back, cylGeo(ctx, 8), ctx.mat({ color: 0x111111, roughness: 0.5 }), { pos: [0, -0.3, 0], scale: [0.025, 0.65, 0.025] });
  }
  ctx.anchors.back = [0.25, 0.45].map((y) => ({ parent: spine, pos: [0, y, -0.17], s: 0.07, rot: [-1.3, 0, 0] }));
  ctx.anchors.mouth = { parent: head, pos: [0, -hr * 0.4, hr * 0.95], s: 0.03 };
  ctx.anchors.head = { parent: head, pos: [0, hr * 2.1, 0], s: hr * 1.1 };

  const zombie = kind === 'zombie';
  const crouch = kind === 'ninja' ? 0.12 : 0;
  function animate(s) {
    const t = s.t, mv = s.move, ph = s.phase, run = s.run;
    spine.scale.set(1, 1 + s.breath * 0.012, 1);
    hips.position.y = legLen - crouch * legLen * 0.5 + Math.abs(Math.cos(ph)) * 0.04 * mv - run * 0.03 + (thin && s.anim === 'idle' ? Math.abs(Math.sin(t * 3)) * 0.04 : 0);
    spine.rotation.x = crouch + run * 0.25 * mv + (zombie ? 0.15 : 0) + s.wind * -0.1 + s.strike * 0.2;
    spine.rotation.y = s.wind * 0.45 - s.strike * 0.5 + Math.sin(ph) * 0.08 * mv;
    hips.rotation.z = zombie ? Math.sin(ph) * 0.08 * mv + 0.05 : 0;
    head.rotation.x = -spine.rotation.x * 0.6 + Math.sin(t * 0.7) * 0.04 + (zombie ? 0.25 : 0);
    head.rotation.y = Math.sin(t * 0.45) * 0.3 * (1 - mv);
    head.rotation.z = zombie ? 0.25 + Math.sin(t * 1.3) * 0.08 : 0;
    if (jaw) jaw.rotation.x = Math.max(0, Math.sin(t * 6)) * 0.25;
    const gait = 0.55 + run * 0.35;
    legs.forEach((Lg, i) => {
      const q = ph + i * Math.PI;
      Lg.up.rotation.x = -Math.sin(q) * gait * mv - crouch * 1.4;
      Lg.kn.rotation.x = Math.max(0, Math.cos(q)) * (0.9 + run * 0.5) * mv + crouch * 2.2;
      Lg.ft.rotation.x = -crouch * 0.8;
    });
    arms.forEach((A, i) => {
      const q = ph + (i ? 0 : Math.PI);
      let rx = Math.sin(q) * (0.4 + run * 0.4) * mv;
      let ex = -0.25 - run * mv * 0.6;
      let rz = A.sd * 0.1;
      if (zombie) {
        rx = -1.4 + Math.sin(t * 2 + i) * 0.1 - s.wind * 0.3 + s.strike * 0.2;
        ex = -0.1;
      } else if (thin && s.anim === 'idle') {
        rx = Math.sin(t * 3 + i * Math.PI) * 0.6;
        rz = A.sd * (0.6 + Math.sin(t * 3) * 0.3);
        ex = -1.2;
      }
      if (i === 1 && !zombie && s.atk >= 0) {
        rx = -s.wind * 2.6 + s.strike * 1.4 + (1 - s.wind) * rx * 0.2;
        ex = -0.4 - s.wind * 0.6 + s.strike * 0.5;
      }
      if (i === 0 && (kind === 'knight' || kind === 'viking')) {
        rx = -0.6 + rx * 0.3;
        ex = -1.1;
        rz = A.sd * 0.2;
      }
      A.up.rotation.set(rx, 0, rz);
      A.el.rotation.x = ex;
    });
    if (weapon) weapon.rotation.x = Math.PI / 2 + s.strike * 0.3;
  }
  return { group, flying: false, stride: 1.25, animate };
}

function buildDrone(ctx) {
  const { primary, secondary, accent } = ctx.c;
  const M = basicMats(ctx, 'metal');
  const shell = ctx.mat({ color: primary, metalness: 0.7, roughness: 0.3, map: M.body.map });
  const dark = ctx.mat({ color: secondary, metalness: 0.6, roughness: 0.4 });
  const glow = ctx.mat({ color: accent, emissive: accent, emissiveIntensity: 1.5, roughness: 0.2 });
  const group = new THREE.Group();
  const body = pivot(group);
  ell(ctx, body, [0.42, 0.3, 0.42], shell, { n: 18 });
  ell(ctx, body, [0.44, 0.12, 0.44], dark, { pos: [0, -0.05, 0] });
  const eye = ell(ctx, body, [0.15, 0.15, 0.08], glow, { pos: [0, 0, 0.4] });
  mesh(ctx, body, torusGeo(ctx, 0.2, 16), dark, { pos: [0, 0, 0.4], scale: 0.17 });
  mesh(ctx, body, cylGeo(ctx, 6), dark, { pos: [0.15, 0.25, -0.1], scale: [0.012, 0.2, 0.012], small: true });
  mesh(ctx, body, sphereGeo(ctx, 6), glow, { pos: [0.15, 0.46, -0.1], scale: 0.03, small: true });
  mesh(ctx, body, cylGeo(ctx, 8), dark, { pos: [0, -0.28, 0.15], rot: [Math.PI / 2, 0, 0], scale: [0.04, 0.3, 0.04] });
  const rotors = [];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const arm = pivot(body);
    arm.rotation.y = a;
    mesh(ctx, arm, cylGeo(ctx, 6), dark, { pos: [0, 0.05, 0], rot: [0, 0, -Math.PI / 2], scale: [0.04, 0.72, 0.04] });
    const hub = pivot(arm, 0.75, 0.1, 0);
    mesh(ctx, hub, torusGeo(ctx, 0.08, 20), shell, { rot: [Math.PI / 2, 0, 0], scale: 0.24 });
    mesh(ctx, hub, cylGeo(ctx, 8), dark, { pos: [0, -0.05, 0], scale: [0.04, 0.08, 0.04] });
    const blades = pivot(hub, 0, 0.03, 0);
    for (let k = 0; k < 2; k++) ell(ctx, blades, [0.21, 0.008, 0.035], ctx.mat({ color: 0x222831, roughness: 0.5 }), { rot: [0, (k * Math.PI) / 2, 0.05] });
    rotors.push(blades);
  }
  for (const sd of [-1, 1]) mesh(ctx, body, cylGeo(ctx, 6), dark, { pos: [sd * 0.2, -0.45, 0], rot: [Math.PI / 2, 0, 0], scale: [0.02, 0.5, 0.02], small: true, });
  ctx.anchors.back = [{ parent: body, pos: [0, 0.28, 0], s: 0.1 }];
  ctx.anchors.mouth = { parent: body, pos: [0, 0, 0.45], s: 0.08 };
  ctx.anchors.head = { parent: body, pos: [0, 0.5, 0], s: 0.25 };
  function animate(s) {
    rotors.forEach((r, i) => (r.rotation.y += (i % 2 ? 1 : -1) * s.dt * 40));
    body.position.y = Math.sin(s.t * 2.2) * 0.05;
    body.rotation.x = s.move * (0.18 + s.run * 0.15) + s.strike * 0.2;
    body.rotation.z = Math.sin(s.t * 1.3) * 0.04;
    const k = 1 + s.wind * 0.4;
    eye.scale.set(0.15 * k, 0.15 * k, 0.08);
  }
  return { group, flying: true, stride: 1.5, animate, center: new THREE.Vector3(0, 0, 0) };
}
