// Quadruped archetype: big cats, canines, bears, hoofed animals, elephants, rhinos, crocodiles,
// rabbits/rodents, frogs, pegasus... driven entirely by catalog params.
import * as THREE from 'three';
import {
  basicMats, ell, mesh, pivot, eyes, limbGeo, sphereGeo, coneGeo, cylGeo, tubeGeo, shapeGeo, skinnedTube, teeth,
  legSwing, legLift, lerp, clamp, shade, TAU,
} from './rig.js';
import { coatTexture, darker, luminance } from './textures.js';
import { featherWing } from './bird.js';
import { buildFrog } from './frog.js';

const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

export function buildQuadruped(ctx) {
  const p = ctx.p;
  if (p.frog) return buildFrog(ctx);
  const bodyLen = num(p.bodyLen, 1.6), G = num(p.bodyGirth, 1), legLen = Math.max(0.12, num(p.legLen, 0.6));
  const neckLen = Math.max(0, num(p.neckLen, 0.3)), H = num(p.headSize, 0.35), snout = Math.max(0.03, num(p.snoutLen, 0.25));
  const pattern = p.pattern || 'none';
  const { primary, secondary, accent } = ctx.c;
  const hoofed = p.hoof ?? ((legLen / bodyLen >= 0.45 && snout >= 0.4) || ['bull', 'small', 'triple', 'single'].includes(p.horns));
  const predator = !hoofed && !p.trunk && G < 1.6 && p.tail !== 'puff' && ['round', 'pointy', 'floppy'].includes(p.ears);
  const reptile = pattern === 'scales' || p.tail === 'reptile';
  const noise = reptile ? 'scales' : p.trunk || hoofed && !p.mane ? 'skin' : 'fur';
  const M = basicMats(ctx, noise);
  const bellyOn = luminance(secondary) > luminance(primary) * 1.05;
  const mark = pattern === 'panda' ? secondary : darker(secondary, accent);
  const sz = ctx.texSize;
  const coat = coatTexture({ base: primary, belly: bellyOn ? secondary : null, mark, pattern, noise, size: sz, seed: 3 });
  const bodyMat = ctx.mat({ map: coat, roughness: reptile ? 0.6 : 0.85 });
  const limbPattern = pattern === 'stripes' ? 'rings' : pattern === 'spots' ? 'spots' : 'none';
  const limbMat = pattern === 'panda' ? ctx.mat({ color: secondary, map: M.body.map, roughness: 0.9 })
    : limbPattern !== 'none' ? ctx.mat({ map: coatTexture({ base: primary, mark, pattern: limbPattern, noise, size: sz / 2, seed: 5, wrap: true }), roughness: 0.85 })
      : M.body;
  const hairCol = p.mane && hoofed ? secondary : p.mane ? accent : primary;
  const hairMat = ctx.mat({ color: hairCol, map: M.body.map, roughness: 0.9 });
  const muzzleMat = bellyOn ? M.belly : M.body;
  const noseMat = luminance(accent) < 0.25 ? ctx.mat({ color: accent, roughness: 0.35 }) : M.nose;

  const hopper = p.tail === 'puff';
  const ry = bodyLen * 0.155 * Math.pow(G, 0.75) * (hopper ? 1.5 : 1), rx = ry * 0.9, bl = bodyLen * 0.36;
  const lr = ry * 0.3 * (hoofed ? 0.8 : 1) + legLen * 0.03;
  const bodyY = legLen + ry * 0.35;

  const group = new THREE.Group();
  const torso = pivot(group, 0, bodyY, 0);
  const breathe = pivot(torso);
  ell(ctx, breathe, [rx, ry, bl], bodyMat, { body: true, n: 18 });
  ell(ctx, breathe, [rx * 1.02, ry * 1.04, bl * 0.5], bodyMat, { body: true, pos: [0, ry * 0.06, bl * 0.42] });
  ell(ctx, breathe, [rx * 0.96, ry * 0.97, bl * 0.48], bodyMat, { body: true, pos: [0, ry * 0.02, -bl * 0.46] });
  if (p.hump) {
    ell(ctx, breathe, [rx * 0.6, ry * 0.7, bl * 0.35], M.body, { pos: [0, ry * 0.8, -bl * 0.05] });
  }
  if (p.furry) {
    for (let i = 0; i < 9; i++) {
      const a = (i / 8) * Math.PI;
      ell(ctx, breathe, [rx * 0.35, ry * 0.5, bl * 0.4], hairMat, { pos: [Math.cos(a) * rx * 0.8, -ry * 0.45 - Math.sin(a) * 0.1 * ry, (i % 3 - 1) * bl * 0.5] });
    }
  }
  if (reptile) {
    const ridge = ctx.mat({ color: shade(primary, -0.25), roughness: 0.7 });
    for (let i = 0; i < 9; i++) {
      const z = bl * (0.8 - i * 0.2);
      for (const sx of [-1, 1]) mesh(ctx, breathe, coneGeo(ctx, 5), ridge, { pos: [sx * rx * 0.3, ry * Math.sqrt(Math.max(0.05, 1 - (z / bl) ** 2)) * 0.92, z], scale: [ry * 0.08, ry * 0.18, ry * 0.12], small: true });
    }
  }

  // ---- legs ----
  const legs = [];
  const hipZ = bl * 0.62;
  const mkLeg = (side, front) => {
    const hip = pivot(torso, side * rx * 0.62, -ry * 0.35, front ? hipZ : -hipZ);
    const pawH = hoofed ? lr * 0.55 : lr * 0.6;
    const a1 = front ? 0 : -0.28, a2 = front ? 0 : 0.5;
    let u = (legLen - pawH) * 0.5, l = (legLen - pawH) * 0.5;
    const k = (legLen - pawH) / (u * Math.cos(a1) + l * Math.cos(a1 + a2));
    u *= k;
    l *= k;
    // shoulder / haunch muscle
    ell(ctx, hip, [lr * 1.5, lr * 2.3, lr * (front ? 1.7 : 2.1)], front && pattern === 'panda' ? limbMat : bodyMat, { pos: [0, -lr * 0.4, 0] });
    const upper = pivot(hip);
    mesh(ctx, upper, limbGeo(ctx, u, lr * 1.25, lr * 0.85), limbMat);
    const knee = pivot(upper, 0, -u, 0);
    mesh(ctx, knee, limbGeo(ctx, l, lr * 0.85, lr * 0.72), limbMat);
    const foot = pivot(knee, 0, -l, 0);
    if (hoofed) {
      mesh(ctx, foot, cylGeo(ctx, 10, 0.85), ctx.mat({ color: 0x3a3030, roughness: 0.5 }), { pos: [0, -pawH, 0], scale: [lr * 0.95, pawH * 1.05, lr * 0.95] });
    } else if (p.trunk) {
      mesh(ctx, foot, cylGeo(ctx, 12, 0.95), limbMat, { pos: [0, -pawH, 0], scale: [lr * 1.05, pawH * 1.1, lr * 1.05] });
      for (let i = -1; i <= 1; i++) ell(ctx, foot, [lr * 0.22, lr * 0.2, lr * 0.15], M.claw, { pos: [i * lr * 0.5, -pawH * 0.75, lr * 0.92], small: true });
    } else {
      ell(ctx, foot, [lr * 1.05, pawH * 0.85, lr * 1.35], front && pattern === 'panda' ? limbMat : limbMat, { pos: [0, -pawH * 0.15, lr * 0.35] });
      if (predator) for (let i = -1; i <= 1; i++) mesh(ctx, foot, coneGeo(ctx, 5), M.claw, { pos: [i * lr * 0.45, -pawH * 0.6, lr * 1.45], rot: [Math.PI / 2, 0, 0], scale: [lr * 0.12, lr * 0.35, lr * 0.12], small: true });
    }
    upper.rotation.x = a1;
    knee.rotation.x = a2;
    return { hip, upper, knee, front, side, a1, a2 };
  };
  for (const front of [true, false]) for (const side of [-1, 1]) legs.push(mkLeg(side, front));

  // ---- neck + head ----
  const tilt = lerp(1.15, 0.22, clamp(neckLen / 1.6, 0, 1));
  const neckBase = pivot(torso, 0, ry * 0.4, bl * 0.82);
  neckBase.rotation.x = tilt;
  const neckR0 = ry * 0.62, neckR1 = Math.max(H * 0.38, neckR0 * 0.55);
  const neckL = neckLen + H * 0.15;
  mesh(ctx, neckBase, limbGeo(ctx, neckL, neckR0, neckR1), pattern === 'spots' || pattern === 'stripes' ? limbMat : M.body, { rot: [Math.PI, 0, 0] });
  if (p.mane && neckLen >= 0.45) {
    const n = Math.max(4, Math.round(neckLen * 7));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      ell(ctx, neckBase, [neckR0 * 0.28, neckR0 * 0.55, neckR0 * 0.45], hairMat, { pos: [0, t * neckL, -lerp(neckR0, neckR1, t) * 0.85], rot: [-0.4, 0, 0] });
    }
  }
  const head = pivot(neckBase, 0, neckL, 0);
  head.rotation.x = -tilt + (neckLen > 0.5 ? 0.25 : 0.1);
  const headIn = pivot(head, 0, H * 0.05, H * 0.12);
  buildHead(ctx, headIn, M, { H, snout, primary, secondary, accent, hairMat, muzzleMat, noseMat, predator, hoofed, reptile, pattern, limbMat, neckLen });
  const jaw = headIn.userData.jaw;
  const trunk = headIn.userData.trunk;
  const ears = headIn.userData.ears;

  if (p.frill) {
    const fr = shapeGeo(ctx, 'frill', [[-1, 0], [-1.1, 0.6], [-0.7, 1.1], [0, 1.3], [0.7, 1.1], [1.1, 0.6], [1, 0], [0, -0.2]], 0.15, 0.06);
    mesh(ctx, headIn, fr, ctx.mat({ color: secondary, roughness: 0.7 }), { pos: [0, H * 0.1, -H * 0.35], rot: [-0.5, 0, 0], scale: H * 0.9 });
    for (let i = 0; i < 7; i++) {
      const a = -1.2 + i * 0.4;
      ell(ctx, headIn, [H * 0.08, H * 0.08, H * 0.08], M.accent, { pos: [Math.sin(a) * H * 1.05, H * 0.1 + Math.cos(a) * H * 1.05 * 0.87, -H * 0.35 - Math.cos(a) * H * 0.48], small: true });
    }
  }

  // ---- tail ----
  const tailType = p.tail || 'thin';
  let tail = null;
  const tailBase = pivot(torso, 0, ry * 0.3, -bl * 0.95);
  if (tailType === 'puff') {
    ell(ctx, tailBase, [ry * 0.3, ry * 0.3, ry * 0.3], ctx.mat({ color: secondary, map: M.body.map, roughness: 0.95 }), { pos: [0, 0.05 * ry, 0] });
  } else if (tailType !== 'none') {
    const T = {
      thin: { len: bodyLen * 0.4, r: (t) => lr * 0.35 * (1 - t * 0.6), droop: 1.2, curl: 0.05, mat: M.body },
      tuft: { len: bodyLen * 0.45, r: (t) => lr * 0.32 * (1 - t * 0.5), droop: 0.9, curl: -0.08, mat: M.body },
      long: { len: bodyLen * 0.6, r: (t) => lr * 0.42 * (1 - t * 0.45), droop: 0.75, curl: -0.18, mat: limbPattern === 'rings' ? limbMat : M.body },
      bushy: hoofed
        ? { len: bodyLen * 0.45, r: (t) => ry * (0.12 + 0.2 * Math.sin(Math.min(1, t * 1.3) * 1.6)), droop: 1.2, curl: 0.04, mat: hairMat }
        : { len: bodyLen * 0.45, r: (t) => ry * 0.35 * Math.sin(Math.PI * (0.12 + t * 0.85)), droop: 0.75, curl: 0.04, mat: M.body },
      reptile: { len: bodyLen * 0.85, r: (t) => ry * 0.7 * (1 - t) + 0.01, droop: 0.12, curl: 0.0, mat: bodyMat },
    }[tailType] || { len: bodyLen * 0.4, r: (t) => lr * 0.35, droop: 1.1, curl: 0, mat: M.body };
    const key = `qtail:${tailType}:${T.len.toFixed(3)}:${ry.toFixed(3)}:${lr.toFixed(3)}:${hoofed}`;
    tail = skinnedTube(ctx, key, { length: T.len, bones: 6, rfn: T.r, lenSeg: 16, radSeg: 9, sy: tailType === 'reptile' ? 0.6 : 1 }, T.mat);
    const holder = pivot(tailBase);
    holder.rotation.y = Math.PI;
    holder.add(tail.mesh);
    tail.droop = T.droop;
    tail.curl = T.curl;
    const endBone = tail.bones[tail.bones.length - 1];
    if (tailType === 'tuft') ell(ctx, endBone, [lr * 0.55, lr * 0.55, lr * 0.9], ctx.mat({ color: accent, map: M.body.map }), { pos: [0, 0, lr * 0.4] });
    if (tailType === 'bushy' && !hoofed && bellyOn) ell(ctx, endBone, [ry * 0.14, ry * 0.14, ry * 0.25], M.belly, { pos: [0, 0, -ry * 0.05] });
  }

  // ---- wings (pegasus) ----
  let wings = null;
  if (p.wings) {
    const wm = ctx.mat({ color: secondary === primary ? 0xffffff : shade(primary, 0.15), roughness: 0.8, side: THREE.DoubleSide });
    const tip = ctx.mat({ color: secondary, roughness: 0.8, side: THREE.DoubleSide });
    wings = [-1, 1].map((side) => {
      const w = featherWing(ctx, wm, tip, bodyLen * 1.4, side);
      w.root.position.set(side * rx * 0.55, ry * 0.75, bl * 0.35);
      torso.add(w.root);
      return w;
    });
  }

  // element anchors
  for (let i = 0; i < 5; i++) {
    const z = bl * (0.6 - i * 0.3);
    ctx.anchors.back.push({ parent: breathe, pos: [0, ry * Math.sqrt(1 - (z / (bl * 1.1)) ** 2) * 0.98, z], s: ry * 0.35 });
  }
  ctx.anchors.mouth = { parent: headIn, pos: [0, -H * 0.2, H * 0.3 + snout * 0.9], s: H * 0.2 };
  ctx.anchors.head = { parent: headIn, pos: [0, H * 0.85, 0], s: H * 0.55 };

  const style = p.trunk || (G >= 1.45 && (!p.horns || p.horns === 'none') && !reptile) ? 'stomp' : p.horns && !['none', 'tusks', 'ossicones'].includes(p.horns) && !p.mane ? 'ram' : 'bite';
  const walkOff = [0.25, 0.75, 0, 0.5]; // FL, FR, BL, BR (cycles)
  const runOff = hopper ? [0, 0.05, 0.5, 0.55] : [0, 0.12, 0.55, 0.67];
  const stride = legLen * 2.2 + bodyLen * 0.25;

  function animate(s) {
    const t = s.t;
    const mv = s.move, run = s.run;
    const flying = wings && s.anim === 'fly';
    breathe.scale.set(1 + s.breath * 0.012, 1 + s.breath * 0.02, 1);
    const amp = (0.42 + run * 0.35) * mv;
    legs.forEach((L, i) => {
      const off = lerp(walkOff[i], runOff[i], hopper ? Math.max(run, 0.6) : run) * TAU;
      const ph = s.phase + off;
      let swing = -legSwing(ph) * amp;
      let lift = legLift(ph) * mv * (0.55 + run * 0.4);
      if (flying) {
        swing = L.front ? -0.9 : 0.8;
        lift = 1.1;
      }
      if (style === 'stomp' && L.front && s.atk >= 0) {
        swing -= s.wind * 0.9;
        lift += s.wind * 0.8;
      }
      L.upper.rotation.x = L.a1 + swing;
      L.knee.rotation.x = L.a2 + lift * (L.front ? 1.1 : 0.4);
    });
    // body bob / pitch
    const bob = Math.abs(Math.sin(s.phase)) * mv * (0.025 + run * 0.06) * legLen;
    torso.position.y = bodyY + bob * (hopper ? 3 : 1) + (flying ? Math.sin(s.flap) * 0.05 * legLen : 0);
    torso.rotation.x = Math.sin(s.phase) * run * mv * 0.06;
    torso.position.z = 0;
    if (s.atk >= 0) {
      if (style === 'stomp') {
        torso.rotation.x = -s.wind * 0.35 + s.strike * 0.1;
        torso.position.y += s.wind * legLen * 0.25;
      } else {
        torso.position.z = s.strike * bl * 0.35 - s.wind * bl * 0.1;
        torso.rotation.x += s.wind * 0.06 - s.strike * 0.04;
      }
    }
    // head
    const look = Math.sin(t * 0.45) * 0.18 * (1 - mv);
    head.rotation.y = look;
    head.rotation.x = -tilt + (neckLen > 0.5 ? 0.25 : 0.1) + Math.sin(t * 1.1) * 0.03 + mv * Math.sin(s.phase * 2) * 0.03;
    if (style === 'ram' && s.atk >= 0) head.rotation.x += s.wind * 0.55 - s.strike * 0.2;
    if (jaw) jaw.rotation.x = 0.04 + (style === 'bite' ? s.wind * 0.6 - s.strike * 0.0 : 0.1 * s.wind) + (s.atk >= 0 ? 0 : Math.max(0, Math.sin(t * 0.7)) * 0.04);
    if (style === 'bite' && s.atk >= 0) head.rotation.x += -s.wind * 0.25 + s.strike * 0.3;
    if (trunk) {
      trunk.rotation.x = Math.sin(t * 1.3) * 0.12 - (s.atk >= 0 ? s.wind * 1.2 : 0);
      trunk.rotation.z = Math.sin(t * 0.9) * 0.1;
    }
    if (ears) ears.forEach((e, i) => (e.rotation.z = e.userData.rz + Math.max(0, Math.sin(t * 0.8 + i * 1.7)) ** 12 * 0.35 * (i ? 1 : -1) + (p.ears === 'big' ? Math.sin(t * 1.5) * 0.12 * (i ? 1 : -1) : 0)));
    // tail
    if (tail) {
      const B = tail.bones;
      const sway = 0.12 + mv * 0.18 + (tailType === 'bushy' && predator ? 0.1 : 0);
      for (let i = 0; i < B.length; i++) {
        B[i].rotation.y = Math.sin(t * (2.2 + mv * 3) - i * 0.6) * sway;
        B[i].rotation.x = i === 0 ? tail.droop - run * mv * 0.5 : tail.curl;
      }
    }
    if (wings) {
      const fl = flying ? Math.sin(s.flap) : 0;
      wings.forEach((w, i) => {
        const side = i ? 1 : -1;
        w.root.rotation.z = side * (flying ? 0.15 + fl * 0.75 : 0.25);
        w.root.rotation.y = side * (flying ? 0 : 1.3);
        w.root.rotation.x = flying ? 0 : -0.15;
        w.outer.rotation.z = side * (flying ? Math.max(0, -fl) * 0.5 : 0);
        w.outer.rotation.y = side * (flying ? 0 : 0.25);
      });
    }
  }
  return { group, flying: false, stride, animate };
}

