import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  app: {
    workspace: null as null | { id: string; name: string },
    boards: [] as Array<{ id: string; workspaceId: string; name: string; description: string; color: string }>,
    lists: [] as unknown[],
    tasks: [] as unknown[],
    users: [] as unknown[],
    loading: false,
    error: null,
    reloadWorkspace: vi.fn(),
  },
  createBoard: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/hooks/useApp', () => ({ useApp: () => mocks.app }));
vi.mock('@/services', () => ({ boardService: { create: mocks.createBoard } }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));

import { BoardsPage } from './BoardsPage';

function LocationDisplay() {
  const location = useLocation();
  return <span data-testid="location">{location.pathname}</span>;
}

describe('BoardsPage board creation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.app.workspace = { id: 'workspace-1', name: 'Flowboard team' };
    mocks.app.boards = [];
    mocks.app.lists = [];
    mocks.app.tasks = [];
    mocks.app.users = [];
    mocks.app.loading = false;
    mocks.app.error = null;
    mocks.app.reloadWorkspace.mockResolvedValue(undefined);
    mocks.createBoard.mockResolvedValue({
      id: 'board-new',
      workspaceId: 'workspace-1',
      name: 'Product',
      description: '',
      color: 'mint',
    });
  });

  it('opens the board form and refreshes the selected workspace after creation', async () => {
    render(
      <MemoryRouter initialEntries={['/app/boards']}>
        <Routes>
          <Route path="/app/boards" element={<BoardsPage />} />
          <Route path="/app/boards/:boardId" element={<LocationDisplay />} />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /new board/i }));
    fireEvent.change(screen.getByLabelText('Board name'), { target: { value: ' Product ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create board' }));

    await waitFor(() => {
      expect(mocks.createBoard).toHaveBeenCalledWith('workspace-1', { name: 'Product' });
      expect(mocks.app.reloadWorkspace).toHaveBeenCalledWith('workspace-1');
      expect(screen.getByTestId('location').textContent).toBe('/app/boards/board-new');
    });
  });

  it('does not submit a board without a workspace', () => {
    mocks.app.workspace = null;
    render(
      <MemoryRouter initialEntries={['/app/boards']}>
        <Routes><Route path="/app/boards" element={<BoardsPage />} /></Routes>
      </MemoryRouter>,
    );

    expect((screen.getByRole('button', { name: /new board/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(mocks.createBoard).not.toHaveBeenCalled();
  });
});
