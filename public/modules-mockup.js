/* ============================================================
   Otto - Bocetos interactivos de módulos
   Mock data y funcionalidad básica para probar
   ============================================================ */

// Renderizar módulo Otto vigila
function renderWatchModule() {
  const page = document.getElementById('page-watch');
  if (!page) return;

  page.innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:24px;font-weight:400;margin-bottom:24px">👁️ Otto vigila</h2>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:16px;margin-bottom:32px">
      <div class="pulse-card">
        <div style="font-size:14px;color:var(--color-text-muted);margin-bottom:8px">Estado</div>
        <div style="font-size:24px;font-weight:600;color:var(--color-success)">✓ Activo</div>
        <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px">Última revisión: hace 2 min</div>
      </div>
      <div class="pulse-card">
        <div style="font-size:14px;color:var(--color-text-muted);margin-bottom:8px">Tiempo de carga</div>
        <div style="font-size:24px;font-weight:600;color:var(--color-accent)">1.2s</div>
        <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px">Promedio últimas 24h</div>
      </div>
      <div class="pulse-card">
        <div style="font-size:14px;color:var(--color-text-muted);margin-bottom:8px">Visitas hoy</div>
        <div style="font-size:24px;font-weight:600;color:var(--color-accent)">247</div>
        <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px">+12% vs ayer</div>
      </div>
      <div class="pulse-card">
        <div style="font-size:14px;color:var(--color-text-muted);margin-bottom:8px">Uptime 30 días</div>
        <div style="font-size:24px;font-weight:600;color:var(--color-success)">99.8%</div>
        <div style="font-size:12px;color:var(--color-text-muted);margin-top:4px">Excelente</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px">
      <div class="card-header"><h2>Tráfico últimos 7 días</h2><p>Visitas diarias</p></div>
      <div class="card-body">
        <div style="display:flex;align-items:flex-end;gap:12px;height:200px;padding:20px 0">
          <div style="flex:1;background:var(--color-accent);opacity:0.7;height:45%;border-radius:4px 4px 0 0"></div>
          <div style="flex:1;background:var(--color-accent);opacity:0.75;height:52%;border-radius:4px 4px 0 0"></div>
          <div style="flex:1;background:var(--color-accent);opacity:0.8;height:68%;border-radius:4px 4px 0 0"></div>
          <div style="flex:1;background:var(--color-accent);opacity:0.7;height:49%;border-radius:4px 4px 0 0"></div>
          <div style="flex:1;background:var(--color-accent);opacity:0.9;height:85%;border-radius:4px 4px 0 0"></div>
          <div style="flex:1;background:var(--color-accent);opacity:0.65;height:38%;border-radius:4px 4px 0 0"></div>
          <div style="flex:1;background:var(--color-accent);height:58%;border-radius:4px 4px 0 0"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:var(--color-text-muted);padding-top:8px">
          <span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Hoy</span>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h2>Páginas más vistas (últimos 7 días)</h2></div>
      <div class="card-body" style="padding:0">
        <div style="padding:16px;border-bottom:1px solid var(--color-border)">
          <div style="font-size:13px;font-weight:500">/sesiones-newborn</div>
          <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">842 visitas</div>
        </div>
        <div style="padding:16px;border-bottom:1px solid var(--color-border)">
          <div style="font-size:13px;font-weight:500">/embarazo</div>
          <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">612 visitas</div>
        </div>
        <div style="padding:16px">
          <div style="font-size:13px;font-weight:500">/tarifas</div>
          <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">387 visitas</div>
        </div>
      </div>
    </div>
  `;
}

// Renderizar módulo Otto cuenta
function renderCountModule() {
  const page = document.getElementById('page-count');
  if (!page) return;

  page.innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:24px;font-weight:400;margin-bottom:24px">📊 Otto cuenta</h2>

    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:16px;margin-bottom:32px">
      <div class="pulse-card">
        <div style="font-size:14px;color:var(--color-text-muted);margin-bottom:8px">Ingresos este mes</div>
        <div style="font-size:24px;font-weight:600;color:var(--color-success)">2.450€</div>
      </div>
      <div class="pulse-card">
        <div style="font-size:14px;color:var(--color-text-muted);margin-bottom:8px">Gastos este mes</div>
        <div style="font-size:24px;font-weight:600;color:var(--color-danger)">385€</div>
      </div>
      <div class="pulse-card">
        <div style="font-size:14px;color:var(--color-text-muted);margin-bottom:8px">Pendiente de cobro</div>
        <div style="font-size:24px;font-weight:600;color:var(--color-warning)">650€</div>
      </div>
    </div>

    <div class="card" style="margin-bottom:24px">
      <div class="card-header">
        <h2>Registros recientes</h2>
        <button class="btn btn-primary" style="font-size:12px;padding:6px 14px" onclick="alert('Función en desarrollo')">+ Añadir</button>
      </div>
      <div class="card-body" style="padding:0">
        <div style="padding:16px;border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:16px">
          <div style="font-size:24px">📸</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:500">Material fotográfico</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">12 Nov 2026 · Gasto</div>
          </div>
          <div style="font-size:16px;font-weight:600;color:var(--color-danger)">-125€</div>
        </div>
        <div style="padding:16px;border-bottom:1px solid var(--color-border);display:flex;align-items:center;gap:16px">
          <div style="font-size:24px">💰</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:500">Sesión newborn familia García</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">10 Nov 2026 · Ingreso</div>
          </div>
          <div style="font-size:16px;font-weight:600;color:var(--color-success)">+350€</div>
        </div>
        <div style="padding:16px;display:flex;align-items:center;gap:16px">
          <div style="font-size:24px">📱</div>
          <div style="flex:1">
            <div style="font-size:13px;font-weight:500">Suscripción Lightroom</div>
            <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">1 Nov 2026 · Gasto</div>
          </div>
          <div style="font-size:16px;font-weight:600;color:var(--color-danger)">-12€</div>
        </div>
      </div>
    </div>

    <div class="card" style="background:var(--color-bg-alt)">
      <div class="card-body" style="text-align:center">
        <div style="font-size:48px;margin-bottom:16px">📸</div>
        <p style="font-size:14px;margin-bottom:16px">Escanea tickets con tu móvil</p>
        <button class="btn btn-primary" onclick="alert('Función en desarrollo: escaneará tickets automáticamente')">Subir foto de ticket</button>
      </div>
    </div>
  `;
}

