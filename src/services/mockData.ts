import type {
  Activity,
  AISummary,
  Board,
  DriftSnapshot,
  Invite,
  Label,
  List,
  Membership,
  RiskFactor,
  Task,
  User,
  Workspace,
} from '@/types';

export const currentUser: User = {
  id: 'u1',
  name: 'Avery Chen',
  email: 'avery@flowboard.ai',
  initials: 'AC',
  color: '#D69A78',
  role: 'OWNER',
  title: 'Head of Product Delivery',
};

export const workspaces: Workspace[] = [
  { id: 'w1', name: 'Atlas Studio', plan: 'Studio', color: '#B8E4D0' },
  { id: 'w2', name: 'Northwind Labs', plan: 'Team', color: '#D69A78' },
];

export const users: User[] = [
  currentUser,
  { id: 'u2', name: 'Mara Whitfield', email: 'mara@atlas.studio', initials: 'MW', color: '#77B99B', role: 'MEMBER', title: 'Engineering Lead' },
  { id: 'u3', name: 'Theo Okafor', email: 'theo@atlas.studio', initials: 'TO', color: '#777C8E', role: 'MEMBER', title: 'Senior Designer' },
  { id: 'u4', name: 'Lina Sørensen', email: 'lina@atlas.studio', initials: 'LS', color: '#E2B65C', role: 'MEMBER', title: 'PM' },
  { id: 'u5', name: 'Rafael Costa', email: 'rafael@atlas.studio', initials: 'RC', color: '#92D3B4', role: 'VIEWER', title: 'Stakeholder' },
  { id: 'u6', name: 'Priya Nair', email: 'priya@atlas.studio', initials: 'PN', color: '#C17F5C', role: 'MEMBER', title: 'Backend Engineer' },
];

export const memberships: Membership[] = [
  { userId: 'u1', role: 'OWNER', joinedAt: '2026-08-01' },
  { userId: 'u2', role: 'MEMBER', joinedAt: '2026-08-14' },
  { userId: 'u3', role: 'MEMBER', joinedAt: '2026-09-02' },
  { userId: 'u4', role: 'MEMBER', joinedAt: '2026-09-10' },
  { userId: 'u5', role: 'VIEWER', joinedAt: '2026-10-01' },
  { userId: 'u6', role: 'MEMBER', joinedAt: '2026-10-20' },
];

export const invites: Invite[] = [
  { id: 'i1', email: 'joana@external.co', role: 'MEMBER', status: 'PENDING', sentAt: '2026-11-10' },
];

export const labels: Label[] = [
  { id: 'l1', name: 'Design', color: 'apricot' },
  { id: 'l2', name: 'Backend', color: 'mint' },
  { id: 'l3', name: 'Research', color: 'slatey' },
  { id: 'l4', name: 'Bug', color: 'coral' },
  { id: 'l5', name: 'Frontend', color: 'sage' },
  { id: 'l6', name: 'Docs', color: 'sand' },
  { id: 'l7', name: 'Blocked', color: 'amber' },
];

export const boards: Board[] = [
  {
    id: 'b1',
    name: 'Q4 Launch — Mobile App',
    description: 'iOS + Android release for the new client portal.',
    color: 'mint',
    workspaceId: 'w1',
  },
  {
    id: 'b2',
    name: 'Brand Refresh',
    description: 'Visual identity, typography and component library.',
    color: 'apricot',
    workspaceId: 'w1',
  },
  {
    id: 'b3',
    name: 'Platform Reliability',
    description: 'Observability, on-call rotation, incident review.',
    color: 'slatey',
    workspaceId: 'w1',
  },
];

export const lists: List[] = [
  { id: 'list-1', boardId: 'b1', name: 'Backlog', color: 'slatey', position: 0 },
  { id: 'list-2', boardId: 'b1', name: 'Up Next', color: 'sand', position: 1 },
  { id: 'list-3', boardId: 'b1', name: 'In Progress', color: 'mint', position: 2 },
  { id: 'list-4', boardId: 'b1', name: 'Review', color: 'amber', position: 3 },
  { id: 'list-5', boardId: 'b1', name: 'Done', color: 'sage', position: 4 },
];

