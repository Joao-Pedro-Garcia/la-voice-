// Preview grid for procedural creatures. URL params:
//   only=lion,tiger  anim=idle|walk|run|attack|hit|die|fly|spawn|cycle  cols=8  detail=0..2
//   cam=orbit|front|side|iso|top  t=<fixed time s>  variants=0|1  zoom=<mult>  el=<force element>
import * as THREE from 'three';
import { createCreatureModel } from '../src/entities/creatures/index.js';
import { CREATURES } from '../shared/catalog/creatures.js';
import { CREATURE_VARIANTS } from '../shared/catalog/variants.js';

const Q = new URLSearchParams(location.search);
const ANIMS = ['idle', 'walk', 'run', 'attack', 'hit', 'die', 'spawn'];
let animMode = Q.get('anim') || 'cycle';
const detail = Q.has('detail') ? +Q.get('detail') : 2;
const fixedT = Q.has('t') ? +Q.get('t') : null;

function resolveSpec(id) {
  if (CREATURES[id]) {
    const b = CREATURES[id];
    return { species: id, archetype: b.archetype, params: { ...b.params }, colors: { ...b.colors }, element: b.defaultElement || null, size: 1, height: b.height, label: b.label, flying: !!b.traits?.flying };
  }
  const v = CREATURE_VARIANTS[id];
  if (!v) return null;
  const b = CREATURES[v.base] || CREATURES[CREATURE_VARIANTS[v.base]?.base];
  const base = resolveSpec(v.base);
  return {
    ...base, species: id, label: v.label, params: { ...base.params, ...(v.params || {}) }, colors: { ...base.colors, ...(v.colors || {}) },
    element: 'element' in v ? v.element : base.element, size: v.sizeMul || 1, flying: v.traits?.flying ?? base.flying,
  };
}

