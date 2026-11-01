// Bird archetype (eagle, phoenix, chicken, penguin, duck, owl, parrot, ostrich, bat...)
// plus wing builders shared with quadruped (pegasus) and dragon.
import * as THREE from 'three';
import { basicMats, ell, mesh, pivot, eyes, limbGeo, sphereGeo, coneGeo, tubeGeo, shapeGeo, shade, lerp, TAU } from './rig.js';
import { gradientTexture } from './textures.js';

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

// Feathered wing extending along +X*side. Returns { root, outer }.
export function featherWing(ctx, mat, tipMat, span, side) {
  const h = span / 2;
  const root = new THREE.Group();
  const inner = shapeGeo(ctx, `fwi:${side}`, [[0, -0.06], [0.46, -0.07], [0.48, 0.24], [0.32, 0.34], [0.16, 0.37], [0, 0.32]].map(([x, y]) => [x * side, y]), 0.05, 0.02);
  mesh(ctx, root, inner, mat, { rot: [-Math.PI / 2, 0, 0], scale: [h, h, h * 0.6] });
  const outer = pivot(root, 0.45 * h * side, 0, 0);
  const op = [[0, -0.07], [0.3, -0.06], [0.52, 0.0], [0.58, 0.06], [0.5, 0.12], [0.47, 0.1], [0.42, 0.2], [0.37, 0.17], [0.3, 0.27], [0.24, 0.24], [0.16, 0.31], [0.08, 0.28], [0, 0.3]];
  const og = shapeGeo(ctx, `fwo:${side}`, op.map(([x, y]) => [x * side, y]), 0.04, 0.015, false);
  mesh(ctx, outer, og, tipMat, { rot: [-Math.PI / 2, 0, 0], scale: [h, h, h * 0.6] });
  // covert feathers band
  ell(ctx, root, [0.25 * h, 0.035 * h, 0.09 * h], mat, { pos: [0.22 * h * side, 0.01 * h, 0.02 * h] });
  return { root, outer };
}

// Leathery wing with finger bones (bat, dragon). Returns { root, outer }.
export function membraneWing(ctx, memMat, boneMat, span, side) {
  const h = span / 2;
  const root = new THREE.Group();
  const ip = [[0, -0.02], [0.42, -0.05], [0.42, 0.28], [0.3, 0.38], [0.15, 0.36], [0, 0.45]];
  mesh(ctx, root, shapeGeo(ctx, `mwi:${side}`, ip.map(([x, y]) => [x * side, y]), 0.02, 0.008), memMat, { rot: [-Math.PI / 2, 0, 0], scale: [h, h, h] });
  const arm = tubeGeo(ctx, 'wingbone', [[0, 0, 0], [0.5, 0.02, 0], [1, 0, 0]], (t) => 0.035 * (1 - t * 0.5), 6, 6);
  mesh(ctx, root, arm, boneMat, { scale: [0.43 * h, h, h], rot: [0, side > 0 ? 0 : Math.PI, 0] });
  const outer = pivot(root, 0.42 * h * side, 0, 0);
  const op = [[0, -0.05], [0.58, 0.0], [0.4, 0.16], [0.42, 0.42], [0.24, 0.33], [0.16, 0.6], [0.06, 0.38], [0, 0.3]];
  mesh(ctx, outer, shapeGeo(ctx, `mwo:${side}`, op.map(([x, y]) => [x * side, y]), 0.02, 0.008, false), memMat, { rot: [-Math.PI / 2, 0, 0], scale: [h, h, h] });
  for (const [x, y] of [[0.58, 0.0], [0.42, 0.42], [0.16, 0.6]]) {
    const len = Math.hypot(x, y);
    const fg = tubeGeo(ctx, 'finger', [[0, 0, 0], [0.5, 0, 0], [1, 0, 0]], (t) => 0.03 * (1 - t * 0.7), 6, 5);
    const m = mesh(ctx, outer, fg, boneMat, { scale: [len * h, h, h] });
    m.rotation.y = side > 0 ? Math.atan2(y, x) : Math.PI - Math.atan2(y, x);
  }
  mesh(ctx, outer, coneGeo(ctx, 5), boneMat, { pos: [0, 0.02 * h, -0.02 * h], rot: [0, 0, -side * 0.6], scale: [0.025 * h, 0.08 * h, 0.025 * h], small: true });
  return { root, outer };
}

