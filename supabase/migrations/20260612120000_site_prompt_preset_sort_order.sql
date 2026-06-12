alter table if exists public.site_prompt_presets
  add column if not exists sort_order integer not null default 0;

with ordered as (
  select
    id,
    row_number() over (
      partition by preset_type
      order by created_at asc, id asc
    ) - 1 as next_sort_order
  from public.site_prompt_presets
)
update public.site_prompt_presets presets
set sort_order = ordered.next_sort_order
from ordered
where presets.id = ordered.id;

create index if not exists site_prompt_presets_type_sort_idx
  on public.site_prompt_presets (preset_type, sort_order, created_at);
