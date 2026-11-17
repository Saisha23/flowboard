import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Board, Label, List, Task, User, Workspace } from '@/types';
import * as svc from '@/services';

interface AppData {
  currentUser: User | null;
  users: User[];
  workspace: Workspace | null;
  workspaces: Workspace[];
  boards: Board[];
  lists: List[];
  tasks: Task[];
  labels: Label[];
  loading: boolean;
  refreshTasks: (boardId?: string) => Promise<void>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  createTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
}

const Ctx = createContext<AppData | null>(null);

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [cu, u, ws, b, l, lbl] = await Promise.all([
        svc.userService.current(),
        svc.userService.list(),
        svc.workspaceService.list(),
        svc.boardService.list(),
        svc.listService.forBoard('b1'),
        svc.labelService.list(),
      ]);
      setCurrentUser(cu);
      setUsers(u);
      setWorkspaces(ws);
      setWorkspace(ws[0]);
      setBoards(b);
      setLists(l);
      setLabels(lbl);
      const t = await svc.taskService.forBoard('b1');
      setTasks(t);
      setLoading(false);
    })();
  }, []);

  const refreshTasks = async (boardId?: string) => {
    const t = await svc.taskService.forBoard(boardId ?? 'b1');
    setTasks(t);
  };

  const updateTask = async (id: string, patch: Partial<Task>) => {
    await svc.taskService.update(id, patch);
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  };

  const createTask = async (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    const created = await svc.taskService.create(task);
    setTasks((prev) => [...prev, created]);
    return created;
  };

  const deleteTask = async (id: string) => {
    await svc.taskService.remove(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const switchWorkspace = async (id: string) => {
    const ws = await svc.workspaceService.switch(id);
    setWorkspace(ws);
  };

  return (
    <Ctx.Provider
      value={{
        currentUser, users, workspace, workspaces, boards, lists, tasks, labels, loading,
        refreshTasks, updateTask, createTask, deleteTask, switchWorkspace,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
