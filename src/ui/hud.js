// HUD durante a partida: vida/energia/XP, microfone e texto reconhecido, inventário,
// habilidades, jogadores, conexão, onda, notificações, números de dano e controles de toque.
import * as THREE from 'three';
import { RARITY_COLORS } from '../../shared/catalog/weapons.js';
import { xpForLevel } from '../../shared/sim/progression.js';

const MIC_SVG = '<svg viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>';
const WEAPON_ICON = { sword: '🗡️', greatsword: '⚔️', katana: '🗡️', dagger: '🔪', axe: '🪓', hammer: '🔨', mace: '🏏', spear: '🔱', trident: '🔱', scythe: '🌙', bow: '🏹', staff: '🪄', wand: '✨', blaster: '🔫', rifle: '⚡', cannon: '💥', gauntlet: '🥊' };
const BUFF_LABEL = { fly: 'Voo', invisibility: 'Invisível', shield: 'Escudo', speed: 'Velocidade', jump: 'Super pulo', grow: 'Gigante', shrink: 'Mini' };
const STATUS_LABEL = { slow: 'Lento', stun: 'Atordoado', burn: 'Queimando', poison: 'Envenenado', weaken: 'Enfraquecido', blind: 'Cego', stagger: 'Cambaleando' };
const VOICE_STATE = {
  off: ['Microfone desligado', 'Toque no microfone ou pressione M'],
  requesting: ['Pedindo permissão…', 'Autorize o microfone no navegador'],
  listening: ['Ouvindo', 'Fale um objeto, animal ou poder'],
  hearing: ['Escutando você…', ''],
  standby: ['Aperte para falar', 'Segure V (ou o botão) e fale'],
  denied: ['Microfone bloqueado', 'Libere nas permissões do navegador ou digite'],
  unsupported: ['Voz indisponível neste navegador', 'Digite os comandos (Chrome/Edge/Safari têm voz)'],
};
const TIPS = ['espada de fogo', 'dragão', 'quero voar', 'escudo gigante', 'chuva', 'exército', 'tubarão', 'bomba', 'algo para me proteger', 'tempestade', 'faz de noite', 'lobo de gelo'];

