// Utilitários HTTP para rodar atrás de um proxy com HTTPS (Render, Railway, Fly...).

// O Render (e a maioria das hospedagens) define a variável RENDER ou exige confiar no proxy.
export const BEHIND_PROXY = !!(process.env.RENDER || process.env.LAVOICE_TRUST_PROXY === '1');

const isLocal = (host = '') => /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);

// IP real do jogador (para limites de requisições), considerando o cabeçalho do proxy.
export function clientIp(req) {
  if (BEHIND_PROXY) {
    const xff = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    if (xff) return xff;
  }
  return req.socket.remoteAddress || '?';
}

export function isHttps(req) {
  return req.socket.encrypted || (BEHIND_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https');
}

// Redireciona HTTP → HTTPS quando atrás do proxy (microfone e reconhecimento de voz exigem HTTPS).
export function httpsRedirect(req) {
  if (!BEHIND_PROXY) return null;
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
  const host = req.headers.host || '';
  if (proto === 'http' && !isLocal(host)) return `https://${host}${req.url}`;
  return null;
}

export function securityHeaders(req) {
  const h = {
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'strict-origin-when-cross-origin',
    // libera o microfone só para o próprio site; câmera e localização ficam bloqueadas
    'permissions-policy': 'microphone=(self), camera=(), geolocation=(), payment=()',
    'cross-origin-opener-policy': 'same-origin',
    'content-security-policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; " +
      "connect-src 'self' ws: wss:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
  };
  if (isHttps(req)) h['strict-transport-security'] = 'max-age=31536000; includeSubDomains';
  return h;
}

// Aceita WebSocket só da própria origem (ou das listadas em LAVOICE_ALLOWED_ORIGINS).
export function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // clientes nativos/testes não enviam Origin
  let host;
  try {
    host = new URL(origin).host;
  } catch {
    return false;
  }
  if (host === req.headers.host) return true;
  const extra = String(process.env.LAVOICE_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  return extra.some((o) => o === origin || o === host);
}
