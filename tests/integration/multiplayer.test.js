// Teste de multiplayer real: servidor HTTP+WebSocket, dois clientes, sincronização e reconexão.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import WebSocket from 'ws';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../../server/index.js';

let app;
let port;
const quiet = { info() {}, warn() {}, error() {}, log() {} };

beforeAll(async () => {
  delete process.env.ANTHROPIC_API_KEY;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lv-mp-'));
  app = createServer({ port: 0, dataFile: path.join(dir, 'profiles.json'), log: quiet, graceMs: 1500 });
  port = await app.listen();
});
afterAll(() => app.close());

class Client {
  constructor() {
    this.msgs = [];
    this.events = [];
    this.waiters = [];
  }
  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(`ws://localhost:${port}/ws`);
      this.ws.on('open', resolve);
      this.ws.on('error', reject);
      this.ws.on('message', (raw) => {
        const m = JSON.parse(raw.toString());
        this.msgs.push(m);
        if (m.t === 'events') this.events.push(...m.list);
        for (const w of [...this.waiters]) if (w.pred(m)) {
          this.waiters.splice(this.waiters.indexOf(w), 1);
          w.resolve(m);
        }
      });
    });
  }
  send(m) {
    this.ws.send(JSON.stringify(m));
  }
  wait(pred, ms = 4000) {
    const found = this.msgs.find(pred);
    if (found) return Promise.resolve(found);
    return new Promise((resolve, reject) => {
      const w = { pred, resolve };
      this.waiters.push(w);
      setTimeout(() => reject(new Error('timeout esperando mensagem: ' + pred.toString())), ms);
    });
  }
  waitEvent(pred, ms = 4000) {
    return this.wait(Object.assign((m) => m.t === 'events' && m.list.some(pred), { toString: () => pred.toString() }), ms).then((m) => m.list.find(pred));
  }
}

