// Sala de jogo independente de transporte: recebe mensagens de jogadores, valida ações,
// interpreta falas, avança a simulação e distribui eventos/snapshots.
// O servidor usa com WebSockets; o modo solo usa a mesma classe dentro do navegador.
import { World } from './world.js';
import { interpret } from '../nlu/interpreter.js';
import { generate, conceptKey } from './generator.js';
import { applyProgress, sanitizeProfile, recordMatch } from './progression.js';
import { C, S, TICK_RATE, SNAPSHOT_RATE, MAX_PLAYERS_PER_ROOM } from '../protocol.js';

const VOICE_MIN_INTERVAL = 0.7; // s entre falas processadas por jogador
const ACTION_LIMIT_PER_SEC = 30;

export class Room {
  constructor({ code = 'LOCAL', mode = 'adventure', pvp = true, seed, remoteInterpret = null, onProfileChange = null, log = null } = {}) {
    this.code = code;
    this.world = new World({ seed: seed ?? Math.floor(Math.random() * 1e9), mode, pvp });
    this.members = new Map(); // playerId -> { send, profile, session, lastVoiceAt, actionBudget }
    this.remoteInterpret = remoteInterpret;
    this.onProfileChange = onProfileChange;
    this.log = log || (() => {});
    this.snapshotAcc = 0;
    this.createdAt = Date.now();
    this.world.progressHook = (pid, ev) => this.progress(pid, ev);
  }

  get playerCount() {
    return this.members.size;
  }

  isFull() {
    return this.members.size >= MAX_PLAYERS_PER_ROOM;
  }

  join(playerId, { send, profile, session }) {
    const prof = sanitizeProfile(profile);
    const member = { send, profile: prof, session, lastVoiceAt: -10, actionBudget: ACTION_LIMIT_PER_SEC, pending: 0 };
    this.members.set(playerId, member);
    let p = this.world.players.get(playerId);
    if (p) {
      p.connected = true;
      this.world.emit('player_update', { player: this.world.publicPlayer(p) });
    } else {
      p = this.world.addPlayer({ id: playerId, name: prof.name, appearance: prof.appearance, level: prof.level });
    }
    send({ t: S.WELCOME, you: playerId, sessionToken: session, room: this.info(), state: this.world.fullState(), profile: prof });
    this.broadcastEvents();
    return p;
  }

  info() {
    return { code: this.code, mode: this.world.mode, pvp: this.world.pvp, players: [...this.world.players.values()].map((p) => ({ id: p.id, name: p.name, level: p.level, connected: p.connected })) };
  }

  // Desconexão temporária: o jogador fica no mundo (marcado offline) até reconectar.
  disconnect(playerId) {
    const m = this.members.get(playerId);
    const p = this.world.players.get(playerId);
    if (m) m.send = null;
    if (p) {
      p.connected = false;
      p.blocking = false;
      this.world.emit('player_update', { player: this.world.publicPlayer(p) });
    }
  }

  leave(playerId) {
    const m = this.members.get(playerId);
    const p = this.world.players.get(playerId);
    if (m && p) {
      recordMatch(m.profile, {
        mode: this.code === 'LOCAL' ? 'solo' : 'multiplayer', room: this.code, duration: this.world.time - p.match.start,
        kills: p.match.kills, creations: p.match.creations, xp: p.match.xp, wave: this.world.wave.number,
      });
      this.onProfileChange?.(playerId, m.profile, null);
    }
    this.members.delete(playerId);
    this.world.removePlayer(playerId);
  }

  progress(playerId, event) {
    const m = this.members.get(playerId);
    if (!m) return;
    const changes = applyProgress(m.profile, event);
    const p = this.world.players.get(playerId);
    if (p) {
      p.match.xp += changes.xp;
      if (changes.levelUp) {
        p.level = m.profile.level;
        this.world.emit('level_up', { playerId, level: p.level });
      }
    }
    if (changes.xp || changes.achievements.length || changes.levelUp) {
      this.sendTo(playerId, { t: S.EVENTS, list: [{ type: 'progress', changes, xp: m.profile.xp, level: m.profile.level }] });
      this.onProfileChange?.(playerId, m.profile, changes);
    }
  }

  sendTo(playerId, msg) {
    const m = this.members.get(playerId);
    if (m?.send) m.send(msg);
  }

  broadcast(msg) {
    for (const m of this.members.values()) if (m.send) m.send(msg);
  }

  broadcastEvents() {
    const list = this.world.drainEvents();
    if (list.length) this.broadcast({ t: S.EVENTS, list });
  }

  async handle(playerId, msg) {
    const m = this.members.get(playerId);
    if (!m || !msg || typeof msg !== 'object') return;
    if (msg.t !== C.INPUT) {
      if (m.actionBudget <= 0) return; // limite anti-spam
      m.actionBudget--;
    }
    const w = this.world;
    switch (msg.t) {
      case C.INPUT: {
        const res = w.applyInput(playerId, msg);
        if (res.correct) {
          const p = w.players.get(playerId);
          this.sendTo(playerId, { t: S.EVENTS, list: [{ type: 'correct', x: p.x, y: p.y, z: p.z }] });
        }
        break;
      }
      case C.ACTION:
        this.handleAction(playerId, msg);
        break;
      case C.VOICE:
        await this.handleVoice(playerId, msg);
        break;
      case C.PROFILE: {
        if (typeof msg.name === 'string') m.profile.name = msg.name.slice(0, 20);
        if (msg.appearance && typeof msg.appearance === 'object') m.profile.appearance = sanitizeAppearance(msg.appearance);
        const p = w.players.get(playerId);
        if (p) {
          p.name = m.profile.name;
          p.appearance = m.profile.appearance;
          w.emit('player_update', { player: w.publicPlayer(p) });
        }
        this.onProfileChange?.(playerId, m.profile, null);
        break;
      }
      default:
        break;
    }
  }

