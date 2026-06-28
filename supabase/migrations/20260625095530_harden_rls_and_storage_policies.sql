-- Harden the remaining database policy surface reported by Supabase advisors.
-- Admin helper functions stay SECURITY DEFINER because they need to read
-- admin tables under RLS, but they are no longer exposed as public RPCs.

create schema if not exists private;

revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated, service_role;

create or replace function private.current_admin_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select role
  from public.admin_roles
  where (
    user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  order by case role when 'owner' then 3 when 'admin' then 2 else 1 end desc
  limit 1;
$$;

create or replace function private.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_admin_role() in ('owner', 'admin', 'reviewer');
$$;

revoke all on function private.current_admin_role() from public, anon, authenticated;
revoke all on function private.is_site_admin() from public, anon, authenticated;
grant execute on function private.current_admin_role() to authenticated, service_role;
grant execute on function private.is_site_admin() to authenticated, service_role;

revoke execute on function public.claim_first_site_admin() from public, anon, authenticated;
revoke execute on function public.current_admin_role() from public, anon, authenticated;
revoke execute on function public.is_site_admin() from public, anon, authenticated;

drop policy if exists admin_audit_logs_read_admin on public.admin_audit_logs;
create policy admin_audit_logs_read_admin on public.admin_audit_logs
  for select
  to authenticated
  using ((select private.current_admin_role()) in ('owner', 'admin'));

drop policy if exists admin_audit_logs_insert_admin on public.admin_audit_logs;
create policy admin_audit_logs_insert_admin on public.admin_audit_logs
  for insert
  to authenticated
  with check ((select private.current_admin_role()) in ('owner', 'admin', 'reviewer'));

drop policy if exists admin_roles_read_admin on public.admin_roles;
create policy admin_roles_read_admin on public.admin_roles
  for select
  to authenticated
  using ((select private.current_admin_role()) in ('owner', 'admin', 'reviewer'));

drop policy if exists admin_roles_write_owner_admin on public.admin_roles;
drop policy if exists admin_roles_insert_owner_admin on public.admin_roles;
drop policy if exists admin_roles_update_owner_admin on public.admin_roles;
drop policy if exists admin_roles_delete_owner_admin on public.admin_roles;

create policy admin_roles_insert_owner_admin on public.admin_roles
  for insert
  to authenticated
  with check ((select private.current_admin_role()) in ('owner', 'admin'));

create policy admin_roles_update_owner_admin on public.admin_roles
  for update
  to authenticated
  using ((select private.current_admin_role()) in ('owner', 'admin'))
  with check ((select private.current_admin_role()) in ('owner', 'admin'));

create policy admin_roles_delete_owner_admin on public.admin_roles
  for delete
  to authenticated
  using ((select private.current_admin_role()) in ('owner', 'admin'));

drop policy if exists site_admins_read_admin on public.site_admins;
create policy site_admins_read_admin on public.site_admins
  for select
  to authenticated
  using ((select private.is_site_admin()));

drop policy if exists site_admins_write_admin on public.site_admins;
drop policy if exists site_admins_insert_admin on public.site_admins;
drop policy if exists site_admins_update_admin on public.site_admins;
drop policy if exists site_admins_delete_admin on public.site_admins;

create policy site_admins_insert_admin on public.site_admins
  for insert
  to authenticated
  with check ((select private.is_site_admin()));

create policy site_admins_update_admin on public.site_admins
  for update
  to authenticated
  using ((select private.is_site_admin()))
  with check ((select private.is_site_admin()));

create policy site_admins_delete_admin on public.site_admins
  for delete
  to authenticated
  using ((select private.is_site_admin()));

drop policy if exists site_settings_write_admin on public.site_settings;
drop policy if exists site_settings_insert_admin on public.site_settings;
drop policy if exists site_settings_update_admin on public.site_settings;
drop policy if exists site_settings_delete_admin on public.site_settings;

create policy site_settings_insert_admin on public.site_settings
  for insert
  to authenticated
  with check (id = 'global' and (select private.is_site_admin()));

create policy site_settings_update_admin on public.site_settings
  for update
  to authenticated
  using ((select private.is_site_admin()))
  with check (id = 'global' and (select private.is_site_admin()));

create policy site_settings_delete_admin on public.site_settings
  for delete
  to authenticated
  using ((select private.is_site_admin()));

drop policy if exists site_skill_packs_write_admin on public.site_skill_packs;
drop policy if exists site_skill_packs_insert_admin on public.site_skill_packs;
drop policy if exists site_skill_packs_update_admin on public.site_skill_packs;
drop policy if exists site_skill_packs_delete_admin on public.site_skill_packs;

create policy site_skill_packs_insert_admin on public.site_skill_packs
  for insert
  to authenticated
  with check ((select private.is_site_admin()));

create policy site_skill_packs_update_admin on public.site_skill_packs
  for update
  to authenticated
  using ((select private.is_site_admin()))
  with check ((select private.is_site_admin()));

create policy site_skill_packs_delete_admin on public.site_skill_packs
  for delete
  to authenticated
  using ((select private.is_site_admin()));

drop policy if exists site_prompt_presets_write_admin on public.site_prompt_presets;
drop policy if exists site_prompt_presets_insert_admin on public.site_prompt_presets;
drop policy if exists site_prompt_presets_update_admin on public.site_prompt_presets;
drop policy if exists site_prompt_presets_delete_admin on public.site_prompt_presets;

create policy site_prompt_presets_insert_admin on public.site_prompt_presets
  for insert
  to authenticated
  with check ((select private.is_site_admin()));

create policy site_prompt_presets_update_admin on public.site_prompt_presets
  for update
  to authenticated
  using ((select private.is_site_admin()))
  with check ((select private.is_site_admin()));

create policy site_prompt_presets_delete_admin on public.site_prompt_presets
  for delete
  to authenticated
  using ((select private.is_site_admin()));

drop policy if exists site_prompt_preset_submissions_own_read on public.site_prompt_preset_submissions;
create policy site_prompt_preset_submissions_own_read on public.site_prompt_preset_submissions
  for select
  to authenticated
  using (
    (select auth.uid()) = submitter_user_id
    or (select private.is_site_admin())
  );

drop policy if exists site_prompt_preset_submissions_own_insert on public.site_prompt_preset_submissions;
create policy site_prompt_preset_submissions_own_insert on public.site_prompt_preset_submissions
  for insert
  to authenticated
  with check (
    (select auth.uid()) = submitter_user_id
    and status = 'pending'
    and published_preset_id is null
    and reviewed_by is null
    and reviewed_at is null
  );

drop policy if exists site_prompt_preset_submissions_admin_update on public.site_prompt_preset_submissions;
create policy site_prompt_preset_submissions_admin_update on public.site_prompt_preset_submissions
  for update
  to authenticated
  using ((select private.is_site_admin()))
  with check ((select private.is_site_admin()));

drop policy if exists site_prompt_preset_submissions_admin_delete on public.site_prompt_preset_submissions;
create policy site_prompt_preset_submissions_admin_delete on public.site_prompt_preset_submissions
  for delete
  to authenticated
  using ((select private.is_site_admin()));

drop policy if exists workspace_settings_own on public.workspace_settings;
create policy workspace_settings_own on public.workspace_settings
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists projects_own on public.projects;
create policy projects_own on public.projects
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists chat_prompt_presets_own on public.chat_prompt_presets;
create policy chat_prompt_presets_own on public.chat_prompt_presets
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists site_prompt_preset_favorites_own on public.site_prompt_preset_favorites;
create policy site_prompt_preset_favorites_own on public.site_prompt_preset_favorites
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists user_api_settings_read_own on public.user_api_settings;
drop policy if exists user_api_settings_insert_own on public.user_api_settings;
drop policy if exists user_api_settings_update_own on public.user_api_settings;
drop policy if exists user_api_settings_delete_own on public.user_api_settings;

create policy user_api_settings_read_own on public.user_api_settings
  for select
  to authenticated
  using (user_id = (select auth.uid()));

create policy user_api_settings_insert_own on public.user_api_settings
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create policy user_api_settings_update_own on public.user_api_settings
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy user_api_settings_delete_own on public.user_api_settings
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists chat_conversations_select_own on public.chat_conversations;
drop policy if exists chat_conversations_insert_own on public.chat_conversations;
drop policy if exists chat_conversations_update_own on public.chat_conversations;
drop policy if exists chat_conversations_delete_own on public.chat_conversations;
drop policy if exists chat_conversations_own on public.chat_conversations;

create policy chat_conversations_own on public.chat_conversations
  for all
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = chat_conversations.project_id
          and projects.user_id = (select auth.uid())
      )
    )
  )
  with check (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = chat_conversations.project_id
          and projects.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists canvas_boards_select_own on public.canvas_boards;
drop policy if exists canvas_boards_insert_own on public.canvas_boards;
drop policy if exists canvas_boards_update_own on public.canvas_boards;
drop policy if exists canvas_boards_delete_own on public.canvas_boards;
drop policy if exists canvas_boards_own on public.canvas_boards;

create policy canvas_boards_own on public.canvas_boards
  for all
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = canvas_boards.project_id
          and projects.user_id = (select auth.uid())
      )
    )
  )
  with check (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = canvas_boards.project_id
          and projects.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists image_gallery_own on public.image_gallery_records;
create policy image_gallery_own on public.image_gallery_records
  for all
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = image_gallery_records.project_id
          and projects.user_id = (select auth.uid())
      )
    )
  )
  with check (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = image_gallery_records.project_id
          and projects.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists video_gallery_own on public.video_gallery_records;
create policy video_gallery_own on public.video_gallery_records
  for all
  to authenticated
  using (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = video_gallery_records.project_id
          and projects.user_id = (select auth.uid())
      )
    )
  )
  with check (
    (select auth.uid()) = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = video_gallery_records.project_id
          and projects.user_id = (select auth.uid())
      )
    )
  );

