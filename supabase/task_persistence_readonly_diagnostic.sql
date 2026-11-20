-- Read-only task persistence diagnostics for Supabase SQL Editor.
-- Every executable statement below is SELECT-only. The script reads catalog
-- metadata and does not inspect application rows, modify schema, or write data.
--
-- Review each result set independently. Table grants do not bypass RLS, and
-- policy expressions may depend on auth.uid() and row values. This script
-- reports the relevant metadata; it does not simulate a user's row-level access.

-- 1. Confirm whether the two task RPCs exist in public.
WITH requested_functions(function_name) AS (
    VALUES
        ('save_task_with_relationships'::name),
        ('has_board_role'::name)
)
SELECT
    requested.function_name,
    EXISTS (
        SELECT 1
        FROM pg_catalog.pg_proc AS p
        JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname = requested.function_name
          AND p.prokind = 'f'
    ) AS exists_in_public
FROM requested_functions AS requested
ORDER BY requested.function_name;

-- 2. Show every overload's signature, security mode, owner, settings,
--    effective EXECUTE access, and complete current definition.
SELECT
    p.proname AS function_name,
    format(
        '%I.%I(%s)',
        n.nspname,
        p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid)
    ) AS identity_signature,
    pg_catalog.pg_get_function_arguments(p.oid) AS arguments_with_defaults,
    pg_catalog.pg_get_function_result(p.oid) AS result_type,
    l.lanname AS language,
    CASE
        WHEN p.prosecdef THEN 'SECURITY DEFINER'
        ELSE 'SECURITY INVOKER'
    END AS security_mode,
    p.proowner::regrole AS function_owner,
    p.proconfig AS function_settings,
    CASE
        WHEN authenticated_role.oid IS NULL THEN NULL
        ELSE pg_catalog.has_function_privilege(
            authenticated_role.oid,
            p.oid,
            'EXECUTE'
        )
    END AS authenticated_can_execute,
    CASE
        WHEN anon_role.oid IS NULL THEN NULL
        ELSE pg_catalog.has_function_privilege(anon_role.oid, p.oid, 'EXECUTE')
    END AS anon_can_execute,
    pg_catalog.pg_get_functiondef(p.oid) AS complete_definition
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
JOIN pg_catalog.pg_language AS l ON l.oid = p.prolang
LEFT JOIN pg_catalog.pg_roles AS authenticated_role
    ON authenticated_role.rolname = 'authenticated'
LEFT JOIN pg_catalog.pg_roles AS anon_role
    ON anon_role.rolname = 'anon'
WHERE n.nspname = 'public'
  AND p.proname IN ('save_task_with_relationships', 'has_board_role')
  AND p.prokind = 'f'
ORDER BY p.proname, identity_signature;

-- 3. Expand function ACLs, including default ACLs when proacl is NULL.
SELECT
    p.proname AS function_name,
    format(
        '%I.%I(%s)',
        n.nspname,
        p.proname,
        pg_catalog.pg_get_function_identity_arguments(p.oid)
    ) AS identity_signature,
    CASE
        WHEN acl_entry.grantee = 0 THEN 'PUBLIC'
        ELSE COALESCE(grantee_role.rolname, 'OID ' || acl_entry.grantee::text)
    END AS grantee,
    grantor_role.rolname AS grantor,
    acl_entry.privilege_type,
    acl_entry.is_grantable
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
CROSS JOIN LATERAL pg_catalog.aclexplode(
    COALESCE(p.proacl, pg_catalog.acldefault('f', p.proowner))
) AS acl_entry
LEFT JOIN pg_catalog.pg_roles AS grantee_role
    ON grantee_role.oid = acl_entry.grantee
LEFT JOIN pg_catalog.pg_roles AS grantor_role
    ON grantor_role.oid = acl_entry.grantor
WHERE n.nspname = 'public'
  AND p.proname IN ('save_task_with_relationships', 'has_board_role')
  AND p.prokind = 'f'
ORDER BY p.proname, identity_signature, grantee, acl_entry.privilege_type;

-- 4. List user-defined triggers on task, relationship, list, and activity
--    tables, including each trigger function's security mode and definition.
SELECT
    table_namespace.nspname AS table_schema,
    table_class.relname AS table_name,
    trg.tgname AS trigger_name,
    trg.tgenabled AS trigger_enabled_state,
    pg_catalog.pg_get_triggerdef(trg.oid, true) AS trigger_definition,
    function_namespace.nspname AS function_schema,
    function_proc.proname AS function_name,
    format(
        '%I.%I(%s)',
        function_namespace.nspname,
        function_proc.proname,
        pg_catalog.pg_get_function_identity_arguments(function_proc.oid)
    ) AS trigger_function_signature,
    CASE
        WHEN function_proc.prosecdef THEN 'SECURITY DEFINER'
        ELSE 'SECURITY INVOKER'
    END AS trigger_function_security,
    function_proc.proowner::regrole AS trigger_function_owner,
    pg_catalog.pg_get_functiondef(function_proc.oid) AS trigger_function_definition
