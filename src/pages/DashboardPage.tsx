import { motion } from 'framer-motion';
import {
  ArrowRight, ArrowUpRight, CalendarClock, CheckCircle2, Layers, ListTodo, Plus, Radar, Sparkles, TrendingUp, Zap,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AvatarStack, Button, Card } from '@/components/ui';
import { ProgressRing, ProgressBar } from '@/components/ui/Progress';
import { ActivityFeed } from '@/components/shared/ActivityFeed';
import { useApp } from '@/hooks/useApp';
import { activityService } from '@/services';
import { cx, isOverdue, priorityMeta, relativeDay } from '@/lib/utils';
import type { Activity } from '@/types';

export function DashboardPage() {
  const { currentUser, users, tasks, boards, lists, workspace, loading, error } = useApp();
  const [activity, setActivity] = useState<Activity[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);

  useEffect(() => {
    if (loading || error || !workspace) {
      setActivity([]);
      setActivityError(null);
      return;
    }

    let active = true;
    setActivityError(null);
    activityService.recent(workspace.id)
      .then((items) => {
        if (active) setActivity(items);
      })
      .catch((cause) => {
        if (active) setActivityError(cause instanceof Error ? cause.message : 'Unable to load activity.');
      });
    return () => {
      active = false;
    };
  }, [loading, error, workspace]);

  const myTasks = tasks.filter((t) => currentUser && t.assigneeIds.includes(currentUser.id) && !t.completedAt);
  const completed = tasks.filter((t) => t.completedAt);
  const overdue = tasks.filter((t) => isOverdue(t.dueDate) && !t.completedAt);
  const currentBoard = boards[0];
  const currentBoardTasks = tasks.filter((task) => task.boardId === currentBoard?.id);
  const currentBoardLists = lists.filter((list) => list.boardId === currentBoard?.id);
  const listProgressColors = ['bg-slatey-400', 'bg-sand-300', 'bg-mint-300', 'bg-amber', 'bg-apricot-400', 'bg-sage'];
  const upcoming = tasks
    .filter((t) => t.dueDate && !t.completedAt && !isOverdue(t.dueDate))
    .sort((a, b) => new Date(a.dueDate!).getTime() - new Date(b.dueDate!).getTime())
    .slice(0, 5);
  const completionRate = tasks.length ? Math.round((completed.length / tasks.length) * 100) : 0;
  const userById = (id: string) => users.find((u) => u.id === id);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">
      {/* Greeting */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
          <h1 className="mt-1.5 font-display text-display-md font-bold tracking-tightish text-midnight">
            {greeting}, {currentUser?.name?.split(' ')[0] ?? 'there'}.
          </h1>
          <p className="mt-2 text-sm text-slatey">Here's what's moving across {workspace?.name ?? 'your workspace'} today.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to={currentBoard ? `/app/boards/${currentBoard.id}` : '/app/boards'}
            state={currentBoard ? { openNewTask: true } : undefined}
          >
            <Button variant="primary" size="md"><Plus className="h-4 w-4" /> New task</Button>
          </Link>
          <Link to="/app/radar"><Button variant="outline" size="md"><Radar className="h-4 w-4" /> Open radar</Button></Link>
        </div>
      </motion.div>

      {loading ? (
        <p role="status" className="mt-8 text-sm text-slatey">Loading your workspace...</p>
      ) : error ? (
        <p role="alert" className="mt-8 rounded-xl border border-coral/20 bg-coral/[0.06] px-4 py-3 text-sm text-coral">{error}</p>
      ) : !workspace ? (
        <p role="status" className="mt-8 rounded-xl border border-amber/20 bg-amber/[0.06] px-4 py-3 text-sm text-midnight">
          You do not have access to a workspace yet. Ask a workspace owner to add you.
        </p>
      ) : (
      <>
      {/* Stat grid */}
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Layers}
          label="Active projects"
          value={boards.length.toString()}
          sub={`${tasks.length} tasks total`}
          tone="midnight"
          delay={0}
        />
        <StatCard
          icon={CheckCircle2}
          label="Tasks completed"
          value={completed.length.toString()}
          sub={`${completionRate}% completion rate`}
          tone="sage"
          delay={0.06}
          progress={completionRate}
        />
        <StatCard
          icon={CalendarClock}
          label="Overdue tasks"
          value={overdue.length.toString()}
          sub={overdue.length ? 'Needs attention' : 'All on track'}
          tone={overdue.length ? 'coral' : 'midnight'}
          delay={0.12}
        />
        <StatCard
          icon={ListTodo}
          label="My open tasks"
          value={myTasks.length.toString()}
          sub={`${upcoming.length} due this week`}
          tone="apricot"
          delay={0.18}
        />
      </div>

      {/* Main grid */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {/* Project overview */}
        <Card className="lg:col-span-2" hover>
          <CardHeader title="Current project" subtitle={currentBoard?.name ?? 'No boards yet'} action={currentBoard && <Link to={`/app/boards/${currentBoard.id}`} className="text-xs font-semibold text-slatey hover:text-midnight">Open board <ArrowUpRight className="inline h-3 w-3" /></Link>} />
          <div className="px-6 pb-6">
            <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
              <div className="flex flex-col items-center justify-center rounded-2xl bg-porcelain-50 py-5">
                <ProgressRing value={currentBoardTasks.length ? Math.round((currentBoardTasks.filter((task) => task.completedAt).length / currentBoardTasks.length) * 100) : 0} label={`${currentBoardTasks.length ? Math.round((currentBoardTasks.filter((task) => task.completedAt).length / currentBoardTasks.length) * 100) : 0}%`} sublabel="complete" size={96} />
                <p className="mt-2 text-2xs font-medium text-slatey">{currentBoardTasks.filter((task) => task.completedAt).length} / {currentBoardTasks.length} tasks</p>
              </div>
              <div className="space-y-4">
                {[
                  ...currentBoardLists.map((list, index) => ({
                    label: list.name,
                    count: currentBoardTasks.filter((task) => task.listId === list.id).length,
                    total: currentBoardTasks.length,
                    color: listProgressColors[index % listProgressColors.length],
                  })),
                ].map((row) => (
                  <div key={row.label}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="flex items-center gap-2 font-medium text-midnight">
                        <span className={cx('h-2 w-2 rounded-full', row.color)} />
                        {row.label}
                      </span>
                      <span className="text-slatey-400">{row.count} tasks</span>
                    </div>
                    <ProgressBar value={row.total ? (row.count / row.total) * 100 : 0} className="mt-1.5" color={row.color} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>

        {/* Quick actions */}
        <Card hover>
          <CardHeader title="Quick actions" subtitle="Jump back in" />
          <div className="space-y-2 px-4 pb-5">
            {[
              {
                icon: Plus,
                label: 'Create a task',
                to: currentBoard ? `/app/boards/${currentBoard.id}` : '/app/boards',
                state: currentBoard ? { openNewTask: true } : undefined,
                tone: 'mint',
              },
              { icon: Sparkles, label: 'Generate AI summary', to: '/app/insights', tone: 'apricot' },
              { icon: Radar, label: 'Review drift radar', to: '/app/radar', tone: 'coral' },
              { icon: Zap, label: 'Invite a teammate', to: '/app/team', tone: 'slatey' },
            ].map((q) => (
              <Link
                key={q.label}
                to={q.to}
                state={q.state}
                className="group flex items-center gap-3 rounded-xl border border-midnight/[0.06] bg-white p-3 transition-all hover:border-midnight/15 hover:shadow-soft"
              >
                <span className={cx(
                  'flex h-9 w-9 items-center justify-center rounded-lg',
                  q.tone === 'mint' && 'bg-mint-50 text-mint-500',
                  q.tone === 'apricot' && 'bg-apricot-50 text-apricot-400',
                  q.tone === 'coral' && 'bg-coral/10 text-coral',
                  q.tone === 'slatey' && 'bg-slatey-100 text-slatey-500',
                )}>
                  <q.icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-semibold text-midnight">{q.label}</span>
                <ArrowRight className="h-4 w-4 text-slatey-300 transition-all group-hover:translate-x-0.5 group-hover:text-midnight" />
              </Link>
            ))}
          </div>
        </Card>
      </div>

      {/* Upcoming + Activity */}
      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2" hover>
          <CardHeader title="Upcoming deadlines" subtitle="Next 5 due tasks" action={<Link to="/app/tasks" className="text-xs font-semibold text-slatey hover:text-midnight">View all</Link>} />
          <div className="px-2 pb-3">
            {upcoming.length === 0 ? (
              <EmptyRow text="Nothing due soon. Nicely paced." />
            ) : (
              <ul className="divide-y divide-midnight/5">
                {upcoming.map((t) => {
                  const pm = priorityMeta[t.priority];
                  const assignees = (t.assigneeIds.map(userById).filter(Boolean) as typeof users);
                  return (
                    <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <span className={cx('h-2 w-2 shrink-0 rounded-full', pm.dot)} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-midnight">{t.title}</p>
                        <p className="text-2xs text-slatey-400">{t.assigneeIds.length} assignee{t.assigneeIds.length > 1 ? 's' : ''}</p>
                      </div>
                      <span className="hidden sm:block text-xs font-medium text-slatey">{relativeDay(new Date(t.dueDate!))}</span>
                      <AvatarStack people={assignees} size="xs" max={2} />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Card>

        <Card hover>
          <CardHeader title="Recent activity" subtitle="Workspace pulse" />
          <div className="px-3 pb-4">
            {loading ? <div className="space-y-3 px-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-10" />)}</div> : (
              activityError
                ? <p role="alert" className="px-2 py-3 text-xs text-coral">{activityError}</p>
                : <ActivityFeed items={activity.slice(0, 6)} users={users} />
            )}
          </div>
        </Card>
      </div>

      {/* Overdue banner */}
      {overdue.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 flex flex-col items-start justify-between gap-3 rounded-2xl border border-coral/20 bg-coral/[0.06] p-5 md:flex-row md:items-center"
        >
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-coral/15 text-coral"><TrendingUp className="h-4 w-4" /></span>
            <div>
              <p className="text-sm font-bold text-midnight">{overdue.length} task{overdue.length > 1 ? 's are' : ' is'} overdue</p>
              <p className="text-xs text-slatey">The Drift Radar flagged this as a contributing risk factor.</p>
            </div>
          </div>
          <Link to="/app/radar"><Button variant="secondary" size="sm">Review on radar <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
        </motion.div>
      )}
      </>
      )}
    </div>
  );
}

function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between px-6 pb-4 pt-5">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">{title}</p>
        {subtitle && <h2 className="mt-1 font-display text-base font-bold text-midnight">{subtitle}</h2>}
      </div>
      {action}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, tone, delay, progress }: { icon: typeof Plus; label: string; value: string; sub: string; tone: 'midnight' | 'sage' | 'coral' | 'apricot'; delay: number; progress?: number }) {
  const toneClass = {
    midnight: 'bg-midnight/5 text-midnight',
    sage: 'bg-sage/12 text-sage',
    coral: 'bg-coral/10 text-coral',
    apricot: 'bg-apricot/50 text-apricot-400',
  }[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-2xl border border-midnight/[0.07] bg-white p-5 shadow-soft transition-all hover:shadow-card"
    >
      <div className="flex items-center justify-between">
        <span className={cx('flex h-9 w-9 items-center justify-center rounded-lg', toneClass)}><Icon className="h-4 w-4" /></span>
        {progress !== undefined && <span className="text-2xs font-semibold text-slatey-400">{progress}%</span>}
      </div>
      <p className="mt-4 font-display text-3xl font-bold text-midnight">{value}</p>
      <p className="text-sm font-medium text-midnight">{label}</p>
      <p className="mt-0.5 text-2xs text-slatey">{sub}</p>
      {progress !== undefined && <ProgressBar value={progress} className="mt-3" color={tone === 'sage' ? 'bg-sage' : 'bg-mint-300'} />}
    </motion.div>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-10 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-mint-50 text-mint-500"><CheckCircle2 className="h-5 w-5" /></span>
      <p className="mt-3 text-sm font-medium text-midnight">{text}</p>
    </div>
  );
}
