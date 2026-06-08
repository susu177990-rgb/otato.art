create table if not exists public.user_api_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  llm jsonb not null default '{}'::jsonb,
  image_models jsonb not null default '{}'::jsonb,
  video_models jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_api_settings enable row level security;

drop policy if exists user_api_settings_read_own on public.user_api_settings;
drop policy if exists user_api_settings_insert_own on public.user_api_settings;
drop policy if exists user_api_settings_update_own on public.user_api_settings;
drop policy if exists user_api_settings_delete_own on public.user_api_settings;

create policy user_api_settings_read_own on public.user_api_settings
  for select
  to authenticated
  using (user_id = auth.uid());

create policy user_api_settings_insert_own on public.user_api_settings
  for insert
  to authenticated
  with check (user_id = auth.uid());

create policy user_api_settings_update_own on public.user_api_settings
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy user_api_settings_delete_own on public.user_api_settings
  for delete
  to authenticated
  using (user_id = auth.uid());
