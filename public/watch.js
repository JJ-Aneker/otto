/* ============================================================
   Otto vigila · pantalla, ajustes e Inicio
   Datos: tablas watch_sites y watch_checks (Supabase).
   La revisión la hace el servidor: cada día (cron) o con "Revisar ahora".
   ============================================================ */
(function () {
  const W = { sites: [], checks: [], loaded: false, running: false };
  const fmtN = n => Number(n || 0).toLocaleString('es-ES');
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
  const host = u => { try { return new URL(u).host; } catch { return u; } };
  const normUrl = v => { v = (v || '').trim(); if (!v) return ''; if (!/^https?:\/\//i.test(v)) v = 'https://' + v; try { const u = new URL(v); return u.origin + (u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')); } catch { return ''; } };

  const latest = siteId => W.checks.find(c => c.site_id === siteId);          // checks vienen de más nuevo a más viejo
  const issuesOf = c => Array.isArray(c?.issues) ? c.issues : [];

  async function load() {
    if (typeof ws === 'undefined' || !ws || !sb) return;
    const [s, c] = await Promise.all([
      sb.from('watch_sites').select('*').eq('workspace_id', ws.id).order('created_at'),
      sb.from('watch_checks').select('*').eq('workspace_id', ws.id).order('checked_at', { ascending: false }).limit(200),
    ]);
    W.sites = (s && s.data) || []; W.checks = (c && c.data) || []; W.loaded = true;
    renderAll();
  }

  /* ── Resumen de estado ── */
  function summary() {
    const rows = W.sites.map(s => ({ s, c: latest(s.id) }));
    const checked = rows.filter(r => r.c);
    const down = checked.filter(r => !r.c.ok).length;
    const issues = checked.reduce((a, r) => a + issuesOf(r.c).filter(i => i.type !== 'down').length, 0);
    const ms = checked.map(r => r.c.response_ms).filter(x => x != null);
    const ssl = checked.map(r => r.c.ssl_days_left).filter(x => x != null);
    const last = checked.map(r => r.c.checked_at).sort().pop();
    return { rows, checked, down, issues, avg: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null, ssl: ssl.length ? Math.min(...ssl) : null, last };
  }

  /* ── Pantalla Otto vigila ── */
  function renderPage() {
    const host_ = document.getElementById('mod-watch'); if (!host_) return;
    const head = document.getElementById('watchHeadActions');
    if (head) head.innerHTML = W.sites.length ? `<button class="btn btn-primary" id="watchRunBtn" onclick="OttoWatch.run()" ${W.running ? 'disabled' : ''}>${W.running ? 'Revisando…' : 'Revisar ahora'}</button>` : '';
    if (!W.loaded) { host_.innerHTML = '<p class="muted-note">Cargando…</p>'; return; }
    if (!W.sites.length) {
      host_.innerHTML = `<div class="rows-empty"><p>Todavía no vigilas ninguna web. Añade la dirección y Otto la revisará cada día.</p>
        <button class="btn btn-primary" onclick="OttoWatch.openSettings()">Añadir una web</button></div>`;
      return;
    }
    const S = summary();
    const fig = (l, v, d) => `<div><dt>${esc(l)}</dt><dd>${esc(v)}${d ? ` <small class="${d.cls}">${esc(d.t)}</small>` : ''}</dd></div>`;
    const estado = !S.checked.length ? 'Sin revisar' : S.down ? `${S.down} ${S.down === 1 ? 'web caída' : 'webs caídas'}` : 'Todo funciona';
    host_.innerHTML = `
      <dl class="figs figs-row">
        ${fig('Estado', estado)}
        ${fig('Tiempo de carga', S.avg == null ? '—' : (S.avg / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' s')}
        ${fig('Avisos abiertos', S.checked.length ? String(S.issues) : '—')}
        ${fig('Última revisión', S.last ? when(S.last) : 'Aún ninguna')}
      </dl>
      <div class="grp">Tus webs</div>
      <ul class="rows">${S.rows.map(({ s, c }) => {
        const n = issuesOf(c).length;
        const tone = !c ? 'muted' : !c.ok ? 'danger' : n ? 'warn' : 'ok';
        const state = !c ? 'Sin revisar todavía' : !c.ok ? 'No responde' : n ? `${n} ${n === 1 ? 'aviso' : 'avisos'}` : 'Todo en orden';
        const meta = c ? [state, c.response_ms != null ? `${(c.response_ms / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 })} s` : null, c.pages_checked ? `${c.pages_checked} páginas revisadas` : null].filter(Boolean).join(' · ') : state;
        return `<li class="row"><span class="dot dot-${tone}" aria-hidden="true"></span>
          <div class="row-main"><div class="row-title">${esc(s.label || host(s.url))}</div><div class="row-meta">${esc(host(s.url))} · ${esc(meta)}</div></div>
          <div class="row-side"><span class="row-when">${c ? esc(when(c.checked_at)) : ''}</span></div></li>`;
      }).join('')}</ul>
      ${renderIssues(S)}
      ${renderHistory()}`;
  }

  function renderIssues(S) {
    const list = S.checked.flatMap(({ s, c }) => issuesOf(c).map(i => ({ s, c, i })))
      .sort((a, b) => (a.i.severity === 'error' ? 0 : 1) - (b.i.severity === 'error' ? 0 : 1));
    if (!S.checked.length) return '';
    if (!list.length) return `<div class="grp">Avisos</div><div class="rows-empty"><p>No hay avisos. Todo está en orden.</p></div>`;
    return `<div class="grp">Avisos</div><ul class="rows">${list.map(({ s, i }) => `
      <li class="row row-top"><span class="dot dot-${i.severity === 'error' ? 'danger' : 'warn'}" aria-hidden="true"></span>
        <div class="row-main"><div class="row-title row-wrap">${esc(i.message)}</div>
          <div class="row-meta">${esc(host(s.url))}${i.detail ? ' · ' + esc(i.detail) : ''}</div>
          ${i.items && i.items.length ? `<ul class="issue-items">${i.items.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div></li>`).join('')}</ul>`;
  }

  function renderHistory() {
    const rows = W.checks.slice(0, 14);
    if (rows.length < 2) return '';
    const site = id => { const s = W.sites.find(x => x.id === id); return s ? (s.label || host(s.url)) : ''; };
    return `<div class="grp">Últimas revisiones</div><ul class="rows">${rows.map(c => `
      <li class="row"><span class="dot dot-${!c.ok ? 'danger' : issuesOf(c).length ? 'warn' : 'ok'}" aria-hidden="true"></span>
        <div class="row-main"><div class="row-title">${esc(site(c.site_id))}</div>
          <div class="row-meta">${!c.ok ? 'No respondía' : issuesOf(c).length ? `${issuesOf(c).length} avisos` : 'Todo en orden'}${c.response_ms != null ? ' · ' + (c.response_ms / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' s' : ''}${c.ssl_days_left != null ? ` · certificado: ${fmtN(c.ssl_days_left)} días` : ''}</div></div>
        <div class="row-side"><span class="row-when">${esc(new Date(c.checked_at).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }))}</span></div></li>`).join('')}</ul>`;
  }

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
    if (!confirm(`¿Dejar de vigilar ${host(s.url)}? Se borra también su historial de revisiones.`)) return;
    const { error } = await sb.from('watch_sites').delete().eq('id', id);
    if (error) { showToast('Error: ' + error.message, 'error'); return; }
    W.sites = W.sites.filter(x => x.id !== id); W.checks = W.checks.filter(c => c.site_id !== id);
    renderAll();
  }

  /* ── Revisar ahora ── */
  async function run() {
    if (W.running || !W.sites.length) return;
    W.running = true; renderPage();
    try {
      const r = await apiFetch('/api/watch', { method: 'POST', body: JSON.stringify({}) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'No se pudo revisar');
      W.checks = [...(d.checks || []), ...W.checks];
      showToast('Revisión terminada', 'success');
    } catch (e) { showToast('No se pudo revisar: ' + e.message, 'error'); }
    W.running = false; renderAll();
  }

  /* ── Inicio ── */
  OttoHome.register({
    id: 'watch', name: 'Vigila',
    tasks() {
      if (!W.loaded) return [];
      if (!W.sites.length) return [{ tone: 'muted', title: 'Añade tu web para que Otto la vigile', meta: 'Revisa cada día que funciona y avisa si algo falla', when: '', label: 'Añadir web', run() { OttoWatch.openSettings(); } }];
      const out = [];
      W.sites.forEach(s => {
        const c = latest(s.id);
        if (!c) { out.push({ tone: 'muted', title: `${host(s.url)} todavía no se ha revisado`, meta: 'La primera revisión será esta noche', when: '', label: 'Revisar ahora', run() { showPage('watch'); OttoWatch.run(); } }); return; }
        issuesOf(c).sort((a, b) => (a.severity === 'error' ? 0 : 1) - (b.severity === 'error' ? 0 : 1)).forEach(i =>
          out.push({ tone: i.severity === 'error' ? 'danger' : 'warn', title: i.message, meta: `${host(s.url)}${i.detail ? ' · ' + i.detail : ''}`, when: when(c.checked_at), label: 'Ver aviso', run() { showPage('watch'); } }));
      });
      return out.slice(0, 4);
    },
    figures() {
      if (!W.loaded || !W.sites.length) return [];
      const S = summary();
      return [
        { label: 'Estado de la web', value: !S.checked.length ? 'Sin revisar' : S.down ? `${S.down} caída${S.down === 1 ? '' : 's'}` : 'Funcionando' },
        { label: 'Tiempo de carga', value: S.avg == null ? '—' : (S.avg / 1000).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' s' },
        { label: 'Avisos abiertos', value: S.checked.length ? String(S.issues) : '—' },
        { label: 'Última revisión', value: S.last ? when(S.last) : 'Aún ninguna' },
      ];
    },
  });

  function renderAll() {
    renderPage(); renderSettings();
    if (document.getElementById('page-home').classList.contains('active')) OttoHome.render();
  }

  window.OttoWatch = {
    load, run, remove, add: addFromForm,
    addOwn() { return add(ws.wp_url, ws.name); },
    openSettings() { showPage('settings'); switchSettingsTab('vigila', document.getElementById('stab-vigila')); },
    reset() { W.sites = []; W.checks = []; W.loaded = false; renderAll(); },
  };

  // Al cambiar de perfil se vuelven a leer sus webs
  const baseSelect = selectWorkspace;
  selectWorkspace = async function (id) { OttoWatch.reset(); await baseSelect(id); await load(); };
  const baseShow = showPage;
  showPage = function (id) { baseShow.apply(this, arguments); if (id === 'watch') renderPage(); if (id === 'settings') renderSettings(); };
  if (typeof ws !== 'undefined' && ws) load();
})();
