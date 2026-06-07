create table if not exists public.site_prompt_preset_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  preset_id text not null references public.site_prompt_presets(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, preset_id)
);

create index if not exists site_prompt_preset_favorites_preset_idx
  on public.site_prompt_preset_favorites (preset_id);

alter table public.site_prompt_preset_favorites enable row level security;

drop policy if exists site_prompt_preset_favorites_own on public.site_prompt_preset_favorites;
create policy site_prompt_preset_favorites_own on public.site_prompt_preset_favorites
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

revoke all on table public.site_prompt_preset_favorites from anon, authenticated;
grant select, insert, update, delete on table public.site_prompt_preset_favorites to authenticated;
