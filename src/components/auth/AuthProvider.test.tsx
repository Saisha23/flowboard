import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

vi.mock('@/lib/supabase', () => ({
  supabaseConfigured: true,
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } },
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  },
}));

import { AuthProvider, ProtectedRoute, useAuth } from './AuthProvider';

afterEach(cleanup);

describe('protected route behavior', () => {
  it('redirects unauthenticated users to login', async () => {
    render(
      <MemoryRouter initialEntries={['/app']}>
        <AuthProvider>
          <Routes>
            <Route path="/app" element={<ProtectedRoute><div>Application</div></ProtectedRoute>} />
            <Route path="/login" element={<div>Login page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Login page')).toBeTruthy());
  });

  it('renders protected content for a restored authenticated session', async () => {
    const supabaseModule = await import('@/lib/supabase');
    vi.mocked(supabaseModule.supabase!.auth.getSession).mockResolvedValueOnce({
      data: { session: { access_token: 'test-token', user: { id: 'test-user' } } as never },
      error: null,
    });

    render(
      <MemoryRouter initialEntries={['/app']}>
        <AuthProvider>
          <Routes>
            <Route path="/app" element={<ProtectedRoute><div>Application</div></ProtectedRoute>} />
            <Route path="/login" element={<div>Login page</div>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Application')).toBeTruthy());
  });

  it('marks a PASSWORD_RECOVERY auth event for the recovery route', async () => {
    const supabaseModule = await import('@/lib/supabase');
    vi.mocked(supabaseModule.supabase!.auth.onAuthStateChange).mockImplementation((callback) => {
      callback('PASSWORD_RECOVERY', {
        user: { id: 'test-user' },
      } as never);
      return { data: { subscription: { id: 'test-subscription', callback: vi.fn(), unsubscribe: vi.fn() } } };
    });

    function RecoveryStatus() {
      const { passwordRecovery } = useAuth();
      return <div>{passwordRecovery ? 'Recovery active' : 'Recovery inactive'}</div>;
    }

    render(
      <MemoryRouter>
        <AuthProvider><RecoveryStatus /></AuthProvider>
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText('Recovery active')).toBeTruthy());
  });
});
