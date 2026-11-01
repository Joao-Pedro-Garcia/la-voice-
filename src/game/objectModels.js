// Modelos procedurais dos objetos criados por voz (casa, árvore, fogueira, baú...).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { elementInfo } from '../../shared/elements.js';

const texCache = new Map();
function canvasTex(key, w, h, draw, repeat = 1) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

const woodTex = () =>
  canvasTex('wood', 256, 256, (g, w, h) => {
    g.fillStyle = '#8a5a32';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 ? '#7a4d2a' : '#93623a';
      g.fillRect(0, (i * h) / 8, w, h / 8 - 3);
      g.fillStyle = 'rgba(40,20,5,0.6)';
      g.fillRect(0, ((i + 1) * h) / 8 - 3, w, 3);
    }
    g.strokeStyle = 'rgba(60,30,10,0.35)';
    for (let i = 0; i < 70; i++) {
      const y = Math.random() * h;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + Math.random() * 6 - 3, w * 0.7, y + Math.random() * 6 - 3, w, y);
      g.stroke();
    }
  });

const stoneTex = () =>
  canvasTex('stone', 256, 256, (g, w, h) => {
    g.fillStyle = '#8d8a85';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2500; i++) {
      const v = 110 + Math.random() * 60;
      g.fillStyle = `rgba(${v},${v - 4},${v - 8},0.5)`;
      g.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
  });

const plasterTex = () =>
  canvasTex('plaster', 256, 256, (g, w, h) => {
    g.fillStyle = '#efe4cf';
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) {
      g.fillStyle = `rgba(150,130,100,${Math.random() * 0.12})`;
      g.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    g.fillStyle = '#5a3a22';
    g.fillRect(0, 0, w, 14);
    g.fillRect(0, h - 14, w, 14);
    g.fillRect(0, 0, 14, h);
    g.fillRect(w - 14, 0, 14, h);
    g.save();
    g.translate(w / 2, h / 2);
    g.rotate(Math.PI / 4);
    g.fillRect(-w * 0.7, -6, w * 1.4, 12);
    g.restore();
  });

const roofTex = () =>
  canvasTex('roof', 256, 256, (g, w, h) => {
    g.fillStyle = '#9b3b2a';
    g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 20) {
      for (let x = (y / 20) % 2 ? -16 : 0; x < w; x += 32) {
        g.fillStyle = `hsl(8, 55%, ${30 + Math.random() * 12}%)`;
        g.beginPath();
        g.ellipse(x + 16, y + 16, 15, 12, 0, 0, Math.PI);
        g.fill();
      }
    }
  });

function std(opts) {
  return new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0, ...opts });
}

function shadow(obj) {
  obj.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return obj;
}

