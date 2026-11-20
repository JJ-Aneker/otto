// Genera texto con el proveedor y la clave del perfil. Registra el consumo.
const { route, requireUser, loadWorkspace, loadSecret, admin, HttpError } = require('../lib/http');
const { complete } = require('../lib/providers');

module.exports = route(['POST'], async (req, body) => {
  const user = await requireUser(req);
  const ws = await loadWorkspace(user, body.workspaceId);
  if (!Array.isArray(body.messages) || !body.messages.length) throw new HttpError(400, 'Faltan mensajes');

  const apiKey = await loadSecret(user, ws.ai_secret_id);
  const out = await complete(ws.ai_provider, {
    apiKey, model: ws.ai_model, system: body.system, messages: body.messages,
    maxTokens: Math.min(Number(body.max_tokens) || 4000, 8000)
  });

  await admin().from('usage_log').insert({
    workspace_id: ws.id, user_id: user.id, provider: ws.ai_provider, model: out.model,
    input_tokens: out.usage.input_tokens, output_tokens: out.usage.output_tokens,
    label: body.label || null
  });

  // Formato compatible con el front de la V12 (estilo Anthropic).
  return {
    content: [{ type: 'text', text: out.text }],
    usage: out.usage, provider: ws.ai_provider, model: out.model
  };
});