const now = new Date('2026-11-17T09:00:00Z');
const daysFromNow = (d: number) => {
  const dt = new Date(now);
  dt.setDate(dt.getDate() + d);
  return dt.toISOString();
};

export const tasks: Task[] = [
  {
    id: 't1', title: 'Define offline sync architecture',
    description: 'Draft the conflict resolution strategy for the mobile sync layer. Coordinate with Priya on the server contract.',
    listId: 'list-3', boardId: 'b1', position: 0, priority: 'HIGH',
    dueDate: daysFromNow(2), assigneeIds: ['u2', 'u6'], labelIds: ['l2'],
    createdAt: daysFromNow(-14), updatedAt: daysFromNow(-1),
    deadlineChanges: 1, stagnationDays: 2, blockedByIds: [], estimateHours: 16,
  },
  {
    id: 't2', title: 'Onboarding flow — final visual design',
    description: 'Three-screen onboarding sequence with motion notes. Submit for design review before handoff.',
    listId: 'list-3', boardId: 'b1', position: 1, priority: 'URGENT',
    dueDate: daysFromNow(-1), assigneeIds: ['u3'], labelIds: ['l1'],
    createdAt: daysFromNow(-20), updatedAt: daysFromNow(-3),
    deadlineChanges: 3, stagnationDays: 5, blockedByIds: [], estimateHours: 24,
  },
  {
    id: 't3', title: 'Push notification service integration',
    description: 'Wire APNs + FCM through the new gateway. Needs env config from infra.',
    listId: 'list-2', boardId: 'b1', position: 0, priority: 'HIGH',
    dueDate: daysFromNow(5), assigneeIds: ['u6'], labelIds: ['l2', 'l7'],
    createdAt: daysFromNow(-10), updatedAt: daysFromNow(-2),
    deadlineChanges: 0, stagnationDays: 1, blockedByIds: ['t1'], estimateHours: 12,
  },
  {
    id: 't4', title: 'Accessibility audit — navigation',
    description: 'Audit focus order, screen reader labels and reduced-motion preferences.',
    listId: 'list-4', boardId: 'b1', position: 0, priority: 'MEDIUM',
    dueDate: daysFromNow(1), assigneeIds: ['u3'], labelIds: ['l1', 'l5'],
    createdAt: daysFromNow(-8), updatedAt: daysFromNow(-1),
    deadlineChanges: 0, stagnationDays: 0, blockedByIds: [], estimateHours: 8,
  },
  {
    id: 't5', title: 'Crash report triage pipeline',
    description: 'Symbolicate, deduplicate, route to Sentry project per platform.',
    listId: 'list-1', boardId: 'b1', position: 0, priority: 'MEDIUM',
    dueDate: daysFromNow(9), assigneeIds: ['u2'], labelIds: ['l2'],
    createdAt: daysFromNow(-5), updatedAt: daysFromNow(-4),
    deadlineChanges: 0, stagnationDays: 4, blockedByIds: [], estimateHours: 10,
  },
  {
    id: 't6', title: 'Release notes draft for v1.0',
    description: 'Customer-facing release notes with screenshots. Marketing review required.',
    listId: 'list-2', boardId: 'b1', position: 1, priority: 'LOW',
    dueDate: daysFromNow(7), assigneeIds: ['u4'], labelIds: ['l6'],
    createdAt: daysFromNow(-3), updatedAt: daysFromNow(-1),
    deadlineChanges: 0, stagnationDays: 1, blockedByIds: [], estimateHours: 4,
  },
  {
    id: 't7', title: 'Biometric login spike',
    description: 'Face ID / fingerprint integration proof of concept on iOS.',
    listId: 'list-1', boardId: 'b1', position: 1, priority: 'LOW',
    dueDate: daysFromNow(14), assigneeIds: ['u6'], labelIds: ['l2', 'l5'],
    createdAt: daysFromNow(-2), updatedAt: daysFromNow(-2),
    deadlineChanges: 0, stagnationDays: 2, blockedByIds: [], estimateHours: 16,
  },
  {
    id: 't8', title: 'App Store screenshots production',
    description: 'Final 6.7" and 6.5" screenshots exported at 3x.',
    listId: 'list-4', boardId: 'b1', position: 1, priority: 'MEDIUM',
    dueDate: daysFromNow(3), assigneeIds: ['u3'], labelIds: ['l1'],
    createdAt: daysFromNow(-12), updatedAt: daysFromNow(0),
    deadlineChanges: 1, stagnationDays: 0, blockedByIds: [], estimateHours: 6,
  },
  {
    id: 't9', title: 'Analytics event taxonomy',
    description: 'Canonical event names, properties and sampling rules.',
    listId: 'list-5', boardId: 'b1', position: 0, priority: 'MEDIUM',
    dueDate: daysFromNow(-3), assigneeIds: ['u4', 'u2'], labelIds: ['l6', 'l2'],
    createdAt: daysFromNow(-30), updatedAt: daysFromNow(-3),
    deadlineChanges: 0, stagnationDays: 0, blockedByIds: [], estimateHours: 8,
  },
  {
    id: 't10', title: 'Deep linking router',
    description: 'Universal links with fallback web routes and auth gating.',
    listId: 'list-3', boardId: 'b1', position: 2, priority: 'HIGH',
    dueDate: daysFromNow(4), assigneeIds: ['u6'], labelIds: ['l5', 'l2'],
    createdAt: daysFromNow(-7), updatedAt: daysFromNow(-1),
    deadlineChanges: 2, stagnationDays: 3, blockedByIds: ['t1'], estimateHours: 14,
  },
  {
    id: 't11', title: 'Stakeholder demo prep',
    description: 'Slides + live demo script for the Nov 24 review.',
    listId: 'list-2', boardId: 'b1', position: 2, priority: 'HIGH',
    dueDate: daysFromNow(6), assigneeIds: ['u1', 'u4'], labelIds: ['l6'],
    createdAt: daysFromNow(-1), updatedAt: daysFromNow(0),
    deadlineChanges: 0, stagnationDays: 0, blockedByIds: [], estimateHours: 6,
  },
  {
    id: 't12', title: 'Push permission copy',
    description: 'Pre-prompt string and rationale screen copy.',
    listId: 'list-5', boardId: 'b1', position: 1, priority: 'LOW',
    dueDate: daysFromNow(-6), assigneeIds: ['u4'], labelIds: ['l6'],
    createdAt: daysFromNow(-25), updatedAt: daysFromNow(-6),
    deadlineChanges: 0, stagnationDays: 0, blockedByIds: [], estimateHours: 2,
  },
];

