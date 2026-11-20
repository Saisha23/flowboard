from collections.abc import AsyncIterator
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException

from app.api.deps import AuthenticatedUser, get_current_user, get_supabase_for_user
from app.main import app
import app.main as main
from app.services.ai import SummaryResult


USER_ID = "00000000-0000-0000-0000-000000000001"
WORKSPACE_ID = "10000000-0000-0000-0000-000000000001"
BOARD_ID = "20000000-0000-0000-0000-000000000001"
LIST_ID = "30000000-0000-0000-0000-000000000001"
TASK_ID = "40000000-0000-0000-0000-000000000001"
LABEL_ID = "50000000-0000-0000-0000-000000000001"
BLOCKER_ID = "60000000-0000-0000-0000-000000000001"
OLD_EVENT_ID = "70000000-0000-0000-0000-000000000001"
NEW_EVENT_ID = "70000000-0000-0000-0000-000000000002"


def _task_row() -> dict[str, object]:
    return {
        "id": TASK_ID,
        "board_id": BOARD_ID,
        "list_id": LIST_ID,
        "title": "Schema-backed task",
        "description": "",
        "priority": "HIGH",
        "position": 0,
        "due_date": None,
        "completed_at": None,
        "deadline_changes": 0,
        "estimate_hours": None,
        "created_by": USER_ID,
        "created_at": "2026-11-18T00:00:00Z",
        "updated_at": "2026-11-18T00:00:00Z",
    }


class FakeSupabase:
    def __init__(
        self,
        *,
        list_exists: bool = True,
        member_role: str = "owner",
        board_name: str | None = "Schema-backed board",
        missing_activity_table: bool = False,
    ) -> None:
        self.list_exists = list_exists
        self.member_role = member_role
        self.board_name = board_name
        self.missing_activity_table = missing_activity_table
        self.rpc_calls: list[tuple[str, dict[str, object]]] = []
        self.saved_task_arguments: dict[str, object] | None = None
        self.insert_calls: list[tuple[str, dict[str, object]]] = []
        self.select_calls: list[tuple[str, dict[str, str], str | None]] = []
        self.activity_rows: list[dict[str, object]] = []
        self.summary_rows: list[dict[str, object]] = []

    async def select(self, table: str, *, params=None, order=None):
        self.select_calls.append((table, dict(params or {}), order))
        if table == "workspaces":
            return [{
                "id": WORKSPACE_ID,
                "name": "Existing workspace",
                "slug": "existing-workspace",
                "created_by": USER_ID,
                "created_at": "2026-11-18T00:00:00Z",
                "updated_at": "2026-11-18T00:00:00Z",
            }]
        if table == "boards":
            return [{
                "id": BOARD_ID,
                "workspace_id": WORKSPACE_ID,
                "name": self.board_name,
            }]
        if table == "workspace_members":
            return [{
                "workspace_id": WORKSPACE_ID,
                "user_id": USER_ID,
                "role": self.member_role,
                "joined_at": "2026-11-18T00:00:00Z",
            }]
        if table == "profiles":
            return [{
                "id": USER_ID,
                "full_name": "Rae Doe",
                "avatar_url": "https://storage.example/avatar.png",
            }]
        if table == "board_lists":
            return [{
                "id": LIST_ID,
                "board_id": BOARD_ID,
                "name": "In progress",
                "kind": "active",
                "position": 2,
                "created_at": "2026-11-18T00:00:00Z",
            }] if self.list_exists else []
        if table == "task_assignees" and self.saved_task_arguments:
            return [
                {"task_id": TASK_ID, "user_id": user_id}
                for user_id in self.saved_task_arguments["p_assignee_ids"]
            ]
        if table == "task_labels" and self.saved_task_arguments:
            return [
                {"task_id": TASK_ID, "label_id": label_id}
                for label_id in self.saved_task_arguments["p_label_ids"]
            ]
        if table == "task_dependencies" and self.saved_task_arguments:
            return [
                {"blocking_task_id": task_id, "blocked_task_id": TASK_ID}
                for task_id in self.saved_task_arguments["p_blocked_by_ids"]
            ]
        if table == "tasks":
            return [_task_row()]
        if table == "activities":
            if self.missing_activity_table:
                raise HTTPException(
                    status_code=502,
                    detail="Supabase Data API error (404): Could not find the table 'public.activities' in the schema cache",
                )
            return self.activity_rows
        if table == "ai_summaries":
            return self.summary_rows
        return []

    async def rpc(self, function: str, arguments: dict[str, object]):
        self.rpc_calls.append((function, arguments))
        if function == "create_workspace":
            return WORKSPACE_ID
        if function == "create_task_with_relationships":
            self.saved_task_arguments = arguments
            return [_task_row()]
        if function == "save_task_with_relationships":
            self.saved_task_arguments = arguments
            return [{**_task_row(), **arguments["p_task"]}]
        raise AssertionError(f"Unexpected RPC: {function}")

    async def insert(self, table: str, row: dict[str, object]) -> dict[str, object]:
        self.insert_calls.append((table, row))
        return {
            "id": "summary-id",
            "board_id": row["board_id"],
            "summary": row["summary"],
            "highlights": row["highlights"],
            "risks": row["risks"],
            "recommendations": row["recommendations"],
            "created_at": "2026-11-20T00:00:00Z",
        }


