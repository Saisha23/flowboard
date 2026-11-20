-- Phase 4: harden workspace ownership and role-based write permissions.

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

revoke execute on function public.is_workspace_member(uuid) from public;
revoke execute on function public.is_workspace_manager(uuid) from public;
revoke execute on function public.is_workspace_owner(uuid) from public;
revoke execute on function public.is_workspace_editor(uuid) from public;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_manager(uuid) to authenticated;
grant execute on function public.is_workspace_owner(uuid) to authenticated;
grant execute on function public.is_workspace_editor(uuid) to authenticated;

create table if not exists public.workspace_owner_guards (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  lock_version bigint not null default 0
);
alter table public.workspace_owner_guards enable row level security;
revoke all on table public.workspace_owner_guards from public, anon, authenticated, service_role;

insert into public.workspace_owner_guards (workspace_id)
select w.id
from public.workspaces w
on conflict (workspace_id) do nothing;

-- Account deletion must not implicitly delete a workspace or bypass membership
-- checks; workspace deletion remains an explicit, deferred-constraint-safe action.
do $$
declare
  fk record;
begin
  for fk in
    select distinct c.conname
    from pg_constraint c
    join lateral unnest(c.conkey) as key_column(attnum) on true
    join pg_attribute a
      on a.attrelid = c.conrelid
      and a.attnum = key_column.attnum
      and not a.attisdropped
    where c.conrelid = 'public.workspaces'::regclass
      and c.confrelid = 'auth.users'::regclass
      and c.contype = 'f'
      and a.attname = 'owner_id'
  loop
    execute format(
      'alter table public.workspaces drop constraint %I',
      fk.conname
    );
  end loop;

  alter table public.workspaces
    add constraint workspaces_owner_id_fkey
    foreign key (owner_id) references auth.users(id)
    on delete no action
    deferrable initially deferred;

  for fk in
    select distinct c.conname
    from pg_constraint c
    join lateral unnest(c.conkey) as key_column(attnum) on true
    join pg_attribute a
      on a.attrelid = c.conrelid
      and a.attnum = key_column.attnum
      and not a.attisdropped
    where c.conrelid = 'public.workspace_members'::regclass
      and c.confrelid = 'auth.users'::regclass
      and c.contype = 'f'
      and a.attname = 'user_id'
  loop
    execute format(
      'alter table public.workspace_members drop constraint %I',
      fk.conname
    );
  end loop;

  alter table public.workspace_members
    add constraint workspace_members_user_id_fkey
    foreign key (user_id) references auth.users(id)
    on delete no action
    deferrable initially deferred;
end $$;

create or replace function public.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.workspace_owner_guards (workspace_id)
  values (new.id)
  on conflict (workspace_id) do nothing;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'OWNER');
  return new;
end;
$$;

revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.handle_new_auth_user() from public, anon, authenticated;
revoke execute on function public.handle_new_workspace() from public, anon, authenticated;
revoke execute on function public.record_workspace_activity() from public, anon, authenticated;
revoke execute on function public.record_board_activity() from public, anon, authenticated;
revoke execute on function public.record_task_activity() from public, anon, authenticated;

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

create or replace function public.protect_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.owner_id is distinct from new.owner_id then
    raise exception 'workspace owner cannot be changed';
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_workspace_owner() from public, anon, authenticated;

drop trigger if exists protect_workspace_owner on public.workspaces;
create trigger protect_workspace_owner
before update on public.workspaces
for each row execute function public.protect_workspace_owner();

create or replace function public.protect_workspace_deletion_lock()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.workspace_owner_guards
  set lock_version = lock_version + 1
  where workspace_id = old.id;
  if not found then
    raise exception 'workspace owner guard does not exist';
  end if;

  if auth.uid() is not null and not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = old.id
      and wm.user_id = auth.uid()
      and wm.role = 'OWNER'
  ) then
    raise exception 'only a workspace owner can delete the workspace';
  end if;

  return old;
end;
$$;

revoke execute on function public.protect_workspace_deletion_lock() from public, anon, authenticated;

drop trigger if exists protect_workspace_deletion_lock on public.workspaces;
create trigger protect_workspace_deletion_lock
before delete on public.workspaces
for each row execute function public.protect_workspace_deletion_lock();

create or replace function public.protect_last_workspace_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
  remaining_owner_count integer;
