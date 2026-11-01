// Terreno: malha única (WORLD_SIZE) com alturas de terrainHeight, splat procedural no fragment
// shader (grama, terra, areia, rocha, neve, caminhos, calçamento), piso da arena e máscara de caminhos.
import * as THREE from 'three';
import { terrainHeight, WORLD_SIZE, WORLD_HALF, WATER_LEVEL, ARENA, VILLAGE, LAKE, RUINS, STRUCTURES } from '../../shared/world.js';
import { worldUniforms } from './common.js';
import { noiseTexture, cobbleTexture, arenaFloorTexture, surfaceTexture } from './textures.js';

// ---------- máscara de caminhos (R = trilha de terra, G = calçamento, B = chão gasto da arena) ----------
export function buildPathMask(size = 1024) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.globalCompositeOperation = 'lighter';
  const k = size / WORLD_SIZE;
  const P = (x, z) => [(x + WORLD_HALF) * k, (z + WORLD_HALF) * k];
  const stroke = (pts, width, color) => {
    // borda suave: traço largo fraco + traço estreito forte
    const passes = [
      [width * 1.7, 0.35],
      [width, 0.65],
    ];
    for (const [w, a] of passes) {
      ctx.strokeStyle = color.replace('A', a);
      ctx.lineWidth = w * k;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach((p, i) => {
        const [px, pz] = P(p[0], p[1]);
        if (i === 0) ctx.moveTo(px, pz);
        else ctx.lineTo(px, pz);
      });
      ctx.stroke();
    }
  };
  const curve = (ax, az, bx, bz, bend = 0.15, seed = 1) => {
    const pts = [];
    const dx = bx - ax;
    const dz = bz - az;
    const nx = -dz;
    const nz = dx;
    for (let i = 0; i <= 24; i++) {
      const t = i / 24;
      const wob = Math.sin(t * Math.PI) * bend + Math.sin(t * Math.PI * 3 + seed) * 0.025 * Math.sin(t * Math.PI);
      pts.push([ax + dx * t + nx * wob, az + dz * t + nz * wob]);
    }
    return pts;
  };
  const RED = 'rgba(255,0,0,A)';
  const GREEN = 'rgba(0,255,0,A)';
  const BLUE = 'rgba(0,0,255,A)';
  // estradas principais
  const toward = (from, to, r) => {
    const d = Math.hypot(to.x - from.x, to.z - from.z);
    return [from.x + ((to.x - from.x) / d) * r, from.z + ((to.z - from.z) / d) * r];
  };
  const [ax, az] = toward(ARENA, VILLAGE, ARENA.wallRadius - 2);
  stroke(curve(ax, az, VILLAGE.x, VILLAGE.z, 0.12, 1), 4, RED);
  const pier = STRUCTURES.find((s) => s.type === 'pier');
  const [lx, lz] = toward(ARENA, { x: pier.x - pier.w / 2, z: pier.z }, ARENA.wallRadius - 2);
  stroke(curve(lx, lz, pier.x - pier.w / 2 - 2, pier.z, -0.1, 2), 3.2, RED);
  const [rx, rz] = toward(ARENA, RUINS, ARENA.wallRadius - 2);
  stroke(curve(rx, rz, RUINS.x - 8, RUINS.z - 8, 0.18, 3), 3, RED);
  const tower = STRUCTURES.find((s) => s.type === 'tower');
  stroke(curve(VILLAGE.x, VILLAGE.z, tower.x, tower.z, 0.1, 4), 3, RED);
  // casas: trilha da porta (face -Z local) até a praça
  for (const s of STRUCTURES) {
    if (s.type !== 'house') continue;
    const dx = -Math.sin(s.rot) * (s.d / 2 + 0.5);
    const dz = -Math.cos(s.rot) * (s.d / 2 + 0.5);
    stroke(curve(s.x + dx, s.z + dz, VILLAGE.x, VILLAGE.z, 0.05, s.x), 2.4, RED);
  }
  // praça calçada
  ctx.fillStyle = 'rgba(0,255,0,1)';
  const [vx, vz] = P(VILLAGE.x, VILLAGE.z);
  ctx.beginPath();
  ctx.arc(vx, vz, 15 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,255,0,0.4)';
  ctx.beginPath();
  ctx.arc(vx, vz, 17 * k, 0, Math.PI * 2);
  ctx.fill();
  stroke(curve(VILLAGE.x, VILLAGE.z, ...toward(VILLAGE, ARENA, 30), 0, 0), 3.2, GREEN);
  // anel gasto em volta da arena
  const [cx, cz] = P(ARENA.x, ARENA.z);
  ctx.strokeStyle = 'rgba(0,0,255,0.7)';
  ctx.lineWidth = (ARENA.wallRadius - ARENA.radius + 1) * k;
  ctx.beginPath();
  ctx.arc(cx, cz, ((ARENA.radius + ARENA.wallRadius) / 2 + 1) * k, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,255,0.3)';
  ctx.lineWidth = (ARENA.wallRadius - ARENA.radius + 7) * k;
  ctx.stroke();
  // chão das ruínas
  const [ux, uz] = P(RUINS.x, RUINS.z);
  ctx.fillStyle = 'rgba(0,0,255,0.35)';
  ctx.beginPath();
  ctx.arc(ux, uz, RUINS.radius * 0.8 * k, 0, Math.PI * 2);
  ctx.fill();
  void BLUE;
  void LAKE;
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return { texture: tex, canvas: c };
}

