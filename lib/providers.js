// Capa de proveedores de IA. Todos devuelven el mismo formato:
// { text, usage:{input_tokens, output_tokens}, model }
const { HttpError } = require('./http');

const DEFAULT_MODELS = {
  anthropic: 'claude-haiku-4-5-20251001',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-2.0-flash',
  mistral: 'mistral-small-latest'
};

async function post(url, headers, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = data?.error?.message || data?.error || data?.message || ('Error del proveedor (' + r.status + ')');
    throw new HttpError(r.status, typeof msg === 'string' ? msg : JSON.stringify(msg), data);
  }
  return data;
}

const impl = {
  async anthropic({ apiKey, model, system, messages, maxTokens }) {
    const d = await post('https://api.anthropic.com/v1/messages',
      { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      { model, max_tokens: maxTokens, ...(system && { system }), messages });
    return {
      text: (d.content || []).filter(b => b.type === 'text').map(b => b.text).join(''),
      usage: { input_tokens: d.usage?.input_tokens || 0, output_tokens: d.usage?.output_tokens || 0 }
    };
  },

  async openai({ apiKey, model, system, messages, maxTokens }) {
    const msgs = [...(system ? [{ role: 'system', content: system }] : []), ...messages];
    const d = await post('https://api.openai.com/v1/chat/completions',
      { Authorization: 'Bearer ' + apiKey },
      { model, max_tokens: maxTokens, messages: msgs });
    return {
      text: d.choices?.[0]?.message?.content || '',
      usage: { input_tokens: d.usage?.prompt_tokens || 0, output_tokens: d.usage?.completion_tokens || 0 }
    };
  },

  async mistral({ apiKey, model, system, messages, maxTokens }) {
    const msgs = [...(system ? [{ role: 'system', content: system }] : []), ...messages];
    const d = await post('https://api.mistral.ai/v1/chat/completions',
      { Authorization: 'Bearer ' + apiKey },
      { model, max_tokens: maxTokens, messages: msgs });
    return {
      text: d.choices?.[0]?.message?.content || '',
      usage: { input_tokens: d.usage?.prompt_tokens || 0, output_tokens: d.usage?.completion_tokens || 0 }
    };
  },

  async gemini({ apiKey, model, system, messages, maxTokens }) {
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: m.parts || [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
    }));
    const d = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      { 'x-goog-api-key': apiKey },
      { contents, ...(system && { systemInstruction: { parts: [{ text: system }] } }),
        generationConfig: { maxOutputTokens: maxTokens } });
    return {
      text: (d.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join(''),
      usage: { input_tokens: d.usageMetadata?.promptTokenCount || 0, output_tokens: d.usageMetadata?.candidatesTokenCount || 0 }
    };
  }
};

// Adjunta archivos (PDF o imagen) al último mensaje, en el formato de cada proveedor.
// files: [{ mime, base64, name }]
function attachFiles(provider, messages, files) {
  if (!files || !files.length) return messages;
  const out = messages.map(m => ({ ...m }));
  const last = out[out.length - 1];
  const text = typeof last.content === 'string' ? last.content : '';
  const isPdf = f => f.mime === 'application/pdf';
  if (provider === 'anthropic') {
    last.content = [
      ...files.map(f => isPdf(f)
        ? { type: 'document', source: { type: 'base64', media_type: f.mime, data: f.base64 } }
        : { type: 'image', source: { type: 'base64', media_type: f.mime, data: f.base64 } }),
      { type: 'text', text }
    ];
  } else if (provider === 'openai') {
    last.content = [
      { type: 'text', text },
      ...files.map(f => isPdf(f)
        ? { type: 'file', file: { filename: f.name || 'documento.pdf', file_data: `data:${f.mime};base64,${f.base64}` } }
        : { type: 'image_url', image_url: { url: `data:${f.mime};base64,${f.base64}` } })
    ];
  } else if (provider === 'gemini') {
    last.parts = [
      ...files.map(f => ({ inline_data: { mime_type: f.mime, data: f.base64 } })),
      { text }
    ];
  } else {
    throw new HttpError(400, 'Este proveedor de IA no puede leer documentos. Usa Anthropic (Claude), OpenAI o Gemini en Configuración → IA y consumo.');
  }
  return out;
}

async function complete(provider, opts) {
  if (!impl[provider]) throw new HttpError(400, 'Proveedor no soportado: ' + provider);
  const model = opts.model || DEFAULT_MODELS[provider];
  const messages = attachFiles(provider, opts.messages, opts.files);
  const out = await impl[provider]({ ...opts, messages, model, maxTokens: opts.maxTokens || 4000 });
  return { ...out, model };
}

module.exports = { complete, attachFiles, DEFAULT_MODELS };
