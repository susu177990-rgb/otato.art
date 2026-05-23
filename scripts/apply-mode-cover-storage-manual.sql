-- 手动执行：Supabase SQL Editor 中运行，启用模式封面上传（无需 SUPABASE_SERVICE_ROLE_KEY）
-- 依赖：20260521100000_generated_images_storage.sql、20260523090000_harden_workspace_schema.sql（is_site_admin）

drop policy if exists generated_images_site_mode_covers_insert on storage.objects;
create policy generated_images_site_mode_covers_insert on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = 'site'
    and (storage.foldername(name))[2] = 'mode-covers'
    and public.is_site_admin()
  );

drop policy if exists generated_images_site_mode_covers_update on storage.objects;
create policy generated_images_site_mode_covers_update on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = 'site'
    and (storage.foldername(name))[2] = 'mode-covers'
    and public.is_site_admin()
  )
  with check (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = 'site'
    and (storage.foldername(name))[2] = 'mode-covers'
    and public.is_site_admin()
  );

drop policy if exists generated_images_site_mode_covers_delete on storage.objects;
create policy generated_images_site_mode_covers_delete on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = 'site'
    and (storage.foldername(name))[2] = 'mode-covers'
    and public.is_site_admin()
  );
