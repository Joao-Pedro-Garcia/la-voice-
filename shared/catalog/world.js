// Comandos de ambiente (clima / hora do dia) e objetos que podem ser criados no mundo.

export const ENVIRONMENT = {
  rain: { id: 'rain', label: 'Chuva', kind: 'weather', keywords: ['chuva', 'chover', 'rain', 'raining', 'chuvisco', 'garoa', 'aguaceiro', 'molhar', 'chove'] },
  snow: { id: 'snow', label: 'Neve', kind: 'weather', keywords: ['neve', 'nevar', 'snow', 'snowing', 'inverno', 'winter', 'floco de neve', 'neva', 'natal'] },
  thunderstorm: { id: 'thunderstorm', label: 'Trovoada', kind: 'weather', keywords: ['trovoada', 'thunderstorm', 'tempo ruim', 'tempestade de raios', 'ceu escuro'] },
  fog: { id: 'fog', label: 'Neblina', kind: 'weather', keywords: ['neblina', 'nevoa', 'fog', 'mist', 'cerracao', 'bruma', 'nublado'] },
  clear: { id: 'clear', label: 'Céu Limpo', kind: 'weather', keywords: ['sol', 'sun', 'sunny', 'ensolarado', 'ceu limpo', 'clear', 'tempo bom', 'parar chuva', 'pare a chuva', 'parar a chuva', 'acabar a chuva', 'sem chuva', 'arco iris', 'rainbow', 'verao', 'summer', 'calor'] },
  day: { id: 'day', label: 'Dia', kind: 'time', keywords: ['dia', 'day', 'manha', 'morning', 'amanhecer', 'meio dia', 'noon', 'clarear', 'luz do dia', 'daylight'] },
  night: { id: 'night', label: 'Noite', kind: 'time', keywords: ['noite', 'night', 'escuro', 'dark', 'escuridao', 'darkness', 'lua', 'moon', 'estrelas', 'stars', 'meia noite', 'midnight', 'anoitecer'] },
  sunset: { id: 'sunset', label: 'Pôr do Sol', kind: 'time', keywords: ['por do sol', 'sunset', 'entardecer', 'crepusculo', 'tarde', 'dusk', 'fim de tarde'] },
};

export const OBJECTS = {
  tree: { id: 'tree', label: 'Árvore', hp: 120, solid: true, keywords: ['arvore', 'tree', 'arvores', 'floresta', 'forest', 'planta', 'plant', 'pinheiro', 'palmeira', 'bosque', 'mata'] },
  rock: { id: 'rock', label: 'Rocha', hp: 300, solid: true, keywords: ['pedra', 'rocha', 'rock', 'stone', 'pedregulho', 'boulder', 'rochedo', 'montanha', 'mountain', 'morro'] },
  house: { id: 'house', label: 'Casa', hp: 400, solid: true, keywords: ['casa', 'house', 'cabana', 'cabin', 'abrigo', 'shelter', 'lar', 'home', 'choupana', 'casinha', 'predio', 'building', 'castelo', 'castle', 'torre', 'tower', 'fortaleza'] },
  campfire: { id: 'campfire', label: 'Fogueira', hp: 60, solid: false, healAura: 4, keywords: ['fogueira', 'campfire', 'acampamento', 'fogo de chao', 'lareira', 'fireplace', 'bonfire', 'esquentar', 'aquecer'] },
  crate: { id: 'crate', label: 'Caixa', hp: 40, solid: true, keywords: ['caixa', 'crate', 'box', 'caixote', 'barril', 'barrel', 'baú de madeira'] },
  chest: { id: 'chest', label: 'Baú do Tesouro', hp: 30, solid: true, keywords: ['bau', 'tesouro', 'treasure', 'chest', 'ouro', 'gold', 'moeda', 'coin', 'dinheiro', 'money', 'riqueza', 'presente', 'gift', 'surpresa', 'surprise', 'loot', 'premio'] },
  potion: { id: 'potion', label: 'Poção', hp: 10, solid: false, heal: 35, keywords: ['pocao', 'potion', 'elixir', 'frasco', 'pocao de vida', 'health potion', 'bebida magica'] },
  food: { id: 'food', label: 'Comida', hp: 10, solid: false, heal: 20, keywords: ['comida', 'food', 'maca', 'apple', 'pizza', 'hamburguer', 'burger', 'banana', 'pao', 'bread', 'bolo', 'cake', 'sanduiche', 'lanche', 'fruta', 'fruit', 'carne', 'meat', 'brigadeiro', 'feijoada', 'coxinha', 'pastel', 'chocolate', 'sorvete', 'comer', 'fome', 'faminto', 'hungry'] },
  trampoline: { id: 'trampoline', label: 'Trampolim', hp: 80, solid: false, keywords: ['trampolim', 'trampoline', 'cama elastica', 'mola gigante', 'plataforma de salto', 'jump pad'] },
  balloon: { id: 'balloon', label: 'Balões', hp: 10, solid: false, keywords: ['balao', 'baloes', 'balloon', 'balloons', 'festa', 'party', 'aniversario', 'birthday', 'confete', 'confetti', 'fogos de artificio', 'fireworks', 'celebrar', 'comemorar'] },
};

export const ENVIRONMENT_IDS = Object.keys(ENVIRONMENT);
export const OBJECT_IDS = Object.keys(OBJECTS);
