// Octopus archetype: octopus, squid (tentacles >= 10), jellyfish (params.jellyfish). Floats; origin at centre.
import * as THREE from 'three';
import { basicMats, ell, mesh, pivot, eyes, latheGeo, skinnedTube, tubeGeo, shade, TAU } from './rig.js';

const num = (v, d) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : d);

export function buildOctopus(ctx) {
  const p = ctx.p;
  const { primary, secondary, accent } = ctx.c;
  const M = basicMats(ctx, 'skin');
  const jelly = !!p.jellyfish;
  const n = Math.max(4, Math.min(12, Math.round(num(p.tentacles, 8))));
  const squid = !jelly && n >= 10;
  const group = new THREE.Group();
  const bob = pivot(group);
  const tentacles = [];
  let mantle;
  if (jelly) {
    const bell = ctx.mat({ color: primary, emissive: accent, emissiveIntensity: 0.35, roughness: 0.15, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
    const prof = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * (Math.PI / 2);
      prof.push([Math.sin(a) * 0.55 + (i === 10 ? 0.03 : 0), Math.cos(a) * 0.45]);
    }
    prof.push([0.48, -0.03]);
    mantle = pivot(bob, 0, 0.1, 0);
    mesh(ctx, mantle, latheGeo(ctx, 'bell', prof.reverse().map(([r, y]) => [r, y]).reverse(), 20), bell, { shadow: false });
    ell(ctx, mantle, [0.25, 0.18, 0.25], ctx.mat({ color: secondary, emissive: secondary, emissiveIntensity: 0.5, transparent: true, opacity: 0.8 }), { pos: [0, 0.15, 0], shadow: false });
    eyes(ctx, mantle, M, { x: 0.15, y: 0.18, z: 0.45, r: 0.06, yaw: 0.3, pitch: 0 });
    const tm = ctx.mat({ color: secondary, emissive: accent, emissiveIntensity: 0.4, roughness: 0.3, transparent: true, opacity: 0.75 });
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU;
      const tt = skinnedTube(ctx, 'jtent', { length: 1.1, bones: 5, rfn: (t) => 0.025 * (1 - t * 0.7), lenSeg: 12, radSeg: 5 }, tm);
      const h = pivot(mantle, Math.cos(a) * 0.42, 0, Math.sin(a) * 0.42);
      h.rotation.x = Math.PI / 2;
      h.add(tt.mesh);
      tentacles.push({ bones: tt.bones, i, a });
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      const tt = skinnedTube(ctx, 'jarm', { length: 0.7, bones: 4, rfn: (t) => 0.06 * (1 - t * 0.6), lenSeg: 10, radSeg: 7, sx: 1.8 }, ctx.mat({ color: shade(secondary, 0.1), roughness: 0.3, transparent: true, opacity: 0.85 }));
      const h = pivot(mantle, Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1);
      h.rotation.set(Math.PI / 2, 0, 0);
      h.add(tt.mesh);
      tentacles.push({ bones: tt.bones, i: i + 10, a });
    }
  } else {
    const skin = ctx.mat({ color: primary, map: M.body.map, roughness: 0.45 });
    mantle = pivot(bob, 0, 0.25, -0.05);
    if (squid) {
      ell(ctx, mantle, [0.3, 0.75, 0.3], skin, { pos: [0, 0.55, -0.05], n: 16 });
      for (const sd of [-1, 1]) ell(ctx, mantle, [0.25, 0.25, 0.04], skin, { pos: [sd * 0.25, 1.05, -0.05], rot: [0, 0, sd * 0.6] });
    } else {
      ell(ctx, mantle, [0.45, 0.5, 0.48], skin, { pos: [0, 0.3, -0.18], n: 18 });
      for (let i = 0; i < 5; i++) ell(ctx, mantle, [0.05, 0.03, 0.05], ctx.mat({ color: secondary, roughness: 0.5 }), { pos: [Math.sin(i * 2.3) * 0.25, 0.55 + (i % 2) * 0.1, -0.18 + Math.cos(i * 2.3) * 0.25], small: true });
    }
    ell(ctx, mantle, [0.38, 0.28, 0.35], skin, { pos: [0, -0.05, 0.02] });
    eyes(ctx, mantle, M, { x: 0.2, y: 0.03, z: 0.25, r: 0.1, yaw: 0.5, iris: 0xf0d050 });
    ell(ctx, mantle, [0.05, 0.03, 0.03], M.mouth, { pos: [0, -0.15, 0.33], shadow: false });
    const colorFn = (t, s) => (s < -0.2 ? secondary : primary);
    const tm = ctx.mat({ vertexColors: true, map: M.body.map, roughness: 0.45 });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + Math.PI / n;
      const long = squid && i < 2;
      const tt = skinnedTube(ctx, `otent:${long}:${primary}:${secondary}`, { length: long ? 1.6 : 1.05, bones: 6, rfn: (t) => 0.09 * (1 - t * 0.85) + 0.01, lenSeg: 16, radSeg: 8, colorFn }, tm);
      const h = pivot(mantle, Math.cos(a) * 0.22, -0.2, Math.sin(a) * 0.22);
      h.rotation.y = -a + Math.PI / 2;
      h.rotation.x = 1.1;
      h.add(tt.mesh);
      tentacles.push({ bones: tt.bones, i, a, h });
    }
  }
  ctx.anchors.back = [{ parent: mantle, pos: [0, jelly ? 0.45 : 0.75, -0.18], s: 0.12 }, { parent: mantle, pos: [0.2, jelly ? 0.35 : 0.6, -0.3], s: 0.08 }, { parent: mantle, pos: [-0.2, jelly ? 0.35 : 0.6, -0.3], s: 0.08 }];
  ctx.anchors.mouth = { parent: mantle, pos: [0, -0.15, 0.35], s: 0.05 };
  ctx.anchors.head = { parent: mantle, pos: [0, jelly ? 0.7 : 1.0, -0.1], s: 0.3 };
  function animate(s) {
    const t = s.t, mv = s.move;
    const pulse = Math.sin(t * (2 + mv * 2));
    bob.position.y = Math.sin(t * 1.4) * 0.06 + (jelly ? pulse * 0.05 : 0);
    mantle.rotation.x = mv * 0.35 - s.wind * 0.2 + s.strike * 0.35;
    if (jelly) mantle.scale.set(1 + pulse * 0.07, 1 - pulse * 0.05, 1 + pulse * 0.07);
    tentacles.forEach((T) => {
      T.bones.forEach((b, j) => {
        if (j === 0) return;
        const w = Math.sin(t * 2.2 - j * 0.7 + T.i * 0.9);
        if (jelly) {
          b.rotation.x = w * 0.15;
          b.rotation.y = Math.cos(t * 1.7 - j * 0.6 + T.i) * 0.12;
        } else {
          b.rotation.x = 0.28 + w * 0.12 + mv * -0.15 - s.wind * 0.2 + s.strike * 0.1;
          b.rotation.y = Math.cos(t * 1.6 - j * 0.5 + T.i) * 0.1;
        }
      });
      if (T.h) T.h.rotation.x = 1.1 - s.wind * 0.6 + s.strike * 0.5 - mv * 0.3;
    });
  }
  return { group, flying: true, stride: 1.2, animate, center: new THREE.Vector3(0, jelly ? 0.1 : 0.35, 0) };
}
