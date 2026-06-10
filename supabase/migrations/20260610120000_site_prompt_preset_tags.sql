alter table if exists public.site_prompt_presets
  add column if not exists tags jsonb not null default '[]'::jsonb;

create index if not exists site_prompt_presets_tags_gin_idx
  on public.site_prompt_presets using gin (tags);
