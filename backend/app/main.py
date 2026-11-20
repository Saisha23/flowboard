"""Flowboard AI API — auth-aware FastAPI application."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
import logging
import re
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
    require_settings,
)
from app.core.config import get_settings_optional
from app.services.supabase import SupabaseUserClient
from app.services.ai import SummaryResult, get_ai_provider

logger = logging.getLogger(__name__)


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


class WorkspaceUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)


class WorkspaceResponse(BaseModel):
    id: UUID
    name: str
    slug: str
    created_by: UUID
    plan: str = "FREE"
    color: str = "#B8E4D0"
    created_at: datetime
    updated_at: datetime


class BoardCreate(BaseModel):
    workspace_id: UUID
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=5000)


class BoardListCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class BoardLabelCreate(BaseModel):
    name: str = Field(min_length=1)


class BoardUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=5000)


class BoardResponse(BaseModel):
    id: UUID
    workspace_id: UUID
    name: str
    description: str
    color: str = "mint"
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class TaskCreate(BaseModel):
    board_id: UUID
    title: str = Field(min_length=1, max_length=500)
    description: str = Field(default="", max_length=10000)
    list_id: UUID
    priority: str = Field(default="MEDIUM", pattern=r"^(LOW|MEDIUM|HIGH|URGENT)$")
    position: int = Field(default=0, ge=0)
    due_date: datetime | None = None
    completed_at: datetime | None = None
    assignee_ids: list[UUID] = Field(default_factory=list)
    label_ids: list[UUID] = Field(default_factory=list)
    blocked_by_ids: list[UUID] = Field(default_factory=list)
    estimate_hours: float | None = Field(default=None, ge=0)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    list_id: UUID | None = None
    priority: str | None = Field(default=None, pattern=r"^(LOW|MEDIUM|HIGH|URGENT)$")
    position: int | None = Field(default=None, ge=0)
    due_date: datetime | None = None
    completed_at: datetime | None = None
    assignee_ids: list[UUID] | None = None
    label_ids: list[UUID] | None = None
    blocked_by_ids: list[UUID] | None = None
    estimate_hours: float | None = Field(default=None, ge=0)


class TaskResponse(BaseModel):
    id: UUID
    board_id: UUID
    list_id: UUID | None = None
    title: str
    description: str
    status: str
    priority: str
    position: int
    due_date: datetime | None = None
    completed_at: datetime | None = None
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
    name: str | None = None
    initials: str | None = None
    avatar_url: str | None = None
    avatar_color: str = "#B8E4D0"


class WorkspaceMemberAdd(BaseModel):
    user_id: UUID
    role: str = Field(default="member", pattern=r"^(owner|member|viewer)$")


class WorkspaceMemberUpdate(BaseModel):
    role: str = Field(pattern=r"^(owner|member|viewer)$")


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
    confidence: float | None = None
    ai_generated: bool


class ActivityResponse(BaseModel):
    id: UUID
    workspace_id: UUID | None = None
    board_id: UUID | None = None
    task_id: UUID | None = None
    actor_id: UUID | None = None
    event_type: str
    detail: str
    metadata: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


_UUID_TEXT_PATTERN = re.compile(
    r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b",
    re.IGNORECASE,
)


def _board_display_name(board: dict[str, Any]) -> str:
    value = board.get("name")
    if not isinstance(value, str) or not value.strip():
        return "this board"
    return _UUID_TEXT_PATTERN.sub("this board", value.strip())


def _summary_text_without_ids(value: str, board_id: UUID, board_name: str) -> str:
    value = re.sub(re.escape(str(board_id)), board_name, value, flags=re.IGNORECASE)
    return _UUID_TEXT_PATTERN.sub("related item", value)


def _board_executive_summary(value: str, board_id: UUID, board_name: str) -> str:
    summary = _summary_text_without_ids(value, board_id, board_name).strip()
    if board_name.casefold() not in summary.casefold():
        summary = f"{board_name}: {summary}".strip()
    return summary


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
    if isinstance(value, dict):
        return {key: _db_value(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_db_value(item) for item in value]
    return value


def _workspace(row: dict[str, Any]) -> WorkspaceResponse:
    return WorkspaceResponse.model_validate({**row, "plan": "FREE", "color": "#B8E4D0"})


def _board(row: dict[str, Any]) -> BoardResponse:
    return BoardResponse.model_validate({**row, "color": "mint"})


def _api_role(value: Any) -> str:
    if not isinstance(value, str) or value.lower() not in {"owner", "member", "viewer"}:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Supabase returned an unsupported workspace role.")
    return value.lower()


def _db_role(value: str) -> str:
    return value.lower()


def _task(row: dict[str, Any], relations: dict[str, list[str]]) -> TaskResponse:
    completed_at = row.get("completed_at")
    kind = str(row.get("_list_kind") or "").lower()
    completed_by_kind = kind in {"done", "complete", "completed", "closed"}
    assignee_ids = relations["assignee_ids"]
    result = {
        **row,
        "completed_at": completed_at or (
            datetime.now(timezone.utc).isoformat() if completed_by_kind else None
        ),
        "status": "DONE" if (completed_at or completed_by_kind) else "TODO",
        "assignee_id": assignee_ids[0] if assignee_ids else None,
        "assignee_ids": assignee_ids,
        "label_ids": relations["label_ids"],
        "blocked_by_ids": relations["blocked_by_ids"],
        "deadline_changes": row.get("deadline_changes", 0),
        "stagnation_days": max(
            0,
            (datetime.now(timezone.utc) - (_parse_datetime(row.get("updated_at")) or datetime.now(timezone.utc))).days,
        ),
    }
    return TaskResponse.model_validate(result)


async def _tasks_with_relations(
    supabase: SupabaseUserClient,
    rows: list[dict[str, Any]],
) -> list[TaskResponse]:
    if not rows:
        return []

    task_ids = [str(row["id"]) for row in rows]
    task_filter = f"in.({','.join(task_ids)})"
    assignees = await supabase.select("task_assignees", params={"task_id": task_filter})
    labels = await supabase.select("task_labels", params={"task_id": task_filter})
    dependencies = await supabase.select(
        "task_dependencies",
        params={"blocked_task_id": task_filter},
    )
    list_ids = sorted({str(row["list_id"]) for row in rows if row.get("list_id")})
    list_kind_by_id: dict[str, str] = {}
    if list_ids:
        lists = await supabase.select(
            "board_lists",
            params={"id": f"in.({','.join(list_ids)})"},
        )
        list_kind_by_id = {
            str(board_list["id"]): str(board_list.get("kind") or "")
            for board_list in lists
        }

    by_id: dict[str, dict[str, list[str]]] = {
        task_id: {"assignee_ids": [], "label_ids": [], "blocked_by_ids": []}
        for task_id in task_ids
    }
    for relation in assignees:
        task_id = str(relation["task_id"])
        if task_id in by_id:
            by_id[task_id]["assignee_ids"].append(str(relation["user_id"]))
    for relation in labels:
        task_id = str(relation["task_id"])
        if task_id in by_id:
            by_id[task_id]["label_ids"].append(str(relation["label_id"]))
    for relation in dependencies:
        task_id = str(relation["blocked_task_id"])
        if task_id in by_id:
            by_id[task_id]["blocked_by_ids"].append(str(relation["blocking_task_id"]))

    return [
        _task(
            {**row, "_list_kind": list_kind_by_id.get(str(row.get("list_id")), "")},
            by_id[str(row["id"])],
        )
        for row in rows
    ]


def _rpc_row(value: Any) -> dict[str, Any]:
    if isinstance(value, list) and value and isinstance(value[0], dict):
        return value[0]
    if isinstance(value, dict):
        return value
    raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Unexpected Supabase RPC response.")


def _presentation_initials(name: str | None, user_id: str) -> str:
    if name:
        parts = name.split()
        return "".join(part[0] for part in parts[:2]).upper()
    return user_id[:2].upper()


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
    if not members or _api_role(members[0].get("role")) != "owner":
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
    if not members or _api_role(members[0].get("role")) != "owner":
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
    if not members or _api_role(members[0].get("role")) not in {"owner", "member"}:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Workspace edit permission required.")
    return workspace


@app.post("/workspaces", response_model=WorkspaceResponse, status_code=status.HTTP_201_CREATED, tags=["workspaces"])
async def create_workspace(
    payload: WorkspaceCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> WorkspaceResponse:
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        "Workspace creation is blocked until existing workspaces and workspace_members RLS INSERT policies are verified.",
    )


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
    profiles = await supabase.select(
        "profiles",
        params={
            "id": f"in.({','.join(str(row['user_id']) for row in rows)})",
            "select": "id,full_name,avatar_url",
        },
    ) if rows else []
    profiles_by_user_id = {str(profile["id"]): profile for profile in profiles}
    members: list[WorkspaceMemberResponse] = []
    for row in rows:
        profile = profiles_by_user_id.get(str(row["user_id"]), {})
        full_name = profile.get("full_name")
        members.append(
            WorkspaceMemberResponse.model_validate({
                **row,
                "role": _api_role(row.get("role")),
                "name": full_name if isinstance(full_name, str) else None,
                "initials": _presentation_initials(full_name if isinstance(full_name, str) else None, str(row["user_id"])),
                "avatar_url": profile.get("avatar_url"),
                "avatar_color": "#B8E4D0",
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
            "role": _db_role(payload.role),
        },
    )
    return WorkspaceMemberResponse.model_validate({**row, "role": _api_role(row.get("role"))})


@app.patch("/workspaces/{workspace_id}/members/{member_id}", response_model=WorkspaceMemberResponse, tags=["members"])
async def update_workspace_member(
    workspace_id: UUID,
    member_id: UUID,
    payload: WorkspaceMemberUpdate,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> WorkspaceMemberResponse:
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED,
        "Workspace member role updates are blocked until workspace_members UPDATE RLS and final-owner protection are verified.",
    )
    rows = await supabase.select(
        "workspace_members",
        params={"workspace_id": f"eq.{workspace_id}", "user_id": f"eq.{member_id}"},
    )
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Workspace member not found.")
    return WorkspaceMemberResponse.model_validate({**rows[0], "role": _api_role(rows[0].get("role"))})


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
    await _require_workspace_editor(supabase, user, payload.workspace_id)
    name = payload.name.strip()
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Board name is required.")
    row = await supabase.insert(
        "boards",
        {
            "workspace_id": str(payload.workspace_id),
            "name": name,
            "description": payload.description.strip(),
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


@app.get("/boards/{board_id}/lists", tags=["boards"])
async def list_board_lists(
    board_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> list[dict[str, Any]]:
    await _get_board(supabase, board_id)
    rows = await supabase.select(
        "board_lists",
        params={"board_id": f"eq.{board_id}"},
        order="position.asc",
    )
    palette = ["slatey", "sand", "amber", "apricot", "mint", "sage"]
    return [
        {**row, "color": palette[index % len(palette)]}
        for index, row in enumerate(rows)
    ]


@app.post("/boards/{board_id}/lists", status_code=status.HTTP_201_CREATED, tags=["boards"])
async def create_board_list(
    board_id: UUID,
    payload: BoardListCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> dict[str, Any]:
    board = await _get_board(supabase, board_id)
    await _require_workspace_editor(supabase, user, UUID(str(board["workspace_id"])))
    name = payload.name.strip()
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "List name is required.")
    existing_lists = await supabase.select(
        "board_lists",
        params={"board_id": f"eq.{board_id}"},
    )
    position = max((int(row.get("position", 0)) for row in existing_lists), default=-1) + 1
    row = await supabase.insert(
        "board_lists",
        {
            "board_id": str(board_id),
            "name": name,
            "kind": "active",
            "position": position,
        },
    )
    palette = ["slatey", "sand", "amber", "apricot", "mint", "sage"]
    return {**row, "color": palette[position % len(palette)]}


@app.get("/boards/{board_id}/labels", tags=["boards"])
async def list_board_labels(
    board_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> list[dict[str, Any]]:
    await _get_board(supabase, board_id)
    return await supabase.select(
        "labels",
        params={"board_id": f"eq.{board_id}"},
        order="name.asc",
    )


@app.post("/boards/{board_id}/labels", status_code=status.HTTP_201_CREATED, tags=["boards"])
async def create_board_label(
    board_id: UUID,
    payload: BoardLabelCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> dict[str, Any]:
    board = await _get_board(supabase, board_id)
    await _require_workspace_editor(supabase, user, UUID(str(board["workspace_id"])))
    name = payload.name.strip()
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Label name is required.")
    return await supabase.insert(
        "labels",
        {
            "board_id": str(board_id),
            "name": name,
        },
    )


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
    await _require_workspace_manager(supabase, user, UUID(str(board["workspace_id"])))
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
    await _require_workspace_manager(supabase, user, UUID(str(board["workspace_id"])))
    await supabase.delete("boards", match={"id": str(board_id)})


@app.post("/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED, tags=["tasks"])
async def create_task(
    payload: TaskCreate,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> TaskResponse:
    board = await _get_board(supabase, payload.board_id)
    await _require_workspace_editor(supabase, user, UUID(str(board["workspace_id"])))
    list_rows = await supabase.select(
        "board_lists",
        params={"id": f"eq.{payload.list_id}", "board_id": f"eq.{payload.board_id}"},
    )
    if not list_rows:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Task list must belong to the selected board.")

    task_values = payload.model_dump(
        mode="json",
        exclude={"assignee_ids", "label_ids", "blocked_by_ids"},
    )
    result = await supabase.rpc(
        "create_task_with_relationships",
        {
            "p_task": task_values,
            "p_assignee_ids": [str(value) for value in payload.assignee_ids],
            "p_label_ids": [str(value) for value in payload.label_ids],
            "p_blocked_by_ids": [str(value) for value in payload.blocked_by_ids],
        },
    )
    return (await _tasks_with_relations(supabase, [_rpc_row(result)]))[0]


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
    return await _tasks_with_relations(supabase, rows)


@app.get("/tasks/{task_id}", response_model=TaskResponse, tags=["tasks"])
async def get_task(
    task_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> TaskResponse:
    rows = await supabase.select("tasks", params={"id": f"eq.{task_id}"})
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Task not found or not accessible.")
    return (await _tasks_with_relations(supabase, rows))[0]


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
    current = rows[0]
    board_id = UUID(str(current["board_id"]))
    board = await _get_board(supabase, board_id)
    await _require_workspace_editor(supabase, user, UUID(str(board["workspace_id"])))
    fields = payload.model_fields_set
    changes: dict[str, Any] = {}
    for key, value in payload.model_dump(exclude_unset=True).items():
        if key in {"assignee_ids", "label_ids", "blocked_by_ids"}:
            continue
        if value is None and key not in {"due_date", "completed_at"}:
            if key == "list_id":
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "A task must belong to a board list.")
            continue
        changes[key] = _db_value(value)
    if "title" in changes:
        changes["title"] = str(changes["title"]).strip()
    if "list_id" in changes:
        list_rows = await supabase.select(
            "board_lists",
            params={"id": f"eq.{changes['list_id']}", "board_id": f"eq.{board_id}"},
        )
        if not list_rows:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Task list must belong to the task's board.")
    if not changes and not fields.intersection({"assignee_ids", "label_ids", "blocked_by_ids"}):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "No task fields supplied.")

    existing = (await _tasks_with_relations(supabase, [current]))[0]
    relation_values = {
        "p_assignee_ids": [str(value) for value in (payload.assignee_ids if payload.assignee_ids is not None else existing.assignee_ids)],
        "p_label_ids": [str(value) for value in (payload.label_ids if payload.label_ids is not None else existing.label_ids)],
        "p_blocked_by_ids": [str(value) for value in (payload.blocked_by_ids if payload.blocked_by_ids is not None else existing.blocked_by_ids)],
        "p_replace_assignees": "assignee_ids" in fields and payload.assignee_ids is not None,
        "p_replace_labels": "label_ids" in fields and payload.label_ids is not None,
        "p_replace_dependencies": "blocked_by_ids" in fields and payload.blocked_by_ids is not None,
    }
    result = await supabase.rpc(
        "save_task_with_relationships",
        {"p_task_id": str(task_id), "p_task": changes, **relation_values},
    )
    return (await _tasks_with_relations(supabase, [_rpc_row(result)]))[0]


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
    return bool(task.get("completed_at"))


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


def _activity_response(
    row: dict[str, Any],
    *,
    default_workspace_id: UUID | None = None,
) -> ActivityResponse:
    workspace_id = row.get("workspace_id")
    return ActivityResponse(
        id=UUID(str(row["id"])),
        workspace_id=UUID(str(workspace_id)) if workspace_id else default_workspace_id,
        board_id=UUID(str(row["board_id"])) if row.get("board_id") else None,
        task_id=UUID(str(row["task_id"])) if row.get("task_id") else None,
        actor_id=UUID(str(row["actor_id"])) if row.get("actor_id") else None,
        event_type=str(row.get("event_type") or "unknown"),
        detail=str(row.get("description") or row.get("detail") or ""),
        metadata=row.get("metadata") if isinstance(row.get("metadata"), dict) else {},
        created_at=_parse_datetime(row.get("created_at")) or datetime.now(timezone.utc),
    )


async def _optional_activity_rows(
    supabase: SupabaseUserClient,
    *,
    params: dict[str, str],
) -> list[dict[str, Any]]:
    try:
        return await supabase.select(
            "activities",
            params={
                **params,
                "select": "id,board_id,task_id,actor_id,event_type,description,metadata,created_at",
            },
            order="created_at.desc",
        )
    except HTTPException as exc:
        detail = str(exc.detail).casefold()
        missing_optional_table = (
            exc.status_code == status.HTTP_502_BAD_GATEWAY
            and "activities" in detail
            and any(marker in detail for marker in ("pgrst205", "could not find the table", "does not exist"))
        )
        if not missing_optional_table:
            raise
        logger.warning("Optional activity history source is unavailable; returning an empty activity feed.")
        return []


async def _board_tasks(supabase: SupabaseUserClient, board_id: UUID) -> list[dict[str, Any]]:
    await _get_board(supabase, board_id)
    rows = await supabase.select("tasks", params={"board_id": f"eq.{board_id}"}, order="position.asc")
    tasks = await _tasks_with_relations(supabase, rows)
    return [task.model_dump(mode="json") for task in tasks]


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
        for assignee in task.get("assignee_ids", []):
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
        } for assignee_id, count in concentrated_assignees for task in incomplete if assignee_id in task.get("assignee_ids", [])][:10]
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
            "overdue_tasks": sum(1 for task in overdue if assignee_id in task.get("assignee_ids", [])),
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
    return await _current_drift_response(supabase, board_id)


@app.post("/boards/{board_id}/drift/evaluate", response_model=DriftSnapshotResponse, tags=["analytics"])
async def evaluate_board_drift(
    board_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> DriftSnapshotResponse:
    return await _current_drift_response(supabase, board_id)


def _recovery_actions(board_id: UUID, metrics: dict[str, Any]) -> list[dict[str, Any]]:
    action_specs = {
        "overdue": ("Triage overdue tasks", "MEDIUM", "HIGH"),
        "approaching_deadline": ("Confirm upcoming deadlines", "LOW", "MEDIUM"),
        "priority": ("Review high-priority tasks", "LOW", "HIGH"),
        "stagnation": ("Re-engage stalled work", "MEDIUM", "MEDIUM"),
        "dependency_bottleneck": ("Review blocked dependencies", "MEDIUM", "HIGH"),
        "workload": ("Review concentrated workload", "MEDIUM", "MEDIUM"),
    }
    actions = []
    for factor in metrics["factors"]:
        spec = action_specs.get(factor["category"])
        if not spec:
            continue
        evidence = factor.get("evidence", [])
        task_ids = list(dict.fromkeys(str(item["task_id"]) for item in evidence if item.get("task_id")))[:10]
        if not task_ids:
            continue
        task_titles = list(dict.fromkeys(str(item["task_title"]) for item in evidence if item.get("task_title")))
        rationale = f"{factor['description']} {factor['recommendation']}"
        if task_titles:
            rationale += f" Affected tasks: {', '.join(task_titles[:3])}."
            if len(task_titles) > 3:
                rationale += " Additional affected tasks are linked below."
        title, effort, impact = spec
        actions.append({
            "id": f"{board_id}-{factor['category']}-recovery",
            "title": title,
            "rationale": rationale,
            "effort": effort,
            "impact": impact,
            "ai_generated": False,
            "related_task_ids": task_ids,
        })
    return actions


async def _current_drift_response(
    supabase: SupabaseUserClient,
    board_id: UUID,
) -> DriftSnapshotResponse:
    generated_at = datetime.now(timezone.utc)
    metrics = await _drift_metrics(supabase, board_id, generated_at)
    history = await supabase.select(
        "drift_snapshots",
        params={"board_id": f"eq.{board_id}", "limit": "13"},
        order="evaluated_at.desc",
    )
    activity_rows = await _optional_activity_rows(
        supabase,
        params={"board_id": f"eq.{board_id}", "limit": "100"},
    )
    activity = [
        _activity_response(
            row,
            default_workspace_id=UUID(str(metrics["board"]["workspace_id"])),
        ).model_dump(mode="json")
        for row in reversed(activity_rows)
    ]
    methodology = (
        "Deterministic score: overdue tasks 30 points, deadlines within 7 days 15, "
        "high/urgent tasks 20, tasks unchanged 7+ days 20, blocked tasks 15, and "
        "one assignee holding at least 50% of incomplete work 15. Score is capped at 100."
    )
    trends = [
        DriftTrendResponse(
            date=(_parse_datetime(row.get("evaluated_at")) or generated_at).strftime("%Y-%m-%d"),
            score=int(row.get("risk_score") or 0),
        )
        for row in reversed(history)
    ]
    trends.append(DriftTrendResponse(date=generated_at.strftime("%Y-%m-%d"), score=metrics["score"]))
    return DriftSnapshotResponse(
        id=f"current-{board_id}-{generated_at.isoformat()}",
        board_id=board_id,
        generated_at=generated_at,
        drift_score=metrics["score"],
        health=metrics["health"],
        trend=trends,
        factors=[RiskFactorResponse.model_validate(factor) for factor in metrics["factors"]],
        workload=metrics["workload"],
        recovery_actions=_recovery_actions(board_id, metrics),
        activity=activity,
        methodology=methodology,
        historical_trend_available=bool(history),
    )


@app.post("/boards/{board_id}/summary", response_model=ProjectSummaryResponse, tags=["analytics"])
async def generate_board_summary(
    board_id: UUID,
    user: AuthenticatedUser = Depends(get_current_user),
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> ProjectSummaryResponse:
    board = await _get_board(supabase, board_id)
    await _require_workspace_editor(supabase, user, UUID(str(board["workspace_id"])))
    tasks = await _board_tasks(supabase, board_id)
    settings = require_settings()
    now = datetime.now(timezone.utc)
    board_name = _board_display_name(board)

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
        "board": {"name": board_name},
        "task_totals": {
            "total": len(tasks),
            "completed": len(completed),
            "pending": len(incomplete),
            "overdue": len(overdue),
            "upcoming_14_days": len(upcoming),
            "high_or_urgent": sum(1 for task in incomplete if task.get("priority") in {"HIGH", "URGENT"}),
            "blocked": len(blocked),
        },
        "tasks": [
            {
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

    recommendation_payloads = [
        {
            "title": _summary_text_without_ids(item.title, board_id, board_name),
            "reasoning": _summary_text_without_ids(item.reasoning, board_id, board_name),
            "urgency": item.urgency,
        }
        for item in result.priority_recommendations
    ]
    recommendations = [
        SummaryRecommendationResponse(
            id=f"{board_id}-recommendation-{index}",
            title=item["title"],
            reasoning=item["reasoning"],
            urgency=item["urgency"],
        )
        for index, item in enumerate(recommendation_payloads)
    ]
    executive_summary = _board_executive_summary(result.executive_summary, board_id, board_name)
    saved = await supabase.insert(
        "ai_summaries",
        {
            "board_id": str(board_id),
            "summary": executive_summary,
            "highlights": {
                "project_overview": _summary_text_without_ids(result.project_overview, board_id, board_name),
                "completed_work": [
                    _summary_text_without_ids(value, board_id, board_name)
                    for value in result.completed_work
                ],
                "pending_work": [
                    _summary_text_without_ids(value, board_id, board_name)
                    for value in result.pending_work
                ],
            },
            "risks": [
                _summary_text_without_ids(value, board_id, board_name)
                for value in result.blockers
            ],
            "recommendations": recommendation_payloads,
            "model_name": settings.ai_model,
            "generated_by": user.id,
        },
    )
    return _saved_summary(saved, confidence=result.confidence, board_name=board_name)


def _saved_summary(
    row: dict[str, Any],
    confidence: float | None = None,
    board_name: str = "this board",
) -> ProjectSummaryResponse:
    highlights = row.get("highlights")
    if not isinstance(highlights, dict):
        highlights = {}
    recommendations = row.get("recommendations")
    if not isinstance(recommendations, list):
        recommendations = []
    board_id = UUID(str(row["board_id"]))
    display_name = _board_display_name({"name": board_name})
    return ProjectSummaryResponse(
        id=str(row["id"]),
        board_id=board_id,
        generated_at=_parse_datetime(row.get("created_at")) or datetime.now(timezone.utc),
        executive_summary=_board_executive_summary(
            str(row.get("summary") or ""),
            board_id,
            display_name,
        ),
        project_overview=_summary_text_without_ids(
            str(highlights.get("project_overview") or ""),
            board_id,
            display_name,
        ),
        completed_work=[
            _summary_text_without_ids(value, board_id, display_name)
            for value in highlights.get("completed_work", [])
            if isinstance(value, str)
        ],
        pending_work=[
            _summary_text_without_ids(value, board_id, display_name)
            for value in highlights.get("pending_work", [])
            if isinstance(value, str)
        ],
        blockers=[
            _summary_text_without_ids(value, board_id, display_name)
            for value in row.get("risks", [])
            if isinstance(value, str)
        ]
        if isinstance(row.get("risks"), list) else [],
        priority_recommendations=[
            SummaryRecommendationResponse(
                id=f"{row['id']}-recommendation-{index}",
                title=_summary_text_without_ids(
                    str(item.get("title", "")),
                    board_id,
                    display_name,
                ),
                reasoning=_summary_text_without_ids(
                    str(item.get("reasoning", "")),
                    board_id,
                    display_name,
                ),
                urgency=str(item.get("urgency", "MEDIUM")),
            )
            for index, item in enumerate(recommendations)
            if isinstance(item, dict)
        ],
        confidence=confidence,
        ai_generated=True,
    )


@app.get("/boards/{board_id}/summary", response_model=ProjectSummaryResponse | None, tags=["analytics"])
async def get_board_summary(
    board_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> ProjectSummaryResponse | None:
    board = await _get_board(supabase, board_id)
    rows = await supabase.select(
        "ai_summaries",
        params={"board_id": f"eq.{board_id}", "limit": "1"},
        order="created_at.desc",
    )
    return _saved_summary(rows[0], board_name=_board_display_name(board)) if rows else None


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
    rows = await _optional_activity_rows(
        supabase,
        params={"board_id": f"eq.{board_id}", "limit": "100"},
    )
    return [
        _activity_response(row, default_workspace_id=UUID(str(board["workspace_id"])))
        for row in reversed(rows)
    ]


@app.get("/workspaces/{workspace_id}/activity", response_model=list[ActivityResponse], tags=["activity"])
async def get_workspace_activity(
    workspace_id: UUID,
    supabase: SupabaseUserClient = Depends(get_supabase_for_user),
) -> list[ActivityResponse]:
    await _get_workspace(supabase, workspace_id)
    boards = await supabase.select(
        "boards",
        params={"workspace_id": f"eq.{workspace_id}", "select": "id"},
    )
    board_ids = [str(row["id"]) for row in boards if row.get("id")]
    if not board_ids:
        return []
    rows = await _optional_activity_rows(
        supabase,
        params={"board_id": f"in.({','.join(board_ids)})", "limit": "100"},
    )
    return [
        _activity_response(row, default_workspace_id=workspace_id)
        for row in reversed(rows)
    ]
