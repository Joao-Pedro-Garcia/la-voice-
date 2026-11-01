import { describe, it, expect } from 'vitest';
import { Room } from '../../shared/sim/room.js';
import { World } from '../../shared/sim/world.js';
import { generate, buildWeaponSpec, buildCreatureSpec } from '../../shared/sim/generator.js';
import { interpret } from '../../shared/nlu/interpreter.js';
import { WEAPONS } from '../../shared/catalog/weapons.js';
import { CREATURES } from '../../shared/catalog/creatures.js';
import { CREATURE_VARIANTS } from '../../shared/catalog/variants.js';
import { ABILITIES } from '../../shared/catalog/abilities.js';
import { terrainHeight } from '../../shared/world.js';

function setup({ xp = 0, mode = 'creative' } = {}) {
  const events = [];
  const room = new Room({ seed: 3, mode });
  room.join('p1', { send: (m) => m.list && events.push(...m.list), profile: { name: 'Teste', xp }, session: 's' });
  const tick = (sec) => {
    for (let i = 0; i < sec * 20; i++) room.tick(0.05);
  };
  const say = async (t) => {
    await room.handle('p1', { t: 'voice', text: t });
    tick(1);
    return events.filter((e) => e.type === 'manifest').at(-1);
  };
  return { room, world: room.world, events, tick, say, player: room.world.players.get('p1') };
}

describe('catálogo', () => {
  it('toda arma tem atributos completos', () => {
    for (const w of Object.values(WEAPONS)) {
      for (const k of ['damage', 'speed', 'range', 'cooldown', 'rarity', 'description', 'label']) expect(w[k], `${w.id}.${k}`).toBeDefined();
      expect(w.keywords.length).toBeGreaterThan(2);
    }
  });
  it('toda criatura tem arquétipo, atributos e IA configurável', () => {
    for (const c of Object.values(CREATURES)) {
      expect(c.archetype).toBeTruthy();
      for (const k of ['hp', 'damage', 'speed', 'attackRange', 'attackRate']) expect(c.stats[k]).toBeGreaterThan(0);
    }
  });
  it('variantes apontam para espécies existentes', () => {
    for (const [k, v] of Object.entries(CREATURE_VARIANTS)) expect(CREATURES[v.base], k).toBeDefined();
  });
  it('toda habilidade tem duração, recarga e energia (equilíbrio)', () => {
    for (const a of Object.values(ABILITIES)) {
      if (a.id === 'summon') continue;
      expect(a.cooldown, a.id).toBeGreaterThan(0);
      expect(a.energy, a.id).toBeGreaterThan(0);
    }
  });
});

describe('geração e equilíbrio', () => {
  it('arma elemental é mais rara e forte que a comum', () => {
    const plain = buildWeaponSpec({ id: 'sword', elements: [] }, 10);
    const ice = buildWeaponSpec({ id: 'sword', elements: ['ice'] }, 10);
    expect(ice.rarityIndex).toBeGreaterThan(plain.rarityIndex);
    expect(ice.damage).toBeGreaterThan(plain.damage);
    expect(ice.label).toContain('Gelo');
  });
  it('raridade é limitada pelo nível', () => {
    const w = buildWeaponSpec({ id: 'greatsword', elements: ['fire', 'ice'], size: 2, rarity: 2 }, 1);
    expect(w.rarityIndex).toBeLessThanOrEqual(1);
  });
  it('criatura bloqueada vem como filhote', () => {
    const d = buildCreatureSpec({ id: 'dragon' }, 1);
    expect(d.young).toBe(true);
    expect(d.size).toBeLessThan(1);
    expect(d.notes[0]).toMatch(/nível/);
  });
  it('tamanho gigante aumenta vida', () => {
    const a = buildCreatureSpec({ id: 'wolf', size: 1 }, 10);
    const b = buildCreatureSpec({ id: 'wolf', size: 1.8 }, 10);
    expect(b.stats.hp).toBeGreaterThan(a.stats.hp);
  });
  it('habilidade bloqueada usa alternativa', () => {
    const [m] = generate(interpret('chuva de meteoros'), 1);
    expect(m.spec.id).toBe('fireball');
  });
});

describe('execução no mundo', () => {
  it('criar arma equipa o jogador', async () => {
    const { say, player } = setup();
    const m = await say('espada de gelo');
    expect(m.understood).toBe(true);
    expect(player.inventory).toHaveLength(1);
    expect(player.inventory[0].element).toBe('ice');
    expect(player.weaponIndex).toBe(0);
  });
  it('invocar criatura cria aliado que segue o dono', async () => {
    const { say, world, tick, player } = setup({ xp: 99999 });
    await say('um lobo');
    const wolf = [...world.creatures.values()][0];
    expect(wolf.ownerId).toBe('p1');
    player.x += 20;
    tick(6);
    expect(Math.hypot(wolf.x - player.x, wolf.z - player.z)).toBeLessThan(12);
  });
  it('limite de criaturas por jogador', async () => {
    const { say, world } = setup({ xp: 99999 });
    for (let i = 0; i < 4; i++) await say('exército');
    const alive = [...world.creatures.values()].filter((c) => !c.dead);
    expect(alive.length).toBeLessThanOrEqual(8);
  });
  it('habilidade gasta energia e respeita recarga', async () => {
    const { say, player } = setup();
    const e0 = player.energy;
    await say('escudo');
    expect(player.energy).toBeLessThan(e0);
    expect(player.buffs.shield.absorb).toBeGreaterThan(0);
    const m = await say('escudo');
    expect(m.entries[0].ok).toBe(false);
    expect(m.entries[0].message).toMatch(/recarga/);
  });
  it('clima muda', async () => {
    const { say, world, tick } = setup();
    await say('neve');
    expect(world.env.weather).toBe('snow');
    tick(3);
    await say('noite');
    expect(world.env.timeOfDay).toBeGreaterThan(20);
  });
  it('voar ativa buff com duração', async () => {
    const { say, player, world } = setup();
    await say('quero voar');
    expect(world.buffActive(player, 'fly')).toBeTruthy();
  });
});