drop policy if exists project_assets_own on public.project_assets;
create policy project_assets_own on public.project_assets
  for all
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.projects
      where projects.id = project_assets.project_id
        and projects.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.projects
      where projects.id = project_assets.project_id
        and projects.user_id = (select auth.uid())
    )
  );

drop policy if exists generated_images_select_public on storage.objects;
drop policy if exists generated_images_select_own on storage.objects;
drop policy if exists generated_images_site_mode_covers_select on storage.objects;
drop policy if exists generated_images_insert_own on storage.objects;
drop policy if exists generated_images_update_own on storage.objects;
drop policy if exists generated_images_delete_own on storage.objects;
drop policy if exists generated_images_site_mode_covers_insert on storage.objects;
drop policy if exists generated_images_site_mode_covers_update on storage.objects;
drop policy if exists generated_images_site_mode_covers_delete on storage.objects;

create policy generated_images_select_own on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = ((select auth.uid())::text)
  );

create policy generated_images_insert_own on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = ((select auth.uid())::text)
  );

create policy generated_images_update_own on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = ((select auth.uid())::text)
  )
  with check (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = ((select auth.uid())::text)
  );

create policy generated_images_delete_own on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = ((select auth.uid())::text)
  );

create policy generated_images_site_mode_covers_select on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = 'site'
    and (storage.foldername(name))[2] = 'mode-covers'
    and (select private.is_site_admin())
  );

create policy generated_images_site_mode_covers_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = 'site'
    and (storage.foldername(name))[2] = 'mode-covers'
    and (select private.is_site_admin())
  );

create policy generated_images_site_mode_covers_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = 'site'
    and (storage.foldername(name))[2] = 'mode-covers'
    and (select private.is_site_admin())
  )
  with check (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = 'site'
    and (storage.foldername(name))[2] = 'mode-covers'
    and (select private.is_site_admin())
  );

create policy generated_images_site_mode_covers_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = 'site'
    and (storage.foldername(name))[2] = 'mode-covers'
    and (select private.is_site_admin())
  );