export const activity: Activity[] = [
  { id: 'a1', type: 'summary_generated', actorId: 'u1', target: 'Q4 Launch — Mobile App', detail: 'AI summary generated', timestamp: daysFromNow(-0.1) },
  { id: 'a2', type: 'task_moved', actorId: 'u3', target: 'App Store screenshots production', detail: 'Up Next → Review', timestamp: daysFromNow(-0.3) },
  { id: 'a3', type: 'deadline_changed', actorId: 'u1', target: 'Onboarding flow — final visual design', detail: 'Due date moved +2 days (3rd change)', timestamp: daysFromNow(-0.8) },
  { id: 'a4', type: 'task_completed', actorId: 'u4', target: 'Analytics event taxonomy', detail: 'Marked as Done', timestamp: daysFromNow(-1.2) },
  { id: 'a5', type: 'task_created', actorId: 'u2', target: 'Crash report triage pipeline', detail: 'Added to Backlog', timestamp: daysFromNow(-2.1) },
  { id: 'a6', type: 'assignee_added', actorId: 'u1', target: 'Deep linking router', detail: 'Assigned to Priya Nair', timestamp: daysFromNow(-2.6) },
];

// ---- Drift Radar data (deterministic signals derived from tasks) ----

export const driftSnapshot: DriftSnapshot = {
  id: 'd1',
  boardId: 'b1',
  generatedAt: daysFromNow(0),
  driftScore: 62,
  health: 'AT_RISK',
  trend: [
    { date: 'Nov 03', score: 38 },
    { date: 'Nov 06', score: 41 },
    { date: 'Nov 09', score: 47 },
    { date: 'Nov 12', score: 55 },
    { date: 'Nov 15', score: 58 },
    { date: 'Nov 17', score: 62 },
  ],
  factors: [
    {
      id: 'f1',
      category: 'overdue',
      label: 'Overdue tasks',
      severity: 'AT_RISK',
      score: 22,
      evidenceCount: 2,
      description: '2 tasks have passed their due date without completion. Both are on the critical path for the v1.0 release.',
      evidence: [
        { taskId: 't2', taskTitle: 'Onboarding flow — final visual design', assigneeName: 'Theo Okafor', metric: '1 day overdue', detail: 'Due Nov 16. Marked urgent. Blocked review handoff.' },
        { taskId: 't9', taskTitle: 'Analytics event taxonomy', assigneeName: 'Lina Sørensen', metric: '3 days overdue', detail: 'Completed late. Signal retained for trend analysis.' },
      ],
      recommendation: 'Re-baseline the onboarding flow due date or split into a parallel sub-task to unblock review.',
      aiGenerated: true,
    },
    {
      id: 'f2',
      category: 'deadline_churn',
      label: 'Repeated deadline changes',
      severity: 'WATCH',
      score: 16,
      evidenceCount: 2,
      description: '2 tasks have had their deadline moved 2+ times. Frequent churn suggests unstable scope or hidden dependencies.',
      evidence: [
        { taskId: 't2', taskTitle: 'Onboarding flow — final visual design', assigneeName: 'Theo Okafor', metric: '3 changes', detail: 'Slipped three consecutive times. Scope may be underestimated.' },
        { taskId: 't10', taskTitle: 'Deep linking router', assigneeName: 'Priya Nair', metric: '2 changes', detail: 'Blocked by offline sync architecture.' },
      ],
      recommendation: 'Convert the onboarding flow into a fixed-scope spike and protect it from further replanning this sprint.',
      aiGenerated: true,
    },
    {
      id: 'f3',
      category: 'stagnation',
      label: 'Stagnant tasks',
      severity: 'WATCH',
      score: 12,
      evidenceCount: 3,
      description: '3 tasks have not been updated in 2+ days despite sitting in active columns.',
      evidence: [
        { taskId: 't5', taskTitle: 'Crash report triage pipeline', assigneeName: 'Mara Whitfield', metric: '4 days idle', detail: 'Sitting in Backlog with no movement.' },
        { taskId: 't2', taskTitle: 'Onboarding flow — final visual design', assigneeName: 'Theo Okafor', metric: '5 days idle', detail: 'No update since last deadline change.' },
        { taskId: 't7', taskTitle: 'Biometric login spike', assigneeName: 'Priya Nair', metric: '2 days idle', detail: 'Low priority, but unowned progress.' },
      ],
      recommendation: 'Add a weekly stale-task review. Surface anything idle >5 days for explicit re-prioritization.',
      aiGenerated: false,
    },
    {
      id: 'f4',
      category: 'dependency_bottleneck',
      label: 'Dependency bottlenecks',
      severity: 'AT_RISK',
      score: 18,
      evidenceCount: 2,
      description: '2 tasks are blocked by a single upstream task. Delay there cascades across the board.',
      evidence: [
        { taskId: 't3', taskTitle: 'Push notification service integration', assigneeName: 'Priya Nair', metric: 'Blocked by 1 task', detail: 'Waiting on offline sync architecture.' },
        { taskId: 't10', taskTitle: 'Deep linking router', assigneeName: 'Priya Nair', metric: 'Blocked by 1 task', detail: 'Waiting on offline sync architecture.' },
      ],
      recommendation: 'Prioritize the offline sync architecture task; it currently gates 16+ hours of downstream work.',
      aiGenerated: true,
    },
    {
      id: 'f5',
      category: 'workload',
      label: 'Workload distribution',
      severity: 'WATCH',
      score: 9,
      evidenceCount: 2,
      description: 'One contributor holds 60% of in-progress work, creating a single point of failure.',
      evidence: [
        { taskId: 't1', taskTitle: 'Define offline sync architecture', assigneeName: 'Mara Whitfield', metric: '3 in-progress', detail: 'Lead on the board\'s critical path.' },
        { taskId: 't10', taskTitle: 'Deep linking router', assigneeName: 'Priya Nair', metric: '3 in-progress', detail: 'All blocked-by-one task.' },
      ],
      recommendation: 'Pair a second engineer on the sync architecture to de-risk the critical path.',
      aiGenerated: false,
    },
  ],
  workload: [
    { userId: 'u2', userName: 'Mara Whitfield', initials: 'MW', color: '#77B99B', openTasks: 3, overdueTasks: 0, capacity: 5 },
    { userId: 'u6', userName: 'Priya Nair', initials: 'PN', color: '#C17F5C', openTasks: 4, overdueTasks: 0, capacity: 5 },
    { userId: 'u3', userName: 'Theo Okafor', initials: 'TO', color: '#777C8E', openTasks: 2, overdueTasks: 1, capacity: 4 },
    { userId: 'u4', userName: 'Lina Sørensen', initials: 'LS', color: '#E2B65C', openTasks: 2, overdueTasks: 1, capacity: 4 },
    { userId: 'u1', userName: 'Avery Chen', initials: 'AC', color: '#D69A78', openTasks: 1, overdueTasks: 0, capacity: 3 },
  ],
  recoveryActions: [
    {
      id: 'r1',
      title: 'Unblock the sync architecture task today',
      rationale: 'It gates 16+ hours of downstream work across two tasks and is the root cause of the dependency bottleneck signal.',
      effort: 'MEDIUM',
      impact: 'HIGH',
      aiGenerated: true,
      relatedTaskIds: ['t1', 't3', 't10'],
    },
    {
      id: 'r2',
      title: 'Re-baseline the onboarding flow due date',
      rationale: 'Three deadline changes with no scope change indicate an estimate problem. A fresh baseline restores predictability.',
      effort: 'LOW',
      impact: 'MEDIUM',
      aiGenerated: true,
      relatedTaskIds: ['t2'],
    },
    {
      id: 'r3',
      title: 'Run a stale-task sweep in the next standup',
      rationale: 'Three tasks have been idle for 2+ days. A 10-minute review will either move them or formally park them.',
      effort: 'LOW',
      impact: 'LOW',
      aiGenerated: false,
      relatedTaskIds: ['t5', 't7', 't2'],
    },
  ],
  activity,
};

