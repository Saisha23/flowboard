import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

const { updateUser } = vi.hoisted(() => ({
  updateUser: vi.fn(async () => ({ error: null })),
}));

vi.mock('@/components/auth/AuthProvider', () => ({
  useAuth: () => ({ loading: false, configured: true, passwordRecovery: true }),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { auth: { updateUser } },
}));

import { PasswordRecoveryPage } from './PasswordRecoveryPage';

afterEach(() => {
  cleanup();
  updateUser.mockClear();
});

describe('password recovery page', () => {
  it('updates the password and confirms success', async () => {
    render(<MemoryRouter><PasswordRecoveryPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'new-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    await waitFor(() => expect(updateUser).toHaveBeenCalledWith({ password: 'new-password' }));
    expect((await screen.findByRole('status')).textContent).toContain('updated successfully');
  });

  it('rejects mismatched passwords without sending an update', async () => {
    render(<MemoryRouter><PasswordRecoveryPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'different-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update password' }));

    expect((await screen.findByRole('alert')).textContent).toContain('passwords do not match');
    expect(updateUser).not.toHaveBeenCalled();
  });
});
