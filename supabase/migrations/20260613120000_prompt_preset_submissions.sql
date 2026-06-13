-- User-submitted prompt preset review queue.
-- Public library rows remain curated; user uploads land here until an admin publishes them.

create table if not exists public.site_prompt_preset_submissions (
  id text primary key,
  preset_type text not null check (preset_type in ('image', 'video', 'chat')),
  title text not null,
  description text,
  prompt_template text not null default '',
  cover_image_url text,
  ref_slot_hints jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  submitter_user_id uuid not null references auth.users(id) on delete cascade,
  submitter_email text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  published_preset_id text references public.site_prompt_presets(id) on delete set null,
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_prompt_preset_submissions_status_created_idx
  on public.site_prompt_preset_submissions (status, created_at desc);

create index if not exists site_prompt_preset_submissions_submitter_idx
  on public.site_prompt_preset_submissions (submitter_user_id, created_at desc);

alter table public.site_prompt_preset_submissions enable row level security;

drop policy if exists site_prompt_preset_submissions_own_read on public.site_prompt_preset_submissions;
create policy site_prompt_preset_submissions_own_read on public.site_prompt_preset_submissions
  for select
  to authenticated
  using (
    auth.uid() = submitter_user_id
    or public.is_site_admin()
  );

drop policy if exists site_prompt_preset_submissions_own_insert on public.site_prompt_preset_submissions;
create policy site_prompt_preset_submissions_own_insert on public.site_prompt_preset_submissions
  for insert
  to authenticated
  with check (
    auth.uid() = submitter_user_id
    and status = 'pending'
    and published_preset_id is null
    and reviewed_by is null
    and reviewed_at is null
  );

drop policy if exists site_prompt_preset_submissions_admin_update on public.site_prompt_preset_submissions;
create policy site_prompt_preset_submissions_admin_update on public.site_prompt_preset_submissions
  for update
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists site_prompt_preset_submissions_admin_delete on public.site_prompt_preset_submissions;
create policy site_prompt_preset_submissions_admin_delete on public.site_prompt_preset_submissions
  for delete
  to authenticated
  using (public.is_site_admin());

revoke all on table public.site_prompt_preset_submissions from anon, authenticated;
grant select, insert, update, delete on table public.site_prompt_preset_submissions to authenticated;

-- Harden the curated library: users may read it, but only the site admin may write it.
drop policy if exists site_prompt_presets_write_authenticated on public.site_prompt_presets;
drop policy if exists site_prompt_presets_write_admin on public.site_prompt_presets;
create policy site_prompt_presets_write_admin on public.site_prompt_presets
  for all
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());
