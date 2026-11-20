-- Atomic authenticated task creation. Existing RLS policies remain authoritative.

CREATE OR REPLACE FUNCTION public.lock_task_dependency_board()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
BEGIN
    PERFORM pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtext(NEW.board_id::text),
        0
    );
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.lock_task_dependency_board()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lock_task_dependency_board
    ON public.task_dependencies;
CREATE TRIGGER lock_task_dependency_board
BEFORE INSERT ON public.task_dependencies
FOR EACH ROW
EXECUTE FUNCTION public.lock_task_dependency_board();

CREATE OR REPLACE FUNCTION public.prevent_task_dependency_cycles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_cycle_found boolean;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM inserted_dependencies AS inserted
        WHERE inserted.blocking_task_id = inserted.blocked_task_id
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'A task cannot depend on itself.';
    END IF;

    WITH RECURSIVE dependency_path(board_id, start_id, task_id, visited) AS (
        SELECT
            inserted.board_id,
            inserted.blocked_task_id,
            inserted.blocked_task_id,
            ARRAY[inserted.blocked_task_id]
        FROM inserted_dependencies AS inserted
        UNION ALL
        SELECT
            dependency_path.board_id,
            dependency_path.start_id,
            td.blocked_task_id,
            dependency_path.visited || td.blocked_task_id
        FROM dependency_path
        JOIN public.task_dependencies AS td
          ON td.board_id = dependency_path.board_id
         AND td.blocking_task_id = dependency_path.task_id
        WHERE NOT (td.blocked_task_id = ANY(dependency_path.visited))
    )
    SELECT EXISTS (
        SELECT 1
        FROM inserted_dependencies AS inserted
        WHERE EXISTS (
            SELECT 1
            FROM dependency_path
            WHERE dependency_path.board_id = inserted.board_id
              AND dependency_path.start_id = inserted.blocked_task_id
              AND dependency_path.task_id = inserted.blocking_task_id
        )
    )
    INTO v_cycle_found;

    IF v_cycle_found THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'This dependency would create a cycle.';
    END IF;

    RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.prevent_task_dependency_cycles()
    FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_task_dependency_cycles
    ON public.task_dependencies;
CREATE TRIGGER prevent_task_dependency_cycles
AFTER INSERT ON public.task_dependencies
REFERENCING NEW TABLE AS inserted_dependencies
FOR EACH STATEMENT
EXECUTE FUNCTION public.prevent_task_dependency_cycles();

