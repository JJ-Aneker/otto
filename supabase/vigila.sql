-- ============================================================
-- Otto vigila · tablas nuevas
-- Supabase → SQL Editor → New query → pegar todo → Run
-- (si ya existe el esquema principal, esto solo añade las tablas de Vigila)
-- ============================================================

create table if not exists public.watch_sites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  url          text not null,
  label        text,
  created_at   timestamptz not null default now(),
  unique (workspace_id, url)
);

create table if not exists public.watch_checks (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.watch_sites(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  checked_at    timestamptz not null default now(),
  ok            boolean not null,
  status_code   int,
  response_ms   int,
  ssl_days_left int,
  pages_checked int not null default 0,
  issues        jsonb not null default '[]'
);

create index if not exists watch_sites_ws_idx  on public.watch_sites (workspace_id);
create index if not exists watch_checks_ws_idx on public.watch_checks (workspace_id, checked_at desc);
create index if not exists watch_checks_site_idx on public.watch_checks (site_id, checked_at desc);

alter table public.watch_sites  enable row level security;
alter table public.watch_checks enable row level security;

-- Las webs a vigilar las gestiona el dueño del perfil desde el navegador
create policy "watch_sites: solo el dueño del perfil"
  on public.watch_sites for all
  using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));

-- Las revisiones solo se LEEN desde el navegador; las escribe el servidor
create policy "watch_checks: lectura del dueño"
  on public.watch_checks for select
  using (public.owns_workspace(workspace_id));
