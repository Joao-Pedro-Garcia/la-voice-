// Representações visuais das entidades da simulação (sincronizadas por snapshots/eventos).
import * as THREE from 'three';
import { createCharacterModel } from '../entities/character.js';
import { createCreatureModel } from '../entities/creatures/index.js';
import { createWeaponModel } from '../entities/weapons/index.js';
import { createObjectModel } from './objectModels.js';
import { elementInfo } from '../../shared/elements.js';
import { terrainHeight } from '../../shared/world.js';

const lerpAngle = (a, b, t) => {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};

const ATTACK_DUR = { slash: 0.38, heavy: 0.6, thrust: 0.35, punch: 0.25, shoot: 0.3, cast: 0.45 };

export class PlayerView {
  constructor(data, ctx, isMe) {
    this.id = data.id;
    this.ctx = ctx;
    this.isMe = isMe;
    this.data = data;
    this.model = createCharacterModel(data.appearance || {}, ctx.quality);
    this.root = new THREE.Group();
    this.root.add(this.model.root);
    ctx.scene.add(this.root);
    this.pos = new THREE.Vector3(data.x, data.y, data.z);
    this.target = this.pos.clone();
    this.ry = data.ry || 0;
    this.targetRy = this.ry;
    this.anim = 'idle';
    this.speed = 0;
    this.attack = null;
    this.scale = 1;
    this.targetScale = 1;
    this.opacity = 1;
    this.weapon = null;
    this.weaponUid = null;
    this.handles = {};
    this.time = 0;
    this.root.position.copy(this.pos);
    this.setWeapon(data.inventory?.[data.weaponIndex] || null, false);
  }

  setWeapon(spec, created) {
    if (spec && spec.uid === this.weaponUid) return;
    if (this.weapon) {
      this.weapon.root.removeFromParent();
      this.weapon.dispose();
      this.weapon = null;
    }
    this.weaponUid = spec?.uid || null;
    this.weaponSpec = spec;
    if (!spec) return;
    this.weapon = createWeaponModel({ kind: spec.kind, element: spec.element, size: spec.size, rarity: spec.rarity }, this.ctx.quality);
    // armas muito grandes ficam proporcionais à mão
    this.weapon.root.scale.multiplyScalar(Math.min(1, 1.7 / Math.max(1, this.weapon.length / Math.max(1, spec.size))));
    this.model.rightHand.add(this.weapon.root);
    if (created) this.weapon.playAppear();
  }

  applySnapshot(s) {
    // [id, x, y, z, ry, anim, hp, energy, blocking, dead, weaponIndex, size]
    this.target.set(s[1], s[2], s[3]);
    this.targetRy = s[4];
    this.netAnim = s[5];
    this.hp = s[6];
    this.energy = s[7];
    this.blocking = !!s[8];
    this.dead = !!s[9];
    this.targetScale = s[11] || 1;
  }

  playAttack(style) {
    this.attack = { style, t: 0, dur: ATTACK_DUR[style] || 0.4 };
    this.weapon?.playUse();
    if (this.weapon && (style === 'slash' || style === 'heavy')) {
      const col = elementInfo(this.weaponSpec?.element).glow;
      this.ctx.fx.slashTrail(this.weapon.tip, col, this.attack.dur);
    }
  }

  update(dt, local) {
    this.time += dt;
    if (local) {
      this.pos.set(local.pos.x, local.pos.y, local.pos.z);
      this.ry = local.ry;
      this.anim = local.anim;
      this.speed = local.speed;
    } else {
      const k = Math.min(1, dt * 12);
      if (this.pos.distanceTo(this.target) > 15) this.pos.copy(this.target);
      else this.pos.lerp(this.target, k);
      this.ry = lerpAngle(this.ry, this.targetRy, k);
      this.speed = this.speed * 0.8 + (this.lastPos ? this.pos.distanceTo(this.lastPos) / Math.max(dt, 1e-3) : 0) * 0.2;
      this.anim = this.netAnim || 'idle';
    }
    this.lastPos = this.lastPos || new THREE.Vector3();
    this.lastPos.copy(this.pos);
    this.scale += (this.targetScale - this.scale) * Math.min(1, dt * 6);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.ry;
    this.root.scale.setScalar(this.scale);
    let attackT = -1;
    let style = 'slash';
    if (this.attack) {
      this.attack.t += dt;
      attackT = this.attack.t / this.attack.dur;
      style = this.attack.style;
      if (attackT >= 1) {
        this.attack = null;
        attackT = -1;
      }
    }
    let anim = this.anim;
    if (this.dead) anim = 'ko';
    else if (attackT >= 0) anim = style === 'cast' ? 'cast' : 'attack';
    else if (this.blocking) anim = 'block';
    this.model.update(dt, { anim, speed: this.speed, attackT, attackStyle: style, castT: style === 'cast' ? attackT : -1, time: this.time });
    this.weapon?.update(dt, this.time);
    const targetOp = this.invisible ? (this.isMe ? 0.35 : 0.06) : 1;
    if (Math.abs(this.opacity - targetOp) > 0.01) {
      this.opacity += (targetOp - this.opacity) * Math.min(1, dt * 5);
      this.model.setOpacity(this.opacity);
      if (this.weapon) this.weapon.root.visible = this.opacity > 0.2;
    }
  }

