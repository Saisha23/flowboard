import {
  ArrowRight, CheckCircle2, Clock, MessageSquare, Plus, Sparkles, UserPlus, GitPullRequest, CalendarClock, Trash2, Info,
} from 'lucide-react';
import type { Activity, User } from '@/types';
import { cx, timeAgo } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

const iconFor: Record<Activity['type'], LucideIcon> = {
  task_moved: ArrowRight,
  task_deleted: Trash2,
  task_created: Plus,
  task_completed: CheckCircle2,
  deadline_changed: CalendarClock,
  assignee_added: UserPlus,
  comment_added: MessageSquare,
  role_changed: GitPullRequest,
  summary_generated: Sparkles,
  activity_recorded: Info,
};

const toneFor: Record<Activity['type'], string> = {
  task_moved: 'text-slatey-500 bg-slatey-100',
  task_deleted: 'text-coral bg-coral/10',
  task_created: 'text-mint-500 bg-mint-50',
  task_completed: 'text-sage bg-sage/12',
  deadline_changed: 'text-amber bg-amber/12',
  assignee_added: 'text-apricot-400 bg-apricot-50',
  comment_added: 'text-slatey-500 bg-slatey-100',
  role_changed: 'text-apricot-400 bg-apricot-50',
  summary_generated: 'text-mint-500 bg-mint-50',
  activity_recorded: 'text-slatey-500 bg-slatey-100',
};

export function ActivityFeed({ items, users, className }: { items: Activity[]; users: User[]; className?: string }) {
  const userById = (id: string) => users.find((u) => u.id === id);
  return (
    <ul className={cx('space-y-1', className)}>
      {items.map((a) => {
        const Icon = iconFor[a.type];
        const actor = userById(a.actorId);
        return (
          <li key={a.id} className="flex items-start gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-midnight/[0.03]">
            <span className={cx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', toneFor[a.type])}>
              <Icon className="h-3.5 w-3.5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm leading-snug text-midnight">
                <span className="font-semibold">{actor?.name ?? 'Someone'}</span>{' '}
                <span className="text-slatey">{a.detail}</span>
              </p>
              <p className="mt-0.5 truncate text-2xs text-slatey-400">
                <Clock className="mr-1 inline h-3 w-3" />
                {timeAgo(a.timestamp)} · {a.target}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
