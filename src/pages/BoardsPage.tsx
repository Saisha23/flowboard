import { motion } from 'framer-motion';
import { ArrowRight, KanbanSquare, Plus, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AvatarStack, Badge, Button, Card } from '@/components/ui';
import { ProgressBar } from '@/components/ui/Progress';
import { useApp } from '@/hooks/useApp';
import { cx, isOverdue, labelColorClasses } from '@/lib/utils';

export function BoardsPage() {
  const { boards, lists, tasks, users } = useApp();

  return (
    <div className="mx-auto max-w-[1400px] px-6 py-8 md:px-10">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-2xs font-semibold uppercase tracking-widest2 text-slatey-400">Workspace</p>
          <h1 className="mt-1.5 font-display text-display-md font-bold tracking-tightish text-midnight">Boards</h1>
          <p className="mt-2 text-sm text-slatey">All active boards in Atlas Studio.</p>
        </div>
        <Button variant="primary" size="md"><Plus className="h-4 w-4" /> New board</Button>
      </div>

      <div className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {boards.map((board, i) => {
          const boardLists = lists.filter((l) => l.boardId === board.id);
          const boardTasks = tasks.filter((t) => t.boardId === board.id);
          const done = boardTasks.filter((t) => t.listId === 'list-5').length;
          const pct = boardTasks.length ? Math.round((done / boardTasks.length) * 100) : 0;
          const overdue = boardTasks.filter((t) => isOverdue(t.dueDate) && t.listId !== 'list-5').length;
          const assignees = users.filter((u) => boardTasks.some((t) => t.assigneeIds.includes(u.id)));

          return (
            <motion.div
              key={board.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06 }}
            >
              <Link to={`/app/boards/${board.id}`}>
                <Card hover className="group h-full overflow-hidden">
                  <div className="flex items-start justify-between p-5 pb-3">
                    <div className="flex items-center gap-3">
                      <span className={cx('flex h-11 w-11 items-center justify-center rounded-xl', labelColorClasses[board.color].pill)}>
                        <KanbanSquare className="h-5 w-5" />
                      </span>
                      <div>
                        <h3 className="font-display text-base font-bold text-midnight">{board.name}</h3>
                        <p className="text-2xs text-slatey">{boardLists.length} lists · {boardTasks.length} tasks</p>
                      </div>
                    </div>
                    <ArrowRight className="h-4 w-4 text-slatey-300 transition-all group-hover:translate-x-0.5 group-hover:text-midnight" />
                  </div>
                  <div className="px-5 pb-3">
                    <p className="line-clamp-2 text-xs text-slatey">{board.description}</p>
                  </div>
                  <div className="px-5 pb-3">
                    <div className="flex items-center justify-between text-2xs font-medium text-slatey-400">
                      <span>Progress</span>
                      <span className="text-midnight">{pct}%</span>
                    </div>
                    <ProgressBar value={pct} className="mt-1.5" color={labelColorClasses[board.color].dot} />
                  </div>
                  <div className="flex items-center justify-between border-t border-midnight/5 p-5">
                    <AvatarStack people={assignees} size="xs" max={4} />
                    <div className="flex items-center gap-2">
                      {overdue > 0 && <Badge tone="coral" dot>{overdue} overdue</Badge>}
                      <Badge tone="sage" dot>{done} done</Badge>
                    </div>
                  </div>
                </Card>
              </Link>
            </motion.div>
          );
        })}

        {/* New board tile */}
        <button className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border-2 border-dashed border-midnight/10 text-slatey-400 transition-all hover:border-midnight/20 hover:bg-white">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-midnight/5"><Plus className="h-5 w-5" /></span>
          <span className="mt-3 text-sm font-semibold">Create a board</span>
          <span className="mt-1 text-2xs">Start a new project</span>
        </button>
      </div>

      <div className="mt-10 flex items-center gap-2 rounded-2xl border border-midnight/[0.07] bg-white p-5">
        <Users className="h-5 w-5 text-slatey-400" />
        <p className="text-sm text-slatey">
          <span className="font-semibold text-midnight">{users.length} teammates</span> have access to these boards. Manage roles in the Team page.
        </p>
      </div>
    </div>
  );
}
