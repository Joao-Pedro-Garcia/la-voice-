// Clima: chuva (riscos), neve (flocos) seguindo a câmera, relâmpagos, névoa e transições suaves.
import * as THREE from 'three';
import { terrainHeight } from '../../shared/world.js';
import { worldUniforms } from './common.js';

export const WEATHER_TYPES = ['clear', 'rain', 'snow', 'thunderstorm', 'fog'];

const PRESETS = {
  clear: { overcast: 0, fog: 0, rain: 0, snow: 0, wind: 1, cloudCover: 0.45, dark: 0, wet: 0, snowCover: 0, lightning: 0 },
  rain: { overcast: 0.62, fog: 0.12, rain: 0.8, snow: 0, wind: 1.8, cloudCover: 1, dark: 0.15, wet: 1, snowCover: 0, lightning: 0 },
  snow: { overcast: 0.45, fog: 0.28, rain: 0, snow: 1, wind: 0.8, cloudCover: 1, dark: 0.0, wet: 0, snowCover: 1, lightning: 0 },
  thunderstorm: { overcast: 0.95, fog: 0.18, rain: 1, snow: 0, wind: 3, cloudCover: 1, dark: 0.4, wet: 1, snowCover: 0, lightning: 1 },
  fog: { overcast: 0.3, fog: 1, rain: 0, snow: 0, wind: 0.35, cloudCover: 0.7, dark: 0.05, wet: 0.15, snowCover: 0, lightning: 0 },
};

const VERT = /* glsl */ `
attribute vec3 aOff; attribute float aRand;
uniform vec3 uCam; uniform vec3 uBox; uniform float uTime; uniform float uSpeed; uniform vec2 uWindXZ;
uniform float uSize; uniform float uLen; uniform float uSnow;
varying vec2 vUv; varying float vFade;
void main() {
  float sp = uSpeed * (0.75 + aRand * 0.5);
  vec3 p = aOff * uBox;
  p.y -= uTime * sp;
  p.xz += uWindXZ * uTime * (0.75 + aRand * 0.5);
  p.x += uSnow * sin(uTime * 0.9 + aRand * 31.0) * 0.8;
  p.z += uSnow * cos(uTime * 0.7 + aRand * 17.0) * 0.8;
  vec3 rel = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  vec3 center = uCam + rel;
  vec4 mv = viewMatrix * vec4(center, 1.0);
  vec2 corner = position.xy; // x: -0.5..0.5, y: 0..1
  if (uSnow > 0.5) {
    mv.xy += (corner - vec2(0.0, 0.5)) * max(uSize, -mv.z * 0.004) * (0.6 + aRand * 0.8);
  } else {
    vec3 vel = normalize(vec3(uWindXZ.x, -sp, uWindXZ.y));
    vec3 vv = (viewMatrix * vec4(vel, 0.0)).xyz;
    vec2 d = length(vv.xy) > 1e-3 ? normalize(vv.xy) : vec2(0.0, -1.0);
    vec2 perp = vec2(-d.y, d.x);
    float zz = -mv.z;
    mv.xy += perp * corner.x * max(uSize, zz * 0.0035) + d * (corner.y - 0.5) * max(uLen, zz * 0.07) * (0.7 + aRand * 0.6);
  }
  vFade = smoothstep(0.8, 3.0, -mv.z) * (1.0 - smoothstep(uBox.x * 0.32, uBox.x * 0.5, length(rel.xz)));
  vUv = corner;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uOpacity; uniform float uSnow;
varying vec2 vUv; varying float vFade;
void main() {
  float a;
  if (uSnow > 0.5) {
    vec2 c = vUv - vec2(0.0, 0.5);
    a = (1.0 - smoothstep(0.15, 0.5, length(c)));
  } else {
    a = (1.0 - abs(vUv.x) * 2.0) * smoothstep(0.0, 0.3, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));
  }
  gl_FragColor = vec4(uColor, a * uOpacity * vFade);
}`;

