// Guardar / borrar claves cifradas. El valor nunca vuelve al navegador.
const { route, requireUser, admin, HttpError } = require('../lib/http');
const { encrypt, hint } = require('../lib/crypto');

const KINDS = ['anthropic', 'openai', 'gemini', 'mistral', 'wordpress'];

module.exports = route(['POST', 'DELETE'], async (req, body) => {
  const user = await requireUser(req);

  if (req.method === 'POST') {
    const { kind, label, value } = body;
    if (!KINDS.includes(kind)) throw new HttpError(400, 'Tipo de clave no válido');
    if (!value || String(value).length < 4) throw new HttpError(400, 'Falta el valor de la clave');
    const { ciphertext, iv } = encrypt(value);
    const { data, error } = await admin().from('secrets').insert({
      owner_id: user.id, kind, label: label || kind, key_hint: hint(value), ciphertext, iv
    }).select('id, kind, label, key_hint, created_at').single();
    if (error) throw new HttpError(500, error.message);
    return data;
  }

  const { id } = body;
  if (!id) throw new HttpError(400, 'Falta id');
  const { error } = await admin().from('secrets').delete().eq('id', id).eq('owner_id', user.id);
  if (error) throw new HttpError(500, error.message);
  return { ok: true };
});
