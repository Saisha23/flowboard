import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));

import { apiFetch } from '@/lib/api';
import { boardService, labelService, listService, taskService, userService } from './index';
import { roleMeta } from '@/lib/utils';

const boardId = '10000000-0000-0000-0000-000000000001';
const workspaceId = '20000000-0000-0000-0000-000000000001';
const listId = '30000000-0000-0000-0000-000000000001';
const taskId = '40000000-0000-0000-0000-000000000001';
const blockerIds = [
  '50000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000002',
];

beforeEach(() => vi.clearAllMocks());

describe('Existing-schema services', () => {
  it('exposes the supported app roles without MANAGER', () => {
    expect(Object.keys(roleMeta)).toEqual(expect.arrayContaining(['owner', 'member', 'viewer']));
    expect(roleMeta).not.toHaveProperty('ADMIN');
    expect(roleMeta).not.toHaveProperty('MANAGER');
    expect(roleMeta).not.toHaveProperty('OWNER');
  });

  it('creates a board without sending a nonexistent color column', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: boardId,
      workspace_id: workspaceId,
      name: 'Launch',
      description: '',
      color: 'mint',
      created_at: '2026-11-18T00:00:00Z',
      updated_at: '2026-11-18T00:00:00Z',
    }), { status: 201 }));

    await boardService.create(workspaceId, { name: 'Launch' });
    const request = vi.mocked(apiFetch).mock.calls[0];
    expect(request[0]).toBe('/boards');
    expect(JSON.parse(String(request[1]?.body))).toEqual({
      workspace_id: workspaceId,
      name: 'Launch',
      description: '',
    });
  });

  it('loads board_lists with actual UUIDs and positions', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify([
      { id: listId, board_id: boardId, name: 'In progress', kind: 'active', position: 2 },
    ]), { status: 200 }));

    const lists = await listService.forBoard(boardId);
    expect(apiFetch).toHaveBeenCalledWith(`/boards/${boardId}/lists`);
    expect(lists[0]).toMatchObject({ id: listId, boardId, name: 'In progress', position: 2 });
  });

  it('creates a board list through the authenticated board endpoint', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: listId,
      board_id: boardId,
      name: 'To do',
      kind: 'active',
      position: 0,
      color: 'slatey',
    }), { status: 201 }));

    await expect(listService.create(boardId, 'To do')).resolves.toMatchObject({
      id: listId,
      boardId,
      name: 'To do',
      position: 0,
    });
    expect(apiFetch).toHaveBeenCalledWith(`/boards/${boardId}/lists`, {
      method: 'POST',
      body: JSON.stringify({ name: 'To do' }),
    });
  });

  it('loads board labels from the existing labels table API', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: boardId, workspace_id: workspaceId, name: 'Launch', description: '', color: 'mint' },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { id: listId, name: 'Customer research', color: 'coral' },
      ]), { status: 200 }));
    const labels = await labelService.list(workspaceId);
    expect(apiFetch).toHaveBeenNthCalledWith(2, `/boards/${boardId}/labels`);
    expect(labels).toEqual([{
      id: listId,
      boardId,
      name: 'Customer research',
      color: 'coral',
      sourceColor: 'coral',
    }]);
  });

  it('creates a board label without sending unverified columns', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: 'label-1',
      board_id: boardId,
      name: 'Research',
      color: 'mint',
    }), { status: 201 }));

    await expect(labelService.create(boardId, 'Research')).resolves.toEqual({
      id: 'label-1',
      boardId,
      name: 'Research',
      color: 'mint',
      sourceColor: 'mint',
    });
    expect(apiFetch).toHaveBeenCalledWith(`/boards/${boardId}/labels`, {
      method: 'POST',
      body: JSON.stringify({ name: 'Research' }),
    });
  });

  it('maps profiles.full_name and avatar_url without assuming extra profile columns', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: '70000000-0000-0000-0000-000000000001',
        email: 'rae@example.com',
        profile: { id: '70000000-0000-0000-0000-000000000001', full_name: 'Rae Doe', avatar_url: 'https://storage.example/avatar.png' },
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { user_id: '70000000-0000-0000-0000-000000000001', role: 'member' },
      ]), { status: 200 }));
    const user = await userService.current(workspaceId);
    expect(user.name).toBe('Rae Doe');
    expect(user.profileName).toBe('Rae Doe');
    expect(user.initials).toBe('RD');
    expect(user.avatarUrl).toBe('https://storage.example/avatar.png');
    expect(user.role).toBe('member');
  });

  it('uses a neutral identity when the profile has no full_name', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: '70000000-0000-0000-0000-000000000001',
      email: 'account@example.com',
      profile: { id: '70000000-0000-0000-0000-000000000001', full_name: null, avatar_url: null },
    }), { status: 200 }));

    const user = await userService.current(null);
    expect(user.name).toBe('Account');
    expect(user.profileName).toBeNull();
    expect(user.role).toBe('member');
    expect(user.avatarUrl).toBeNull();
  });

  it('writes relationship arrays without fictional task columns', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: taskId,
      board_id: boardId,
      list_id: listId,
      title: 'Test Atomic Task Creation',
      description: '',
      status: 'TODO',
      priority: 'HIGH',
      position: 0,
      due_date: null,
      completed_at: null,
      assignee_id: null,
      assignee_ids: [],
      label_ids: [],
      blocked_by_ids: blockerIds,
      deadline_changes: 0,
      stagnation_days: 0,
      estimate_hours: null,
      created_at: '2026-11-18T00:00:00Z',
      updated_at: '2026-11-18T00:00:00Z',
    }), { status: 201 }));

    await taskService.create({
      title: 'Test Atomic Task Creation',
      description: '',
      listId,
      boardId,
      position: 0,
      priority: 'HIGH',
      dueDate: null,
      completedAt: null,
      assigneeIds: [],
      labelIds: [],
      deadlineChanges: 0,
      stagnationDays: 0,
      blockedByIds: blockerIds,
      estimateHours: null,
    });

    const body = JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body));
    expect(body).toMatchObject({ title: 'Test Atomic Task Creation' });
    expect(body.list_id).toBe(listId);
    expect(body.blocked_by_ids).toEqual(blockerIds);
    expect(body).toHaveProperty('assignee_ids');
    expect(body).not.toHaveProperty('status');
    expect(body).not.toHaveProperty('assignee_id');
    expect(body).not.toHaveProperty('deadline_changes');
  });

  it('maps lowercase database priorities to supported task priorities', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify(
      ['low', 'medium', 'high', 'critical'].map((priority, index) => ({
        id: `task-${index}`,
        board_id: boardId,
        list_id: listId,
        title: `Task ${index}`,
        priority,
        position: index,
        due_date: null,
        completed_at: null,
        assignee_ids: [],
        label_ids: [],
        blocked_by_ids: [],
        created_at: '2026-11-18T00:00:00Z',
        updated_at: '2026-11-18T00:00:00Z',
      })),
    ), { status: 200 }));

    const tasks = await taskService.forBoard(boardId);
    expect(tasks.map((task) => task.priority)).toEqual(['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
  });

  it('sends replacement blockers through the existing task update endpoint', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: taskId,
      board_id: boardId,
      list_id: listId,
      title: 'Update dependencies',
      description: '',
      priority: 'medium',
      position: 0,
      due_date: null,
      completed_at: null,
      assignee_ids: [],
      label_ids: [],
      blocked_by_ids: blockerIds,
      created_at: '2026-11-18T00:00:00Z',
      updated_at: '2026-11-18T00:00:00Z',
    }), { status: 200 }));

    await taskService.update(taskId, { blockedByIds: blockerIds });

    const [url, options] = vi.mocked(apiFetch).mock.calls[0];
    expect(url).toBe(`/tasks/${taskId}`);
    expect(options?.method).toBe('PATCH');
    expect(JSON.parse(String(options?.body))).toEqual({ blocked_by_ids: blockerIds });
  });

  it('updates task completion through completed_at, not a status column', async () => {
    vi.mocked(apiFetch).mockResolvedValueOnce(new Response(JSON.stringify({
      id: taskId, board_id: boardId, list_id: listId, title: 'Done', description: '',
      status: 'DONE', priority: 'HIGH', position: 0, due_date: null,
      completed_at: '2026-11-18T00:00:00Z', assignee_ids: [], label_ids: [],
      blocked_by_ids: [], deadline_changes: 0, stagnation_days: 0,
      estimate_hours: null, created_at: '2026-11-18T00:00:00Z', updated_at: '2026-11-18T00:00:00Z',
    }), { status: 200 }));
    await taskService.update(taskId, { completedAt: '2026-11-18T00:00:00Z' });
    const body = JSON.parse(String(vi.mocked(apiFetch).mock.calls[0][1]?.body));
    expect(body).toEqual({ completed_at: '2026-11-18T00:00:00Z' });
  });
});
