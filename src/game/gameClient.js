// Cliente de jogo: aplica estado/eventos da sessão (local ou online) em visuais, sons e HUD,
// controla o jogador local (predição), a câmera em terceira pessoa e envia ações/voz.
import * as THREE from 'three';
import { PlayerController } from './playerController.js';
import { PlayerView, CreatureView, ProjectileView, ObjectView, ZoneView } from './views.js';
import { C } from '../../shared/protocol.js';
import { elementInfo } from '../../shared/elements.js';
import { terrainHeight } from '../../shared/world.js';
import { ACHIEVEMENTS } from '../../shared/sim/progression.js';

const INPUT_RATE = 15;

export class GameClient {
  constructor({ engine, world, fx, audio, hud, input, settings, session }) {
    Object.assign(this, { engine, world, fx, audio, hud, input, settings, session });
    this.scene = engine.scene;
    this.camera = engine.camera;
    this.players = new Map();
    this.creatures = new Map();
    this.objects = new Map();
    this.zones = new Map();
    this.projectiles = new Map();
    this.controller = new PlayerController();
    this.meId = null;
    this.camYaw = Math.PI;
    this.camPitch = 0.25;
    this.camDist = 7;
    this.shake = 0;
    this.inputAcc = 0;
    this.serverTimeBase = 0;
    this.serverTimeAt = performance.now();
    this.ctx = {
      scene: this.scene,
      fx,
      quality: engine.quality,
      players: this.players,
      meId: null,
      serverTime: () => this.serverTime(),
    };
    this.unsub = [
      session.on('welcome', (m) => this.onWelcome(m)),
      session.on('snapshot', (m) => this.onSnapshot(m)),
      session.on('events', (list) => list.forEach((e) => this.onEvent(e))),
    ];
    fx.onShake((i) => (this.shake = Math.min(1.5, this.shake + i)));
    this.removeLoop = engine.add((dt) => this.update(dt));
    this.lastBlock = false;
  }

  serverTime() {
    return this.serverTimeBase + (performance.now() - this.serverTimeAt) / 1000;
  }

  get me() {
    return this.players.get(this.meId);
  }

  meData() {
    return this.meState;
  }

  // ------------------------------------------------------------------ estado
  clear() {
    for (const m of [this.players, this.creatures, this.objects, this.zones, this.projectiles]) {
      for (const v of m.values()) v.dispose();
      m.clear();
    }
  }

  onWelcome(m) {
    this.clear();
    this.meId = m.you;
    this.ctx.meId = m.you;
    this.room = m.room;
    const st = m.state;
    this.serverTimeBase = st.t;
    this.serverTimeAt = performance.now();
    this.applyEnv(st.env, true);
    for (const p of st.players) this.addPlayer(p);
    for (const c of st.creatures) this.creatures.set(c.id, new CreatureView(c, this.ctx));
    for (const o of st.objects) this.objects.set(o.id, new ObjectView(o, this.ctx));
    for (const z of st.zones) this.zones.set(z.id, new ZoneView(z, this.ctx));
    const me = st.players.find((p) => p.id === m.you);
    this.meState = me;
    if (me) {
      this.controller.teleport(me.x, me.y, me.z);
      this.controller.ry = me.ry;
      this.camYaw = me.ry;
    }
    this.hud.setRoom(m.room, this.session.kind);
    this.hud.setPlayers(st.players, m.you);
    this.hud.setInventory(me?.inventory || [], me?.weaponIndex ?? -1);
    if (st.wave?.number) this.hud.setWave(st.wave.number, st.wave.state);
    if (m.profile) this.hud.setProfile(m.profile);
  }

  addPlayer(p) {
    if (this.players.has(p.id)) return this.players.get(p.id);
    const v = new PlayerView(p, this.ctx, p.id === this.meId);
    this.players.set(p.id, v);
    this.applyBuffs(v, p.buffs || {});
    return v;
  }

