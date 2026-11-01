// Catálogo de armas base. O elemento, tamanho e raridade final são combinados
// pelo interpretador/gerador (shared/sim/generator.js).
//
// attack: 'melee' (arco de golpe) | 'projectile' (projétil simulado) | 'beam' (raio instantâneo)
// damage: dano base por golpe | speed: golpes por segundo | range: alcance em metros
// cooldown: segundos entre ataques especiais (botão direito / habilidade da arma)
// keywords: palavras PT/EN já normalizadas (sem acento, minúsculas)

export const WEAPONS = {
  sword: {
    id: 'sword', label: 'Espada', kind: 'sword', attack: 'melee', damage: 14, speed: 1.6, range: 2.6, arc: 1.6,
    cooldown: 4, rarity: 'comum', unlockLevel: 1,
    description: 'Lâmina equilibrada, boa para qualquer combate.',
    keywords: ['espada', 'sword', 'lamina', 'blade', 'sabre', 'saber', 'gladio', 'florete', 'rapier', 'rapieira'],
    tags: ['cortar', 'atacar', 'lutar'],
  },
  greatsword: {
    id: 'greatsword', label: 'Montante', kind: 'greatsword', attack: 'melee', damage: 24, speed: 0.9, range: 3.3, arc: 2.0,
    cooldown: 6, rarity: 'raro', unlockLevel: 3,
    description: 'Espada de duas mãos, lenta e devastadora.',
    keywords: ['montante', 'espadao', 'greatsword', 'claymore', 'zweihander', 'espada grande', 'espada de duas maos'],
    tags: ['pesado', 'forte'],
  },
  katana: {
    id: 'katana', label: 'Katana', kind: 'katana', attack: 'melee', damage: 13, speed: 2.1, range: 2.7, arc: 1.4,
    cooldown: 3, rarity: 'incomum', unlockLevel: 2,
    description: 'Lâmina curva e veloz de corte preciso.',
    keywords: ['katana', 'samurai', 'ninja', 'wakizashi', 'nodachi'],
    tags: ['rapido', 'preciso'],
  },
  dagger: {
    id: 'dagger', label: 'Adaga', kind: 'dagger', attack: 'melee', damage: 8, speed: 3.0, range: 1.8, arc: 1.2,
    cooldown: 2, rarity: 'comum', unlockLevel: 1,
    description: 'Pequena e rapidíssima.',
    keywords: ['adaga', 'punhal', 'faca', 'canivete', 'dagger', 'knife', 'kunai', 'estilete'],
    tags: ['rapido', 'pequeno'],
  },
  axe: {
    id: 'axe', label: 'Machado', kind: 'axe', attack: 'melee', damage: 19, speed: 1.1, range: 2.6, arc: 1.5,
    cooldown: 5, rarity: 'comum', unlockLevel: 1,
    description: 'Golpes pesados que atravessam defesas.',
    keywords: ['machado', 'machadinha', 'axe', 'hatchet', 'acha', 'machado de guerra', 'battleaxe'],
    tags: ['pesado', 'cortar'],
  },
  hammer: {
    id: 'hammer', label: 'Martelo', kind: 'hammer', attack: 'melee', damage: 22, speed: 0.9, range: 2.7, arc: 1.7,
    cooldown: 6, rarity: 'incomum', unlockLevel: 1,
    description: 'Esmaga e atordoa os inimigos.',
    keywords: ['martelo', 'marreta', 'hammer', 'mjolnir', 'malho', 'warhammer'],
    tags: ['pesado', 'esmagar', 'forte'],
  },
  mace: {
    id: 'mace', label: 'Maça', kind: 'mace', attack: 'melee', damage: 17, speed: 1.2, range: 2.4, arc: 1.5,
    cooldown: 5, rarity: 'comum', unlockLevel: 1,
    description: 'Clava com cravos, simples e eficaz.',
    keywords: ['maca', 'clava', 'porrete', 'mace', 'club', 'cacete', 'bastao', 'taco', 'morning star', 'mangual'],
    tags: ['esmagar'],
  },
  spear: {
    id: 'spear', label: 'Lança', kind: 'spear', attack: 'melee', damage: 15, speed: 1.4, range: 3.8, arc: 0.7,
    cooldown: 4, rarity: 'comum', unlockLevel: 1,
    description: 'Alcance longo, mantém inimigos à distância.',
    keywords: ['lanca', 'spear', 'pique', 'alabarda', 'halberd', 'zagaia', 'dardo', 'javelin', 'glaive', 'naginata'],
    tags: ['longo', 'perfurar'],
  },
  trident: {
    id: 'trident', label: 'Tridente', kind: 'trident', attack: 'melee', damage: 17, speed: 1.3, range: 3.6, arc: 0.9,
    cooldown: 5, rarity: 'raro', unlockLevel: 2, defaultElement: 'water',
    description: 'Arma dos mares, invoca ondas.',
    keywords: ['tridente', 'trident', 'poseidon', 'netuno', 'arpao', 'harpoon', 'garfo'],
    tags: ['mar', 'longo'],
  },
  scythe: {
    id: 'scythe', label: 'Foice', kind: 'scythe', attack: 'melee', damage: 20, speed: 1.0, range: 3.2, arc: 2.4,
    cooldown: 6, rarity: 'raro', unlockLevel: 3, defaultElement: 'shadow',
    description: 'Golpe em grande arco que atinge vários alvos.',
    keywords: ['foice', 'gadanha', 'scythe', 'ceifador', 'reaper', 'sickle', 'ceifeira'],
    tags: ['sombrio', 'area'],
  },
  bow: {
    id: 'bow', label: 'Arco', kind: 'bow', attack: 'projectile', damage: 13, speed: 1.3, range: 45, projectileSpeed: 45,
    cooldown: 4, rarity: 'comum', unlockLevel: 1,
    description: 'Dispara flechas à distância.',
    keywords: ['arco', 'flecha', 'flechas', 'bow', 'arrow', 'arrows', 'besta', 'crossbow', 'balestra', 'arqueiro', 'archer'],
    tags: ['distancia', 'mirar'],
  },
  staff: {
    id: 'staff', label: 'Cajado', kind: 'staff', attack: 'projectile', damage: 15, speed: 1.1, range: 40, projectileSpeed: 28,
    cooldown: 5, rarity: 'incomum', unlockLevel: 1, defaultElement: 'arcane',
    description: 'Canaliza magia em orbes teleguiados.',
    keywords: ['cajado', 'bastao magico', 'staff', 'cetro', 'scepter', 'magia', 'magico', 'mago', 'feiticeiro', 'bruxo', 'wizard', 'mage', 'grimorio', 'livro de magia'],
    tags: ['magia', 'distancia'],
  },
  wand: {
    id: 'wand', label: 'Varinha', kind: 'wand', attack: 'projectile', damage: 9, speed: 2.4, range: 35, projectileSpeed: 36,
    cooldown: 3, rarity: 'comum', unlockLevel: 1, defaultElement: 'arcane',
    description: 'Feitiços rápidos e leves.',
    keywords: ['varinha', 'wand', 'condao', 'varinha magica', 'feitico', 'spell'],
    tags: ['magia', 'rapido'],
  },
  blaster: {
    id: 'blaster', label: 'Blaster', kind: 'blaster', attack: 'projectile', damage: 10, speed: 3.0, range: 50, projectileSpeed: 60,
    cooldown: 4, rarity: 'incomum', unlockLevel: 2, defaultElement: 'light',
    description: 'Pistola futurista de bolhas de energia.',
    keywords: ['blaster', 'pistola', 'revolver', 'arma de fogo', 'pistola laser', 'pew', 'phaser', 'arma laser', 'gun', 'pistol', 'arma futurista', 'raygun', 'pistola de raio'],
    tags: ['futuro', 'tecnologia', 'distancia', 'rapido'],
  },
  rifle: {
    id: 'rifle', label: 'Rifle de Plasma', kind: 'rifle', attack: 'beam', damage: 18, speed: 1.2, range: 60,
    cooldown: 6, rarity: 'raro', unlockLevel: 4, defaultElement: 'lightning',
    description: 'Dispara um raio de plasma instantâneo.',
    keywords: ['rifle', 'fuzil', 'espingarda', 'metralhadora', 'sniper', 'plasma', 'canhao laser', 'rifle laser', 'shotgun', 'machine gun', 'raio laser', 'feixe'],
    tags: ['futuro', 'tecnologia', 'distancia', 'forte'],
  },
  cannon: {
    id: 'cannon', label: 'Canhão Arcano', kind: 'cannon', attack: 'projectile', damage: 30, speed: 0.5, range: 55, projectileSpeed: 30, splash: 4,
    cooldown: 8, rarity: 'epico', unlockLevel: 5, defaultElement: 'fire',
    description: 'Dispara esferas explosivas de energia (sem munição real).',
    keywords: ['canhao', 'cannon', 'bazuca', 'bazooka', 'lanca foguete', 'rocket launcher', 'morteiro', 'artilharia', 'lança-granadas'],
    tags: ['explosao', 'pesado', 'distancia'],
  },
  gauntlet: {
    id: 'gauntlet', label: 'Manopla', kind: 'gauntlet', attack: 'melee', damage: 11, speed: 2.4, range: 2.0, arc: 1.2,
    cooldown: 3, rarity: 'incomum', unlockLevel: 2,
    description: 'Socos encantados em sequência.',
    keywords: ['manopla', 'luva', 'soco', 'punho', 'gauntlet', 'glove', 'fist', 'boxe', 'soqueira', 'punch'],
    tags: ['rapido', 'socar'],
  },
};

export const WEAPON_IDS = Object.keys(WEAPONS);

export const RARITIES = ['comum', 'incomum', 'raro', 'epico', 'lendario'];
export const RARITY_COLORS = {
  comum: '#d7dde3',
  incomum: '#5fe07a',
  raro: '#4fa8ff',
  epico: '#c06bff',
  lendario: '#ffb52e',
};
