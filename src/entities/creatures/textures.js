// Canvas texture generators for procedural creatures (cached, shared between instances).
// Body textures follow the "rotated sphere / lathe" UV convention used by the builders:
//   canvas x (u): 0.25 = belly (bottom), 0.75 = back (top)
//   canvas y:     top rows = front of the part (head side), bottom rows = rear.
import * as THREE from 'three';

const cache = new Map();

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function hex(c) {
  return '#' + new THREE.Color(c).getHexString();
}

function lum(c) {
  const col = new THREE.Color(c);
  return 0.3 * col.r + 0.59 * col.g + 0.11 * col.b;
}

export function darker(a, b) {
  return lum(a) <= lum(b) ? a : b;
}

export function luminance(c) {
  return lum(c);
}

function canvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function finish(c, key, repeat = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 2;
  t.userData.shared = true;
  cache.set(key, t);
  return t;
}

// Light, mostly-white noise used as a multiplicative detail map on tinted materials.
export function noiseTexture(kind = 'skin', size = 128) {
  const key = `noise:${kind}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(size);
  const g = c.getContext('2d');
  const r = rng(kind.length * 977 + size);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, size, size);
  drawNoise(g, size, kind, r, 1);
  return finish(c, key);
}

function drawNoise(g, size, kind, r, strength) {
  if (kind === 'fur') {
    g.lineWidth = Math.max(1, size / 200);
    for (let i = 0; i < size * 6; i++) {
      const x = r() * size, y = r() * size, l = size * (0.02 + r() * 0.03);
      const v = r() < 0.5 ? 0 : 255;
      g.strokeStyle = `rgba(${v},${v},${v},${0.07 * strength})`;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + (r() - 0.5) * l * 0.4, y + l);
      g.stroke();
    }
  } else if (kind === 'scales') {
    const n = 14;
    const s = size / n;
    for (let j = 0; j < n + 1; j++) {
      for (let i = 0; i < n + 1; i++) {
        const x = i * s + (j % 2) * s * 0.5, y = j * s * 0.85;
        g.fillStyle = `rgba(0,0,0,${0.12 * strength})`;
        g.beginPath();
        g.arc(x, y, s * 0.52, 0, Math.PI);
        g.fill();
        g.fillStyle = `rgba(255,255,255,${0.1 * strength})`;
        g.beginPath();
        g.arc(x, y - s * 0.1, s * 0.3, Math.PI, 0);
        g.fill();
      }
    }
  } else if (kind === 'rock') {
    for (let i = 0; i < size * 1.5; i++) {
      const v = Math.floor(r() * 90);
      g.fillStyle = `rgba(${v},${v},${v},${0.12 * strength})`;
      g.beginPath();
      g.arc(r() * size, r() * size, size * (0.01 + r() * 0.05), 0, Math.PI * 2);
      g.fill();
    }
    g.strokeStyle = `rgba(0,0,0,${0.35 * strength})`;
    g.lineWidth = Math.max(1, size / 128);
    for (let i = 0; i < 10; i++) {
      let x = r() * size, y = r() * size;
      g.beginPath();
      g.moveTo(x, y);
      for (let k = 0; k < 5; k++) {
        x += (r() - 0.5) * size * 0.2;
        y += (r() - 0.5) * size * 0.2;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  } else if (kind === 'metal') {
    for (let i = 0; i < size; i++) {
      const v = 200 + Math.floor(r() * 55);
      g.fillStyle = `rgba(${v},${v},${v},0.35)`;
      g.fillRect(0, i, size, 1);
    }
  } else {
    // soft skin blotches
    for (let i = 0; i < size; i++) {
      const v = r() < 0.5 ? 0 : 255;
      g.fillStyle = `rgba(${v},${v},${v},${0.05 * strength})`;
      g.beginPath();
      g.arc(r() * size, r() * size, size * (0.02 + r() * 0.08), 0, Math.PI * 2);
      g.fill();
    }
  }
}

// Baked colour coat: base colour + optional lighter belly + pattern + noise.
// pattern: none | stripes | spots | scales | panda | bands | rings
export function coatTexture({ base, belly = null, mark = 0x111111, pattern = 'none', noise = 'fur', size = 256, seed = 1, wrap = false }) {
  const key = `coat:${base}:${belly}:${mark}:${pattern}:${noise}:${size}:${seed}:${wrap}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(size);
  const g = c.getContext('2d');
  const r = rng(seed * 7919 + 13);
  g.fillStyle = hex(base);
  g.fillRect(0, 0, size, size);
  if (belly != null) {
    const grad = g.createLinearGradient(0, 0, size, 0);
    const bc = new THREE.Color(belly);
    const rgba = (a) => `rgba(${Math.round(bc.r * 255)},${Math.round(bc.g * 255)},${Math.round(bc.b * 255)},${a})`;
    grad.addColorStop(0, rgba(0));
    grad.addColorStop(0.08, rgba(0.3));
    grad.addColorStop(0.17, rgba(1));
    grad.addColorStop(0.33, rgba(1));
    grad.addColorStop(0.42, rgba(0.3));
    grad.addColorStop(0.5, rgba(0));
    grad.addColorStop(1, rgba(0));
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  g.fillStyle = hex(mark);
  g.strokeStyle = hex(mark);
  const u0 = wrap ? 0 : 0.42, u1 = wrap ? 1 : 1.08; // pattern region (back + flanks)
  if (pattern === 'stripes') {
    const n = 9;
    for (let i = 0; i < n; i++) {
      const y = ((i + 0.5 + (r() - 0.5) * 0.4) / n) * size;
      const w = size * (0.025 + r() * 0.02);
      g.beginPath();
      const xa = u0 * size, xb = u1 * size;
      const steps = 12;
      for (let k = 0; k <= steps; k++) {
        const x = xa + ((xb - xa) * k) / steps;
        const taper = wrap ? 1 : Math.sin((k / steps) * Math.PI);
        const yy = y + Math.sin(k * 0.9 + i) * size * 0.02;
        if (k === 0) g.moveTo(x, yy - w * taper);
        else g.lineTo(x, yy - w * taper);
      }
      for (let k = steps; k >= 0; k--) {
        const x = xa + ((xb - xa) * k) / steps;
        const taper = wrap ? 1 : Math.sin((k / steps) * Math.PI);
        const yy = y + Math.sin(k * 0.9 + i) * size * 0.02;
        g.lineTo(x, yy + w * taper);
      }
      g.fill();
      if (!wrap) {
        // wrap-around copy for the part that crosses u=1
        g.save();
        g.translate(-size, 0);
        g.fill();
        g.restore();
      }
    }
  } else if (pattern === 'spots' || pattern === 'rosettes') {
    const n = Math.floor(size / 6);
    for (let i = 0; i < n; i++) {
      let u = u0 + r() * (u1 - u0);
      const x = (u % 1) * size, y = r() * size;
      const rad = size * (0.025 + r() * 0.035);
      g.beginPath();
      for (let k = 0; k < 7; k++) {
        const a = (k / 7) * Math.PI * 2;
        const rr = rad * (0.7 + r() * 0.5);
        const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
        k === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.closePath();
      g.fill();
    }
  } else if (pattern === 'panda') {
    g.fillRect(0, size * 0.2, size, size * 0.24);
  } else if (pattern === 'bands') {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const y = ((i + 0.6) / (n + 0.4)) * size;
      g.fillRect(0, y, size, size * 0.11);
    }
  } else if (pattern === 'rings') {
    const n = 7;
    for (let i = 0; i < n; i++) g.fillRect(0, ((i + 0.3) / n) * size, size, size * 0.06);
  }
  if (noise) drawNoise(g, size, noise, r, pattern === 'scales' ? 2 : 1);
  return finish(c, key);
}

// Butterfly wing: colourful gradient with eye-spots and dark border.
export function butterflyWingTexture(a, b, edge, size = 256) {
  const key = `bwing:${a}:${b}:${edge}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(size);
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(0, size / 2, size * 0.05, 0, size / 2, size);
  grad.addColorStop(0, hex(b));
  grad.addColorStop(0.55, hex(a));
  grad.addColorStop(0.85, hex(a));
  grad.addColorStop(0.9, hex(edge));
  grad.addColorStop(1, hex(edge));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  g.fillStyle = '#ffffff';
  for (let i = 0; i < 9; i++) {
    const ang = -0.9 + i * 0.22;
    g.beginPath();
    g.arc(Math.cos(ang) * size * 0.88, size / 2 + Math.sin(ang) * size * 0.88, size * 0.025, 0, Math.PI * 2);
    g.fill();
  }
  for (const [x, y, rr] of [[0.55, 0.3, 0.09], [0.5, 0.72, 0.07]]) {
    g.fillStyle = hex(edge);
    g.beginPath();
    g.arc(x * size, y * size, rr * size, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = hex(b);
    g.beginPath();
    g.arc(x * size, y * size, rr * size * 0.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(x * size - rr * size * 0.2, y * size - rr * size * 0.2, rr * size * 0.18, 0, Math.PI * 2);
    g.fill();
  }
  g.strokeStyle = hex(edge);
  g.lineWidth = size / 90;
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.moveTo(0, size / 2);
    const ang = -1.1 + i * 0.44;
    g.lineTo(Math.cos(ang) * size, size / 2 + Math.sin(ang) * size);
    g.stroke();
  }
  return finish(c, key);
}

// Vertical gradient (used by flames / ghost glow / jellyfish).
export function gradientTexture(top, bottom, size = 64) {
  const key = `grad:${top}:${bottom}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const c = canvas(size);
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, hex(top));
  grad.addColorStop(1, hex(bottom));
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return finish(c, key);
}
