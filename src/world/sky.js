// Céu (domo em gradiente com sol/halo), estrelas, lua, nuvens instanciadas, luzes (sol/lua +
// hemisfério), névoa, e a paleta do ciclo dia/noite (madrugada, dia, pôr do sol, noite azulada).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { mergeVerticesSimple } from './common.js';
import { moonTexture } from './textures.js';

const C = (h) => new THREE.Color(h);

// Quadros-chave pela elevação do sol (seno da altitude).
const KEYS = [
  { e: -1.0, zen: '#060c22', hor: '#1d2c50', fog: '#1a2846', sun: '#9fb6ff', sunI: 0, hemiS: '#5a74b8', hemiG: '#1c2236', hemiI: 0.9, cloud: '#3a4566' },
  { e: -0.22, zen: '#08102a', hor: '#21325a', fog: '#1e2c4c', sun: '#9fb6ff', sunI: 0, hemiS: '#5a74b8', hemiG: '#1c2236', hemiI: 0.9, cloud: '#3c4769' },
  { e: -0.08, zen: '#18275a', hor: '#5c5684', fog: '#4a4a70', sun: '#ff8f6b', sunI: 0, hemiS: '#6a74b0', hemiG: '#2a2636', hemiI: 0.8, cloud: '#6d6688' },
  { e: 0.0, zen: '#35569c', hor: '#f49166', fog: '#d39a82', sun: '#ff8550', sunI: 0.4, hemiS: '#8c90c8', hemiG: '#4a3a34', hemiI: 0.8, cloud: '#f2a99a' },
  { e: 0.1, zen: '#4a7fcc', hor: '#ffc28e', fog: '#efc3a0', sun: '#ffae6e', sunI: 2.0, hemiS: '#a9c4ee', hemiG: '#6d5a44', hemiI: 0.95, cloud: '#ffe0c8' },
  { e: 0.3, zen: '#3d82df', hor: '#a9d5f7', fog: '#bcdcf3', sun: '#fff0d6', sunI: 2.9, hemiS: '#b9dcff', hemiG: '#7a6a4c', hemiI: 1.05, cloud: '#ffffff' },
  { e: 1.0, zen: '#2c72dc', hor: '#9dcff8', fog: '#b4d7f3', sun: '#fff7ea', sunI: 3.2, hemiS: '#c0e0ff', hemiG: '#7d6e50', hemiI: 1.1, cloud: '#ffffff' },
].map((k) => ({ ...k, zen: C(k.zen), hor: C(k.hor), fog: C(k.fog), sun: C(k.sun), hemiS: C(k.hemiS), hemiG: C(k.hemiG), cloud: C(k.cloud) }));

function samplePalette(e, out) {
  let i = 0;
  while (i < KEYS.length - 2 && e > KEYS[i + 1].e) i++;
  const a = KEYS[i];
  const b = KEYS[i + 1];
  let t = (e - a.e) / (b.e - a.e);
  t = Math.min(1, Math.max(0, t));
  t = t * t * (3 - 2 * t);
  for (const k of ['zen', 'hor', 'fog', 'sun', 'hemiS', 'hemiG', 'cloud']) out[k].copy(a[k]).lerp(b[k], t);
  out.sunI = a.sunI + (b.sunI - a.sunI) * t;
  out.hemiI = a.hemiI + (b.hemiI - a.hemiI) * t;
  return out;
}

export function sunDirection(hours, out = new THREE.Vector3()) {
  const th = ((hours - 6) / 24) * Math.PI * 2; // 6h nasce (leste=+X), 12h zênite, 18h põe
  const el = Math.sin(th);
  const az = Math.cos(th);
  // órbita inclinada para o sol não passar exatamente pelo zênite (sombras mais bonitas)
  out.set(az, el * 0.93, -0.37 * Math.abs(el) - 0.25 * (1 - Math.abs(el)));
  return out.normalize();
}

