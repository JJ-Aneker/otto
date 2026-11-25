-- ============================================================
-- Otto ordena · libro de la gestoría guardado, importación y panel anual
-- Supabase → SQL Editor → New query → pegar todo → Run
-- Requiere haber ejecutado antes ordena.sql
-- ============================================================

-- Los documentos importados del libro no tienen archivo adjunto
alter table public.order_docs alter column file_path drop not null;
alter table public.order_docs add column if not exists source text not null default 'archivo';  -- 'archivo' | 'libro'

-- Libro de ingresos y gastos de la gestoría (uno por perfil)
create table if not exists public.order_book (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  file_path    text not null,
  file_name    text not null,
  file_size    int,
  updated_at   timestamptz not null default now()
);
alter table public.order_book enable row level security;
drop policy if exists "order_book: dueño" on public.order_book;
create policy "order_book: dueño" on public.order_book
  for all using (public.owns_workspace(workspace_id)) with check (public.owns_workspace(workspace_id));
grant select, insert, update, delete on public.order_book to authenticated;
grant all on public.order_book to service_role;

-- El almacén privado acepta también archivos de Excel
update storage.buckets
   set allowed_mime_types = array['application/pdf','image/jpeg','image/png','image/webp',
                                  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
 where id = 'ordena';
