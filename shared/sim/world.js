// Simulação autoritativa do jogo (Camada 5 — Execução): jogadores, criaturas, projéteis,
// objetos, zonas de habilidades, clima, ondas de monstros e combate.
// Determinística o suficiente para rodar no servidor (multiplayer) e no cliente (solo).
import { terrainHeight, groundHeight, isWater, clampToPlayable, resolveStructureCollision, randomSpawnPoint, SPAWN, PLAYABLE_RADIUS, WATER_LEVEL } from '../world.js';
import { ELEMENTS } from '../elements.js';
import { mulberry32, clamp, angleDiff, dist2 } from '../math.js';
import { CREATURES, WILD_SPAWN_TABLE } from '../catalog/creatures.js';
import { OBJECTS } from '../catalog/world.js';
import { buildCreatureSpec, buildWeaponSpec } from './generator.js';
import { WEAPON_IDS } from '../catalog/weapons.js';
import { q } from '../protocol.js';
import { updateCreature } from './creatureAI.js';
import { castAbility, updateZone, updatePendingBlasts } from './abilities.js';

export const PLAYER_BASE = { hp: 100, energy: 100, energyRegen: 7, speed: 7.5, radius: 0.45 };
export const MAX_INVENTORY = 5;
export const MAX_SUMMON_POINTS = 8;
export const SUMMON_LIFETIME = 150;
export const MAX_OBJECTS_PER_PLAYER = 16;
export const RESPAWN_TIME = 4;

let NEXT_ID = 1;
const nid = (p) => `${p}${(NEXT_ID++).toString(36)}`;

export class World {
  constructor({ seed = 1, mode = 'adventure', pvp = true } = {}) {
    this.rand = mulberry32(seed);
    this.time = 0;
    this.mode = mode; // 'adventure' (ondas de monstros) | 'creative' (pacífico)
    this.pvp = pvp;
    this.players = new Map();
    this.creatures = new Map();
    this.projectiles = new Map();
    this.objects = new Map();
    this.zones = new Map();
    this.events = [];
    this.env = { weather: 'clear', timeOfDay: 9.5, dayLength: 480, changedAt: -10 };
    this.wave = { number: 0, state: 'idle', nextAt: 6, remaining: 0, spawned: 0, toSpawn: 0, batchAt: 0 };
    this.progressHook = null; // (playerId, event) => void
  }

  emit(type, data) {
    this.events.push({ ...data, type, t: q(this.time) });
  }

