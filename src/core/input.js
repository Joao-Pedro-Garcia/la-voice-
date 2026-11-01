// Entrada unificada: teclado + mouse (desktop) e joystick virtual + botões (toque).
export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.keys = new Set();
    this.move = { x: 0, y: 0 }; // x: direita, y: frente
    this.look = { dx: 0, dy: 0 };
    this.buttons = { attack: false, block: false, jump: false, descend: false, special: false };
    this.pressed = new Set(); // ações disparadas neste quadro
    this.enabled = false;
    // toque apenas quando o ponteiro principal é grosso (celular/tablet), não em notebooks com tela de toque
    this.touch = matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
    this.listeners = {};
    this.dragging = false;
    this.bind();
  }

  on(ev, fn) {
    (this.listeners[ev] ||= []).push(fn);
  }
  emit(ev, d) {
    for (const fn of this.listeners[ev] || []) fn(d);
  }

  typing() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (this.typing()) return;
      if (!this.enabled && e.code !== 'Escape') return;
      if (e.repeat) {
        if (['Space', 'ShiftLeft'].includes(e.code)) e.preventDefault();
        return;
      }
      this.keys.add(e.code);
      const map = { Space: 'jump', KeyF: 'special', ShiftLeft: 'dodge', ShiftRight: 'dodge', KeyV: 'pushtalk', KeyT: 'type', Enter: 'type', KeyM: 'mic', Tab: 'players', Escape: 'menu', KeyI: 'inventory', KeyE: 'interact' };
      const act = map[e.code];
      if (act) {
        if (['Tab', 'Space'].includes(e.code)) e.preventDefault();
        this.pressed.add(act);
        this.emit(act, true);
      }
      if (/^Digit[1-5]$/.test(e.code)) this.emit('slot', Number(e.code.slice(5)) - 1);
      if (e.code === 'KeyQ') this.buttons.block = true;
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyV') this.emit('pushtalk', false);
      if (e.code === 'Tab') this.emit('players', false);
      if (e.code === 'KeyQ') this.buttons.block = false;
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.buttons.attack = this.buttons.block = false;
    });

    // Mouse: botão esquerdo ataca, direito defende, arrastar/pointer-lock gira a câmera
    const c = this.canvas;
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('mousedown', (e) => {
      if (!this.enabled || this.touch) return;
      if (e.button === 0) {
        if (document.pointerLockElement !== c && this.settings.get('pointerLock') !== false) c.requestPointerLock?.()?.catch?.(() => {});
        this.buttons.attack = true;
        this.pressed.add('attack');
      }
      if (e.button === 2) this.buttons.block = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.buttons.attack = false;
      if (e.button === 2) this.buttons.block = false;
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled || this.touch) return;
      if (document.pointerLockElement === c || (e.buttons & 4)) {
        this.look.dx += e.movementX;
        this.look.dy += e.movementY;
      }
    });
    c.addEventListener('wheel', (e) => this.enabled && this.emit('zoom', Math.sign(e.deltaY)), { passive: true });

    // Toque: metade direita da tela gira a câmera
    this.lookTouch = null;
    c.addEventListener('touchstart', (e) => {
      if (!this.enabled) return;
      for (const t of e.changedTouches) {
        if (t.clientX > window.innerWidth * 0.4 && !this.lookTouch) this.lookTouch = { id: t.identifier, x: t.clientX, y: t.clientY };
      }
    }, { passive: true });
    c.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (this.lookTouch && t.identifier === this.lookTouch.id) {
          this.look.dx += (t.clientX - this.lookTouch.x) * 1.6;
          this.look.dy += (t.clientY - this.lookTouch.y) * 1.6;
          this.lookTouch.x = t.clientX;
          this.lookTouch.y = t.clientY;
        }
      }
    }, { passive: true });
    const endTouch = (e) => {
      for (const t of e.changedTouches) if (this.lookTouch && t.identifier === this.lookTouch.id) this.lookTouch = null;
    };
    c.addEventListener('touchend', endTouch, { passive: true });
    c.addEventListener('touchcancel', endTouch, { passive: true });
  }

  // Joystick virtual (criado pela HUD)
  setJoystick(x, y) {
    this.joy = { x, y };
  }

  update() {
    let x = 0;
    let y = 0;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    if (this.joy) {
      x += this.joy.x;
      y += this.joy.y;
    }
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    this.move.x = x;
    this.move.y = y;
    this.buttons.jump = this.keys.has('Space') || !!this.touchJump;
    this.buttons.descend = this.keys.has('ControlLeft') || this.keys.has('KeyC') || !!this.touchDescend;
    this.walk = this.keys.has('AltLeft');
  }

  consumeLook() {
    const s = this.settings.get('sensitivity') || 1;
    const d = { dx: this.look.dx * 0.0025 * s, dy: this.look.dy * 0.0025 * s * (this.settings.get('invertY') ? -1 : 1) };
    this.look.dx = 0;
    this.look.dy = 0;
    return d;
  }

  consumePressed() {
    const p = new Set(this.pressed);
    this.pressed.clear();
    return p;
  }

  trigger(action) {
    this.pressed.add(action);
    this.emit(action, true);
  }
}
