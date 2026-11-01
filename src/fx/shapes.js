// Geometrias procedurais reutilizáveis (cristais, rochas) — usadas por efeitos e armas.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

/** Cristal: prisma de N lados com ponta piramidal; base em y=0, ponta em y=h. */
export function crystalGeometry(r = 0.1, h = 1, sides = 6, tipFrac = 0.3, baseScale = 0.8) {
  const pts = [];
  pts.push(new THREE.Vector2(0, 0));
  pts.push(new THREE.Vector2(r * baseScale, 0));
  pts.push(new THREE.Vector2(r, h * 0.12));
  pts.push(new THREE.Vector2(r, h * (1 - tipFrac)));
  pts.push(new THREE.Vector2(0, h));
  const g = new THREE.LatheGeometry(pts, sides);
  const ng = g.toNonIndexed();
  g.dispose();
  ng.computeVertexNormals();
  return ng;
}

/** Rocha facetada: icosaedro deslocado por ruído determinístico. */
export function rockGeometry(r = 0.5, detail = 1, seed = 1, rough = 0.35, squash = 0.8) {
  const g = new THREE.IcosahedronGeometry(r, detail);
  const rng = mulberry32(seed);
  const pos = g.attributes.position;
  // desloca vértices coincidentes do mesmo jeito (chave por posição arredondada)
  const map = new Map();
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const key = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
    let s = map.get(key);
    if (s == null) { s = 1 + (rng() - 0.5) * 2 * rough; map.set(key, s); }
    v.multiplyScalar(s);
    v.y *= squash;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}
