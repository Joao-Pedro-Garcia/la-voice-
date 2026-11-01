// Texturas procedurais em <canvas> (nenhum asset externo). Todas "tileable" e cacheadas.
import * as THREE from 'three';

const cache = new Map();
let maxAniso = 4;

export function setTextureRenderer(renderer) {
  try {
    maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  } catch {
    maxAniso = 4;
  }
}

export function disposeTextures() {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function finish(canvas, { srgb = true, repeat = true, aniso = true, mipmaps = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso ? maxAniso : 1;
  t.generateMipmaps = mipmaps;
  t.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.userData.shared = true;
  t.needsUpdate = true;
  return t;
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// ---- ruído periódico (tileable) ----
function phash(ix, iy, period, seed) {
  ix = ((ix % period) + period) % period;
  iy = ((iy % period) + period) % period;
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function pnoise(x, y, period, seed) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = phash(ix, iy, period, seed);
  const b = phash(ix + 1, iy, period, seed);
  const c = phash(ix, iy + 1, period, seed);
  const d = phash(ix + 1, iy + 1, period, seed);
  return (a + (b - a) * ux) * (1 - uy) + (c + (d - c) * ux) * uy;
}

function pfbm(u, v, basePeriod, octaves, seed) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let p = basePeriod;
  for (let o = 0; o < octaves; o++) {
    sum += pnoise(u * p, v * p, p, seed + o * 31) * amp;
    norm += amp;
    amp *= 0.5;
    p *= 2;
  }
  return sum / norm;
}

function mulberry(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// R: fbm fino, G: fbm grosso, B: manchas (pedrinhas), A: 1 — dados lineares.
export function noiseTexture(size = 256) {
  return cached(`noise${size}`, () => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const r = pfbm(u, v, 16, 4, 11);
        const g = pfbm(u, v, 4, 4, 23);
        const sp = pnoise(u * 48, v * 48, 48, 77);
        const b = sp > 0.78 ? (sp - 0.78) / 0.22 : 0;
        const i = (y * size + x) * 4;
        img.data[i] = r * 255;
        img.data[i + 1] = g * 255;
        img.data[i + 2] = b * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return finish(c, { srgb: false });
  });
}

// Normal map tileable para a água (duas escalas de ruído).
export function waterNormalTexture(size = 256) {
  return cached(`waternormal${size}`, () => {
    const h = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        h[y * size + x] = pfbm(u, v, 6, 4, 5) + 0.35 * pfbm(u, v, 24, 2, 9);
      }
    }
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    const s = 6;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const l = h[y * size + ((x - 1 + size) % size)];
        const r = h[y * size + ((x + 1) % size)];
        const d = h[((y - 1 + size) % size) * size + x];
        const u = h[((y + 1) % size) * size + x];
        let nx = (l - r) * s;
        let ny = (d - u) * s;
        let nz = 1;
        const len = Math.hypot(nx, ny, nz);
        nx /= len;
        ny /= len;
        nz /= len;
        const i = (y * size + x) * 4;
        img.data[i] = (nx * 0.5 + 0.5) * 255;
        img.data[i + 1] = (ny * 0.5 + 0.5) * 255;
        img.data[i + 2] = (nz * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return finish(c, { srgb: false });
  });
}

// Paralelepípedos (voronoi) — calçamento da praça/caminhos.
export function cobbleTexture(size = 256) {
  return cached(`cobble${size}`, () => {
    const cells = 6;
    const rand = mulberry(99);
    const pts = [];
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) pts.push([(i + 0.2 + rand() * 0.6) / cells, (j + 0.2 + rand() * 0.6) / cells, 0.75 + rand() * 0.35]);
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        let d1 = 9;
        let d2 = 9;
        let tone = 1;
        for (const p of pts) {
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const dx = u - (p[0] + ox);
              const dy = v - (p[1] + oy);
              const d = dx * dx + dy * dy;
              if (d < d1) {
                d2 = d1;
                d1 = d;
                tone = p[2];
              } else if (d < d2) d2 = d;
            }
          }
        }
        const edge = Math.sqrt(d2) - Math.sqrt(d1);
        const mortar = Math.min(1, edge * cells * 6);
        const n = 0.85 + pfbm(u, v, 32, 2, 3) * 0.3;
        const base = (0.25 + 0.75 * mortar) * tone * n;
        const i = (y * size + x) * 4;
        img.data[i] = Math.min(255, base * 168);
        img.data[i + 1] = Math.min(255, base * 160);
        img.data[i + 2] = Math.min(255, base * 150);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return finish(c);
  });
}