  onSnapshot(m) {
    this.serverTimeBase = m.time;
    this.serverTimeAt = performance.now();
    for (const s of m.players) {
      const v = this.players.get(s[0]);
      if (!v) continue;
      v.applySnapshot(s);
      if (s[0] === this.meId) {
        this.meState = { ...this.meState, hp: s[6], energy: s[7], dead: !!s[9] };
        this.hud.setVitals(s[6], this.meState.maxHp || 100, s[7], this.meState.maxEnergy || 100);
      }
    }
    for (const s of m.creatures) this.creatures.get(s[0])?.applySnapshot(s);
    for (const s of m.projectiles) this.projectiles.get(s[0])?.applySnapshot(s);
    this.hud.setWave(m.wave, m.waveState);
    this.world.setTimeOfDay(m.tod);
  }

  applyEnv(env, instant) {
    if (!env) return;
    this.world.setDayLength(env.dayLength);
    this.world.setTimeOfDay(env.timeOfDay);
    this.world.setWeather(env.weather, { instant: !!instant });
    this.audio.setEnvironment(env.weather, env.timeOfDay);
  }

  applyBuffs(v, buffs) {
    const has = (k) => buffs[k] && buffs[k].until > this.serverTime();
    v.invisible = has('invisibility');
    if (has('shield') && !v.handles.shield) {
      v.handles.shield = this.fx.shieldBubble(v.root, 1.3, elementInfo(buffs.shield.element || 'arcane').color);
    }
  }

