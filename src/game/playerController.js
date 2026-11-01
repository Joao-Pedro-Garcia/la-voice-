// Movimento do jogador local com predição no cliente (o servidor valida).
// Caminhar/correr, pulo, voo, nado, esquiva, empurrões, colisões com construções e objetos.
import { terrainHeight, WATER_LEVEL, clampToPlayable, resolveStructureCollision } from '../../shared/world.js';

const GRAVITY = 28;
const WALK = 4.2;
const RUN = 7.5 * 1.3;

export class PlayerController {
  constructor() {
    this.pos = { x: 0, y: 0, z: 0 };
    this.vel = { x: 0, y: 0, z: 0 };
    this.ry = Math.PI;
    this.onGround = true;
    this.anim = 'idle';
    this.speed = 0;
    this.dodgeT = 0;
    this.dodgeDir = 0;
    this.kb = { x: 0, z: 0 };
    this.swimming = false;
    this.events = [];
  }

  teleport(x, y, z) {
    this.pos.x = x;
    this.pos.y = y;
    this.pos.z = z;
    this.vel.x = this.vel.y = this.vel.z = 0;
  }

  knockback(vx, vy, vz) {
    this.kb.x += vx;
    this.kb.z += vz;
    this.vel.y = Math.max(this.vel.y, vy);
    this.onGround = false;
  }

  launch(vy) {
    this.vel.y = vy;
    this.onGround = false;
  }

  dodge(dir) {
    this.dodgeT = 0.45;
    this.dodgeDir = dir;
  }

  // buffs: { fly, speed, jump, grow, shrink, slow, stun }
  update(dt, input, camYaw, buffs, objects = []) {
    const p = this.pos;
    this.events.length = 0;
    const stunned = buffs.stun;
    const mx = stunned ? 0 : input.move.x;
    const my = stunned ? 0 : input.move.y;
    // direção relativa à câmera
    // frente da câmera = (sin, cos); direita = (-cos, sin)
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    const dx = my * sin - mx * cos;
    const dz = my * cos + mx * sin;
    const moving = Math.hypot(dx, dz) > 0.05;
    let speed = input.walk ? WALK : RUN;
    if (buffs.speed) speed *= buffs.speed;
    if (buffs.grow) speed *= 1.2;
    if (buffs.shrink) speed *= 1.35;
    if (buffs.slow) speed *= 1 - buffs.slow;
    if (buffs.fly) speed *= 1.5;
    const ground = terrainHeight(p.x, p.z);
    this.swimming = !buffs.fly && ground < WATER_LEVEL - 1.1 && p.y < WATER_LEVEL - 0.4;
    if (this.swimming) speed *= 0.55;

    let vx = dx * speed;
    let vz = dz * speed;
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      vx = Math.sin(this.dodgeDir) * 14;
      vz = Math.cos(this.dodgeDir) * 14;
    }
    vx += this.kb.x;
    vz += this.kb.z;
    this.kb.x *= Math.max(0, 1 - dt * 6);
    this.kb.z *= Math.max(0, 1 - dt * 6);

    // rotação: personagem vira na direção do movimento (ou para onde a câmera mira ao atacar)
    if (moving && this.dodgeT <= 0) {
      const target = Math.atan2(dx, dz);
      let d = target - this.ry;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      this.ry += d * Math.min(1, dt * 12);
    }

    // vertical
    if (buffs.fly) {
      const up = (input.buttons.jump ? 1 : 0) - (input.buttons.descend ? 1 : 0);
      this.vel.y += (up * 12 - this.vel.y) * Math.min(1, dt * 5);
      this.onGround = false;
    } else if (this.swimming) {
      const surface = WATER_LEVEL - 0.6;
      this.vel.y += ((surface - p.y) * 4 - this.vel.y) * Math.min(1, dt * 3);
      if (input.buttons.jump && p.y > surface - 0.3) this.vel.y = 7;
    } else {
      if (this.onGround && input.buttons.jump && !stunned) {
        this.vel.y = 9.5 * (buffs.jump || 1) ** 0.5 * (buffs.grow ? 1.3 : 1);
        this.onGround = false;
        this.events.push('jump');
      }
      this.vel.y -= GRAVITY * dt;
    }

    const next = { x: p.x + vx * dt, z: p.z + vz * dt };
    resolveStructureCollision(next, 0.45 * (buffs.grow || buffs.shrink || 1));
    for (const o of objects) {
      if (!o.solid) continue;
      const r = (o.type === 'house' ? 4 : o.type === 'tree' ? 0.6 : o.type === 'barrier' ? 0 : 1.0) * (o.size || 1) + 0.45;
      if (o.type === 'barrier') continue;
      const ox = next.x - o.x;
      const oz = next.z - o.z;
      const d = Math.hypot(ox, oz);
      if (d < r && d > 1e-4) {
        next.x = o.x + (ox / d) * r;
        next.z = o.z + (oz / d) * r;
      }
    }
    clampToPlayable(next);
    p.x = next.x;
    p.z = next.z;
    p.y += this.vel.y * dt;
    const g2 = terrainHeight(p.x, p.z);
    if (p.y <= g2) {
      if (!this.onGround && this.vel.y < -12) this.events.push('land');
      p.y = g2;
      this.vel.y = 0;
      this.onGround = true;
    } else if (p.y > g2 + 0.15) this.onGround = false;
    if (buffs.fly && p.y > g2 + 70) p.y = g2 + 70;

    this.speed = Math.hypot(vx, vz);
    if (stunned) this.anim = 'hit';
    else if (this.dodgeT > 0) this.anim = 'dodge';
    else if (buffs.fly && !this.onGround) this.anim = 'fly';
    else if (!this.onGround && !this.swimming) this.anim = this.vel.y > 0 ? 'jump' : 'fall';
    else if (this.speed > 5.5) this.anim = 'run';
    else if (this.speed > 0.3) this.anim = 'walk';
    else this.anim = 'idle';
    return this;
  }
}
