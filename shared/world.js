// Layout determinístico do mundo: relevo, lago, arena, vila, florestas.
// Usado pelo cliente (renderização) e pelo servidor (física/IA das criaturas).
import { fbm, mulberry32, smoothstep, dist2, clamp } from './math.js';

export const WORLD_SEED = 1337;
export const WORLD_SIZE = 640; // lado do mapa, centrado na origem
export const WORLD_HALF = WORLD_SIZE / 2;
export const PLAYABLE_RADIUS = 285; // além disso há montanhas intransponíveis
export const WATER_LEVEL = -1.2;

export const ARENA = { x: 0, z: 0, radius: 38, wallRadius: 46 };
export const LAKE = { x: 135, z: -95, radius: 58 };
export const VILLAGE = { x: -125, z: 95, radius: 55 };
export const RUINS = { x: 120, z: 150, radius: 30 };
export const SPAWN = { x: 0, z: 30 };

// Altura do terreno em (x, z). Determinística e barata (chamada milhares de vezes).
export function terrainHeight(x, z) {
  const r = Math.sqrt(x * x + z * z);
  // colinas suaves
  let h = fbm(x * 0.012, z * 0.012, 4, WORLD_SEED) * 9;
  h += fbm(x * 0.045, z * 0.045, 2, WORLD_SEED + 9) * 1.4;
  // cordilheira na borda
  const m = smoothstep(PLAYABLE_RADIUS - 70, WORLD_HALF, r);
  if (m > 0) {
    const ridge = 1 - Math.abs(fbm(x * 0.02, z * 0.02, 4, WORLD_SEED + 3));
    h += m * (35 + ridge * ridge * 70);
  }
  // arena plana no centro
  const a = smoothstep(ARENA.wallRadius + 18, ARENA.radius, dist2(x, z, ARENA.x, ARENA.z));
  h = h * (1 - a) + 0.2 * a;
  // vila plana
  const v = smoothstep(VILLAGE.radius + 25, VILLAGE.radius - 10, dist2(x, z, VILLAGE.x, VILLAGE.z));
  h = h * (1 - v) + 1.5 * v;
  // ruínas num platô
  const ru = smoothstep(RUINS.radius + 20, RUINS.radius - 5, dist2(x, z, RUINS.x, RUINS.z));
  h = h * (1 - ru) + 4.5 * ru;
  // lago (bacia abaixo do nível da água)
  const dl = dist2(x, z, LAKE.x, LAKE.z);
  const l = smoothstep(LAKE.radius + 22, LAKE.radius * 0.35, dl);
  h = h * (1 - l) + (WATER_LEVEL - 4.5) * l;
  return h;
}

export function isWater(x, z) {
  return terrainHeight(x, z) < WATER_LEVEL - 0.2;
}

// Altura do chão onde entidades podem pisar (água conta como superfície para criaturas aquáticas).
export function groundHeight(x, z, swimmer = false) {
  const h = terrainHeight(x, z);
  if (swimmer) return Math.max(h, WATER_LEVEL - 0.8);
  return h;
}

export function clampToPlayable(pos) {
  const r = Math.sqrt(pos.x * pos.x + pos.z * pos.z);
  if (r > PLAYABLE_RADIUS) {
    const k = PLAYABLE_RADIUS / r;
    pos.x *= k;
    pos.z *= k;
  }
  return pos;
}

// ---------- Construções (colliders simples em caixa, rotação em Y) ----------
function buildStructures() {
  const rand = mulberry32(WORLD_SEED + 101);
  const list = [];
  // Casas da vila em círculo ao redor de uma praça
  const houseCount = 9;
  for (let i = 0; i < houseCount; i++) {
    const ang = (i / houseCount) * Math.PI * 2 + rand() * 0.2;
    const rr = 26 + rand() * 18;
    const x = VILLAGE.x + Math.cos(ang) * rr;
    const z = VILLAGE.z + Math.sin(ang) * rr;
    const w = 7 + rand() * 4;
    const d = 6 + rand() * 4;
    list.push({
      type: 'house',
      x,
      z,
      w,
      d,
      h: 5 + rand() * 2,
      rot: -ang + Math.PI / 2,
      variant: Math.floor(rand() * 3),
    });
  }
  list.push({ type: 'well', x: VILLAGE.x, z: VILLAGE.z, w: 3, d: 3, h: 2.5, rot: 0, variant: 0 });
  list.push({ type: 'tower', x: VILLAGE.x - 48, z: VILLAGE.z - 30, w: 8, d: 8, h: 22, rot: 0.4, variant: 0 });
  // Pilares e muro da arena
  const pillars = 16;
  for (let i = 0; i < pillars; i++) {
    const ang = (i / pillars) * Math.PI * 2;
    list.push({
      type: 'pillar',
      x: ARENA.x + Math.cos(ang) * ARENA.wallRadius,
      z: ARENA.z + Math.sin(ang) * ARENA.wallRadius,
      w: 3,
      d: 3,
      h: 9,
      rot: -ang,
      variant: i % 4 === 0 ? 1 : 0, // pilares com tocha
    });
  }
  // Ruínas
  for (let i = 0; i < 10; i++) {
    const ang = rand() * Math.PI * 2;
    const rr = 6 + rand() * RUINS.radius * 0.8;
    list.push({
      type: 'ruin',
      x: RUINS.x + Math.cos(ang) * rr,
      z: RUINS.z + Math.sin(ang) * rr,
      w: 2 + rand() * 5,
      d: 1.5 + rand() * 2,
      h: 2 + rand() * 6,
      rot: rand() * Math.PI,
      variant: Math.floor(rand() * 3),
    });
  }
  // Ponte/píer no lago
  list.push({ type: 'pier', x: LAKE.x - LAKE.radius + 8, z: LAKE.z, w: 22, d: 4, h: 0.6, rot: 0, variant: 0 });
  return list;
}
export const STRUCTURES = buildStructures();

