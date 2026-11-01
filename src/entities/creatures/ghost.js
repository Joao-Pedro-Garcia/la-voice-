// Ghost archetype: floating translucent sheet with wavy hem, nub arms and a spooky-cute face.
import * as THREE from 'three';
import { getGeometry } from './materials.js';
import { basicMats, ell, mesh, pivot, shade, TAU } from './rig.js';

function ghostGeo(ctx) {
  const w = ctx.segs(24), h = ctx.segs(14);
  return getGeometry(`ghost:${w}:${h}`, () => {
    const g = new THREE.SphereGeometry(1, w, h, 0, TAU, 0, Math.PI * 0.62);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      if (v.y < 0.3) {
        // extend into a skirt below the dome
        const k = (0.3 - v.y) / 1.3;
        const ang = Math.atan2(v.z, v.x);
        v.y -= k * 1.7 + (v.y < -0.35 ? Math.sin(ang * 6) * 0.12 : 0);
        v.x *= 1 + k * 0.25;
        v.z *= 1 + k * 0.25;
      }
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
}

export function buildGhost(ctx) {
  const { primary, secondary, accent } = ctx.c;
  const M = basicMats(ctx, 'skin');
  const sheet = ctx.mat({ color: primary, emissive: secondary, emissiveIntensity: 0.25, roughness: 0.6, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
  const dark = ctx.mat({ color: accent, roughness: 0.3 });
  const group = new THREE.Group();
  const float = pivot(group);
  const body = pivot(float);
  const skin = mesh(ctx, body, ghostGeo(ctx), sheet, { scale: [0.5, 0.55, 0.48] });
  const face = pivot(body, 0, 0.05, 0.47);
  const eyeL = [];
  for (const sd of [-1, 1]) {
    const e = pivot(face, sd * 0.14, 0.05, 0.03);
    e.rotation.y = sd * 0.3;
    ell(ctx, e, [0.07, 0.11, 0.04], dark, {});
    ell(ctx, e, [0.02, 0.025, 0.01], M.highlight, { pos: [-0.02, 0.04, 0.04], small: true });
    eyeL.push(e);
    ctx.eyes.push(e);
  }
  const mouth = ell(ctx, face, [0.06, 0.07, 0.03], dark, { pos: [0, -0.13, 0.03] });
  for (const sd of [-1, 1]) ell(ctx, face, [0.05, 0.025, 0.01], ctx.mat({ color: 0xff9ab8, transparent: true, opacity: 0.6 }), { pos: [sd * 0.25, -0.07, -0.01], rot: [0, sd * 0.5, 0], small: true });
  const arms = [];
  for (const sd of [-1, 1]) {
    const a = pivot(body, sd * 0.48, -0.15, 0.05);
    ell(ctx, a, [0.1, 0.22, 0.1], sheet, { pos: [sd * 0.06, -0.12, 0], rot: [0, 0, sd * 0.5] });
    arms.push({ a, sd });
  }
  ctx.anchors.back = [{ parent: body, pos: [0, 0.5, -0.2], s: 0.07 }, { parent: body, pos: [0, 0.25, -0.42], s: 0.06 }];
  ctx.anchors.mouth = { parent: face, pos: [0, -0.13, 0.05], s: 0.05 };
  ctx.anchors.head = { parent: body, pos: [0, 0.75, 0], s: 0.3 };
  const pos0 = skin.geometry;
  function animate(s) {
    const t = s.t, mv = s.move;
    float.position.y = Math.sin(t * 1.8) * 0.08;
    body.rotation.x = mv * 0.25 + s.run * 0.15 - s.wind * 0.3 + s.strike * 0.4;
    body.rotation.z = Math.sin(t * 1.3) * 0.08;
    body.position.z = s.strike * 0.3;
    skin.scale.set(0.5 + Math.sin(t * 3) * 0.015, 0.55 - Math.sin(t * 3) * 0.02, 0.48);
    mouth.scale.set(0.06, 0.07 + s.wind * 0.08 + Math.max(0, Math.sin(t * 0.9)) * 0.02, 0.03);
    arms.forEach((A, i) => (A.a.rotation.z = A.sd * (Math.sin(t * 2.5 + i * 2) * 0.3 + s.wind * 1.2 - mv * 0.4)));
  }
  return { group, flying: true, stride: 1, animate, center: new THREE.Vector3(0, 0, 0) };
}
