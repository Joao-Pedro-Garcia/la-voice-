// Modelos procedurais de armas — ver docs/CONTRACTS.md, seção "Armas".
// createWeaponModel(spec, quality) -> { root, length, tip, update, playAppear, playUse, dispose }
import * as THREE from 'three';
import { RARITY_COLORS } from '../../../shared/catalog/weapons.js';
import { ParticlePool } from '../../fx/particles.js';
import { glowTexture } from '../../fx/textures.js';
import { easeOutBack, clamp01 } from '../../fx/util.js';
import { makePalette } from './materials.js';
import { makeBuilder } from './parts.js';
import { buildSword, buildGreatsword, buildKatana, buildDagger } from './blades.js';
import { buildAxe, buildHammer, buildMace, buildSpear, buildTrident, buildScythe } from './hafted.js';
import { buildBow, buildStaff, buildWand } from './ranged.js';
import { buildBlaster, buildRifle, buildCannon, buildGauntlet } from './tech.js';
import { applyElement, applyRarityAura } from './elementFx.js';

export const WEAPON_KINDS = ['sword', 'greatsword', 'katana', 'dagger', 'axe', 'hammer', 'mace', 'spear', 'trident', 'scythe', 'bow', 'staff', 'wand', 'blaster', 'rifle', 'cannon', 'gauntlet'];

const BUILD = {
  sword: buildSword, greatsword: buildGreatsword, katana: buildKatana, dagger: buildDagger,
  axe: buildAxe, hammer: buildHammer, mace: buildMace, spear: buildSpear, trident: buildTrident, scythe: buildScythe,
  bow: buildBow, staff: buildStaff, wand: buildWand,
  blaster: buildBlaster, rifle: buildRifle, cannon: buildCannon, gauntlet: buildGauntlet,
};

const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * @param {{kind:string, element?:string|null, size?:number, rarity?:string}} spec
 * @param {object} quality ver src/core/quality.js
 */