const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class HUD {
  constructor(root, { input, settings, onMic, onPushTalk, onCommand, onMenu, onSlot, onZoom }) {
    this.input = input;
    this.settings = settings;
    this.activeBuffs = {};
    this.activeStatus = {};
    this.floats = [];
    this.plates = new Map();
    this.bubbles = [];
    this.root = el('div', 'hud hidden');
    root.appendChild(this.root);
    this.build({ onMic, onPushTalk, onCommand, onMenu, onSlot, onZoom });
    this.v3 = new THREE.Vector3();
  }

  build({ onMic, onPushTalk, onCommand, onMenu, onSlot }) {
    const r = this.root;
    // vitais
    this.vitals = el('div', 'vitals panel', `<div class="name"><span class="pname">Jogador</span><em class="plevel">Nv 1</em></div>
      <div class="bar hp"><i></i><small class="hpt">100</small></div>
      <div class="bar en"><i></i><small class="ent">100</small></div>
      <div class="bar xp"><i></i></div><div class="buffs"></div>`);
    r.appendChild(this.vitals);
    // canto superior direito
    this.topright = el('div', 'topright');
    this.conn = el('div', 'chip panel interactive', '<span class="dot"></span><span class="ctext">Solo</span>');
    this.conn.title = 'Clique para copiar o código da sala';
    this.conn.addEventListener('click', () => this.copyCode());
    this.playersBtn = el('button', 'iconbtn interactive', '👥');
    this.playersBtn.title = 'Jogadores (Tab)';
    this.playersBtn.addEventListener('click', () => this.togglePlayers());
    this.menuBtn = el('button', 'iconbtn interactive', '☰');
    this.menuBtn.title = 'Menu (Esc)';
    this.menuBtn.addEventListener('click', () => onMenu());
    this.topright.append(this.conn, this.playersBtn, this.menuBtn);
    r.appendChild(this.topright);
    this.playersPanel = el('div', 'players panel hidden', '<h3>Jogadores</h3><ul></ul>');
    r.appendChild(this.playersPanel);
    this.waveEl = el('div', 'wave panel hidden');
    r.appendChild(this.waveEl);
    this.abilitiesEl = el('div', 'abilities');
    r.appendChild(this.abilitiesEl);
    this.toastsEl = el('div', 'toasts');
    r.appendChild(this.toastsEl);
    this.hurtEl = el('div', 'hurt');
    r.appendChild(this.hurtEl);
    this.layer = el('div');
    this.layer.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden';
    r.appendChild(this.layer);
    r.appendChild(el('div', 'crosshair desktop-only'));
    this.fpsEl = el('div', 'fps panel hidden');
    r.appendChild(this.fpsEl);
    this.helpEl = el('div', 'help panel desktop-only', `<b>Controles</b><br><kbd>WASD</kbd> mover · <kbd>Espaço</kbd> pular/subir<br><kbd>Clique</kbd> atacar · <kbd>Botão dir./Q</kbd> defender<br><kbd>Shift</kbd> esquivar · <kbd>F</kbd> golpe especial<br><kbd>M</kbd> microfone · <kbd>V</kbd> segurar p/ falar<br><kbd>T</kbd> digitar · <kbd>1-5</kbd> armas · <kbd>Tab</kbd> jogadores<br><span class="muted">Fale qualquer coisa: o mundo obedece!</span>`);
    r.appendChild(this.helpEl);
    setTimeout(() => this.helpEl.classList.add('hidden'), 25000);

    // voz
    const voice = el('div', 'voice');
    this.resultsEl = el('div', 'results');
    this.heardEl = el('div', 'heard panel hidden');
    this.inventoryEl = el('div', 'inventory interactive');
    const bar = el('div', 'voicebar panel interactive');
    this.micBtn = el('button', 'mic off', `<span class="lvl"></span>${MIC_SVG}`);
    this.micBtn.setAttribute('aria-label', 'Ativar ou desativar o microfone');
    let pressT = 0;
    const down = (e) => {
      e.preventDefault();
      pressT = performance.now();
      if (this.settings.get('voiceMode') === 'push') onPushTalk(true);
    };
    const up = (e) => {
      e.preventDefault();
      if (this.settings.get('voiceMode') === 'push') onPushTalk(false);
      else if (performance.now() - pressT < 800) onMic();
    };
    this.micBtn.addEventListener('pointerdown', down);
    this.micBtn.addEventListener('pointerup', up);
    this.vstate = el('div', 'vstate', '<b>Microfone desligado</b><span></span>');
    this.vstate.style.width = '150px';
    this.cmd = el('input', 'cmd');
    this.cmd.placeholder = 'Digite ou fale: "espada de gelo"…';
    this.cmd.maxLength = 120;
    this.cmd.setAttribute('enterkeyhint', 'send');
    this.cmd.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && this.cmd.value.trim()) {
        onCommand(this.cmd.value.trim());
        this.cmd.value = '';
      }
      if (e.key === 'Escape') this.cmd.blur();
    });
    bar.append(this.micBtn, this.vstate, this.cmd);
    this.tipsEl = el('div', 'tips interactive');
    for (const t of TIPS.sort(() => Math.random() - 0.5).slice(0, 6)) {
      const b = el('button', 'tip', esc(t));
      b.addEventListener('click', () => onCommand(t));
      this.tipsEl.appendChild(b);
    }
    voice.append(this.resultsEl, this.heardEl, this.inventoryEl, bar, this.tipsEl);
    r.appendChild(voice);
    this.onSlot = onSlot;

    // toque
    const joy = el('div', 'joystick touch-only interactive', '<div class="knob"></div>');
    r.appendChild(joy);
    this.bindJoystick(joy);
    const acts = el('div', 'actions touch-only interactive');
    const mk = (icon, cls, onDown, onUp) => {
      const b = el('button', `act ${cls}`, icon);
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        onDown();
      });
      if (onUp) {
        b.addEventListener('pointerup', onUp);
        b.addEventListener('pointercancel', onUp);
        b.addEventListener('pointerleave', onUp);
      }
      acts.appendChild(b);
    };
    const inp = this.input;
    mk('🛡️', '', () => (inp.buttons.block = true), () => (inp.buttons.block = false));
    mk('🌀', '', () => inp.trigger('dodge'));
    mk('✨', '', () => inp.trigger('special'));
    mk('⬇️', '', () => (inp.touchDescend = true), () => (inp.touchDescend = false));
    mk('⬆️', '', () => (inp.touchJump = true), () => (inp.touchJump = false));
    mk('⚔️', 'big', () => {
      inp.buttons.attack = true;
      inp.trigger('attack');
    }, () => (inp.buttons.attack = false));
    r.appendChild(acts);
  }

  bindJoystick(joy) {
    const knob = joy.querySelector('.knob');
    let id = null;
    let cx = 0;
    let cy = 0;
    const R = 50;
    joy.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      joy.setPointerCapture(id);
      const rc = joy.getBoundingClientRect();
      cx = rc.left + rc.width / 2;
      cy = rc.top + rc.height / 2;
      move(e);
    });
    const move = (e) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const l = Math.hypot(dx, dy);
      if (l > R) {
        dx = (dx / l) * R;
        dy = (dy / l) * R;
      }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.input.setJoystick(dx / R, -dy / R);
    };
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      knob.style.transform = '';
      this.input.setJoystick(0, 0);
    };
    joy.addEventListener('pointermove', move);
    joy.addEventListener('pointerup', end);
    joy.addEventListener('pointercancel', end);
  }

  show(on) {
    this.root.classList.toggle('hidden', !on);
  }

  focusCommand() {
    this.cmd.focus();
  }

  // ------------------------------------------------------------ dados
  setProfile(p) {
    this.profile = p;
    this.vitals.querySelector('.pname').textContent = p.name;
    this.setXp(p.xp, p.level);
  }

  setXp(xp, level) {
    const a = xpForLevel(level);
    const b = xpForLevel(level + 1);
    this.vitals.querySelector('.plevel').textContent = `Nv ${level}`;
    this.vitals.querySelector('.bar.xp i').style.transform = `scaleX(${Math.min(1, (xp - a) / Math.max(1, b - a))})`;
  }

  setVitals(hp, maxHp, en, maxEn) {
    this.vitals.querySelector('.bar.hp i').style.transform = `scaleX(${Math.max(0, hp / maxHp)})`;
    this.vitals.querySelector('.hpt').textContent = `${Math.max(0, Math.ceil(hp))}`;
    this.vitals.querySelector('.bar.en i').style.transform = `scaleX(${Math.max(0, en / maxEn)})`;
    this.vitals.querySelector('.ent').textContent = `${Math.floor(en)}`;
  }

  setRoom(room, kind) {
    this.roomCode = kind === 'net' ? room.code : null;
    this.conn.querySelector('.ctext').textContent = kind === 'net' ? `Sala ${room.code}` : room.mode === 'creative' ? 'Solo · Criativo' : 'Solo · Aventura';
  }

  setConnection(state, latency) {
    const dot = this.conn.querySelector('.dot');
    dot.className = `dot ${state}`;
    const label = { online: this.roomCode ? `Sala ${this.roomCode}` : 'Solo', connecting: 'Conectando…', reconnecting: 'Reconectando…', offline: 'Sem conexão' }[state] || state;
    this.conn.querySelector('.ctext').textContent = latency && state === 'online' && this.roomCode ? `${label} · ${latency}ms` : label;
  }

  copyCode() {
    if (!this.roomCode) return;
    const url = `${location.origin}${location.pathname}?sala=${this.roomCode}`;
    const text = `Entre na minha sala do LA VOICE: código ${this.roomCode} — ${url}`;
    if (navigator.share && this.input.touch) navigator.share({ title: 'LA VOICE', text, url }).catch(() => {});
    else navigator.clipboard?.writeText(text).then(() => this.toast(`Convite copiado! Código ${this.roomCode}`, 'good'), () => this.toast(`Código da sala: ${this.roomCode}`));
  }

  setPlayers(list, meId) {
    this.playerList = list;
    this.meId = meId;
    const ul = this.playersPanel.querySelector('ul');
    ul.innerHTML = list.map((p) => `<li><span>${p.id === meId ? '⭐ ' : ''}${esc(p.name)}</span><span>${p.connected === false ? '⚠️ offline' : `Nv ${p.level || 1}`}</span></li>`).join('');
    this.playersBtn.textContent = list.length > 1 ? `👥${list.length}` : '👥';
  }

  togglePlayers(force) {
    this.playersPanel.classList.toggle('hidden', force === undefined ? undefined : !force);
  }

  setInventory(inv, index) {
    this.inventoryEl.innerHTML = '';
    inv.forEach((w, i) => {
      const s = el('button', `slot ${i === index ? 'sel' : ''}`, `<kbd>${i + 1}</kbd><span class="ic">${WEAPON_ICON[w.kind] || '⚔️'}</span>${esc(w.label.split(' ')[0])}`);
      s.style.borderColor = RARITY_COLORS[w.rarity] || '#fff';
      s.title = `${w.label} — ${w.rarity} · dano ${w.damage} · ${w.description}`;
      s.addEventListener('click', () => this.onSlot(i));
      this.inventoryEl.appendChild(s);
    });
  }

  setWave(n, state) {
    if (!n) return this.waveEl.classList.add('hidden');
    this.waveEl.classList.remove('hidden');
    this.waveEl.textContent = state === 'active' ? `ONDA ${n}` : `ONDA ${n} CONCLUÍDA`;
  }

  waveBanner(e) {
    this.banner(e.state === 'start' ? `ONDA ${e.wave}` : `ONDA ${e.wave} VENCIDA!`, e.state === 'start' ? `${e.count} criaturas se aproximam — fale para se defender!` : `Próxima em ${e.next}s`);
  }

  banner(text, sub = '') {
    const b = el('div', 'banner', `${esc(text)}<small>${esc(sub)}</small>`);
    this.root.appendChild(b);
    setTimeout(() => b.remove(), 2700);
  }

  // ------------------------------------------------------------ voz
  setVoiceState(state) {
    this.voiceStateName = state;
    this.micBtn.className = `mic ${state}`;
    const [a, b] = VOICE_STATE[state] || VOICE_STATE.off;
    this.vstate.innerHTML = `<b>${a}</b><span>${b}</span>`;
  }

  setMicLevel(level) {
    const s = Math.min(1.4, level * 18);
    this.micBtn.querySelector('.lvl').style.transform = `scale(${s})`;
  }

  showInterim(text) {
    this.heardEl.classList.remove('hidden');
    this.heardEl.innerHTML = `<span class="interim">${esc(text)}</span>`;
    clearTimeout(this.heardTimer);
    this.heardTimer = setTimeout(() => this.heardEl.classList.add('hidden'), 4000);
  }

  showHeard(text, source) {
    this.heardEl.classList.remove('hidden');
    this.heardEl.innerHTML = `${source === 'text' ? '⌨️' : '🎙️'} <span class="final">"${esc(text)}"</span>`;
    clearTimeout(this.heardTimer);
    this.heardTimer = setTimeout(() => this.heardEl.classList.add('hidden'), 6000);
  }

  manifestResult(e) {
    this.resultsEl.innerHTML = '';
    if (!e.understood) {
      const d = el('div', 'res fail', `🤔 ${esc(e.message)}${e.unknown?.length ? `<span class="note">Não reconheci: ${esc(e.unknown.join(', '))}</span>` : ''}`);
      this.resultsEl.appendChild(d);
    }
    const ICON = { weapon: '⚔️', creature: '🐾', ability: '✨', environment: '🌦️', object: '📦' };
    for (const r of e.entries || []) {
      const notes = [r.reason, r.message, ...(r.notes || [])].filter(Boolean);
      const d = el('div', `res ${r.ok ? '' : 'fail'}`, `${ICON[r.category] || '•'} <b style="color:${RARITY_COLORS[r.rarity] || 'inherit'}">${esc(r.label)}</b>${r.count > 1 ? ` ×${r.count}` : ''}${notes.length ? `<span class="note">${notes.map(esc).join(' · ')}</span>` : ''}`);
      this.resultsEl.appendChild(d);
    }
    if (e.source === 'remote') this.resultsEl.appendChild(el('div', 'res', '🧠 <span class="note">interpretado pelo serviço externo</span>'));
    clearTimeout(this.resTimer);
    this.resTimer = setTimeout(() => (this.resultsEl.innerHTML = ''), 7000);
  }

  weaponCard(spec) {
    this.toast(`${WEAPON_ICON[spec.kind] || '⚔️'} <b style="color:${RARITY_COLORS[spec.rarity]}">${esc(spec.label)}</b> (${spec.rarity}) · dano ${spec.damage} · alcance ${spec.range}m`, 'good', true);
  }

  // ------------------------------------------------------------ notificações
  toast(text, kind = '', html = false) {
    const t = el('div', `toast panel ${kind}`);
    if (html) t.innerHTML = text;
    else t.textContent = text;
    this.toastsEl.appendChild(t);
    while (this.toastsEl.children.length > 5) this.toastsEl.firstChild.remove();
    setTimeout(() => {
      t.style.transition = 'opacity 0.4s';
      t.style.opacity = '0';
      setTimeout(() => t.remove(), 400);
    }, 4200);
  }

  achievement(a) {
    if (!a) return;
    if (!this.achBox) {
      this.achBox = el('div', 'achbox');
      this.root.appendChild(this.achBox);
    }
    const d = el('div', 'achievement panel', `<span class="tro">🏆</span><div><b>Conquista: ${esc(a.label)}</b><div class="muted">${esc(a.description)} · +40 XP</div></div>`);
    this.achBox.appendChild(d);
    setTimeout(() => d.remove(), 4500);
  }

  levelUp(level) {
    this.banner(`NÍVEL ${level}!`, 'Novas armas, criaturas e poderes desbloqueados');
  }

  killFeed(label) {
    this.toast(`Derrotou: ${label}`, 'xp');
  }

  showKO(on) {
    this.koEl?.remove();
    this.koEl = null;
    if (on) {
      this.koEl = el('div', 'ko', 'NOCAUTEADO<small>Renascendo em instantes…</small>');
      this.root.appendChild(this.koEl);
    }
  }

  hurtFlash(k) {
    this.hurtEl.style.transition = 'none';
    this.hurtEl.style.opacity = String(0.3 + k * 0.7);
    requestAnimationFrame(() => {
      this.hurtEl.style.transition = 'opacity 0.6s';
      this.hurtEl.style.opacity = '0';
    });
  }

  buff(name, seconds) {
    if (seconds > 0) this.activeBuffs[name] = performance.now() + seconds * 1000;
    else delete this.activeBuffs[name];
  }

  status(name, seconds) {
    this.activeStatus[name] = performance.now() + Math.max(0.2, seconds) * 1000;
  }

  abilityUsed(id, label, cooldown) {
    this.cooldowns ||= {};
    this.cooldowns[id] = { label, until: performance.now() + cooldown * 1000, total: cooldown };
  }

  cooldownStart(kind, seconds) {
    this.abilityUsed(kind, kind === 'special' ? 'Golpe especial' : 'Esquiva', seconds);
  }

  cooldownFlash(kind, readyIn) {
    this.toast(`${kind === 'dodge' ? 'Esquiva' : 'Especial'} em recarga (${Math.ceil(readyIn)}s)`, 'bad');
  }

  floatText(pos, text, kind) {
    if (this.floats.length > 40) this.floats.shift().el.remove();
    const d = el('div', `float ${kind === 'hurt' ? 'hurt-t' : kind}`, esc(text));
    this.layer.appendChild(d);
    this.floats.push({ el: d, pos: pos.clone(), t: 0, dx: (Math.random() - 0.5) * 30 });
  }

  speechBubble(view, text, entries) {
    const label = entries?.filter((e) => e.ok).map((e) => e.label).join(', ');
    const d = el('div', 'bubble', `"${esc(text)}"${label ? `<br><small>→ ${esc(label)}</small>` : ''}`);
    this.layer.appendChild(d);
    this.bubbles.push({ el: d, view, t: 0 });
  }

  // ------------------------------------------------------------ quadro
  project(pos, camera) {
    this.v3.copy(pos).project(camera);
    if (this.v3.z > 1) return null;
    return { x: (this.v3.x * 0.5 + 0.5) * window.innerWidth, y: (-this.v3.y * 0.5 + 0.5) * window.innerHeight };
  }

  frame(dt, game) {
    const cam = game.camera;
    // números flutuantes
    for (let i = this.floats.length - 1; i >= 0; i--) {
      const f = this.floats[i];
      f.t += dt;
      const s = this.project(f.pos, cam);
      if (!s || f.t > 1.1) {
        f.el.remove();
        this.floats.splice(i, 1);
        continue;
      }
      f.el.style.transform = `translate(${s.x + f.dx * f.t}px, ${s.y - f.t * 60}px) translate(-50%,-50%) scale(${1 + Math.max(0, 0.3 - f.t)})`;
      f.el.style.opacity = String(1 - Math.max(0, f.t - 0.7) / 0.4);
    }
    // balões de fala de outros jogadores
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      b.t += dt;
      const s = b.t < 4 && this.project(b.view.pos.clone().setY(b.view.pos.y + 2.6 * b.view.scale), cam);
      if (!s) {
        b.el.remove();
        this.bubbles.splice(i, 1);
        continue;
      }
      b.el.style.left = `${s.x}px`;
      b.el.style.top = `${s.y}px`;
    }
    // placas de nome / vida
    const seen = new Set();
    const camPos = cam.position;
    const addPlate = (key, pos, name, hp, max, cls) => {
      seen.add(key);
      let p = this.plates.get(key);
      if (!p) {
        p = el('div', `plate ${cls}`, `<div class="nm"></div><div class="hpb"><i></i></div>`);
        this.layer.appendChild(p);
        this.plates.set(key, p);
      }
      const s = this.project(pos, cam);
      if (!s || camPos.distanceTo(pos) > 45) {
        p.style.display = 'none';
        return;
      }
      p.style.display = '';
      p.style.left = `${s.x}px`;
      p.style.top = `${s.y}px`;
      const nm = p.firstChild;
      if (nm.textContent !== name) nm.textContent = name;
      p.lastChild.firstChild.style.width = `${Math.max(0, (hp / max) * 100)}%`;
    };
    for (const v of game.players.values()) {
      if (v.id === game.meId || v.invisible) continue;
      addPlate(`p${v.id}`, v.pos.clone().setY(v.pos.y + 2.2 * v.scale), v.data.name, v.hp ?? v.data.hp, v.data.maxHp || 100, '');
    }
    for (const v of game.creatures.values()) {
      if (v.dieT >= 0) continue;
      if (v.hp >= v.maxHp && !v.data.wild && v.data.ownerId === game.meId) continue;
      const h = v.spec.height * v.spec.size;
      addPlate(`c${v.id}`, v.pos.clone().setY(v.pos.y + (v.spec.traits?.flying ? h * 0.7 : h + 0.3)), v.data.wild ? v.spec.label : '', v.hp, v.maxHp, v.data.wild ? '' : v.data.ownerId === game.meId ? 'mine' : 'ally');
    }
    for (const [k, p] of this.plates) {
      if (!seen.has(k)) {
        p.remove();
        this.plates.delete(k);
      }
    }
    // buffs / status
    const now = performance.now();
    this.accBuff = (this.accBuff || 0) + dt;
    if (this.accBuff > 0.25) {
      this.accBuff = 0;
      const items = [];
      for (const [k, u] of Object.entries(this.activeBuffs)) if (u > now) items.push(`<span class="buff">${BUFF_LABEL[k] || k} ${Math.ceil((u - now) / 1000)}s</span>`);
      for (const [k, u] of Object.entries(this.activeStatus)) if (u > now) items.push(`<span class="buff st">${STATUS_LABEL[k] || k}</span>`);
      this.vitals.querySelector('.buffs').innerHTML = items.join('');
      const cds = Object.entries(this.cooldowns || {}).filter(([, c]) => c.until > now);
      this.abilitiesEl.innerHTML = cds.map(([, c]) => `<div class="ab panel">${esc(c.label)} · ${Math.ceil((c.until - now) / 1000)}s<span class="cd" style="width:${((c.until - now) / (c.total * 1000)) * 100}%"></span></div>`).join('');
      if (this.settings.get('showFps')) {
        const i = game.engine.info();
        this.fpsEl.classList.remove('hidden');
        this.fpsEl.textContent = `${i.fps} fps · ${i.calls} draws · ${(i.triangles / 1000).toFixed(0)}k tri · ${i.tier} ×${(i.scale || 1).toFixed(2)}`;
      } else this.fpsEl.classList.add('hidden');
    }
  }
}
