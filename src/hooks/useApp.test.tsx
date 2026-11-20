import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { User } from '@/types';
import { useState } from 'react';

const { authState, services } = vi.hoisted(() => ({
  authState: { loading: true, user: null as { id: string } | null },
  services: {
    listWorkspaces: vi.fn(),
    listUsers: vi.fn(),
    currentUser: vi.fn(),
    listBoards: vi.fn(),
    listLabels: vi.fn(),
    listsForBoard: vi.fn(),
    tasksForBoard: vi.fn(),
    updateTask: vi.fn(),
    createTask: vi.fn(),
    removeTask: vi.fn(),
    switchWorkspace: vi.fn(),
  },
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => authState,
}));

vi.mock('@/services', () => ({
  workspaceService: { list: services.listWorkspaces, switch: services.switchWorkspace },
  userService: { list: services.listUsers, current: services.currentUser },
  boardService: { list: services.listBoards },
  labelService: { list: services.listLabels },
  listService: { forBoard: services.listsForBoard },
  taskService: {
    forBoard: services.tasksForBoard,
    update: services.updateTask,
    create: services.createTask,
    remove: services.removeTask,
  },
}));

import { AppProvider, useApp } from './useApp';

function makeUser(id: string): User {
  return {
    id,
    name: `User ${id}`,
    email: `${id}@example.com`,
    initials: 'U',
    color: '#B8E4D0',
    role: 'owner',
    title: '',
    avatarUrl: null,
  };
}

function AppDataSnapshot() {
  const { currentUser, users, workspaces, workspace, boards, loading, error, reloadWorkspace } = useApp();
  const [reloadError, setReloadError] = useState<string | null>(null);
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="current-user">{currentUser?.id ?? 'none'}</span>
      <span data-testid="current-role">{currentUser?.role ?? 'none'}</span>
      <span data-testid="users">{users.length}</span>
      <span data-testid="workspaces">{workspaces.length}</span>
      <span data-testid="workspace">{workspace?.id ?? 'none'}</span>
      <span data-testid="error">{error ?? 'none'}</span>
      <span data-testid="boards">{boards.map((board) => board.id).join(',')}</span>
      <span data-testid="reload-error">{reloadError ?? 'none'}</span>
      <button onClick={() => void reloadWorkspace('workspace-new', true).catch((cause) => setReloadError(cause.message))}>Reload new workspace</button>
    </div>
  );
}

function renderProvider() {
  return render(<AppProvider><AppDataSnapshot /></AppProvider>);
}

function setDefaultResponses() {
  services.listWorkspaces.mockResolvedValue([{ id: 'workspace-1', name: 'Workspace', plan: 'FREE', color: '#B8E4D0' }]);
  services.listUsers.mockResolvedValue([]);
  services.currentUser.mockImplementation(async () => makeUser(authState.user?.id ?? 'unknown'));
  services.listBoards.mockResolvedValue([]);
  services.listLabels.mockResolvedValue([]);
  services.listsForBoard.mockResolvedValue([]);
  services.tasksForBoard.mockResolvedValue([]);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  authState.loading = true;
  authState.user = null;
  setDefaultResponses();
});

