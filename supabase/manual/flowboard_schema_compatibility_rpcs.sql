-- SAFETY REVIEW COPY ONLY - DO NOT APPLY.
--
-- This file contains no changes to live policies or tables.
-- All reviewed operations remain subject to existing Postgres RLS.
--
-- Unknown RLS metadata:
--   * drift_snapshots INSERT and drift_findings INSERT
--   * workspaces INSERT
--   * workspace_members INSERT and UPDATE
--   * task_deadline_history INSERT
--   * task_assignees INSERT/DELETE
--   * task_labels INSERT/DELETE
--   * task_dependencies INSERT/DELETE
--   * profiles INSERT
--
-- Secure persistence design:
--   - Keep drift writes out of an ordinary GET. An authenticated POST may call
--     an RPC only after drift_snapshots/drift_findings INSERT policies exist and
--     are restricted to accessible owner/member roles.
--   - The RPC should remain SECURITY INVOKER, verify board access inside the
--     function, and insert snapshot first, findings second, in one transaction.
--   - Do not introduce a SECURITY DEFINER function or add an insert policy that
--     relies only on authenticated role.

create or replace function public.save_task_with_relationships(
    p_task_id uuid,
    p_task jsonb,
    p_assignee_ids uuid[],
    p_label_ids uuid[],
    p_blocked_by_ids uuid[],
    p_replace_assignees boolean default true,
    p_replace_labels boolean default true,
    p_replace_dependencies boolean default true
)
returns setof public.tasks
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
    v_user_id uuid := auth.uid();
    v_board_id uuid;
    v_task public.tasks%rowtype;
    v_input public.tasks%rowtype;
    v_related_id uuid;
    v_old_due_date public.tasks.due_date%type;
begin
    if v_user_id is null then
        raise insufficient_privilege using message = 'Authentication is required.';
    end if;

    if p_task_id is null then
        v_input := jsonb_populate_record(null::public.tasks, p_task);
        v_board_id := v_input.board_id;
        if not public.has_board_role(v_board_id, array['owner', 'member']) then
            raise insufficient_privilege using message = 'Task edit permission required.';
        end if;
        if not exists (
            select 1
            from public.board_lists bl
            where bl.id = v_input.list_id
              and bl.board_id = v_board_id
        ) then
            raise check_violation using message = 'Task list must belong to the selected board.';
        end if;

        insert into public.tasks (
            board_id, list_id, title, description, priority, due_date,
            position, estimate_hours, created_by, completed_at
        )
        values (
            v_input.board_id, v_input.list_id, v_input.title,
            coalesce(v_input.description, ''), v_input.priority, v_input.due_date,
            coalesce(v_input.position, 0), v_input.estimate_hours,
            v_user_id, v_input.completed_at
        )
        returning * into v_task;
    else
        select t.*
        into v_task
        from public.tasks t
        where t.id = p_task_id
        for update;
        if not found then
            raise no_data_found using message = 'Task not found or not accessible.';
        end if;

        v_board_id := v_task.board_id;
        if not public.has_board_role(v_board_id, array['owner', 'member']) then
            raise insufficient_privilege using message = 'Task edit permission required.';
        end if;

        v_input := jsonb_populate_record(null::public.tasks, p_task);
        if p_task ? 'list_id' then
            if v_input.list_id is null or not exists (
                select 1
                from public.board_lists bl
                where bl.id = v_input.list_id
                  and bl.board_id = v_board_id
            ) then
                raise check_violation using message = 'Task list must belong to the task board.';
            end if;
        end if;

        v_old_due_date := v_task.due_date;
        update public.tasks t
        set title = case when p_task ? 'title' then v_input.title else t.title end,
            description = case when p_task ? 'description' then v_input.description else t.description end,
            list_id = case when p_task ? 'list_id' then v_input.list_id else t.list_id end,
            priority = case when p_task ? 'priority' then v_input.priority else t.priority end,
            position = case when p_task ? 'position' then v_input.position else t.position end,
            due_date = case when p_task ? 'due_date' then v_input.due_date else t.due_date end,
            deadline_changes = case
                when p_task ? 'due_date' and v_input.due_date is distinct from v_old_due_date
                then coalesce(t.deadline_changes, 0) + 1
                else coalesce(t.deadline_changes, 0)
            end,
            completed_at = case when p_task ? 'completed_at' then v_input.completed_at else t.completed_at end,
            estimate_hours = case when p_task ? 'estimate_hours' then v_input.estimate_hours else t.estimate_hours end
        where t.id = p_task_id
        returning t.* into v_task;

        if p_task ? 'due_date' and v_input.due_date is distinct from v_old_due_date then
            insert into public.task_deadline_history (
                task_id, board_id, old_due_date, new_due_date, changed_by
            )
            values (
                v_task.id, v_board_id, v_old_due_date, v_input.due_date, v_user_id
            );
        end if;
    end if;

    if p_replace_assignees then
        delete from public.task_assignees where task_id = v_task.id;
        for v_related_id in
            select distinct u.user_id
            from unnest(coalesce(p_assignee_ids, array[]::uuid[])) as u(user_id)
        loop
            if not exists (
                select 1
                from public.boards b
                join public.workspace_members wm on wm.workspace_id = b.workspace_id
                where b.id = v_board_id
                  and wm.user_id = v_related_id
            ) then
                raise check_violation using message = 'Assignees must belong to the task workspace.';
            end if;
            insert into public.task_assignees (task_id, board_id, user_id)
            values (v_task.id, v_board_id, v_related_id);
        end loop;
    end if;

    if p_replace_labels then
        delete from public.task_labels where task_id = v_task.id;
        for v_related_id in
            select distinct u.label_id
            from unnest(coalesce(p_label_ids, array[]::uuid[])) as u(label_id)
        loop
            if not exists (
                select 1 from public.labels l
                where l.id = v_related_id and l.board_id = v_board_id
            ) then
                raise check_violation using message = 'Labels must belong to the task board.';
            end if;
            insert into public.task_labels (task_id, board_id, label_id)
            values (v_task.id, v_board_id, v_related_id);
        end loop;
    end if;

    if p_replace_dependencies then
        delete from public.task_dependencies
        where board_id = v_board_id and blocked_task_id = v_task.id;

        for v_related_id in
            select distinct u.task_id
            from unnest(coalesce(p_blocked_by_ids, array[]::uuid[])) as u(task_id)
        loop
            if v_related_id = v_task.id or not exists (
                select 1
                from public.tasks t
                where t.id = v_related_id
                  and t.board_id = v_board_id
            ) then
                raise check_violation using message = 'Dependencies must reference another task on the same board.';
            end if;

            if exists (
                with recursive dependency_path(blocking_task_id, blocked_task_id) as (
                    select td.blocking_task_id, td.blocked_task_id
                    from public.task_dependencies td
                    where td.board_id = v_board_id
                      and td.blocking_task_id = v_task.id
                    union
                    select td.blocking_task_id, td.blocked_task_id
                    from public.task_dependencies td
                    join dependency_path dp
                      on td.blocking_task_id = dp.blocked_task_id
                    where td.board_id = v_board_id
                )
                select 1
                from dependency_path
                where blocked_task_id = v_related_id
            ) then
                raise check_violation using message = 'Dependencies cannot create a cycle.';
            end if;

            insert into public.task_dependencies (board_id, blocking_task_id, blocked_task_id)
            values (v_board_id, v_related_id, v_task.id);
        end loop;
    end if;

    return next v_task;