const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = position;
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround;
uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSunVis;
uniform vec3 uMoonDir; uniform float uNight; uniform float uFlash; uniform float uOvercast;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  float t = pow(clamp(h, 0.0, 1.0), 0.5);
  vec3 col = mix(uHorizon, uZenith, t);
  col = mix(col, uGround, (1.0 - smoothstep(-0.25, 0.0, h)));
  float sd = max(dot(d, uSunDir), 0.0);
  // brilho do horizonte do lado do sol (pôr do sol)
  float hz = (1.0 - abs(h)) ; hz = hz * hz * hz;
  col += uSunColor * pow(sd, 3.0) * hz * 0.35 * uSunVis * (1.0 - uOvercast * 0.8);
  col += uSunColor * (pow(sd, 12.0) * 0.35 + pow(sd, 120.0) * 0.6) * uSunVis * (1.0 - uOvercast * 0.85);
  col += uSunColor * smoothstep(0.99955, 0.99975, sd) * 6.0 * uSunVis * (1.0 - uOvercast);
  float md = max(dot(d, uMoonDir), 0.0);
  col += vec3(0.45, 0.55, 0.85) * pow(md, 24.0) * 0.18 * uNight * (1.0 - uOvercast * 0.7);
  col += uFlash * vec3(0.55, 0.6, 0.8);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const STAR_VERT = /* glsl */ `
attribute float aSize; attribute float aPhase;
uniform float uTime; uniform float uPixel;
varying float vTw;
void main() {
  vTw = 0.6 + 0.4 * sin(uTime * (1.5 + aPhase) + aPhase * 10.0);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
  gl_PointSize = aSize * uPixel;
}`;
const STAR_FRAG = /* glsl */ `
uniform float uOpacity; varying float vTw;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float a = (1.0 - smoothstep(0.0, 0.5, length(c)));
  gl_FragColor = vec4(vec3(0.9, 0.93, 1.0) * 1.6, a * uOpacity * vTw);
}`;

function cloudGeometry(seed, detail) {
  let s = seed;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
  const parts = [];
  const n = 5 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const r = 0.45 + rnd() * 0.45 * (1 - Math.abs(i - n / 2) / n);
    const g = new THREE.IcosahedronGeometry(r, detail);
    const x = (i / (n - 1) - 0.5) * 2.4 + (rnd() - 0.5) * 0.3;
    g.translate(x, (rnd() - 0.2) * 0.25, (rnd() - 0.5) * 0.7);
    parts.push(g);
  }
  const merged = mergeGeometries(parts.map((g) => {
    g.deleteAttribute('uv');
    return g;
  }));
  parts.forEach((g) => g.dispose());
  const m = mergeVerticesSimple(merged);
  merged.dispose();
  // base achatada
  const pos = m.attributes.position;
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) < -0.15) pos.setY(i, -0.15 - (pos.getY(i) + 0.15) * 0.15);
  m.computeVertexNormals();
  return m;
}

