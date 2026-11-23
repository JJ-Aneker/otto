/* ============================================================
   Otto - Pantalla de inicio
   Saludo, barra de búsqueda, propuestas y pulso del negocio
   ============================================================ */

const { $, esc, formatDate, getTimeOfDay, getCurrentSeason, apiFetch } = window.AppCore;
const { TEXTS } = window;
const { AppState } = window;

// ── Estado de la pantalla ──────────────────────────────────
let homeData = {
  topics: [],
  drafts: [],
  usageMonth: 0,
  postsMonth: 0,
};

// ── Renderizado de bloques ─────────────────────────────────
function renderGreeting() {
  const container = $('homeGreeting');
  if (!container) return;

  const timeOfDay = getTimeOfDay();
  const greeting = TEXTS.home[`greeting${timeOfDay.charAt(0).toUpperCase() + timeOfDay.slice(1)}`];
  const name = AppState.workspace?.name || '';

  const pendingCount = homeData.topics.filter(t => !t.done).length + homeData.drafts.length;
  const summary = TEXTS.home.summary(pendingCount);

  container.innerHTML = `
    <h2 class="greeting-title">${greeting}, ${esc(name)}</h2>
    <p class="greeting-summary">${summary}</p>
  `;
}

function renderAskOtto() {
  const container = $('homeAskOtto');
  if (!container) return;

  container.innerHTML = `
    <div class="ask-otto-bar">
      <input
        type="text"
        id="askOttoInput"
        class="ask-otto-input"
        placeholder="${TEXTS.home.askOttoPlaceholder}"
        onkeypress="if(event.key==='Enter') Home.onAskOtto()"
      />
      <button class="ask-otto-button" onclick="Home.onAskOtto()">
        ${TEXTS.home.askOttoButton}
      </button>
    </div>
    <p class="ask-otto-hint hidden" id="askOttoHint"></p>
  `;
}

function renderProposals() {
  const container = $('homeProposals');
  if (!container) return;

  const nextTopic = homeData.topics.find(t => !t.done);
  const draft = homeData.drafts[0];
  const season = getCurrentSeason();

  const cards = [];

  // 1. Siguiente tema pendiente
  if (nextTopic) {
    cards.push(`
      <div class="proposal-card">
        <div class="proposal-icon">📝</div>
        <div class="proposal-content">
          <h3 class="proposal-title">${TEXTS.home.nextTopic}</h3>
          <p class="proposal-desc">${esc(nextTopic.name)}</p>
        </div>
        <button class="proposal-button" onclick="Home.onWriteTopic('${nextTopic.id}')">
          ${TEXTS.home.nextTopicButton}
        </button>
      </div>
    `);
  } else {
    cards.push(`
      <div class="proposal-card proposal-card-empty">
        <div class="proposal-icon">✨</div>
        <div class="proposal-content">
          <h3 class="proposal-title">${TEXTS.home.nextTopicEmpty}</h3>
          <p class="proposal-desc">${TEXTS.home.nextTopicEmptyDesc}</p>
        </div>
      </div>
    `);
  }

  // 2. Borradores sin publicar
  if (draft) {
    const draftCount = homeData.drafts.length;
    cards.push(`
      <div class="proposal-card">
        <div class="proposal-icon">📄</div>
        <div class="proposal-content">
          <h3 class="proposal-title">${TEXTS.home.drafts}</h3>
          <p class="proposal-desc">${draftCount} ${draftCount === 1 ? 'borrador' : 'borradores'}</p>
        </div>
        <button class="proposal-button" onclick="Home.onContinueDraft('${draft.id}')">
          ${TEXTS.home.draftsButton}
        </button>
      </div>
    `);
  } else {
    cards.push(`
      <div class="proposal-card proposal-card-empty">
        <div class="proposal-icon">✅</div>
        <div class="proposal-content">
          <h3 class="proposal-title">${TEXTS.home.draftsEmpty}</h3>
          <p class="proposal-desc">${TEXTS.home.draftsEmptyDesc}</p>
        </div>
      </div>
    `);
  }

  // 3. Tema de temporada
  const seasonalTopic = TEXTS.home[`seasonalTopic${season.charAt(0).toUpperCase() + season.slice(1)}`];
  cards.push(`
    <div class="proposal-card">
      <div class="proposal-icon">${getSeasonIcon(season)}</div>
      <div class="proposal-content">
        <h3 class="proposal-title">${TEXTS.home.seasonalTopic}</h3>
        <p class="proposal-desc">${seasonalTopic}</p>
      </div>
      <button class="proposal-button" onclick="Home.onSeasonalTopic()">
        ${TEXTS.home.seasonalTopicButton}
      </button>
    </div>
  `);

  container.innerHTML = `
    <h2 class="section-title">${TEXTS.home.proposalsTitle}</h2>
    <div class="proposals-grid">
      ${cards.join('')}
    </div>
  `;
}

