-- Move workspace API settings and image prompts to a single site-wide row.
-- Existing per-user workspace_settings rows are left in place as legacy data.
create table if not exists public.site_settings (
  id text primary key default 'global',
  llm jsonb not null default '{}'::jsonb,
  image_workspace jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id = 'global')
);

create table if not exists public.workspace_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  llm jsonb not null default '{}'::jsonb,
  image_workspace jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id, llm, image_workspace, updated_at)
select 'global', llm, image_workspace, updated_at
from public.workspace_settings
order by updated_at desc
limit 1
on conflict (id) do nothing;

insert into public.site_settings (id)
values ('global')
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

drop policy if exists site_settings_read_authenticated on public.site_settings;
drop policy if exists site_settings_write_authenticated on public.site_settings;

create policy site_settings_read_authenticated on public.site_settings
  for select
  to authenticated
  using (true);

create policy site_settings_write_authenticated on public.site_settings
  for all
  to authenticated
  using (true)
  with check (id = 'global');
