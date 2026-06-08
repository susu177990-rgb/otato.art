drop policy if exists site_skill_packs_read_authenticated on public.site_skill_packs;
create policy site_skill_packs_read_authenticated on public.site_skill_packs
  for select
  to authenticated
  using (true);
