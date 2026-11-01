// Interpretação externa OPCIONAL via Claude (Anthropic API), usada somente quando o
// interpretador local tem baixa confiança. A chave fica apenas no servidor
// (variável ANTHROPIC_API_KEY) — nunca é enviada ao cliente.
// Sem chave, ou com falha de rede, o jogo segue usando só o catálogo local.
import { WEAPON_IDS } from '../../shared/catalog/weapons.js';
import { CREATURE_IDS } from '../../shared/catalog/creatures.js';
import { CREATURE_VARIANTS } from '../../shared/catalog/variants.js';
import { ABILITY_IDS } from '../../shared/catalog/abilities.js';
import { ENVIRONMENT_IDS, OBJECT_IDS } from '../../shared/catalog/world.js';
import { ELEMENT_IDS } from '../../shared/elements.js';
import { LRUCache } from '../cache.js';
import { normalize } from '../../shared/nlu/normalize.js';

const MODEL = process.env.LAVOICE_LLM_MODEL || 'claude-opus-5-5';
const TIMEOUT_MS = Number(process.env.LAVOICE_LLM_TIMEOUT_MS || 6000);

const ALL_IDS = {
  weapon: WEAPON_IDS,
  creature: CREATURE_IDS,
  ability: ABILITY_IDS.filter((a) => a !== 'summon'),
  environment: ENVIRONMENT_IDS,
  object: OBJECT_IDS,
};

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['results', 'message'],
  properties: {
    message: { type: 'string', description: 'Frase curta em português explicando a interpretação (se alternativa).' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['category', 'id', 'element', 'size', 'count'],
        properties: {
          category: { type: 'string', enum: Object.keys(ALL_IDS) },
          id: { type: 'string', enum: [...new Set(Object.values(ALL_IDS).flat())] },
          variant: { type: 'string', enum: ['', ...Object.keys(CREATURE_VARIANTS)] },
          element: { type: 'string', enum: ['', ...ELEMENT_IDS] },
          size: { type: 'number' },
          count: { type: 'integer' },
        },
      },
    },
  },
};

const SYSTEM = `Você interpreta comandos de voz de um jogo 3D de fantasia (sem violência gráfica).
Mapeie a fala do jogador para até 3 itens do catálogo, escolhendo o mais coerente com o significado.
Categorias e ids válidos:
${Object.entries(ALL_IDS).map(([k, v]) => `- ${k}: ${v.join(', ')}`).join('\n')}
Variantes de criatura (campo variant, id = espécie base): ${Object.entries(CREATURE_VARIANTS).map(([k, v]) => `${k}->${v.base}`).join(', ')}
Elementos: ${ELEMENT_IDS.join(', ')} ('' se nenhum). size: 0.5 a 2.4 (1 = normal). count: 1 a 8.
Se o pedido for impossível ou abstrato, escolha a alternativa mais próxima e explique em "message".
Nunca invente ids. Se não houver nada razoável, retorne results vazio.`;

export function createRemoteInterpreter({ apiKey = process.env.ANTHROPIC_API_KEY, log = console } = {}) {
  if (!apiKey) return null;
  let clientPromise = null;
  const getClient = () => {
    clientPromise ||= import('@anthropic-ai/sdk').then(({ default: Anthropic }) => new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: 1 }));
    return clientPromise;
  };
  const cache = new LRUCache(500);
  let failures = 0;
  let openUntil = 0; // circuito aberto após falhas seguidas

  return async function remoteInterpret(text) {
    const key = normalize(text);
    if (!key) return null;
    if (cache.has(key)) return { ...cache.get(key), source: 'cache' };
    if (Date.now() < openUntil) return null;
    try {
      const client = await getClient();
      const response = await client.messages.create({
        model: MODEL,
        max_tokens: 1024,
        output_config: { effort: 'low', format: { type: 'json_schema', schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: 'user', content: `Fala do jogador: "${text.slice(0, 200)}"` }],
      });
      if (response.stop_reason === 'refusal') return null;
      const block = response.content.find((b) => b.type === 'text');
      if (!block) return null;
      const data = JSON.parse(block.text);
      const results = (data.results || [])
        .filter((r) => ALL_IDS[r.category]?.includes(r.id))
        .slice(0, 3)
        .map((r) => ({
          category: r.category,
          id: r.id,
          variant: r.variant && CREATURE_VARIANTS[r.variant]?.base === r.id ? r.variant : null,
          elements: ELEMENT_IDS.includes(r.element) ? [r.element] : [],
          element: ELEMENT_IDS.includes(r.element) ? r.element : null,
          size: Math.min(2.4, Math.max(0.5, Number(r.size) || 1)),
          count: Math.min(8, Math.max(1, Math.round(r.count) || 1)),
          rarity: 0,
          inferred: true,
          alt: false,
          reason: String(data.message || '').slice(0, 160),
          confidence: 0.7,
          features: [],
        }));
      const out = { text, normalized: key, results, understood: results.length > 0, confidence: results.length ? 0.7 : 0, lang: 'pt', unknown: [], source: 'remote' };
      cache.set(key, out);
      failures = 0;
      return out;
    } catch (err) {
      failures++;
      if (failures >= 3) openUntil = Date.now() + 60_000;
      log.warn?.(`[interpret] serviço externo indisponível: ${err?.message || err}`);
      return null;
    }
  };
}
