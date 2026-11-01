# Contratos entre módulos (cliente 3D)

Todo o código de cliente usa ES modules, `import * as THREE from 'three'` (three 0.186.1) e
addons via `three/addons/...`. **Nenhum asset externo**: modelos e texturas são gerados
proceduralmente (geometrias compostas + texturas em `<canvas>`). Nada de cubos simples
como substitutos de personagens/armas/criaturas.

Convenções gerais
- Unidade: 1 = 1 metro. Eixo Y para cima. **Frente dos modelos = +Z**.
- Todo módulo que cria GPU resources expõe `dispose()` e libera geometria/material/textura
  que não sejam compartilhados (use caches compartilhados para recursos reaproveitados).
- Sombras: `castShadow = true` nas peças principais; peças minúsculas sem sombra.
- `quality` (objeto passado pelos sistemas) — ver `src/core/quality.js`:
  `{ tier: 'low'|'mid'|'high'|'ultra', shadows, shadowMapSize, treeDensity, drawDistance,
     particleBudget, pixelRatio, terrainSegments, textureSize, detail: 0|1|2 }`
  `detail`: 0 = baixo (menos segmentos, sem peças pequenas), 2 = alto.

## Personagem — `src/entities/character.js`
```js
createCharacterModel(appearance, quality) -> {
  root: THREE.Group,          // pés em y=0, olhando para +Z, altura ~1.8
  rightHand: THREE.Object3D,  // ponto de fixação da arma (arma aponta para +Y local do hand)
  leftHand: THREE.Object3D,
  head: THREE.Object3D,
  height: number,
  update(dt, state),          // anima o esqueleto procedural
  setOpacity(alpha),          // invisibilidade (0..1)
  flash(colorHex),            // brilho rápido ao levar dano
  setDetail(level),           // LOD 0..2
  dispose()
}
appearance = { skin, shirt, pants, hair, hairStyle: 'short'|'long'|'spiky'|'bald', accessory: 'none'|'hat'|'crown'|'headband' }
state = { anim: 'idle'|'walk'|'run'|'jump'|'fall'|'fly'|'attack'|'cast'|'block'|'dodge'|'hit'|'ko',
          speed /*m/s*/, attackT /*0..1 ou -1*/, attackStyle: 'slash'|'heavy'|'thrust'|'shoot'|'punch'|'cast',
          castT /*0..1 ou -1*/, time /*s*/ }
```

## Criaturas — `src/entities/creatures/index.js`
```js
createCreatureModel(spec, quality) -> {
  root: THREE.Group,  // pés em y=0 (voadores: origem no centro do corpo), frente +Z
  height: number,     // altura final em metros (spec.height * spec.size)
  update(dt, state),
  flash(colorHex),
  setDetail(level),   // 0..2 — esconde peças pequenas/desliga sombras longe da câmera
  setOpacity(a),
  dispose()
}
spec = { species, archetype, params, colors: {primary, secondary, accent}, element, size, height, label }
state = { anim: 'idle'|'walk'|'run'|'attack'|'hit'|'die'|'fly'|'spawn', speed, attackT, hitT, dieT, time }
```
Arquétipos: quadruped, biped, bird, fish, serpent, dragon, golem, spider, slime, ghost, octopus, insect.
Parâmetros em `shared/catalog/creatures.js` e `shared/catalog/variants.js`.

## Armas — `src/entities/weapons/index.js`
```js
createWeaponModel(spec, quality) -> {
  root: THREE.Group,   // empunhadura na origem, lâmina/cano ao longo de +Y
  length: number,
  tip: THREE.Object3D, // ponta/boca (origem dos projéteis e rastros)
  update(dt, time),    // partículas/brilho idle do elemento
  playAppear(),        // animação de surgimento (~0.8s)
  playUse(),           // pulso visual ao atacar
  dispose()
}
spec = { kind, element, size, rarity }
```

## Efeitos — `src/fx/index.js`
```js
createFX(scene, quality) -> FX
FX.update(dt, camera)
FX.setBudget(maxParticles)
FX.burst(pos, { colors, count, speed, size, life, gravity, spread })
FX.appear(pos, element)                     // brilho de criação de item/criatura
FX.explosion(pos, element, radius)
FX.shockwave(pos, radius, element)
FX.impact(pos, element)                      // faíscas de acerto
FX.lightningBolt(from, to, color, duration)
FX.laserBeam(getFrom, getTo, color, duration)
FX.shieldBubble(object3d, radius, color) -> { dispose() }
FX.aura(object3d, element, duration)         // aura persistente (ex.: velocidade, gigante)
FX.healAura(object3d)
FX.speedTrail(object3d, duration)
FX.iceField(pos, radius, duration)
FX.barrierWall(pos, rotY, width, height, duration, element) -> { mesh, dispose() }
FX.tornado(getPos, duration, radius) -> { dispose() }
FX.storm(getCenter, radius, duration)
FX.meteor(targetPos, delay, onImpact)
FX.earthquake(pos, radius)
FX.timeWarp(pos, radius, duration)
FX.teleport(from, to)
FX.confetti(pos)
FX.slashTrail(weaponTipObject3D, color, duration)
FX.createProjectile(kind, element) -> { object: THREE.Object3D, update(dt), dispose() }
   kind: 'arrow'|'orb'|'bolt'|'cannonball'|'fireball'|'web'|'breath'|'bomb'
FX.onShake(cb)                               // pede tremor de câmera (intensidade)
```

## Mundo — `src/world/index.js`
```js
await buildWorld(scene, renderer, quality, onProgress) -> {
  update(dt, camera),
  setTimeOfDay(hours 0..24), getTimeOfDay(), setDayLength(secondsPerDay),
  setWeather('clear'|'rain'|'snow'|'thunderstorm'|'fog'), getWeather(),
  onLightning(cb),
  setQuality(quality),
  sun: THREE.DirectionalLight,
  dispose()
}
```
Usa `shared/world.js` (terrainHeight, STRUCTURES, treePositions, rockPositions, LAKE, ARENA...).
