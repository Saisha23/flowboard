import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthProvider';

export function SignupPage() {
  const { session, loading, configured } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [confirmationRequired, setConfirmationRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (session) return <Navigate to="/app" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (!configured || !supabase) {
      setError('Authentication is not configured. Add the Vite Supabase environment variables.');
      return;
    }
    setSubmitting(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
        data: { full_name: fullName.trim() },
      },
    });
    setSubmitting(false);
    if (signUpError) {
      setError(signUpError.message);
      return;
    }
    setConfirmationRequired(!data.session);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-porcelain px-4">
      <div className="w-full max-w-md rounded-3xl border border-midnight/10 bg-white p-8 shadow-lift">
        <Logo />
        <h1 className="mt-6 font-display text-2xl font-bold text-midnight">Create your workspace</h1>
        <p className="mt-1 text-sm text-slatey">Start using Flowboard with a Supabase account.</p>

        {confirmationRequired && (
          <div role="status" className="mt-5 rounded-xl border border-mint-300/30 bg-mint-50 px-4 py-3 text-sm text-midnight">
            Check your email and confirm your account before signing in.
          </div>
        )}
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

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="text-xs font-semibold text-midnight">Full name</span>
            <input type="text" autoComplete="name" value={fullName} onChange={(event) => setFullName(event.target.value)} className="mt-1.5 w-full rounded-xl border border-midnight/10 px-3 py-2.5 text-sm outline-none focus:border-mint-400" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-midnight">Email</span>
            <input type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1.5 w-full rounded-xl border border-midnight/10 px-3 py-2.5 text-sm outline-none focus:border-mint-400" />
          </label>
          <label className="block">
            <span className="text-xs font-semibold text-midnight">Password</span>
            <input type="password" required minLength={6} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-1.5 w-full rounded-xl border border-midnight/10 px-3 py-2.5 text-sm outline-none focus:border-mint-400" />
          </label>
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={submitting || !configured}>
            {submitting ? 'Creating account...' : 'Create account'}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-slatey">
          Already have an account? <Link className="font-semibold text-midnight underline" to="/login">Sign in</Link>
        </p>
      </div>
    </main>
  );
}
