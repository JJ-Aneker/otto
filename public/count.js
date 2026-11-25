/* ============================================================
   Otto cuenta · pantalla, ajustes e Inicio
   Datos: Google Analytics 4 e Instagram, leídos por el servidor (api/count).
   La conexión se guarda en count_config; las claves, cifradas en el servidor.
   ============================================================ */
(function () {
  const C = { cfg: null, loaded: false, days: 28, ga: null, ig: null, gaErr: '', igErr: '', busy: false };
  const e = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const n0 = n => Math.round(Number(n || 0)).toLocaleString('es-ES', { useGrouping: 'always' });
  const dur = s => { s = Math.round(Number(s) || 0); return s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s` : `${s} s`; };
  const CH = { 'Organic Search': 'Google (búsqueda)', 'Direct': 'Directo', 'Organic Social': 'Redes sociales', 'Social': 'Redes sociales', 'Referral': 'Otras webs', 'Email': 'Correo', 'Paid Search': 'Anuncios en Google', 'Paid Social': 'Anuncios en redes', 'Organic Video': 'Vídeo', 'Unassigned': 'Sin clasificar', 'Display': 'Banners', 'Organic Shopping': 'Compras' };
  const chName = n => CH[n] || n;
  const CONTACT = /reserv|contact|lead|form|whatsapp|click_to_call|phone|tel|submit|book|cita|mail/i;
  const SKIP = /^(page_view|session_start|first_visit|user_engagement|scroll|click|file_download|view_search_results|form_start)$/;
  const pct = (cur, prev) => prev > 0 ? Math.round((cur - prev) / prev * 100) : null;
  const deltaHtml = (cur, prev, inv) => {
    const p = pct(cur, prev); if (p === null || p === 0) return '';
    const good = inv ? p < 0 : p > 0;
    return ` <small class="${good ? 'up' : 'down'}">${p > 0 ? '+' : '−'}${Math.abs(p)} %</small>`;
  };
  const dayShort = s => { const d = new Date(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8)); return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }); };
  const hostOf = u => { try { return new URL(u).host.replace(/^www\./, ''); } catch { return ''; } };

  /* ── datos ── */
  async function loadCfg() {
    if (typeof ws === 'undefined' || !ws) return;
    const r = await sb.from('count_config').select('*').eq('workspace_id', ws.id).maybeSingle();
    C.cfg = r.error ? null : r.data; C.loaded = true;
  }
  async function loadData(force) {
    if (!C.cfg || C.busy) return;
    const hasGa = !!(C.cfg.ga_property && C.cfg.ga_secret_id), hasIg = !!(C.cfg.ig_user_id && C.cfg.ig_secret_id);
    if (!force && (!hasGa || (C.ga && C.ga.days === C.days)) && (!hasIg || (C.ig && C.ig.days === C.days))) return;
    C.busy = true; renderAll();
    const jobs = [];
    if (hasGa) jobs.push(apiFetch('/api/count', { method: 'POST', body: JSON.stringify({ action: 'ga', days: C.days }) }).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); C.ga = d; C.gaErr = ''; }).catch(x => { C.ga = null; C.gaErr = x.message; }));
    if (hasIg) jobs.push(apiFetch('/api/count', { method: 'POST', body: JSON.stringify({ action: 'ig', days: C.days }) }).then(r => r.json()).then(d => { if (d.error) throw new Error(d.error); C.ig = d; C.igErr = ''; }).catch(x => { C.ig = null; C.igErr = x.message; }));
    await Promise.all(jobs); C.busy = false; renderAll();
  }
  async function init() { await loadCfg(); renderAll(); await loadData(); }

  /* ── cálculos ── */
  const ownPosts = () => (typeof history !== 'undefined' ? history : []).filter(h => h.wpLink).map(h => ({ link: h.wpLink, path: (() => { try { return new URL(h.wpLink).pathname; } catch { return ''; } })() }));
  const isOwn = path => path && path !== '/' && ownPosts().some(p => p.path && p.path.replace(/\/$/, '') === path.replace(/\/$/, ''));
  function contacts() {
    if (!C.ga) return [];
    const ev = C.ga.events || [], keys = ev.filter(x => x.key);
    return (keys.length ? keys : ev.filter(x => CONTACT.test(x.name) && !SKIP.test(x.name))).filter(x => x.cur || x.prev);
  }
  function insights() {
    const out = [], g = C.ga;
    if (g) {
      const s = g.summary, p = pct(s.cur.sessions, s.prev.sessions);
      if (p !== null && Math.abs(p) >= 15 && s.cur.sessions >= 20) out.push({ tone: p > 0 ? 'ok' : 'warn', title: `Las visitas ${p > 0 ? 'suben' : 'bajan'} un ${Math.abs(p)} %`, meta: `${n0(s.cur.sessions)} visitas en ${C.days} días, frente a ${n0(s.prev.sessions)} en el periodo anterior` });
      const top = (g.pages || [])[0];
      if (top && top.views >= 10) out.push({ tone: 'accent', title: `Lo más leído: ${top.title || top.path}`, meta: `${n0(top.views)} vistas${pct(top.views, top.prev) !== null ? ` · ${pct(top.views, top.prev) >= 0 ? '+' : '−'}${Math.abs(pct(top.views, top.prev))} % que antes` : ''}` });
      (g.channels || []).forEach(c => { const q = pct(c.cur, c.prev); if (q !== null && Math.abs(q) >= 25 && Math.max(c.cur, c.prev) >= 20) out.push({ tone: q > 0 ? 'ok' : 'warn', title: `Las visitas desde ${chName(c.name).toLowerCase()} ${q > 0 ? 'suben' : 'bajan'} un ${Math.abs(q)} %`, meta: `${n0(c.cur)} visitas, antes ${n0(c.prev)}` }); });
      const ct = contacts().reduce((a, x) => a + x.cur, 0), cp = contacts().reduce((a, x) => a + x.prev, 0);
      if (ct) out.push({ tone: 'ok', title: `${n0(ct)} ${ct === 1 ? 'contacto' : 'contactos'} en ${C.days} días`, meta: cp ? `Antes: ${n0(cp)}` : 'Contactos y reservas que llegan desde tu web' });
    }
    if (C.ig) { const q = pct(C.ig.cur.reach, C.ig.prev.reach); if (q !== null && Math.abs(q) >= 20) out.push({ tone: q > 0 ? 'ok' : 'warn', title: `El alcance de Instagram ${q > 0 ? 'sube' : 'baja'} un ${Math.abs(q)} %`, meta: `${n0(C.ig.cur.reach)} cuentas alcanzadas` }); }
    return out;
  }

  /* ── pantalla ── */
  const barChart = daily => {
    if (!daily.length) return '';
    const W = 640, H = 120, max = Math.max(...daily.map(d => d.sessions), 1), bw = W / daily.length;
    const bars = daily.map((d, i) => { const h = Math.max(1, d.sessions / max * (H - 8)); return `<rect x="${(i * bw + bw * .12).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw * .76).toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"><title>${dayShort(d.date)}: ${n0(d.sessions)} visitas</title></rect>`; }).join('');
    return `<div class="cnt-chart"><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Visitas por día">${bars}</svg><div class="cnt-axis"><span>${dayShort(daily[0].date)}</span><span>Máximo: ${n0(max)} en un día</span><span>${dayShort(daily[daily.length - 1].date)}</span></div></div>`;
  };

  function setupCard() {
    return `<div class="cnt-setup"><h2>Conecta tu web para ver cómo te encuentran</h2>
      <p class="muted-note">Otto lee las estadísticas de Google Analytics (visitas, de dónde llegan, páginas más vistas y contactos) y, si quieres, las de tu Instagram profesional. Solo lee: no cambia nada en tu web.</p>
      <ol class="cnt-steps"><li>Crea una cuenta de servicio en Google Cloud y descarga su clave (un archivo JSON).</li><li>Activa «Google Analytics Data API» en ese proyecto.</li><li>En Google Analytics, da acceso de Lector al correo de la cuenta de servicio.</li><li>Pega aquí el JSON y el ID de la propiedad.</li></ol>
      <div class="form-actions"><button class="btn btn-primary" onclick="OttoCount.openSettings()">Conectar Google Analytics</button></div></div>`;
  }

  function renderPage() {
    const host = document.getElementById('mod-count'); if (!host) return;
    const sub = document.querySelector('#page-count .page-sub'); if (sub) sub.textContent = 'Tus visitas, de dónde llegan y qué entradas funcionan, de un vistazo.';
    if (!C.loaded) { host.innerHTML = '<p class="muted-note">Cargando…</p>'; return; }
    const hasGa = !!(C.cfg && C.cfg.ga_secret_id), hasIg = !!(C.cfg && C.cfg.ig_secret_id);
    if (!hasGa && !hasIg) { host.innerHTML = setupCard(); return; }
    const seg = `<div class="order-bar"><div class="chips seg" role="group" aria-label="Periodo">${[7, 28, 90].map(d => `<button class="${C.days === d ? 'on' : ''}" onclick="OttoCount.period(${d})">${d} días</button>`).join('')}</div><button class="btn btn-secondary" onclick="OttoCount.refresh()" ${C.busy ? 'disabled' : ''}>${C.busy ? 'Actualizando…' : 'Actualizar'}</button></div>`;
    let h = seg;
    if (C.busy && !C.ga && !C.ig) h += '<p class="muted-note">Leyendo tus estadísticas…</p>';
    if (hasGa) {
      if (C.gaErr) h += `<div class="callout">${e(C.gaErr)} <button class="btn btn-ghost" onclick="OttoCount.openSettings()">Revisar conexión</button></div>`;
      else if (C.ga) {
        const g = C.ga, s = g.summary, ct = contacts();
        h += `<dl class="figs figs-row">
          <div><dt>Visitantes</dt><dd>${n0(s.cur.users)}${deltaHtml(s.cur.users, s.prev.users)}</dd></div>
          <div><dt>Visitas</dt><dd>${n0(s.cur.sessions)}${deltaHtml(s.cur.sessions, s.prev.sessions)}</dd></div>
          <div><dt>Páginas vistas</dt><dd>${n0(s.cur.views)}${deltaHtml(s.cur.views, s.prev.views)}</dd></div>
          <div><dt>Tiempo medio</dt><dd>${dur(s.cur.duration)}${deltaHtml(s.cur.duration, s.prev.duration)}</dd></div></dl>`;
        const ins = insights();
        if (ins.length) h += `<div class="grp">Lo que ha pasado</div><ul class="rows">${ins.slice(0, 5).map(t => `<li class="row"><span class="dot dot-${t.tone}" aria-hidden="true"></span><div class="row-main"><div class="row-title">${e(t.title)}</div><div class="row-meta">${e(t.meta)}</div></div></li>`).join('')}</ul>`;
        h += `<div class="grp">Visitas por día</div>${barChart(g.daily)}`;
        const tot = g.channels.reduce((a, c) => a + c.cur, 0) || 1;
        h += `<div class="grp">De dónde llegan</div><div class="tbl-wrap"><table class="sum-table cnt-table"><thead><tr><th>Origen</th><th>Visitas</th><th class="cnt-share">Reparto</th><th>Cambio</th></tr></thead><tbody>${g.channels.filter(c => c.cur || c.prev).map(c => `<tr><th>${e(chName(c.name))}</th><td>${n0(c.cur)}</td><td class="cnt-share"><span class="cnt-bar"><i style="width:${Math.round(c.cur / tot * 100)}%"></i></span> ${Math.round(c.cur / tot * 100)} %</td><td>${deltaHtml(c.cur, c.prev) || '—'}</td></tr>`).join('')}</tbody></table></div>`;
        h += `<div class="grp">Qué entradas y páginas funcionan</div>` + (g.pages.length ? `<div class="tbl-wrap"><table class="sum-table cnt-table"><thead><tr><th>Página</th><th>Vistas</th><th>Cambio</th></tr></thead><tbody>${g.pages.slice(0, 10).map(p => `<tr><th><span class="cnt-page">${e(p.title || p.path)}</span>${isOwn(p.path) ? ' <span class="cnt-badge">Publicada con Otto</span>' : ''}<span class="cnt-path">${e(p.path)}</span></th><td>${n0(p.views)}</td><td>${deltaHtml(p.views, p.prev) || '—'}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted-note">Todavía no hay datos de páginas.</p>');
        h += `<div class="grp">Contactos y reservas</div>` + (ct.length ? `<dl class="figs">${ct.map(x => `<div><dt>${e(x.name)}</dt><dd>${n0(x.cur)}${deltaHtml(x.cur, x.prev)}</dd></div>`).join('')}</dl>` : `<p class="muted-note">Google Analytics aún no registra contactos. Marca como «evento clave» el envío del formulario, el clic en WhatsApp o la reserva, y aparecerán aquí.</p>`);
      }
    }
    if (hasIg) {
      h += '<div class="grp">Instagram</div>';
      if (C.igErr) h += `<div class="callout">${e(C.igErr)} <button class="btn btn-ghost" onclick="OttoCount.openSettings()">Revisar conexión</button></div>`;
      else if (C.ig) {
        const i = C.ig;
        h += `<dl class="figs figs-row"><div><dt>Seguidores</dt><dd>${n0(i.followers)}</dd></div><div><dt>Alcance</dt><dd>${n0(i.cur.reach)}${deltaHtml(i.cur.reach, i.prev.reach)}</dd></div><div><dt>Visitas al perfil</dt><dd>${n0(i.cur.profile_views)}${deltaHtml(i.cur.profile_views, i.prev.profile_views)}</dd></div><div><dt>Cuentas que interactúan</dt><dd>${n0(i.cur.accounts_engaged)}${deltaHtml(i.cur.accounts_engaged, i.prev.accounts_engaged)}</dd></div></dl>`;
        h += i.posts.length ? `<ul class="rows">${i.posts.map(p => `<li class="row"><span class="dot dot-muted" aria-hidden="true"></span><div class="row-main"><div class="row-title">${e((p.caption || 'Sin texto').slice(0, 90))}</div><div class="row-meta">${n0(p.likes)} me gusta · ${n0(p.comments)} comentarios · ${new Date(p.date).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</div></div><div class="row-side"><a class="btn btn-secondary" href="${e(p.url)}" target="_blank" rel="noopener">Abrir</a></div></li>`).join('')}</ul>` : '<p class="muted-note">No hay publicaciones en este periodo.</p>';
      }
    }
    host.innerHTML = h;
  }

  /* ── Ajustes ── */
  function renderSettings() {
    const host = document.getElementById('countSettingsBody'); if (!host) return;
    const c = C.cfg || {}, hasGa = !!c.ga_secret_id, hasIg = !!c.ig_secret_id;
    host.innerHTML = `
      <div class="card"><div class="card-header"><h2>Google Analytics</h2><p>Visitas, orígenes, páginas y contactos de tu web.</p></div><div class="card-body">
        ${hasGa ? `<p class="muted-note">Conectado a la propiedad <strong>${e(c.ga_property)}</strong> con la cuenta ${e(c.ga_email || '')}.</p>` : ''}
        <div class="input-group"><label for="cntProp">ID de la propiedad</label><input type="text" id="cntProp" inputmode="numeric" placeholder="Por ejemplo: 123456789" value="${e(c.ga_property || '')}"/></div>
        <div class="input-group"><label for="cntSite">Dirección de tu web <span class="label-note">Opcional</span></label><input type="url" id="cntSite" placeholder="https://tuweb.com" value="${e(c.site_url || '')}"/></div>
        <div class="input-group"><label for="cntJson">Clave de la cuenta de servicio (JSON)</label><textarea id="cntJson" rows="4" placeholder="${hasGa ? 'Déjalo vacío para mantener la clave guardada' : 'Pega aquí el contenido del archivo JSON'}"></textarea></div>
        <div class="form-actions"><button class="btn btn-primary" id="cntGaBtn" onclick="OttoCount.saveGa()">${hasGa ? 'Guardar cambios' : 'Conectar'}</button>${hasGa ? '<button class="btn btn-ghost" onclick="OttoCount.remove(\'ga\')">Desconectar</button>' : ''}</div>
        <div class="wp-status" id="cntGaStatus"></div>
        <hr class="wp-divider"/>
        <div class="wp-instructions"><strong>Cómo conseguir los datos</strong><br>
          1. En <em>console.cloud.google.com</em> crea un proyecto y, en «IAM y administración → Cuentas de servicio», crea una cuenta. En su pestaña «Claves» añade una clave de tipo JSON: se descarga un archivo.<br>
          2. En «APIs y servicios», activa <em>Google Analytics Data API</em>.<br>
          3. En Google Analytics → Administrar → Acceso a la propiedad, añade el correo de la cuenta de servicio con el rol <em>Lector</em>.<br>
          4. El ID de la propiedad está en Administrar → Detalles de la propiedad (solo números).<br>
          Otto guarda la clave cifrada y solo la usa para leer estadísticas.</div>
      </div></div>
      <div class="card"><div class="card-header"><h2>Instagram</h2><p>Seguidores, alcance y tus publicaciones que mejor funcionan. Necesita una cuenta profesional.</p></div><div class="card-body">
        ${hasIg ? `<p class="muted-note">Conectado a la cuenta con ID <strong>${e(c.ig_user_id)}</strong>.</p>` : ''}
        <div class="input-group"><label for="cntIgId">ID de la cuenta de Instagram</label><input type="text" id="cntIgId" inputmode="numeric" placeholder="Solo números" value="${e(c.ig_user_id || '')}"/></div>
        <div class="input-group"><label for="cntIgToken">Token de acceso</label><input type="password" id="cntIgToken" autocomplete="off" placeholder="${hasIg ? 'Déjalo vacío para mantener el guardado' : 'Pega aquí el token'}"/></div>
        <div class="form-actions"><button class="btn btn-primary" onclick="OttoCount.saveIg()">${hasIg ? 'Guardar cambios' : 'Conectar'}</button>${hasIg ? '<button class="btn btn-ghost" onclick="OttoCount.remove(\'ig\')">Desconectar</button>' : ''}</div>
        <div class="wp-status" id="cntIgStatus"></div>
        <hr class="wp-divider"/>
        <div class="wp-instructions"><strong>Cómo conseguirlo</strong><br>Tu Instagram debe ser profesional y estar enlazado a una página de Facebook. En developers.facebook.com crea una app, genera un token con los permisos <em>instagram_basic</em> y <em>instagram_manage_insights</em> y copia el ID de la cuenta de Instagram. Los tokens caducan: si Otto avisa de que ha caducado, genera uno nuevo y pégalo aquí.</div>
      </div></div>`;
  }

  async function post(body, statusId, okMsg) {
    try {
      const r = await apiFetch('/api/count', { method: 'POST', body: JSON.stringify(body) }); const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || 'No se pudo guardar');
      C.cfg = d.config || C.cfg; C.ga = null; C.ig = null; C.gaErr = ''; C.igErr = '';
      showWPStatus(statusId, okMsg, 'success'); renderAll(); loadData(true);
    } catch (x) { showWPStatus(statusId, x.message, 'error'); }
  }
  function saveGa() {
    const json = document.getElementById('cntJson').value.trim();
    showWPStatus('cntGaStatus', 'Comprobando la conexión…', 'info');
    return post({ action: 'save', ga: { property: document.getElementById('cntProp').value, siteUrl: document.getElementById('cntSite').value, json: json || undefined } }, 'cntGaStatus', 'Google Analytics conectado');
  }
  function saveIg() {
    showWPStatus('cntIgStatus', 'Comprobando la conexión…', 'info');
    return post({ action: 'save', ig: { userId: document.getElementById('cntIgId').value, token: document.getElementById('cntIgToken').value.trim() || undefined } }, 'cntIgStatus', 'Instagram conectado');
  }
  async function remove(which) {
    if (!confirm(which === 'ga' ? '¿Desconectar Google Analytics? Otto borrará la clave guardada.' : '¿Desconectar Instagram? Otto borrará el token guardado.')) return;
    await post({ action: 'remove', which }, which === 'ga' ? 'cntGaStatus' : 'cntIgStatus', 'Desconectado');
  }

  /* ── Inicio ── */
  OttoHome.register({
    id: 'count', name: 'Cuenta',
    tasks() {
      if (!C.loaded) return [];
      if (!C.cfg || (!C.cfg.ga_secret_id && !C.cfg.ig_secret_id)) return [{ tone: 'muted', title: 'Conecta Google Analytics', meta: 'Así verás tus visitas y qué entradas funcionan', when: '', label: 'Conectar', run() { OttoCount.openSettings(); } }];
      return insights().slice(0, 3).map(t => ({ tone: t.tone === 'ok' ? 'accent' : t.tone, title: t.title, meta: t.meta, when: `Últimos ${C.days} días`, label: 'Ver detalle', run() { showPage('count'); } }));
    },
    figures() {
      if (!C.loaded || !C.ga) return [];
      const s = C.ga.summary, ct = contacts().reduce((a, x) => a + x.cur, 0);
      const f = [{ label: `Visitas (${C.days} días)`, value: n0(s.cur.sessions), delta: (() => { const p = pct(s.cur.sessions, s.prev.sessions); return p === null ? '' : (p >= 0 ? '+' : '−') + Math.abs(p) + ' %'; })() }, { label: 'Páginas vistas', value: n0(s.cur.views) }, { label: 'Contactos', value: n0(ct) }];
      if (C.ig) f.push({ label: 'Seguidores en Instagram', value: n0(C.ig.followers) });
      return f;
    },
  });

  function renderAll() {
    renderPage(); renderSettings();
    if (document.getElementById('page-home')?.classList.contains('active')) OttoHome.render();
  }

  window.OttoCount = {
    saveGa, saveIg, remove,
    period(d) { C.days = d; renderPage(); loadData(); },
    refresh() { return loadData(true); },
    openSettings() { showPage('settings'); switchSettingsTab('count', document.getElementById('stab-count')); },
    reset() { C.cfg = null; C.loaded = false; C.ga = null; C.ig = null; C.gaErr = ''; C.igErr = ''; renderAll(); },
  };

  const baseSelect = selectWorkspace;
  selectWorkspace = async function (id) { OttoCount.reset(); await baseSelect(id); await init(); };
  const baseShow = showPage;
  showPage = function (id) { baseShow.apply(this, arguments); if (id === 'count') { renderPage(); loadData(); } if (id === 'settings') renderSettings(); };
  if (typeof ws !== 'undefined' && ws) init();
})();
