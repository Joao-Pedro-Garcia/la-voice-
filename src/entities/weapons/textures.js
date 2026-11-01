// Texturas procedurais das armas (canvas). Compartilhadas por cache; nunca descartadas por arma.
import * as THREE from 'three';
import { mulberry32 } from '../../fx/util.js';
import { drawGlyph } from '../../fx/textures.js';

const cache = new Map();

function tex(key, w, h, draw, { srgb = true, wrap = true } = {}) {
  const k = `${key}:${w}x${h}`;
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (wrap) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.userData.shared = true;
  cache.set(k, t);
  return t;
}

/** tamanho base das texturas conforme a qualidade (textureSize padrão 512, máx. 1024) */
export function texSize(quality) {
  const ts = Math.min(1024, quality?.textureSize || 512);
  return Math.max(64, Math.min(256, Math.round(ts / 4)));
}

// Ruído: um ladrilho pequeno gerado uma vez e aplicado como padrão (sem getImageData).
let noiseTile = null;
function getNoiseTile() {
  if (noiseTile) return noiseTile;
  const N = 64;
  noiseTile = document.createElement('canvas');
  noiseTile.width = noiseTile.height = N;
  const g = noiseTile.getContext('2d');
  const img = g.createImageData(N, N);
  const rng = mulberry32(99);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (rng() * 255) | 0;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return noiseTile;
}

function noiseFill(g, w, h, rng, alpha) {
  g.save();
  g.globalAlpha = Math.min(1, alpha * 2.2);
  g.globalCompositeOperation = 'overlay';
  g.fillStyle = g.createPattern(getNoiseTile(), 'repeat');
  g.fillRect(0, 0, w, h);
  g.restore();
}

/** Aço damasco: faixas onduladas ao longo da lâmina (u = largura, v = comprimento). */
export function damascusTexture(S, tint = [200, 206, 214]) {
  return tex('damascus' + tint.join(','), S, S * 2, (g, w, h) => {
    const rng = mulberry32(21);
    g.fillStyle = `rgb(${tint.map((c) => c * 0.9).join(',')})`; g.fillRect(0, 0, w, h);
    const bands = 22;
    const ph = [rng() * 6, rng() * 6];
    g.lineWidth = w / bands * 0.55;
    for (let b = -2; b < bands + 2; b++) {
      const light = b % 2 === 0;
      g.strokeStyle = light ? `rgba(255,255,255,0.22)` : `rgba(0,0,0,0.16)`;
      g.beginPath();
      const steps = 24;
      for (let i = 0; i <= steps; i++) {
        const v = i / steps;
        const x = (b / bands) * w + (Math.sin(v * 9 + ph[0]) * 0.09 + Math.sin(v * 31 + b * 0.7 + ph[1]) * 0.03) * w;
        if (i) g.lineTo(x, v * h); else g.moveTo(x, 0);
      }
      g.stroke();
    }
    noiseFill(g, w, h, rng, 0.04);
  });
}

/** Aço escovado (riscos longitudinais). */
export function brushedTexture(S, tint = [190, 196, 204]) {
  return tex('brushed' + tint.join(','), S, S, (g, w, h) => {
    const rng = mulberry32(5);
    g.fillStyle = `rgb(${tint.join(',')})`; g.fillRect(0, 0, w, h);
    for (let i = 0; i < w * 3; i++) {
      const x = rng() * w, l = h * (0.2 + rng() * 0.8), y = rng() * h;
      const c = rng() < 0.5 ? 255 : 0;
      g.strokeStyle = `rgba(${c},${c},${c},${0.03 + rng() * 0.06})`;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rng() - 0.5) * 2, y + l); g.stroke();
    }
  });
}

/** Madeira com veios (v = comprimento). */
export function woodTexture(S, base = [118, 76, 44]) {
  return tex('wood' + base.join(','), S, S * 2, (g, w, h) => {
    const rng = mulberry32(13);
    g.fillStyle = `rgb(${base.map((c) => c * 0.85).join(',')})`; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 18; k++) {
      const x0 = rng() * w, dark = rng() < 0.5;
      g.strokeStyle = dark ? 'rgba(0,0,0,0.18)' : 'rgba(255,220,180,0.10)';
      g.lineWidth = 1 + rng() * w * 0.05;
      g.beginPath();
      for (let i = 0; i <= 16; i++) { const v = i / 16; const x = x0 + Math.sin(v * 6 + k) * w * 0.05; if (i) g.lineTo(x, v * h); else g.moveTo(x, 0); }
      g.stroke();
    }
    noiseFill(g, w, h, rng, 0.05);
  });
}

