// Progressão: experiência, níveis, conquistas e estatísticas (funções puras, usadas no
// cliente para o modo solo e no servidor para o multiplayer).

export const MAX_LEVEL = 30;

export function xpForLevel(level) {
  // XP total necessário para ALCANÇAR `level` (nível 1 = 0)
  if (level <= 1) return 0;
  let total = 0;
  for (let l = 1; l < level; l++) total += Math.round(80 * Math.pow(l, 1.45));
  return total;
}

export function levelFromXp(xp) {
  let l = 1;
  while (l < MAX_LEVEL && xp >= xpForLevel(l + 1)) l++;
  return l;
}

export const XP_REWARDS = {
  speak: 2,
  create: 6,
  discovery: 20,
  killCreature: (maxHp) => Math.max(5, Math.round(maxHp / 6)),
  koPlayer: 50,
  waveClear: (wave) => 25 + wave * 10,
};

export const ACHIEVEMENTS = {
  first_word: { label: 'Primeira Palavra', description: 'Fale algo que o jogo entenda.' },
  first_weapon: { label: 'Armado', description: 'Crie sua primeira arma.' },
  first_creature: { label: 'Domador', description: 'Invoque sua primeira criatura.' },
  first_ability: { label: 'Superpoderes', description: 'Use uma habilidade.' },
  weather_wizard: { label: 'Senhor do Clima', description: 'Mude o clima de 3 formas diferentes.' },
  dragon_tamer: { label: 'Coração de Dragão', description: 'Invoque um dragão.' },
  elemental_master: { label: 'Mestre Elemental', description: 'Use 5 elementos diferentes.' },
  discoverer_10: { label: 'Explorador do Vocabulário', description: 'Descubra 10 conceitos.' },
  discoverer_30: { label: 'Enciclopédia Viva', description: 'Descubra 30 conceitos.' },
  legendary: { label: 'Lenda', description: 'Crie um item lendário.' },
  army: { label: 'General', description: 'Invoque um exército.' },
  polyglot: { label: 'Poliglota', description: 'Use comandos em português e inglês.' },
  slayer_25: { label: 'Caçador', description: 'Derrote 25 criaturas.' },
  slayer_100: { label: 'Exterminador de Monstros', description: 'Derrote 100 criaturas.' },
  wave_5: { label: 'Sobrevivente', description: 'Chegue à onda 5.' },
  wave_10: { label: 'Inabalável', description: 'Chegue à onda 10.' },
  pvp_ko: { label: 'Duelista', description: 'Nocauteie outro jogador.' },
  creative: { label: 'Criativo', description: 'Peça algo descrevendo, sem dizer o nome.' },
  level_5: { label: 'Aprendiz de Voz', description: 'Alcance o nível 5.' },
  level_10: { label: 'Mestre da Voz', description: 'Alcance o nível 10.' },
};

export function defaultProfile(name = 'Jogador') {
  return {
    version: 1,
    name,
    appearance: { skin: '#e0ac69', shirt: '#3b82f6', pants: '#1f2937', hair: '#2b1b0e', hairStyle: 'short', accessory: 'none' },
    xp: 0,
    level: 1,
    achievements: {},
    stats: {
      words: 0, creations: 0, kills: 0, deaths: 0, pvpKOs: 0, bestWave: 0, playTime: 0, matches: 0,
      discoveries: [], elementsUsed: [], weatherUsed: [], langs: [],
    },
    history: [],
  };
}

// Garante que um perfil carregado de disco/rede tem todos os campos (migração tolerante).
export function sanitizeProfile(p) {
  const d = defaultProfile(typeof p?.name === 'string' ? p.name.slice(0, 20) : 'Jogador');
  if (!p || typeof p !== 'object') return d;
  const out = { ...d, ...p, stats: { ...d.stats, ...(p.stats || {}) }, appearance: { ...d.appearance, ...(p.appearance || {}) } };
  out.xp = Math.max(0, Number(out.xp) || 0);
  out.level = levelFromXp(out.xp);
  out.achievements = typeof out.achievements === 'object' && out.achievements ? out.achievements : {};
  out.history = Array.isArray(out.history) ? out.history.slice(-50) : [];
  for (const k of ['discoveries', 'elementsUsed', 'weatherUsed', 'langs']) if (!Array.isArray(out.stats[k])) out.stats[k] = [];
  return out;
}

