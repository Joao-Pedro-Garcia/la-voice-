// Inteligência artificial das criaturas: seguir o dono, procurar alvos, perseguir,
// atacar (corpo a corpo, à distância ou em área), fugir de água, contornar construções
// e barreiras, e comportamentos especiais por espécie.
import { groundHeight, isWater, clampToPlayable, resolveStructureCollision, terrainHeight } from '../world.js';
import { angleDiff, dist2, clamp } from '../math.js';
import { q } from '../protocol.js';
import { pointNearWall } from './world.js';

const RANGED_PROJECTILE = {
  dragon: 'breath', spider: 'web', ghost: 'orb', robot: 'bolt', unicorn: 'bolt', phoenix: 'fireball', frog: 'orb',
};

export function updateCreature(world, c, dt) {
  const now = world.time;
  const owner = c.ownerId ? world.players.get(c.ownerId) : null;
  const stunned = c.status.stun?.until > now;
  let speedMul = 1;
  if (c.status.slow?.until > now) speedMul *= 1 - c.status.slow.amount;
  const warp = world.timeWarpFactorAt(c.x, c.z, c.ownerId || (c.wild ? '__wild' : null));
  speedMul *= warp;

  if (c.state === 'spawn' && now < c.stateUntil) {
    applyMotion(world, c, 0, 0, dt);
    return;
  }

  // ---- escolha de alvo
  if (now >= (c.nextThink || 0)) {
    c.nextThink = now + 0.35 + world.rand() * 0.2;
    retarget(world, c, owner);
  }
  let target = c.targetId ? world.findEntity(c.targetId, c.targetType) : null;
  if (target && (target.dead || (c.targetType === 'player' && world.buffActive(target, 'invisibility')) || (c.status.blind?.until > now && world.rand() < 0.1))) {
    target = null;
    c.targetId = null;
  }

  let desiredX = 0;
  let desiredZ = 0;
  let moveSpeed = 0;
  const stats = c.spec.stats;

  if (stunned) {
    c.state = 'hit';
  } else if (target) {
    const tp = world.entityPos(target, c.targetType);
    const d = dist2(c.x, c.z, tp.x, tp.z) - world.entityRadius(target, c.targetType) - c.radius;
    const ranged = !!c.traits.ranged;
    const reach = ranged ? stats.attackRange : stats.attackRange * 0.9;
    const face = Math.atan2(tp.x - c.x, tp.z - c.z);
    if (d > reach) {
      desiredX = Math.sin(face);
      desiredZ = Math.cos(face);
      moveSpeed = stats.speed * (d > 8 ? 1 : 0.7);
      c.state = moveSpeed > stats.speed * 0.75 ? 'run' : 'walk';
    } else {
      // em alcance: ranged mantém distância; corpo a corpo encosta
      if (ranged && d < reach * 0.4) {
        desiredX = -Math.sin(face);
        desiredZ = -Math.cos(face);
        moveSpeed = stats.speed * 0.5;
        c.state = 'walk';
      } else c.state = c.attackStart >= 0 && now - c.attackStart < 0.6 ? 'attack' : 'idle';
      turnTowards(c, face, dt * 6);
      if (now >= c.nextAttack && Math.abs(angleDiff(c.ry, face)) < 0.8) {
        attack(world, c, target, c.targetType, tp, ranged);
        c.nextAttack = now + (1 / stats.attackRate) / Math.max(0.25, warp);
      }
    }
  } else if (owner && !owner.dead) {
    // segue o dono em formação solta
    const idx = hashIndex(c.id);
    const ang = owner.ry + Math.PI + (idx % 5 - 2) * 0.5;
    const fx = owner.x + Math.sin(ang) * (3 + (idx % 3) * 1.5 + c.radius);
    const fz = owner.z + Math.cos(ang) * (3 + (idx % 3) * 1.5 + c.radius);
    const d = dist2(c.x, c.z, fx, fz);
    if (d > 60) {
      // ficou muito para trás: teleporta perto do dono
      c.x = fx;
      c.z = fz;
      world.emit('teleport', { id: c.id, entityType: 'creature', x: q(fx), y: q(c.y), z: q(fz) });
    } else if (d > 1.5) {
      const face = Math.atan2(fx - c.x, fz - c.z);
      desiredX = Math.sin(face);
      desiredZ = Math.cos(face);
      moveSpeed = Math.min(stats.speed * 1.15, d > 10 ? stats.speed * 1.15 : stats.speed * 0.5 + d * 0.2);
      c.state = moveSpeed > stats.speed * 0.75 ? 'run' : 'walk';
    } else {
      c.state = 'idle';
      turnTowards(c, owner.ry, dt * 2);
    }
    // unicórnio cura o dono de tempos em tempos
    if (c.spec.species === 'unicorn' && now >= (c.nextHeal || 0) && owner.hp < owner.maxHp * 0.8) {
      c.nextHeal = now + 8;
      world.heal(owner, 'player', 15);
    }
  } else {
    // vagar perto de casa
    if (now >= c.wanderAt) {
      c.wanderAt = now + 3 + world.rand() * 5;
      const a = world.rand() * Math.PI * 2;
      const r = world.rand() * 12;
      c.wx = c.home.x + Math.sin(a) * r;
      c.wz = c.home.z + Math.cos(a) * r;
    }
    const d = dist2(c.x, c.z, c.wx, c.wz);
    if (d > 1) {
      const face = Math.atan2(c.wx - c.x, c.wz - c.z);
      desiredX = Math.sin(face);
      desiredZ = Math.cos(face);
      moveSpeed = stats.speed * 0.35;
      c.state = 'walk';
    } else c.state = 'idle';
  }
  if (c.hitAt > now - 0.25 && c.state === 'idle') c.state = 'hit';

  moveSpeed *= speedMul;
  if (moveSpeed > 0) {
    turnTowards(c, Math.atan2(desiredX, desiredZ), dt * (c.traits.fast ? 8 : 5));
    // move na direção em que está virado (curvas suaves)
    const fx = Math.sin(c.ry);
    const fz = Math.cos(c.ry);
    applyMotion(world, c, fx * moveSpeed, fz * moveSpeed, dt);
  } else applyMotion(world, c, 0, 0, dt);
  c.moveSpeed = moveSpeed;
}

