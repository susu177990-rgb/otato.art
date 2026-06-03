-- Video workspace settings + video gallery records
-- Mirrors image workspace + image_gallery_records patterns.

-- 1) Workspace snapshot schema: add video_workspace jsonb
alter table if exists public.site_settings
  add column if not exists video_workspace jsonb not null default '{}'::jsonb;

alter table if exists public.workspace_settings
  add column if not exists video_workspace jsonb not null default '{}'::jsonb;

-- 2) Video gallery records table (per-user, JSONB payload)
create table if not exists public.video_gallery_records (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists video_gallery_user_created_idx
  on public.video_gallery_records (user_id, created_at desc);

alter table public.video_gallery_records enable row level security;

create policy video_gallery_own on public.video_gallery_records
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

