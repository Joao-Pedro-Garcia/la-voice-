// Comportamento de produção atrás do proxy HTTPS do Render.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import http from 'node:http';

let app;
let port;
const quiet = { info() {}, warn() {}, error() {}, log() {} };

beforeAll(async () => {
  process.env.LAVOICE_TRUST_PROXY = '1';
  const { createServer } = await import('../../server/index.js?deploy');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-dep-'));
  const dist = path.join(dir, 'dist');
  fs.mkdirSync(path.join(dist, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>LA VOICE</title>');
  fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log("x");'.repeat(500));
  fs.writeFileSync(path.join(dist, 'manifest.webmanifest'), '{"name":"LA VOICE"}');
  app = createServer({ port: 0, dataFile: path.join(dir, 'p.json'), staticDir: dist, log: quiet });
  port = await app.listen();
});
afterAll(() => {
  app.close();
  delete process.env.LAVOICE_TRUST_PROXY;
});

// http.request permite definir o cabeçalho Host (o fetch do Node não permite)
const get = (p, headers = {}) =>
  new Promise((resolve, reject) => {
    const req = http.request({ host: 'localhost', port, path: p, headers }, (res) => {
      res.resume();
      resolve({ status: res.statusCode, headers: { get: (k) => res.headers[k.toLowerCase()] } });
    });
    req.on('error', reject);
    req.end();
  });

describe('produção atrás do proxy HTTPS', () => {
  it('redireciona HTTP para HTTPS (microfone exige HTTPS)', async () => {
    const r = await get('/', { 'x-forwarded-proto': 'http', host: 'la-voice.onrender.com' });
    expect(r.status).toBe(301);
    expect(r.headers.get('location')).toBe('https://la-voice.onrender.com/');
  });
  it('não redireciona acesso local', async () => {
    const r = await get('/api/health', { 'x-forwarded-proto': 'http' });
    expect(r.status).toBe(200);
  });
  it('envia permissão de microfone, HSTS e CSP', async () => {
    const r = await get('/', { 'x-forwarded-proto': 'https', host: 'la-voice.onrender.com' });
    expect(r.headers.get('permissions-policy')).toContain('microphone=(self)');
    expect(r.headers.get('strict-transport-security')).toContain('max-age');
    expect(r.headers.get('content-security-policy')).toContain("connect-src 'self' ws: wss:");
  });
  it('comprime JS com gzip e mantém cache longo', async () => {
    const r = await fetch(`http://localhost:${port}/assets/app.js`, { headers: { 'accept-encoding': 'gzip' } });
    expect(r.headers.get('content-encoding')).toBe('gzip');
    expect(r.headers.get('cache-control')).toContain('immutable');
    expect(await r.text()).toContain('console.log');
    void zlib;
  });
  it('serve o manifesto para instalar na tela inicial', async () => {
    const r = await get('/manifest.webmanifest');
    expect(r.headers.get('content-type')).toContain('manifest');
  });
  it('WebSocket da mesma origem é aceito', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`, { headers: { origin: `http://localhost:${port}` } });
    await new Promise((res, rej) => {
      ws.on('open', res);
      ws.on('error', rej);
    });
    ws.close();
  });
  it('WebSocket de outro site é recusado', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/ws`, { headers: { origin: 'https://site-malicioso.example' } });
    const code = await new Promise((res) => {
      ws.on('unexpected-response', (_req, resp) => res(resp.statusCode));
      ws.on('open', () => res(101));
      ws.on('error', () => {});
    });
    expect(code).toBe(403);
  });
  it('limite de requisições usa o IP real do jogador (X-Forwarded-For)', async () => {
    const statuses = [];
    for (let i = 0; i < 65; i++) {
      const r = await fetch(`http://localhost:${port}/api/interpret`, { method: 'POST', body: '{"text":"espada"}', headers: { 'x-forwarded-for': '203.0.113.9' } });
      statuses.push(r.status);
    }
    expect(statuses.includes(429)).toBe(true);
    const other = await fetch(`http://localhost:${port}/api/interpret`, { method: 'POST', body: '{"text":"espada"}', headers: { 'x-forwarded-for': '198.51.100.7' } });
    expect(other.status).toBe(200);
  });
});
