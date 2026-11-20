-- ============================================================
-- Esquema Supabase — Agente de contenidos multiusuario
-- Supabase → SQL Editor → New query → pegar todo → Run
-- Los usuarios (email + contraseña) los gestiona Supabase Auth.
-- ============================================================

create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. WORKSPACES: un perfil por cliente o nicho
--    (lo que hoy está fijo en el código para Paqui)
-- ------------------------------------------------------------
create table public.workspaces (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  niche        text,                       -- fotografía, inmobiliaria, restauración…
  language     text not null default 'es',
  tone         text,
  knowledge    text,                       -- base de conocimiento del negocio
  keywords     text,
  wp_url       text,
  wp_user      text,
  instagram    jsonb not null default '{}',
  ai_provider  text not null default 'anthropic'
               check (ai_provider in ('anthropic','openai','gemini','mistral')),
  ai_model     text,
  ai_secret_id uuid,                       -- clave de IA que usa este perfil
  wp_secret_id uuid,                       -- contraseña de WordPress cifrada
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 2. SECRETS: API keys y contraseñas, SIEMPRE cifradas
--    El navegador nunca recibe el valor, solo una pista (key_hint).
--    El cifrado/descifrado lo hace el servidor (Vercel).
-- ------------------------------------------------------------
create table public.secrets (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  kind        text not null
              check (kind in ('anthropic','openai','gemini','mistral','wordpress')),
  label       text not null,
  key_hint    text not null,               -- ej. "…a9F2"
  ciphertext  text not null,
  iv          text not null,
  created_at  timestamptz not null default now()
);

alter table public.workspaces
  add constraint workspaces_ai_secret_fk
  foreign key (ai_secret_id) references public.secrets(id) on delete set null;

alter table public.workspaces
  add constraint workspaces_wp_secret_fk
  foreign key (wp_secret_id) references public.secrets(id) on delete set null;

-- ------------------------------------------------------------
-- 3. TOPICS: calendario editorial de cada perfil
-- ------------------------------------------------------------
create table public.topics (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name         text not null,
  category     text,
  season       text check (season in ('primavera','verano','otoño','invierno')),
  angle        text,
  position     int  not null default 0,
  done         boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 4. POSTS: historial de posts generados
-- ------------------------------------------------------------
create table public.posts (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  topic_id     uuid references public.topics(id) on delete set null,
  title        text,
  slug         text,
  content      jsonb not null,             -- SEO, texto, HTML, imágenes, Instagram
  season       text,
  status       text not null default 'draft' check (status in ('draft','published')),
  wp_link      text,
  created_at   timestamptz not null default now()
);

-- ------------------------------------------------------------
-- 5. USAGE_LOG: consumo de tokens por perfil, proveedor y modelo
-- ------------------------------------------------------------
create table public.usage_log (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  provider      text not null,
  model         text,
  input_tokens  int  not null default 0,
  output_tokens int  not null default 0,
  label         text,
  created_at    timestamptz not null default now()
);

create index on public.workspaces (owner_id);
create index on public.secrets (owner_id);
create index on public.topics (workspace_id, position);
create index on public.posts (workspace_id, created_at desc);
create index on public.usage_log (workspace_id, created_at desc);

-- ------------------------------------------------------------
-- SEGURIDAD (Row Level Security): cada usuario solo ve lo suyo
-- ------------------------------------------------------------
alter table public.workspaces enable row level security;
alter table public.secrets    enable row level security;
alter table public.topics     enable row level security;
alter table public.posts      enable row level security;
alter table public.usage_log  enable row level security;

create or replace function public.owns_workspace(ws uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspaces w
    where w.id = ws and w.owner_id = auth.uid()
  );
$$;

create policy "workspaces: solo el dueño"
  on public.workspaces for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy "topics: solo el dueño del perfil"
  on public.topics for all
  using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));

create policy "posts: solo el dueño del perfil"
  on public.posts for all
  using (public.owns_workspace(workspace_id))
  with check (public.owns_workspace(workspace_id));

-- El consumo solo se LEE desde el navegador; lo escribe el servidor.
create policy "usage_log: lectura del dueño"
  on public.usage_log for select
  using (public.owns_workspace(workspace_id));

-- Secrets: el navegador solo puede LEER la pista, nunca el cifrado.
-- Crear y borrar claves lo hace el servidor con la service key.
create policy "secrets: lectura de pistas del dueño"
  on public.secrets for select
  using (owner_id = auth.uid());

revoke all on public.secrets from anon, authenticated;
grant select (id, owner_id, kind, label, key_hint, created_at)
  on public.secrets to authenticated;

-- ------------------------------------------------------------
-- FASE 2 (más adelante): equipos, para que una agencia
-- comparta perfiles con sus copywriters → tabla workspace_members.
-- ------------------------------------------------------------
