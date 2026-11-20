import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '@/types';

const mocks = vi.hoisted(() => ({
  app: {
    currentUser: { id: 'user-1', role: 'owner' },
    users: [{
      id: 'user-2',
      name: 'Saisha Shah',
      initials: 'SS',
      color: 'mint',
      avatarUrl: null,
      role: 'member',
    }],
    labels: [],
    lists: [{
      id: 'list-1',
      boardId: 'board-1',
      name: 'To do',
      position: 0,
      color: 'mint',
    }],
    tasks: [] as Task[],
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    createTask: vi.fn(),
  },
  toast: vi.fn(),
}));

vi.mock('@/hooks/useApp', () => ({ useApp: () => mocks.app }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { TaskDetailModal } from './TaskDetailModal';

function makeDraft(): Task {
  return {
    id: 'temp-draft-1',
    title: '',
    description: '',
    listId: 'list-1',
    boardId: 'board-1',
    position: 0,
    priority: 'MEDIUM',
    dueDate: null,
    completedAt: null,
    assigneeIds: [],
    labelIds: [],
    createdAt: '2026-11-20T00:00:00Z',
    updatedAt: '2026-11-20T00:00:00Z',
    deadlineChanges: 0,
    stagnationDays: 0,
    blockedByIds: [],
    estimateHours: null,
  };
}

describe('TaskDetailModal task title', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
      mocks.app.currentUser = { id: 'user-1', role: 'owner' };
    mocks.app.createTask.mockResolvedValue(undefined);
      mocks.app.updateTask.mockResolvedValue(undefined);
    mocks.app.tasks = [
      { ...makeDraft(), id: 'blocker-1', title: 'Implement API' },
      { ...makeDraft(), id: 'blocker-2', title: 'Design schema' },
      { ...makeDraft(), id: 'other-board-task', boardId: 'board-2', title: 'Other board task' },
      { ...makeDraft(), title: 'Draft self' },
    ];
  });

  it('focuses and submits the entered title with priority and assignee', async () => {
    const draft = makeDraft();
    const onClose = vi.fn();
    render(<TaskDetailModal task={draft} onClose={onClose} />);
    const titleInput = screen.getByRole('textbox', { name: 'Task title' });

    expect(document.activeElement).toBe(titleInput);
    fireEvent.change(titleInput, {
      target: { value: 'Test Atomic Task Creation' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^high$/i }));
    fireEvent.click(screen.getByRole('button', { name: /saisha/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => {
      expect(mocks.app.createTask).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Test Atomic Task Creation',
        priority: 'HIGH',
        assigneeIds: ['user-2'],
      }));
    });
    expect(mocks.toast).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Title required' }));
  });

  it('submits multiple blockers from this board and excludes itself and other boards', async () => {
    render(<TaskDetailModal task={makeDraft()} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Toggle blocker: Implement API' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Toggle blocker: Design schema' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Toggle blocker: Other board task' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Toggle blocker: Draft self' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Toggle blocker: Implement API' }));
    fireEvent.click(screen.getByRole('button', { name: 'Toggle blocker: Design schema' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Task with dependencies' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => {
      expect(mocks.app.createTask).toHaveBeenCalledWith(expect.objectContaining({
        blockedByIds: ['blocker-1', 'blocker-2'],
      }));
    });
  });

  it('shows the RPC cycle validation error instead of reporting success', async () => {
    mocks.app.createTask.mockRejectedValueOnce(new Error('This dependency would create a cycle.'));
    render(<TaskDetailModal task={makeDraft()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle blocker: Implement API' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Task title' }), {
      target: { value: 'Task with invalid dependency' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Could not save task',
        message: 'This dependency would create a cycle.',
      }));
    });
  });

  it('lets an owner update blockers and sends them with the task update', async () => {
    const task = { ...makeDraft(), id: 'task-1', title: 'Existing task' };
    render(<TaskDetailModal task={task} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle blocker: Implement API' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mocks.app.updateTask).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({ blockedByIds: ['blocker-1'] }),
      );
    });
  });

  it('lets a member update blockers', async () => {
    mocks.app.currentUser = { id: 'user-1', role: 'member' };
    const task = { ...makeDraft(), id: 'task-1', title: 'Existing task' };
    render(<TaskDetailModal task={task} onClose={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'Toggle blocker: Implement API' }).hasAttribute('disabled')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Toggle blocker: Implement API' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => {
      expect(mocks.app.updateTask).toHaveBeenCalledWith(
        'task-1',
        expect.objectContaining({ blockedByIds: ['blocker-1'] }),
      );
    });
  });

  it('keeps blocker editing unavailable to a viewer', () => {
    mocks.app.currentUser = { id: 'user-1', role: 'viewer' };
    const task = { ...makeDraft(), id: 'task-1', title: 'Existing task' };
    render(<TaskDetailModal task={task} onClose={vi.fn()} />);

    expect(screen.getByText('Dependencies are read-only for your workspace role.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Toggle blocker: Implement API' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save changes' })).toBeNull();
    expect(mocks.app.updateTask).not.toHaveBeenCalled();
  });
});
