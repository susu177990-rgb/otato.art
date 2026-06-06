-- 若 supabase db push 不可用，在 Supabase Dashboard → SQL Editor 中整段执行本文件。
-- 对话 / Skill 功能依赖这些表。

-- from 20260519120000_chat_workspace.sql
create table if not exists public.chat_conversations (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '新对话',
  messages jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  enabled_skill_pack_ids text[] null,
  updated_at timestamptz not null default now()
);

create index if not exists chat_conversations_user_updated_idx
  on public.chat_conversations (user_id, updated_at desc);

alter table public.chat_conversations enable row level security;

drop policy if exists chat_conversations_own on public.chat_conversations;
create policy chat_conversations_own on public.chat_conversations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.chat_conversations
  add column if not exists chat_mode text not null default 'prompt'
    check (chat_mode in ('skill', 'prompt'));

alter table public.chat_conversations
  add column if not exists selected_skill_pack_id text null;

alter table public.chat_conversations
  add column if not exists selected_chat_preset_id text null;

alter table public.chat_conversations
  add column if not exists preferred_llm_model_id text null;

create table if not exists public.chat_skill_packs (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  skills jsonb not null,
  imported_at timestamptz not null default now()
);

create index if not exists chat_skill_packs_user_imported_idx
  on public.chat_skill_packs (user_id, imported_at desc);

alter table public.chat_skill_packs enable row level security;

drop policy if exists chat_skill_packs_own on public.chat_skill_packs;
create policy chat_skill_packs_own on public.chat_skill_packs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.site_settings
  add column if not exists chat jsonb not null default '{}'::jsonb;

-- from 20260519130000_site_skill_packs.sql
create table if not exists public.site_skill_packs (
  id text primary key,
  title text not null,
  display_label text not null,
  skills jsonb not null,
  imported_at timestamptz not null default now()
);

create index if not exists site_skill_packs_imported_idx
  on public.site_skill_packs (imported_at desc);

alter table public.site_skill_packs enable row level security;

drop policy if exists site_skill_packs_read_authenticated on public.site_skill_packs;
create policy site_skill_packs_read_authenticated on public.site_skill_packs
  for select
  to authenticated
  using (true);

drop policy if exists site_skill_packs_write_authenticated on public.site_skill_packs;
create policy site_skill_packs_write_authenticated on public.site_skill_packs
  for all
  to authenticated
  using (true)
  with check (true);

alter table public.site_skill_packs
  add column if not exists display_label text;

update public.site_skill_packs
set display_label = coalesce(nullif(trim(display_label), ''), nullif(trim(skills -> 0 ->> 'name'), ''), title)
where display_label is null or trim(display_label) = '';

insert into public.site_skill_packs (id, title, display_label, skills, imported_at)
select distinct on (id) id, title, coalesce(nullif(trim(skills -> 0 ->> 'name'), ''), title), skills, imported_at
from public.chat_skill_packs
order by id, imported_at desc
on conflict (id) do nothing;

-- from 20260519150000_site_skill_packs_chat_usage_hint.sql
alter table public.site_skill_packs
  add column if not exists chat_usage_hint text null;