FROM pg_catalog.pg_trigger AS trg
JOIN pg_catalog.pg_class AS table_class ON table_class.oid = trg.tgrelid
JOIN pg_catalog.pg_namespace AS table_namespace
    ON table_namespace.oid = table_class.relnamespace
JOIN pg_catalog.pg_proc AS function_proc ON function_proc.oid = trg.tgfoid
JOIN pg_catalog.pg_namespace AS function_namespace
    ON function_namespace.oid = function_proc.pronamespace
WHERE NOT trg.tgisinternal
  AND table_namespace.nspname = 'public'
  AND table_class.relname = ANY (ARRAY[
      'tasks',
      'board_lists',
      'task_assignees',
      'task_labels',
      'task_dependencies',
      'task_deadline_history',
      'activities',
      'activity_events'
  ]::name[])
ORDER BY table_class.relname, trg.tgname;

-- 5. Show which requested public tables exist and whether RLS is enabled or
--    forced. A missing table returns table_exists = false.
WITH requested_tables(table_name) AS (
    VALUES
        ('tasks'::name),
        ('board_lists'::name),
        ('task_assignees'::name),
        ('task_labels'::name),
        ('task_dependencies'::name),
        ('task_deadline_history'::name),
        ('activities'::name),
        ('activity_events'::name)
)
SELECT
    requested.table_name,
    relation.oid IS NOT NULL AS table_exists,
    relation.relrowsecurity AS rls_enabled,
    relation.relforcerowsecurity AS rls_forced
FROM requested_tables AS requested
LEFT JOIN pg_catalog.pg_namespace AS table_namespace
    ON table_namespace.nspname = 'public'
LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = table_namespace.oid
   AND relation.relname = requested.table_name
   AND relation.relkind IN ('r', 'p')
ORDER BY requested.table_name;

-- 6. Return all policies on the requested tables. Empty results for a table
--    mean no visible policy rows were found for that public table.
SELECT
    policy.schemaname,
    policy.tablename,
    policy.policyname,
    policy.permissive,
    policy.roles,
    policy.cmd AS command,
    policy.qual AS using_expression,
    policy.with_check AS check_expression
FROM pg_catalog.pg_policies AS policy
WHERE policy.schemaname = 'public'
  AND policy.tablename = ANY (ARRAY[
      'tasks',
      'board_lists',
      'task_assignees',
      'task_labels',
      'task_dependencies',
      'task_deadline_history',
      'activities',
      'activity_events'
  ]::name[])
ORDER BY policy.tablename, policy.policyname;

-- 7. Check effective table-level grants for authenticated on the operations
--    relevant to task creation, relation replacement, reads, and task activity.
--    A true grant is necessary but does not mean an RLS policy will allow a row.
WITH requested_access(table_name, privilege) AS (
    VALUES
        ('tasks'::name, 'SELECT'),
        ('tasks'::name, 'INSERT'),
        ('tasks'::name, 'UPDATE'),
        ('board_lists'::name, 'SELECT'),
        ('task_assignees'::name, 'SELECT'),
        ('task_assignees'::name, 'INSERT'),
        ('task_assignees'::name, 'DELETE'),
        ('task_labels'::name, 'SELECT'),
        ('task_labels'::name, 'INSERT'),
        ('task_labels'::name, 'DELETE'),
        ('task_dependencies'::name, 'SELECT'),
        ('task_dependencies'::name, 'INSERT'),
        ('task_dependencies'::name, 'DELETE'),
        ('task_deadline_history'::name, 'INSERT'),
        ('activities'::name, 'INSERT'),
        ('activity_events'::name, 'INSERT')
)
SELECT
    requested.table_name,
    requested.privilege,
    authenticated_role.rolname AS checked_role,
    relation.oid IS NOT NULL AS table_exists,
    CASE
        WHEN relation.oid IS NULL OR authenticated_role.oid IS NULL THEN NULL
        ELSE pg_catalog.has_table_privilege(
            authenticated_role.oid,
            relation.oid,
            requested.privilege
        )
    END AS table_privilege_granted
FROM requested_access AS requested
LEFT JOIN pg_catalog.pg_roles AS authenticated_role
    ON authenticated_role.rolname = 'authenticated'
LEFT JOIN pg_catalog.pg_namespace AS table_namespace
    ON table_namespace.nspname = 'public'
LEFT JOIN pg_catalog.pg_class AS relation
    ON relation.relnamespace = table_namespace.oid
   AND relation.relname = requested.table_name
   AND relation.relkind IN ('r', 'p')
ORDER BY requested.table_name, requested.privilege;