function hashIndex(id) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function turnTowards(c, ang, k) {
  const d = angleDiff(c.ry, ang);
  c.ry += clamp(d, -k, k);
}

function retarget(world, c, owner) {
  const aggro = c.wild ? 22 : 18;
  let best = null;
  let bestScore = Infinity;
  const center = owner && !c.wild ? owner : c;
  for (const [e, t] of world.enemiesOf(c, 'creature')) {
    if (t === 'object' && e.type === 'crate') continue;
    if (t === 'player' && world.buffActive(e, 'invisibility')) continue;
    const d = dist2(c.x, c.z, e.x, e.z);
    const dc = dist2(center.x, center.z, e.x, e.z);
    if (d > aggro * 1.6 || dc > aggro) continue;
    let score = d;
    if (t === 'object' && e.type === 'clone') score *= 0.4; // clones atraem inimigos
    if (t === 'object' && e.type === 'barrier') score *= 2.5;
    if (e.id === c.targetId) score *= 0.7; // persistência
    // aliados priorizam quem está atacando o dono
    if (owner && e.targetId === owner.id) score *= 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = [e, t];
    }
  }
  if (best) {
    c.targetId = best[0].id;
    c.targetType = best[1];
  } else if (c.wild && c.targetId && c.targetType === 'player') {
    // criaturas de onda continuam caçando jogadores mesmo de longe
    const tgt = world.players.get(c.targetId);
    if (!tgt || tgt.dead || world.buffActive(tgt, 'invisibility')) c.targetId = null;
  } else c.targetId = null;
  if (c.wild && !c.targetId) {
    // procura o jogador vivo mais próximo (ondas sempre pressionam)
    let bd = Infinity;
    for (const p of world.players.values()) {
      if (p.dead || world.buffActive(p, 'invisibility')) continue;
      const d = dist2(c.x, c.z, p.x, p.z);
      if (d < bd && d < 90) {
        bd = d;
        c.targetId = p.id;
        c.targetType = 'player';
      }
    }
  }
}