  drainEvents() {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------------------------------------------------------------- jogadores
  addPlayer({ id, name, appearance, level = 1 }) {
    const sp = randomSpawnPoint(this.rand, SPAWN, 8);
    const p = {
      id, name, appearance, level,
      x: sp.x, y: sp.y, z: sp.z, ry: Math.PI, anim: 'idle', lastInputAt: this.time,
      hp: PLAYER_BASE.hp, maxHp: PLAYER_BASE.hp, energy: PLAYER_BASE.energy, maxEnergy: PLAYER_BASE.energy,
      inventory: [], weaponIndex: -1, buffs: {}, status: {}, cds: {}, blocking: false, dodgeUntil: 0,
      dead: false, respawnAt: 0, connected: true, objects: [], match: { kills: 0, creations: 0, xp: 0, start: this.time },
      lastHitBy: null,
    };
    this.players.set(id, p);
    this.emit('player_add', { player: this.publicPlayer(p) });
    return p;
  }

  removePlayer(id) {
    const p = this.players.get(id);
    if (!p) return;
    for (const c of this.creatures.values()) if (c.ownerId === id) this.killCreature(c, null, true);
    for (const oid of p.objects) this.removeObject(oid, 'owner_left');
    this.players.delete(id);
    this.emit('player_remove', { id });
  }

  publicPlayer(p) {
    return {
      id: p.id, name: p.name, appearance: p.appearance, level: p.level, x: q(p.x), y: q(p.y), z: q(p.z), ry: q(p.ry),
      hp: Math.ceil(p.hp), maxHp: p.maxHp, energy: Math.floor(p.energy), maxEnergy: p.maxEnergy,
      inventory: p.inventory, weaponIndex: p.weaponIndex, connected: p.connected, dead: p.dead,
      buffs: this.buffFlags(p),
    };
  }

  weaponOf(p) {
    return p.weaponIndex >= 0 ? p.inventory[p.weaponIndex] : null;
  }

  buffActive(p, name) {
    const b = p.buffs[name];
    return b && b.until > this.time ? b : null;
  }

  buffFlags(p) {
    const out = {};
    for (const [k, b] of Object.entries(p.buffs)) if (b.until > this.time) out[k] = { until: q(b.until), mult: b.mult, absorb: b.absorb };
    for (const [k, s] of Object.entries(p.status)) if (s.until > this.time) out[`st_${k}`] = { until: q(s.until) };
    return out;
  }

  sizeMult(p) {
    return this.buffActive(p, 'grow')?.mult || this.buffActive(p, 'shrink')?.mult || 1;
  }

  maxSpeed(p) {
    let s = PLAYER_BASE.speed * 1.35; // corrida
    const sp = this.buffActive(p, 'speed');
    if (sp) s *= sp.mult;
    if (this.buffActive(p, 'fly')) s *= 1.5;
    if (this.buffActive(p, 'grow')) s *= 1.2;
    if (this.buffActive(p, 'shrink')) s *= 1.35;
    if (p.status.slow?.until > this.time) s *= 1 - p.status.slow.amount;
    return s;
  }

  // Validação de movimento enviado pelo cliente (anti-trapaça simples).
  applyInput(id, inp) {
    const p = this.players.get(id);
    if (!p || p.dead) return { ok: false };
    const dt = Math.max(0.05, this.time - p.lastInputAt);
    p.lastInputAt = this.time;
    if (![inp.x, inp.y, inp.z, inp.ry].every(Number.isFinite)) return { ok: false };
    if (p.status.stun?.until > this.time) return { ok: false, correct: true };
    const maxD = this.maxSpeed(p) * dt * 1.6 + 1.2 + (p.dodgeUntil > this.time ? 6 : 0) + (p.launchedAt && this.time - p.launchedAt < 3 ? 10 : 0);
    const d = dist2(p.x, p.z, inp.x, inp.z);
    let ok = true;
    let nx = inp.x;
    let nz = inp.z;
    if (d > maxD) {
      ok = false;
      const k = maxD / d;
      nx = p.x + (inp.x - p.x) * k;
      nz = p.z + (inp.z - p.z) * k;
    }
    const pos = clampToPlayable({ x: nx, z: nz });
    const ground = terrainHeight(pos.x, pos.z);
    const maxY = ground + (this.buffActive(p, 'fly') ? 80 : 30);
    p.x = pos.x;
    p.z = pos.z;
    p.y = clamp(inp.y, Math.max(ground - 2, WATER_LEVEL - 3), maxY);
    p.ry = inp.ry;
    p.anim = typeof inp.anim === 'string' ? inp.anim.slice(0, 12) : 'idle';
    return { ok, correct: !ok };
  }

  // ---------------------------------------------------------------- combate
  isEnemy(a, aType, b, bType) {
    const ownerOf = (e, t) => (t === 'player' ? e.id : t === 'creature' ? (e.wild ? '__wild' : e.ownerId) : e.ownerId);
    const oa = ownerOf(a, aType);
    const ob = ownerOf(b, bType);
    if (oa === ob) return false;
    if (oa === '__wild' || ob === '__wild') return true;
    return this.pvp;
  }

  entityPos(e, type) {
    if (type === 'player') return { x: e.x, y: e.y + 0.9 * this.sizeMult(e), z: e.z };
    if (type === 'creature') return { x: e.x, y: e.flying ? e.y : e.y + e.h * 0.5, z: e.z };
    return { x: e.x, y: e.y + 1, z: e.z };
  }

  entityRadius(e, type) {
    if (type === 'player') return PLAYER_BASE.radius * this.sizeMult(e);
    if (type === 'creature') return e.radius;
    return 0.8 * (e.size || 1);
  }

  // Lista de alvos atacáveis por `src` (jogador ou criatura).
  *enemiesOf(src, srcType) {
    for (const p of this.players.values()) {
      if (p.dead || (srcType === 'player' && p.id === src.id)) continue;
      if (this.isEnemy(src, srcType, p, 'player')) yield [p, 'player'];
    }
    for (const c of this.creatures.values()) {
      if (c.dead || c === src) continue;
      if (this.isEnemy(src, srcType, c, 'creature')) yield [c, 'creature'];
    }
    for (const o of this.objects.values()) {
      if (o.type !== 'clone' && o.type !== 'barrier' && o.type !== 'crate') continue;
      if (o.type === 'crate') {
        if (srcType === 'player') yield [o, 'object'];
        continue;
      }
      if (this.isEnemy(src, srcType, o, 'object')) yield [o, 'object'];
    }
  }

  damage(target, tType, amount, opts = {}) {
    const { src = null, srcType = null, element = null, kind = 'hit', knock = 0 } = opts;
    if (!target || target.dead) return 0;
    let amt = amount;
    if (src && srcType === 'player') {
      const w = src.status?.weaken;
      if (w && w.until > this.time) amt *= 1 - w.amount;
      if (this.buffActive(src, 'grow')) amt *= 1.5;
      if (this.buffActive(src, 'shrink')) amt *= 0.75;
    } else if (src && srcType === 'creature') {
      const w = src.status?.weaken;
      if (w && w.until > this.time) amt *= 1 - w.amount;
    }
    const pos = this.entityPos(target, tType);
    let blocked = false;
    let absorbed = 0;
    if (tType === 'player') {
      if (target.dodgeUntil > this.time) {
        this.emit('hit', { targetId: target.id, targetType: tType, amount: 0, miss: true, x: q(pos.x), y: q(pos.y), z: q(pos.z) });
        return 0;
      }
      if (target.blocking && src) {
        const sp = this.entityPos(src, srcType);
        const ang = Math.atan2(sp.x - target.x, sp.z - target.z);
        if (Math.abs(angleDiff(target.ry, ang)) < 1.0) {
          amt *= 0.25;
          blocked = true;
        }
      }
      if (this.buffActive(target, 'grow')) amt *= 0.65;
      if (this.buffActive(target, 'shrink')) amt *= 0.8;
      const sh = this.buffActive(target, 'shield');
      if (sh && sh.absorb > 0) {
        absorbed = Math.min(sh.absorb, amt);
        sh.absorb -= absorbed;
        amt -= absorbed;
        if (sh.absorb <= 0) {
          sh.until = this.time;
          this.emit('buff_end', { playerId: target.id, buff: 'shield', broken: true });
        }
      }
    }
    amt = Math.max(0, amt);
    if (tType === 'object') {
      target.hp -= amt;
      this.emit('hit', { targetId: target.id, targetType: tType, amount: Math.round(amt), element, x: q(pos.x), y: q(pos.y), z: q(pos.z) });
      if (target.hp <= 0) this.destroyObject(target, src);
      return amt;
    }
    target.hp -= amt;
    if (tType === 'player') target.lastHitAt = this.time;
    if (src) target.lastHitBy = { id: src.id, type: srcType, ownerId: srcType === 'creature' ? src.ownerId : src.id };
    this.emit('hit', {
      targetId: target.id, targetType: tType, amount: Math.round(amt), element, kind, blocked, absorbed: Math.round(absorbed),
      x: q(pos.x), y: q(pos.y), z: q(pos.z), srcId: src?.id || null,
    });
    if (element && amt > 0) this.applyStatus(target, tType, element, src, srcType, amt);
    if (knock && amt >= 0) this.knockback(target, tType, src ? this.entityPos(src, srcType) : pos, knock);
    if (tType === 'creature' && amt > 0) target.hitAt = this.time;
    if (target.hp <= 0) {
      if (tType === 'player') this.koPlayer(target);
      else this.killCreature(target, target.lastHitBy);
    }
    return amt;
  }

  applyStatus(target, tType, element, src, srcType, dealt) {
    const st = ELEMENTS[element]?.status;
    if (!st) return;
    const until = this.time + (st.duration || 0);
    if (st.type === 'burn' || st.type === 'poison') target.status[st.type] = { until, dps: st.dps, src: src ? { id: src.id, type: srcType } : null };
    else if (st.type === 'slow') target.status.slow = { until, amount: st.amount };
    else if (st.type === 'stun' || st.type === 'stagger') target.status.stun = { until: this.time + st.duration * (tType === 'player' ? 0.5 : 1) };
    else if (st.type === 'weaken') target.status.weaken = { until, amount: st.amount };
    else if (st.type === 'blind') target.status.blind = { until };
    else if (st.type === 'drain' && src && !src.dead) this.heal(src, srcType, dealt * st.amount);
    else if (st.type === 'knockback' && src) this.knockback(target, tType, this.entityPos(src, srcType), st.amount);
    if (st.type !== 'drain' && st.type !== 'knockback') this.emit('status', { targetId: target.id, targetType: tType, status: st.type, until: q(until) });
  }

  knockback(target, tType, from, strength) {
    const dx = target.x - from.x;
    const dz = target.z - from.z;
    const d = Math.hypot(dx, dz) || 1;
    const vx = (dx / d) * strength;
    const vz = (dz / d) * strength;
    if (tType === 'player') this.emit('knockback', { targetId: target.id, vx: q(vx), vy: q(strength * 0.5), vz: q(vz) });
    else if (tType === 'creature') {
      const k = target.traits?.tank ? 0.3 : 1;
      target.kx = (target.kx || 0) + vx * k;
      target.kz = (target.kz || 0) + vz * k;
    }
  }

  heal(target, tType, amount) {
    if (!target || target.dead) return;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    const got = target.hp - before;
    if (got > 0.5) this.emit('heal', { targetId: target.id, targetType: tType, amount: Math.round(got) });
  }

  koPlayer(p) {
    p.dead = true;
    p.hp = 0;
    p.respawnAt = this.time + RESPAWN_TIME;
    p.blocking = false;
    p.buffs = {};
    p.status = {};
    const killer = p.lastHitBy;
    this.emit('ko', { id: p.id, entityType: 'player', killerId: killer?.ownerId || null });
    this.progress(p.id, { type: 'death' });
    if (killer?.ownerId && killer.ownerId !== p.id && this.players.has(killer.ownerId)) {
      this.progress(killer.ownerId, { type: 'ko_player' });
      this.players.get(killer.ownerId).match.kills++;
    }
  }

  respawn(p) {
    const sp = randomSpawnPoint(this.rand, SPAWN, 10);
    Object.assign(p, { x: sp.x, y: sp.y + 0.2, z: sp.z, hp: p.maxHp, energy: p.maxEnergy, dead: false, lastHitBy: null });
    p.buffs.shield = { until: this.time + 3, absorb: 999 }; // proteção de renascimento
    this.emit('respawn', { id: p.id, x: q(p.x), y: q(p.y), z: q(p.z) });
  }

  // ---------------------------------------------------------------- criaturas
  summonPointsOf(playerId) {
    let pts = 0;
    for (const c of this.creatures.values()) if (c.ownerId === playerId && !c.dead) pts += c.points;
    return pts;
  }

  spawnCreature(spec, { ownerId = null, x, z, ry = 0, wild = false, wave = 0 } = {}) {
    const h = spec.height * spec.size;
    const flying = !!spec.traits.flying;
    const swimmer = !!spec.traits.swimming;
    const ground = groundHeight(x, z, swimmer);
    const hover = flying ? (spec.archetype === 'fish' || spec.archetype === 'octopus' ? 1.2 + h * 0.5 : 2.5 + h * 0.8) : 0;
    const c = {
      id: nid('c'), spec, ownerId, wild, wave,
      x, z, y: ground + hover, ry, h, flying, swimmer, hover,
      radius: Math.max(0.4, Math.min(2.5, h * 0.35 * (spec.archetype === 'serpent' || spec.archetype === 'fish' ? 1.3 : 1))),
      hp: spec.stats.hp, maxHp: spec.stats.hp, speed: spec.stats.speed, traits: spec.traits,
      state: 'spawn', stateUntil: this.time + 0.8, targetId: null, targetType: null,
      nextAttack: this.time + 1, attackStart: -1, status: {}, kx: 0, kz: 0,
      home: { x, z }, wanderAt: 0, wx: x, wz: z,
      expireAt: wild ? Infinity : this.time + SUMMON_LIFETIME,
      points: h * 1 >= 2.5 ? 2 : 1, dead: false, dieAt: 0, revived: false, lastHitBy: null, hitAt: -10,
    };
    this.creatures.set(c.id, c);
    this.emit('creature_add', { creature: this.publicCreatureFull(c) });
    return c;
  }

  publicCreatureFull(c) {
    return { id: c.id, spec: c.spec, ownerId: c.ownerId, wild: c.wild, x: q(c.x), y: q(c.y), z: q(c.z), ry: q(c.ry), hp: Math.ceil(c.hp), maxHp: c.maxHp, state: c.state };
  }

  killCreature(c, killer, silent = false) {
    if (c.dead) return;
    // Fênix renasce uma vez
    if (!silent && c.spec.species === 'phoenix' && !c.revived) {
      c.revived = true;
      c.hp = c.maxHp * 0.6;
      this.emit('revive', { id: c.id, x: q(c.x), y: q(c.y), z: q(c.z), element: 'fire' });
      return;
    }
    c.dead = true;
    c.state = 'die';
    c.dieAt = this.time;
    this.emit('ko', { id: c.id, entityType: 'creature', killerId: killer?.ownerId || null, silent });
    if (silent) return;
    const ownerId = killer?.ownerId;
    if (ownerId && this.players.has(ownerId) && ownerId !== c.ownerId) {
      this.progress(ownerId, { type: 'kill', maxHp: c.maxHp, species: c.spec.species });
      this.players.get(ownerId).match.kills++;
    }
    // Gosma selvagem se divide em duas menores
    if (c.wild && c.spec.species === 'slime' && c.spec.size > 0.7) {
      for (let i = 0; i < 2; i++) {
        const spec = buildCreatureSpec({ id: 'slime', size: c.spec.size * 0.6, elements: c.spec.element ? [c.spec.element] : [] }, 99);
        const s = this.spawnCreature(spec, { x: c.x + (i ? 1 : -1), z: c.z + 0.5, wild: true, wave: c.wave });
        s.state = 'spawn';
      }
    }
    // Criaturas selvagens às vezes deixam comida/poção
    if (c.wild && this.rand() < 0.18) this.spawnObject({ id: 'potion', label: 'Poção', size: 1, count: 1, hp: 10 }, null, c.x, c.z, 0);
  }

  // ---------------------------------------------------------------- objetos
  spawnObject(spec, ownerId, x, z, ry, extra = {}) {
    const base = OBJECTS[spec.id];
    const o = {
      id: nid('o'), type: spec.id, label: spec.label || base?.label || spec.id, ownerId, x, z, y: terrainHeight(x, z), ry,
      size: spec.size || 1, hp: (spec.hp || base?.hp || 50) * (spec.size || 1), maxHp: (spec.hp || base?.hp || 50) * (spec.size || 1),
      element: spec.element || null, expireAt: extra.expireAt ?? (spec.id === 'balloon' ? this.time + 25 : this.time + 600),
      solid: extra.solid ?? !!base?.solid, data: extra.data || {},
    };
    this.objects.set(o.id, o);
    if (ownerId) {
      const p = this.players.get(ownerId);
      if (p) {
        p.objects.push(o.id);
        while (p.objects.length > MAX_OBJECTS_PER_PLAYER) this.removeObject(p.objects.shift(), 'limit');
      }
    }
    this.emit('object_add', { object: this.publicObject(o) });
    return o;
  }

  publicObject(o) {
    return { id: o.id, type: o.type, label: o.label, ownerId: o.ownerId, x: q(o.x), y: q(o.y), z: q(o.z), ry: q(o.ry), size: o.size, hp: Math.ceil(o.hp), maxHp: o.maxHp, element: o.element, data: o.data, expireAt: o.expireAt === Infinity ? null : q(o.expireAt) };
  }

  removeObject(id, reason = 'expired') {
    const o = this.objects.get(id);
    if (!o) return;
    this.objects.delete(id);
    if (o.ownerId) {
      const p = this.players.get(o.ownerId);
      if (p) p.objects = p.objects.filter((x) => x !== id);
    }
    this.emit('object_remove', { id, reason });
  }

  destroyObject(o, src) {
    if (o.type === 'crate') this.spawnObject({ id: this.rand() < 0.5 ? 'potion' : 'food', size: 1 }, null, o.x, o.z, 0);
    if (o.type === 'bomb') return; // bomba explode pelo temporizador
    this.removeObject(o.id, 'destroyed');
  }

  // ---------------------------------------------------------------- zonas
  addZone(z) {
    z.id = nid('z');
    z.nextTick = this.time;
    this.zones.set(z.id, z);
    this.emit('zone_add', { zone: this.publicZone(z) });
    return z;
  }

  publicZone(z) {
    return { id: z.id, type: z.type, ownerId: z.ownerId, x: q(z.x), z: q(z.z), radius: z.radius, until: q(z.until), element: z.element || null, ry: q(z.ry || 0), followId: z.followId || null };
  }

  removeZone(id) {
    if (this.zones.delete(id)) this.emit('zone_remove', { id });
  }

  // ---------------------------------------------------------------- projéteis
  spawnProjectile(p) {
    p.id = nid('p');
    p.born = this.time;
    this.projectiles.set(p.id, p);
    this.emit('projectile_add', { projectile: { id: p.id, kind: p.kind, element: p.element, x: q(p.x), y: q(p.y), z: q(p.z), vx: q(p.vx), vy: q(p.vy), vz: q(p.vz), size: p.size || 1 } });
    return p;
  }

  explode(x, y, z, radius, damage, element, src, srcType) {
    this.emit('explosion', { x: q(x), y: q(y), z: q(z), radius, element });
    const hit = [];
    for (const [e, t] of this.enemiesOf(src, srcType)) {
      const ep = this.entityPos(e, t);
      const d = Math.hypot(ep.x - x, ep.y - y, ep.z - z);
      if (d <= radius + this.entityRadius(e, t)) {
        const fall = 1 - 0.5 * clamp(d / radius, 0, 1);
        this.damage(e, t, damage * fall, { src, srcType, element, kind: 'explosion', knock: 7 });
        hit.push(e.id);
      }
    }
    return hit;
  }

  updateProjectiles(dt) {
    for (const pr of [...this.projectiles.values()]) {
      const warp = this.timeWarpFactorAt(pr.x, pr.z, pr.ownerId);
      const step = dt * warp;
      pr.vy -= (pr.gravity || 0) * step;
      // projéteis teleguiados (orbes de cajado) curvam levemente para o alvo
      if (pr.homing) {
        const tgt = this.findEntity(pr.homing.id, pr.homing.type);
        if (tgt && !tgt.dead) {
          const tp = this.entityPos(tgt, pr.homing.type);
          const sp = Math.hypot(pr.vx, pr.vy, pr.vz);
          const dx = tp.x - pr.x;
          const dy = tp.y - pr.y;
          const dz = tp.z - pr.z;
          const dl = Math.hypot(dx, dy, dz) || 1;
          const k = Math.min(1, 2.5 * step);
          pr.vx += ((dx / dl) * sp - pr.vx) * k;
          pr.vy += ((dy / dl) * sp - pr.vy) * k;
          pr.vz += ((dz / dl) * sp - pr.vz) * k;
        }
      }
      const nx = pr.x + pr.vx * step;
      const ny = pr.y + pr.vy * step;
      const nz = pr.z + pr.vz * step;
      const src = pr.ownerType === 'player' ? this.players.get(pr.ownerId) : this.creatures.get(pr.srcId);
      const srcRef = src || { id: pr.ownerId, ownerId: pr.ownerId, wild: pr.wild, status: {} };
      let hitSomething = false;
      // colisão com entidades (teste de segmento contra esfera)
      for (const [e, t] of this.enemiesOf(srcRef, pr.ownerType)) {
        if (pr.hitIds?.includes(e.id)) continue;
        if (t === 'player' && this.buffActive(e, 'invisibility') && this.rand() < 0.5) continue;
        const ep = this.entityPos(e, t);
        const r = this.entityRadius(e, t) + (pr.radius || 0.3);
        if (segmentSphere(pr.x, pr.y, pr.z, nx, ny, nz, ep.x, ep.y, ep.z, r)) {
          if (pr.splash) this.explode(nx, ny, nz, pr.splash, pr.damage, pr.element, srcRef, pr.ownerType);
          else this.damage(e, t, pr.damage, { src: srcRef, srcType: pr.ownerType, element: pr.element, kind: pr.kind, knock: pr.knock || 2 });
          if (pr.kind === 'web') e.status.slow = { until: this.time + 2.5, amount: 0.6 };
          if (pr.pierce && pr.pierce > 0) {
            pr.pierce--;
            (pr.hitIds ||= []).push(e.id);
          } else {
            hitSomething = true;
            break;
          }
        }
      }
      // barreiras bloqueiam projéteis inimigos
      if (!hitSomething) {
        for (const o of this.objects.values()) {
          if (o.type !== 'barrier' || o.ownerId === pr.ownerId) continue;
          if (pointNearWall(nx, nz, o) && ny < o.y + 4.5 * o.size) {
            this.damage(o, 'object', pr.damage * 0.5, {});
            hitSomething = true;
            this.emit('impact', { x: q(nx), y: q(ny), z: q(nz), element: pr.element, blocked: true });
            break;
          }
        }
      }
      const ground = terrainHeight(nx, nz);
      const expired = this.time - pr.born > pr.life;
      if (!hitSomething && (ny <= Math.max(ground, WATER_LEVEL) || expired)) {
        if (pr.splash) this.explode(nx, Math.max(ny, ground), nz, pr.splash, pr.damage, pr.element, srcRef, pr.ownerType);
        else if (!expired) this.emit('impact', { x: q(nx), y: q(Math.max(ny, ground)), z: q(nz), element: pr.element });
        hitSomething = true;
      }
      pr.x = nx;
      pr.y = ny;
      pr.z = nz;
      if (hitSomething) {
        this.projectiles.delete(pr.id);
        this.emit('projectile_remove', { id: pr.id, x: q(nx), y: q(ny), z: q(nz) });
      }
    }
  }

  findEntity(id, type) {
    if (type === 'player') return this.players.get(id);
    if (type === 'creature') return this.creatures.get(id);
    return this.objects.get(id);
  }

  timeWarpFactorAt(x, z, ownerId) {
    let f = 1;
    for (const zn of this.zones.values()) {
      if (zn.type !== 'time_warp' || zn.ownerId === ownerId) continue;
      if (dist2(x, z, zn.x, zn.z) < zn.radius) f = Math.min(f, zn.mult || 0.25);
    }
    return f;
  }

  // ---------------------------------------------------------------- ataques de jogador
  playerAttack(id, { ry, pitch = 0, special = false } = {}) {
    const p = this.players.get(id);
    if (!p || p.dead || p.status.stun?.until > this.time) return { ok: false, reason: 'stunned' };
    if (Number.isFinite(ry)) p.ry = ry;
    pitch = clamp(Number(pitch) || 0, -1.2, 1.2);
    const w = this.weaponOf(p) || UNARMED;
    const cdKey = special ? 'special' : 'attack';
    const interval = special ? w.cooldown : 1 / w.speed;
    if ((p.cds[cdKey] || 0) > this.time + 0.05) return { ok: false, reason: 'cooldown', readyIn: p.cds[cdKey] - this.time };
    p.cds[cdKey] = this.time + interval;
    if (special) p.cds.attack = this.time + 0.4;
    p.blocking = false;
    if (this.buffActive(p, 'invisibility')) p.buffs.invisibility.until = this.time; // atacar revela
    const pos = this.entityPos(p, 'player');
    const style = w.attack === 'melee' ? (['hammer', 'greatsword', 'axe', 'mace'].includes(w.kind) ? 'heavy' : ['spear', 'trident', 'dagger'].includes(w.kind) ? 'thrust' : w.kind === 'gauntlet' || w.kind === 'unarmed' ? 'punch' : 'slash') : ['staff', 'wand'].includes(w.kind) ? 'cast' : 'shoot';
    this.emit('attack', { attackerId: id, attackerType: 'player', style, special, weaponKind: w.kind, element: w.element, x: q(p.x), y: q(p.y), z: q(p.z), ry: q(p.ry) });
    const sizeM = this.sizeMult(p);
    if (w.attack === 'melee') {
      const range = (w.range + (special ? 1 : 0)) * Math.max(1, sizeM * 0.8);
      const arc = special ? Math.PI * 2 : w.arc || 1.4;
      const dmg = w.damage * (special ? 1.6 : 1);
      let hits = 0;
      // o golpe acerta um pouco depois do início da animação (sincronia visual)
      const targets = [];
      for (const [e, t] of this.enemiesOf(p, 'player')) {
        const ep = this.entityPos(e, t);
        const d = dist2(p.x, p.z, ep.x, ep.z) - this.entityRadius(e, t);
        if (d > range || Math.abs(ep.y - pos.y) > range + 1.5) continue;
        const ang = Math.atan2(ep.x - p.x, ep.z - p.z);
        if (Math.abs(angleDiff(p.ry, ang)) > arc / 2 + 0.15) continue;
        targets.push([e, t]);
      }
      for (const [e, t] of targets) {
        this.damage(e, t, dmg, { src: p, srcType: 'player', element: w.element, kind: style, knock: style === 'heavy' ? 6 : 2.5 });
        hits++;
      }
      return { ok: true, hits };
    }
    // ataques à distância
    const dirx = Math.sin(p.ry) * Math.cos(pitch);
    const diry = Math.sin(pitch);
    const dirz = Math.cos(p.ry) * Math.cos(pitch);
    const origin = { x: p.x + dirx * 0.8, y: pos.y + 0.5 * sizeM, z: p.z + dirz * 0.8 };
    if (w.attack === 'beam') {
      const hits = this.beam(p, 'player', origin, { x: dirx, y: diry, z: dirz }, w.range, w.damage * (special ? 1.8 : 1), w.element, special ? 3 : 0);
      return { ok: true, hits };
    }
    const kind = w.kind === 'bow' ? 'arrow' : w.kind === 'cannon' ? 'cannonball' : w.kind === 'blaster' ? 'bolt' : 'orb';
    const shots = special ? (w.kind === 'cannon' ? 1 : 3) : 1;
    let target = null;
    if (kind === 'orb') target = this.nearestEnemyInCone(p, 'player', 30, 0.5);
    for (let i = 0; i < shots; i++) {
      const spread = shots > 1 ? (i - (shots - 1) / 2) * 0.12 : 0;
      const sdx = Math.sin(p.ry + spread) * Math.cos(pitch);
      const sdz = Math.cos(p.ry + spread) * Math.cos(pitch);
      const speed = w.projectileSpeed || 35;
      this.spawnProjectile({
        kind, element: w.element, ownerId: id, ownerType: 'player', x: origin.x, y: origin.y, z: origin.z,
        vx: sdx * speed, vy: diry * speed + (kind === 'arrow' ? 1.5 : 0), vz: sdz * speed, gravity: kind === 'arrow' ? 6 : kind === 'cannonball' ? 4 : 0,
        damage: w.damage * (special && w.kind === 'cannon' ? 1.8 : 1), radius: kind === 'cannonball' ? 0.6 : 0.3, splash: w.splash ? w.splash * (special ? 1.5 : 1) : 0,
        life: (w.range / speed) * 1.4, homing: target ? { id: target[0].id, type: target[1] } : null, size: w.size, knock: kind === 'cannonball' ? 8 : 2,
      });
    }
    return { ok: true };
  }

  beam(src, srcType, origin, dir, range, damage, element, pierce = 0) {
    const hits = [];
    const cand = [];
    for (const [e, t] of this.enemiesOf(src, srcType)) {
      const ep = this.entityPos(e, t);
      const rx = ep.x - origin.x;
      const ry = ep.y - origin.y;
      const rz = ep.z - origin.z;
      const along = rx * dir.x + ry * dir.y + rz * dir.z;
      if (along < 0 || along > range) continue;
      const px = origin.x + dir.x * along - ep.x;
      const py = origin.y + dir.y * along - ep.y;
      const pz = origin.z + dir.z * along - ep.z;
      if (Math.hypot(px, py, pz) <= this.entityRadius(e, t) + 0.6) cand.push([e, t, along]);
    }
    cand.sort((a, b) => a[2] - b[2]);
    let end = range;
    for (const [e, t, along] of cand.slice(0, pierce + 1)) {
      this.damage(e, t, damage, { src, srcType, element, kind: 'beam', knock: 1.5 });
      hits.push(e.id);
      end = along;
    }
    this.emit('beam', { srcId: src.id, x: q(origin.x), y: q(origin.y), z: q(origin.z), tx: q(origin.x + dir.x * end), ty: q(origin.y + dir.y * end), tz: q(origin.z + dir.z * end), element });
    return hits.length;
  }

  nearestEnemyInCone(src, srcType, range, cosLimit = 0.3, exclude = []) {
    let best = null;
    let bestD = Infinity;
    const fx = Math.sin(src.ry);
    const fz = Math.cos(src.ry);
    for (const [e, t] of this.enemiesOf(src, srcType)) {
      if (exclude.includes(e.id) || t === 'object') continue;
      if (t === 'player' && this.buffActive(e, 'invisibility')) continue;
      const dx = e.x - src.x;
      const dz = e.z - src.z;
      const d = Math.hypot(dx, dz);
      if (d > range || d < 0.01) continue;
      const cos = (dx * fx + dz * fz) / d;
      if (cos < cosLimit) continue;
      const score = d * (1.5 - cos);
      if (score < bestD) {
        bestD = score;
        best = [e, t];
      }
    }
    return best;
  }

  setBlocking(id, on) {
    const p = this.players.get(id);
    if (!p || p.dead) return;
    p.blocking = !!on;
    this.emit('block', { playerId: id, on: !!on });
  }

  dodge(id, dir) {
    const p = this.players.get(id);
    if (!p || p.dead) return { ok: false };
    if ((p.cds.dodge || 0) > this.time) return { ok: false, reason: 'cooldown', readyIn: p.cds.dodge - this.time };
    p.cds.dodge = this.time + 1.6;
    p.dodgeUntil = this.time + 0.45;
    p.blocking = false;
    this.emit('dodge', { playerId: id, dir: Number.isFinite(dir) ? q(dir) : q(p.ry) });
    return { ok: true };
  }

  equip(id, index) {
    const p = this.players.get(id);
    if (!p || !Number.isInteger(index) || index < -1 || index >= p.inventory.length) return;
    p.weaponIndex = index;
    this.emit('equip', { playerId: id, weaponIndex: index, spec: this.weaponOf(p) });
  }

  giveWeapon(p, spec) {
    const w = { ...spec, uid: nid('w') };
    p.inventory.push(w);
    if (p.inventory.length > MAX_INVENTORY) p.inventory.splice(0, p.inventory.length - MAX_INVENTORY);
    p.weaponIndex = p.inventory.length - 1;
    this.emit('equip', { playerId: p.id, weaponIndex: p.weaponIndex, spec: w, inventory: p.inventory, created: true });
    return w;
  }

  // ---------------------------------------------------------------- execução de manifestações
  // Recebe as manifestações geradas (generator.generate) e aplica no mundo.
  manifest(playerId, manifestations, meta = {}) {
    const p = this.players.get(playerId);
    const report = [];
    if (!p) return report;
    if (p.dead) return [{ ok: false, message: 'Você está nocauteado — aguarde para renascer.' }];
    for (const m of manifestations) {
      const s = m.spec;
      const entry = { category: m.category, label: s.label, ok: true, message: '', rarity: s.rarity || null, notes: s.notes || [], reason: m.reason || '' };
      if (m.category === 'weapon') {
        const w = this.giveWeapon(p, s);
        entry.spec = w;
        if (m.count > 1) entry.notes.push('Você só consegue empunhar uma por vez — as outras ficam no inventário se pedir de novo.');
        this.progress(playerId, { type: 'create', category: 'weapon', key: `weapon:${s.baseId}`, element: s.element, rarity: s.rarity });
      } else if (m.category === 'creature') {
        const n = Math.max(1, Math.min(m.count, 8));
        let spawned = 0;
        for (let i = 0; i < n; i++) {
          const pts = s.height * s.size >= 2.5 ? 2 : 1;
          // respeita o limite de criaturas por jogador removendo as mais antigas
          let guard = 10;
          while (this.summonPointsOf(playerId) + pts > MAX_SUMMON_POINTS && guard-- > 0) {
            const oldest = [...this.creatures.values()].filter((c) => c.ownerId === playerId && !c.dead).sort((a, b) => a.expireAt - b.expireAt)[0];
            if (!oldest) break;
            this.killCreature(oldest, null, true);
          }
          const ang = p.ry + (n > 1 ? (i / (n - 1) - 0.5) * 2.2 : 0);
          const dist = 3 + s.height * s.size * 0.7 + (n > 3 ? 2 : 0);
          let cx = p.x + Math.sin(ang) * dist;
          let cz = p.z + Math.cos(ang) * dist;
          const pos = resolveStructureCollision(clampToPlayable({ x: cx, z: cz }), 1);
          this.spawnCreature(s, { ownerId: playerId, x: pos.x, z: pos.z, ry: p.ry });
          spawned++;
        }
        entry.count = spawned;
        this.progress(playerId, { type: 'create', category: 'creature', key: `creature:${s.variant || s.species}`, element: s.element, species: s.species, count: spawned });
      } else if (m.category === 'ability') {
        const res = castAbility(this, p, s);
        entry.ok = res.ok;
        if (!res.ok) entry.message = res.message;
        else this.progress(playerId, { type: 'create', category: 'ability', key: `ability:${s.id}`, element: s.element });
      } else if (m.category === 'object') {
        for (let i = 0; i < s.count; i++) {
          const ang = p.ry + (s.count > 1 ? (i / (s.count - 1) - 0.5) * 1.6 : 0);
          const dist = 3.5 + s.size * (s.id === 'house' ? 5 : 1.5);
          const pos = clampToPlayable({ x: p.x + Math.sin(ang) * dist, z: p.z + Math.cos(ang) * dist });
          if (isWater(pos.x, pos.z) && s.id !== 'balloon') continue;
          this.spawnObject(s, playerId, pos.x, pos.z, p.ry + Math.PI);
        }
        this.progress(playerId, { type: 'create', category: 'object', key: `object:${s.id}` });
      } else if (m.category === 'environment') {
        if (this.time - this.env.changedAt < 3) {
          entry.ok = false;
          entry.message = 'O clima acabou de mudar — espere um instante.';
        } else {
          this.setEnv(s);
          this.progress(playerId, { type: 'create', category: 'environment', key: `environment:${s.id}`, id: s.id });
        }
      }
      if (entry.ok) p.match.creations++;
      report.push(entry);
    }
    return report;
  }

  setEnv(s) {
    this.env.changedAt = this.time;
    if (s.kind === 'weather') this.env.weather = s.id;
    else if (s.id === 'day') this.env.timeOfDay = 10;
    else if (s.id === 'night') this.env.timeOfDay = 22.5;
    else if (s.id === 'sunset') this.env.timeOfDay = 18.2;
    this.emit('env', { env: this.publicEnv() });
  }

  publicEnv() {
    return { weather: this.env.weather, timeOfDay: q(this.env.timeOfDay), dayLength: this.env.dayLength };
  }

  progress(playerId, event) {
    this.progressHook?.(playerId, event);
  }

  // ---------------------------------------------------------------- ondas de monstros
  updateWaves(dt) {
    if (this.mode !== 'adventure') return;
    const alivePlayers = [...this.players.values()].filter((p) => !p.dead && p.connected);
    if (!this.players.size) return;
    const w = this.wave;
    if (w.state === 'idle') {
      if (this.time >= w.nextAt && alivePlayers.length) {
        w.number++;
        w.state = 'active';
        w.toSpawn = Math.round((3 + w.number * 1.8) * Math.sqrt(Math.max(1, this.players.size)));
        w.spawned = 0;
        w.batchAt = this.time;
        this.emit('wave', { wave: w.number, count: w.toSpawn, state: 'start' });
      }
      return;
    }
    if (w.spawned < w.toSpawn && this.time >= w.batchAt && alivePlayers.length) {
      const batch = Math.min(w.toSpawn - w.spawned, 2 + Math.floor(w.number / 2));
      const target = alivePlayers[Math.floor(this.rand() * alivePlayers.length)];
      for (let i = 0; i < batch; i++) {
        const sp = this.findWildSpawn(target);
        if (!sp) continue;
        const species = pickWild(w.number, this.rand);
        const elementRoll = this.rand();
        const elements = w.number >= 3 && elementRoll < 0.3 ? [['fire', 'ice', 'lightning', 'poison', 'shadow'][Math.floor(this.rand() * 5)]] : [];
        const size = 0.85 + this.rand() * 0.3 + Math.min(0.6, w.number * 0.03);
        const spec = buildCreatureSpec({ id: species, elements, size }, 99);
        // dificuldade cresce com a onda
        const scale = 1 + (w.number - 1) * 0.08;
        spec.stats = { ...spec.stats, hp: Math.round(spec.stats.hp * scale * 0.8), damage: Math.round(spec.stats.damage * (0.55 + (w.number - 1) * 0.05)) };
        const c = this.spawnCreature(spec, { x: sp.x, z: sp.z, wild: true, wave: w.number, ry: Math.atan2(target.x - sp.x, target.z - sp.z) });
        c.targetId = target.id;
        c.targetType = 'player';
        w.spawned++;
      }
      w.batchAt = this.time + 5;
    }
    const alive = [...this.creatures.values()].some((c) => c.wild && !c.dead && c.wave === w.number);
    if (w.spawned >= w.toSpawn && !alive) {
      w.state = 'idle';
      w.nextAt = this.time + 10;
      this.emit('wave', { wave: w.number, state: 'clear', next: 10 });
      for (const p of this.players.values()) if (!p.dead) this.progress(p.id, { type: 'wave', wave: w.number });
    }
  }

  findWildSpawn(target) {
    for (let tries = 0; tries < 12; tries++) {
      const a = this.rand() * Math.PI * 2;
      const r = 28 + this.rand() * 14;
      const x = target.x + Math.sin(a) * r;
      const z = target.z + Math.cos(a) * r;
      if (Math.hypot(x, z) > PLAYABLE_RADIUS - 10) continue;
      if (isWater(x, z)) continue;
      return resolveStructureCollision({ x, z }, 1.5);
    }
    return null;
  }

  // ---------------------------------------------------------------- passo de simulação
  step(dt) {
    this.time += dt;
    this.env.timeOfDay = (this.env.timeOfDay + (24 / this.env.dayLength) * dt) % 24;
    for (const p of this.players.values()) this.updatePlayer(p, dt);
    for (const c of [...this.creatures.values()]) {
      if (c.dead) {
        if (this.time - c.dieAt > 1.4) {
          this.creatures.delete(c.id);
          this.emit('creature_remove', { id: c.id });
        }
        continue;
      }
      if (c.expireAt < this.time) {
        this.killCreature(c, null, true);
        continue;
      }
      this.tickStatus(c, 'creature', dt);
      if (!c.dead) updateCreature(this, c, dt);
    }
    this.updateProjectiles(dt);
    updatePendingBlasts(this);
    for (const z of [...this.zones.values()]) {
      if (z.until < this.time) {
        this.removeZone(z.id);
        if (z.type === 'storm' && this.env.prevWeather && this.env.weather === 'thunderstorm') {
          this.env.weather = this.env.prevWeather;
          this.env.prevWeather = null;
          this.emit('env', { env: this.publicEnv() });
        }
        continue;
      }
      updateZone(this, z, dt);
    }
    for (const o of [...this.objects.values()]) this.updateObject(o, dt);
    this.updateWaves(dt);
  }

  tickStatus(e, type, dt) {
    for (const k of ['burn', 'poison']) {
      const s = e.status[k];
      if (!s || s.until < this.time) continue;
      s.acc = (s.acc || 0) + s.dps * dt;
      if (s.acc >= 1) {
        const amount = Math.floor(s.acc);
        s.acc -= amount;
        const src = s.src ? this.findEntity(s.src.id, s.src.type) : null;
        e.hp -= amount;
        if (src) e.lastHitBy = { id: src.id, type: s.src.type, ownerId: s.src.type === 'creature' ? src.ownerId : src.id };
        this.emit('hit', { targetId: e.id, targetType: type, amount, element: k === 'burn' ? 'fire' : 'poison', kind: 'dot', x: q(e.x), y: q(e.y + 1), z: q(e.z) });
        if (e.hp <= 0) {
          if (type === 'player') this.koPlayer(e);
          else this.killCreature(e, e.lastHitBy);
          return;
        }
      }
    }
  }

  updatePlayer(p, dt) {
    if (p.dead) {
      if (this.time >= p.respawnAt && p.connected) this.respawn(p);
      return;
    }
    p.energy = Math.min(p.maxEnergy, p.energy + (PLAYER_BASE.energyRegen + p.level * 0.15) * dt);
    if (this.time - (p.lastHitAt || 0) > 6) p.hp = Math.min(p.maxHp, p.hp + 1.5 * dt);
    this.tickStatus(p, 'player', dt);
    // expiração de buffs
    for (const [k, b] of Object.entries(p.buffs)) {
      if (b.until <= this.time && !b.ended) {
        b.ended = true;
        this.emit('buff_end', { playerId: p.id, buff: k });
      }
    }
  }

  updateObject(o, dt) {
    if (o.expireAt < this.time) {
      if (o.type === 'bomb') {
        const src = this.players.get(o.ownerId) || { id: o.ownerId, ownerId: o.ownerId, status: {} };
        this.explode(o.x, o.y + 0.5, o.z, o.data.radius || 6, o.data.damage || 40, o.element || 'fire', src, 'player');
      }
      this.removeObject(o.id, 'expired');
      return;
    }
    if (o.type === 'campfire' || o.type === 'potion' || o.type === 'food' || o.type === 'chest' || o.type === 'trampoline') {
      for (const p of this.players.values()) {
        if (p.dead) continue;
        const d = dist2(p.x, p.z, o.x, o.z);
        if (o.type === 'campfire' && d < 4.5) this.heal(p, 'player', 4 * dt * (o.size || 1));
        else if ((o.type === 'potion' || o.type === 'food') && d < 1.6 && p.hp < p.maxHp) {
          this.heal(p, 'player', o.type === 'potion' ? 35 : 20);
          this.emit('pickup', { playerId: p.id, objectId: o.id, kind: o.type });
          this.removeObject(o.id, 'picked');
          return;
        } else if (o.type === 'chest' && d < 1.8) {
          const level = p.level || 1;
          const id = WEAPON_IDS[Math.floor(this.rand() * WEAPON_IDS.length)];
          const elements = this.rand() < 0.6 ? [Object.keys(ELEMENTS)[Math.floor(this.rand() * 10)]] : [];
          const spec = buildWeaponSpec({ id, elements, size: 1, rarity: 1 }, level);
          const w = this.giveWeapon(p, spec);
          this.emit('pickup', { playerId: p.id, objectId: o.id, kind: 'chest', item: w });
          this.removeObject(o.id, 'opened');
          return;
        } else if (o.type === 'trampoline' && d < 1.6 && Math.abs(p.y - o.y) < 1.2 && (p.cds.tramp || 0) < this.time) {
          p.cds.tramp = this.time + 1;
          p.launchedAt = this.time;
          this.emit('launch', { playerId: p.id, vy: 24 * (o.size || 1) });
        }
      }
    }
  }

  // ---------------------------------------------------------------- estado para rede
  snapshot() {
    const players = [];
    for (const p of this.players.values()) {
      players.push([p.id, q(p.x), q(p.y), q(p.z), q(p.ry), p.anim, Math.ceil(p.hp), Math.floor(p.energy), p.blocking ? 1 : 0, p.dead ? 1 : 0, p.weaponIndex, q(this.sizeMult(p))]);
    }
    const creatures = [];
    for (const c of this.creatures.values()) {
      creatures.push([c.id, q(c.x), q(c.y), q(c.z), q(c.ry), c.state, Math.ceil(c.hp), c.attackStart >= 0 ? q(this.time - c.attackStart) : -1, q(c.moveSpeed || 0)]);
    }
    const projectiles = [];
    for (const pr of this.projectiles.values()) projectiles.push([pr.id, q(pr.x), q(pr.y), q(pr.z), q(pr.vx), q(pr.vy), q(pr.vz)]);
    return { time: q(this.time), players, creatures, projectiles, wave: this.wave.number, waveState: this.wave.state, tod: q(this.env.timeOfDay) };
  }

  fullState() {
    return {
      t: q(this.time),
      mode: this.mode,
      pvp: this.pvp,
      env: this.publicEnv(),
      wave: { number: this.wave.number, state: this.wave.state },
      players: [...this.players.values()].map((p) => this.publicPlayer(p)),
      creatures: [...this.creatures.values()].filter((c) => !c.dead).map((c) => this.publicCreatureFull(c)),
      objects: [...this.objects.values()].map((o) => this.publicObject(o)),
      zones: [...this.zones.values()].map((z) => this.publicZone(z)),
    };
  }
}

const UNARMED = { kind: 'unarmed', attack: 'melee', damage: 6, speed: 2.2, range: 1.7, arc: 1.2, cooldown: 3, element: null };

function pickWild(waveNumber, rand) {
  const pool = WILD_SPAWN_TABLE.filter((e) => e.minWave <= waveNumber);
  const total = pool.reduce((s, e) => s + e.weight, 0);
  let r = rand() * total;
  for (const e of pool) {
    r -= e.weight;
    if (r <= 0) return e.species;
  }
  return pool[0].species;
}

export function segmentSphere(x0, y0, z0, x1, y1, z1, cx, cy, cz, r) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dz = z1 - z0;
  const fx = x0 - cx;
  const fy = y0 - cy;
  const fz = z0 - cz;
  const a = dx * dx + dy * dy + dz * dz;
  let t = a > 0 ? -(fx * dx + fy * dy + fz * dz) / a : 0;
  t = clamp(t, 0, 1);
  const px = x0 + dx * t - cx;
  const py = y0 + dy * t - cy;
  const pz = z0 + dz * t - cz;
  return px * px + py * py + pz * pz <= r * r;
}

export function pointNearWall(x, z, o) {
  const w = 8 * o.size;
  const c = Math.cos(o.ry);
  const s = Math.sin(o.ry);
  const dx = x - o.x;
  const dz = z - o.z;
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) < w / 2 && Math.abs(lz) < 0.9;
}

export { CREATURES };
