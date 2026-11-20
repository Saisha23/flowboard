import { AnimatePresence, motion } from 'framer-motion';
import {
  ChevronsUpDown,
  Check,
  LayoutGrid,
  ListTodo,
  KanbanSquare,
  Sparkles,
  Radar,
  Users,
  Settings,
  Search,
  Bell,
  ChevronsLeftRight,
  X,
  HelpCircle,
  LogOut,
} from 'lucide-react';
import { useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Logo } from '@/components/ui/Logo';
import { Avatar } from '@/components/ui/Avatar';
import { useApp } from '@/hooks/useApp';
import { cx } from '@/lib/utils';
import type { User, Workspace } from '@/types';
import { useAuth } from '@/components/auth/AuthProvider';

const navItems = [
  { to: '/app', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/app/tasks', label: 'My tasks', icon: ListTodo },
  { to: '/app/boards', label: 'Boards', icon: KanbanSquare },
  { to: '/app/insights', label: 'AI Insights', icon: Sparkles },
  { to: '/app/radar', label: 'Commitment Drift Radar', icon: Radar },
  { to: '/app/team', label: 'Team members', icon: Users },
  { to: '/app/settings', label: 'Settings', icon: Settings },
];

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [wsOpen, setWsOpen] = useState(false);
  const { currentUser, workspace, workspaces, switchWorkspace, loading, error } = useApp();
  const location = useLocation();
  const isOnboardingRoute = location.pathname === '/app/onboarding';

  if (!loading && !error && !workspace && !isOnboardingRoute) {
    return <Navigate to="/app/onboarding" replace />;
  }
  if (!loading && workspace && isOnboardingRoute) {
    return <Navigate to="/app" replace />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-porcelain">
      {/* Sidebar */}
      <aside className="hidden w-[260px] shrink-0 flex-col bg-midnight text-white md:flex">
        <SidebarContent
          workspace={workspace}
          workspaces={workspaces}
          wsOpen={wsOpen}
          setWsOpen={setWsOpen}
          switchWorkspace={switchWorkspace}
          user={currentUser}
        />
      </aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 md:hidden">
            <motion.div className="absolute inset-0 bg-midnight/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.aside
              className="absolute left-0 top-0 flex h-full w-[260px] flex-col bg-midnight text-white"
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
            >
              <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-white/60 hover:bg-white/10">
                <X className="h-4 w-4" />
              </button>
              <SidebarContent
                workspace={workspace}
                workspaces={workspaces}
                wsOpen={wsOpen}
                setWsOpen={setWsOpen}
                switchWorkspace={switchWorkspace}
                user={currentUser}
                onNavigate={() => setMobileOpen(false)}
              />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobile={() => setMobileOpen(true)} key={location.pathname} />
        <main className="flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function SidebarContent({
  workspace, workspaces, wsOpen, setWsOpen, switchWorkspace, user, onNavigate,
}: {
  workspace: Workspace | null;
  workspaces: Workspace[];
  wsOpen: boolean;
  setWsOpen: (v: boolean) => void;
  switchWorkspace: (id: string) => Promise<void>;
  user: User | null;
  onNavigate?: () => void;
}) {
  return (
    <>
      <div className="flex items-center justify-between px-5 pb-2 pt-5">
        <Logo variant="light" size="sm" />
      </div>

      {/* Workspace switcher */}
      <div className="relative px-3 pt-2">
        <button
          onClick={() => setWsOpen(!wsOpen)}
          className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-left transition-colors hover:bg-white/[0.08]"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="h-7 w-7 shrink-0 rounded-lg" style={{ backgroundColor: workspace?.color ?? '#B8E4D0' }} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{workspace?.name ?? 'Workspace'}</p>
              <p className="truncate text-2xs text-white/50">{workspace?.plan ?? 'Plan'}</p>
            </div>
          </div>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-white/40" />
        </button>

        <AnimatePresence>
          {wsOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setWsOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute left-3 right-3 top-12 z-20 overflow-hidden rounded-xl border border-white/10 bg-midnight-600 p-1 shadow-lift"
              >
                {workspaces.map((w) => (
                  <button
                    key={w.id}
                    onClick={async () => { await switchWorkspace(w.id); setWsOpen(false); }}
                    className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left hover:bg-white/[0.06]"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="h-6 w-6 rounded-md" style={{ backgroundColor: w.color }} />
                      <div>
                        <p className="text-xs font-semibold text-white">{w.name}</p>
                        <p className="text-2xs text-white/40">{w.plan}</p>
                      </div>
                    </div>
                    {workspace?.id === w.id && <Check className="h-3.5 w-3.5 text-mint-200" />}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Nav */}
      <nav className="mt-4 flex-1 space-y-0.5 overflow-y-auto px-3 scroll-dark">
        <p className="px-3 pb-2 pt-2 text-2xs font-semibold uppercase tracking-widest2 text-white/30">Workspace</p>
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            onClick={onNavigate}
            className={({ isActive }) => cx('nav-link', isActive && 'nav-link-active')}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* User profile */}
      <Link to="/app/settings" onClick={onNavigate} className="border-t border-white/10 px-3 py-3 transition-colors hover:bg-white/[0.04]">
        <div className="flex items-center gap-2.5">
          <Avatar initials={user?.initials ?? 'U'} color={user?.color ?? '#D69A78'} avatarUrl={user?.avatarUrl} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{user?.name ?? 'Account'}</p>
            <p className="truncate text-2xs text-white/50">{user?.title ?? 'Workspace member'}</p>
          </div>
          <ChevronsLeftRight className="h-4 w-4 text-white/30" />
        </div>
      </Link>
    </>
  );
}

function Topbar({ onOpenMobile }: { onOpenMobile: () => void }) {
  const { currentUser, workspace } = useApp();
  const { signOut } = useAuth();
  const location = useLocation();
  const pageTitle = navItems.find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to) && n.to !== '/app'))?.label
    ?? (location.pathname.startsWith('/app/boards/') ? 'Board' : 'Overview');

  return (
    <header className="flex h-16 shrink-0 items-center justify-between border-b border-midnight/8 bg-porcelain/90 px-4 backdrop-blur-xl md:px-8">
      <div className="flex items-center gap-3">
        <button onClick={onOpenMobile} className="flex h-9 w-9 items-center justify-center rounded-lg text-midnight md:hidden" aria-label="Open menu">
          <LayoutGrid className="h-5 w-5" />
        </button>
        <div className="hidden md:block">
          <p className="text-2xs font-medium uppercase tracking-widest2 text-slatey-400">{workspace?.name ?? 'Workspace'}</p>
          <h1 className="font-display text-base font-bold text-midnight">{pageTitle}</h1>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={async () => { await signOut(); window.location.assign('/login'); }}
          className="flex h-9 items-center gap-2 rounded-xl border border-midnight/10 bg-white px-3 text-xs font-semibold text-midnight"
          aria-label="Sign out"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
        <div className="hidden items-center gap-2 rounded-xl border border-midnight/10 bg-white px-3 py-2 md:flex">
          <Search className="h-4 w-4 text-slatey-400" />
          <input
            placeholder="Search tasks, people…"
            className="w-44 bg-transparent text-sm text-midnight placeholder:text-slatey-400 focus:outline-none"
          />
          <kbd className="rounded bg-midnight/5 px-1.5 py-0.5 text-2xs font-medium text-slatey-400">⌘K</kbd>
        </div>
        <button className="flex h-9 w-9 items-center justify-center rounded-xl text-slatey-500 transition-colors hover:bg-midnight/5" aria-label="Help">
          <HelpCircle className="h-4 w-4" />
        </button>
        <button className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slatey-500 transition-colors hover:bg-midnight/5" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-coral" />
        </button>
        <Avatar initials={currentUser?.initials ?? 'U'} color={currentUser?.color ?? '#B8E4D0'} avatarUrl={currentUser?.avatarUrl} size="md" className="ml-1" />
      </div>
    </header>
  );
}
