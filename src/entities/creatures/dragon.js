// Dragon archetype (dragon, wyvern): winged, horned, long neck & tail. Flying: origin at body centre.
import * as THREE from 'three';
import { basicMats, ell, mesh, pivot, eyes, limbGeo, coneGeo, tubeGeo, shapeGeo, skinnedTube, teeth, shade, clamp } from './rig.js';
import { coatTexture } from './textures.js';
import { membraneWing } from './bird.js';

const num = (v, d) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : d);

export function buildDragon(ctx) {
  const p = ctx.p;
  const { primary, secondary, accent } = ctx.c;
  const M = basicMats(ctx, 'scales');
  const H0 = ctx.spec.height > 0 ? ctx.spec.height : 3;
  const coat = coatTexture({ base: primary, belly: secondary, mark: shade(primary, -0.3), pattern: 'none', noise: 'scales', size: ctx.texSize, seed: 21 });
  const skin = ctx.mat({ map: coat, roughness: 0.55 });
  const plain = ctx.mat({ color: primary, map: M.body.map, roughness: 0.55 });
  const bellyM = ctx.mat({ color: secondary, map: M.body.map, roughness: 0.6 });
  const hornM = ctx.accentMat(accent, { roughness: 0.4 });
  const spikeM = ctx.accentMat(shade(secondary, -0.1), { roughness: 0.45 });
  const group = new THREE.Group();
  const body = pivot(group);
  const bR = 0.42;
  ell(ctx, body, [bR, bR * 1.02, bR * 2.0], skin, { body: true, n: 18 });
  ell(ctx, body, [bR * 0.95, bR * 1.05, bR * 1.0], skin, { body: true, pos: [0, bR * 0.08, bR * 1.1] });
  // neck (skinned)
  const nLen = 1.15;
  const neck = skinnedTube(ctx, `dneck:${primary}:${secondary}`, { length: nLen, bones: 5, rfn: (t) => bR * (0.62 - t * 0.3), lenSeg: 14, radSeg: 10, colorFn: (t, s) => (s < -0.3 ? secondary : primary) }, ctx.mat({ vertexColors: true, map: M.body.map, roughness: 0.55 }));
  const nRoot = pivot(body, 0, bR * 0.45, bR * 1.75);
  nRoot.rotation.x = -Math.PI / 2 + 0.55;
  nRoot.add(neck.mesh);
  const head = pivot(neck.bones[4]);
  const hs = 0.3;
  ell(ctx, head, [hs * 0.8, hs * 0.75, hs * 0.85], plain, { n: 14 });
  ell(ctx, head, [hs * 0.58, hs * 0.42, hs * 1.0], plain, { pos: [0, -hs * 0.05, hs * 0.95] });
  for (const sd of [-1, 1]) {
    ell(ctx, head, [hs * 0.22, hs * 0.13, hs * 0.5], ctx.mat({ color: shade(primary, -0.2), roughness: 0.5 }), { pos: [sd * hs * 0.38, hs * 0.38, hs * 0.35], rot: [0.15, 0, 0] });
    ell(ctx, head, [hs * 0.07, hs * 0.05, hs * 0.05], M.dark, { pos: [sd * hs * 0.2, hs * 0.22, hs * 1.85], small: true });
  }
  eyes(ctx, head, M, { x: hs * 0.48, y: hs * 0.22, z: hs * 0.45, r: hs * 0.2, yaw: 0.6, iris: 0xffd040, slit: true });
  teeth(ctx, head, M.claw, { n: 7, w: hs * 0.85, y: -hs * 0.35, z: hs * 1.75, size: hs * 0.1 });
  const jaw = pivot(head, 0, -hs * 0.35, hs * 0.1);
  ell(ctx, jaw, [hs * 0.5, hs * 0.2, hs * 0.95], bellyM, { pos: [0, -hs * 0.05, hs * 0.8] });
  ell(ctx, jaw, [hs * 0.4, hs * 0.08, hs * 0.8], M.mouth, { pos: [0, hs * 0.1, hs * 0.8], shadow: false });
  // horns
  const hornType = p.horns || 'curved';
  if (hornType !== 'none') {
    const g = tubeGeo(ctx, `dhorn:${hornType}`, hornType === 'straight' ? [[0, 0, 0], [0, 0.4, -0.5], [0, 0.6, -1]] : [[0, 0, 0], [0, 0.35, -0.35], [0, 0.45, -0.8], [0, 0.3, -1.15]], (t) => 0.14 * (1 - t) + 0.01, 12, 8);
    for (const sd of [-1, 1]) {
      mesh(ctx, head, g, hornM, { pos: [sd * hs * 0.4, hs * 0.5, -hs * 0.1], rot: [0, sd * 0.35, 0], scale: hs * 1.1 });
      mesh(ctx, head, coneGeo(ctx, 6), hornM, { pos: [sd * hs * 0.75, hs * 0.0, -hs * 0.2], rot: [-1.3, 0, -sd * 0.9], scale: [hs * 0.08, hs * 0.4, hs * 0.08] });
    }
  }
  // spikes along back + neck
  const spikes = p.spikes !== false;
  if (spikes) {
    for (let i = 0; i < 6; i++) mesh(ctx, body, coneGeo(ctx, 6), spikeM, { pos: [0, bR * 0.98 - Math.abs(i - 2) * 0.02, bR * (1.3 - i * 0.55)], rot: [-0.35, 0, 0], scale: [bR * 0.1, bR * 0.42, bR * 0.22] });
    for (let i = 1; i < 5; i++) mesh(ctx, neck.bones[i], coneGeo(ctx, 6), spikeM, { pos: [0, -bR * 0.48 * (1 - i * 0.07), 0], rot: [-Math.PI / 2 - 0.4, 0, 0], scale: [bR * 0.07, bR * 0.3, bR * 0.15], small: true });
  }
  // tail
  const tLen = clamp(num(p.tailLen, 3.5) / H0, 0.6, 2.2) * 1.8;
  const tail = skinnedTube(ctx, `dtail:${tLen.toFixed(2)}:${primary}:${secondary}`, { length: tLen, bones: 8, rfn: (t) => bR * 0.62 * Math.pow(1 - t, 1.1) + 0.02, lenSeg: 22, radSeg: 10, colorFn: (t, s) => (s < -0.35 ? secondary : primary) }, ctx.mat({ vertexColors: true, map: M.body.map, roughness: 0.55 }));
  const th = pivot(body, 0, bR * 0.1, -bR * 1.8);
  th.rotation.y = Math.PI;
  th.add(tail.mesh);
  const tipB = tail.bones[7];
  mesh(ctx, tipB, shapeGeo(ctx, 'spade', [[0, 0], [0.5, 0.35], [0.4, 0.9], [0, 1.25], [-0.4, 0.9], [-0.5, 0.35]], 0.06, 0.03), spikeM, { rot: [Math.PI / 2, 0, 0], scale: bR * 0.65 });
  if (spikes) for (let i = 1; i < 7; i++) mesh(ctx, tail.bones[i], coneGeo(ctx, 6), spikeM, { pos: [0, bR * 0.55 * (1 - i / 8), 0], rot: [0.35, 0, 0], scale: [bR * 0.06, bR * 0.3 * (1 - i / 9), bR * 0.15], small: i > 3 });
  // wings
  const span = clamp(num(p.wingSpan, 6) / H0, 1, 3.5) * 1.9;
  const memM = ctx.mat({ color: secondary, roughness: 0.7, side: THREE.DoubleSide, ...(ctx.element ? { emissive: ctx.element.color, emissiveIntensity: 0.12 } : {}) });
  const wings = [-1, 1].map((sd) => {
    const w = membraneWing(ctx, memM, plain, span, sd);
    w.root.position.set(sd * bR * 0.6, bR * 0.75, bR * 0.85);
    body.add(w.root);
    return w;
  });
  // legs
  const legs = [];
  for (const [front, z] of [[true, bR * 1.25], [false, -bR * 1.15]]) for (const sd of [-1, 1]) {
    const hip = pivot(body, sd * bR * 0.7, -bR * 0.45, z);
    const up = pivot(hip);
    ell(ctx, up, [bR * 0.28, bR * 0.45, bR * 0.36], skin, { pos: [0, -bR * 0.2, 0] });
    mesh(ctx, up, limbGeo(ctx, 0.45, bR * 0.22, bR * 0.16), plain);
    const kn = pivot(up, 0, -0.45, 0);
    mesh(ctx, kn, limbGeo(ctx, 0.4, bR * 0.16, bR * 0.13), plain);
    const ft = pivot(kn, 0, -0.42, 0);
    for (const a of [-0.4, 0, 0.4]) mesh(ctx, ft, coneGeo(ctx, 5), M.claw, { pos: [Math.sin(a) * bR * 0.15, 0, bR * 0.12], rot: [Math.PI / 2 + 0.3, 0, -a], scale: [bR * 0.06, bR * 0.25, bR * 0.06], small: true });
    ell(ctx, ft, [bR * 0.16, bR * 0.1, bR * 0.22], plain, { pos: [0, 0, bR * 0.05] });
    legs.push({ up, kn, front });
  }
  for (let i = 0; i < 4; i++) ctx.anchors.back.push({ parent: body, pos: [bR * 0.35 * (i % 2 ? 1 : -1), bR * 0.9, bR * (1.1 - i * 0.6)], s: bR * 0.35 });
  ctx.anchors.mouth = { parent: head, pos: [0, -hs * 0.25, hs * 1.7], s: hs * 0.35 };
  ctx.anchors.head = { parent: head, pos: [0, hs * 1.4, 0], s: hs * 1.2 };

  function animate(s) {
    const t = s.t, mv = s.move;
    const f = Math.sin(s.flap);
    body.position.y = -f * 0.08;
    body.rotation.x = mv * 0.12 - s.wind * 0.35 + s.strike * 0.25;
    body.scale.set(1 + s.breath * 0.015, 1 + s.breath * 0.02, 1);
    const amp = 0.6 + mv * 0.15;
    wings.forEach((w, i) => {
      const sd = i ? 1 : -1;
      w.root.rotation.set(0, sd * 0.1, sd * (f * amp + 0.25));
      w.outer.rotation.set(0, sd * -0.1 * f, sd * (Math.max(0, -f) * 0.6 - 0.1));
    });
    let sum = 0.55;
    neck.bones.forEach((b, i) => {
      b.rotation.x = i === 0 ? 0 : 0.22 + Math.sin(t * 1.2 - i * 0.6) * 0.03 + (i > 1 ? -s.wind * 0.12 + s.strike * 0.18 : 0);
      b.rotation.y = Math.sin(t * 0.7 - i * 0.4) * 0.05 * (1 - mv);
      sum += b.rotation.x;
    });
    head.rotation.x = Math.PI / 2 - sum + 0.1 - body.rotation.x * 0.5;
    jaw.rotation.x = 0.05 + s.wind * 0.3 + s.strike * 0.6 + (s.atk < 0 ? Math.max(0, Math.sin(t * 0.7)) ** 8 * 0.3 : 0);
    tail.bones.forEach((b, i) => {
      b.rotation.y = Math.sin(t * 1.5 - i * 0.55) * (0.07 + mv * 0.05);
      b.rotation.x = i === 0 ? 0.25 : Math.sin(s.flap - i * 0.6) * 0.04 - 0.02;
    });
    legs.forEach((L, i) => {
      L.up.rotation.x = (L.front ? -0.4 : 0.6) + mv * (L.front ? -0.3 : 0.5) + Math.sin(t * 1.5 + i) * 0.05;
      L.kn.rotation.x = L.front ? 1.0 : -0.3 + mv * 0.4;
    });
  }
  return { group, flying: true, stride: 2, animate, center: new THREE.Vector3(0, 0, 0) };
}
