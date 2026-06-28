-- Backfill image gallery metadata columns for rows that predate the
-- sync_image_gallery_metadata trigger. Counters and project lists should be
-- able to rely on typed columns instead of repeatedly parsing JSONB.

update public.image_gallery_records
set
  mode_id = nullif(trim(coalesce(data ->> 'modeId', mode_id, '')), ''),
  model_id = nullif(trim(coalesce(data ->> 'modelId', model_id, '')), ''),
  status = nullif(trim(coalesce(data ->> 'status', status, '')), ''),
  image_url = nullif(trim(coalesce(data ->> 'imageUrl', image_url, '')), '')
where data is not null
  and (
    mode_id is null
    or model_id is null
    or status is null
    or image_url is null
  );

create index if not exists image_gallery_project_status_created_idx
  on public.image_gallery_records (project_id, status, created_at desc, id desc)
  where project_id is not null;
