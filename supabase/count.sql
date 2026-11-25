-- ============================================================
-- Otto cuenta · conexión con Google Analytics 4 e Instagram
-- Supabase → SQL Editor → New query → pegar todo → Run
-- Requiere el esquema principal (tabla secrets y función owns_workspace)
-- ============================================================

-- La tabla de claves acepta dos tipos nuevos
alter table public.secrets drop constraint if exists secrets_kind_check;
alter table public.secrets add constraint secrets_kind_check
  check (kind in ('anthropic','openai','gemini','mistral','wordpress','ga4','instagram'));

-- Conexión de cada perfil (las claves van cifradas en secrets; aquí solo su id)
create table if not exists public.count_config (
  workspace_id  uuid primary key references public.workspaces(id) on delete cascade,
  ga_property   text,                                   -- ID numérico de la propiedad GA4
  ga_secret_id  uuid references public.secrets(id) on delete set null,
  ga_email      text,                                   -- correo de la cuenta de servicio (para darle acceso)
  site_url      text,                                   -- web, para reconocer las entradas publicadas con Otto
  ig_user_id    text,
  ig_secret_id  uuid references public.secrets(id) on delete set null,
  updated_at    timestamptz not null default now()
);
alter table public.count_config enable row level security;
drop policy if exists "count_config: lectura del dueño" on public.count_config;
create policy "count_config: lectura del dueño" on public.count_config
  for select using (public.owns_workspace(workspace_id));
grant select on public.count_config to authenticated;
grant all on public.count_config to service_role;
