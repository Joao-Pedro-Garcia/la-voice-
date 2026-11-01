// Sessões de jogo com a mesma interface:
//  - LocalSession: modo solo. A sala (shared/sim/room.js) roda no navegador — sem rede.
//  - NetSession: multiplayer online via WebSocket com o servidor autoritativo,
//    com reconexão automática (backoff exponencial + retomada de sessão).
import { Room, TICK_DT } from '../../shared/sim/room.js';
import { C, S, PROTOCOL_VERSION } from '../../shared/protocol.js';
import { saveProfile, profileToken, saveSession, loadSession } from '../save/storage.js';
import { ARTIFACT } from '../core/env.js';

class Emitter {
  constructor() {
    this.listeners = {};
  }
  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
    return () => (this.listeners[ev] = this.listeners[ev].filter((f) => f !== fn));
  }
  emit(ev, d) {
    for (const fn of this.listeners[ev] || []) fn(d);
  }
}

// Interpretação externa opcional para o modo solo (via servidor do jogo, se existir).
// Cache em memória + localStorage; falhas de rede são silenciosas (fica o catálogo local).
export function makeRemoteInterpreter() {
  const cache = new Map();
  let available = null;
  return async (text, { level }) => {
    const key = `${text.toLowerCase().trim()}|${level}`;
    if (cache.has(key)) return cache.get(key);
    if (ARTIFACT || available === false || !navigator.onLine) return null;
    try {
      if (available === null) {
        const cfg = await fetch('/api/config', { signal: AbortSignal.timeout(2500) }).then((r) => (r.ok ? r.json() : null));
        available = !!cfg?.llm;
        if (!available) return null;
      }
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text, level }),
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) return null;
      const out = await res.json();
      cache.set(key, out);
      return out;
    } catch {
      return null;
    }
  };
}

export class LocalSession extends Emitter {
  constructor({ profile, mode = 'adventure' }) {
    super();
    this.kind = 'local';
    this.profile = profile;
    this.mode = mode;
    this.playerId = 'solo';
  }

  connect() {
    this.room = new Room({
      code: 'LOCAL',
      mode: this.mode,
      pvp: false,
      remoteInterpret: makeRemoteInterpreter(),
      onProfileChange: (_id, profile) => {
        this.profile = profile;
        saveProfile(profile);
        this.emit('profile', profile);
      },
    });
    this.emit('connection', 'online');
    this.room.join(this.playerId, { send: (m) => this.deliver(m), profile: this.profile, session: 'local' });
    let last = performance.now();
    let acc = 0;
    this.timer = setInterval(() => {
      const now = performance.now();
      if (this.paused) {
        last = now;
        return;
      }
      acc += Math.min(0.25, (now - last) / 1000);
      last = now;
      while (acc >= TICK_DT) {
        this.room.tick(TICK_DT);
        acc -= TICK_DT;
      }
    }, 1000 * TICK_DT);
  }

  deliver(m) {
    // entrega assíncrona, como numa rede
    queueMicrotask(() => {
      if (m.t === S.WELCOME) this.emit('welcome', m);
      else if (m.t === S.SNAPSHOT) this.emit('snapshot', m);
      else if (m.t === S.EVENTS) this.emit('events', m.list);
    });
  }

  send(msg) {
    this.room?.handle(this.playerId, msg);
  }

  pause(p) {
    this.paused = p;
  }

  close() {
    clearInterval(this.timer);
    if (this.room) this.room.leave(this.playerId);
    saveProfile(this.profile);
    this.room = null;
  }
}

export class NetSession extends Emitter {
  constructor({ profile, url }) {
    super();
    this.kind = 'net';
    this.profile = profile;
    this.url = url || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    this.retries = 0;
    this.closed = false;
    this.pending = null; // ação pendente após conectar (criar/entrar)
    this.sessionToken = null;
    this.latency = 0;
  }

  open() {
    return new Promise((resolve, reject) => {
      this.emit('connection', this.retries ? 'reconnecting' : 'connecting');
      const ws = new WebSocket(this.url);
      this.ws = ws;
      let opened = false;
      ws.onopen = () => {
        opened = true;
        this.send({ t: C.HELLO, version: PROTOCOL_VERSION, token: profileToken(), name: this.profile.name, appearance: this.profile.appearance });
        resolve();
      };
      ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data));
      ws.onerror = () => !opened && reject(new Error('Não foi possível conectar ao servidor'));
      ws.onclose = (ev) => {
        clearInterval(this.pingTimer);
        if (this.closed || ev.code === 4000) return;
        this.emit('connection', 'offline');
        if (opened || this.retries) this.scheduleReconnect();
      };
    });
  }

  async create(mode, pvp) {
    this.pending = { t: C.CREATE_ROOM, mode, pvp };
    await this.open();
  }

  async join(code) {
    this.pending = { t: C.JOIN_ROOM, code: code.toUpperCase().trim() };
    await this.open();
  }

  scheduleReconnect() {
    if (this.closed) return;
    const delay = Math.min(10000, 500 * Math.pow(2, this.retries++));
    this.emit('connection', 'reconnecting');
    setTimeout(async () => {
      if (this.closed) return;
      this.pending = this.sessionToken ? { t: C.RESUME, sessionToken: this.sessionToken } : this.pending;
      try {
        await this.open();
      } catch {
        this.scheduleReconnect();
      }
    }, delay);
  }

  onMessage(m) {
    switch (m.t) {
      case S.HELLO_OK:
        this.profile = m.profile;
        this.emit('profile', m.profile);
        if (this.pending) this.send(this.pending);
        break;
      case S.WELCOME:
        this.retries = 0;
        this.playerId = m.you;
        this.sessionToken = m.sessionToken;
        this.roomCode = m.room.code;
        saveSession({ token: m.sessionToken, code: m.room.code, at: Date.now() });
        this.emit('connection', 'online');
        this.emit('welcome', m);
        clearInterval(this.pingTimer);
        this.pingTimer = setInterval(() => this.send({ t: C.PING, c: performance.now() }), 2000);
        break;
      case S.SNAPSHOT:
        this.emit('snapshot', m);
        break;
      case S.EVENTS:
        for (const e of m.list) if (e.type === 'progress') this.profile = { ...this.profile, xp: e.xp, level: e.level };
        this.emit('events', m.list);
        break;
      case S.PONG:
        this.latency = Math.round(performance.now() - m.c);
        this.emit('latency', this.latency);
        break;
      case S.ERROR:
        if (m.code === 'resume_failed') {
          // a sessão expirou: tenta entrar de novo na mesma sala
          this.sessionToken = null;
          if (this.roomCode) this.send({ t: C.JOIN_ROOM, code: this.roomCode });
        }
        this.emit('error', m);
        break;
      default:
        break;
    }
  }

  send(msg) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close() {
    this.closed = true;
    clearInterval(this.pingTimer);
    this.send({ t: C.LEAVE });
    saveSession(null);
    this.ws?.close();
  }

  static lastSession() {
    const s = loadSession();
    return s && Date.now() - s.at < 40000 ? s : null;
  }
}
