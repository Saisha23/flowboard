import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { supabase } from '@/lib/supabase';

export function PasswordRecoveryPage() {
  const { loading, configured, passwordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [updated, setUpdated] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!configured || !supabase) {
      setError('Authentication is not configured. Add the Vite Supabase environment variables.');
      return;
    }
    if (!passwordRecovery) {
      setError('This password reset link is invalid or has expired. Request a new link from the sign-in page.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setUpdated(true);
  };

  if (loading) return null;

  return (
    <main className="flex min-h-screen items-center justify-center bg-porcelain px-4">
      <div className="w-full max-w-md rounded-3xl border border-midnight/10 bg-white p-8 shadow-lift">
        <Logo />
        <h1 className="mt-6 font-display text-2xl font-bold text-midnight">Set a new password</h1>
        <p className="mt-1 text-sm text-slatey">Choose a new password for your Flowboard account.</p>

        {!configured && (
          <div role="alert" className="mt-5 rounded-xl border border-amber/20 bg-amber/[0.06] px-4 py-3 text-sm text-midnight">
            Authentication requires Supabase configuration.
          </div>
        )}
        {error && (
          <div role="alert" className="mt-5 rounded-xl border border-coral/20 bg-coral/[0.06] px-4 py-3 text-sm text-coral">
            {error}
          </div>
        )}
        {updated ? (
          <div className="mt-6 space-y-4">
            <div role="status" className="rounded-xl border border-mint-300/30 bg-mint-50 px-4 py-3 text-sm text-midnight">
              Your password was updated successfully.
            </div>
            <Link to="/app" className="block">
              <Button variant="primary" size="lg" className="w-full">Continue to Flowboard</Button>
            </Link>
          </div>
        ) : passwordRecovery ? (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <label className="block">
              <span className="text-xs font-semibold text-midnight">New password</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-midnight/10 px-3 py-2.5 text-sm outline-none focus:border-mint-400"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-midnight">Confirm new password</span>
              <input
                type="password"
                required
                minLength={6}
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="mt-1.5 w-full rounded-xl border border-midnight/10 px-3 py-2.5 text-sm outline-none focus:border-mint-400"
              />
            </label>
            <Button type="submit" variant="primary" size="lg" className="w-full" disabled={submitting || !configured}>
              {submitting ? 'Updating password...' : 'Update password'}
            </Button>
          </form>
        ) : (
          <div role="alert" className="mt-6 rounded-xl border border-amber/20 bg-amber/[0.06] px-4 py-3 text-sm text-midnight">
            This password reset link is invalid or has expired. Return to sign in to request a new link.
          </div>
        )}

        <p className="mt-5 text-center text-sm text-slatey">
          <Link className="font-semibold text-midnight underline" to="/login">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
