// Mundo 3D: céu/ciclo dia-noite, terreno, água, construções, vegetação e clima.
// API (docs/CONTRACTS.md): await buildWorld(scene, renderer, quality, onProgress) -> World
import * as THREE from 'three';
import { terrainHeight } from '../../shared/world.js';
import { worldUniforms, nextFrame } from './common.js';
import { setTextureRenderer, disposeTextures } from './textures.js';
import { createSky } from './sky.js';
import { buildTerrain, buildArenaFloor, buildPathMask } from './terrain.js';
import { buildWater } from './water.js';
import { buildStructures } from './structures.js';
import { buildTrees, buildRocks, buildGrass, setHeightFn } from './vegetation.js';
import { createWeather, WEATHER_TYPES } from './weather.js';

export { WEATHER_TYPES };

export async function buildWorld(scene, renderer, quality, onProgress = () => {}) {
  const progress = (p, label) => {
    try {
      onProgress(Math.min(1, Math.max(0, p)), label);
    } catch (e) {
      console.error(e);
    }
  };
  let q = quality;
  setTextureRenderer(renderer);
  renderer.shadowMap.enabled = !!q.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  if (renderer.toneMapping === THREE.NoToneMapping) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
  }
  setHeightFn(terrainHeight);

  progress(0.02, 'Céu');
  const sky = createSky(scene, q);
  await nextFrame();

  progress(0.08, 'Terreno');
  const pathMask = buildPathMask(q.tier === 'low' ? 512 : 1024);
  const terrain = buildTerrain(q, pathMask);
  scene.add(terrain.mesh);
  const arena = buildArenaFloor(q);
  scene.add(arena.group);
  await nextFrame();

  progress(0.25, 'Água');
  const water = buildWater(scene, q);
  await nextFrame();

  progress(0.35, 'Construções');
  const structures = buildStructures(scene, q);
  await nextFrame();

  progress(0.5, 'Árvores');
  const trees = await buildTrees(scene, q, (f) => progress(0.5 + f * 0.3, 'Árvores'));
  await nextFrame();

  progress(0.82, 'Pedras');
  const rocks = buildRocks(scene, q);
  await nextFrame();

  progress(0.9, 'Grama');
  const grass = buildGrass(scene, q, terrain.heightInfo, pathMask);
  await nextFrame();

  progress(0.96, 'Clima');
  const weather = createWeather(scene, q);

  let hours = 9.5;
  let dayLength = 8 * 60;
  let elapsed = 0;
  const waterEnv = { lightDir: new THREE.Vector3(), sunColor: new THREE.Color(), sunSpec: 1, zenith: new THREE.Color(), horizon: new THREE.Color(), light: 1, wind: 1 };
  const envSky = { hours, overcast: 0, fog: 0, dark: 0, flash: 0, wind: 1, cloudCover: 0.5, time: 0, pixelRatio: 1 };

  // Primeira atualização para não aparecer um frame com luz errada.
  const world = {
    sun: sky.sun,
    hemi: sky.hemi,
    sky,
    terrain,
    trees,
    rocks,
    grass,
    water,
    structures,
    weather,

    update(dt, camera) {
      dt = Math.min(Math.max(dt, 0), 0.1);
      elapsed += dt;
      worldUniforms.uTime.value = elapsed;
      if (dayLength > 0) hours = (hours + (dt * 24) / dayLength) % 24;
      const light = sky.state.light;
      const w = weather.update(dt, camera, light);
      envSky.hours = hours;
      envSky.overcast = w.overcast;
      envSky.fog = w.fog;
      envSky.dark = w.dark;
      envSky.flash = w.flash;
      envSky.wind = w.wind;
      envSky.cloudCover = w.cloudCover;
      envSky.time = elapsed;
      envSky.pixelRatio = renderer.getPixelRatio();
      const st = sky.update(dt, camera, envSky);
      waterEnv.lightDir.copy(st.lightDir);
      waterEnv.sunColor.copy(sky.sun.color);
      waterEnv.sunSpec = sky.sun.intensity * 0.6;
      waterEnv.zenith.copy(st.zenith);
      waterEnv.horizon.copy(st.horizon);
      waterEnv.light = st.light;
      waterEnv.wind = w.wind;
      water.update(waterEnv);
      trees.update(camera);
      grass?.update(camera);
      structures.update(dt, elapsed, st.night);
    },
    setTimeOfDay(h) {
      hours = ((Number(h) % 24) + 24) % 24;
    },
    getTimeOfDay() {
      return hours;
    },
    setDayLength(secondsPerDay) {
      dayLength = Math.max(0, Number(secondsPerDay) || 0);
    },
    // opts.instant: aplica sem transição (ex.: ao entrar no jogo)
    setWeather(type, opts = {}) {
      weather.set(type, !!opts.instant);
    },
    getWeather() {
      return weather.type;
    },
    onLightning(cb) {
      return weather.onLightning(cb);
    },
    isNight() {
      return sky.state.night > 0.5;
    },
    setQuality(nq) {
      q = nq;
      renderer.shadowMap.enabled = !!nq.shadows;
      sky.setQuality(nq);
      trees.setQuality(nq);
      rocks.setQuality(nq);
      structures.setQuality(nq);
      weather.setQuality(nq);
      if (grass) grass.group.visible = nq.tier !== 'low';
    },
    dispose() {
      sky.dispose();
      scene.remove(terrain.mesh);
      terrain.dispose();
      scene.remove(arena.group);
      arena.dispose();
      water.dispose();
      structures.dispose();
      trees.dispose();
      rocks.dispose();
      grass?.dispose();
      weather.dispose();
      pathMask.texture.dispose();
      disposeTextures();
    },
  };
  progress(1, 'Pronto');
  return world;
}
