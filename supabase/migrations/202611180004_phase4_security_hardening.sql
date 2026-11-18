-- Phase 4: harden workspace ownership and task edit permissions.

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

revoke execute on function public.protect_workspace_owner() from public;
grant execute on function public.protect_workspace_owner() to authenticated;

drop trigger if exists protect_workspace_owner on public.workspaces;
create trigger protect_workspace_owner
before update on public.workspaces
for each row execute function public.protect_workspace_owner();

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
  if tg_op = 'UPDATE' then
    target_workspace_id := old.workspace_id;
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
  elsif tg_op = 'DELETE' then
    target_workspace_id := old.workspace_id;
    if old.role = 'OWNER' then
      select count(*) into remaining_owner_count
      from public.workspace_members wm
      where wm.workspace_id = target_workspace_id
        and wm.role = 'OWNER'
        and wm.user_id is distinct from old.user_id;
      if remaining_owner_count = 0 then
        raise exception 'workspace must retain at least one owner';
      end if;
    end if;
  end if;
  return coalesce(new, old);
end;
$$;

revoke execute on function public.protect_last_workspace_owner() from public;
grant execute on function public.protect_last_workspace_owner() to authenticated;

drop trigger if exists protect_last_workspace_owner_update on public.workspace_members;
create trigger protect_last_workspace_owner_update
before update on public.workspace_members
for each row execute function public.protect_last_workspace_owner();

drop trigger if exists protect_last_workspace_owner_delete on public.workspace_members;
create trigger protect_last_workspace_owner_delete
before delete on public.workspace_members
for each row execute function public.protect_last_workspace_owner();

drop policy if exists "workspaces_delete_owner" on public.workspaces;
create policy "workspaces_delete_owner"
on public.workspaces for delete to authenticated
using (public.is_workspace_owner(id));
