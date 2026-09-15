-- Rode este script inteiro no SQL Editor do seu projeto Supabase
-- (Supabase > seu projeto > SQL Editor > New query > colar > Run)

create extension if not exists pgcrypto;

create table if not exists subjects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#2F6B57',
  created_at timestamptz not null default now()
);

create table if not exists items (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references subjects(id) on delete cascade,
  type text not null check (type in ('pdf', 'youtube')),
  title text not null,
  video_id text,
  file_path text,
  created_at timestamptz not null default now()
);

-- Habilita RLS (obrigatório no Supabase) e libera acesso total,
-- já que o site é pensado para uso doméstico, sem login.
-- Se quiser restringir mais tarde, é só trocar as políticas abaixo.
alter table subjects enable row level security;
alter table items enable row level security;

drop policy if exists "Allow all on subjects" on subjects;
create policy "Allow all on subjects" on subjects
  for all using (true) with check (true);

drop policy if exists "Allow all on items" on items;
create policy "Allow all on items" on items
  for all using (true) with check (true);

-- Depois de rodar este script:
-- 1. Vá em Storage (menu lateral) e crie um bucket chamado exatamente: study-files
--    Marque a opção "Public bucket" ao criar.
-- 2. Rode o bloco abaixo para liberar leitura/escrita de arquivos nesse bucket.

drop policy if exists "Allow all on study-files" on storage.objects;
create policy "Allow all on study-files" on storage.objects
  for all using (bucket_id = 'study-files') with check (bucket_id = 'study-files');
