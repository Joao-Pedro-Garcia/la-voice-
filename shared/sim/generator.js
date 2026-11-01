// Camada 4 — Geração: transforma o resultado da interpretação em uma especificação concreta
// (atributos, aparência, raridade), aplicando equilíbrio e desbloqueio por nível.
import { WEAPONS, RARITIES } from '../catalog/weapons.js';
import { CREATURES } from '../catalog/creatures.js';
import { CREATURE_VARIANTS } from '../catalog/variants.js';
import { ABILITIES } from '../catalog/abilities.js';
import { ENVIRONMENT, OBJECTS } from '../catalog/world.js';
import { ELEMENTS } from '../elements.js';
import { clamp } from '../math.js';

const RARITY_MUL = [1, 1.12, 1.26, 1.42, 1.62];
const ELEMENT_SUFFIX = {
  fire: 'de Fogo', ice: 'de Gelo', lightning: 'do Trovão', poison: 'de Veneno', arcane: 'Arcana', light: 'da Luz',
  shadow: 'das Sombras', water: 'das Marés', earth: 'de Pedra', wind: 'dos Ventos',
};
const CREATURE_ELEMENT_SUFFIX = {
  fire: 'de Fogo', ice: 'de Gelo', lightning: 'Elétrico', poison: 'Venenoso', arcane: 'Arcano', light: 'de Luz',
  shadow: 'Sombrio', water: 'Aquático', earth: 'de Pedra', wind: 'dos Ventos',
};

export const MAX_SIZE = 2.4;
export const MIN_SIZE = 0.5;

// Raridade máxima permitida para o nível (equilíbrio da progressão).
export function maxRarityForLevel(level) {
  return clamp(1 + Math.floor(level / 2), 1, 4);
}

function sizeWord(size) {
  if (size >= 2.2) return 'Colossal';
  if (size >= 1.5) return 'Gigante';
  if (size <= 0.7) return 'Mini';
  return '';
}

export function buildWeaponSpec(res, level = 1) {
  const base = WEAPONS[res.id] || WEAPONS.sword;
  const notes = [];
  const elements = res.elements?.length ? res.elements : base.defaultElement ? [base.defaultElement] : [];
  const element = elements[0] || null;
  let size = clamp(res.size || 1, MIN_SIZE, MAX_SIZE);
  let rarityIndex = RARITIES.indexOf(base.rarity);
  if (element) rarityIndex += 1;
  if (elements.length > 1) rarityIndex += 1;
  if (size >= 1.5) rarityIndex += 1;
  rarityIndex += res.rarity || 0;
  const cap = maxRarityForLevel(level);
  if (rarityIndex > cap) {
    notes.push(`Raridade limitada pelo nível ${level}`);
    rarityIndex = cap;
  }
  rarityIndex = clamp(rarityIndex, 0, 4);
  let apprentice = false;
  if (base.unlockLevel > level) {
    apprentice = true;
    notes.push(`${base.label} completa desbloqueia no nível ${base.unlockLevel} — esta é uma versão de aprendiz`);
  }
  const el = element ? ELEMENTS[element] : null;
  const sizeK = size - 1;
  let damage = base.damage * RARITY_MUL[rarityIndex] * (el ? el.damageMul : 1) * (1 + 0.35 * sizeK);
  let speed = base.speed / (1 + 0.3 * Math.max(0, sizeK)) * (size < 1 ? 1 + (1 - size) * 0.6 : 1);
  let range = base.attack === 'melee' ? base.range * (1 + 0.45 * sizeK) : base.range;
  if (apprentice) {
    damage *= 0.65;
    size = Math.min(size, 1);
  }
  const label = [base.label, element ? ELEMENT_SUFFIX[element] : '', sizeWord(size)].filter(Boolean).join(' ');
  return {
    kind: base.kind,
    baseId: base.id,
    label: elements.length > 1 ? `${label} e ${ELEMENT_SUFFIX[elements[1]].replace(/^(de|do|da|das|dos) /, '')}` : label,
    element,
    elements,
    size: Number(size.toFixed(2)),
    rarity: RARITIES[rarityIndex],
    rarityIndex,
    attack: base.attack,
    damage: Math.round(damage),
    speed: Number(speed.toFixed(2)),
    range: Number(range.toFixed(1)),
    arc: base.arc || 0,
    projectileSpeed: base.projectileSpeed || 0,
    splash: (base.splash || 0) * (1 + 0.3 * Math.max(0, sizeK)),
    cooldown: base.cooldown,
    description: base.description,
    apprentice,
    notes,
  };
}

