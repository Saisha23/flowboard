from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from uuid import UUID

import pytest
from fastapi import HTTPException

from app.api.deps import AuthenticatedUser
import app.main as main


USER_ID = UUID("10000000-0000-0000-0000-000000000001")
WORKSPACE_ID = UUID("20000000-0000-0000-0000-000000000001")
BOARD_ID = UUID("30000000-0000-0000-0000-000000000001")
LIST_ID = UUID("40000000-0000-0000-0000-000000000001")
TASK_ID = UUID("50000000-0000-0000-0000-000000000001")
BLOCKER_IDS = [
    UUID("70000000-0000-0000-0000-000000000001"),
    UUID("70000000-0000-0000-0000-000000000002"),
]


class FakeSupabase:
    def __init__(
        self,
        *,
        list_exists: bool = True,
        rpc_error: HTTPException | None = None,
    ) -> None:
        self.list_exists = list_exists
        self.rpc_error = rpc_error
        self.rpc_calls: list[tuple[str, dict[str, Any]]] = []

    async def select(
        self,
        table: str,
        *,
        params: dict[str, str] | None = None,
        order: str | None = None,
    ) -> list[dict[str, Any]]:
        if table == "task_dependencies":
            return [
                {
                    "blocked_task_id": str(TASK_ID),
                    "blocking_task_id": str(blocker_id),
                }
                for blocker_id in BLOCKER_IDS
            ]
        if table != "board_lists" or not self.list_exists:
            return []
        return [
            {
                "id": str(LIST_ID),
                "board_id": str(BOARD_ID),
                "name": "To do",
                "position": 0,
                "kind": "todo",
            }
        ]

    async def rpc(self, function: str, arguments: dict[str, Any]) -> Any:
        self.rpc_calls.append((function, arguments))
        if self.rpc_error is not None:
            raise self.rpc_error
        return [
            {
                "id": str(TASK_ID),
                "board_id": str(BOARD_ID),
                "list_id": str(LIST_ID),
                "title": "Write tests",
                "description": "Task details",
                "priority": "HIGH",
                "position": 4,
                "due_date": None,
                "completed_at": None,
                "estimate_hours": 3.5,
                "deadline_changes": 0,
                "created_by": str(USER_ID),
                "created_at": datetime.now(timezone.utc).isoformat(),
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        ]


def _authenticated_user() -> AuthenticatedUser:
    return AuthenticatedUser(
        id=str(USER_ID),
        access_token="test-token",
        claims={"sub": str(USER_ID), "role": "authenticated"},
    )


def _allow_board_access(monkeypatch: pytest.MonkeyPatch) -> None:
    async def get_board(supabase: Any, board_id: UUID) -> dict[str, Any]:
        assert board_id == BOARD_ID
        return {"id": str(BOARD_ID), "workspace_id": str(WORKSPACE_ID)}

    async def require_editor(
        supabase: Any,
        user: AuthenticatedUser,
        workspace_id: UUID,
    ) -> dict[str, Any]:
        assert user.id == str(USER_ID)
        assert workspace_id == WORKSPACE_ID
        return {"id": str(WORKSPACE_ID)}

    monkeypatch.setattr(main, "_get_board", get_board)
    monkeypatch.setattr(main, "_require_workspace_editor", require_editor)


def _payload() -> main.TaskCreate:
    return main.TaskCreate(
        board_id=BOARD_ID,
        list_id=LIST_ID,
        title="Write tests",
        description="Task details",
        priority="HIGH",
        position=4,
        assignee_ids=[USER_ID],
        label_ids=[UUID("60000000-0000-0000-0000-000000000001")],
        blocked_by_ids=BLOCKER_IDS,
        estimate_hours=3.5,
    )


@pytest.mark.asyncio
async def test_create_task_calls_authenticated_rpc_and_hydrates_response(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _allow_board_access(monkeypatch)
    supabase = FakeSupabase()

    task = await main.create_task(_payload(), _authenticated_user(), supabase)

    assert task.id == TASK_ID
    assert task.assignee_ids == []
    assert task.label_ids == []
    assert task.blocked_by_ids == BLOCKER_IDS
    assert supabase.rpc_calls == [
        (
            "create_task_with_relationships",
            {
                "p_task": {
                    "board_id": str(BOARD_ID),
                    "title": "Write tests",
                    "description": "Task details",
                    "list_id": str(LIST_ID),
                    "priority": "HIGH",
                    "position": 4,
                    "due_date": None,
                    "completed_at": None,
                    "estimate_hours": 3.5,
                },
                "p_assignee_ids": [str(USER_ID)],
                "p_label_ids": ["60000000-0000-0000-0000-000000000001"],
                "p_blocked_by_ids": [str(value) for value in BLOCKER_IDS],
            },
        )
    ]


@pytest.mark.asyncio
async def test_create_task_rejects_list_from_another_board_before_rpc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _allow_board_access(monkeypatch)
    supabase = FakeSupabase(list_exists=False)

    with pytest.raises(HTTPException) as error:
        await main.create_task(_payload(), _authenticated_user(), supabase)

    assert error.value.status_code == 422
    assert not supabase.rpc_calls


@pytest.mark.asyncio
async def test_create_task_rejects_unauthorized_user_before_rpc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def deny_access(
        supabase: Any,
        user: AuthenticatedUser,
        workspace_id: UUID,
    ) -> None:
        raise HTTPException(403, "Workspace edit permission required.")

    async def get_board(*_: Any) -> dict[str, Any]:
        return {"id": str(BOARD_ID), "workspace_id": str(WORKSPACE_ID)}

    monkeypatch.setattr(main, "_get_board", get_board)
    monkeypatch.setattr(main, "_require_workspace_editor", deny_access)
    supabase = FakeSupabase()

    with pytest.raises(HTTPException) as error:
        await main.create_task(_payload(), _authenticated_user(), supabase)

    assert error.value.status_code == 403
    assert not supabase.rpc_calls


@pytest.mark.asyncio
async def test_create_task_does_not_report_success_when_rpc_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _allow_board_access(monkeypatch)
    supabase = FakeSupabase(rpc_error=HTTPException(422, "Assignee is not a workspace member."))

    with pytest.raises(HTTPException) as error:
        await main.create_task(_payload(), _authenticated_user(), supabase)

    assert error.value.status_code == 422
    assert "workspace member" in str(error.value.detail)


@pytest.mark.asyncio
async def test_create_task_returns_cycle_validation_error_from_database_rpc(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _allow_board_access(monkeypatch)
    supabase = FakeSupabase(rpc_error=HTTPException(422, "This dependency would create a cycle."))

    with pytest.raises(HTTPException) as error:
        await main.create_task(_payload(), _authenticated_user(), supabase)

    assert error.value.status_code == 422
    assert error.value.detail == "This dependency would create a cycle."
    assert supabase.rpc_calls[0][1]["p_blocked_by_ids"] == [str(value) for value in BLOCKER_IDS]


def test_task_creation_migration_keeps_rls_and_validates_relationships() -> None:
    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "202611200001_create_task_with_relationships.sql"
    )
    sql = migration.read_text(encoding="utf-8").lower()
    rpc = sql.split("create or replace function public.create_task_with_relationships(", 1)[1]
    rpc = rpc.split("$function$;", 1)[0]
    lock_guard = sql.split("create or replace function public.lock_task_dependency_board()", 1)[1]
    lock_guard = lock_guard.split("$function$;", 1)[0]
    cycle_guard = sql.split("create or replace function public.prevent_task_dependency_cycles()", 1)[1]
    cycle_guard = cycle_guard.split("$function$;", 1)[0]

    assert "security invoker" in rpc
    assert "set search_path = ''" in rpc
    assert "v_priority not in ('low', 'medium', 'high', 'critical')" in rpc
    assert "v_priority := 'critical'" in rpc
    assert "coalesce(p_task ->> 'priority', 'medium')" in rpc
    assert "pg_catalog.length(pg_catalog.btrim(v_input.title)) > 200" in rpc
    assert "auth.uid()" in rpc
    assert "public.has_board_role" in rpc
    assert "array['owner', 'member']" in rpc
    assert "public.board_lists" in rpc
    assert "public.workspace_members" in rpc
    assert "wm.workspace_id = v_workspace_id" in rpc
    assert "wm.user_id = requested.user_id" in rpc
    assert "public.labels" in rpc
    assert "l.id = requested.label_id" in rpc
    assert "l.board_id = v_input.board_id" in rpc
    assert "public.tasks" in rpc
    assert "t.id = requested.task_id" in rpc
    assert "t.board_id = v_input.board_id" in rpc
    assert "select distinct requested" in rpc
    assert "insert into public.task_deadline_history" not in rpc
    assert "insert into public.task_assignees" in rpc
    assert "insert into public.task_labels" in rpc
    assert "insert into public.task_dependencies" in rpc
    assert "exception when" not in rpc
    assert "security invoker" in cycle_guard
    assert "security invoker" in lock_guard
    assert "pg_advisory_xact_lock" in lock_guard
    assert "inserted.blocking_task_id = inserted.blocked_task_id" in cycle_guard
    assert "with recursive dependency_path" in cycle_guard
    assert "dependency_path.start_id = inserted.blocked_task_id" in cycle_guard
    assert "dependency_path.task_id = inserted.blocking_task_id" in cycle_guard
    assert "this dependency would create a cycle." in cycle_guard
    assert "referencing new table as inserted_dependencies" in sql
    assert "before insert on public.task_dependencies" in sql
    assert "after insert on public.task_dependencies" in sql
    assert "grant execute on function public.create_task_with_relationships" in sql
    assert "to authenticated" in sql
    assert "alter policy" not in sql
    assert "create policy" not in sql


def test_task_update_migration_preserves_rls_and_dependency_cycle_checks() -> None:
    migration = (
        Path(__file__).resolve().parents[2]
        / "supabase"
        / "migrations"
        / "202611210001_save_task_with_relationships.sql"
    )
    sql = migration.read_text(encoding="utf-8").lower()
    rpc = sql.split("create or replace function public.save_task_with_relationships(", 1)[1]
    rpc = rpc.split("$function$;", 1)[0]
    dependency_replacement = rpc.split("if p_replace_dependencies then", 1)[1]

    assert "security invoker" in rpc
    assert "set search_path = ''" in rpc
    assert "auth.uid()" in rpc
    assert "public.has_board_role" in rpc
    assert "array['owner', 'member']" in rpc
    assert "public.board_lists" in rpc
    assert "public.workspace_members" in rpc
    assert "public.labels" in rpc
    assert "public.task_assignees" in rpc
    assert "public.task_labels" in rpc
    assert "public.task_dependencies" in rpc
    assert "dependencies must reference another task on the same board." in rpc
    assert "completed_at = case" in rpc
    assert "when p_task ? 'completed_at' then v_input.completed_at" in rpc
    assert "pg_advisory_xact_lock" in dependency_replacement
    assert dependency_replacement.index("pg_advisory_xact_lock") < dependency_replacement.index(
        "delete from public.task_dependencies"
    )
    assert "insert into public.task_deadline_history" not in rpc
    assert "insert into public.task_dependencies" in rpc
    assert "revoke all on function public.save_task_with_relationships" in sql
    assert "grant execute on function public.save_task_with_relationships" in sql
    assert "to authenticated" in sql
    assert "create policy" not in sql
    assert "alter policy" not in sql
