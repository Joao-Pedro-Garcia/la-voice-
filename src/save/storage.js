// Salvamento local (modo solo e preferências). Todo acesso ao localStorage é protegido:
// em janelas anônimas/bloqueadas o jogo continua funcionando só em memória.
import { defaultProfile, sanitizeProfile } from '../../shared/sim/progression.js';

const PREFIX = 'lavoice:';
const mem = new Map();

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw == null ? (mem.has(key) ? mem.get(key) : fallback) : JSON.parse(raw);
  } catch {
    return mem.has(key) ? mem.get(key) : fallback;
  }
}

function write(key, value) {
  mem.set(key, value);
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const DEFAULT_SETTINGS = {
  quality: 'auto', // auto | low | mid | high | ultra
  adaptive: true,
  shadows: true,
  volMaster: 0.8,
  volSfx: 0.9,
  volMusic: 0.35,
  volAmbient: 0.6,
  music: true,
  voiceLang: 'pt-BR',
  voiceMode: 'continuous', // continuous | push
  recognizer: 'auto', // auto | browser | server
  micSensitivity: 0.5,
  autoMic: true,
  sensitivity: 1, // câmera
  invertY: false,
  showFps: false,
  dayLength: 480,
  gameMode: 'adventure',
  playerName: '',
};

export class Settings {
  constructor() {
    this.values = { ...DEFAULT_SETTINGS, ...read('settings', {}) };
    this.listeners = [];
  }
  get(k) {
    return this.values[k];
  }
  set(k, v) {
    this.values[k] = v;
    write('settings', this.values);
    for (const fn of this.listeners) fn(k, v);
  }
  onChange(fn) {
    this.listeners.push(fn);
  }
  reset() {
    this.values = { ...DEFAULT_SETTINGS };
    write('settings', this.values);
    for (const fn of this.listeners) fn('*', null);
  }
}

export function loadProfile() {
  return sanitizeProfile(read('profile', defaultProfile()));
}

export function saveProfile(p) {
  return write('profile', p);
}

// Token secreto que identifica o perfil no servidor multiplayer (nunca é exibido).
export function profileToken() {
  let t = read('token', null);
  if (!t) {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    t = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
    write('token', t);
  }
  return t;
}

export function saveSession(s) {
  write('session', s);
}
export function loadSession() {
  return read('session', null);
}
export function storageAvailable() {
  try {
    localStorage.setItem(PREFIX + 't', '1');
    localStorage.removeItem(PREFIX + 't');
    return true;
  } catch {
    return false;
  }
}