// Paredes: 'plaster' (reboco com enxaimel), 'stone', 'planks', 'roof', 'wood', 'brick'
export function surfaceTexture(kind, size = 256) {
  return cached(`${kind}${size}`, () => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const rand = mulberry(kind.length * 977 + size);
    const S = size;
    const noiseOverlay = (amount, period = 16, seed = 1) => {
      const img = ctx.getImageData(0, 0, S, S);
      for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
          const n = (pfbm(x / S, y / S, period, 3, seed) - 0.5) * amount;
          const i = (y * S + x) * 4;
          img.data[i] = Math.max(0, Math.min(255, img.data[i] * (1 + n)));
          img.data[i + 1] = Math.max(0, Math.min(255, img.data[i + 1] * (1 + n)));
          img.data[i + 2] = Math.max(0, Math.min(255, img.data[i + 2] * (1 + n)));
        }
      }
      ctx.putImageData(img, 0, 0);
    };
    if (kind === 'plaster') {
      ctx.fillStyle = '#efe6d2';
      ctx.fillRect(0, 0, S, S);
      noiseOverlay(0.18, 8, 4);
    } else if (kind === 'stone') {
      // pedras irregulares em fiadas
      ctx.fillStyle = '#5d5a55';
      ctx.fillRect(0, 0, S, S);
      const rows = 5;
      const rh = S / rows;
      for (let r = 0; r < rows; r++) {
        let x = -rand() * rh;
        while (x < S) {
          const w = rh * (0.9 + rand() * 1.1);
          const g = 130 + rand() * 55;
          const tint = rand() * 14;
          ctx.fillStyle = `rgb(${g + tint},${g + tint * 0.6},${g - 4})`;
          const pad = S * 0.012;
          const rr = rh * 0.22;
          roundRect(ctx, x + pad, r * rh + pad, w - pad * 2, rh - pad * 2, rr);
          ctx.fill();
          // repete na borda para tile
          if (x + w > S) {
            roundRect(ctx, x - S + pad, r * rh + pad, w - pad * 2, rh - pad * 2, rr);
            ctx.fill();
          }
          // luz superior
          ctx.fillStyle = 'rgba(255,255,255,0.08)';
          ctx.fillRect(x + pad * 2, r * rh + pad * 2, w - pad * 4, rh * 0.18);
          x += w;
        }
      }
      noiseOverlay(0.25, 16, 8);
    } else if (kind === 'brick') {
      ctx.fillStyle = '#7d756b';
      ctx.fillRect(0, 0, S, S);
      const rows = 8;
      const rh = S / rows;
      const bw = S / 4;
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * bw * 0.5;
        for (let i = -1; i < 5; i++) {
          const g = 150 + rand() * 50;
          ctx.fillStyle = `rgb(${g},${g * 0.96},${g * 0.9})`;
          ctx.fillRect(i * bw + off + 2, r * rh + 2, bw - 4, rh - 4);
        }
      }
      noiseOverlay(0.22, 16, 12);
    } else if (kind === 'planks') {
      const rows = 6;
      const rh = S / rows;
      for (let r = 0; r < rows; r++) {
        const g = 0.85 + rand() * 0.3;
        ctx.fillStyle = `rgb(${150 * g},${100 * g},${62 * g})`;
        ctx.fillRect(0, r * rh, S, rh);
        // veios
        for (let k = 0; k < 10; k++) {
          ctx.strokeStyle = `rgba(60,35,20,${0.12 + rand() * 0.15})`;
          ctx.lineWidth = 1 + rand() * 1.5;
          ctx.beginPath();
          const y0 = r * rh + rand() * rh;
          ctx.moveTo(0, y0);
          ctx.bezierCurveTo(S * 0.3, y0 + (rand() - 0.5) * 6, S * 0.6, y0 + (rand() - 0.5) * 6, S, y0);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(40,22,10,0.75)';
        ctx.fillRect(0, r * rh, S, Math.max(2, S * 0.012));
        ctx.fillStyle = 'rgba(255,230,190,0.12)';
        ctx.fillRect(0, r * rh + S * 0.012, S, S * 0.01);
      }
      noiseOverlay(0.15, 32, 5);
    } else if (kind === 'wood') {
      ctx.fillStyle = '#6b4428';
      ctx.fillRect(0, 0, S, S);
      for (let k = 0; k < 40; k++) {
        ctx.strokeStyle = `rgba(${rand() < 0.5 ? '40,22,12' : '140,95,60'},${0.15 + rand() * 0.25})`;
        ctx.lineWidth = 1 + rand() * 2;
        const x0 = rand() * S;
        ctx.beginPath();
        ctx.moveTo(x0, 0);
        ctx.bezierCurveTo(x0 + (rand() - 0.5) * 10, S * 0.33, x0 + (rand() - 0.5) * 10, S * 0.66, x0, S);
        ctx.stroke();
      }
      noiseOverlay(0.12, 16, 2);
    } else if (kind === 'roof') {
      // telhas/escamas em tons de cinza (tingidas pela cor do material)
      ctx.fillStyle = '#6a6a6a';
      ctx.fillRect(0, 0, S, S);
      const rows = 8;
      const rh = S / rows;
      const tw = S / 6;
      for (let r = rows; r >= -1; r--) {
        const off = (r % 2) * tw * 0.5;
        for (let i = -1; i < 7; i++) {
          const g = 175 + rand() * 60;
          const x = i * tw + off;
          const y = r * rh;
          const grad = ctx.createLinearGradient(0, y, 0, y + rh * 1.2);
          grad.addColorStop(0, `rgb(${g * 0.75},${g * 0.75},${g * 0.75})`);
          grad.addColorStop(1, `rgb(${g},${g},${g})`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.moveTo(x + 1, y);
          ctx.lineTo(x + tw - 1, y);
          ctx.lineTo(x + tw - 1, y + rh * 0.8);
          ctx.quadraticCurveTo(x + tw * 0.5, y + rh * 1.35, x + 1, y + rh * 0.8);
          ctx.closePath();
          ctx.fill();
        }
      }
      noiseOverlay(0.15, 16, 6);
    }
    return finish(c);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Piso circular da arena: anéis concêntricos de lajes + emblema central. UV planar 0..1 no disco.
export function arenaFloorTexture(size = 1024) {
  return cached(`arena${size}`, () => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const rand = mulberry(4242);
    const cx = size / 2;
    const R = size / 2;
    ctx.fillStyle = '#6e6760';
    ctx.fillRect(0, 0, size, size);
    const rings = 11;
    const gap = size * 0.0013;
    for (let i = 0; i < rings; i++) {
      const r0 = (i / rings) * R + (i === 0 ? 0 : gap);
      const r1 = ((i + 1) / rings) * R - gap;
      const segs = i === 0 ? 1 : Math.max(6, Math.round(((i + 0.5) / rings) * 2 * Math.PI * rings * 0.9));
      const ringTone = i % 3 === 2 ? 0.82 : 1;
      for (let s = 0; s < segs; s++) {
        const a0 = (s / segs) * Math.PI * 2 + (i % 2) * (Math.PI / segs);
        const a1 = ((s + 1) / segs) * Math.PI * 2 + (i % 2) * (Math.PI / segs);
        const da = segs > 1 ? gap / ((r0 + r1) / 2) : 0;
        const g = (150 + rand() * 45) * ringTone;
        const warm = rand() * 12;
        ctx.fillStyle = `rgb(${g + warm},${g + warm * 0.5},${g - 6})`;
        ctx.beginPath();
        if (segs === 1) ctx.arc(cx, cx, r1, 0, Math.PI * 2);
        else {
          ctx.arc(cx, cx, r1, a0 + da, a1 - da);
          ctx.arc(cx, cx, r0, a1 - da, a0 + da, true);
        }
        ctx.closePath();
        ctx.fill();
      }
    }
    // emblema central: estrela/rosa dos ventos dourada
    ctx.save();
    ctx.translate(cx, cx);
    const er = R * 0.16;
    ctx.fillStyle = '#b8873a';
    ctx.beginPath();
    ctx.arc(0, 0, er * 1.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#e7c66a';
    ctx.beginPath();
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const rr = k % 2 === 0 ? er * 1.15 : er * 0.42;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#8d5a2b';
    ctx.beginPath();
    ctx.arc(0, 0, er * 0.25, 0, Math.PI * 2);
    ctx.fill();
    // anel decorativo
    ctx.strokeStyle = 'rgba(200,160,90,0.8)';
    ctx.lineWidth = size * 0.006;
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // ruído/sujeira
    const img = ctx.getImageData(0, 0, size, size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const n = (pfbm(x / size, y / size, 8, 4, 17) - 0.5) * 0.35;
        const i = (y * size + x) * 4;
        img.data[i] *= 1 + n;
        img.data[i + 1] *= 1 + n;
        img.data[i + 2] *= 1 + n;
      }
    }
    ctx.putImageData(img, 0, 0);
    return finish(c, { repeat: false });
  });
}

// Lua: disco com crateras.
export function moonTexture(size = 128) {
  return cached(`moon${size}`, () => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, r * 0.2, r, r, r);
    grad.addColorStop(0, 'rgba(250,250,255,1)');
    grad.addColorStop(0.88, 'rgba(225,230,245,1)');
    grad.addColorStop(1, 'rgba(225,230,245,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(r, r, r, 0, Math.PI * 2);
    ctx.fill();
    const rand = mulberry(7);
    for (let i = 0; i < 14; i++) {
      const a = rand() * Math.PI * 2;
      const d = rand() * r * 0.65;
      ctx.fillStyle = `rgba(150,160,185,${0.25 + rand() * 0.3})`;
      ctx.beginPath();
      ctx.arc(r + Math.cos(a) * d, r + Math.sin(a) * d, r * (0.05 + rand() * 0.16), 0, Math.PI * 2);
      ctx.fill();
    }
    return finish(c, { repeat: false, aniso: false });
  });
}

// Brilho radial suave (sprites de chama/halo).
export function glowTexture(size = 64) {
  return cached(`glow${size}`, () => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    const r = size / 2;
    const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    return finish(c, { repeat: false, aniso: false });
  });
}
