import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthProvider';

export function LoginPage() {
  const { session, loading, configured } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (session) return <Navigate to="/app" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setNotice('');
    if (!configured || !supabase) {
      setError('Authentication is not configured. Add the Vite Supabase environment variables.');
      return;
    }
    setSubmitting(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setSubmitting(false);
    if (signInError) setError(signInError.message);
  };

  const requestPasswordReset = async () => {
    setError('');
    setNotice('');
    if (!configured || !supabase) {
      setError('Authentication is not configured. Add the Vite Supabase environment variables.');
      return;
    }
    setSubmitting(true);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSubmitting(false);
    if (resetError) {
      setError(resetError.message);
      return;
    }
    setNotice('If an account exists for that email, a password reset link is on its way.');
  };

  const from = (location.state as { from?: string } | null)?.from ?? '/app';

  return (
    <main className="flex min-h-screen items-center justify-center bg-porcelain px-4">
      <div className="w-full max-w-md rounded-3xl border border-midnight/10 bg-white p-8 shadow-lift">
        <Logo />
        <h1 className="mt-6 font-display text-2xl font-bold text-midnight">Welcome back</h1>
        <p className="mt-1 text-sm text-slatey">Sign in to continue to Flowboard.</p>

        {!configured && (
          <div className="mt-5 rounded-xl border border-amber/20 bg-amber/[0.06] px-4 py-3 text-sm text-midnight">
            Authentication requires Supabase configuration.
          </div>
        )}
        {error && (
          <div role="alert" className="mt-5 rounded-xl border border-coral/20 bg-coral/[0.06] px-4 py-3 text-sm text-coral">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="mt-5 rounded-xl border border-mint-300/30 bg-mint-50 px-4 py-3 text-sm text-midnight">
            {notice}
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="text-xs font-semibold text-midnight">Email</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-midnight/10 px-3 py-2.5 text-sm outline-none focus:border-mint-400"
            />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-midnight">Password</span>
            <input
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-midnight/10 px-3 py-2.5 text-sm outline-none focus:border-mint-400"
            />
          </label>
          <button
            type="button"
            className="text-sm font-semibold text-midnight underline"
            disabled={submitting || !email}
            onClick={requestPasswordReset}
          >
            Forgot password?
          </button>
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={submitting || !configured}>
            {submitting ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-slatey">
          New to Flowboard? <Link className="font-semibold text-midnight underline" to="/signup">Create an account</Link>
        </p>
        {from !== '/app' && <span className="hidden" aria-hidden>Requested route: {from}</span>}
      </div>
    </main>
  );
}
