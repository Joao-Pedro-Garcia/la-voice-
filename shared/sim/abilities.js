// Execução das habilidades com custo de energia, recarga, duração e limites.
import { terrainHeight, clampToPlayable, resolveStructureCollision, isWater } from '../world.js';
import { dist2, clamp, angleDiff } from '../math.js';
import { q } from '../protocol.js';

export function castAbility(world, p, s) {
  const now = world.time;
  const key = `ab_${s.id}`;
  const ready = p.cds[key] || 0;
  if (ready > now) return { ok: false, message: `${s.label} em recarga (${Math.ceil(ready - now)}s)` };
  if (p.energy < s.energy) return { ok: false, message: `Energia insuficiente para ${s.label} (${Math.floor(p.energy)}/${s.energy})` };
  const handler = HANDLERS[s.id];
  if (!handler) return { ok: false, message: 'Habilidade desconhecida' };
  const res = handler(world, p, s) || { ok: true };
  if (res.ok === false) return res;
  p.energy -= s.energy;
  p.cds[key] = now + s.cooldown;
  if (world.buffActive(p, 'invisibility') && !['invisibility', 'fly', 'speed', 'jump', 'heal', 'shield', 'shrink'].includes(s.id)) p.buffs.invisibility.until = now;
  world.emit('ability', { playerId: p.id, id: s.id, label: s.label, element: s.element, power: s.power, x: q(p.x), y: q(p.y), z: q(p.z), ry: q(p.ry), radius: s.radius, duration: s.duration * (s.power || 1), cooldown: s.cooldown, ...(res.data || {}) });
  return { ok: true };
}

function forward(p, d) {
  return { x: p.x + Math.sin(p.ry) * d, z: p.z + Math.cos(p.ry) * d };
}

function buff(world, p, name, s, extra = {}) {
  const dur = s.duration * clamp(s.power || 1, 0.8, 1.5);
  p.buffs[name] = { until: world.time + dur, ...extra };
  // efeitos de tamanho são mutuamente exclusivos
  if (name === 'grow') delete p.buffs.shrink;
  if (name === 'shrink') delete p.buffs.grow;
  world.emit('buff', { playerId: p.id, buff: name, until: q(world.time + dur), ...extra });
}

function areaDamage(world, p, x, z, radius, damage, element, knock = 4, filter = null) {
  const hits = [];
  for (const [e, t] of world.enemiesOf(p, 'player')) {
    if (filter && !filter(e, t)) continue;
    const ep = world.entityPos(e, t);
    if (dist2(x, z, ep.x, ep.z) <= radius + world.entityRadius(e, t)) {
      world.damage(e, t, damage, { src: p, srcType: 'player', element, kind: 'ability', knock });
      hits.push(e.id);
    }
  }
  return hits;
}