def _client_with(fake: FakeSupabase) -> TestClient:
    user = AuthenticatedUser(
        id=USER_ID,
        access_token="test-token",
        claims={"sub": USER_ID, "role": "authenticated", "aud": "authenticated"},
    )
    app.dependency_overrides[get_current_user] = lambda: user

    async def supabase_dependency() -> AsyncIterator[FakeSupabase]:
        yield fake

    app.dependency_overrides[get_supabase_for_user] = supabase_dependency
    return TestClient(app)


def test_workspace_creation_uses_existing_rpc_and_created_by_schema() -> None:
    fake = FakeSupabase()
    client = _client_with(fake)
    try:
        response = client.post("/workspaces", json={"name": "New workspace"})
        assert response.status_code == 501
        assert "RLS" in response.json()["detail"]
        assert fake.rpc_calls == []
    finally:
        app.dependency_overrides.clear()


def test_task_creation_uses_real_list_uuid_and_atomic_relation_rpc() -> None:
    fake = FakeSupabase()
    client = _client_with(fake)
    try:
        response = client.post(
            "/tasks",
            json={
                "board_id": BOARD_ID,
                "list_id": LIST_ID,
                "title": "Schema-backed task",
                "priority": "HIGH",
                "assignee_ids": [USER_ID],
                "label_ids": [LABEL_ID],
                "blocked_by_ids": [BLOCKER_ID],
            },
        )
        assert response.status_code == 201
        assert response.json()["id"] == TASK_ID
        assert response.json()["assignee_ids"] == [USER_ID]
        assert response.json()["label_ids"] == [LABEL_ID]
        assert response.json()["blocked_by_ids"] == [BLOCKER_ID]
        assert fake.rpc_calls == [
            (
                "create_task_with_relationships",
                {
                    "p_task": {
                        "board_id": BOARD_ID,
                        "title": "Schema-backed task",
                        "description": "",
                        "list_id": LIST_ID,
                        "priority": "HIGH",
                        "position": 0,
                        "due_date": None,
                        "completed_at": None,
                        "estimate_hours": None,
                    },
                    "p_assignee_ids": [USER_ID],
                    "p_label_ids": [LABEL_ID],
                    "p_blocked_by_ids": [BLOCKER_ID],
                },
            )
        ]
    finally:
        app.dependency_overrides.clear()


def test_task_creation_rejects_a_list_outside_the_board() -> None:
    fake = FakeSupabase(list_exists=False)
    client = _client_with(fake)
    try:
        response = client.post(
            "/tasks",
            json={"board_id": BOARD_ID, "list_id": LIST_ID, "title": "Invalid list"},
        )
        assert response.status_code == 422
        assert fake.rpc_calls == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("role", ["owner", "member"])
def test_task_update_allows_editors_to_replace_dependencies(role: str) -> None:
    fake = FakeSupabase(member_role=role)
    client = _client_with(fake)
    try:
        response = client.patch(
            f"/tasks/{TASK_ID}",
            json={"blocked_by_ids": [BLOCKER_ID]},
        )

        assert response.status_code == 200
        assert response.json()["blocked_by_ids"] == [BLOCKER_ID]
        assert fake.rpc_calls == [
            (
                "save_task_with_relationships",
                {
                    "p_task_id": TASK_ID,
                    "p_task": {},
                    "p_assignee_ids": [],
                    "p_label_ids": [],
                    "p_blocked_by_ids": [BLOCKER_ID],
                    "p_replace_assignees": False,
                    "p_replace_labels": False,
                    "p_replace_dependencies": True,
                },
            )
        ]
    finally:
        app.dependency_overrides.clear()


