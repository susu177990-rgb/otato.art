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
