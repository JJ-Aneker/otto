// Otto ordena: lee un documento ya subido (PDF o foto) con la IA del perfil y guarda sus datos.
const { route, requireUser, loadWorkspace, loadSecret, admin, HttpError } = require('../lib/http');
const { complete } = require('../lib/providers');
const { SYSTEM, buildPrompt, buildFields } = require('../lib/ordena');

const MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

module.exports = route(['POST'], async (req, body) => {
  const user = await requireUser(req);
  const ws = await loadWorkspace(user, body.workspaceId);
  const db = admin();
  if (body.action !== 'extract') throw new HttpError(400, 'Acción no válida');
  if (!body.docId) throw new HttpError(400, 'Falta docId');

  const { data: doc, error } = await db.from('order_docs').select('*').eq('id', body.docId).eq('workspace_id', ws.id).maybeSingle();
  if (error) throw new HttpError(500, error.message);
  if (!doc) throw new HttpError(404, 'Documento no encontrado');

  const fail = async (e) => {
    await db.from('order_docs').update({ status: 'error', extract_error: e.message }).eq('id', doc.id);
    throw e;
  };

  try {
    if (!MIMES.includes(doc.mime)) throw new HttpError(415, 'Formato no admitido. Usa PDF, JPG, PNG o WEBP.');
    const apiKey = await loadSecret(user, ws.ai_secret_id);

    const dl = await db.storage.from('ordena').download(doc.file_path);
    if (dl.error || !dl.data) throw new HttpError(404, 'No se encuentra el archivo subido');
    const buf = Buffer.from(await dl.data.arrayBuffer());
    if (buf.length > 10 * 1024 * 1024) throw new HttpError(413, 'El archivo supera los 10 MB');

    const { data: cats } = await db.from('order_categories').select('*').eq('workspace_id', ws.id).order('position');

    const out = await complete(ws.ai_provider, {
      apiKey, model: ws.ai_model, system: SYSTEM, maxTokens: 2500,
      messages: [{ role: 'user', content: buildPrompt(cats || []) }],
      files: [{ mime: doc.mime, base64: buf.toString('base64'), name: doc.file_name }],
    });
    await db.from('usage_log').insert({
      workspace_id: ws.id, user_id: user.id, provider: ws.ai_provider, model: out.model,
      input_tokens: out.usage.input_tokens, output_tokens: out.usage.output_tokens, label: 'ordena'
    });

    let built;
    try { built = buildFields(out.text, cats || []); }
    catch { throw new HttpError(502, 'No se pudo interpretar la respuesta de la IA. Prueba con otro documento o vuelve a leerlo.'); }
    const f = built.fields;

    // ¿Ya existe el mismo documento?
    let duplicate_of = null;
    if (f.doc_number && f.total !== null) {
      let q = db.from('order_docs').select('id').eq('workspace_id', ws.id).eq('direction', doc.direction)
        .eq('doc_number', f.doc_number).eq('total', f.total).neq('id', doc.id);
      q = f.supplier_tax_id ? q.eq('supplier_tax_id', f.supplier_tax_id) : (f.supplier ? q.ilike('supplier', f.supplier) : q);
      const { data: dup } = await q.limit(1);
      if (dup && dup.length) { duplicate_of = dup[0].id; f.flags.push('duplicado'); }
    }

    const { data: saved, error: e2 } = await db.from('order_docs').update({
      ...f, duplicate_of, extract_error: null, reviewed_at: null,
      status: f.flags.length ? 'review' : 'done',
    }).eq('id', doc.id).select().single();
    if (e2) throw new HttpError(500, e2.message);
    return { doc: saved, categoryBy: built.categoryBy };
  } catch (e) { await fail(e); }
});
