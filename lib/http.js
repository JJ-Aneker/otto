// Utilidades comunes de las funciones de la API.
const { createClient } = require('@supabase/supabase-js');

let _admin;
function admin() {
  if (!_admin) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY)
      throw new HttpError(500, 'Faltan SUPABASE_URL / SUPABASE_SERVICE_KEY');
    _admin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY, {
      auth: { persistSession: false }
    });
  }
  return _admin;
}

class HttpError extends Error {
  constructor(status, message, detail) { super(message); this.status = status; this.detail = detail; }
}

// Valida el token de Supabase del navegador y devuelve el usuario.
async function requireUser(req) {
  const h = req.headers['authorization'] || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw new HttpError(401, 'No has iniciado sesión');
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Sesión no válida o caducada');
  return data.user;
}

// Carga un workspace comprobando que pertenece al usuario.
async function loadWorkspace(user, workspaceId) {
  if (!workspaceId) throw new HttpError(400, 'Falta workspaceId');
  const { data, error } = await admin().from('workspaces').select('*')
    .eq('id', workspaceId).eq('owner_id', user.id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, 'Perfil no encontrado');
  return data;
}

// Descifra una clave guardada, comprobando que es del usuario.
async function loadSecret(user, secretId) {
  const { decrypt } = require('./crypto');
  if (!secretId) throw new HttpError(400, 'Este perfil no tiene la clave configurada');
  const { data, error } = await admin().from('secrets').select('*')
    .eq('id', secretId).eq('owner_id', user.id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, 'Clave no encontrada');
  return decrypt(data.ciphertext, data.iv);
}

// Envuelve un handler: método, JSON, errores uniformes.
function route(methods, fn) {
  return async (req, res) => {
    try {
      if (req.method === 'OPTIONS') { res.status(204).end(); return; }
      if (!methods.includes(req.method)) throw new HttpError(405, 'Método no permitido');
      let body = req.body;
      if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = {}; } }
      const out = await fn(req, body || {});
      res.status(out?.status || 200).json(out?.json ?? out ?? {});
    } catch (e) {
      res.status(e.status || 500).json({ error: e.message || 'Error interno', detail: e.detail });
    }
  };
}

module.exports = { admin, HttpError, requireUser, loadWorkspace, loadSecret, route };
