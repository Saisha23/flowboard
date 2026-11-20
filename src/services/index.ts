// Flowboard AI — API-backed service layer.
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
import { supabase } from '@/lib/supabase';

function isLabelColor(value: unknown): value is Label['color'] {
  return typeof value === 'string'
    && ['mint', 'apricot', 'sand', 'coral', 'amber', 'slatey', 'sage'].includes(value);
}

function mapLabel(row: { id: string; name: string; color?: string | null }, boardId: string): Label {
  return {
    id: row.id,
    boardId,
    name: row.name,
    color: isLabelColor(row.color) ? row.color : 'mint',
    sourceColor: row.color ?? null,
  };
}

export const workspaceService = {
  async list(): Promise<Workspace[]> {
    const response = await apiFetch('/workspaces');
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<{ id: string; name: string; plan?: string; color?: string | null }>;
    return rows.map((row) => ({ id: row.id, name: row.name, plan: row.plan ?? 'FREE', color: row.color ?? '#B8E4D0' }));
  },
  async current(): Promise<Workspace | null> {
    const workspaces = await workspaceService.list();
    return workspaces[0] ?? null;
  },
  async switch(id: string): Promise<Workspace> {
    const response = await apiFetch(`/workspaces/${id}`);
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as { id: string; name: string; plan?: string; color?: string | null };
    return { id: row.id, name: row.name, plan: row.plan ?? 'FREE', color: row.color ?? '#B8E4D0' };
  },
  async create(input: { name: string; plan?: string; color?: string }): Promise<Workspace> {
    const response = await apiFetch('/workspaces', { method: 'POST', body: JSON.stringify(input) });
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as { id: string; name: string; plan?: string; color?: string | null };
    return { id: row.id, name: row.name, plan: row.plan ?? 'FREE', color: row.color ?? '#B8E4D0' };
  },
  async createFirst(name: string, slug: string): Promise<string> {
    if (!supabase) throw new Error('Supabase authentication is not configured.');
    const { data, error } = await supabase.rpc('create_workspace', {
      p_name: name,
      p_slug: slug,
    });
    if (error) throw error;
    if (typeof data !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data)) {
      throw new Error('Supabase returned an invalid workspace ID.');
    }
    return data;
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
    const rows = await response.json() as Array<{ id: string; workspace_id: string; name: string; description: string; color?: string | null }>;
    return rows.map((row) => ({ id: row.id, workspaceId: row.workspace_id, name: row.name, description: row.description, color: (row.color ?? 'mint') as Board['color'] }));
  },
  async get(id: string): Promise<Board | undefined> {
    const response = await apiFetch(`/boards/${id}`);
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as { id: string; workspace_id: string; name: string; description: string; color?: string | null };
    return { id: row.id, workspaceId: row.workspace_id, name: row.name, description: row.description, color: (row.color ?? 'mint') as Board['color'] };
  },
  async create(workspaceId: string, input: { name: string; description?: string; color?: Board['color'] }): Promise<Board> {
    const response = await apiFetch('/boards', { method: 'POST', body: JSON.stringify({ workspace_id: workspaceId, name: input.name, description: input.description ?? '' }) });
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as { id: string; workspace_id: string; name: string; description: string; color?: string | null };
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
    const response = await apiFetch(`/boards/${boardId}/lists`);
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<{ id: string; board_id: string; name: string; position: number; color?: string }>;
    const palette: List['color'][] = ['slatey', 'sand', 'amber', 'apricot', 'mint', 'sage'];
    return rows.map((row, index) => ({
      id: row.id,
      boardId: row.board_id,
      name: row.name,
      position: row.position,
      color: isLabelColor(row.color) ? row.color : palette[index % palette.length],
    }));
  },
  async create(boardId: string, name: string): Promise<List> {
    const response = await apiFetch(`/boards/${boardId}/lists`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as { id: string; board_id: string; name: string; position: number; color?: string };
    const palette: List['color'][] = ['slatey', 'sand', 'amber', 'apricot', 'mint', 'sage'];
    return {
      id: row.id,
      boardId: row.board_id,
      name: row.name,
      position: row.position,
      color: isLabelColor(row.color) ? row.color : palette[row.position % palette.length],
    };
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
    }
    if (patch.priority !== undefined) body.priority = patch.priority;
    if (patch.position !== undefined) body.position = patch.position;
    if (patch.dueDate !== undefined) body.due_date = patch.dueDate;
    if (patch.completedAt !== undefined) body.completed_at = patch.completedAt;
    if (patch.assigneeIds !== undefined) body.assignee_ids = patch.assigneeIds;
    if (patch.labelIds !== undefined) body.label_ids = patch.labelIds;
    if (patch.blockedByIds !== undefined) body.blocked_by_ids = patch.blockedByIds;
    if (patch.estimateHours !== undefined) body.estimate_hours = patch.estimateHours;
    const response = await apiFetch(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (!response.ok) throw new Error(await response.text());
    return mapTask(await response.json() as Record<string, unknown>);
  },
  async create(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    const requestBody = {
      board_id: task.boardId,
      title: task.title,
      description: task.description,
      list_id: task.listId,
      priority: task.priority,
      position: task.position,
      due_date: task.dueDate,
      completed_at: task.completedAt,
      assignee_ids: task.assigneeIds,
      label_ids: task.labelIds,
      blocked_by_ids: task.blockedByIds,
      estimate_hours: task.estimateHours,
    };
    const response = await apiFetch('/tasks', {
      method: 'POST',
      body: JSON.stringify(requestBody),
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
  if (typeof row.list_id !== 'string') throw new Error('Task response is missing its board list ID.');
  const assigneeIds = Array.isArray(row.assignee_ids)
    ? row.assignee_ids.map(String)
    : row.assignee_id ? [String(row.assignee_id)] : [];
  const completedAt = typeof row.completed_at === 'string'
    ? row.completed_at
    : row.status === 'DONE'
      ? String(row.updated_at)
      : null;
  return {
    id: String(row.id),
    title: String(row.title),
    description: String(row.description ?? ''),
    listId: row.list_id,
    boardId: String(row.board_id),
    position: Number(row.position ?? 0),
    priority: mapPriority(row.priority),
    dueDate: typeof row.due_date === 'string' ? row.due_date : null,
    completedAt,
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

function mapPriority(value: unknown): Task['priority'] {
  const priority = String(value ?? 'medium').toUpperCase();
  switch (priority) {
    case 'LOW':
    case 'MEDIUM':
    case 'HIGH':
      return priority;
    case 'CRITICAL':
    case 'URGENT':
      return 'URGENT';
    default:
      throw new Error(`Unsupported task priority returned by API: ${String(value)}`);
  }
}

export const labelService = {
  async list(workspaceId?: string | null, knownBoards?: Board[]): Promise<Label[]> {
    const boards = knownBoards ?? (workspaceId === null ? [] : await boardService.list(workspaceId));
    const rows = await Promise.all(boards.map(async (board) => {
      const response = await apiFetch(`/boards/${board.id}/labels`);
      if (!response.ok) throw new Error(await response.text());
      return await response.json() as Array<{ id: string; name: string; color?: string | null }>;
    }));
    return rows.flatMap((labels, index) => labels.map((label) => mapLabel(label, boards[index].id)));
  },
  async create(boardId: string, name: string): Promise<Label> {
    const response = await apiFetch(`/boards/${boardId}/labels`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as { id: string; name: string; color?: string | null };
    return mapLabel(row, boardId);
  },
};

export const userService = {
  async list(workspaceId?: string | null): Promise<User[]> {
    const targetWorkspaceId = workspaceId === undefined ? (await workspaceService.list())[0]?.id : workspaceId;
    if (!targetWorkspaceId) return [];
    const response = await apiFetch(`/workspaces/${targetWorkspaceId}/members`);
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<{ user_id: string; full_name?: string | null; name?: string | null; initials?: string; avatar_color?: string; avatar_url?: string | null; role: Membership['role'] }>;
    return rows.map((row) => ({
      id: row.user_id,
      name: row.full_name?.trim() || row.name?.trim() || 'Team member',
      email: '',
      initials: row.initials ?? row.user_id.slice(0, 2).toUpperCase(),
      color: row.avatar_color ?? '#B8E4D0',
      role: row.role,
      title: '',
      avatarUrl: row.avatar_url ?? null,
    }));
  },
  async current(workspaceId?: string | null, knownUsers?: User[]): Promise<User> {
    const response = await apiFetch('/me');
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as { id: string; email?: string; profile?: { full_name?: string | null; avatar_url?: string | null } | null };
    const profile = row.profile ?? {};
    let role: User['role'] = 'member';
    const targetWorkspaceId = workspaceId === undefined ? (await workspaceService.list())[0]?.id : workspaceId;
    if (targetWorkspaceId) {
      let membership: Pick<User, 'role'> | undefined;
      if (knownUsers) {
        membership = knownUsers.find((member) => member.id === row.id);
      } else {
        const memberResponse = await apiFetch(`/workspaces/${targetWorkspaceId}/members`);
        if (!memberResponse.ok) throw new Error(await memberResponse.text());
        const members = await memberResponse.json() as Array<{ user_id: string; role: User['role'] }>;
        const member = members.find((item) => item.user_id === row.id);
        if (member) membership = { role: member.role };
      }
      if (membership) {
        role = membership.role;
      }
    }
    const name = profile.full_name?.trim() || 'Account';
    return {
      id: row.id,
      name,
      profileName: profile.full_name?.trim() || null,
      email: row.email ?? '',
      initials: name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase(),
      color: '#B8E4D0',
      role,
      title: '',
      avatarUrl: profile.avatar_url ?? null,
    };
  },
};

export const profileService = {
  async updateOwnFullName(userId: string, fullName: string): Promise<void> {
    if (!supabase) throw new Error('Supabase authentication is not configured.');
    const { error } = await supabase
      .from('profiles')
      .update({ full_name: fullName })
      .eq('id', userId);
    if (error) throw error;
  },
};

export const membershipService = {
  async list(workspaceId?: string): Promise<Membership[]> {
    const targetWorkspaceId = workspaceId ?? (await workspaceService.current())?.id;
    if (!targetWorkspaceId) return [];
    const response = await apiFetch(`/workspaces/${targetWorkspaceId}/members`);
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<{ user_id: string; role: Membership['role']; joined_at: string }>;
    return rows.map((row) => ({ userId: row.user_id, role: row.role, joinedAt: row.joined_at }));
  },
  async setRole(userId: string, role: Membership['role'], workspaceId?: string): Promise<void> {
    const targetWorkspaceId = workspaceId ?? (await workspaceService.current())?.id;
    if (!targetWorkspaceId) throw new Error('No workspace available.');
    const response = await apiFetch(`/workspaces/${targetWorkspaceId}/members/${userId}`, {
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
    return mapDrift(await response.json() as Record<string, unknown>);
  },
  async evaluate(boardId: string): Promise<DriftSnapshot> {
    const response = await apiFetch(`/boards/${boardId}/drift/evaluate`, { method: 'POST' });
    if (!response.ok) throw new Error(await response.text());
    return mapDrift(await response.json() as Record<string, unknown>);
  },
};

function mapDrift(row: Record<string, unknown>): DriftSnapshot {
    const raw = row as {
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
      id: raw.id,
      boardId: raw.board_id,
      generatedAt: raw.generated_at,
      driftScore: raw.drift_score,
      health: raw.health,
      trend: raw.trend.map((point) => ({ date: point.date, score: point.score })),
      factors: raw.factors.map((factor) => ({
        id: String(factor.id),
        category: mapRiskFactorCategory(factor.category),
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
      workload: raw.workload.map((entry) => ({
        userId: entry.user_id,
        userName: entry.user_id,
        initials: 'TM',
        color: '#B8E4D0',
        openTasks: entry.open_tasks,
        overdueTasks: entry.overdue_tasks,
        capacity: entry.capacity,
      })),
      recoveryActions: raw.recovery_actions.map((action) => ({
        id: String(action.id),
        title: String(action.title),
        rationale: String(action.rationale),
        effort: (String(action.effort) as RecoveryAction['effort']),
        impact: (String(action.impact) as RecoveryAction['impact']),
        aiGenerated: Boolean(action.ai_generated),
        relatedTaskIds: Array.isArray(action.related_task_ids) ? action.related_task_ids.map(String) : [],
      })),
      activity: Array.isArray(row.activity)
        ? row.activity.filter(isRecord).map(mapActivity).sort(
          (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
        )
        : [],
    };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function activityTypeFor(value: unknown): Activity['type'] {
  switch (value) {
    case 'task_moved':
    case 'task_deleted':
    case 'task_created':
    case 'task_completed':
    case 'deadline_changed':
    case 'assignee_changed':
    case 'comment_added':
    case 'role_changed':
    case 'summary_generated':
      return value === 'assignee_changed' ? 'assignee_added' : value;
    default:
      return 'activity_recorded';
  }
}

function mapActivity(row: Record<string, unknown>): Activity {
  const taskId = typeof row.task_id === 'string' ? row.task_id : null;
  const boardId = typeof row.board_id === 'string' ? row.board_id : null;
  return {
    id: String(row.id ?? ''),
    type: activityTypeFor(row.event_type),
    actorId: typeof row.actor_id === 'string' ? row.actor_id : 'unknown',
    target: taskId ? 'Task' : boardId ? 'Board' : 'Workspace',
    detail: typeof row.detail === 'string' ? row.detail : '',
    timestamp: typeof row.created_at === 'string' ? row.created_at : '',
    metadata: isRecord(row.metadata) ? row.metadata : {},
  };
}

const riskFactorCategories: Record<string, RiskFactor['category']> = {
  overdue: 'overdue',
  approaching_deadline: 'approaching_deadline',
  priority: 'priority',
  deadline_churn: 'deadline_churn',
  stagnation: 'stagnation',
  dependency_bottleneck: 'dependency_bottleneck',
  workload: 'workload',
};

function mapRiskFactorCategory(value: unknown): RiskFactor['category'] {
  return typeof value === 'string' ? riskFactorCategories[value] ?? 'other' : 'other';
}


export const summaryService = {
  async get(boardId: string): Promise<AISummary | null> {
    const response = await apiFetch(`/boards/${boardId}/summary`);
    if (!response.ok) throw new Error(await response.text());
    const row = await response.json() as Record<string, unknown> | null;
    return row ? mapSummary(row) : null;
  },
  async generate(boardId: string): Promise<AISummary> {
    const response = await apiFetch(`/boards/${boardId}/summary`, { method: 'POST' });
    if (!response.ok) throw new Error(await response.text());
    return mapSummary(await response.json() as Record<string, unknown>);
  },
};

function mapSummary(value: Record<string, unknown>): AISummary {
    const row = value as {
      id: string;
      board_id: string;
      generated_at: string;
      executive_summary: string;
      project_overview: string;
      completed_work: string[];
      pending_work: string[];
      blockers: string[];
      priority_recommendations: Array<{ id: string; title: string; reasoning: string; urgency: PriorityRecommendation['urgency'] }>;
      confidence?: number | null;
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
}

export const activityService = {
  async recent(workspaceId?: string | null): Promise<Activity[]> {
    const targetWorkspaceId = workspaceId === undefined ? (await workspaceService.list())[0]?.id : workspaceId;
    if (!targetWorkspaceId) return [];
    const response = await apiFetch(`/workspaces/${targetWorkspaceId}/activity`);
    if (!response.ok) throw new Error(await response.text());
    const rows = await response.json() as Array<Record<string, unknown>>;
    return rows.map(mapActivity);
  },
};
