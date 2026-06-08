create table if not exists public.site_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.site_admins enable row level security;

delete from public.site_admins
where lower(email) <> lower('1779916397@qq.com');

insert into public.site_admins (email)
values ('1779916397@qq.com')
on conflict (email) do nothing;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.site_admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;

drop policy if exists site_admins_read_admin on public.site_admins;
create policy site_admins_read_admin on public.site_admins
  for select
  to authenticated
  using (public.is_site_admin());

drop policy if exists site_admins_write_admin on public.site_admins;
create policy site_admins_write_admin on public.site_admins
  for all
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists site_settings_write_authenticated on public.site_settings;
drop policy if exists site_settings_write_admin on public.site_settings;
create policy site_settings_write_admin on public.site_settings
  for all
  to authenticated
  using (public.is_site_admin())
  with check (id = 'global' and public.is_site_admin());

drop policy if exists site_skill_packs_write_authenticated on public.site_skill_packs;
drop policy if exists site_skill_packs_write_admin on public.site_skill_packs;
create policy site_skill_packs_write_admin on public.site_skill_packs
  for all
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists site_prompt_presets_write_authenticated on public.site_prompt_presets;
drop policy if exists site_prompt_presets_write_admin on public.site_prompt_presets;
create policy site_prompt_presets_write_admin on public.site_prompt_presets
  for all
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());
