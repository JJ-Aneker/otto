/* ============================================================
   Otto - Textos en español
   Todos los literales de la interfaz en un solo lugar
   ============================================================ */

const TEXTS = {
  // ── Aplicación general ─────────────────────────────────────
  app: {
    name: 'Otto',
    tagline: 'Tu asistente de contenidos',
  },

  // ── Módulos ────────────────────────────────────────────────
  modules: {
    home: 'Inicio',
    write: 'Otto escribe',
    watch: 'Otto vigila',
    count: 'Otto cuenta',
    order: 'Otto ordena',
    schedule: 'Otto agenda',
    settings: 'Ajustes',
  },

  // ── Pantalla de inicio ─────────────────────────────────────
  home: {
    greetingMorning: 'Buenos días',
    greetingAfternoon: 'Buenas tardes',
    greetingEvening: 'Buenas noches',
    summary: (count) => `Hoy ${count === 0 ? 'todo está en orden' : count === 1 ? 'hay una cosa que merece tu atención' : `hay ${count} cosas que merecen tu atención`}`,

    askOtto: 'Pídele algo a Otto',
    askOttoPlaceholder: 'Escribe un post sobre...',
    askOttoButton: '→',
    askOttoLearning: 'Aún aprendo; por ahora sé escribir posts. Escribe "post sobre..." o "escribe..."',

    proposalsTitle: 'Otto propone hoy',
    proposalsEmpty: 'Todo al día',
    proposalsEmptyDesc: 'No hay tareas pendientes por ahora',

    nextTopic: 'Siguiente tema',
    nextTopicButton: 'Escribirlo',
    nextTopicEmpty: 'Añade tu primer tema',
    nextTopicEmptyDesc: 'Ve a Otto escribe para crear temas en tu calendario',

    drafts: 'Borradores sin publicar',
    draftsButton: 'Continuar',
    draftsEmpty: 'Sin borradores',
    draftsEmptyDesc: 'Los posts escritos pero no publicados aparecerán aquí',

    seasonalTopic: 'Tema de temporada',
    seasonalTopicButton: 'Escribir',
    seasonalTopicSpring: 'Ideas frescas de primavera',
    seasonalTopicSummer: 'Contenido veraniego',
    seasonalTopicAutumn: 'Propuestas de otoño',
    seasonalTopicWinter: 'Inspiración invernal',

    pulseTitle: 'Pulso del negocio',
    pulsePostsMonth: 'Posts este mes',
    pulseDrafts: 'Borradores',
    pulseTokens: 'Tokens este mes',
    pulseVisits: 'Visitas',
    pulseInvoices: 'Facturas',
    pulseAppointments: 'Citas',
    pulseConnectModule: (moduleName) => `Conecta ${moduleName}`,
  },

  // ── Pantalla Otto escribe ──────────────────────────────────
  write: {
    calendar: 'Calendario',
    history: 'Historial',
    usage: 'Consumo',

    generate: 'Generar',
    generating: 'Generando…',
    publish: 'Publicar en WordPress',
    publishing: 'Publicando…',
    copy: 'Copiar',

    emptyCalendar: 'Sin temas todavía',
    emptyHistory: 'Sin posts todavía',
    emptyUsage: 'Sin consumo todavía',
  },

  // ── Login ──────────────────────────────────────────────────
  login: {
    title: 'Accede a tu cuenta',
    titleSignup: 'Crea tu cuenta',
    email: 'Email',
    password: 'Contraseña',
    buttonLogin: 'Entrar',
    buttonSignup: 'Crear cuenta',
    buttonLoading: 'Un momento…',
    toggleSignup: '¿No tienes cuenta? Crear una',
    toggleLogin: 'Ya tengo cuenta · Entrar',
    errorInvalidLogin: 'Email o contraseña incorrectos',
    successSignup: 'Cuenta creada. Revisa tu email para confirmarla y después entra.',
  },

  // ── Usuario ────────────────────────────────────────────────
  user: {
    profile: 'Perfil',
    workspace: 'Perfil',
    newWorkspace: '+ Nuevo perfil',
    logout: 'Cerrar sesión',
    logoutConfirm: '¿Cerrar sesión?',
    theme: 'Tema',
    themeLight: 'Claro sobrio',
    themeDark: 'Oscuro',
    themeWarm: 'Cálido',
  },

  // ── Ajustes ────────────────────────────────────────────────
  settings: {
    profile: 'Perfil',
    wordpress: 'WordPress',
    instagram: 'Instagram',
    provider: 'Proveedor de IA',

    knowledge: 'Conocimiento del negocio',
    tone: 'Tono de escritura',
    language: 'Idioma de los posts',

    save: 'Guardar',
    saving: 'Guardando…',
    saved: 'Guardado',
  },

  // ── Estados y mensajes ─────────────────────────────────────
  common: {
    loading: 'Cargando…',
    error: 'Error',
    success: 'Hecho',
    cancel: 'Cancelar',
    continue: 'Continuar',
    back: 'Volver',
    next: 'Siguiente',
    done: 'Hecho',
    comingSoon: 'Próximamente',
    new: 'Nuevo',
    edit: 'Editar',
    delete: 'Eliminar',
    confirm: 'Confirmar',
  },

  // ── Estaciones ─────────────────────────────────────────────
  seasons: {
    spring: 'primavera',
    summer: 'verano',
    autumn: 'otoño',
    winter: 'invierno',
  },
};

// Exportar para usar en otros archivos
if (typeof window !== 'undefined') {
  window.TEXTS = TEXTS;
}
