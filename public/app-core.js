/* ============================================================
   Otto - Núcleo de la aplicación
   Funciones compartidas entre módulos
   ============================================================ */

// ── Estado global ──────────────────────────────────────────
const AppState = {
  sb: null,              // cliente Supabase
  user: null,            // usuario actual
  workspace: null,       // perfil activo
  workspaces: [],        // todos los perfiles del usuario
  secretsInfo: {},       // id -> {kind, key_hint}
  currentModule: null,   // módulo activo
};

// ── Utilidades básicas ─────────────────────────────────────
const $ = id => document.getElementById(id);
const $$ = selector => document.querySelectorAll(selector);

function esc(text) {
  return String(text ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

function showToast(message, type = 'info', duration = 3000) {
  // TODO: implementar sistema de notificaciones toast
  console.log(`[${type.toUpperCase()}] ${message}`);
}

// ── Gestión de localStorage (con try/catch) ────────────────
function getLocalStorage(key, defaultValue = null) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function setLocalStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

// ── Formato de fechas ──────────────────────────────────────
function formatDate(dateString, format = 'short') {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date)) return dateString;

  const opts = {
    short: { day: 'numeric', month: 'short' },
    medium: { day: 'numeric', month: 'short', year: 'numeric' },
    long: { day: 'numeric', month: 'long', year: 'numeric' },
  }[format] || {};

  return date.toLocaleDateString('es-ES', opts);
}

function getTimeOfDay() {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 20) return 'afternoon';
  return 'evening';
}

function getCurrentSeason() {
  const month = new Date().getMonth(); // 0-11
  if (month >= 2 && month <= 4) return 'spring';    // mar-may
  if (month >= 5 && month <= 7) return 'summer';    // jun-ago
  if (month >= 8 && month <= 10) return 'autumn';   // sep-nov
  return 'winter';                                  // dic-feb
}

// ── Gestión de temas ───────────────────────────────────────
function getTheme() {
  return getLocalStorage('otto_theme', 'claro-sobrio');
}

function setTheme(themeName) {
  document.documentElement.setAttribute('data-theme', themeName);
  setLocalStorage('otto_theme', themeName);
}

function initTheme() {
  const theme = getTheme();
  setTheme(theme);
}

// ── Llamadas a la API ──────────────────────────────────────
async function apiFetch(url, opts = {}) {
  const { data } = await AppState.sb.auth.getSession();
  const token = data?.session?.access_token;

  const headers = {
    'Content-Type': 'application/json',
    ...(opts.headers || {}),
  };

  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }

  let body = opts.body;
  if (body && typeof body === 'string') {
    try {
      const obj = JSON.parse(body);
      if (AppState.workspace) {
        obj.workspaceId = AppState.workspace.id;
      }
      body = JSON.stringify(obj);
    } catch {
      // Si no es JSON válido, dejarlo como está
    }
  }

  return fetch(url, { ...opts, headers, body });
}

// ── Gestión de secretos ────────────────────────────────────
async function postSecret(kind, label, value) {
  const r = await apiFetch('/api/secrets', {
    method: 'POST',
    body: JSON.stringify({ kind, label, value })
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'No se pudo guardar la clave');
  AppState.secretsInfo[d.id] = { kind: d.kind, key_hint: d.key_hint };
  return d;
}

async function deleteSecret(id) {
  if (!id) return;
  try {
    await apiFetch('/api/secrets', {
      method: 'DELETE',
      body: JSON.stringify({ id })
    });
    delete AppState.secretsInfo[id];
  } catch {
    // No crítico si falla
  }
}

// ── Gestión de workspaces ──────────────────────────────────
async function updateWorkspace(patch) {
  const { data, error } = await AppState.sb
    .from('workspaces')
    .update(patch)
    .eq('id', AppState.workspace.id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  Object.assign(AppState.workspace, data);
  return data;
}

async function selectWorkspace(workspaceId) {
  const ws = AppState.workspaces.find(w => w.id === workspaceId);
  if (!ws) {
    showToast('Perfil no encontrado', 'error');
    return;
  }

  AppState.workspace = ws;
  setLocalStorage('otto_workspace', workspaceId);

  // Actualizar UI
  renderWorkspaceSelect();

  // Disparar evento para que los módulos se actualicen
  window.dispatchEvent(new CustomEvent('workspace-changed', { detail: { workspace: ws } }));
}

function renderWorkspaceSelect() {
  const select = $('wsSelect');
  if (!select) return;

  select.innerHTML = AppState.workspaces
    .map(w => `<option value="${w.id}" ${AppState.workspace && w.id === AppState.workspace.id ? 'selected' : ''}>${esc(w.name)}</option>`)
    .join('');
}

// ── Autenticación ──────────────────────────────────────────
async function initAuth() {
  try {
    const cfg = await (await fetch('/api/config')).json();
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
      throw new Error('Falta configurar Supabase en el archivo .env');
    }

    if (!window.supabase) {
      throw new Error('No se pudo cargar Supabase (¿sin conexión?)');
    }

    AppState.sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

    const { data } = await AppState.sb.auth.getSession();
    if (data.session) {
      await onSignedIn(data.session.user);
    } else {
      showLoginScreen();
    }

    // Listener para cambios de autenticación
    AppState.sb.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        showLoginScreen();
      }
    });

  } catch (e) {
    showToast(e.message, 'error');
    showLoginScreen();
  }
}

