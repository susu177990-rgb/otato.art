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
