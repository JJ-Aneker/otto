/* ============================================================
   Otto - Shell de la aplicación
   Menú lateral/inferior, routing y navegación
   ============================================================ */

const { $, $$, esc, getLocalStorage, setLocalStorage, setTheme, logout } = window.AppCore;
const { TEXTS } = window;
const { AppState } = window;

// ── Definición de módulos ──────────────────────────────────
const MODULES = [
  { id: 'home', name: TEXTS.modules.home, icon: '🏠', enabled: true },
  { id: 'write', name: TEXTS.modules.write, icon: '✍️', enabled: true },
  { id: 'watch', name: TEXTS.modules.watch, icon: '👁️', enabled: false },
  { id: 'count', name: TEXTS.modules.count, icon: '📊', enabled: false },
  { id: 'order', name: TEXTS.modules.order, icon: '📋', enabled: false },
  { id: 'schedule', name: TEXTS.modules.schedule, icon: '📅', enabled: false },
];

// ── Routing ────────────────────────────────────────────────
function getCurrentRoute() {
  const hash = window.location.hash.slice(1) || '/inicio';
  return hash.replace(/^\//, '');
}

function navigate(moduleId) {
  window.location.hash = `#/${moduleId}`;
}

function handleRouteChange() {
  const route = getCurrentRoute();

  // Mapear rutas a IDs de página
  let pageId;
  if (route === 'inicio') {
    pageId = 'home';
  } else if (route === 'escribe') {
    pageId = 'write';
  } else {
    // Para otros módulos, usar el ID tal cual
    pageId = route;
  }

  showPage(pageId);
}

function showPage(pageId) {
  // Ocultar todas las páginas
  $$('.page').forEach(page => page.classList.remove('active'));

  // Mostrar la página solicitada
  const page = $(`page-${pageId}`);
  if (page) {
    page.classList.add('active');
  } else {
    // Si no existe, mostrar inicio
    const homePage = $('page-home');
    if (homePage) homePage.classList.add('active');
  }

  // Actualizar menú activo
  $$('.nav-item').forEach(item => {
    const itemPageId = item.getAttribute('data-page');
    if (itemPageId === pageId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Actualizar barra inferior (móvil)
  $$('.bottombar-item').forEach(item => {
    const itemPageId = item.getAttribute('data-page');
    if (itemPageId === pageId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  AppState.currentModule = pageId;

  // Disparar evento de cambio de página
  window.dispatchEvent(new CustomEvent('page-changed', { detail: { pageId } }));
}

// ── Renderizado del menú ───────────────────────────────────
function renderSidebar() {
  const sidebar = $('appSidebar');
  if (!sidebar) return;

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <h1 class="sidebar-logo">${TEXTS.app.name}</h1>
      <p class="sidebar-tagline">${TEXTS.app.tagline}</p>
    </div>

    <nav class="sidebar-nav">
      ${MODULES.map(mod => `
        <button
          class="nav-item ${mod.enabled ? '' : 'disabled'}"
          data-page="${mod.id}"
          onclick="AppShell.onNavClick('${mod.id}')"
          ${mod.enabled ? '' : 'disabled'}
        >
          <span class="nav-icon">${mod.icon}</span>
          <span class="nav-label">${mod.name}</span>
          ${!mod.enabled ? `<span class="nav-badge">${TEXTS.common.comingSoon}</span>` : ''}
        </button>
      `).join('')}
    </nav>

    <div class="sidebar-footer">
      <select id="wsSelect" class="workspace-select" onchange="AppCore.selectWorkspace(this.value)">
        <!-- Se llena desde app-core.js -->
      </select>

      <div class="user-menu">
        <button class="user-menu-toggle" onclick="AppShell.toggleUserMenu()">
          <span id="userBadgeName">👤 Usuario</span>
        </button>
        <div class="user-menu-dropdown hidden" id="userMenuDropdown">
          <div class="user-menu-item">
            <label for="themeSelect" class="user-menu-label">${TEXTS.user.theme}</label>
            <select id="themeSelect" class="theme-select" onchange="AppShell.onThemeChange(this.value)">
              <option value="claro-sobrio">${TEXTS.user.themeLight}</option>
              <option value="oscuro">${TEXTS.user.themeDark}</option>
              <option value="calido">${TEXTS.user.themeWarm}</option>
            </select>
          </div>
          <button class="user-menu-item user-menu-button" onclick="AppCore.logout()">
            ${TEXTS.user.logout}
          </button>
        </div>
      </div>
    </div>
  `;

  // Actualizar el selector de tema con el valor actual
  const themeSelect = $('themeSelect');
  if (themeSelect) {
    themeSelect.value = AppCore.getTheme();
  }
}

function renderBottombar() {
  const bottombar = $('appBottombar');
  if (!bottombar) return;

  // En móvil: solo los 3 primeros módulos habilitados + menú de más opciones
  const mainModules = MODULES.filter(m => m.enabled).slice(0, 3);

  bottombar.innerHTML = `
    ${mainModules.map(mod => `
      <button
        class="bottombar-item"
        data-page="${mod.id}"
        onclick="AppShell.onNavClick('${mod.id}')"
      >
        <span class="bottombar-icon">${mod.icon}</span>
        <span class="bottombar-label">${mod.name}</span>
      </button>
    `).join('')}

    <button class="bottombar-item" onclick="AppShell.toggleMobileMenu()">
      <span class="bottombar-icon">•••</span>
      <span class="bottombar-label">${TEXTS.user.profile}</span>
    </button>
  `;
}

// ── Interacciones ──────────────────────────────────────────
function onNavClick(moduleId) {
  const module = MODULES.find(m => m.id === moduleId);
  if (!module || !module.enabled) return;

  navigate(moduleId === 'home' ? 'inicio' : moduleId === 'write' ? 'escribe' : moduleId);
}

function toggleUserMenu() {
  const dropdown = $('userMenuDropdown');
  if (dropdown) {
    dropdown.classList.toggle('hidden');
  }
}

function toggleMobileMenu() {
  // TODO: implementar menú móvil completo
  toggleUserMenu();
}

function onThemeChange(themeName) {
  setTheme(themeName);
}

// ── Inicialización ─────────────────────────────────────────
function init() {
  renderSidebar();
  renderBottombar();

  // Listener para cambios de hash
  window.addEventListener('hashchange', handleRouteChange);

  // Cargar ruta inicial
  handleRouteChange();

  // Cerrar dropdown al hacer click fuera
  document.addEventListener('click', (e) => {
    const userMenu = e.target.closest('.user-menu');
    const dropdown = $('userMenuDropdown');

    if (!userMenu && dropdown && !dropdown.classList.contains('hidden')) {
      dropdown.classList.add('hidden');
    }
  });
}

// Inicializar cuando el usuario esté listo
window.addEventListener('user-ready', init);

// Exportar funciones públicas
if (typeof window !== 'undefined') {
  window.AppShell = {
    navigate,
    showPage,
    onNavClick,
    toggleUserMenu,
    toggleMobileMenu,
    onThemeChange,
  };
}