  // ------------------------------------------------------------------ eventos
  onEvent(e) {
    const pos = (x, y, z) => new THREE.Vector3(x, y, z);
    const mine = e.playerId === this.meId;
    switch (e.type) {
      case 'player_add':
        this.addPlayer(e.player);
        this.hud.setPlayers([...this.players.values()].map((v) => v.data), this.meId);
        if (e.player.id !== this.meId) this.hud.toast(`${e.player.name} entrou no mundo`, 'info');
        break;
      case 'player_update': {
        const v = this.players.get(e.player.id);
        if (v) v.data = { ...v.data, ...e.player };
        if (e.player.id === this.meId) this.meState = { ...this.meState, ...e.player };
        this.hud.setPlayers([...this.players.values()].map((p) => p.data), this.meId);
        break;
      }
      case 'player_remove': {
        const v = this.players.get(e.id);
        if (v) {
          this.hud.toast(`${v.data.name} saiu`, 'info');
          v.dispose();
          this.players.delete(e.id);
        }
        this.hud.setPlayers([...this.players.values()].map((p) => p.data), this.meId);
        break;
      }
      case 'creature_add': {
        const c = e.creature;
        const v = new CreatureView(c, this.ctx);
        this.creatures.set(c.id, v);
        const p = pos(c.x, c.y, c.z);
        this.fx.appear(p, c.spec.element);
        this.audio.play('summon', { pos: p });
        setTimeout(() => this.audio.creature(c.spec.species, 'roar', { pos: p, size: c.spec.size }), 500);
        break;
      }
      case 'creature_remove': {
        const v = this.creatures.get(e.id);
        if (v) {
          v.dispose();
          this.creatures.delete(e.id);
        }
        break;
      }
      case 'ko': {
        if (e.entityType === 'creature') {
          const v = this.creatures.get(e.id);
          if (v) {
            v.die();
            if (!e.silent) this.audio.creature(v.spec.species, 'die', { pos: v.pos, size: v.spec.size });
            this.fx.burst(v.pos.clone().setY(v.pos.y + 1), { colors: [0xffffff, 0xfff3c4], count: 30, speed: 4, life: 1 });
          }
          if (e.killerId === this.meId && !e.silent) this.hud.killFeed(v?.spec.label || 'Criatura');
        } else {
          const v = this.players.get(e.id);
          if (v) this.fx.burst(v.pos.clone().setY(v.pos.y + 1), { colors: [0xffd36b, 0xffffff], count: 40, speed: 5, life: 1.2 });
          this.audio.play('ko', { pos: v?.pos });
          if (e.id === this.meId) this.hud.showKO(true);
          else if (e.killerId === this.meId) this.hud.toast(`Você nocauteou ${v?.data.name}!`, 'good');
        }
        break;
      }
      case 'respawn': {
        const v = this.players.get(e.id);
        if (v) v.dead = false;
        if (e.id === this.meId) {
          this.controller.teleport(e.x, e.y, e.z);
          this.hud.showKO(false);
          this.audio.play('respawn');
        }
        this.fx.appear(pos(e.x, e.y + 1, e.z), 'light');
        break;
      }
      case 'revive': {
        this.fx.explosion(pos(e.x, e.y, e.z), 'fire', 4);
        this.hud.toast('A Fênix renasceu das cinzas!', 'good');
        break;
      }
      case 'equip': {
        const v = this.players.get(e.playerId);
        if (v) {
          v.setWeapon(e.spec, e.created);
          if (e.inventory) v.data.inventory = e.inventory;
          v.data.weaponIndex = e.weaponIndex;
          if (e.created) {
            this.fx.appear(v.pos.clone().setY(v.pos.y + 1.2), e.spec?.element);
            this.audio.play('appear', { pos: v.pos, element: e.spec?.element });
          }
        }
        if (mine) {
          if (e.inventory) this.meState.inventory = e.inventory;
          this.meState.weaponIndex = e.weaponIndex;
          this.hud.setInventory(this.meState.inventory || [], e.weaponIndex);
          if (e.created && e.spec) this.hud.weaponCard(e.spec);
        }
        break;
      }
      case 'attack': {
        if (e.attackerType === 'player') {
          const v = this.players.get(e.attackerId);
          if (v && !(e.attackerId === this.meId && this.localAttackAt && performance.now() - this.localAttackAt < 250)) v.playAttack(e.style);
          const snd = { slash: 'swing', thrust: 'swing', heavy: 'swing_heavy', punch: 'punch', cast: 'orb', shoot: e.weaponKind === 'bow' ? 'arrow' : e.weaponKind === 'cannon' ? 'cannon' : e.weaponKind === 'rifle' ? 'beam' : 'blaster' }[e.style];
          this.audio.play(snd, { pos: v?.pos, element: e.element });
          if (e.special && v) this.fx.shockwave(v.pos.clone(), 3, e.element);
        } else {
          const v = this.creatures.get(e.attackerId);
          if (v) {
            v.attackT = 0;
            if (Math.random() < 0.5) this.audio.creature(e.species, 'attack', { pos: v.pos, size: v.spec.size });
          }
        }
        break;
      }
      case 'hit': {
        const p = pos(e.x, e.y, e.z);
        if (e.miss) {
          this.hud.floatText(p, 'esquiva!', 'miss');
          this.audio.play('miss', { pos: p });
          break;
        }
        if (e.kind !== 'dot') this.fx.impact(p, e.element);
        if (e.blocked) this.audio.play('block', { pos: p });
        else if (e.kind !== 'dot') this.audio.play('hit', { pos: p, element: e.element });
        const txt = e.absorbed && !e.amount ? `(${e.absorbed})` : `${e.amount}`;
        this.hud.floatText(p, txt, e.targetId === this.meId ? 'hurt' : e.element || 'dmg');
        if (e.targetType === 'creature') {
          const v = this.creatures.get(e.targetId);
          if (v) {
            v.hitT = 0;
            v.model.flash(elementInfo(e.element).color);
          }
        } else if (e.targetType === 'player') {
          const v = this.players.get(e.targetId);
          v?.model.flash(0xff4444);
          if (e.targetId === this.meId && e.amount > 0) {
            this.hud.hurtFlash(Math.min(1, e.amount / 30));
            this.shake = Math.min(1, this.shake + e.amount / 60);
          }
        }
        break;
      }
      case 'heal': {
        const v = e.targetType === 'player' ? this.players.get(e.targetId) : this.creatures.get(e.targetId);
        if (v) {
          this.hud.floatText(v.pos.clone().setY(v.pos.y + 2), `+${e.amount}`, 'heal');
          if (e.amount > 8) this.fx.healAura(v.root);
        }
        break;
      }
      case 'status':
        if (e.targetId === this.meId) this.hud.status(e.status, e.until - this.serverTime());
        break;
      case 'knockback':
        if (e.targetId === this.meId) this.controller.knockback(e.vx, e.vy, e.vz);
        break;
      case 'launch':
        if (mine) {
          this.controller.launch(e.vy);
          this.audio.play('launch');
        }
        break;
      case 'correct':
        this.controller.teleport(e.x, e.y, e.z);
        break;
      case 'teleport':
        if (e.entityType === 'player') {
          if (e.from) this.fx.teleport(pos(e.from.x, e.from.y + 1, e.from.z), pos(e.x, e.y + 1, e.z));
          this.audio.play('teleport', { pos: pos(e.x, e.y, e.z) });
          if (e.id === this.meId) this.controller.teleport(e.x, e.y, e.z);
          const v = this.players.get(e.id);
          if (v) v.pos.set(e.x, e.y, e.z);
        } else this.creatures.get(e.id)?.pos.set(e.x, e.y, e.z);
        break;
      case 'projectile_add':
        this.projectiles.set(e.projectile.id, new ProjectileView(e.projectile, this.ctx));
        break;
      case 'projectile_remove': {
        const v = this.projectiles.get(e.id);
        if (v) {
          v.dispose();
          this.projectiles.delete(e.id);
        }
        break;
      }
      case 'impact':
        this.fx.impact(pos(e.x, e.y, e.z), e.element);
        break;
      case 'explosion': {
        const p = pos(e.x, e.y, e.z);
        this.fx.explosion(p, e.element, e.radius);
        this.audio.play('explosion', { pos: p, radius: e.radius });
        break;
      }
      case 'shockwave':
        this.fx.shockwave(pos(e.x, e.y, e.z), e.radius, e.element);
        this.audio.play('quake', { pos: pos(e.x, e.y, e.z), volume: 0.4 });
        break;
      case 'beam': {
        const col = elementInfo(e.element).color;
        this.fx.lightningBolt(pos(e.x, e.y, e.z), pos(e.tx, e.ty, e.tz), col, 0.18);
        break;
      }
      case 'bolt': {
        const t = pos(e.x, e.y, e.z);
        this.fx.lightningBolt(t.clone().setY(t.y + 30), t, elementInfo(e.element).glow, 0.3);
        this.fx.impact(t, e.element);
        this.audio.play('lightning', { pos: t, volume: 0.7 });
        break;
      }
      case 'meteor':
        this.fx.meteor(pos(e.x, e.y, e.z), e.delay, () => {});
        break;
      case 'object_add': {
        const o = e.object;
        this.objects.set(o.id, new ObjectView(o, this.ctx));
        if (o.type !== 'clone' && o.type !== 'barrier') this.fx.appear(pos(o.x, o.y + 0.5, o.z), o.element);
        if (o.type === 'balloon') {
          this.fx.confetti(pos(o.x, o.y + 2, o.z));
          this.audio.play('confetti', { pos: pos(o.x, o.y, o.z) });
        } else if (o.type === 'bomb') this.audio.play('bomb_tick', { pos: pos(o.x, o.y, o.z) });
        else if (o.type === 'barrier') this.audio.play('shield', { pos: pos(o.x, o.y, o.z) });
        else this.audio.play('appear', { pos: pos(o.x, o.y, o.z), element: o.element });
        break;
      }
      case 'object_remove': {
        const v = this.objects.get(e.id);
        if (v) {
          if (e.reason === 'destroyed') this.fx.burst(pos(v.data.x, v.data.y + 0.6, v.data.z), { colors: [0xb08050, 0x8a6a42], count: 25, speed: 5, gravity: 9, life: 1 });
          v.dispose();
          this.objects.delete(e.id);
        }
        break;
      }
      case 'pickup':
        if (mine) {
          this.audio.play('pickup');
          this.hud.toast(e.kind === 'chest' ? `Baú aberto: ${e.item?.label}!` : e.kind === 'potion' ? 'Poção bebida (+35 vida)' : 'Comida (+20 vida)', 'good');
        }
        break;
      case 'zone_add':
        this.zones.set(e.zone.id, new ZoneView(e.zone, this.ctx));
        break;
      case 'zone_remove': {
        const v = this.zones.get(e.id);
        if (v) {
          v.dispose();
          this.zones.delete(e.id);
        }
        break;
      }
      case 'ability':
        this.onAbility(e);
        break;
      case 'buff': {
        const v = this.players.get(e.playerId);
        if (!v) break;
        const b = { [e.buff]: { until: e.until, absorb: e.absorb, element: e.element } };
        if (e.buff === 'invisibility') v.invisible = true;
        if (e.buff === 'shield') {
          v.handles.shield?.dispose?.();
          v.handles.shield = this.fx.shieldBubble(v.root, 1.3, elementInfo(e.element || 'arcane').color);
        }
        if (e.buff === 'speed') v.handles.speed = this.fx.speedTrail(v.root, e.until - this.serverTime());
        if (['grow', 'fly', 'jump', 'shrink'].includes(e.buff)) v.handles[e.buff] = this.fx.aura(v.root, e.buff === 'grow' ? 'earth' : e.buff === 'fly' ? 'wind' : 'light', e.until - this.serverTime());
        if (mine) this.hud.buff(e.buff, e.until - this.serverTime());
        void b;
        break;
      }
      case 'buff_end': {
        const v = this.players.get(e.playerId);
        if (!v) break;
        if (e.buff === 'invisibility') v.invisible = false;
        if (e.buff === 'shield') {
          v.handles.shield?.dispose?.();
          v.handles.shield = null;
          if (e.broken) this.audio.play('shield_break', { pos: v.pos });
        }
        v.handles[e.buff]?.dispose?.();
        v.handles[e.buff] = null;
        if (mine) this.hud.buff(e.buff, 0);
        break;
      }
      case 'block':
        break;
      case 'dodge': {
        const v = this.players.get(e.playerId);
        if (v) this.audio.play('dodge', { pos: v.pos });
        break;
      }
      case 'env':
        this.applyEnv(e.env, false);
        break;
      case 'wave':
        this.hud.waveBanner(e);
        this.audio.play(e.state === 'start' ? 'wave_start' : 'wave_clear');
        break;
      case 'manifest':
        this.onManifest(e);
        break;
      case 'progress':
        this.onProgress(e);
        break;
      case 'level_up': {
        const v = this.players.get(e.playerId);
        if (v) this.fx.appear(v.pos.clone().setY(v.pos.y + 1), 'light');
        break;
      }
      case 'denied':
        if (e.kind === 'dodge' || e.kind === 'special') this.hud.cooldownFlash(e.kind, e.readyIn);
        break;
      default:
        break;
    }
  }

