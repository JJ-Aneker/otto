/* ============================================================
   Otto vigila · pantalla, ajustes e Inicio
   Datos: watch_sites, watch_checks y watch_issues (Supabase).
   La revisión la hace el servidor: cada día (cron) o con "Revisar ahora".
   ============================================================ */
(function () {
  const W = { sites: [], checks: [], issues: [], loaded: false, running: false, issuesError: false, sel: 'all', filter: 'open', open: new Set(), busy: new Set() };
  const fmtN = n => Number(n || 0).toLocaleString('es-ES');
  const secs = ms => (ms / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' s';
  const when = iso => {
    const d = new Date(iso); if (isNaN(d)) return '';
    const mins = Math.floor((Date.now() - d.getTime()) / 60000);
    if (mins < 2) return 'Ahora mismo';
    if (mins < 60) return `Hace ${mins} min`;
    const h = Math.floor(mins / 60);
    if (h < 24) return `Hace ${h} ${h === 1 ? 'hora' : 'horas'}`;
    const days = Math.floor(h / 24);
    return days === 1 ? 'Ayer' : days < 31 ? `Hace ${days} días` : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  };
  const dayLabel = d => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
  const dayKey = d => { d = new Date(d); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); };
  const host = u => { try { return new URL(u).host; } catch { return u; } };
  const siteName = s => s ? (s.label || host(s.url)) : '';
  const normUrl = v => { v = (v || '').trim(); if (!v) return ''; if (!/^https?:\/\//i.test(v)) v = 'https://' + v; try { const u = new URL(v); return u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')); } catch { return ''; } };
  const safeHref = u => /^https?:\/\//i.test(u || '') ? u : '';

  const latest = siteId => W.checks.find(c => c.site_id === siteId);          // los checks vienen de más nuevo a más viejo
  const issuesOf = c => Array.isArray(c?.issues) ? c.issues : [];
  const inSel = siteId => W.sel === 'all' || W.sel === siteId;
  const selSites = () => W.sites.filter(s => inSel(s.id));

  // Un aviso pospuesto vuelve a contar como abierto cuando pasa su fecha
  const status = i => (i.status === 'ignored' && i.snoozed_until && new Date(i.snoozed_until) <= new Date()) ? 'open' : i.status;
  const ORDER = { down: 0, ssl: 1, slow: 2, seo_title: 3, seo_meta: 4, heavy_image: 5 };
  const byImportance = (a, b) => ((a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1)) || ((ORDER[a.type] ?? 9) - (ORDER[b.type] ?? 9));
  const issuesBy = st => W.issues.filter(i => status(i) === st && inSel(i.site_id)).sort(byImportance);
  const openAll = () => W.issues.filter(i => status(i) === 'open').sort(byImportance);

  const GUIDE = {
    down: ['Abre la web en el navegador para confirmar si de verdad no carga.', 'Entra en el panel de tu proveedor de hosting y comprueba que el servicio y el dominio están activos.', 'Si sigue caída, contacta con el soporte del hosting y dile desde cuándo falla.'],
    slow: ['Reduce las imágenes pesadas (mira si hay un aviso de imágenes).', 'Desactiva en WordPress los plugins que ya no uses.', 'Pregunta a tu hosting si tienes activada la caché, o instala un plugin de caché.'],
    ssl: ['Entra en el panel de tu hosting, sección Certificado SSL (o Seguridad).', 'Renueva el certificado. En la mayoría de hostings es un botón y se hace en un minuto.', 'Si no encuentras la opción, pide al soporte que lo renueve.'],
    seo_meta: ['Pulsa Editar junto a la página.', 'Baja hasta el recuadro de Yoast SEO y escribe la Metadescripción: una o dos frases que resuman la página, entre 120 y 155 caracteres.', 'Pulsa Actualizar y después Volver a comprobar.'],
    seo_title: ['Pulsa Editar junto a la página.', 'En el recuadro de Yoast SEO rellena el Título SEO.', 'Pulsa Actualizar y después Volver a comprobar.'],
    heavy_image: ['Descarga la imagen o localízala en la Biblioteca de medios con el botón Buscar en WordPress.', 'Reduce su peso a menos de 500 KB con Squoosh (squoosh.app) o TinyPNG, mejor en formato WebP.', 'Sube la versión ligera, sustitúyela donde se use y pulsa Volver a comprobar.'],
  };
  const SEV = { error: ['Urgente', 'danger'], warn: ['Mejora', 'warn'] };

  async function loadIssues() {
    const r = await sb.from('watch_issues').select('*').eq('workspace_id', ws.id);
    W.issuesError = !!(r && r.error);
    W.issues = (r && r.data) || [];
  }
  async function load() {
    if (typeof ws === 'undefined' || !ws || !sb) return;
    const [s, c] = await Promise.all([
      sb.from('watch_sites').select('*').eq('workspace_id', ws.id).order('created_at'),
      sb.from('watch_checks').select('*').eq('workspace_id', ws.id).order('checked_at', { ascending: false }).limit(400),
    ]);
    W.sites = (s && s.data) || []; W.checks = (c && c.data) || [];
    await loadIssues();
    W.loaded = true;
    renderAll();
  }

  /* ── Resumen de estado ── */
  function summary() {
    const rows = selSites().map(s => ({ s, c: latest(s.id) }));
    const checked = rows.filter(r => r.c);
    const down = checked.filter(r => !r.c.ok).length;
    const open = W.issuesError ? checked.reduce((a, r) => a + issuesOf(r.c).length, 0) : issuesBy('open').length;
    // Comparación con la revisión anterior (sin contar lo ignorado)
    let now = 0, before = 0, comparable = false;
    rows.forEach(({ s }) => {
      const cs = W.checks.filter(c => c.site_id === s.id);
      if (cs.length < 2) return;
      const ign = new Set(W.issues.filter(i => i.site_id === s.id && status(i) === 'ignored').map(i => i.type));
      const n = c => issuesOf(c).filter(i => !ign.has(i.type)).length;
      now += n(cs[0]); before += n(cs[1]); comparable = true;
    });
    const ms = checked.map(r => r.c.response_ms).filter(x => x != null);
    const last = checked.map(r => r.c.checked_at).sort().pop();
    return { rows, checked, down, open, delta: comparable ? now - before : null, avg: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null, last };
  }

  /* ── Historial de 30 días de una web ── */
  function history(siteId, n = 30) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const days = [];
    for (let k = n - 1; k >= 0; k--) { const d = new Date(today); d.setDate(d.getDate() - k); days.push({ date: d, key: dayKey(d), checks: [] }); }
    const idx = Object.fromEntries(days.map(d => [d.key, d]));
    W.checks.filter(c => c.site_id === siteId).forEach(c => { const d = idx[dayKey(c.checked_at)]; if (d) d.checks.push(c); });   // más nuevo primero
    days.forEach(d => {
      const c = d.checks;
      if (!c.length) { d.state = 'none'; return; }
      d.last = c[0];
      d.ms = c.find(x => x.response_ms != null)?.response_ms ?? null;
      d.state = c.some(x => !x.ok) ? 'down' : issuesOf(c[0]).length ? 'warn' : 'ok';
    });
    const all = days.flatMap(d => d.checks);
    return { days, total: all.length, up: all.filter(c => c.ok).length };
  }
  const STATE_TXT = { ok: 'todo en orden', warn: 'con avisos', down: 'la web no respondía', none: 'sin revisión' };
  function strip(h) {
    return `<div class="day-strip" role="img" aria-label="Estado de los últimos 30 días">${h.days.map(d => {
      const tip = `${dayLabel(d.date)}: ${STATE_TXT[d.state]}${d.ms != null ? ' · ' + secs(d.ms) : ''}`;
      return `<span class="day day-${d.state}" title="${esc(tip)}"></span>`;
    }).join('')}</div>`;
  }
  function chart(h) {
    const pts = h.days.map((d, i) => ({ i, ms: d.ms, d })).filter(p => p.ms != null);
    if (pts.length < 2) return `<p class="muted-note perf-empty">El gráfico aparecerá cuando haya revisiones de al menos dos días distintos.</p>`;
    const box = document.getElementById('mod-watch');
    const Wd = Math.max(280, Math.min(900, (box && box.clientWidth ? box.clientWidth - 34 : 640)));
    const Ht = 150, L = 40, R = 10, T = 10, B = 22;
    const max = Math.max(...pts.map(p => p.ms));
    const top = Math.max(1000, Math.ceil(max / 500) * 500);
    const x = i => L + (i / (h.days.length - 1)) * (Wd - L - R);
    const y = v => T + (1 - v / top) * (Ht - T - B);
    const line = pts.map((p, k) => `${k ? 'L' : 'M'}${x(p.i).toFixed(1)} ${y(p.ms).toFixed(1)}`).join(' ');
    const area = `${line} L${x(pts[pts.length - 1].i).toFixed(1)} ${y(0)} L${x(pts[0].i).toFixed(1)} ${y(0)} Z`;
    const grid = [0, top / 2, top].map(v => `<line class="perf-grid" x1="${L}" x2="${Wd - R}" y1="${y(v)}" y2="${y(v)}"/><text class="perf-axis" x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${secs(v)}</text>`).join('');
    const slow = top >= 3000 ? `<line class="perf-limit" x1="${L}" x2="${Wd - R}" y1="${y(3000)}" y2="${y(3000)}"/>` : '';
    const dots = pts.map(p => `<circle class="perf-dot" cx="${x(p.i).toFixed(1)}" cy="${y(p.ms).toFixed(1)}" r="3"><title>${esc(dayLabel(p.d.date) + ': ' + secs(p.ms))}</title></circle>`).join('');
    return `<svg class="perf-chart" viewBox="0 0 ${Wd} ${Ht}" width="${Wd}" height="${Ht}" role="img" aria-label="Tiempo de carga de la portada, últimos 30 días">
      ${grid}${slow}<path class="perf-area" d="${area}"/><path class="perf-line" d="${line}"/>${dots}
      <text class="perf-axis" x="${L}" y="${Ht - 4}">${esc(dayLabel(h.days[0].date))}</text><text class="perf-axis" x="${Wd - R}" y="${Ht - 4}" text-anchor="end">Hoy</text></svg>
      <p class="muted-note perf-note">Tiempo de carga de la portada. La línea discontinua marca los 3 segundos.</p>`;
  }

  /* ── Pantalla Otto vigila ── */
  function renderPage() {
    const el = document.getElementById('mod-watch'); if (!el) return;
    const head = document.getElementById('watchHeadActions');
    if (head) head.innerHTML = W.sites.length ? `<button class="btn btn-primary" id="watchRunBtn" onclick="OttoWatch.run()" ${W.running ? 'disabled' : ''}>${W.running ? 'Revisando…' : 'Revisar ahora'}</button>` : '';
    if (!W.loaded) { el.innerHTML = '<p class="muted-note">Cargando…</p>'; return; }
    if (!W.sites.length) {
      el.innerHTML = `<div class="rows-empty"><p>Todavía no vigilas ninguna web. Añade la dirección y Otto la revisará cada día.</p>
        <button class="btn btn-primary" onclick="OttoWatch.openSettings()">Añadir una web</button></div>`;
      return;
    }
    if (W.sel !== 'all' && !W.sites.some(s => s.id === W.sel)) W.sel = 'all';
    const S = summary();
    const fig = (l, v, go, d) => `<div class="fig-link" role="button" tabindex="0" onclick="OttoWatch.go('${go}')" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();OttoWatch.go('${go}')}"><dt>${esc(l)}</dt><dd>${esc(v)}${d ? ` <small class="${d.cls}">${esc(d.t)}</small>` : ''}</dd></div>`;
    const estado = !S.checked.length ? 'Sin revisar' : S.down ? `${S.down} ${S.down === 1 ? 'web caída' : 'webs caídas'}` : 'Todo funciona';
    const delta = S.delta ? { cls: S.delta < 0 ? 'up' : 'down', t: S.delta < 0 ? `${-S.delta} menos que antes` : `${S.delta} más que antes` } : null;
    const picker = W.sites.length > 1 ? `<div class="chips watch-sites" role="group" aria-label="Web">
      <button class="${W.sel === 'all' ? 'on' : ''}" onclick="OttoWatch.pick('all')">Todas</button>
      ${W.sites.map(s => `<button class="${W.sel === s.id ? 'on' : ''}" onclick="OttoWatch.pick('${esc(s.id)}')">${esc(siteName(s))}</button>`).join('')}</div>` : '';
    const one = W.sites.length === 1 ? W.sites[0] : (W.sel !== 'all' ? W.sites.find(s => s.id === W.sel) : null);
    const oneC = one && latest(one.id);
    const siteLine = one ? `<p class="site-line"><span class="dot dot-${!oneC ? 'muted' : !oneC.ok ? 'danger' : 'ok'}" aria-hidden="true"></span>
      <a href="${esc(safeHref(one.url))}" target="_blank" rel="noopener">${esc(siteName(one))}</a>
      <span class="muted-note">${esc(host(one.url))}${oneC && oneC.pages_checked ? ` · ${oneC.pages_checked} páginas revisadas` : ''}${oneC ? ` · ${esc(when(oneC.checked_at).toLowerCase())}` : ''}</span></p>` : '';
    el.innerHTML = `
      ${picker}${siteLine}
      <dl class="figs figs-row">
        ${fig('Estado', estado, 'perf')}
        ${fig('Tiempo de carga', S.avg == null ? '—' : secs(S.avg), 'perf')}
        ${fig('Avisos abiertos', S.checked.length ? String(S.open) : '—', 'issues', delta)}
        ${fig('Última revisión', S.last ? when(S.last) : 'Aún ninguna', 'perf')}
      </dl>
      ${renderIssues()}
      ${renderPerf()}`;
  }

  function item(x) {
    const it = typeof x === 'string' ? { label: x } : x;
    const href = safeHref(it.url), edit = safeHref(it.edit);
    return `<li><span class="issue-item-label">${esc(it.label)}</span>${href || edit ? `<span class="issue-item-links">${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">Ver</a>` : ''}${edit ? `<a href="${esc(edit)}" target="_blank" rel="noopener">${/upload\.php/.test(edit) ? 'Buscar en WordPress' : 'Editar'}</a>` : ''}</span>` : ''}</li>`;
  }

  function renderIssues() {
    const counts = { open: issuesBy('open').length, ignored: issuesBy('ignored').length, resolved: issuesBy('resolved').length };
    const checkedAny = selSites().some(s => latest(s.id));
    if (W.issuesError) return `<div class="grp" id="watchSecIssues">Avisos</div><div class="callout">Falta preparar la base de datos para los avisos. Ejecuta supabase/vigila-avisos.sql en Supabase.</div>`;
    if (!checkedAny) return `<div class="grp" id="watchSecIssues">Avisos</div><div class="rows-empty"><p>Todavía no hay ninguna revisión. Pulsa "Revisar ahora" para empezar.</p></div>`;
    const stale = selSites().some(s => { const c = latest(s.id); return c && issuesOf(c).length && !W.issues.some(i => i.site_id === s.id); });
    const list = issuesBy(W.filter);
    const multi = W.sites.length > 1 && W.sel === 'all';
    const chip = (k, l) => `<button class="${W.filter === k ? 'on' : ''}" onclick="OttoWatch.filter('${k}')">${l} ${counts[k]}</button>`;
    const empty = { open: 'No hay avisos abiertos. Todo está en orden.', ignored: 'No has ignorado ningún aviso.', resolved: 'Todavía no hay avisos resueltos. Cuando arregles uno y Otto lo confirme, aparecerá aquí.' }[W.filter];
    return `<div class="grp" id="watchSecIssues">Avisos</div>
      <div class="chips" role="group" aria-label="Filtrar avisos">${chip('open', 'Abiertos')}${chip('ignored', 'Ignorados')}${chip('resolved', 'Resueltos')}</div>
      ${stale ? `<div class="callout-info">Estos datos son de antes de la última mejora. Pulsa "Revisar ahora" para actualizar los avisos.</div>` : ''}
      ${list.length ? `<ul class="rows issues">${list.map(i => issueRow(i, multi)).join('')}</ul>` : `<div class="rows-empty"><p>${empty}</p></div>`}`;
  }

  function issueRow(i, multi) {
    const s = W.sites.find(x => x.id === i.site_id);
    const st = status(i), isOpen = W.open.has(i.id), busy = W.busy.has(i.id);
    const tone = st === 'open' ? (i.severity === 'error' ? 'danger' : 'warn') : st === 'resolved' ? 'ok' : 'muted';
    const sev = SEV[i.severity] || SEV.warn;
    let meta = [multi ? siteName(s) : null];
    if (st === 'open') meta.push(i.detail);
    else if (st === 'resolved') meta.push('Resuelto ' + when(i.resolved_at).toLowerCase());
    else meta.push(i.snoozed_until ? 'Pospuesto hasta el ' + new Date(i.snoozed_until).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) : 'Ignorado');
    meta = meta.filter(Boolean).join(' · ');
    const items = Array.isArray(i.items) ? i.items : [];
    const guide = GUIDE[i.type];
    const actions = st === 'open'
      ? `<button class="btn btn-secondary" onclick="OttoWatch.recheck('${esc(i.id)}')" ${busy ? 'disabled' : ''}>${busy ? 'Comprobando…' : 'Volver a comprobar'}</button>
         <button class="btn btn-ghost" onclick="OttoWatch.ignore('${esc(i.id)}')">Ignorar</button>
         <button class="btn btn-ghost" onclick="OttoWatch.snooze('${esc(i.id)}')">Posponer 30 días</button>`
      : st === 'ignored' ? `<button class="btn btn-secondary" onclick="OttoWatch.reopen('${esc(i.id)}')">Volver a vigilarlo</button>` : '';
    return `<li class="issue ${isOpen ? 'is-open' : ''}">
      <button class="issue-head" aria-expanded="${isOpen}" onclick="OttoWatch.toggle('${esc(i.id)}')">
        <span class="dot dot-${tone}" aria-hidden="true"></span>
        <span class="issue-main"><span class="row-title row-wrap">${esc(i.message)}</span><span class="row-meta">${esc(meta)}</span></span>
        <span class="issue-side">${st === 'open' ? `<span class="tag tag-${sev[1]}">${sev[0]}</span>` : ''}<svg class="chev" width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 6l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
      </button>
      ${isOpen ? `<div class="issue-body">
        ${items.length ? `<ul class="issue-items">${items.map(item).join('')}</ul>` : ''}
        ${st === 'open' && guide ? `<div class="issue-how"><div class="issue-how-title">Cómo resolverlo</div><ol>${guide.map(g => `<li>${esc(g)}</li>`).join('')}</ol></div>` : ''}
        ${st === 'ignored' ? `<p class="muted-note">No cuenta en los avisos abiertos. Otto sigue comprobándolo.</p>` : ''}
        ${st === 'resolved' ? `<p class="muted-note">Otto ya no lo detecta. Si vuelve a aparecer, se abrirá de nuevo.</p>` : ''}
        ${actions ? `<div class="issue-actions">${actions}</div>` : ''}</div>` : ''}
    </li>`;
  }

  function renderPerf() {
    if (!selSites().some(s => latest(s.id))) return '';
    const one = W.sites.length === 1 ? W.sites[0] : (W.sel !== 'all' ? W.sites.find(s => s.id === W.sel) : null);
    if (!one) {
      return `<div class="grp" id="watchSecPerf">Últimos 30 días</div><ul class="rows">${W.sites.map(s => {
        const h = history(s.id);
        return `<li class="perf-row"><button class="perf-row-btn" onclick="OttoWatch.pick('${esc(s.id)}')"><span class="perf-row-name">${esc(siteName(s))}</span>${strip(h)}<span class="perf-row-up">${h.total ? pct(h) : '—'}</span></button></li>`;
      }).join('')}</ul>`;
    }
    const h = history(one.id), c = latest(one.id);
    const msAll = h.days.map(d => d.ms).filter(x => x != null);
    const avg = msAll.length ? Math.round(msAll.reduce((a, b) => a + b, 0) / msAll.length) : null;
    const stat = (l, v) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}</dd></div>`;
    return `<div class="grp" id="watchSecPerf">Últimos 30 días</div>
      <div class="perf">
        ${strip(h)}
        <div class="day-legend"><span>${esc(dayLabel(h.days[0].date))}</span><span class="legend-keys"><i class="day day-ok"></i>En orden <i class="day day-warn"></i>Con avisos <i class="day day-down"></i>Caída</span><span>Hoy</span></div>
        <dl class="perf-stats">
          ${stat('Disponibilidad', h.total ? pct(h) : '—')}
          ${stat('Tiempo medio', avg == null ? '—' : secs(avg))}
          ${stat('Certificado', c && c.ssl_days_left != null ? `${fmtN(c.ssl_days_left)} ${c.ssl_days_left === 1 ? 'día' : 'días'}` : '—')}
        </dl>
        ${chart(h)}
      </div>`;
  }
  const pct = h => (h.up / h.total * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' %';

  /* ── Ajustes: webs a vigilar ── */
  function renderSettings() {
    const box = document.getElementById('watchSitesList'); if (!box) return;
    box.innerHTML = W.sites.length ? `<ul class="rows">${W.sites.map((s, i) => `
      <li class="row"><div class="row-main"><div class="row-title">${esc(s.label || host(s.url))}</div><div class="row-meta">${esc(s.url)}</div></div>
        <div class="row-side">${rowMenu('wsm' + i, [{ label: 'Dejar de vigilar', danger: true, onclick: `OttoWatch.remove('${esc(s.id)}')` }])}</div></li>`).join('')}</ul>`
      : `<div class="wp-instructions">Todavía no hay ninguna web en la lista.</div>`;
    const sug = document.getElementById('watchSuggest');
    if (sug) {
      const own = typeof ws !== 'undefined' && ws && ws.wp_url ? normUrl(ws.wp_url) : '';
      const has = own && W.sites.some(s => normUrl(s.url) === own);
      sug.style.display = own && !has ? 'flex' : 'none';
      if (own) sug.querySelector('span').textContent = `Tu WordPress: ${host(own)}`;
    }
  }

  async function add(url, label) {
    url = normUrl(url);
    if (!url) { showWPStatus('watchStatus', 'Escribe una dirección válida, por ejemplo https://tuweb.com', 'error'); return; }
    if (W.sites.some(s => normUrl(s.url) === url)) { showWPStatus('watchStatus', 'Esa web ya está en la lista', 'error'); return; }
    if (W.sites.length >= 5) { showWPStatus('watchStatus', 'Puedes vigilar hasta 5 webs por perfil', 'error'); return; }
    const { data, error } = await sb.from('watch_sites').insert({ workspace_id: ws.id, url, label: (label || '').trim() || null }).select().single();
    if (error) { showWPStatus('watchStatus', error.message, 'error'); return; }
    W.sites.push(data || { id: 'tmp' + Date.now(), url, label: label || null });
    showWPStatus('watchStatus', 'Web añadida. Se revisará esta noche, o ya mismo desde Otto vigila.', 'success');
    renderAll();
  }
  async function addFromForm() {
    await add($('watchUrl').value, $('watchLabel').value);
    if (!$('watchStatus').classList.contains('error')) { $('watchUrl').value = ''; $('watchLabel').value = ''; }
  }
  async function remove(id) {
    const s = W.sites.find(x => x.id === id); if (!s) return;
    if (!confirm(`¿Dejar de vigilar ${host(s.url)}? Se borra también su historial y sus avisos.`)) return;
    const { error } = await sb.from('watch_sites').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    W.sites = W.sites.filter(x => x.id !== id); W.checks = W.checks.filter(c => c.site_id !== id); W.issues = W.issues.filter(i => i.site_id !== id);
    renderAll();
  }

  /* ── Revisar ahora / volver a comprobar ── */
  async function runChecks(body) {
    const r = await apiFetch('/api/watch', { method: 'POST', body: JSON.stringify(body) });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'No se pudo revisar');
    W.checks = [...(d.checks || []), ...W.checks];
    await loadIssues();
    return d;
  }
  async function run() {
    if (W.running || !W.sites.length) return;
    W.running = true; renderPage();
    try { await runChecks({}); showToast('Revisión terminada', 'success'); }
    catch (e) { showToast('No se pudo revisar: ' + e.message, 'error'); }
    W.running = false; renderAll();
  }
  async function recheck(id) {
    const i = W.issues.find(x => x.id === id); if (!i || W.busy.has(id)) return;
    W.busy.add(id); renderPage();
    try {
      await runChecks({ siteId: i.site_id });
      const now = W.issues.find(x => x.id === id);
      if (!now || status(now) === 'resolved') { showToast('Resuelto: Otto ya no lo detecta', 'success'); W.open.delete(id); }
      else showToast('Sigue sin resolverse', 'info');
    } catch (e) { showToast('No se pudo comprobar: ' + e.message, 'error'); }
    W.busy.delete(id); renderAll();
  }

  /* ── Acciones sobre un aviso ── */
  async function setStatus(id, patch, okMsg) {
    const i = W.issues.find(x => x.id === id); if (!i) return;
    const { error } = await sb.from('watch_issues').update(patch).eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    Object.assign(i, patch); W.open.delete(id);
    showToast(okMsg, 'success'); renderAll();
  }
  const ignore = id => setStatus(id, { status: 'ignored', snoozed_until: null }, 'Aviso ignorado');
  const snooze = id => setStatus(id, { status: 'ignored', snoozed_until: new Date(Date.now() + 30 * 86400000).toISOString() }, 'Pospuesto 30 días');
  const reopen = id => setStatus(id, { status: 'open', snoozed_until: null }, 'Aviso reabierto');

  /* ── Inicio ── */
  OttoHome.register({
    id: 'watch', name: 'Vigila',
    tasks() {
      if (!W.loaded) return [];
      if (!W.sites.length) return [{ tone: 'muted', title: 'Añade tu web para que Otto la vigile', meta: 'Revisa cada día que funciona y avisa si algo falla', when: '', label: 'Añadir web', run() { OttoWatch.openSettings(); } }];
      const out = [];
      W.sites.forEach(s => { if (!latest(s.id)) out.push({ tone: 'muted', title: `${host(s.url)} todavía no se ha revisado`, meta: 'La primera revisión será esta noche', when: '', label: 'Revisar ahora', run() { showPage('watch'); OttoWatch.run(); } }); });
      if (W.issuesError) {
        W.sites.forEach(s => { const c = latest(s.id); if (c) issuesOf(c).forEach(i => out.push({ tone: i.severity === 'error' ? 'danger' : 'warn', title: i.message, meta: host(s.url) + (i.detail ? ' · ' + i.detail : ''), when: when(c.checked_at), label: 'Ver aviso', run() { showPage('watch'); } })); });
      } else {
        openAll().forEach(i => {
          const s = W.sites.find(x => x.id === i.site_id);
          out.push({ tone: i.severity === 'error' ? 'danger' : 'warn', title: i.message, meta: `${host(s ? s.url : '')}${i.detail ? ' · ' + i.detail : ''}`, when: when(i.last_seen), label: 'Ver aviso',
            run() { W.sel = 'all'; W.filter = 'open'; W.open.add(i.id); showPage('watch'); setTimeout(() => OttoWatch.go('issues'), 60); } });
        });
      }
      return out.slice(0, 4);
    },
    figures() {
      if (!W.loaded || !W.sites.length) return [];
      const prev = W.sel; W.sel = 'all'; const S = summary(); W.sel = prev;
      return [
        { label: 'Estado de la web', value: !S.checked.length ? 'Sin revisar' : S.down ? `${S.down} caída${S.down === 1 ? '' : 's'}` : 'Funcionando' },
        { label: 'Tiempo de carga', value: S.avg == null ? '—' : secs(S.avg) },
        { label: 'Avisos abiertos', value: S.checked.length ? String(S.open) : '—' },
        { label: 'Última revisión', value: S.last ? when(S.last) : 'Aún ninguna' },
      ];
    },
  });

  function renderAll() {
    renderPage(); renderSettings();
    if (document.getElementById('page-home').classList.contains('active')) OttoHome.render();
  }

  window.OttoWatch = {
    load, run, remove, add: addFromForm, recheck, ignore, snooze, reopen,
    addOwn() { return add(ws.wp_url, ws.name); },
    openSettings() { showPage('settings'); switchSettingsTab('vigila', document.getElementById('stab-vigila')); },
    pick(id) { W.sel = id; renderPage(); },
    filter(f) { W.filter = f; renderPage(); },
    toggle(id) { W.open.has(id) ? W.open.delete(id) : W.open.add(id); renderPage(); },
    go(where) {
      if (where === 'issues') W.filter = 'open';
      renderPage();
      const el = document.getElementById(where === 'issues' ? 'watchSecIssues' : 'watchSecPerf');
      if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    },
    reset() { W.sites = []; W.checks = []; W.issues = []; W.loaded = false; W.sel = 'all'; W.filter = 'open'; W.open.clear(); renderAll(); },
  };

  // Al cambiar de perfil se vuelven a leer sus webs
  const baseSelect = selectWorkspace;
  selectWorkspace = async function (id) { OttoWatch.reset(); await baseSelect(id); await load(); };
  const baseShow = showPage;
  showPage = function (id) { baseShow.apply(this, arguments); if (id === 'watch') renderPage(); if (id === 'settings') renderSettings(); };
  let rz; window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (document.getElementById('page-watch')?.classList.contains('active')) renderPage(); }, 200); });
  if (typeof ws !== 'undefined' && ws) load();
})();
