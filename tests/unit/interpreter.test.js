import { describe, it, expect } from 'vitest';
import { interpret, suggestions } from '../../shared/nlu/interpreter.js';
import { mulberry32 } from '../../shared/math.js';

const first = (text, ctx) => interpret(text, { rand: mulberry32(1), ...ctx }).results[0];
const all = (text) => interpret(text, { rand: mulberry32(1) }).results;

describe('reconhecimento de palavras isoladas (exemplos do enunciado)', () => {
  const cases = [
    ['espada', 'weapon', 'sword'],
    ['dragão', 'creature', 'dragon'],
    ['chuva', 'environment', 'rain'],
    ['bomba', 'ability', 'bomb'],
    ['escudo', 'ability', 'shield'],
    ['tubarão', 'creature', 'shark'],
    ['laser', 'ability', 'laser'],
    ['gigante', 'creature', 'golem'],
  ];
  for (const [text, category, id] of cases) {
    it(`"${text}" → ${category}:${id}`, () => {
      const r = first(text);
      expect(r.category).toBe(category);
      expect(r.id).toBe(id);
    });
  }
  it('"gigante" gera criatura grande', () => expect(first('gigante').size).toBeGreaterThan(1.3));
});

describe('frases completas', () => {
  it('espada de fogo', () => {
    const r = first('Quero uma espada de fogo.');
    expect([r.category, r.id, r.element]).toEqual(['weapon', 'sword', 'fire']);
  });
  it('me dá um dragão', () => expect(first('Me dá um dragão.').id).toBe('dragon'));
  it('escudo gigante', () => {
    const r = first('Crie um escudo gigante.');
    expect(r.id).toBe('shield');
    expect(r.size).toBeGreaterThan(1.5);
  });
  it('quero voar', () => expect(first('Quero voar.').id).toBe('fly'));
  it('exército', () => {
    const r = first('Faça aparecer um exército.');
    expect(r.category).toBe('creature');
    expect(r.count).toBeGreaterThanOrEqual(5);
  });
  it('arma congelante', () => {
    const r = first('Me dê uma arma congelante.');
    expect(r.category).toBe('weapon');
    expect(r.element).toBe('ice');
  });
  it('espada que solta eletricidade', () => {
    const r = first('Quero uma espada que solte eletricidade.');
    expect([r.id, r.element]).toEqual(['sword', 'lightning']);
  });
  it('vários pedidos na mesma frase', () => {
    const rs = all('um lobo de gelo gigante e uma espada de fogo');
    expect(rs.map((r) => r.id)).toEqual(['wolf', 'sword']);
    expect(rs[0].element).toBe('ice');
    expect(rs[1].element).toBe('fire');
  });
  it('dois elementos na mesma arma', () => expect(first('espada de fogo e gelo').elements).toEqual(['fire', 'ice']));
  it('quantidade por extenso', () => expect(first('três lobos').count).toBe(3));
  it('exército de dragões usa a espécie nomeada', () => {
    const r = first('exército de dragões');
    expect(r.id).toBe('dragon');
    expect(r.count).toBeGreaterThan(1);
  });
  it('"faça" não vira "faca"', () => expect(first('faça uma espada').id).toBe('sword'));
  it('"uma faca" é adaga', () => expect(first('uma faca').id).toBe('dagger'));
  it('arma de fogo vira blaster fantasioso', () => expect(first('arma de fogo').id).toBe('blaster'));
  it('frases longas com prioridade: chuva de meteoros', () => expect(first('chuva de meteoros').id).toBe('meteor'));
});

describe('interpretação criativa (sem nomear o item)', () => {
  it('algo para me proteger → escudo', () => expect(first('Quero alguma coisa para me proteger.').id).toBe('shield'));
  it('algo muito rápido → velocidade', () => expect(first('Preciso de algo muito rápido.').id).toBe('speed'));
  it('animal enorme que voa → dragão grande', () => {
    const r = first('Quero um animal enorme que consiga voar.');
    expect(r.category).toBe('creature');
    expect(r.id).toBe('dragon');
    expect(r.size).toBeGreaterThan(1.3);
  });
  it('arma que atira de longe → arma à distância', () => {
    const r = first('quero uma arma que atira de longe');
    expect(r.category).toBe('weapon');
    expect(['bow', 'blaster', 'rifle', 'staff', 'wand', 'cannon']).toContain(r.id);
  });
  it('bicho fofo → criatura fofa', () => expect(['rabbit', 'cat', 'dog', 'chicken', 'unicorn']).toContain(first('me dá um bicho fofo').id));
  it('só um elemento vira poder', () => expect(first('fogo').category).toBe('ability'));
  it('pedido impossível recebe alternativa explicada', () => {
    const r = first('quero ser invencível');
    expect(r.alt).toBe(true);
    expect(r.reason.length).toBeGreaterThan(5);
  });
  it('veículo vira velocidade', () => expect(first('quero um carro').id).toBe('speed'));
  it('não inventa resultado para lixo', () => expect(interpret('asdfgh qwerty').understood).toBe(false));
});

describe('sinônimos, variações e inglês', () => {
  it.each([
    ['me dá uma lâmina', 'sword'],
    ['quero um sabre', 'sword'],
    ['uma marreta', 'hammer'],
    ['jacaré', 'crocodile'],
    ['cobra', 'serpent'],
    ['passarinho', 'eagle'],
    ['cachorrinho', 'dog'],
    ['give me an ice sword', 'sword'],
    ['summon a wolf', 'wolf'],
    ['make it rain', 'rain'],
    ['dargão', 'dragon'],
    ['espadas', 'sword'],
    ['tubaroes', 'shark'],
  ])('"%s" → %s', (text, id) => expect(first(text).id).toBe(id));
  it('variantes geram aparência própria', () => {
    const r = first('uma girafa');
    expect(r.id).toBe('horse');
    expect(r.variant).toBe('girafa');
  });
  it('inglês detectado', () => expect(interpret('give me a fire dragon').lang).toBe('en'));
  it('negação de clima vira céu limpo', () => expect(first('não quero chuva').id).toBe('clear'));
  it('sugestões para palavras próximas', () => expect(suggestions('espadda').length).toBeGreaterThan(0));
});
