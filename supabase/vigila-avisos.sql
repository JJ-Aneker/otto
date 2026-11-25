-- ============================================================
-- Otto vigila · avisos con estado (abierto / ignorado / resuelto)
-- Supabase → SQL Editor → New query → pegar todo → Run
-- Requiere haber ejecutado antes vigila.sql
-- ============================================================

create table if not exists public.watch_issues (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.watch_sites(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  type          text not null,                       -- down, slow, ssl, seo_meta, seo_title, heavy_image
  severity      text not null default 'warn',        -- error | warn
  message       text not null,
  detail        text,
  items         jsonb not null default '[]',
  status        text not null default 'open' check (status in ('open','ignored','resolved')),
  snoozed_until timestamptz,                         -- si está ignorado con fecha, vuelve a abrirse ese día
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  resolved_at   timestamptz,
  unique (site_id, type)
);

create index if not exists watch_issues_ws_idx on public.watch_issues (workspace_id, status);

alter table public.watch_issues enable row level security;

drop policy if exists "watch_issues_select" on public.watch_issues;
create policy "watch_issues_select" on public.watch_issues
  for select using (public.owns_workspace(workspace_id));

drop policy if exists "watch_issues_update" on public.watch_issues;
create policy "watch_issues_update" on public.watch_issues
  for update using (public.owns_workspace(workspace_id)) with check (public.owns_workspace(workspace_id));

-- Permisos de acceso
grant select, update on public.watch_issues to authenticated;
grant all on public.watch_issues to service_role;