CREATE OR REPLACE FUNCTION public.create_task_with_relationships(
    p_task jsonb,
    p_assignee_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_label_ids uuid[] DEFAULT ARRAY[]::uuid[],
    p_blocked_by_ids uuid[] DEFAULT ARRAY[]::uuid[]
)
RETURNS SETOF public.tasks
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $function$
DECLARE
    v_user_id uuid := auth.uid();
    v_input public.tasks%ROWTYPE;
    v_task public.tasks%ROWTYPE;
    v_task_input jsonb;
    v_priority text;
    v_workspace_id uuid;
    v_assignee_ids uuid[];
    v_label_ids uuid[];
    v_blocked_by_ids uuid[];
    v_related_id uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Authentication is required to create a task.';
    END IF;

    IF p_task IS NULL OR pg_catalog.jsonb_typeof(p_task) <> 'object' THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Task details must be a JSON object.';
    END IF;

    IF p_task - ARRAY[
        'board_id',
        'list_id',
        'title',
        'description',
        'priority',
        'due_date',
        'position',
        'estimate_hours',
        'completed_at'
    ]::text[] <> '{}'::jsonb THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Task details contain unsupported fields.';
    END IF;

    IF NOT (p_task ? 'board_id')
       OR NOT (p_task ? 'list_id')
       OR NOT (p_task ? 'title') THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'A board, list, and task title are required.';
    END IF;

    v_priority := pg_catalog.lower(COALESCE(p_task ->> 'priority', 'medium'));
    IF v_priority = 'urgent' THEN
        v_priority := 'critical';
    END IF;

    IF v_priority NOT IN ('low', 'medium', 'high', 'critical') THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Task priority must be low, medium, high, or critical.';
    END IF;

    v_task_input := p_task || pg_catalog.jsonb_build_object('priority', v_priority);
    v_input := pg_catalog.jsonb_populate_record(NULL::public.tasks, v_task_input);

    IF v_input.board_id IS NULL OR v_input.list_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'A board and list are required.';
    END IF;

    IF v_input.title IS NULL
       OR pg_catalog.length(pg_catalog.btrim(v_input.title)) = 0
       OR pg_catalog.length(pg_catalog.btrim(v_input.title)) > 200 THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Task title must contain between 1 and 200 characters.';
    END IF;

    v_input.title := pg_catalog.btrim(v_input.title);
    v_input.description := COALESCE(v_input.description, '');
    v_input.priority := COALESCE(v_input.priority, 'medium');
    v_input.position := COALESCE(v_input.position, 0);

    IF pg_catalog.length(v_input.description) > 10000 THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Task description cannot exceed 10000 characters.';
    END IF;

    IF v_input.position < 0 OR v_input.estimate_hours < 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Task position and estimate must be nonnegative.';
    END IF;

    IF NOT public.has_board_role(
        v_input.board_id,
        ARRAY['owner', 'member']::text[]
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Task creation requires an owner or member board role.';
    END IF;

    SELECT b.workspace_id
    INTO v_workspace_id
    FROM public.boards AS b
    WHERE b.id = v_input.board_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Board not found or not accessible.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.board_lists AS bl
        WHERE bl.id = v_input.list_id
          AND bl.board_id = v_input.board_id
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'The selected list does not belong to this board.';
    END IF;

    SELECT ARRAY(
        SELECT DISTINCT requested.user_id
        FROM pg_catalog.unnest(COALESCE(p_assignee_ids, ARRAY[]::uuid[]))
            AS requested(user_id)
        ORDER BY requested.user_id
    )
    INTO v_assignee_ids;

    SELECT ARRAY(
        SELECT DISTINCT requested.label_id
        FROM pg_catalog.unnest(COALESCE(p_label_ids, ARRAY[]::uuid[]))
            AS requested(label_id)
        ORDER BY requested.label_id
    )
    INTO v_label_ids;

    SELECT ARRAY(
        SELECT DISTINCT requested.task_id
        FROM pg_catalog.unnest(COALESCE(p_blocked_by_ids, ARRAY[]::uuid[]))
            AS requested(task_id)
        ORDER BY requested.task_id
    )
    INTO v_blocked_by_ids;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(v_assignee_ids) AS requested(user_id)
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

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(v_label_ids) AS requested(label_id)
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.labels AS l
            WHERE l.id = requested.label_id
              AND l.board_id = v_input.board_id
        )
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Every label must belong to this task board.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_catalog.unnest(v_blocked_by_ids) AS requested(task_id)
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.tasks AS t
            WHERE t.id = requested.task_id
              AND t.board_id = v_input.board_id
        )
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'Every blocking task must belong to this board.';
    END IF;

    INSERT INTO public.tasks (
        board_id,
        list_id,
        title,
        description,
        priority,
        due_date,
        position,
        estimate_hours,
        completed_at,
        created_by
    )
    VALUES (
        v_input.board_id,
        v_input.list_id,
        v_input.title,
        v_input.description,
        v_input.priority,
        v_input.due_date,
        v_input.position,
        v_input.estimate_hours,
        v_input.completed_at,
        v_user_id
    )
    RETURNING * INTO v_task;

    IF v_task.id = ANY(v_blocked_by_ids) THEN
        RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'A task cannot depend on itself.';
    END IF;

    FOR v_related_id IN
        SELECT requested.user_id
        FROM pg_catalog.unnest(v_assignee_ids) AS requested(user_id)
        ORDER BY requested.user_id
    LOOP
        INSERT INTO public.task_assignees (task_id, board_id, user_id)
        VALUES (v_task.id, v_input.board_id, v_related_id);
    END LOOP;

    FOR v_related_id IN
        SELECT requested.label_id
        FROM pg_catalog.unnest(v_label_ids) AS requested(label_id)
        ORDER BY requested.label_id
    LOOP
        INSERT INTO public.task_labels (task_id, board_id, label_id)
        VALUES (v_task.id, v_input.board_id, v_related_id);
    END LOOP;

    FOR v_related_id IN
        SELECT requested.task_id
        FROM pg_catalog.unnest(v_blocked_by_ids) AS requested(task_id)
        ORDER BY requested.task_id
    LOOP
        INSERT INTO public.task_dependencies (
            board_id,
            blocking_task_id,
            blocked_task_id
        )
        VALUES (v_input.board_id, v_related_id, v_task.id);
    END LOOP;

    RETURN NEXT v_task;
    RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_task_with_relationships(
    jsonb,
    uuid[],
    uuid[],
    uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_task_with_relationships(
    jsonb,
    uuid[],
    uuid[],
    uuid[]
) TO authenticated;