function showLoginScreen() {
  const loginScreen = $('loginScreen');
  if (loginScreen) {
    loginScreen.classList.remove('hidden');
  }

  // Ocultar el resto de la app
  const appShell = $('appShell');
  if (appShell) {
    appShell.classList.add('hidden');
  }
}

async function onSignedIn(user) {
  AppState.user = user;

  // Ocultar login, mostrar app
  const loginScreen = $('loginScreen');
  if (loginScreen) loginScreen.classList.add('hidden');

  const appShell = $('appShell');
  if (appShell) appShell.classList.remove('hidden');

  // Cargar workspaces y secretos
  const [workspacesRes, secretsRes] = await Promise.all([
    AppState.sb.from('workspaces').select('*').order('created_at'),
    AppState.sb.from('secrets').select('id, kind, key_hint')
  ]);

  if (workspacesRes.error) {
    showToast('Error cargando perfiles: ' + workspacesRes.error.message, 'error');
    return;
  }

  AppState.workspaces = workspacesRes.data || [];
  AppState.secretsInfo = {};
  (secretsRes.data || []).forEach(r => {
    AppState.secretsInfo[r.id] = r;
  });

  // Si no hay workspaces, crear uno por defecto
  if (!AppState.workspaces.length) {
    const { data, error } = await AppState.sb
      .from('workspaces')
      .insert({ owner_id: user.id, name: 'Mi primer perfil' })
      .select()
      .single();

    if (error) {
      showToast('No se pudo crear el perfil: ' + error.message, 'error');
      return;
    }

    AppState.workspaces = [data];
  }

  // Seleccionar el último workspace usado o el primero
  const lastWorkspaceId = getLocalStorage('otto_workspace');
  const workspaceToSelect = AppState.workspaces.find(w => w.id === lastWorkspaceId) || AppState.workspaces[0];

  await selectWorkspace(workspaceToSelect.id);

  // Mostrar nombre de usuario
  const userBadge = $('userBadgeName');
  if (userBadge) {
    userBadge.textContent = '👤 ' + (user.email || '');
  }

  // Disparar evento de que el usuario está listo
  window.dispatchEvent(new CustomEvent('user-ready', { detail: { user } }));
}

async function logout() {
  if (!confirm(TEXTS.user.logoutConfirm)) return;

  await AppState.sb.auth.signOut();
  AppState.user = null;
  AppState.workspace = null;
  AppState.workspaces = [];

  // Limpiar contraseña del formulario
  const passInput = $('loginPass');
  if (passInput) passInput.value = '';

  showLoginScreen();
}

// ── Inicialización ─────────────────────────────────────────
async function initApp() {
  initTheme();
  await initAuth();
}

// Exportar al scope global
if (typeof window !== 'undefined') {
  window.AppState = AppState;
  window.AppCore = {
    $,
    $$,
    esc,
    showToast,
    getLocalStorage,
    setLocalStorage,
    formatDate,
    getTimeOfDay,
    getCurrentSeason,
    getTheme,
    setTheme,
    initTheme,
    apiFetch,
    postSecret,
    deleteSecret,
    updateWorkspace,
    selectWorkspace,
    logout,
    initApp,
  };
}