const builders = {
  tree(o) {
    const g = new THREE.Group();
    const bark = std({ color: 0x6b4428 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.36, 3.2, 9), bark);
    trunk.position.y = 1.6;
    g.add(trunk);
    for (const [ang, h] of [[0.6, 2.1], [2.6, 2.4], [4.3, 1.9]]) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.11, 1.2, 6), bark);
      br.position.set(Math.cos(ang) * 0.35, h, Math.sin(ang) * 0.35);
      br.rotation.set(Math.sin(ang) * 0.9, 0, -Math.cos(ang) * 0.9);
      g.add(br);
    }
    const leafMat = std({ color: 0x3f8f3a, flatShading: true });
    const blobs = [];
    const rnd = mulberry(o.id);
    for (let i = 0; i < 7; i++) {
      const geo = new THREE.IcosahedronGeometry(0.9 + rnd() * 0.6, 1);
      jitter(geo, 0.18, rnd);
      geo.translate((rnd() - 0.5) * 1.8, 3.4 + rnd() * 1.4, (rnd() - 0.5) * 1.8);
      blobs.push(geo);
    }
    const canopy = new THREE.Mesh(mergeGeometries(blobs), leafMat);
    g.add(canopy);
    g.userData.sway = canopy;
    return g;
  },
  rock(o) {
    const rnd = mulberry(o.id);
    const geo = new THREE.IcosahedronGeometry(1.2, 2);
    jitter(geo, 0.35, rnd);
    geo.scale(1.3, 0.85, 1.1);
    const m = new THREE.Mesh(geo, std({ map: stoneTex(), color: 0xb0aca6, flatShading: true }));
    m.position.y = 0.6;
    const g = new THREE.Group();
    g.add(m);
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.35 + rnd() * 0.25, 0), m.material);
      s.position.set((rnd() - 0.5) * 3, 0.15, (rnd() - 0.5) * 3);
      s.rotation.set(rnd() * 3, rnd() * 3, 0);
      g.add(s);
    }
    return g;
  },
  house() {
    const g = new THREE.Group();
    const w = 6;
    const d = 5;
    const h = 3.2;
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), std({ map: plasterTex() }));
    walls.position.y = h / 2;
    g.add(walls);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w + 0.4, 0.5, d + 0.4), std({ map: stoneTex() }));
    base.position.y = 0.25;
    g.add(base);
    const roofShape = new THREE.Shape([new THREE.Vector2(-w / 2 - 0.5, 0), new THREE.Vector2(w / 2 + 0.5, 0), new THREE.Vector2(0, 2.4)]);
    const roofGeo = new THREE.ExtrudeGeometry(roofShape, { depth: d + 0.8, bevelEnabled: false });
    roofGeo.translate(0, 0, -(d + 0.8) / 2);
    const roof = new THREE.Mesh(roofGeo, std({ map: roofTex(), color: 0xffffff }));
    roof.position.y = h;
    g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2, 0.12), std({ map: woodTex(), color: 0x9a6a40 }));
    door.position.set(0, 1.15, d / 2 + 0.05);
    g.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), std({ color: 0xd4af37, metalness: 0.8, roughness: 0.3 }));
    knob.position.set(0.38, 1.1, d / 2 + 0.14);
    g.add(knob);
    const glass = std({ color: 0xffe4a0, emissive: 0xffb84a, emissiveIntensity: 0.6 });
    const frame = std({ map: woodTex(), color: 0x6b4428 });
    for (const x of [-1.9, 1.9]) {
      const win = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.9), glass);
      win.position.set(x, 1.9, d / 2 + 0.02);
      g.add(win);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.1, 0.15), frame);
      fr.position.set(x, 1.4, d / 2 + 0.05);
      g.add(fr);
      const fr2 = fr.clone();
      fr2.position.y = 2.4;
      g.add(fr2);
    }
    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2, 0.7), std({ map: stoneTex() }));
    chimney.position.set(1.6, h + 1.4, -0.8);
    g.add(chimney);
    return g;
  },
  campfire() {
    const g = new THREE.Group();
    const stone = std({ map: stoneTex(), flatShading: true });
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.22, 0), stone);
      s.position.set(Math.cos(a) * 0.75, 0.12, Math.sin(a) * 0.75);
      s.rotation.set(a, a * 2, 0);
      g.add(s);
    }
    const log = std({ map: woodTex(), color: 0x7a4d2a });
    for (let i = 0; i < 4; i++) {
      const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.1, 7), log);
      l.rotation.set(Math.PI / 2.6, (i / 4) * Math.PI * 2, 0);
      l.position.y = 0.3;
      g.add(l);
    }
    const flames = new THREE.Group();
    const cols = [0xffd23f, 0xff8c1a, 0xff4500];
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(
        new THREE.ConeGeometry(0.35 - i * 0.08, 1.1 - i * 0.2, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: cols[i], transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
      );
      f.position.y = 0.7 - i * 0.05;
      flames.add(f);
    }
    g.add(flames);
    const light = new THREE.PointLight(0xff9a3c, 6, 9, 2);
    light.position.y = 1;
    g.add(light);
    g.userData.flames = flames;
    g.userData.light = light;
    return g;
  },
  crate() {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), std({ map: woodTex(), color: 0xc49060 }));
    box.position.y = 0.6;
    g.add(box);
    const edge = std({ color: 0x4a2e18 });
    for (const [x, z] of [[-0.6, -0.6], [0.6, -0.6], [-0.6, 0.6], [0.6, 0.6]]) {
      const e = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.24, 0.12), edge);
      e.position.set(x, 0.6, z);
      g.add(e);
    }
    const diag = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 0.05), edge);
    diag.rotation.z = Math.PI / 4;
    diag.position.set(0, 0.6, 0.62);
    g.add(diag);
    return g;
  },
  chest() {
    const g = new THREE.Group();
    const wood = std({ map: woodTex(), color: 0x9a5a2a });
    const gold = std({ color: 0xffc83a, metalness: 0.9, roughness: 0.25, emissive: 0x553300, emissiveIntensity: 0.3 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.85), wood);
    body.position.y = 0.35;
    g.add(body);
    const lidGeo = new THREE.CylinderGeometry(0.425, 0.425, 1.3, 16, 1, false, 0, Math.PI);
    lidGeo.rotateZ(Math.PI / 2);
    const lid = new THREE.Mesh(lidGeo, wood);
    lid.position.y = 0.7;
    g.add(lid);
    for (const x of [-0.45, 0.45]) {
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.04, 6, 16, Math.PI), gold);
      band.rotation.y = Math.PI / 2;
      band.position.set(x, 0.7, 0);
      g.add(band);
    }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 0.08), gold);
    lock.position.set(0, 0.62, 0.45);
    g.add(lock);
    const glow = new THREE.PointLight(0xffd36b, 2, 4);
    glow.position.y = 1.2;
    g.add(glow);
    return g;
  },
  potion() {
    const g = new THREE.Group();
    const pts = [[0, 0], [0.22, 0.02], [0.3, 0.2], [0.28, 0.4], [0.1, 0.55], [0.09, 0.72], [0.11, 0.75]].map(([x, y]) => new THREE.Vector2(x, y));
    const glass = new THREE.Mesh(new THREE.LatheGeometry(pts, 20), new THREE.MeshPhysicalMaterial({ color: 0xffffff, transparent: true, opacity: 0.35, roughness: 0.05, metalness: 0, clearcoat: 1 }));
    const liquid = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12), std({ color: 0xff3366, emissive: 0xff1144, emissiveIntensity: 0.7 }));
    liquid.position.y = 0.22;
    const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.12, 10), std({ color: 0xb08050 }));
    cork.position.y = 0.8;
    g.add(glass, liquid, cork);
    g.scale.setScalar(1.4);
    g.userData.spin = true;
    return g;
  },
  food(o) {
    const g = new THREE.Group();
    const apple = new THREE.Mesh(new THREE.SphereGeometry(0.3, 18, 14), std({ color: 0xd8242a, roughness: 0.4 }));
    apple.scale.y = 0.9;
    apple.position.y = 0.3;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.15, 5), std({ color: 0x5a3a1a }));
    stem.position.y = 0.6;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), std({ color: 0x3fa03a }));
    leaf.scale.set(1.6, 0.3, 0.8);
    leaf.position.set(0.08, 0.63, 0);
    g.add(apple, stem, leaf);
    g.scale.setScalar(1.5);
    g.userData.spin = true;
    return g;
  },
  trampoline() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.2, 0.08, 8, 32), std({ color: 0x2a6fdb, metalness: 0.4 }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.6;
    const pad = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), std({ color: 0x111111, side: THREE.DoubleSide }));
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.58;
    g.add(ring, pad);
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 6), std({ color: 0x888888, metalness: 0.6 }));
      leg.position.set(Math.cos(a) * 1.15, 0.3, Math.sin(a) * 1.15);
      g.add(leg);
    }
    g.userData.pad = pad;
    return g;
  },
  balloon(o) {
    const g = new THREE.Group();
    const rnd = mulberry(o.id);
    const cols = [0xff4d6d, 0xffd23f, 0x4dabf7, 0x51cf66, 0xcc5de8];
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push(new THREE.Vector2(Math.sin(t * Math.PI) * 0.45 * (1 - t * 0.25), t * 1.1 - 0.05));
    }
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(new THREE.LatheGeometry(pts, 16), std({ color: cols[i], roughness: 0.25, metalness: 0.1 }));
      b.rotation.x = Math.PI;
      const ang = (i / 5) * Math.PI * 2;
      b.position.set(Math.cos(ang) * 0.6, 3.2 + rnd() * 0.8, Math.sin(ang) * 0.6);
      const str = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, b.position.y - 1.1, 4), std({ color: 0xffffff }));
      str.position.set(b.position.x / 2, (b.position.y - 1.1) / 2 + 1.1, b.position.z / 2);
      str.lookAt(b.position.x, b.position.y, b.position.z);
      str.rotateX(Math.PI / 2);
      g.add(b, str);
    }
    const weight = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), std({ color: 0xffd23f }));
    weight.position.y = 1.1;
    g.add(weight);
    g.userData.float = true;
    return g;
  },
  bomb(o) {
    const g = new THREE.Group();
    const el = elementInfo(o.element);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.45, 20, 16), std({ color: 0x1d1d24, metalness: 0.5, roughness: 0.35 }));
    body.position.y = 0.45;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.14, 12), std({ color: 0xc8a050, metalness: 0.8 }));
    cap.position.y = 0.92;
    const fuse = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 12, Math.PI), std({ color: 0xd2b48c }));
    fuse.position.set(0.12, 1, 0);
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), new THREE.MeshBasicMaterial({ color: el.glow }));
    spark.position.set(0.28, 1.02, 0);
    const rune = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.02, 6, 32), new THREE.MeshBasicMaterial({ color: el.color }));
    rune.rotation.x = Math.PI / 2;
    rune.position.y = 0.45;
    g.add(body, cap, fuse, spark, rune);
    g.userData.spark = spark;
    g.userData.pulse = body;
    return g;
  },
};

