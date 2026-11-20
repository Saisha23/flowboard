-- Phase 1: Supabase authentication data foundation for Flowboard AI

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  name text,
  initials text,
  avatar_color text,
  title text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  plan text not null default 'FREE',
  color text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'workspace_role' and typnamespace = 'public'::regnamespace) then
    create type public.workspace_role as enum ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER');
  end if;
end $$;

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.workspace_role not null,
  joined_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  description text not null default '',
  color text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_status' and typnamespace = 'public'::regnamespace) then
    create type public.task_status as enum ('BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE');
  end if;
  if not exists (select 1 from pg_type where typname = 'task_priority' and typnamespace = 'public'::regnamespace) then
    create type public.task_priority as enum ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
  end if;
end $$;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  list_id text,
  title text not null,
  description text not null default '',
  status public.task_status not null default 'TODO',
  priority public.task_priority not null default 'MEDIUM',
  position integer not null default 0,
  due_date timestamptz,
  assignee_id uuid references auth.users(id) on delete set null,
  label_ids uuid[] not null default '{}',
  blocked_by_ids uuid[] not null default '{}',
  deadline_changes integer not null default 0,
  stagnation_days integer not null default 0,
  estimate_hours numeric,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists workspace_members_user_idx on public.workspace_members(user_id);
create index if not exists boards_workspace_idx on public.boards(workspace_id);
create index if not exists tasks_board_idx on public.tasks(board_id);
create index if not exists tasks_assignee_idx on public.tasks(assignee_id);
create index if not exists tasks_due_date_idx on public.tasks(due_date);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_workspaces_updated_at on public.workspaces;
create trigger set_workspaces_updated_at before update on public.workspaces
for each row execute function public.set_updated_at();

drop trigger if exists set_boards_updated_at on public.boards;
create trigger set_boards_updated_at before update on public.boards
for each row execute function public.set_updated_at();

drop trigger if exists set_tasks_updated_at on public.tasks;
create trigger set_tasks_updated_at before update on public.tasks
for each row execute function public.set_updated_at();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'OWNER');
  return new;
end;
$$;

drop trigger if exists on_workspace_created on public.workspaces;
create trigger on_workspace_created
after insert on public.workspaces
for each row execute function public.handle_new_workspace();

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_workspace_manager(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('OWNER', 'ADMIN')
  );
$$;

create or replace function public.is_workspace_owner(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'OWNER'
  );
$$;

create or replace function public.is_workspace_editor(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role in ('OWNER', 'ADMIN', 'MEMBER')
  );
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.boards enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select to authenticated
using (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert to authenticated
with check (id = auth.uid());

drop policy if exists "workspaces_select_members" on public.workspaces;
create policy "workspaces_select_members"
on public.workspaces for select to authenticated
using (public.is_workspace_member(id));

drop policy if exists "workspaces_insert_owner" on public.workspaces;
create policy "workspaces_insert_owner"
on public.workspaces for insert to authenticated
with check (owner_id = auth.uid());

drop policy if exists "workspaces_update_manager" on public.workspaces;
create policy "workspaces_update_manager"
on public.workspaces for update to authenticated
using (public.is_workspace_owner(id))
with check (public.is_workspace_owner(id));

drop policy if exists "workspaces_delete_owner" on public.workspaces;
create policy "workspaces_delete_owner"
on public.workspaces for delete to authenticated
using (public.is_workspace_owner(id));

drop policy if exists "workspace_members_select" on public.workspace_members;
create policy "workspace_members_select"
on public.workspace_members for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "workspace_members_insert_manager" on public.workspace_members;
create policy "workspace_members_insert_manager"
on public.workspace_members for insert to authenticated
with check (
  public.is_workspace_owner(workspace_id)
  and user_id is distinct from auth.uid()
);

drop policy if exists "workspace_members_update_manager" on public.workspace_members;
create policy "workspace_members_update_manager"
on public.workspace_members for update to authenticated
using (public.is_workspace_owner(workspace_id))
with check (public.is_workspace_owner(workspace_id));

drop policy if exists "workspace_members_delete_manager" on public.workspace_members;
create policy "workspace_members_delete_manager"
on public.workspace_members for delete to authenticated
using (public.is_workspace_owner(workspace_id));

drop policy if exists "boards_select_member" on public.boards;
create policy "boards_select_member"
on public.boards for select to authenticated
using (public.is_workspace_member(workspace_id));

drop policy if exists "boards_insert_manager" on public.boards;
create policy "boards_insert_manager"
on public.boards for insert to authenticated
with check (public.is_workspace_manager(workspace_id));

drop policy if exists "boards_update_manager" on public.boards;
create policy "boards_update_manager"
on public.boards for update to authenticated
using (public.is_workspace_manager(workspace_id))
with check (public.is_workspace_manager(workspace_id));

drop policy if exists "boards_delete_manager" on public.boards;
create policy "boards_delete_manager"
on public.boards for delete to authenticated
using (public.is_workspace_manager(workspace_id));

drop policy if exists "tasks_select_member" on public.tasks;
create policy "tasks_select_member"
on public.tasks for select to authenticated
using (
  exists (
    select 1
    from public.boards b
    where b.id = tasks.board_id
      and public.is_workspace_member(b.workspace_id)
  )
);

drop policy if exists "tasks_insert_member" on public.tasks;
create policy "tasks_insert_member"
on public.tasks for insert to authenticated
with check (
  exists (
    select 1
    from public.boards b
    where b.id = tasks.board_id
      and public.is_workspace_editor(b.workspace_id)
  )
);

drop policy if exists "tasks_update_member" on public.tasks;
create policy "tasks_update_member"
on public.tasks for update to authenticated
using (
  exists (
    select 1
    from public.boards b
    where b.id = tasks.board_id
      and public.is_workspace_editor(b.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.boards b
    where b.id = tasks.board_id
      and public.is_workspace_editor(b.workspace_id)
  )
);

drop policy if exists "tasks_delete_manager" on public.tasks;
create policy "tasks_delete_manager"
on public.tasks for delete to authenticated
using (
  exists (
    select 1
    from public.boards b
    where b.id = tasks.board_id
      and public.is_workspace_owner(b.workspace_id)
  )
);