const HANDLERS = {
  fly: (w, p, s) => buff(w, p, 'fly', s),
  invisibility: (w, p, s) => {
    buff(w, p, 'invisibility', s);
    for (const c of w.creatures.values()) if (c.targetId === p.id) c.targetId = null;
  },
  shield: (w, p, s) => buff(w, p, 'shield', s, { absorb: Math.round(70 * (s.power || 1)), element: s.element }),
  speed: (w, p, s) => buff(w, p, 'speed', s, { mult: 1.9 }),
  jump: (w, p, s) => buff(w, p, 'jump', s, { mult: 2.6 }),
  grow: (w, p, s) => buff(w, p, 'grow', s, { mult: 2.2 }),
  shrink: (w, p, s) => buff(w, p, 'shrink', s, { mult: 0.45 }),
  heal: (w, p, s) => {
    w.heal(p, 'player', p.maxHp * 0.45 * (s.power || 1));
    for (const c of w.creatures.values()) if (c.ownerId === p.id && !c.dead && dist2(c.x, c.z, p.x, p.z) < 10) w.heal(c, 'creature', c.maxHp * 0.3);
    for (const k of ['burn', 'poison', 'slow']) delete p.status[k];
  },
  barrier: (w, p, s) => {
    const f = forward(p, 4);
    if (isWater(f.x, f.z)) return { ok: false, message: 'Não dá para erguer uma barreira na água.' };
    const size = clamp(s.power || 1, 0.8, 1.8);
    w.spawnObject({ id: 'barrier', label: s.label, size, hp: 200, element: s.element || 'arcane' }, p.id, f.x, f.z, p.ry, { expireAt: w.time + s.duration * size, solid: true, data: { width: 8 * size } });
  },
  lightning: (w, p, s) => {
    const targets = [];
    const exclude = [];
    for (let i = 0; i < 3; i++) {
      const t = w.nearestEnemyInCone(p, 'player', s.range || 22, i === 0 ? 0.3 : -0.2, exclude);
      if (!t) break;
      exclude.push(t[0].id);
      targets.push(t);
    }
    const bolts = [];
    for (const [e, t] of targets) {
      const ep = w.entityPos(e, t);
      bolts.push({ x: q(ep.x), y: q(ep.y), z: q(ep.z) });
      w.damage(e, t, s.damage, { src: p, srcType: 'player', element: s.element || 'lightning', kind: 'lightning', knock: 2 });
    }
    if (!bolts.length) {
      const f = forward(p, 10);
      bolts.push({ x: q(f.x), y: q(terrainHeight(f.x, f.z)), z: q(f.z) });
    }
    return { ok: true, data: { bolts } };
  },
  storm: (w, p, s) => {
    w.addZone({ type: 'storm', ownerId: p.id, x: p.x, z: p.z, followId: p.id, radius: s.radius, until: w.time + s.duration, damage: s.damage, element: s.element || 'lightning', interval: 0.7 });
    if (w.env.weather !== 'thunderstorm') {
      w.env.prevWeather = w.env.weather;
      w.env.weather = 'thunderstorm';
      w.emit('env', { env: w.publicEnv() });
    }
  },
  freeze: (w, p, s) => {
    w.addZone({ type: 'freeze', ownerId: p.id, x: p.x, z: p.z, radius: s.radius, until: w.time + s.duration, damage: s.damage, element: s.element || 'ice', interval: 0.5 });
    areaDamage(w, p, p.x, p.z, s.radius, s.damage, s.element || 'ice', 0);
  },
  energy_wave: (w, p, s) => {
    const hits = areaDamage(w, p, p.x, p.z, s.radius, s.damage, s.element || 'arcane', 9);
    return { ok: true, data: { hits: hits.length } };
  },
  elemental_burst: (w, p, s) => {
    const hits = areaDamage(w, p, p.x, p.z, s.radius, s.damage, s.element || 'arcane', 6);
    return { ok: true, data: { hits: hits.length } };
  },
  laser: (w, p, s) => {
    w.addZone({ type: 'laser', ownerId: p.id, followId: p.id, x: p.x, z: p.z, radius: s.range || 35, until: w.time + s.duration, damage: s.damage, element: s.element || 'light', interval: 0.22 });
  },
  clones: (w, p, s) => {
    for (let i = 0; i < 3; i++) {
      const a = p.ry + (i - 1) * 1.2 + Math.PI / 2;
      const pos = resolveStructureCollision(clampToPlayable({ x: p.x + Math.sin(a) * 3, z: p.z + Math.cos(a) * 3 }), 0.5);
      w.spawnObject({ id: 'clone', label: `Clone de ${p.name}`, size: 1, hp: 40 }, p.id, pos.x, pos.z, p.ry, { expireAt: w.time + s.duration, solid: false, data: { appearance: p.appearance, name: p.name } });
    }
  },
  teleport: (w, p, s) => {
    let dist = s.range || 14;
    let pos = null;
    for (; dist > 2; dist -= 2) {
      const f = forward(p, dist);
      const c = clampToPlayable(resolveStructureCollision({ ...f }, 0.6));
      if (!isWater(c.x, c.z)) {
        pos = c;
        break;
      }
    }
    if (!pos) return { ok: false, message: 'Sem espaço para teleportar.' };
    const from = { x: q(p.x), y: q(p.y), z: q(p.z) };
    p.x = pos.x;
    p.z = pos.z;
    p.y = terrainHeight(pos.x, pos.z);
    p.lastInputAt = w.time;
    w.emit('teleport', { id: p.id, entityType: 'player', from, x: q(p.x), y: q(p.y), z: q(p.z) });
  },
  fireball: (w, p, s) => {
    const origin = w.entityPos(p, 'player');
    const target = w.nearestEnemyInCone(p, 'player', 40, 0.6);
    let vx = Math.sin(p.ry) * 30;
    let vz = Math.cos(p.ry) * 30;
    let vy = 0;
    if (target) {
      const tp = w.entityPos(target[0], target[1]);
      const d = Math.hypot(tp.x - origin.x, tp.y - origin.y, tp.z - origin.z) || 1;
      vx = ((tp.x - origin.x) / d) * 30;
      vy = ((tp.y - origin.y) / d) * 30;
      vz = ((tp.z - origin.z) / d) * 30;
    }
    w.spawnProjectile({
      kind: 'fireball', element: s.element || 'fire', ownerId: p.id, ownerType: 'player', x: origin.x + Math.sin(p.ry), y: origin.y + 0.4, z: origin.z + Math.cos(p.ry),
      vx, vy, vz, gravity: 0, damage: s.damage, radius: 0.6 * (s.power || 1), splash: s.radius || 4, life: 2.2, size: s.power || 1, knock: 6,
    });
  },
  meteor: (w, p, s) => {
    const f = forward(p, 12);
    w.addZone({ type: 'meteor', ownerId: p.id, x: f.x, z: f.z, radius: s.radius, until: w.time + s.duration, damage: s.damage, element: s.element || 'fire', interval: 0.45 });
  },
  earthquake: (w, p, s) => {
    const hits = areaDamage(w, p, p.x, p.z, s.radius, s.damage, s.element || 'earth', 3, (e, t) => !(t === 'creature' && e.flying));
    for (const [e, t] of w.enemiesOf(p, 'player')) {
      if (t === 'object' || (t === 'creature' && e.flying)) continue;
      if (dist2(p.x, p.z, e.x, e.z) <= s.radius) e.status.stun = { until: w.time + (t === 'player' ? 0.8 : 1.6) };
    }
    return { ok: true, data: { hits: hits.length } };
  },
  tornado: (w, p, s) => {
    const f = forward(p, 3);
    w.addZone({ type: 'tornado', ownerId: p.id, x: f.x, z: f.z, ry: p.ry, vx: Math.sin(p.ry) * 4.5, vz: Math.cos(p.ry) * 4.5, radius: s.radius, until: w.time + s.duration, damage: s.damage, element: s.element || 'wind', interval: 0.4 });
  },
  bomb: (w, p, s) => {
    const f = forward(p, 2.5);
    w.spawnObject({ id: 'bomb', label: s.label, size: s.power || 1, hp: 999, element: s.element || 'fire' }, p.id, f.x, f.z, p.ry, { expireAt: w.time + 2, solid: false, data: { radius: s.radius, damage: s.damage } });
  },
  time_warp: (w, p, s) => {
    w.addZone({ type: 'time_warp', ownerId: p.id, x: p.x, z: p.z, radius: s.radius, until: w.time + s.duration, mult: 0.25, element: s.element || 'arcane', interval: 99 });
  },
};

