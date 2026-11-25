-- ============================================================
-- Otto ordena · documentos (facturas y tickets), categorías y almacén privado
-- Supabase → SQL Editor → New query → pegar todo → Run
-- Requiere el esquema principal (función owns_workspace)
-- ============================================================

-- Categorías de gasto de cada perfil (el "maestro")
create table if not exists public.order_categories (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  concept      text not null,            -- lo concreto: Gasolina, Teléfono, Gestoría…
  expense_type text not null,            -- lo que ve la gestoría: Suministro, Colaboradores…
  examples     text not null default '', -- proveedores o palabras típicas, separados por comas
  position     int  not null default 0,
  created_at   timestamptz not null default now(),
  unique (workspace_id, concept)
);

-- Documentos
create table if not exists public.order_docs (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  direction      text not null default 'compra' check (direction in ('compra','venta')),
  status         text not null default 'pending' check (status in ('pending','review','done','error')),
  file_path      text not null,
  file_name      text not null,
  mime           text,
  file_size      int,
  doc_type       text check (doc_type in ('factura','ticket','otro')),
  supplier       text,
  supplier_tax_id text,
  doc_number     text,
  doc_date       date,
  currency       text not null default 'EUR',
  description    text,
  base_amount    numeric(12,2),
  vat_rate       numeric(5,2),
  vat_amount     numeric(12,2),
  total          numeric(12,2),
  concept        text,                   -- copia del concepto elegido (no cambia si luego editas el maestro)
  expense_type   text,
  notes          text,
  lines          jsonb not null default '[]',
  flags          jsonb not null default '[]',
  duplicate_of   uuid references public.order_docs(id) on delete set null,
  extract_error  text,
  created_at     timestamptz not null default now(),
  reviewed_at    timestamptz
);

create index if not exists order_docs_ws_idx   on public.order_docs (workspace_id, doc_date desc);
create index if not exists order_docs_dup_idx  on public.order_docs (workspace_id, doc_number);
create index if not exists order_cats_ws_idx   on public.order_categories (workspace_id, position);

alter table public.order_categories enable row level security;
alter table public.order_docs       enable row level security;

drop policy if exists "order_categories: dueño" on public.order_categories;
create policy "order_categories: dueño" on public.order_categories
  for all using (public.owns_workspace(workspace_id)) with check (public.owns_workspace(workspace_id));

drop policy if exists "order_docs: dueño" on public.order_docs;
create policy "order_docs: dueño" on public.order_docs
  for all using (public.owns_workspace(workspace_id)) with check (public.owns_workspace(workspace_id));

-- Permisos de acceso
grant select, insert, update, delete on public.order_categories to authenticated;
grant select, insert, update, delete on public.order_docs        to authenticated;
grant all on public.order_categories to service_role;
grant all on public.order_docs       to service_role;

-- Almacén privado de archivos: una carpeta por perfil (ruta: <id del perfil>/<id del documento>.<ext>)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ordena', 'ordena', false, 10485760,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp'];

drop policy if exists "ordena: ver lo propio"   on storage.objects;
drop policy if exists "ordena: subir lo propio" on storage.objects;
drop policy if exists "ordena: borrar lo propio" on storage.objects;

create policy "ordena: ver lo propio" on storage.objects for select to authenticated
  using (bucket_id = 'ordena' and public.owns_workspace(((storage.foldername(name))[1])::uuid));
create policy "ordena: subir lo propio" on storage.objects for insert to authenticated
  with check (bucket_id = 'ordena' and public.owns_workspace(((storage.foldername(name))[1])::uuid));
create policy "ordena: borrar lo propio" on storage.objects for delete to authenticated
  using (bucket_id = 'ordena' and public.owns_workspace(((storage.foldername(name))[1])::uuid));
