-- Harden the MVP JSONB schema without breaking existing rows.
-- Keep JSON snapshots as the compatibility source, but add indexed metadata
-- columns and stricter admin write policies for site-wide configuration.

create table if not exists public.site_admins (
  email text primary key,
  created_at timestamptz not null default now()
);

alter table public.site_admins enable row level security;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.site_admins
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  or not exists (select 1 from public.site_admins);
$$;

create or replace function public.claim_first_site_admin()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  requester_email text;
begin
  requester_email = nullif(lower(coalesce(auth.jwt() ->> 'email', '')), '');
  if requester_email is null then
    raise exception 'missing authenticated email';
  end if;

  if exists (select 1 from public.site_admins) then
    raise exception 'site admin already exists';
  end if;

  insert into public.site_admins (email) values (requester_email);
  return requester_email;
end;
$$;

grant execute on function public.claim_first_site_admin() to authenticated;

drop policy if exists site_admins_read_admin on public.site_admins;
create policy site_admins_read_admin on public.site_admins
  for select
  to authenticated
  using (public.is_site_admin());

drop policy if exists site_admins_write_admin on public.site_admins;
create policy site_admins_write_admin on public.site_admins
  for all
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

drop policy if exists site_settings_write_authenticated on public.site_settings;
create policy site_settings_write_admin on public.site_settings
  for all
  to authenticated
  using (public.is_site_admin())
  with check (id = 'global' and public.is_site_admin());

drop policy if exists site_skill_packs_write_authenticated on public.site_skill_packs;
create policy site_skill_packs_write_admin on public.site_skill_packs
  for all
  to authenticated
  using (public.is_site_admin())
  with check (public.is_site_admin());

alter table public.projects
  add column if not exists name text,
  add column if not exists creative_direction_id text,
  add column if not exists current_stage integer not null default 0,
  add column if not exists onboarding_status text,
  add column if not exists origin_mode text,
  add column if not exists max_approved_stage integer not null default 0,
  add column if not exists episode_count text,
  add column if not exists series_bible_filled boolean not null default false;

create or replace function public.sync_project_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.name = nullif(trim(coalesce(new.data ->> 'name', new.name, '')), '');
  new.creative_direction_id = nullif(trim(coalesce(new.data ->> 'creativeDirectionId', new.creative_direction_id, '')), '');
  new.current_stage = coalesce(nullif(new.data ->> 'currentStage', '')::integer, new.current_stage, 0);
  new.onboarding_status = nullif(trim(coalesce(new.data ->> 'onboardingStatus', new.onboarding_status, '')), '');
  new.origin_mode = nullif(trim(coalesce(new.data ->> 'originMode', new.origin_mode, '')), '');
  new.max_approved_stage = coalesce(nullif(new.data ->> 'maxApprovedStage', '')::integer, new.max_approved_stage, 0);
  new.episode_count = nullif(trim(coalesce(new.data #>> '{meta,episodeCount}', new.episode_count, '')), '');
  new.series_bible_filled = length(trim(coalesce(new.data ->> 'seriesBible', ''))) > 0;
  return new;
end;
$$;

drop trigger if exists projects_sync_metadata on public.projects;
create trigger projects_sync_metadata
  before insert or update of data on public.projects
  for each row execute function public.sync_project_metadata();

update public.projects
set data = data
where data is not null;

create index if not exists projects_user_direction_updated_idx
  on public.projects (user_id, creative_direction_id, updated_at desc);

create index if not exists projects_user_status_updated_idx
  on public.projects (user_id, onboarding_status, updated_at desc);

create index if not exists projects_user_origin_updated_idx
  on public.projects (user_id, origin_mode, updated_at desc);

alter table public.chat_conversations
  add column if not exists message_count integer not null default 0,
  add column if not exists last_message_at timestamptz;

create or replace function public.sync_chat_conversation_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  last_message jsonb;
  last_created_at numeric;
begin
  new.message_count = case
    when jsonb_typeof(new.messages) = 'array' then jsonb_array_length(new.messages)
    else 0
  end;

  if new.message_count > 0 then
    last_message = new.messages -> (new.message_count - 1);
    last_created_at = nullif(last_message ->> 'createdAt', '')::numeric;
    if last_created_at is not null then
      new.last_message_at = to_timestamp(last_created_at / 1000.0);
    else
      new.last_message_at = new.updated_at;
    end if;
  else
    new.last_message_at = null;
  end if;

  return new;
exception
  when others then
    new.message_count = 0;
    new.last_message_at = new.updated_at;
    return new;
end;
$$;

drop trigger if exists chat_conversations_sync_metadata on public.chat_conversations;
create trigger chat_conversations_sync_metadata
  before insert or update of messages, updated_at on public.chat_conversations
  for each row execute function public.sync_chat_conversation_metadata();

update public.chat_conversations
set messages = messages
where messages is not null;

create index if not exists chat_conversations_user_last_message_idx
  on public.chat_conversations (user_id, last_message_at desc nulls last);

alter table public.image_gallery_records
  add column if not exists mode_id text,
  add column if not exists model_id text,
  add column if not exists status text,
  add column if not exists image_url text;

create or replace function public.sync_image_gallery_metadata()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.mode_id = nullif(trim(coalesce(new.data ->> 'modeId', new.mode_id, '')), '');
  new.model_id = nullif(trim(coalesce(new.data ->> 'modelId', new.model_id, '')), '');
  new.status = nullif(trim(coalesce(new.data ->> 'status', new.status, '')), '');
  new.image_url = nullif(trim(coalesce(new.data ->> 'imageUrl', new.image_url, '')), '');
  return new;
end;
$$;

drop trigger if exists image_gallery_records_sync_metadata on public.image_gallery_records;
create trigger image_gallery_records_sync_metadata
  before insert or update of data on public.image_gallery_records
  for each row execute function public.sync_image_gallery_metadata();

update public.image_gallery_records
set data = data
where data is not null;

create index if not exists image_gallery_user_mode_created_idx
  on public.image_gallery_records (user_id, mode_id, created_at desc);

create index if not exists image_gallery_user_status_created_idx
  on public.image_gallery_records (user_id, status, created_at desc);

alter table public.image_gallery_records
  drop constraint if exists image_gallery_records_data_size_guard,
  add constraint image_gallery_records_data_size_guard
    check (octet_length(data::text) <= 1048576);
