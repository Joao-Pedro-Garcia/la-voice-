// Protocolo de rede (JSON sobre WebSocket). O mesmo formato é usado no modo solo,
// onde a "sala" roda dentro do navegador (sem rede), garantindo comportamento idêntico.

export const PROTOCOL_VERSION = 1;
export const TICK_RATE = 20; // simulação (Hz)
export const SNAPSHOT_RATE = 10; // envio de estado (Hz)
export const MAX_PLAYERS_PER_ROOM = 8;
export const RECONNECT_GRACE_MS = 45000;

// Cliente → servidor
export const C = {
  HELLO: 'hello', // { token, name, appearance, version }
  CREATE_ROOM: 'create_room', // { mode, pvp }
  JOIN_ROOM: 'join_room', // { code }
  RESUME: 'resume', // { sessionToken }
  LEAVE: 'leave',
  INPUT: 'input', // { x, y, z, ry, anim, seq }
  VOICE: 'voice', // { text, source }
  ACTION: 'action', // { kind: attack|special|block|unblock|dodge|switch|drop, ...}
  PING: 'ping',
  PROFILE: 'profile', // { name, appearance }
};

// Servidor → cliente
export const S = {
  HELLO_OK: 'hello_ok', // { profile, token }
  WELCOME: 'welcome', // { you, sessionToken, room, state }
  SNAPSHOT: 'snapshot',
  EVENTS: 'events', // { list: [...] }
  ERROR: 'error', // { code, message }
  PONG: 'pong',
  PROFILE: 'profile', // { profile }
  ROOM_CLOSED: 'room_closed',
};

export function makeRoomCode(rand = Math.random) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += alphabet[Math.floor(rand() * alphabet.length)];
  return s;
}

export function isValidRoomCode(code) {
  return typeof code === 'string' && /^[A-Z2-9]{5}$/.test(code);
}

const r2 = (v) => Math.round(v * 100) / 100;
export const q = r2;
