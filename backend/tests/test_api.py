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


def test_board_analytics_endpoints_require_bearer_authentication() -> None:
    board_id = "20000000-0000-0000-0000-000000000001"

    assert client.get(f"/boards/{board_id}/drift").status_code == 401
    assert client.post(f"/boards/{board_id}/drift/evaluate").status_code == 401
    assert client.post(f"/boards/{board_id}/summary").status_code == 401


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
    assert _is_completed({"completed_at": "2026-11-18T00:00:00Z"})
    assert not _is_completed({"completed_at": None})
    assert not _is_completed({"status": "DONE"})
    assert not _is_completed({"list_id": "10000000-0000-0000-0000-000000000005"})
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


def test_phase_migrations_are_ordered_and_reapplication_is_safe() -> None:
    migration_dir = Path(__file__).resolve().parents[2] / "supabase" / "migrations"
    expected_names = [
        "202611180001_phase1_auth_database.sql",
        "202611180002_phase2_profile_membership_visibility.sql",
        "202611180003_phase3_activity_events.sql",
        "202611180004_phase4_security_hardening.sql",
        "202611200001_create_task_with_relationships.sql",
        "202611210001_save_task_with_relationships.sql",
    ]
    assert sorted(path.name for path in migration_dir.glob("*.sql")) == expected_names

    phase3 = (migration_dir / expected_names[2]).read_text(encoding="utf-8").lower()
    phase4 = (migration_dir / expected_names[3]).read_text(encoding="utf-8").lower()
    assert "create table if not exists public.activity_events" in phase3
    assert "drop trigger if exists record_task_activity" in phase3
    assert 'drop policy if exists "activity_events_select_member"' in phase3
    assert "create table if not exists public.workspace_owner_guards" in phase4
    assert "on conflict (workspace_id) do nothing" in phase4
    assert "drop trigger if exists protect_workspace_membership_insert" in phase4
    assert "foreign key (owner_id) references auth.users(id)\n    on delete no action\n    deferrable initially deferred" in phase4
    assert "foreign key (user_id) references auth.users(id)\n    on delete no action\n    deferrable initially deferred" in phase4


def test_workspace_creation_inserts_trusted_initial_owner() -> None:
    phase1 = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180001_phase1_auth_database.sql"
    phase4 = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180004_phase4_security_hardening.sql"
    phase1_sql = phase1.read_text(encoding="utf-8")
    phase4_sql = phase4.read_text(encoding="utf-8")

    assert "after insert on public.workspaces" in phase1_sql
    assert "values (new.id, new.owner_id, 'OWNER')" in phase1_sql
    assert "new.role = 'OWNER'" in phase4_sql
    assert "new.user_id = auth.uid()" in phase4_sql
    assert "w.owner_id = auth.uid()" in phase4_sql
    assert "insert into public.workspace_owner_guards (workspace_id)" in phase4_sql
    assert "users cannot add themselves to a workspace" in phase4_sql


def test_final_owner_guards_reject_spoofable_flags_and_serialize_mutations() -> None:
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180004_phase4_security_hardening.sql"
    sql = migration.read_text(encoding="utf-8").lower()

    assert "current_setting" not in sql
    assert "set_config" not in sql
    assert "flowboard.deleting_workspace" not in sql
    assert sql.count("pg_trigger_depth() > 1") == 2
    assert "create table if not exists public.workspace_owner_guards" in sql
    assert sql.count("set lock_version = lock_version + 1") >= 3
    assert "grant execute on function public.protect_last_workspace_owner()" not in sql
    assert "grant execute on function public.protect_workspace_membership()" not in sql
    assert "revoke all on table public.workspace_owner_guards from public, anon, authenticated, service_role" in sql
    assert "protect_workspace_membership" in sql


def test_workspace_deletion_rechecks_owner_after_serializing() -> None:
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180004_phase4_security_hardening.sql"
    sql = migration.read_text(encoding="utf-8").lower()
    deletion_guard = sql.split("create or replace function public.protect_workspace_deletion_lock()", 1)[1].split("$$;", 1)[0]

    guard_update = deletion_guard.index("update public.workspace_owner_guards")
    owner_recheck = deletion_guard.index("wm.role = 'owner'")
    assert guard_update < owner_recheck
    assert "auth.uid() is not null" in deletion_guard
    assert "wm.workspace_id = old.id" in deletion_guard
    assert "wm.user_id = auth.uid()" in deletion_guard
    assert "only a workspace owner can delete the workspace" in deletion_guard


