import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const profileQuery = {
    update: vi.fn(),
    eq: vi.fn(),
  };
  profileQuery.update.mockReturnValue(profileQuery);
  return {
    rpc: vi.fn(),
    from: vi.fn(() => profileQuery),
    profileQuery,
  };
});

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc: mocks.rpc, from: mocks.from },
}));

import { profileService, workspaceService } from './index';

const workspaceId = 'c32ed66f-0959-4dab-b47e-dce3f8936066';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profileQuery.update.mockReturnValue(mocks.profileQuery);
  mocks.profileQuery.eq.mockResolvedValue({ error: null });
});

describe('first workspace services', () => {
  it('calls the existing create_workspace RPC and validates its UUID result', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: workspaceId, error: null });

    await expect(workspaceService.createFirst('Flowboard AI', 'flowboard-ai')).resolves.toBe(workspaceId);

    expect(mocks.rpc).toHaveBeenCalledWith('create_workspace', {
      p_name: 'Flowboard AI',
      p_slug: 'flowboard-ai',
    });
  });

  it('surfaces RPC errors and rejects malformed workspace IDs', async () => {
    const duplicateError = { code: '23505', message: 'duplicate workspace slug' };
    mocks.rpc.mockResolvedValueOnce({ data: null, error: duplicateError });
    await expect(workspaceService.createFirst('Flowboard AI', 'flowboard-ai')).rejects.toBe(duplicateError);

    mocks.rpc.mockResolvedValueOnce({ data: 'not-a-uuid', error: null });
    await expect(workspaceService.createFirst('Flowboard AI', 'flowboard-ai')).rejects.toThrow('invalid workspace ID');
  });

  it('updates only the authenticated profile id', async () => {
    await profileService.updateOwnFullName('auth-user-id', 'Saisha Chen');

    expect(mocks.from).toHaveBeenCalledWith('profiles');
    expect(mocks.profileQuery.update).toHaveBeenCalledWith({ full_name: 'Saisha Chen' });
    expect(mocks.profileQuery.eq).toHaveBeenCalledWith('id', 'auth-user-id');
  });

  it('surfaces profile RLS update errors', async () => {
    const rlsError = new Error('Profile update denied.');
    mocks.profileQuery.eq.mockResolvedValueOnce({ error: rlsError });
    await expect(profileService.updateOwnFullName('auth-user-id', 'Saisha Chen'))
      .rejects.toBe(rlsError);
  });
});
