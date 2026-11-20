import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { Plus, Search, SlidersHorizontal, ChevronDown, Tag } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { TaskCard } from '@/components/board/TaskCard';
import { TaskDetailModal } from '@/components/board/TaskDetailModal';
import { Badge, Button, Modal, ModalCloseButton } from '@/components/ui';
import { useApp } from '@/hooks/useApp';
import { cx, isOverdue, labelColorClasses } from '@/lib/utils';
import type { Task } from '@/types';
import { boardService, labelService, listService } from '@/services';
import { useToast } from '@/components/ui/Toast';
import type { FormEvent } from 'react';

export function BoardPage() {
  const { boardId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { boards, lists, tasks, labels, users, currentUser, updateTask, loading, error, workspace, reloadWorkspace } = useApp();
  const { toast } = useToast();
  const board = boards.find((b) => b.id === boardId) ?? boards[0];
  const boardLists = lists.filter((l) => l.boardId === board?.id);
  const boardTasks = tasks.filter((t) => t.boardId === board?.id);
  const canEditTasks = currentUser?.role === 'owner' || currentUser?.role === 'member';

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');
  const [createListOpen, setCreateListOpen] = useState(false);
  const [listName, setListName] = useState('');
  const [creatingList, setCreatingList] = useState(false);
  const [manageLabelsOpen, setManageLabelsOpen] = useState(false);
  const [labelName, setLabelName] = useState('');
  const [creatingLabel, setCreatingLabel] = useState(false);
  const handledTaskRequestKey = useRef<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const filteredTasks = useMemo(() => {
    return boardTasks.filter((t) => {
      if (priorityFilter !== 'ALL' && t.priority !== priorityFilter) return false;
      if (query && !t.title.toLowerCase().includes(query.toLowerCase())) return false;
      return true;
    });
  }, [boardTasks, query, priorityFilter]);

  const tasksByList = (listId: string) => filteredTasks.filter((t) => t.listId === listId).sort((a, b) => a.position - b.position);
  const openNewTask = useCallback((listId: string) => {
    if (!board || !canEditTasks) return;
    setEditingTask(createTaskDraft(
      board.id,
      listId,
      filteredTasks.filter((task) => task.listId === listId).length,
    ));
  }, [board, canEditTasks, filteredTasks]);

  const shouldOpenNewTask = (location.state as { openNewTask?: unknown } | null)?.openNewTask === true;

  useEffect(() => {
    if (
      !shouldOpenNewTask
      || handledTaskRequestKey.current === location.key
      || loading
      || error
      || !board
      || !canEditTasks
    ) return;

    const firstList = boardLists[0];
    if (!firstList) return;

    handledTaskRequestKey.current = location.key;
    openNewTask(firstList.id);
    navigate(
      { pathname: location.pathname, search: location.search, hash: location.hash },
      { replace: true, state: null },
    );
  }, [
    shouldOpenNewTask,
    loading,
    error,
    board,
    canEditTasks,
    boardLists,
    location.key,
    location.pathname,
    location.search,
    location.hash,
    navigate,
    openNewTask,
  ]);

  const handleDragStart = (e: DragStartEvent) => {
    const t = boardTasks.find((x) => x.id === e.active.id);
    if (t) setActiveTask(t);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveTask(null);
    try {
      const { active, over } = e;
      if (!over) return;

      const activeId = String(active.id);
      const overId = String(over.id);
      const activeTaskObj = boardTasks.find((t) => t.id === activeId);
      if (!activeTaskObj) return;

    // Determine target list
      let targetListId: string;
      let targetPosition: number;

      if (overId.startsWith('list-drop-')) {
        targetListId = overId.replace('list-drop-', '');
        const listTasks = boardTasks.filter((t) => t.listId === targetListId).sort((a, b) => a.position - b.position);
        targetPosition = listTasks.length;
      } else {
        const overTask = boardTasks.find((t) => t.id === overId);
        if (!overTask) return;
        targetListId = overTask.listId;

        if (activeTaskObj.listId === targetListId) {
          const listTasks = boardTasks.filter((t) => t.listId === targetListId && t.id !== activeId).sort((a, b) => a.position - b.position);
          const overIndex = listTasks.findIndex((t) => t.id === overId);
          targetPosition = overIndex >= 0 ? overIndex : listTasks.length;
          for (let i = 0; i < listTasks.length; i++) {
            if (listTasks[i].position !== i) {
              await updateTask(listTasks[i].id, { position: i });
            }
          }
        } else {
          const listTasks = boardTasks.filter((t) => t.listId === targetListId).sort((a, b) => a.position - b.position);
          const overIndex = listTasks.findIndex((t) => t.id === overId);
          targetPosition = overIndex >= 0 ? listTasks[overIndex].position : listTasks.length;
          for (const t of listTasks) {
            if (t.position >= targetPosition) {
              await updateTask(t.id, { position: t.position + 1 });
            }
          }
        }
      }

      if (activeTaskObj.listId !== targetListId || activeTaskObj.position !== targetPosition) {
        await updateTask(activeId, { listId: targetListId, position: targetPosition });
      }
    } catch (cause) {
      toast({ type: 'error', title: 'Could not move task', message: cause instanceof Error ? cause.message : 'Please try again.' });
    }
  };

  const editBoard = async () => {
    if (!board) return;
    const name = window.prompt('Board name', board.name);
    if (!name?.trim()) return;
    try {
      await boardService.update(board.id, { name: name.trim() });
      window.location.reload();
    } catch (cause) {
      toast({ type: 'error', title: 'Could not update board', message: cause instanceof Error ? cause.message : 'Please try again.' });
    }
  };

  const createList = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!board || !workspace) return;
    const name = listName.trim();
    if (!name) return;
    setCreatingList(true);
    try {
      await listService.create(board.id, name);
      setListName('');
      setCreateListOpen(false);
      toast({ type: 'success', title: 'List created', message: `${name} was added to ${board.name}.` });
      try {
        await reloadWorkspace(workspace.id);
      } catch (cause) {
        toast({
          type: 'error',
          title: 'List created, but refresh failed',
          message: cause instanceof Error ? cause.message : 'Reload the workspace to see the new list.',
        });
      }
    } catch (cause) {
      toast({
        type: 'error',
        title: 'Could not create list',
        message: cause instanceof Error ? cause.message : 'Please try again.',
      });
    } finally {
      setCreatingList(false);
    }
  };

  const createLabel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!board || !workspace) return;
    const name = labelName.trim();
    if (!name) return;
    setCreatingLabel(true);
    try {
      await labelService.create(board.id, name);
      setLabelName('');
      toast({ type: 'success', title: 'Label created', message: `${name} is now available on ${board.name}.` });
      try {
        await reloadWorkspace(workspace.id);
      } catch (cause) {
        toast({
          type: 'error',
          title: 'Label created, but refresh failed',
          message: cause instanceof Error ? cause.message : 'Reload the workspace to see the new label.',
        });
      }
    } catch (cause) {
      toast({
        type: 'error',
        title: 'Could not create label',
        message: cause instanceof Error ? cause.message : 'Please try again.',
      });
    } finally {
      setCreatingLabel(false);
    }
  };

  const deleteBoard = async () => {
    if (!board || !window.confirm(`Delete "${board.name}" and its tasks?`)) return;
    try {
      await boardService.remove(board.id);
      window.location.assign('/app/boards');
    } catch (cause) {
      toast({ type: 'error', title: 'Could not delete board', message: cause instanceof Error ? cause.message : 'Please try again.' });
    }
  };

  if (loading) {
    return <BoardSkeleton />;
  }
  if (error) {
    return <p role="alert" className="p-8 text-sm text-coral">{error}</p>;
  }
  if (!workspace) {
    return <p role="status" className="p-8 text-sm text-slatey">You do not have access to a workspace yet. Ask a workspace owner to add you.</p>;
  }
  if (!board) {
    return <p role="status" className="p-8 text-sm text-slatey">No boards are available in this workspace.</p>;
  }

  const completedCount = boardTasks.filter((t) => t.completedAt).length;
  const overdueCount = boardTasks.filter((t) => isOverdue(t.dueDate) && !t.completedAt).length;

  return (
    <div className="flex h-full flex-col">
      {/* Board header */}
      <div className="border-b border-midnight/8 bg-porcelain/60 px-6 py-5 md:px-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">
              <Link to="/app/boards" className="hover:text-midnight">Boards</Link>
              <span>/</span>
              <span className="text-midnight">{board.name}</span>
            </div>
            <h1 className="mt-1.5 font-display text-2xl font-bold tracking-tightish text-midnight">{board.name}</h1>
            <p className="mt-1 text-sm text-slatey">{board.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-xl border border-midnight/10 bg-white px-3 py-2">
              <Search className="h-4 w-4 text-slatey-400" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter tasks…"
                className="w-32 bg-transparent text-sm text-midnight placeholder:text-slatey-400 focus:outline-none sm:w-44"
              />
            </div>
            <div className="relative">
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value)}
                className="appearance-none rounded-xl border border-midnight/10 bg-white py-2 pl-3 pr-8 text-sm font-medium text-midnight focus:outline-none focus:ring-2 focus:ring-mint-200/40"
              >
                <option value="ALL">All priorities</option>
                <option value="URGENT">Urgent</option>
                <option value="HIGH">High</option>
                <option value="MEDIUM">Medium</option>
                <option value="LOW">Low</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slatey-400" />
            </div>
            <Button variant="primary" size="md" onClick={() => boardLists[0] && openNewTask(boardLists[0].id)} disabled={!boardLists[0] || !canEditTasks}>
              <Plus className="h-4 w-4" /> Add task
            </Button>
            <Button variant="outline" size="md" onClick={() => setCreateListOpen(true)} disabled={!canEditTasks}>
              <Plus className="h-4 w-4" /> Add list
            </Button>
            <Button variant="outline" size="md" onClick={() => setManageLabelsOpen(true)} disabled={!canEditTasks}>
              <Tag className="h-4 w-4" /> Manage Labels
            </Button>
            <Button variant="outline" size="md" onClick={editBoard}>Edit board</Button>
            <Button variant="outline" size="md" onClick={deleteBoard}>Delete board</Button>
          </div>
        </div>

        {/* Board meta strip */}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-2xs font-medium">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-slatey">
            <span className={cx('h-1.5 w-1.5 rounded-full', labelColorClasses[board.color].dot)} />
            {boardTasks.length} tasks
          </span>
          <Badge tone="sage" dot>{completedCount} completed</Badge>
          {overdueCount > 0 && <Badge tone="coral" dot>{overdueCount} overdue</Badge>}
          <span className="text-slatey-400">·</span>
          <span className="inline-flex items-center gap-1.5 text-slatey-500">
            <SlidersHorizontal className="h-3 w-3" /> {boardLists.length} lists
          </span>
        </div>
      </div>

      {/* Board columns */}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className="flex-1 overflow-x-auto">
          <div className="flex min-w-max gap-4 px-6 py-5 md:px-8">
            {boardLists.map((list) => {
              const listTasks = tasksByList(list.id);
              return (
                <div key={list.id} className="flex w-[300px] shrink-0 flex-col">
                  {/* List header */}
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={cx('h-2 w-2 rounded-full', labelColorClasses[list.color].dot)} />
                      <h2 className="text-sm font-bold text-midnight">{list.name}</h2>
                      <span className="rounded-full bg-midnight/5 px-1.5 py-0.5 text-2xs font-semibold text-slatey-400">{listTasks.length}</span>
                    </div>
                    <button
                      onClick={() => openNewTask(list.id)}
                      disabled={!canEditTasks}
                      className="flex h-6 w-6 items-center justify-center rounded-md text-slatey-400 transition-colors hover:bg-midnight/5 hover:text-midnight"
                      aria-label={`Add task to ${list.name}`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* List body — droppable */}
                  <div
                    id={`list-drop-${list.id}`}
                    data-list-id={list.id}
                    className="flex min-h-[120px] flex-1 flex-col gap-2.5 rounded-2xl bg-midnight/[0.025] p-2 transition-colors"
                  >
                    <SortableContext items={listTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                      {listTasks.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          labels={labels}
                          users={users}
                          onClick={() => setEditingTask(task)}
                          readOnly={!canEditTasks}
                        />
                      ))}
                    </SortableContext>

                    {listTasks.length === 0 && (
                      <button
                        onClick={() => openNewTask(list.id)}
                        className="flex flex-col items-center justify-center rounded-xl border border-dashed border-midnight/10 py-6 text-slatey-400 transition-colors hover:border-midnight/20 hover:text-midnight"
                      >
                        <Plus className="h-4 w-4" />
                        <span className="mt-1 text-2xs font-medium">Add a task</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <DragOverlay>
          {activeTask ? (
            <TaskCard task={activeTask} labels={labels} users={users} onClick={() => {}} isOverlay readOnly={!canEditTasks} />
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskDetailModal task={editingTask} onClose={() => setEditingTask(null)} />
      <Modal open={manageLabelsOpen} onClose={() => !creatingLabel && setManageLabelsOpen(false)} size="md" label="Manage labels">
        <div className="overflow-hidden rounded-2xl border border-midnight/10 bg-white shadow-lift">
          <div className="relative border-b border-midnight/8 bg-porcelain-50 px-6 py-4">
            <h2 className="font-display text-base font-bold text-midnight">Manage labels</h2>
            <p className="mt-1 text-xs text-slatey">Labels for {board.name}.</p>
            <ModalCloseButton onClose={() => !creatingLabel && setManageLabelsOpen(false)} />
          </div>
          <div className="space-y-5 px-6 py-6">
            <div>
              <h3 className="text-sm font-semibold text-midnight">Existing labels</h3>
              {labels.filter((label) => label.boardId === board.id).length > 0 ? (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {labels.filter((label) => label.boardId === board.id).map((label) => (
                    <li key={label.id} className={cx('rounded-full px-3 py-1 text-xs font-semibold', labelColorClasses[label.color].pill)}>
                      {label.name}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slatey-400">No labels on this board yet.</p>
              )}
            </div>
            <form onSubmit={createLabel} className="space-y-4 border-t border-midnight/8 pt-4">
              <label className="block text-sm font-medium text-midnight">
                Label name
                <input
                  autoFocus
                  required
                  value={labelName}
                  onChange={(event) => setLabelName(event.target.value)}
                  placeholder="e.g. Research"
                  className="mt-1.5 w-full rounded-xl border border-midnight/10 px-3 py-2.5 text-sm outline-none focus:border-mint-400"
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setManageLabelsOpen(false)} disabled={creatingLabel}>
                  Close
                </Button>
                <Button type="submit" variant="primary" disabled={creatingLabel || !labelName.trim()}>
                  {creatingLabel ? 'Creating...' : 'Create label'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </Modal>
      <Modal open={createListOpen} onClose={() => !creatingList && setCreateListOpen(false)} size="md" label="Create board list">
        <form onSubmit={createList} className="overflow-hidden rounded-2xl border border-midnight/10 bg-white shadow-lift">
          <div className="relative border-b border-midnight/8 bg-porcelain-50 px-6 py-4">
            <h2 className="font-display text-base font-bold text-midnight">Create a list</h2>
            <p className="mt-1 text-xs text-slatey">Add a new column to {board.name}.</p>
            <ModalCloseButton onClose={() => !creatingList && setCreateListOpen(false)} />
          </div>
          <div className="space-y-5 px-6 py-6">
            <label className="block text-sm font-medium text-midnight">
              List name
              <input
                autoFocus
                required
                maxLength={200}
                value={listName}
                onChange={(event) => setListName(event.target.value)}
                placeholder="e.g. To do"
                className="mt-1.5 w-full rounded-xl border border-midnight/10 px-3 py-2.5 text-sm outline-none focus:border-mint-400"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setCreateListOpen(false)} disabled={creatingList}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={creatingList || !listName.trim()}>
                {creatingList ? 'Creating...' : 'Create list'}
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function createTaskDraft(boardId: string, listId: string, position: number): Task {
  const now = new Date().toISOString();
  return {
    id: `temp-${Date.now()}`,
    title: '',
    description: '',
    listId,
    boardId,
    position,
    priority: 'MEDIUM',
    dueDate: null,
    assigneeIds: [],
    labelIds: [],
    createdAt: now,
    updatedAt: now,
    deadlineChanges: 0,
    completedAt: null,
    stagnationDays: 0,
    blockedByIds: [],
    estimateHours: null,
  };
}

function BoardSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-midnight/8 px-8 py-5">
        <div className="skeleton h-4 w-32" />
        <div className="skeleton mt-3 h-7 w-64" />
        <div className="skeleton mt-2 h-3 w-80" />
      </div>
      <div className="flex gap-4 px-8 py-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="w-[300px] space-y-3">
            <div className="skeleton h-5 w-24" />
            <div className="skeleton h-24 w-full rounded-xl" />
            <div className="skeleton h-24 w-full rounded-xl" />
          </div>
        ))}
      </div>
    </div>
  );
}