describe('multiplayer online', () => {
  it('cria sala, entra pelo código e sincroniza criações e combate', async () => {
    const a = new Client();
    const b = new Client();
    await a.connect();
    await b.connect();
    a.send({ t: 'hello', token: 'aaaaaaaaaaaaaaaaaaaa', name: 'Ana' });
    b.send({ t: 'hello', token: 'bbbbbbbbbbbbbbbbbbbb', name: 'Bia' });
    await a.wait((m) => m.t === 'hello_ok');
    await b.wait((m) => m.t === 'hello_ok');
    a.send({ t: 'create_room', mode: 'creative', pvp: true });
    const wa = await a.wait((m) => m.t === 'welcome');
    expect(wa.room.code).toMatch(/^[A-Z2-9]{5}$/);
    b.send({ t: 'join_room', code: wa.room.code });
    const wb = await b.wait((m) => m.t === 'welcome');
    expect(wb.state.players.map((p) => p.name).sort()).toEqual(['Ana', 'Bia']);
    await a.waitEvent((e) => e.type === 'player_add' && e.player.name === 'Bia');

    // fala de A é interpretada no servidor e B vê o resultado
    a.send({ t: 'voice', text: 'quero uma espada de fogo' });
    const eq = await b.waitEvent((e) => e.type === 'equip' && e.playerId === wa.you);
    expect(eq.spec.element).toBe('fire');
    await new Promise((r) => setTimeout(r, 800)); // limite anti-spam de falas
    a.send({ t: 'voice', text: 'um lobo' });
    const ca = await b.waitEvent((e) => e.type === 'creature_add');
    expect(ca.creature.spec.species).toBe('wolf');
    expect(ca.creature.ownerId).toBe(wa.you);

    // movimento sincronizado via snapshot
    const pb = wb.state.players.find((p) => p.id === wb.you);
    // o servidor limita a velocidade: caminhamos até B em vários passos
    const pa = wa.state.players.find((p) => p.id === wa.you);
    const target = { x: pb.x, z: pb.z - 1.2 };
    for (let i = 1; i <= 40; i++) {
      const k = Math.min(1, i / 30);
      a.send({ t: 'input', x: pa.x + (target.x - pa.x) * k, y: pb.y, z: pa.z + (target.z - pa.z) * k, ry: 0, anim: 'walk' });
      await new Promise((r) => setTimeout(r, 60));
    }
    await b.wait((m) => m.t === 'snapshot' && m.players.some((p) => p[0] === wa.you && Math.hypot(p[1] - target.x, p[3] - target.z) < 0.6));
    // combate sincronizado (A ataca B)
    await new Promise((r) => setTimeout(r, 120));
    a.send({ t: 'action', kind: 'attack', ry: 0 });
    const hit = await b.waitEvent((e) => e.type === 'hit' && e.targetId === wb.you);
    expect(hit.amount).toBeGreaterThan(0);

    // ação inválida é rejeitada (sala inexistente)
    const c = new Client();
    await c.connect();
    c.send({ t: 'hello', token: 'cccccccccccccccccccc', name: 'Caio' });
    await c.wait((m) => m.t === 'hello_ok');
    c.send({ t: 'join_room', code: 'ZZZZZ' });
    const err = await c.wait((m) => m.t === 'error');
    expect(err.code).toBe('not_found');
    a.ws.close();
    b.ws.close();
    c.ws.close();
  });

  it('reconexão mantém o jogador e o inventário', async () => {
    const a = new Client();
    await a.connect();
    a.send({ t: 'hello', token: 'dddddddddddddddddddd', name: 'Duda' });
    await a.wait((m) => m.t === 'hello_ok');
    a.send({ t: 'create_room', mode: 'creative' });
    const w = await a.wait((m) => m.t === 'welcome');
    a.send({ t: 'voice', text: 'martelo' });
    await a.waitEvent((e) => e.type === 'equip');
    a.ws.terminate(); // queda de conexão
    await new Promise((r) => setTimeout(r, 200));
    const room = app.game.rooms.get(w.room.code);
    expect(room.world.players.get(w.you).connected).toBe(false);

    const a2 = new Client();
    await a2.connect();
    a2.send({ t: 'resume', sessionToken: w.sessionToken });
    const w2 = await a2.wait((m) => m.t === 'welcome');
    expect(w2.you).toBe(w.you);
    const me = w2.state.players.find((p) => p.id === w.you);
    expect(me.connected).toBe(true);
    expect(me.inventory[0].kind).toBe('hammer');
    a2.ws.close();
  });

  it('jogador desconectado é removido após o prazo e a sala fecha', async () => {
    const a = new Client();
    await a.connect();
    a.send({ t: 'hello', token: 'eeeeeeeeeeeeeeeeeeee', name: 'Eva' });
    await a.wait((m) => m.t === 'hello_ok');
    a.send({ t: 'create_room' });
    const w = await a.wait((m) => m.t === 'welcome');
    a.ws.terminate();
    await new Promise((r) => setTimeout(r, 2000));
    expect(app.game.rooms.has(w.room.code)).toBe(false);
  });

  it('progresso multiplayer é persistido no servidor', async () => {
    const a = new Client();
    await a.connect();
    a.send({ t: 'hello', token: 'ffffffffffffffffffff', name: 'Fê' });
    await a.wait((m) => m.t === 'hello_ok');
    a.send({ t: 'create_room', mode: 'creative' });
    await a.wait((m) => m.t === 'welcome');
    a.send({ t: 'voice', text: 'dragão' });
    await a.waitEvent((e) => e.type === 'progress');
    a.ws.close();
    const stored = app.store.get('ffffffffffffffffffff');
    expect(stored.stats.words).toBeGreaterThan(0);
    expect(stored.achievements.first_word).toBeTruthy();
    // reconectar com o mesmo token recupera o perfil
    const b = new Client();
    await b.connect();
    b.send({ t: 'hello', token: 'ffffffffffffffffffff' });
    const ok = await b.wait((m) => m.t === 'hello_ok');
    expect(ok.profile.xp).toBeGreaterThan(0);
    b.ws.close();
  });

  it('API HTTP de interpretação e saúde', async () => {
    const r = await fetch(`http://localhost:${port}/api/interpret`, { method: 'POST', body: JSON.stringify({ text: 'espada de gelo', level: 3 }), headers: { 'content-type': 'application/json' } });
    const j = await r.json();
    expect(j.results[0].id).toBe('sword');
    const cfg = await (await fetch(`http://localhost:${port}/api/config`)).json();
    expect(cfg.llm).toBe(false);
  });
});
