// Biblioteca de efeitos visuais — ver docs/CONTRACTS.md, seção "Efeitos".
// Todos os efeitos temporizados se limpam e liberam recursos sozinhos.
import * as THREE from 'three';
import { ParticlePool } from './particles.js';
import { burst, appear, explosion, shockwave, impact, confetti, teleport } from './blasts.js';
import { lightningBolt, laserBeam, storm, slashTrail, speedTrail } from './energy.js';
import { shieldBubble, aura, healAura, iceField, barrierWall, timeWarp } from './fields.js';
import { tornado, meteor, earthquake } from './nature.js';
import { createProjectile } from './projectiles.js';

export { SHAPE } from './particles.js';

/**
 * @param {THREE.Scene} scene
 * @param {{particleBudget?:number, detail?:number}} quality
 */
export function createFX(scene, quality = {}) {
  const effects = [];
  const shakeCbs = [];
  let budget = quality.particleBudget || 3000;
  const glow = new ParticlePool(Math.max(budget * 0.7, 256), { additive: true });
  const solid = new ParticlePool(Math.max(budget * 0.3, 128), { additive: false, renderOrder: 9 });
  scene.add(glow.points, solid.points);

  const ctx = {
    scene,
    glow,
    solid,
    detail: quality.detail ?? 2,
    rng: Math.random,
    /** escala uma contagem de partículas conforme o orçamento atual */
    n(count) { return Math.max(1, Math.round(count * THREE.MathUtils.clamp(budget / 3000, 0.25, 1.6))); },
    add(effect) { effects.push(effect); return effect; },
    shake(intensity) {
      for (const cb of shakeCbs) { try { cb(intensity); } catch (e) { console.error(e); } }
    },
  };

  const v3 = (p) => (p && p.isVector3 ? p : new THREE.Vector3(p?.x || 0, p?.y || 0, p?.z || 0));

  function setBudget(max) {
    budget = Math.max(64, max | 0);
    glow.setBudget(Math.round(budget * 0.7));
    solid.setBudget(Math.round(budget * 0.3));
  }
  setBudget(budget);

  const FX = {
    update(dt, camera) {
      dt = Math.min(Math.max(dt || 0, 0), 0.1);
      ctx.camera = camera;
      for (let i = effects.length - 1; i >= 0; i--) {
        const e = effects[i];
        let alive = false;
        try { alive = e.update(dt, camera) !== false; } catch (err) { console.error('[fx]', err); alive = false; }
        if (!alive) {
          effects.splice(i, 1);
          try { e.dispose && e.dispose(); } catch (err) { console.error('[fx]', err); }
        }
      }
      glow.update(dt);
      solid.update(dt);
    },
    setBudget,
    burst: (pos, opts) => burst(ctx, v3(pos), opts),
    appear: (pos, element) => appear(ctx, v3(pos), element),
    explosion: (pos, element, radius) => explosion(ctx, v3(pos), element, radius),
    shockwave: (pos, radius, element) => shockwave(ctx, v3(pos), radius, element),
    impact: (pos, element) => impact(ctx, v3(pos), element),
    lightningBolt: (from, to, color, duration) => lightningBolt(ctx, v3(from), v3(to), color, duration),
    laserBeam: (getFrom, getTo, color, duration) => laserBeam(ctx, getFrom, getTo, color, duration),
    shieldBubble: (object3d, radius, color) => shieldBubble(ctx, object3d, radius, color),
    aura: (object3d, element, duration) => aura(ctx, object3d, element, duration),
    healAura: (object3d) => healAura(ctx, object3d),
    speedTrail: (object3d, duration) => speedTrail(ctx, object3d, duration),
    iceField: (pos, radius, duration) => iceField(ctx, v3(pos), radius, duration),
    barrierWall: (pos, rotY, width, height, duration, element) => barrierWall(ctx, v3(pos), rotY, width, height, duration, element),
    tornado: (getPos, duration, radius) => tornado(ctx, getPos, duration, radius),
    storm: (getCenter, radius, duration) => storm(ctx, getCenter, radius, duration),
    meteor: (targetPos, delay, onImpact) => meteor(ctx, v3(targetPos), delay, onImpact),
    earthquake: (pos, radius) => earthquake(ctx, v3(pos), radius),
    timeWarp: (pos, radius, duration) => timeWarp(ctx, v3(pos), radius, duration),
    teleport: (from, to) => teleport(ctx, v3(from), v3(to)),
    confetti: (pos) => confetti(ctx, v3(pos)),
    slashTrail: (tip, color, duration) => slashTrail(ctx, tip, color, duration),
    createProjectile: (kind, element) => createProjectile(ctx, kind, element),
    onShake(cb) {
      if (typeof cb === 'function') shakeCbs.push(cb);
      return () => { const i = shakeCbs.indexOf(cb); if (i >= 0) shakeCbs.splice(i, 1); };
    },
    /** número de efeitos ativos (debug) */
    get activeCount() { return effects.length; },
    dispose() {
      for (const e of effects.splice(0)) { try { e.dispose && e.dispose(); } catch { /* */ } }
      glow.dispose();
      solid.dispose();
    },
  };
  return FX;
}