begin
  target_workspace_id := old.workspace_id;

  -- The only remaining membership DELETE cascade is workspace deletion.
  -- Direct authenticated DELETE statements enter at depth 1 and cannot spoof it.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  update public.workspace_owner_guards
  set lock_version = lock_version + 1
  where workspace_id = target_workspace_id;
  if not found then
    raise exception 'workspace does not exist';
  end if;

  if tg_op = 'UPDATE' then
    if old.role = 'OWNER' and new.role is distinct from 'OWNER' then
      select count(*) into remaining_owner_count
      from public.workspace_members wm
      where wm.workspace_id = target_workspace_id
        and wm.role = 'OWNER'
        and wm.user_id is distinct from old.user_id;
      if remaining_owner_count = 0 then
        raise exception 'workspace must retain at least one owner';
      end if;
    end if;
  elsif tg_op = 'DELETE' and old.role = 'OWNER' then
    select count(*) into remaining_owner_count
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.role = 'OWNER'
      and wm.user_id is distinct from old.user_id;
    if remaining_owner_count = 0 then
      raise exception 'workspace must retain at least one owner';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_last_workspace_owner() from public, anon, authenticated;

drop trigger if exists protect_last_workspace_owner_update on public.workspace_members;
create trigger protect_last_workspace_owner_update
before update on public.workspace_members
for each row execute function public.protect_last_workspace_owner();

drop trigger if exists protect_last_workspace_owner_delete on public.workspace_members;
create trigger protect_last_workspace_owner_delete
before delete on public.workspace_members
for each row execute function public.protect_last_workspace_owner();

create or replace function public.protect_workspace_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace_id uuid;
  caller_is_owner boolean;
begin
  if tg_op = 'UPDATE' then
    target_workspace_id := old.workspace_id;
  elsif tg_op = 'DELETE' then
    target_workspace_id := old.workspace_id;
  else
    target_workspace_id := new.workspace_id;
  end if;

  -- Only nested FK cascades can reach this branch; direct membership DML cannot
  -- choose pg_trigger_depth() or bypass the owner checks.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;

  update public.workspace_owner_guards
  set lock_version = lock_version + 1
  where workspace_id = target_workspace_id;
  if not found then
    raise exception 'workspace does not exist';
  end if;

  -- The workspace INSERT policy restricts owner_id to auth.uid(); this is the
  -- one trusted membership row inserted by handle_new_workspace().
  if tg_op = 'INSERT'
    and new.role = 'OWNER'
    and new.user_id = auth.uid()
    and exists (
      select 1
      from public.workspaces w
      where w.id = target_workspace_id
        and w.owner_id = auth.uid()
    ) then
    return new;
  end if;

  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = 'OWNER'
  ) into caller_is_owner;

  if not caller_is_owner then
    raise exception 'only a workspace owner can manage membership';
  end if;

  if tg_op = 'UPDATE' then
    if old.workspace_id is distinct from new.workspace_id then
      raise exception 'workspace membership cannot move between workspaces';
    end if;
    if old.user_id = auth.uid() then
      raise exception 'workspace owner cannot change their own membership';
    end if;
  elsif tg_op = 'DELETE' then
    if old.user_id = auth.uid() then
      raise exception 'workspace owner cannot remove their own membership';
    end if;
  elsif tg_op = 'INSERT' and new.user_id = auth.uid() then
    raise exception 'users cannot add themselves to a workspace';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke execute on function public.protect_workspace_membership() from public, anon, authenticated;

drop trigger if exists protect_workspace_membership_insert on public.workspace_members;
create trigger protect_workspace_membership_insert
before insert on public.workspace_members
for each row execute function public.protect_workspace_membership();

drop trigger if exists protect_workspace_membership_update on public.workspace_members;
create trigger protect_workspace_membership_update
before update on public.workspace_members
for each row execute function public.protect_workspace_membership();

drop trigger if exists protect_workspace_membership_delete on public.workspace_members;
create trigger protect_workspace_membership_delete
before delete on public.workspace_members
for each row execute function public.protect_workspace_membership();

drop policy if exists "workspaces_update_manager" on public.workspaces;
create policy "workspaces_update_manager"
on public.workspaces for update to authenticated
using (public.is_workspace_owner(id))
with check (public.is_workspace_owner(id));

drop policy if exists "workspaces_delete_owner" on public.workspaces;
create policy "workspaces_delete_owner"
on public.workspaces for delete to authenticated
using (public.is_workspace_owner(id));
