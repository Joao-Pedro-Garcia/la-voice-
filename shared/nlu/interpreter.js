// Interpretador de falas (Camadas 2 e 3): entende a intenção e classifica em
// arma / criatura / habilidade / ambiente / objeto, com modificadores.
// Funciona 100% offline com o catálogo local. Um serviço externo opcional (LLM) pode
// complementar quando a confiança local for baixa — ver server/services/interpretRemote.js.
import { tokenize, normalize, stemCandidates, levenshtein, fuzzyTolerance, NUMBER_WORDS, STOPWORDS } from './normalize.js';
import {
  LEXICON, CREATURE_SEMANTICS, WEAPON_SEMANTICS, ABILITY_SEMANTICS,
  ELEMENT_DEFAULT_WEAPON, ELEMENT_DEFAULT_ABILITY, ELEMENT_DEFAULT_CREATURE,
} from './lexicon.js';
import { CREATURES } from '../catalog/creatures.js';
import { WEAPONS } from '../catalog/weapons.js';
import { ABILITIES } from '../catalog/abilities.js';

const SEPARATORS = new Set(['e', 'and', 'depois', 'then', 'tambem', 'also', 'com', 'with', 'mais', 'plus', 'alem']);
const CATEGORY_ORDER = ['creature', 'weapon', 'ability', 'environment', 'object'];
const EN_HINTS = new Set(['i', 'want', 'give', 'me', 'the', 'please', 'make', 'create', 'some', 'summon', 'need', 'with', 'of', 'an', 'my']);
const FEATURE_DEFAULT = {
  fly: ['ability', 'fly'], fast: ['ability', 'speed'], protect: ['ability', 'shield'], heal: ['ability', 'heal'], hide: ['ability', 'invisibility'],
  jump: ['ability', 'jump'], explode: ['ability', 'bomb'], ranged: ['weapon'], cut: ['weapon'], crush: ['weapon'], pierce: ['weapon'], strong: ['weapon'],
  magic: ['weapon'], tech: ['weapon'], cute: ['creature'], scary: ['creature'], swim: ['creature'], venom: ['creature'], ride: ['creature'],
};
const MAX_RESULTS = 3;

function lookupPhrase(phrase) {
  return LEXICON.map.get(phrase);
}

function fuzzyLookup(tok) {
  const tol = fuzzyTolerance(tok.length);
  if (tol === 0) return null;
  let best = null;
  for (const cand of LEXICON.singles) {
    if (Math.abs(cand.length - tok.length) > tol) continue;
    const d = levenshtein(tok, cand, tol);
    if (d > tol) continue;
    // reconhecedores de voz raramente erram a primeira letra; exige isso para distâncias > 1
    if (d > 1 && cand[0] !== tok[0]) continue;
    const entries = LEXICON.map.get(cand);
    const hasHead = entries.some((e) => e.kind === 'head');
    const score = d - (hasHead ? 0.3 : 0);
    if (!best || score < best.score) best = { cand, d, score, entries };
  }
  return best;
}

