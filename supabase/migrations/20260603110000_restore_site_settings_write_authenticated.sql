-- Current internal product policy: any authenticated user may update the
-- shared site settings row from the Settings page.

drop policy if exists site_settings_write_admin on public.site_settings;
drop policy if exists site_settings_write_authenticated on public.site_settings;

create policy site_settings_write_authenticated on public.site_settings
  for all
  to authenticated
  using (true)
  with check (id = 'global');
