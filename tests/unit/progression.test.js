import { describe, it, expect } from 'vitest';
import { applyProgress, defaultProfile, levelFromXp, xpForLevel, sanitizeProfile, recordMatch } from '../../shared/sim/progression.js';
import { ProfileStore } from '../../server/persistence.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('progressão', () => {
  it('curva de níveis é crescente', () => {
    for (let l = 2; l < 30; l++) expect(xpForLevel(l + 1)).toBeGreaterThan(xpForLevel(l));
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(xpForLevel(5))).toBe(5);
  });
  it('conquistas e descobertas', () => {
    const p = defaultProfile();
    let c = applyProgress(p, { type: 'speak', lang: 'pt' });
    expect(c.achievements).toContain('first_word');
    c = applyProgress(p, { type: 'create', category: 'creature', key: 'creature:dragon', species: 'dragon' });
    expect(c.discovery).toBe('creature:dragon');
    expect(p.achievements.dragon_tamer).toBeTruthy();
    c = applyProgress(p, { type: 'create', category: 'creature', key: 'creature:dragon', species: 'dragon' });
    expect(c.discovery).toBeUndefined();
    applyProgress(p, { type: 'speak', lang: 'en' });
    expect(p.achievements.polyglot).toBeTruthy();
  });
  it('sobe de nível com XP', () => {
    const p = defaultProfile();
    let up = null;
    for (let i = 0; i < 40; i++) up = applyProgress(p, { type: 'kill', maxHp: 300 }).levelUp || up;
    expect(up).toBeGreaterThan(1);
    expect(p.level).toBe(levelFromXp(p.xp));
  });
  it('perfil corrompido é saneado', () => {
    const p = sanitizeProfile({ xp: 'abc', stats: null, history: 5 });
    expect(p.xp).toBe(0);
    expect(Array.isArray(p.history)).toBe(true);
    expect(Array.isArray(p.stats.discoveries)).toBe(true);
  });
  it('histórico de partidas', () => {
    const p = defaultProfile();
    recordMatch(p, { mode: 'solo', duration: 60, kills: 3 });
    expect(p.history).toHaveLength(1);
    expect(p.stats.matches).toBe(1);
  });
});

describe('persistência no servidor', () => {
  it('salva e recarrega perfis por token (com hash)', () => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lv-')), 'p.json');
    const s = new ProfileStore(file);
    const p = defaultProfile('Zé');
    p.xp = 500;
    s.set('token-secreto-123456', p);
    s.flush();
    expect(fs.readFileSync(file, 'utf8')).not.toContain('token-secreto');
    const s2 = new ProfileStore(file);
    expect(s2.get('token-secreto-123456').name).toBe('Zé');
    expect(s2.get('token-secreto-123456').level).toBe(levelFromXp(500));
    expect(s2.get('outro')).toBeNull();
  });
});