def test_task_update_rejects_viewer_before_rpc() -> None:
    fake = FakeSupabase(member_role="viewer")
    client = _client_with(fake)
    try:
        response = client.patch(
            f"/tasks/{TASK_ID}",
            json={"blocked_by_ids": [BLOCKER_ID]},
        )

        assert response.status_code == 403
        assert fake.rpc_calls == []
    finally:
        app.dependency_overrides.clear()


def test_drift_get_and_evaluate_return_current_data_without_snapshot_writes() -> None:
    fake = FakeSupabase()
    client = _client_with(fake)
    try:
        for response in (
            client.get(f"/boards/{BOARD_ID}/drift"),
            client.post(f"/boards/{BOARD_ID}/drift/evaluate"),
        ):
            assert response.status_code == 200
            result = response.json()
            assert result["board_id"] == BOARD_ID
            assert result["drift_score"] == 20
            assert result["health"] == "HEALTHY"
            assert result["historical_trend_available"] is False
            assert result["trend"][-1]["score"] == 20
            assert result["factors"][0]["category"] == "priority"
            assert result["factors"][0]["evidence"][0]["task_title"] == "Schema-backed task"
            assert result["recovery_actions"][0]["title"] == "Review high-priority tasks"
            assert result["recovery_actions"][0]["ai_generated"] is False
            assert result["recovery_actions"][0]["related_task_ids"] == [TASK_ID]
            assert result["activity"] == []
        assert fake.rpc_calls == []
        assert fake.insert_calls == []
    finally:
        app.dependency_overrides.clear()


def test_drift_recommendations_use_risk_and_workload_data_and_activity_is_ordered() -> None:
    fake = FakeSupabase()
    fake.saved_task_arguments = {
        "p_assignee_ids": [USER_ID],
        "p_label_ids": [],
        "p_blocked_by_ids": [],
    }
    fake.activity_rows = [
        {
            "id": NEW_EVENT_ID,
            "board_id": BOARD_ID,
            "task_id": TASK_ID,
            "actor_id": USER_ID,
            "event_type": "task_updated",
            "description": "Task details updated",
            "metadata": {},
            "created_at": "2026-11-20T02:00:00Z",
        },
        {
            "id": OLD_EVENT_ID,
            "board_id": BOARD_ID,
            "task_id": TASK_ID,
            "actor_id": USER_ID,
            "event_type": "task_created",
            "description": "Task created",
            "metadata": {},
            "created_at": "2026-11-20T01:00:00Z",
        },
    ]
    client = _client_with(fake)
    try:
        for response in (
            client.get(f"/boards/{BOARD_ID}/drift"),
            client.post(f"/boards/{BOARD_ID}/drift/evaluate"),
        ):
            assert response.status_code == 200
            result = response.json()
            actions = result["recovery_actions"]
            assert {action["title"] for action in actions} == {
                "Review high-priority tasks",
                "Review concentrated workload",
            }
            assert all(action["ai_generated"] is False for action in actions)
            assert all(action["related_task_ids"] == [TASK_ID] for action in actions)
            assert [event["id"] for event in result["activity"]] == [OLD_EVENT_ID, NEW_EVENT_ID]
            assert [event["detail"] for event in result["activity"]] == ["Task created", "Task details updated"]
        assert (
            "activities",
            {
                "board_id": f"eq.{BOARD_ID}",
                "limit": "100",
                "select": "id,board_id,task_id,actor_id,event_type,description,metadata,created_at",
            },
            "created_at.desc",
        ) in fake.select_calls
    finally:
        app.dependency_overrides.clear()