def test_account_deletion_cannot_bypass_last_owner_protection() -> None:
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180004_phase4_security_hardening.sql"
    phase1 = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180001_phase1_auth_database.sql"
    sql = migration.read_text(encoding="utf-8").lower()
    phase1_sql = phase1.read_text(encoding="utf-8").lower()

    assert "workspace_members_user_id_fkey" in sql
    assert "foreign key (user_id) references auth.users(id)" in sql
    assert "on delete no action" in sql
    assert "deferrable initially deferred" in sql
    assert "pg_trigger_depth() > 1" in sql
    assert "owner_id uuid not null references auth.users(id) on delete cascade" in phase1_sql
    assert "workspaces_owner_id_fkey" in sql


def test_workspace_delete_policy_is_owner_only_and_role_permissions_are_consistent() -> None:
    phase1 = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180001_phase1_auth_database.sql"
    phase4 = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180004_phase4_security_hardening.sql"
    phase1_sql = phase1.read_text(encoding="utf-8")
    phase4_sql = phase4.read_text(encoding="utf-8")

    assert "create type public.workspace_role as enum ('OWNER', 'ADMIN', 'MEMBER', 'VIEWER')" in phase1_sql
    assert "wm.role in ('OWNER', 'ADMIN')" in phase1_sql
    assert "wm.role in ('OWNER', 'ADMIN', 'MEMBER')" in phase4_sql
    assert 'on public.workspaces for update to authenticated\nusing (public.is_workspace_owner(id))' in phase4_sql
    assert 'on public.workspaces for delete to authenticated\nusing (public.is_workspace_owner(id))' in phase4_sql
    assert 'on public.boards for delete to authenticated\nusing (public.is_workspace_manager(workspace_id))' in phase1_sql
    assert 'and public.is_workspace_owner(b.workspace_id)' in phase1_sql


def test_owner_mutations_use_the_same_private_transaction_lock() -> None:
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180004_phase4_security_hardening.sql"
    sql = migration.read_text(encoding="utf-8").lower()
    owner_guard = sql.split("create or replace function public.protect_last_workspace_owner()", 1)[1].split("$$;", 1)[0]
    membership_guard = sql.split("create or replace function public.protect_workspace_membership()", 1)[1].split("$$;", 1)[0]
    workspace_delete_guard = sql.split("create or replace function public.protect_workspace_deletion_lock()", 1)[1].split("$$;", 1)[0]

    assert "update public.workspace_owner_guards" in owner_guard
    assert "where workspace_id = target_workspace_id" in owner_guard
    assert "update public.workspace_owner_guards" in membership_guard
    assert "where workspace_id = target_workspace_id" in membership_guard
    assert "update public.workspace_owner_guards" in workspace_delete_guard
    assert "where workspace_id = old.id" in workspace_delete_guard


def test_phase3_fk_replacement_is_column_based_and_idempotent() -> None:
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180003_phase3_activity_events.sql"
    sql = migration.read_text(encoding="utf-8").lower()

    assert "join lateral unnest(c.conkey)" in sql
    assert "a.attname in ('task_id', 'board_id')" in sql
    assert "drop constraint %i" in sql
    assert "foreign key (task_id) references public.tasks(id) on delete set null" in sql
    assert "foreign key (board_id) references public.boards(id) on delete set null" in sql


def test_activity_delete_events_are_cascade_safe_and_retainable() -> None:
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180003_phase3_activity_events.sql"
    sql = migration.read_text(encoding="utf-8").lower()

    task_activity = sql.split("create or replace function public.record_task_activity()", 1)[1].split("$$;", 1)[0]
    board_activity = sql.split("create or replace function public.record_board_activity()", 1)[1].split("$$;", 1)[0]
    assert "if pg_trigger_depth() > 1 then" in task_activity
    assert "target_task := null" in task_activity
    assert "event_name := 'task_deleted'" in task_activity
    assert "pg_trigger_depth() > 1" in board_activity
    assert "where w.id = old.workspace_id" in board_activity
    assert "workspace_id uuid not null references public.workspaces(id) on delete cascade" in sql
    assert "board_id uuid references public.boards(id) on delete set null" in sql


def test_phase3_activity_foreign_keys_preserve_history() -> None:
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180003_phase3_activity_events.sql"
    sql = migration.read_text(encoding="utf-8")
    assert "task_id uuid references public.tasks(id) on delete set null" in sql
    assert "board_id uuid references public.boards(id) on delete set null" in sql
    assert "workspace_id uuid not null references public.workspaces(id) on delete cascade" in sql
    assert "event_name := 'task_deleted'" in sql
    assert "after insert or update or delete on public.tasks" in sql


def test_role_permission_policies_match_documented_matrix() -> None:
    migration = Path(__file__).resolve().parents[2] / "supabase" / "migrations" / "202611180001_phase1_auth_database.sql"
    sql = migration.read_text(encoding="utf-8")
    assert "using (public.is_workspace_owner(id))" in sql
    assert "and public.is_workspace_editor(b.workspace_id)" in sql
    assert "and public.is_workspace_owner(b.workspace_id)" in sql
    assert "wm.role in ('OWNER', 'ADMIN', 'MEMBER')" in sql
