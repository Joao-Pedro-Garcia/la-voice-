// Habilidades e poderes. Todas têm custo de energia, recarga e duração para manter o equilíbrio.
// target: 'self' | 'area' (ao redor do jogador) | 'forward' (à frente) | 'world' (mundo inteiro)

export const ABILITIES = {
  fly: {
    id: 'fly', label: 'Voo', target: 'self', duration: 12, cooldown: 22, energy: 30, unlockLevel: 1,
    description: 'Voe livremente (Espaço sobe, Shift desce).',
    keywords: ['voar', 'voo', 'fly', 'flying', 'asas', 'wings', 'levitar', 'levitacao', 'flutuar', 'float', 'planar', 'jetpack', 'superman', 'decolar'],
  },
  invisibility: {
    id: 'invisibility', label: 'Invisibilidade', target: 'self', duration: 8, cooldown: 28, energy: 35, unlockLevel: 2,
    description: 'Criaturas perdem você de vista; outros jogadores veem só um brilho.',
    keywords: ['invisivel', 'invisibilidade', 'invisible', 'invisibility', 'sumir', 'desaparecer', 'esconder', 'camuflagem', 'camuflar', 'stealth', 'furtivo', 'hide', 'disappear', 'transparente', 'ninguem me veja'],
  },
  shield: {
    id: 'shield', label: 'Escudo', target: 'self', duration: 10, cooldown: 18, energy: 25, unlockLevel: 1, absorb: 70,
    description: 'Uma bolha que absorve dano.',
    keywords: ['escudo', 'shield', 'protecao', 'proteger', 'protect', 'protection', 'defesa', 'defender', 'defend', 'bolha', 'bubble', 'armadura', 'armor', 'armour', 'broquel', 'egide', 'blindagem', 'me proteger', 'seguro', 'campo de forca', 'force field'],
  },
  barrier: {
    id: 'barrier', label: 'Barreira', target: 'forward', duration: 15, cooldown: 16, energy: 25, unlockLevel: 1, hp: 200,
    description: 'Ergue uma muralha mágica que bloqueia ataques e criaturas.',
    keywords: ['barreira', 'barrier', 'muralha', 'parede', 'wall', 'muro', 'bloquear', 'block', 'barricada', 'trincheira', 'fortaleza'],
  },
  lightning: {
    id: 'lightning', label: 'Raios', target: 'forward', duration: 0.6, cooldown: 8, energy: 25, unlockLevel: 1, damage: 28, maxTargets: 3, range: 22, element: 'lightning',
    description: 'Lança raios em até 3 inimigos à frente.',
    keywords: ['raio', 'raios', 'relampago', 'lightning', 'thunder', 'trovao', 'choque', 'shock', 'eletricidade', 'electricity', 'zeus', 'thor', 'soltar raios', 'descarga', 'faisca'],
  },
  storm: {
    id: 'storm', label: 'Tempestade', target: 'area', duration: 10, cooldown: 38, energy: 60, unlockLevel: 3, damage: 18, radius: 18, element: 'lightning',
    description: 'Uma tempestade elétrica castiga inimigos ao seu redor.',
    keywords: ['tempestade', 'storm', 'tormenta', 'furacao', 'hurricane', 'temporal', 'ciclone', 'tufao', 'typhoon'],
  },
  freeze: {
    id: 'freeze', label: 'Chão Congelado', target: 'area', duration: 7, cooldown: 16, energy: 30, unlockLevel: 1, radius: 11, damage: 6, element: 'ice',
    description: 'Congela o chão, deixando inimigos lentos.',
    keywords: ['congelar', 'freeze', 'congelado', 'frozen', 'gelar', 'nevasca', 'blizzard', 'era do gelo', 'congela', 'congelar o chao', 'chao de gelo', 'pista de gelo'],
  },
  energy_wave: {
    id: 'energy_wave', label: 'Onda de Energia', target: 'area', duration: 0.8, cooldown: 11, energy: 30, unlockLevel: 1, damage: 24, radius: 9, element: 'arcane',
    description: 'Uma onda que empurra e fere tudo ao redor.',
    keywords: ['onda', 'wave', 'onda de energia', 'energy wave', 'kamehameha', 'hadouken', 'impulso', 'empurrar', 'push', 'shockwave', 'onda de choque', 'pulso', 'pulse', 'nova', 'explosao de energia', 'tsunami', 'maremoto'],
  },
  laser: {
    id: 'laser', label: 'Raio Laser', target: 'forward', duration: 2.2, cooldown: 12, energy: 35, unlockLevel: 1, damage: 30, range: 35, element: 'light',
    description: 'Um feixe contínuo de energia que atravessa inimigos.',
    keywords: ['laser', 'raio laser', 'feixe de energia', 'beam', 'olhos de laser', 'visao laser', 'laser beam', 'canhao de energia'],
  },
  clones: {
    id: 'clones', label: 'Clones', target: 'self', duration: 10, cooldown: 26, energy: 40, unlockLevel: 2, count: 3,
    description: 'Cria cópias ilusórias que atraem os inimigos.',
    keywords: ['clone', 'clones', 'copia', 'copias', 'copy', 'duplicar', 'multiplicar', 'ilusao', 'illusion', 'doppelganger', 'sosia', 'jutsu'],
  },
  heal: {
    id: 'heal', label: 'Cura', target: 'self', duration: 3, cooldown: 20, energy: 35, unlockLevel: 1, amount: 0.45,
    description: 'Recupera parte da vida (e de aliados próximos).',
    keywords: ['curar', 'cura', 'heal', 'healing', 'vida', 'life', 'health', 'saude', 'regenerar', 'regeneracao', 'remedio', 'medicina', 'medico', 'tratar', 'ferido', 'machucado', 'curativo', 'primeiros socorros', 'band aid', 'reviver'],
  },
  speed: {
    id: 'speed', label: 'Super Velocidade', target: 'self', duration: 10, cooldown: 18, energy: 25, unlockLevel: 1, multiplier: 1.9,
    description: 'Corra quase duas vezes mais rápido.',
    keywords: ['velocidade', 'speed', 'rapido', 'fast', 'correr', 'run', 'flash', 'sonic', 'veloz', 'acelerar', 'pressa', 'turbo', 'nitro', 'agil', 'agilidade', 'quick', 'corrida', 'ligeiro'],
  },
  jump: {
    id: 'jump', label: 'Super Pulo', target: 'self', duration: 12, cooldown: 15, energy: 20, unlockLevel: 1, multiplier: 2.6,
    description: 'Pulos muito mais altos.',
    keywords: ['pulo', 'pular', 'jump', 'saltar', 'salto', 'super pulo', 'mola', 'canguru', 'kangaroo', 'pular alto', 'trampolim'],
  },
  teleport: {
    id: 'teleport', label: 'Teleporte', target: 'forward', duration: 0.3, cooldown: 7, energy: 20, unlockLevel: 2, range: 14,
    description: 'Teleporta você alguns metros para a frente.',
    keywords: ['teleporte', 'teleportar', 'teleport', 'blink', 'piscar', 'dash', 'avanco', 'teletransporte', 'portal', 'aparatar'],
  },
  fireball: {
    id: 'fireball', label: 'Bola de Fogo', target: 'forward', duration: 0, cooldown: 6, energy: 20, unlockLevel: 1, damage: 30, radius: 4, element: 'fire',
    description: 'Arremessa uma esfera elemental que explode no impacto.',
    keywords: ['bola de fogo', 'fireball', 'bola', 'esfera', 'orbe', 'orb', 'projetil', 'bola de energia', 'bola de gelo', 'snowball', 'bola de neve', 'lancar', 'arremessar'],
  },
  meteor: {
    id: 'meteor', label: 'Chuva de Meteoros', target: 'area', duration: 6, cooldown: 50, energy: 80, unlockLevel: 5, damage: 35, radius: 16, element: 'fire',
    description: 'Meteoros caem dos céus sobre os inimigos.',
    keywords: ['meteoro', 'meteoros', 'meteor', 'asteroide', 'asteroid', 'cometa', 'comet', 'chuva de meteoros', 'meteor shower', 'estrela cadente', 'armagedom', 'apocalipse'],
  },
  earthquake: {
    id: 'earthquake', label: 'Terremoto', target: 'area', duration: 3, cooldown: 32, energy: 50, unlockLevel: 3, damage: 22, radius: 16, element: 'earth',
    description: 'Faz a terra tremer e atordoa inimigos.',
    keywords: ['terremoto', 'earthquake', 'tremor', 'sismo', 'abalo', 'quake', 'rachar o chao', 'tremer', 'terra'],
  },
  tornado: {
    id: 'tornado', label: 'Tornado', target: 'forward', duration: 8, cooldown: 28, energy: 45, unlockLevel: 3, damage: 9, radius: 5, element: 'wind',
    description: 'Um tornado que avança puxando inimigos.',
    keywords: ['tornado', 'redemoinho', 'whirlwind', 'twister', 'vendaval', 'rodamoinho', 'vento forte', 'vento'],
  },
  bomb: {
    id: 'bomb', label: 'Bomba Mágica', target: 'forward', duration: 2, cooldown: 10, energy: 25, unlockLevel: 1, damage: 40, radius: 6.5, element: 'fire',
    description: 'Uma bomba fictícia de confete mágico que explode após 2s.',
    keywords: ['bomba', 'bomb', 'explosao', 'explosion', 'explodir', 'explode', 'granada', 'grenade', 'dinamite', 'dynamite', 'tnt', 'boom', 'kaboom', 'missil', 'missile', 'foguete', 'rocket', 'mina'],
  },
  grow: {
    id: 'grow', label: 'Gigantismo', target: 'self', duration: 12, cooldown: 36, energy: 55, unlockLevel: 3, multiplier: 2.2,
    description: 'Você fica gigante: mais vida e dano, porém mais lento.',
    keywords: ['crescer', 'grow', 'ficar gigante', 'ficar grande', 'virar gigante', 'aumentar', 'hulk', 'tita', 'enorme eu', 'me deixa gigante', 'gigantismo'],
  },
  shrink: {
    id: 'shrink', label: 'Miniaturização', target: 'self', duration: 12, cooldown: 25, energy: 25, unlockLevel: 2, multiplier: 0.45,
    description: 'Fica minúsculo: mais rápido e difícil de acertar.',
    keywords: ['encolher', 'shrink', 'diminuir', 'ficar pequeno', 'ficar pequenininho', 'formiga', 'mini', 'homem formiga', 'ant man', 'minusculo', 'tiny'],
  },
  time_warp: {
    id: 'time_warp', label: 'Distorção Temporal', target: 'area', duration: 5, cooldown: 55, energy: 70, unlockLevel: 6, radius: 25, multiplier: 0.25,
    description: 'Desacelera o tempo para todos os inimigos próximos.',
    keywords: ['tempo', 'time', 'parar o tempo', 'stop time', 'desacelerar', 'slow motion', 'camera lenta', 'congelar o tempo', 'relogio', 'zawarudo', 'cronos'],
  },
  summon: {
    id: 'summon', label: 'Invocação', target: 'area', duration: 0, cooldown: 0, energy: 0, unlockLevel: 1,
    description: 'Invoca criaturas aliadas (escolhidas pelo contexto da fala).',
    keywords: ['invocar', 'summon', 'conjurar', 'chamar', 'reforcos', 'reforco'],
  },
  elemental_burst: {
    id: 'elemental_burst', label: 'Domínio Elemental', target: 'area', duration: 1.2, cooldown: 14, energy: 40, unlockLevel: 2, damage: 26, radius: 10,
    description: 'Controla um elemento da natureza e o libera ao redor.',
    keywords: ['controlar', 'dominar', 'control', 'elemento', 'elementos', 'natureza', 'nature', 'avatar', 'dobrar', 'bender', 'elemental', 'mestre dos elementos'],
  },
};

export const ABILITY_IDS = Object.keys(ABILITIES);
