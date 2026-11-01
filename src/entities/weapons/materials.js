// Paleta de materiais por arma (instâncias próprias, texturas compartilhadas).
import * as THREE from 'three';
import { ELEMENTS } from '../../../shared/elements.js';
import { RARITY_COLORS } from '../../../shared/catalog/weapons.js';
import {
  texSize, damascusTexture, brushedTexture, woodTexture, leatherWrapTexture, itoTexture, goldTexture,
  elementPatternTexture, elementSurfaceTexture, panelTexture, studioEnvMap,
} from './textures.js';

const BLADE = {
  none: (S) => ({ color: 0xffffff, map: damascusTexture(S), metalness: 0.95, roughness: 0.22 }),
  fire: (S) => ({ color: 0x4a3a34, map: brushedTexture(S), metalness: 0.75, roughness: 0.45, emissive: 0xff5a14, emissiveIntensity: 2.4, emissiveMap: elementPatternTexture('fire', S) }),
  ice: (S) => ({ color: 0xd2f1ff, map: elementSurfaceTexture('ice', S), metalness: 0.1, roughness: 0.06, emissive: 0x4ab0ea, emissiveIntensity: 0.9, emissiveMap: elementPatternTexture('ice', S), transparent: true, opacity: 0.82, envMapIntensity: 1.6 }),
  lightning: (S) => ({ color: 0xc4d2ea, map: damascusTexture(S, [170, 190, 230]), metalness: 0.9, roughness: 0.2, emissive: 0x7fb2ff, emissiveIntensity: 2.2, emissiveMap: elementPatternTexture('lightning', S) }),
  poison: (S) => ({ color: 0xffffff, map: elementSurfaceTexture('poison', S), metalness: 0.55, roughness: 0.6, emissive: 0x8aff4a, emissiveIntensity: 1.5, emissiveMap: elementPatternTexture('poison', S) }),
  arcane: (S) => ({ color: 0x6e5a96, map: brushedTexture(S), metalness: 0.85, roughness: 0.25, emissive: 0xc890ff, emissiveIntensity: 2.2, emissiveMap: elementPatternTexture('arcane', S) }),
  light: (S) => ({ color: 0xfff4dc, map: brushedTexture(S, [240, 236, 226]), metalness: 1, roughness: 0.14, emissive: 0xffe39a, emissiveIntensity: 1.4, emissiveMap: elementPatternTexture('light', S) }),
  shadow: (S) => ({ color: 0xffffff, map: elementSurfaceTexture('shadow', S), metalness: 0.7, roughness: 0.16, emissive: 0xa77bff, emissiveIntensity: 1.8, emissiveMap: elementPatternTexture('shadow', S) }),
  water: (S) => ({ color: 0x6aaeff, map: brushedTexture(S), metalness: 0.75, roughness: 0.12, emissive: 0x9fd8ff, emissiveIntensity: 0.9, emissiveMap: elementPatternTexture('water', S) }),
  earth: (S) => ({ color: 0xffffff, map: elementSurfaceTexture('earth', S), metalness: 0.05, roughness: 0.95, emissive: 0xff9a3a, emissiveIntensity: 1.1, emissiveMap: elementPatternTexture('earth', S), flatShading: true }),
  wind: (S) => ({ color: 0xe2fbf3, map: brushedTexture(S, [226, 244, 238]), metalness: 0.85, roughness: 0.2, emissive: 0xbff5e6, emissiveIntensity: 1.0, emissiveMap: elementPatternTexture('wind', S) }),
};

/**
 * @returns paleta { blade, steel, darkSteel, gold, accent, wood, leather, ito, gem, energy, tech, techDark, cloth, list }
 */
export function makePalette(spec, quality) {
  const S = texSize(quality);
  const env = studioEnvMap();
  const element = spec.element && ELEMENTS[spec.element] ? spec.element : null;
  const rarity = spec.rarity || 'comum';
  const ornate = rarity === 'epico' || rarity === 'lendario';
  const list = [];
  const std = (o) => {
    const m = new THREE.MeshStandardMaterial({ envMap: env, envMapIntensity: 0.85, ...o });
    list.push(m);
    return m;
  };
  const P = { list, element, rarity, ornate };
  const lazy = (name, make) => {
    let v;
    Object.defineProperty(P, name, { enumerable: true, configurable: true, get() { if (v === undefined) v = make(); return v; } });
  };
  lazy('blade', () => std(BLADE[element || 'none'](S)));
  lazy('steel', () => std({ color: 0xe8ecf0, map: brushedTexture(S), metalness: 0.95, roughness: 0.28 }));
  lazy('darkSteel', () => std({ color: 0x4a4f58, map: brushedTexture(S), metalness: 0.85, roughness: 0.38 }));
  lazy('gold', () => std({ color: 0xffffff, map: goldTexture(S), metalness: 1, roughness: 0.26 }));
  lazy('bronze', () => std({ color: 0xc8925a, map: brushedTexture(S), metalness: 0.95, roughness: 0.34 }));
  lazy('accent', () => (ornate ? P.gold : rarity === 'raro' ? P.steel : rarity === 'incomum' ? P.bronze : P.darkSteel));
  lazy('wood', () => std({ map: woodTexture(S), roughness: 0.72, metalness: 0 }));
  lazy('darkWood', () => std({ map: woodTexture(S, [70, 42, 30]), roughness: 0.6, metalness: 0 }));
  lazy('leather', () => { const lt = leatherWrapTexture(S); return std({ map: lt, bumpMap: lt, bumpScale: 2, roughness: 0.78, metalness: 0 }); });
  lazy('ito', () => { const it = itoTexture(S); it.repeat.set(1, 7); return std({ map: it, bumpMap: it, bumpScale: 2, roughness: 0.7, metalness: 0 }); });
  const gemColor = new THREE.Color(element ? ELEMENTS[element].color : RARITY_COLORS[rarity] || 0x4fa8ff);
  if (!element && rarity === 'comum') gemColor.set(0xb02a3a);
  P.gemColor = gemColor;
  lazy('gem', () => std({ color: gemColor, emissive: gemColor, emissiveIntensity: 0.6, metalness: 0.2, roughness: 0.05, flatShading: true, envMapIntensity: 1.6 }));
  const energyColor = new THREE.Color(element ? ELEMENTS[element].color : 0x5fe0ff);
  P.energyColor = energyColor;
  P.glowColor = new THREE.Color(element ? ELEMENTS[element].glow : 0xd8fbff);
  P.energy = new THREE.MeshBasicMaterial({ color: energyColor.clone().multiplyScalar(1.6) });
  list.push(P.energy);
  lazy('tech', () => std({ color: 0xe9edf3, map: panelTexture(S), metalness: 0.6, roughness: 0.35 }));
  lazy('techDark', () => std({ color: 0x30343c, map: panelTexture(S), metalness: 0.7, roughness: 0.4 }));
  lazy('cloth', () => std({ color: element ? ELEMENTS[element].color : (ornate ? 0xb01e2e : 0x8a1e24), roughness: 0.9, metalness: 0, side: THREE.DoubleSide }));
  return P;
}
