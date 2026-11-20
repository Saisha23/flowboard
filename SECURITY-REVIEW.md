# Flowboard AI Security Review

## Supported Roles

- OWNER: workspace deletion, membership management, board management and task operations.
- ADMIN: board management and task operations; cannot manage workspace ownership or membership under the backend design.
- MEMBER: read workspace data and create/edit tasks.
- VIEWER: read-only workspace, board, task and activity access.

MANAGER is not a database role. It is only an internal authorization shorthand for OWNER or ADMIN.

## Permission Matrix

| Operation | OWNER | ADMIN | MEMBER | VIEWER |
|---|---:|---:|---:|---:|
| View workspace, boards, tasks and activity | Yes | Yes | Yes | Yes |
| Create or edit tasks | Yes | Yes | Yes | No |
| Delete tasks | Yes | No | No | No |
| Create, edit or delete boards | Yes | Yes | No | No |
| Manage workspace membership | Yes | No | No | No |
| Update workspace details | Yes | Yes | No | No |
| Delete workspace | Yes | No | No | No |

## Findings Addressed

1. The frontend now declares and renders ADMIN consistently.
2. Migration 001 now uses hardened task write policies and owner-only workspace deletion.
3. Migration 004 prevents workspace owner reassignment and the loss of the final owner.
4. Migration 004 revokes public and ordinary-role execution for internal functions and activity helpers.
5. FastAPI task mutations require OWNER, ADMIN or MEMBER.
6. FastAPI workspace-member updates prevent owner self-demotion.
7. AI summaries now receive task evidence with titles, statuses, priorities, due dates, completion and blocker indicators, while treating titles and text as untrusted.
8. AI recommendations now use a structured typed schema with allowed urgency values.
9. Drift parsing safely ignores missing or invalid dates.
10. Migration 003 DELETE activity trigger logic now uses OLD/NEW records safely.

## Migration Execution Order

1. 202611180001_phase1_auth_database.sql
2. 202611180002_phase2_profile_membership_visibility.sql
3. 202611180003_phase3_activity_events.sql
4. 202611180004_phase4_security_hardening.sql

These migrations were reviewed but not executed.

## Remaining Live-Environment Actions

- Apply migrations in the documented order.
- Verify effective policies after migration with OWNER, ADMIN, MEMBER and VIEWER test users.
- Test final-owner demotion/removal constraints.
- Configure Supabase redirect URLs and AI environment variables.
- Test live JWT issuer/signing configuration.
- Test live RLS cross-workspace isolation.
- Test live activity trigger events.
- Test AI provider output and rate limits.

## Verification

The test counts from the original review are historical and are not a current
test report. Use the commands in `README.md` to run the frontend and backend
checks against the current working tree before publishing or applying
migrations.
