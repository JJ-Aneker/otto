// Pide un token JWT a WordPress usando la contraseña guardada cifrada (nunca sale del servidor).
const { route, requireUser, loadWorkspace, loadSecret, HttpError } = require('../lib/http');

module.exports = route(['POST'], async (req, body) => {
  const user = await requireUser(req);
  const ws = await loadWorkspace(user, body.workspaceId);
  if (!ws.wp_url || !ws.wp_user) throw new HttpError(400, 'Falta la URL o el usuario de WordPress en el perfil');
  const password = await loadSecret(user, ws.wp_secret_id);

  const r = await fetch(`${ws.wp_url.replace(/\/$/, '')}/wp-json/jwt-auth/v1/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ws.wp_user, password })
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new HttpError(r.status, data.message || 'No se pudo conectar con WordPress', data);
  return data;
});
