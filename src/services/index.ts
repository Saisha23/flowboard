// Flowboard AI — service layer
// Mock-backed during frontend development. Swap implementations to FastAPI/Supabase later.
// Components must never import mockData directly — they go through these services.

import { labels as mockLabels } from './mockData';
import type {
  Activity,
  AISummary,
  Board,
  DriftSnapshot,
  Invite,
  Label,
  List,
  Membership,
  PriorityRecommendation,
  RecoveryAction,
  RiskFactor,
  Task,
  User,
  Workspace,
} from '@/types';
import { apiFetch } from '@/lib/api';

// In-memory mutable copies so the UI feels real
const _labels = [...mockLabels];

export const workspaceService = {
  async list(): Promise<Workspace[]> {
    const response = await apiFetch('/workspaces');
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<{ id: string; name: string; plan: string; color: string | null }>;
    return rows.map((row) => ({ id: row.id, name: row.name, plan: row.plan, color: row.color ?? '#B8E4D0' }));
  },
  async current(): Promise<Workspace | null> {
    const workspaces = await workspaceService.list();
    return workspaces[0] ?? null;
  },
  async switch(id: string): Promise<Workspace> {
    const response = await apiFetch(`/workspaces/${id}`);
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as { id: string; name: string; plan: string; color: string | null };
    return { id: row.id, name: row.name, plan: row.plan, color: row.color ?? '#B8E4D0' };
  },
  async create(input: { name: string; plan?: string; color?: string }): Promise<Workspace> {
    const response = await apiFetch('/workspaces', { method: 'POST', body: JSON.stringify(input) });
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as { id: string; name: string; plan: string; color: string | null };
    return { id: row.id, name: row.name, plan: row.plan, color: row.color ?? '#B8E4D0' };
  },
  async update(id: string, patch: Partial<Workspace>): Promise<Workspace> {
    const response = await apiFetch(`/workspaces/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as { id: string; name: string; plan: string; color: string | null };
    return { id: row.id, name: row.name, plan: row.plan, color: row.color ?? '#B8E4D0' };
  },
  async remove(id: string): Promise<void> {
    const response = await apiFetch(`/workspaces/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await response.text());
  },
};

