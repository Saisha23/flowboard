import { motion } from 'framer-motion';
import { CheckCircle2, Circle, Clock, Filter, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AvatarStack, Card } from '@/components/ui';
import { useApp } from '@/hooks/useApp';
import { cx, isOverdue, labelColorClasses, priorityMeta, relativeDay } from '@/lib/utils';

type Tab = 'all' | 'overdue' | 'today' | 'week' | 'done';

export function MyTasksPage() {
  const { currentUser, users, tasks, labels } = useApp();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');

  const myTasks = useMemo(() => {
    if (!currentUser) return [];
    return tasks
      .filter((t) => t.assigneeIds.includes(currentUser.id))
      .sort((a, b) => {
        const aOver = isOverdue(a.dueDate) ? 0 : 1;
        const bOver = isOverdue(b.dueDate) ? 0 : 1;
        if (aOver !== bOver) return aOver - bOver;
        return (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999');
      });
  }, [tasks, currentUser]);

  const filtered = useMemo(() => {
    const now = new Date('2026-11-17T09:00:00Z');
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
    return myTasks.filter((t) => {
      if (query && !t.title.toLowerCase().includes(query.toLowerCase())) return false;
      const done = t.listId === 'list-5';
      const overdue = isOverdue(t.dueDate) && !done;
      if (tab === 'overdue') return overdue;
      if (tab === 'done') return done;
      if (tab === 'today') return t.dueDate && new Date(t.dueDate).toDateString() === now.toDateString() && !done;
      if (tab === 'week') return t.dueDate && new Date(t.dueDate) <= weekEnd && !done;
      return true;
    });
  }, [myTasks, query, tab]);

  const tabs: { id: Tab; label: string; count: number }[] = [
    { id: 'all', label: 'All', count: myTasks.length },
    { id: 'overdue', label: 'Overdue', count: myTasks.filter((t) => isOverdue(t.dueDate) && t.listId !== 'list-5').length },
    { id: 'today', label: 'Today', count: myTasks.filter((t) => t.dueDate && new Date(t.dueDate).toDateString() === new Date('2026-11-17').toDateString() && t.listId !== 'list-5').length },
    { id: 'week', label: 'This week', count: myTasks.filter((t) => t.dueDate && new Date(t.dueDate) <= new Date('2026-11-24') && t.listId !== 'list-5').length },
    { id: 'done', label: 'Done', count: myTasks.filter((t) => t.listId === 'list-5').length },
  ];

  return (
    <div className="mx-auto max-w-[1100px] px-6 py-8 md:px-10">
      <div>
        <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">Personal</p>
        <h1 className="mt-1.5 font-display text-display-md font-bold tracking-tightish text-midnight">My tasks</h1>
        <p className="mt-2 text-sm text-slatey">Everything assigned to you across Atlas Studio.</p>
      </div>

      {/* Tabs + search */}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-1 rounded-xl bg-white p-1 shadow-soft">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all',
                tab === t.id ? 'bg-midnight text-white' : 'text-slatey hover:bg-midnight/5',
              )}
            >
              {t.label}
              <span className={cx('rounded-full px-1.5 text-[10px]', tab === t.id ? 'bg-white/20' : 'bg-midnight/5')}>{t.count}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 rounded-xl border border-midnight/10 bg-white px-3 py-2">
          <Search className="h-4 w-4 text-slatey-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-36 bg-transparent text-sm text-midnight placeholder:text-slatey-400 focus:outline-none"
          />
          <Filter className="h-3.5 w-3.5 text-slatey-300" />
        </div>
      </div>

      {/* Task list */}
      <Card className="mt-5" hover>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-mint-50 text-mint-500"><CheckCircle2 className="h-6 w-6" /></span>
            <p className="mt-3 text-sm font-semibold text-midnight">Nothing here</p>
            <p className="mt-1 text-xs text-slatey">You're all caught up for this view.</p>
          </div>
        ) : (
          <ul className="divide-y divide-midnight/5">
            {filtered.map((task, i) => {
              const pm = priorityMeta[task.priority];
              const done = task.listId === 'list-5';
              const overdue = isOverdue(task.dueDate) && !done;
              const taskLabels = labels.filter((l) => task.labelIds.includes(l.id));
              const assignees = task.assigneeIds.map((id) => users.find((u) => u.id === id)).filter(Boolean) as typeof users;
              return (
                <motion.li
                  key={task.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Link to={`/app/boards/${task.boardId}`} className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-midnight/[0.02]">
                    {done ? <CheckCircle2 className="h-4 w-4 shrink-0 text-sage" /> : <Circle className="h-4 w-4 shrink-0 text-slatey-300" />}
                    <span className={cx('h-2 w-2 shrink-0 rounded-full', pm.dot)} />
                    <div className="min-w-0 flex-1">
                      <p className={cx('truncate text-sm font-semibold', done ? 'text-slatey-400 line-through' : 'text-midnight')}>{task.title}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {taskLabels.map((l) => (
                          <span key={l.id} className={cx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold', labelColorClasses[l.color].pill)}>
                            <span className={cx('h-1 w-1 rounded-full', labelColorClasses[l.color].dot)} />
                            {l.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className={cx('hidden items-center gap-1 text-2xs font-medium sm:flex', overdue ? 'text-coral' : done ? 'text-sage' : 'text-slatey-400')}>
                      <Clock className="h-3 w-3" />
                      {task.dueDate ? relativeDay(new Date(task.dueDate)) : 'No date'}
                    </span>
                    <AvatarStack people={assignees} size="xs" max={2} />
                  </Link>
                </motion.li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
