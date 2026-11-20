-- Phase 3: append-only activity events for real project analytics.

create table if not exists public.activity_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  board_id uuid references public.boards(id) on delete set null,
  task_id uuid references public.tasks(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  entity_type text not null,
  detail text not null,
  created_at timestamptz not null default now()
);

-- Replace foreign keys by their constrained columns, not assumed default names.
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
    where c.conrelid = 'public.activity_events'::regclass
      and c.contype = 'f'
      and a.attname in ('task_id', 'board_id')
  loop
    execute format(
      'alter table public.activity_events drop constraint %I',
      fk.conname
    );
  end loop;

  alter table public.activity_events
    add constraint activity_events_task_id_fkey
    foreign key (task_id) references public.tasks(id) on delete set null;
  alter table public.activity_events
    add constraint activity_events_board_id_fkey
    foreign key (board_id) references public.boards(id) on delete set null;
end $$;

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
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
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
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 or not exists (
      select 1
      from public.workspaces w
      where w.id = old.workspace_id
    ) then
      return old;
    end if;
  end if;

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
  elsif tg_op = 'DELETE' then
    insert into public.activity_events (
      workspace_id, board_id, actor_id, event_type, entity_type, detail
    ) values (
      old.workspace_id, null, auth.uid(), 'board_deleted', 'board',
      'Board deleted'
    );
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists record_board_activity on public.boards;
create trigger record_board_activity
after insert or update or delete on public.boards
for each row execute function public.record_board_activity();

create or replace function public.record_task_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace uuid;
  target_board uuid;
  target_task uuid;
  event_name text;
  event_detail text;
begin
  if tg_op = 'DELETE' then
    if pg_trigger_depth() > 1 then
      return old;
    end if;

    select b.workspace_id into target_workspace
    from public.boards b
    where b.id = old.board_id;
    if not found then
      return old;
    end if;
    target_board := old.board_id;
    target_task := null;
  else
    select b.workspace_id into target_workspace
    from public.boards b
    where b.id = new.board_id;
    target_board := new.board_id;
    target_task := new.id;
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
    target_board,
    target_task,
    auth.uid(),
    event_name,
    'task',
    event_detail
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists record_task_activity on public.tasks;
create trigger record_task_activity
after insert or update or delete on public.tasks
for each row execute function public.record_task_activity();
