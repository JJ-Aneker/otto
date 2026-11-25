// Otto cuenta: guarda la conexión (clave cifrada) y lee las estadísticas de Google Analytics e Instagram.
const { route, requireUser, loadWorkspace, loadSecret, admin, HttpError } = require('../lib/http');
const { encrypt, hint } = require('../lib/crypto');
const { parseServiceAccount, googleToken, runGa, runInstagram, cleanProperty } = require('../lib/count');

async function config(db, wsId) {
  const { data, error } = await db.from('count_config').select('*').eq('workspace_id', wsId).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data;
}
async function saveSecret(db, user, kind, label, value) {
  const { ciphertext, iv } = encrypt(value);
  const { data, error } = await db.from('secrets').insert({ owner_id: user.id, kind, label, key_hint: hint(value), ciphertext, iv }).select('id').single();
  if (error) throw new HttpError(500, error.message);
  return data.id;
}
const dropSecret = (db, user, id) => id ? db.from('secrets').delete().eq('id', id).eq('owner_id', user.id) : null;

module.exports = route(['POST'], async (req, body) => {
  const user = await requireUser(req);
  const ws = await loadWorkspace(user, body.workspaceId);
  const db = admin();
  const cfg = await config(db, ws.id);

  if (body.action === 'save') {
    const row = { workspace_id: ws.id, updated_at: new Date().toISOString() };
    const old = {};
    if (body.ga) {
      const prop = cleanProperty(body.ga.property);
      if (!prop) throw new HttpError(400, 'El ID de la propiedad son solo números (por ejemplo 123456789)');
      row.ga_property = prop;
      row.site_url = String(body.ga.siteUrl || '').trim().slice(0, 200) || null;
      if (body.ga.json) {                               // clave nueva: se comprueba antes de guardarla
        const sa = parseServiceAccount(body.ga.json);
        await googleToken(sa);
        await runGa(sa, prop, 7);
        row.ga_secret_id = await saveSecret(db, user, 'ga4', 'Google Analytics', JSON.stringify(sa));
        row.ga_email = sa.client_email; old.ga = cfg && cfg.ga_secret_id;
      } else if (!cfg || !cfg.ga_secret_id) throw new HttpError(400, 'Pega el archivo JSON de la cuenta de servicio');
      else {                                            // solo cambia el ID: se comprueba con la clave guardada
        const sa = parseServiceAccount(await loadSecret(user, cfg.ga_secret_id)); await runGa(sa, prop, 7);
      }
    }
    if (body.ig) {
      const igId = String(body.ig.userId || '').replace(/\D/g, '');
      if (!igId) throw new HttpError(400, 'El ID de Instagram son solo números');
      row.ig_user_id = igId;
      if (body.ig.token) {
        await runInstagram(String(body.ig.token).trim(), igId, 7);
        row.ig_secret_id = await saveSecret(db, user, 'instagram', 'Instagram', String(body.ig.token).trim()); old.ig = cfg && cfg.ig_secret_id;
      } else if (!cfg || !cfg.ig_secret_id) throw new HttpError(400, 'Pega el token de acceso de Instagram');
      else await runInstagram(await loadSecret(user, cfg.ig_secret_id), igId, 7);
    }
    const { error } = await db.from('count_config').upsert(row, { onConflict: 'workspace_id' });
    if (error) throw new HttpError(500, error.message);
    await dropSecret(db, user, old.ga); await dropSecret(db, user, old.ig);
    return { ok: true, config: await config(db, ws.id) };
  }

  if (body.action === 'remove') {
    if (!cfg) return { ok: true };
    const which = body.which === 'ig' ? 'ig' : 'ga';
    const patch = which === 'ga' ? { ga_property: null, ga_secret_id: null, ga_email: null, site_url: null } : { ig_user_id: null, ig_secret_id: null };
    await dropSecret(db, user, which === 'ga' ? cfg.ga_secret_id : cfg.ig_secret_id);
    const { error } = await db.from('count_config').update(patch).eq('workspace_id', ws.id);
    if (error) throw new HttpError(500, error.message);
    return { ok: true, config: await config(db, ws.id) };
  }

  if (body.action === 'ga') {
    if (!cfg || !cfg.ga_secret_id || !cfg.ga_property) throw new HttpError(400, 'Google Analytics no está conectado');
    const sa = parseServiceAccount(await loadSecret(user, cfg.ga_secret_id));
    return await runGa(sa, cfg.ga_property, body.days);
  }
  if (body.action === 'ig') {
    if (!cfg || !cfg.ig_secret_id || !cfg.ig_user_id) throw new HttpError(400, 'Instagram no está conectado');
    return await runInstagram(await loadSecret(user, cfg.ig_secret_id), cfg.ig_user_id, body.days);
  }
  throw new HttpError(400, 'Acción no válida');
});
