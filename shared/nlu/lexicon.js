// Léxico construído a partir dos catálogos + vocabulário de modificadores, pistas e conceitos.
// Cada frase normalizada aponta para uma ou mais "entradas":
//   head     → conceito concreto (arma/criatura/habilidade/ambiente/objeto)
//   element  → modificador elemental
//   size     → modificador de tamanho
//   count    → quantidade / coletivo
//   rarity   → pedido de poder extra
//   cue      → pista de categoria ("animal", "arma", "poder"...)
//   feature  → característica desejada ("rápido", "voar", "proteger"...)
//   neg      → negação
//   alt      → conceito fora do catálogo com interpretação alternativa
import { WEAPONS } from '../catalog/weapons.js';
import { CREATURES } from '../catalog/creatures.js';
import { CREATURE_VARIANTS } from '../catalog/variants.js';
import { ABILITIES } from '../catalog/abilities.js';
import { ENVIRONMENT, OBJECTS } from '../catalog/world.js';
import { normalize } from './normalize.js';
import { ALT_CONCEPTS } from './concepts.js';

export const ELEMENT_WORDS = {
  fire: ['fogo', 'fire', 'chama', 'chamas', 'flamejante', 'flamejantes', 'flame', 'flames', 'flaming', 'fiery', 'queimar', 'queimando', 'queima', 'lava', 'magma', 'incendio', 'incendiaria', 'incendiario', 'brasa', 'brasas', 'inferno', 'infernal', 'ardente', 'quente', 'hot', 'burning', 'vulcanico', 'vulcanica', 'pegando fogo', 'em chamas', 'solar', 'labareda'],
  ice: ['gelo', 'ice', 'icy', 'congelante', 'congelantes', 'congelar', 'congela', 'congelado', 'congelada', 'frio', 'fria', 'cold', 'frozen', 'freezing', 'frost', 'glacial', 'gelado', 'gelada', 'gelida', 'gelido', 'polar', 'artico', 'artica', 'cristal de gelo', 'neve', 'nevado', 'snow', 'inverno', 'geada'],
  lightning: ['eletrico', 'eletrica', 'eletricos', 'eletricas', 'eletricidade', 'electric', 'electricity', 'raio', 'raios', 'trovao', 'trovoes', 'relampago', 'relampagos', 'choque', 'shock', 'lightning', 'thunder', 'voltagem', 'voltage', 'eletrizante', 'faisca', 'faiscas', 'spark', 'sparks', 'plasma', 'tesla', 'energizado', 'energizada'],
  poison: ['veneno', 'venenoso', 'venenosa', 'venenosos', 'toxico', 'toxica', 'toxicos', 'acido', 'acida', 'poison', 'poisonous', 'toxic', 'acid', 'venom', 'venomous', 'peconhento', 'peconhenta', 'radioativo', 'radioativa', 'contaminado', 'gosmento', 'gosmenta'],
  arcane: ['arcano', 'arcana', 'arcane', 'magico', 'magica', 'magicos', 'magic', 'magical', 'mistico', 'mistica', 'mystic', 'encantado', 'encantada', 'enchanted', 'runico', 'runica', 'cosmico', 'cosmica', 'cosmic', 'estelar', 'galactico', 'galactica', 'astral', 'roxo', 'roxa', 'purple'],
  light: ['luz', 'light', 'sagrado', 'sagrada', 'santo', 'santa', 'holy', 'divino', 'divina', 'divine', 'luminoso', 'luminosa', 'brilhante', 'radiante', 'radiant', 'celestial', 'angelical', 'anjo', 'angel', 'dourado', 'dourada', 'golden', 'arco iris', 'rainbow', 'estrela', 'star'],
  shadow: ['sombra', 'sombras', 'shadow', 'shadows', 'sombrio', 'sombria', 'trevas', 'escuridao', 'dark', 'darkness', 'negro', 'negra', 'maldito', 'maldita', 'amaldicoado', 'amaldicoada', 'cursed', 'demoniaco', 'demoniaca', 'demonio', 'demon', 'diabolico', 'infernal sombrio', 'vampirico', 'noturno', 'noturna', 'void', 'vazio', 'abismo'],
  water: ['agua', 'water', 'aquatico', 'aquatica', 'aquatic', 'oceano', 'ocean', 'mar', 'sea', 'marinho', 'marinha', 'aqua', 'liquido', 'liquida', 'mare', 'tide', 'bolha', 'bolhas', 'bubble'],
  earth: ['terra', 'earth', 'pedra', 'pedras', 'stone', 'rocha', 'rochoso', 'rochosa', 'rock', 'rocky', 'cristal', 'cristais', 'crystal', 'diamante', 'diamond', 'granito', 'barro', 'areia', 'sand', 'montanha'],
  wind: ['vento', 'ventos', 'wind', 'ar', 'air', 'aereo', 'aerea', 'furacao', 'brisa', 'breeze', 'ventania', 'tufao', 'nuvem', 'cloud', 'tempestuoso'],
};

