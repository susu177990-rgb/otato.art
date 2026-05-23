-- 模式封面：站点管理员可读写 generated-images/site/mode-covers/*（无需 service role）

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
