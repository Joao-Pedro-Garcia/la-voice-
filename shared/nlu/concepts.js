// Conceitos que não existem diretamente no catálogo, com uma interpretação alternativa coerente.
// A mensagem explica ao jogador o que foi feito no lugar.

const A = (category, id, message, extra = {}) => ({ category, id, message, ...extra });

const SPEED = A('ability', 'speed', 'Veículos não existem por aqui — virou Super Velocidade!');
const FLY = A('ability', 'fly', 'Não há aeronaves no mundo, mas agora você pode voar!');
const HEAL = A('ability', 'heal', 'Transformei esse sentimento em energia de cura.');
const PARTY = A('object', 'balloon', 'Festa! Balões e confete para todo mundo.');
const IMPOSSIBLE = A('ability', 'shield', 'Poder infinito quebraria o jogo… mas aqui está um escudo reforçado!', { rarity: 1, size: 1.6 });

export const ALT_CONCEPTS = {
  carro: SPEED, car: SPEED, moto: SPEED, motocicleta: SPEED, bicicleta: SPEED, bike: SPEED, skate: SPEED, patins: SPEED, patinete: SPEED,
  trem: SPEED, onibus: SPEED, caminhao: SPEED, truck: SPEED, kart: SPEED, ferrari: SPEED, lamborghini: SPEED, 'carro de corrida': SPEED,
  aviao: FLY, airplane: FLY, plane: FLY, helicoptero: FLY, helicopter: FLY, jato: FLY, jet: FLY, nave: FLY, 'nave espacial': FLY, spaceship: FLY,
  'balao de ar': FLY, parapente: FLY, 'asa delta': FLY, vassoura: A('ability', 'fly', 'Uma vassoura mágica? Pode voar à vontade!'), 'tapete voador': FLY,
  'super heroi': A('ability', 'fly', 'Todo super-herói precisa voar!'), superheroi: A('ability', 'fly', 'Todo super-herói precisa voar!'), heroi: A('ability', 'fly', 'Todo herói precisa voar!'),
  barco: A('creature', 'whale', 'Sem barcos, mas uma baleia amiga serve de transporte!'), navio: A('creature', 'whale', 'Sem navios, mas uma baleia amiga serve!'), boat: A('creature', 'whale', 'No boats — a friendly whale instead!'), submarino: A('creature', 'whale', 'Uma baleia é quase um submarino.'),
  pirata: A('weapon', 'sword', 'Uma espada de pirata para você, marujo!', { element: 'water' }), pirate: A('weapon', 'sword', 'A pirate sword!', { element: 'water' }),
  cowboy: A('weapon', 'blaster', 'Um blaster de energia digno do velho oeste.'), xerife: A('weapon', 'blaster', 'Um blaster de energia digno do velho oeste.'),
  jedi: A('weapon', 'sword', 'Uma espada de energia luminosa!', { element: 'light' }), 'sabre de luz': A('weapon', 'sword', 'Uma espada de energia luminosa!', { element: 'light' }), lightsaber: A('weapon', 'sword', 'An energy sword!', { element: 'light' }),
  princesa: A('creature', 'unicorn', 'Toda princesa merece um unicórnio.'), principe: A('creature', 'horse', 'Um cavalo real para o príncipe.'), rei: A('weapon', 'greatsword', 'Uma espada digna de um rei.', { element: 'light', rarity: 1 }), rainha: A('weapon', 'staff', 'Um cetro real para a rainha.', { element: 'light' }),
  alien: A('creature', 'robot', 'Um visitante cósmico chegou!', { element: 'arcane' }), et: A('creature', 'robot', 'Um visitante cósmico chegou!', { element: 'arcane' }), extraterrestre: A('creature', 'robot', 'Um visitante cósmico chegou!', { element: 'arcane' }), ovni: A('creature', 'robot', 'Um disco… quer dizer, um robô cósmico!', { element: 'arcane' }), ufo: A('creature', 'robot', 'A cosmic visitor!', { element: 'arcane' }), marciano: A('creature', 'robot', 'Um visitante cósmico chegou!', { element: 'arcane' }),
  vulcao: A('ability', 'meteor', 'O vulcão entrou em erupção: chuva de rochas flamejantes!'), volcano: A('ability', 'meteor', 'Volcanic eruption!'), erupcao: A('ability', 'meteor', 'Erupção!'),
  amor: HEAL, love: HEAL, coracao: HEAL, heart: HEAL, abraco: HEAL, hug: HEAL, beijo: HEAL, carinho: HEAL, paz: HEAL, peace: HEAL, esperanca: HEAL,
  festa: PARTY, party: PARTY, musica: PARTY, music: PARTY, danca: PARTY, dancar: PARTY, dance: PARTY, alegria: PARTY, felicidade: PARTY, feliz: PARTY, happy: PARTY, carnaval: PARTY,
  tristeza: A('environment', 'rain', 'O céu chorou junto com você…'), triste: A('environment', 'rain', 'O céu ficou triste também…'), sad: A('environment', 'rain', 'The sky is sad too…'),
  raiva: A('ability', 'elemental_burst', 'Sua raiva explodiu em chamas!', { element: 'fire' }), furia: A('ability', 'elemental_burst', 'Fúria flamejante!', { element: 'fire' }), rage: A('ability', 'elemental_burst', 'Fiery rage!', { element: 'fire' }), odio: A('ability', 'elemental_burst', 'Explosão de fúria!', { element: 'fire' }),
  invencivel: IMPOSSIBLE, imortal: IMPOSSIBLE, immortal: IMPOSSIBLE, invincible: IMPOSSIBLE, infinito: IMPOSSIBLE, infinite: IMPOSSIBLE, 'modo deus': IMPOSSIBLE, 'god mode': IMPOSSIBLE, 'todo poderoso': IMPOSSIBLE, onipotente: IMPOSSIBLE, 'vida infinita': IMPOSSIBLE,
  deus: A('weapon', 'greatsword', 'Uma arma divina, digna dos deuses!', { element: 'light', rarity: 1 }), god: A('weapon', 'greatsword', 'A divine weapon!', { element: 'light', rarity: 1 }),
  'matar todos': A('ability', 'energy_wave', 'Uma onda de energia contra todos ao redor!', { size: 1.5 }), 'destruir tudo': A('ability', 'energy_wave', 'Onda de destruição (sem destruir o jogo)!', { size: 1.5 }), 'acabar com todos': A('ability', 'energy_wave', 'Onda de energia em área!', { size: 1.5 }),
  vencer: A('ability', 'grow', 'Para vencer, nada melhor que ficar gigante!'), ganhar: A('ability', 'grow', 'Para ganhar, nada melhor que ficar gigante!'), vitoria: A('ability', 'grow', 'Gigante rumo à vitória!'), win: A('ability', 'grow', 'Grow giant and win!'),
  dinheiro: A('object', 'chest', 'Dinheiro não tem aqui, mas um baú do tesouro tem!'), money: A('object', 'chest', 'A treasure chest!'), rico: A('object', 'chest', 'Um baú do tesouro!'), tesouro: A('object', 'chest', 'Um baú do tesouro!'),
  bebida: A('object', 'potion', 'Uma poção mágica para beber!'), refrigerante: A('object', 'potion', 'Melhor que refrigerante: poção de vida!'), suco: A('object', 'potion', 'Uma poção de suco mágico!'), cafe: A('ability', 'speed', 'Café = energia! Super velocidade ativada.'), coffee: A('ability', 'speed', 'Coffee = speed!'), energetico: A('ability', 'speed', 'Energético = super velocidade!'),
  dormir: A('environment', 'night', 'Hora de dormir: anoiteceu.'), sono: A('environment', 'night', 'Que sono… anoiteceu.'), acordar: A('environment', 'day', 'Bom dia! Amanheceu.'), sleep: A('environment', 'night', 'Night time.'),
  fantasma: undefined,
  medo: A('creature', 'ghost', 'Que medo… um fantasma apareceu!'),
  'buraco negro': A('ability', 'time_warp', 'Um buraco negro distorce o tempo ao redor!', { element: 'shadow' }), 'black hole': A('ability', 'time_warp', 'A black hole warps time!', { element: 'shadow' }),
  gravidade: A('ability', 'jump', 'Gravidade reduzida: super pulo!'), gravity: A('ability', 'jump', 'Low gravity: super jump!'), lua_de_mel: undefined,
  magnetismo: A('ability', 'energy_wave', 'Pulso magnético!', { element: 'lightning' }), ima: A('ability', 'energy_wave', 'Pulso magnético!', { element: 'lightning' }),
  sorte: A('object', 'chest', 'Que sorte! Um baú do tesouro.'), luck: A('object', 'chest', 'Lucky! A treasure chest.'),
  natal: A('environment', 'snow', 'Clima de natal: está nevando!'), christmas: A('environment', 'snow', 'Christmas snow!'),
  praia: A('environment', 'clear', 'Dia de praia: céu limpo e sol!'), beach: A('environment', 'clear', 'Beach day!'),
  escudeiro: A('creature', 'knight', 'Um escudeiro leal!'),
};

for (const k of Object.keys(ALT_CONCEPTS)) if (!ALT_CONCEPTS[k]) delete ALT_CONCEPTS[k];
