// Proxy hacia la API REST de WordPress del perfil (la URL sale del perfil, no del navegador).
const { route, requireUser, loadWorkspace, HttpError } = require('../lib/http');

module.exports = route(['POST'], async (req, body) => {
  const user = await requireUser(req);
  const ws = await loadWorkspace(user, body.workspaceId);
  const { wpPath, method, token, body: payload } = body;
  if (!ws.wp_url) throw new HttpError(400, 'Falta la URL de WordPress en el perfil');
  if (!wpPath || /\.\./.test(wpPath)) throw new HttpError(400, 'Ruta no válida');

  const m = (method || 'GET').toUpperCase();
  const r = await fetch(`${ws.wp_url.replace(/\/$/, '')}/wp-json/wp/v2/${wpPath}`, {
    method: m,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: 'Bearer ' + token }) },
    ...(payload && ['POST', 'PUT'].includes(m) && { body: JSON.stringify(payload) })
  });
  const data = await r.json().catch(() => ({}));
  return { status: r.status, json: data };
});