const SIZE_WORDS = {
  big: ['gigante', 'gigantes', 'enorme', 'enormes', 'grande', 'grandes', 'imenso', 'imensa', 'colossal', 'giant', 'huge', 'big', 'large', 'massive', 'mega', 'gigantesco', 'gigantesca', 'monstruoso', 'monstruosa', 'titanico', 'titanica', 'descomunal', 'gordo', 'gorda', 'grandao', 'grandona', 'maior', 'bigger', 'jumbo', 'king size', 'do tamanho de um predio', 'gigantao'],
  huge: ['muito grande', 'muito gigante', 'super gigante', 'mais gigante', 'ultra', 'gigantesco gigante', 'maior do mundo', 'enormemente', 'colossal gigante', 'super grande'],
  small: ['pequeno', 'pequena', 'pequenos', 'pequenas', 'mini', 'minusculo', 'minuscula', 'small', 'tiny', 'little', 'filhote', 'filhotes', 'baby', 'bebe', 'pequenino', 'pequenina', 'bebezinho', 'nanico', 'nanica', 'miniatura', 'chibi', 'micro'],
};

const COUNT_COLLECTIVES = {
  exercito: 6, army: 6, legiao: 6, legion: 6, tropa: 5, tropas: 5, batalhao: 6, horda: 5, horde: 5,
  bando: 4, matilha: 4, pack: 4, grupo: 3, group: 3, varios: 3, varias: 3, muitos: 4, muitas: 4, many: 4,
  several: 3, enxame: 5, swarm: 5, manada: 4, herd: 4, cardume: 4, school: 4, revoada: 4, flock: 4,
  familia: 3, time: 3, equipe: 3, team: 3, gangue: 3, gang: 3, colonia: 4, multidao: 6, crowd: 6, monte: 4, monte_de: 4,
  alguns: 2, algumas: 2, some: 2, casal: 2, couple: 2, dupla: 2, duo: 2,
};

const RARITY_WORDS = [
  'lendario', 'lendaria', 'legendary', 'epico', 'epica', 'epic', 'supremo', 'suprema', 'definitivo', 'definitiva', 'ultimate',
  'poderoso', 'poderosa', 'powerful', 'invencivel', 'mais forte', 'mais poderoso', 'mais poderosa', 'destruidor', 'destruidora',
  'mitico', 'mitica', 'mythic', 'ancestral', 'ancient', 'antigo', 'antiga', 'sagrada lendaria', 'insano', 'insana', 'apelao', 'op', 'brabo', 'braba', 'top',
];

const CUES = {
  weapon: ['arma', 'armas', 'weapon', 'weapons', 'atacar', 'ataque', 'attack', 'lutar', 'luta', 'fight', 'combater', 'combate', 'golpear', 'golpe', 'bater', 'acertar', 'ferir', 'derrotar', 'equipamento', 'item de ataque', 'algo para atacar', 'algo pra atacar', 'algo para lutar', 'matar', 'kill', 'destruir', 'cortar', 'empunhar', 'segurar'],
  creature: ['animal', 'animais', 'bicho', 'bichos', 'criatura', 'criaturas', 'creature', 'creatures', 'monstrinho', 'fera', 'feras', 'besta', 'beast', 'pet', 'mascote', 'companheiro', 'companheira', 'companion', 'aliado', 'aliados', 'ally', 'allies', 'invocar', 'invoca', 'invoque', 'summon', 'conjurar', 'chamar', 'chama um', 'montaria', 'mount', 'reforco', 'reforcos', 'ser vivo', 'especie', 'invocacao', 'monstro', 'monstros', 'monster', 'monsters'],
  ability: ['poder', 'poderes', 'power', 'powers', 'habilidade', 'habilidades', 'ability', 'skill', 'superpoder', 'superpoderes', 'super poder', 'dom', 'tecnica', 'jutsu', 'golpe especial', 'especial', 'feitico', 'magia de'],
  environment: ['clima', 'weather', 'ceu', 'sky', 'tempo atmosferico', 'ambiente', 'atmosfera', 'mundo', 'world'],
  object: ['construir', 'build', 'colocar', 'place', 'objeto', 'object', 'item', 'estrutura', 'montar uma', 'erguer'],
};

