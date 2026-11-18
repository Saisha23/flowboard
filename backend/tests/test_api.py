from collections.abc import AsyncIterator
from fastapi.testclient import TestClient

from app.api.deps import AuthenticatedUser, get_current_user, get_supabase_for_user
from app.main import app
from pathlib import Path


client = TestClient(app)


def test_health_is_public() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "service": "flowboard-api"}


def test_me_requires_bearer_token() -> None:
    response = client.get("/me")
    assert response.status_code == 401
    assert response.json()["detail"] == "Missing bearer token."


def test_me_rejects_malformed_bearer_token() -> None:
    response = client.get("/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Malformed access token."


def test_me_returns_authenticated_profile_via_user_scoped_dependency(monkeypatch) -> None:
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("SUPABASE_ANON_KEY", "test-anon-key")
    monkeypatch.setenv("SUPABASE_JWT_SECRET", "test-secret")
    monkeypatch.setenv("JWT_ALGORITHMS", "HS256")

    user = AuthenticatedUser(
        id="00000000-0000-0000-0000-000000000001",
        access_token="test-token",
        claims={
            "sub": "00000000-0000-0000-0000-000000000001",
            "email": "owner@example.com",
            "role": "authenticated",
            "aud": "authenticated",
        },
    )

    app.dependency_overrides[get_current_user] = lambda: user

    async def fake_supabase_dependency() -> AsyncIterator[object]:
        class FakeSupabase:
            async def get_profile(self, user_id: str) -> dict[str, object] | None:
                assert user_id == user.id
                return {"id": user_id, "display_name": "Owner"}

        yield FakeSupabase()

    app.dependency_overrides[get_supabase_for_user] = fake_supabase_dependency
    try:
        response = client.get("/me")
        assert response.status_code == 200
        assert response.json()["id"] == user.id
        assert response.json()["profile"]["display_name"] == "Owner"
    finally:
        app.dependency_overrides.clear()


def test_phase1_migration_defines_tables_and_rls() -> None:
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180001_phase1_auth_database.sql"
    sql = migration.read_text(encoding="utf-8")
    for table in ("profiles", "workspaces", "workspace_members", "boards", "tasks"):
        assert f"create table if not exists public.{table}" in sql
        assert f"alter table public.{table} enable row level security" in sql
    assert "handle_new_auth_user" in sql
    assert "on_workspace_created" in sql


def test_phase2_migration_adds_shared_profile_visibility() -> None:
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180002_phase2_profile_membership_visibility.sql"
    sql = migration.read_text(encoding="utf-8")
    assert "profiles_select_workspace_member" in sql
    assert "workspace_members" in sql


def test_workspace_crud_requires_authentication() -> None:
    assert client.get("/workspaces").status_code == 401
    assert client.post("/workspaces", json={"name": "Test"}).status_code == 401


def test_board_and_task_endpoints_reject_invalid_identifiers() -> None:
    assert client.get("/boards/not-a-uuid").status_code in {401, 422}
    assert client.get("/boards/not-a-uuid/tasks").status_code in {401, 422}


def test_phase3_migration_defines_activity_table_and_rls() -> None:
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180003_phase3_activity_events.sql"
    sql = migration.read_text(encoding="utf-8")
    assert "create table if not exists public.activity_events" in sql
    assert "enable row level security" in sql
    assert "record_task_activity" in sql
    assert "activity_events_select_member" in sql


def test_deterministic_risk_helpers() -> None:
    from app.main import _is_completed, _risk_health, _normalize_drift_score, _parse_datetime
    assert _is_completed({"status": "DONE"})
    assert _is_completed({"list_id": "list-5"})
    assert not _is_completed({"status": "TODO", "list_id": "list-2"})
    assert _risk_health(24) == "HEALTHY"
    assert _risk_health(25) == "WATCH"
    assert _risk_health(50) == "AT_RISK"
    assert _risk_health(75) == "CRITICAL"
    assert _normalize_drift_score(115) == 100
    assert _normalize_drift_score(74) == 74
    assert _normalize_drift_score(-1) == 0
    assert _parse_datetime(None) is None
    assert _parse_datetime("not-a-date") is None


def test_phase4_hardening_migration_exists() -> None:
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180004_phase4_security_hardening.sql"
    sql = migration.read_text(encoding="utf-8")
    assert "is_workspace_editor" in sql
    assert "protect_workspace_owner" in sql
    assert "revoke execute" in sql
    assert "protect_last_workspace_owner" in sql
    assert "workspace must retain at least one owner" in sql
