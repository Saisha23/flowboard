"""Flowboard AI API — auth-aware FastAPI application."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any

from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from app.api.deps import (
    AuthenticatedUser,
    get_current_user,
    get_supabase_for_user,
    init_jwks_client,
)
from app.core.config import get_settings_optional
from app.services.supabase import SupabaseUserClient
from app.services.ai import SummaryResult, get_ai_provider


class HealthResponse(BaseModel):
    status: str
    service: str


class MeResponse(BaseModel):
    """Authenticated identity from the verified JWT plus `profiles` (RLS-scoped)."""

    id: str
    email: str | None = None
    phone: str | None = None
    role: str | None = Field(default=None, description="JWT role, typically 'authenticated'")
    aud: str | None = None
    profile: dict[str, Any] | None = None


class WorkspaceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    plan: str = Field(default="FREE", max_length=50)
    color: str | None = Field(default=None, max_length=32)


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    plan: str | None = Field(default=None, max_length=50)
    color: str | None = Field(default=None, max_length=32)


class WorkspaceResponse(BaseModel):
    id: UUID
    owner_id: UUID
    name: str
    plan: str
    color: str | None = None
    created_at: datetime
    updated_at: datetime


class BoardCreate(BaseModel):
    workspace_id: UUID
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)
    color: str | None = Field(default=None, max_length=32)


class BoardUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)
    color: str | None = Field(default=None, max_length=32)


class BoardResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    description: str
    color: str | None = None
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class TaskCreate(BaseModel):
    board_id: UUID
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(default="", max_length=10000)
    list_id: str | None = Field(default=None, max_length=100)
    status: str = Field(default="TODO", pattern=r"^(BACKLOG|TODO|IN_PROGRESS|IN_REVIEW|DONE)$")
    priority: str = Field(default="MEDIUM", pattern=r"^(LOW|MEDIUM|HIGH|URGENT)$")
    position: int = Field(default=0, ge=0)
    due_date: datetime | None = None
    assignee_id: UUID | None = None
    label_ids: list[UUID] = Field(default_factory=list)
    blocked_by_ids: list[UUID] = Field(default_factory=list)
    estimate_hours: float | None = Field(default=None, ge=0)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=500)
    description: str | None = Field(default=None, max_length=10000)
    list_id: str | None = Field(default=None, max_length=100)
    status: str | None = Field(default=None, pattern=r"^(BACKLOG|TODO|IN_PROGRESS|IN_REVIEW|DONE)$")
    priority: str | None = Field(default=None, pattern=r"^(LOW|MEDIUM|HIGH|URGENT)$")
    position: int | None = Field(default=None, ge=0)
    due_date: datetime | None = None
    assignee_id: UUID | None = None
    label_ids: list[UUID] | None = None
    blocked_by_ids: list[UUID] | None = None
    estimate_hours: float | None = Field(default=None, ge=0)


class TaskResponse(BaseModel):
    id: UUID
    board_id: UUID
    list_id: str | None = None
    title: str
    description: str
    status: str
    priority: str
    position: int
    due_date: datetime | None = None
    assignee_id: UUID | None = None
    assignee_ids: list[UUID] = Field(default_factory=list)
    label_ids: list[UUID] = Field(default_factory=list)
    blocked_by_ids: list[UUID] = Field(default_factory=list)
    deadline_changes: int
    stagnation_days: int
    estimate_hours: float | None = None
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class WorkspaceMemberResponse(BaseModel):
    workspace_id: UUID
    user_id: UUID
    role: str
    joined_at: datetime
    email: str | None = None
    name: str | None = None
    initials: str | None = None
    avatar_color: str | None = None
    title: str | None = None


class WorkspaceMemberAdd(BaseModel):
    user_id: UUID
    role: str = Field(default="MEMBER", pattern=r"^(OWNER|ADMIN|MEMBER|VIEWER)$")


class WorkspaceMemberUpdate(BaseModel):
    role: str = Field(pattern=r"^(OWNER|ADMIN|MEMBER|VIEWER)$")


class RiskEvidenceResponse(BaseModel):
    task_id: UUID
    task_title: str
    assignee_name: str
    metric: str
    detail: str


class RiskFactorResponse(BaseModel):
    id: str
    category: str
    label: str
    severity: str
    score: int
    evidence_count: int
    description: str
    evidence: list[RiskEvidenceResponse]
    recommendation: str
    ai_generated: bool


class DriftTrendResponse(BaseModel):
    date: str
    score: int


class DriftSnapshotResponse(BaseModel):
    id: str
    board_id: UUID
    generated_at: datetime
    drift_score: int
    health: str
    trend: list[DriftTrendResponse]
    factors: list[RiskFactorResponse]
    workload: list[dict[str, Any]]
    recovery_actions: list[dict[str, Any]]
    activity: list[dict[str, Any]]
    methodology: str
    historical_trend_available: bool


class SummaryRecommendationResponse(BaseModel):
    id: str
    title: str
    reasoning: str
    urgency: str


class ProjectSummaryResponse(BaseModel):
    id: str
    board_id: UUID | None
    generated_at: datetime
    executive_summary: str
    project_overview: str
    completed_work: list[str]
    pending_work: list[str]
    blockers: list[str]
    priority_recommendations: list[SummaryRecommendationResponse]
    confidence: float
    ai_generated: bool


class ActivityResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    board_id: UUID | None = None
    task_id: UUID | None = None
    actor_id: UUID | None = None
    event_type: str
    entity_type: str
    detail: str
    created_at: datetime


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings_optional()
    if settings is not None:
        init_jwks_client(settings)
    yield


app = FastAPI(
    title="Flowboard AI API",
    version="0.1.0",
    lifespan=lifespan,
)

# Origins come from CORS_ORIGINS when configured; otherwise the local Vite defaults.
_optional_settings = get_settings_optional()
_cors_origins = (
    _optional_settings.cors_origin_list
    if _optional_settings is not None
    else ["http://localhost:5173", "http://127.0.0.1:5173"]
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept"],
)


@app.get("/health", response_model=HealthResponse, tags=["system"])
def health() -> HealthResponse:
    """Liveness probe. Does not require a token or a database round-trip."""
    return HealthResponse(status="ok", service="flowboard-api")


@app.get("/me", response_model=MeResponse, tags=["auth"])
async def me(
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> MeResponse:
    """Return the verified Auth user and their `profiles` row (subject to RLS)."""
    try:
        profile = await supabase.get_profile(user.id)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to load profile from Supabase.",
        ) from exc

    aud = user.claims.get("aud")
    aud_value = aud if isinstance(aud, str) else None
    return MeResponse(
        id=user.id,
        email=user.email,
        phone=user.phone,
        role=user.role,
        aud=aud_value,
        profile=profile,
    )


def _uuid(value: UUID) -> str:
    return str(value)


def _db_value(value: Any) -> Any:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, list):
        return [_db_value(item) for item in value]
    return value


def _workspace(row: dict[str, Any]) -> WorkspaceResponse:
    return WorkspaceResponse.model_validate(row)


def _board(row: dict[str, Any]) -> BoardResponse:
    return BoardResponse.model_validate(row)


def _task(row: dict[str, Any]) -> TaskResponse:
    assignee_id = row.get("assignee_id")
    result = dict(row)
    result["assignee_ids"] = [assignee_id] if assignee_id else []
    return TaskResponse.model_validate(result)


async def _get_workspace(supabase: SupabaseUserClient, workspace_id: UUID) -> dict[str, Any]:
    rows = await supabase.select("workspaces", params={"id": f"eq.{workspace_id}"})
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace not found or not accessible.")
    return rows[0]


async def _get_board(supabase: SupabaseUserClient, board_id: UUID) -> dict[str, Any]:
    rows = await supabase.select("boards", params={"id": f"eq.{board_id}"})
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Board not found or not accessible.")
    return rows[0]


async def _require_workspace_owner(
    supabase: SupabaseUserClient,
    user: AuthenticatedUser,
    workspace_id: UUID,
) -> dict[str, Any]:
    workspace = await _get_workspace(supabase, workspace_id)
    members = await supabase.select(
        "workspace_members",
        params={"workspace_id": f"eq.{workspace_id}", "user_id": f"eq.{user.id}"},
    )
    if not members or members[0].get("role") != "OWNER":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workspace owner permission required.")
    return workspace


async def _require_workspace_manager(
    supabase: SupabaseUserClient,
    user: AuthenticatedUser,
    workspace_id: UUID,
) -> dict[str, Any]:
    workspace = await _get_workspace(supabase, workspace_id)
    members = await supabase.select(
        "workspace_members",
        params={"workspace_id": f"eq.{workspace_id}", "user_id": f"eq.{user.id}"},
    )
    if not members or members[0].get("role") not in {"OWNER", "ADMIN"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workspace manager permission required.")
    return workspace


async def _require_workspace_editor(
    supabase: SupabaseUserClient,
    user: AuthenticatedUser,
    workspace_id: UUID,
) -> dict[str, Any]:
    workspace = await _get_workspace(supabase, workspace_id)
    members = await supabase.select(
        "workspace_members",
        params={"workspace_id": f"eq.{workspace_id}", "user_id": f"eq.{user.id}"},
    )
    if not members or members[0].get("role") not in {"OWNER", "ADMIN", "MEMBER"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workspace edit permission required.")
    return workspace


@app.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED, tags=["workspaces"])
async def create_workspace(
    payload: WorkspaceCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> WorkspaceResponse:
    row = await supabase.insert(
        "workspaces",
        {
            "owner_id": user.id,
            "name": payload.name.strip(),
            "plan": payload.plan.strip(),
            "color": payload.color,
        },
    )
    return _workspace(row)


@app.get("/workspaces", response_model=list[WorkspaceResponse], tags=["workspaces"])
async def list_workspaces(
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> list[WorkspaceResponse]:
    rows = await supabase.select("workspaces", order="created_at.asc")
    return [_workspace(row) for row in rows]


@app.get("/workspaces/{workspace_id}", response_model=WorkspaceResponse, tags=["workspaces"])
async def get_workspace(
    workspace_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> WorkspaceResponse:
    return _workspace(await _get_workspace(supabase, workspace_id))


@app.patch("/workspaces/{workspace_id}", response_model=WorkspaceResponse, tags=["workspaces"])
async def update_workspace(
    workspace_id: UUID,
    payload: WorkspaceUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> WorkspaceResponse:
    await _require_workspace_owner(supabase, user, workspace_id)
    changes = {
        key: _db_value(value)
        for key, value in payload.model_dump(exclude_unset=True).items()
        if value is not None
    }
    if "name" in changes:
        changes["name"] = str(changes["name"]).strip()
    if not changes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No workspace fields supplied.")
    row = await supabase.update("workspaces", match={"id": str(workspace_id)}, changes=changes)
    return _workspace(row)


@app.delete("/workspaces/{workspace_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["workspaces"])
async def delete_workspace(
    workspace_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> None:
    await _require_workspace_owner(supabase, user, workspace_id)
    await supabase.delete("workspaces", match={"id": str(workspace_id)})


@app.get("/workspaces/{workspace_id}/members", response_model=list[WorkspaceMemberResponse], tags=["members"])
async def list_workspace_members(
    workspace_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> list[WorkspaceMemberResponse]:
    await _get_workspace(supabase, workspace_id)
    rows = await supabase.select(
        "workspace_members",
        params={"workspace_id": f"eq.{workspace_id}"},
        order="joined_at.asc",
    )
    members: list[WorkspaceMemberResponse] = []
    for row in rows:
        member_id = str(row["user_id"])
        profiles = await supabase.select("profiles", params={"id": f"eq.{member_id}"})
        profile = profiles[0] if profiles else {}
        members.append(
            WorkspaceMemberResponse.model_validate({
                **row,
                "email": profile.get("email"),
                "name": profile.get("name"),
                "initials": profile.get("initials"),
                "avatar_color": profile.get("avatar_color"),
                "title": profile.get("title"),
            })
        )
    return members


@app.post("/workspaces/{workspace_id}/members", response_model=WorkspaceMemberResponse, status_code=status.HTTP_201_CREATED, tags=["members"])
async def add_workspace_member(
    workspace_id: UUID,
    payload: WorkspaceMemberAdd,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> WorkspaceMemberResponse:
    await _require_workspace_owner(supabase, user, workspace_id)
    row = await supabase.insert(
        "workspace_members",
        {
            "workspace_id": str(workspace_id),
            "user_id": str(payload.user_id),
            "role": payload.role,
        },
    )
    return WorkspaceMemberResponse.model_validate(row)


@app.patch("/workspaces/{workspace_id}/members/{member_id}", response_model=WorkspaceMemberResponse, tags=["members"])
async def update_workspace_member(
    workspace_id: UUID,
    member_id: UUID,
    payload: WorkspaceMemberUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> WorkspaceMemberResponse:
    await _require_workspace_owner(supabase, user, workspace_id)
    if str(member_id) == user.id:
        if payload.role != "OWNER":
            raise HTTPException(status.HTTP_409_CONFLICT, "Cannot demote or remove the workspace owner.")
    row = await supabase.update(
        "workspace_members",
        match={"workspace_id": str(workspace_id), "user_id": str(member_id)},
        changes={"role": payload.role},
    )
    return WorkspaceMemberResponse.model_validate(row)


@app.delete("/workspaces/{workspace_id}/members/{member_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["members"])
async def remove_workspace_member(
    workspace_id: UUID,
    member_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> None:
    if str(member_id) == user.id:
        raise HTTPException(status.HTTP_409_CONFLICT, "Cannot remove the workspace owner.")
    await _require_workspace_owner(supabase, user, workspace_id)
    await supabase.delete(
        "workspace_members",
        match={"workspace_id": str(workspace_id), "user_id": str(member_id)},
    )


@app.post("/boards", response_model=BoardResponse, status_code=status.HTTP_201_CREATED, tags=["boards"])
async def create_board(
    payload: BoardCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> BoardResponse:
    await _require_workspace_manager(supabase, user, payload.workspace_id)
    row = await supabase.insert(
        "boards",
        {
            "workspace_id": str(payload.workspace_id),
            "name": payload.name.strip(),
            "description": payload.description.strip(),
            "color": payload.color,
            "created_by": user.id,
        },
    )
    return _board(row)


@app.get("/workspaces/{workspace_id}/boards", response_model=list[BoardResponse], tags=["boards"])
async def list_boards(
    workspace_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> list[BoardResponse]:
    await _get_workspace(supabase, workspace_id)
    rows = await supabase.select(
        "boards",
        params={"workspace_id": f"eq.{workspace_id}"},
        order="created_at.asc",
    )
    return [_board(row) for row in rows]


@app.get("/boards/{board_id}", response_model=BoardResponse, tags=["boards"])
async def get_board(
    board_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> BoardResponse:
    return _board(await _get_board(supabase, board_id))


@app.patch("/boards/{board_id}", response_model=BoardResponse, tags=["boards"])
async def update_board(
    board_id: UUID,
    payload: BoardUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> BoardResponse:
    board = await _get_board(supabase, board_id)
    await _require_workspace_owner(supabase, user, UUID(str(board["workspace_id"])))
    changes = {
        key: _db_value(value)
        for key, value in payload.model_dump(exclude_unset=True).items()
        if value is not None
    }
    if "name" in changes:
        changes["name"] = str(changes["name"]).strip()
    if not changes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No board fields supplied.")
    row = await supabase.update("boards", match={"id": str(board_id)}, changes=changes)
    return _board(row)


@app.delete("/boards/{board_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["boards"])
async def delete_board(
    board_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> None:
    board = await _get_board(supabase, board_id)
    await _require_workspace_owner(supabase, user, UUID(str(board["workspace_id"])))
    await supabase.delete("boards", match={"id": str(board_id)})


@app.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED, tags=["tasks"])
async def create_task(
    payload: TaskCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> TaskResponse:
    board = await _get_board(supabase, payload.board_id)
    await _require_workspace_editor(supabase, user, UUID(str(board["workspace_id"])))
    row = await supabase.insert(
        "tasks",
        {
            "board_id": str(payload.board_id),
            "title": payload.title.strip(),
            "description": payload.description.strip(),
            "list_id": payload.list_id,
            "status": payload.status,
            "priority": payload.priority,
            "position": payload.position,
            "due_date": payload.due_date.isoformat() if payload.due_date else None,
            "assignee_id": str(payload.assignee_id) if payload.assignee_id else None,
            "label_ids": [str(value) for value in payload.label_ids],
            "blocked_by_ids": [str(value) for value in payload.blocked_by_ids],
            "estimate_hours": payload.estimate_hours,
        },
    )
    return _task(row)


@app.get("/boards/{board_id}/tasks", response_model=list[TaskResponse], tags=["tasks"])
async def list_tasks(
    board_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> list[TaskResponse]:
    await _get_board(supabase, board_id)
    rows = await supabase.select(
        "tasks",
        params={"board_id": f"eq.{board_id}"},
        order="position.asc",
    )
    return [_task(row) for row in rows]


@app.get("/tasks/{task_id}", response_model=TaskResponse, tags=["tasks"])
async def get_task(
    task_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> TaskResponse:
    rows = await supabase.select("tasks", params={"id": f"eq.{task_id}"})
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found or not accessible.")
    return _task(rows[0])


@app.patch("/tasks/{task_id}", response_model=TaskResponse, tags=["tasks"])
async def update_task(
    task_id: UUID,
    payload: TaskUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> TaskResponse:
    rows = await supabase.select("tasks", params={"id": f"eq.{task_id}"})
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found or not accessible.")
    board = await _get_board(supabase, UUID(str(rows[0]["board_id"])))
    await _require_workspace_editor(supabase, user, UUID(str(board["workspace_id"])))
    changes = {}
    for key, value in payload.model_dump(exclude_unset=True).items():
        if value is None:
            if key in {"due_date", "assignee_id"}:
                changes[key] = None
            continue
        if key in {"label_ids", "blocked_by_ids"}:
            changes[key] = [str(item) for item in value]
        elif key == "assignee_id":
            changes[key] = str(value)
        elif key == "due_date":
            changes[key] = value.isoformat()
        else:
            changes[key] = value
    if "title" in changes:
        changes["title"] = str(changes["title"]).strip()
    if not changes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No task fields supplied.")
    row = await supabase.update("tasks", match={"id": str(task_id)}, changes=changes)
    return _task(row)


@app.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["tasks"])
async def delete_task(
    task_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> None:
    rows = await supabase.select("tasks", params={"id": f"eq.{task_id}"})
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found or not accessible.")
    board = await _get_board(supabase, UUID(str(rows[0]["board_id"])))
    await _require_workspace_owner(supabase, user, UUID(str(board["workspace_id"])))
    await supabase.delete("tasks", match={"id": str(task_id)})


def _is_completed(task: dict[str, Any]) -> bool:
    return task.get("status") == "DONE" or task.get("list_id") == "list-5"


def _risk_health(score: int) -> str:
    if score >= 75:
        return "CRITICAL"
    if score >= 50:
        return "AT_RISK"
    if score >= 25:
        return "WATCH"
    return "HEALTHY"


def _normalize_drift_score(points: int) -> int:
    return min(100, max(0, points))


def _parse_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


async def _board_tasks(supabase: SupabaseUserClient, board_id: UUID) -> list[dict[str, Any]]:
    await _get_board(supabase, board_id)
    return await supabase.select("tasks", params={"board_id": f"eq.{board_id}"}, order="position.asc")


async def _drift_metrics(
    supabase: SupabaseUserClient,
    board_id: UUID,
    now: datetime,
) -> dict[str, Any]:
    board = await _get_board(supabase, board_id)
    tasks = await _board_tasks(supabase, board_id)
    incomplete = [task for task in tasks if not _is_completed(task)]

    overdue: list[dict[str, Any]] = []
    approaching: list[dict[str, Any]] = []
    high_priority: list[dict[str, Any]] = []
    stalled: list[dict[str, Any]] = []
    blocked: list[dict[str, Any]] = []

    for task in incomplete:
        due_at = _parse_datetime(task.get("due_date"))
        if due_at:
            if due_at < now:
                overdue.append(task)
            elif due_at <= now + timedelta(days=7):
                approaching.append(task)
        if task.get("priority") in {"HIGH", "URGENT"}:
            high_priority.append(task)
        updated_at = _parse_datetime(task.get("updated_at"))
        if updated_at:
            if updated_at < now - timedelta(days=7):
                stalled.append(task)
        if task.get("blocked_by_ids"):
            blocked.append(task)

    workload: dict[str, int] = {}
    for task in incomplete:
        assignee = task.get("assignee_id")
        if assignee:
            workload[str(assignee)] = workload.get(str(assignee), 0) + 1

    score = 0
    factors: list[dict[str, Any]] = []

    factor_specs = [
        ("overdue", "Overdue tasks", overdue, 30, "overdue"),
        ("approaching_deadline", "Approaching deadlines", approaching, 15, "approaching deadline"),
        ("priority", "High-priority work", high_priority, 20, "high or urgent priority"),
        ("stagnation", "Stalled tasks", stalled, 20, "unchanged for 7+ days"),
        ("dependency_bottleneck", "Dependency bottlenecks", blocked, 15, "blocked by another task"),
    ]
    for category, label, evidence_tasks, points, metric in factor_specs:
        if not evidence_tasks:
            continue
        score += min(points, points)
        evidence = []
        for task in evidence_tasks[:10]:
            evidence.append({
                "task_id": UUID(str(task["id"])),
                "task_title": str(task["title"]),
                "assignee_name": str(task.get("assignee_id") or "Unassigned"),
                "metric": metric,
                "detail": f"{task['title']} matches the {metric} signal.",
            })
        factors.append({
            "id": f"{board_id}-{category}",
            "category": category,
            "label": label,
            "severity": _risk_health(min(100, points * 2)),
            "score": points,
            "evidence_count": len(evidence_tasks),
            "description": f"{len(evidence_tasks)} incomplete task(s) match this measured signal.",
            "evidence": evidence,
            "recommendation": f"Review the {len(evidence_tasks)} task(s) contributing to {label.lower()}.",
            "ai_generated": False,
        })

    concentrated_assignees = []
    if incomplete:
        for assignee_id, count in workload.items():
            if count / len(incomplete) >= 0.5:
                concentrated_assignees.append((assignee_id, count))
    if concentrated_assignees:
        score += 15
        evidence = [{
            "task_id": UUID(str(task["id"])) ,
            "task_title": str(task["title"]),
            "assignee_name": assignee_id,
            "metric": "workload concentration",
            "detail": f"{count} of {len(incomplete)} incomplete tasks are assigned to this assignee.",
        } for assignee_id, count in concentrated_assignees for task in incomplete if task.get("assignee_id") == assignee_id][:10]
        factors.append({
            "id": f"{board_id}-workload",
            "category": "workload",
            "label": "Workload concentration",
            "severity": "WATCH",
            "score": 15,
            "evidence_count": len(concentrated_assignees),
            "description": "One assignee holds at least 50% of incomplete tasks.",
            "evidence": evidence,
            "recommendation": "Review workload distribution and rebalance assignments where appropriate.",
            "ai_generated": False,
        })

    score = _normalize_drift_score(score)
    workload_rows = []
    for assignee_id, count in workload.items():
        workload_rows.append({
            "user_id": assignee_id,
            "open_tasks": count,
            "overdue_tasks": sum(1 for task in overdue if str(task.get("assignee_id")) == assignee_id),
            "capacity": max(count, 1),
        })

    return {
        "board": board,
        "tasks": tasks,
        "incomplete": incomplete,
        "overdue": overdue,
        "approaching": approaching,
        "high_priority": high_priority,
        "blocked": blocked,
        "stalled": stalled,
        "workload": workload_rows,
        "score": score,
        "health": _risk_health(score),
        "factors": factors,
    }


@app.get("/boards/{board_id}/drift", response_model=DriftSnapshotResponse, tags=["analytics"])
async def get_board_drift(
    board_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> DriftSnapshotResponse:
    metrics = await _drift_metrics(supabase, board_id, datetime.now(timezone.utc))
    generated = datetime.now(timezone.utc)
    return DriftSnapshotResponse(
        id=f"drift-{board_id}",
        board_id=board_id,
        generated_at=generated,
        drift_score=metrics["score"],
        health=metrics["health"],
        trend=[DriftTrendResponse(date=generated.strftime("%Y-%m-%d"), score=metrics["score"])],
        factors=[RiskFactorResponse.model_validate(factor) for factor in metrics["factors"]],
        workload=metrics["workload"],
        recovery_actions=[
            {
                "id": f"{board_id}-overdue",
                "title": "Resolve overdue work",
                "rationale": f"{len(metrics['overdue'])} incomplete task(s) are past their due date.",
                "effort": "MEDIUM",
                "impact": "HIGH",
                "ai_generated": False,
                "related_task_ids": [str(task["id"]) for task in metrics["overdue"][:10]],
            }
        ] if metrics["overdue"] else [],
        activity=[],
        methodology=(
            "Deterministic score: overdue tasks 30 points, deadlines within 7 days 15, "
            "high/urgent tasks 20, tasks unchanged 7+ days 20, blocked tasks 15, and "
            "one assignee holding at least 50% of incomplete work 15. Score is capped at 100."
        ),
        historical_trend_available=False,
    )


@app.post("/boards/{board_id}/summary", response_model=ProjectSummaryResponse, tags=["analytics"])
async def generate_board_summary(
    board_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> ProjectSummaryResponse:
    board = await _get_board(supabase, board_id)
    tasks = await _board_tasks(supabase, board_id)
    settings = require_settings()
    now = datetime.now(timezone.utc)

    completed = [task for task in tasks if _is_completed(task)]
    incomplete = [task for task in tasks if not _is_completed(task)]
    overdue = []
    upcoming = []
    blocked = []
    for task in incomplete:
        if task.get("blocked_by_ids"):
            blocked.append(task)
        due_at = _parse_datetime(task.get("due_date"))
        if due_at:
            if due_at < now:
                overdue.append(task)
            elif due_at <= now + timedelta(days=14):
                upcoming.append(task)

    metrics = {
        "scope": "board",
        "board": {"id": str(board_id)},
        "task_totals": {
            "total": len(tasks),
            "completed": len(completed),
            "pending": len(incomplete),
            "overdue": len(overdue),
            "upcoming_14_days": len(upcoming),
            "high_or_urgent": sum(1 for task in incomplete if task.get("priority") in {"HIGH", "URGENT"}),
            "blocked": len(blocked),
        },
        "completed_task_ids": [str(task["id"]) for task in completed],
        "pending_task_ids": [str(task["id"]) for task in incomplete],
        "tasks": [
            {
                "id": str(task["id"]),
                "title": str(task["title"])[:500],
                "status": task.get("status") or ("DONE" if _is_completed(task) else "PENDING"),
                "priority": task.get("priority") or "MEDIUM",
                "due_date": task.get("due_date"),
                "completed": _is_completed(task),
                "blocked": bool(task.get("blocked_by_ids")),
            }
            for task in tasks[:200]
        ],
    }

    provider = get_ai_provider(settings)
    try:
        result: SummaryResult = await provider.summarize(metrics)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc

    recommendations = [
        SummaryRecommendationResponse(
            id=f"{board_id}-recommendation-{index}",
            title=item.title,
            reasoning=item.reasoning,
            urgency=item.urgency,
        )
        for index, item in enumerate(result.priority_recommendations)
    ]
    return ProjectSummaryResponse(
        id=f"summary-{board_id}-{datetime.now(timezone.utc).isoformat()}",
        board_id=board_id,
        generated_at=datetime.now(timezone.utc),
        executive_summary=result.executive_summary,
        project_overview=result.project_overview,
        completed_work=result.completed_work,
        pending_work=result.pending_work,
        blockers=result.blockers,
        priority_recommendations=recommendations,
        confidence=result.confidence,
        ai_generated=True,
    )


@app.post("/workspaces/{workspace_id}/summary", response_model=ProjectSummaryResponse, tags=["analytics"])
async def generate_workspace_summary(
    workspace_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> ProjectSummaryResponse:
    await _get_workspace(supabase, workspace_id)
    boards = await supabase.select("boards", params={"workspace_id": f"eq.{workspace_id}"})
    all_tasks: list[dict[str, Any]] = []
    for board in boards:
        all_tasks.extend(await _board_tasks(supabase, UUID(str(board["id"]))))
    settings = require_settings()
    now = datetime.now(timezone.utc)
    completed = [task for task in all_tasks if _is_completed(task)]
    incomplete = [task for task in all_tasks if not _is_completed(task)]
    board_summaries: list[dict[str, Any]] = []
    for board in boards:
        board_tasks = await _board_tasks(supabase, UUID(str(board["id"])))
        board_completed = [task for task in board_tasks if _is_completed(task)]
        board_summaries.append({
            "board_id": str(board["id"]),
            "total": len(board_tasks),
            "completed": len(board_completed),
            "pending": len(board_tasks) - len(board_completed),
            "tasks": [
                {
                    "id": str(task["id"]),
                    "title": str(task["title"])[:500],
                    "status": task.get("status") or ("DONE" if _is_completed(task) else "PENDING"),
                    "priority": task.get("priority") or "MEDIUM",
                    "due_date": task.get("due_date"),
                    "completed": _is_completed(task),
                    "blocked": bool(task.get("blocked_by_ids")),
                }
                for task in board_tasks[:100]
            ],
        })
    overdue = []
    blocked = []
    upcoming = []
    for task in incomplete:
        if task.get("blocked_by_ids"):
            blocked.append(task)
        due_at = _parse_datetime(task.get("due_date"))
        if due_at:
            if due_at < now:
                overdue.append(task)
            elif due_at <= now + timedelta(days=14):
                upcoming.append(task)
    metrics = {
        "scope": "workspace",
        "workspace_id": str(workspace_id),
        "board_count": len(boards),
        "boards": board_summaries,
        "task_totals": {
            "total": len(all_tasks),
            "completed": len(completed),
            "pending": len(incomplete),
            "overdue": len(overdue),
            "upcoming_14_days": len(upcoming),
            "high_or_urgent": sum(1 for task in incomplete if task.get("priority") in {"HIGH", "URGENT"}),
            "blocked": len(blocked),
        },
    }
    provider = get_ai_provider(settings)
    try:
        result: SummaryResult = await provider.summarize(metrics)
    except RuntimeError as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, str(exc)) from exc
    return ProjectSummaryResponse(
        id=f"summary-workspace-{workspace_id}-{datetime.now(timezone.utc).isoformat()}",
        board_id=None,
        generated_at=datetime.now(timezone.utc),
        executive_summary=result.executive_summary,
        project_overview=result.project_overview,
        completed_work=result.completed_work,
        pending_work=result.pending_work,
        blockers=result.blockers,
        priority_recommendations=[
            SummaryRecommendationResponse(
                id=f"{workspace_id}-recommendation-{index}",
                title=item.title,
                reasoning=item.reasoning,
                urgency=item.urgency,
            )
            for index, item in enumerate(result.priority_recommendations)
        ],
        confidence=result.confidence,
        ai_generated=True,
    )


@app.get("/boards/{board_id}/activity", response_model=list[ActivityResponse], tags=["activity"])
async def get_board_activity(
    board_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> list[ActivityResponse]:
    board = await _get_board(supabase, board_id)
    rows = await supabase.select(
        "activity_events",
        params={"workspace_id": f"eq.{board['workspace_id']}"},
        order="created_at.desc",
    )
    # PostgREST cannot use a nullable OR filter through this simple helper; filter board scope safely in memory.
    filtered = [row for row in rows if row.get("board_id") == str(board_id)]
    return [ActivityResponse.model_validate(row) for row in filtered[:100]]


@app.get("/workspaces/{workspace_id}/activity", response_model=list[ActivityResponse], tags=["activity"])
async def get_workspace_activity(
    workspace_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> list[ActivityResponse]:
    await _get_workspace(supabase, workspace_id)
    rows = await supabase.select(
        "activity_events",
        params={"workspace_id": f"eq.{workspace_id}"},
        order="created_at.desc",
    )
    return [ActivityResponse.model_validate(row) for row in rows[:100]]
