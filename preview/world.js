// Preview isolado do mundo + personagens. URL: ?tier=low|mid|high|ultra&time=18.5&weather=rain&cam=village&chars=1&freeze=1
import * as THREE from 'three';
import { makeQuality, detectTier } from '../src/core/quality.js';
import { buildWorld } from '../src/world/index.js';
import { terrainHeight, SPAWN } from '../shared/world.js';

const params = new URLSearchParams(location.search);
const tier = params.get('tier') || detectTier();
const quality = makeQuality(tier);
const timeParam = params.get('time');
const weatherParam = params.get('weather') || 'clear';
const camName = params.get('cam') || 'chars';
const freeze = params.get('freeze') !== '0';
const showChars = params.get('chars') !== '0';

const renderer = new THREE.WebGLRenderer({ antialias: quality.antialias, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, quality.pixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1500);

const CAMS = {
  chars: { pos: [0.5, 1.9, 36.5], look: [0, 1.1, 30] },
  closeup: { pos: [-1.5, 1.6, 33.4], look: [-2, 1.2, 30] },
  side: { pos: [7.5, 1.3, 30.5], look: [0, 0.9, 30] },
  face: { pos: [-1.6, 1.68, 31.1], look: [-2.6, 1.58, 30] },
  grass: { pos: [-100, 4.5, 60], look: [-110, 2.5, 75] },
  overview: { pos: [70, 70, 150], look: [0, 0, 0] },
  arena: { pos: [26, 9, 52], look: [0, 2, 0] },
  village: { pos: [-82, 16, 46], look: [-125, 3, 95] },
  plaza: { pos: [-112, 4, 82], look: [-130, 3, 100] },
  lake: { pos: [62, 9, -62], look: [130, -1, -100] },
  pier: { pos: [70, 2.5, -86], look: [90, -0.5, -95] },
  ruins: { pos: [92, 13, 118], look: [120, 5, 150] },
  tower: { pos: [-145, 8, 38], look: [-173, 10, 65] },
  forest: { pos: [-60, 6, -120], look: [-90, 4, -160] },
  mountains: { pos: [150, 30, 150], look: [260, 60, 230] },
};
const preset = CAMS[camName] || CAMS.chars;
camera.position.fromArray(preset.pos);
if (params.get('cy')) camera.position.y += Number(params.get('cy'));
camera.lookAt(new THREE.Vector3().fromArray(preset.look));
const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
let yaw = euler.y;
let pitch = euler.x;

const load = document.getElementById('load');
const hud = document.getElementById('hud');
const errors = [];
window.__errors = errors;
window.addEventListener('error', (e) => errors.push(String(e.message)));

const world = await buildWorld(scene, renderer, quality, (p, label) => {
  load.textContent = `Carregando ${label}… ${Math.round(p * 100)}%`;
});
load.remove();
window.__world = world;
window.__camera = camera;
window.__scene = scene;
window.__renderer = renderer;
world.setTimeOfDay(timeParam != null ? Number(timeParam) : 10);
world.setDayLength(freeze ? 0 : 8 * 60);
world.setWeather(weatherParam, { instant: true });
const lightningLog = [];
world.onLightning((e) => lightningLog.push(e));
window.__lightning = lightningLog;

// ---- personagens ----
const characters = [];
const ANIMS = ['idle', 'walk', 'run', 'jump', 'fall', 'fly', 'attack', 'cast', 'block', 'dodge', 'hit', 'ko'];
const STYLES = ['slash', 'heavy', 'thrust', 'shoot', 'punch', 'cast'];
const forcedAnim = params.get('anim');
if (showChars) {
  try {
    const { createCharacterModel } = await import('../src/entities/character.js');
    const looks = [
      { skin: '#f1c7a5', shirt: '#d94a4a', pants: '#2f3e66', hair: '#3b2416', hairStyle: 'short', accessory: 'none' },
      { skin: '#8d5a3c', shirt: '#3fa86b', pants: '#4a3a2a', hair: '#141010', hairStyle: 'spiky', accessory: 'headband' },
      { skin: '#ffdcc0', shirt: '#6a5acd', pants: '#222831', hair: '#e8c35a', hairStyle: 'long', accessory: 'crown' },
      { skin: '#c48a62', shirt: '#f0a03c', pants: '#355c7d', hair: '#7a3b1f', hairStyle: 'bald', accessory: 'hat' },
      { skin: '#e9b48f', shirt: '#2fa3c4', pants: '#5a2a4a', hair: '#c0392b', hairStyle: 'long', accessory: 'hat' },
    ];
    // armas fictícias para checar a orientação da mão (lâmina ao longo de +Y)
    const bladeGeo = new THREE.BoxGeometry(0.06, 0.9, 0.02);
    bladeGeo.translate(0, 0.55, 0);
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xd8e0ea, metalness: 0.8, roughness: 0.3 });
    looks.forEach((look, i) => {
      const c = createCharacterModel(look, quality);
      const x = (i - (looks.length - 1) / 2) * 2.0;
      const z = SPAWN.z;
      c.root.position.set(x, terrainHeight(x, z), z);
      scene.add(c.root);
      if (i % 2 === 0) {
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.castShadow = true;
        c.rightHand.add(blade);
      }
      characters.push({ c, i, baseY: c.root.position.y });
    });
  } catch (e) {
    console.error('character load failed', e);
    errors.push(String(e));
  }
}

