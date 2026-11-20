// Pruebas sin red ni Supabase: cifrado y formato de proveedores.
process.env.MASTER_KEY = require('crypto').randomBytes(32).toString('base64');
const assert = require('assert');
const { encrypt, decrypt, hint } = require('../lib/crypto');

const { ciphertext, iv } = encrypt('sk-ant-secreto-1234');
assert.strictEqual(decrypt(ciphertext, iv), 'sk-ant-secreto-1234');
assert.strictEqual(hint('sk-ant-secreto-1234'), '…1234');
assert.throws(() => decrypt(ciphertext.slice(0, -4) + 'AAAA', iv));

// Proveedores con fetch simulado
const { complete } = require('../lib/providers');
const calls = [];
global.fetch = async (url, o) => { calls.push({ url, o }); return { ok: true, status: 200, json: async () => RESP[Object.keys(RESP).find(k => url.includes(k))] }; };
const RESP = {
  'anthropic.com': { content: [{ type: 'text', text: 'hola' }], usage: { input_tokens: 3, output_tokens: 5 } },
  'openai.com': { choices: [{ message: { content: 'hola' } }], usage: { prompt_tokens: 3, completion_tokens: 5 } },
  'mistral.ai': { choices: [{ message: { content: 'hola' } }], usage: { prompt_tokens: 3, completion_tokens: 5 } },
  'googleapis.com': { candidates: [{ content: { parts: [{ text: 'hola' }] } }], usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 5 } }
};
(async () => {
  for (const p of ['anthropic', 'openai', 'mistral', 'gemini']) {
    const r = await complete(p, { apiKey: 'k', system: 's', messages: [{ role: 'user', content: 'x' }] });
    assert.strictEqual(r.text, 'hola'); assert.deepStrictEqual(r.usage, { input_tokens: 3, output_tokens: 5 });
  }
  console.log('OK: cifrado + 4 proveedores');
})();