const FEATURES = {
  fly: ['voar', 'voa', 'voando', 'voador', 'voadora', 'voadores', 'asas', 'asa', 'alado', 'alada', 'fly', 'flies', 'flying', 'wings', 'winged', 'ceu', 'sky', 'planar', 'nas nuvens'],
  swim: ['nadar', 'nada', 'nadando', 'aquatico', 'aquatica', 'swim', 'swimming', 'mar', 'oceano', 'ocean', 'sea', 'debaixo d agua', 'submarino'],
  fast: ['rapido', 'rapida', 'rapidos', 'veloz', 'velozes', 'velocidade', 'ligeiro', 'ligeira', 'fast', 'quick', 'speed', 'speedy', 'correr', 'corre', 'agil'],
  strong: ['forte', 'fortes', 'poderoso', 'poderosa', 'strong', 'powerful', 'pesado', 'pesada', 'heavy', 'resistente', 'tanque', 'tank', 'robusto', 'robusta', 'brutal', 'bruto', 'musculoso', 'parrudo', 'tough'],
  protect: ['proteger', 'protege', 'protecao', 'defender', 'defende', 'defesa', 'protect', 'protection', 'defend', 'defense', 'guarda costas', 'bodyguard', 'seguranca', 'seguro', 'salvar', 'me salvar', 'cuidar de mim'],
  ranged: ['longe', 'distancia', 'a distancia', 'longa distancia', 'alcance', 'mirar', 'atirar', 'disparar', 'shoot', 'ranged', 'far', 'de longe', 'tiro', 'tiros', 'atira', 'dispara'],
  cute: ['fofo', 'fofa', 'fofos', 'fofinho', 'fofinha', 'cute', 'bonitinho', 'bonitinha', 'adoravel', 'lindo', 'linda', 'amigavel', 'carinhoso', 'carinhosa', 'meigo', 'meiga', 'kawaii', 'cuddly', 'domestico'],
  scary: ['monstro', 'monstros', 'monster', 'assustador', 'assustadora', 'medo', 'terror', 'horror', 'scary', 'sinistro', 'sinistra', 'macabro', 'aterrorizante', 'spooky', 'creepy', 'feio', 'feia', 'monstruoso', 'bizarro'],
  venom: ['venenoso', 'venenosa', 'picada', 'picar', 'ferrao', 'peconhento', 'peconhenta', 'venomous', 'morder', 'mordida'],
  cut: ['cortar', 'corta', 'corte', 'afiado', 'afiada', 'sharp', 'fatiar', 'retalhar', 'slash', 'cut'],
  crush: ['esmagar', 'esmaga', 'quebrar', 'quebra', 'smash', 'crush', 'amassar', 'destruir paredes', 'demolir'],
  pierce: ['perfurar', 'perfura', 'espetar', 'furar', 'pierce', 'stab', 'cutucar'],
  explode: ['explodir', 'explode', 'explosivo', 'explosiva', 'explosivos', 'explosao', 'exploda', 'explosive', 'detonar', 'boom'],
  ride: ['montar', 'montaria', 'cavalgar', 'ride', 'mount', 'andar em cima', 'subir em', 'carona'],
  heal: ['curar', 'cura', 'heal', 'vida', 'ferido', 'ferida', 'machucado', 'machucada', 'morrendo', 'dodoi', 'saude', 'health', 'recuperar'],
  hide: ['esconder', 'escondido', 'escondida', 'sumir', 'invisivel', 'hide', 'hidden', 'furtivo', 'furtiva', 'silencioso', 'silenciosa', 'stealth', 'camuflado'],
  jump: ['pular', 'pula', 'saltar', 'salta', 'jump', 'pulo', 'salto'],
  magic: ['magia', 'magico', 'magica', 'feitico', 'feiticeiro', 'mago', 'bruxo', 'bruxa', 'wizard', 'witch', 'spell'],
  tech: ['futurista', 'futuro', 'futuristic', 'tecnologia', 'tecnologico', 'tecnologica', 'tech', 'sci fi', 'robotico', 'cibernetico', 'cyber', 'laser', 'nave espacial', 'espacial', 'space'],
  big: [],
};

const NEGATIONS = ['nao', 'nunca', 'sem', 'not', 'dont', 'without', 'chega de', 'pare de', 'para de', 'tira', 'tire', 'acabar com', 'remover', 'remove'];

