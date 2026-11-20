import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const mocks = vi.hoisted(() => ({
  appState: {
    currentUser: null as { id: string; profileName: string | null } | null,
    workspace: null as { id: string } | null,
    loading: false,
    error: null as string | null,
    reloadWorkspace: vi.fn(),
  },
  authState: {
    user: { id: 'auth-user-id', user_metadata: { full_name: 'Saisha Chen' } } as { id: string; user_metadata: { full_name?: string } } | null,
    loading: false,
  },
  createFirst: vi.fn(),
  updateOwnFullName: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/hooks/useApp', () => ({ useApp: () => mocks.appState }));
vi.mock('@/components/auth/AuthProvider', () => ({ useAuth: () => mocks.authState }));
vi.mock('@/services', () => ({
  workspaceService: { createFirst: mocks.createFirst },
  profileService: { updateOwnFullName: mocks.updateOwnFullName },
}));
vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { getSession: mocks.getSession } },
}));

import { WorkspaceOnboardingPage } from './WorkspaceOnboardingPage';

const workspaceId = 'c32ed66f-0959-4dab-b47e-dce3f8936066';

afterEach(cleanup);

function renderOnboarding() {
  return render(
    <MemoryRouter initialEntries={['/app/onboarding']}>
      <Routes>
        <Route path="/app/onboarding" element={<WorkspaceOnboardingPage />} />
        <Route path="/app" element={<p>Dashboard</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.appState.currentUser = { id: 'auth-user-id', profileName: null };
  mocks.appState.workspace = null;
  mocks.appState.loading = false;
  mocks.appState.error = null;
  mocks.appState.reloadWorkspace.mockResolvedValue(undefined);
  mocks.authState.user = { id: 'auth-user-id', user_metadata: { full_name: 'Saisha Chen' } };
  mocks.authState.loading = false;
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: 'auth-user-id' } } },
    error: null,
  });
  mocks.createFirst.mockResolvedValue(workspaceId);
  mocks.updateOwnFullName.mockResolvedValue(undefined);
});

describe('first-workspace onboarding', () => {
  it('prefills signup metadata, updates only the own profile, creates via RPC service, and reloads by UUID', async () => {
    renderOnboarding();
    expect(screen.getByLabelText('Your full name')).toHaveValue('Saisha Chen');

    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Flowboard AI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));

    await screen.findByText('Dashboard');
    expect(mocks.updateOwnFullName).toHaveBeenCalledWith('auth-user-id', 'Saisha Chen');
    expect(mocks.createFirst).toHaveBeenCalledWith('Flowboard AI', 'flowboard-ai');
    expect(mocks.appState.reloadWorkspace).toHaveBeenCalledWith(workspaceId, true);
  });

  it('shows duplicate slug errors without claiming creation succeeded', async () => {
    mocks.appState.currentUser = { id: 'auth-user-id', profileName: 'Saisha Chen' };
    mocks.createFirst.mockRejectedValueOnce({
      code: '23505',
      message: 'duplicate key value violates unique constraint workspaces_slug_key',
    });
    renderOnboarding();

    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Flowboard AI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('workspace URL is already taken');
    expect(screen.queryByText('Dashboard')).not.toBeInTheDocument();
    expect(mocks.appState.reloadWorkspace).not.toHaveBeenCalled();
  });

  it('ignores duplicate submissions while the RPC is pending', async () => {
    mocks.appState.currentUser = { id: 'auth-user-id', profileName: 'Saisha Chen' };
    let resolveCreate!: (id: string) => void;
    mocks.createFirst.mockImplementationOnce(() => new Promise((resolve) => { resolveCreate = resolve; }));
    renderOnboarding();

    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Flowboard AI' } });
    const form = screen.getByRole('button', { name: 'Create workspace' }).closest('form');
    if (!form) throw new Error('Onboarding form was not rendered.');
    fireEvent.submit(form);
    fireEvent.submit(form);
    await waitFor(() => expect(mocks.createFirst).toHaveBeenCalledTimes(1));
    expect(mocks.createFirst).toHaveBeenCalledTimes(1);

    resolveCreate(workspaceId);
    await screen.findByText('Dashboard');
  });

  it('handles an expired session before making profile or workspace writes', async () => {
    mocks.appState.currentUser = { id: 'auth-user-id', profileName: 'Saisha Chen' };
    mocks.getSession.mockResolvedValueOnce({ data: { session: null }, error: null });
    renderOnboarding();

    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Flowboard AI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Your session expired');
    expect(mocks.createFirst).not.toHaveBeenCalled();
    expect(mocks.updateOwnFullName).not.toHaveBeenCalled();
  });

  it('does not repeat the RPC if workspace data reload fails after creation', async () => {
    mocks.appState.currentUser = { id: 'auth-user-id', profileName: 'Saisha Chen' };
    mocks.appState.reloadWorkspace.mockRejectedValueOnce(new Error('Workspace API unavailable.'));
    renderOnboarding();

    fireEvent.change(screen.getByLabelText('Workspace name'), { target: { value: 'Flowboard AI' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('creation succeeded');
    fireEvent.click(screen.getByRole('button', { name: 'Retry loading workspace' }));
    await waitFor(() => expect(mocks.appState.reloadWorkspace).toHaveBeenCalledTimes(2));
    expect(mocks.createFirst).toHaveBeenCalledTimes(1);
  });
});
