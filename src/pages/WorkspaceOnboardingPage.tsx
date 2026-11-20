import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/components/auth/AuthProvider';
import { useApp } from '@/hooks/useApp';
import { supabase } from '@/lib/supabase';
import { slugifyWorkspaceName, validateWorkspaceName } from '@/lib/workspaceSlug';
import { profileService, workspaceService } from '@/services';

export function WorkspaceOnboardingPage() {
  const { user, loading: authLoading } = useAuth();
  const { currentUser, workspace, loading: appLoading, error: appError, reloadWorkspace } = useApp();
  const navigate = useNavigate();
  const [workspaceName, setWorkspaceName] = useState('');
  const metadataName = typeof user?.user_metadata?.full_name === 'string'
    ? user.user_metadata.full_name.trim()
    : '';
  const profileName = currentUser?.profileName?.trim() ?? '';
  const [fullName, setFullName] = useState(metadataName);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const submittingRef = useRef(false);
  const createdWorkspaceIdRef = useRef<string | null>(null);
  const [createdWorkspaceId, setCreatedWorkspaceId] = useState<string | null>(null);

  useEffect(() => {
    setFullName(profileName || metadataName);
  }, [metadataName, profileName, user?.id]);

  if (workspace) return <Navigate to="/app" replace />;
  if (authLoading || appLoading) {
    return <p role="status" className="mx-auto max-w-xl px-6 py-12 text-sm text-slatey">Loading your account…</p>;
  }
  if (appError) {
    return <p role="alert" className="mx-auto max-w-xl px-6 py-12 text-sm text-coral">{appError}</p>;
  }
  if (!user || !currentUser) {
    return <p role="alert" className="mx-auto max-w-xl px-6 py-12 text-sm text-coral">Your account could not be loaded. Please sign in again.</p>;
  }

  const needsProfileName = !profileName;
  const workspaceNameError = validateWorkspaceName(workspaceName);
  const slug = slugifyWorkspaceName(workspaceName);

  const retryWorkspaceLoad = async (id: string) => {
    try {
      await reloadWorkspace(id, true);
      navigate('/app', { replace: true });
    } catch (cause) {
      setError(`Workspace creation succeeded, but its data could not be reloaded. ${getErrorMessage(cause)}`);
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    setSessionExpired(false);

    try {
      if (createdWorkspaceIdRef.current) {
        await retryWorkspaceLoad(createdWorkspaceIdRef.current);
        return;
      }

      const nameError = validateWorkspaceName(workspaceName);
      if (nameError) throw new Error(nameError);
      if (needsProfileName && !fullName.trim()) {
        throw new Error('Enter your full name to finish setting up your account.');
      }
      if (!supabase) throw new Error('Supabase authentication is not configured.');

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError || sessionData.session?.user.id !== user.id) {
        setSessionExpired(true);
        throw new Error('Your session expired. Sign in again to create your workspace.');
      }

      if (needsProfileName) {
        await profileService.updateOwnFullName(user.id, fullName.trim());
      }

      const workspaceId = await workspaceService.createFirst(workspaceName.trim(), slug);
      createdWorkspaceIdRef.current = workspaceId;
      setCreatedWorkspaceId(workspaceId);
      await retryWorkspaceLoad(workspaceId);
    } catch (cause) {
      setError(getErrorMessage(cause));
      setSessionExpired((current) => current || isSessionFailure(cause));
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-xl px-6 py-12">
      <div className="rounded-3xl border border-midnight/10 bg-white p-8 shadow-lift">
        <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">Welcome to Flowboard</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-midnight">Create your first workspace</h1>
        <p className="mt-2 text-sm text-slatey">Choose a name for the workspace you’ll use with your team.</p>

        {error && (
          <div role="alert" className="mt-5 rounded-xl border border-coral/20 bg-coral/[0.06] px-4 py-3 text-sm text-coral">
            {error}
            {sessionExpired && <Link className="ml-2 font-semibold underline" to="/login">Sign in</Link>}
          </div>
        )}

        <form className="mt-6 space-y-4" onSubmit={submit}>
          <label className="block">
            <span className="text-xs font-semibold text-midnight">Workspace name</span>
            <input
              required
              maxLength={100}
              value={workspaceName}
              disabled={Boolean(createdWorkspaceId)}
              onChange={(event) => setWorkspaceName(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-midnight/10 px-3 py-2.5 text-sm outline-none focus:border-mint-400"
              autoComplete="organization"
            />
          </label>

          <div className="text-xs text-slatey" aria-live="polite">
            Workspace URL: <span className="font-medium text-midnight">{slug || 'your-workspace'}</span>
          </div>

          {needsProfileName && (
            <>
              <label className="block">
                <span className="text-xs font-semibold text-midnight">Your full name</span>
                <input
                  required
                  maxLength={100}
                  value={fullName}
                  disabled={Boolean(createdWorkspaceId)}
                  onChange={(event) => setFullName(event.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-midnight/10 px-3 py-2.5 text-sm outline-none focus:border-mint-400"
                  autoComplete="name"
                />
              </label>
              {!fullName.trim() && <p className="text-sm text-coral">Enter your full name to finish setting up your account.</p>}
            </>
          )}

          {workspaceNameError && (
            <p className="text-sm text-coral">{workspaceNameError}</p>
          )}

          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={submitting || Boolean(workspaceNameError) || (needsProfileName && !fullName.trim())}
          >
            {submitting ? 'Creating workspace…' : createdWorkspaceId ? 'Retry loading workspace' : 'Create workspace'}
          </Button>
        </form>
      </div>
    </div>
  );
}

function isSessionFailure(cause: unknown): boolean {
  const message = getRawErrorMessage(cause).toLowerCase();
  const code = typeof cause === 'object' && cause !== null && 'code' in cause
    ? String(cause.code).toLowerCase()
    : '';
  return ['pgrst301', '401', 'invalid_grant'].includes(code)
    || message.includes('jwt expired')
    || message.includes('invalid jwt')
    || message.includes('invalid refresh token')
    || message.includes('refresh token not found')
    || message.includes('expired token')
    || message.includes('session expired')
    || message.includes('session missing')
    || message.includes('not authenticated');
}

function getErrorMessage(cause: unknown): string {
  const message = getRawErrorMessage(cause);
  const code = typeof cause === 'object' && cause !== null && 'code' in cause
    ? String(cause.code)
    : '';
  if (code === '23505' || /duplicate key.*slug|slug.*already exists|slug.*unique/i.test(message)) {
    return 'That workspace URL is already taken. Change the workspace name and try again.';
  }
  if (isSessionFailure(cause)) return 'Your session expired. Sign in again to continue.';
  if (/failed to fetch|network|fetch failed/i.test(message)) {
    return 'A network error interrupted setup. Check your connection and try again.';
  }
  return message || 'Workspace setup failed. Please try again.';
}

function getRawErrorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'object' && cause !== null && 'message' in cause && typeof cause.message === 'string') {
    return cause.message;
  }
  return '';
}