export function createSky(scene, quality) {
  const group = new THREE.Group();
  group.name = 'sky';
  scene.add(group);

  // ---- domo ----
  const skyUniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color() },
    uSunVis: { value: 1 },
    uMoonDir: { value: new THREE.Vector3(0, -1, 0) },
    uNight: { value: 0 },
    uFlash: { value: 0 },
    uOvercast: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
  });
  const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
  skyMesh.frustumCulled = false;
  skyMesh.renderOrder = -1000;
  skyMesh.name = 'sky-dome';
  group.add(skyMesh);

  // ---- estrelas ----
  const starCount = quality.tier === 'low' ? 500 : quality.tier === 'mid' ? 900 : 1600;
  const sp = new Float32Array(starCount * 3);
  const ss = new Float32Array(starCount);
  const sph = new Float32Array(starCount);
  let seed = 12345;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < starCount; i++) {
    const u = rnd();
    const y = 0.02 + u * 0.98;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - y * y);
    sp.set([Math.cos(a) * r, y, Math.sin(a) * r], i * 3);
    ss[i] = 1 + Math.pow(rnd(), 6) * 3.2;
    sph[i] = rnd() * 3;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(ss, 1));
  starGeo.setAttribute('aPhase', new THREE.BufferAttribute(sph, 1));
  const starMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPixel: { value: 1 } },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: false,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  stars.renderOrder = -999;
  group.add(stars);

  // ---- lua ----
  const moonMat = new THREE.MeshBasicMaterial({ map: moonTexture(128), transparent: true, depthWrite: false, fog: false, color: 0xffffff });
  const moon = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), moonMat);
  moon.frustumCulled = false;
  moon.renderOrder = -998;
  group.add(moon);

  // ---- nuvens ----
  const cloudMax = { low: 10, mid: 16, high: 24, ultra: 32 }[quality.tier] || 16;
  const cloudGeo = cloudGeometry(7, quality.detail >= 2 ? 2 : 1);
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(0x000000), fog: true });
  cloudMat.name = 'clouds';
  const clouds = new THREE.InstancedMesh(cloudGeo, cloudMat, cloudMax);
  clouds.frustumCulled = false;
  clouds.name = 'clouds';
  const cloudData = [];
  for (let i = 0; i < cloudMax; i++) {
    cloudData.push({
      x: (rnd() * 2 - 1) * 420,
      z: (rnd() * 2 - 1) * 420,
      y: 120 + rnd() * 50,
      s: 22 + rnd() * 26,
      sy: 0.45 + rnd() * 0.3,
      rot: rnd() * Math.PI,
      vis: rnd(),
    });
  }
  group.add(clouds);

  // ---- luzes ----
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.name = 'sun';
  const hemi = new THREE.HemisphereLight(0xbfdfff, 0x6d5a44, 1);
  hemi.name = 'hemi';
  scene.add(sun, sun.target, hemi);
  const shadowHalf = { low: 30, mid: 38, high: 55, ultra: 75 };
  let curShadowHalf = 40;
  function configureShadows(q) {
    sun.castShadow = !!q.shadows;
    curShadowHalf = shadowHalf[q.tier] || 40;
    const cam = sun.shadow.camera;
    cam.left = -curShadowHalf;
    cam.right = curShadowHalf;
    cam.top = curShadowHalf;
    cam.bottom = -curShadowHalf;
    cam.near = 1;
    cam.far = 500;
    cam.updateProjectionMatrix();
    if (sun.shadow.mapSize.x !== q.shadowMapSize) {
      sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      if (sun.shadow.map) {
        sun.shadow.map.dispose();
        sun.shadow.map = null;
      }
    }
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04 * (curShadowHalf / 40) * (2048 / q.shadowMapSize) ** 0.5;
  }
  configureShadows(quality);

  // ---- névoa ----
  const fog = new THREE.Fog(0xbcdcf3, 60, quality.drawDistance);
  scene.fog = fog;
  let drawDistance = quality.drawDistance;

  const pal = { zen: new THREE.Color(), hor: new THREE.Color(), fog: new THREE.Color(), sun: new THREE.Color(), hemiS: new THREE.Color(), hemiG: new THREE.Color(), cloud: new THREE.Color(), sunI: 0, hemiI: 0 };
  const sunDir = new THREE.Vector3();
  const moonDir = new THREE.Vector3();
  const lightDir = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const fwd = new THREE.Vector3();
  const gray = new THREE.Color();
  const stormGray = C('#4b525e');
  const fogGray = C('#b9c0c7');
  const nightStorm = C('#1b2130');
  const m4 = new THREE.Matrix4();
  const q4 = new THREE.Quaternion();
  const v3 = new THREE.Vector3();
  const s3 = new THREE.Vector3();
  const eul = new THREE.Euler();
  const state = { night: 0, sunElev: 1, lightDir, zenith: skyUniforms.uZenith.value, horizon: fog.color, light: 1 };

  // env: { hours, overcast 0..1, fog 0..1 (névoa densa), dark 0..1, flash 0..1, wind, time, cloudCover }
  function update(dt, camera, env) {
    sunDirection(env.hours, sunDir);
    moonDir.copy(sunDir).multiplyScalar(-1);
    moonDir.y = Math.abs(moonDir.y) * 0.9 + 0.1 * (moonDir.y > 0 ? 1 : 0);
    moonDir.normalize();
    const e = sunDir.y;
    samplePalette(e, pal);
    const night = 1 - THREE.MathUtils.smoothstep(e, -0.2, 0.02);
    state.night = night;
    state.sunElev = e;

    // tempo nublado/tempestade: dessatura e escurece
    const oc = env.overcast;
    const stormCol = gray.copy(stormGray).lerp(nightStorm, night);
    pal.zen.lerp(stormCol, oc * 0.85);
    pal.hor.lerp(stormCol, oc * 0.7);
    pal.fog.lerp(stormCol, oc * 0.75);
    pal.cloud.lerp(stormCol, oc * 0.75);
    if (env.fog > 0) {
      const fc = gray.copy(fogGray).lerp(stormGray, oc * 0.8).lerp(nightStorm, night * 0.85);
      pal.fog.lerp(fc, env.fog);
      pal.hor.lerp(fc, env.fog);
      pal.zen.lerp(fc, env.fog * 0.6);
    }
    const dark = 1 - env.dark * 0.55;

    // luz direcional: sol de dia, lua (azulada) à noite
    let li;
    if (e > -0.03) {
      lightDir.copy(sunDir);
      li = pal.sunI * THREE.MathUtils.smoothstep(e, -0.03, 0.05);
      sun.color.copy(pal.sun);
    } else {
      lightDir.copy(moonDir);
      li = 0.75 * THREE.MathUtils.smoothstep(-e, 0.03, 0.2);
      sun.color.set(0x9db4ff);
    }
    sun.intensity = li * (1 - oc * 0.88) * (1 - env.fog * 0.5) * dark + env.flash * 2.5;
    hemi.color.copy(pal.hemiS);
    hemi.groundColor.copy(pal.hemiG);
    hemi.intensity = pal.hemiI * (1 - oc * 0.25) * dark + env.flash * 3;

    // sombra seguindo a câmera (caixa à frente da câmera, encaixada em texels)
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, -1);
    fwd.normalize();
    tmp.copy(camera.position).addScaledVector(fwd, curShadowHalf * 0.45);
    const texel = (curShadowHalf * 2) / sun.shadow.mapSize.x;
    tmp.x = Math.round(tmp.x / texel) * texel;
    tmp.z = Math.round(tmp.z / texel) * texel;
    tmp.y = Math.max(camera.position.y - 20, 0);
    sun.target.position.copy(tmp);
    sun.position.copy(tmp).addScaledVector(lightDir, 250);
    sun.target.updateMatrixWorld();

    // névoa
    fog.color.copy(pal.fog);
    const far = drawDistance * 1.15 * (1 - env.fog * 0.84) * (1 - oc * 0.35);
    fog.far = Math.max(45, far) * (1 + Math.max(0, camera.position.y - 25) / 70);
    fog.near = Math.max(2, fog.far * (0.28 - env.fog * 0.26 - oc * 0.12));

    // domo
    const R = Math.min(camera.far * 0.95, 2000);
    skyMesh.position.copy(camera.position);
    skyMesh.scale.setScalar(R);
    skyUniforms.uZenith.value.copy(pal.zen).multiplyScalar(dark);
    skyUniforms.uHorizon.value.copy(pal.fog).lerp(pal.hor, 0.35).multiplyScalar(dark);
    skyUniforms.uGround.value.copy(pal.fog).multiplyScalar(0.8 * dark);
    skyUniforms.uSunDir.value.copy(sunDir);
    skyUniforms.uSunColor.value.copy(pal.sun);
    skyUniforms.uSunVis.value = THREE.MathUtils.smoothstep(e, -0.12, 0.02);
    skyUniforms.uMoonDir.value.copy(moonDir);
    skyUniforms.uNight.value = night;
    skyUniforms.uFlash.value = env.flash;
    skyUniforms.uOvercast.value = Math.max(oc, env.fog);

    stars.position.copy(camera.position);
    stars.scale.setScalar(R * 0.98);
    starMat.uniforms.uTime.value = env.time;
    starMat.uniforms.uOpacity.value = night * (1 - Math.max(oc, env.fog)) * 0.95;
    starMat.uniforms.uPixel.value = Math.max(1, env.pixelRatio || 1);
    stars.visible = starMat.uniforms.uOpacity.value > 0.01;

    moon.position.copy(camera.position).addScaledVector(moonDir, R * 0.9);
    moon.scale.setScalar(R * 0.06);
    moon.quaternion.copy(camera.quaternion);
    moonMat.opacity = night * (1 - oc * 0.9) * (1 - env.fog * 0.8);
    moon.visible = moonMat.opacity > 0.01;

    // nuvens: derivam com o vento e acompanham a câmera em toroide
    const cover = env.cloudCover;
    let n = 0;
    const span = 900;
    for (let i = 0; i < cloudData.length; i++) {
      const c = cloudData[i];
      if (c.vis > cover) continue;
      c.x += dt * (2 + env.wind * 4);
      c.z += dt * (0.6 + env.wind);
      let x = c.x - camera.position.x;
      let z = c.z - camera.position.z;
      x = ((((x + span / 2) % span) + span) % span) - span / 2;
      z = ((((z + span / 2) % span) + span) % span) - span / 2;
      eul.set(0, c.rot, 0);
      q4.setFromEuler(eul);
      const sc = c.s * (0.8 + cover * 0.4);
      s3.set(sc, sc * c.sy * (1 + oc * 0.4), sc * 0.8);
      v3.set(camera.position.x + x, c.y - oc * 25, camera.position.z + z);
      m4.compose(v3, q4, s3);
      clouds.setMatrixAt(n++, m4);
    }
    clouds.count = n;
    clouds.instanceMatrix.needsUpdate = true;
    cloudMat.color.copy(pal.cloud).multiplyScalar(0.55 * dark * (1 - oc * 0.45));
    cloudMat.emissive.copy(pal.cloud).lerp(pal.hor, 0.3).multiplyScalar(0.55 * dark * (1 - oc * 0.55) + env.flash * 0.8);
    state.light = Math.min(1.2, hemi.intensity * 0.55 + sun.intensity * 0.18);
    return state;
  }

  function setQuality(q) {
    configureShadows(q);
    drawDistance = q.drawDistance;
  }

  return {
    group,
    sun,
    hemi,
    fog,
    update,
    setQuality,
    sunDir,
    get state() {
      return state;
    },
    dispose() {
      scene.remove(group, sun, sun.target, hemi);
      if (scene.fog === fog) scene.fog = null;
      skyMesh.geometry.dispose();
      skyMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      moon.geometry.dispose();
      moonMat.dispose();
      cloudGeo.dispose();
      cloudMat.dispose();
      sun.shadow.map?.dispose();
    },
  };
}
