// Otto ordena: lectura de facturas y tickets con IA + reglas por proveedor.
// Aquí solo hay lógica pura (prompt, validación, reglas); la llamada a la IA y la base de datos están en api/ordena.js.

const DOC_TYPES = ['factura', 'ticket', 'otro'];

const SYSTEM = 'Eres un asistente que lee facturas y tickets de compra de un negocio en España y devuelve sus datos en JSON. Respondes solo con el JSON, sin texto alrededor.';

function buildPrompt(categories, direction) {
  if (direction === 'venta') return buildSalePrompt();
  const list = (categories || []).map(c => `- ${c.concept} (tipo de gasto: ${c.expense_type})${c.examples ? ` · ejemplos: ${c.examples}` : ''}`).join('\n');
  return `Extrae los datos visibles de este documento (factura o ticket de compra). No inventes nada: usa null cuando un dato no aparezca.

Reglas:
- fecha en formato YYYY-MM-DD si se ve con claridad.
- Los importes son números sin símbolo de moneda y con punto decimal (por ejemplo 1286.40).
- proveedor es quien EMITE el documento, no el cliente. nif_proveedor es su NIF/CIF.
- numero_documento es el número de factura o de ticket.
- concepto es un resumen breve de qué se ha comprado.
- iva_porcentaje solo si el documento lo indica con claridad; si hay varios tipos de IVA usa null y explica el detalle en observaciones. No calcules el IVA si no figura.
- total es lo realmente pagado. Si hay devoluciones o cambios, indícalo en observaciones.
- lineas: artículos o servicios cuando se distingan; si no, una lista vacía.
- categoria: elige EXACTAMENTE uno de estos conceptos (copia el nombre tal cual) o null si ninguno encaja con claridad:
${list || '(sin categorías definidas)'}

Devuelve un único objeto JSON con estas claves exactas:
{"tipo_documento":"factura|ticket|otro","proveedor":null,"nif_proveedor":null,"numero_documento":null,"fecha":null,"moneda":"EUR","concepto":null,"base_imponible":null,"iva_porcentaje":null,"iva_importe":null,"total":null,"categoria":null,"observaciones":null,"lineas":[{"descripcion":null,"cantidad":null,"precio_unitario":null,"importe":null}]}`;
}

// Factura EMITIDA por el propio negocio: el "proveedor" del JSON pasa a ser el cliente.
function buildSalePrompt() {
  return `Extrae los datos visibles de esta factura EMITIDA por el propio negocio a un cliente. No inventes nada: usa null cuando un dato no aparezca.

Reglas:
- En "proveedor" y "nif_proveedor" pon el CLIENTE (su nombre y su NIF/DNI), no a quien emite la factura.
- numero_documento es el número de la factura.
- fecha en formato YYYY-MM-DD si se ve con claridad.
- Los importes son números sin símbolo de moneda y con punto decimal (por ejemplo 350.00).
- concepto es un resumen breve del servicio o producto facturado.
- iva_porcentaje solo si el documento lo indica con claridad; si hay varios tipos usa null y explica el detalle en observaciones. No calcules el IVA si no figura. Si hay retención de IRPF, indícala en observaciones.
- total es el importe final de la factura.
- lineas: servicios o artículos cuando se distingan; si no, una lista vacía.
- categoria: siempre null.

Devuelve un único objeto JSON con estas claves exactas:
{"tipo_documento":"factura","proveedor":null,"nif_proveedor":null,"numero_documento":null,"fecha":null,"moneda":"EUR","concepto":null,"base_imponible":null,"iva_porcentaje":null,"iva_importe":null,"total":null,"categoria":null,"observaciones":null,"lineas":[{"descripcion":null,"cantidad":null,"precio_unitario":null,"importe":null}]}`;
}

// Saca el objeto JSON de la respuesta de la IA, aunque venga con ``` o texto alrededor.
function parseModelJson(text) {
  const t = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('La IA no devolvió datos legibles');
  const obj = JSON.parse(t.slice(a, b + 1));
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) throw new Error('Formato inesperado');
  return obj;
}

