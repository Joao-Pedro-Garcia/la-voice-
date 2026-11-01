// Reconhecimento de fala OPCIONAL no servidor (proxy). Útil para navegadores sem
// Web Speech API (ex.: Firefox). Encaminha o áudio gravado (webm/ogg/wav) para um serviço
// de transcrição compatível com o formato "multipart /audio/transcriptions" (ex.: um
// servidor whisper.cpp local ou outro provedor). Configure por variáveis de ambiente:
//   LAVOICE_STT_URL   ex.: http://127.0.0.1:8080/v1/audio/transcriptions
//   LAVOICE_STT_KEY   (opcional) chave do serviço — fica só no servidor
//   LAVOICE_STT_MODEL (opcional) nome do modelo, ex.: whisper-1 / base
// Sem LAVOICE_STT_URL o endpoint responde 503 e o cliente usa outro reconhecedor.

export function createSttProxy({ url = process.env.LAVOICE_STT_URL, key = process.env.LAVOICE_STT_KEY, model = process.env.LAVOICE_STT_MODEL || 'whisper-1', timeoutMs = 15000 } = {}) {
  if (!url) return null;
  return async function transcribe(buffer, mime = 'audio/webm', lang = 'pt') {
    const form = new FormData();
    const ext = mime.includes('ogg') ? 'ogg' : mime.includes('wav') ? 'wav' : mime.includes('mp4') ? 'm4a' : 'webm';
    form.append('file', new Blob([buffer], { type: mime }), `fala.${ext}`);
    form.append('model', model);
    form.append('language', lang);
    form.append('response_format', 'json');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { method: 'POST', body: form, headers: key ? { Authorization: `Bearer ${key}` } : {}, signal: ctrl.signal });
      if (!res.ok) throw new Error(`STT HTTP ${res.status}`);
      const data = await res.json();
      return String(data.text || '').trim();
    } finally {
      clearTimeout(timer);
    }
  };
}
