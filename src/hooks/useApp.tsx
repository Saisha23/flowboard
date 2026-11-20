import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Board, Label, List, Task, User, Workspace } from '@/types';
import * as svc from '@/services';
import { useAuth } from '@/components/auth/AuthProvider';

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
  error: string | null;
  refreshTasks: (boardId?: string) => Promise<void>;
  updateTask: (id: string, patch: Partial<Task>) => Promise<void>;
  createTask: (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => Promise<Task>;
  deleteTask: (id: string) => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
  reloadWorkspace: (id: string, requireOwner?: boolean) => Promise<void>;
}

const Ctx = createContext<AppData | null>(null);

export function useApp() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const { loading: authLoading, user } = useAuth();
  const authUserId = user?.id ?? null;
  const authUserIdRef = useRef(authUserId);
  authUserIdRef.current = authUserId;
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [boards, setBoards] = useState<Board[]>([]);
  const [lists, setLists] = useState<List[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadedUserId, setLoadedUserId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const clearUserData = () => {
      setCurrentUser(null);
      setUsers([]);
      setWorkspace(null);
      setWorkspaces([]);
      setBoards([]);
      setLists([]);
      setTasks([]);
      setLabels([]);
    };

    if (authLoading) {
      setLoading(true);
      return () => {
        active = false;
      };
    }

    if (!authUserId) {
      clearUserData();
      setError(null);
      setLoadedUserId(null);
      setLoading(false);
      return () => {
        active = false;
      };
    }

    setLoading(true);
    setError(null);
    setLoadedUserId(null);
    clearUserData();

    void (async () => {
      try {
        const ws = await svc.workspaceService.list();
        if (!active) return;

        const workspaceId = ws[0]?.id ?? null;
        const [u, b] = await Promise.all([
          svc.userService.list(workspaceId),
          workspaceId ? svc.boardService.list(workspaceId) : Promise.resolve([] as Board[]),
        ]);
        if (!active) return;

        const [cu, lbl] = await Promise.all([
          svc.userService.current(workspaceId, u),
          svc.labelService.list(workspaceId, b),
        ]);
        let allLists: List[] = [];
        let allTasks: Task[] = [];
        if (b.length) {
          const [listsByBoard, tasksByBoard] = await Promise.all([
            Promise.all(b.map((board) => svc.listService.forBoard(board.id))),
            Promise.all(b.map((board) => svc.taskService.forBoard(board.id))),
          ]);
          allLists = listsByBoard.flat();
          allTasks = tasksByBoard.flat();
        }
        if (!active) return;

        setCurrentUser(cu);
        setUsers(u);
        setWorkspaces(ws);
        setWorkspace(ws[0] ?? null);
        setBoards(b);
        setLists(allLists);
        setTasks(allTasks);
        setLabels(lbl);
        setLoadedUserId(authUserId);
        setError(null);
      } catch (cause) {
        if (active) {
          clearUserData();
          setLoadedUserId(authUserId);
          setError(cause instanceof Error ? cause.message : 'Unable to load workspace data.');
        }
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [authLoading, authUserId]);

  const dataReadyForUser = authUserId !== null && loadedUserId === authUserId;
  const isLoading = authLoading || (authUserId !== null && (loading || !dataReadyForUser));

  const refreshTasks = async (boardId?: string) => {
    const requestingUserId = authUserIdRef.current;
    if (!requestingUserId) return;
    const t = boardId
      ? await svc.taskService.forBoard(boardId)
      : (await Promise.all(boards.map((board) => svc.taskService.forBoard(board.id)))).flat();
    if (authUserIdRef.current === requestingUserId) setTasks(t);
  };

  const updateTask = async (id: string, patch: Partial<Task>) => {
    const requestingUserId = authUserIdRef.current;
    if (!requestingUserId) throw new Error('Sign in required.');
    const updated = await svc.taskService.update(id, patch);
    if (authUserIdRef.current === requestingUserId) {
      setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
    }
  };

  const createTask = async (task: Omit<Task, 'id' | 'createdAt' | 'updatedAt'>) => {
    const requestingUserId = authUserIdRef.current;
    if (!requestingUserId) throw new Error('Sign in required.');
    const created = await svc.taskService.create(task);
    if (authUserIdRef.current === requestingUserId) {
      setTasks((prev) => [...prev, created]);
    }
    return created;
  };

  const deleteTask = async (id: string) => {
    const requestingUserId = authUserIdRef.current;
    if (!requestingUserId) throw new Error('Sign in required.');
    await svc.taskService.remove(id);
    if (authUserIdRef.current === requestingUserId) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
    }
  };

  const loadWorkspace = async (id: string, requestingUserId: string, requireOwner: boolean) => {
    const ws = await svc.workspaceService.switch(id);
    if (authUserIdRef.current !== requestingUserId) return false;
    const [b, u] = await Promise.all([
      svc.boardService.list(id),
      svc.userService.list(id),
    ]);
    if (authUserIdRef.current !== requestingUserId) return false;
    if (requireOwner && !u.some((member) => member.id === requestingUserId && member.role === 'owner')) {
      throw new Error('Workspace creation succeeded, but the owner membership could not be verified.');
    }
    const [lbl, cu] = await Promise.all([
      svc.labelService.list(id, b),
      svc.userService.current(id, u),
    ]);
    const [listsByBoard, tasksByBoard] = await Promise.all([
      Promise.all(b.map((board) => svc.listService.forBoard(board.id))),
      Promise.all(b.map((board) => svc.taskService.forBoard(board.id))),
    ]);
    if (authUserIdRef.current !== requestingUserId) return false;
    setBoards(b);
    setTasks(tasksByBoard.flat());
    setLists(listsByBoard.flat());
    setUsers(u);
    setLabels(lbl);
    setCurrentUser(cu);
    setWorkspace(ws);
    setWorkspaces((prev) => (
      prev.some((workspace) => workspace.id === ws.id)
        ? prev.map((workspace) => workspace.id === ws.id ? ws : workspace)
        : [...prev, ws]
    ));
    setError(null);
    return true;
  };

  const clearWorkspaceData = () => {
    setCurrentUser(null);
    setUsers([]);
    setWorkspace(null);
    setBoards([]);
    setLists([]);
    setTasks([]);
    setLabels([]);
  };

  const switchWorkspace = async (id: string) => {
    const requestingUserId = authUserIdRef.current;
    if (!requestingUserId) throw new Error('Sign in required.');
    setLoading(true);
    setError(null);
    clearWorkspaceData();
    try {
      await loadWorkspace(id, requestingUserId, false);
    } catch (cause) {
      if (authUserIdRef.current === requestingUserId) {
        setError(cause instanceof Error ? cause.message : 'Unable to switch workspace.');
      }
    } finally {
      if (authUserIdRef.current === requestingUserId) setLoading(false);
    }
  };

  const reloadWorkspace = async (id: string, requireOwner = false) => {
    const requestingUserId = authUserIdRef.current;
    if (!requestingUserId) throw new Error('Sign in required.');
    setLoading(true);
    setError(null);
    clearWorkspaceData();
    try {
      const loaded = await loadWorkspace(id, requestingUserId, requireOwner);
      if (!loaded && authUserIdRef.current === requestingUserId) {
        throw new Error('Workspace data could not be refreshed.');
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to reload workspace data.';
      throw new Error(message);
    } finally {
      if (authUserIdRef.current === requestingUserId) setLoading(false);
    }
  };

  return (
    <Ctx.Provider
      value={{
        currentUser: dataReadyForUser ? currentUser : null,
        users: dataReadyForUser ? users : [],
        workspace: dataReadyForUser ? workspace : null,
        workspaces: dataReadyForUser ? workspaces : [],
        boards: dataReadyForUser ? boards : [],
        lists: dataReadyForUser ? lists : [],
        tasks: dataReadyForUser ? tasks : [],
        labels: dataReadyForUser ? labels : [],
        loading: isLoading,
        error: dataReadyForUser ? error : null,
        refreshTasks, updateTask, createTask, deleteTask, switchWorkspace, reloadWorkspace,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}