export function buildTerrain(quality, pathMask) {
  const seg = quality.terrainSegments;
  const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const N = seg + 1;
  const heights = new Float32Array(N * N);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);
    heights[i] = h;
  }
  geo.deleteAttribute('uv');
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geo.computeBoundingBox();

  const noise = noiseTexture(Math.min(512, quality.textureSize));
  const cobble = cobbleTexture(Math.min(512, quality.textureSize));
  const C = (h) => new THREE.Color(h);
  const uniforms = {
    uNoise: { value: noise },
    uMask: { value: pathMask.texture },
    uCobble: { value: cobble },
    uWater: { value: WATER_LEVEL },
    uHalf: { value: WORLD_HALF },
    uGrassA: { value: C('#5aa23a') },
    uGrassB: { value: C('#a5c552') },
    uGrassDark: { value: C('#2f7034') },
    uDirt: { value: C('#8b6a45') },
    uPath: { value: C('#b39467') },
    uSand: { value: C('#e0cc94') },
    uWetSand: { value: C('#7d7a55') },
    uRock: { value: C('#8d867c') },
    uRockDark: { value: C('#5c5751') },
    uSnow: { value: C('#f4f7fc') },
    uSnowCover: worldUniforms.uSnowCover,
    uWet: worldUniforms.uWet,
  };
  const Mat = quality.tier === 'low' ? THREE.MeshLambertMaterial : THREE.MeshStandardMaterial;
  const mat = new Mat({ color: 0xffffff });
  if (mat.isMeshStandardMaterial) {
    mat.roughness = 0.95;
    mat.metalness = 0;
  }
  mat.name = 'terrain';
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vTW;\nvarying vec3 vTN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvTN = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vTW; varying vec3 vTN;
uniform sampler2D uNoise; uniform sampler2D uMask; uniform sampler2D uCobble;
uniform float uWater; uniform float uHalf; uniform float uSnowCover; uniform float uWet;
uniform vec3 uGrassA; uniform vec3 uGrassB; uniform vec3 uGrassDark; uniform vec3 uDirt; uniform vec3 uPath;
uniform vec3 uSand; uniform vec3 uWetSand; uniform vec3 uRock; uniform vec3 uRockDark; uniform vec3 uSnow;
float gRockT;`
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec2 wp = vTW.xz;
  vec4 nBig = texture2D(uNoise, wp * 0.0045);
  vec4 nMid = texture2D(uNoise, wp * 0.031);
  vec4 nFine = texture2D(uNoise, wp * 0.23);
  float big = nBig.g; float mid = nMid.r; float fine = nFine.r;
  vec3 N = normalize(vTN);
  float slope = 1.0 - N.y;
  float h = vTW.y;
  vec3 grass = mix(uGrassDark, uGrassA, smoothstep(0.28, 0.62, big + (mid - 0.5) * 0.3));
  grass = mix(grass, uGrassB, smoothstep(0.58, 0.78, mid * 0.55 + nBig.r * 0.6) * 0.8);
  grass *= 0.82 + fine * 0.34 + nFine.b * 0.08;
  vec3 col = grass;
  float dirtT = smoothstep(0.66, 0.8, nMid.g * 0.7 + nBig.r * 0.45) * 0.75;
  col = mix(col, uDirt * (0.8 + fine * 0.4), dirtT);
  float sandT = 1.0 - smoothstep(uWater + 0.5, uWater + 1.6 + mid * 1.4, h);
  col = mix(col, uSand * (0.88 + fine * 0.24), sandT);
  col = mix(col, uWetSand * (0.85 + fine * 0.3), 1.0 - smoothstep(uWater - 1.4, uWater + 0.15, h));
  float rockT = smoothstep(0.30, 0.46, slope + (mid - 0.5) * 0.18);
  rockT = max(rockT, smoothstep(40.0, 58.0, h + mid * 10.0) * 0.85);
  vec3 rockC = mix(uRockDark, uRock, smoothstep(0.3, 0.7, fine + (nMid.g - 0.5) * 0.6));
  rockC *= 0.88 + 0.12 * sin(h * 1.3 + mid * 5.0);
  col = mix(col, rockC, rockT);
  gRockT = rockT;
  vec4 mask = texture2D(uMask, (wp + uHalf) / (2.0 * uHalf));
  float pathT = smoothstep(0.15, 0.6, mask.r + (fine - 0.5) * 0.3) * (1.0 - rockT * 0.5);
  vec3 pathC = uPath * (0.8 + fine * 0.35) * (1.0 - nFine.b * 0.25);
  col = mix(col, pathC, pathT);
  vec3 cob = texture2D(uCobble, wp * 0.32).rgb * vec3(1.02, 0.98, 0.92);
  col = mix(col, cob, smoothstep(0.2, 0.6, mask.g + (fine - 0.5) * 0.25));
  float arenaT = smoothstep(0.15, 0.7, mask.b + (mid - 0.5) * 0.5);
  col = mix(col, mix(uDirt, uRock, 0.35) * (0.8 + fine * 0.4), arenaT * 0.85);
  float snowT = smoothstep(62.0, 72.0, h + mid * 14.0) * smoothstep(0.35, 0.65, N.y);
  snowT = max(snowT, uSnowCover * smoothstep(0.55, 0.85, N.y + (fine - 0.5) * 0.3) * step(uWater + 0.1, h));
  col = mix(col, uSnow * (0.93 + fine * 0.07), snowT);
  col *= 1.0 - uWet * 0.3 * (1.0 - snowT);
  diffuseColor.rgb = col;
}`
      );
    if (mat.isMeshStandardMaterial) {
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.35 + gRockT * 0.2, uWet * 0.8);'
      );
    }
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.matrixAutoUpdate = false;

  // Heightmap (meio-float, filtro linear) para a grama posicionada na GPU.
  const half = new Uint16Array(N * N);
  for (let i = 0; i < heights.length; i++) half[i] = THREE.DataUtils.toHalfFloat(heights[i]);
  const heightTex = new THREE.DataTexture(half, N, N, THREE.RedFormat, THREE.HalfFloatType);
  heightTex.magFilter = THREE.LinearFilter;
  heightTex.minFilter = THREE.LinearFilter;
  heightTex.wrapS = heightTex.wrapT = THREE.ClampToEdgeWrapping;
  heightTex.needsUpdate = true;
  const heightInfo = { texture: heightTex, N, step: WORLD_SIZE / seg, half: WORLD_HALF };

  return {
    mesh,
    heightInfo,
    dispose() {
      geo.dispose();
      mat.dispose();
      heightTex.dispose();
    },
  };
}

