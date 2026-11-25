/* ──────────────────────────────────────────────────────────────
   Otto ordena · Rellenar el "Libro de Ingresos y Gastos" de la gestoría
   Abre el Excel de la gestoría (xlsx), añade una fila por documento en
   las pestañas «Ingresos 1T…4T» y «Gastos 1T…4T» y lo devuelve.
   No toca nada más: fórmulas, formatos, gráficos y resto de hojas siguen igual.
   Trabaja directamente sobre el XML del xlsx (con JSZip) para no perder nada.
   ────────────────────────────────────────────────────────────── */
(function () {
  'use strict';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const RNS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';

  const colIdx = c => c.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
  const splitRef = r => { const m = /^([A-Z]+)(\d+)$/.exec(r); return { col: m[1], row: +m[2] }; };
  const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const round2 = n => Math.round(n * 100) / 100;
  const serial = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(1899, 11, 30)) / 86400000) : null; };
  const num = v => v === null || v === undefined || v === '' ? null : Number(v);

  // Equivalencias entre las categorías de Otto y los «Tipo de gasto» del libro de la gestoría
  const ALIAS = {
    'gestoria': 'Gestoría', 'mantenimiento web': 'Web', 'mentorias': 'Formación', 'formacion': 'Formación',
    'laboratorios fotograficos': 'Impresión fotográfica', 'impresion fotografica': 'Impresión fotográfica',
    'material para sesiones': 'Material para sesiones', 'material de trabajo': 'Equipo de trabajo', 'equipo de trabajo': 'Equipo de trabajo',
    'web': 'Web', 'publicidad y mk': 'Publicidad y Marketing', 'publicidad y marketing': 'Publicidad y Marketing', 'trustlocal': 'Publicidad y Marketing',
    'telefono': 'Suministros', 'gasolina': 'Suministros', 'suministro': 'Suministros', 'suministros': 'Suministros',
    'restaurante y hoteles': 'Restaurantes y hoteles', 'restaurantes y hoteles': 'Restaurantes y hoteles',
    'cuotas de autonomo': 'Cuota autónomo', 'cuota autonomo': 'Cuota autónomo',
    'software': 'Software', 'informatica': 'Informática', 'comisiones': 'Comisiones', 'asociaciones': 'Asociaciones', 'comunidad': 'Comunidad', 'otros': 'Otros',
  };
  const SALE_PRODUCT = /album|marco|cuadro|lienzo|impresi|copias|ampliaci|libro|producto|tarjeta regalo/;

  function xmlToDoc(txt) {
    const d = new DOMParser().parseFromString(txt, 'application/xml');
    if (d.getElementsByTagName('parsererror').length) throw new Error('El archivo Excel no se pudo leer.');
    return d;
  }
  const docToXml = d => '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + new XMLSerializer().serializeToString(d.documentElement);
  const kids = (el, name) => [...el.childNodes].filter(n => n.nodeType === 1 && n.localName === name);
  const kid = (el, name) => kids(el, name)[0] || null;

  function sharedStrings(txt) {
    if (!txt) return [];
    return kids(xmlToDoc(txt).documentElement, 'si').map(si => [...si.getElementsByTagNameNS(NS, 't')].map(t => t.textContent).join(''));
  }

  class Sheet {
    constructor(name, path, xml, sst) {
      this.name = name; this.path = path; this.sst = sst;
      this.doc = xmlToDoc(xml); this.root = this.doc.documentElement;
      this.data = kid(this.root, 'sheetData');
      this.rows = new Map(); kids(this.data, 'row').forEach(r => this.rows.set(+r.getAttribute('r'), r));
      this.styleOf = {};   // estilo de cada columna, copiado de la primera fila de datos
      const r8 = this.rows.get(8); if (r8) kids(r8, 'c').forEach(c => { this.styleOf[splitRef(c.getAttribute('r')).col] = c.getAttribute('s'); });
    }
    cell(ref, create) {
      const { col, row } = splitRef(ref);
      let r = this.rows.get(row);
      if (!r) { if (!create) return null; r = this.makeRow(row); }
      const cells = kids(r, 'c'); let before = null;
      for (const c of cells) { const ci = colIdx(splitRef(c.getAttribute('r')).col); if (ci === colIdx(col)) return c; if (ci > colIdx(col) && !before) before = c; }
      if (!create) return null;
      const c = this.doc.createElementNS(NS, 'c'); c.setAttribute('r', ref);
      const s = this.styleOf[col]; if (s) c.setAttribute('s', s);
      r.insertBefore(c, before); return c;
    }
    makeRow(n) {
      const r = this.doc.createElementNS(NS, 'row'); r.setAttribute('r', String(n));
      let before = null; for (const [k, v] of this.rows) if (k > n && (!before || k < +before.getAttribute('r'))) before = v;
      this.data.insertBefore(r, before); this.rows.set(n, r); return r;
    }
    clear(c) { while (c.firstChild) c.removeChild(c.firstChild); c.removeAttribute('t'); }
    text(ref, v) {
      if (v === null || v === undefined || v === '') return;
      const c = this.cell(ref, true); this.clear(c); c.setAttribute('t', 'inlineStr');
      const is = this.doc.createElementNS(NS, 'is'), t = this.doc.createElementNS(NS, 't');
      t.setAttribute('xml:space', 'preserve'); t.textContent = String(v); is.appendChild(t); c.appendChild(is);
    }
    number(ref, v) {
      if (v === null || v === undefined || !Number.isFinite(v)) return;
      const c = this.cell(ref, true); this.clear(c);
      const e = this.doc.createElementNS(NS, 'v'); e.textContent = String(v); c.appendChild(e);
    }
    // Pone la fórmula solo si la celda no tiene ya una (las filas preparadas por la gestoría ya la traen)
    formula(ref, f, cached, isText) {
      const c = this.cell(ref, true);
      const fe = kid(c, 'f');
      if (!fe) {
        this.clear(c);
        const fx = this.doc.createElementNS(NS, 'f'); fx.textContent = f; c.appendChild(fx);
        if (isText) c.setAttribute('t', 'str');
      } else if (isText) c.setAttribute('t', 'str'); else c.removeAttribute('t');
      [...c.childNodes].filter(n => n.localName === 'v').forEach(n => c.removeChild(n));
      if (cached !== undefined && cached !== null) { const v = this.doc.createElementNS(NS, 'v'); v.textContent = String(cached); c.appendChild(v); }
    }
    value(ref) {
      const c = this.cell(ref, false); if (!c) return '';
      const t = c.getAttribute('t'), v = kid(c, 'v');
      if (t === 'inlineStr') return [...c.getElementsByTagNameNS(NS, 't')].map(x => x.textContent).join('');
      if (!v) return '';
      return t === 's' ? (this.sst[+v.textContent] ?? '') : t === 'str' || t === 'b' || t === 'e' ? v.textContent : Number(v.textContent);
    }
    hasValue(ref) { const c = this.cell(ref, false); if (!c) return false; return !!(kid(c, 'v') || kid(c, 'is')) && !kid(c, 'f'); }
    // Primera fila del cuerpo: la que usan las sumas del trimestre (algunas hojas empiezan en la 9)
    firstRow(totalCells) {
      for (const ref of totalCells) {
        const f = this.cell(ref, false) && kid(this.cell(ref, false), 'f'); if (!f) continue;
        const m = /SUM\([A-Z]+(\d+):/i.exec(f.textContent); if (m) return Math.max(8, +m[1]);
      }
      return 8;
    }
    maxRow() { return Math.max(...this.rows.keys()); }
    serialize() { return docToXml(this.doc); }
  }

  const baseOf = d => {
    const t = num(d.total), v = num(d.vat_amount), b = num(d.base_amount), r = num(d.vat_rate);
    if (b !== null) return round2(b);
    if (t !== null && v !== null) return round2(t - v);
    if (t !== null && r !== null) return round2(t / (1 + r / 100));
    return t !== null ? round2(t) : null;
  };
  const rateOf = d => {
    const r = num(d.vat_rate); if (r !== null) return r / 100;
    const b = num(d.base_amount), v = num(d.vat_amount);
    if (b && v !== null) return Math.round(v / b * 100) / 100;
    if (v === 0) return 0;
    return null;
  };

  async function fill(buffer, docs, JSZip) {
    const zip = await JSZip.loadAsync(buffer);
    const read = async p => { const f = zip.file(p); return f ? f.async('string') : null; };
    const wbXml = await read('xl/workbook.xml'); if (!wbXml) throw new Error('Este archivo no parece un libro de Excel.');
    const rels = xmlToDoc(await read('xl/_rels/workbook.xml.rels'));
    const target = {}; [...rels.getElementsByTagName('Relationship')].forEach(r => { target[r.getAttribute('Id')] = r.getAttribute('Target').replace(/^\/?(xl\/)?/, 'xl/'); });
    const wbDoc = xmlToDoc(wbXml);
    const sheetPath = {}; [...wbDoc.getElementsByTagNameNS(NS, 'sheet')].forEach(s => { sheetPath[s.getAttribute('name')] = target[s.getAttributeNS(RNS, 'id')]; });
    const need = ['Ingresos 1T', 'Ingresos 2T', 'Ingresos 3T', 'Ingresos 4T', 'Gastos 1T', 'Gastos 2T', 'Gastos 3T', 'Gastos 4T'];
    const missing = need.filter(n => !sheetPath[n]);
    if (missing.length) throw new Error('No encuentro estas pestañas en el Excel: ' + missing.join(', ') + '. Otto espera el libro de ingresos y gastos de la gestoría.');
    const sst = sharedStrings(await read('xl/sharedStrings.xml'));
    const sheets = {}; const getSheet = async n => sheets[n] || (sheets[n] = new Sheet(n, sheetPath[n], await read(sheetPath[n]), sst));

    // Año del libro y lista de tipos de gasto (hoja Resumen, C15:C31)
    const s1 = await getSheet('Ingresos 1T');
    const year = Number(s1.value('K3')) || null;
    const types = [];
    if (sheetPath['Resumen']) {
      const rs = new Sheet('Resumen', sheetPath['Resumen'], await read(sheetPath['Resumen']), sst);
      for (let r = 15; r <= 31; r++) { const v = String(rs.value('C' + r) || '').trim(); if (v) types.push(v); }
    }
    const typeByNorm = new Map(types.map(t => [norm(t), t]));
    const pickType = d => {
      for (const raw of [d.expense_type, d.concept]) {
        const n = norm(raw); if (!n) continue;
        if (typeByNorm.has(n)) return typeByNorm.get(n);
        const a = ALIAS[n]; if (a && typeByNorm.has(norm(a))) return typeByNorm.get(norm(a));
      }
      return null;
    };

    const rep = { added: {}, dup: 0, otherYear: 0, noDate: 0, toOtros: [], noRate: 0, started: {}, lines: [], full: [] };
    const sorted = [...docs].sort((a, b) => String(a.doc_date).localeCompare(String(b.doc_date)) || String(a.doc_number).localeCompare(String(b.doc_number)));
    const plan = { ing: { 1: [], 2: [], 3: [], 4: [] }, gas: { 1: [], 2: [], 3: [], 4: [] } };
    for (const d of sorted) {
      if (!d.doc_date) { rep.noDate++; continue; }
      const y = +d.doc_date.slice(0, 4), q = Math.ceil(+d.doc_date.slice(5, 7) / 3);
      if (year && y !== year) { rep.otherYear++; continue; }
      plan[d.direction === 'venta' ? 'ing' : 'gas'][q].push(d);
    }

    for (const dir of ['ing', 'gas']) for (let q = 1; q <= 4; q++) {
      const list = plan[dir][q]; if (!list.length) continue;
      const name = (dir === 'ing' ? 'Ingresos ' : 'Gastos ') + q + 'T';
      const sh = await getSheet(name);
      const totals = dir === 'ing' ? ['Q5', 'S5', 'V5'] : ['P4', 'S4', 'W4'];
      const first = sh.firstRow(totals);
      const inputCols = dir === 'ing' ? ['K', 'L', 'M', 'N', 'O', 'P', 'Q'] : ['K', 'L', 'M', 'N', 'O', 'P'];
      const keyOf = (date, num_, who, base) => [String(date), norm(num_), norm(who), base === null || base === '' ? '' : Math.round(Number(base) * 100)].join('|');
      // Lo que ya hay en la hoja
      const existing = new Set(); let last = first - 1;
      for (let r = first; r <= sh.maxRow(); r++) {
        if (!inputCols.some(c => sh.hasValue(c + r))) continue;
        last = r;
        const kv = sh.value('K' + r); let iso = '';
        if (typeof kv === 'number') { const dt = new Date(Date.UTC(1899, 11, 30) + kv * 86400000); iso = dt.toISOString().slice(0, 10); }
        else { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(kv).trim()); if (m) iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
        const baseCol = dir === 'ing' ? 'Q' : 'P';
        existing.add(keyOf(iso, sh.value('L' + r), sh.value('M' + r) || sh.value('N' + r), sh.value(baseCol + r)));
      }
      let row = Math.max(first, last + 1), n = 0;
      for (const d of list) {
        const base = baseOf(d), rate = rateOf(d);
        const who = d.supplier_tax_id || d.supplier;
        if (existing.has(keyOf(d.doc_date, d.doc_number, who, base))) { rep.dup++; continue; }
        const r = row++;
        sh.number('K' + r, serial(d.doc_date));
        sh.text('L' + r, d.doc_number); sh.text('M' + r, d.supplier_tax_id); sh.text('N' + r, d.supplier);
        const iva = rate === null ? 0 : rate, b = base === null ? 0 : base;
        const month = +d.doc_date.slice(5, 7), h = String(d.doc_number || '').charAt(0);
        const hv = h === 'E' ? 'E.L.' : h;
        const helpers = () => { sh.formula('G' + r, `+H${r}&"/"&I${r}`, `${hv}/${month}`, true); sh.formula('H' + r, `+IF(MID(L${r},1,1)="E","E.L.",MID(L${r},1,1))`, hv, true); sh.formula('I' + r, `+MONTH(K${r})`, month); };
        if (dir === 'ing') {
          sh.text('O' + r, SALE_PRODUCT.test(norm(d.description)) ? 'Venta de productos' : 'Prestación de servicios');
          sh.text('P' + r, d.description);
          sh.number('Q' + r, base);
          if (rate !== null) sh.number('R' + r, rate); else rep.noRate++;
          const s = base === null ? 0 : round2(b * iva), v = base === null ? 0 : round2(b + s);
          sh.formula('S' + r, `+Q${r}*R${r}`, s); sh.formula('U' + r, `+Q${r}*T${r}`, 0); sh.formula('V' + r, `+Q${r}+S${r}-U${r}`, v);
          sh.text('W' + r, d.notes);
        } else {
          let t = pickType(d); if (!t) { t = typeByNorm.get('otros') || 'Otros'; rep.toOtros.push(d.supplier || d.file_name || ''); }
          sh.text('O' + r, t);
          sh.number('P' + r, base);
          if (rate !== null) sh.number('Q' + r, rate); else rep.noRate++;
          sh.text('R' + r, 'Sí');
          const s = round2(b * iva);
          sh.formula('S' + r, `+P${r}*Q${r}`, s); sh.formula('T' + r, `++IF(R${r}="No",Q${r}*P${r},0)`, 0); sh.formula('V' + r, `+P${r}*U${r}`, 0); sh.formula('W' + r, `+P${r}+S${r}-V${r}`, round2(b + s));
          sh.text('X' + r, d.notes);
        }
        helpers();
        n++;
      }
      rep.added[name] = n; rep.started[name] = Math.max(first, last + 1);
      if (first > 8) rep.lines.push(`${name}: la suma del trimestre empieza en la fila ${first}, así que he empezado a rellenar desde ahí.`);
    }

    // Guardar solo lo que ha cambiado y pedir a Excel que recalcule los totales
    Object.values(sheets).forEach(sh => { if (rep.added[sh.name]) zip.file(sh.path, sh.serialize()); });
    const calc = wbDoc.getElementsByTagNameNS(NS, 'calcPr')[0];
    if (calc) calc.setAttribute('fullCalcOnLoad', '1');
    else { const c = wbDoc.createElementNS(NS, 'calcPr'); c.setAttribute('fullCalcOnLoad', '1'); wbDoc.documentElement.appendChild(c); }
    zip.file('xl/workbook.xml', docToXml(wbDoc));
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    rep.total = Object.values(rep.added).reduce((a, b) => a + b, 0);
    rep.year = year;
    return { blob, report: rep };
  }

  window.OttoLibro = { fill };
})();
