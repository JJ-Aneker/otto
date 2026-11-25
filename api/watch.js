// Otto vigila: "Revisar ahora". Revisa las webs del perfil y guarda el resultado.
const { route, requireUser, loadWorkspace, admin, HttpError } = require('../lib/http');
const { checkSite } = require('../lib/watch');

module.exports = route(['POST'], async (req, body) => {
  const user = await requireUser(req);
  const ws = await loadWorkspace(user, body.workspaceId);
  const db = admin();
  let q = db.from('watch_sites').select('*').eq('workspace_id', ws.id);
  if (body.siteId) q = q.eq('id', body.siteId);
  const { data: sites, error } = await q.limit(5);
  if (error) throw new HttpError(500, error.message);
  if (!sites.length) throw new HttpError(404, 'No hay webs que revisar');

  const checks = [];
  for (const s of sites) {
    const r = await checkSite(s.url);
    const row = { site_id: s.id, workspace_id: ws.id, ...r };
    const { data, error: e2 } = await db.from('watch_checks').insert(row).select().single();
    if (e2) throw new HttpError(500, e2.message);
    checks.push(data);
  }
  return { checks };
});
