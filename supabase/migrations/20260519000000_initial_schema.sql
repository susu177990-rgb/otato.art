-- Site-wide workspace settings (LLM + image workbench).
-- SaaS contract: this is operator-managed global config, not per-user data.
create table if not exists public.site_settings (
  id text primary key default 'global',
  llm jsonb not null default '{}'::jsonb,
  image_workspace jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id = 'global')
);

alter table public.site_settings enable row level security;

create policy site_settings_read_authenticated on public.site_settings
  for select
  to authenticated
  using (true);

create policy site_settings_write_authenticated on public.site_settings
  for all
  to authenticated
  using (true)
  with check (id = 'global');

-- Legacy per-user workspace settings kept for compatibility with earlier local migrations.
create table if not exists public.workspace_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  llm jsonb not null default '{}'::jsonb,
  image_workspace jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspace_settings enable row level security;

create policy workspace_settings_own on public.workspace_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Script projects (full Project JSON in data)
create table if not exists public.projects (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

create policy projects_own on public.projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Image gallery records
create table if not exists public.image_gallery_records (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists image_gallery_user_created_idx
  on public.image_gallery_records (user_id, created_at desc);

alter table public.image_gallery_records enable row level security;

create policy image_gallery_own on public.image_gallery_records
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