  onAbility(e) {
    const v = this.players.get(e.playerId);
    const p = new THREE.Vector3(e.x, e.y, e.z);
    const el = e.element;
    v?.playAttack('cast');
    switch (e.id) {
      case 'energy_wave':
      case 'elemental_burst':
        this.fx.shockwave(p.clone().setY(p.y + 0.5), e.radius, el);
        this.fx.explosion(p.clone().setY(p.y + 1), el, e.radius * 0.4);
        this.audio.play('explosion', { pos: p, radius: e.radius });
        break;
      case 'lightning':
        for (const b of e.bolts || []) {
          const from = new THREE.Vector3(e.x, e.y + 1.6, e.z);
          this.fx.lightningBolt(from, new THREE.Vector3(b.x, b.y, b.z), elementInfo(el).glow, 0.4);
          this.fx.lightningBolt(new THREE.Vector3(b.x, b.y + 25, b.z), new THREE.Vector3(b.x, b.y, b.z), elementInfo(el).glow, 0.3);
        }
        this.audio.play('lightning', { pos: p });
        break;
      case 'earthquake':
        this.fx.earthquake(p, e.radius);
        this.audio.play('quake', { pos: p });
        break;
      case 'heal':
        if (v) this.fx.healAura(v.root);
        this.audio.play('heal', { pos: p });
        break;
      case 'fly':
      case 'speed':
      case 'jump':
      case 'grow':
      case 'shrink':
      case 'invisibility':
        this.audio.play('powerup', { pos: p });
        this.fx.burst(p.clone().setY(p.y + 1), { colors: elementInfo(el || 'light').particle, count: 30, speed: 4, life: 0.8 });
        break;
      case 'shield':
        this.audio.play('shield', { pos: p });
        break;
      case 'freeze':
        this.audio.play('freeze', { pos: p });
        break;
      case 'tornado':
      case 'storm':
        this.audio.play('wind', { pos: p });
        break;
      case 'laser':
        this.audio.play('laser', { pos: p });
        break;
      case 'time_warp':
        this.audio.play('teleport', { pos: p });
        break;
      case 'clones':
        this.fx.burst(p.clone().setY(p.y + 1), { colors: [0xffffff, 0xb46bff], count: 40, speed: 5, life: 0.8 });
        this.audio.play('teleport', { pos: p });
        break;
      case 'fireball':
      case 'meteor':
        this.audio.play('orb', { pos: p, element: el });
        break;
      default:
        break;
    }
    if (e.playerId === this.meId) this.hud.abilityUsed(e.id, e.label, e.cooldown);
  }

