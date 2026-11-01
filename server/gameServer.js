// Servidor multiplayer autoritativo: salas, conexões WebSocket, sessões com reconexão
// e persistência de perfis. A lógica de jogo é a mesma de shared/sim/room.js.
import crypto from 'node:crypto';
import { WebSocketServer } from 'ws';
import { Room, sanitizeAppearance } from '../shared/sim/room.js';
import { C, S, TICK_RATE, RECONNECT_GRACE_MS, PROTOCOL_VERSION, makeRoomCode, isValidRoomCode } from '../shared/protocol.js';
import { defaultProfile } from '../shared/sim/progression.js';

const MAX_ROOMS = Number(process.env.LAVOICE_MAX_ROOMS || 200);

export class GameServer {
  constructor({ store, remoteInterpret = null, log = console, graceMs = RECONNECT_GRACE_MS } = {}) {
    this.store = store;
    this.remoteInterpret = remoteInterpret;
    this.log = log;
    this.graceMs = graceMs;
    this.rooms = new Map();
    this.sessions = new Map(); // sessionToken -> { playerId, roomCode, profileToken, timer }
    this.wss = null;
    this.interval = null;
  }

  attach(httpServer, path = '/ws') {
    this.wss = new WebSocketServer({ server: httpServer, path, maxPayload: 16 * 1024 });
    this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
    let last = performance.now();
    this.interval = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      for (const room of this.rooms.values()) {
        try {
          room.tick(dt);
        } catch (err) {
          this.log.error('[sala] erro no tick', room.code, err);
        }
      }
    }, 1000 / TICK_RATE);
    this.heartbeat = setInterval(() => {
      for (const ws of this.wss.clients) {
        if (ws.isAlive === false) {
          ws.terminate();
          continue;
        }
        ws.isAlive = false;
        ws.ping();
      }
    }, 15000);
    return this;
  }

  close() {
    clearInterval(this.interval);
    clearInterval(this.heartbeat);
    for (const s of this.sessions.values()) clearTimeout(s.timer);
    this.wss?.close();
  }

  stats() {
    return { rooms: this.rooms.size, players: [...this.rooms.values()].reduce((s, r) => s + r.playerCount, 0) };
  }

  onConnection(ws) {
    const conn = { ws, profileToken: null, profile: null, playerId: null, roomCode: null, sessionToken: null };
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    const send = (msg) => {
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
    };
    conn.send = send;
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return send({ t: S.ERROR, code: 'bad_json', message: 'Mensagem inválida' });
      }
      this.onMessage(conn, msg).catch((err) => this.log.error('[ws] erro', err));
    });
    ws.on('close', () => this.onClose(conn));
    ws.on('error', () => {});
  }

  room(conn) {
    return conn.roomCode ? this.rooms.get(conn.roomCode) : null;
  }

  async onMessage(conn, msg) {
    const send = conn.send;
    switch (msg.t) {
      case C.HELLO: {
        if (msg.version && msg.version !== PROTOCOL_VERSION) return send({ t: S.ERROR, code: 'version', message: 'Versão do jogo incompatível — atualize a página.' });
        const token = typeof msg.token === 'string' && msg.token.length >= 16 && msg.token.length <= 128 ? msg.token : crypto.randomBytes(24).toString('hex');
        conn.profileToken = token;
        let profile = this.store.get(token);
        if (!profile) profile = defaultProfile(typeof msg.name === 'string' ? msg.name.slice(0, 20) : 'Jogador');
        if (typeof msg.name === 'string' && msg.name.trim()) profile.name = msg.name.trim().slice(0, 20);
        if (msg.appearance) profile.appearance = sanitizeAppearance(msg.appearance);
        conn.profile = profile;
        this.store.set(token, profile);
        return send({ t: S.HELLO_OK, profile, token });
      }
      case C.CREATE_ROOM: {
        if (!conn.profile) return send({ t: S.ERROR, code: 'no_hello', message: 'Envie hello primeiro' });
        if (this.rooms.size >= MAX_ROOMS) return send({ t: S.ERROR, code: 'server_full', message: 'Servidor cheio' });
        this.leaveCurrent(conn);
        let code;
        do code = makeRoomCode();
        while (this.rooms.has(code));
        const room = new Room({
          code,
          mode: msg.mode === 'creative' ? 'creative' : 'adventure',
          pvp: msg.pvp !== false,
          remoteInterpret: this.remoteInterpret,
          onProfileChange: (pid, profile) => this.persistFor(code, pid, profile),
          log: (...a) => this.log.warn('[sala]', code, ...a),
        });
        room.tokens = new Map();
        this.rooms.set(code, room);
        this.log.info?.(`[sala] criada ${code} (${room.world.mode}, pvp=${room.world.pvp})`);
        return this.joinRoom(conn, room);
      }
      case C.JOIN_ROOM: {
        if (!conn.profile) return send({ t: S.ERROR, code: 'no_hello', message: 'Envie hello primeiro' });
        const code = String(msg.code || '').toUpperCase().trim();
        if (!isValidRoomCode(code)) return send({ t: S.ERROR, code: 'bad_code', message: 'Código de sala inválido' });
        const room = this.rooms.get(code);
        if (!room) return send({ t: S.ERROR, code: 'not_found', message: `Sala ${code} não encontrada` });
        if (room.isFull()) return send({ t: S.ERROR, code: 'full', message: 'Sala cheia' });
        this.leaveCurrent(conn);
        return this.joinRoom(conn, room);
      }
      case C.RESUME: {
        const s = this.sessions.get(msg.sessionToken);
        const room = s && this.rooms.get(s.roomCode);
        if (!s || !room || !room.world.players.has(s.playerId)) return send({ t: S.ERROR, code: 'resume_failed', message: 'Sessão expirada' });
        clearTimeout(s.timer);
        s.timer = null;
        // fecha conexão antiga se ainda estiver aberta (ex.: troca de rede)
        if (s.conn && s.conn !== conn && s.conn.ws.readyState === s.conn.ws.OPEN) {
          s.conn.replaced = true;
          s.conn.ws.close(4000, 'replaced');
        }
        Object.assign(conn, { playerId: s.playerId, roomCode: s.roomCode, sessionToken: msg.sessionToken, profileToken: s.profileToken });
        s.conn = conn;
        const member = room.members.get(s.playerId);
        conn.profile = member?.profile || this.store.get(s.profileToken) || defaultProfile();
        room.join(s.playerId, { send: conn.send, profile: conn.profile, session: msg.sessionToken });
        this.log.info?.(`[sala] ${s.roomCode}: ${s.playerId} reconectou`);
        return;
      }
      case C.LEAVE:
        this.leaveCurrent(conn);
        return;
      case C.PING:
        return send({ t: S.PONG, c: msg.c, s: Date.now() });
      default: {
        const room = this.room(conn);
        if (room && conn.playerId) await room.handle(conn.playerId, msg);
      }
    }
  }

  joinRoom(conn, room) {
    const playerId = `p${crypto.randomBytes(4).toString('hex')}`;
    const sessionToken = crypto.randomBytes(24).toString('hex');
    conn.playerId = playerId;
    conn.roomCode = room.code;
    conn.sessionToken = sessionToken;
    room.tokens.set(playerId, conn.profileToken);
    this.sessions.set(sessionToken, { playerId, roomCode: room.code, profileToken: conn.profileToken, timer: null, conn });
    room.join(playerId, { send: conn.send, profile: conn.profile, session: sessionToken });
  }

  persistFor(code, playerId, profile) {
    const room = this.rooms.get(code);
    const token = room?.tokens?.get(playerId);
    if (token) this.store.set(token, profile);
  }

  leaveCurrent(conn) {
    const room = this.room(conn);
    if (room && conn.playerId) {
      room.leave(conn.playerId);
      const s = this.sessions.get(conn.sessionToken);
      if (s) clearTimeout(s.timer);
      this.sessions.delete(conn.sessionToken);
      this.cleanupRoom(room);
    }
    conn.playerId = null;
    conn.roomCode = null;
    conn.sessionToken = null;
  }

  onClose(conn) {
    if (conn.replaced) return;
    const room = this.room(conn);
    if (!room || !conn.playerId) return;
    room.disconnect(conn.playerId);
    const s = this.sessions.get(conn.sessionToken);
    if (!s) return;
    const { playerId } = conn;
    // mantém o jogador na sala durante o período de reconexão
    s.timer = setTimeout(() => {
      this.sessions.delete(conn.sessionToken);
      if (room.world.players.get(playerId)?.connected === false) {
        room.leave(playerId);
        this.log.info?.(`[sala] ${room.code}: ${playerId} removido após desconexão`);
      }
      this.cleanupRoom(room);
    }, this.graceMs);
  }

  cleanupRoom(room) {
    if (room.playerCount === 0 && this.rooms.get(room.code) === room) {
      this.rooms.delete(room.code);
      this.log.info?.(`[sala] ${room.code} encerrada`);
    }
  }
}
