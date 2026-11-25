// Otto vigila: "Revisar ahora" / "Volver a comprobar". Revisa las webs del perfil, guarda el resultado y actualiza los avisos.
const { route, requireUser, loadWorkspace, admin, HttpError } = require('../lib/http');
const { runSite } = require('../lib/watch');

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
  let syncError = null;
  for (const s of sites) {
    const r = await runSite(db, s);
    checks.push(r.check);
    syncError = syncError || r.syncError;
  }
  return { checks, syncError };
});