// Palavras de habilidade que também funcionam como "característica" (rápido, voar...):
// quando há um substantivo de outra categoria na mesma frase, elas viram características.
export const ABILITY_FEATURE_IDS = new Set(['fly', 'speed', 'shield', 'heal', 'invisibility', 'jump', 'bomb']);

function buildLexicon() {
  const map = new Map(); // phrase -> entries[]
  const add = (phrase, entry) => {
    const p = normalize(phrase);
    if (!p) return;
    if (!map.has(p)) map.set(p, []);
    const list = map.get(p);
    if (!list.some((e) => e.kind === entry.kind && e.category === entry.category && e.id === entry.id && e.variant === entry.variant && e.element === entry.element))
      list.push(entry);
  };

  for (const w of Object.values(WEAPONS)) {
    add(w.id, { kind: 'head', category: 'weapon', id: w.id, weight: 1 });
    add(w.label, { kind: 'head', category: 'weapon', id: w.id, weight: 1 });
    for (const k of w.keywords) add(k, { kind: 'head', category: 'weapon', id: w.id, weight: 1 });
  }
  for (const c of Object.values(CREATURES)) {
    add(c.id, { kind: 'head', category: 'creature', id: c.id, weight: 1 });
    add(c.label, { kind: 'head', category: 'creature', id: c.id, weight: 1 });
    for (const k of c.keywords) {
      const n = normalize(k);
      const collective = COUNT_COLLECTIVES[n] !== undefined || ['aliado', 'ajudante', 'amigo', 'minion', 'lacaio'].includes(n);
      add(k, { kind: 'head', category: 'creature', id: c.id, weight: collective ? 0.6 : 1, collective });
    }
  }
  for (const [key, v] of Object.entries(CREATURE_VARIANTS)) {
    add(key, { kind: 'head', category: 'creature', id: v.base, variant: key, weight: 1.05 });
    if (v.label) add(v.label, { kind: 'head', category: 'creature', id: v.base, variant: key, weight: 1.05 });
  }
  for (const a of Object.values(ABILITIES)) {
    if (a.id === 'summon') {
      for (const k of a.keywords) add(k, { kind: 'cue', category: 'creature' });
      continue;
    }
    add(a.label, { kind: 'head', category: 'ability', id: a.id, weight: 1 });
    for (const k of a.keywords) add(k, { kind: 'head', category: 'ability', id: a.id, weight: 1, featureWord: ABILITY_FEATURE_IDS.has(a.id) });
  }
  for (const e of Object.values(ENVIRONMENT)) {
    add(e.label, { kind: 'head', category: 'environment', id: e.id, weight: 1 });
    for (const k of e.keywords) add(k, { kind: 'head', category: 'environment', id: e.id, weight: 1 });
  }
  for (const o of Object.values(OBJECTS)) {
    add(o.label, { kind: 'head', category: 'object', id: o.id, weight: 0.95 });
    for (const k of o.keywords) add(k, { kind: 'head', category: 'object', id: o.id, weight: 0.95 });
  }
  for (const [el, words] of Object.entries(ELEMENT_WORDS)) for (const w of words) add(w, { kind: 'element', element: el });
  for (const w of SIZE_WORDS.big) add(w, { kind: 'size', value: 1.8 });
  for (const w of SIZE_WORDS.huge) add(w, { kind: 'size', value: 2.4 });
  for (const w of SIZE_WORDS.small) add(w, { kind: 'size', value: 0.55 });
  for (const [w, n] of Object.entries(COUNT_COLLECTIVES)) add(w.replace('_', ' '), { kind: 'count', value: n, collective: true });
  for (const w of RARITY_WORDS) add(w, { kind: 'rarity', value: 1 });
  for (const [cat, words] of Object.entries(CUES)) for (const w of words) add(w, { kind: 'cue', category: cat });
  for (const [f, words] of Object.entries(FEATURES)) for (const w of words) add(w, { kind: 'feature', feature: f });
  for (const w of NEGATIONS) add(w, { kind: 'neg' });
  for (const [w, alt] of Object.entries(ALT_CONCEPTS)) add(w, { kind: 'alt', alt });

  // "gigante" sozinho = criatura gigante (golem)
  add('gigante', { kind: 'head', category: 'creature', id: 'golem', weight: 0.4, weak: true });
  add('giant', { kind: 'head', category: 'creature', id: 'golem', weight: 0.4, weak: true });

  let maxWords = 1;
  for (const k of map.keys()) maxWords = Math.max(maxWords, k.split(' ').length);
  // índice de palavras únicas para busca aproximada (erros do reconhecedor de voz)
  const singles = [...map.keys()].filter((k) => !k.includes(' ') && k.length >= 4);
  return { map, maxWords, singles };
}

