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

alter table public.chat_conversations
  add column if not exists preferred_llm_model_id text null;

update public.chat_conversations
set selected_skill_pack_id = coalesce(selected_skill_pack_id, enabled_skill_pack_ids[1])
where selected_skill_pack_id is null
  and enabled_skill_pack_ids is not null
  and array_length(enabled_skill_pack_ids, 1) > 0;

update public.chat_conversations
set chat_mode = 'prompt'
where chat_mode is distinct from 'skill'
  and chat_mode is distinct from 'prompt';