export function createWeaponModel(spec = {}, quality = {}) {
  const kind = BUILD[spec.kind] ? spec.kind : 'sword';
  const size = spec.size > 0 ? spec.size : 1;
  const rarity = spec.rarity || 'comum';
  const P = makePalette(spec, quality);
  const element = P.element;

  const root = new THREE.Group();
  root.name = `weapon:${kind}`;
  const pivot = new THREE.Group();
  pivot.scale.setScalar(size);
  root.add(pivot);
  const model = new THREE.Group();
  pivot.add(model);

  const B = makeBuilder(P, quality, model);
  const info = BUILD[kind](B);
  const detail = B.detail;

  const tip = new THREE.Object3D();
  tip.name = 'tip';
  tip.position.set(...info.tip);
  pivot.add(tip);

  // partículas idle (espaço de mundo)
  const glowPool = new ParticlePool(detail === 0 ? 32 : 72, { additive: true, renderOrder: 6 });
  const solidPool = new ParticlePool(detail === 0 ? 16 : 40, { additive: false, renderOrder: 5 });
  root.add(solidPool.points, glowPool.points);

  const bladeMeshes = [];
  model.traverse((o) => { if (o.isMesh && o.userData.role === 'blade') bladeMeshes.push(o); });

  const D = {
    pivot, info, element, rarity, quality, detail, P,
    bladeMeshes, mats: [], fxMats: [], ownGeos: [], ribbons: [], anims: [], emitters: [],
    emitEvery(interval, fn) { this.emitters.push({ interval: interval / Math.max(0.35, [0.45, 0.75, 1][detail]), fn, acc: Math.random() * interval }); },
    emit(localPos, o) {
      pivot.getWorldScale(_s);
      const k = _s.y;
      const pos = pivot.localToWorld(_v.copy(localPos)).clone();
      const pool = o.solid ? solidPool : glowPool;
      pool.emit({
        ...o, pos,
        vel: o.vel ? o.vel.clone().multiplyScalar(k) : null,
        gravity: (o.gravity || 0) * k,
        size: (o.size ?? 0.05) * k, size1: (o.size1 ?? 0) * k,
        orbit: o.orbit ? [o.orbit[0] * k, o.orbit[1], o.orbit[2], (o.orbit[3] || 0) * k] : null,
      });
    },
  };
  if (element) applyElement(D);
  if (rarity === 'epico' || rarity === 'lendario') applyRarityAura(D, RARITY_COLORS[rarity]);

  // materiais com emissão controlável (pulso / surgimento)
  const glowables = [...P.list, ...D.mats].filter((m) => m.isMeshStandardMaterial);
  for (const m of glowables) m.userData.baseEm = m.emissive.clone().multiplyScalar(m.emissiveIntensity);
  const glowColor = P.glowColor.clone();
  if (!element && (rarity === 'epico' || rarity === 'lendario')) glowColor.set(RARITY_COLORS[rarity]);
  const energyBase = P.energy.color.clone();

  // brilho de surgimento/uso
  const flashMat = new THREE.SpriteMaterial({ map: glowTexture(), color: glowColor, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0 });
  const flashSprite = new THREE.Sprite(flashMat);
  flashSprite.renderOrder = 7;
  flashSprite.visible = false;
  pivot.add(flashSprite);

  let time = 0;
  let appearT = -1;
  let useT = -1;
  let boost = 0;
  let lastBoost = -1;

  function applyBoost(b) {
    if (Math.abs(b - lastBoost) < 1e-3) return;
    lastBoost = b;
    for (const m of glowables) {
      m.emissive.copy(m.userData.baseEm);
      if (b > 0) m.emissive.r += glowColor.r * b * 0.9, m.emissive.g += glowColor.g * b * 0.9, m.emissive.b += glowColor.b * b * 0.9;
      m.emissiveIntensity = 1;
    }
    P.energy.color.copy(energyBase).multiplyScalar(1 + b);
    for (const m of D.fxMats) if (m.uniforms?.uBoost) m.uniforms.uBoost.value = b;
  }
  applyBoost(0);

  const api = {
    root,
    length: info.length * size,
    tip,
    kind,
    element,
    rarity,
    update(dt, t) {
      dt = Math.min(Math.max(dt || 0, 0), 0.1);
      time = t ?? time + dt;
      boost = 0;
      // surgimento
      if (appearT >= 0) {
        appearT += dt;
        const k = clamp01(appearT / 0.8);
        const s = Math.max(0.001, easeOutBack(k));
        pivot.scale.setScalar(size * s);
        model.rotation.y = (1 - k) * (1 - k) * Math.PI * 3;
        boost = Math.max(boost, 2.5 * (1 - k));
        flashSprite.visible = true;
        flashSprite.position.set(info.tip[0] * 0.5, info.tip[1] * 0.5, info.tip[2] * 0.5);
        flashSprite.scale.setScalar(info.length * (0.6 + 0.8 * k));
        flashMat.opacity = Math.sin(k * Math.PI) * 0.9;
        if (Math.random() < 0.7) {
          const p = new THREE.Vector3().lerpVectors(new THREE.Vector3(), tip.position, Math.random());
          D.emit(p, { vel: new THREE.Vector3((Math.random() - 0.5), Math.random() * 1.2, (Math.random() - 0.5)), drag: 2, life: 0.6, color: 0xffffff, color1: glowColor, size: 0.06, size1: 0, shape: 1 });
        }
        if (k >= 1) { appearT = -1; pivot.scale.setScalar(size); model.rotation.y = 0; flashSprite.visible = false; }
      }
      // uso
      if (useT >= 0) {
        useT += dt;
        const k = clamp01(useT / 0.28);
        boost = Math.max(boost, 1.6 * (1 - k));
        flashSprite.visible = true;
        flashSprite.position.copy(tip.position);
        flashSprite.scale.setScalar(Math.max(0.15, info.length * 0.35) * (0.6 + k));
        flashMat.opacity = (1 - k) * 0.9;
        if (k >= 1) { useT = -1; if (appearT < 0) flashSprite.visible = false; }
      }
      applyBoost(boost);
      for (const f of D.anims) f(dt, time, boost);
      if (root.parent || root.matrixWorldNeedsUpdate !== undefined) {
        for (const e of D.emitters) {
          e.acc += dt;
          let n = 0;
          while (e.acc >= e.interval && n < 4) { e.acc -= e.interval; n++; e.fn(); }
          if (e.acc > e.interval * 4) e.acc = 0;
        }
      }
      glowPool.update(dt);
      solidPool.update(dt);
    },
    playAppear() { appearT = 0; pivot.scale.setScalar(0.001); },
    playUse() { useT = 0; },
    dispose() {
      root.removeFromParent();
      glowPool.dispose();
      solidPool.dispose();
      for (const r of D.ribbons) r.dispose();
      const geos = new Set(D.ownGeos);
      root.traverse((o) => { if (o.geometry && !o.userData.sharedGeo && !o.geometry.userData?.shared) geos.add(o.geometry); });
      for (const g of geos) g.dispose();
      for (const m of [...P.list, ...D.mats, ...D.fxMats, flashMat]) m.dispose();
    },
  };
  return api;
}

export default createWeaponModel;
