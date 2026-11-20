// Flowboard AI — core domain types

export type ID = string;

export type Role = 'owner' | 'member' | 'viewer';

export type Priority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export type RiskLevel = 'HEALTHY' | 'WATCH' | 'AT_RISK' | 'CRITICAL';

export type LabelColor = 'mint' | 'apricot' | 'sand' | 'coral' | 'amber' | 'slatey' | 'sage';

export interface User {
  id: ID;
  name: string;
  profileName?: string | null;
  email: string;
  initials: string;
  color: string; // avatar background hex
  avatarUrl?: string | null;
  role: Role;
  title: string;
}

export interface Label {
  id: ID;
  boardId: ID;
  name: string;
  color: LabelColor;
  sourceColor?: string | null;
}

export interface Task {
  id: ID;
  title: string;
  description: string;
  listId: ID;
  boardId: ID;
  position: number;
  priority: Priority;
  dueDate: string | null; // ISO
  completedAt?: string | null;
  assigneeIds: ID[];
  labelIds: ID[];
  createdAt: string;
  updatedAt: string;
  // drift signals
  deadlineChanges: number; // times the due date was moved
  stagnationDays: number; // days without movement
  blockedByIds: ID[]; // tasks this one is waiting on
  estimateHours: number | null;
}

export interface List {
  id: ID;
  boardId: ID;
  name: string;
  color: LabelColor;
  position: number;
}

export interface Board {
  id: ID;
  name: string;
  description: string;
  color: LabelColor;
  workspaceId: ID;
}

export interface Workspace {
  id: ID;
  name: string;
  plan: string;
  color: string;
}

export type ActivityType =
  | 'task_moved'
  | 'task_deleted'
  | 'task_created'
  | 'task_completed'
  | 'deadline_changed'
  | 'assignee_added'
  | 'comment_added'
  | 'role_changed'
  | 'summary_generated'
  | 'activity_recorded';

export interface Activity {
  id: ID;
  type: ActivityType;
  actorId: ID;
  target: string;
  detail: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface RiskFactor {
  id: ID;
  category:
    | 'overdue'
    | 'approaching_deadline'
    | 'priority'
    | 'deadline_churn'
    | 'stagnation'
    | 'dependency_bottleneck'
    | 'workload'
    | 'other';
  label: string;
  severity: RiskLevel;
  score: number; // 0-100 contribution to drift
  evidenceCount: number;
  description: string;
  evidence: RiskEvidence[];
  recommendation: string;
  aiGenerated: boolean;
}

export interface RiskEvidence {
  taskId: ID;
  taskTitle: string;
  assigneeName: string;
  metric: string;
  detail: string;
}

export interface DriftSnapshot {
  id: ID;
  boardId: ID;
  generatedAt: string;
  driftScore: number; // 0-100 (higher = worse)
  health: RiskLevel;
  trend: DriftTrendPoint[];
  factors: RiskFactor[];
  workload: WorkloadEntry[];
  recoveryActions: RecoveryAction[];
  activity: Activity[];
}

export interface DriftTrendPoint {
  date: string;
  score: number;
}

export interface WorkloadEntry {
  userId: ID;
  userName: string;
  initials: string;
  color: string;
  openTasks: number;
  overdueTasks: number;
  capacity: number;
}

export interface RecoveryAction {
  id: ID;
  title: string;
  rationale: string;
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  aiGenerated: boolean;
  relatedTaskIds: ID[];
}

export interface AISummary {
  id: ID;
  boardId: ID;
  generatedAt: string;
  executiveSummary: string;
  projectOverview: string;
  completedWork: string[];
  pendingWork: string[];
  blockers: string[];
  priorityRecommendations: PriorityRecommendation[];
  confidence?: number | null;
}

export interface PriorityRecommendation {
  id: ID;
  title: string;
  reasoning: string;
  urgency: Priority;
}

export interface Membership {
  userId: ID;
  role: Role;
  joinedAt: string;
}

export interface Invite {
  id: ID;
  email: string;
  role: Role;
  status: 'PENDING' | 'ACCEPTED' | 'EXPIRED';
  sentAt: string;
}