// Encontra correspondências do léxico (frases mais longas primeiro, sem sobreposição).
export function findMatches(tokens) {
  const n = tokens.length;
  const candidates = [];
  for (let i = 0; i < n; i++) {
    for (let len = Math.min(LEXICON.maxWords, n - i); len >= 1; len--) {
      const phrase = tokens.slice(i, i + len).join(' ');
      const entries = lookupPhrase(phrase);
      if (entries) candidates.push({ start: i, end: i + len, phrase, entries, quality: 1 });
    }
  }
  candidates.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const used = new Array(n).fill(false);
  const accepted = [];
  for (const c of candidates) {
    let free = true;
    for (let k = c.start; k < c.end; k++) if (used[k]) free = false;
    if (!free) continue;
    // ignora palavras vazias soltas que por acaso estão no léxico (ex.: "a")
    if (c.end - c.start === 1 && STOPWORDS.has(c.phrase) && !c.entries.some((e) => e.kind === 'head' || e.kind === 'neg')) continue;
    for (let k = c.start; k < c.end; k++) used[k] = true;
    accepted.push(c);
  }
  const unknown = [];
  for (let i = 0; i < n; i++) {
    if (used[i]) continue;
    const tok = tokens[i];
    if (STOPWORDS.has(tok) || SEPARATORS.has(tok)) continue;
    const num = /^\d+$/.test(tok) ? parseInt(tok, 10) : NUMBER_WORDS[tok];
    if (num !== undefined) {
      if (num >= 2) accepted.push({ start: i, end: i + 1, phrase: tok, entries: [{ kind: 'count', value: num }], quality: 1 });
      used[i] = true;
      continue;
    }
    let found = null;
    for (const s of stemCandidates(tok)) {
      if (s === tok) continue;
      const e = lookupPhrase(s);
      if (e) {
        found = { start: i, end: i + 1, phrase: s, entries: e, quality: 0.93, from: tok };
        break;
      }
    }
    if (!found && tok.length >= 4) {
      const f = fuzzyLookup(tok);
      if (f) found = { start: i, end: i + 1, phrase: f.cand, entries: f.entries, quality: Math.max(0.5, 0.82 - 0.12 * f.d), from: tok, fuzzy: true };
    }
    if (found) {
      used[i] = true;
      accepted.push(found);
    } else unknown.push(tok);
  }
  accepted.sort((a, b) => a.start - b.start);
  return { matches: accepted, unknown };
}

function segmentMatches(tokens, matches) {
  const segments = [[]];
  let mi = 0;
  for (let i = 0; i < tokens.length; i++) {
    while (mi < matches.length && matches[mi].start === i) {
      segments[segments.length - 1].push(matches[mi]);
      i = matches[mi].end - 1;
      mi++;
    }
    if (i < tokens.length && SEPARATORS.has(tokens[i]) && !matches.some((m) => m.start <= i && m.end > i)) {
      if (segments[segments.length - 1].length) segments.push([]);
    }
  }
  return segments.filter((s) => s.length);
}

const kinds = (m, k) => m.entries.filter((e) => e.kind === k);

function chooseHeadEntry(entries, cues) {
  let best = null;
  let bestScore = -Infinity;
  for (const e of entries) {
    let s = e.weight || 1;
    if (cues.has(e.category)) s += 1;
    s -= CATEGORY_ORDER.indexOf(e.category) * 0.01;
    if (s > bestScore) {
      bestScore = s;
      best = e;
    }
  }
  return best;
}

function newResult(entry, match, how) {
  return {
    category: entry.category,
    id: entry.id,
    variant: entry.variant || null,
    elements: [],
    size: 1,
    count: 1,
    rarity: 0,
    negated: false,
    inferred: how === 'inferred',
    alt: how === 'alt',
    reason: '',
    matched: match ? match.from || match.phrase : '',
    confidence: match ? 0.95 * match.quality : 0.6,
    pos: match ? match.start : 0,
    features: [],
  };
}

function scoreBy(semantics, id, feats) {
  const set = semantics[id];
  if (!set) return 0;
  let s = 0;
  for (const f of feats) if (set.has ? set.has(f) : set.includes(f)) s += 2;
  return s;
}