  dispose() {
    for (const h of Object.values(this.handles)) h?.dispose?.();
    this.weapon?.dispose();
    this.model.dispose();
    this.root.removeFromParent();
  }
}

export class CreatureView {
  constructor(c, ctx) {
    this.id = c.id;
    this.ctx = ctx;
    this.data = c;
    this.spec = c.spec;
    this.model = createCreatureModel({ ...c.spec, height: c.spec.height }, ctx.quality);
    this.root = new THREE.Group();
    this.root.add(this.model.root);
    // anel de identificação: verde = seu aliado, azul = aliado de outro jogador, vermelho = selvagem
    const ringColor = c.wild ? 0xff4d4d : c.ownerId === ctx.meId ? 0x4dff88 : 0x4dabf7;
    const r = Math.max(0.5, c.spec.height * c.spec.size * 0.45);
    this.ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.85, r, 32), new THREE.MeshBasicMaterial({ color: ringColor, transparent: true, opacity: 0.55, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    ctx.scene.add(this.root, this.ring);
    this.pos = new THREE.Vector3(c.x, c.y, c.z);
    this.target = this.pos.clone();
    this.ry = c.ry;
    this.targetRy = c.ry;
    this.state = 'spawn';
    this.hp = c.hp;
    this.maxHp = c.maxHp;
    this.time = 0;
    this.spawnT = 0;
    this.attackT = -1;
    this.hitT = -1;
    this.dieT = -1;
    this.moveSpeed = 0;
    this.root.position.copy(this.pos);
  }

  applySnapshot(s) {
    // [id, x, y, z, ry, state, hp, attackAge, moveSpeed]
    this.target.set(s[1], s[2], s[3]);
    this.targetRy = s[4];
    if (this.state !== 'die') this.state = s[5];
    if (s[6] < this.hp) this.hitT = 0;
    this.hp = s[6];
    if (s[7] >= 0 && s[7] < 0.15 && this.attackT < 0) this.attackT = 0;
    this.moveSpeed = s[8];
  }

  die() {
    this.state = 'die';
    this.dieT = 0;
  }

  update(dt, camPos) {
    this.time += dt;
    const k = Math.min(1, dt * 10);
    if (this.pos.distanceTo(this.target) > 20) this.pos.copy(this.target);
    else this.pos.lerp(this.target, k);
    this.ry = lerpAngle(this.ry, this.targetRy, k);
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.ry;
    const gy = terrainHeight(this.pos.x, this.pos.z);
    this.ring.position.set(this.pos.x, Math.max(gy, -1.2) + 0.06, this.pos.z);
    this.ring.visible = this.dieT < 0;
    if (this.attackT >= 0) {
      this.attackT += dt / 0.6;
      if (this.attackT > 1) this.attackT = -1;
    }
    if (this.hitT >= 0) {
      this.hitT += dt / 0.3;
      if (this.hitT > 1) this.hitT = -1;
    }
    if (this.dieT >= 0) this.dieT = Math.min(1, this.dieT + dt / 1.2);
    this.spawnT += dt;
    let anim = this.state;
    if (this.spawnT < 0.8) anim = 'spawn';
    else if (this.dieT >= 0) anim = 'die';
    else if (this.spec.traits?.flying && (anim === 'walk' || anim === 'run' || anim === 'idle')) anim = anim === 'idle' ? 'idle' : 'fly';
    this.model.update(dt, { anim, speed: this.moveSpeed, attackT: this.attackT, hitT: this.hitT, dieT: this.dieT, time: this.time });
    // LOD por distância: longe esconde detalhes pequenos e sombras
    if (camPos) {
      const d = camPos.distanceTo(this.pos);
      const lvl = d < 30 ? 2 : d < 70 ? 1 : 0;
      if (lvl !== this.lod) {
        this.lod = lvl;
        this.model.setDetail(Math.min(lvl, this.ctx.quality.detail ?? 2));
      }
      this.root.visible = d < this.ctx.quality.drawDistance;
    }
  }

  dispose() {
    this.model.dispose();
    this.ring.geometry.dispose();
    this.ring.material.dispose();
    this.root.removeFromParent();
    this.ring.removeFromParent();
  }
}

export class ProjectileView {
  constructor(p, ctx) {
    this.ctx = ctx;
    this.vis = ctx.fx.createProjectile(p.kind, p.element);
    this.obj = this.vis.object;
    this.obj.scale.multiplyScalar(Math.min(2, p.size || 1));
    this.pos = new THREE.Vector3(p.x, p.y, p.z);
    this.vel = new THREE.Vector3(p.vx, p.vy, p.vz);
    this.obj.position.copy(this.pos);
    ctx.scene.add(this.obj);
    this.gravity = p.kind === 'arrow' ? 6 : p.kind === 'cannonball' ? 4 : 0;
  }

