// Procedural creature models (no assets): createCreatureModel(spec, quality).
// See docs/CONTRACTS.md, section "Criaturas".
import * as THREE from 'three';
import { createCtx, clamp, damp, TAU } from './rig.js';
import { MaterialOwner } from './materials.js';
import { applyElement } from './element.js';
import { buildQuadruped } from './quadruped.js';
import { buildBiped } from './biped.js';
import { buildBird } from './bird.js';
import { buildFish } from './fish.js';
import { buildSerpent } from './serpent.js';
import { buildDragon } from './dragon.js';
import { buildGolem } from './golem.js';
import { buildSpider } from './spider.js';
import { buildSlime } from './slime.js';
import { buildGhost } from './ghost.js';
import { buildOctopus } from './octopus.js';
import { buildInsect } from './insect.js';

export const BUILDERS = {
  quadruped: buildQuadruped,
  biped: buildBiped,
  bird: buildBird,
  fish: buildFish,
  serpent: buildSerpent,
  dragon: buildDragon,
  golem: buildGolem,
  spider: buildSpider,
  slime: buildSlime,
  ghost: buildGhost,
  octopus: buildOctopus,
  insect: buildInsect,
};

export const ARCHETYPES = Object.keys(BUILDERS);

const easeOutBack = (t) => {
  const c1 = 1.9, c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
const valid = (v) => typeof v === 'number' && v >= 0 && v <= 1.0001;

export function createCreatureModel(spec = {}, quality = {}) {
  spec = { ...spec, params: spec.params || {}, colors: spec.colors || {} };
  const ctx = createCtx(spec, quality);
  const build = BUILDERS[spec.archetype] || buildQuadruped;
  const model = build(ctx);
  applyElement(ctx);

  const size = spec.size > 0 ? spec.size : 1;
  const height = (spec.height > 0 ? spec.height : 1) * size;

  // --- rest-pose measurement & normalisation ---
  const s = {
    t: 0, dt: 0, anim: 'idle', move: 0, run: 0, phase: 0, flap: 0, atk: -1, wind: 0, strike: 0, hit: -1,
    breath: 0, blink: 0, flying: !!model.flying, speed: 0, fly: model.flying ? 1 : 0,
  };
  model.animate(s);
  const root = new THREE.Group();
  root.name = `creature:${spec.species || spec.archetype || 'unknown'}`;
  const fx = new THREE.Group();
  root.add(fx);
  const holder = new THREE.Group();
  fx.add(holder);
  holder.add(model.group);
  model.group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model.group);
  const natH = Math.max(1e-3, box.max.y - box.min.y);
  const scale = height / natH;
  holder.scale.setScalar(scale);
  if (model.flying) {
    const cy = model.center ? model.center.y : (box.max.y + box.min.y) / 2;
    holder.position.y = -cy * scale;
  } else {
    holder.position.y = -box.min.y * scale;
  }
  const stride = Math.max(0.05, model.stride || natH * 0.6);

  const owner = new MaterialOwner(root);
  let userOpacity = 1;
  let dieOpacity = 1;
  let detail = 2;
  let flashT = 0;
  const flashColor = new THREE.Color();

  // internal timers when the game does not provide normalized times
  let lastAnim = 'idle';
  let animClock = 0;
  let spawnT = -1;
  let prevHit = -1;
  let blinkTimer = 1.5 + Math.random() * 2;
  let blinkT = -1;
  let clock = 0;
  const tiltSide = Math.random() < 0.5 ? -1 : 1;

  function applyMaterials() {
    const a = userOpacity * dieOpacity;
    if (a < 0.999 || flashT > 0 || owner.owned) {
      owner.ensure();
      owner.opacity = a;
      owner.flashK = flashT > 0 ? Math.min(1, flashT * 4) * 0.85 : 0;
      owner.flashColor.copy(flashColor);
      owner.apply();
    }
    root.visible = a > 0.01;
  }

  function flash(colorHex = 0xffffff) {
    flashColor.set(colorHex);
    flashT = 0.28;
  }

  function update(dt = 0.016, state = {}) {
    dt = clamp(dt || 0, 0, 0.1);
    clock += dt;
    const anim = state.anim || 'idle';
    if (anim !== lastAnim) {
      animClock = 0;
      if (anim === 'spawn') spawnT = 0;
      lastAnim = anim;
    } else animClock += dt;
    s.t = typeof state.time === 'number' ? state.time : clock;
    s.dt = dt;
    s.anim = anim;
    s.speed = state.speed || 0;

    const moving = anim === 'walk' || anim === 'run' || (anim === 'fly' && (state.speed || 0) > 0.2);
    s.move = damp(s.move, moving ? 1 : 0, 8, dt);
    s.run = damp(s.run, anim === 'run' ? 1 : 0, 6, dt);
    s.fly = damp(s.fly, model.flying || anim === 'fly' ? 1 : 0, 5, dt);
    let freq;
    const spNat = (state.speed || 0) / scale;
    if (spNat > 0.05) freq = clamp(spNat / stride, 0.5, 3.4);
    else freq = anim === 'run' ? 2.2 : 1.2;
    s.phase = (s.phase + TAU * freq * dt * Math.max(0.15, s.move)) % (TAU * 1000);
    const flapF = model.flying || anim === 'fly' ? (moving ? 2.4 : 1.7) + s.run * 0.8 : 1.5;
    s.flap = (s.flap + TAU * flapF * dt) % (TAU * 1000);
    s.breath = Math.sin(s.t * 2.2);

    // attack
    let atk = valid(state.attackT) ? state.attackT : anim === 'attack' ? (animClock % 0.9) / 0.9 : -1;
    s.atk = atk;
    if (atk >= 0) {
      s.wind = atk < 0.35 ? Math.sin((atk / 0.35) * Math.PI * 0.5) : atk < 0.5 ? 1 - (atk - 0.35) / 0.15 : 0;
      s.strike = atk < 0.35 ? 0 : atk < 0.5 ? (atk - 0.35) / 0.15 : Math.max(0, 1 - (atk - 0.5) / 0.5);
      s.strike = s.strike * s.strike * (3 - 2 * s.strike);
    } else {
      s.wind = damp(s.wind, 0, 10, dt);
      s.strike = damp(s.strike, 0, 10, dt);
    }

    // hit
    const hit = valid(state.hitT) ? state.hitT : anim === 'hit' ? Math.min(1, animClock / 0.45) : -1;
    if (hit >= 0 && (prevHit < 0 || hit < prevHit) && flashT <= 0) flash(0xff6655);
    prevHit = hit;
    s.hit = hit;

    // blink
    blinkTimer -= dt;
    if (blinkTimer <= 0) {
      blinkT = 0;
      blinkTimer = 2 + Math.random() * 3.5;
    }
    if (blinkT >= 0) {
      blinkT += dt / 0.16;
      s.blink = blinkT >= 1 ? 0 : Math.sin(blinkT * Math.PI);
      if (blinkT >= 1) blinkT = -1;
    } else s.blink = 0;
    const die = valid(state.dieT) ? state.dieT : anim === 'die' ? Math.min(1, animClock / 1.4) : -1;
    if (die >= 0) s.blink = Math.min(1, die * 3);
    for (const e of ctx.eyes) e.scale.y = 1 - 0.88 * s.blink;

    model.animate(s);
    for (const f of ctx.decorAnim) f(s.t);

    // --- shared full-body layers: spawn, hit recoil, death ---
    fx.position.set(0, 0, 0);
    fx.rotation.set(0, 0, 0);
    let sc = 1;
    if (spawnT >= 0) {
      spawnT += dt / 0.6;
      if (spawnT >= 1) spawnT = -1;
      else sc = Math.max(0.001, easeOutBack(spawnT));
    }
    if (hit >= 0) {
      const k = Math.sin(Math.min(1, hit) * Math.PI) * (1 - hit * 0.5);
      fx.position.z = -0.08 * height * k;
      fx.rotation.x = -0.22 * k;
      sc *= 1 - 0.06 * k;
    }
    dieOpacity = 1;
    fx.visible = true;
    if (die >= 0) {
      const tip = clamp(die / 0.5, 0, 1);
      const e = 1 - Math.pow(1 - tip, 3);
      if (model.flying) {
        fx.rotation.z = e * 1.2 * tiltSide;
        fx.position.y = -e * height * 0.35;
      } else {
        fx.rotation.z = e * (Math.PI / 2) * 0.92 * tiltSide;
        fx.position.x = e * height * 0.12 * tiltSide;
      }
      const f = clamp((die - 0.5) / 0.5, 0, 1);
      sc *= 1 - 0.6 * f;
      dieOpacity = 1 - f;
      if (die >= 0.999) fx.visible = false;
    }
    fx.scale.setScalar(sc);

    if (flashT > 0) flashT = Math.max(0, flashT - dt);
    applyMaterials();
  }

  function setDetail(level) {
    detail = clamp(Math.round(level), 0, 2);
    for (const m of ctx.small) m.visible = detail > 0;
    root.traverse((o) => {
      if (o.isMesh) o.castShadow = detail > 0 && !!o.userData.mainShadow;
    });
  }

  function setOpacity(a) {
    userOpacity = clamp(a, 0, 1);
    applyMaterials();
  }

  function dispose() {
    owner.dispose();
    for (const d of ctx.disposables) d.dispose?.();
    root.removeFromParent();
  }

  // initial pose
  s.dt = 0;
  update(0, { anim: 'idle', time: 0 });
  setDetail(2);

  return { root, height, update, flash, setDetail, setOpacity, dispose, species: spec.species, archetype: spec.archetype };
}