// Escolhe o melhor item de uma categoria pelas características pedidas (interpretação criativa).
export function inferFromFeatures(category, feats, element, size, level = 99, rand = Math.random) {
  const want = [...feats];
  if (size > 1.3) want.push('big');
  if (size < 0.8) want.push('small');
  if (category === 'creature') {
    const scored = [];
    for (const c of Object.values(CREATURES)) {
      if (c.id === 'knight') continue;
      let s = scoreBy(CREATURE_SEMANTICS, c.id, want);
      if (element && c.defaultElement === element) s += 1.5;
      if (element && ELEMENT_DEFAULT_CREATURE[element] === c.id) s += 0.5;
      if (c.unlockLevel > level) s -= 0.25;
      scored.push({ id: c.id, s });
    }
    const bestS = Math.max(...scored.map((x) => x.s));
    let pool;
    if (bestS <= 0) {
      if (element) return { id: ELEMENT_DEFAULT_CREATURE[element], score: 0 };
      pool = Object.values(CREATURES).filter((c) => c.unlockLevel <= Math.max(1, Math.min(level, 2)) && c.id !== 'knight').map((c) => c.id);
    } else pool = scored.filter((x) => x.s === bestS).map((x) => x.id);
    // empate entre opções igualmente coerentes: sorteio (imprevisível, mas sempre relacionado)
    return { id: pool[Math.floor(rand() * pool.length)], score: bestS };
  }
  if (category === 'weapon') {
    let best = null;
    let bestS = -Infinity;
    for (const w of Object.values(WEAPONS)) {
      let s = scoreBy(WEAPON_SEMANTICS, w.id, want);
      if (element && ELEMENT_DEFAULT_WEAPON[element] === w.id) s += 1.5;
      if (w.unlockLevel > level) s -= 0.25;
      if (s > bestS) {
        bestS = s;
        best = w.id;
      }
    }
    if (bestS <= 0) best = element ? ELEMENT_DEFAULT_WEAPON[element] : 'sword';
    return { id: best, score: bestS };
  }
  if (category === 'ability') {
    let best = null;
    let bestS = 0;
    for (const a of Object.values(ABILITIES)) {
      const s = scoreBy(ABILITY_SEMANTICS, a.id, want);
      if (s > bestS) {
        bestS = s;
        best = a.id;
      }
    }
    if (!best && element) best = ELEMENT_DEFAULT_ABILITY[element];
    if (!best) best = 'energy_wave';
    return { id: best, score: bestS };
  }
  return { id: null, score: 0 };
}

function applyModifier(result, m) {
  for (const e of m.entries) {
    if (e.kind === 'element' && !result.elements.includes(e.element)) result.elements.push(e.element);
    else if (e.kind === 'size') result.size = e.value < 1 ? Math.min(result.size, e.value) : Math.max(result.size, e.value);
    else if (e.kind === 'count') result.count = Math.max(result.count, e.value);
    else if (e.kind === 'rarity') result.rarity = Math.min(2, result.rarity + e.value);
    else if (e.kind === 'feature' && !result.features.includes(e.feature)) result.features.push(e.feature);
  }
}