export const boardService = {
  async list(workspaceId?: string): Promise<Board[]> {
    const targetWorkspaceId = workspaceId ?? (await workspaceService.list())[0]?.id;
    if (!targetWorkspaceId) return [];
    const response = await apiFetch(`/workspaces/${targetWorkspaceId}/boards`);
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<{ id: string; workspace_id: string; name: string; description: string; color: string | null }>;
    return rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id, name: row.name, description: row.description, color: (row.color ?? 'mint') as Board['color'] }));
  },
  async get(id: string): Promise<Board | undefined> {
    const response = await apiFetch(`/boards/${id}`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as { id: string; workspace_id: string; name: string; description: string; color: string | null };
    return { id: row.id, workspaceId: row.workspace_id, name: row.name, description: row.description, color: (row.color ?? 'mint') as Board['color'] };
  },
  async create(workspaceId: string, input: { name: string; description?: string; color?: Board['color'] }): Promise<Board> {
    const response = await apiFetch('/boards', { method: 'POST', body: JSON.stringify({ workspace_id: workspaceId, name: input.name, description: input.description ?? '', color: input.color ?? 'mint' }) });
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as { id: string; workspace_id: string; name: string; description: string; color: string | null };
    return { id: row.id, workspaceId: row.workspace_id, name: row.name, description: row.description, color: (row.color ?? 'mint') as Board['color'] };
  },
  async update(id: string, patch: Partial<Pick<Board, 'name' | 'description' | 'color'>>): Promise<Board> {
    const response = await apiFetch(`/boards/${id}`, { method: 'PATCH', body: JSON.stringify(patch) });
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as { id: string; workspace_id: string; name: string; description: string; color: string | null };
    return { id: row.id, workspaceId: row.workspace_id, name: row.name, description: row.description, color: (row.color ?? 'mint') as Board['color'] };
  },
  async remove(id: string): Promise<void> {
    const response = await apiFetch(`/boards/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await response.text());
  },
};

export const listService = {
  async forBoard(boardId: string): Promise<List[]> {
    return [
      { id: 'list-1', boardId, name: 'Backlog', color: 'slatey', position: 0 },
      { id: 'list-2', boardId, name: 'To do', color: 'sand', position: 1 },
      { id: 'list-3', boardId, name: 'In progress', color: 'amber', position: 2 },
      { id: 'list-4', boardId, name: 'In review', color: 'apricot', position: 3 },
      { id: 'list-5', boardId, name: 'Done', color: 'mint', position: 4 },
    ];
  },
};

export const taskService = {
  async forBoard(boardId: string): Promise<Task[]> {
    const response = await apiFetch(`/boards/${boardId}/tasks`);
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<Record<string, unknown>>;
    return rows.map(mapTask);
  },
  async all(): Promise<Task[]> {
    const boards = await boardService.list();
    const lists = await Promise.all(boards.map((board) => taskService.forBoard(board.id)));
    return lists.flat();
  },
  async update(id: string, patch: Partial<Task>): Promise<Task> {
    const body: Record<string, unknown> = {};
    if (patch.title !== undefined) body.title = patch.title;
    if (patch.description !== undefined) body.description = patch.description;
    if (patch.listId !== undefined) {
      body.list_id = patch.listId;
      body.status = patch.listId === 'list-5' ? 'DONE'
        : patch.listId === 'list-4' ? 'IN_REVIEW'
        : patch.listId === 'list-3' ? 'IN_PROGRESS'
        : patch.listId === 'list-2' ? 'TODO'
        : 'BACKLOG';
    }
    if (patch.priority !== undefined) body.priority = patch.priority;
    if (patch.position !== undefined) body.position = patch.position;
    if (patch.dueDate !== undefined) body.due_date = patch.dueDate;
    if (patch.assigneeIds !== undefined) body.assignee_id = patch.assigneeIds[0] ?? null;
    if (patch.labelIds !== undefined) body.label_ids = patch.labelIds;
    if (patch.blockedByIds !== undefined) body.blocked_by_ids = patch.blockedByIds;
    if (patch.deadlineChanges !== undefined) body.deadline_changes = patch.deadlineChanges;
    if (patch.stagnationDays !== undefined) body.stagnation_days = patch.stagnationDays;
    if (patch.estimateHours !== undefined) body.estimate_hours = patch.estimateHours;
    const response = await apiFetch(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (!response.ok) throw new Error(await response.text());
    return mapTask(await response.json() as Record<string, unknown>);
  },
  async create(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const response = await apiFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify({
        board_id: task.boardId,
        title: task.title,
        description: task.description,
        list_id: task.listId,
        status: task.listId === 'list-5' ? 'DONE' : task.listId === 'list-4' ? 'IN_REVIEW' : task.listId === 'list-3' ? 'IN_PROGRESS' : 'TODO',
        priority: task.priority,
        position: task.position,
        due_date: task.dueDate,
        assignee_id: task.assigneeIds[0] ?? null,
        label_ids: task.labelIds,
        blocked_by_ids: task.blockedByIds,
        estimate_hours: task.estimateHours,
      }),
    });
    if (!response.ok) throw new Error(await response.text());
    return mapTask(await response.json() as Record<string, unknown>);
  },
  async remove(id: string): Promise<void> {
    const response = await apiFetch(`/tasks/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error(await response.text());
  },
};

function mapTask(row: Record<string, unknown>): Task {
  const status = String(row.status ?? 'TODO');
  const listId = typeof row.list_id === 'string'
    ? row.list_id
    : status === 'DONE' ? 'list-5' : status === 'IN_REVIEW' ? 'list-4' : status === 'IN_PROGRESS' ? 'list-3' : 'list-1';
  const assigneeIds = Array.isArray(row.assignee_ids)
    ? row.assignee_ids.map(String)
    : row.assignee_id ? [String(row.assignee_id)] : [];
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description ?? ''),
    listId,
    boardId: String(row.board_id),
    position: Number(row.position ?? 0),
    priority: (String(row.priority ?? 'MEDIUM') as Task['priority']),
    dueDate: typeof row.due_date === 'string' ? row.due_date : null,
    assigneeIds,
    labelIds: Array.isArray(row.label_ids) ? row.label_ids.map(String) : [],
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    deadlineChanges: Number(row.deadline_changes ?? 0),
    stagnationDays: Number(row.stagnation_days ?? 0),
    blockedByIds: Array.isArray(row.blocked_by_ids) ? row.blocked_by_ids.map(String) : [],
    estimateHours: row.estimate_hours == null ? null : Number(row.estimate_hours),
  };
}