  applySnapshot(s) {
    // [id, x, y, z, vx, vy, vz]
    const srv = new THREE.Vector3(s[1], s[2], s[3]);
    if (srv.distanceTo(this.pos) > 3) this.pos.copy(srv);
    else this.pos.lerp(srv, 0.3);
    this.vel.set(s[4], s[5], s[6]);
  }

  update(dt) {
    this.vel.y -= this.gravity * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.obj.position.copy(this.pos);
    if (this.vel.lengthSq() > 0.01) this.obj.lookAt(this.pos.x + this.vel.x, this.pos.y + this.vel.y, this.pos.z + this.vel.z);
    this.vis.update(dt);
  }

  dispose() {
    this.obj.removeFromParent();
    this.vis.dispose();
  }
}

export class ObjectView {
  constructor(o, ctx) {
    this.ctx = ctx;
    this.data = o;
    this.time = 0;
    if (o.type === 'barrier') {
      const el = o.element || 'arcane';
      const dur = o.expireAt ? Math.max(1, o.expireAt - ctx.serverTime()) : 15;
      this.handle = ctx.fx.barrierWall(new THREE.Vector3(o.x, o.y, o.z), o.ry, (o.data?.width || 8), 4 * (o.size || 1), dur, el);
    } else if (o.type === 'clone') {
      this.clone = createCharacterModel(o.data?.appearance || {}, ctx.quality);
      this.clone.setOpacity(0.55);
      this.clone.root.position.set(o.x, o.y, o.z);
      this.clone.root.rotation.y = o.ry;
      ctx.scene.add(this.clone.root);
    } else {
      this.model = createObjectModel(o);
      if (this.model) {
        this.model.root.position.set(o.x, o.y, o.z);
        this.model.root.rotation.y = o.ry;
        ctx.scene.add(this.model.root);
      }
    }
  }

  update(dt) {
    this.time += dt;
    this.model?.update(dt);
    this.clone?.update(dt, { anim: 'idle', speed: 0, attackT: -1, time: this.time });
  }

  dispose() {
    this.handle?.dispose?.();
    if (this.model) {
      this.model.root.removeFromParent();
      this.model.dispose();
    }
    if (this.clone) {
      this.clone.root.removeFromParent();
      this.clone.dispose();
    }
  }
}

// Zonas de habilidades contínuas (gelo, tempestade, tornado, laser, distorção temporal)
export class ZoneView {
  constructor(z, ctx) {
    this.ctx = ctx;
    this.z = z;
    this.pos = new THREE.Vector3(z.x, terrainHeight(z.x, z.z), z.z);
    const dur = Math.max(0.3, z.until - ctx.serverTime());
    const fx = ctx.fx;
    const follow = () => {
      const pv = z.followId ? ctx.players.get(z.followId) : null;
      if (pv) this.pos.copy(pv.pos);
      return this.pos;
    };
    if (z.type === 'freeze') this.handle = fx.iceField(this.pos, z.radius, dur);
    else if (z.type === 'storm') this.handle = fx.storm(follow, z.radius, dur);
    else if (z.type === 'tornado') this.handle = fx.tornado(() => this.pos, dur, z.radius);
    else if (z.type === 'time_warp') this.handle = fx.timeWarp(this.pos, z.radius, dur);
    else if (z.type === 'laser') {
      const from = new THREE.Vector3();
      const to = new THREE.Vector3();
      const col = elementInfo(z.element).color;
      this.handle = fx.laserBeam(
        () => {
          const pv = ctx.players.get(z.followId);
          if (!pv) return from;
          from.set(pv.pos.x + Math.sin(pv.ry) * 0.6, pv.pos.y + 1.4 * pv.scale, pv.pos.z + Math.cos(pv.ry) * 0.6);
          return from;
        },
        () => {
          const pv = ctx.players.get(z.followId);
          if (!pv) return to;
          to.set(pv.pos.x + Math.sin(pv.ry) * z.radius, pv.pos.y + 1.4 * pv.scale, pv.pos.z + Math.cos(pv.ry) * z.radius);
          return to;
        },
        col,
        dur,
      );
    }
    this.vx = z.type === 'tornado' ? Math.sin(z.ry) * 4.5 : 0;
    this.vz = z.type === 'tornado' ? Math.cos(z.ry) * 4.5 : 0;
  }

  update(dt) {
    if (this.vx || this.vz) {
      this.pos.x += this.vx * dt;
      this.pos.z += this.vz * dt;
      this.pos.y = terrainHeight(this.pos.x, this.pos.z);
    }
  }

  dispose() {
    this.handle?.dispose?.();
  }
}
