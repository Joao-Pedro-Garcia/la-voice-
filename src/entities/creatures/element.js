// Cheap element-themed decorations (no lights): emissive spots, shards, halos...
// Builders register anchors in ctx.anchors = { back: [{parent, pos, s}], mouth: {parent,pos,s}, head: {parent,pos,s} }.
import * as THREE from 'three';
import { getGeometry } from './materials.js';
import { mesh, sphereGeo, coneGeo, torusGeo, rockGeo, shapeGeo } from './rig.js';

function octaGeo() {
  return getGeometry('octa', () => new THREE.OctahedronGeometry(1, 0));
}

export function applyElement(ctx) {
  const el = ctx.element;
  ctx.decorAnim = [];
  if (!el) return;
  const id = ctx.elementId;
  const back = ctx.anchors.back || [];
  const glow = (color, intensity = 1.6, extra = {}) => ctx.mat({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.4, ...extra });
  const place = (a, fn) => {
    const g = new THREE.Group();
    g.position.set(...a.pos);
    g.scale.setScalar(a.s ?? 0.1);
    if (a.rot) g.rotation.set(...a.rot);
    a.parent.add(g);
    fn(g);
    return g;
  };
  const sm = (o) => ({ ...o, shadow: false });

  if (id === 'fire') {
    const m = glow(0xff7a1a, 1.8);
    const m2 = glow(0xffd04a, 2);
    back.forEach((a, i) => place(a, (g) => mesh(ctx, g, sphereGeo(ctx, 8), i % 2 ? m : m2, sm({ scale: [0.55, 0.3, 0.55] }))));
    if (ctx.anchors.mouth) place(ctx.anchors.mouth, (g) => {
      const e = mesh(ctx, g, sphereGeo(ctx, 8), m2, sm({ scale: 0.6 }));
      ctx.decorAnim.push((t) => e.scale.setScalar(0.5 + 0.15 * Math.sin(t * 9)));
    });
  } else if (id === 'ice') {
    const m = ctx.mat({ color: 0xbfefff, emissive: 0x6ccfff, emissiveIntensity: 0.6, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85, flat: true });
    back.forEach((a, i) => place(a, (g) => {
      mesh(ctx, g, octaGeo(), m, sm({ pos: [0, 0.6, 0], scale: [0.35, 1.0, 0.35], rot: [0.2 * ((i % 3) - 1), 0, 0.25 * ((i % 2) * 2 - 1)] }));
    }));
  } else if (id === 'lightning') {
    const m = glow(0xfff27a, 2.2);
    const pts = [[0, 0], [0.35, 0.45], [0.12, 0.45], [0.45, 1], [-0.05, 0.38], [0.15, 0.38], [-0.15, 0]];
    const geo = shapeGeo(ctx, 'bolt', pts, 0.12, 0.02, false);
    back.forEach((a, i) => i % 2 === 0 && place(a, (g) => {
      const b = mesh(ctx, g, geo, m, sm({ pos: [0, 0.2, 0], scale: 1.1, rot: [0, Math.PI / 2, 0] }));
      ctx.decorAnim.push((t) => (b.visible = Math.sin(t * 13 + i * 2.1) > -0.7));
    }));
  } else if (id === 'poison') {
    const m = glow(0x7dff4a, 1.4);
    back.forEach((a, i) => place(a, (g) => mesh(ctx, g, sphereGeo(ctx, 8), m, sm({ scale: [0.5 + (i % 2) * 0.2, 0.25, 0.5] }))));
    if (ctx.anchors.mouth) place(ctx.anchors.mouth, (g) => {
      const d = mesh(ctx, g, sphereGeo(ctx, 8), m, sm({ pos: [0, -0.6, 0], scale: [0.35, 0.5, 0.35] }));
      ctx.decorAnim.push((t) => {
        const k = (t * 0.7) % 1;
        d.position.y = -0.6 - k * 1.2;
        d.scale.setScalar(0.4 * (1 - k));
      });
    });
  } else if (id === 'shadow') {
    const m = ctx.mat({ color: 0x2a1d45, emissive: 0x6b3fbf, emissiveIntensity: 0.9, roughness: 0.5 });
    back.forEach((a, i) => place(a, (g) => mesh(ctx, g, coneGeo(ctx, 6), m, sm({ scale: [0.25, 0.9 + (i % 2) * 0.4, 0.25], rot: [-0.4, 0, 0] }))));
    const wisp = ctx.mat({ color: 0x9d7bd8, emissive: 0x5b3f8f, emissiveIntensity: 1, transparent: true, opacity: 0.45, depthWrite: false });
    if (back[0]) place(back[Math.floor(back.length / 2)], (g) => {
      for (let k = 0; k < 3; k++) {
        const w = mesh(ctx, g, sphereGeo(ctx, 8), wisp, sm({ scale: 0.35 }));
        ctx.decorAnim.push((t) => {
          const ph = (t * 0.5 + k / 3) % 1;
          w.position.set(Math.sin(t * 2 + k * 2) * 0.6, 0.5 + ph * 3, Math.cos(t * 1.7 + k) * 0.6);
          w.scale.setScalar(0.4 * (1 - ph));
        });
      }
    });
  } else if (id === 'light') {
    const m = glow(0xffe9a3, 1.6);
    const head = ctx.anchors.head;
    if (head) place(head, (g) => {
      const h = mesh(ctx, g, torusGeo(ctx, 0.08, 20), m, sm({ rot: [Math.PI / 2, 0, 0], scale: 0.7 }));
      ctx.decorAnim.push((t) => (h.position.y = 0.3 + Math.sin(t * 2) * 0.08));
    });
    back.forEach((a, i) => i % 2 === 0 && place(a, (g) => mesh(ctx, g, sphereGeo(ctx, 8), m, sm({ scale: [0.3, 0.2, 0.3] }))));
  } else if (id === 'water') {
    const m = ctx.mat({ color: 0x5ab4ff, emissive: 0x1c6fd6, emissiveIntensity: 0.5, roughness: 0.05, transparent: true, opacity: 0.7 });
    back.forEach((a, i) => place(a, (g) => {
      const d = mesh(ctx, g, sphereGeo(ctx, 10), m, sm({ pos: [0, 0.3, 0], scale: [0.35, 0.45, 0.35] }));
      ctx.decorAnim.push((t) => (d.position.y = 0.3 + Math.sin(t * 3 + i) * 0.1));
    }));
  } else if (id === 'earth') {
    const m = ctx.mat({ color: 0x8a6a42, roughness: 0.95, flat: true });
    const moss = ctx.mat({ color: 0x5f8f3a, roughness: 1 });
    back.forEach((a, i) => place(a, (g) => {
      mesh(ctx, g, rockGeo(ctx, 3 + (i % 3), 0), m, sm({ pos: [0, 0.2, 0], scale: [0.55, 0.45, 0.5], rot: [i, i * 2, 0] }));
      if (i % 2 === 0) mesh(ctx, g, sphereGeo(ctx, 8), moss, sm({ pos: [0, 0.5, 0], scale: [0.35, 0.12, 0.35] }));
    }));
  } else if (id === 'wind') {
    const m = ctx.mat({ color: 0xd8fff4, emissive: 0x9fe8d5, emissiveIntensity: 0.8, transparent: true, opacity: 0.55, depthWrite: false });
    const geo = getGeometry('windArc', () => new THREE.TorusGeometry(1, 0.05, 4, 20, Math.PI * 1.2));
    const mid = back[Math.floor(back.length / 2)];
    if (mid) place(mid, (g) => {
      for (let k = 0; k < 2; k++) {
        const ring = mesh(ctx, g, geo, m, sm({ pos: [0, 0.4 + k * 0.6, 0], scale: 2.4 - k * 0.6, rot: [Math.PI / 2, 0, 0] }));
        ctx.decorAnim.push((t) => (ring.rotation.z = t * (3 + k)));
      }
    });
  } else if (id === 'arcane') {
    const m = glow(0xb46bff, 1.8);
    const mid = back[Math.floor(back.length / 2)];
    if (mid) place(mid, (g) => {
      for (let k = 0; k < 3; k++) {
        const o = mesh(ctx, g, octaGeo(), m, sm({ scale: 0.25 }));
        ctx.decorAnim.push((t) => {
          const a = t * 1.5 + (k * Math.PI * 2) / 3;
          o.position.set(Math.cos(a) * 1.2, 1.2 + Math.sin(t * 2 + k) * 0.2, Math.sin(a) * 1.2);
          o.rotation.y = t * 2;
        });
      }
    });
    back.forEach((a, i) => i % 2 && place(a, (g) => mesh(ctx, g, sphereGeo(ctx, 8), m, sm({ scale: [0.3, 0.18, 0.3] }))));
  }
}
