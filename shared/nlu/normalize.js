// Normalização de texto falado: minúsculas, sem acentos, sem pontuação, números por extenso.

export function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function normalize(text) {
  return stripAccents(String(text || '').toLowerCase())
    .replace(/[-_/]+/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function tokenize(text) {
  const n = normalize(text);
  return n ? n.split(' ') : [];
}

export const NUMBER_WORDS = {
  um: 1, uma: 1, one: 1, a: 1,
  dois: 2, duas: 2, two: 2, par: 2, pair: 2,
  tres: 3, three: 3, trio: 3,
  quatro: 4, four: 4,
  cinco: 5, five: 5,
  seis: 6, six: 6, meia: 6,
  sete: 7, seven: 7,
  oito: 8, eight: 8,
  nove: 9, nine: 9,
  dez: 10, ten: 10,
  doze: 12, dozen: 12, duzia: 12,
  vinte: 20, twenty: 20,
  cem: 100, hundred: 100, mil: 1000, thousand: 1000, milhao: 1000000, million: 1000000,
};

// Palavras vazias (artigos, preposições, verbos de pedido) — ignoradas na busca de conceitos.
export const STOPWORDS = new Set(
  (
    'a o as os um uma uns umas de do da dos das no na nos nas em para pra pro por com ' +
    'que e ou se me mim eu tu voce voces ele ela nos vos eles elas meu minha meus minhas seu sua ' +
    'quero queria quer queremos gostaria desejo preciso precisamos manda mande da de dar dá ' +
    'faz faca faça fazer faz crie criar cria gere gerar gera invoque aparecer aparece apareca surgir surja ' +
    'coloca coloque colocar bota bote botar pega pegar traga trazer traz agora ja aqui ali la ' +
    'por favor favor pfv pls please the an of to for with and or i me my want wanna give get make create need ' +
    'some algum alguma alguns algumas coisa coisas tipo assim entao ai ne hein oi ola hey ei ' +
    'bem bom vai vamos vem venha consiga consegue consiga possa pode podia poderia seja ser sou esta estou tem ter ' +
    'is are be can could would should will this that it its so very muito muita algo super bem mais deixa deixe deixar fica ficar quero'
  ).split(/\s+/)
);

// Gera variações morfológicas simples (plural, diminutivo, aumentativo) para casar com o léxico.
export function stemCandidates(tok) {
  const out = new Set([tok]);
  const add = (s) => s && s.length >= 2 && out.add(s);
  if (tok.endsWith('oes')) add(tok.slice(0, -3) + 'ao');
  if (tok.endsWith('aes')) add(tok.slice(0, -3) + 'ao');
  if (tok.endsWith('ais')) add(tok.slice(0, -3) + 'al');
  if (tok.endsWith('eis')) add(tok.slice(0, -3) + 'el');
  if (tok.endsWith('ns')) add(tok.slice(0, -2) + 'm');
  if (tok.endsWith('es')) add(tok.slice(0, -2));
  if (tok.endsWith('s')) add(tok.slice(0, -1));
  if (tok.endsWith('zinhos') || tok.endsWith('zinhas')) add(tok.slice(0, -6));
  if (tok.endsWith('zinho') || tok.endsWith('zinha')) add(tok.slice(0, -5));
  if (tok.endsWith('inho')) add(tok.slice(0, -4) + 'o');
  if (tok.endsWith('inha')) add(tok.slice(0, -4) + 'a');
  if (tok.endsWith('inhos')) add(tok.slice(0, -5) + 'o');
  if (tok.endsWith('zao')) add(tok.slice(0, -3));
  if (tok.endsWith('zona')) add(tok.slice(0, -4));
  if (tok.endsWith('ona') && tok.length > 5) add(tok.slice(0, -3) + 'a');
  if (tok.endsWith('ao') && tok.length > 5) {
    add(tok.slice(0, -2) + 'o');
    add(tok.slice(0, -2) + 'a');
  }
  if (tok.endsWith('ies')) add(tok.slice(0, -3) + 'y');
  if (tok.endsWith('ing') && tok.length > 5) add(tok.slice(0, -3));
  return [...out];
}

export function levenshtein(a, b, max = 3) {
  if (a === b) return 0;
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  let prev2 = new Array(lb + 1).fill(0);
  let prev = new Array(lb + 1);
  let cur = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;
  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = i;
    for (let j = 1; j <= lb; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      // transposição de letras vizinhas (Damerau)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const t = prev2;
    prev2 = prev;
    prev = cur;
    cur = t;
  }
  return prev[lb];
}

// Tolerância a erros do reconhecedor conforme o tamanho da palavra.
export function fuzzyTolerance(len) {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  if (len <= 8) return 2;
  return 3;
}
