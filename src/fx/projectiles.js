// Projéteis visuais. Frente = +Z local (use object.lookAt(alvo) para orientar).
import * as THREE from 'three';
import { elementPalette, disposeObject } from './util.js';
import { SHAPE } from './particles.js';
import { GEO, fresnelMaterial, blastMaterial, sharedGeo } from './common.js';
import { glowTexture } from './textures.js';
import { BeamRibbon, makeBeamMaterial, jaggedPath } from './ribbon.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function glowSprite(color, size, opacity = 1) {
  const m = new THREE.SpriteMaterial({ map: glowTexture(), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity });
  const s = new THREE.Sprite(m);
  s.scale.setScalar(size);
  return s;
}

export function createProjectile(ctx, kind = 'orb', element) {
  const pal = elementPalette(element);
  const col = pal.color, glow = pal.glow;
  const object = new THREE.Group();
  object.name = `projectile:${kind}`;
  const anim = [];
  const extras = []; // recursos fora do grafo (ribbons)
  let trail = { rate: 60, size: 0.22, life: 0.35, colors: pal.particle, shape: SHAPE.DOT, smoke: 0 };

  if (kind === 'arrow') {
    const wood = new THREE.MeshStandardMaterial({ color: 0x7a5432, roughness: 0.7 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xd0d6dc, metalness: 0.85, roughness: 0.3, emissive: element ? col : 0x000000, emissiveIntensity: element ? 0.8 : 0 });
    const shaft = new THREE.Mesh(sharedGeo('arrowShaft', () => new THREE.CylinderGeometry(0.012, 0.012, 0.75, 6).rotateX(Math.PI / 2)), wood);
    object.add(shaft);
    const head = new THREE.Mesh(sharedGeo('arrowHead', () => new THREE.ConeGeometry(0.035, 0.12, 4).rotateX(Math.PI / 2).translate(0, 0, 0.43)), metal);
    object.add(head);
    const featherMat = new THREE.MeshStandardMaterial({ color: element ? col : 0xe8e2d0, side: THREE.DoubleSide, roughness: 0.8, emissive: element ? col : 0, emissiveIntensity: element ? 0.3 : 0 });
    const fshape = new THREE.Shape();
    fshape.moveTo(0, 0); fshape.quadraticCurveTo(0.05, 0.02, 0.13, 0.0); fshape.lineTo(0.16, 0.045); fshape.quadraticCurveTo(0.06, 0.06, 0, 0.012);
    const fgeo = sharedGeo('fletch', () => new THREE.ShapeGeometry(fshape).rotateY(-Math.PI / 2).translate(0, 0.005, -0.37));
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(fgeo, featherMat);
      f.rotation.z = (i / 3) * Math.PI * 2;
      object.add(f);
    }
    if (element) { const gs = glowSprite(glow, 0.5); gs.position.set(0, 0, 0.42); object.add(gs); }
    trail = { rate: element ? 50 : 20, size: element ? 0.14 : 0.06, life: 0.3, colors: element ? pal.particle : [0xffffff], shape: SHAPE.DOT, smoke: 0, alpha: element ? 1 : 0.35 };
  } else if (kind === 'orb' || kind === 'bolt') {
    const core = new THREE.Mesh(GEO.sphereLow(), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    const shellMat = fresnelMaterial({ color: col, core: glow, power: 1.4, fill: 0.35 });
    const shell = new THREE.Mesh(GEO.sphere(), shellMat);
    if (kind === 'orb') {
      core.scale.setScalar(0.12); shell.scale.setScalar(0.24);
      object.add(core, shell, glowSprite(col, 1.2, 0.9));
      // faíscas orbitando
      const orbs = [0, 1, 2].map((i) => { const s = glowSprite(glow, 0.18); object.add(s); return s; });
      anim.push((t) => {
        orbs.forEach((s, i) => { const a = t * 7 + i * 2.1; s.position.set(Math.cos(a) * 0.3, Math.sin(a * 1.3) * 0.15, Math.sin(a) * 0.3); });
        shell.scale.setScalar(0.24 * (1 + 0.08 * Math.sin(t * 20)));
      });
      trail = { rate: 70, size: 0.22, life: 0.4, colors: pal.particle, shape: SHAPE.DOT };
    } else {
      core.scale.set(0.05, 0.05, 0.35); shell.scale.set(0.1, 0.1, 0.55);
      object.add(core, shell, glowSprite(col, 0.9, 0.9));
      if (element === 'lightning' || !element) {
        const rib = new BeamRibbon(10, makeBeamMaterial({ color: col, core: 0.8, opacity: 0.9 }));
        rib.mesh.frustumCulled = false;
        object.add(rib.mesh);
        extras.push(rib);
        let acc = 0;
        anim.push((t, dt) => {
          acc += dt;
          if (acc > 0.05) { acc = 0; rib.setPoints(jaggedPath(V(0, 0, -0.5), V(0, 0, 0.4), Math.random, { segments: 8, jitter: 0.25 }), 0.05); }
        });
      }
      trail = { rate: 90, size: 0.15, life: 0.25, colors: [0xffffff, ...pal.particle], shape: SHAPE.SPARK };
    }
  } else if (kind === 'cannonball') {
    const iron = new THREE.MeshStandardMaterial({ color: 0x2c2f36, metalness: 0.8, roughness: 0.4 });
    const ball = new THREE.Mesh(GEO.sphere(), iron);
    ball.scale.setScalar(0.28);
    object.add(ball);
    const bandMat = new THREE.MeshBasicMaterial({ color: col });
    const band = new THREE.Mesh(sharedGeo('cbBand', () => new THREE.TorusGeometry(0.285, 0.022, 6, 32)), bandMat);
    const band2 = band.clone(); band2.rotation.y = Math.PI / 2;
    object.add(band, band2, glowSprite(col, 1.3, 0.8));
    anim.push((t) => { ball.rotation.x = t * 6; band.rotation.x = t * 6; band2.rotation.z = t * 6; });
    trail = { rate: 50, size: 0.3, life: 0.45, colors: pal.particle, shape: SHAPE.DOT, smoke: 0.5 };
  } else if (kind === 'fireball') {
    const m = blastMaterial(pal);
    m.uniforms.uDisp.value = 0.7;
    const shell = new THREE.Mesh(GEO.sphere(), m);
    shell.scale.set(0.38, 0.38, 0.5);
    const core = new THREE.Mesh(GEO.sphereLow(), new THREE.MeshBasicMaterial({ color: pal.particle[0] }));
    core.scale.setScalar(0.2);
    object.add(core, shell, glowSprite(col, 2.2, 0.9));
    anim.push((t, dt) => { m.uniforms.uTime.value += dt * 4; shell.rotation.z += dt * 5; });
    trail = { rate: 110, size: 0.5, life: 0.45, colors: pal.particle, shape: SHAPE.DOT, smoke: 0.35 };
  } else if (kind === 'web') {
    const pts = [];
    const R = 0.6, spokes = 10;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * Math.PI * 2;
      pts.push(0, 0, 0, Math.cos(a) * R, Math.sin(a) * R, 0);
    }
    for (let ring = 1; ring <= 5; ring++) {
      const r = (ring / 5) * R;
      for (let i = 0; i < spokes; i++) {
        const a0 = (i / spokes) * Math.PI * 2, a1 = ((i + 1) / spokes) * Math.PI * 2;
        const sag = 0.82;
        const am = (a0 + a1) / 2;
        pts.push(Math.cos(a0) * r, Math.sin(a0) * r, 0, Math.cos(am) * r * sag, Math.sin(am) * r * sag, 0);
        pts.push(Math.cos(am) * r * sag, Math.sin(am) * r * sag, 0, Math.cos(a1) * r, Math.sin(a1) * r, 0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const lm = new THREE.LineBasicMaterial({ color: element ? glow : 0xf4f4ff, transparent: true, opacity: 0.95 });
    const web = new THREE.LineSegments(g, lm);
    object.add(web, glowSprite(element ? col : 0xdfe8ff, 1.4, 0.35));
    anim.push((t) => { web.rotation.z = t * 3; const s = 1 + 0.05 * Math.sin(t * 12); web.scale.set(s, s, 1); });
    trail = { rate: 25, size: 0.1, life: 0.3, colors: [0xffffff], shape: SHAPE.SPARK, alpha: 0.6 };
  } else if (kind === 'breath') {
    object.add(glowSprite(col, 1.2, 0.9));
    trail = { rate: 160, size: 0.6, life: 0.55, colors: pal.particle, shape: SHAPE.DOT, smoke: element === 'fire' ? 0.25 : 0, breath: true };
  } else if (kind === 'bomb') {
    const body = new THREE.MeshStandardMaterial({ color: 0x2a2140, metalness: 0.4, roughness: 0.35, emissive: col, emissiveIntensity: 0.12 });
    const ball = new THREE.Mesh(GEO.sphere(), body);
    ball.scale.setScalar(0.25);
    object.add(ball);
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: 1, roughness: 0.3 });
    const cap = new THREE.Mesh(sharedGeo('bombCap', () => new THREE.CylinderGeometry(0.07, 0.09, 0.08, 14)), gold);
    cap.position.y = 0.25;
    const ring = new THREE.Mesh(sharedGeo('bombRing', () => new THREE.TorusGeometry(0.255, 0.018, 8, 40)), gold);
    ring.rotation.x = Math.PI / 2;
    const fuseCurve = new THREE.CatmullRomCurve3([V(0, 0.28, 0), V(0.02, 0.36, 0), V(0.07, 0.41, 0), V(0.12, 0.42, 0)]);
    const fuse = new THREE.Mesh(new THREE.TubeGeometry(fuseCurve, 10, 0.012, 5), new THREE.MeshStandardMaterial({ color: 0xcdb48a, roughness: 0.9 }));
    const spark = glowSprite(0xffe066, 0.35);
    spark.position.set(0.12, 0.42, 0);
    // estrelas decorativas (bomba de confete mágico)
    const starMat = new THREE.MeshBasicMaterial({ color: col });
    const sshape = new THREE.Shape();
    for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.025 : 0.06; const x = Math.cos(a) * r, y = Math.sin(a) * r; if (i) sshape.lineTo(x, y); else sshape.moveTo(x, y); }
    const sg = sharedGeo('bombStar', () => new THREE.ShapeGeometry(sshape));
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(sg, starMat); const a = (i / 4) * Math.PI * 2; s.position.set(Math.sin(a) * 0.252, 0.05, Math.cos(a) * 0.252); s.lookAt(s.position.clone().multiplyScalar(2)); object.add(s); }
    object.add(cap, ring, fuse, spark);
    anim.push((t, dt) => {
      spark.scale.setScalar(0.25 + Math.random() * 0.25);
      ball.rotation.y += dt;
      if (Math.random() < 0.6) {
        spark.updateWorldMatrix(true, false);
        const p = spark.getWorldPosition(V());
        ctx.glow.emit({ pos: p, vel: V((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), gravity: -5, life: 0.3, color: 0xfff27a, color1: 0xff7a1a, size: 0.06, size1: 0, shape: SHAPE.SPARK });
      }
    });
    trail = { rate: 15, size: 0.12, life: 0.3, colors: pal.particle, shape: SHAPE.SPARK, alpha: 0.7 };
  } else {
    return createProjectile(ctx, 'orb', element);
  }

  let t = 0, acc = 0, has = false;
  const p = V(), last = V(), vel = V(), fwd = V();
  return {
    object,
    update(dt) {
      t += dt;
      for (const f of anim) f(t, dt);
      if (!object.parent) return;
      object.updateWorldMatrix(true, false);
      object.getWorldPosition(p);
      if (has && dt > 0) vel.subVectors(p, last).divideScalar(dt); else vel.set(0, 0, 0);
      const step = 1 / Math.max(1, trail.rate);
      acc += dt;
      let n = 0;
      if (trail.breath) {
        fwd.set(0, 0, 1).transformDirection(object.matrixWorld);
        while (acc > step && n < 12) {
          acc -= step; n++;
          const sp = 9 + Math.random() * 4;
          const sideX = (Math.random() - 0.5) * 2.2, sideY = (Math.random() - 0.5) * 2.2, sideZ = (Math.random() - 0.5) * 2.2;
          ctx.glow.emit({ pos: p, vel: V(fwd.x * sp + sideX, fwd.y * sp + sideY, fwd.z * sp + sideZ), drag: 1.2, gravity: element === 'fire' ? 1.5 : 0, life: trail.life * (0.8 + Math.random() * 0.5), color: trail.colors[(Math.random() * 3) | 0], color1: trail.colors[2], size: 0.15, size1: trail.size * 2.2 });
          if (trail.smoke && Math.random() < trail.smoke) ctx.solid.emit({ pos: p, vel: V(fwd.x * sp * 0.7, fwd.y * sp * 0.7 + 1, fwd.z * sp * 0.7), drag: 1.4, life: 1.0, color: 0x3a3330, size: 0.4, size1: 1.6, shape: SHAPE.SMOKE, alpha: 0.4, rot: Math.random() * 6, spin: 1 });
        }
      } else if (has) {
        while (acc > step && n < 10) {
          acc -= step; n++;
          const f = Math.random();
          const q = V().lerpVectors(last, p, f);
          const c = trail.colors[(Math.random() * trail.colors.length) | 0];
          ctx.glow.emit({ pos: q, vel: V((Math.random() - 0.5) * 0.6 - vel.x * 0.05, (Math.random() - 0.5) * 0.6 - vel.y * 0.05, (Math.random() - 0.5) * 0.6 - vel.z * 0.05), drag: 2, life: trail.life * (0.7 + Math.random() * 0.6), color: c, color1: trail.colors[trail.colors.length - 1], size: trail.size, size1: trail.size * 0.15, shape: trail.shape, alpha: trail.alpha ?? 1 });
          if (trail.smoke && Math.random() < trail.smoke) ctx.solid.emit({ pos: q, vel: V(0, 0.6, 0), drag: 1, life: 1.1, color: 0x3a3634, color1: 0x6a6460, size: trail.size * 1.2, size1: trail.size * 4, shape: SHAPE.SMOKE, alpha: 0.45, rot: Math.random() * 6, spin: 1 });
        }
      }
      if (n === 0 && acc > 0.5) acc = 0;
      last.copy(p); has = true;
    },
    dispose() {
      object.removeFromParent();
      for (const e of extras) { e.dispose(); e.material.dispose(); }
      disposeObject(object);
    },
  };
}
