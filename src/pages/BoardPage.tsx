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
import { Plus, Search, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { TaskCard } from '@/components/board/TaskCard';
import { TaskDetailModal } from '@/components/board/TaskDetailModal';
import { Badge, Button } from '@/components/ui';
import { useApp } from '@/hooks/useApp';
import { cx, isOverdue, labelColorClasses, priorityMeta } from '@/lib/utils';
import type { Task } from '@/types';

export function BoardPage() {
  const { boardId } = useParams();
  const { boards, lists, tasks, labels, users, updateTask, createTask, loading } = useApp();
  const board = boards.find((b) => b.id === (boardId ?? 'b1')) ?? boards[0];
  const boardLists = lists.filter((l) => l.boardId === (board?.id ?? 'b1'));
  const boardTasks = tasks.filter((t) => t.boardId === (board?.id ?? 'b1'));

  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [query, setQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('ALL');

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

  const handleDragStart = (e: DragStartEvent) => {
    const t = boardTasks.find((x) => x.id === e.active.id);
    if (t) setActiveTask(t);
  };

  const handleDragEnd = async (e: DragEndEvent) => {
    setActiveTask(null);
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
        // Reindex siblings
        for (let i = 0; i < listTasks.length; i++) {
          if (listTasks[i].position !== i) {
            updateTask(listTasks[i].id, { position: i });
          }
        }
      } else {
        const listTasks = boardTasks.filter((t) => t.listId === targetListId).sort((a, b) => a.position - b.position);
        const overIndex = listTasks.findIndex((t) => t.id === overId);
        targetPosition = overIndex >= 0 ? listTasks[overIndex].position : listTasks.length;
        // Shift down tasks at/after target
        for (const t of listTasks) {
          if (t.position >= targetPosition) {
            updateTask(t.id, { position: t.position + 1 });
          }
        }
      }
    }

    if (activeTaskObj.listId !== targetListId || activeTaskObj.position !== targetPosition) {
      updateTask(activeId, { listId: targetListId, position: targetPosition });
    }
  };

  const openNewTask = (listId: string) => {
    setEditingTask({
      id: `temp-${Date.now()}`,
      title: '',
      description: '',
      listId,
      boardId: board?.id ?? 'b1',
      position: tasksByList(listId).length,
      priority: 'MEDIUM',
      dueDate: null,
      assigneeIds: [],
      labelIds: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deadlineChanges: 0,
      stagnationDays: 0,
      blockedByIds: [],
      estimateHours: null,
    });
  };

  if (loading || !board) {
    return <BoardSkeleton />;
  }

  const completedCount = boardTasks.filter((t) => t.listId === 'list-5').length;
  const overdueCount = boardTasks.filter((t) => isOverdue(t.dueDate) && t.listId !== 'list-5').length;

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
            <Button variant="primary" size="md" onClick={() => openNewTask(boardLists[0]?.id ?? 'list-1')}>
              <Plus className="h-4 w-4" /> Add task
            </Button>
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
            <TaskCard task={activeTask} labels={labels} users={users} onClick={() => {}} isOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskDetailModal task={editingTask} onClose={() => setEditingTask(null)} />
    </div>
  );
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
        {Array.from({ length: 5 }).map((_, i) => (
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
