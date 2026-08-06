-- Durable, retryable media cleanup. Database references are removed in the
-- same transaction that records the corresponding cleanup work.

create table if not exists public.media_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  target text not null,
  target_kind text not null default 'url' check (target_kind in ('url', 'object', 'prefix')),
  source text not null,
  source_ref text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create unique index if not exists media_cleanup_jobs_open_target_idx
  on public.media_cleanup_jobs (user_id, target_kind, target)
  where status in ('pending', 'processing', 'failed');
create index if not exists media_cleanup_jobs_due_idx
  on public.media_cleanup_jobs (next_attempt_at, created_at)
  where status in ('pending', 'failed');

alter table public.media_cleanup_jobs enable row level security;
drop policy if exists media_cleanup_jobs_read_own on public.media_cleanup_jobs;
create policy media_cleanup_jobs_read_own on public.media_cleanup_jobs
  for select using (auth.uid() = user_id);
grant select on public.media_cleanup_jobs to authenticated;
grant all on public.media_cleanup_jobs to service_role;

create or replace function public.enqueue_media_cleanup_job(
  p_user_id uuid,
  p_target text,
  p_target_kind text,
  p_source text,
  p_source_ref text default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_target is null or btrim(p_target) = '' then return; end if;
  insert into public.media_cleanup_jobs(user_id, target, target_kind, source, source_ref)
  values (p_user_id, p_target, p_target_kind, p_source, p_source_ref)
  on conflict (user_id, target_kind, target) where status in ('pending', 'processing', 'failed')
  do nothing;
end;
$$;
revoke all on function public.enqueue_media_cleanup_job(uuid,text,text,text,text) from public, anon, authenticated;
grant execute on function public.enqueue_media_cleanup_job(uuid,text,text,text,text) to service_role;

create or replace function public.enqueue_media_cleanup(
  p_target text,
  p_target_kind text,
  p_source text,
  p_source_ref text default null
) returns void language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid();
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_target_kind not in ('url', 'object', 'prefix') then raise exception 'invalid target kind'; end if;
  -- Authenticated callers may enqueue only URLs (validated by the worker against
  -- the configured R2 origin) or keys inside their own namespace.
  if p_target_kind <> 'url'
     and p_target not like v_user::text || '/%'
     and p_target not like 'ephemeral/' || v_user::text || '/%' then
    raise exception 'target is outside user namespace';
  end if;
  perform public.enqueue_media_cleanup_job(v_user, p_target, p_target_kind, p_source, p_source_ref);
end;
$$;
revoke all on function public.enqueue_media_cleanup(text,text,text,text) from public, anon;
grant execute on function public.enqueue_media_cleanup(text,text,text,text) to authenticated, service_role;

create or replace function public.finalize_gallery_replacement(
  p_gallery text,
  p_keep_ids text[],
  p_project_id text default null
) returns integer language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_count integer := 0;
  v_row record;
  v_url text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_gallery not in ('image', 'video') then raise exception 'invalid gallery'; end if;

  if p_gallery = 'image' then
    for v_row in
      select id, data from public.image_gallery_records
      where user_id = v_user and project_id is not distinct from p_project_id
        and not (id = any(coalesce(p_keep_ids, array[]::text[])))
      for update
    loop
      foreach v_url in array array[v_row.data->>'imageUrl', v_row.data->>'thumbnailUrl'] loop
        perform public.enqueue_media_cleanup_job(v_user, v_url, 'url', 'image_gallery_replace', v_row.id);
      end loop;
      delete from public.image_gallery_records where id = v_row.id and user_id = v_user;
      v_count := v_count + 1;
    end loop;
  else
    for v_row in
      select id, data from public.video_gallery_records
      where user_id = v_user and project_id is not distinct from p_project_id
        and not (id = any(coalesce(p_keep_ids, array[]::text[])))
      for update
    loop
      perform public.enqueue_media_cleanup_job(v_user, v_row.data->>'videoUrl', 'url', 'video_gallery_replace', v_row.id);
      delete from public.video_gallery_records where id = v_row.id and user_id = v_user;
      v_count := v_count + 1;
    end loop;
  end if;
  return v_count;
end;
$$;
revoke all on function public.finalize_gallery_replacement(text,text[],text) from public, anon;
grant execute on function public.finalize_gallery_replacement(text,text[],text) to authenticated, service_role;

create or replace function public.delete_gallery_record_with_cleanup(
  p_gallery text,
  p_id text,
  p_project_id text default null
) returns boolean language plpgsql security definer set search_path = public as $$
declare v_user uuid := auth.uid(); v_data jsonb; v_url text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  if p_gallery = 'image' then
    select data into v_data from public.image_gallery_records
      where id = p_id and user_id = v_user and project_id is not distinct from p_project_id for update;
    if not found then return false; end if;
    foreach v_url in array array[v_data->>'imageUrl', v_data->>'thumbnailUrl'] loop
      perform public.enqueue_media_cleanup_job(v_user, v_url, 'url', 'image_gallery_delete', p_id);
    end loop;
    delete from public.image_gallery_records where id = p_id and user_id = v_user;
  elsif p_gallery = 'video' then
    select data into v_data from public.video_gallery_records
      where id = p_id and user_id = v_user and project_id is not distinct from p_project_id for update;
    if not found then return false; end if;
    perform public.enqueue_media_cleanup_job(v_user, v_data->>'videoUrl', 'url', 'video_gallery_delete', p_id);
    delete from public.video_gallery_records where id = p_id and user_id = v_user;
  else
    raise exception 'invalid gallery';
  end if;
  return true;
end;
$$;
revoke all on function public.delete_gallery_record_with_cleanup(text,text,text) from public, anon;
grant execute on function public.delete_gallery_record_with_cleanup(text,text,text) to authenticated, service_role;

create or replace function public.delete_project_with_media_cleanup(p_project_id text)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_row record;
  v_url text;
begin
  if v_user is null then raise exception 'not authenticated'; end if;
  perform 1 from public.projects where id = p_project_id and user_id = v_user for update;
  if not found then return false; end if;

  for v_row in select id, data from public.image_gallery_records where project_id = p_project_id and user_id = v_user loop
    foreach v_url in array array[v_row.data->>'imageUrl', v_row.data->>'thumbnailUrl'] loop
      perform public.enqueue_media_cleanup_job(v_user, v_url, 'url', 'project_delete_image', p_project_id);
    end loop;
  end loop;
  for v_row in select id, data from public.video_gallery_records where project_id = p_project_id and user_id = v_user loop
    perform public.enqueue_media_cleanup_job(v_user, v_row.data->>'videoUrl', 'url', 'project_delete_video', p_project_id);
  end loop;
  perform public.enqueue_media_cleanup_job(
    v_user, v_user::text || '/projects/' || regexp_replace(p_project_id, '[^a-zA-Z0-9_-]', '_', 'g') || '/assets/',
    'prefix', 'project_delete_assets', p_project_id
  );

  delete from public.projects where id = p_project_id and user_id = v_user;
  return found;
end;
$$;
revoke all on function public.delete_project_with_media_cleanup(text) from public, anon;
grant execute on function public.delete_project_with_media_cleanup(text) to authenticated, service_role;
