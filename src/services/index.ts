// Flowboard AI — service layer
// Mock-backed during frontend development. Swap implementations to FastAPI/Supabase later.
// Components must never import mockData directly — they go through these services.

import {
  activity as mockActivity,
  aiSummary as mockAISummary,
  boards as mockBoards,
  driftSnapshot as mockDriftSnapshot,
  invites as mockInvites,
  labels as mockLabels,
  lists as mockLists,
  memberships as mockMemberships,
  tasks as mockTasks,
  users as mockUsers,
  workspaces as mockWorkspaces,
  currentUser as mockCurrentUser,
} from './mockData';
import type {
  AISummary,
  Board,
  DriftSnapshot,
  Invite,
  Label,
  List,
  Membership,
  Task,
  User,
  Workspace,
} from '@/types';

const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// In-memory mutable copies so the UI feels real
let _workspaces = [...mockWorkspaces];
let _boards = [...mockBoards];
let _lists = [...mockLists];
let _tasks = [...mockTasks];
let _labels = [...mockLabels];
let _users = [...mockUsers];
let _memberships = [...mockMemberships];
let _invites = [...mockInvites];
let _activity = [...mockActivity];
let _summary = { ...mockAISummary };

export const workspaceService = {
  async list(): Promise<Workspace[]> {
    await delay(120);
    return _workspaces;
  },
  async current(): Promise<Workspace> {
    await delay(40);
    return _workspaces[0];
  },
  async switch(id: string): Promise<Workspace> {
    await delay(80);
    const ws = _workspaces.find((w) => w.id === id) ?? _workspaces[0];
    return ws;
  },
};

export const boardService = {
  async list(): Promise<Board[]> {
    await delay(120);
    return _boards;
  },
  async get(id: string): Promise<Board | undefined> {
    await delay(80);
    return _boards.find((b) => b.id === id);
  },
};

export const listService = {
  async forBoard(boardId: string): Promise<List[]> {
    await delay(100);
    return _lists.filter((l) => l.boardId === boardId).sort((a, b) => a.position - b.position);
  },
};

export const taskService = {
  async forBoard(boardId: string): Promise<Task[]> {
    await delay(140);
    return _tasks.filter((t) => t.boardId === boardId).sort((a, b) => a.position - b.position);
  },
  async all(): Promise<Task[]> {
    await delay(140);
    return [..._tasks];
  },
  async update(id: string, patch: Partial<Task>): Promise<Task> {
    await delay(120);
    _tasks = _tasks.map((t) => (t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t));
    const updated = _tasks.find((t) => t.id === id)!;
    return updated;
  },
  async create(task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>): Promise<Task> {
    await delay(160);
    const newTask: Task = {
      ...task,
      id: `t${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _tasks = [..._tasks, newTask];
    return newTask;
  },
  async remove(id: string): Promise<void> {
    await delay(100);
    _tasks = _tasks.filter((t) => t.id !== id);
  },
};

export const labelService = {
  async list(): Promise<Label[]> {
    await delay(60);
    return _labels;
  },
};

export const userService = {
  async list(): Promise<User[]> {
    await delay(80);
    return _users;
  },
  async current(): Promise<User> {
    await delay(40);
    return mockCurrentUser;
  },
};

export const membershipService = {
  async list(): Promise<Membership[]> {
    await delay(80);
    return _memberships;
  },
  async setRole(userId: string, role: Membership['role']): Promise<void> {
    await delay(120);
    _memberships = _memberships.map((m) => (m.userId === userId ? { ...m, role } : m));
  },
  async invite(email: string, role: Membership['role']): Promise<Invite> {
    await delay(200);
    const invite: Invite = {
      id: `i${Date.now()}`,
      email,
      role,
      status: 'PENDING',
      sentAt: new Date().toISOString(),
    };
    _invites = [..._invites, invite];
    return invite;
  },
  async invites(): Promise<Invite[]> {
    await delay(80);
    return _invites;
  },
  async revokeInvite(id: string): Promise<void> {
    await delay(100);
    _invites = _invites.filter((i) => i.id !== id);
  },
};

export const driftService = {
  async snapshot(boardId: string): Promise<DriftSnapshot> {
    await delay(500);
    void boardId;
    return mockDriftSnapshot;
  },
};

export const summaryService = {
  async get(boardId: string): Promise<AISummary | null> {
    await delay(200);
    void boardId;
    return _summary;
  },
  async generate(boardId: string): Promise<AISummary> {
    await delay(2200); // simulate AI latency
    void boardId;
    _summary = { ...mockAISummary, generatedAt: new Date().toISOString() };
    return _summary;
  },
};

export const activityService = {
  async recent(): Promise<typeof _activity> {
    await delay(120);
    return [..._activity];
  },
};