function renderPulse() {
  const container = $('homePulse');
  if (!container) return;

  const metrics = [
    {
      label: TEXTS.home.pulsePostsMonth,
      value: homeData.postsMonth,
      enabled: true
    },
    {
      label: TEXTS.home.pulseDrafts,
      value: homeData.drafts.length,
      enabled: true
    },
    {
      label: TEXTS.home.pulseTokens,
      value: formatNumber(homeData.usageMonth),
      enabled: true
    },
    {
      label: TEXTS.home.pulseVisits,
      value: '—',
      enabled: false,
      hint: TEXTS.home.pulseConnectModule(TEXTS.modules.watch)
    },
    {
      label: TEXTS.home.pulseInvoices,
      value: '—',
      enabled: false,
      hint: TEXTS.home.pulseConnectModule(TEXTS.modules.count)
    },
    {
      label: TEXTS.home.pulseAppointments,
      value: '—',
      enabled: false,
      hint: TEXTS.home.pulseConnectModule(TEXTS.modules.schedule)
    },
  ];

  container.innerHTML = `
    <h2 class="section-title">${TEXTS.home.pulseTitle}</h2>
    <div class="pulse-grid">
      ${metrics.map(m => `
        <div class="pulse-card ${m.enabled ? '' : 'pulse-card-disabled'}">
          <div class="pulse-value">${m.value}</div>
          <div class="pulse-label">${m.label}</div>
          ${!m.enabled && m.hint ? `<div class="pulse-hint">${m.hint}</div>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

// ── Acciones ───────────────────────────────────────────────
function onAskOtto() {
  const input = $('askOttoInput');
  const hint = $('askOttoHint');
  if (!input || !hint) return;

  const query = input.value.trim().toLowerCase();
  if (!query) return;

  // Detectar intención: si empieza con "escribe", "post", "blog"
  const writeKeywords = ['escribe', 'escrib', 'post', 'blog', 'artículo', 'articulo'];
  const isWriteIntent = writeKeywords.some(kw => query.startsWith(kw));

  if (isWriteIntent) {
    // Ir a Otto escribe con el tema precargado
    const topic = query.replace(/^(escribe|escrib|post|blog|artículo|articulo)\s*(sobre|un|una)?\s*/i, '');
    window.AppShell.navigate('escribe');

    // TODO: pasar el tema al módulo de escritura
    // Por ahora solo navegar
    input.value = '';
    hint.classList.add('hidden');
  } else {
    // Mostrar mensaje de que aún no sabe hacer eso
    hint.textContent = TEXTS.home.askOttoLearning;
    hint.classList.remove('hidden');

    setTimeout(() => {
      hint.classList.add('hidden');
    }, 5000);
  }
}

function onWriteTopic(topicId) {
  // TODO: ir a Otto escribe con el tema seleccionado
  window.AppShell.navigate('escribe');
}

function onContinueDraft(draftId) {
  // TODO: ir a Otto escribe con el borrador seleccionado
  window.AppShell.navigate('escribe');
}

function onSeasonalTopic() {
  // TODO: ir a Otto escribe con tema de temporada
  window.AppShell.navigate('escribe');
}

// ── Carga de datos ─────────────────────────────────────────
async function loadData() {
  if (!AppState.workspace) return;

  try {
    // Cargar topics
    const topicsRes = await AppState.sb
      .from('topics')
      .select('*')
      .eq('workspace_id', AppState.workspace.id)
      .order('created_at', { ascending: false });

    homeData.topics = topicsRes.data || [];

    // Cargar borradores (posts con status=draft)
    const draftsRes = await AppState.sb
      .from('posts')
      .select('*')
      .eq('workspace_id', AppState.workspace.id)
      .eq('status', 'draft')
      .order('created_at', { ascending: false });

    homeData.drafts = draftsRes.data || [];

    // Cargar consumo del mes
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const usageRes = await AppState.sb
      .from('usage_log')
      .select('tokens_in, tokens_out')
      .eq('workspace_id', AppState.workspace.id)
      .gte('created_at', monthStart);

    homeData.usageMonth = (usageRes.data || []).reduce((sum, row) =>
      sum + (row.tokens_in || 0) + (row.tokens_out || 0), 0
    );

    // Contar posts del mes
    const postsRes = await AppState.sb
      .from('posts')
      .select('id', { count: 'exact' })
      .eq('workspace_id', AppState.workspace.id)
      .gte('created_at', monthStart);

    homeData.postsMonth = postsRes.count || 0;

  } catch (e) {
    console.error('Error cargando datos de inicio:', e);
  }
}

async function refresh() {
  await loadData();
  renderGreeting();
  renderAskOtto();
  renderProposals();
  renderPulse();
}

// ── Utilidades ─────────────────────────────────────────────
function getSeasonIcon(season) {
  const icons = {
    spring: '🌸',
    summer: '☀️',
    autumn: '🍂',
    winter: '❄️',
  };
  return icons[season] || '📅';
}

function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// ── Inicialización ─────────────────────────────────────────
window.addEventListener('page-changed', (e) => {
  if (e.detail.pageId === 'home') {
    refresh();
  }
});

window.addEventListener('workspace-changed', () => {
  if (AppState.currentModule === 'home') {
    refresh();
  }
});

// Exportar funciones públicas
if (typeof window !== 'undefined') {
  window.Home = {
    refresh,
    onAskOtto,
    onWriteTopic,
    onContinueDraft,
    onSeasonalTopic,
  };
}
