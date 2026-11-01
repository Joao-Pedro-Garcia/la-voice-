// Telas de menu: inicial, multiplayer, personagem, perfil, configurações, créditos, pausa, carregamento.
import * as THREE from 'three';
import { createCharacterModel } from '../entities/character.js';
import { ACHIEVEMENTS, xpForLevel } from '../../shared/sim/progression.js';
import { PRESETS } from '../core/quality.js';
import { ARTIFACT } from '../core/env.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export class Menus {
  constructor(root, app) {
    this.root = root;
    this.app = app;
    this.current = null;
  }

  close() {
    this.disposePreview?.();
    this.disposePreview = null;
    this.current?.remove();
    this.current = null;
  }

  open(html, cls = 'backdrop') {
    this.close();
    const s = document.createElement('div');
    s.className = `screen ${cls}`;
    s.innerHTML = html;
    this.root.appendChild(s);
    this.current = s;
    s.querySelectorAll('button').forEach((b) => b.addEventListener('pointerenter', () => this.app.audio.play('ui_hover')));
    return s;
  }

  click(s, sel, fn) {
    s.querySelector(sel)?.addEventListener('click', () => {
      this.app.audio.init();
      this.app.audio.play('ui_click');
      fn();
    });
  }

  // ------------------------------------------------------------------ inicial
  main() {
    const p = this.app.profile;
    const s = this.open(`<div style="display:flex;flex-direction:column;align-items:center;width:100%">
      <div class="title"><div class="logo">LA VOICE</div><div class="tagline">Fale. O mundo obedece.</div></div>
      <div class="menu">
        <button class="btn primary" data-a="play">▶ Jogar</button>
        <button class="btn" data-a="mp">🌐 Multiplayer</button>
        <button class="btn" data-a="char">🧍 Personagem</button>
        <button class="btn" data-a="profile">🏆 Perfil e conquistas</button>
        <button class="btn" data-a="settings">⚙️ Configurações</button>
        <button class="btn" data-a="credits">✨ Créditos</button>
        <button class="btn danger" data-a="quit">⏻ Sair</button>
      </div>
      <p class="muted" style="margin-top:16px">${esc(p.name)} · Nível ${p.level} · ${p.stats.discoveries.length} descobertas</p>
    </div>`);
    this.click(s, '[data-a=play]', () => this.soloSetup());
    this.click(s, '[data-a=mp]', () => this.multiplayer());
    this.click(s, '[data-a=char]', () => this.character(() => this.main()));
    this.click(s, '[data-a=profile]', () => this.profile(() => this.main()));
    this.click(s, '[data-a=settings]', () => this.settings(() => this.main()));
    this.click(s, '[data-a=credits]', () => this.credits());
    this.click(s, '[data-a=quit]', () => this.quit());
  }

  soloSetup() {
    const mode = this.app.settings.get('gameMode');
    const s = this.open(`<div class="card"><h2>Jogar</h2>
      <div class="field"><label>Modo</label>
        <div class="row">
          <button class="btn grow ${mode === 'adventure' ? 'primary' : ''}" data-m="adventure">⚔️ Aventura<br><small style="font-weight:400">ondas de monstros</small></button>
          <button class="btn grow ${mode === 'creative' ? 'primary' : ''}" data-m="creative">🎨 Criativo<br><small style="font-weight:400">sem inimigos</small></button>
        </div></div>
      <p class="muted">Dica: depois de entrar, ${ARTIFACT ? 'digite' : 'toque no microfone e fale'} <b>"espada de fogo"</b>, <b>"dragão"</b>, <b>"quero voar"</b> ou descreva algo: <b>"um animal enorme que voa"</b>.</p>
      <div class="row" style="margin-top:14px"><button class="btn grow" data-a="back">Voltar</button><button class="btn primary grow" data-a="go">Entrar no mundo</button></div></div>`);
    s.querySelectorAll('[data-m]').forEach((b) =>
      b.addEventListener('click', () => {
        this.app.settings.set('gameMode', b.dataset.m);
        this.soloSetup();
      }),
    );
    this.click(s, '[data-a=back]', () => this.main());
    this.click(s, '[data-a=go]', () => this.app.startSolo(this.app.settings.get('gameMode')));
  }

  // ------------------------------------------------------------------ multiplayer
  multiplayer(prefillCode = '') {
    if (ARTIFACT) {
      const s = this.open(`<div class="card"><h2>🌐 Multiplayer</h2>
        <p>O multiplayer precisa do servidor do jogo, que não roda nesta versão online.</p>
        <p class="muted">Para jogar com amigos, rode o projeto do repositório com <b>npm install</b>, <b>npm run build</b> e <b>npm start</b>, e compartilhe o código da sala. O modo solo daqui tem todo o resto do jogo.</p>
        <div class="row"><button class="btn grow" data-a="back">Voltar</button><button class="btn primary grow" data-a="solo">Jogar solo</button></div></div>`);
      this.click(s, '[data-a=back]', () => this.main());
      this.click(s, '[data-a=solo]', () => this.soloSetup());
      return;
    }
    const p = this.app.profile;
    const s = this.open(`<div class="card"><h2>🌐 Multiplayer</h2>
      <div class="field"><label>Seu nome</label><input class="input" data-f="name" maxlength="20" value="${esc(p.name)}"></div>
      <div class="field"><label>Entrar com código de convite</label>
        <div class="row"><input class="input code-input grow" data-f="code" maxlength="5" placeholder="ABCDE" value="${esc(prefillCode)}"><button class="btn primary" data-a="join">Entrar</button></div></div>
      <div class="field"><label>Ou crie uma sala</label>
        <div class="row"><select data-f="mode"><option value="adventure">Aventura (ondas de monstros)</option><option value="creative">Criativo (sem monstros)</option></select></div>
        <div class="setting"><span>Combate entre jogadores (PvP)</span><button class="toggle on" data-f="pvp"></button></div>
        <button class="btn primary" data-a="create" style="width:100%;margin-top:10px">Criar sala</button></div>
      <p class="muted status">O progresso no multiplayer é salvo no servidor. Cada jogador fala no próprio microfone e o servidor interpreta a fala de cada um.</p>
      <button class="btn" data-a="back" style="width:100%">Voltar</button></div>`);
    const pvp = s.querySelector('[data-f=pvp]');
    pvp.addEventListener('click', () => pvp.classList.toggle('on'));
    const status = s.querySelector('.status');
    const nameOk = () => {
      const n = s.querySelector('[data-f=name]').value.trim();
      if (n) this.app.setName(n);
      return true;
    };
    this.click(s, '[data-a=back]', () => this.main());
    this.click(s, '[data-a=join]', async () => {
      const code = s.querySelector('[data-f=code]').value.toUpperCase().trim();
      if (!/^[A-Z2-9]{5}$/.test(code)) {
        status.textContent = '⚠️ O código tem 5 letras/números (ex.: K7QPX).';
        this.app.audio.play('ui_error');
        return;
      }
      nameOk();
      status.textContent = 'Conectando…';
      const err = await this.app.startOnline({ join: code });
      if (err) status.textContent = `⚠️ ${err}`;
    });
    this.click(s, '[data-a=create]', async () => {
      nameOk();
      status.textContent = 'Criando sala…';
      const err = await this.app.startOnline({ create: { mode: s.querySelector('[data-f=mode]').value, pvp: pvp.classList.contains('on') } });
      if (err) status.textContent = `⚠️ ${err}`;
    });
  }

  // ------------------------------------------------------------------ personagem
  character(back) {
    const a = { ...this.app.profile.appearance };
    const palettes = {
      skin: ['#f5d0b5', '#e0ac69', '#c68642', '#8d5524', '#5c3a21', '#ffe0bd'],
      shirt: ['#3b82f6', '#ef4444', '#22c55e', '#a855f7', '#f59e0b', '#111827', '#f8fafc', '#ec4899'],
      pants: ['#1f2937', '#374151', '#1e3a8a', '#78350f', '#14532d', '#e5e7eb'],
      hair: ['#2b1b0e', '#000000', '#a16207', '#facc15', '#dc2626', '#e5e7eb', '#7c3aed', '#06b6d4'],
    };
    const sw = (k) => `<div class="field"><label>${{ skin: 'Pele', shirt: 'Camisa', pants: 'Calça', hair: 'Cabelo' }[k]}</label><div class="swatches">${palettes[k].map((c) => `<button class="swatch ${a[k] === c ? 'sel' : ''}" data-k="${k}" data-c="${c}" style="background:${c}" aria-label="${c}"></button>`).join('')}</div></div>`;
    const s = this.open(`<div class="card"><h2>🧍 Personagem</h2><canvas class="preview3d"></canvas>
      <div class="field"><label>Nome</label><input class="input" data-f="name" maxlength="20" value="${esc(this.app.profile.name)}"></div>
      ${sw('skin')}${sw('shirt')}${sw('pants')}${sw('hair')}
      <div class="row"><div class="field grow"><label>Cabelo</label><select data-f="hairStyle">${['short', 'long', 'spiky', 'bald'].map((v) => `<option value="${v}" ${a.hairStyle === v ? 'selected' : ''}>${{ short: 'Curto', long: 'Longo', spiky: 'Espetado', bald: 'Careca' }[v]}</option>`).join('')}</select></div>
      <div class="field grow"><label>Acessório</label><select data-f="accessory">${['none', 'hat', 'crown', 'headband'].map((v) => `<option value="${v}" ${a.accessory === v ? 'selected' : ''}>${{ none: 'Nenhum', hat: 'Chapéu', crown: 'Coroa', headband: 'Faixa' }[v]}</option>`).join('')}</select></div></div>
      <div class="row"><button class="btn grow" data-a="back">Cancelar</button><button class="btn primary grow" data-a="save">Salvar</button></div></div>`);
    const canvas = s.querySelector('canvas');
    const preview = this.makePreview(canvas, a);
    s.querySelectorAll('.swatch').forEach((b) =>
      b.addEventListener('click', () => {
        a[b.dataset.k] = b.dataset.c;
        s.querySelectorAll(`.swatch[data-k=${b.dataset.k}]`).forEach((x) => x.classList.toggle('sel', x === b));
        preview.rebuild(a);
      }),
    );
    s.querySelectorAll('select').forEach((sel) =>
      sel.addEventListener('change', () => {
        a[sel.dataset.f] = sel.value;
        preview.rebuild(a);
      }),
    );
    this.click(s, '[data-a=back]', back);
    this.click(s, '[data-a=save]', () => {
      this.app.setAppearance(a, s.querySelector('[data-f=name]').value.trim());
      back();
    });
  }

  makePreview(canvas, appearance) {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      return { rebuild() {} };
    }
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    cam.position.set(0, 1.3, 4.4);
    cam.lookAt(0, 0.95, 0);
    scene.add(new THREE.HemisphereLight(0xdde8ff, 0x332244, 1.6));
    const d = new THREE.DirectionalLight(0xffffff, 2.2);
    d.position.set(2, 4, 3);
    scene.add(d);
    let model = null;
    let t = 0;
    let raf;
    const rebuild = (a) => {
      if (model) {
        scene.remove(model.root);
        model.dispose();
      }
      model = createCharacterModel(a, { detail: 2, tier: 'high' });
      scene.add(model.root);
    };
    rebuild(appearance);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * renderer.getPixelRatio())) {
        renderer.setSize(w, h, false);
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
      }
      t += 1 / 60;
      model.root.rotation.y = Math.sin(t * 0.6) * 0.8;
      model.update(1 / 60, { anim: 'idle', speed: 0, attackT: -1, time: t });
      renderer.render(scene, cam);
    };
    loop();
    this.disposePreview = () => {
      cancelAnimationFrame(raf);
      model?.dispose();
      renderer.dispose();
    };
    return { rebuild };
  }

  // ------------------------------------------------------------------ perfil
  profile(back) {
    const p = this.app.profile;
    const st = p.stats;
    const next = xpForLevel(p.level + 1);
    const achs = Object.entries(ACHIEVEMENTS).map(([id, a]) => `<div class="ach ${p.achievements[id] ? 'got' : ''}"><b>${p.achievements[id] ? '🏆' : '🔒'} ${esc(a.label)}</b>${esc(a.description)}</div>`).join('');
    const hist = (p.history || []).slice(-8).reverse().map((h) => `<li>${new Date(h.date).toLocaleString('pt-BR')} — ${h.mode === 'solo' ? 'Solo' : `Sala ${esc(h.room)}`} · ${Math.round(h.duration / 60)} min · ${h.kills} derrotas · ${h.creations} criações · +${h.xp} XP${h.wave ? ` · onda ${h.wave}` : ''}</li>`).join('') || '<li>Nenhuma partida ainda.</li>';
    const s = this.open(`<div class="card" style="width:min(720px,100%)"><h2>🏆 ${esc(p.name)} — Nível ${p.level}</h2>
      <div class="bar xp" style="height:8px"><i style="transform:scaleX(${Math.min(1, (p.xp - xpForLevel(p.level)) / Math.max(1, next - xpForLevel(p.level)))})"></i></div>
      <p class="muted">${p.xp} XP · próximo nível em ${Math.max(0, next - p.xp)} XP</p>
      <div class="stat-grid">
        <div class="stat"><b>${st.words}</b><span>falas</span></div><div class="stat"><b>${st.creations}</b><span>criações</span></div>
        <div class="stat"><b>${st.discoveries.length}</b><span>descobertas</span></div><div class="stat"><b>${st.kills}</b><span>criaturas derrotadas</span></div>
        <div class="stat"><b>${st.bestWave}</b><span>melhor onda</span></div><div class="stat"><b>${st.pvpKOs}</b><span>nocautes PvP</span></div>
        <div class="stat"><b>${st.matches}</b><span>partidas</span></div><div class="stat"><b>${Math.round(st.playTime / 60)}</b><span>minutos jogados</span></div>
      </div>
      <h3>Conquistas (${Object.keys(p.achievements).length}/${Object.keys(ACHIEVEMENTS).length})</h3><div class="ach-grid">${achs}</div>
      <h3>Histórico</h3><ul class="muted" style="padding-left:18px">${hist}</ul>
      <p class="muted">Descobertas: ${st.discoveries.map((d) => esc(d.split(':')[1])).join(', ') || '—'}</p>
      <button class="btn" data-a="back" style="width:100%">Voltar</button></div>`);
    this.click(s, '[data-a=back]', back);
  }

  // ------------------------------------------------------------------ configurações
  settings(back, tab = 'graphics') {
    const st = this.app.settings;
    const tog = (k, label) => `<div class="setting"><span>${label}</span><button class="toggle ${st.get(k) ? 'on' : ''}" data-t="${k}"></button></div>`;
    const rng = (k, label, min, max, step) => `<div class="setting"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${st.get(k)}" data-r="${k}"></div>`;
    const sel = (k, label, opts) => `<div class="setting"><span>${label}</span><select data-s="${k}">${opts.map(([v, l]) => `<option value="${v}" ${String(st.get(k)) === String(v) ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
    const tabs = { graphics: 'Gráficos', audio: 'Áudio', voice: 'Voz', controls: 'Controles' };
    let body = '';
    if (tab === 'graphics') {
      const info = this.app.engine?.info();
      body = sel('quality', 'Qualidade', [['auto', 'Automática'], ...Object.entries(PRESETS).map(([k, v]) => [k, v.label])]) + tog('adaptive', 'Ajuste automático pelo FPS real') + tog('shadows', 'Sombras') + tog('showFps', 'Mostrar FPS') + sel('dayLength', 'Duração do dia', [[240, '4 min'], [480, '8 min'], [960, '16 min'], [0, 'Parado']]) + (info ? `<p class="muted">Agora: ${info.fps} FPS · perfil ${info.tier} · resolução ×${(info.scale || 1).toFixed(2)}</p>` : '');
    } else if (tab === 'audio') {
      body = rng('volMaster', 'Volume geral', 0, 1, 0.05) + rng('volSfx', 'Efeitos', 0, 1, 0.05) + rng('volAmbient', 'Ambiente', 0, 1, 0.05) + tog('music', 'Música de fundo') + rng('volMusic', 'Volume da música', 0, 1, 0.05);
    } else if (tab === 'voice' && ARTIFACT) {
      body = '<p class="muted">Nesta versão online o navegador não libera o microfone para a página, então os comandos são digitados. O interpretador é o mesmo do jogo completo: frases, sinônimos, português e inglês. Rodando o projeto localmente (npm start), a voz funciona.</p>';
    } else if (tab === 'voice') {
      body = sel('voiceLang', 'Idioma da fala', [['pt-BR', 'Português (Brasil)'], ['pt-PT', 'Português (Portugal)'], ['en-US', 'English (US)']]) + sel('voiceMode', 'Modo', [['continuous', 'Sempre ouvindo'], ['push', 'Aperte para falar (V)']]) + sel('recognizer', 'Reconhecedor', [['auto', 'Automático'], ['browser', 'Navegador'], ['server', 'Servidor (se configurado)']]) + rng('micSensitivity', 'Sensibilidade do microfone', 0, 1, 0.05) + tog('autoMic', 'Ligar microfone ao entrar') + `<div class="setting"><span>Teste do microfone</span><button class="btn small" data-a="mictest">Testar</button></div><div class="bar en"><i class="micmeter" style="transform:scaleX(0)"></i></div><p class="muted miclabel">A detecção de voz filtra ruídos e os sons do próprio jogo. Se não houver reconhecimento por voz no navegador, digite os comandos.</p>`;
    } else {
      body = rng('sensitivity', 'Sensibilidade da câmera', 0.3, 3, 0.1) + tog('invertY', 'Inverter eixo vertical') + `<p class="muted">Teclado: WASD mover · Espaço pular/subir · Ctrl/C descer (voo) · Clique atacar · Botão direito/Q defender · Shift esquivar · F especial · 1–5 armas · M microfone · V segurar para falar · T digitar · Tab jogadores · Esc menu.<br>Toque: joystick à esquerda, arraste a tela para olhar, botões à direita.</p>`;
    }
    const s = this.open(`<div class="card"><h2>⚙️ Configurações</h2><div class="tabs">${Object.entries(tabs).map(([k, l]) => `<button class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>${body}
      <div class="row" style="margin-top:16px"><button class="btn small danger" data-a="reset">Restaurar padrão</button><span class="grow"></span><button class="btn primary" data-a="back">Concluir</button></div></div>`, back === this.resumeBack ? 'dim' : 'backdrop');
    s.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => this.settings(back, b.dataset.tab)));
    s.querySelectorAll('[data-t]').forEach((b) =>
      b.addEventListener('click', () => {
        const v = !st.get(b.dataset.t);
        b.classList.toggle('on', v);
        this.app.applySetting(b.dataset.t, v);
      }),
    );
    s.querySelectorAll('[data-r]').forEach((r) => r.addEventListener('input', () => this.app.applySetting(r.dataset.r, Number(r.value))));
    s.querySelectorAll('[data-s]').forEach((r) => r.addEventListener('change', () => this.app.applySetting(r.dataset.s, ['dayLength'].includes(r.dataset.s) ? Number(r.value) : r.value)));
    this.click(s, '[data-a=reset]', () => {
      st.reset();
      this.app.applySetting('*');
      this.settings(back, tab);
    });
    this.click(s, '[data-a=back]', back);
    this.click(s, '[data-a=mictest]', async () => {
      const label = s.querySelector('.miclabel');
      const meter = s.querySelector('.micmeter');
      const ok = await this.app.voice.mic.start();
      if (!ok) {
        label.textContent = `Microfone indisponível (${this.app.voice.mic.state}). Verifique as permissões do navegador.`;
        return;
      }
      label.textContent = 'Fale algo: a barra mostra o nível e fica verde quando a voz é detectada.';
      const off = setInterval(() => {
        if (!document.body.contains(meter)) return clearInterval(off);
        meter.style.transform = `scaleX(${Math.min(1, this.app.voice.mic.level * 12)})`;
        meter.style.background = this.app.voice.mic.speaking ? '#4ade80' : '';
      }, 60);
    });
  }

  credits() {
    const s = this.open(`<div class="card"><h2>✨ Créditos</h2>
      <p><b>LA VOICE</b> — jogo de voz interativo em 3D.</p>
      <p class="muted">Tudo neste jogo é procedural: modelos 3D, texturas, animações, efeitos e sons são gerados por código em tempo real — nenhum arquivo de mídia de terceiros.</p>
      <p class="muted">Tecnologias: three.js (renderização WebGL), Web Speech API / serviço de transcrição opcional (reconhecimento), Web Audio API (som e detecção de voz), Node.js + WebSocket (multiplayer), Vite e Vitest.</p>
      <p class="muted">Interpretação de linguagem natural própria em português e inglês, com apoio opcional de um modelo de linguagem no servidor para frases difíceis.</p>
      <p class="muted">Desenvolvido com Claude Code.</p>
      <button class="btn" data-a="back" style="width:100%">Voltar</button></div>`);
    this.click(s, '[data-a=back]', () => this.main());
  }

  quit() {
    this.app.saveAll();
    const s = this.open(`<div class="card" style="text-align:center"><h2>Até a próxima! 👋</h2><p class="muted">Seu progresso foi salvo. Você já pode fechar esta aba.</p><button class="btn" data-a="back" style="width:100%">Voltar ao menu</button></div>`);
    this.click(s, '[data-a=back]', () => this.main());
    try {
      window.close();
    } catch {
      /* navegadores só fecham abas abertas por script */
    }
  }

  // ------------------------------------------------------------------ pausa / carregamento / erros
  pause() {
    const online = this.app.session?.kind === 'net';
    const s = this.open(`<div class="card" style="width:min(380px,100%)"><h2>${online ? `Sala ${esc(this.app.session.roomCode)}` : 'Pausa'}</h2>
      <div class="menu" style="width:100%">
        <button class="btn primary" data-a="resume">Continuar</button>
        ${online ? '<button class="btn" data-a="invite">📋 Copiar convite</button>' : ''}
        <button class="btn" data-a="settings">⚙️ Configurações</button>
        <button class="btn" data-a="char">🧍 Personagem</button>
        <button class="btn" data-a="profile">🏆 Perfil</button>
        <button class="btn danger" data-a="exit">Sair para o menu</button>
      </div>${online ? '' : '<p class="muted">O modo solo fica pausado enquanto este menu estiver aberto.</p>'}</div>`, 'dim');
    this.resumeBack = () => this.pause();
    this.click(s, '[data-a=resume]', () => this.app.resume());
    this.click(s, '[data-a=invite]', () => this.app.hud.copyCode());
    this.click(s, '[data-a=settings]', () => this.settings(this.resumeBack));
    this.click(s, '[data-a=char]', () => this.character(this.resumeBack));
    this.click(s, '[data-a=profile]', () => this.profile(this.resumeBack));
    this.click(s, '[data-a=exit]', () => this.app.exitToMenu());
  }

  loading(label = 'Carregando…') {
    if (!this.current?.classList.contains('loading')) {
      this.open(`<div style="text-align:center"><div class="logo" style="font-size:44px">LA VOICE</div><div class="loading-bar"><div></div></div><p class="muted lbl"></p></div>`);
      this.current.classList.add('loading');
    }
    this.setLoading(0, label);
  }

  setLoading(p, label) {
    if (!this.current) return;
    const bar = this.current.querySelector('.loading-bar > div');
    if (bar) bar.style.width = `${Math.round(p * 100)}%`;
    const l = this.current.querySelector('.lbl');
    if (l && label) l.textContent = label;
  }

  error(msg) {
    const s = this.open(`<div class="card"><h2>⚠️ Ops</h2><p>${esc(msg)}</p><button class="btn" data-a="back" style="width:100%">Voltar</button></div>`);
    this.click(s, '[data-a=back]', () => this.main());
  }
}
