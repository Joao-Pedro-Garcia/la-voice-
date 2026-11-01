// LA VOICE — ponto de entrada do cliente.
import './ui/styles.css';
import * as THREE from 'three';
import { Engine } from './core/engine.js';
import { Input } from './core/input.js';
import { AudioEngine } from './audio/audioEngine.js';
import { VoiceController } from './voice/voiceController.js';
import { buildWorld } from './world/index.js';
import { createFX } from './fx/index.js';
import { HUD } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { GameClient } from './game/gameClient.js';
import { LocalSession, NetSession } from './net/sessions.js';
import { Settings, loadProfile, saveProfile } from './save/storage.js';
import { sanitizeAppearance } from '../shared/sim/room.js';
import { C } from '../shared/protocol.js';
import { ARENA } from '../shared/world.js';

class App {
  constructor() {
    this.settings = new Settings();
    this.profile = loadProfile();
    if (this.settings.get('playerName')) this.profile.name = this.settings.get('playerName');
    this.uiRoot = document.getElementById('ui');
    this.canvas = document.getElementById('game');
    this.audio = new AudioEngine(this.settings);
    this.menus = new Menus(this.uiRoot, this);
    this.serverCaps = { stt: false, llm: false, multiplayer: false };
    this.state = 'boot';
  }

  async boot() {
    this.menus.loading('Preparando o mundo…');
    try {
      this.engine = new Engine(this.canvas, this.settings);
    } catch (err) {
      this.menus.error(`Seu navegador não conseguiu iniciar o WebGL (${err.message}). Tente outro navegador ou ative a aceleração de hardware.`);
      return;
    }
    this.input = new Input(this.canvas, this.settings);
    document.body.classList.toggle('touch', this.input.touch);
    this.engine.onQualityChange = (q) => {
      this.world?.setQuality(q);
      this.fx?.setBudget(q.particleBudget);
    };
    fetch('/api/config', { signal: AbortSignal.timeout(3000) })
      .then((r) => (r.ok ? r.json() : null))
      .then((c) => c && (this.serverCaps = c))
      .catch(() => {});
    try {
      this.world = await buildWorld(this.engine.scene, this.engine.renderer, this.engine.quality, (p, label) => this.menus.setLoading(p, label));
    } catch (err) {
      console.error(err);
      this.menus.error(`Falha ao montar o mundo: ${err.message}`);
      return;
    }
    this.world.setDayLength(this.settings.get('dayLength'));
    this.world.onLightning?.((info) => {
      // distância do raio em metros (50–200) → atraso/volume do trovão
      const d = info?.distance ?? 120;
      this.audio.thunder(Math.min(1, d / 200));
    });
    this.fx = createFX(this.engine.scene, this.engine.quality);
    this.voice = new VoiceController({ audio: this.audio, settings: this.settings, serverStt: true });
    this.hud = new HUD(this.uiRoot, {
      input: this.input,
      settings: this.settings,
      onMic: () => this.toggleMic(),
      onPushTalk: (on) => (on ? this.voice.pushStart() : this.voice.pushEnd()),
      onCommand: (text) => this.command(text, 'text'),
      onMenu: () => this.pause(),
      onSlot: (i) => this.session?.send({ t: C.ACTION, kind: 'switch', index: i }),
    });
    this.bindVoice();
    this.bindKeys();
    // câmera orbitando a arena enquanto o menu está aberto
    let t = 0;
    this.engine.add((dt) => {
      if (this.state !== 'menu') return;
      t += dt * 0.05;
      const cam = this.engine.camera;
      cam.position.set(ARENA.x + Math.sin(t) * 70, 26, ARENA.z + Math.cos(t) * 70);
      cam.lookAt(ARENA.x, 4, ARENA.z);
      this.world.update(dt, cam);
      this.fx.update(dt, cam);
    });
    this.engine.start();
    this.state = 'menu';
    const code = new URLSearchParams(location.search).get('sala');
    if (code) this.menus.multiplayer(code.toUpperCase());
    else this.menus.main();
    // primeiro gesto do usuário libera o áudio (política dos navegadores)
    const unlock = () => this.audio.init();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('beforeunload', () => this.saveAll());
    document.addEventListener('visibilitychange', () => document.hidden && this.saveAll());
  }

  bindVoice() {
    const v = this.voice;
    v.on('state', (s) => {
      this.hud.setVoiceState(s);
      window.__laVoice.voiceState = s;
    });
    v.on('level', (r) => this.hud.setMicLevel(r.level));
    v.on('interim', (d) => d.text && this.hud.showInterim(d.text));
    v.on('transcript', (d) => this.command(d.text, d.source));
    v.on('rejected', (d) => console.info('[voz] descartado:', d.reason, d.text));
    v.on('error', (e) => {
      if (e.code === 'network') this.hud.toast('Reconhecimento de voz sem internet — digite os comandos.', 'bad');
      else if (e.code === 'not-allowed') this.hud.toast('Permissão de microfone negada.', 'bad');
    });
    this.hud.setVoiceState(v.status());
  }

  bindKeys() {
    const i = this.input;
    i.on('menu', () => {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    });
    i.on('type', () => this.state === 'playing' && setTimeout(() => this.hud.focusCommand(), 0));
    i.on('mic', () => this.state === 'playing' && this.toggleMic());
    i.on('pushtalk', (down) => this.state === 'playing' && (down ? this.voice.pushStart() : this.voice.pushEnd()));
    i.on('players', (on) => this.state === 'playing' && this.hud.togglePlayers(on));
    i.on('slot', (n) => this.session?.send({ t: C.ACTION, kind: 'switch', index: n }));
    i.on('zoom', (d) => this.game?.zoom(d));
  }

