// Elementos mágicos: cores, efeitos de status e sinônimos.
// `status` é aplicado pela simulação quando um golpe com esse elemento acerta.

export const ELEMENTS = {
  fire: {
    id: 'fire',
    label: 'Fogo',
    color: 0xff5a1f,
    glow: 0xffb347,
    particle: [0xffe066, 0xff8c1a, 0xff3d00],
    status: { type: 'burn', dps: 4, duration: 3 },
    damageMul: 1.15,
  },
  ice: {
    id: 'ice',
    label: 'Gelo',
    color: 0x8fdcff,
    glow: 0xd9f6ff,
    particle: [0xffffff, 0xbdefff, 0x6ccfff],
    status: { type: 'slow', amount: 0.45, duration: 2.5 },
    damageMul: 1.05,
  },
  lightning: {
    id: 'lightning',
    label: 'Elétrico',
    color: 0x7fb2ff,
    glow: 0xf3f8ff,
    particle: [0xffffff, 0xa8c8ff, 0xfff27a],
    status: { type: 'stun', duration: 0.6 },
    damageMul: 1.1,
  },
  poison: {
    id: 'poison',
    label: 'Veneno',
    color: 0x6bd94a,
    glow: 0xc5ff7a,
    particle: [0xb6ff5c, 0x5fd13c, 0x2f8f2a],
    status: { type: 'poison', dps: 3, duration: 5 },
    damageMul: 1.0,
  },
  arcane: {
    id: 'arcane',
    label: 'Arcano',
    color: 0xb46bff,
    glow: 0xe7c6ff,
    particle: [0xf0d9ff, 0xb46bff, 0x6a2cff],
    status: { type: 'weaken', amount: 0.25, duration: 4 },
    damageMul: 1.12,
  },
  light: {
    id: 'light',
    label: 'Luz',
    color: 0xffe9a3,
    glow: 0xffffff,
    particle: [0xffffff, 0xfff3c4, 0xffd86b],
    status: { type: 'blind', duration: 1.5 },
    damageMul: 1.08,
  },
  shadow: {
    id: 'shadow',
    label: 'Sombra',
    color: 0x5b3f8f,
    glow: 0x9d7bd8,
    particle: [0x2a1d45, 0x5b3f8f, 0x9d7bd8],
    status: { type: 'drain', amount: 0.3, duration: 0 },
    damageMul: 1.1,
  },
  water: {
    id: 'water',
    label: 'Água',
    color: 0x2f8fff,
    glow: 0x9fd8ff,
    particle: [0xe0f4ff, 0x5ab4ff, 0x1c6fd6],
    status: { type: 'knockback', amount: 6, duration: 0 },
    damageMul: 1.0,
  },
  earth: {
    id: 'earth',
    label: 'Terra',
    color: 0x9a7a4f,
    glow: 0xd2b48c,
    particle: [0xc9a878, 0x8a6a42, 0x5a4630],
    status: { type: 'stagger', duration: 0.8 },
    damageMul: 1.12,
  },
  wind: {
    id: 'wind',
    label: 'Vento',
    color: 0xbff5e6,
    glow: 0xffffff,
    particle: [0xffffff, 0xd8fff4, 0x9fe8d5],
    status: { type: 'knockback', amount: 9, duration: 0 },
    damageMul: 0.95,
  },
};

export const ELEMENT_IDS = Object.keys(ELEMENTS);

// Cor neutra (aço) usada quando a arma não tem elemento.
export const NEUTRAL = { id: null, label: '', color: 0xc8d0d8, glow: 0xffffff, particle: [0xffffff, 0xdddddd, 0xaaaaaa] };

export function elementInfo(id) {
  return (id && ELEMENTS[id]) || NEUTRAL;
}