  onManifest(e) {
    const mine = e.playerId === this.meId;
    const v = this.players.get(e.playerId);
    if (!mine) {
      if (v && e.understood) this.hud.speechBubble(v, e.text, e.entries);
      return;
    }
    this.hud.manifestResult(e);
    if (!e.understood) this.audio.play('not_understood');
  }

  onProgress(e) {
    const c = e.changes;
    this.hud.setXp(e.xp, e.level);
    if (c.levelUp) {
      this.hud.levelUp(c.levelUp);
      this.audio.play('levelup');
    }
    for (const a of c.achievements) {
      this.hud.achievement(ACHIEVEMENTS[a]);
      this.audio.play('achievement');
    }
    if (c.discovery) this.hud.toast(`Nova descoberta: ${c.discovery.split(':')[1]} (+20 XP)`, 'xp');
  }

  // ------------------------------------------------------------------ ações
  sendVoice(text, source = 'voice') {
    this.session.send({ t: C.VOICE, text, source });
  }

  // ------------------------------------------------------------------ quadro
  update(dt) {
    const me = this.me;
    const input = this.input;
    input.update();
    const look = input.consumeLook();
    this.camYaw -= look.dx;
    this.camPitch = Math.max(-0.5, Math.min(1.2, this.camPitch + look.dy));
    const pressed = input.consumePressed();
    const time = this.serverTime();
    const buffs = this.myBuffs(time);

    if (me && !me.dead) {
      this.controller.update(dt, input, this.camYaw, buffs, [...this.objects.values()].map((o) => o.data));
      for (const ev of this.controller.events) this.audio.play(ev);
      // passos
      if (this.controller.onGround && this.controller.speed > 1) {
        this.stepAcc = (this.stepAcc || 0) + dt * this.controller.speed * 0.3;
        if (this.stepAcc > 1) {
          this.stepAcc = 0;
          this.audio.play('step', { volume: 0.5 });
        }
      }
      // ataque: personagem vira para onde a câmera aponta
      if (input.buttons.attack || pressed.has('attack')) this.tryAttack(false);
      if (pressed.has('special')) this.tryAttack(true);
      if (pressed.has('dodge')) {
        const mv = input.move;
        const dir = Math.hypot(mv.x, mv.y) > 0.1 ? this.camYaw + Math.atan2(-mv.x, mv.y) : this.controller.ry;
        this.controller.dodge(dir);
        this.session.send({ t: C.ACTION, kind: 'dodge', dir });
      }
      if (input.buttons.block !== this.lastBlock) {
        this.lastBlock = input.buttons.block;
        this.session.send({ t: C.ACTION, kind: input.buttons.block ? 'block' : 'unblock' });
        me.blocking = input.buttons.block;
      }
      this.inputAcc += dt;
      if (this.inputAcc >= 1 / INPUT_RATE) {
        this.inputAcc = 0;
        const c = this.controller;
        this.session.send({ t: C.INPUT, x: +c.pos.x.toFixed(2), y: +c.pos.y.toFixed(2), z: +c.pos.z.toFixed(2), ry: +c.ry.toFixed(3), anim: c.anim });
      }
    }

    for (const v of this.players.values()) v.update(dt, v.id === this.meId && !v.dead ? this.controller : null);
    const camPos = this.camera.position;
    for (const v of this.creatures.values()) v.update(dt, camPos);
    for (const v of this.projectiles.values()) v.update(dt);
    for (const v of this.objects.values()) v.update(dt);
    for (const v of this.zones.values()) v.update(dt);

    this.updateCamera(dt);
    this.world.update(dt, this.camera);
    this.fx.update(dt, this.camera);
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    this.audio.setListener(this.camera.position, fwd);
    this.hud.frame(dt, this);
  }

