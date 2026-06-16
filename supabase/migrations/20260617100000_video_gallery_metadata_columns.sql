-- Keep project-list counts off large gallery JSON payloads.
-- Image gallery already has synced metadata columns; video gallery now mirrors that contract.

alter table public.video_gallery_records
  add column if not exists mode_id text,
  add column if not exists model_id text,
  add column if not exists status text,
  add column if not exists video_url text;

create or replace function public.sync_video_gallery_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.mode_id = nullif(trim(coalesce(new.data ->> 'modeId', new.mode_id, '')), '');
  new.model_id = nullif(trim(coalesce(new.data ->> 'modelId', new.model_id, '')), '');
  new.status = nullif(trim(coalesce(new.data ->> 'status', new.status, '')), '');
  new.video_url = nullif(trim(coalesce(new.data ->> 'videoUrl', new.video_url, '')), '');
  return new;
end;
$$;

drop trigger if exists video_gallery_records_sync_metadata on public.video_gallery_records;
create trigger video_gallery_records_sync_metadata
  before insert or update of data on public.video_gallery_records
  for each row execute function public.sync_video_gallery_metadata();

update public.video_gallery_records
set data = data
where data is not null;

create index if not exists video_gallery_user_status_created_idx
  on public.video_gallery_records (user_id, status, created_at desc);

create index if not exists video_gallery_project_status_created_idx
  on public.video_gallery_records (project_id, status, created_at desc, id desc)
  where project_id is not null;
