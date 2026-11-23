/* ============================================================
   Capa multiusuario del agente de contenidos
   - Login con Supabase (email + contraseña)
   - Perfiles (workspaces): conocimiento, tono, WordPress, Instagram, IA
   - Calendario, historial y consumo guardados en la base de datos
   - Claves (API Key de IA, contraseña de WP) cifradas en el servidor
   Se carga DESPUÉS del script principal y sustituye sus funciones
   de datos/login. El resto (editor, imágenes, IG...) sigue igual.
   ============================================================ */

let sb = null;            // cliente Supabase
let ws = null;            // perfil activo
let workspaces = [];      // todos los perfiles del usuario
let secretsInfo = {};     // id -> {kind, key_hint}
let usageRows = [];       // consumo del mes del perfil activo
let authMode = 'in';      // 'in' | 'up'

const LANGS = { es: 'español', en: 'inglés', ca: 'catalán', pt: 'portugués', fr: 'francés', it: 'italiano' };
const MODEL_DEFAULTS = { anthropic: 'claude-haiku-4-5-20251001', openai: 'gpt-4o-mini', gemini: 'gemini-2.0-flash', mistral: 'mistral-small-latest' };
// Precio aproximado en € por millón de tokens [entrada, salida]. Solo orientativo.
const PRICES = { anthropic: [0.9, 4.5], openai: [0.14, 0.55], gemini: [0.09, 0.37], mistral: [0.18, 0.55] };
const BILLING = {
  anthropic: 'https://console.anthropic.com/settings/billing',
  openai: 'https://platform.openai.com/settings/organization/billing',
  gemini: 'https://aistudio.google.com/',
  mistral: 'https://console.mistral.ai/billing'
};
const SEASONS = ['primavera', 'verano', 'otoño', 'invierno'];

function langName() { return LANGS[ws?.language] || 'español'; }
const $ = id => document.getElementById(id);
function esc(t) { return String(t ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ── Llamadas autenticadas a /api/* ───────────────────────────
async function apiFetch(url, opts = {}) {
  const { data } = await sb.auth.getSession();
  const token = data?.session?.access_token;
  const headers = { ...(opts.headers || {}), 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  let body = opts.body;
  if (body && typeof body === 'string') {
    try { const o = JSON.parse(body); if (ws) o.workspaceId = ws.id; body = JSON.stringify(o); } catch { /* sin cambios */ }
  }
  return fetch(url, { ...opts, headers, body });
}

async function postSecret(kind, label, value) {
  const r = await apiFetch('/api/secrets', { method: 'POST', body: JSON.stringify({ kind, label, value }) });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'No se pudo guardar la clave');
  secretsInfo[d.id] = { kind: d.kind, key_hint: d.key_hint };
  return d;
}
async function deleteSecret(id) {
  if (!id) return;
  try { await apiFetch('/api/secrets', { method: 'DELETE', body: JSON.stringify({ id }) }); delete secretsInfo[id]; } catch { /* no crítico */ }
}
async function updateWs(patch) {
  const { data, error } = await sb.from('workspaces').update(patch).eq('id', ws.id).select().single();
  if (error) throw new Error(error.message);
  Object.assign(ws, data);
  return data;
}

// ── Arranque y sesión ────────────────────────────────────────
async function boot() {
  try {
    const cfg = await (await fetch('/api/config')).json();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) throw new Error('Falta configurar Supabase en el fichero .env');
    if (!window.supabase) throw new Error('No se pudo cargar Supabase (¿sin conexión?)');
    sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  } catch (e) { showLoginError(e.message); return; }

  const { data } = await sb.auth.getSession();
  if (data.session) await onSignedIn(data.session.user);
  sb.auth.onAuthStateChange(ev => { if (ev === 'SIGNED_OUT') showLogin(); });
}

function showLogin() { $('loginScreen').classList.remove('hidden'); }
function showLoginError(msg, ok) {
  const el = $('loginError');
  el.textContent = msg; el.classList.add('visible');
  el.style.background = ok ? '#d4e8dc' : ''; el.style.color = ok ? 'var(--success)' : '';
}
function toggleAuthMode() {
  authMode = authMode === 'in' ? 'up' : 'in';
  $('loginBtn').textContent = authMode === 'in' ? 'Entrar' : 'Crear cuenta';
  $('loginSub').textContent = authMode === 'in' ? 'Accede a tu cuenta' : 'Crea tu cuenta';
  $('loginToggle').textContent = authMode === 'in' ? '¿No tienes cuenta? Crear una' : 'Ya tengo cuenta · Entrar';
  $('loginError').classList.remove('visible');
}

