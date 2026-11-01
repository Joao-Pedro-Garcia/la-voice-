// Slime archetype: glossy translucent blob with a core, cute face and squash-and-stretch bounce.
import * as THREE from 'three';
import { basicMats, ell, mesh, pivot, eyes, latheGeo, shade } from './rig.js';

export function buildSlime(ctx) {
  const { primary, secondary } = ctx.c;
  const M = basicMats(ctx, 'skin');
  const gel = ctx.mat({ color: primary, roughness: 0.12, transparent: true, opacity: 0.82, emissive: shade(primary, -0.6), emissiveIntensity: 0.4 });
  const core = ctx.mat({ color: secondary, roughness: 0.3, emissive: secondary, emissiveIntensity: 0.35 });
  const group = new THREE.Group();
  const squash = pivot(group);
  // drop-like profile: wide bottom, rounded top
  const prof = [];
  for (let i = 0; i <= 12; i++) {
    const a = -Math.PI / 2 + (i / 12) * Math.PI;
    const r = Math.cos(a) * (1 + 0.18 * Math.cos(a * 2 + 0.3));
    prof.push([r * 0.5, (Math.sin(a) + 1) * 0.42 * (i < 6 ? 0.7 : 1)]);
  }
  prof[0] = [0.001, 0];
  mesh(ctx, squash, latheGeo(ctx, 'slime', prof, 20), gel, {});
  ell(ctx, squash, [0.16, 0.14, 0.16], core, { pos: [0.05, 0.25, -0.05], shadow: false });
  ell(ctx, squash, [0.1, 0.06, 0.06], ctx.mat({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6, transparent: true, opacity: 0.6 }), { pos: [-0.2, 0.6, 0.22], rot: [0, -0.6, 0.5], small: true });
  const face = pivot(squash, 0, 0.42, 0.36);
  eyes(ctx, face, M, { x: 0.13, y: 0.05, z: 0.02, r: 0.08, yaw: 0.25 });
  const mouth = ell(ctx, face, [0.07, 0.04, 0.03], M.mouth, { pos: [0, -0.1, 0.05], shadow: false });
  for (const sd of [-1, 1]) ell(ctx, face, [0.05, 0.025, 0.02], ctx.mat({ color: 0xff8aa0, transparent: true, opacity: 0.7 }), { pos: [sd * 0.22, -0.06, 0.0], small: true });
  ctx.anchors.back = [{ parent: squash, pos: [0, 0.82, 0], s: 0.12 }, { parent: squash, pos: [0.25, 0.6, -0.2], s: 0.08 }, { parent: squash, pos: [-0.25, 0.6, -0.2], s: 0.08 }];
  ctx.anchors.mouth = { parent: face, pos: [0, -0.1, 0.06], s: 0.04 };
  ctx.anchors.head = { parent: squash, pos: [0, 1.0, 0], s: 0.35 };
  function animate(s) {
    const t = s.t, mv = s.move;
    const hop = mv > 0.05 ? Math.abs(Math.sin(s.phase * 0.8)) : 0;
    const wobble = Math.sin(t * 3) * 0.04;
    let sy = 1 + wobble + (hop - 0.4) * 0.25 * mv + s.wind * -0.25 + s.strike * 0.3;
    squash.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    squash.position.y = hop * 0.35 * mv;
    squash.position.z = s.strike * 0.3;
    squash.rotation.z = Math.sin(t * 2.1) * 0.03;
    mouth.scale.set(0.07, 0.04 + s.wind * 0.06, 0.03);
  }
  return { group, flying: false, stride: 0.9, animate };
}