  handleAction(playerId, msg) {
    const w = this.world;
    let res = null;
    switch (msg.kind) {
      case 'attack':
        res = w.playerAttack(playerId, { ry: msg.ry, pitch: msg.pitch });
        break;
      case 'special':
        res = w.playerAttack(playerId, { ry: msg.ry, pitch: msg.pitch, special: true });
        break;
      case 'block':
        w.setBlocking(playerId, true);
        break;
      case 'unblock':
        w.setBlocking(playerId, false);
        break;
      case 'dodge':
        res = w.dodge(playerId, msg.dir);
        break;
      case 'switch':
        w.equip(playerId, Number(msg.index));
        break;
      case 'drop': {
        const p = w.players.get(playerId);
        if (p && Number.isInteger(msg.index) && p.inventory[msg.index]) {
          p.inventory.splice(msg.index, 1);
          p.weaponIndex = Math.min(p.weaponIndex, p.inventory.length - 1);
          w.emit('equip', { playerId, weaponIndex: p.weaponIndex, spec: w.weaponOf(p), inventory: p.inventory });
        }
        break;
      }
      default:
        break;
    }
    if (res && res.ok === false && res.reason === 'cooldown' && msg.kind !== 'attack') {
      this.sendTo(playerId, { t: S.EVENTS, list: [{ type: 'denied', kind: msg.kind, readyIn: res.readyIn }] });
    }
  }

  // Camadas 2–5: interpretação → classificação → geração → execução no mundo.
  async handleVoice(playerId, msg) {
    const m = this.members.get(playerId);
    const w = this.world;
    const text = String(msg.text || '').slice(0, 200).trim();
    if (!text) return;
    // falas muito próximas são enfileiradas (não descartadas); excesso de fila é ignorado
    const wait = VOICE_MIN_INTERVAL - (w.time - m.lastVoiceAt);
    if (wait > 0) {
      if ((m.queued || 0) >= 3) return;
      m.queued = (m.queued || 0) + 1;
      m.lastVoiceAt += VOICE_MIN_INTERVAL;
      await new Promise((r) => setTimeout(r, wait * 1000));
      m.queued--;
      if (!this.members.has(playerId)) return;
    }
    m.lastVoiceAt = Math.max(m.lastVoiceAt, w.time);
    const level = m.profile.level;
    let interp = interpret(text, { level, rand: w.rand });
    if ((!interp.understood || interp.confidence < 0.5) && this.remoteInterpret && m.pending < 2) {
      m.pending++;
      try {
        const remote = await this.remoteInterpret(text, { level });
        if (remote?.understood && remote.results?.length && remote.confidence >= interp.confidence) interp = remote;
      } catch (err) {
        this.log('remote interpret failed', err?.message);
      } finally {
        m.pending--;
      }
      if (!this.members.has(playerId)) return;
    }
    this.progress(playerId, { type: 'speak', lang: interp.lang, inferred: interp.results.some((r) => r.inferred) });
    if (!interp.understood) {
      w.emit('manifest', { playerId, text, understood: false, entries: [], message: 'Não entendi… tente nomear algo: "espada de fogo", "dragão", "chuva".', unknown: interp.unknown.slice(0, 4) });
      this.broadcastEvents();
      return;
    }
    const manifestations = generate(interp, level);
    const entries = w.manifest(playerId, manifestations);
    w.emit('manifest', {
      playerId,
      text,
      understood: true,
      source: interp.source,
      confidence: Math.round(interp.confidence * 100) / 100,
      entries: entries.map((e) => ({ category: e.category, label: e.label, ok: e.ok, message: e.message, rarity: e.rarity, notes: e.notes, reason: e.reason, count: e.count })),
      keys: manifestations.map(conceptKey),
    });
    this.broadcastEvents();
  }

  tick(dt) {
    this.world.step(dt);
    for (const m of this.members.values()) m.actionBudget = Math.min(ACTION_LIMIT_PER_SEC, m.actionBudget + ACTION_LIMIT_PER_SEC * dt);
    this.broadcastEvents();
    this.snapshotAcc += dt;
    if (this.snapshotAcc >= 1 / SNAPSHOT_RATE - 1e-6) {
      this.snapshotAcc = 0;
      this.broadcast({ t: S.SNAPSHOT, ...this.world.snapshot() });
    }
  }
}

export function sanitizeAppearance(a) {
  const color = (v, d) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
  const pick = (v, list, d) => (list.includes(v) ? v : d);
  return {
    skin: color(a.skin, '#e0ac69'),
    shirt: color(a.shirt, '#3b82f6'),
    pants: color(a.pants, '#1f2937'),
    hair: color(a.hair, '#2b1b0e'),
    hairStyle: pick(a.hairStyle, ['short', 'long', 'spiky', 'bald'], 'short'),
    accessory: pick(a.accessory, ['none', 'hat', 'crown', 'headband'], 'none'),
  };
}

export const TICK_DT = 1 / TICK_RATE;