def test_missing_optional_activity_table_does_not_break_drift_or_activity_endpoints() -> None:
    fake = FakeSupabase(missing_activity_table=True)
    fake.saved_task_arguments = {
        "p_assignee_ids": [USER_ID],
        "p_label_ids": [],
        "p_blocked_by_ids": [],
    }
    client = _client_with(fake)
    try:
        for response in (
            client.get(f"/boards/{BOARD_ID}/drift"),
            client.post(f"/boards/{BOARD_ID}/drift/evaluate"),
        ):
            assert response.status_code == 200
            result = response.json()
            assert result["activity"] == []
            assert result["drift_score"] > 0
            assert result["workload"][0]["open_tasks"] == 1
            assert any(action["title"] == "Review high-priority tasks" for action in result["recovery_actions"])
        assert client.get(f"/boards/{BOARD_ID}/activity").json() == []
        assert client.get(f"/workspaces/{WORKSPACE_ID}/activity").json() == []
    finally:
        app.dependency_overrides.clear()


@pytest.mark.parametrize("role", ["owner", "member"])
def test_board_summary_uses_authenticated_workspace_tasks_and_ai_provider(
    monkeypatch: pytest.MonkeyPatch,
    role: str,
) -> None:
    fake = FakeSupabase(member_role=role)
    client = _client_with(fake)
    captured_metrics: dict[str, object] = {}

    class FakeProvider:
        async def summarize(self, metrics: dict[str, object]) -> SummaryResult:
            captured_metrics.update(metrics)
            return SummaryResult(
                executive_summary=f"Board {BOARD_ID} currently has one pending task.",
                project_overview="A task is in progress.",
                completed_work=[],
                pending_work=[f"Task {TASK_ID}"],
                blockers=[],
                priority_recommendations=[],
                confidence=0.9,
            )

    monkeypatch.setattr(main, "require_settings", lambda: SimpleNamespace(ai_model="test-model"))
    monkeypatch.setattr(main, "get_ai_provider", lambda _: FakeProvider())
    try:
        response = client.post(f"/boards/{BOARD_ID}/summary")

        assert response.status_code == 200
        assert response.json()["ai_generated"] is True
        assert captured_metrics["board"] == {"name": "Schema-backed board"}
        assert BOARD_ID not in str(captured_metrics)
        assert TASK_ID not in str(captured_metrics)
        assert captured_metrics["task_totals"]["total"] == 1
        assert captured_metrics["tasks"][0]["title"] == "Schema-backed task"
        assert response.json()["executive_summary"] == "Board Schema-backed board currently has one pending task."
        assert BOARD_ID not in response.json()["executive_summary"]
        assert response.json()["pending_work"] == ["Task related item"]
        assert fake.insert_calls[0][0] == "ai_summaries"
        assert fake.insert_calls[0][1]["generated_by"] == USER_ID
        assert fake.insert_calls[0][1]["summary"] == response.json()["executive_summary"]
    finally:
        app.dependency_overrides.clear()


def test_board_summary_uses_generic_name_when_board_name_is_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeSupabase(board_name=None)
    client = _client_with(fake)

    class FakeProvider:
        async def summarize(self, metrics: dict[str, object]) -> SummaryResult:
            assert metrics["board"] == {"name": "this board"}
            return SummaryResult(
                executive_summary=f"Board {BOARD_ID} is ready.",
                project_overview="No blockers.",
                completed_work=[],
                pending_work=[],
                blockers=[],
                priority_recommendations=[],
                confidence=0.9,
            )

    monkeypatch.setattr(main, "require_settings", lambda: SimpleNamespace(ai_model="test-model"))
    monkeypatch.setattr(main, "get_ai_provider", lambda _: FakeProvider())
    try:
        response = client.post(f"/boards/{BOARD_ID}/summary")

        assert response.status_code == 200
        assert response.json()["executive_summary"] == "Board this board is ready."
        assert BOARD_ID not in response.json()["executive_summary"]
    finally:
        app.dependency_overrides.clear()


def test_saved_board_summary_replaces_legacy_board_uuid_with_name() -> None:
    fake = FakeSupabase()
    fake.summary_rows = [{
        "id": "summary-id",
        "board_id": BOARD_ID,
        "created_at": "2026-11-20T00:00:00Z",
        "summary": f"Board {BOARD_ID} currently has one task.",
        "highlights": {
            "project_overview": f"Review board {BOARD_ID}.",
            "completed_work": [],
            "pending_work": [],
        },
        "risks": [],
        "recommendations": [{
            "title": f"Review {TASK_ID}",
            "reasoning": "A task was identified.",
            "urgency": "MEDIUM",
        }],
    }]
    client = _client_with(fake)
    try:
        response = client.get(f"/boards/{BOARD_ID}/summary")

        assert response.status_code == 200
        summary = response.json()
        assert "Schema-backed board" in summary["executive_summary"]
        assert BOARD_ID not in summary["executive_summary"]
        assert BOARD_ID not in summary["project_overview"]
        assert TASK_ID not in summary["priority_recommendations"][0]["title"]
    finally:
        app.dependency_overrides.clear()