end;
$$;

revoke all on function public.save_task_with_relationships(
    uuid, jsonb, uuid[], uuid[], uuid[], boolean, boolean, boolean
) from public, anon;
grant execute on function public.save_task_with_relationships(
    uuid, jsonb, uuid[], uuid[], uuid[], boolean, boolean, boolean
) to authenticated;

-- REVIEW ONLY: Drift persistence must be enabled only after INSERT policies
-- are confirmed for both drift tables. SECURITY INVOKER means RLS still applies.
create or replace function public.save_drift_evaluation(
    p_board_id uuid,
    p_risk_score integer,
    p_health_status text,
    p_factor_scores jsonb,
    p_findings jsonb
)
returns setof public.drift_snapshots
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
    v_snapshot public.drift_snapshots%rowtype;
    v_finding jsonb;
begin
    if auth.uid() is null
       or not public.has_board_role(p_board_id, array['owner', 'member']) then
        raise insufficient_privilege using message = 'Drift evaluation permission required.';
    end if;

    insert into public.drift_snapshots (
        board_id, risk_score, health_status, factor_scores
    )
    values (
        p_board_id,
        least(100, greatest(0, p_risk_score)),
        p_health_status,
        p_factor_scores
    )
    returning * into v_snapshot;

    for v_finding in
        select value
        from jsonb_array_elements(coalesce(p_findings, '[]'::jsonb))
    loop
        insert into public.drift_findings (
            snapshot_id, board_id, task_id, factor, severity, evidence, recommendation
        )
        values (
            v_snapshot.id,
            p_board_id,
            nullif(v_finding ->> 'task_id', '')::uuid,
            v_finding ->> 'factor',
            v_finding ->> 'severity',
            v_finding -> 'evidence',
            v_finding ->> 'recommendation'
        );
    end loop;

    return next v_snapshot;
end;
$$;

revoke all on function public.save_drift_evaluation(
    uuid, integer, text, jsonb, jsonb
) from public, anon;
grant execute on function public.save_drift_evaluation(
    uuid, integer, text, jsonb, jsonb
) to authenticated;

-- REVIEW ONLY: Final-owner protection and lowercase role conventions.
create or replace function public.change_member_role(
    p_workspace_id uuid,
    p_user_id uuid,
    p_new_role text
)
returns public.workspace_members
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
    v_member public.workspace_members%rowtype;
begin
    if auth.uid() is null then
        raise insufficient_privilege using message = 'Authentication is required.';
    end if;
    if not exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = p_workspace_id
          and wm.user_id = auth.uid()
          and lower(wm.role) = 'owner'
    ) then
        raise insufficient_privilege using message = 'Workspace owner permission required.';
    end if;
    if lower(p_new_role) not in ('owner', 'member', 'viewer') then
        raise check_violation using message = 'Unsupported workspace role.';
    end if;

    select wm.*
    into v_member
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_user_id;

    if not found then
        raise no_data_found using message = 'Workspace member not found.';
    end if;

    if lower(v_member.role) = 'owner'
       and lower(p_new_role) <> 'owner'
       and (
            select count(*)
            from public.workspace_members wm
            where wm.workspace_id = p_workspace_id
              and lower(wm.role) = 'owner'
       ) <= 1 then
        raise check_violation using message = 'The workspace must retain at least one owner.';
    end if;

    update public.workspace_members wm
    set role = lower(p_new_role)
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_user_id
    returning wm.* into v_member;

    return v_member;
end;
$$;

revoke all on function public.change_member_role(uuid, uuid, text)
from public, anon;
grant execute on function public.change_member_role(uuid, uuid, text)
to authenticated;