/** Couro trançado em diagonal (envoltório de cabo). */
export function leatherWrapTexture(S, base = [92, 52, 30]) {
  return tex('leather' + base.join(','), S, S, (g, w, h) => {
    const rng = mulberry32(8);
    g.fillStyle = `rgb(${base.map((c) => c * 0.45).join(',')})`; g.fillRect(0, 0, w, h);
    const bands = 6, bw = h / bands;
    for (let b = -2; b < bands + 2; b++) {
      g.save();
      g.translate(0, b * bw);
      g.transform(1, 0.5, 0, 1, 0, 0);
      const grd = g.createLinearGradient(0, 0, 0, bw);
      grd.addColorStop(0, `rgb(${base.map((c) => c * 0.6).join(',')})`);
      grd.addColorStop(0.45, `rgb(${base.map((c) => Math.min(255, c * 1.25)).join(',')})`);
      grd.addColorStop(1, `rgb(${base.map((c) => c * 0.55).join(',')})`);
      g.fillStyle = grd;
      g.fillRect(0, 2, w, bw - 4);
      g.restore();
    }
    noiseFill(g, w, h, rng, 0.08);
  });
}

/** Tsuka-ito (katana): losangos de seda sobre pele de raia. */
export function itoTexture(S, silk = [28, 30, 46], same = [235, 230, 214]) {
  return tex('ito' + silk.join(','), S, S, (g, w, h) => {
    const rng = mulberry32(17);
    g.fillStyle = `rgb(${same.join(',')})`; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(255,255,255,${rng() * 0.5})`; g.beginPath(); g.arc(rng() * w, rng() * h, 0.6 + rng() * 1.2, 0, 7); g.fill(); }
    g.lineWidth = w * 0.42;
    g.strokeStyle = `rgb(${silk.join(',')})`;
    for (let k = -2; k <= 2; k++) {
      g.beginPath(); g.moveTo(k * w, 0); g.lineTo(k * w + w, h); g.stroke();
      g.beginPath(); g.moveTo(k * w + w, 0); g.lineTo(k * w, h); g.stroke();
    }
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(255,255,255,0.18)';
    for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(k * w + w * 0.06, 0); g.lineTo(k * w + w * 1.06, h); g.stroke(); }
    noiseFill(g, w, h, rng, 0.04);
  });
}

/** Ouro com filigrana gravada. */
export function goldTexture(S) {
  return tex('gold', S, S, (g, w, h) => {
    const rng = mulberry32(31);
    g.fillStyle = 'rgb(232,184,92)'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(110,70,20,0.55)'; g.lineWidth = Math.max(1, w / 128);
    for (let i = 0; i < 18; i++) {
      const x = rng() * w, y = rng() * h, r = w * (0.05 + rng() * 0.08);
      g.beginPath(); g.arc(x, y, r, rng() * 6, rng() * 6 + 3.5); g.stroke();
      g.beginPath(); g.arc(x + r * 0.8, y, r * 0.5, 0, 4); g.stroke();
    }
    noiseFill(g, w, h, rng, 0.05);
  });
}

/** Padrões de emissão por elemento (branco = brilha). u = largura, v = comprimento. */
export function elementPatternTexture(element, S) {
  return tex('pattern-' + element, S, S * 2, (g, w, h) => {
    const rng = mulberry32(element.length * 97 + 3);
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineCap = 'round';
    const crack = (x, y, a, len, width, depth, wobble = 0.6) => {
      if (depth > 4) return;
      g.lineWidth = width;
      g.beginPath(); g.moveTo(x, y);
      for (let i = 0; i < 8; i++) {
        a += (rng() - 0.5) * wobble;
        x += Math.cos(a) * len / 8; y += Math.sin(a) * len / 8;
        g.lineTo(x, y);
        if (rng() < 0.18) { g.stroke(); crack(x, y, a + (rng() - 0.5) * 2, len * 0.5, width * 0.6, depth + 1, wobble); g.lineWidth = width; g.beginPath(); g.moveTo(x, y); }
      }
      g.stroke();
    };
    switch (element) {
      case 'fire': {
        g.shadowColor = '#fff'; g.shadowBlur = 6;
        for (let i = 0; i < 9; i++) crack(rng() * w, rng() * h, Math.PI / 2 + (rng() - 0.5), h * 0.35, w * 0.035, 0, 1.0);
        // borda incandescente
        const grd = g.createLinearGradient(0, 0, w, 0);
        grd.addColorStop(0, 'rgba(255,255,255,0.95)'); grd.addColorStop(0.12, 'rgba(255,255,255,0)');
        grd.addColorStop(0.88, 'rgba(255,255,255,0)'); grd.addColorStop(1, 'rgba(255,255,255,0.95)');
        g.shadowBlur = 0; g.fillStyle = grd; g.fillRect(0, 0, w, h);
        break;
      }
      case 'lightning': {
        g.shadowColor = '#fff'; g.shadowBlur = 5;
        for (let i = 0; i < 6; i++) crack(w * (0.3 + rng() * 0.4), rng() * h * 0.2, Math.PI / 2, h * 0.9, w * 0.025, 0, 1.4);
        g.fillRect(w * 0.47, 0, w * 0.06, h);
        break;
      }
      case 'poison': {
        for (let i = 0; i < 70; i++) {
          const x = rng() * w, y = rng() * h, r = w * (0.01 + rng() * 0.05);
          const grd = g.createRadialGradient(x, y, 0, x, y, r);
          grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = grd; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
        }
        break;
      }
      case 'arcane': {
        g.shadowColor = '#fff'; g.shadowBlur = 4;
        g.lineWidth = w * 0.02;
        g.beginPath(); g.moveTo(w * 0.5, 0); g.lineTo(w * 0.5, h); g.stroke();
        const n = 12;
        for (let i = 0; i < n; i++) { g.save(); g.translate(w * 0.5, (i + 0.5) * h / n); drawGlyph(g, rng, w * 0.22); g.restore(); }
        break;
      }
      case 'light': {
        g.lineWidth = w * 0.015;
        for (let i = 0; i < 30; i++) { const y = rng() * h; g.beginPath(); g.arc(w * 0.5, y, w * (0.08 + rng() * 0.18), rng() * 6, rng() * 6 + 2.5); g.stroke(); }
        g.fillRect(w * 0.48, 0, w * 0.04, h);
        break;
      }
      case 'shadow': {
        g.shadowColor = '#fff'; g.shadowBlur = 8;
        for (let i = 0; i < 7; i++) crack(rng() * w, h, -Math.PI / 2 + (rng() - 0.5) * 0.4, h * 0.6, w * 0.02, 1, 0.35);
        break;
      }
      case 'water': {
        g.lineWidth = w * 0.02;
        for (let i = 0; i < 26; i++) {
          const y0 = rng() * h; g.beginPath();
          for (let x = 0; x <= w; x += 2) g.lineTo(x, y0 + Math.sin(x / w * 6.28 * 1.5 + i) * h * 0.012);
          g.stroke();
        }
        break;
      }
      case 'wind': {
        g.lineWidth = w * 0.018;
        for (let i = 0; i < 16; i++) { const y = rng() * h; g.beginPath(); g.ellipse(w * 0.5, y, w * 0.35, h * 0.03, 0.3, rng() * 3, rng() * 3 + 3); g.stroke(); }
        break;
      }
      case 'ice': {
        g.lineWidth = w * 0.012;
        for (let i = 0; i < 26; i++) {
          const x = rng() * w, y = rng() * h, r = w * (0.06 + rng() * 0.12);
          for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); g.stroke(); }
        }
        break;
      }
      case 'earth': {
        for (let i = 0; i < 6; i++) crack(rng() * w, rng() * h, rng() * 6, h * 0.25, w * 0.03, 1, 1.2);
        break;
      }
      default: break;
    }
  }, { srgb: false });
}

/** Superfícies "base" por elemento (map de cor). */
export function elementSurfaceTexture(element, S) {
  return tex('surface-' + element, S, S * 2, (g, w, h) => {
    const rng = mulberry32(element.length * 31 + 7);
    const fill = (rgb) => { g.fillStyle = `rgb(${rgb.join(',')})`; g.fillRect(0, 0, w, h); };
    if (element === 'earth') {
      fill([128, 108, 84]);
      for (let i = 0; i < 260; i++) {
        const x = rng() * w, y = rng() * h, r = w * (0.02 + rng() * 0.08), c = 70 + rng() * 90;
        g.fillStyle = `rgba(${c},${c * 0.85},${c * 0.65},0.5)`; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      noiseFill(g, w, h, rng, 0.14);
    } else if (element === 'poison') {
      fill([70, 82, 64]);
      for (let i = 0; i < 160; i++) {
        const x = rng() * w, y = rng() * h, r = w * (0.02 + rng() * 0.07);
        g.fillStyle = rng() < 0.5 ? 'rgba(60,110,40,0.55)' : 'rgba(30,34,26,0.6)'; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      noiseFill(g, w, h, rng, 0.12);
    } else if (element === 'ice') {
      fill([206, 236, 250]);
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 1;
      for (let i = 0; i < 90; i++) { const x = rng() * w, y = rng() * h, l = w * (0.05 + rng() * 0.2), a = rng() * 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
      noiseFill(g, w, h, rng, 0.06);
    } else if (element === 'shadow') {
      fill([24, 20, 32]);
      for (let i = 0; i < 40; i++) { const x = rng() * w, y = rng() * h, r = w * 0.2; const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(70,50,110,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, w, h); }
    } else {
      fill([200, 200, 200]);
      noiseFill(g, w, h, rng, 0.05);
    }
  });
}

/** Painéis sci-fi: linhas de painel e rebites. */
export function panelTexture(S, base = [210, 214, 222]) {
  return tex('panel' + base.join(','), S, S, (g, w, h) => {
    const rng = mulberry32(77);
    g.fillStyle = `rgb(${base.join(',')})`; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = Math.max(1, w / 128);
    for (let i = 0; i < 7; i++) {
      const x = rng() * w, y = rng() * h, pw = w * (0.2 + rng() * 0.5), ph = h * (0.1 + rng() * 0.3);
      g.strokeRect(x, y, pw, ph);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      for (const [cx, cy] of [[x + 3, y + 3], [x + pw - 3, y + 3], [x + 3, y + ph - 3], [x + pw - 3, y + ph - 3]]) { g.beginPath(); g.arc(cx, cy, Math.max(1, w / 160), 0, 7); g.fill(); }
    }
    noiseFill(g, w, h, rng, 0.03);
  });
}

/** Neve/estrela (sprite de floco). */
export function snowflakeTexture() {
  return tex('snowflake', 64, 64, (g, w) => {
    g.translate(w / 2, w / 2);
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.lineCap = 'round';
    g.shadowColor = '#fff'; g.shadowBlur = 6;
    for (let k = 0; k < 6; k++) {
      g.save(); g.rotate(k * Math.PI / 3);
      g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -26);
      g.moveTo(0, -14); g.lineTo(-7, -21); g.moveTo(0, -14); g.lineTo(7, -21);
      g.stroke(); g.restore();
    }
  }, { wrap: false });
}

// ---------- Ambiente de estúdio (cube map) para metais ----------
let envCube = null;
export function studioEnvMap() {
  if (envCube) return envCube;
  const S = 64;
  const faces = [];
  const draw = (fn) => { const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d'); fn(g); return c; };
  const side = (soft) => draw((g) => {
    const grd = g.createLinearGradient(0, 0, 0, S);
    grd.addColorStop(0, '#b9c6d6'); grd.addColorStop(0.48, '#e9eef2'); grd.addColorStop(0.52, '#6c6660'); grd.addColorStop(1, '#2c2826');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    if (soft) {
      const r = g.createRadialGradient(S * soft, S * 0.3, 0, S * soft, S * 0.3, S * 0.3);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, S, S);
    }
  });
  faces.push(side(0.3), side(0.7), draw((g) => { g.fillStyle = '#f4f8ff'; g.fillRect(0, 0, S, S); }), draw((g) => { g.fillStyle = '#2a2624'; g.fillRect(0, 0, S, S); }), side(0.5), side(0));
  envCube = new THREE.CubeTexture(faces);
  envCube.colorSpace = THREE.SRGBColorSpace;
  envCube.needsUpdate = true;
  envCube.userData.shared = true;
  return envCube;
}