async function doLogin() {
  const email = $('loginEmail').value.trim(), pass = $('loginPass').value;
  if (!email || !pass) return;
  const btn = $('loginBtn'), label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Un momento…'; $('loginError').classList.remove('visible');
  try {
    if (authMode === 'up') {
      const { data, error } = await sb.auth.signUp({ email, password: pass });
      if (error) throw error;
      if (!data.session) { showLoginError('Cuenta creada. Revisa tu email para confirmarla y después entra.', true); return; }
      await onSignedIn(data.user);
    } else {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (error) throw error;
      await onSignedIn(data.user);
    }
  } catch (e) {
    const m = String(e.message || e);
    showLoginError(/invalid login/i.test(m) ? 'Email o contraseña incorrectos' : m);
  } finally { btn.disabled = false; btn.textContent = label; }
}

async function doLogout() {
  if (!confirm('¿Cerrar sesión?')) return;
  await sb.auth.signOut();
  ws = null; workspaces = []; history = []; generatedData = null; jwtToken = null;
  $('loginPass').value = '';
  showLogin();
}
function checkSession() { /* sustituido por boot() */ }

async function onSignedIn(user) {
  currentUser = user;
  $('loginScreen').classList.add('hidden');

  // Mostrar app shell
  const appShell = document.getElementById('appShell');
  if (appShell) {
    appShell.classList.remove('hidden');
    appShell.style.display = 'flex';
  }

  $('userBadgeName').textContent = '👤 ' + (user.email || '');
  const [w, s] = await Promise.all([
    sb.from('workspaces').select('*').order('created_at'),
    sb.from('secrets').select('id, kind, key_hint')
  ]);
  if (w.error) { showToast('Error cargando perfiles: ' + w.error.message, 'error'); return; }
  workspaces = w.data || [];
  secretsInfo = {}; (s.data || []).forEach(r => { secretsInfo[r.id] = r; });

  if (!workspaces.length) {
    const { data, error } = await sb.from('workspaces').insert({ owner_id: user.id, name: 'Mi primer perfil' }).select().single();
    if (error) { showToast('No se pudo crear el perfil: ' + error.message, 'error'); return; }
    workspaces = [data];
  }
  let last = null; try { last = localStorage.getItem('agente_ws'); } catch { }
  await selectWorkspace((workspaces.find(x => x.id === last) || workspaces[0]).id);

  // Ir a home si es primera vez, sino a home también
  showPage('home');
  if (window.renderHome) window.renderHome();
}

