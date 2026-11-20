import {
  AlertTriangle, CalendarClock, Check, GitBranch, Link2, Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Badge, Button } from '@/components/ui';
import { Modal, ModalCloseButton } from '@/components/ui/Modal';
import { useApp } from '@/hooks/useApp';
import { useToast } from '@/components/ui/Toast';
import {
  cx, formatDate, isOverdue, labelColorClasses, priorityMeta, priorityOrder, relativeDay,
} from '@/lib/utils';
import type { Priority, Task } from '@/types';

interface TaskDetailModalProps {
  task: Task | null;
  onClose: () => void;
}

export function TaskDetailModal({ task, onClose }: TaskDetailModalProps) {
  const { currentUser, users, labels, lists, tasks, updateTask, deleteTask, createTask } = useApp();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [blockedByIds, setBlockedByIds] = useState<string[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [saving, setSaving] = useState(false);
  const initializedTaskId = useRef<string | null>(null);

  useEffect(() => {
    if (!task) {
      initializedTaskId.current = null;
      return;
    }

    if (initializedTaskId.current === task.id) return;
    initializedTaskId.current = task.id;
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : '');
    setAssigneeIds(task.assigneeIds);
    setLabelIds(task.labelIds);
    setBlockedByIds(task.blockedByIds);
    setIsComplete(Boolean(task.completedAt));
  }, [task]);

  if (!task) return null;

  const isNew = task.id.startsWith('temp-');
  const canEdit = currentUser?.role === 'owner' || currentUser?.role === 'member';
  const canDelete = currentUser?.role === 'owner';
  const list = lists.find((l) => l.id === task.listId);
  const pm = priorityMeta[priority];
  const overdue = isOverdue(task.dueDate) && !task.completedAt;
  const blockerOptions = tasks.filter((candidate) => (
    candidate.boardId === task.boardId && candidate.id !== task.id
  ));
  const selectedBlockers = blockedByIds
    .map((id) => blockerOptions.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is Task => candidate !== undefined);
  const blockedByTasks = blockedByIds.length;

  const toggleAssignee = (id: string) => setAssigneeIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const toggleLabel = (id: string) => setLabelIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const toggleBlocker = (id: string) => setBlockedByIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const handleSave = async () => {
    if (!canEdit) return;
    if (!title.trim()) { toast({ type: 'error', title: 'Title required', message: 'Give the task a name before saving.' }); return; }
    setSaving(true);
    const patch = {
      title: title.trim(),
      description: description.trim(),
      priority,
      dueDate: dueDate ? new Date(dueDate + 'T09:00:00').toISOString() : null,
      assigneeIds,
      labelIds,
      blockedByIds,
      completedAt: isComplete ? task.completedAt ?? new Date().toISOString() : null,
    };
    try {
      if (isNew) {
        await createTask({ ...task, ...patch, blockedByIds });
        toast({ type: 'success', title: 'Task created', message: `"${title}" added to ${list?.name}.` });
      } else {
        const deadlineChanged = dueDate && task.dueDate && new Date(dueDate).getTime() !== new Date(task.dueDate.slice(0, 10)).getTime();
        await updateTask(task.id, patch);
        toast({ type: 'success', title: 'Task updated', message: deadlineChanged ? 'Due date updated — drift signal refreshed.' : 'Changes saved.' });
      }
      onClose();
    } catch (cause) {
      toast({ type: 'error', title: 'Could not save task', message: cause instanceof Error ? cause.message : 'Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteTask(task.id);
      toast({ type: 'info', title: 'Task deleted', message: `"${task.title}" was removed.` });
      onClose();
    } catch (cause) {
      toast({ type: 'error', title: 'Could not delete task', message: cause instanceof Error ? cause.message : 'Please try again.' });
    }
  };

  return (
    <Modal open={!!task} onClose={onClose} size="xl" label={isNew ? 'Create task' : 'Edit task'}>
      <div className="overflow-hidden rounded-2xl border border-midnight/10 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-midnight/8 bg-porcelain-50 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <span className={cx('h-2.5 w-2.5 rounded-full', pm.dot)} />
            <span className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">{list?.name ?? 'Task'}</span>
            {overdue && <Badge tone="coral" dot>Overdue</Badge>}
            {task.deadlineChanges >= 2 && <Badge tone="amber">Deadline moved {task.deadlineChanges}×</Badge>}
            {blockedByTasks > 0 && <Badge tone="amber">Blocked by {blockedByTasks}</Badge>}
          </div>
          <ModalCloseButton onClose={onClose} />
        </div>

        <div className="grid gap-0 lg:grid-cols-[1fr_300px]">
          <div className="px-6 py-5">
            <label htmlFor="task-title" className="mb-1 block text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">
              Task title
            </label>
            <input
              id="task-title"
              aria-label="Task title"
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              placeholder="Task title"
              className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 font-display text-2xl font-bold text-midnight placeholder:text-slatey-300 focus:border-midnight/15 focus:bg-white focus:outline-none focus:ring-2 focus:ring-mint-200/50 -mx-2"
            />
            <label htmlFor="task-description" className="sr-only">Description</label>
            <textarea
              id="task-description"
              aria-label="Description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit}
              placeholder="Add a description…"
              rows={5}
              className="mt-3 w-full resize-none rounded-lg border border-midnight/10 bg-porcelain-50 px-3 py-2.5 text-sm text-midnight placeholder:text-slatey-400 focus:border-midnight/20 focus:bg-white focus:outline-none focus:ring-2 focus:ring-mint-200/40"
            />

            {!isNew && (overdue || task.deadlineChanges >= 2 || task.stagnationDays >= 4 || blockedByTasks > 0) && (
              <div className="mt-5 rounded-xl border border-amber/20 bg-amber/[0.06] p-4">
                <p className="flex items-center gap-1.5 text-xs font-bold text-amber"><AlertTriangle className="h-3.5 w-3.5" /> Drift signals detected</p>
                <ul className="mt-2 space-y-1.5 text-xs text-midnight/70">
                  {overdue && <li className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-coral" /> Overdue — {relativeDay(new Date(task.dueDate!))}</li>}
                  {task.deadlineChanges >= 2 && <li className="flex items-center gap-2"><CalendarClock className="h-3 w-3 text-amber" /> Deadline moved {task.deadlineChanges} times — scope may be unstable</li>}
                  {task.stagnationDays >= 4 && <li className="flex items-center gap-2"><AlertTriangle className="h-3 w-3 text-apricot-400" /> {task.stagnationDays} days without movement</li>}
                  {blockedByTasks > 0 && <li className="flex items-center gap-2"><Link2 className="h-3 w-3 text-amber" /> Waiting on {blockedByTasks} task{blockedByTasks > 1 ? 's' : ''}</li>}
                </ul>
              </div>
            )}

          </div>

          <div className="space-y-5 border-t border-midnight/8 bg-porcelain-50/60 px-6 py-5 lg:border-l lg:border-t-0">
            <Field label="Priority">
              <div className="grid grid-cols-2 gap-1.5">
                {priorityOrder.map((p) => (
                  <button
                    key={p}
                    onClick={() => setPriority(p)}
                    disabled={!canEdit}
                    className={cx(
                      'flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-2xs font-semibold transition-all',
                      priority === p ? 'border-midnight/20 bg-white shadow-soft' : 'border-transparent hover:bg-white/60',
                    )}
                  >
                    <span className={cx('h-2 w-2 rounded-full', priorityMeta[p].dot)} />
                    {priorityMeta[p].label}
                    {priority === p && <Check className="ml-auto h-3 w-3 text-midnight" />}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Due date">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={!canEdit}
                className="w-full rounded-lg border border-midnight/10 bg-white px-3 py-2 text-sm text-midnight focus:border-midnight/20 focus:outline-none focus:ring-2 focus:ring-mint-200/40"
              />
              {task.dueDate && !isNew && (
                <p className="mt-1.5 text-2xs text-slatey-400">Currently {relativeDay(new Date(task.dueDate))}</p>
              )}
            </Field>

            <Field label="Assignees">
              <div className="flex flex-wrap gap-1.5">
                {users.map((u) => {
                  const selected = assigneeIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      onClick={() => toggleAssignee(u.id)}
                      disabled={!canEdit}
                      className={cx(
                        'flex items-center gap-1.5 rounded-full border px-1.5 py-1 text-2xs font-medium transition-all',
                        selected ? 'border-midnight/15 bg-white shadow-soft' : 'border-transparent hover:bg-white/60',
                      )}
                      title={u.name}
                    >
                      <Avatar initials={u.initials} color={u.color} size="xs" avatarUrl={u.avatarUrl} />
                      <span className={selected ? 'text-midnight' : 'text-slatey-500'}>{u.name.split(' ')[0]}</span>
                      {selected && <Check className="h-3 w-3 text-midnight" />}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Labels">
              <div className="flex flex-wrap gap-1.5">
                {labels.map((l) => {
                  const selected = labelIds.includes(l.id);
                  return (
                    <button
                      key={l.id}
                      onClick={() => toggleLabel(l.id)}
                      disabled={!canEdit}
                      className={cx(
                        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold transition-all',
                        selected ? labelColorClasses[l.color].pill : 'bg-midnight/5 text-slatey-400 hover:bg-midnight/10',
                      )}
                    >
                      <span className={cx('h-1.5 w-1.5 rounded-full', selected ? labelColorClasses[l.color].dot : 'bg-slatey-300')} />
                      {l.name}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Blocked by">
              {selectedBlockers.length > 0 ? (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {selectedBlockers.map((blocker) => (
                    <span key={blocker.id} className="inline-flex items-center gap-1 rounded-full bg-amber/10 px-2.5 py-1 text-2xs font-semibold text-amber">
                      <GitBranch className="h-3 w-3" />
                      {blocker.title}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mb-2 text-2xs text-slatey-400">
                  {isNew ? 'No blockers selected.' : 'No blockers.'}
                </p>
              )}
              {isNew || canEdit ? (
                blockerOptions.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {blockerOptions.map((blocker) => {
                      const selected = blockedByIds.includes(blocker.id);
                      return (
                        <button
                          key={blocker.id}
                          type="button"
                          aria-label={`Toggle blocker: ${blocker.title}`}
                          aria-pressed={selected}
                          onClick={() => toggleBlocker(blocker.id)}
                          disabled={!canEdit}
                          className={cx(
                            'flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors',
                            selected ? 'border-amber/30 bg-white text-midnight' : 'border-transparent text-slatey-500 hover:bg-white/70',
                          )}
                        >
                          <GitBranch className="h-3.5 w-3.5 shrink-0 text-amber" />
                          <span className="min-w-0 flex-1 truncate">{blocker.title}</span>
                          {selected && <Check className="h-3.5 w-3.5 text-amber" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-2xs text-slatey-400">No other tasks on this board.</p>
                )
              ) : (
                <p className="text-2xs text-slatey-400">Dependencies are read-only for your workspace role.</p>
              )}
            </Field>

            {!isNew && (
              <div className="border-t border-midnight/8 pt-4">
                <p className="text-2xs text-slatey-400">Created {formatDate(task.createdAt)} · Updated {formatDate(task.updatedAt, { relative: true })}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-midnight/8 bg-white px-6 py-4">
          {!isNew && canDelete ? (
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-coral hover:bg-coral/10">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            {!isNew && canEdit && (
              <Button variant="outline" size="sm" onClick={() => setIsComplete((value) => !value)}>
                <Check className="h-3.5 w-3.5" /> {isComplete ? 'Reopen' : 'Mark complete'}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            {canEdit && <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create task' : 'Save changes'}
            </Button>}
          </div>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">{label}</p>
      {children}
    </div>
  );
}