const strip = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v * 100) / 100 : null;
  let s = String(v).replace(/[^\d.,-]/g, '');
  if (!s) return null;
  const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
  if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lc > -1) s = s.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function isoDate(v) {
  if (!v) return null;
  let s = String(v).trim(), m;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) s = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  else if ((m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/))) s = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  else return null;
  const d = new Date(s + 'T00:00:00Z');
  return !isNaN(d) && d.toISOString().slice(0, 10) === s ? s : null;
}

const txt = (v, max) => { const s = String(v ?? '').trim(); return s ? s.slice(0, max) : null; };

// Ordena y limpia lo que devuelve la IA.
function normalize(raw, categories) {
  const r = raw || {};
  const cat = (categories || []).find(c => strip(c.concept) === strip(r.categoria));
  const lines = (Array.isArray(r.lineas) ? r.lineas : []).slice(0, 50).map(l => ({
    descripcion: txt(l?.descripcion, 200), cantidad: num(l?.cantidad), precio_unitario: num(l?.precio_unitario), importe: num(l?.importe),
  })).filter(l => l.descripcion || l.importe !== null);
  const currency = String(r.moneda || 'EUR').trim().toUpperCase();
  return {
    doc_type: DOC_TYPES.includes(String(r.tipo_documento).toLowerCase()) ? String(r.tipo_documento).toLowerCase() : null,
    supplier: txt(r.proveedor, 200),
    supplier_tax_id: (txt(r.nif_proveedor, 30) || '').toUpperCase().replace(/[\s.-]/g, '') || null,
    doc_number: txt(r.numero_documento, 80),
    doc_date: isoDate(r.fecha),
    currency: /^[A-Z]{3}$/.test(currency) ? currency : 'EUR',
    description: txt(r.concepto, 300),
    base_amount: num(r.base_imponible),
    vat_rate: num(r.iva_porcentaje),
    vat_amount: num(r.iva_importe),
    total: num(r.total),
    notes: txt(r.observaciones, 1000),
    lines,
    concept: cat ? cat.concept : null,
  };
}

// Regla por proveedor: si el nombre del proveedor contiene un ejemplo del maestro, esa categoría gana a la IA.
function matchRule(supplier, categories) {
  const hay = ' ' + strip(supplier) + ' ';
  if (hay.trim() === '') return null;
  for (const c of categories || []) {
    const tokens = String(c.examples || '').split(/[,;:\n]/).map(strip).filter(t => t.length >= 3);
    if (tokens.some(t => hay.includes(' ' + t + ' '))) return c;
  }
  return null;
}

// Avisos que dejan el documento "por revisar".
function computeFlags(d, direction) {
  const f = [];
  if (!d.supplier) f.push('sin_proveedor');
  if (!d.supplier_tax_id) f.push('sin_nif_proveedor');
  if (!d.doc_date) f.push('sin_fecha');
  if (d.total === null) f.push('sin_total');
  if (!d.concept && direction !== 'venta') f.push('sin_categoria');
  if (d.total !== null) {
    if (d.base_amount !== null && d.vat_amount !== null && Math.abs(d.base_amount + d.vat_amount - d.total) > 0.05) f.push('importes_no_cuadran');
    else if (d.base_amount !== null && d.vat_rate !== null && d.vat_amount === null && Math.abs(d.base_amount * (1 + d.vat_rate / 100) - d.total) > 0.1) f.push('importes_no_cuadran');
  }
  return f;
}

// Junta todo: respuesta de la IA + maestro → campos listos para guardar.
function buildFields(aiText, categories, direction) {
  const sale = direction === 'venta';
  const cats = sale ? [] : categories;
  const d = normalize(parseModelJson(aiText), cats);
  const rule = sale ? null : matchRule(d.supplier, cats);
  let by = d.concept ? 'ia' : null;
  if (rule) { d.concept = rule.concept; by = 'regla'; }
  const cat = (cats || []).find(c => c.concept === d.concept);
  d.expense_type = cat ? cat.expense_type : null;
  d.flags = computeFlags(d, direction);
  return { fields: d, categoryBy: by };
}

module.exports = { SYSTEM, buildPrompt, parseModelJson, normalize, matchRule, computeFlags, buildFields, num, isoDate };
