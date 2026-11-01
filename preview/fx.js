import * as THREE from 'three';
import { createFX } from '../src/fx/index.js';
import { createWeaponModel } from '../src/entities/weapons/index.js';
import { makeQuality } from '../src/core/quality.js';

const q = new URLSearchParams(location.search);
const quality = makeQuality(q.get('tier') || 'high');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2a3242);
scene.fog = new THREE.Fog(0x2a3242, 40, 120);
scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x3a3020, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 1.8); sun.position.set(10, 20, 8); sun.castShadow = true; scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(80, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4d5a3c, roughness: 1 }));
ground.receiveShadow = true; scene.add(ground);
const grid = new THREE.GridHelper(60, 30, 0x55603f, 0x55603f); grid.position.y = 0.01; grid.material.opacity = 0.25; grid.material.transparent = true; scene.add(grid);

// boneco
const dummy = new THREE.Group();
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 0.9, 6, 12), new THREE.MeshStandardMaterial({ color: 0x5577cc, roughness: 0.6 }));
body.position.y = 0.75; body.castShadow = true; dummy.add(body);
const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf0c8a0 }));
head.position.y = 1.55; dummy.add(head);
scene.add(dummy);
const hand = new THREE.Group(); hand.position.set(0.45, 1.0, 0.1); dummy.add(hand);
const sword = createWeaponModel({ kind: 'sword', element: 'fire', size: 1, rarity: 'epico' }, quality);
hand.add(sword.root);

const fx = createFX(scene, quality);
let shake = 0;
fx.onShake((i) => { shake = Math.max(shake, i); });

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 300);
const camBase = new THREE.Vector3(7, 4.5, 10);
camera.position.copy(camBase);
const look = new THREE.Vector3(0, 1.2, 0);

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const projectiles = [];
function shoot(kind, element, from, to, speed = 12) {
  const p = fx.createProjectile(kind, element);
  p.object.position.copy(from); p.object.lookAt(to);
  scene.add(p.object);
  projectiles.push({ p, from: from.clone(), to: to.clone(), t: 0, dur: from.distanceTo(to) / speed, element });
}

let swingT = -1;
const later = [];
const EFFECTS = {
  burst: () => fx.burst(V(0, 1.5, 0), { colors: [0xffe066, 0xff8c1a, 0xffffff], count: 80, speed: 6, size: 0.25, life: 1.2, gravity: -4 }),
  appear: () => fx.appear(V(2, 0, 0), 'arcane'),
  explosion: () => fx.explosion(V(3, 0, -1), 'fire', 3),
  explosionIce: () => fx.explosion(V(3, 0, -1), 'ice', 3),
  shockwave: () => fx.shockwave(V(0, 0, 0), 8, 'arcane'),
  impact: () => { fx.impact(V(1.5, 1.2, 0.5), 'fire'); fx.impact(V(2.5, 1.0, -0.5), 'lightning'); fx.impact(V(0.5, 1.4, 1.5), 'earth'); },
  lightningBolt: () => { fx.lightningBolt(V(-4, 14, -4), V(3, 0, 0), 0x9fc4ff, 0.6); },
  laserBeam: () => fx.laserBeam(() => hand.getWorldPosition(V()), () => V(4, 1, -8), 0xffe9a3, 2.2),
  shieldBubble: () => { const s = fx.shieldBubble(dummy, 1.3, 0x7fd8ff); later.push({ at: t + 3, fn: () => s.dispose() }); },
  aura: () => fx.aura(dummy, 'fire', 3),
  healAura: () => fx.healAura(dummy),
  speedTrail: () => { fx.speedTrail(dummy, 2.5); dummy.userData.run = 2.5; },
  iceField: () => fx.iceField(V(0, 0, 0), 8, 4),
  barrierWall: () => fx.barrierWall(V(0, 0, 3), 0, 6, 3, 4, 'arcane'),
  tornado: () => { let t = 0; fx.tornado((out) => { t += 0.016; return out.set(3 + Math.sin(t) * 2, 0, -2); }, 4, 3); },
  storm: () => fx.storm(V(0, 0, 0), 12, 5),
  meteor: () => { for (let i = 0; i < 3; i++) fx.meteor(V(-3 + i * 3, 0, -3 + (i % 2) * 2), i * 0.5, () => {}); },
  earthquake: () => fx.earthquake(V(0, 0, 0), 10),
  timeWarp: () => fx.timeWarp(V(0, 0, 0), 9, 4),
  teleport: () => { fx.teleport(V(0, 0, 0), V(5, 0, -2)); },
  confetti: () => fx.confetti(V(0, 0.5, 2)),
  slashTrail: () => { swingT = 0; fx.slashTrail(sword.tip, 0xffa040, 0.45); sword.playUse(); },
  projectiles: () => {
    const kinds = ['arrow', 'orb', 'bolt', 'cannonball', 'fireball', 'web', 'breath', 'bomb'];
    const els = [null, 'arcane', 'lightning', 'fire', 'fire', null, 'fire', 'arcane'];
    kinds.forEach((k, i) => shoot(k, els[i], V(-6, 1 + i * 0.5, 4 - i), V(8, 1 + i * 0.5, -4 - i), 6));
  },
};
const ORDER = Object.keys(EFFECTS);
window.FX_NAMES = ORDER;
window.runFx = (name) => { document.getElementById('info').textContent = name; EFFECTS[name](); };
window.fxActive = () => fx.activeCount;

const timer = new THREE.Timer();
let t = 0, seqT = 0, seqI = 0;
const auto = q.get('auto') !== '0';
const manual = q.get('manual') === '1';
// modo manual: o teste avança a simulação em passos fixos (determinístico)
window.advance = (sec) => { const n = Math.round(sec * 60); for (let i = 0; i < n; i++) step(1 / 60, i === n - 1); };
function frame() {
  timer.update();
  if (!manual) step(Math.min(timer.getDelta(), 0.05), true);
  requestAnimationFrame(frame);
}
function step(dt, render) {
  t += dt;
  if (auto) { seqT -= dt; if (seqT <= 0) { window.runFx(ORDER[seqI % ORDER.length]); seqI++; seqT = 3; } }
  for (let i = later.length - 1; i >= 0; i--) if (t >= later[i].at) { later[i].fn(); later.splice(i, 1); }
  if (dummy.userData.run > 0) { dummy.userData.run -= dt; dummy.position.x = Math.sin(t * 2) * 4; dummy.position.z = Math.cos(t * 2) * 4; } 
  if (swingT >= 0) { swingT += dt; const k = Math.min(1, swingT / 0.45); hand.rotation.set(0, 0, 1.2 - k * 2.8); hand.rotation.x = -0.6; if (k >= 1) swingT = -1; } else hand.rotation.set(0, 0, 0);
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const o = projectiles[i]; o.t += dt; const k = o.t / o.dur;
    o.p.object.position.lerpVectors(o.from, o.to, Math.min(1, k)); o.p.update(dt);
    if (k >= 1) { fx.impact(o.to, o.element); o.p.dispose(); projectiles.splice(i, 1); }
  }
  sword.update(dt, t);
  shake = Math.max(0, shake - dt * 2);
  camera.position.copy(camBase).add(V((Math.random() - 0.5) * shake * 0.3, (Math.random() - 0.5) * shake * 0.3, 0));
  camera.lookAt(look);
  fx.update(dt, camera);
  if (render) renderer.render(scene, camera);
}
frame();
window.__ready = true;
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
