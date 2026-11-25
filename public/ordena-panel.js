/* ──────────────────────────────────────────────────────────────
   Otto ordena · libro de la gestoría guardado, importación y panel anual
   Se apoya en ordena.js (OttoOrderCore) y ordena-libro.js (OttoLibro).
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  const C = () => window.OttoOrderCore;
  const L = () => window.OttoLibro;
  const P = { book: null, loaded: false };
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const status = (id, msg, type) => showWPStatus(id, msg, type);
  const kb = n => n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
  const ago = iso => {
    const d = new Date(iso); if (isNaN(d)) return '';
    const days = Math.floor((Date.now() - d.getTime()) / 86400000);
    return days < 1 ? 'hoy' : days === 1 ? 'ayer' : days < 31 ? `hace ${days} días` : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  /* ── Libro guardado ── */
  async function loadBook() {
    P.book = null; P.loaded = false;
    if (typeof ws === 'undefined' || !ws || !sb) return;
    const r = await sb.from('order_book').select('*').eq('workspace_id', ws.id);
    P.book = r && !r.error && r.data && r.data[0] ? r.data[0] : null;
    P.loaded = true; renderBookBox();
  }
  const hasBook = () => !!P.book;
  async function downloadBook() {
    if (!P.book) throw new Error('No hay un libro guardado.');
    const r = await sb.storage.from('ordena').download(P.book.file_path);
    if (!r || r.error || !r.data) throw new Error('No se pudo abrir el libro guardado. Súbelo de nuevo en Ajustes.');
    return { blob: r.data, name: P.book.file_name };
  }
  async function saveBook(blob, name) {
    const path = `${ws.id}/libro/${Date.now()}.xlsx`;
    const up = await sb.storage.from('ordena').upload(path, blob, { contentType: XLSX_MIME, upsert: false });
    if (up && up.error) throw new Error(up.error.message);
    const old = P.book && P.book.file_path;
    const row = { workspace_id: ws.id, file_path: path, file_name: name, file_size: blob.size, updated_at: new Date().toISOString() };
    const r = await sb.from('order_book').upsert(row, { onConflict: 'workspace_id' });
    if (r && r.error) { try { await sb.storage.from('ordena').remove([path]); } catch { /* nada */ } throw new Error(r.error.message); }
    if (old) { try { await sb.storage.from('ordena').remove([old]); } catch { /* no pasa nada */ } }
    P.book = row; renderBookBox();
  }
  function renderBookBox() {
    const box = document.getElementById('orderBookBox'); if (!box) return;
    if (!P.book) {
      box.innerHTML = `<p class="muted-note">Todavía no has subido el libro. Cuando lo subas, «Rellenar Excel de la gestoría» ya no te lo pedirá.</p>
        <div class="form-actions"><button class="btn btn-primary" onclick="document.getElementById('bookFile').click()">Subir libro</button></div>`;
      return;
    }
    box.innerHTML = `<ul class="rows"><li class="row"><div class="row-main"><div class="row-title">${esc(P.book.file_name)}</div>
      <div class="row-meta">${kb(P.book.file_size || 0)} · actualizado ${esc(ago(P.book.updated_at))}</div></div></li></ul>
      <div class="form-actions" style="margin-top:var(--sp-3)">
        <button class="btn btn-secondary" onclick="OttoPanel.getBook()">Descargar</button>
        <button class="btn btn-secondary" onclick="document.getElementById('bookFile').click()">Sustituir por otro libro</button>
        <button class="btn btn-ghost btn-danger-text" onclick="OttoPanel.removeBook()">Quitar</button></div>`;
  }
  async function pickBook(input) {
    const f = input.files[0]; input.value = ''; if (!f) return;
    if (!/\.xlsx$/i.test(f.name)) { status('bookStatus', 'El libro debe ser un archivo .xlsx', 'error'); return; }
    if (f.size > 10 * 1048576) { status('bookStatus', 'El libro pesa más de 10 MB', 'error'); return; }
    status('bookStatus', 'Guardando el libro…', 'success');
    try { await saveBook(f, f.name); status('bookStatus', 'Libro guardado', 'success'); } catch (e) { status('bookStatus', e.message, 'error'); }
  }
  async function getBook() { try { const b = await downloadBook(); C().saveBlob(b.blob, b.name); } catch (e) { status('bookStatus', e.message, 'error'); } }
  async function removeBook() {
    if (!P.book || !confirm('¿Quitar el libro guardado? Tus documentos no se borran.')) return;
    const r = await sb.from('order_book').delete().eq('workspace_id', ws.id);
    if (r && r.error) { status('bookStatus', r.error.message, 'error'); return; }
    try { await sb.storage.from('ordena').remove([P.book.file_path]); } catch { /* nada */ }
    P.book = null; renderBookBox(); status('bookStatus', 'Libro quitado', 'success');
  }

  /* ── Importar los datos del libro ── */
  const iso = v => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') { const d = new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000); return d.toISOString().slice(0, 10); }
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v).trim());
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return /^\d{4}-\d{2}-\d{2}/.test(String(v)) ? String(v).slice(0, 10) : null;
  };
  const money = v => typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 100) / 100 : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(',', '.'))) ? Math.round(Number(v.replace(',', '.')) * 100) / 100 : null);
  const txt = v => v === null || v === undefined ? '' : String(v).trim();

  function conceptFor(tipo) {
    const cats = C().O.cats, n = norm(tipo); if (!n) return null;
    const exact = cats.find(c => norm(c.concept) === n); if (exact) return exact.concept;
    const viaType = cats.find(c => (L().pickTypeIn({ concept: c.concept }) || L().pickTypeIn({ expense_type: c.expense_type })) === L().pickTypeIn({ expense_type: tipo }));
    return viaType ? viaType.concept : tipo;
  }

  function parseBook(XLSX, buf) {
    const wb = XLSX.read(buf, { type: 'array' });
    const out = [], skipped = { sinDatos: 0 };
    for (const [dir, prefix] of [['venta', 'Ingresos '], ['compra', 'Gastos ']]) for (let q = 1; q <= 4; q++) {
      const name = prefix + q + 'T', sh = wb.Sheets[name]; if (!sh) continue;
      const rows = XLSX.utils.sheet_to_json(sh, { header: 1, raw: true, defval: null, blankrows: true, range: 0 });
      for (let r = 7; r < rows.length; r++) {
        const x = rows[r] || [], g = i => x[i];
        const date = iso(g(10)); if (!date) { if (g(13) || g(15) || g(16)) skipped.sinDatos++; continue; }
        const sale = dir === 'venta';
        const base = money(sale ? g(16) : g(15)), total = money(sale ? g(21) : g(22));
        if (base === null && total === null) { skipped.sinDatos++; continue; }
        const rate = money(sale ? g(17) : g(16)), vat = money(g(18));
        const tipo = txt(g(14));
        out.push({
          direction: dir, status: 'done', source: 'libro', doc_type: 'factura', currency: 'EUR',
          file_path: null, file_name: `Importado del libro · ${name}`, mime: null, file_size: null,
          supplier: txt(g(13)) || null, supplier_tax_id: txt(g(12)).toUpperCase().replace(/[\s.-]/g, '') || null, doc_number: txt(g(11)) || null,
          doc_date: date, description: sale ? (txt(g(15)) || null) : null,
          base_amount: base, vat_rate: rate === null ? null : Math.round(rate * 10000) / 100, vat_amount: vat, total,
          concept: sale ? (tipo || null) : conceptFor(tipo), expense_type: sale ? null : (L().pickTypeIn({ expense_type: tipo }) || tipo || null),
          notes: txt(g(sale ? 22 : 23)) || null, lines: [], flags: [],
        });
      }
    }
    return { docs: out, skipped };
  }

  const cmp = v => norm(v).replace(/ /g, '');
  const keyOf = d => [d.doc_date, cmp(d.doc_number), cmp(d.supplier_tax_id || d.supplier), d.base_amount == null ? '' : Math.round(Number(d.base_amount) * 100)].join('|');

  let importing = false;
  async function importBook() {
    if (importing) return;
    if (P.book) { try { const b = await downloadBook(); return doImport(await b.blob.arrayBuffer()); } catch (e) { status('importStatus', e.message, 'error'); return; } }
    document.getElementById('bookImportFile').click();
  }
  async function pickImport(input) {
    const f = input.files[0]; input.value = ''; if (!f) return;
    doImport(await f.arrayBuffer());
  }
  async function doImport(buf) {
    importing = true; const btn = document.getElementById('bookImportBtn'); if (btn) btn.disabled = true;
    status('importStatus', 'Leyendo el libro…', 'success');
    try {
      const XLSX = await C().loadLib('xlsx', 'XLSX');
      const { docs, skipped } = parseBook(XLSX, buf);
      if (!docs.length) { status('importStatus', 'No he encontrado filas con datos en las pestañas de ingresos y gastos.', 'error'); return; }
      const have = new Set(C().O.docs.map(keyOf)), fresh = [], dup = { n: 0 };
      docs.forEach(d => { const k = keyOf(d); if (have.has(k)) dup.n++; else { have.add(k); d.workspace_id = ws.id; d.reviewed_at = new Date().toISOString(); fresh.push(d); } });
      if (!fresh.length) { status('importStatus', `No hay nada nuevo: las ${docs.length} filas ya están en Otto.`, 'success'); return; }
      for (let i = 0; i < fresh.length; i += 100) {
        status('importStatus', `Guardando ${Math.min(i + 100, fresh.length)} de ${fresh.length}…`, 'success');
        const r = await sb.from('order_docs').insert(fresh.slice(i, i + 100));
        if (r && r.error) throw new Error(r.error.message + (/file_path|source/.test(r.error.message) ? ' · Ejecuta supabase/ordena-libro.sql en Supabase.' : ''));
      }
      await C().load();
      const v = fresh.filter(d => d.direction === 'venta').length;
      status('importStatus', `Importadas ${fresh.length} filas (${fresh.length - v} gastos y ${v} ingresos).${dup.n ? ` ${dup.n} ya estaban.` : ''}${skipped.sinDatos ? ` ${skipped.sinDatos} filas sin fecha o sin importe se han saltado.` : ''}`, 'success');
    } catch (e) { status('importStatus', e.message || 'No se pudo importar', 'error'); }
    finally { importing = false; if (btn) btn.disabled = false; }
  }

  /* ── Ajustar los tipos de gasto de las categorías a los del libro ── */
  async function alignTypes() {
    const O = C().O; let cats = 0, docs = 0; const left = [];
    status('alignStatus', 'Ajustando…', 'success');
    try {
      for (const c of O.cats) {
        const nt = L().pickTypeIn({ concept: c.concept }) || L().pickTypeIn({ expense_type: c.expense_type });
        if (!nt) { left.push(c.concept); continue; }
        if (nt !== c.expense_type) {
          const r = await sb.from('order_categories').update({ expense_type: nt }).eq('id', c.id);
          if (r && r.error) throw new Error(r.error.message);
          c.expense_type = nt; cats++;
        }
        const todo = O.docs.filter(d => d.concept === c.concept && d.expense_type !== nt);
        if (todo.length) {
          const r = await sb.from('order_docs').update({ expense_type: nt }).eq('workspace_id', ws.id).eq('concept', c.concept);
          if (r && r.error) throw new Error(r.error.message);
          todo.forEach(d => { d.expense_type = nt; }); docs += todo.length;
        }
      }
      C().renderAll();
      status('alignStatus', (cats || docs ? `Hecho: ${cats} categorías y ${docs} documentos ajustados.` : 'Ya estaba todo ajustado.') + (left.length ? ` Sin equivalente en el libro: ${left.join(', ')}.` : ''), 'success');
    } catch (e) { status('alignStatus', e.message, 'error'); }
  }

  /* ── Panel anual ── */
  const q0 = d => Math.ceil(Number(d.doc_date.slice(5, 7)) / 3) - 1;
  const baseOfDoc = d => d.base_amount != null ? Number(d.base_amount) : d.vat_amount != null && d.total != null ? Number(d.total) - Number(d.vat_amount) : Number(d.total) || 0;
  const vatOfDoc = d => d.vat_amount != null ? Number(d.vat_amount) : (d.base_amount != null && d.total != null ? Math.max(0, Number(d.total) - Number(d.base_amount)) : 0);
  const sum4 = a => a.reduce((x, y) => x + y, 0);
  const zero4 = () => [0, 0, 0, 0];
  const r2 = n => Math.round(n * 100) / 100;

  function calc(year) {
    const O = C().O;
    const docs = O.docs.filter(d => d.doc_date && d.doc_date.slice(0, 4) === String(year) && d.status !== 'error');
    const ing = new Map(), gas = new Map(), repV = zero4(), sopV = zero4();
    let pending = 0;
    docs.forEach(d => {
      if (d.status !== 'done') pending++;
      const q = q0(d), b = baseOfDoc(d), v = vatOfDoc(d);
      if (d.direction === 'venta') {
        const k = norm(d.concept) === 'venta de productos' ? 'Venta de productos' : norm(d.concept) === 'prestacion de servicios' || !d.concept ? 'Prestación de servicios' : d.concept;
        if (!ing.has(k)) ing.set(k, zero4()); ing.get(k)[q] += b; repV[q] += v;
      } else {
        const k = L().pickTypeIn(d) || d.expense_type || 'Sin tipo de gasto';
        if (!gas.has(k)) gas.set(k, zero4()); gas.get(k)[q] += b; sopV[q] += v;
      }
    });
    const ingTot = zero4(); ing.forEach(a => a.forEach((x, i) => { ingTot[i] += x; }));
    const gasTot = zero4(); gas.forEach(a => a.forEach((x, i) => { gasTot[i] += x; }));
    return { docs, ing, gas, ingTot, gasTot, repV, sopV, pending };
  }

  const money0 = n => Math.abs(n) < 0.005 ? '<span class="nil">—</span>' : eurFmt(n);
  const eurFmt = n => Number(n).toLocaleString('es-ES', { style: 'currency', currency: 'EUR', useGrouping: 'always' });
  const pct = n => Number.isFinite(n) ? (n * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' %' : '—';

  function table(title, rows, opts = {}) {
    const head = ['T1', 'T2', 'T3', 'T4', 'Total'].concat(opts.pct ? ['% s/ ventas'] : []);
    return `<section class="panel-block"><h3>${esc(title)}</h3><div class="tbl-wrap"><table class="sum-table panel-table"><thead><tr><th></th>${head.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>
      ${rows.map(r => `<tr class="${r.cls || ''}"><th scope="row">${esc(r.label)}</th>${r.vals.map(v => `<td>${money0(v)}</td>`).join('')}<td>${money0(sum4(r.vals))}</td>${opts.pct ? `<td>${r.noPct ? '' : pct(sum4(r.vals) / (opts.pct || 1))}</td>` : ''}</tr>`).join('')}
      </tbody></table></div></section>`;
  }
  function chart(S) {
    const max = Math.max(1, ...S.ingTot, ...S.gasTot);
    return `<section class="panel-block"><h3>Ingresos y gastos por trimestre <span class="muted-note">(sin IVA)</span></h3>
      <div class="qchart" role="img" aria-label="Ingresos y gastos por trimestre">${[0, 1, 2, 3].map(i => `<div class="qcol"><div class="qbars"><span class="qbar qin" style="height:${Math.round(S.ingTot[i] / max * 100)}%" title="Ingresos ${eurFmt(S.ingTot[i])}"></span><span class="qbar qout" style="height:${Math.round(S.gasTot[i] / max * 100)}%" title="Gastos ${eurFmt(S.gasTot[i])}"></span></div><div class="qlab">T${i + 1}</div></div>`).join('')}</div>
      <p class="qkey"><span class="qin"></span>Ingresos <span class="qout"></span>Gastos</p></section>`;
  }

  function html() {
    const { O } = C();
    const years = [...new Set(O.docs.map(d => d.doc_date && d.doc_date.slice(0, 4)).filter(Boolean))].sort().reverse();
    if (!O.year || !years.includes(String(O.year))) O.year = Number(years[0]) || new Date().getFullYear();
    if (!years.includes(String(O.year))) years.unshift(String(O.year));
    const S = calc(O.year);
    const sel = `<div class="order-bar"><p class="muted-note panel-note">Con los documentos que hay en Otto, revisados o no. Es orientativo: no incluye amortizaciones ni IRPF.</p>
      <label class="order-month"><span class="sr-only">Año</span><select onchange="OttoOrder.year(this.value)">${years.map(y => `<option value="${y}" ${String(O.year) === y ? 'selected' : ''}>${y}</option>`).join('')}</select></label></div>`;
    if (!S.docs.length) return sel + `<div class="rows-empty"><p>No hay documentos de ${O.year}. Sube facturas o importa los datos del libro de la gestoría desde Configuración → Ordena.</p></div>`;
    const ingT = sum4(S.ingTot), gasT = sum4(S.gasTot), ivaRep = sum4(S.repV), ivaSop = sum4(S.sopV);
    // Ingresos
    const ingRows = [...S.ing.entries()].map(([k, v]) => ({ label: k, vals: v.map(r2) }));
    ingRows.push({ label: 'Total ventas e ingresos', vals: S.ingTot.map(r2), cls: 'tot' });
    // Gastos por grupo, como en la hoja Resumen del libro
    const rows = [], known = new Set();
    L().GROUPS.forEach(([g, types]) => {
      const mine = types.filter(t => S.gas.has(t)); if (!mine.length) return;
      const sub = zero4(); mine.forEach(t => { known.add(t); S.gas.get(t).forEach((x, i) => { sub[i] += x; }); });
      rows.push({ label: g, vals: sub.map(r2), cls: 'grp' });
      mine.forEach(t => rows.push({ label: t, vals: S.gas.get(t).map(r2), cls: 'sub' }));
    });
    const other = [...S.gas.keys()].filter(k => !known.has(k));
    if (other.length) { const sub = zero4(); other.forEach(t => S.gas.get(t).forEach((x, i) => { sub[i] += x; })); rows.push({ label: 'Sin clasificar', vals: sub.map(r2), cls: 'grp' }); other.forEach(t => rows.push({ label: t, vals: S.gas.get(t).map(r2), cls: 'sub' })); }
    rows.push({ label: 'Total gastos', vals: S.gasTot.map(r2), cls: 'tot' });
    // IVA y resultado
    const diff = S.repV.map((v, i) => r2(v - S.sopV[i]));
    const ivaRows = [{ label: 'IVA repercutido (ventas)', vals: S.repV.map(r2) }, { label: 'IVA soportado (compras)', vals: S.sopV.map(r2) }, { label: ivaRep >= ivaSop ? 'IVA a pagar' : 'IVA a compensar', vals: diff, cls: 'tot', noPct: true }];
    const res = S.ingTot.map((v, i) => r2(v - S.gasTot[i]));
    const resRows = [{ label: 'Ingresos', vals: S.ingTot.map(r2) }, { label: 'Gastos', vals: S.gasTot.map(r2) }, { label: 'Beneficio antes de IRPF', vals: res, cls: 'tot' }];
    return sel + `
      ${S.pending ? `<div class="callout">${S.pending} ${S.pending === 1 ? 'documento sin revisar cuenta' : 'documentos sin revisar cuentan'} en estas cifras.</div>` : ''}
      <dl class="figs figs-row">
        <div><dt>Ingresos</dt><dd>${eurFmt(ingT)}</dd></div>
        <div><dt>Gastos</dt><dd>${eurFmt(gasT)}</dd></div>
        <div><dt>Beneficio antes de IRPF</dt><dd>${eurFmt(ingT - gasT)}</dd></div>
        <div><dt>${ivaRep >= ivaSop ? 'IVA a pagar' : 'IVA a compensar'}</dt><dd>${eurFmt(Math.abs(ivaRep - ivaSop))}</dd></div>
      </dl>
      ${chart(S)}
      ${table('Ventas e ingresos', ingRows)}
      ${table('Gastos (sin IVA)', rows, { pct: ingT })}
      ${table('IVA', ivaRows)}
      ${table('Resultado', resRows)}`;
  }

  window.OttoPanel = { html, hasBook, downloadBook, saveBook, pickBook, getBook, removeBook, importBook, pickImport, alignTypes, loadBook };

  // Al cambiar de perfil o abrir pantallas
  const baseSelect = selectWorkspace;
  selectWorkspace = async function (id) { P.book = null; await baseSelect(id); await loadBook(); };
  const baseShow = showPage;
  showPage = function (id) { baseShow.apply(this, arguments); if (id === 'settings') renderBookBox(); };
  if (typeof ws !== 'undefined' && ws) loadBook();
})();
