alter table public.user_api_settings
  add column if not exists api_usage_mode jsonb not null
    default '{"llm":"site","image":"site","video":"site"}'::jsonb,
  add column if not exists public_api_access jsonb not null default '{}'::jsonb;

update public.user_api_settings
set api_usage_mode = jsonb_build_object(
  'llm', case when api_usage_mode ->> 'llm' = 'user' then 'user' else 'site' end,
  'image', case when api_usage_mode ->> 'image' = 'user' then 'user' else 'site' end,
  'video', case when api_usage_mode ->> 'video' = 'user' then 'user' else 'site' end
);
