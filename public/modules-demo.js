/* ============================================================
   Otto · herramientas de ejemplo (Vigila, Cuenta, Ordena, Agenda)
   Aún no existen: estos datos son inventados y sirven para ver
   cómo se verán en Inicio y en su propia pantalla.
   Cuando una herramienta sea real, se borra su bloque de aquí y
   se registra la de verdad con OttoHome.register({...}).
   ============================================================ */
(function () {
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const DEMO = {
    count: {
      name: 'Cuenta',
      intro: 'Tus visitas y estadísticas en un vistazo.',
      figures: [
        { label: 'Visitas del mes', value: '1.248', delta: '+12 %' },
        { label: 'Páginas vistas', value: '3.906', delta: '+8 %' },
        { label: 'Tiempo medio en la web', value: '2 min 14 s' },
        { label: 'De dónde llegan', value: 'Google 62 %' },
      ],
      items: [
        { tone: 'accent', title: 'Tu entrada sobre comuniones es la más leída esta semana', meta: '84 visitas · Un 31 % más que la semana pasada', when: 'Esta semana', label: 'Ver detalle' },
        { tone: 'muted', title: 'Las visitas desde Instagram bajan un 18 %', meta: 'Quizá toque compartir un post nuevo en tus stories', when: 'Esta semana', label: 'Ver detalle' },
        { tone: 'muted', title: 'Mejor día para publicar: martes por la mañana', meta: 'Según las visitas de los últimos tres meses', when: 'Último trimestre', label: 'Ver detalle' },
      ],
      today: [0],
    },
    order: {
      name: 'Ordena',
      intro: 'Sube facturas y tickets y Otto los ordena por ti.',
      figures: [
        { label: 'Documentos del mes', value: '14' },
        { label: 'Por revisar', value: '3' },
        { label: 'Gastos del mes', value: '1.286,40 €' },
        { label: 'Ingresos del mes', value: '2.940,00 €' },
      ],
      items: [
        { tone: 'warn', title: 'Factura de Laboratorio Foto Print sin categoría', meta: '218,90 € · Otto propone «Impresión y álbumes»', when: 'Hoy', label: 'Revisar' },
        { tone: 'muted', title: 'Ticket de material de estudio', meta: '42,30 € · Pendiente de confirmar el importe', when: 'Ayer', label: 'Revisar' },
        { tone: 'muted', title: 'Factura de hosting de paquisirvent.com', meta: '96,00 € · Ordenada en «Web y herramientas»', when: 'Hace 4 días', label: 'Abrir' },
        { tone: 'muted', title: 'Factura emitida a Familia Ortega', meta: '350,00 € · Cobrada · Sesión de comunión', when: 'Hace 6 días', label: 'Abrir' },
      ],
      today: [0, 1],
    },
    schedule: {
      name: 'Agenda',
      intro: 'Citas y reservas conectadas a tu calendario.',
      figures: [
        { label: 'Citas esta semana', value: '4' },
        { label: 'Reservas por confirmar', value: '1' },
        { label: 'Próxima cita', value: 'Mañana 10:30' },
        { label: 'Huecos libres', value: '6' },
      ],
      items: [
        { tone: 'accent', title: 'Sesión newborn con Lucía G.', meta: 'Estudio · 2 horas · Confirmada', when: 'Mañana 10:30', label: 'Abrir' },
        { tone: 'warn', title: 'Reserva sin confirmar: sesión de familia', meta: 'Familia Martín · Pidió el sábado por la tarde', when: 'Pendiente', label: 'Confirmar' },
        { tone: 'muted', title: 'Sesión de comunión con Familia Ortega', meta: 'Exterior · Parque del Retiro · Confirmada', when: 'Sábado 12:00', label: 'Abrir' },
        { tone: 'muted', title: 'Entrega de álbum a Marta R.', meta: 'Estudio · 30 minutos', when: 'Viernes 17:00', label: 'Abrir' },
      ],
      today: [0, 1],
    },
  };

  /* Registro en Inicio */
  Object.keys(DEMO).forEach(id => {
    const d = DEMO[id];
    OttoHome.register({
      id, name: d.name, demo: true,
      tasks() { return d.today.map(i => ({ ...d.items[i], demo: true, run() { showPage(id); } })); },
      figures() { return d.figures; },
    });
  });

  /* Pantalla de cada herramienta */
  function renderPage(id) {
    const d = DEMO[id], host = document.getElementById('mod-' + id);
    if (!host || !d) return;
    const sub = document.querySelector('#page-' + id + ' .page-sub'); if (sub) sub.textContent = d.intro;
    host.innerHTML = `
      <div class="callout-info">Ejemplo con datos inventados. Así se verá Otto ${e(d.name.toLowerCase())} cuando esté activo.</div>
      <dl class="figs figs-row">${d.figures.map(f => `<div><dt>${e(f.label)}</dt><dd>${e(f.value)}${f.delta ? ` <small class="${f.delta.startsWith('-') ? 'down' : 'up'}">${e(f.delta)}</small>` : ''}</dd></div>`).join('')}</dl>
      <div class="grp">Registros de ejemplo</div>
      <ul class="rows">${d.items.map(t => `
        <li class="row"><span class="dot dot-${t.tone}" aria-hidden="true"></span>
          <div class="row-main"><div class="row-title">${e(t.title)}</div><div class="row-meta">${e(t.meta)}</div></div>
          <div class="row-side"><span class="row-when">${e(t.when)}</span><button type="button" class="btn btn-secondary" disabled title="Disponible cuando la herramienta esté activa">${e(t.label)}</button></div>
        </li>`).join('')}</ul>`;
  }
  const baseShow = showPage;
  showPage = function (pageId) {
    baseShow.apply(this, arguments);
    if (DEMO[pageId]) renderPage(pageId);
  };
  Object.keys(DEMO).forEach(renderPage);
})();