  async toggleMic() {
    this.audio.init();
    const on = await this.voice.toggle();
    this.audio.play(on ? 'mic_on' : 'mic_off');
    if (!on && (this.voice.status() === 'denied' || this.voice.status() === 'unsupported')) this.hud.focusCommand();
  }

  // Fala reconhecida ou texto digitado → servidor/sala interpreta e executa
  command(text, source) {
    if (!this.game || !text.trim()) return;
    this.hud.showHeard(text, source);
    this.audio.play('heard');
    this.game.sendVoice(text, source);
    window.__laVoice.lastCommand = text;
  }

  // ------------------------------------------------------------------ sessões
  attach(session) {
    this.session = session;
    this.game = new GameClient({ engine: this.engine, world: this.world, fx: this.fx, audio: this.audio, hud: this.hud, input: this.input, settings: this.settings, session });
    session.on('profile', (p) => {
      this.profile = p;
      this.hud.setProfile(p);
    });
    session.on('connection', (s) => this.hud.setConnection(s, session.latency));
    session.on('latency', (l) => this.hud.setConnection('online', l));
    session.on('error', (e) => this.hud.toast(e.message, 'bad'));
    window.__laVoice.game = this.game;
    window.__laVoice.session = session;
  }

  enterPlaying() {
    this.menus.close();
    this.hud.show(true);
    this.hud.setProfile(this.profile);
    this.input.enabled = true;
    this.state = 'playing';
    if (this.settings.get('autoMic') && !this.voice.enabled) this.voice.enable().then((ok) => ok && this.audio.play('mic_on'));
  }

  startSolo(mode) {
    this.audio.init();
    const s = new LocalSession({ profile: this.profile, mode });
    this.attach(s);
    s.on('welcome', () => this.enterPlaying());
    s.connect();
  }

  async startOnline({ create, join }) {
    this.audio.init();
    const s = new NetSession({ profile: this.profile });
    let settled = false;
    const result = new Promise((resolve) => {
      s.on('welcome', () => {
        if (!settled) {
          settled = true;
          resolve(null);
        }
      });
      s.on('error', (e) => {
        if (!settled && ['not_found', 'full', 'bad_code', 'server_full', 'version'].includes(e.code)) {
          settled = true;
          resolve(e.message);
        }
      });
    });
    this.attach(s);
    s.on('welcome', () => this.state !== 'playing' && this.enterPlaying());
    try {
      if (create) await s.create(create.mode, create.pvp);
      else await s.join(join);
    } catch (err) {
      this.detach();
      return `${err.message}. Inicie o servidor com "npm start" (veja o README).`;
    }
    const timeout = new Promise((r) => setTimeout(() => r('O servidor não respondeu.'), 8000));
    const err = await Promise.race([result, timeout]);
    if (err) this.detach();
    return err;
  }

  detach() {
    this.game?.dispose();
    this.game = null;
    this.session?.close();
    this.session = null;
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    document.exitPointerLock?.();
    if (this.session?.kind === 'local') this.session.pause(true);
    this.menus.pause();
  }

  resume() {
    this.menus.close();
    this.state = 'playing';
    this.input.enabled = true;
    if (this.session?.kind === 'local') this.session.pause(false);
  }

  exitToMenu() {
    this.saveAll();
    this.detach();
    this.hud.show(false);
    this.voice.disable();
    this.input.enabled = false;
    this.state = 'menu';
    this.profile = loadProfile();
    this.menus.main();
  }

  // ------------------------------------------------------------------ perfil e configurações
  setName(name) {
    this.profile.name = name.slice(0, 20);
    this.settings.set('playerName', this.profile.name);
    saveProfile(this.profile);
  }

  setAppearance(a, name) {
    this.profile.appearance = sanitizeAppearance(a);
    if (name) this.setName(name);
    saveProfile(this.profile);
    this.session?.send({ t: C.PROFILE, name: this.profile.name, appearance: this.profile.appearance });
  }

  saveAll() {
    if (this.session?.kind === 'local' || !this.session) saveProfile(this.profile);
  }

  applySetting(k, v) {
    if (k !== '*') this.settings.set(k, v);
    const s = this.settings;
    if (k === '*' || k.startsWith('vol') || k === 'music') {
      this.audio.applyVolumes();
      if (k === 'music') this.audio.setMusic(v);
    }
    if (k === '*' || k === 'quality') this.engine.setTier(s.get('quality') === 'auto' ? this.engine.quality.tier : s.get('quality'));
    if (k === 'shadows') {
      this.engine.quality.shadows = v;
      this.engine.applyQuality();
      this.world.setQuality(this.engine.quality);
    }
    if (k === 'adaptive') this.engine.adaptive.enabled = v;
    if (k === 'dayLength') this.world.setDayLength(v);
    if (k === 'voiceMode') this.voice.setMode(v);
    if (k === 'voiceLang') this.voice.setLang(v);
    if (k === 'micSensitivity') this.voice.setSensitivity(v);
  }
}

// Ganchos de depuração/testes automatizados
window.__laVoice = { ready: false };
const app = new App();
window.__laVoice.app = app;
app.boot().then(() => (window.__laVoice.ready = true));
window.__laVoice.THREE = THREE;