function attack(world, c, target, tType, tp, ranged) {
  const now = world.time;
  c.attackStart = now;
  c.state = 'attack';
  const stats = c.spec.stats;
  const element = c.spec.element;
  const species = c.spec.species;
  world.emit('attack', { attackerId: c.id, attackerType: 'creature', species, element, ranged, x: q(c.x), y: q(c.y), z: q(c.z), ry: q(c.ry) });
  if (ranged) {
    const kind = RANGED_PROJECTILE[species] || 'orb';
    const origin = { x: c.x + Math.sin(c.ry) * c.radius, y: (c.flying ? c.y : c.y + c.h * 0.7), z: c.z + Math.cos(c.ry) * c.radius };
    const dx = tp.x - origin.x;
    const dy = tp.y - origin.y;
    const dz = tp.z - origin.z;
    const d = Math.hypot(dx, dy, dz) || 1;
    const speed = kind === 'breath' ? 22 : kind === 'web' ? 18 : 26;
    world.spawnProjectile({
      kind, element: kind === 'web' ? null : element, ownerId: c.ownerId || '__wild', ownerType: 'creature', srcId: c.id, wild: c.wild,
      x: origin.x, y: origin.y, z: origin.z, vx: (dx / d) * speed, vy: (dy / d) * speed, vz: (dz / d) * speed,
      damage: stats.damage, radius: kind === 'breath' ? 1.0 : 0.4, splash: c.traits.aoe ? 3 + c.spec.size : 0, life: (stats.attackRange * 1.6) / speed + 0.3,
      gravity: 0, size: c.spec.size, knock: 2,
    });
    return;
  }
  // corpo a corpo (com atraso curto para casar com a animação)
  world.damage(target, tType, stats.damage, { src: c, srcType: 'creature', element, kind: 'bite', knock: c.traits.tank ? 5 : 2 });
  if (c.traits.aoe) {
    for (const [e, t] of world.enemiesOf(c, 'creature')) {
      if (e === target) continue;
      const ep = world.entityPos(e, t);
      if (dist2(tp.x, tp.z, ep.x, ep.z) < stats.attackRange) world.damage(e, t, stats.damage * 0.6, { src: c, srcType: 'creature', element, kind: 'stomp', knock: 6 });
    }
    world.emit('shockwave', { x: q(tp.x), y: q(terrainHeight(tp.x, tp.z)), z: q(tp.z), radius: stats.attackRange, element });
  }
}

function applyMotion(world, c, vx, vz, dt) {
  // impulso de empurrão (knockback) decai rapidamente
  vx += c.kx;
  vz += c.kz;
  c.kx *= Math.max(0, 1 - dt * 5);
  c.kz *= Math.max(0, 1 - dt * 5);
  let nx = c.x + vx * dt;
  let nz = c.z + vz * dt;
  // não-nadadores não entram na água funda
  if (!c.swimmer && !c.flying && isWater(nx, nz)) {
    nx = c.x;
    nz = c.z;
  }
  // separação simples entre criaturas
  for (const o of world.creatures.values()) {
    if (o === c || o.dead) continue;
    const dx = nx - o.x;
    const dz = nz - o.z;
    const min = c.radius + o.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      const push = (min - d) * 0.5;
      nx += (dx / d) * push;
      nz += (dz / d) * push;
    }
  }
  // barreiras e objetos sólidos
  for (const o of world.objects.values()) {
    if (o.type === 'barrier') {
      if (c.flying) continue;
      if (!world.isEnemy(c, 'creature', o, 'object')) continue;
      if (pointNearWall(nx, nz, o)) {
        nx = c.x;
        nz = c.z;
        // bate na barreira se estiver tentando passar
        if (world.time >= c.nextAttack) {
          world.damage(o, 'object', c.spec.stats.damage, { src: c, srcType: 'creature' });
          c.nextAttack = world.time + 1 / c.spec.stats.attackRate;
          c.attackStart = world.time;
        }
      }
    } else if (o.solid && !c.flying) {
      const r = (o.type === 'house' ? 4 : o.type === 'tree' ? 0.6 : 1.1) * o.size + c.radius;
      const dx = nx - o.x;
      const dz = nz - o.z;
      const d = Math.hypot(dx, dz);
      if (d < r && d > 1e-4) {
        nx = o.x + (dx / d) * r;
        nz = o.z + (dz / d) * r;
      }
    }
  }
  const pos = { x: nx, z: nz };
  if (!c.flying) resolveStructureCollision(pos, c.radius);
  clampToPlayable(pos);
  c.x = pos.x;
  c.z = pos.z;
  const ground = groundHeight(c.x, c.z, c.swimmer);
  const targetY = ground + c.hover + (c.flying ? Math.sin(world.time * 1.3 + hashIndex(c.id)) * 0.4 : 0);
  c.y += (targetY - c.y) * Math.min(1, dt * (c.flying ? 3 : 12));
}