function interpretSegment(seg, prev, ctx) {
  const cues = new Set();
  for (const m of seg) for (const e of kinds(m, 'cue')) cues.add(e.category);
  const isDual = (m) => {
    const heads = kinds(m, 'head');
    if (!heads.length) return false;
    if (kinds(m, 'element').length) return true;
    return heads.every((h) => h.category === 'ability' && h.featureWord) && kinds(m, 'feature').length > 0;
  };
  const headMatches = seg.filter((m) => kinds(m, 'head').some((e) => !e.weak));
  let primary = headMatches.filter((m) => !isDual(m));
  const duals = headMatches.filter(isDual);
  const nonAbilityCue = [...cues].some((c) => c !== 'ability');

  // Coletivos ("exército") cedem lugar a outra criatura nomeada ("exército de dragões").
  const namedCreature = primary.some((m) => kinds(m, 'head').some((e) => e.category === 'creature' && !e.collective));
  if (namedCreature) {
    primary = primary.filter((m) => !kinds(m, 'head').every((e) => e.category === 'creature' && e.collective));
  }

  let heads;
  if (primary.length) heads = primary;
  else if (duals.length && nonAbilityCue && !cues.has('ability')) heads = []; // viram características
  else heads = duals;

  const results = [];
  for (const m of heads) {
    const entry = chooseHeadEntry(kinds(m, 'head').filter((e) => !e.weak), cues);
    const r = newResult(entry, m, 'direct');
    // Coletivo usado como cabeça (ex.: "exército") já define a quantidade.
    for (const c of kinds(m, 'count')) r.count = Math.max(r.count, c.value);
    results.push(r);
  }

  const modifiers = seg.filter((m) => !heads.includes(m));
  const negs = seg.filter((m) => kinds(m, 'neg').length);

  if (results.length) {
    for (const m of modifiers) {
      if (kinds(m, 'neg').length && !kinds(m, 'head').length) continue;
      // modificador vai para a cabeça mais próxima (empate: a anterior, como em "espada de fogo")
      let target = results[0];
      let bestD = Infinity;
      for (const r of results) {
        const d = Math.abs(r.pos - m.start) + (r.pos > m.start ? 0.5 : 0);
        if (d < bestD) {
          bestD = d;
          target = r;
        }
      }
      applyModifier(target, m);
      if (isDual(m) && kinds(m, 'head').some((h) => h.featureWord)) {
        for (const h of kinds(m, 'head')) {
          const feat = (ABILITY_SEMANTICS[h.id] || [])[0];
          if (feat && !target.features.includes(feat)) target.features.push(feat);
        }
      }
    }
    for (const n of negs) {
      for (const r of results) if (n.start < r.pos && r.pos - n.end <= 2) r.negated = true;
    }
    return results;
  }

  // Sem cabeça explícita: conceitos alternativos, inferência por características, elementos.
  const alt = seg.find((m) => kinds(m, 'alt').length);
  const r0 = { elements: [], size: 1, count: 1, rarity: 0, features: [] };
  for (const m of seg) applyModifier(r0, m);
  for (const m of duals) {
    for (const h of kinds(m, 'head')) {
      const feat = (ABILITY_SEMANTICS[h.id] || [])[0];
      if (feat && !r0.features.includes(feat)) r0.features.push(feat);
    }
  }
  if (alt) {
    const a = kinds(alt, 'alt')[0].alt;
    const r = newResult({ category: a.category, id: a.id, variant: a.variant }, alt, 'alt');
    Object.assign(r, { elements: a.element ? [a.element, ...r0.elements] : r0.elements, size: a.size || r0.size, rarity: (a.rarity || 0) + r0.rarity, count: r0.count });
    r.reason = a.message;
    r.confidence = 0.72 * alt.quality;
    return [r];
  }
  const element = r0.elements[0] || null;
  let category = null;
  if (cues.size) category = CATEGORY_ORDER.find((c) => cues.has(c));
  if (!category && r0.features.length) category = FEATURE_DEFAULT[r0.features[0]]?.[0] || null;
  if (category === 'ability' && !r0.features.length && !element) category = null;

  if (category === 'creature' || category === 'weapon' || category === 'ability') {
    let id;
    if (category === 'ability' && !cues.size && r0.features.length && FEATURE_DEFAULT[r0.features[0]]?.[1]) id = FEATURE_DEFAULT[r0.features[0]][1];
    else id = inferFromFeatures(category, r0.features, element, r0.size, ctx.level ?? 99, ctx.rand || Math.random).id;
    const r = newResult({ category, id }, null, 'inferred');
    Object.assign(r, { elements: r0.elements, size: r0.size, count: r0.count, rarity: r0.rarity, features: r0.features });
    r.pos = seg[0].start;
    r.confidence = Math.min(0.85, 0.55 + 0.08 * (r0.features.length + r0.elements.length + (cues.size ? 1 : 0)));
    r.reason = describeInference(seg);
    return [r];
  }
  if (category === 'environment' || category === 'object') return [];

  // Só elementos: se houver um resultado anterior, vira elemento extra dele ("espada de fogo e gelo")
  if (r0.elements.length && prev && (prev.category === 'weapon' || prev.category === 'creature' || prev.category === 'ability')) {
    for (const el of r0.elements) if (!prev.elements.includes(el)) prev.elements.push(el);
    return [];
  }
  if (r0.elements.length) {
    const r = newResult({ category: 'ability', id: ELEMENT_DEFAULT_ABILITY[element] }, null, 'inferred');
    Object.assign(r, { elements: r0.elements, size: r0.size, rarity: r0.rarity });
    r.pos = seg[0].start;
    r.confidence = 0.62;
    r.reason = 'Usei o elemento que você falou como um poder.';
    return [r];
  }
  // Só tamanho ("gigante!") → criatura gigante
  if (r0.size > 1.3 && seg.some((m) => kinds(m, 'head').some((e) => e.weak))) {
    const r = newResult({ category: 'creature', id: 'golem' }, null, 'inferred');
    r.size = r0.size;
    r.pos = seg[0].start;
    r.confidence = 0.6;
    r.reason = 'Um gigante, como você pediu!';
    return [r];
  }
  if (r0.size !== 1 && prev) prev.size = r0.size;
  return [];
}