// Renderizar módulo Otto ordena
function renderOrderModule() {
  const page = document.getElementById('page-order');
  if (!page) return;

  page.innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:24px;font-weight:400;margin-bottom:24px">📋 Otto ordena</h2>

    <div class="card" style="margin-bottom:24px">
      <div class="card-header">
        <h2>Proyectos activos</h2>
        <button class="btn btn-primary" style="font-size:12px;padding:6px 14px" onclick="alert('Función en desarrollo')">+ Nuevo proyecto</button>
      </div>
      <div class="card-body" style="padding:0">
        <div style="padding:20px;border-bottom:1px solid var(--color-border)">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            <div style="font-size:16px;font-weight:600;flex:1">Sesión embarazo - Ana López</div>
            <span style="background:var(--color-warning-bg);color:var(--color-warning);padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">En proceso</span>
          </div>
          <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:12px">Entrega: 25 Nov 2026</p>
          <div style="display:flex;gap:8px">
            <span style="background:var(--color-bg);padding:4px 8px;border-radius:6px;font-size:11px">✓ Sesión realizada</span>
            <span style="background:var(--color-bg);padding:4px 8px;border-radius:6px;font-size:11px">⏳ Edición</span>
            <span style="background:var(--color-bg);padding:4px 8px;border-radius:6px;font-size:11px;opacity:0.5">◯ Entrega</span>
          </div>
        </div>

        <div style="padding:20px;border-bottom:1px solid var(--color-border)">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            <div style="font-size:16px;font-weight:600;flex:1">Comunión - Familia Martínez</div>
            <span style="background:var(--color-success-bg);color:var(--color-success);padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">Completado</span>
          </div>
          <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:12px">Entregado: 15 Nov 2026</p>
          <div style="display:flex;gap:8px">
            <span style="background:var(--color-success-bg);color:var(--color-success);padding:4px 8px;border-radius:6px;font-size:11px">✓ Completado</span>
          </div>
        </div>

        <div style="padding:20px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px">
            <div style="font-size:16px;font-weight:600;flex:1">Newborn - Bebé Sánchez</div>
            <span style="background:var(--color-accent-light);color:var(--color-accent);padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">Próxima</span>
          </div>
          <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:12px">Fecha sesión: 28 Nov 2026</p>
          <div style="display:flex;gap:8px">
            <span style="background:var(--color-bg);padding:4px 8px;border-radius:6px;font-size:11px;opacity:0.5">◯ Pendiente</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-header"><h2>Tareas pendientes</h2></div>
      <div class="card-body">
        <div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--color-border)">
          <input type="checkbox" style="cursor:pointer">
          <div style="flex:1">Editar fotos sesión Ana López</div>
          <span style="font-size:11px;color:var(--color-text-muted)">Hoy</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:12px;border-bottom:1px solid var(--color-border)">
          <input type="checkbox" style="cursor:pointer">
          <div style="flex:1">Enviar galería online Familia Martínez</div>
          <span style="font-size:11px;color:var(--color-text-muted)">Mañana</span>
        </div>
        <div style="display:flex;align-items:center;gap:12px;padding:12px">
          <input type="checkbox" style="cursor:pointer">
          <div style="flex:1">Preparar equipo para sesión newborn</div>
          <span style="font-size:11px;color:var(--color-text-muted)">27 Nov</span>
        </div>
      </div>
    </div>
  `;
}

// Renderizar módulo Otto agenda
function renderScheduleModule() {
  const page = document.getElementById('page-schedule');
  if (!page) return;

  page.innerHTML = `
    <h2 style="font-family:var(--font-display);font-size:24px;font-weight:400;margin-bottom:24px">📅 Otto agenda</h2>

    <div class="card" style="margin-bottom:24px">
      <div class="card-header">
        <h2>Esta semana</h2>
        <button class="btn btn-primary" style="font-size:12px;padding:6px 14px" onclick="alert('Función en desarrollo')">+ Nueva cita</button>
      </div>
      <div class="card-body" style="padding:0">
        <div style="padding:20px;border-bottom:1px solid var(--color-border)">
          <div style="display:flex;align-items:center;gap:16px">
            <div style="text-align:center;min-width:60px">
              <div style="font-size:11px;color:var(--color-text-muted)">LUN</div>
              <div style="font-size:24px;font-weight:600">25</div>
            </div>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:600;margin-bottom:4px">Sesión embarazo - María García</div>
              <div style="font-size:12px;color:var(--color-text-muted)">10:00 - 11:30 · Estudio</div>
            </div>
            <span style="background:var(--color-accent-light);color:var(--color-accent);padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">Confirmada</span>
          </div>
        </div>

        <div style="padding:20px;border-bottom:1px solid var(--color-border)">
          <div style="display:flex;align-items:center;gap:16px">
            <div style="text-align:center;min-width:60px">
              <div style="font-size:11px;color:var(--color-text-muted)">MIÉ</div>
              <div style="font-size:24px;font-weight:600">27</div>
            </div>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:600;margin-bottom:4px">Entrega álbum - Familia López</div>
              <div style="font-size:12px;color:var(--color-text-muted)">16:00 - 16:30 · Estudio</div>
            </div>
            <span style="background:var(--color-accent-light);color:var(--color-accent);padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">Confirmada</span>
          </div>
        </div>

        <div style="padding:20px">
          <div style="display:flex;align-items:center;gap:16px">
            <div style="text-align:center;min-width:60px">
              <div style="font-size:11px;color:var(--color-text-muted)">VIE</div>
              <div style="font-size:24px;font-weight:600">29</div>
            </div>
            <div style="flex:1">
              <div style="font-size:14px;font-weight:600;margin-bottom:4px">Sesión newborn - Bebé Martínez</div>
              <div style="font-size:12px;color:var(--color-text-muted)">11:00 - 13:00 · Domicilio</div>
            </div>
            <span style="background:var(--color-warning-bg);color:var(--color-warning);padding:4px 10px;border-radius:12px;font-size:11px;font-weight:600">Pendiente</span>
          </div>
        </div>
      </div>
    </div>

    <div class="card" style="background:var(--color-bg-alt)">
      <div class="card-body">
        <h3 style="font-size:16px;font-weight:600;margin-bottom:12px">🔗 Tu enlace de reserva</h3>
        <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;padding:12px;margin-bottom:12px;font-family:monospace;font-size:13px">
          otto.aneker.es/reserva/paquisirvent
        </div>
        <p style="font-size:12px;color:var(--color-text-muted);margin-bottom:16px">
          Comparte este enlace para que los clientes reserven cita directamente
        </p>
        <button class="btn btn-secondary" style="font-size:12px" onclick="alert('Copiado al portapapeles')">Copiar enlace</button>
      </div>
    </div>
  `;
}

// Inicializar mockmockups cuando se cargue la página
if (window.addEventListener) {
  window.addEventListener('DOMContentLoaded', function() {
    // Sobrescribir showPage para renderizar mockups
    const originalShowPage = window.showPage;
    window.showPage = function(pageId, btn) {
      // Llamar a la función original
      if (originalShowPage) originalShowPage(pageId, btn);

      // Renderizar mockup según la página
      if (pageId === 'watch') renderWatchModule();
      else if (pageId === 'count') renderCountModule();
      else if (pageId === 'order') renderOrderModule();
      else if (pageId === 'schedule') renderScheduleModule();
    };
  });
}