function mulberry(str) {
  let h = 1779033703;
  for (let i = 0; i < String(str).length; i++) h = Math.imul(h ^ String(str).charCodeAt(i), 3432918353);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function jitter(geo, amount, rnd) {
  const pos = geo.attributes.position;
  const map = new Map();
  for (let i = 0; i < pos.count; i++) {
    const k = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, 1 + (rnd() - 0.5) * amount * 2);
    const s = map.get(k);
    pos.setXYZ(i, pos.getX(i) * s, pos.getY(i) * s, pos.getZ(i) * s);
  }
  geo.computeVertexNormals();
}

export function createObjectModel(o) {
  const b = builders[o.type];
  if (!b) return null;
  const root = shadow(b(o));
  root.traverse((m) => m.isPointLight && (m.castShadow = false));
  const g = new THREE.Group();
  g.add(root);
  g.scale.setScalar(o.size || 1);
  let t = Math.random() * 10;
  return {
    root: g,
    update(dt, now) {
      t += dt;
      const u = root.userData;
      if (u.flames) {
        u.flames.children.forEach((f, i) => {
          f.scale.set(1 + Math.sin(t * 9 + i) * 0.12, 1 + Math.sin(t * 13 + i * 2) * 0.2, 1);
          f.rotation.y += dt * (1 + i);
        });
        u.light.intensity = 5 + Math.sin(t * 17) * 1 + Math.sin(t * 7) * 0.8;
      }
      if (u.spin) {
        root.rotation.y += dt * 1.5;
        root.position.y = 0.3 + Math.sin(t * 2.5) * 0.12;
      }
      if (u.float) root.position.y = Math.sin(t * 1.2) * 0.25 + Math.min(6, t * 0.04);
      if (u.sway) u.sway.rotation.z = Math.sin(t * 0.9) * 0.02;
      if (u.spark) {
        u.spark.scale.setScalar(0.7 + Math.random() * 0.8);
        u.pulse.scale.setScalar(1 + Math.max(0, Math.sin(t * (6 + t * 6))) * 0.08);
      }
      if (u.pad) u.pad.position.y = 0.58 - Math.max(0, Math.sin(t * 3)) * 0.05;
    },
    dispose() {
      root.traverse((m) => {
        if (m.isMesh) {
          m.geometry.dispose();
          // materiais/texturas compartilhados no cache não são liberados
          if (!m.material.map) m.material.dispose();
        }
      });
    },
  };
}