export function updateZone(world, z, dt) {
  const owner = world.players.get(z.ownerId);
  if (z.followId) {
    if (!owner || owner.dead) {
      world.removeZone(z.id);
      return;
    }
    z.x = owner.x;
    z.z = owner.z;
    z.ry = owner.ry;
  }
  if (z.type === 'tornado') {
    z.x += z.vx * dt;
    z.z += z.vz * dt;
    // puxa inimigos para o centro
    const src = owner || { id: z.ownerId, status: {} };
    for (const [e, t] of world.enemiesOf(src, 'player')) {
      if (t === 'object') continue;
      const d = dist2(e.x, e.z, z.x, z.z);
      if (d < z.radius * 1.8 && t === 'creature') {
        e.kx += ((z.x - e.x) / (d || 1)) * 12 * dt * 4;
        e.kz += ((z.z - e.z) / (d || 1)) * 12 * dt * 4;
      }
    }
  }
  if (world.time < z.nextTick) return;
  z.nextTick = world.time + z.interval;
  const src = owner || { id: z.ownerId, ownerId: z.ownerId, status: {} };
  if (z.type === 'freeze') {
    for (const [e, t] of world.enemiesOf(src, 'player')) {
      if (t === 'object') continue;
      if (dist2(e.x, e.z, z.x, z.z) <= z.radius) e.status.slow = { until: world.time + 1.2, amount: 0.55 };
    }
  } else if (z.type === 'storm') {
    const cands = [];
    for (const [e, t] of world.enemiesOf(src, 'player')) {
      if (t === 'object') continue;
      if (dist2(e.x, e.z, z.x, z.z) <= z.radius) cands.push([e, t]);
    }
    let target;
    if (cands.length) {
      const [e, t] = cands[Math.floor(world.rand() * cands.length)];
      const ep = world.entityPos(e, t);
      world.damage(e, t, z.damage, { src, srcType: 'player', element: z.element, kind: 'lightning', knock: 2 });
      target = ep;
    } else {
      const a = world.rand() * Math.PI * 2;
      const r = world.rand() * z.radius;
      const x = z.x + Math.sin(a) * r;
      const zz = z.z + Math.cos(a) * r;
      target = { x, y: terrainHeight(x, zz), z: zz };
    }
    world.emit('bolt', { x: q(target.x), y: q(target.y), z: q(target.z), element: z.element });
  } else if (z.type === 'laser') {
    const origin = world.entityPos(owner, 'player');
    origin.y += 0.4;
    const dir = { x: Math.sin(owner.ry), y: 0, z: Math.cos(owner.ry) };
    world.beam(owner, 'player', origin, dir, z.radius, z.damage * 0.2, z.element, 5);
  } else if (z.type === 'meteor') {
    const a = world.rand() * Math.PI * 2;
    const r = Math.sqrt(world.rand()) * z.radius;
    let x = z.x + Math.sin(a) * r;
    let zz = z.z + Math.cos(a) * r;
    // mira em inimigos dentro da área às vezes
    for (const [e, t] of world.enemiesOf(src, 'player')) {
      if (t !== 'object' && dist2(e.x, e.z, z.x, z.z) < z.radius && world.rand() < 0.35) {
        x = e.x;
        zz = e.z;
        break;
      }
    }
    const y = terrainHeight(x, zz);
    world.emit('meteor', { x: q(x), y: q(y), z: q(zz), delay: 0.9, element: z.element });
    (world.pendingBlasts ||= []).push({ at: world.time + 0.9, x, y, z: zz, radius: 4, damage: z.damage, element: z.element, ownerId: z.ownerId });
  } else if (z.type === 'tornado') {
    const hits = [];
    for (const [e, t] of world.enemiesOf(src, 'player')) {
      if (t === 'object') continue;
      if (dist2(e.x, e.z, z.x, z.z) <= z.radius) {
        world.damage(e, t, z.damage, { src, srcType: 'player', element: z.element, kind: 'tornado', knock: 0 });
        hits.push(e.id);
      }
    }
  }
}

// Explosões atrasadas (meteoros) — chamadas pelo World a cada passo.
export function updatePendingBlasts(world) {
  if (!world.pendingBlasts?.length) return;
  const now = world.time;
  const keep = [];
  for (const b of world.pendingBlasts) {
    if (b.at > now) {
      keep.push(b);
      continue;
    }
    const src = world.players.get(b.ownerId) || { id: b.ownerId, ownerId: b.ownerId, status: {} };
    world.explode(b.x, b.y + 0.5, b.z, b.radius, b.damage, b.element, src, 'player');
  }
  world.pendingBlasts = keep;
}

export { angleDiff };
