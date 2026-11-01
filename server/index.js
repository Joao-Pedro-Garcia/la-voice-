// LA VOICE — servidor HTTP + WebSocket.
//   npm start            → serve o jogo compilado (dist/) e o multiplayer em /ws
//   PORT=8787            → porta (padrão 8787)
//   ANTHROPIC_API_KEY    → (opcional) ativa interpretação externa para frases difíceis
//   LAVOICE_STT_URL      → (opcional) ativa reconhecimento de fala no servidor
//   LAVOICE_DATA         → arquivo de perfis (padrão data/profiles.json)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GameServer } from './gameServer.js';
import { ProfileStore } from './persistence.js';
import { createRemoteInterpreter } from './services/interpretRemote.js';
import { createSttProxy } from './services/stt.js';
import { interpret } from '../shared/nlu/interpreter.js';
import { LRUCache } from './cache.js';
import { normalize } from '../shared/nlu/normalize.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('too_large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

// limite simples por IP para os endpoints de API
function rateLimiter(perMinute) {
  const buckets = new Map();
  return (ip) => {
    const now = Date.now();
    const b = buckets.get(ip) || { tokens: perMinute, at: now };
    b.tokens = Math.min(perMinute, b.tokens + ((now - b.at) / 60000) * perMinute);
    b.at = now;
    if (b.tokens < 1) {
      buckets.set(ip, b);
      return false;
    }
    b.tokens -= 1;
    buckets.set(ip, b);
    if (buckets.size > 5000) buckets.clear();
    return true;
  };
}

export function createServer({ port = Number(process.env.PORT || 8787), dataFile = process.env.LAVOICE_DATA || path.join(ROOT, 'data', 'profiles.json'), staticDir = path.join(ROOT, 'dist'), log = console, graceMs } = {}) {
  const store = new ProfileStore(dataFile);
  const remoteInterpret = createRemoteInterpreter({ log });
  const stt = createSttProxy();
  const allow = rateLimiter(60);
  const interpCache = new LRUCache(1000);
  const game = new GameServer({ store, remoteInterpret, log, graceMs });

  const json = (res, status, body) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const ip = req.socket.remoteAddress || '?';
    try {
      if (url.pathname === '/api/health') return json(res, 200, { ok: true, ...game.stats() });
      if (url.pathname === '/api/config') return json(res, 200, { llm: !!remoteInterpret, stt: !!stt, multiplayer: true });
      if (url.pathname === '/api/interpret' && req.method === 'POST') {
        if (!allow(ip)) return json(res, 429, { error: 'rate_limited' });
        const body = JSON.parse((await readBody(req, 4096)).toString() || '{}');
        const text = String(body.text || '').slice(0, 200);
        const level = Math.max(1, Math.min(30, Number(body.level) || 1));
        const key = `${normalize(text)}|${level}`;
        if (interpCache.has(key)) return json(res, 200, { ...interpCache.get(key), source: 'cache' });
        let out = interpret(text, { level });
        if ((!out.understood || out.confidence < 0.5) && remoteInterpret) {
          const remote = await remoteInterpret(text, { level });
          if (remote?.understood && remote.confidence >= out.confidence) out = remote;
        }
        if (out.understood) interpCache.set(key, out);
        return json(res, 200, out);
      }
      if (url.pathname === '/api/stt' && req.method === 'POST') {
        if (!stt) return json(res, 503, { error: 'stt_disabled' });
        if (!allow(ip)) return json(res, 429, { error: 'rate_limited' });
        const buf = await readBody(req, 2 * 1024 * 1024);
        const text = await stt(buf, req.headers['content-type'] || 'audio/webm', url.searchParams.get('lang') || 'pt');
        return json(res, 200, { text });
      }
      if (url.pathname.startsWith('/api/')) return json(res, 404, { error: 'not_found' });
      // arquivos estáticos (jogo compilado)
      let file = path.normalize(path.join(staticDir, decodeURIComponent(url.pathname)));
      if (!file.startsWith(staticDir)) return json(res, 403, { error: 'forbidden' });
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(staticDir, 'index.html');
      if (!fs.existsSync(file)) {
        res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('LA VOICE: execute "npm run build" para gerar o cliente (ou use "npm run dev").');
      }
      const ext = path.extname(file);
      res.writeHead(200, {
        'content-type': MIME[ext] || 'application/octet-stream',
        'cache-control': file.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    } catch (err) {
      if (err.message === 'too_large') return json(res, 413, { error: 'too_large' });
      log.error('[http]', err);
      if (!res.headersSent) json(res, 500, { error: 'internal' });
    }
  });

  game.attach(server, '/ws');
  const shutdown = () => {
    store.flush();
    game.close();
    server.close();
  };
  return {
    server,
    game,
    store,
    listen: () => new Promise((resolve) => server.listen(port, () => resolve(server.address().port))),
    close: shutdown,
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createServer();
  app.listen().then((port) => {
    console.log(`LA VOICE rodando em http://localhost:${port}  (multiplayer: ws://localhost:${port}/ws)`);
    console.log(`  Interpretação externa (LLM): ${process.env.ANTHROPIC_API_KEY ? 'ativa' : 'desativada — usando apenas o catálogo local'}`);
    console.log(`  Reconhecimento no servidor (STT): ${process.env.LAVOICE_STT_URL ? 'ativo' : 'desativado'}`);
  });
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
    app.close();
    process.exit(0);
  });
}