function precipitation(count, box, snow) {
  const quad = new THREE.InstancedBufferGeometry();
  quad.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0.5, 1, 0, -0.5, 1, 0], 3));
  quad.setIndex([0, 1, 2, 0, 2, 3]);
  const off = new Float32Array(count * 3);
  const rnd = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    off[i * 3] = Math.random();
    off[i * 3 + 1] = Math.random();
    off[i * 3 + 2] = Math.random();
    rnd[i] = Math.random();
  }
  quad.setAttribute('aOff', new THREE.InstancedBufferAttribute(off, 3));
  quad.setAttribute('aRand', new THREE.InstancedBufferAttribute(rnd, 1));
  quad.instanceCount = 0;
  const uniforms = {
    uCam: { value: new THREE.Vector3() },
    uBox: { value: new THREE.Vector3(box, box * 0.7, box) },
    uTime: { value: 0 },
    uSpeed: { value: snow ? 1.6 : 22 },
    uWindXZ: { value: new THREE.Vector2(0, 0) },
    uSize: { value: snow ? 0.09 : 0.032 },
    uLen: { value: snow ? 0 : 1.1 },
    uSnow: { value: snow ? 1 : 0 },
    uColor: { value: new THREE.Color(snow ? 0xffffff : 0xb8c4d8) },
    uOpacity: { value: 0 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERT,
    fragmentShader: FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const mesh = new THREE.Mesh(quad, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = 10;
  mesh.name = snow ? 'snow' : 'rain';
  mesh.visible = false;
  return { mesh, uniforms, max: count, geo: quad, mat };
}

export function createWeather(scene, quality) {
  const group = new THREE.Group();
  group.name = 'weather';
  scene.add(group);
  const budget = quality.particleBudget;
  const box = quality.tier === 'low' ? 28 : quality.tier === 'mid' ? 34 : 42;
  const rain = precipitation(Math.min(9000, Math.round(budget * 1.4)), box, false);
  const snow = precipitation(Math.min(7000, Math.round(budget * 0.9)), box, true);
  group.add(rain.mesh, snow.mesh);
  let maxRain = rain.max;
  let maxSnow = snow.max;

  let type = 'clear';
  const target = { ...PRESETS.clear };
  const cur = { ...PRESETS.clear };
  const listeners = new Set();
  let lightningTimer = 6;
  let flash = 0;
  const flashSeq = []; // [startTime, duration, strength]
  let time = 0;
  const windAngle = 0.6;

  function set(t, instant = false) {
    if (!PRESETS[t]) t = 'clear';
    type = t;
    Object.assign(target, PRESETS[t]);
    if (instant) Object.assign(cur, PRESETS[t]);
    if (t === 'thunderstorm') lightningTimer = Math.min(lightningTimer, 3 + Math.random() * 3);
  }

  function strike(camera) {
    const a = Math.random() * Math.PI * 2;
    const d = 50 + Math.random() * 150;
    const x = camera.position.x + Math.cos(a) * d;
    const z = camera.position.z + Math.sin(a) * d;
    const pos = new THREE.Vector3(x, terrainHeight(x, z), z);
    const intensity = 0.6 + Math.random() * 0.4;
    flashSeq.push([time, 0.09, intensity], [time + 0.16, 0.07, intensity * 0.6], [time + 0.3 + Math.random() * 0.2, 0.12, intensity]);
    for (const cb of listeners) {
      try {
        cb({ position: pos, intensity, distance: d });
      } catch (e) {
        console.error(e);
      }
    }
  }

  const approach = (k, rate, dt) => {
    cur[k] += (target[k] - cur[k]) * (1 - Math.exp(-dt * rate));
  };

  // retorna env para o céu
  function update(dt, camera, light) {
    time += dt;
    for (const k of ['overcast', 'fog', 'rain', 'snow', 'wind', 'cloudCover', 'dark', 'lightning']) approach(k, 1.3, dt); // ~3 s
    approach('wet', target.wet > cur.wet ? 0.18 : 0.04, dt);
    approach('snowCover', target.snowCover > cur.snowCover ? 0.07 : 0.05, dt);
    worldUniforms.uWind.value = cur.wind;
    worldUniforms.uWet.value = cur.wet;
    worldUniforms.uSnowCover.value = cur.snowCover;

    // relâmpagos
    if (cur.lightning > 0.5) {
      lightningTimer -= dt;
      if (lightningTimer <= 0) {
        strike(camera);
        lightningTimer = 5 + Math.random() * 10;
      }
    }
    flash = 0;
    for (let i = flashSeq.length - 1; i >= 0; i--) {
      const [t0, dur, str] = flashSeq[i];
      const t = time - t0;
      if (t > dur) {
        flashSeq.splice(i, 1);
        continue;
      }
      if (t >= 0) flash = Math.max(flash, str * (1 - t / dur));
    }

    const wx = Math.cos(windAngle) * cur.wind * 2.2;
    const wz = Math.sin(windAngle) * cur.wind * 2.2;
    for (const [p, amount, max] of [
      [rain, cur.rain, maxRain],
      [snow, cur.snow, maxSnow],
    ]) {
      const n = Math.floor(max * Math.min(1, amount));
      p.geo.instanceCount = n;
      p.mesh.visible = n > 10;
      if (!p.mesh.visible) continue;
      p.uniforms.uCam.value.copy(camera.position);
      p.uniforms.uTime.value = time;
      p.uniforms.uWindXZ.value.set(wx * (p === snow ? 0.6 : 1), wz * (p === snow ? 0.6 : 1));
      const l = Math.max(0.12, light) + flash;
      p.uniforms.uOpacity.value = Math.min(1, amount * 1.5) * (p === snow ? 0.95 : 0.6);
      if (p === snow) p.uniforms.uColor.value.setRGB(l, l, l);
      else p.uniforms.uColor.value.setRGB(l * 1.0, l * 1.05, l * 1.15);
    }

    return {
      overcast: cur.overcast,
      fog: cur.fog,
      dark: cur.dark,
      flash: Math.min(1, flash),
      wind: cur.wind,
      cloudCover: Math.min(1, cur.cloudCover),
    };
  }

  return {
    group,
    set,
    get type() {
      return type;
    },
    update,
    onLightning(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    setQuality(q) {
      maxRain = Math.min(rain.max, Math.round(q.particleBudget * 1.4));
      maxSnow = Math.min(snow.max, Math.round(q.particleBudget * 0.9));
    },
    dispose() {
      scene.remove(group);
      rain.geo.dispose();
      rain.mat.dispose();
      snow.geo.dispose();
      snow.mat.dispose();
      listeners.clear();
    },
  };
}