export const labelService = {
  async list(): Promise<Label[]> {
    return _labels;
  },
};

export const userService = {
  async list(): Promise<User[]> {
    const workspaces = await workspaceService.list();
    if (!workspaces[0]) return [];
    const response = await apiFetch(`/workspaces/${workspaces[0].id}/members`);
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<{ user_id: string; email?: string; name?: string; initials?: string; avatar_color?: string; title?: string; role: Membership['role'] | 'ADMIN' }>;
    return rows.map((row) => ({
      id: row.user_id,
      name: row.name ?? row.email ?? 'Team member',
      email: row.email ?? '',
      initials: row.initials ?? (row.name ?? row.email ?? 'TM').slice(0, 2).toUpperCase(),
      color: row.avatar_color ?? '#B8E4D0',
      role: row.role,
      title: row.title ?? '',
    }));
  },
  async current(): Promise<User> {
    const response = await apiFetch('/me');
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as { id: string; email?: string; profile?: { name?: string; initials?: string; avatar_color?: string; title?: string } | null };
    const profile = row.profile ?? {};
    let role: User['role'] = 'MEMBER';
    try {
      const workspaces = await workspaceService.list();
      if (workspaces[0]) {
        const memberResponse = await apiFetch(`/workspaces/${workspaces[0].id}/members`);
        if (memberResponse.ok) {
          const members = await memberResponse.json() as Array<{ user_id: string; role: User['role'] | 'ADMIN' }>;
          const membership = members.find((member) => member.user_id === row.id);
          if (membership) role = membership.role as User['role'];
        }
      }
    } catch {
      role = 'MEMBER';
    }
    return {
      id: row.id,
      name: profile.name ?? row.email?.split('@')[0] ?? 'User',
      email: row.email ?? '',
      initials: profile.initials ?? 'U',
      color: profile.avatar_color ?? '#B8E4D0',
      role,
      title: profile.title ?? '',
    };
  },
};

