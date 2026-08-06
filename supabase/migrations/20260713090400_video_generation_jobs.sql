-- Durable, account-scoped video generation jobs. CRUN callbacks only wake jobs;
-- provider TaskInfo remains authoritative for terminal state.
create table if not exists public.video_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id text null references public.projects(id) on delete cascade,
  request_id text not null,
  reservation_id uuid null references public.credit_reservations(id) on delete set null,
  model_id text not null,
  mode_id text not null,
  provider text not null default 'crun',
  provider_task_id text null,
  status text not null default 'queued'
    check (status in ('queued','submitted','running','monitoring_delayed','finalizing','succeeded','failed','needs_review')),
  billing_status text not null default 'reserved'
    check (billing_status in ('reserved','capture_pending','captured','released','needs_review')),
  request_snapshot jsonb not null default '{}'::jsonb,
  result jsonb null,
  error jsonb null,
  callback_token_hash text not null,
  next_poll_at timestamptz null default now(),
  submitted_at timestamptz null,
  provider_completed_at timestamptz null,
  completed_at timestamptz null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  transient_error_count integer not null default 0 check (transient_error_count >= 0),
  locked_at timestamptz null,
  locked_by text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, request_id)
);

create index if not exists video_generation_jobs_due_idx
  on public.video_generation_jobs (next_poll_at, created_at)
  where status in ('submitted','running','monitoring_delayed','finalizing');
create index if not exists video_generation_jobs_user_project_idx
  on public.video_generation_jobs (user_id, project_id, created_at desc);
create unique index if not exists video_generation_jobs_provider_task_idx
  on public.video_generation_jobs (provider, provider_task_id)
  where provider_task_id is not null;

alter table public.video_generation_jobs enable row level security;
drop policy if exists video_generation_jobs_select_own on public.video_generation_jobs;
create policy video_generation_jobs_select_own on public.video_generation_jobs
  for select to authenticated using ((select auth.uid()) = user_id);

grant select on public.video_generation_jobs to authenticated;
revoke insert, update, delete on public.video_generation_jobs from anon, authenticated;

create or replace function public.claim_due_video_generation_jobs(
  p_worker_id text,
  p_limit integer default 10,
  p_lock_timeout interval default interval '5 minutes'
) returns setof public.video_generation_jobs
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  return query
  with due as (
    select id from public.video_generation_jobs
    where status in ('submitted','running','monitoring_delayed','finalizing')
      and coalesce(next_poll_at, now()) <= now()
      and (locked_at is null or locked_at < now() - p_lock_timeout)
    order by next_poll_at nulls first, created_at
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.video_generation_jobs j set
    locked_at = now(), locked_by = p_worker_id,
    attempt_count = j.attempt_count + 1, updated_at = now()
  from due where j.id = due.id returning j.*;
end;
$$;

revoke all on function public.claim_due_video_generation_jobs(text,integer,interval) from public, anon, authenticated;
grant execute on function public.claim_due_video_generation_jobs(text,integer,interval) to service_role;

create or replace function public.wake_video_generation_job(p_job_id uuid, p_callback_token_hash text)
returns boolean language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.video_generation_jobs set next_poll_at=now(), locked_at=null, locked_by=null, updated_at=now()
  where id=p_job_id and callback_token_hash=p_callback_token_hash
    and status in ('submitted','running','monitoring_delayed');
  return found;
end;
$$;
revoke all on function public.wake_video_generation_job(uuid,text) from public, anon, authenticated;
grant execute on function public.wake_video_generation_job(uuid,text) to service_role;
