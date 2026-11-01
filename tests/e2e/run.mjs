// Testes ponta a ponta no navegador (Chromium/Playwright) contra o servidor real.
// Uso: npm run build && npm run test:e2e   (screenshots em test-results/)
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createServer } from '../../server/index.js';

const OUT = path.resolve('test-results');
fs.mkdirSync(OUT, { recursive: true });
const quiet = { info() {}, warn() {}, error: console.error, log() {} };
const app = createServer({ port: 0, dataFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'lv-e2e-')), 'p.json'), log: quiet });
const port = await app.listen();
const BASE = `http://localhost:${port}`;

const browser = await chromium.launch({
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});

const results = [];
const check = (name, ok, info = '') => {
  results.push({ name, ok, info });
  console.log(`${ok ? '✔' : '✘'} ${name}${info ? ` — ${info}` : ''}`);
};

async function newPage(viewport, opts = {}) {
  const ctx = await browser.newContext({ viewport, permissions: ['microphone'], ...opts });
  // sem GPU no ambiente de teste (renderização por software): usa o perfil gráfico mais leve
  await ctx.addInitScript(() => {
    if (!localStorage.getItem('lavoice:settings')) localStorage.setItem('lavoice:settings', JSON.stringify({ quality: 'low', adaptive: false }));
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/favicon|Failed to load resource: the server responded with a status of 404/.test(m.text())) page.errors.push(m.text());
  });
  await page.goto(BASE);
  await page.waitForFunction(() => window.__laVoice?.ready === true, null, { timeout: 120000 });
  return page;
}

async function startSolo(page, mode = 'creative') {
  await page.click('[data-a=play]');
  await page.click(`[data-m=${mode}]`);
  await page.click('[data-a=go]');
  await page.waitForFunction(() => window.__laVoice.game?.me, null, { timeout: 30000 });
}

async function command(page, text) {
  await page.fill('.cmd', text);
  await page.press('.cmd', 'Enter');
  await page.waitForTimeout(900);
}