describe('combate', () => {
  function arena() {
    const w = new World({ seed: 1, mode: 'creative', pvp: true });
    const a = w.addPlayer({ id: 'a', name: 'A', appearance: {} });
    const b = w.addPlayer({ id: 'b', name: 'B', appearance: {} });
    Object.assign(a, { x: 0, z: 0, y: terrainHeight(0, 0), ry: 0 });
    Object.assign(b, { x: 0, z: 1.5, y: terrainHeight(0, 1.5), ry: Math.PI });
    return { w, a, b };
  }
  it('golpe corpo a corpo causa dano', () => {
    const { w, b } = arena();
    w.giveWeapon(w.players.get('a'), buildWeaponSpec({ id: 'sword' }, 5));
    const res = w.playerAttack('a', { ry: 0 });
    expect(res.hits).toBe(1);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
  it('defesa reduz dano de frente', () => {
    const { w, b } = arena();
    w.giveWeapon(w.players.get('a'), buildWeaponSpec({ id: 'sword' }, 5));
    w.setBlocking('b', true);
    w.playerAttack('a', { ry: 0 });
    const blocked = b.maxHp - b.hp;
    const { w: w2, b: b2 } = arena();
    w2.giveWeapon(w2.players.get('a'), buildWeaponSpec({ id: 'sword' }, 5));
    w2.playerAttack('a', { ry: 0 });
    expect(blocked).toBeLessThan(b2.maxHp - b2.hp);
  });
  it('esquiva dá invulnerabilidade momentânea', () => {
    const { w, b } = arena();
    w.giveWeapon(w.players.get('a'), buildWeaponSpec({ id: 'sword' }, 5));
    w.dodge('b');
    w.playerAttack('a', { ry: 0 });
    expect(b.hp).toBe(b.maxHp);
  });
  it('recarga do ataque é respeitada', () => {
    const { w } = arena();
    w.playerAttack('a', { ry: 0 });
    expect(w.playerAttack('a', { ry: 0 }).reason).toBe('cooldown');
  });
  it('elemento aplica status (gelo = lentidão)', () => {
    const { w, b } = arena();
    w.giveWeapon(w.players.get('a'), buildWeaponSpec({ id: 'sword', elements: ['ice'] }, 5));
    w.playerAttack('a', { ry: 0 });
    expect(b.status.slow.amount).toBeGreaterThan(0);
  });
  it('nocaute e renascimento', () => {
    const { w, b } = arena();
    w.damage(b, 'player', 999, { src: w.players.get('a'), srcType: 'player' });
    expect(b.dead).toBe(true);
    for (let i = 0; i < 100; i++) w.step(0.05);
    expect(b.dead).toBe(false);
    expect(b.hp).toBe(b.maxHp);
  });
  it('sem PvP, jogadores não se ferem', () => {
    const { w, b } = arena();
    w.pvp = false;
    w.playerAttack('a', { ry: 0 });
    expect(b.hp).toBe(b.maxHp);
  });
  it('projétil acerta alvo à distância', () => {
    const { w, b } = arena();
    b.z = 15;
    w.giveWeapon(w.players.get('a'), buildWeaponSpec({ id: 'blaster' }, 5));
    w.playerAttack('a', { ry: 0 });
    for (let i = 0; i < 40; i++) w.step(0.05);
    expect(b.hp).toBeLessThan(b.maxHp);
  });
  it('movimento impossível é corrigido pelo servidor', () => {
    const { w, a } = arena();
    w.time += 0.1;
    const r = w.applyInput('a', { x: 80, y: 0, z: 0, ry: 0, anim: 'run' });
    expect(r.correct).toBe(true);
    expect(a.x).toBeLessThan(10);
  });
});

describe('ondas de monstros e IA', () => {
  it('ondas começam, criaturas atacam e podem ser derrotadas', async () => {
    const { world, tick, player, events } = setup({ mode: 'adventure' });
    tick(12);
    expect(world.wave.number).toBe(1);
    const wild = [...world.creatures.values()].filter((c) => c.wild);
    expect(wild.length).toBeGreaterThan(0);
    tick(20);
    expect(events.some((e) => e.type === 'hit' && e.targetId === player.id) || player.dead).toBe(true);
    for (const c of world.creatures.values()) world.damage(c, 'creature', 9999, { src: player, srcType: 'player' });
    tick(8);
    expect(events.some((e) => e.type === 'ko' && e.entityType === 'creature')).toBe(true);
  });
});
