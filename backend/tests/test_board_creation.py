from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from fastapi.testclient import TestClient

from app.api.deps import AuthenticatedUser, get_current_user, get_supabase_for_user
from app.main import app


USER_ID = "10000000-0000-0000-0000-000000000001"
WORKSPACE_ID = "20000000-0000-0000-0000-000000000001"
BOARD_ID = "30000000-0000-0000-0000-000000000001"
LIST_ID = "40000000-0000-0000-0000-000000000001"


class FakeSupabase:
    def __init__(self, role: str = "owner") -> None:
        self.role = role
        self.inserted: list[tuple[str, dict[str, Any]]] = []
        self.lists: list[dict[str, Any]] = []
        self.labels: list[dict[str, Any]] = []

    async def select(
        self,
        table: str,
        *,
        params: dict[str, str] | None = None,
        order: str | None = None,
    ) -> list[dict[str, Any]]:
        if table == "workspaces":
            return [{
                "id": WORKSPACE_ID,
                "name": "Flowboard team",
                "slug": "flowboard-team",
                "created_by": USER_ID,
                "created_at": "2026-11-20T00:00:00Z",
                "updated_at": "2026-11-20T00:00:00Z",
            }]
        if table == "workspace_members":
            return [{
                "workspace_id": WORKSPACE_ID,
                "user_id": USER_ID,
                "role": self.role,
                "joined_at": "2026-11-20T00:00:00Z",
            }]
        if table == "boards":
            return [{"id": BOARD_ID, "workspace_id": WORKSPACE_ID}]
        if table == "board_lists":
            return self.lists
        if table == "labels":
            return self.labels
        return []

    async def insert(self, table: str, row: dict[str, Any]) -> dict[str, Any]:
        self.inserted.append((table, row))
        if table == "boards":
            return {
                "id": BOARD_ID,
                **row,
                "created_at": "2026-11-20T00:00:00Z",
                "updated_at": "2026-11-20T00:00:00Z",
            }
        if table == "labels":
            created_label = {
                "id": "50000000-0000-0000-0000-000000000001",
                **row,
                "color": "mint",
            }
            self.labels.append(created_label)
            return created_label
        created_list = {
            "id": LIST_ID,
            **row,
            "created_at": "2026-11-20T00:00:00Z",
        }
        self.lists.append(created_list)
        return created_list


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


def test_workspace_member_creates_board_in_selected_workspace_as_self() -> None:
    fake = FakeSupabase(role="member")
    client = _client_with(fake)
    try:
        response = client.post(
            "/boards",
            json={"workspace_id": WORKSPACE_ID, "name": " Product ", "description": ""},
        )

        assert response.status_code == 201
        assert response.json()["workspace_id"] == WORKSPACE_ID
        assert response.json()["name"] == "Product"
        assert fake.inserted == [(
            "boards",
            {
                "workspace_id": WORKSPACE_ID,
                "name": "Product",
                "description": "",
                "created_by": USER_ID,
            },
        )]
    finally:
        app.dependency_overrides.clear()


def test_viewer_cannot_create_board() -> None:
    fake = FakeSupabase(role="viewer")
    client = _client_with(fake)
    try:
        response = client.post(
            "/boards",
            json={"workspace_id": WORKSPACE_ID, "name": "Restricted"},
        )

        assert response.status_code == 403
        assert fake.inserted == []
    finally:
        app.dependency_overrides.clear()


def test_workspace_member_can_create_a_list_on_the_selected_board() -> None:
    fake = FakeSupabase(role="member")
    client = _client_with(fake)
    try:
        response = client.post(
            f"/boards/{BOARD_ID}/lists",
            json={"name": " In progress "},
        )

        assert response.status_code == 201
        assert response.json()["board_id"] == BOARD_ID
        assert response.json()["name"] == "In progress"
        assert response.json()["kind"] == "active"
        assert response.json()["position"] == 0
        assert fake.inserted == [(
            "board_lists",
            {
                "board_id": BOARD_ID,
                "name": "In progress",
                "kind": "active",
                "position": 0,
            },
        )]
    finally:
        app.dependency_overrides.clear()


def test_workspace_member_creates_board_label_using_only_existing_columns() -> None:
    fake = FakeSupabase(role="member")
    client = _client_with(fake)
    try:
        response = client.post(
            f"/boards/{BOARD_ID}/labels",
            json={"name": " Research "},
        )

        assert response.status_code == 201
        assert response.json() == {
            "id": "50000000-0000-0000-0000-000000000001",
            "board_id": BOARD_ID,
            "name": "Research",
            "color": "mint",
        }
        assert fake.inserted == [(
            "labels",
            {
                "board_id": BOARD_ID,
                "name": "Research",
            },
        )]
    finally:
        app.dependency_overrides.clear()


def test_viewer_cannot_create_board_label() -> None:
    fake = FakeSupabase(role="viewer")
    client = _client_with(fake)
    try:
        response = client.post(
            f"/boards/{BOARD_ID}/labels",
            json={"name": "Restricted"},
        )

        assert response.status_code == 403
        assert fake.inserted == []
    finally:
        app.dependency_overrides.clear()


def test_board_label_requires_non_empty_trimmed_name() -> None:
    fake = FakeSupabase(role="member")
    client = _client_with(fake)
    try:
        response = client.post(
            f"/boards/{BOARD_ID}/labels",
            json={"name": "   "},
        )

        assert response.status_code == 422
        assert fake.inserted == []
    finally:
        app.dependency_overrides.clear()
