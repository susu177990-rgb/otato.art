-- Admin user management v1.
-- Keeps Supabase Auth as the account source while adding operator-owned
-- metadata, role checks, and audit logging.

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  role text not null default 'reviewer',
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  constraint admin_roles_email_unique unique (email),
  constraint admin_roles_user_unique unique (user_id),
  constraint admin_roles_role_check check (role in ('owner', 'admin', 'reviewer')),
  constraint admin_roles_email_not_blank check (length(trim(email)) > 0)
);

insert into public.admin_roles (email, role)
values ('1779916397@qq.com', 'owner')
on conflict (email) do update set role = 'owner';

create or replace function public.current_admin_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.admin_roles
  where (
    user_id = auth.uid()
    or lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  )
  order by case role when 'owner' then 3 when 'admin' then 2 else 1 end desc
  limit 1;
$$;

create or replace function public.is_site_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_admin_role() in ('owner', 'admin', 'reviewer');
$$;

alter table public.admin_roles enable row level security;

drop policy if exists admin_roles_read_admin on public.admin_roles;
create policy admin_roles_read_admin on public.admin_roles
  for select
  to authenticated
  using (public.current_admin_role() in ('owner', 'admin', 'reviewer'));

drop policy if exists admin_roles_write_owner_admin on public.admin_roles;
create policy admin_roles_write_owner_admin on public.admin_roles
  for all
  to authenticated
  using (public.current_admin_role() in ('owner', 'admin'))
  with check (public.current_admin_role() in ('owner', 'admin'));

create table if not exists public.admin_audit_logs (
  id bigserial primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_email text,
  action text not null,
  target_user_id uuid references auth.users(id) on delete set null,
  target_email text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint admin_audit_logs_action_not_blank check (length(trim(action)) > 0)
);

create index if not exists admin_audit_logs_created_idx
  on public.admin_audit_logs (created_at desc, id desc);

create index if not exists admin_audit_logs_target_idx
  on public.admin_audit_logs (target_user_id, created_at desc)
  where target_user_id is not null;

alter table public.admin_audit_logs enable row level security;

drop policy if exists admin_audit_logs_read_admin on public.admin_audit_logs;
create policy admin_audit_logs_read_admin on public.admin_audit_logs
  for select
  to authenticated
  using (public.current_admin_role() in ('owner', 'admin'));

drop policy if exists admin_audit_logs_insert_admin on public.admin_audit_logs;
create policy admin_audit_logs_insert_admin on public.admin_audit_logs
  for insert
  to authenticated
  with check (public.current_admin_role() in ('owner', 'admin', 'reviewer'));

drop policy if exists admin_audit_logs_no_update on public.admin_audit_logs;
create policy admin_audit_logs_no_update on public.admin_audit_logs
  for update
  to authenticated
  using (false)
  with check (false);

drop policy if exists admin_audit_logs_no_delete on public.admin_audit_logs;
create policy admin_audit_logs_no_delete on public.admin_audit_logs
  for delete
  to authenticated
  using (false);