// ---- controles de voo livre ----
const keys = new Set();
addEventListener('keydown', (e) => keys.add(e.code));
addEventListener('keyup', (e) => keys.delete(e.code));
let dragging = false;
let lx = 0;
let ly = 0;
renderer.domElement.addEventListener('pointerdown', (e) => {
  dragging = true;
  lx = e.clientX;
  ly = e.clientY;
});
addEventListener('pointerup', () => (dragging = false));
addEventListener('pointermove', (e) => {
  if (!dragging) return;
  yaw -= (e.clientX - lx) * 0.004;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - (e.clientY - ly) * 0.004));
  lx = e.clientX;
  ly = e.clientY;
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const bar = document.getElementById('bar');
for (const w of ['clear', 'rain', 'snow', 'thunderstorm', 'fog']) {
  const b = document.createElement('button');
  b.textContent = w;
  b.onclick = () => world.setWeather(w);
  bar.appendChild(b);
}
for (const h of [6, 10, 13, 18.3, 21, 0]) {
  const b = document.createElement('button');
  b.textContent = `${h}h`;
  b.onclick = () => world.setTimeOfDay(h);
  bar.appendChild(b);
}
const bDay = document.createElement('button');
bDay.textContent = 'ciclo';
bDay.onclick = () => world.setDayLength(60);
bar.appendChild(bDay);

const timer = new THREE.Timer();
timer.connect?.(document);
let fpsAcc = 0;
let fpsN = 0;
let fps = 0;
const v = new THREE.Vector3();
let simTime = 0;
let lastInfo = { calls: 0, triangles: 0 };

function charState(entry, t) {
  const slot = Math.floor(t / 2.6);
  const anim = forcedAnim || ANIMS[(slot + entry.i * 2) % ANIMS.length];
  const local = (t % 2.6) / 2.6;
  const style = STYLES[(slot + entry.i) % STYLES.length];
  return {
    anim,
    speed: anim === 'run' ? 7 : anim === 'walk' ? 2.5 : 0,
    attackT: anim === 'attack' ? Math.min(1, local * 1.4) : -1,
    attackStyle: style,
    castT: anim === 'cast' ? Math.min(1, local * 1.2) : -1,
    time: t,
  };
}

function frame() {
  timer.update();
  const dt = fixedDt || Math.min(timer.getDelta(), 0.1);
  fixedDt = 0;
  simTime += dt;
  const sp = (keys.has('ShiftLeft') ? 40 : 10) * dt;
  camera.rotation.set(pitch, yaw, 0, 'YXZ');
  v.set((keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0), (keys.has('KeyE') ? 1 : 0) - (keys.has('KeyQ') ? 1 : 0), (keys.has('KeyS') ? 1 : 0) - (keys.has('KeyW') ? 1 : 0));
  v.applyQuaternion(camera.quaternion).multiplyScalar(sp);
  camera.position.add(v);

  for (const e of characters) {
    const st = charState(e, simTime);
    e.c.update(dt, st);
  }
  world.update(dt, camera);
  renderer.render(scene, camera);
  lastInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  fpsAcc += dt;
  fpsN++;
  if (fpsAcc > 0.5) {
    fps = fpsN / fpsAcc;
    fpsAcc = 0;
    fpsN = 0;
    const h = world.getTimeOfDay();
    hud.textContent = `tier ${tier}  fps ${fps.toFixed(0)}\ncalls ${lastInfo.calls}  tris ${(lastInfo.triangles / 1000).toFixed(0)}k\nhora ${h.toFixed(2)}  clima ${world.getWeather()}\npos ${camera.position.toArray().map((n) => n.toFixed(0)).join(',')}`;
  }
  window.__frames = (window.__frames || 0) + 1;
  if (!manual) requestAnimationFrame(frame);
}
// modo captura (?manual=1): sem loop contínuo; o teste chama __step(n, dt)
const manual = params.get('manual') === '1';
let fixedDt = 0;
window.__step = (n = 1, dtStep = 1 / 30) => {
  const t0 = performance.now();
  for (let i = 0; i < n; i++) {
    fixedDt = dtStep;
    frame();
  }
  return performance.now() - t0;
};
window.__stats = () => ({ ...lastInfo, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, programs: renderer.info.programs?.length, fps });
window.__breakdown = () => {
  const out = {};
  scene.traverseVisible((o) => {
    if (!o.isMesh && !o.isPoints) return;
    const g = o.geometry;
    const tri = (g.index ? g.index.count : g.attributes.position.count) / 3;
    const n = o.isInstancedMesh ? o.count : g.isInstancedBufferGeometry ? g.instanceCount : 1;
    let top = o;
    while (top.parent && top.parent !== scene) top = top.parent;
    const k = top.name || o.name || o.type;
    out[k] = out[k] || { meshes: 0, tris: 0 };
    out[k].meshes++;
    out[k].tris += Math.round(tri * n);
  });
  return out;
};
window.__ready = true;
if (manual) frame();
else requestAnimationFrame(frame);
