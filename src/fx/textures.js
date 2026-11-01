// Texturas de efeitos geradas em <canvas>. Compartilhadas (cache) — nunca descartadas pelos efeitos.
import * as THREE from 'three';
import { mulberry32 } from './util.js';

const cache = new Map();

function make(key, w, h, draw, { srgb = true, repeat = false } = {}) {
  if (cache.has(key)) return cache.get(key);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.userData.shared = true;
  t.needsUpdate = true;
  cache.set(key, t);
  return t;
}

/** Brilho radial suave. */
export function glowTexture() {
  return make('glow', 128, 128, (g, w) => {
    const r = w / 2;
    const grd = g.createRadialGradient(r, r, 0, r, r, r);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.15, 'rgba(255,255,255,0.85)');
    grd.addColorStop(0.4, 'rgba(255,255,255,0.32)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.08)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, w, w);
  });
}

/** Flare com raios (flash de explosão / brilho de raridade). */
export function rayTexture() {
  return make('rays', 256, 256, (g, w) => {
    const r = w / 2, rng = mulberry32(7);
    g.translate(r, r);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2 + rng() * 0.2;
      const len = r * (0.55 + rng() * 0.45);
      const wd = 2 + rng() * 5;
      g.save(); g.rotate(a);
      const grd = g.createLinearGradient(0, 0, len, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0.7)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(0, -wd); g.lineTo(len, 0); g.lineTo(0, wd); g.closePath(); g.fill();
      g.restore();
    }
    const grd = g.createRadialGradient(0, 0, 0, 0, 0, r * 0.5);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(-r, -r, w, w);
  });
}

/**
 * Atlas 2x2 de partículas: 0 = ponto suave, 1 = brilho em estrela, 2 = fumaça, 3 = lasca/confete.
 */
