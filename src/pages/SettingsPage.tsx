import { motion } from 'framer-motion';
import { Bell, Globe, Moon, Palette, Shield, User as UserIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar, Badge, Button, Card } from '@/components/ui';
import { useApp } from '@/hooks/useApp';
import { useToast } from '@/components/ui/Toast';
import { cx, roleMeta } from '@/lib/utils';

const sections = [
  { id: 'profile', label: 'Profile', icon: UserIcon },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'security', label: 'Security', icon: Shield },
];

export function SettingsPage() {
  const { currentUser, loading, error } = useApp();
  const { toast } = useToast();
  const [active, setActive] = useState('profile');
  const [name, setName] = useState(currentUser?.name ?? '');
  const [title, setTitle] = useState(currentUser?.title ?? '');
  const [emailNotif, setEmailNotif] = useState(true);
  const [driftAlerts, setDriftAlerts] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(false);

  useEffect(() => {
    setName(currentUser?.name ?? '');
    setTitle(currentUser?.title ?? '');
  }, [currentUser?.id, currentUser?.name, currentUser?.title]);

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8 md:px-10">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">Workspace</p>
        <h1 className="mt-1.5 font-display text-display-md font-bold tracking-tightish text-midnight">Settings</h1>
        <p className="mt-2 text-sm text-slatey">Manage your profile, appearance and preferences.</p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[220px_1fr]">
        {/* Section nav */}
        <nav className="space-y-1">
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition-all',
                active === s.id ? 'bg-white shadow-soft text-midnight' : 'text-slatey hover:bg-white/60',
              )}
            >
              <s.icon className="h-4 w-4" />
              {s.label}
            </button>
          ))}
        </nav>

        {/* Content */}
        <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          {loading ? (
            <p role="status" className="text-sm text-slatey">Loading account settings…</p>
          ) : error ? (
            <p role="alert" className="text-sm text-coral">{error}</p>
          ) : !currentUser ? (
            <p role="status" className="text-sm text-slatey">Account profile unavailable.</p>
          ) : (
            <>
          {active === 'profile' && (
            <Card hover>
              <div className="border-b border-midnight/8 px-6 py-5">
                <h2 className="font-display text-base font-bold text-midnight">Profile</h2>
                <p className="text-xs text-slatey">How you appear to teammates.</p>
              </div>
              <div className="space-y-5 px-6 py-6">
                <div className="flex items-center gap-4">
                  <Avatar initials={currentUser.initials ?? 'U'} color={currentUser.color ?? '#D69A78'} avatarUrl={currentUser.avatarUrl} size="lg" />
                  <Button variant="outline" size="sm" onClick={() => toast({ type: 'info', title: 'Upload coming soon' })}>Change avatar</Button>
                </div>
                <Field label="Full name">
                  <input value={name} onChange={(e) => setName(e.target.value)} className="input" />
                </Field>
                <Field label="Title">
                  <input value={title} onChange={(e) => setTitle(e.target.value)} className="input" />
                </Field>
                <Field label="Email">
                  <input value={currentUser?.email ?? ''} disabled className="input opacity-60" />
                </Field>
                <div className="flex items-center gap-2">
                  <span className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">Role</span>
                  <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-2xs font-semibold', roleMeta[currentUser?.role ?? 'member'].pill)}>
                    {roleMeta[currentUser?.role ?? 'member'].label}
                  </span>
                </div>
              </div>
              <div className="flex justify-end border-t border-midnight/8 px-6 py-4">
                <Button variant="primary" size="sm" onClick={() => toast({ type: 'success', title: 'Profile saved' })}>Save changes</Button>
              </div>
            </Card>
          )}

          {active === 'appearance' && (
            <Card hover>
              <div className="border-b border-midnight/8 px-6 py-5">
                <h2 className="font-display text-base font-bold text-midnight">Appearance</h2>
                <p className="text-xs text-slatey">Customize how Flowboard looks.</p>
              </div>
              <div className="space-y-5 px-6 py-6">
                <Field label="Theme">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border-2 border-midnight/20 bg-white p-4">
                      <div className="h-16 rounded-lg bg-porcelain" />
                      <p className="mt-2 text-sm font-semibold text-midnight">Warm Porcelain</p>
                      <p className="text-2xs text-slatey-400">Default</p>
                    </div>
                    <div className="rounded-xl border border-midnight/10 p-4 opacity-50">
                      <div className="flex h-16 items-center justify-center rounded-lg bg-midnight text-white">
                        <Moon className="h-5 w-5" />
                      </div>
                      <p className="mt-2 text-sm font-semibold text-midnight">Midnight</p>
                      <p className="text-2xs text-slatey-400">Coming soon</p>
                    </div>
                  </div>
                </Field>
                <Field label="Language">
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-slatey-400" />
                    <select className="input flex-1">
                      <option>English (US)</option>
                      <option>English (UK)</option>
                      <option>Português (BR)</option>
                    </select>
                  </div>
                </Field>
              </div>
            </Card>
          )}

          {active === 'notifications' && (
            <Card hover>
              <div className="border-b border-midnight/8 px-6 py-5">
                <h2 className="font-display text-base font-bold text-midnight">Notifications</h2>
                <p className="text-xs text-slatey">Choose what you want to hear about.</p>
              </div>
              <div className="divide-y divide-midnight/5">
                <ToggleRow
                  label="Email notifications"
                  desc="Task assignments, mentions and comments"
                  value={emailNotif}
                  onChange={setEmailNotif}
                />
                <ToggleRow
                  label="Drift Radar alerts"
                  desc="Get notified when the drift score crosses a threshold"
                  value={driftAlerts}
                  onChange={setDriftAlerts}
                />
                <ToggleRow
                  label="Weekly digest"
                  desc="A summary of your workspace every Monday"
                  value={weeklyDigest}
                  onChange={setWeeklyDigest}
                />
              </div>
            </Card>
          )}

          {active === 'security' && (
            <Card hover>
              <div className="border-b border-midnight/8 px-6 py-5">
                <h2 className="font-display text-base font-bold text-midnight">Security</h2>
                <p className="text-xs text-slatey">Protect your account.</p>
              </div>
              <div className="space-y-5 px-6 py-6">
                <Field label="Current password">
                  <input type="password" placeholder="••••••••" className="input" />
                </Field>
                <Field label="New password">
                  <input type="password" placeholder="••••••••" className="input" />
                </Field>
                <div className="rounded-xl border border-midnight/8 bg-porcelain-50 p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-midnight">Two-factor authentication</p>
                      <p className="text-2xs text-slatey">Add an extra layer of security</p>
                    </div>
                    <Badge tone="amber" dot>Not enabled</Badge>
                  </div>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => toast({ type: 'info', title: '2FA setup coming soon' })}>Enable 2FA</Button>
                </div>
              </div>
              <div className="flex justify-end border-t border-midnight/8 px-6 py-4">
                <Button variant="primary" size="sm" onClick={() => toast({ type: 'success', title: 'Password updated' })}>Update password</Button>
              </div>
            </Card>
          )}
            </>
          )}
        </motion.div>
      </div>

      <style>{`.input{width:100%;border-radius:0.5rem;border:1px solid rgba(17,24,32,0.1);background:white;padding:0.5rem 0.75rem;font-size:0.875rem;color:#111820;outline:none}.input:focus{border-color:rgba(17,24,32,0.2);box-shadow:0 0 0 2px rgba(184,228,208,0.4)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-2 block text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({ label, desc, value, onChange }: { label: string; desc: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between px-6 py-4">
      <div>
        <p className="text-sm font-semibold text-midnight">{label}</p>
        <p className="text-2xs text-slatey">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cx('relative h-6 w-11 rounded-full transition-colors', value ? 'bg-mint-300' : 'bg-midnight/15')}
        role="switch"
        aria-checked={value}
      >
        <motion.span
          layout
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-soft"
          animate={{ left: value ? '22px' : '2px' }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        />
      </button>
    </div>
  );
}
