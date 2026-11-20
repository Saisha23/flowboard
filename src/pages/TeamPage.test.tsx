import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { appData, toast, listMemberships, listInvites, setRole, invite, revokeInvite } = vi.hoisted(() => ({
  appData: {
    users: [] as Array<{ id: string; name: string; role: string }>,
    currentUser: null as { id: string; role: string } | null,
    workspace: null as { id: string; name: string } | null,
    loading: true,
    error: null as string | null,
  },
  toast: vi.fn(),
  listMemberships: vi.fn(),
  listInvites: vi.fn(),
  setRole: vi.fn(),
  invite: vi.fn(),
  revokeInvite: vi.fn(),
}));

vi.mock('@/hooks/useApp', () => ({ useApp: () => appData }));
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }));
vi.mock('@/services', () => ({
  membershipService: { list: listMemberships, invites: listInvites, setRole, invite, revokeInvite },
}));

import { TeamPage } from './TeamPage';

afterEach(() => cleanup());

beforeEach(() => {
  appData.users = [];
  appData.currentUser = null;
  appData.workspace = null;
  appData.loading = true;
  appData.error = null;
  listMemberships.mockReset().mockResolvedValue([]);
  listInvites.mockReset().mockResolvedValue([]);
  toast.mockReset();
});

describe('TeamPage data states', () => {
  it('shows loading instead of a zero-member result while app data is pending', () => {
    render(<TeamPage />);

    expect(screen.getByRole('status').textContent).toContain('Loading workspace members');
    expect(screen.queryByText('0 total')).toBeNull();
    expect(listMemberships).not.toHaveBeenCalled();
  });

  it('shows API errors instead of a successful empty roster', () => {
    appData.loading = false;
    appData.error = 'Could not load workspace data.';
    render(<TeamPage />);

    expect(screen.getByRole('alert').textContent).toContain('Could not load workspace data.');
    expect(screen.queryByText('0 total')).toBeNull();
    expect(listMemberships).not.toHaveBeenCalled();
  });

  it('distinguishes no workspace membership from an API failure', () => {
    appData.loading = false;
    render(<TeamPage />);

    expect(screen.getByRole('status').textContent).toContain('You do not have access to a workspace yet');
    expect(screen.queryByText('0 total')).toBeNull();
    expect(listMemberships).not.toHaveBeenCalled();
  });

  it('surfaces a member-role request failure', async () => {
    appData.loading = false;
    appData.workspace = { id: 'workspace-1', name: 'Workspace' };
    appData.users = [{ id: 'user-1', name: 'User', role: 'owner' }];
    listMemberships.mockRejectedValueOnce(new Error('Membership request failed.'));
    render(<TeamPage />);

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toContain('Membership request failed.');
    });
  });
});