describe('AppProvider authentication lifecycle', () => {
  it('waits for session restoration before loading application data', async () => {
    const view = renderProvider();
    expect(screen.getByTestId('loading').textContent).toBe('true');
    expect(services.listWorkspaces).not.toHaveBeenCalled();

    act(() => {
      authState.loading = false;
      authState.user = { id: 'restored-user' };
    });
    view.rerender(<AppProvider><AppDataSnapshot /></AppProvider>);

    await waitFor(() => expect(screen.getByTestId('current-user').textContent).toBe('restored-user'));
    expect(services.listWorkspaces).toHaveBeenCalledTimes(1);
    expect(services.listUsers).toHaveBeenCalledWith('workspace-1');

    act(() => {
      authState.user = { id: 'restored-user' };
    });
    view.rerender(<AppProvider><AppDataSnapshot /></AppProvider>);
    expect(services.listWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('does not load workspace data before sign-in, then loads after sign-in', async () => {
    authState.loading = false;
    const view = renderProvider();
    expect(services.listWorkspaces).not.toHaveBeenCalled();
    expect(screen.getByTestId('current-user').textContent).toBe('none');

    act(() => {
      authState.user = { id: 'signed-in-user' };
    });
    view.rerender(<AppProvider><AppDataSnapshot /></AppProvider>);

    await waitFor(() => expect(screen.getByTestId('current-user').textContent).toBe('signed-in-user'));
    expect(services.listWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('distinguishes no workspace membership from a failed workspace request', async () => {
    authState.loading = false;
    authState.user = { id: 'signed-in-user' };
    services.listWorkspaces.mockResolvedValueOnce([]);
    const view = renderProvider();

    await waitFor(() => {
      expect(screen.getByTestId('current-user').textContent).toBe('signed-in-user');
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('workspaces').textContent).toBe('0');
    expect(screen.getByTestId('error').textContent).toBe('none');
    expect(services.listUsers).toHaveBeenCalledWith(null);
    view.unmount();

    services.listWorkspaces.mockRejectedValueOnce(new Error('401 Unauthorized'));
    renderProvider();
    await waitFor(() => {
      expect(screen.getByTestId('error').textContent).toBe('401 Unauthorized');
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('workspaces').textContent).toBe('0');
  });

  it('clears user-specific data on sign-out without another API request', async () => {
    authState.loading = false;
    authState.user = { id: 'signed-in-user' };
    services.listUsers.mockResolvedValue([makeUser('signed-in-user')]);
    const view = renderProvider();
    await waitFor(() => expect(screen.getByTestId('current-user').textContent).toBe('signed-in-user'));
    expect(screen.getByTestId('workspaces').textContent).toBe('1');
    expect(screen.getByTestId('users').textContent).toBe('1');

    act(() => {
      authState.user = null;
    });
    view.rerender(<AppProvider><AppDataSnapshot /></AppProvider>);

    await waitFor(() => {
      expect(screen.getByTestId('current-user').textContent).toBe('none');
      expect(screen.getByTestId('workspaces').textContent).toBe('0');
      expect(screen.getByTestId('users').textContent).toBe('0');
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(services.listWorkspaces).toHaveBeenCalledTimes(1);
  });

  it('ignores a stale response after switching authenticated users', async () => {
    authState.loading = false;
    authState.user = { id: 'first-user' };
    let resolveFirst!: (user: User) => void;
    let resolveSecond!: (user: User) => void;
    services.currentUser
      .mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; }))
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
    const view = renderProvider();
    await waitFor(() => expect(services.currentUser).toHaveBeenCalledTimes(1));

    act(() => {
      authState.user = { id: 'second-user' };
    });
    view.rerender(<AppProvider><AppDataSnapshot /></AppProvider>);
    await waitFor(() => expect(services.currentUser).toHaveBeenCalledTimes(2));

    await act(async () => resolveSecond(makeUser('second-user')));
    await waitFor(() => expect(screen.getByTestId('current-user').textContent).toBe('second-user'));
    await act(async () => resolveFirst(makeUser('first-user')));
    expect(screen.getByTestId('current-user').textContent).toBe('second-user');
  });

  it('reloads a created workspace, its boards, and its lowercase owner membership by RPC id', async () => {
    authState.loading = false;
    authState.user = { id: 'signed-in-user' };
    services.listWorkspaces.mockResolvedValueOnce([]);
    services.switchWorkspace.mockResolvedValueOnce({
      id: 'workspace-new',
      name: 'Flowboard AI',
      plan: 'FREE',
      color: '#B8E4D0',
    });
    services.listBoards.mockResolvedValueOnce([{
      id: 'board-new',
      workspaceId: 'workspace-new',
      name: 'Launch',
      description: '',
      color: 'mint',
    }]);
    services.listUsers
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        ...makeUser('signed-in-user'),
        role: 'owner',
      }]);

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    fireEvent.click(screen.getByRole('button', { name: 'Reload new workspace' }));

    await waitFor(() => {
      expect(screen.getByTestId('workspaces').textContent).toBe('1');
      expect(screen.getByTestId('boards').textContent).toBe('board-new');
      expect(screen.getByTestId('current-user').textContent).toBe('signed-in-user');
      expect(screen.getByTestId('current-role').textContent).toBe('owner');
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(services.switchWorkspace).toHaveBeenCalledWith('workspace-new');
    expect(services.listUsers).toHaveBeenLastCalledWith('workspace-new');
    expect(screen.getByTestId('error').textContent).toBe('none');
  });

  it('does not publish a workspace unless the caller is returned as its owner', async () => {
    authState.loading = false;
    authState.user = { id: 'signed-in-user' };
    services.listWorkspaces.mockResolvedValueOnce([]);
    services.switchWorkspace.mockResolvedValueOnce({
      id: 'workspace-new',
      name: 'Flowboard AI',
      plan: 'FREE',
      color: '#B8E4D0',
    });
    services.listUsers
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{
        ...makeUser('signed-in-user'),
        role: 'member',
      }]);

    renderProvider();
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    fireEvent.click(screen.getByRole('button', { name: 'Reload new workspace' }));

    await waitFor(() => {
      expect(screen.getByTestId('reload-error').textContent).toContain('owner membership could not be verified');
      expect(screen.getByTestId('loading').textContent).toBe('false');
    });
    expect(screen.getByTestId('workspace').textContent).toBe('none');
    expect(screen.getByTestId('boards').textContent).toBe('');
  });
});