function buildHead(ctx, headIn, M, o) {
  const { H, snout, secondary, accent, hairMat, muzzleMat, noseMat, predator, hoofed, reptile, pattern } = o;
  const p = ctx.p;
  const bodyMat = M.body;
  ell(ctx, headIn, [H * 0.5, H * 0.47, H * 0.52], bodyMat, { n: 14 });
  const horsey = hoofed && snout >= 0.4;
  const sy = reptile ? H * 0.16 : horsey ? H * 0.32 : H * 0.27;
  const sx = reptile ? H * 0.34 : horsey ? H * 0.3 : H * 0.31;
  const sLen = snout * (horsey ? 0.42 : 0.55) + H * 0.14;
  const sZ = H * 0.28 + snout * 0.5;
  ell(ctx, headIn, [sx, sy, sLen], muzzleMat, { pos: [0, -H * 0.13, sZ] });
  const tipZ = sZ + sLen;
  if (horsey) ell(ctx, headIn, [sx * 1.08, sy * 1.05, H * 0.3], muzzleMat, { pos: [0, -H * 0.15, tipZ - H * 0.25] });
  if (!p.trunk) {
    if (hoofed || reptile) {
      for (const sd of [-1, 1]) ell(ctx, headIn, [H * 0.05, H * 0.035, H * 0.03], M.dark, { pos: [sd * sx * 0.45, -H * 0.13 + sy * 0.55, tipZ - H * 0.06], small: true });
    } else {
      ell(ctx, headIn, [H * 0.13, H * 0.085, H * 0.08], noseMat, { pos: [0, -H * 0.13 + sy * 0.75, tipZ - H * 0.05] });
    }
  }
  // jaw
  const jaw = pivot(headIn, 0, -H * 0.24, H * 0.18);
  ell(ctx, jaw, [sx * 0.85, H * 0.09, sLen * 0.92], muzzleMat, { pos: [0, -H * 0.02, sZ - H * 0.2] });
  ell(ctx, jaw, [sx * 0.7, H * 0.05, sLen * 0.8], M.mouth, { pos: [0, H * 0.06, sZ - H * 0.2], shadow: false });
  if (predator || reptile) {
    for (const sd of [-1, 1]) mesh(ctx, headIn, coneGeo(ctx, 5), M.claw, { pos: [sd * sx * 0.5, -H * 0.2, tipZ - H * 0.12], rot: [Math.PI, 0, 0], scale: [H * 0.035, H * 0.11, H * 0.035], small: true });
    if (reptile) teeth(ctx, headIn, M.claw, { n: 7, w: sx * 1.4, y: -H * 0.2, z: tipZ - H * 0.25, size: H * 0.06 });
  }
  headIn.userData.jaw = jaw;
  // eyes
  const herb = hoofed || p.trunk;
  const eyeR = H * (reptile ? 0.11 : herb ? 0.11 : 0.14);
  const eyeY = reptile ? H * 0.32 : H * 0.12;
  eyes(ctx, headIn, M, { x: H * (reptile ? 0.3 : 0.3), y: eyeY, z: H * (reptile ? 0.25 : 0.33), r: eyeR, yaw: herb ? 0.75 : 0.4, iris: reptile ? 0xd8c040 : null, slit: reptile });
  if (pattern === 'panda') {
    for (const sd of [-1, 1]) ell(ctx, headIn, [H * 0.17, H * 0.13, H * 0.1], o.limbMat, { pos: [sd * H * 0.28, H * 0.08, H * 0.3], rot: [0, sd * 0.4, sd * 0.5] });
  }
  // ears
  const earType = p.ears || 'pointy';
  const earMat = pattern === 'panda' ? o.limbMat : bodyMat;
  const inner = ctx.mat({ color: shade(secondary, 0.1), roughness: 0.8 });
  const ears = [];
  if (earType !== 'none') for (const sd of [-1, 1]) {
    const e = pivot(headIn, sd * H * 0.3, H * 0.36, -H * 0.08);
    let rz = 0;
    if (earType === 'pointy') {
      rz = -sd * 0.3;
      mesh(ctx, e, coneGeo(ctx, 8), earMat, { scale: [H * 0.16, H * 0.38, H * 0.08] });
      mesh(ctx, e, coneGeo(ctx, 6), inner, { pos: [0, H * 0.03, H * 0.03], scale: [H * 0.1, H * 0.27, H * 0.05], small: true });
    } else if (earType === 'round') {
      rz = -sd * 0.35;
      ell(ctx, e, [H * 0.16, H * 0.15, H * 0.07], earMat, { pos: [0, H * 0.08, 0] });
      ell(ctx, e, [H * 0.1, H * 0.09, H * 0.04], inner, { pos: [0, H * 0.08, H * 0.04], small: true });
    } else if (earType === 'floppy') {
      e.position.y = H * 0.25;
      rz = -sd * 0.5;
      ell(ctx, e, [H * 0.12, H * 0.32, H * 0.07], ctx.mat({ color: shade(o.primary, -0.25), map: bodyMat.map }), { pos: [sd * H * 0.06, -H * 0.25, 0] });
    } else if (earType === 'big') {
      e.position.set(sd * H * 0.42, H * 0.05, -H * 0.12);
      rz = 0;
      const g = shapeGeo(ctx, 'bigear', [[0, 0.5], [0.5, 0.75], [0.95, 0.45], [1, -0.2], [0.7, -0.75], [0.25, -0.85], [0, -0.3]], 0.08, 0.04);
      mesh(ctx, e, g, earMat, { rot: [0, sd > 0 ? -0.35 : Math.PI + 0.35, 0], scale: H * 0.95 });
    } else if (earType === 'long') {
      rz = -sd * 0.12;
      e.position.y = H * 0.3;
      ell(ctx, e, [H * 0.13, H * 0.48, H * 0.07], earMat, { pos: [0, H * 0.42, 0] });
      ell(ctx, e, [H * 0.08, H * 0.38, H * 0.04], inner, { pos: [0, H * 0.42, H * 0.04], small: true });
    }
    e.userData.rz = rz;
    e.rotation.z = rz;
    ears.push(e);
  }
  headIn.userData.ears = ears;
  // mane (lion style ring)
  if (p.mane && o.neckLen < 0.45) {
    const n = ctx.detail === 0 ? 9 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU;
      ell(ctx, headIn, [H * 0.28, H * 0.28, H * 0.3], hairMat, { n: 9, pos: [Math.cos(a) * H * 0.55, Math.sin(a) * H * 0.55 - H * 0.05, -H * 0.2] });
    }
    ell(ctx, headIn, [H * 0.75, H * 0.75, H * 0.45], hairMat, { pos: [0, -H * 0.05, -H * 0.35] });
  }
  if (p.mane && o.neckLen >= 0.45) {
    ell(ctx, headIn, [H * 0.12, H * 0.22, H * 0.12], hairMat, { pos: [0, H * 0.42, H * 0.12], rot: [0.6, 0, 0] });
  }
  // horns
  const hornMat = ctx.accentMat(p.horns === 'single' && p.mane ? accent : shade(accent, 0), { roughness: 0.4 });
  const horn = p.horns || 'none';
  if (horn === 'bull' || horn === 'small') {
    const big = horn === 'bull';
    const g = tubeGeo(ctx, `bullhorn:${big}`, [[0, 0, 0], [0.45, 0.12, 0], [0.75, 0.45, 0.1], [0.78, 0.8, 0.2]], (t) => 0.13 * (1 - t) + 0.015, 12, 8);
    for (const sd of [-1, 1]) mesh(ctx, headIn, g, hornMat, { pos: [sd * H * 0.32, H * 0.3, -H * 0.05], scale: [sd * H * (big ? 0.75 : 0.35), H * (big ? 0.7 : 0.4), H * 0.7] });
  } else if (horn === 'single') {
    if (p.mane) {
      const g = tubeGeo(ctx, 'unihorn', [[0, 0, 0], [0, 0.5, 0.12], [0, 1, 0.3]], (t) => 0.12 * (1 - t) + 0.008, 12, 7);
      mesh(ctx, headIn, g, hornMat, { pos: [0, H * 0.38, H * 0.25], scale: H * 1.0 });
      for (let i = 0; i < 4; i++) mesh(ctx, headIn, sphereGeo(ctx, 6), hornMat, { pos: [0, H * (0.42 + i * 0.2), H * (0.27 + i * 0.065)], scale: [H * 0.09 * (1 - i * 0.2), H * 0.035, H * 0.09 * (1 - i * 0.2)], small: true });
    } else {
      mesh(ctx, headIn, coneGeo(ctx, 10), hornMat, { pos: [0, -H * 0.13 + sy * 0.6, tipZ - H * 0.25], rot: [-0.35, 0, 0], scale: [H * 0.16, H * 0.6, H * 0.16] });
      mesh(ctx, headIn, coneGeo(ctx, 8), hornMat, { pos: [0, -H * 0.05 + sy * 0.6, tipZ - H * 0.55], rot: [-0.2, 0, 0], scale: [H * 0.1, H * 0.28, H * 0.1] });
    }
  } else if (horn === 'triple') {
    for (const sd of [-1, 1]) mesh(ctx, headIn, coneGeo(ctx, 10), hornMat, { pos: [sd * H * 0.25, H * 0.3, H * 0.15], rot: [1.0, 0, -sd * 0.15], scale: [H * 0.1, H * 0.85, H * 0.1] });
    mesh(ctx, headIn, coneGeo(ctx, 8), hornMat, { pos: [0, -H * 0.13 + sy * 0.6, tipZ - H * 0.2], rot: [0.4, 0, 0], scale: [H * 0.09, H * 0.3, H * 0.09] });
  } else if (horn === 'tusks') {
    const g = tubeGeo(ctx, 'tusk', [[0, 0, 0], [0, -0.35, 0.25], [0, -0.45, 0.6], [0, -0.3, 0.85]], (t) => 0.09 * (1 - t * 0.7), 12, 8);
    for (const sd of [-1, 1]) mesh(ctx, headIn, g, hornMat, { pos: [sd * H * 0.22, -H * 0.25, H * 0.35], rot: [0, sd * 0.15, 0], scale: H * 0.9 });
  } else if (horn === 'ram') {
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const a = (i / 10) * Math.PI * 1.6, r = 0.45 * (1 - i / 16);
      pts.push([0.15 * i / 10, Math.sin(a) * r, -Math.cos(a) * r + 0.45]);
    }
    const g = tubeGeo(ctx, 'ram', pts, (t) => 0.13 * (1 - t * 0.7), 20, 8);
    for (const sd of [-1, 1]) mesh(ctx, headIn, g, hornMat, { pos: [sd * H * 0.38, H * 0.2, -H * 0.2], scale: [sd * H * 0.8, H * 0.8, H * 0.8], rot: [0, 0, 0] });
  } else if (horn === 'ossicones') {
    for (const sd of [-1, 1]) {
      mesh(ctx, headIn, cylGeo(ctx, 8, 0.8), M.body, { pos: [sd * H * 0.15, H * 0.35, -H * 0.05], rot: [-0.2, 0, -sd * 0.15], scale: [H * 0.06, H * 0.35, H * 0.06] });
      ell(ctx, headIn, [H * 0.08, H * 0.08, H * 0.08], ctx.mat({ color: accent }), { pos: [sd * H * 0.2, H * 0.69, -H * 0.12] });
    }
  }
  // trunk
  if (p.trunk) {
    const tr = pivot(headIn, 0, -H * 0.05, tipZ - H * 0.08);
    const g = tubeGeo(ctx, 'trunk', [[0, 0, 0], [0, -0.35, 0.15], [0, -0.8, 0.18], [0, -1.15, 0.1], [0, -1.3, 0.22]], (t) => 0.2 * (1 - t * 0.55), 18, 10);
    mesh(ctx, tr, g, M.body, { scale: H * 1.05 });
    headIn.userData.trunk = tr;
  }
}
