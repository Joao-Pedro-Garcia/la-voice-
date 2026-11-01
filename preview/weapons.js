import * as THREE from 'three';
import { createWeaponModel, WEAPON_KINDS } from '../src/entities/weapons/index.js';
import { makeQuality } from '../src/core/quality.js';

const q = new URLSearchParams(location.search);
const ELS = (q.get('el') || 'none,fire,ice,lightning,poison,arcane,light,shadow').split(',');
const KINDS = (q.get('kinds') || WEAPON_KINDS.join(',')).split(',');
const rarity = q.get('rarity') || 'raro';
const spin = q.get('spin') !== '0';
const angle = parseFloat(q.get('angle') || '0.5');
const quality = makeQuality(q.get('tier') || 'high');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1d26);
scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x302820, 1.4));
const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(3, 6, 5); scene.add(sun);
const rim = new THREE.DirectionalLight(0x88aaff, 1.2); rim.position.set(-4, 2, -5); scene.add(rim);

const cellW = 1.15, cellH = 1.5;
const cols = KINDS.length, rows = ELS.length;
const weapons = [];

function label(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 48;
  const g = c.getContext('2d'); g.fillStyle = '#9fb0c8'; g.font = '26px system-ui'; g.textAlign = 'center'; g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(0.9, 0.17, 1); return s;
}

KINDS.forEach((kind, i) => {
  ELS.forEach((el, j) => {
    const w = createWeaponModel({ kind, element: el === 'none' ? null : el, size: 1, rarity }, quality);
    const holder = new THREE.Group();
    const inner = new THREE.Group();
    const gun = ['blaster', 'rifle', 'cannon', 'gauntlet'].includes(kind);
    inner.rotation.y = gun ? -Math.PI / 2 : 0;
    inner.add(w.root);
    const bb = new THREE.Box3().setFromObject(inner);
    const sz = bb.getSize(new THREE.Vector3());
    inner.scale.setScalar(Math.min(1.25 / Math.max(sz.x, sz.y, sz.z), 3));
    holder.position.set((i - (cols - 1) / 2) * cellW, ((rows - 1) / 2 - j) * cellH, 0);
    const c = new THREE.Box3().setFromObject(inner).getCenter(new THREE.Vector3());
    inner.position.sub(c);
    holder.add(inner);
    if (j === rows - 1 || rows === 1) { const l = label(kind); l.position.set(0, -0.72, 0); holder.add(l); }
    if (i === 0) { const l = label(el); l.position.set(-0.75, 0, 0); l.material.color.set(0xffd27a); holder.add(l); }
    holder.rotation.y = angle;
    scene.add(holder);
    weapons.push({ w, holder, phase: i * 0.3 + j * 0.2 });
    if (q.get('appear') === '1') w.playAppear();
  });
});

const camera = new THREE.PerspectiveCamera(30, innerWidth / innerHeight, 0.1, 200);
const fitW = cols * cellW + 1, fitH = rows * cellH + 0.4;
const dist = Math.max(fitH / 2 / Math.tan(THREE.MathUtils.degToRad(15)), fitW / 2 / Math.tan(THREE.MathUtils.degToRad(15)) / camera.aspect);
camera.position.set(0, 0, dist * 1.02);
camera.lookAt(0, 0, 0);

addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
const timer = new THREE.Timer();
let t = 0;
function frame() {
  timer.update(); const dt = Math.min(timer.getDelta(), 0.05); t += dt;
  for (const o of weapons) { if (spin) o.holder.rotation.y = angle + Math.sin(t * 0.6 + o.phase) * 0.6; o.w.update(dt, t); }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();
window.__ready = true;
window.__weapons = weapons;
