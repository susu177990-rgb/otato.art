alter table public.site_prompt_presets
  add column if not exists description text null;