def test_board_summary_rejects_viewers_before_calling_provider(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeSupabase(member_role="viewer")
    client = _client_with(fake)
    monkeypatch.setattr(main, "get_ai_provider", lambda _: pytest.fail("Viewer reached AI provider."))
    try:
        response = client.post(f"/boards/{BOARD_ID}/summary")

        assert response.status_code == 403
        assert fake.insert_calls == []
    finally:
        app.dependency_overrides.clear()


def test_board_summary_reports_provider_errors_without_saving_fake_insights(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    fake = FakeSupabase()
    client = _client_with(fake)

    class FailingProvider:
        async def summarize(self, _: dict[str, object]) -> SummaryResult:
            raise RuntimeError("AI credentials are not configured.")

    monkeypatch.setattr(main, "require_settings", lambda: SimpleNamespace(ai_model="test-model"))
    monkeypatch.setattr(main, "get_ai_provider", lambda _: FailingProvider())
    try:
        response = client.post(f"/boards/{BOARD_ID}/summary")

        assert response.status_code == 503
        assert response.json()["detail"] == "AI credentials are not configured."
        assert fake.insert_calls == []
    finally:
        app.dependency_overrides.clear()


def test_activity_feed_reads_existing_activities_columns() -> None:
    fake = FakeSupabase()
    fake.activity_rows = [{
        "id": OLD_EVENT_ID,
        "board_id": BOARD_ID,
        "task_id": TASK_ID,
        "actor_id": USER_ID,
        "event_type": "task_created",
        "description": "Created a task",
        "metadata": {},
        "created_at": "2026-11-18T00:00:00Z",
    }]
    client = _client_with(fake)
    try:
        response = client.get(f"/boards/{BOARD_ID}/activity")
        assert response.status_code == 200
        event = response.json()[0]
        assert event["detail"] == "Created a task"
        assert event["event_type"] == "task_created"
        assert event["actor_id"] == USER_ID
        assert (
            "activities",
            {
                "board_id": f"eq.{BOARD_ID}",
                "limit": "100",
                "select": "id,board_id,task_id,actor_id,event_type,description,metadata,created_at",
            },
            "created_at.desc",
        ) in fake.select_calls
    finally:
        app.dependency_overrides.clear()


def test_workspace_activity_filters_existing_activities_through_board_ids() -> None:
    fake = FakeSupabase()
    fake.activity_rows = [{
        "id": OLD_EVENT_ID,
        "board_id": BOARD_ID,
        "task_id": TASK_ID,
        "actor_id": USER_ID,
        "event_type": "task_created",
        "description": "Task created",
        "metadata": {},
        "created_at": "2026-11-18T00:00:00Z",
    }]
    client = _client_with(fake)
    try:
        response = client.get(f"/workspaces/{WORKSPACE_ID}/activity")

        assert response.status_code == 200
        assert response.json()[0]["detail"] == "Task created"
        assert (
            "activities",
            {
                "board_id": f"in.({BOARD_ID})",
                "limit": "100",
                "select": "id,board_id,task_id,actor_id,event_type,description,metadata,created_at",
            },
            "created_at.desc",
        ) in fake.select_calls
    finally:
        app.dependency_overrides.clear()


def test_workspace_members_include_rls_visible_profile_fields() -> None:
    client = _client_with(FakeSupabase())
    try:
        response = client.get(f"/workspaces/{WORKSPACE_ID}/members")
        assert response.status_code == 200
        assert response.json()[0]["name"] == "Rae Doe"
        assert response.json()[0]["avatar_url"] == "https://storage.example/avatar.png"
    finally:
        app.dependency_overrides.clear()


def test_lowercase_role_values_are_normalized_without_accepting_unknown_roles() -> None:
    from fastapi import HTTPException

    from app.main import _api_role

    assert _api_role("owner") == "owner"
    assert _api_role("viewer") == "viewer"
    try:
        _api_role("manager")
    except HTTPException as error:
        assert error.status_code == 502
    else:
        raise AssertionError("Unknown role was accepted.")
