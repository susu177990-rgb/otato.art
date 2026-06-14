-- Project ownership contract for workspace resources.
-- Existing user-level rows remain valid with project_id = null.
-- projects.data remains the canonical compatibility snapshot.

alter table public.projects
  add constraint projects_id_user_id_unique unique (id, user_id);

alter table public.chat_conversations
  add column if not exists project_id text;

alter table public.image_gallery_records
  add column if not exists project_id text;

alter table public.video_gallery_records
  add column if not exists project_id text;

alter table public.canvas_boards
  add column if not exists project_id text;

alter table public.chat_conversations
  add constraint chat_conversations_project_owner_fk
  foreign key (project_id, user_id)
  references public.projects (id, user_id)
  on delete cascade;

alter table public.image_gallery_records
  add constraint image_gallery_records_project_owner_fk
  foreign key (project_id, user_id)
  references public.projects (id, user_id)
  on delete cascade;

alter table public.video_gallery_records
  add constraint video_gallery_records_project_owner_fk
  foreign key (project_id, user_id)
  references public.projects (id, user_id)
  on delete cascade;

alter table public.canvas_boards
  add constraint canvas_boards_project_owner_fk
  foreign key (project_id, user_id)
  references public.projects (id, user_id)
  on delete cascade;

create index if not exists chat_conversations_project_updated_idx
  on public.chat_conversations (project_id, updated_at desc, id desc)
  where project_id is not null;

create index if not exists image_gallery_project_created_idx
  on public.image_gallery_records (project_id, created_at desc, id desc)
  where project_id is not null;

create index if not exists video_gallery_project_created_idx
  on public.video_gallery_records (project_id, created_at desc, id desc)
  where project_id is not null;

create unique index if not exists canvas_boards_one_per_project_idx
  on public.canvas_boards (project_id)
  where project_id is not null;

drop policy if exists chat_conversations_own on public.chat_conversations;
create policy chat_conversations_own on public.chat_conversations
  for all
  using (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = chat_conversations.project_id
          and projects.user_id = auth.uid()
      )
    )
  )
  with check (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = chat_conversations.project_id
          and projects.user_id = auth.uid()
      )
    )
  );

drop policy if exists image_gallery_own on public.image_gallery_records;
create policy image_gallery_own on public.image_gallery_records
  for all
  using (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = image_gallery_records.project_id
          and projects.user_id = auth.uid()
      )
    )
  )
  with check (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = image_gallery_records.project_id
          and projects.user_id = auth.uid()
      )
    )
  );

drop policy if exists video_gallery_own on public.video_gallery_records;
create policy video_gallery_own on public.video_gallery_records
  for all
  using (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = video_gallery_records.project_id
          and projects.user_id = auth.uid()
      )
    )
  )
  with check (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = video_gallery_records.project_id
          and projects.user_id = auth.uid()
      )
    )
  );

drop policy if exists canvas_boards_own on public.canvas_boards;
create policy canvas_boards_own on public.canvas_boards
  for all
  using (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = canvas_boards.project_id
          and projects.user_id = auth.uid()
      )
    )
  )
  with check (
    auth.uid() = user_id
    and (
      project_id is null
      or exists (
        select 1
        from public.projects
        where projects.id = canvas_boards.project_id
          and projects.user_id = auth.uid()
      )
    )
  );

create table if not exists public.project_assets (
  id text primary key,
  project_id text not null,
  user_id uuid not null,
  type text not null,
  name text not null,
  description text not null default '',
  tags text[] not null default '{}',
  primary_image_url text not null,
  reference_image_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint project_assets_project_owner_fk
    foreign key (project_id, user_id)
    references public.projects (id, user_id)
    on delete cascade,
  constraint project_assets_type_valid check (type in ('character', 'prop', 'scene')),
  constraint project_assets_name_not_blank check (length(trim(name)) > 0),
  constraint project_assets_primary_image_not_blank check (length(trim(primary_image_url)) > 0),
  constraint project_assets_reference_limit check (cardinality(reference_image_urls) <= 8),
  constraint project_assets_tag_limit check (cardinality(tags) <= 24)
);

create index if not exists project_assets_project_created_idx
  on public.project_assets (project_id, created_at desc, id desc);

create index if not exists project_assets_project_updated_idx
  on public.project_assets (project_id, updated_at desc, id desc);

alter table public.project_assets enable row level security;

create policy project_assets_own on public.project_assets
  for all
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.projects
      where projects.id = project_assets.project_id
        and projects.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.projects
      where projects.id = project_assets.project_id
        and projects.user_id = auth.uid()
    )
  );