export const membershipService = {
  async list(): Promise<Membership[]> {
    const workspace = await workspaceService.current();
    if (!workspace) return [];
    const response = await apiFetch(`/workspaces/${workspace.id}/members`);
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<{ user_id: string; role: Membership['role']; joined_at: string }>;
    return rows.map((row) => ({ userId: row.user_id, role: row.role, joinedAt: row.joined_at }));
  },
  async setRole(userId: string, role: Membership['role']): Promise<void> {
    const workspace = await workspaceService.current();
    if (!workspace) throw new Error('No workspace available.');
    const response = await apiFetch(`/workspaces/${workspace.id}/members/${userId}`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    if (!response.ok) throw new Error(await response.text());
  },
  async invite(email: string, role: Membership['role']): Promise<Invite> {
    void email;
    void role;
    throw new Error('Email invitations require a secure Supabase invitation mechanism.');
  },
  async invites(): Promise<Invite[]> {
    return [];
  },
  async revokeInvite(id: string): Promise<void> {
    void id;
    throw new Error('No pending email invitations are managed by this API.');
  },
};

export const driftService = {
  async snapshot(boardId: string): Promise<DriftSnapshot> {
    const response = await apiFetch(`/boards/${boardId}/drift`);
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as {
      id: string;
      board_id: string;
      generated_at: string;
      drift_score: number;
      health: DriftSnapshot['health'];
      trend: Array<{ date: string; score: number }>;
      factors: Array<Record<string, unknown>>;
      workload: Array<{ user_id: string; open_tasks: number; overdue_tasks: number; capacity: number }>;
      recovery_actions: Array<Record<string, unknown>>;
      methodology: string;
      historical_trend_available: boolean;
    };
    return {
      id: row.id,
      boardId: row.board_id,
      generatedAt: row.generated_at,
      driftScore: row.drift_score,
      health: row.health,
      trend: row.trend.map((point) => ({ date: point.date, score: point.score })),
      factors: row.factors.map((factor) => ({
        id: String(factor.id),
        category: String(factor.category) as RiskFactor['category'],
        label: String(factor.label),
        severity: String(factor.severity) as RiskFactor['severity'],
        score: Number(factor.score),
        evidenceCount: Number(factor.evidence_count),
        description: String(factor.description),
        evidence: Array.isArray(factor.evidence) ? factor.evidence.map((item) => ({
          taskId: String((item as Record<string, unknown>).task_id),
          taskTitle: String((item as Record<string, unknown>).task_title),
          assigneeName: String((item as Record<string, unknown>).assignee_name),
          metric: String((item as Record<string, unknown>).metric),
          detail: String((item as Record<string, unknown>).detail),
        })) : [],
        recommendation: String(factor.recommendation),
        aiGenerated: Boolean(factor.ai_generated),
      })),
      workload: row.workload.map((entry) => ({
        userId: entry.user_id,
        userName: entry.user_id,
        initials: 'TM',
        color: '#B8E4D0',
        openTasks: entry.open_tasks,
        overdueTasks: entry.overdue_tasks,
        capacity: entry.capacity,
      })),
      recoveryActions: row.recovery_actions.map((action) => ({
        id: String(action.id),
        title: String(action.title),
        rationale: String(action.rationale),
        effort: (String(action.effort) as RecoveryAction['effort']),
        impact: (String(action.impact) as RecoveryAction['impact']),
        aiGenerated: Boolean(action.ai_generated),
        relatedTaskIds: Array.isArray(action.related_task_ids) ? action.related_task_ids.map(String) : [],
      })),
      activity: [],
    };
  },
};


export const summaryService = {
  async get(boardId: string): Promise<AISummary | null> {
    void boardId;
    return null;
  },
  async generate(boardId: string): Promise<AISummary> {
    const response = await apiFetch(`/boards/${boardId}/summary`, { method: 'POST' });
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as {
      id: string;
      board_id: string;
      generated_at: string;
      executive_summary: string;
      project_overview: string;
      completed_work: string[];
      pending_work: string[];
      blockers: string[];
      priority_recommendations: Array<{ id: string; title: string; reasoning: string; urgency: PriorityRecommendation['urgency'] }>;
      confidence: number;
    };
    return {
      id: row.id,
      boardId: row.board_id,
      generatedAt: row.generated_at,
      executiveSummary: row.executive_summary,
      projectOverview: row.project_overview,
      completedWork: row.completed_work,
      pendingWork: row.pending_work,
      blockers: row.blockers,
      priorityRecommendations: row.priority_recommendations.map((item) => ({
        id: item.id,
        title: item.title,
        reasoning: item.reasoning,
        urgency: item.urgency as PriorityRecommendation['urgency'],
      })),
      confidence: row.confidence,
    };
  },
};

export const activityService = {
  async recent(): Promise<Activity[]> {
    const workspaces = await workspaceService.list();
    if (!workspaces[0]) return [];
    const boards = await boardService.list(workspaces[0].id);
    if (!boards[0]) return [];
    const response = await apiFetch(`/boards/${boards[0].id}/activity`);
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<{ id: string; actor_id: string | null; event_type: string; detail: string; created_at: string; board_id: string | null }>;
    return rows.map((row) => {
      let type: Activity['type'] = 'task_updated' as unknown as Activity['type'];
      if (row.event_type === 'task_created') type = 'task_created';
      else if (row.event_type === 'task_moved') type = 'task_moved';
      else if (row.event_type === 'task_deleted') type = 'task_moved';
      else if (row.event_type === 'deadline_changed') type = 'deadline_changed';
      else if (row.event_type === 'assignee_changed') type = 'assignee_added';
      else if (row.event_type === 'board_created') type = 'task_created';
      else if (row.event_type === 'workspace_created' || row.event_type === 'workspace_updated') type = 'role_changed';
      else type = 'task_moved';
      return {
        id: row.id,
        type,
        actorId: row.actor_id ?? 'unknown',
        target: row.board_id ?? 'Workspace',
        detail: row.detail,
        timestamp: row.created_at,
      };
    });
  },
};
