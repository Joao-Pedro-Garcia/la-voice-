// Persistência de perfis no servidor (multiplayer): arquivo JSON com escrita atômica
// e gravação agrupada (debounce). Tokens de perfil são segredos aleatórios do cliente;
// guardamos apenas o hash SHA-256 deles.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sanitizeProfile } from '../shared/sim/progression.js';

export function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

export class ProfileStore {
  constructor(file, { debounceMs = 1500 } = {}) {
    this.file = file;
    this.debounceMs = debounceMs;
    this.data = { profiles: {} };
    this.timer = null;
    this.load();
  }

  load() {
    try {
      if (this.file && fs.existsSync(this.file)) {
        this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
        this.data.profiles ||= {};
      }
    } catch (err) {
      console.warn(`[persistência] não foi possível ler ${this.file}: ${err.message}`);
      this.data = { profiles: {} };
    }
  }

  get(token) {
    const p = this.data.profiles[hashToken(token)];
    return p ? sanitizeProfile(p) : null;
  }

  set(token, profile) {
    this.data.profiles[hashToken(token)] = { ...profile, updatedAt: new Date().toISOString() };
    this.scheduleSave();
  }

  scheduleSave() {
    if (!this.file) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
  }

  flush() {
    if (!this.file) return;
    clearTimeout(this.timer);
    this.timer = null;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data));
    fs.renameSync(tmp, this.file);
  }
}