export const LEXICON = buildLexicon();

// Semântica das entradas do catálogo, usada quando o jogador descreve algo sem nomeá-lo.
export const CREATURE_SEMANTICS = (() => {
  const real = { fly: ['dragon', 'eagle', 'phoenix', 'bat', 'bee', 'ghost'], cute: ['rabbit', 'cat', 'dog', 'chicken', 'unicorn'], scary: ['ghost', 'spider', 'dragon', 'bat', 'serpent', 'golem', 'dinosaur', 'octopus', 'shark'], ride: ['horse', 'unicorn', 'dragon', 'elephant', 'eagle', 'dinosaur', 'bull'], venom: ['serpent', 'spider', 'bee', 'frog'], magic: ['unicorn', 'phoenix', 'ghost', 'dragon'], tech: ['robot'], swim: ['shark', 'whale', 'fish', 'octopus', 'crocodile', 'frog'] };
  const out = {};
  for (const c of Object.values(CREATURES)) {
    const f = new Set();
    for (const [feat, ids] of Object.entries(real)) if (ids.includes(c.id)) f.add(feat);
    if (c.traits.fast) f.add('fast');
    if (c.traits.tank) { f.add('strong'); f.add('protect'); }
    if (c.stats.damage >= 20) f.add('strong');
    if (c.traits.ranged) f.add('ranged');
    if (c.height >= 2.4) f.add('big');
    if (c.height <= 0.8) f.add('small');
    if (c.id === 'knight') f.add('protect');
    out[c.id] = f;
  }
  return out;
})();

export const WEAPON_SEMANTICS = (() => {
  const tagMap = { rapido: 'fast', pesado: 'strong', forte: 'strong', distancia: 'ranged', magia: 'magic', cortar: 'cut', esmagar: 'crush', perfurar: 'pierce', longo: 'pierce', explosao: 'explode', futuro: 'tech', tecnologia: 'tech', socar: 'crush', area: 'strong', preciso: 'cut', pequeno: 'small', mirar: 'ranged' };
  const out = {};
  for (const w of Object.values(WEAPONS)) {
    const f = new Set();
    for (const t of w.tags) if (tagMap[t]) f.add(tagMap[t]);
    if (w.attack !== 'melee') f.add('ranged');
    if (w.id === 'greatsword' || w.id === 'cannon' || w.id === 'hammer') f.add('big');
    out[w.id] = f;
  }
  return out;
})();

export const ABILITY_SEMANTICS = {
  fly: ['fly'], speed: ['fast'], shield: ['protect'], barrier: ['protect', 'strong'], heal: ['heal'], invisibility: ['hide'],
  jump: ['jump'], bomb: ['explode'], grow: ['big', 'strong'], shrink: ['small', 'hide'], teleport: ['fast'], laser: ['tech', 'ranged'],
  lightning: ['ranged'], fireball: ['ranged', 'explode'], energy_wave: ['strong'], clones: ['hide'], time_warp: ['magic'], meteor: ['explode', 'big'],
};

// Arma padrão para cada elemento quando o jogador pede "uma arma de X" sem dizer qual.
export const ELEMENT_DEFAULT_WEAPON = {
  fire: 'sword', ice: 'spear', lightning: 'hammer', poison: 'dagger', arcane: 'staff', light: 'blaster', shadow: 'scythe', water: 'trident', earth: 'hammer', wind: 'bow',
};
// Habilidade padrão quando a fala só contém um elemento ("fogo!", "gelo!").
export const ELEMENT_DEFAULT_ABILITY = {
  fire: 'fireball', ice: 'freeze', lightning: 'lightning', poison: 'elemental_burst', arcane: 'energy_wave', light: 'laser', shadow: 'elemental_burst', water: 'energy_wave', earth: 'earthquake', wind: 'tornado',
};
// Criatura padrão por elemento ("um bicho de fogo").
export const ELEMENT_DEFAULT_CREATURE = {
  fire: 'phoenix', ice: 'wolf', lightning: 'robot', poison: 'serpent', arcane: 'unicorn', light: 'unicorn', shadow: 'ghost', water: 'shark', earth: 'golem', wind: 'eagle',
};