// Piso de lajes da arena + meio-fio de pedra.
export function buildArenaFloor(quality) {
  const group = new THREE.Group();
  group.name = 'arena-floor';
  const y = terrainHeight(ARENA.x, ARENA.z);
  const tex = arenaFloorTexture(Math.max(512, Math.min(2048, quality.textureSize * 2)));
  const floorMat = new THREE.MeshStandardMaterial({
    map: tex,
    roughness: 0.82,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  floorMat.name = 'arena-floor';
  floorMat.onBeforeCompile = (shader) => {
    shader.uniforms.uWet = worldUniforms.uWet;
    shader.uniforms.uSnowCover = worldUniforms.uSnowCover;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uWet; uniform float uSnowCover;')
      .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - uWet * 0.3), vec3(0.92,0.94,0.97), uSnowCover * 0.85);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, uWet);');
  };
  const floor = new THREE.Mesh(new THREE.CircleGeometry(ARENA.radius, quality.detail === 0 ? 48 : 96), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(ARENA.x, y + 0.03, ARENA.z);
  floor.receiveShadow = true;
  group.add(floor);
  // meio-fio
  const r = ARENA.radius;
  const prof = [
    new THREE.Vector2(r - 0.05, -0.3),
    new THREE.Vector2(r - 0.05, 0.22),
    new THREE.Vector2(r + 0.1, 0.34),
    new THREE.Vector2(r + 0.75, 0.34),
    new THREE.Vector2(r + 0.95, 0.2),
    new THREE.Vector2(r + 0.95, -0.4),
  ];
  const curbGeo = new THREE.LatheGeometry(prof, quality.detail === 0 ? 64 : 128);
  const tile = 1.2;
  // UV: u ao longo da circunferência, v pelo perfil
  const uv = curbGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * Math.PI * 2 * r) / (tile * 3), uv.getY(i) * 0.6);
  const stoneMat = new THREE.MeshStandardMaterial({ map: surfaceTexture('stone', Math.min(512, quality.textureSize)), color: 0xd8d2c8, roughness: 0.9 });
  const curb = new THREE.Mesh(curbGeo, stoneMat);
  curb.position.set(ARENA.x, y, ARENA.z);
  curb.receiveShadow = true;
  curb.castShadow = quality.detail > 0;
  group.add(curb);
  group.traverse((o) => {
    o.matrixAutoUpdate = false;
    o.updateMatrix();
  });
  return {
    group,
    dispose() {
      floor.geometry.dispose();
      floorMat.dispose();
      curbGeo.dispose();
      stoneMat.dispose();
    },
  };
}