export const aiSummary: AISummary = {
  id: 's1',
  boardId: 'b1',
  generatedAt: daysFromNow(-0.1),
  executiveSummary:
    'The Q4 mobile launch is trending toward risk. Delivery is gated by a single upstream task — the offline sync architecture — which is blocking two high-priority items. The onboarding flow has slipped three times and is now overdue. Workload is concentrated on two engineers.',
  projectOverview:
    '12 tasks across five lists. 25% complete, 25% in progress, 25% queued for execution, 17% in review. The board has accumulated measurable drift over the past two weeks, with the drift score rising from 38 to 62.',
  completedWork: [
    'Analytics event taxonomy shipped to engineering.',
    'Push permission copy finalized and approved.',
  ],
  pendingWork: [
    'Offline sync architecture (in progress, gates 2 tasks)',
    'Onboarding flow final visual design (overdue)',
    'App Store screenshots production (in review)',
    'Deep linking router (blocked)',
  ],
  blockers: [
    'Push notification service integration blocked by sync architecture.',
    'Deep linking router blocked by sync architecture.',
    'Onboarding flow overdue and idle for 5 days.',
  ],
  priorityRecommendations: [
    { id: 'p1', title: 'Finish the offline sync architecture today', reasoning: 'Unblocks 16+ hours of downstream work and resolves the strongest dependency signal.', urgency: 'URGENT' },
    { id: 'p2', title: 'Re-baseline the onboarding flow', reasoning: 'Three deadline changes with no scope change suggest a structural estimate problem.', urgency: 'HIGH' },
    { id: 'p3', title: 'Run a stale-task sweep', reasoning: 'Three tasks have been idle for 2+ days and need explicit re-prioritization.', urgency: 'MEDIUM' },
  ],
  confidence: 0.86,
};
