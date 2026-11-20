import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  app: {
    boards: [{
      id: 'board-1',
      name: 'Product',
      description: '',
      color: 'mint',
      workspaceId: 'workspace-1',
    }],
    lists: [],
    tasks: [],
    labels: [{
      id: 'label-existing',
      boardId: 'board-1',
      name: 'Bug',
      color: 'coral',
    }],
    users: [],
    currentUser: { id: 'user-1', role: 'member' },
    updateTask: vi.fn(),
    loading: false,
    error: null,
    workspace: { id: 'workspace-1', name: 'Flowboard team' },
    reloadWorkspace: vi.fn(),
  },
  createList: vi.fn(),
  createLabel: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/hooks/useApp', () => ({ useApp: () => mocks.app }));
vi.mock('@/services', () => ({
  boardService: { update: vi.fn(), remove: vi.fn() },
  listService: { create: mocks.createList },
  labelService: { create: mocks.createLabel },
}));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock('@/components/board/TaskCard', () => ({ TaskCard: () => null }));
vi.mock('@/components/board/TaskDetailModal', () => ({ TaskDetailModal: () => null }));

import { BoardPage } from './BoardPage';

describe('BoardPage list creation', () => {
  afterEach(cleanup);

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.app.lists = [];
    mocks.app.reloadWorkspace.mockResolvedValue(undefined);
    mocks.createLabel.mockResolvedValue({
      id: 'label-new',
      boardId: 'board-1',
      name: 'Research',
      color: 'mint',
    });
    mocks.createList.mockResolvedValue({
      id: 'list-1',
      boardId: 'board-1',
      name: 'To do',
      position: 0,
      color: 'slatey',
    });
  });

  it('creates a list and reloads the board workspace state', async () => {
    render(
      <MemoryRouter initialEntries={['/app/boards/board-1']}>
        <Routes><Route path="/app/boards/:boardId" element={<BoardPage />} /></Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Add list' }));
    fireEvent.change(screen.getByLabelText('List name'), { target: { value: ' To do ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create list' }));

    await waitFor(() => {
      expect(mocks.createList).toHaveBeenCalledWith('board-1', 'To do');
      expect(mocks.app.reloadWorkspace).toHaveBeenCalledWith('workspace-1');
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'List created' }));
    });
  });

  it('shows board labels, creates a label and reloads workspace data', async () => {
    render(
      <MemoryRouter initialEntries={['/app/boards/board-1']}>
        <Routes><Route path="/app/boards/:boardId" element={<BoardPage />} /></Routes>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Manage Labels' }));
    expect(screen.getByText('Bug')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Label name'), { target: { value: ' Research ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create label' }));

    await waitFor(() => {
      expect(mocks.createLabel).toHaveBeenCalledWith('board-1', 'Research');
      expect(mocks.app.reloadWorkspace).toHaveBeenCalledWith('workspace-1');
      expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Label created' }));
    });
  });
});
