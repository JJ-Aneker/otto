// Otto vigila: revisa una web (¿responde?, ¿cuánto tarda?, ¿certificado?, SEO básico).
const tls = require('tls');
const dns = require('dns').promises;
const net = require('net');

const UA = 'OttoVigila/1.0 (+https://otto.aneker.es)';
const MAX_HTML = 1.5 * 1024 * 1024;
const SLOW_MS = 3000;
const HEAVY_BYTES = 500 * 1024;

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:127.') || v.startsWith('::ffff:10.') || v.startsWith('::ffff:192.168.');
}

// Solo se vigilan webs públicas (evita que alguien use Otto para mirar redes internas).
async function assertPublic(urlStr) {
  let u;
  try { u = new URL(urlStr); } catch { throw new Error('La dirección no es válida'); }
  if (!/^https?:$/.test(u.protocol)) throw new Error('La dirección debe empezar por http:// o https://');
  if (process.env.OTTO_ALLOW_PRIVATE === '1') return u;
  const addrs = net.isIP(u.hostname) ? [{ address: u.hostname }] : await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new Error('Esa dirección no es pública');
  return u;
}

async function fetchT(url, ms, opts = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { redirect: 'follow', signal: ctl.signal, headers: { 'User-Agent': UA, ...(opts.headers || {}) }, method: opts.method || 'GET' }); }
  finally { clearTimeout(t); }
}

async function readText(res) {
  const reader = res.body?.getReader?.();
  if (!reader) return (await res.text()).slice(0, MAX_HTML);
  let out = '', size = 0; const dec = new TextDecoder();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length; out += dec.decode(value, { stream: true });
    if (size > MAX_HTML) { try { await reader.cancel(); } catch { /* nada */ } break; }
  }
  return out;
}

function sslDaysLeft(hostname) {
  return new Promise(resolve => {
    const sock = tls.connect({ host: hostname, port: 443, servername: hostname, timeout: 6000 }, () => {
      const c = sock.getPeerCertificate();
      sock.end();
      const end = c && c.valid_to ? new Date(c.valid_to) : null;
      resolve(end && !isNaN(end) ? Math.floor((end - Date.now()) / 86400000) : null);
    });
    sock.on('error', () => resolve(null));
    sock.on('timeout', () => { sock.destroy(); resolve(null); });
  });
}

// ── Lectura básica del HTML ──
function metaDescription(html) {
  const tags = html.match(/<meta\b[^>]*>/gi) || [];
  for (const t of tags) {
    if (/\b(name|property)\s*=\s*["'](description|og:description)["']/i.test(t)) {
      const m = t.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
      const v = (m && (m[1] ?? m[2]) || '').trim();
      if (v) return v;
    }
  }
  return '';
}
function imageSrcs(html, base) {
  const out = new Set();
  for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi)) {
    try { const u = new URL(m[1], base); if (/^https?:$/.test(u.protocol) && !m[1].startsWith('data:')) out.add(u.href); } catch { /* ignorar */ }
  }
  return [...out];
}

async function pool(items, size, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) { const k = i++; try { out[k] = await fn(items[k]); } catch { out[k] = null; } }
  }));
  return out;
}

async function wpPageList(origin) {
  const urls = [];
  for (const kind of ['pages', 'posts']) {
    try {
      const r = await fetchT(`${origin}/wp-json/wp/v2/${kind}?per_page=15&_fields=link`, 6000);
      if (r.ok) { const j = await r.json(); if (Array.isArray(j)) j.forEach(x => x.link && urls.push(x.link)); }
    } catch { /* WordPress sin API pública: se revisa solo la portada */ }
  }
  return urls;
}

const short = u => { try { const x = new URL(u); return x.pathname === '/' ? x.host : x.host + x.pathname; } catch { return u; } };