// Aplica um evento de progressão e retorna o que mudou (para notificar o jogador).
export function applyProgress(profile, event) {
  const changes = { xp: 0, levelUp: null, achievements: [] };
  const s = profile.stats;
  const grant = (id) => {
    if (!profile.achievements[id] && ACHIEVEMENTS[id]) {
      profile.achievements[id] = Date.now();
      changes.achievements.push(id);
      changes.xp += 40;
    }
  };
  switch (event.type) {
    case 'speak':
      s.words++;
      changes.xp += XP_REWARDS.speak;
      grant('first_word');
      if (event.lang && !s.langs.includes(event.lang)) s.langs.push(event.lang);
      if (s.langs.length >= 2) grant('polyglot');
      if (event.inferred) grant('creative');
      break;
    case 'create': {
      s.creations++;
      changes.xp += XP_REWARDS.create;
      if (event.key && !s.discoveries.includes(event.key)) {
        s.discoveries.push(event.key);
        changes.xp += XP_REWARDS.discovery;
        changes.discovery = event.key;
      }
      if (event.element && !s.elementsUsed.includes(event.element)) s.elementsUsed.push(event.element);
      if (event.category === 'weapon') grant('first_weapon');
      if (event.category === 'creature') grant('first_creature');
      if (event.category === 'ability') grant('first_ability');
      if (event.category === 'environment' && event.id && !s.weatherUsed.includes(event.id)) s.weatherUsed.push(event.id);
      if (s.weatherUsed.length >= 3) grant('weather_wizard');
      if (event.species === 'dragon') grant('dragon_tamer');
      if (event.rarity === 'lendario') grant('legendary');
      if (event.count >= 5 && event.category === 'creature') grant('army');
      if (s.elementsUsed.length >= 5) grant('elemental_master');
      if (s.discoveries.length >= 10) grant('discoverer_10');
      if (s.discoveries.length >= 30) grant('discoverer_30');
      break;
    }
    case 'kill':
      s.kills++;
      changes.xp += XP_REWARDS.killCreature(event.maxHp || 60);
      if (s.kills >= 25) grant('slayer_25');
      if (s.kills >= 100) grant('slayer_100');
      break;
    case 'ko_player':
      s.pvpKOs++;
      changes.xp += XP_REWARDS.koPlayer;
      grant('pvp_ko');
      break;
    case 'death':
      s.deaths++;
      break;
    case 'wave':
      s.bestWave = Math.max(s.bestWave, event.wave);
      changes.xp += XP_REWARDS.waveClear(event.wave);
      if (event.wave >= 5) grant('wave_5');
      if (event.wave >= 10) grant('wave_10');
      break;
    default:
      break;
  }
  const before = profile.level;
  profile.xp += changes.xp;
  profile.level = levelFromXp(profile.xp);
  if (profile.level > before) {
    changes.levelUp = profile.level;
    const xpBefore = changes.xp;
    if (profile.level >= 5) grant('level_5');
    if (profile.level >= 10) grant('level_10');
    profile.xp += changes.xp - xpBefore;
    profile.level = levelFromXp(profile.xp);
  }
  return changes;
}

export function recordMatch(profile, match) {
  profile.stats.matches++;
  profile.stats.playTime += Math.round(match.duration || 0);
  profile.history.push({
    date: new Date().toISOString(),
    mode: match.mode,
    room: match.room || null,
    duration: Math.round(match.duration || 0),
    kills: match.kills || 0,
    creations: match.creations || 0,
    xp: match.xp || 0,
    wave: match.wave || 0,
  });
  if (profile.history.length > 50) profile.history.splice(0, profile.history.length - 50);
}
