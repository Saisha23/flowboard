import { motion, AnimatePresence } from 'framer-motion';
import {
  Check, Crown, Eye, Mail, MoreHorizontal, Shield, UserPlus,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card } from '@/components/ui';
import { Modal, ModalCloseButton } from '@/components/ui/Modal';
import { useApp } from '@/hooks/useApp';
import { useToast } from '@/components/ui/Toast';
import { membershipService } from '@/services';
import { cx, roleMeta } from '@/lib/utils';
import type { Invite, Membership, Role, User } from '@/types';

const roleIcon: Record<Role, typeof Crown> = {
  owner: Crown,
  member: Shield,
  viewer: Eye,
};

export function TeamPage() {
  const { users, currentUser, workspace, loading, error: appError } = useApp();
  const { toast } = useToast();
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [membershipsLoading, setMembershipsLoading] = useState(false);
  const [membershipsError, setMembershipsError] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;
    setMemberships([]);
    setInvites([]);
    setMembershipsError(null);

    if (loading || appError || !workspace) {
      setMembershipsLoading(false);
      return () => {
        active = false;
      };
    }

    setMembershipsLoading(true);
    membershipService.list(workspace.id).then((rows) => {
      if (active) setMemberships(rows);
    }).catch((cause) => {
      if (!active) return;
      const message = cause instanceof Error ? cause.message : 'Please try again.';
      setMembershipsError(message);
      toast({ type: 'error', title: 'Could not load member roles', message });
    }).finally(() => {
      if (active) setMembershipsLoading(false);
    });
    membershipService.invites().then((rows) => {
      if (active) setInvites(rows);
    }).catch((cause) => {
      if (active) {
        toast({ type: 'error', title: 'Could not load invitations', message: cause instanceof Error ? cause.message : 'Please try again.' });
      }
    });

    return () => {
      active = false;
    };
  }, [workspace, loading, appError, toast]);

  const roleFor = (uid: string) => memberships.find((m) => m.userId === uid)?.role
    ?? users.find((user) => user.id === uid)?.role
    ?? 'member';
  const isOwner = currentUser && roleFor(currentUser.id) === 'owner';

  const setRole = async (uid: string, role: Role) => {
    try {
      if (!workspace) throw new Error('No workspace available.');
      await membershipService.setRole(uid, role, workspace.id);
      setMemberships((prev) => prev.map((m) => (m.userId === uid ? { ...m, role } : m)));
      toast({ type: 'success', title: 'Role updated', message: `${users.find((u) => u.id === uid)?.name} is now ${roleMeta[role].label}.` });
    } catch (cause) {
      toast({ type: 'error', title: 'Could not update role', message: cause instanceof Error ? cause.message : 'Please try again.' });
    }
  };

  const sendInvite = async (email: string, role: Role) => {
    try {
      await membershipService.invite(email, role);
    } catch (cause) {
      toast({ type: 'error', title: 'Invitations unavailable', message: cause instanceof Error ? cause.message : 'Secure invitations are not configured.' });
      setInviteOpen(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await membershipService.revokeInvite(id);
      setInvites((prev) => prev.filter((i) => i.id !== id));
      toast({ type: 'info', title: 'Invitation revoked' });
    } catch (cause) {
      toast({ type: 'error', title: 'Could not revoke invitation', message: cause instanceof Error ? cause.message : 'Please try again.' });
    }
  };

  return (
    <div className="mx-auto max-w-[1200px] px-6 py-8 md:px-10">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">Workspace</p>
          <h1 className="mt-1.5 font-display text-display-md font-bold tracking-tightish text-midnight">Team members</h1>
          <p className="mt-2 text-sm text-slatey">
            {loading || membershipsLoading
              ? 'Loading team members...'
              : appError || membershipsError
                ? 'Team members could not be loaded.'
                : workspace
                  ? `${users.length} people with access to ${workspace.name}.`
                  : 'No workspace membership.'}
          </p>
        </div>
        {isOwner && (
          <Button variant="primary" size="md" onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" /> Invite people
          </Button>
        )}
      </div>

      {/* Role legend */}
      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {(Object.keys(roleMeta) as Role[]).map((r) => (
          <div key={r} className="rounded-2xl border border-midnight/[0.07] bg-white p-4">
            <div className="flex items-center gap-2">
              <span className={cx('flex h-8 w-8 items-center justify-center rounded-lg', roleMeta[r].pill)}>
                {(() => { const Icon = roleIcon[r]; return <Icon className="h-4 w-4" />; })()}
              </span>
              <div>
                <p className="text-sm font-bold text-midnight">{roleMeta[r].label}</p>
                <p className="text-2xs text-slatey">{roleMeta[r].description}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Members */}
      {loading ? (
        <p role="status" className="mt-6 text-sm text-slatey">Loading workspace members...</p>
      ) : appError ? (
        <p role="alert" className="mt-6 rounded-xl border border-coral/20 bg-coral/[0.06] px-4 py-3 text-sm text-coral">{appError}</p>
      ) : !workspace ? (
        <p role="status" className="mt-6 rounded-xl border border-amber/20 bg-amber/[0.06] px-4 py-3 text-sm text-midnight">
          You do not have access to a workspace yet. Ask a workspace owner to add you.
        </p>
      ) : (
        <>
          {membershipsError ? (
            <p role="alert" className="mt-6 rounded-xl border border-coral/20 bg-coral/[0.06] px-4 py-3 text-sm text-coral">
              Member roles could not be loaded: {membershipsError}
            </p>
          ) : membershipsLoading ? (
            <p role="status" className="mt-6 text-sm text-slatey">Loading workspace members...</p>
          ) : users.length === 0 ? (
            <p role="status" className="mt-6 rounded-xl border border-midnight/10 bg-white px-4 py-3 text-sm text-slatey">
              No members were returned for this workspace.
            </p>
          ) : (
            <Card className="mt-6" hover>
              <div className="flex items-center justify-between px-6 pb-3 pt-5">
                <h2 className="font-display text-base font-bold text-midnight">Members</h2>
                <span className="text-2xs text-slatey-400">{users.length} total</span>
              </div>
              <ul className="divide-y divide-midnight/5">
                {users.map((u) => {
                  const role = roleFor(u.id);
                  const Icon = roleIcon[role];
                  return (
                    <li key={u.id} className="flex items-center gap-4 px-6 py-3.5 transition-colors hover:bg-midnight/[0.02]">
                      <Avatar initials={u.initials} color={u.color} avatarUrl={u.avatarUrl} size="md" />
                      <button onClick={() => setSelectedUser(u)} className="min-w-0 flex-1 text-left">
                        <p className="truncate text-sm font-semibold text-midnight hover:underline">{u.name}</p>
                        <p className="truncate text-2xs text-slatey-400">{u.email} · {u.title}</p>
                      </button>
                      {isOwner && u.id !== currentUser?.id ? (
                        <RoleSelector role={role} onChange={(r) => setRole(u.id, r)} />
                      ) : (
                        <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold', roleMeta[role].pill)}>
                          <Icon className="h-3 w-3" />
                          {roleMeta[role].label}
                        </span>
                      )}
                      <button className="flex h-7 w-7 items-center justify-center rounded-md text-slatey-400 hover:bg-midnight/5 hover:text-midnight" onClick={() => setSelectedUser(u)}>
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* Pending invites */}
      {invites.length > 0 && (
        <Card className="mt-4" hover>
          <div className="flex items-center justify-between px-6 pb-3 pt-5">
            <h2 className="font-display text-base font-bold text-midnight">Pending invitations</h2>
            <Badge tone="amber" dot>{invites.length} pending</Badge>
          </div>
          <ul className="divide-y divide-midnight/5">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center gap-4 px-6 py-3.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-amber/15 text-amber">
                  <Mail className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-midnight">{inv.email}</p>
                  <p className="text-2xs text-slatey-400">Invited as {roleMeta[inv.role].label} · {new Date(inv.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                </div>
                <Badge tone="amber">Pending</Badge>
                {isOwner && (
                  <button onClick={() => revoke(inv.id)} className="text-2xs font-semibold text-coral hover:underline">Revoke</button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} onSend={sendInvite} />
      <MemberProfileModal user={selectedUser} role={selectedUser ? roleFor(selectedUser.id) : 'member'} onClose={() => setSelectedUser(null)} />
    </div>
  );
}

function RoleSelector({ role, onChange }: { role: Role; onChange: (r: Role) => void }) {
  const [open, setOpen] = useState(false);
  const Icon = roleIcon[role];
  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold transition-opacity hover:opacity-80', roleMeta[role].pill)}
      >
        <Icon className="h-3 w-3" />
        {roleMeta[role].label}
      </button>
      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              className="absolute right-0 top-8 z-20 w-48 overflow-hidden rounded-xl border border-midnight/10 bg-white p-1 shadow-lift"
            >
              {(Object.keys(roleMeta) as Role[]).map((r) => (
                <button
                  key={r}
                  onClick={() => { onChange(r); setOpen(false); }}
                  className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs font-medium text-midnight hover:bg-midnight/5"
                >
                  <span>{roleMeta[r].label}</span>
                  {role === r && <Check className="h-3.5 w-3.5 text-mint-500" />}
                </button>
              ))}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

function InviteModal({ open, onClose, onSend }: { open: boolean; onClose: () => void; onSend: (email: string, role: Role) => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('member');

  return (
    <Modal open={open} onClose={onClose} size="md" label="Invite people">
      <div className="overflow-hidden rounded-2xl border border-midnight/10 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-midnight/8 bg-porcelain-50 px-6 py-4">
          <h2 className="font-display text-base font-bold text-midnight">Invite to this workspace</h2>
          <ModalCloseButton onClose={onClose} />
        </div>
        <div className="space-y-5 px-6 py-6">
          <div>
            <label className="mb-2 block text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="teammate@company.com"
              className="w-full rounded-lg border border-midnight/10 bg-white px-3 py-2.5 text-sm text-midnight placeholder:text-slatey-400 focus:border-midnight/20 focus:outline-none focus:ring-2 focus:ring-mint-200/40"
            />
          </div>
          <div>
            <label className="mb-2 block text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">Role</label>
            <div className="space-y-1.5">
              {(Object.keys(roleMeta) as Role[]).map((r) => (
                <button
                  key={r}
                  onClick={() => setRole(r)}
                  className={cx(
                    'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-all',
                    role === r ? 'border-midnight/20 bg-white shadow-soft' : 'border-transparent hover:bg-midnight/[0.03]',
                  )}
                >
                  {(() => { const Icon = roleIcon[r]; return <Icon className="h-4 w-4 text-slatey-500" />; })()}
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-midnight">{roleMeta[r].label}</p>
                    <p className="text-2xs text-slatey">{roleMeta[r].description}</p>
                  </div>
                  {role === r && <Check className="h-4 w-4 text-mint-500" />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-midnight/8 bg-white px-6 py-4">
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={() => onSend(email, role)} disabled={!email.trim()}>
            <Mail className="h-3.5 w-3.5" /> Send invitation
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MemberProfileModal({ user, role, onClose }: { user: User | null; role: Role; onClose: () => void }) {
  if (!user) return null;
  const Icon = roleIcon[role];
  return (
    <Modal open={!!user} onClose={onClose} size="md" label="Member profile">
      <div className="overflow-hidden rounded-2xl border border-midnight/10 bg-white shadow-lift">
        <div className="relative bg-midnight px-6 py-8 text-white">
          <ModalCloseButton onClose={onClose} />
          <div className="flex items-center gap-4">
            <Avatar initials={user.initials} color={user.color} size="lg" />
            <div>
              <h2 className="font-display text-xl font-bold text-white">{user.name}</h2>
              <p className="text-sm text-white/60">{user.title}</p>
            </div>
          </div>
        </div>
        <div className="space-y-4 px-6 py-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">Email</p>
              <p className="mt-1 text-sm text-midnight">{user.email}</p>
            </div>
            <div>
              <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">Role</p>
              <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-midnight">
                <Icon className="h-3.5 w-3.5 text-slatey-500" />
                {roleMeta[role].label}
              </p>
            </div>
          </div>
          <div className="rounded-xl border border-midnight/8 bg-porcelain-50 p-4">
            <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">Permissions</p>
            <p className="mt-1 text-xs leading-relaxed text-slatey">{roleMeta[role].description}.</p>
          </div>
        </div>
      </div>
    </Modal>
  );
}