export function buildCreatureSpec(res, level = 1) {
  const variant = res.variant ? CREATURE_VARIANTS[res.variant] : null;
  const base = CREATURES[variant ? variant.base : res.id] || CREATURES.wolf;
  const notes = [];
  const element = res.elements?.[0] || variant?.element || base.defaultElement || null;
  let size = clamp((res.size || 1) * (variant?.sizeMul || 1), MIN_SIZE, MAX_SIZE * 1.2);
  let young = false;
  const unlock = base.unlockLevel;
  if (unlock > level) {
    young = true;
    size = Math.min(size, 0.65);
    notes.push(`${variant?.label || base.label} adulto desbloqueia no nível ${unlock} — veio um filhote`);
  }
  const statMul = variant?.statMul || {};
  const sizeK = size - 1;
  const hpMul = (1 + 0.8 * sizeK) * (young ? 0.5 : 1) * (statMul.hp || 1);
  const dmgMul = (1 + 0.45 * sizeK) * (young ? 0.55 : 1) * (statMul.damage || 1) * (element && element !== base.defaultElement ? 1.08 : 1);
  const speedMul = (size > 1 ? 1 / (1 + 0.15 * sizeK) : 1 + (1 - size) * 0.3) * (statMul.speed || 1);
  const label = [variant?.label || base.label, element && element !== base.defaultElement ? CREATURE_ELEMENT_SUFFIX[element] : '', young ? 'Filhote' : sizeWord(size)]
    .filter(Boolean)
    .join(' ');
  const traits = { ...base.traits, ...(variant?.traits || {}) };
  return {
    species: base.id,
    variant: res.variant || null,
    archetype: base.archetype,
    label,
    params: { ...base.params, ...(variant?.params || {}) },
    colors: { ...base.colors, ...(variant?.colors || {}) },
    element,
    size: Number(size.toFixed(2)),
    height: base.height,
    traits,
    rarity: base.rarity,
    stats: {
      hp: Math.round(base.stats.hp * hpMul),
      damage: Math.round(base.stats.damage * dmgMul),
      speed: Number((base.stats.speed * speedMul).toFixed(2)),
      attackRange: Number((base.stats.attackRange * (traits.ranged ? 1 : Math.max(1, 0.6 + 0.4 * size))).toFixed(2)),
      attackRate: base.stats.attackRate,
    },
    young,
    notes,
  };
}

// Habilidades bloqueadas viram uma alternativa mais simples (sem negar o pedido).
const ABILITY_FALLBACK = {
  meteor: 'fireball', time_warp: 'freeze', storm: 'lightning', earthquake: 'energy_wave', tornado: 'energy_wave', grow: 'shield',
  invisibility: 'speed', clones: 'shield', teleport: 'speed', shrink: 'speed', elemental_burst: 'energy_wave',
};

export function buildAbilitySpec(res, level = 1) {
  let base = ABILITIES[res.id] || ABILITIES.energy_wave;
  const notes = [];
  if (base.unlockLevel > level) {
    const fb = ABILITY_FALLBACK[base.id];
    notes.push(`${base.label} desbloqueia no nível ${base.unlockLevel}`);
    if (fb && ABILITIES[fb].unlockLevel <= level) base = ABILITIES[fb];
  }
  const element = res.elements?.[0] || base.element || null;
  const power = clamp(res.size || 1, 0.6, 1.8) * (1 + 0.15 * (res.rarity || 0));
  const label = base.element && element && element !== base.element && ELEMENT_SUFFIX[element]
    ? `${base.label} ${ELEMENT_SUFFIX[element]}`.replace('Bola de Fogo', 'Bola')
    : !base.element && element && ELEMENT_SUFFIX[element] && ['energy_wave', 'elemental_burst', 'shield', 'barrier', 'laser'].includes(base.id)
      ? `${base.label} ${ELEMENT_SUFFIX[element]}`
      : base.label;
  return {
    id: base.id,
    label: power > 1.3 ? `${label} Suprema` : label,
    element,
    power: Number(power.toFixed(2)),
    duration: base.duration,
    cooldown: base.cooldown,
    energy: Math.round(base.energy * (power > 1 ? 1 + (power - 1) * 0.8 : 1)),
    damage: base.damage ? Math.round(base.damage * power) : 0,
    radius: base.radius ? Number((base.radius * Math.sqrt(power)).toFixed(1)) : 0,
    range: base.range || 0,
    description: base.description,
    notes,
  };
}

export function buildObjectSpec(res) {
  const base = OBJECTS[res.id] || OBJECTS.crate;
  return {
    id: base.id,
    label: base.label + (res.size > 1.4 ? ' Gigante' : ''),
    size: clamp(res.size || 1, 0.6, 2.2),
    count: clamp(res.count || 1, 1, 5),
    element: res.elements?.[0] || null,
    hp: base.hp,
  };
}

export function buildEnvironmentSpec(res) {
  const base = ENVIRONMENT[res.id] || ENVIRONMENT.clear;
  return { id: base.id, kind: base.kind, label: base.label };
}

// Converte a interpretação completa em uma lista de "manifestações" prontas para o mundo.
export function generate(interpretation, level = 1) {
  const out = [];
  for (const r of interpretation.results || []) {
    let spec;
    if (r.category === 'weapon') spec = buildWeaponSpec(r, level);
    else if (r.category === 'creature') spec = buildCreatureSpec(r, level);
    else if (r.category === 'ability') spec = buildAbilitySpec(r, level);
    else if (r.category === 'object') spec = buildObjectSpec(r);
    else if (r.category === 'environment') spec = buildEnvironmentSpec(r);
    else continue;
    out.push({ category: r.category, count: r.count || 1, spec, reason: r.reason || '', inferred: !!r.inferred, alt: !!r.alt, confidence: r.confidence });
  }
  return out;
}

export function conceptKey(m) {
  const s = m.spec;
  if (m.category === 'weapon') return `weapon:${s.baseId}`;
  if (m.category === 'creature') return `creature:${s.variant || s.species}`;
  return `${m.category}:${s.id}`;
}