async function checkSite(urlStr) {
  const issues = [];
  let u;
  try { u = await assertPublic(urlStr); } catch (e) {
    return { ok: false, status_code: null, response_ms: null, ssl_days_left: null, pages_checked: 0, issues: [{ type: 'down', severity: 'error', message: e.message }] };
  }
  const t0 = Date.now();
  let res, html = '';
  try {
    res = await fetchT(u.href, 15000);
    html = await readText(res);
  } catch (e) {
    const why = e.name === 'AbortError' ? 'tardó más de 15 segundos' : 'no se pudo conectar con ella';
    return { ok: false, status_code: null, response_ms: null, ssl_days_left: u.protocol === 'https:' ? await sslDaysLeft(u.hostname) : null, pages_checked: 0,
      issues: [{ type: 'down', severity: 'error', message: `La web no responde (${why})` }] };
  }
  const response_ms = Date.now() - t0;
  const ok = res.status < 400;
  if (!ok) issues.push({ type: 'down', severity: 'error', message: `La web devuelve el error ${res.status}` });
  else if (response_ms > SLOW_MS) issues.push({ type: 'slow', severity: 'warn', message: `La portada tarda ${(response_ms / 1000).toFixed(1).replace('.', ',')} s en cargar`, detail: 'Lo recomendable es menos de 3 segundos' });

  const ssl_days_left = u.protocol === 'https:' ? await sslDaysLeft(u.hostname) : null;
  if (ssl_days_left !== null) {
    if (ssl_days_left <= 0) issues.push({ type: 'ssl', severity: 'error', message: 'El certificado de seguridad ha caducado', detail: 'Renuévalo con tu proveedor de hosting' });
    else if (ssl_days_left <= 14) issues.push({ type: 'ssl', severity: 'warn', message: `El certificado de seguridad caduca en ${ssl_days_left} ${ssl_days_left === 1 ? 'día' : 'días'}`, detail: 'Renuévalo con tu proveedor de hosting' });
  }

  // SEO básico: portada + hasta 15 páginas y 15 entradas de WordPress
  let pages = [{ url: res.url || u.href, html }];
  if (ok) {
    const extra = (await wpPageList(u.origin)).filter(x => x !== (res.url || u.href)).slice(0, 25);
    const got = await pool(extra, 5, async link => {
      const r = await fetchT(link, 8000); if (!r.ok) return null;
      return { url: link, html: await readText(r) };
    });
    pages = pages.concat(got.filter(Boolean));
  }
  const noMeta = pages.filter(p => !metaDescription(p.html)).map(p => short(p.url));
  if (ok && noMeta.length) issues.push({ type: 'seo_meta', severity: 'warn', message: `${noMeta.length} ${noMeta.length === 1 ? 'página sin descripción' : 'páginas sin descripción'} para Google`, detail: 'Afecta a cómo aparecen en los resultados de búsqueda', items: noMeta.slice(0, 10) });
  const noTitle = pages.filter(p => !/<title[^>]*>\s*[^<\s][^<]*<\/title>/i.test(p.html)).map(p => short(p.url));
  if (ok && noTitle.length) issues.push({ type: 'seo_title', severity: 'warn', message: `${noTitle.length} ${noTitle.length === 1 ? 'página sin título' : 'páginas sin título'}`, items: noTitle.slice(0, 10) });

  // Imágenes pesadas (se mira el peso de hasta 30 imágenes)
  if (ok) {
    const imgs = [...new Set(pages.slice(0, 10).flatMap(p => imageSrcs(p.html, p.url)))].slice(0, 30);
    const sizes = await pool(imgs, 6, async src => {
      const r = await fetchT(src, 5000, { method: 'HEAD' });
      return { src, bytes: parseInt(r.headers.get('content-length') || '0', 10) };
    });
    const heavy = sizes.filter(x => x && x.bytes > HEAVY_BYTES).sort((a, b) => b.bytes - a.bytes);
    if (heavy.length) issues.push({ type: 'heavy_image', severity: 'warn',
      message: heavy.length === 1 ? `Una imagen pesa ${(heavy[0].bytes / 1048576).toFixed(1).replace('.', ',')} MB y ralentiza la web` : `${heavy.length} imágenes pesan más de 500 KB y ralentizan la web`,
      detail: 'Conviene reducirlas antes de subirlas', items: heavy.slice(0, 8).map(x => `${x.src.split('/').pop()} · ${(x.bytes / 1048576).toFixed(1).replace('.', ',')} MB`) });
  }
  return { ok, status_code: res.status, response_ms, ssl_days_left, pages_checked: pages.length, issues };
}

module.exports = { checkSite, assertPublic, isPrivateIp, metaDescription };
