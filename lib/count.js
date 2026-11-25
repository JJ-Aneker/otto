// Otto cuenta: lectura de Google Analytics 4 (cuenta de servicio) e Instagram (Graph API).
// Solo lectura. Las claves llegan ya descifradas desde api/count.js.
const crypto = require('crypto');
const { HttpError } = require('./http');

const b64u = b => Buffer.from(b).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

// El JSON de la cuenta de servicio que se descarga de Google Cloud
function parseServiceAccount(text) {
  let j;
  try { j = JSON.parse(String(text)); } catch { throw new HttpError(400, 'El archivo de la cuenta de servicio no es un JSON válido'); }
  if (!j || !j.client_email || !j.private_key || !String(j.private_key).includes('PRIVATE KEY'))
    throw new HttpError(400, 'Ese JSON no parece una clave de cuenta de servicio de Google (faltan client_email o private_key)');
  return { client_email: j.client_email, private_key: j.private_key, token_uri: j.token_uri || 'https://oauth2.googleapis.com/token' };
}

async function googleToken(sa, scope = 'https://www.googleapis.com/auth/analytics.readonly') {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64u(JSON.stringify({ iss: sa.client_email, scope, aud: sa.token_uri, iat: now, exp: now + 3000 }));
  let sig;
  try { sig = crypto.createSign('RSA-SHA256').update(head + '.' + claim).sign(sa.private_key); }
  catch { throw new HttpError(400, 'La clave privada de la cuenta de servicio no es válida'); }
  const r = await fetch(sa.token_uri, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: head + '.' + claim + '.' + b64u(sig) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new HttpError(502, 'Google no ha aceptado la cuenta de servicio', j.error_description || j.error || '');
  return j.access_token;
}

const cleanProperty = v => String(v || '').replace(/^properties\//i, '').replace(/\D/g, '');

function gaError(status, j, email) {
  const m = (j && j.error && j.error.message) || '';
  if (status === 403 && /has not been used|disabled/i.test(m)) return new HttpError(400, 'Falta activar la API «Google Analytics Data» en el proyecto de Google Cloud', m);
  if (status === 403) return new HttpError(400, `La cuenta de servicio no tiene acceso a esa propiedad. En Google Analytics → Administrar → Acceso a la propiedad, añade ${email} como Lector.`, m);
  if (status === 400 || status === 404) return new HttpError(400, 'Google Analytics no encuentra esa propiedad. Revisa el ID de la propiedad (solo números).', m);
  return new HttpError(502, 'Google Analytics ha respondido con un error', m);
}

// Cada informe devuelve filas {d: [dimensiones], v: [métricas]}. Con dos rangos, la última dimensión es el nombre del rango.
function rowsOf(rep) {
  const dh = (rep.dimensionHeaders || []).map(h => h.name);
  return (rep.rows || []).map(r => ({ d: (r.dimensionValues || []).map(x => x.value), v: (r.metricValues || []).map(x => Number(x.value) || 0), dh }));
}

const dayStr = n => (n === 0 ? 'today' : n === 1 ? 'yesterday' : n + 'daysAgo');

async function runGa(sa, propertyId, days) {
  days = [7, 28, 90].includes(Number(days)) ? Number(days) : 28;
  const id = cleanProperty(propertyId);
  if (!id) throw new HttpError(400, 'Falta el ID de la propiedad de Google Analytics');
  const token = await googleToken(sa);
  const cur = { startDate: dayStr(days), endDate: 'yesterday', name: 'actual' };
  const prev = { startDate: dayStr(days * 2), endDate: dayStr(days + 1), name: 'anterior' };
  const two = [cur, prev];
  const body = { requests: [
    { dateRanges: two, metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'averageSessionDuration' }] },
    { dateRanges: two, dimensions: [{ name: 'sessionDefaultChannelGroup' }], metrics: [{ name: 'sessions' }], limit: 20 },
    { dateRanges: two, dimensions: [{ name: 'pagePath' }, { name: 'pageTitle' }], metrics: [{ name: 'screenPageViews' }, { name: 'sessions' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: 60 },
    { dateRanges: [cur], dimensions: [{ name: 'date' }], metrics: [{ name: 'sessions' }], orderBys: [{ dimension: { dimensionName: 'date' } }], limit: 100 },
    { dateRanges: two, dimensions: [{ name: 'eventName' }], metrics: [{ name: 'eventCount' }, { name: 'keyEvents' }], orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: 80 },
  ] };
  const r = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${id}:batchRunReports`, {
    method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw gaError(r.status, j, sa.client_email);
  const reps = j.reports || [];
  const rng = x => x.d[x.d.length - 1] === 'anterior' ? 'prev' : 'cur';

  const sum = { cur: {}, prev: {} };
  rowsOf(reps[0] || {}).forEach(x => { const k = rng(x); sum[k] = { sessions: x.v[0], users: x.v[1], views: x.v[2], duration: x.v[3] }; });
  ['cur', 'prev'].forEach(k => { sum[k] = Object.assign({ sessions: 0, users: 0, views: 0, duration: 0 }, sum[k]); });

  const chan = new Map();
  rowsOf(reps[1] || {}).forEach(x => { const n = x.d[0] || 'Sin canal'; const o = chan.get(n) || { name: n, cur: 0, prev: 0 }; o[rng(x)] += x.v[0]; chan.set(n, o); });
  const channels = [...chan.values()].sort((a, b) => b.cur - a.cur || b.prev - a.prev);

  const pg = new Map();
  rowsOf(reps[2] || {}).forEach(x => { const k = x.d[0]; const o = pg.get(k) || { path: k, title: x.d[1] || '', views: 0, prev: 0, sessions: 0 }; if (rng(x) === 'cur') { o.views += x.v[0]; o.sessions += x.v[1]; if (x.d[1] && x.d[1] !== '(not set)') o.title = x.d[1]; } else o.prev += x.v[0]; pg.set(k, o); });
  const pages = [...pg.values()].filter(p => p.views > 0).sort((a, b) => b.views - a.views).slice(0, 15);

  const daily = rowsOf(reps[3] || {}).map(x => ({ date: x.d[0], sessions: x.v[0] }));

  const ev = new Map();
  rowsOf(reps[4] || {}).forEach(x => { const n = x.d[0]; const o = ev.get(n) || { name: n, cur: 0, prev: 0, key: 0 }; const k = rng(x); o[k] += x.v[0]; if (k === 'cur') o.key += x.v[1]; ev.set(n, o); });
  const events = [...ev.values()].filter(e => e.cur > 0 || e.prev > 0).map(e => ({ name: e.name, cur: e.cur, prev: e.prev, key: e.key > 0 }));

  return { days, summary: sum, channels, pages, daily, events };
}

/* ── Instagram (Graph API) ── */
const GRAPH = 'https://graph.facebook.com/v21.0';
async function graph(path, params, token) {
  const u = new URL(GRAPH + path); Object.entries(params || {}).forEach(([k, v]) => u.searchParams.set(k, v)); u.searchParams.set('access_token', token);
  const r = await fetch(u); const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    const e = j.error || {};
    if (e.code === 190) throw new HttpError(400, 'El token de Instagram ha caducado o no es válido. Genera uno nuevo y guárdalo en Ajustes → Cuenta.', e.message);
    if (e.code === 10 || e.code === 200 || e.code === 100) throw new HttpError(400, 'Instagram no deja leer esos datos. Comprueba que el ID es el de la cuenta profesional y que el token tiene el permiso instagram_basic e instagram_manage_insights.', e.message);
    throw new HttpError(502, 'Instagram ha respondido con un error', e.message || String(r.status));
  }
  return j;
}

async function runInstagram(token, igUserId, days) {
  days = [7, 28, 90].includes(Number(days)) ? Number(days) : 28;
  const id = String(igUserId || '').replace(/\D/g, '');
  if (!id) throw new HttpError(400, 'Falta el ID de la cuenta de Instagram');
  const now = Math.floor(Date.now() / 1000), d = 86400;
  const range = (a, b) => ({ since: String(now - a * d), until: String(now - b * d) });
  const insights = async (r) => {
    try {
      const j = await graph(`/${id}/insights`, { metric: 'reach,profile_views,accounts_engaged', period: 'day', metric_type: 'total_value', ...r }, token);
      const o = {}; (j.data || []).forEach(m => { o[m.name] = (m.total_value && m.total_value.value) || 0; }); return o;
    } catch (e) { if (e.status === 400 && /token/i.test(e.message)) throw e; return null; }
  };
  const [profile, cur, prev, media] = await Promise.all([
    graph(`/${id}`, { fields: 'username,followers_count,media_count' }, token),
    insights(range(days, 0)), insights(range(days * 2, days)),
    graph(`/${id}/media`, { fields: 'caption,media_type,like_count,comments_count,permalink,timestamp,thumbnail_url,media_url', limit: '40' }, token),
  ]);
  const since = (now - days * d) * 1000;
  const posts = (media.data || []).filter(m => new Date(m.timestamp).getTime() >= since)
    .map(m => ({ caption: String(m.caption || '').slice(0, 140), type: m.media_type, likes: m.like_count || 0, comments: m.comments_count || 0, url: m.permalink, date: m.timestamp, image: m.thumbnail_url || m.media_url || '' }))
    .sort((a, b) => (b.likes + b.comments * 3) - (a.likes + a.comments * 3)).slice(0, 6);
  return { days, username: profile.username, followers: profile.followers_count || 0, mediaCount: profile.media_count || 0, cur, prev, posts, postsInPeriod: (media.data || []).filter(m => new Date(m.timestamp).getTime() >= since).length };
}

module.exports = { parseServiceAccount, googleToken, runGa, runInstagram, cleanProperty };
