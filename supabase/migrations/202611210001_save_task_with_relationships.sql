
-- Authenticated task updates and relationship replacement.
-- SECURITY INVOKER preserves the caller's existing table grants and RLS policies.

CREATE OR REPLACE FUNCTION public.save_task_with_relationships(
    p_task_id uuid,
    p_task jsonb,
    p_assignee_ids uuid[],
    p_label_ids uuid[],
    p_blocked_by_ids uuid[],
    p_replace_assignees boolean,
    p_replace_labels boolean,
    p_replace_dependencies boolean
)
RETURNS SETOF public.tasks
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_task public.tasks%ROWTYPE;
    v_input public.tasks%ROWTYPE;
    v_board_id uuid;
    v_workspace_id uuid;
    v_priority text;
    v_assignee_ids uuid[];
    v_label_ids uuid[];
    v_blocked_by_ids uuid[];
    v_related_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Authentication is required.';
    END IF;

    IF p_task_id IS NULL
       OR p_task IS NULL
       OR pg_catalog.jsonb_typeof(p_task) <> 'object' THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'A task ID and task object are required.';
    END IF;

    IF p_task - ARRAY[
        'title',
        'description',
        'list_id',
        'priority',
        'position',
        'due_date',
        'completed_at',
        'estimate_hours'
    ]::text[] <> '{}'::jsonb THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Task details contain unsupported fields.';
    END IF;

    -- Read board ID without locking the task row.
    SELECT t.board_id
    INTO v_board_id
    FROM public.tasks AS t
    WHERE t.id = p_task_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0002',
            MESSAGE = 'Task not found or not accessible.';
    END IF;

    -- Acquire the board lock BEFORE locking the task row.
    -- This maintains a consistent lock order with dependency inserts.
    IF p_replace_dependencies THEN
        PERFORM pg_catalog.pg_advisory_xact_lock(
            pg_catalog.hashtext(v_board_id::text),
            0
        );
    END IF;

    -- Lock the task only after acquiring the board lock.
    SELECT t.*
    INTO v_task
    FROM public.tasks AS t
    WHERE t.id = p_task_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = 'P0002',
            MESSAGE = 'Task not found or not accessible.';
    END IF;

    IF v_task.board_id IS DISTINCT FROM v_board_id THEN
        RAISE EXCEPTION USING
            ERRCODE = '40001',
            MESSAGE = 'Task board changed; retry the operation.';
    END IF;

    IF NOT public.has_board_role(
        v_board_id,
        ARRAY['owner', 'member']::text[]
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Task edit permission required.';
    END IF;

    SELECT b.workspace_id
    INTO v_workspace_id
    FROM public.boards AS b
    WHERE b.id = v_board_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Board not found or not accessible.';
    END IF;

    v_input := pg_catalog.jsonb_populate_record(
        NULL::public.tasks,
        p_task
    );

    IF p_task ? 'title' THEN
        IF v_input.title IS NULL
           OR pg_catalog.length(pg_catalog.btrim(v_input.title))
                NOT BETWEEN 1 AND 200 THEN
            RAISE EXCEPTION USING
                ERRCODE = '22023',
                MESSAGE = 'Task title must contain between 1 and 200 characters.';
        END IF;

        v_input.title := pg_catalog.btrim(v_input.title);
    END IF;

    IF p_task ? 'description' AND (
        v_input.description IS NULL
        OR pg_catalog.length(v_input.description) > 10000
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Task description cannot exceed 10000 characters.';
    END IF;

    IF p_task ? 'priority' THEN
        v_priority := pg_catalog.lower(v_input.priority);

        IF v_priority = 'urgent' THEN
            v_priority := 'critical';
        END IF;

        IF v_priority IS NULL
           OR v_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
            RAISE EXCEPTION USING
                ERRCODE = '22023',
                MESSAGE = 'Task priority must be low, medium, high, or critical.';
        END IF;
    END IF;

    IF p_task ? 'position' AND (
        v_input.position IS NULL
        OR v_input.position < 0
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Task position must be nonnegative.';
    END IF;

    IF p_task ? 'estimate_hours'
       AND v_input.estimate_hours < 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Task estimate must be nonnegative.';
    END IF;

    IF p_task ? 'list_id' THEN
        IF v_input.list_id IS NULL OR NOT EXISTS (
            SELECT 1
            FROM public.board_lists AS bl
            WHERE bl.id = v_input.list_id
              AND bl.board_id = v_board_id
        ) THEN
            RAISE EXCEPTION USING
                ERRCODE = '22023',
                MESSAGE = 'Task list must belong to the task board.';
        END IF;
    END IF;

    SELECT ARRAY(
        SELECT DISTINCT requested.user_id
        FROM pg_catalog.unnest(
            COALESCE(p_assignee_ids, ARRAY[]::uuid[])
        ) AS requested(user_id)
        ORDER BY requested.user_id
    )
    INTO v_assignee_ids;

    SELECT ARRAY(
        SELECT DISTINCT requested.label_id
        FROM pg_catalog.unnest(
            COALESCE(p_label_ids, ARRAY[]::uuid[])
        ) AS requested(label_id)
        ORDER BY requested.label_id
    )
    INTO v_label_ids;

    SELECT ARRAY(
        SELECT DISTINCT requested.task_id
        FROM pg_catalog.unnest(
            COALESCE(p_blocked_by_ids, ARRAY[]::uuid[])
        ) AS requested(task_id)
        ORDER BY requested.task_id
    )
    INTO v_blocked_by_ids;

    IF p_replace_assignees AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(v_assignee_ids)
            AS requested(user_id)
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.workspace_members AS wm
            WHERE wm.workspace_id = v_workspace_id
              AND wm.user_id = requested.user_id
        )
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Every assignee must belong to this task workspace.';
    END IF;

    IF p_replace_labels AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(v_label_ids)
            AS requested(label_id)
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.labels AS l
            WHERE l.id = requested.label_id
              AND l.board_id = v_board_id
        )
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Every label must belong to this task board.';
    END IF;

    IF p_replace_dependencies AND EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(v_blocked_by_ids)
            AS requested(task_id)
        WHERE requested.task_id = p_task_id
           OR NOT EXISTS (
                SELECT 1
                FROM public.tasks AS blocking
                WHERE blocking.id = requested.task_id
                  AND blocking.board_id = v_board_id
           )
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Dependencies must reference another task on the same board.';
    END IF;

    UPDATE public.tasks AS t
    SET updated_at = pg_catalog.now(),
    title = CASE
            WHEN p_task ? 'title' THEN v_input.title
            ELSE t.title
        END,
        description = CASE
            WHEN p_task ? 'description' THEN v_input.description
            ELSE t.description
        END,
        list_id = CASE
            WHEN p_task ? 'list_id' THEN v_input.list_id
            ELSE t.list_id
        END,
        priority = CASE
            WHEN p_task ? 'priority' THEN v_priority
            ELSE t.priority
        END,
        position = CASE
            WHEN p_task ? 'position' THEN v_input.position
            ELSE t.position
        END,
        due_date = CASE
            WHEN p_task ? 'due_date' THEN v_input.due_date
            ELSE t.due_date
        END,
        completed_at = CASE
            WHEN p_task ? 'completed_at' THEN v_input.completed_at
            ELSE t.completed_at
        END,
        estimate_hours = CASE
            WHEN p_task ? 'estimate_hours' THEN v_input.estimate_hours
            ELSE t.estimate_hours
        END
    WHERE t.id = p_task_id
    RETURNING t.* INTO v_task;

    IF p_replace_assignees THEN
        DELETE FROM public.task_assignees
        WHERE task_id = p_task_id;

        FOR v_related_id IN
            SELECT requested.user_id
            FROM pg_catalog.unnest(v_assignee_ids)
                AS requested(user_id)
            ORDER BY requested.user_id
        LOOP
            INSERT INTO public.task_assignees (
                task_id,
                board_id,
                user_id
            )
            VALUES (
                p_task_id,
                v_board_id,
                v_related_id
            );
        END LOOP;
    END IF;

    IF p_replace_labels THEN
        DELETE FROM public.task_labels
        WHERE task_id = p_task_id;

        FOR v_related_id IN
            SELECT requested.label_id
            FROM pg_catalog.unnest(v_label_ids)
                AS requested(label_id)
            ORDER BY requested.label_id
        LOOP
            INSERT INTO public.task_labels (
                task_id,
                board_id,
                label_id
            )
            VALUES (
                p_task_id,
                v_board_id,
                v_related_id
            );
        END LOOP;
    END IF;

    IF p_replace_dependencies THEN
        -- The board advisory lock is already held.
        -- Validation and cycle checks therefore run after any lock wait.
        DELETE FROM public.task_dependencies
        WHERE board_id = v_board_id
          AND blocked_task_id = p_task_id;

        FOR v_related_id IN
            SELECT requested.task_id
            FROM pg_catalog.unnest(v_blocked_by_ids)
                AS requested(task_id)
            ORDER BY requested.task_id
        LOOP
            INSERT INTO public.task_dependencies (
                board_id,
                blocking_task_id,
                blocked_task_id
            )
            VALUES (
                v_board_id,
                v_related_id,
                p_task_id
            );
        END LOOP;
    END IF;

    RETURN NEXT v_task;
    RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.save_task_with_relationships(
    uuid, jsonb, uuid[], uuid[], uuid[], boolean, boolean, boolean
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.save_task_with_relationships(
    uuid, jsonb, uuid[], uuid[], uuid[], boolean, boolean, boolean
) TO authenticated;
