import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const { resetPasswordForEmail } = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({ session: null, loading: false, configured: true }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { resetPasswordForEmail } },
}));

import { LoginPage } from './LoginPage';

afterEach(() => {
  cleanup();
  resetPasswordForEmail.mockClear();
});

describe('login password recovery request', () => {
  it('sends a reset email to the registered callback route', async () => {
    render(<MemoryRouter><LoginPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    await waitFor(() => {
      expect(resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
        redirectTo: `${window.location.origin}/reset-password`,
      });
    });
    expect((await screen.findByRole('status')).textContent).toContain('password reset link');
  });
});
