import {
  AlertTriangle, CalendarClock, Check, GitBranch, Link2, Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
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
  const { users, labels, lists, tasks, updateTask, deleteTask, createTask } = useApp();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [assigneeIds, setAssigneeIds] = useState<string[]>([]);
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (task) {
      setTitle(task.title);
      setDescription(task.description);
      setPriority(task.priority);
      setDueDate(task.dueDate ? task.dueDate.slice(0, 10) : '');
      setAssigneeIds(task.assigneeIds);
      setLabelIds(task.labelIds);
    }
  }, [task]);

  if (!task) return null;

  const isNew = task.id.startsWith('temp-');
  const list = lists.find((l) => l.id === task.listId);
  const pm = priorityMeta[priority];
  const overdue = isOverdue(task.dueDate) && task.listId !== 'list-5';
  const blockedByTasks = task.blockedByIds.length;

  const toggleAssignee = (id: string) => setAssigneeIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const toggleLabel = (id: string) => setLabelIds((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);

  const handleSave = async () => {
    if (!title.trim()) { toast({ type: 'error', title: 'Title required', message: 'Give the task a name before saving.' }); return; }
    setSaving(true);
    const patch = {
      title: title.trim(),
      description: description.trim(),
      priority,
      dueDate: dueDate ? new Date(dueDate + 'T09:00:00').toISOString() : null,
      assigneeIds,
      labelIds,
    };
    if (isNew) {
      await createTask({ ...task, ...patch });
      toast({ type: 'success', title: 'Task created', message: `"${title}" added to ${list?.name}.` });
    } else {
      const deadlineChanged = dueDate && task.dueDate && new Date(dueDate).getTime() !== new Date(task.dueDate.slice(0, 10)).getTime();
      await updateTask(task.id, {
        ...patch,
        deadlineChanges: deadlineChanged ? task.deadlineChanges + 1 : task.deadlineChanges,
      });
      toast({ type: 'success', title: 'Task updated', message: deadlineChanged ? 'Due date updated — drift signal refreshed.' : 'Changes saved.' });
    }
    setSaving(false);
    onClose();
  };

  const handleDelete = async () => {
    await deleteTask(task.id);
    toast({ type: 'info', title: 'Task deleted', message: `"${task.title}" was removed.` });
    onClose();
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
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Task title"
              className="w-full rounded-lg border border-transparent bg-transparent px-2 py-1 font-display text-2xl font-bold text-midnight placeholder:text-slatey-300 focus:border-midnight/15 focus:bg-white focus:outline-none focus:ring-2 focus:ring-mint-200/50 -mx-2"
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
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

            {!isNew && task.blockedByIds.length > 0 && (
              <div className="mt-5">
                <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">Blocked by</p>
                <div className="mt-2 space-y-1.5">
                  {task.blockedByIds.map((bid) => {
                    const bt = tasks.find((x) => x.id === bid);
                    if (!bt) return null;
                    return (
                      <div key={bid} className="flex items-center gap-2 rounded-lg bg-porcelain-50 px-3 py-2 text-xs">
                        <GitBranch className="h-3.5 w-3.5 text-amber" />
                        <span className="font-medium text-midnight">{bt.title}</span>
                      </div>
                    );
                  })}
                </div>
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
                      className={cx(
                        'flex items-center gap-1.5 rounded-full border px-1.5 py-1 text-2xs font-medium transition-all',
                        selected ? 'border-midnight/15 bg-white shadow-soft' : 'border-transparent hover:bg-white/60',
                      )}
                      title={u.name}
                    >
                      <Avatar initials={u.initials} color={u.color} size="xs" />
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

            {!isNew && (
              <div className="border-t border-midnight/8 pt-4">
                <p className="text-2xs text-slatey-400">Created {formatDate(task.createdAt)} · Updated {formatDate(task.updatedAt, { relative: true })}</p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-midnight/8 bg-white px-6 py-4">
          {!isNew ? (
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-coral hover:bg-coral/10">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : isNew ? 'Create task' : 'Save changes'}
            </Button>
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