// ── Perfiles ─────────────────────────────────────────────────
function renderWsSelect() {
  $('wsSelect').innerHTML = workspaces.map(w => `<option value="${w.id}" ${ws && w.id === ws.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('');
  $('wsTitle').textContent = ws ? ws.name : 'Agente de contenidos';
}

function buildKB() {
  if (!ws) return '';
  return `# BASE DE CONOCIMIENTO — ${ws.name}\n` +
    (ws.niche ? `Sector: ${ws.niche}\n` : '') +
    (ws.knowledge ? `\n${ws.knowledge}\n` : '') +
    (ws.tone ? `\n## VOZ Y TONO\n${ws.tone}\n` : '') +
    (ws.keywords ? `\n## PALABRAS CLAVE SEO\n${ws.keywords}\n` : '');
}

async function selectWorkspace(id) {
  const w = workspaces.find(x => x.id === id); if (!w) return;
  ws = w; try { localStorage.setItem('agente_ws', id); } catch { }
  jwtToken = null; generatedData = null; selectedTopic = null; igData = null;
  KB = buildKB();
  wpConfig = { url: ws.wp_url || '', user: ws.wp_user || '', pass: '' };
  igConfig = ws.instagram || {};
  renderWsSelect();

  const [t, p] = await Promise.all([
    sb.from('topics').select('*').eq('workspace_id', ws.id).order('position'),
    sb.from('posts').select('id, content, status, wp_link, created_at').eq('workspace_id', ws.id).order('created_at', { ascending: false })
  ]);
  if (ws.id !== id) return; // el usuario cambió de perfil mientras cargaba
  if (t.error) showToast('Error cargando calendario: ' + t.error.message, 'error');
  calTopics = (t.data || []).map((r, i) => ({ id: i + 1, dbId: r.id, name: r.name, cat: r.category || 'General', week: `Sem ${i * 2 + 1}`, season: r.season, angle: r.angle || '', done: r.done }));
  TOPICS.length = 0; calTopics.forEach(x => TOPICS.push(x));
  doneTopics = calTopics.filter(x => x.done).map(x => x.id);
  history = (p.data || []).map(r => ({ ...r.content, dbId: r.id, status: r.status, wpLink: r.wp_link, generatedAt: r.content?.generatedAt || r.created_at }));
  await loadUsage();

  fillForms(); initTopicGrid(); renderHistory(); updateBadges(); renderTokenStats(); updatePublishPanel(); updateCalCount();
  try { renderCalList(); } catch { }
  allMedia = []; filteredMedia = []; selectedMedia = [];
  try { renderMediaGrid(); } catch { }
  try { $('resultBody').classList.remove('visible'); $('outputTabs').style.display = 'none'; $('outputActions').style.display = 'none'; $('emptyState').style.display = 'flex'; } catch { }
  const next = new Date(); next.setDate(next.getDate() + 14); $('wpSchedule').value = next.toISOString().slice(0, 16);
}

async function newWorkspace() {
  const name = (prompt('Nombre del nuevo perfil (cliente o negocio):') || '').trim();
  if (!name) return;
  const { data, error } = await sb.from('workspaces').insert({ owner_id: currentUser.id, name }).select().single();
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  workspaces.push(data);
  await selectWorkspace(data.id);
  showPage('settings', document.querySelectorAll('.nav-btn')[1]);
  switchSettingsTab('profile', $('stab-profile'));
  showToast('✓ Perfil creado. Completa su información.', 'success');
}

async function deleteWorkspace() {
  if (!confirm(`¿Eliminar el perfil "${ws.name}" con su calendario, historial y claves? No se puede deshacer.`)) return;
  if (workspaces.length === 1 && !confirm('Es tu único perfil. Se creará uno vacío nuevo. ¿Continuar?')) return;
  const gone = ws, secrets = [gone.ai_secret_id, gone.wp_secret_id];
  const { error } = await sb.from('workspaces').delete().eq('id', gone.id);
  if (error) { showToast('Error: ' + error.message, 'error'); return; }
  for (const s of secrets) await deleteSecret(s);
  workspaces = workspaces.filter(x => x.id !== gone.id);
  if (!workspaces.length) {
    const { data } = await sb.from('workspaces').insert({ owner_id: currentUser.id, name: 'Mi primer perfil' }).select().single();
    workspaces = [data];
  }
  await selectWorkspace(workspaces[0].id);
  showToast('Perfil eliminado');
}

// ── Formularios de configuración ─────────────────────────────
function fillForms() {
  $('pfName').value = ws.name || ''; $('pfNiche').value = ws.niche || ''; $('pfLanguage').value = ws.language || 'es';
  $('pfTone').value = ws.tone || ''; $('pfKnowledge').value = ws.knowledge || ''; $('pfKeywords').value = ws.keywords || '';
  $('wpUrl').value = ws.wp_url || ''; $('wpUser').value = ws.wp_user || ''; $('wpPass').value = '';
  const wh = secretsInfo[ws.wp_secret_id]; $('wpPassHint').textContent = wh ? `Contraseña guardada (${wh.key_hint})` : 'Aún no hay contraseña guardada';
  $('aiProvider').value = ws.ai_provider || 'anthropic'; $('aiModel').value = ws.ai_model || ''; $('aiKey').value = '';
  onProviderChange(true);
  loadIGConfig();
}

function onProviderChange(keepModel) {
  const p = $('aiProvider').value;
  $('aiModel').placeholder = MODEL_DEFAULTS[p];
  if (keepModel !== true) $('aiModel').value = '';
  const info = secretsInfo[ws?.ai_secret_id];
  $('aiKeyHint').textContent = info && info.kind === p ? `Clave guardada (${info.key_hint})` : 'Aún no hay clave guardada para este proveedor';
  $('rechargeLink').href = BILLING[p];
}

function switchSettingsTab(tab, el) {
  ['profile', 'wp', 'claude', 'instagram'].forEach(t => {
    const sec = $('settings-' + t); if (sec) sec.style.display = t === tab ? 'block' : 'none';
  });
  document.querySelectorAll('#page-settings .tab').forEach(b => b.classList.remove('active'));
  if (el) el.classList.add('active');
  if (tab === 'claude') { loadUsage().then(renderTokenStats); }
}

async function saveProfile() {
  const name = $('pfName').value.trim();
  if (!name) { showWPStatus('pfStatus', 'Escribe un nombre para el perfil', 'error'); return; }
  try {
    await updateWs({ name, niche: $('pfNiche').value.trim() || null, language: $('pfLanguage').value, tone: $('pfTone').value.trim() || null, knowledge: $('pfKnowledge').value.trim() || null, keywords: $('pfKeywords').value.trim() || null });
    KB = buildKB(); renderWsSelect();
    showWPStatus('pfStatus', '✓ Perfil guardado', 'success');
  } catch (e) { showWPStatus('pfStatus', '✗ ' + e.message, 'error'); }
}

async function saveAI() {
  const provider = $('aiProvider').value, model = $('aiModel').value.trim(), key = $('aiKey').value.trim();
  const oldId = ws.ai_secret_id, old = secretsInfo[oldId];
  if (!key && (!old || old.kind !== provider)) { showWPStatus('aiStatus', `Pega la API Key de ${provider}`, 'error'); return; }
  try {
    const patch = { ai_provider: provider, ai_model: model || null };
    if (key) { const s = await postSecret(provider, `${provider} · ${ws.name}`, key); patch.ai_secret_id = s.id; }
    await updateWs(patch);
    if (key && oldId && oldId !== ws.ai_secret_id) await deleteSecret(oldId);
    $('aiKey').value = ''; onProviderChange(true);
    showWPStatus('aiStatus', '✓ Guardado. Usa "Probar conexión" para comprobar la clave.', 'success');
  } catch (e) { showWPStatus('aiStatus', '✗ ' + e.message, 'error'); }
}

async function testAI() {
  showWPStatus('aiStatus', '⏳ Probando…', 'info');
  try {
    const r = await apiFetch('/api/generate', { method: 'POST', body: JSON.stringify({ messages: [{ role: 'user', content: 'Responde solo: OK' }], max_tokens: 20, label: 'Prueba de conexión' }) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Error');
    showWPStatus('aiStatus', `✓ Funciona (${d.provider} · ${d.model})`, 'success');
    loadUsage().then(renderTokenStats);
  } catch (e) { showWPStatus('aiStatus', '✗ ' + e.message, 'error'); }
}

// ── WordPress (la contraseña vive cifrada en el servidor) ────
async function saveWPConfig() {
  const url = $('wpUrl').value.trim().replace(/\/$/, ''), user = $('wpUser').value.trim(), pass = $('wpPass').value.trim();
  try {
    const patch = { wp_url: url || null, wp_user: user || null };
    const oldId = ws.wp_secret_id;
    if (pass) { const s = await postSecret('wordpress', `WordPress · ${ws.name}`, pass); patch.wp_secret_id = s.id; }
    await updateWs(patch);
    if (pass && oldId && oldId !== ws.wp_secret_id) await deleteSecret(oldId);
    wpConfig = { url, user, pass: '' }; jwtToken = null; $('wpPass').value = '';
    const wh = secretsInfo[ws.wp_secret_id]; $('wpPassHint').textContent = wh ? `Contraseña guardada (${wh.key_hint})` : 'Aún no hay contraseña guardada';
    showWPStatus('wpStatus', '✓ Configuración guardada', 'success');
  } catch (e) { showWPStatus('wpStatus', '✗ ' + e.message, 'error'); }
}

async function getJWTToken() {
  const r = await apiFetch('/api/jwt-login', { method: 'POST', body: '{}' });
  const d = await r.json();
  if (d.token) { jwtToken = d.token; return d.token; }
  throw new Error(d.error || d.message || JSON.stringify(d));
}

async function wpProxy(wpPath, method = 'GET', body = null) {
  if (!jwtToken) { try { await getJWTToken(); } catch (e) { return { message: e.message }; } }
  const r = await apiFetch('/api/wordpress', { method: 'POST', body: JSON.stringify({ wpPath, method, body, token: jwtToken }) });
  return r.json();
}

async function testWPConnection() {
  if (!$('wpUrl').value.trim() || !$('wpUser').value.trim()) { showWPStatus('wpStatus', 'Rellena la URL y el usuario', 'error'); return; }
  if ($('wpPass').value.trim() || $('wpUrl').value.trim() !== (ws.wp_url || '') || $('wpUser').value.trim() !== (ws.wp_user || '')) await saveWPConfig();
  if (!ws.wp_secret_id) { showWPStatus('wpStatus', 'Falta la contraseña de WordPress', 'error'); return; }
  showWPStatus('wpStatus', '⏳ Conectando con WordPress…', 'info');
  try {
    jwtToken = null; await getJWTToken();
    const d = await wpProxy('users/me');
    if (d.name || d.slug) showWPStatus('wpStatus', `✓ Conectado como: ${d.name || ws.wp_user}`, 'success');
    else showWPStatus('wpStatus', `✗ ${d.message || JSON.stringify(d)}`, 'error');
  } catch (e) { showWPStatus('wpStatus', `✗ ${e.message}`, 'error'); }
}

async function publishToWordPress() {
  if (!generatedData) { showToast('No hay post generado', 'error'); return; }
  if (!ws.wp_url || !ws.wp_secret_id) { showWPStatus('publishStatus', '⚠️ Configura WordPress en este perfil', 'error'); return; }
  const status = $('wpStatus2').value;
  const postBody = { title: generatedData.titulo_seo || '', content: generatedData.post_html || '', slug: generatedData.slug || '', excerpt: generatedData.meta_descripcion || '', status };
  if (status === 'future') { const sc = $('wpSchedule').value; if (sc) postBody.date = new Date(sc).toISOString(); }
  const btn = $('publishBtn'); btn.disabled = true; btn.textContent = 'Publicando…';
  showWPStatus('publishStatus', '⏳ Enviando a WordPress…', 'info');
  try {
    const d = await wpProxy('posts', 'POST', postBody);
    if (d.id) {
      const link = d.link || `${ws.wp_url}/?p=${d.id}`;
      const sl = status === 'publish' ? 'publicado' : status === 'future' ? 'programado' : 'guardado como borrador';
      showWPStatus('publishStatus', `✓ Post ${sl}. <a href="${link}" target="_blank" style="color:var(--success);text-decoration:underline">Ver en WordPress →</a>`, 'success');
      if (status === 'publish') {
        generatedData.status = 'published'; generatedData.wpLink = link;
        const i = history.findIndex(h => (h.dbId && h.dbId === generatedData.dbId) || h.titulo_seo === generatedData.titulo_seo);
        if (i >= 0) { generatedData.dbId = history[i].dbId; history[i] = generatedData; await savePostToDB(generatedData); renderHistory(); }
      }
      showToast('✓ Enviado a WordPress', 'success');
    } else showWPStatus('publishStatus', `✗ Error: ${d.message || d.error || JSON.stringify(d)}`, 'error');
  } catch (e) { showWPStatus('publishStatus', `✗ ${e.message}`, 'error'); }
  finally { btn.disabled = false; btn.textContent = 'Publicar en WordPress'; }
}

// ── Instagram (se guarda en el perfil) ───────────────────────
async function saveIGConfig() {
  igConfig = {
    username: $('igUsername')?.value || '', tone: $('igTone')?.value || 'cercano',
    fixedHashtags: $('igFixedHashtags')?.value || '', storyCTA: $('igStoryCTA')?.value || ''
  };
  try { await updateWs({ instagram: igConfig }); showWPStatus('igConfigStatus', '✓ Configuración guardada', 'success'); }
  catch (e) { showWPStatus('igConfigStatus', '✗ ' + e.message, 'error'); }
}
function loadIGConfig() {
  if (!$('igUsername')) return;
  $('igUsername').value = igConfig.username || '';
  if ($('igTone')) $('igTone').value = igConfig.tone || 'cercano';
  $('igFixedHashtags').value = igConfig.fixedHashtags || '';
  $('igStoryCTA').value = igConfig.storyCTA || '';
}

// ── Calendario (tabla topics) ────────────────────────────────
function saveCalTopics() {
  TOPICS.length = 0; calTopics.forEach(t => TOPICS.push(t));
  doneTopics = calTopics.filter(t => t.done).map(t => t.id);
  initTopicGrid(); updateCalCount();
  persistTopics();
}

async function persistTopics() {
  if (!ws) return;
  const wsId = ws.id;
  calTopics.forEach(t => { if (!t.dbId) t.dbId = crypto.randomUUID(); });
  const rows = calTopics.map((t, i) => ({
    id: t.dbId, workspace_id: wsId, name: t.name, category: t.cat || null,
    season: SEASONS.includes(t.season) ? t.season : null, angle: t.angle || null, position: i, done: !!t.done
  }));
  if (rows.length) {
    const { error } = await sb.from('topics').upsert(rows);
    if (error) { showToast('Error guardando el calendario: ' + error.message, 'error'); return; }
  }
  let q = sb.from('topics').delete().eq('workspace_id', wsId);
  if (rows.length) q = q.not('id', 'in', `(${rows.map(r => r.id).join(',')})`);
  const { error: e2 } = await q;
  if (e2) showToast('Error actualizando el calendario: ' + e2.message, 'error');
}

// ── Historial (tabla posts) ──────────────────────────────────
async function savePostToDB(d) {
  if (!d.dbId) d.dbId = crypto.randomUUID();
  const topic = calTopics.find(t => t.id === d.topicId);
  const { error } = await sb.from('posts').upsert({
    id: d.dbId, workspace_id: ws.id, topic_id: topic?.dbId || null, title: d.titulo_seo || null, slug: d.slug || null,
    content: d, season: d.season || null, status: d.status === 'published' ? 'published' : 'draft', wp_link: d.wpLink || null
  });
  if (error) throw new Error(error.message);
}

async function saveToHistory() {
  if (!generatedData) { showToast('Nada que guardar', 'error'); return; }
  try {
    const idx = history.findIndex(h => (h.dbId && h.dbId === generatedData.dbId) || h.titulo_seo === generatedData.titulo_seo);
    if (idx >= 0) generatedData.dbId = history[idx].dbId;
    await savePostToDB(generatedData);
    if (idx >= 0) history[idx] = generatedData; else history.unshift(generatedData);
    const t = calTopics.find(x => x.id === generatedData.topicId);
    if (t && !t.done) { t.done = true; saveCalTopics(); }
    updateBadges(); showToast('✓ Post guardado', 'success');
  } catch (e) { showToast('Error guardando: ' + e.message, 'error'); }
}

async function deleteHistory(i) {
  if (!confirm('¿Eliminar?')) return;
  const h = history[i];
  if (h.dbId) {
    const { error } = await sb.from('posts').delete().eq('id', h.dbId);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
  }
  history.splice(i, 1); renderHistory(); updateBadges();
}

// ── Consumo (tabla usage_log; lo escribe el servidor) ────────
async function loadUsage() {
  if (!ws) return;
  const start = new Date(); start.setDate(1); start.setHours(0, 0, 0, 0);
  const { data } = await sb.from('usage_log').select('*').eq('workspace_id', ws.id).gte('created_at', start.toISOString()).order('created_at', { ascending: false });
  usageRows = data || [];
}
function trackTokenUsage() { loadUsage().then(renderTokenStats); }
function rowCost(r) { const p = PRICES[r.provider] || [0.5, 2]; return (r.input_tokens * p[0] + r.output_tokens * p[1]) / 1e6; }
function renderTokenStats() {
  const tok = r => (r.input_tokens || 0) + (r.output_tokens || 0);
  const total = usageRows.reduce((a, r) => a + tok(r), 0);
  const cost = usageRows.reduce((a, r) => a + rowCost(r), 0);
  if ($('statTokensMonth')) $('statTokensMonth').textContent = total.toLocaleString();
  if ($('statCostMonth')) $('statCostMonth').textContent = '≈' + cost.toFixed(2) + '€';
  if ($('statTokensPost')) $('statTokensPost').textContent = usageRows[0] ? tok(usageRows[0]).toLocaleString() : '0';
  if ($('statPostsMonth')) $('statPostsMonth').textContent = usageRows.length;
  if ($('lowBalanceAlert')) $('lowBalanceAlert').style.display = total > 50000 ? 'block' : 'none';
  const hist = $('tokenHistory');
  if (hist && usageRows.length) {
    hist.innerHTML = usageRows.slice(0, 20).map(r =>
      `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid var(--border)">
        <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.label || 'Generación')}</span>
        <span style="color:var(--muted);margin:0 12px;white-space:nowrap">${tok(r).toLocaleString()} tokens</span>
        <span style="color:var(--accent);white-space:nowrap">${rowCost(r).toFixed(4)}€</span>
      </div>`).join('');
  } else if (hist) hist.innerHTML = '<span style="color:var(--muted)">Aún no hay datos. Genera un post para empezar a registrar el consumo.</span>';
}
function resetTokenStats() { showToast('El consumo se guarda en el servidor y no se puede borrar'); }

// ── Inicio ───────────────────────────────────────────────────
function init() { /* el arranque real es boot() */ }
boot();
