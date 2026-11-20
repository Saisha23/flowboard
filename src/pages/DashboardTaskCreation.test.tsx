import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

const state = vi.hoisted(() => ({
  app: {
    currentUser: {
      id: 'user-1',
      name: 'Test User',
      email: 'user@example.com',
      initials: 'TU',
      color: '#B8E4D0',
      role: 'owner' as const,
      title: '',
    },
    users: [],
    tasks: [],
    boards: [{
      id: 'board-1',
      name: 'Product',
      description: '',
      color: 'mint' as const,
      workspaceId: 'workspace-1',
    }],
    lists: [{
      id: 'list-1',
      boardId: 'board-1',
      name: 'To do',
      color: 'mint' as const,
      position: 0,
    }],
    labels: [],
    workspace: { id: 'workspace-1', name: 'Workspace', plan: 'FREE', color: '#B8E4D0' },
    loading: false,
    error: null,
    updateTask: vi.fn(),
    createTask: vi.fn(),
    deleteTask: vi.fn(),
  },
  recentActivity: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/hooks/useApp', () => ({ useApp: () => state.app }));
vi.mock('@/services', () => ({
  activityService: { recent: state.recentActivity },
  boardService: { update: vi.fn(), remove: vi.fn() },
}));
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast: state.toast }),
}));

import { BoardPage } from './BoardPage';
import { DashboardPage } from './DashboardPage';

function CurrentPath() {
  const location = useLocation();
  return <output data-testid="current-path">{location.pathname}</output>;
}

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={['/app']}>
      <CurrentPath />
      <Routes>
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/app/boards/:boardId" element={<BoardPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  state.recentActivity.mockResolvedValue([]);
  state.app.createTask.mockResolvedValue(undefined);
});

afterEach(cleanup);

describe('dashboard task creation navigation', () => {
  it('opens the existing task form from New task and submits through AppProvider', async () => {
    renderDashboard();

    fireEvent.click(screen.getByRole('button', { name: 'New task' }));

    expect(await screen.findByRole('dialog', { name: 'Create task' })).toBeTruthy();
    expect(screen.getByTestId('current-path').textContent).toBe('/app/boards/board-1');

    fireEvent.change(screen.getByPlaceholderText('Task title'), { target: { value: 'Ship the fix' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create task' }));

    await waitFor(() => {
      expect(state.app.createTask).toHaveBeenCalledWith(expect.objectContaining({
        title: 'Ship the fix',
        boardId: 'board-1',
        listId: 'list-1',
      }));
    });
  });

  it('opens the same task form from the dashboard quick action', async () => {
    renderDashboard();

    fireEvent.click(screen.getByRole('link', { name: /Create a task/i }));

    expect(await screen.findByRole('dialog', { name: 'Create task' })).toBeTruthy();
    expect(screen.getByTestId('current-path').textContent).toBe('/app/boards/board-1');
  });
});
