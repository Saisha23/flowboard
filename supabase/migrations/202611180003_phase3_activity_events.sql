-- Phase 3: append-only activity events for real project analytics.

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  board_id uuid references public.boards(id) on delete cascade,
  task_id uuid references public.tasks(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

create index if not exists activity_events_workspace_created_idx
on public.activity_events(workspace_id, created_at desc);
create index if not exists activity_events_board_created_idx
on public.activity_events(board_id, created_at desc);

alter table public.activity_events enable row level security;

drop policy if exists "activity_events_select_member" on public.activity_events;
create policy "activity_events_select_member"
on public.activity_events for select to authenticated
using (public.is_workspace_member(workspace_id));

create or replace function public.record_workspace_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_events (
      workspace_id, actor_id, event_type, entity_type, detail
    ) values (
      new.id, auth.uid(), 'workspace_created', 'workspace',
      'Workspace created'
    );
  elsif tg_op = 'UPDATE' then
    insert into public.activity_events (
      workspace_id, actor_id, event_type, entity_type, detail
    ) values (
      new.id, auth.uid(), 'workspace_updated', 'workspace',
      'Workspace details updated'
    );
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists record_workspace_activity_insert on public.workspaces;
create trigger record_workspace_activity_insert
after insert or update on public.workspaces
for each row execute function public.record_workspace_activity();

create or replace function public.record_board_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activity_events (
      workspace_id, board_id, actor_id, event_type, entity_type, detail
    ) values (
      new.workspace_id, new.id, auth.uid(), 'board_created', 'board',
      'Board created'
    );
  elsif tg_op = 'UPDATE' then
    insert into public.activity_events (
      workspace_id, board_id, actor_id, event_type, entity_type, detail
    ) values (
      new.workspace_id, new.id, auth.uid(), 'board_updated', 'board',
      'Board details updated'
    );
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists record_board_activity on public.boards;
create trigger record_board_activity
after insert or update on public.boards
for each row execute function public.record_board_activity();

create or replace function public.record_task_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace uuid;
  event_name text;
  event_detail text;
begin
  if tg_op = 'DELETE' then
    select b.workspace_id into target_workspace
    from public.boards b
    where b.id = old.board_id;
  else
    select b.workspace_id into target_workspace
    from public.boards b
    where b.id = new.board_id;
  end if;

  if tg_op = 'INSERT' then
    event_name := 'task_created';
    event_detail := 'Task created';
  elsif tg_op = 'DELETE' then
    event_name := 'task_deleted';
    event_detail := 'Task deleted';
  elsif old.status is distinct from new.status or old.list_id is distinct from new.list_id then
    event_name := 'task_moved';
    event_detail := 'Task status changed';
  elsif old.assignee_id is distinct from new.assignee_id then
    event_name := 'assignee_changed';
    event_detail := 'Task assignee changed';
  elsif old.due_date is distinct from new.due_date then
    event_name := 'deadline_changed';
    event_detail := 'Task due date changed';
  else
    event_name := 'task_updated';
    event_detail := 'Task details updated';
  end if;

  insert into public.activity_events (
    workspace_id, board_id, task_id, actor_id, event_type, entity_type, detail
  ) values (
    target_workspace,
    case when tg_op = 'DELETE' then old.board_id else new.board_id end,
    case when tg_op = 'DELETE' then old.id else new.id end,
    auth.uid(),
    event_name,
    'task',
    event_detail
  );
  return coalesce(new, old);
end;
$$;

drop trigger if exists record_task_activity on public.tasks;
create trigger record_task_activity
after insert or update or delete on public.tasks
for each row execute function public.record_task_activity();