  myBuffs(time) {
    const out = {};
    const v = this.me;
    if (!v) return out;
    const b = this.hud.activeBuffs || {};
    for (const [k, until] of Object.entries(b)) if (until > performance.now()) out[k] = true;
    if (out.speed) out.speed = 1.9;
    if (out.jump) out.jump = 2.6;
    if (out.grow) out.grow = 2.2;
    if (out.shrink) out.shrink = 0.45;
    const st = this.hud.activeStatus || {};
    if (st.slow > performance.now()) out.slow = 0.45;
    if (st.stun > performance.now()) out.stun = true;
    void time;
    return out;
  }

  tryAttack(special) {
    const now = performance.now();
    const w = this.meState?.inventory?.[this.meState.weaponIndex];
    const interval = special ? (w?.cooldown || 3) * 1000 : 1000 / (w?.speed || 2.2);
    const key = special ? 'nextSpecial' : 'nextAttack';
    if (now < (this[key] || 0)) return;
    this[key] = now + interval;
    // mira: direção da câmera
    this.controller.ry = this.camYaw;
    const pitch = Math.max(-0.6, Math.min(0.6, (this.camPitch - 0.25) * -0.8));
    this.session.send({ t: C.ACTION, kind: special ? 'special' : 'attack', ry: +this.camYaw.toFixed(3), pitch: +pitch.toFixed(3) });
    const style = !w ? 'punch' : w.attack === 'melee' ? (['hammer', 'greatsword', 'axe', 'mace'].includes(w.kind) ? 'heavy' : ['spear', 'trident', 'dagger'].includes(w.kind) ? 'thrust' : w.kind === 'gauntlet' ? 'punch' : 'slash') : ['staff', 'wand'].includes(w.kind) ? 'cast' : 'shoot';
    this.me?.playAttack(style);
    this.localAttackAt = now;
    if (special) this.hud.cooldownStart('special', interval / 1000);
  }

