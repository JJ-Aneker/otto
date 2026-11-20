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
      parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }]
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

async function complete(provider, opts) {
  if (!impl[provider]) throw new HttpError(400, 'Proveedor no soportado: ' + provider);
  const model = opts.model || DEFAULT_MODELS[provider];
  const out = await impl[provider]({ ...opts, model, maxTokens: opts.maxTokens || 4000 });
  return { ...out, model };
}

module.exports = { complete, DEFAULT_MODELS };
