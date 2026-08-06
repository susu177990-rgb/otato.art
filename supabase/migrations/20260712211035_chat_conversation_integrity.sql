alter table public.chat_conversations
  add column if not exists preferred_image_model_id text,
  add column if not exists revision bigint not null default 0;

create table if not exists public.chat_turn_requests (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null references public.chat_conversations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  user_message_id text not null,
  status text not null default 'pending'
    check (status in ('pending', 'finalizing', 'completed', 'failed')),
  result_messages jsonb,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (conversation_id, user_message_id)
);

create index if not exists chat_turn_requests_user_updated_idx
  on public.chat_turn_requests (user_id, updated_at desc);

alter table public.chat_turn_requests enable row level security;

drop policy if exists chat_turn_requests_own on public.chat_turn_requests;
create policy chat_turn_requests_own
  on public.chat_turn_requests
  for all
  to authenticated
  using (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.chat_conversations conversation
      where conversation.id = chat_turn_requests.conversation_id
        and conversation.user_id = (select auth.uid())
    )
  )
  with check (
    (select auth.uid()) = user_id
    and exists (
      select 1
      from public.chat_conversations conversation
      where conversation.id = chat_turn_requests.conversation_id
        and conversation.user_id = (select auth.uid())
    )
  );

grant select, insert, update, delete on public.chat_turn_requests to authenticated;

create or replace function public.append_chat_conversation_turn(
  p_conversation_id text,
  p_user_message jsonb,
  p_response_messages jsonb,
  p_new_attachments jsonb default '[]'::jsonb,
  p_title text default null,
  p_preferred_llm_model_id text default null,
  p_preferred_image_model_id text default null
)
returns boolean
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_message_id text := nullif(trim(p_user_message ->> 'id'), '');
  v_updated_count integer := 0;
begin
  if v_user_message_id is null then
    raise exception 'user_message_id_required';
  end if;
  if jsonb_typeof(p_response_messages) <> 'array' then
    raise exception 'response_messages_must_be_array';
  end if;
  if jsonb_typeof(p_new_attachments) <> 'array' then
    raise exception 'new_attachments_must_be_array';
  end if;

  update public.chat_conversations conversation
  set
    messages = case
      when exists (
        select 1
        from jsonb_array_elements(conversation.messages) message
        where message ->> 'id' = v_user_message_id
      ) then conversation.messages
      else conversation.messages || jsonb_build_array(p_user_message) || p_response_messages
    end,
    attachments = case
      when jsonb_array_length(p_new_attachments) = 0
        or exists (
          select 1
          from jsonb_array_elements(conversation.messages) message
          where message ->> 'id' = v_user_message_id
        )
      then conversation.attachments
      else conversation.attachments || p_new_attachments
    end,
    title = coalesce(nullif(trim(p_title), ''), conversation.title),
    preferred_llm_model_id = coalesce(nullif(trim(p_preferred_llm_model_id), ''), conversation.preferred_llm_model_id),
    preferred_image_model_id = coalesce(nullif(trim(p_preferred_image_model_id), ''), conversation.preferred_image_model_id),
    revision = conversation.revision + 1,
    updated_at = now()
  where conversation.id = p_conversation_id
    and conversation.user_id = (select auth.uid());

  get diagnostics v_updated_count = row_count;
  return v_updated_count = 1;
end;
$$;

revoke all on function public.append_chat_conversation_turn(text, jsonb, jsonb, jsonb, text, text, text) from public;
grant execute on function public.append_chat_conversation_turn(text, jsonb, jsonb, jsonb, text, text, text) to authenticated;

comment on table public.chat_turn_requests is
  'Idempotency and finalization state for one user chat message. Completed results may be replayed without a second upstream call.';

comment on function public.append_chat_conversation_turn(text, jsonb, jsonb, jsonb, text, text, text) is
  'Atomically appends one chat turn and ignores a duplicate user message id.';