function nearStructure(x, z, margin) {
  for (const s of STRUCTURES) {
    if (dist2(x, z, s.x, s.z) < Math.max(s.w, s.d) * 0.75 + margin) return true;
  }
  return false;
}

function isClearArea(x, z) {
  if (dist2(x, z, ARENA.x, ARENA.z) < ARENA.wallRadius + 10) return false;
  if (dist2(x, z, VILLAGE.x, VILLAGE.z) < VILLAGE.radius - 5) return false;
  if (dist2(x, z, LAKE.x, LAKE.z) < LAKE.radius + 4) return false;
  return true;
}

// Posições de árvores (determinísticas). `density` 0..1 permite reduzir em aparelhos fracos
// mantendo as mesmas árvores (subconjunto estável).
export function treePositions(density = 1) {
  const rand = mulberry32(WORLD_SEED + 202);
  const out = [];
  const total = 2600;
  for (let i = 0; i < total; i++) {
    const x = (rand() * 2 - 1) * (PLAYABLE_RADIUS + 25);
    const z = (rand() * 2 - 1) * (PLAYABLE_RADIUS + 25);
    const keep = rand();
    const scale = 0.75 + rand() * 0.7;
    const kind = rand() < 0.62 ? 'pine' : rand() < 0.75 ? 'oak' : 'birch';
    const rot = rand() * Math.PI * 2;
    // florestas agrupadas via ruído
    const forest = fbm(x * 0.01, z * 0.01, 3, WORLD_SEED + 55);
    if (forest < -0.05) continue;
    if (keep > density) continue;
    if (!isClearArea(x, z)) continue;
    if (nearStructure(x, z, 3)) continue;
    const y = terrainHeight(x, z);
    if (y < WATER_LEVEL + 0.4 || y > 45) continue;
    out.push({ x, y, z, scale, kind, rot });
  }
  return out;
}

export function rockPositions(density = 1) {
  const rand = mulberry32(WORLD_SEED + 303);
  const out = [];
  for (let i = 0; i < 700; i++) {
    const x = (rand() * 2 - 1) * (PLAYABLE_RADIUS + 20);
    const z = (rand() * 2 - 1) * (PLAYABLE_RADIUS + 20);
    const scale = 0.4 + Math.pow(rand(), 3) * 3.5;
    const rot = rand() * Math.PI * 2;
    const keep = rand();
    if (keep > density) continue;
    if (dist2(x, z, ARENA.x, ARENA.z) < ARENA.radius) continue;
    if (nearStructure(x, z, 2)) continue;
    out.push({ x, y: terrainHeight(x, z), z, scale, rot, seed: Math.floor(rand() * 1e6) });
  }
  return out;
}

// Colisão simples de entidades com construções (empurra para fora da caixa).
export function resolveStructureCollision(pos, radius = 0.5) {
  for (const s of STRUCTURES) {
    if (s.type === 'pier') continue;
    const dx = pos.x - s.x;
    const dz = pos.z - s.z;
    if (dx * dx + dz * dz > (Math.max(s.w, s.d) + radius + 2) ** 2) continue;
    // rot segue a convenção do three.js: mesh.rotation.y = s.rot
    const c = Math.cos(s.rot);
    const sn = Math.sin(s.rot);
    const lx = dx * c - dz * sn;
    const lz = dx * sn + dz * c;
    const hw = s.w / 2 + radius;
    const hd = s.d / 2 + radius;
    if (Math.abs(lx) < hw && Math.abs(lz) < hd) {
      const px = hw - Math.abs(lx);
      const pz = hd - Math.abs(lz);
      let nlx = lx;
      let nlz = lz;
      if (px < pz) nlx = Math.sign(lx || 1) * hw;
      else nlz = Math.sign(lz || 1) * hd;
      pos.x = s.x + nlx * c + nlz * sn;
      pos.z = s.z - nlx * sn + nlz * c;
    }
  }
  return pos;
}

export function randomSpawnPoint(rand = Math.random, around = SPAWN, spread = 12) {
  const a = rand() * Math.PI * 2;
  const r = rand() * spread;
  const x = clamp(around.x + Math.cos(a) * r, -PLAYABLE_RADIUS, PLAYABLE_RADIUS);
  const z = clamp(around.z + Math.sin(a) * r, -PLAYABLE_RADIUS, PLAYABLE_RADIUS);
  return { x, y: terrainHeight(x, z), z };
}