  updateCamera(dt) {
    const me = this.me;
    const target = me ? me.pos.clone() : new THREE.Vector3(0, 2, 0);
    const scale = me?.scale || 1;
    target.y += 1.6 * scale;
    const dist = this.camDist * (0.6 + scale * 0.4);
    const cp = Math.cos(this.camPitch);
    const desired = new THREE.Vector3(target.x - Math.sin(this.camYaw) * dist * cp, target.y + Math.sin(this.camPitch) * dist, target.z - Math.cos(this.camYaw) * dist * cp);
    // não deixa a câmera entrar no terreno
    const gy = terrainHeight(desired.x, desired.z) + 0.6;
    if (desired.y < gy) desired.y = gy;
    const k = Math.min(1, dt * 14);
    this.camera.position.lerp(desired, this.camInit ? k : 1);
    this.camInit = true;
    if (this.shake > 0.01) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.6;
      this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.6;
      this.shake *= Math.max(0, 1 - dt * 5);
    }
    this.camera.lookAt(target.x + Math.sin(this.camYaw) * 2, target.y + 0.2, target.z + Math.cos(this.camYaw) * 2);
  }

  zoom(dir) {
    this.camDist = Math.max(3, Math.min(16, this.camDist + dir * 0.8));
  }

  dispose() {
    this.removeLoop();
    this.unsub.forEach((u) => u());
    this.clear();
  }
}