export function particleAtlas() {
  return make('atlas', 256, 256, (g) => {
    const S = 128, rng = mulberry32(42);
    // 0: ponto suave
    let grd = g.createRadialGradient(64, 64, 0, 64, 64, 58);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    grd.addColorStop(0.6, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, S, S);
    // 1: estrela de 4 pontas + núcleo
    g.save(); g.translate(S + 64, 64);
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 2; k++) {
      g.save(); g.rotate(k * Math.PI / 2);
      const lg = g.createLinearGradient(-58, 0, 58, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(255,255,255,1)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(-58, 0); g.lineTo(0, -5); g.lineTo(58, 0); g.lineTo(0, 5); g.closePath(); g.fill();
      g.restore();
    }
    grd = g.createRadialGradient(0, 0, 0, 0, 0, 26);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.fill();
    g.restore();
    // 2: fumaça (blob irregular)
    g.save(); g.translate(64, S + 64);
    for (let i = 0; i < 26; i++) {
      const a = rng() * Math.PI * 2, d = rng() * 26, rr = 14 + rng() * 22;
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      grd = g.createRadialGradient(x, y, 0, x, y, rr);
      grd.addColorStop(0, 'rgba(255,255,255,0.22)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.beginPath(); g.arc(x, y, rr, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    // 3: lasca / confete (retângulo com leve brilho)
    g.save(); g.translate(S + 64, S + 64);
    g.fillStyle = 'rgba(255,255,255,1)';
    g.fillRect(-34, -20, 68, 40);
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(-34, 4, 68, 16);
    g.restore();
  });
}

/** Círculo mágico com runas (branco, colorido via material). */
export function runeCircleTexture(seed = 3) {
  return make('runes' + seed, 512, 512, (g, w) => {
    const r = w / 2, rng = mulberry32(seed);
    g.translate(r, r);
    g.strokeStyle = 'rgba(255,255,255,1)';
    g.fillStyle = 'rgba(255,255,255,1)';
    g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = 8;
    g.lineWidth = 6; g.beginPath(); g.arc(0, 0, r * 0.94, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r * 0.76, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 2; g.beginPath(); g.arc(0, 0, r * 0.5, 0, Math.PI * 2); g.stroke();
    // runas no anel
    const n = 18;
    for (let i = 0; i < n; i++) {
      g.save(); g.rotate((i / n) * Math.PI * 2); g.translate(0, -r * 0.85);
      drawGlyph(g, rng, 20);
      g.restore();
    }
    // estrela interna
    g.lineWidth = 3;
    // hexagrama (dois triângulos)
    for (let t = 0; t < 2; t++) {
      g.beginPath();
      for (let i = 0; i <= 3; i++) {
        const a = (i / 3) * Math.PI * 2 + t * Math.PI / 3 - Math.PI / 2;
        const x = Math.cos(a) * r * 0.74, y = Math.sin(a) * r * 0.74;
        if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      g.beginPath(); g.arc(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, 9, 0, Math.PI * 2); g.stroke();
    }
    g.beginPath(); g.arc(0, 0, r * 0.12, 0, Math.PI * 2); g.stroke();
  });
}

export function drawGlyph(g, rng, s) {
  g.lineWidth = Math.max(2, s * 0.14);
  g.lineCap = 'round';
  g.beginPath();
  const strokes = 2 + Math.floor(rng() * 3);
  for (let k = 0; k < strokes; k++) {
    const type = rng();
    if (type < 0.5) {
      g.moveTo((rng() - 0.5) * s, (rng() - 0.5) * s * 1.4);
      g.lineTo((rng() - 0.5) * s, (rng() - 0.5) * s * 1.4);
    } else if (type < 0.8) {
      const cx = (rng() - 0.5) * s * 0.6, cy = (rng() - 0.5) * s;
      g.moveTo(cx + s * 0.3, cy);
      g.arc(cx, cy, s * 0.3, 0, Math.PI * (1 + rng()));
    } else {
      g.moveTo(-s * 0.4, -s * 0.6); g.lineTo(0, s * 0.6); g.lineTo(s * 0.4, -s * 0.6);
    }
  }
  g.stroke();
}

/** Faixa horizontal de runas (para anéis), alpha nos traços. */
export function runeStripTexture(seed = 11) {
  return make('runestrip' + seed, 1024, 64, (g, w, h) => {
    const rng = mulberry32(seed);
    g.strokeStyle = '#fff';
    g.shadowColor = '#fff'; g.shadowBlur = 6;
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 6); g.lineTo(w, 6); g.moveTo(0, h - 6); g.lineTo(w, h - 6); g.stroke();
    const n = 24;
    for (let i = 0; i < n; i++) {
      g.save(); g.translate((i + 0.5) * (w / n), h / 2);
      drawGlyph(g, rng, 26);
      g.restore();
    }
  }, { repeat: true });
}

/** Faixa de "vento": traços horizontais que somem nas pontas (alpha). */
export function streakTexture() {
  return make('streak', 256, 64, (g, w, h) => {
    const rng = mulberry32(5);
    for (let i = 0; i < 14; i++) {
      const y = 6 + rng() * (h - 12), x = rng() * w * 0.6, len = w * (0.25 + rng() * 0.5), th = 1 + rng() * 3;
      const grd = g.createLinearGradient(x, 0, x + len, 0);
      grd.addColorStop(0, 'rgba(255,255,255,0)');
      grd.addColorStop(0.4, 'rgba(255,255,255,0.9)');
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(x, y, len, th);
    }
  }, { repeat: true });
}

/** Rachaduras luminosas (chão de terremoto / gelo), branco sobre transparente. */
export function crackTexture(seed = 9) {
  return make('crack' + seed, 512, 512, (g, w) => {
    const r = w / 2, rng = mulberry32(seed);
    g.translate(r, r);
    g.strokeStyle = '#fff'; g.lineCap = 'round';
    g.shadowColor = '#fff'; g.shadowBlur = 10;
    const branch = (x, y, a, len, width, depth) => {
      if (depth > 4 || len < 8) return;
      let cx = x, cy = y;
      g.lineWidth = width;
      g.beginPath(); g.moveTo(cx, cy);
      const steps = 6;
      for (let i = 0; i < steps; i++) {
        a += (rng() - 0.5) * 0.7;
        cx += Math.cos(a) * len / steps; cy += Math.sin(a) * len / steps;
        g.lineTo(cx, cy);
        if (rng() < 0.25) branch(cx, cy, a + (rng() < 0.5 ? 0.8 : -0.8), len * 0.5, width * 0.6, depth + 1);
      }
      g.stroke();
    };
    const n = 9;
    for (let i = 0; i < n; i++) branch(0, 0, (i / n) * Math.PI * 2 + rng() * 0.4, r * (0.7 + rng() * 0.25), 7, 0);
  });
}