function describeInference(seg) {
  const words = seg.map((m) => m.from || m.phrase).join(' ');
  return `Interpretei "${words}" pelo sentido.`;
}

function finalize(r) {
  // Negações: "não quero chuva" → céu limpo; "sem noite" → dia.
  if (r.negated) {
    if (r.category === 'environment') {
      const flip = { rain: 'clear', snow: 'clear', thunderstorm: 'clear', fog: 'clear', night: 'day', day: 'night', sunset: 'day', clear: 'rain' };
      r.id = flip[r.id] || 'clear';
      r.negated = false;
      r.reason = 'Entendi a negação e fiz o contrário.';
    } else return null;
  }
  r.element = r.elements[0] || null;
  r.count = Math.max(1, Math.min(r.count, 12));
  delete r.pos;
  return r;
}

const ARTICLES = new Set(['uma', 'um', 'a', 'minha', 'sua', 'de', 'da', 'numa', 'essa', 'esta', 'the', 'pequena', 'grande', 'nova', 'outra']);
// "faça" e "faca" viram a mesma palavra sem acento: só é "faca" (objeto) depois de artigo.
function disambiguate(tokens) {
  return tokens.map((t, i) => (t === 'faca' && (i === 0 || !ARTICLES.has(tokens[i - 1])) ? 'faz' : t));
}

export function interpret(text, ctx = {}) {
  const normalized = normalize(text);
  const tokens = disambiguate(tokenize(text));
  const out = {
    text: String(text || ''),
    normalized,
    results: [],
    confidence: 0,
    understood: false,
    lang: tokens.some((t) => EN_HINTS.has(t)) ? 'en' : 'pt',
    unknown: [],
    source: 'local',
  };
  if (!tokens.length) return out;
  const { matches, unknown } = findMatches(tokens);
  out.unknown = unknown;
  const segments = segmentMatches(tokens, matches);
  let prev = null;
  for (const seg of segments) {
    const rs = interpretSegment(seg, prev, ctx);
    for (const r of rs) {
      out.results.push(r);
      prev = r;
    }
  }
  out.results = out.results.map(finalize).filter(Boolean).slice(0, MAX_RESULTS);
  // remove duplicatas exatas
  const seen = new Set();
  out.results = out.results.filter((r) => {
    const k = `${r.category}:${r.id}:${r.variant}:${r.element}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (out.results.length) {
    out.understood = true;
    out.confidence = Math.max(...out.results.map((r) => r.confidence));
    // muitas palavras desconhecidas reduzem a confiança
    const content = tokens.filter((t) => !STOPWORDS.has(t) && !SEPARATORS.has(t)).length || 1;
    out.confidence *= 1 - Math.min(0.35, (unknown.length / content) * 0.35);
  }
  return out;
}

// Sugestões quando nada foi entendido.
export function suggestions(text) {
  const tokens = tokenize(text).filter((t) => !STOPWORDS.has(t) && t.length >= 3);
  const out = [];
  for (const t of tokens) {
    let best = null;
    for (const cand of LEXICON.singles) {
      const d = levenshtein(t, cand, 3);
      if (d <= 3 && (!best || d < best.d) && LEXICON.map.get(cand).some((e) => e.kind === 'head')) best = { cand, d };
    }
    if (best) out.push(best.cand);
  }
  return [...new Set(out)].slice(0, 3);
}