const DEFAULT_VARIANTS = ['panda', 'raposa', 'girafa', 'zebra', 'camelo', 'vaca', 'triceratops', 'mamute', 'leopardo', 'golfinho', 'orca', 'pinguim', 'pato', 'coruja', 'avestruz', 'escorpiao', 'caranguejo', 'formiga', 'borboleta', 'joaninha', 'zumbi', 'esqueleto', 'samurai', 'ninja', 'ogro', 'agua viva', 'lula', 'pegasus', 'hidra', 'drone', 'minotauro', 'hipopotamo', 'esquilo', 'viking'];
let ids = Q.get('only') ? Q.get('only').split(',') : [...Object.keys(CREATURES), ...(Q.get('variants') === '0' ? [] : DEFAULT_VARIANTS)];
ids = ids.filter((id) => resolveSpec(id));

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9fc7e8);
scene.fog = new THREE.Fog(0x9fc7e8, 60, 160);
scene.add(new THREE.HemisphereLight(0xdfefff, 0x5a6b45, 1.4));
const sun = new THREE.DirectionalLight(0xfff2dd, 2.4);
sun.position.set(20, 35, 25);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const cols = +(Q.get('cols') || Math.ceil(Math.sqrt(ids.length * 1.6)));
const rows = Math.ceil(ids.length / cols);
const CELL = 4.2;
const W = cols * CELL, D = rows * CELL;
Object.assign(sun.shadow.camera, { left: -W, right: W, top: D + 10, bottom: -D - 10, far: 120 });
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: 0x7fa65a, roughness: 1 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const quality = { tier: 'high', detail, textureSize: 1024 };
const entries = [];
const labels = document.getElementById('labels');
let totalTris = 0;
ids.forEach((id, i) => {
  const spec = resolveSpec(id);
  if (Q.get('el')) spec.element = Q.get('el');
  const m = createCreatureModel(spec, quality);
  m.setDetail(detail);
  const cx = (i % cols) * CELL - W / 2 + CELL / 2, cz = Math.floor(i / cols) * CELL - D / 2 + CELL / 2;
  const holder = new THREE.Group();
  holder.position.set(cx, 0, cz);
  scene.add(holder);
  holder.add(m.root);
  const box = new THREE.Box3().setFromObject(m.root);
  const dim = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z);
  const fit = (CELL * 0.8) / dim * (+Q.get('zoom') || 1);
  holder.scale.setScalar(fit);
  const flyer = box.min.y < -0.01;
  if (flyer) holder.position.y = (-box.min.y) * fit + 0.25;
  let tris = 0;
  m.root.traverse((o) => {
    if (o.isMesh && o.visible) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  });
  totalTris += tris;
  if (Q.get('debugtris')) {
    const agg = {};
    m.root.traverse((o) => {
      if (!o.isMesh) return;
      const k = o.geometry.type + ':' + (o.geometry.index ? o.geometry.index.count / 3 : 0);
      agg[k] = (agg[k] || 0) + (o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3);
    });
    console.log('creatures-tris', id, JSON.stringify(Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 8)));
  }
  const el = document.createElement('div');
  el.className = 'lbl';
  el.innerHTML = `${spec.label}<br/><small>${spec.archetype} · ${Math.round(tris)} tris · h ${m.height.toFixed(1)}</small>`;
  labels.appendChild(el);
  entries.push({ id, m, holder, el, spec, phaseOff: i * 0.37 });
});
console.log('creatures', entries.length, 'total tris', Math.round(totalTris));
window.__creatureStats = { count: entries.length, totalTris: Math.round(totalTris) };

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 400);
const camMode = Q.get('cam') || 'orbit';
const span = Math.max(W, D);
function placeCamera(t) {
  const r = (span * 0.62 + 4) / (+Q.get('camzoom') || 1);
  if (camMode === 'front') camera.position.set(0, span * 0.35 + 2, r);
  else if (camMode === 'side') camera.position.set(r, span * 0.3 + 2, 0);
  else if (camMode === 'top') camera.position.set(0, r * 1.2, 0.01);
  else if (camMode === 'iso') camera.position.set(r * 0.6, span * 0.45 + 2, r * 0.75);
  else camera.position.set(Math.sin(t * 0.08) * r, span * 0.45 + 2, Math.cos(t * 0.08) * r);
  camera.lookAt(0, 0.5, camMode === 'top' ? 0 : D * 0.08);
}

const btns = document.getElementById('btns');
['cycle', ...ANIMS, 'fly'].forEach((a) => {
  const b = document.createElement('button');
  b.textContent = a;
  b.onclick = () => (animMode = a);
  btns.appendChild(b);
});

function stateFor(anim, lt, t) {
  const st = { anim, speed: 0, attackT: -1, hitT: -1, dieT: -1, time: t };
  if (anim === 'walk') st.speed = 0;
  if (anim === 'attack') st.attackT = (lt % 1.0) / 1.0;
  if (anim === 'hit') st.hitT = Math.min(1, (lt % 0.8) / 0.45);
  if (anim === 'die') st.dieT = Math.min(1, (lt % 2.5) / 1.6);
  return st;
}

let last = performance.now();
let elapsed = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;
  const t = fixedT ?? elapsed;
  const cyc = Math.floor(t / 2.6) % ANIMS.length;
  const anim = animMode === 'cycle' ? ANIMS[cyc] : animMode;
  document.getElementById('anim').textContent = anim;
  const lt = animMode === 'cycle' ? t % 2.6 : t;
  placeCamera(t);
  for (const e of entries) {
    e.m.update(fixedT != null ? 1 / 60 : dt, stateFor(anim, lt + (anim === 'idle' ? e.phaseOff : 0), t + e.phaseOff));
    const p = e.holder.position.clone();
    p.y = -0.15;
    p.project(camera);
    e.el.style.left = `${(p.x * 0.5 + 0.5) * innerWidth}px`;
    e.el.style.top = `${(-p.y * 0.5 + 0.5) * innerHeight}px`;
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