export function buildBird(ctx) {
  const p = ctx.p;
  const { primary, secondary, accent } = ctx.c;
  const bat = !!p.bat, owl = !!p.owl, penguin = !!p.penguin, longNeck = !!p.longNeck;
  const flightless = !!p.flightless || penguin;
  const M = basicMats(ctx, bat ? 'fur' : 'skin');
  const H0 = ctx.spec.height > 0 ? ctx.spec.height : 1;
  const span = Math.max(0.6, num(p.wingSpan, 1.6) / H0);
  const beak = p.beak || (bat ? 'none' : 'short');
  const featherMat = ctx.mat({ color: primary, map: M.body.map, roughness: 0.85 });
  const chestMat = ctx.mat({ color: owl || penguin || flightless ? secondary : shade(primary, 0.12), map: M.body.map, roughness: 0.85 });
  const wingMat = ctx.mat({ color: primary, roughness: 0.85, side: THREE.DoubleSide });
  const tipMat = ctx.mat({ color: p.flameTail ? secondary : shade(primary, -0.18), roughness: 0.85, side: THREE.DoubleSide, ...(p.flameTail ? { emissive: secondary, emissiveIntensity: 0.4 } : {}) });
  const beakMat = ctx.accentMat(accent, { roughness: 0.35 });
  const legMat = ctx.mat({ color: penguin || flightless ? accent : 0xe0a030, roughness: 0.55 });

  const group = new THREE.Group();
  const legH = longNeck ? 0.75 : penguin ? 0.06 : flightless ? 0.22 : 0.2;
  const bodyR = bat ? 0.17 : penguin ? 0.28 : 0.27;
  const body = pivot(group, 0, flightless ? legH + bodyR * 0.85 : 0, 0);
  const pitch = penguin ? -1.35 : owl ? -1.0 : longNeck ? 0.05 : flightless ? -0.25 : bat ? -0.3 : 0.05;
  body.rotation.x = pitch;
  const bodyIn = pivot(body);
  ell(ctx, bodyIn, [bodyR, bodyR * 0.95, bodyR * (penguin ? 1.5 : bat ? 1.25 : 1.45)], bat ? M.body : featherMat, { body: true, n: 18 });
  ell(ctx, bodyIn, [bodyR * 0.8, bodyR * 0.8, bodyR * (penguin ? 1.35 : 1.1)], chestMat, { body: true, pos: [0, -bodyR * 0.25, bodyR * 0.15] });

  // neck + head
  const headR = owl ? 0.24 : bat ? 0.14 : penguin ? 0.19 : longNeck ? 0.11 : 0.16;
  const neck = pivot(bodyIn, 0, bodyR * 0.5, bodyR * (penguin ? 1.2 : 1.15));
  neck.rotation.x = -pitch - (longNeck ? 0.25 : 0.3);
  let neckLen = owl || penguin ? 0.02 : bat ? 0.02 : longNeck ? 0.75 : flightless ? 0.14 : 0.12;
  if (neckLen > 0.05) mesh(ctx, neck, limbGeo(ctx, neckLen, longNeck ? 0.06 : bodyR * 0.45, longNeck ? 0.05 : headR * 0.7), longNeck ? ctx.mat({ color: 0xd9a0a0, roughness: 0.8 }) : featherMat, { rot: [Math.PI, 0, 0] });
  const head = pivot(neck, 0, neckLen + headR * 0.4, 0);
  head.rotation.x = 0.25;
  ell(ctx, head, [headR, headR * (owl ? 0.92 : 1), headR * (bat ? 1.05 : 1)], bat ? M.body : featherMat, { n: 14 });
  if (owl) {
    for (const sd of [-1, 1]) ell(ctx, head, [headR * 0.42, headR * 0.45, headR * 0.12], chestMat, { pos: [sd * headR * 0.4, headR * 0.05, headR * 0.82], rot: [0, sd * 0.35, 0] });
    for (const sd of [-1, 1]) mesh(ctx, head, coneGeo(ctx, 6), featherMat, { pos: [sd * headR * 0.6, headR * 0.65, 0], rot: [0, 0, -sd * 0.45], scale: [headR * 0.18, headR * 0.5, headR * 0.12] });
  }
  if (penguin) ell(ctx, head, [headR * 0.75, headR * 0.6, headR * 0.3], chestMat, { pos: [0, -headR * 0.15, headR * 0.72] });
  const eR = owl ? headR * 0.3 : headR * 0.28;
  eyes(ctx, head, M, { x: headR * (owl ? 0.4 : 0.55), y: headR * 0.18, z: headR * (owl ? 0.85 : 0.7), r: eR, yaw: owl ? 0.15 : bat ? 0.3 : 0.75, iris: owl ? accent : beak === 'hook' ? 0xf2c14e : null });
  // beak
  const beakPivot = pivot(head, 0, -headR * 0.05, headR * 0.85);
  let lower = null;
  if (beak === 'hook') {
    const g = tubeGeo(ctx, 'hookbeak', [[0, 0.06, -0.05], [0, 0.06, 0.25], [0, -0.06, 0.45], [0, -0.22, 0.42]], (t) => 0.16 * (1 - t) + 0.01, 12, 8);
    mesh(ctx, beakPivot, g, beakMat, { scale: [headR * 1.1, headR * 1.3, headR * 1.3] });
    lower = pivot(beakPivot, 0, -headR * 0.08, 0);
    mesh(ctx, lower, coneGeo(ctx, 8), beakMat, { rot: [Math.PI / 2, 0, 0], scale: [headR * 0.12, headR * 0.4, headR * 0.07] });
  } else if (beak === 'duck') {
    ell(ctx, beakPivot, [headR * 0.45, headR * 0.12, headR * 0.6], beakMat, { pos: [0, 0, headR * 0.35] });
    lower = pivot(beakPivot, 0, -headR * 0.1, 0);
    ell(ctx, lower, [headR * 0.4, headR * 0.07, headR * 0.5], beakMat, { pos: [0, 0, headR * 0.3] });
  } else if (beak !== 'none') {
    const L = longNeck ? 0.55 : 0.45;
    mesh(ctx, beakPivot, coneGeo(ctx, 8), beakMat, { pos: [0, headR * 0.03, 0], rot: [Math.PI / 2, 0, 0], scale: [headR * 0.22, headR * L, headR * 0.15] });
    lower = pivot(beakPivot, 0, -headR * 0.06, 0);
    mesh(ctx, lower, coneGeo(ctx, 8), beakMat, { rot: [Math.PI / 2, 0, 0], scale: [headR * 0.17, headR * L * 0.8, headR * 0.08] });
  }
  if (bat) {
    ell(ctx, head, [headR * 0.35, headR * 0.3, headR * 0.4], M.body, { pos: [0, -headR * 0.25, headR * 0.75] });
    ell(ctx, head, [headR * 0.12, headR * 0.08, headR * 0.06], M.nose, { pos: [0, -headR * 0.12, headR * 1.12] });
    for (const sd of [-1, 1]) {
      mesh(ctx, head, coneGeo(ctx, 8), M.body, { pos: [sd * headR * 0.55, headR * 0.55, -headR * 0.1], rot: [0, 0, -sd * 0.35], scale: [headR * 0.35, headR * 1.0, headR * 0.15] });
      mesh(ctx, head, coneGeo(ctx, 5), M.claw, { pos: [sd * headR * 0.15, -headR * 0.48, headR * 0.98], rot: [Math.PI, 0, 0], scale: [headR * 0.05, headR * 0.16, headR * 0.05], small: true });
    }
  }
  if (p.comb) {
    const red = ctx.mat({ color: secondary, roughness: 0.6 });
    for (let i = 0; i < 3; i++) ell(ctx, head, [headR * 0.14, headR * 0.25, headR * 0.17], red, { pos: [0, headR * (0.9 + (i === 1 ? 0.1 : 0)), headR * (0.35 - i * 0.3)] });
    ell(ctx, head, [headR * 0.1, headR * 0.2, headR * 0.1], red, { pos: [0, -headR * 0.55, headR * 0.85] });
  }
  if (p.flameTail) {
    const fl = ctx.mat({ color: secondary, emissive: secondary, emissiveIntensity: 0.6, roughness: 0.6 });
    for (let i = 0; i < 3; i++) mesh(ctx, head, coneGeo(ctx, 6), fl, { pos: [0, headR * 0.7, -headR * 0.2 * i], rot: [-0.5 - i * 0.35, 0, 0], scale: [headR * 0.12, headR * (0.7 - i * 0.1), headR * 0.12] });
  }

  // wings
  let wings;
  if (bat) {
    const mem = ctx.mat({ color: secondary, roughness: 0.75, side: THREE.DoubleSide });
    wings = [-1, 1].map((sd) => membraneWing(ctx, mem, M.body, span * 0.95, sd));
  } else if (penguin) {
    wings = [-1, 1].map((sd) => {
      const root = new THREE.Group();
      ell(ctx, root, [0.25 * 0.5, 0.03, 0.09], featherMat, { pos: [sd * 0.12, 0, 0] });
      return { root, outer: pivot(root) };
    });
  } else {
    const ws = flightless ? Math.max(0.9, span) * 0.8 : span;
    wings = [-1, 1].map((sd) => featherWing(ctx, wingMat, tipMat, ws, sd));
  }
  wings.forEach((w, i) => {
    const sd = i ? 1 : -1;
    w.root.position.set(sd * bodyR * 0.7, bodyR * (bat ? 0.3 : 0.45), bodyR * 0.45);
    bodyIn.add(w.root);
  });

  // tail
  const tail = pivot(bodyIn, 0, bodyR * 0.15, -bodyR * 1.3);
  if (p.flameTail) {
    const flame = ctx.mat({ map: gradientTexture(0xffe070, 0xff3000), emissive: 0xff5a00, emissiveIntensity: 0.55, roughness: 0.6, side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.28;
      const g = tubeGeo(ctx, 'plume', [[0, 0, 0], [0, -0.1, -0.5], [0, 0.05, -1.0], [0, -0.1, -1.4]], (t) => 0.07 * Math.sin(Math.PI * (0.15 + t * 0.85)) + 0.01, 14, 6);
      mesh(ctx, tail, g, flame, { rot: [0.2, a, 0], scale: 0.55 + (i % 2) * 0.15 });
    }
  } else if (p.tailFan && !bat && !owl) {
    for (let i = 0; i < 5; i++) {
      const a = (i - 2) * 0.32;
      ell(ctx, tail, [0.07, 0.02, 0.24], tipMat, { pos: [Math.sin(a) * 0.15, 0, -Math.cos(a) * 0.2], rot: [flightless ? -0.9 : 0.05, a, 0] });
    }
  } else if (!bat) {
    ell(ctx, tail, [0.1, 0.03, 0.16], tipMat, { pos: [0, 0, -0.1], rot: [penguin ? 0.6 : 0.2, 0, 0] });
  }

  // legs
  const legs = [];
  for (const sd of [-1, 1]) {
    const hip = pivot(bodyIn, sd * bodyR * 0.4, -bodyR * 0.65, -bodyR * 0.05);
    const leg = pivot(hip);
    leg.rotation.x = -pitch;
    const thick = longNeck ? 0.05 : 0.025;
    if (!penguin) {
      ell(ctx, leg, [bodyR * 0.3, bodyR * 0.35, bodyR * 0.3], featherMat, { pos: [0, -bodyR * 0.05, 0] });
      mesh(ctx, leg, limbGeo(ctx, legH + bodyR * 0.2, thick * 1.4, thick), legMat);
    }
    const foot = pivot(leg, 0, -(legH + bodyR * 0.2) - (penguin ? -bodyR * 0.15 : 0), 0);
    const toeL = longNeck ? 0.16 : penguin ? 0.13 : 0.12;
    for (const a of penguin ? [-0.35, 0, 0.35] : [-0.5, 0, 0.5, Math.PI]) {
      mesh(ctx, foot, limbGeo(ctx, toeL * (a === Math.PI ? 0.5 : 1), thick, thick * 0.6, 6), legMat, { rot: [-Math.PI / 2, a, 0], scale: penguin ? [2.4, 1, 1] : 1 });
    }
    legs.push({ hip, leg, foot });
  }

  // anchors
  for (let i = 0; i < 3; i++) ctx.anchors.back.push({ parent: bodyIn, pos: [0, bodyR * 0.9, bodyR * (0.6 - i * 0.6)], s: bodyR * 0.3 });
  ctx.anchors.mouth = { parent: beakPivot, pos: [0, 0, headR * 0.3], s: headR * 0.3 };
  ctx.anchors.head = { parent: head, pos: [0, headR * 1.5, 0], s: headR * 0.9 };

  const flying = !flightless;
  const baseY = body.position.y;
  function animate(s) {
    const t = s.t, mv = s.move;
    bodyIn.scale.set(1 + s.breath * 0.02, 1 + s.breath * 0.02, 1);
    if (flying) {
      const f = Math.sin(s.flap);
      const amp = 0.55 + mv * 0.3 + s.run * 0.15;
      body.position.y = baseY - f * 0.05 * (1 + mv);
      body.rotation.x = pitch + mv * 0.15 + s.strike * 0.5 - s.wind * 0.3;
      body.position.z = s.strike * 0.4;
      wings.forEach((w, i) => {
        const sd = i ? 1 : -1;
        w.root.rotation.set(0, 0, sd * (f * amp + 0.15 + s.wind * 0.5));
        w.outer.rotation.set(0, 0, sd * (bat ? Math.max(0, -f) * 0.7 : f * 0.35 + Math.max(0, -f) * 0.25));
      });
      legs.forEach((L) => {
        L.leg.rotation.x = -pitch + 0.9 - s.strike * 1.6;
        L.foot.rotation.x = s.strike * 0.5;
      });
      tail.rotation.x = Math.sin(s.flap + 1) * 0.08;
      head.rotation.x = 0.25 - mv * 0.15 + s.strike * 0.3;
      head.rotation.y = Math.sin(t * 0.6) * 0.25 * (1 - mv);
    } else {
      const ph = s.phase;
      const waddle = penguin ? Math.sin(ph) * 0.18 * mv : 0;
      body.rotation.z = waddle;
      body.position.y = baseY + Math.abs(Math.cos(ph)) * 0.03 * mv * (1 + s.run);
      body.rotation.x = pitch + s.run * 0.25 * mv + s.wind * 0.3 - s.strike * 0.1;
      legs.forEach((L, i) => {
        const sw = Math.sin(ph + i * Math.PI) * (penguin ? 0.25 : 0.6 + s.run * 0.3) * mv;
        L.leg.rotation.x = -body.rotation.x - sw;
        L.foot.rotation.x = Math.max(0, Math.cos(ph + i * Math.PI)) * 0.5 * mv;
      });
      const bob = mv ? Math.sin(ph * 2) * 0.15 * mv : 0;
      head.rotation.x = 0.25 + bob + s.wind * -0.4 + s.strike * 0.9;
      head.rotation.y = Math.sin(t * 0.8) * 0.4 * (1 - mv) * (Math.sin(t * 0.3) > 0 ? 1 : 0.2);
      wings.forEach((w, i) => {
        const sd = i ? 1 : -1;
        const flapK = s.run * mv * Math.sin(s.flap * 2) * 0.4 + s.wind * 0.6;
        if (penguin) {
          w.root.rotation.set(0, 0, sd * (-1.2 + 0.25 + Math.sin(ph) * 0.2 * mv + flapK));
        } else {
          w.root.rotation.set(0.1, sd * 1.35, sd * (-0.3 + flapK));
          w.outer.rotation.set(0, sd * 0.25, 0);
        }
      });
      tail.rotation.x = Math.sin(t * 2) * 0.05;
    }
    if (lower) lower.rotation.x = s.wind * 0.6 + (s.atk < 0 ? Math.max(0, Math.sin(t * 0.9)) ** 8 * 0.3 : 0);
  }
  return { group, flying, stride: flightless ? (longNeck ? 1.4 : 0.5) : 1.5, animate, center: new THREE.Vector3(0, 0, 0) };
}
