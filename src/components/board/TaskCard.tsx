import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, CalendarClock, Link2, MessageSquare } from 'lucide-react';
import type { Label, Task, User } from '@/types';
import { AvatarStack } from '@/components/ui/Avatar';
import { cx, isOverdue, labelColorClasses, priorityMeta, relativeDay } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  labels: Label[];
  users: User[];
  onClick: () => void;
  isOverlay?: boolean;
  readOnly?: boolean;
}

export function TaskCard({ task, labels, users, onClick, isOverlay, readOnly }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id, disabled: readOnly, data: { type: 'task', task } });

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const pm = priorityMeta[task.priority];
  const overdue = isOverdue(task.dueDate) && !task.completedAt;
  const taskLabels = labels.filter((l) => task.labelIds.includes(l.id));
  const assignees = task.assigneeIds.map((id) => users.find((u) => u.id === id)).filter(Boolean) as User[];
  const hasDriftSignal = overdue || task.deadlineChanges >= 2 || task.stagnationDays >= 4 || task.blockedByIds.length > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={onClick}
      data-testid={`task-${task.id}`}
      className={cx(
        'group cursor-pointer rounded-xl border border-midnight/[0.08] bg-white p-3.5 transition-all duration-200',
        isOverlay ? 'rotate-2 shadow-lift border-midnight/15' : 'hover:border-midnight/15 hover:shadow-card',
        hasDriftSignal && 'border-l-2',
        hasDriftSignal && (overdue ? 'border-l-coral' : task.blockedByIds.length > 0 ? 'border-l-amber' : 'border-l-apricot-200'),
      )}
    >
      {/* Top row: priority + drift signals */}
      <div className="flex items-center justify-between">
        <span className={cx('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide2', pm.pill)}>
          <span className={cx('h-1.5 w-1.5 rounded-full', pm.dot)} />
          {pm.label}
        </span>
        <div className="flex items-center gap-1 text-slatey-300">
          {task.blockedByIds.length > 0 && <span title="Blocked by another task"><Link2 className="h-3 w-3 text-amber" /></span>}
          {task.deadlineChanges >= 2 && <span title={`Deadline moved ${task.deadlineChanges} times`}><CalendarClock className="h-3 w-3 text-amber" /></span>}
          {task.stagnationDays >= 4 && <span title={`${task.stagnationDays} days idle`}><AlertTriangle className="h-3 w-3 text-apricot-400" /></span>}
          <MessageSquare className="h-3 w-3" />
        </div>
      </div>

      {/* Title */}
      <p className="mt-2.5 text-sm font-semibold leading-snug text-midnight">{task.title}</p>

      {/* Description excerpt */}
      {task.description && (
        <p className="mt-1 line-clamp-2 text-2xs leading-relaxed text-slatey">{task.description}</p>
      )}

      {/* Labels */}
      {taskLabels.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-1">
          {taskLabels.map((l) => (
            <span key={l.id} className={cx('inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold', labelColorClasses[l.color].pill)}>
              <span className={cx('h-1.5 w-1.5 rounded-full', labelColorClasses[l.color].dot)} />
              {l.name}
            </span>
          ))}
        </div>
      )}

      {/* Footer: due date + assignees */}
      <div className="mt-3 flex items-center justify-between border-t border-midnight/5 pt-2.5">
        <span
          className={cx(
            'inline-flex items-center gap-1 text-2xs font-medium',
            overdue ? 'text-coral' : task.dueDate ? 'text-slatey-500' : 'text-slatey-300',
          )}
        >
          <CalendarClock className="h-3 w-3" />
          {task.dueDate ? relativeDay(new Date(task.dueDate)) : 'No date'}
        </span>
        {assignees.length > 0 ? (
          <AvatarStack people={assignees} size="xs" max={3} />
        ) : (
          <span className="text-2xs text-slatey-300">Unassigned</span>
        )}
      </div>
    </div>
  );
}
