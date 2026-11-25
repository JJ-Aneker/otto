/* ============================================================
   Otto ordena · facturas y tickets
   Sube un PDF o una foto, la IA del perfil lee los datos y tú los revisas.
   Datos: order_docs y order_categories (Supabase) + archivos en el almacén privado "ordena".
   La lectura con IA la hace el servidor (api/ordena).
   ============================================================ */
(function () {
  const O = { docs: [], cats: [], loaded: false, filter: 'all', month: null, busy: new Set(), queue: { total: 0, done: 0 }, openId: null, catsError: false, editCat: null };

  const MAX_MB = 10;
  const EXT_MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
  const TYPE_TXT = { factura: 'Factura', ticket: 'Ticket', otro: 'Documento' };
  const FLAG_TXT = {
    sin_proveedor: 'Falta el proveedor', sin_nif_proveedor: 'Sin NIF del proveedor', sin_fecha: 'Sin fecha', sin_total: 'Sin importe total',
    sin_categoria: 'Sin categoría', importes_no_cuadran: 'Los importes no cuadran', duplicado: 'Posible duplicado',
  };

  // Maestro de categorías de partida (editable en Configuración → Ordena)
  const DEFAULT_CATS = [
    ['Gestoría', 'colaboradores', 'Mis gestoría Online'],
    ['Mantenimiento web', 'colaboradores', 'DCMWEB, seosem'],
    ['Mentorías', 'colaboradores', ''],
    ['Formación', 'Formación', ''],
    ['Laboratorios fotográficos', 'Impresión fotográfica', 'Larios Crea Digital, Kitoli'],
    ['Material para sesiones', 'Material para sesiones', 'Zara, shein, temu, tejidos, props, globos, Leroy'],
    ['Material de trabajo', 'equipo de trabajo', 'cámara, lentes, luces, pc, ordenador, pies de focos'],
    ['Web', 'web', 'Ionos'],
    ['Publicidad y MK', 'Trustlocal', 'meta, google, papelería, bolsas, tarjetas'],
    ['Teléfono', 'Suministro', 'Digi'],
    ['Gasolina', 'Suministro', ''],
    ['Restaurante y hoteles', 'Restaurante y hoteles', ''],
    ['Cuotas de autónomo', 'Cuotas de autónomo', ''],
    ['Software', 'Informatica', 'programas software, adminphoto, evoto'],
    ['Comisiones', 'Comisiones', 'Adminphoto, bancos'],
    ['Asociaciones', 'Fotografía', ''],
  ];

  /* ── Utilidades ── */
  const eur = n => n === null || n === undefined || n === '' ? '—' : Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR' });
  const fmtIn = n => n === null || n === undefined ? '' : Number(n).toFixed(2).replace('.', ',');
  const parseIn = v => {
    let s = String(v ?? '').replace(/[^\d.,-]/g, ''); if (!s) return null;
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (lc > -1) s = s.replace(',', '.');
    const n = parseFloat(s); return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  };
  const shortDate = iso => { const d = new Date(iso + (String(iso).length === 10 ? 'T00:00:00' : '')); return isNaN(d) ? '' : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }); };
  const monthOf = d => String(d.doc_date || d.created_at || '').slice(0, 7);
  const monthName = ym => { const [y, m] = ym.split('-').map(Number); const t = new Date(y, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }); return t.charAt(0).toUpperCase() + t.slice(1); };
  const curMonth = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); };
  const stripTxt = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const catOf = concept => O.cats.find(c => c.concept === concept);

  function vatOf(d) {
    if (d.vat_amount !== null && d.vat_amount !== undefined) return Number(d.vat_amount);
    if (d.base_amount !== null && d.total !== null && d.base_amount !== undefined && d.total !== undefined) return Math.max(0, Number(d.total) - Number(d.base_amount));
    return 0;
  }
  // Mismo criterio que el servidor (lib/ordena.js)
  function flagsOf(d) {
    const f = [];
    if (!d.supplier) f.push('sin_proveedor');
    if (!d.supplier_tax_id) f.push('sin_nif_proveedor');
    if (!d.doc_date) f.push('sin_fecha');
    if (d.total === null || d.total === undefined) f.push('sin_total');
    if (!d.concept) f.push('sin_categoria');
    if (d.total !== null && d.total !== undefined) {
      if (d.base_amount != null && d.vat_amount != null && Math.abs(d.base_amount + d.vat_amount - d.total) > 0.05) f.push('importes_no_cuadran');
      else if (d.base_amount != null && d.vat_rate != null && d.vat_amount == null && Math.abs(d.base_amount * (1 + d.vat_rate / 100) - d.total) > 0.1) f.push('importes_no_cuadran');
    }
    if (d.duplicate_of) f.push('duplicado');
    return f;
  }

  /* ── Carga ── */
  async function load() {
    if (typeof ws === 'undefined' || !ws || !sb) return;
    const [d, c] = await Promise.all([
      sb.from('order_docs').select('*').eq('workspace_id', ws.id).order('created_at', { ascending: false }).limit(500),
      sb.from('order_categories').select('*').eq('workspace_id', ws.id).order('position'),
    ]);
    O.catsError = !!((d && d.error) || (c && c.error));
    O.docs = (d && d.data) || []; O.cats = (c && c.data) || [];
    if (!O.catsError && !O.cats.length) await seedCats(false);
    O.loaded = true;
    if (!O.month) { const cm = curMonth(); O.month = O.docs.some(x => monthOf(x) === cm) ? cm : 'all'; }
    renderAll();
  }

  async function seedCats(notify) {
    const have = new Set(O.cats.map(c => c.concept));
    const rows = DEFAULT_CATS.map((c, i) => ({ workspace_id: ws.id, concept: c[0], expense_type: c[1], examples: c[2], position: i })).filter(r => !have.has(r.concept));
    if (!rows.length) { if (notify) showToast('Ya tienes todas las categorías iniciales', 'success'); return; }
    const r = await sb.from('order_categories').upsert(rows, { onConflict: 'workspace_id,concept', ignoreDuplicates: true });
    if (r && r.error) { showToast('Error: ' + r.error.message, 'error'); return; }
    const g = await sb.from('order_categories').select('*').eq('workspace_id', ws.id).order('position');
    O.cats = (g && g.data) || O.cats;
    if (notify) { showToast('Categorías iniciales restauradas', 'success'); renderAll(); }
  }

  /* ── Subida ── */
  const mimeOf = f => EXT_MIME[(f.name.split('.').pop() || '').toLowerCase()] || (Object.values(EXT_MIME).includes(f.type) ? f.type : null);

  // Reduce las fotos del móvil (menos peso: sube antes y la IA gasta menos)
  async function prepare(file) {
    const mime = mimeOf(file);
    if (!mime) throw new Error('Formato no admitido. Usa PDF, JPG, PNG o WEBP.');
    if (mime === 'application/pdf') {
      if (file.size > MAX_MB * 1048576) throw new Error(`El PDF pesa más de ${MAX_MB} MB.`);
      return { blob: file, mime, ext: 'pdf', name: file.name };
    }
    if (file.size <= 1.2 * 1048576) return { blob: file, mime, ext: Object.keys(EXT_MIME).find(k => EXT_MIME[k] === mime && k !== 'jpeg'), name: file.name };
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch { throw new Error('No se pudo abrir la imagen. Prueba con JPG o PNG.'); }
    const k = Math.min(1, 2200 / Math.max(bmp.width, bmp.height));
    const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
    cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
    const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.85));
    if (!blob) throw new Error('No se pudo preparar la imagen.');
    return { blob, mime: 'image/jpeg', ext: 'jpg', name: file.name.replace(/\.\w+$/, '') + '.jpg' };
  }

  async function handleFiles(list) {
    const files = [...(list || [])]; if (!files.length || !ws) return;
    O.queue.total += files.length;
    for (const f of files) {
      try { await uploadOne(f); }
      catch (e) { showToast(`${f.name}: ${e.message}`, 'error'); }
      O.queue.done++; renderHead();
    }
    O.queue = { total: 0, done: 0 }; renderAll();
  }

  async function uploadOne(file) {
    const p = await prepare(file);
    const id = (crypto.randomUUID ? crypto.randomUUID() : 'd' + Date.now() + Math.random().toString(16).slice(2));
    const path = `${ws.id}/${id}.${p.ext}`;
    const up = await sb.storage.from('ordena').upload(path, p.blob, { contentType: p.mime, upsert: false });
    if (up && up.error) throw new Error(up.error.message);
    const row = { id, workspace_id: ws.id, file_path: path, file_name: p.name.slice(0, 200), mime: p.mime, file_size: p.blob.size, status: 'pending', created_at: new Date().toISOString() };
    const ins = await sb.from('order_docs').insert({ id, workspace_id: ws.id, file_path: path, file_name: row.file_name, mime: p.mime, file_size: p.blob.size, status: 'pending' });
    if (ins && ins.error) { await sb.storage.from('ordena').remove([path]); throw new Error(ins.error.message); }
    O.docs.unshift({ ...row, flags: [], lines: [] });
    O.busy.add(id); renderAll();
    await extract(id, true);
  }

  async function extract(id, quiet) {
    O.busy.add(id); renderAll();
    try {
      const r = await apiFetch('/api/ordena', { method: 'POST', body: JSON.stringify({ action: 'extract', docId: id }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo leer el documento');
      const i = O.docs.findIndex(x => x.id === id); if (i > -1) O.docs[i] = d.doc;
      if (!quiet) showToast('Documento leído', 'success');
    } catch (e) {
      const i = O.docs.findIndex(x => x.id === id); if (i > -1) { O.docs[i].status = 'error'; O.docs[i].extract_error = e.message; }
      showToast('No se pudo leer: ' + e.message, 'error');
    }
    O.busy.delete(id); renderAll();
  }

  /* ── Pantalla ── */
  function inPeriod(d) { return O.month === 'all' || monthOf(d) === O.month; }
  function figuresFor(docs) {
    const buys = docs.filter(d => d.direction === 'compra');
    return {
      count: docs.length,
      review: docs.filter(d => d.status === 'review' || d.status === 'error').length,
      spend: buys.reduce((a, d) => a + (Number(d.total) || 0), 0),
      vat: buys.reduce((a, d) => a + vatOf(d), 0),
    };
  }

  function renderHead() {
    const el = document.getElementById('orderHeadActions'); if (!el) return;
    const q = O.queue, busy = q.total > 0;
    el.innerHTML = `<input type="file" id="orderFile" accept="application/pdf,image/jpeg,image/png,image/webp" multiple hidden onchange="OttoOrder.pick(this)">
      <input type="file" id="orderCam" accept="image/*" capture="environment" hidden onchange="OttoOrder.pick(this)">
      <button class="btn btn-secondary only-touch" onclick="document.getElementById('orderCam').click()" ${busy ? 'disabled' : ''}>Hacer foto</button>
      <button class="btn btn-primary" onclick="document.getElementById('orderFile').click()" ${busy ? 'disabled' : ''}>${busy ? `Leyendo ${Math.min(q.done + 1, q.total)} de ${q.total}…` : 'Subir documentos'}</button>`;
  }

  function renderPage() {
    renderHead();
    const el = document.getElementById('mod-order'); if (!el) return;
    if (!O.loaded) { el.innerHTML = '<p class="muted-note">Cargando…</p>'; return; }
    if (O.catsError) { el.innerHTML = `<div class="callout">Falta preparar la base de datos para Otto ordena. Ejecuta supabase/ordena.sql en Supabase.</div>`; return; }
    if (!O.docs.length) {
      el.innerHTML = `<div class="rows-empty drop-hint"><p>Todavía no hay documentos. Sube una factura o un ticket (PDF o foto) y Otto leerá sus datos. También puedes arrastrarlos aquí.</p>
        <button class="btn btn-primary" onclick="document.getElementById('orderFile').click()">Subir documentos</button></div>`;
      return;
    }
    const months = [...new Set(O.docs.map(monthOf).filter(Boolean))].sort().reverse();
    if (O.month !== 'all' && !months.includes(O.month)) months.unshift(O.month);
    const inP = O.docs.filter(inPeriod);
    const F = figuresFor(inP);
    const list = inP.filter(d => O.filter === 'all' ? true : O.filter === 'review' ? (d.status === 'review' || d.status === 'error' || d.status === 'pending') : d.status === 'done');
    const cnt = { all: inP.length, review: F.review + inP.filter(d => d.status === 'pending').length, done: inP.filter(d => d.status === 'done').length };
    const chip = (k, l) => `<button class="${O.filter === k ? 'on' : ''}" onclick="OttoOrder.filter('${k}')">${l} ${cnt[k]}</button>`;
    el.innerHTML = `
      <dl class="figs figs-row">
        <div><dt>Documentos</dt><dd>${F.count}</dd></div>
        <div><dt>Por revisar</dt><dd>${F.review}</dd></div>
        <div><dt>Gastos</dt><dd>${eur(F.spend)}</dd></div>
        <div><dt>IVA soportado</dt><dd>${eur(F.vat)}</dd></div>
      </dl>
      <div class="order-bar">
        <div class="chips" role="group" aria-label="Filtrar documentos">${chip('all', 'Todos')}${chip('review', 'Por revisar')}${chip('done', 'Revisados')}</div>
        <label class="order-month"><span class="sr-only">Periodo</span><select onchange="OttoOrder.month(this.value)">
          <option value="all" ${O.month === 'all' ? 'selected' : ''}>Todos los meses</option>
          ${months.map(m => `<option value="${m}" ${O.month === m ? 'selected' : ''}>${esc(monthName(m))}</option>`).join('')}</select></label>
      </div>
      ${list.length ? `<ul class="rows doc-list">${list.map(row).join('')}</ul>` : `<div class="rows-empty"><p>No hay documentos con este filtro.</p></div>`}`;
  }

  function row(d) {
    const busy = O.busy.has(d.id), unread = !busy && d.status === 'pending';
    const tone = busy ? 'accent' : d.status === 'error' ? 'danger' : (d.status === 'review' || unread) ? 'warn' : 'ok';
    const flags = Array.isArray(d.flags) ? d.flags : [];
    let meta;
    if (busy) meta = 'Otto está leyendo el documento…';
    else if (unread) meta = 'Subido, pero Otto aún no lo ha leído. Ábrelo para leerlo de nuevo.';
    else if (d.status === 'error') meta = d.extract_error || 'No se pudo leer';
    else if (d.status === 'review') meta = flags.map(f => FLAG_TXT[f]).filter(Boolean).slice(0, 2).join(' · ') || 'Pendiente de revisar';
    else meta = [TYPE_TXT[d.doc_type], d.doc_date ? shortDate(d.doc_date) : null, d.concept].filter(Boolean).join(' · ');
    const tag = busy ? '' : unread ? '<span class="tag tag-warn">Sin leer</span>' : d.status === 'review' ? '<span class="tag tag-warn">Por revisar</span>' : d.status === 'error' ? '<span class="tag tag-danger">Error</span>' : '';
    const sub = (d.status === 'review' && (d.doc_date || d.concept)) ? [TYPE_TXT[d.doc_type], d.doc_date ? shortDate(d.doc_date) : null, d.concept].filter(Boolean).join(' · ') : '';
    return `<li class="row doc-row" role="button" tabindex="0" onclick="OttoOrder.open('${esc(d.id)}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();OttoOrder.open('${esc(d.id)}')}">
      <span class="dot dot-${tone}${busy ? ' dot-pulse' : ''}" aria-hidden="true"></span>
      <div class="row-main"><div class="row-title">${esc(d.supplier || d.file_name)}</div><div class="row-meta">${esc(meta)}${sub ? `<span class="row-meta-sub"> · ${esc(sub)}</span>` : ''}</div></div>
      <div class="row-side">${tag}<span class="doc-amount">${busy || unread || d.status === 'error' ? '' : eur(d.total)}</span></div></li>`;
  }

  /* ── Ficha del documento ── */
  async function open(id) {
    const d = O.docs.find(x => x.id === id); if (!d) return;
    O.openId = id;
    const host = document.getElementById('docOverlay'); if (!host) return;
    host.hidden = false; document.body.classList.add('no-scroll');
    host.innerHTML = panelHtml(d);
    host.querySelector('.doc-panel').focus();
    let url = '';
    try { const r = await sb.storage.from('ordena').createSignedUrl(d.file_path, 3600); url = (r && r.data && r.data.signedUrl) || ''; } catch { /* sin vista previa */ }
    if (O.openId !== id) return;
    const pv = host.querySelector('.doc-preview'); if (!pv) return;
    const safe = /^(https:|data:image\/)/i.test(url) ? url : '';
    pv.innerHTML = !safe ? '<p class="muted-note">No se pudo cargar la vista previa.</p>'
      : d.mime === 'application/pdf' ? `<iframe src="${esc(safe)}" title="Vista previa del documento"></iframe>`
        : `<img src="${esc(safe)}" alt="Documento subido">`;
    const dl = host.querySelector('[data-dl]'); if (dl && safe) { dl.href = safe; dl.hidden = false; }
  }
  function close() {
    O.openId = null;
    const host = document.getElementById('docOverlay'); if (!host) return;
    host.hidden = true; host.innerHTML = ''; document.body.classList.remove('no-scroll');
  }

  function field(label, name, val, opts = {}) {
    return `<div class="input-group ${opts.cls || ''}"><label for="of-${name}">${esc(label)}</label>
      <input id="of-${name}" data-f="${name}" type="${opts.type || 'text'}" ${opts.mode ? `inputmode="${opts.mode}"` : ''} value="${esc(val ?? '')}" ${opts.oninput ? `oninput="${opts.oninput}"` : ''}></div>`;
  }

  function panelHtml(d) {
    const flags = (Array.isArray(d.flags) ? d.flags : []);
    const lines = Array.isArray(d.lines) ? d.lines : [];
    const cat = catOf(d.concept);
    const dup = d.duplicate_of ? O.docs.find(x => x.id === d.duplicate_of) : null;
    return `<div class="doc-panel" role="dialog" aria-modal="true" aria-labelledby="docTitle" tabindex="-1">
      <header class="doc-head"><h2 id="docTitle">${esc(d.supplier || d.file_name)}</h2>
        <button class="icon-btn" aria-label="Cerrar" onclick="OttoOrder.close()"><svg class="icon" aria-hidden="true"><use href="#i-x"/></svg></button></header>
      <div class="doc-grid">
        <div class="doc-side"><div class="doc-preview"><p class="muted-note">Cargando vista previa…</p></div>
          <p class="doc-file muted-note">${esc(d.file_name)} · <a data-dl hidden target="_blank" rel="noopener">Abrir en otra pestaña</a></p></div>
        <form class="doc-form" onsubmit="event.preventDefault();OttoOrder.save('${esc(d.id)}')">
          ${d.status === 'error' ? `<div class="callout">${esc(d.extract_error || 'No se pudo leer este documento.')} Puedes volver a intentarlo o rellenar los datos a mano.</div>` : ''}
          ${flags.length && d.status !== 'error' ? `<div class="callout">${flags.map(f => esc(FLAG_TXT[f] || f)).join(' · ')}${dup ? ` · Se parece a «${esc(dup.supplier || dup.file_name)}»${dup.doc_date ? ' del ' + esc(shortDate(dup.doc_date)) : ''}.` : ''}</div>` : ''}
          <div class="doc-fields">
            <div class="input-group"><label for="of-doc_type">Tipo</label><select id="of-doc_type" data-f="doc_type">
              ${['factura', 'ticket', 'otro'].map(t => `<option value="${t}" ${d.doc_type === t ? 'selected' : ''}>${TYPE_TXT[t]}</option>`).join('')}
              ${d.doc_type ? '' : '<option value="" selected>Sin indicar</option>'}</select></div>
            ${field('Fecha', 'doc_date', d.doc_date, { type: 'date' })}
            ${field('Proveedor', 'supplier', d.supplier, { cls: 'span-2' })}
            ${field('NIF del proveedor', 'supplier_tax_id', d.supplier_tax_id)}
            ${field('Número de documento', 'doc_number', d.doc_number)}
            ${field('Concepto', 'description', d.description, { cls: 'span-2' })}
            <div class="input-group span-2"><label for="of-concept">Categoría</label><select id="of-concept" data-f="concept" onchange="OttoOrder.catChange(this)">
              <option value="">Sin categoría</option>
              ${O.cats.map(c => `<option value="${esc(c.concept)}" ${d.concept === c.concept ? 'selected' : ''}>${esc(c.concept)}</option>`).join('')}
              ${d.concept && !cat ? `<option value="${esc(d.concept)}" selected>${esc(d.concept)}</option>` : ''}</select>
              <p class="field-note" id="of-type-note">${cat ? 'Tipo de gasto para la gestoría: ' + esc(cat.expense_type) : (d.expense_type ? 'Tipo de gasto para la gestoría: ' + esc(d.expense_type) : '')}</p></div>
            ${field('Base imponible', 'base_amount', fmtIn(d.base_amount), { mode: 'decimal', oninput: 'OttoOrder.check()' })}
            ${field('IVA %', 'vat_rate', d.vat_rate == null ? '' : String(d.vat_rate).replace('.', ','), { mode: 'decimal', oninput: 'OttoOrder.check()' })}
            ${field('IVA importe', 'vat_amount', fmtIn(d.vat_amount), { mode: 'decimal', oninput: 'OttoOrder.check()' })}
            ${field('Total', 'total', fmtIn(d.total), { mode: 'decimal', oninput: 'OttoOrder.check()' })}
            <p class="field-note span-2 warn-note" id="of-sum-note" hidden>La base más el IVA no suma el total.</p>
            <div class="input-group span-2"><label for="of-notes">Observaciones</label><textarea id="of-notes" data-f="notes" rows="2">${esc(d.notes || '')}</textarea></div>
          </div>
          ${lines.length ? `<details class="doc-lines"><summary>Líneas del documento (${lines.length})</summary><ul>${lines.map(l => `<li><span>${esc(l.descripcion || '—')}</span><span>${l.cantidad != null ? esc(String(l.cantidad).replace('.', ',')) + ' ×' : ''}</span><span>${l.importe != null ? eur(l.importe) : ''}</span></li>`).join('')}</ul></details>` : ''}
          <div class="doc-actions">
            <button type="submit" class="btn btn-primary" id="docSave">${d.status === 'done' ? 'Guardar cambios' : 'Guardar y dar por revisado'}</button>
            <button type="button" class="btn btn-secondary" onclick="OttoOrder.reread('${esc(d.id)}')">Volver a leer con IA</button>
            <button type="button" class="btn btn-ghost btn-danger-text" onclick="OttoOrder.remove('${esc(d.id)}')">Eliminar</button>
          </div>
        </form>
      </div></div>`;
  }

  function readForm() {
    const v = {}; document.querySelectorAll('#docOverlay [data-f]').forEach(el => { v[el.dataset.f] = el.value; });
    return v;
  }
  function check() {
    const v = readForm(), b = parseIn(v.base_amount), i = parseIn(v.vat_amount), t = parseIn(v.total);
    const note = document.getElementById('of-sum-note'); if (!note) return;
    note.hidden = !(b != null && i != null && t != null && Math.abs(b + i - t) > 0.05);
  }
  function catChange(sel) {
    const c = catOf(sel.value), n = document.getElementById('of-type-note');
    if (n) n.textContent = c ? 'Tipo de gasto para la gestoría: ' + c.expense_type : '';
  }

  async function save(id) {
    const d = O.docs.find(x => x.id === id); if (!d) return;
    const v = readForm(), c = catOf(v.concept);
    const patch = {
      doc_type: v.doc_type || null, doc_date: v.doc_date || null, supplier: v.supplier.trim() || null,
      supplier_tax_id: v.supplier_tax_id.toUpperCase().replace(/[\s.-]/g, '') || null, doc_number: v.doc_number.trim() || null,
      description: v.description.trim() || null, concept: v.concept || null, expense_type: c ? c.expense_type : (v.concept && v.concept === d.concept ? d.expense_type : null),
      base_amount: parseIn(v.base_amount), vat_rate: parseIn(v.vat_rate), vat_amount: parseIn(v.vat_amount), total: parseIn(v.total), notes: v.notes.trim() || null,
    };
    patch.flags = flagsOf({ ...patch, duplicate_of: d.duplicate_of });
    patch.status = 'done'; patch.reviewed_at = new Date().toISOString(); patch.extract_error = null;
    const btn = document.getElementById('docSave'); if (btn) { btn.disabled = true; btn.textContent = 'Guardando…'; }
    const r = await sb.from('order_docs').update(patch).eq('id', id);
    if (r && r.error) { showToast('Error: ' + r.error.message, 'error'); if (btn) { btn.disabled = false; btn.textContent = 'Guardar'; } return; }
    Object.assign(d, patch);
    showToast('Documento guardado', 'success'); close(); renderAll();
  }

  async function reread(id) {
    if (!confirm('Otto volverá a leer el documento y se perderán los cambios que hayas hecho a mano. ¿Continuar?')) return;
    close(); await extract(id);
  }

  async function remove(id) {
    const d = O.docs.find(x => x.id === id); if (!d) return;
    if (!confirm(`¿Eliminar «${d.supplier || d.file_name}»? También se borra el archivo.`)) return;
    const r = await sb.from('order_docs').delete().eq('id', id);
    if (r && r.error) { showToast('Error: ' + r.error.message, 'error'); return; }
    try { await sb.storage.from('ordena').remove([d.file_path]); } catch { /* el archivo queda huérfano; no es grave */ }
    O.docs = O.docs.filter(x => x.id !== id); close(); renderAll(); showToast('Documento eliminado', 'success');
  }

  /* ── Ajustes: maestro de categorías ── */
  function renderSettings() {
    const box = document.getElementById('orderCatsList'); if (!box) return;
    box.innerHTML = O.cats.length ? `<ul class="rows">${O.cats.map((c, i) => `
      <li class="row"><div class="row-main"><div class="row-title">${esc(c.concept)} <span class="cat-type">${esc(c.expense_type)}</span></div>
        <div class="row-meta">${c.examples ? esc(c.examples) : 'Sin ejemplos'}</div></div>
        <div class="row-side">${rowMenu('ocm' + i, [{ label: 'Editar', onclick: `OttoOrder.editCat('${esc(c.id)}')` }, { label: 'Eliminar', danger: true, onclick: `OttoOrder.delCat('${esc(c.id)}')` }])}</div></li>`).join('')}</ul>`
      : `<div class="wp-instructions">Todavía no hay categorías.</div>`;
    const e = O.cats.find(c => c.id === O.editCat);
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('catConcept', e ? e.concept : ''); set('catType', e ? e.expense_type : ''); set('catExamples', e ? e.examples : '');
    const t = document.getElementById('catFormTitle'); if (t) t.textContent = e ? 'Editar categoría' : 'Añadir una categoría';
    const b = document.getElementById('catSaveBtn'); if (b) b.textContent = e ? 'Guardar cambios' : 'Añadir categoría';
    const x = document.getElementById('catCancelBtn'); if (x) x.hidden = !e;
  }
  async function saveCat() {
    const concept = document.getElementById('catConcept').value.trim(), type = document.getElementById('catType').value.trim(), ex = document.getElementById('catExamples').value.trim();
    if (!concept || !type) { showWPStatus('catStatus', 'Escribe el concepto y el tipo de gasto', 'error'); return; }
    if (O.cats.some(c => stripTxt(c.concept) === stripTxt(concept) && c.id !== O.editCat)) { showWPStatus('catStatus', 'Ya existe una categoría con ese concepto', 'error'); return; }
    if (O.editCat) {
      const r = await sb.from('order_categories').update({ concept, expense_type: type, examples: ex }).eq('id', O.editCat);
      if (r && r.error) { showWPStatus('catStatus', r.error.message, 'error'); return; }
      Object.assign(O.cats.find(c => c.id === O.editCat), { concept, expense_type: type, examples: ex });
      showWPStatus('catStatus', 'Categoría guardada', 'success'); O.editCat = null;
    } else {
      const pos = O.cats.reduce((m, c) => Math.max(m, c.position || 0), -1) + 1;
      const r = await sb.from('order_categories').insert({ workspace_id: ws.id, concept, expense_type: type, examples: ex, position: pos }).select().single();
      if (r && r.error) { showWPStatus('catStatus', r.error.message, 'error'); return; }
      O.cats.push((r && r.data) || { id: 'tmp' + Date.now(), concept, expense_type: type, examples: ex, position: pos });
      showWPStatus('catStatus', 'Categoría añadida', 'success');
    }
    renderSettings();
  }
  function editCat(id) { O.editCat = id; renderSettings(); const f = document.getElementById('catConcept'); if (f) f.scrollIntoView({ block: 'center' }); }
  function cancelCat() { O.editCat = null; renderSettings(); }
  async function delCat(id) {
    const c = O.cats.find(x => x.id === id); if (!c) return;
    if (!confirm(`¿Eliminar la categoría «${c.concept}»? Los documentos ya guardados conservan su categoría.`)) return;
    const r = await sb.from('order_categories').delete().eq('id', id);
    if (r && r.error) { showToast('Error: ' + r.error.message, 'error'); return; }
    O.cats = O.cats.filter(x => x.id !== id); if (O.editCat === id) O.editCat = null; renderSettings();
  }

  /* ── Inicio ── */
  const when = iso => {
    const d = new Date(iso); if (isNaN(d)) return '';
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 2) return 'Ahora mismo'; if (mins < 60) return `Hace ${mins} min`;
    const h = Math.floor(mins / 60); if (h < 24) return `Hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
    const days = Math.floor(h / 24); return days === 1 ? 'Ayer' : days < 31 ? `Hace ${days} días` : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };

  OttoHome.register({
    id: 'order', name: 'Ordena',
    tasks() {
      if (!O.loaded || O.catsError) return [];
      if (!O.docs.length) return [{ tone: 'muted', title: 'Sube tu primera factura o ticket', meta: 'Otto lee los datos y los ordena por ti', when: '', label: 'Subir', run() { showPage('order'); } }];
      return O.docs.filter(d => d.status === 'review' || d.status === 'error').slice(0, 4).map(d => ({
        tone: d.status === 'error' ? 'danger' : 'warn',
        title: `${d.supplier || d.file_name}${d.status === 'error' ? ': no se pudo leer' : ' por revisar'}`,
        meta: (d.status === 'error' ? (d.extract_error || '') : [d.total != null ? eur(d.total) : null, (d.flags || []).map(f => FLAG_TXT[f]).filter(Boolean)[0]].filter(Boolean).join(' · ')),
        when: when(d.created_at), label: 'Revisar', run() { showPage('order'); OttoOrder.open(d.id); },
      }));
    },
    figures() {
      if (!O.loaded || O.catsError) return [];
      const cm = curMonth(), F = figuresFor(O.docs.filter(d => monthOf(d) === cm));
      return [
        { label: 'Documentos del mes', value: String(F.count) },
        { label: 'Por revisar', value: String(O.docs.filter(d => d.status === 'review' || d.status === 'error').length) },
        { label: 'Gastos del mes', value: eur(F.spend) },
        { label: 'IVA soportado del mes', value: eur(F.vat) },
      ];
    },
  });
  function renderAll() {
    renderPage(); renderSettings();
    if (document.getElementById('page-home').classList.contains('active')) OttoHome.render();
  }

  window.OttoOrder = {
    load, open, close, save, reread, remove, check, catChange, saveCat, editCat, cancelCat, delCat,
    restoreCats() { return seedCats(true); },
    pick(input) { const f = [...input.files]; input.value = ''; handleFiles(f); },
    filter(f) { O.filter = f; renderPage(); },
    month(m) { O.month = m; renderPage(); },
    reset() { O.docs = []; O.cats = []; O.loaded = false; O.month = null; O.filter = 'all'; O.openId = null; O.editCat = null; close(); renderAll(); },
  };

  // Arrastrar archivos sobre la pantalla
  const pageEl = () => document.getElementById('page-order');
  document.addEventListener('dragover', e => { const p = pageEl(); if (p && p.classList.contains('active') && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); p.classList.add('drop-active'); } });
  document.addEventListener('dragleave', e => { if (!e.relatedTarget) { const p = pageEl(); if (p) p.classList.remove('drop-active'); } });
  document.addEventListener('drop', e => { const p = pageEl(); if (p && p.classList.contains('active')) { p.classList.remove('drop-active'); if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); handleFiles(e.dataTransfer.files); } } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && O.openId) close(); });

  // Al cambiar de perfil se vuelven a leer sus documentos
  const baseSelect = selectWorkspace;
  selectWorkspace = async function (id) { OttoOrder.reset(); await baseSelect(id); await load(); };
  const baseShow = showPage;
  showPage = function (id) { baseShow.apply(this, arguments); if (id === 'order') renderPage(); if (id === 'settings') renderSettings(); };
  renderHead();
  if (typeof ws !== 'undefined' && ws) load();
})();
