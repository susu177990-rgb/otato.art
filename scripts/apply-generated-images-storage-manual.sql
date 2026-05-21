-- Supabase Dashboard → SQL Editor：创建生图 Storage 桶与策略（与 20260521100000_generated_images_storage.sql 一致）

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

drop policy if exists generated_images_insert_own on storage.objects;
drop policy if exists generated_images_update_own on storage.objects;
drop policy if exists generated_images_delete_own on storage.objects;
drop policy if exists generated_images_select_public on storage.objects;

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

create policy generated_images_select_public on storage.objects
  for select
  to public
  using (bucket_id = 'generated-images');
