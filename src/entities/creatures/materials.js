// Shared material + geometry caches for creatures.
// Materials returned by getMaterial() are SHARED between instances. A creature only clones
// them (see MaterialOwner) when it needs per-instance changes (flash / opacity).
import * as THREE from 'three';

const matCache = new Map();
const geoCache = new Map();

function colorKey(c) {
  return c == null ? '-' : new THREE.Color(c).getHexString();
}

/**
 * opts: { color, map, roughness, metalness, emissive, emissiveIntensity, transparent, opacity,
 *         flat, vertexColors, side, depthWrite }
 */
export function getMaterial(opts = {}) {
  const key = [
    colorKey(opts.color ?? 0xffffff), opts.map ? opts.map.uuid : '', opts.roughness ?? 0.75, opts.metalness ?? 0,
    colorKey(opts.emissive ?? 0), opts.emissiveIntensity ?? 1, opts.transparent ? 1 : 0, opts.opacity ?? 1,
    opts.flat ? 1 : 0, opts.vertexColors ? 1 : 0, opts.side ?? 0, opts.depthWrite === false ? 0 : 1,
  ].join('|');
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: opts.color ?? 0xffffff,
      map: opts.map || null,
      roughness: opts.roughness ?? 0.75,
      metalness: opts.metalness ?? 0,
      emissive: opts.emissive ?? 0x000000,
      emissiveIntensity: opts.emissiveIntensity ?? 1,
      transparent: !!opts.transparent,
      opacity: opts.opacity ?? 1,
      flatShading: !!opts.flat,
      vertexColors: !!opts.vertexColors,
      side: opts.side ?? THREE.FrontSide,
      depthWrite: opts.depthWrite !== false,
    });
    m.userData.shared = true;
    matCache.set(key, m);
  }
  return m;
}

export function getGeometry(key, make) {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    g.userData.shared = true;
    geoCache.set(key, g);
  }
  return g;
}

// Per-instance material ownership: lazily clones shared materials so flash/opacity
// never leak to other creatures that share the same cached material.
export class MaterialOwner {
  constructor(root) {
    this.root = root;
    this.owned = null; // Map shared -> clone
    this.flashColor = new THREE.Color();
    this.flashK = 0;
    this.opacity = 1;
  }

  ensure() {
    if (this.owned) return;
    this.owned = new Map();
    this.root.traverse((o) => {
      if (!o.isMesh || !o.material) return;
      const swap = (m) => {
        let c = this.owned.get(m);
        if (!c) {
          c = m.clone();
          c.userData = { baseEmissive: (m.emissive || new THREE.Color()).clone(), baseOpacity: m.opacity, baseTransparent: m.transparent, baseDepthWrite: m.depthWrite };
          this.owned.set(m, c);
        }
        return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(swap) : swap(o.material);
    });
  }

  apply() {
    if (!this.owned) return;
    const a = this.opacity;
    for (const m of this.owned.values()) {
      const u = m.userData;
      if (m.emissive) m.emissive.copy(u.baseEmissive).lerp(this.flashColor, this.flashK);
      const wantT = u.baseTransparent || a < 0.999;
      if (m.transparent !== wantT) {
        m.transparent = wantT;
        m.needsUpdate = true;
      }
      m.opacity = u.baseOpacity * a;
      m.depthWrite = a < 0.999 ? a > 0.6 && u.baseDepthWrite : u.baseDepthWrite;
    }
  }

  dispose() {
    if (!this.owned) return;
    for (const m of this.owned.values()) m.dispose();
    this.owned = null;
  }
}
