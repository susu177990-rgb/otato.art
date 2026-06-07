-- Site-wide workspace settings (LLM + image workbench).
-- SaaS contract: this is operator-managed global config, not per-user data.
create table if not exists public.site_settings (
  id text primary key default 'global',
  llm jsonb not null default '{}'::jsonb,
  image_workspace jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id = 'global')
);

alter table public.site_settings enable row level security;

create policy site_settings_read_authenticated on public.site_settings
  for select
  to authenticated
  using (true);

create policy site_settings_write_authenticated on public.site_settings
  for all
  to authenticated
  using (true)
  with check (id = 'global');

-- Legacy per-user workspace settings kept for compatibility with earlier local migrations.
create table if not exists public.workspace_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  llm jsonb not null default '{}'::jsonb,
  image_workspace jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.workspace_settings enable row level security;

create policy workspace_settings_own on public.workspace_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Script projects (full Project JSON in data)
create table if not exists public.projects (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);

alter table public.projects enable row level security;

create policy projects_own on public.projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Image gallery records
create table if not exists public.image_gallery_records (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists image_gallery_user_created_idx
  on public.image_gallery_records (user_id, created_at desc);

alter table public.image_gallery_records enable row level security;

create policy image_gallery_own on public.image_gallery_records
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
-- Move workspace API settings and image prompts to a single site-wide row.
-- Existing per-user workspace_settings rows are left in place as legacy data.
create table if not exists public.site_settings (
  id text primary key default 'global',
  llm jsonb not null default '{}'::jsonb,
  image_workspace jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint site_settings_singleton check (id = 'global')
);

create table if not exists public.workspace_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  llm jsonb not null default '{}'::jsonb,
  image_workspace jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

insert into public.site_settings (id, llm, image_workspace, updated_at)
select 'global', llm, image_workspace, updated_at
from public.workspace_settings
order by updated_at desc
limit 1
on conflict (id) do nothing;

insert into public.site_settings (id)
values ('global')
on conflict (id) do nothing;

alter table public.site_settings enable row level security;

drop policy if exists site_settings_read_authenticated on public.site_settings;
drop policy if exists site_settings_write_authenticated on public.site_settings;

create policy site_settings_read_authenticated on public.site_settings
  for select
  to authenticated
  using (true);

create policy site_settings_write_authenticated on public.site_settings
  for all
  to authenticated
  using (true)
  with check (id = 'global');
-- Chat workspace: per-user conversations & skill packs (independent of projects).

create table if not exists public.chat_conversations (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '新对话',
  messages jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  enabled_skill_pack_ids text[] null,
  updated_at timestamptz not null default now()
);

create index if not exists chat_conversations_user_updated_idx
  on public.chat_conversations (user_id, updated_at desc);

alter table public.chat_conversations enable row level security;

create policy chat_conversations_own on public.chat_conversations
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.chat_skill_packs (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  skills jsonb not null,
  imported_at timestamptz not null default now()
);

create index if not exists chat_skill_packs_user_imported_idx
  on public.chat_skill_packs (user_id, imported_at desc);

alter table public.chat_skill_packs enable row level security;

create policy chat_skill_packs_own on public.chat_skill_packs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

alter table public.site_settings
  add column if not exists chat jsonb not null default '{}'::jsonb;
-- Site-wide skill packs for /chat (managed in settings, shared across all users).

create table if not exists public.site_skill_packs (
  id text primary key,
  title text not null,
  skills jsonb not null,
  imported_at timestamptz not null default now()
);

create index if not exists site_skill_packs_imported_idx
  on public.site_skill_packs (imported_at desc);

alter table public.site_skill_packs enable row level security;

create policy site_skill_packs_read_authenticated on public.site_skill_packs
  for select
  to authenticated
  using (true);

create policy site_skill_packs_write_authenticated on public.site_skill_packs
  for all
  to authenticated
  using (true)
  with check (true);

-- One-time merge from per-user packs (distinct by id, keep newest import).
insert into public.site_skill_packs (id, title, skills, imported_at)
select distinct on (id) id, title, skills, imported_at
from public.chat_skill_packs
order by id, imported_at desc
on conflict (id) do nothing;
-- 对话页 Skill 显示名与 ZIP 文件名解耦；导入时写入，不在设置页修改。

alter table public.site_skill_packs
  add column if not exists display_label text;

update public.site_skill_packs
set display_label = coalesce(
  display_label,
  nullif(trim(skills -> 0 ->> 'name'), ''),
  title
)
where display_label is null or trim(display_label) = '';

alter table public.site_skill_packs
  alter column display_label set not null;
-- 对话页空状态说明（管理员在设置里填写，Markdown）

alter table public.site_skill_packs
  add column if not exists chat_usage_hint text null;
-- 画廊 data 中内嵌 data: URL / 参考图会使单行 JSONB 达数 MB，查询触发 statement timeout (57014)。
-- 剥离内联二进制，仅保留元数据；原图由客户端 localStorage 缓存或上游 http(s) URL 承担。

create or replace function public.compact_image_gallery_records()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  affected integer;
begin
  update public.image_gallery_records
  set data = data - 'referenceImages' - 'imageUrl'
  where user_id = auth.uid()
    and (
      data ? 'referenceImages'
      or coalesce(data->>'imageUrl', '') like 'data:%'
      or length(coalesce(data->>'imageUrl', '')) > 8192
    );

  get diagnostics affected = row_count;
  return affected;
end;
$$;

grant execute on function public.compact_image_gallery_records() to authenticated;

-- 一次性：全表清理历史内联图（部署后在 SQL Editor 执行 migration 即可）
update public.image_gallery_records
set data = data - 'referenceImages' - 'imageUrl'
where data ? 'referenceImages'
   or coalesce(data->>'imageUrl', '') like 'data:%'
   or length(coalesce(data->>'imageUrl', '')) > 8192;
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
-- Skill form interface schemas (interface/input.json, output.json, optimized_system_prompt.md)

alter table public.site_skill_packs
  add column if not exists input_schema jsonb null,
  add column if not exists output_schema jsonb null,
  add column if not exists optimized_system_prompt text null;
create table if not exists public.canvas_boards (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists canvas_boards_user_updated_idx
  on public.canvas_boards (user_id, updated_at desc);

alter table public.canvas_boards enable row level security;

create policy canvas_boards_own on public.canvas_boards
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'generated-images',
  'generated-images',
  true,
  104857600,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/bmp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/opus',
    'audio/flac',
    'audio/aiff',
    'audio/x-aiff'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = greatest(storage.buckets.file_size_limit, excluded.file_size_limit),
  allowed_mime_types = excluded.allowed_mime_types;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'generated-images',
  'generated-images',
  true,
  104857600,
  array[
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/gif',
    'image/bmp',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
    'audio/wav',
    'audio/x-wav',
    'audio/ogg',
    'audio/opus',
    'audio/flac',
    'audio/aiff',
    'audio/x-aiff'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = greatest(storage.buckets.file_size_limit, excluded.file_size_limit),
  allowed_mime_types = excluded.allowed_mime_types;
-- Video workspace settings + video gallery records
-- Mirrors image workspace + image_gallery_records patterns.

-- 1) Workspace snapshot schema: add video_workspace jsonb
alter table if exists public.site_settings
  add column if not exists video_workspace jsonb not null default '{}'::jsonb;

alter table if exists public.workspace_settings
  add column if not exists video_workspace jsonb not null default '{}'::jsonb;

-- 2) Video gallery records table (per-user, JSONB payload)
create table if not exists public.video_gallery_records (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists video_gallery_user_created_idx
  on public.video_gallery_records (user_id, created_at desc);

alter table public.video_gallery_records enable row level security;

create policy video_gallery_own on public.video_gallery_records
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Current internal product policy: any authenticated user may update the
-- shared site settings row from the Settings page.

drop policy if exists site_settings_write_admin on public.site_settings;
drop policy if exists site_settings_write_authenticated on public.site_settings;

create policy site_settings_write_authenticated on public.site_settings
  for all
  to authenticated
  using (true)
  with check (id = 'global');
-- Site-wide prompt preset library for image/video generation.
-- First version intentionally keeps the schema small; search/tags/versioning can
-- be layered on later without changing the generation pages.

create table if not exists public.site_prompt_presets (
  id text primary key,
  preset_type text not null check (preset_type in ('image', 'video')),
  title text not null,
  prompt_template text not null default '',
  cover_image_url text,
  ref_slot_hints jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists site_prompt_presets_type_idx
  on public.site_prompt_presets (preset_type, created_at);

alter table public.site_prompt_presets enable row level security;

drop policy if exists site_prompt_presets_read_authenticated on public.site_prompt_presets;
create policy site_prompt_presets_read_authenticated on public.site_prompt_presets
  for select
  to authenticated
  using (true);

drop policy if exists site_prompt_presets_write_authenticated on public.site_prompt_presets;
create policy site_prompt_presets_write_authenticated on public.site_prompt_presets
  for all
  to authenticated
  using (true)
  with check (true);

revoke all on table public.site_prompt_presets from anon, authenticated;
grant select, insert, update, delete on table public.site_prompt_presets to authenticated;

-- Bootstrap existing site_settings JSON presets into the new library.
insert into public.site_prompt_presets (id, preset_type, title, prompt_template, cover_image_url, ref_slot_hints, updated_at)
select
  mode.value->>'id',
  'image',
  coalesce(nullif(mode.value->>'label', ''), mode.value->>'id'),
  coalesce(settings.image_workspace->'prompts'->>(mode.value->>'id'), ''),
  nullif(settings.image_workspace->'coverImageUrlByMode'->>(mode.value->>'id'), ''),
  coalesce(settings.image_workspace->'refSlotHintsByMode'->(mode.value->>'id'), '[]'::jsonb),
  now()
from public.site_settings settings
cross join lateral jsonb_array_elements(coalesce(settings.image_workspace->'customModes', '[]'::jsonb)) as mode(value)
where settings.id = 'global'
  and mode.value ? 'id'
  and coalesce(mode.value->>'id', '') <> ''
on conflict (id) do update set
  preset_type = excluded.preset_type,
  title = excluded.title,
  prompt_template = excluded.prompt_template,
  cover_image_url = excluded.cover_image_url,
  ref_slot_hints = excluded.ref_slot_hints,
  updated_at = excluded.updated_at;

insert into public.site_prompt_presets (id, preset_type, title, prompt_template, cover_image_url, ref_slot_hints, updated_at)
select
  mode.value->>'id',
  'video',
  coalesce(nullif(mode.value->>'label', ''), mode.value->>'id'),
  coalesce(settings.video_workspace->'prompts'->>(mode.value->>'id'), ''),
  nullif(settings.video_workspace->'coverImageUrlByMode'->>(mode.value->>'id'), ''),
  '[]'::jsonb,
  now()
from public.site_settings settings
cross join lateral jsonb_array_elements(coalesce(settings.video_workspace->'customModes', '[]'::jsonb)) as mode(value)
where settings.id = 'global'
  and mode.value ? 'id'
  and coalesce(mode.value->>'id', '') <> ''
on conflict (id) do update set
  preset_type = excluded.preset_type,
  title = excluded.title,
  prompt_template = excluded.prompt_template,
  cover_image_url = excluded.cover_image_url,
  ref_slot_hints = excluded.ref_slot_hints,
  updated_at = excluded.updated_at;
-- Extend prompt preset library with chat presets and persist /chat mode + selections.

alter table public.site_prompt_presets
  drop constraint if exists site_prompt_presets_preset_type_check;

alter table public.site_prompt_presets
  add constraint site_prompt_presets_preset_type_check
  check (preset_type in ('image', 'video', 'chat'));

alter table public.chat_conversations
  add column if not exists chat_mode text not null default 'prompt'
    check (chat_mode in ('skill', 'prompt'));

alter table public.chat_conversations
  add column if not exists selected_skill_pack_id text null;

alter table public.chat_conversations
  add column if not exists selected_chat_preset_id text null;

update public.chat_conversations
set selected_skill_pack_id = coalesce(selected_skill_pack_id, enabled_skill_pack_ids[1])
where selected_skill_pack_id is null
  and enabled_skill_pack_ids is not null
  and array_length(enabled_skill_pack_ids, 1) > 0;

update public.chat_conversations
set chat_mode = 'prompt'
where chat_mode is distinct from 'skill'
  and chat_mode is distinct from 'prompt';
alter table public.site_prompt_presets
  add column if not exists description text null;