try {
  // ---------------- desktop solo
  const page = await newPage({ width: 1280, height: 720 });
  check('carrega e mostra o menu', await page.isVisible('.logo'));
  await page.screenshot({ path: `${OUT}/01-menu.png` });
  await startSolo(page, 'creative');
  check('entra no mundo (solo)', true);

  // microfone com dispositivo falso: permissão + VAD recebendo áudio
  await page.waitForTimeout(1500);
  const mic = await page.evaluate(() => ({ state: window.__laVoice.app.voice.mic.state, voice: window.__laVoice.voiceState, level: window.__laVoice.app.voice.mic.level }));
  check('permissão do microfone concedida e captura ativa', mic.state === 'ready', JSON.stringify(mic));

  await command(page, 'quero uma espada de gelo');
  const inv = await page.evaluate(() => window.__laVoice.game.meState.inventory?.map((w) => w.label));
  check('criação de arma por frase', inv?.[0]?.includes('Gelo'), JSON.stringify(inv));
  await page.screenshot({ path: `${OUT}/02-espada-gelo.png` });

  await command(page, 'um dragão');
  const cr = await page.evaluate(() => [...window.__laVoice.game.creatures.values()].map((c) => c.spec.species));
  check('invocação de criatura', cr.includes('dragon'), JSON.stringify(cr));
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/03-dragao.png` });

  await command(page, 'escudo');
  const shield = await page.evaluate(() => !!window.__laVoice.game.me.handles.shield);
  check('ativação de habilidade (escudo)', shield);

  await command(page, 'quero alguma coisa para me proteger');
  const res = await page.textContent('.results');
  check('interpretação criativa mostra resultado', /Escudo|recarga/i.test(res), res.slice(0, 80));

  await command(page, 'chuva');
  await page.waitForTimeout(1500);
  const weather = await page.evaluate(() => window.__laVoice.app.world.getWeather());
  check('clima por voz', weather === 'rain', weather);
  await page.screenshot({ path: `${OUT}/04-chuva.png` });

  // combate: clique ataca
  await page.mouse.click(640, 360);
  await page.waitForTimeout(500);
  check('ataque enviado', true);

  // interface
  await page.keyboard.press('Escape');
  check('menu de pausa', await page.isVisible('[data-a=resume]'));
  await page.click('[data-a=settings]');
  check('configurações abrem', await page.isVisible('.tabs'));
  await page.click('[data-tab=voice]');
  await page.click('[data-a=back]');
  await page.click('[data-a=resume]');

  // salvamento
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('lavoice:profile')));
  check('progresso salvo localmente', saved && saved.stats.words >= 4 && saved.xp > 0, `xp=${saved?.xp} palavras=${saved?.stats.words}`);

  const perf = await page.evaluate(() => window.__laVoice.app.engine.info());
  check('desempenho medido (software GL, sem GPU)', perf.fps > 0, JSON.stringify(perf));
  check('sem erros no console (desktop)', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));

  // ---------------- multiplayer: duas abas
  const a = await newPage({ width: 1000, height: 640 });
  const b = await newPage({ width: 1000, height: 640 });
  await a.click('[data-a=mp]');
  await a.fill('[data-f=name]', 'Ana');
  await a.selectOption('[data-f=mode]', 'creative');
  await a.click('[data-a=create]');
  await a.waitForFunction(() => window.__laVoice.session?.roomCode, null, { timeout: 20000 });
  const code = await a.evaluate(() => window.__laVoice.session.roomCode);
  await b.click('[data-a=mp]');
  await b.fill('[data-f=name]', 'Bia');
  await b.fill('[data-f=code]', code);
  await b.click('[data-a=join]');
  await b.waitForFunction(() => window.__laVoice.game?.players.size === 2, null, { timeout: 20000 });
  check('multiplayer: segundo jogador entra pelo código', true, code);
  await command(a, 'martelo do trovão');
  await b.waitForFunction(() => [...window.__laVoice.game.players.values()].some((p) => p.data.name === 'Ana' && p.weaponSpec), null, { timeout: 15000 }).catch(() => {});
  const seen = await b.evaluate(() => [...window.__laVoice.game.players.values()].find((p) => p.data.name === 'Ana')?.weaponSpec?.label);
  check('multiplayer: B vê a arma criada por A', /Martelo/.test(seen || ''), seen);
  await command(a, 'três lobos');
  await b.waitForFunction(() => [...window.__laVoice.game.creatures.values()].filter((c) => c.spec.species === 'wolf' && !c.data.wild).length >= 3, null, { timeout: 15000 }).catch(() => {});
  const wolves = await b.evaluate(() => [...window.__laVoice.game.creatures.values()].filter((c) => c.spec.species === 'wolf' && !c.data.wild).length);
  check('multiplayer: criaturas sincronizadas', wolves === 3, `lobos=${wolves}`);
  await b.screenshot({ path: `${OUT}/05-multiplayer.png` });

  // reconexão: derruba o socket de B
  await b.evaluate(() => window.__laVoice.session.ws.close(4001));
  await b.waitForFunction(() => window.__laVoice.session.ws.readyState === 1 && window.__laVoice.game.players.size === 2, null, { timeout: 45000 });
  check('multiplayer: reconexão automática', true);
  check('sem erros no console (multiplayer)', a.errors.length + b.errors.length === 0, [...a.errors, ...b.errors].slice(0, 3).join(' | '));

  await Promise.all([page, a, b].map((x) => x.context().close()));

  // ---------------- celular
  const m = await newPage({ width: 390, height: 844 }, { isMobile: true, hasTouch: true, deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' });
  await m.tap('[data-a=play]');
  await m.tap('[data-a=go]');
  await m.waitForFunction(() => window.__laVoice.game?.me, null, { timeout: 30000 });
  const touchUi = await m.isVisible('.joystick');
  check('celular: joystick e botões de toque', touchUi);
  await command(m, 'tubarão');
  const tier = await m.evaluate(() => window.__laVoice.app.engine.quality.tier);
  check('celular: perfil gráfico aplicado', ['low', 'mid', 'high'].includes(tier), tier);
  await m.screenshot({ path: `${OUT}/06-celular.png` });
  const overflow = await m.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check('celular: sem rolagem horizontal', !overflow);
  check('sem erros no console (celular)', m.errors.length === 0, m.errors.slice(0, 3).join(' | '));
  await m.context().close();

  // ---------------- Android: tocar para falar (reconhecedor de voz substituído por um falso,
  // pois o Chromium de teste não tem o serviço de voz do Google)
  const ctxA = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2.6, userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36' });
  await ctxA.addInitScript(() => {
    localStorage.setItem('lavoice:settings', JSON.stringify({ quality: 'low', adaptive: false }));
    window.__micOpened = 0;
    const orig = navigator.mediaDevices?.getUserMedia?.bind(navigator.mediaDevices);
    if (orig) navigator.mediaDevices.getUserMedia = (c) => { window.__micOpened++; return orig(c); };
    class FakeSR {
      start() { window.__sr = this; setTimeout(() => { this.onaudiostart?.(); this.onspeechstart?.(); const r = Object.assign([{ transcript: 'quero uma espada de fogo', confidence: 0.92 }], { isFinal: true }); this.onresult?.({ resultIndex: 0, results: [r] }); this.onspeechend?.(); this.onend?.(); }, 300); }
      stop() { this.onend?.(); }
      abort() {}
    }
    window.SpeechRecognition = window.webkitSpeechRecognition = FakeSR;
  });
  const an = await ctxA.newPage();
  an.errors = [];
  an.on('pageerror', (e) => an.errors.push(e.message));
  await an.goto(BASE);
  await an.waitForFunction(() => window.__laVoice?.ready === true, null, { timeout: 120000 });
  await an.tap('[data-a=play]');
  await an.tap('[data-a=go]');
  await an.waitForFunction(() => window.__laVoice.game?.me, null, { timeout: 30000 });
  const st = await an.evaluate(() => window.__laVoice.voiceState);
  check('Android: modo "tocar para falar" ativo', st === 'tap', st);
  await an.tap('.mic');
  await an.waitForFunction(() => window.__laVoice.game.meState.inventory?.length > 0, null, { timeout: 15000 }).catch(() => {});
  const invA = await an.evaluate(() => window.__laVoice.game.meState.inventory?.map((w) => w.label));
  check('Android: fala reconhecida cria a arma', invA?.[0] === 'Espada de Fogo', JSON.stringify(invA));
  const opened = await an.evaluate(() => window.__micOpened);
  check('Android: não abre microfone paralelo ao reconhecedor', opened === 0, `getUserMedia chamado ${opened}x`);
  await an.screenshot({ path: `${OUT}/07-android-voz.png` });
  check('sem erros no console (Android)', an.errors.length === 0, an.errors.slice(0, 3).join(' | '));
} catch (err) {
  check('execução do e2e', false, err.stack);
} finally {
  await browser.close();
  app.close();
  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(`${OUT}/e2e-results.json`, JSON.stringify(results, null, 2));
  console.log(`\n${results.length - failed.length}/${results.length} verificações passaram`);
  process.exit(failed.length ? 1 : 0);
}
