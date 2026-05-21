-- 生图结果持久化：Supabase Storage 存像素，image_gallery_records / chat 只存稳定 URL

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'generated-images',
  'generated-images',
  true,
  52428800,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/bmp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- 登录用户只能写入自己的目录：{user_id}/{object_id}.{ext}
create policy generated_images_insert_own on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy generated_images_update_own on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy generated_images_delete_own on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'generated-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 公开桶：任何人可读（用于 <img src> 跨设备展示）
create policy generated_images_select_public on storage.objects
  for select
  to public
  using (bucket_id = 'generated-images');
