import { create } from 'zustand';

export interface AuthUser {
  userId: number;
  name: string;
  username?: string;
  email?: string;
  depId?: number;
  depName?: string;
  position?: number;
  organizationId: number;
  avatar?: string | null;
  scope?: number;
  permissions?: string[];
  isAdmin?: boolean;
}

export interface Session {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  isAuthed: boolean;
  setSession: (s: Session) => void;
  setTokens: (accessToken: string, refreshToken: string) => void;
  setUser: (user: AuthUser) => void;
  clear: () => void;
}

const LS = 'crm.auth';

function load(): { accessToken: string | null; refreshToken: string | null; user: AuthUser | null } {
  try {
    const raw = localStorage.getItem(LS);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return { accessToken: null, refreshToken: null, user: null };
}

function persist(s: Partial<AuthState>) {
  localStorage.setItem(
    LS,
    JSON.stringify({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: s.user }),
  );
}

const initial = load();

export const useAuth = create<AuthState>((set, get) => ({
  accessToken: initial.accessToken,
  refreshToken: initial.refreshToken,
  user: initial.user,
  isAuthed: !!initial.accessToken,
  setSession: (s) => {
    persist(s);
    set({ accessToken: s.accessToken, refreshToken: s.refreshToken, user: s.user, isAuthed: true });
  },
  setTokens: (accessToken, refreshToken) => {
    const user = get().user;
    persist({ accessToken, refreshToken, user });
    set({ accessToken, refreshToken });
  },
  setUser: (user) => {
    persist({ accessToken: get().accessToken, refreshToken: get().refreshToken, user });
    set({ user });
  },
  clear: () => {
    localStorage.removeItem(LS);
    set({ accessToken: null, refreshToken: null, user: null, isAuthed: false });
  },
}));

// 权限判断 hook：管理员放行；否则需具备指定权限码
export function usePerm() {
  const user = useAuth((s) => s.user);
  const can = (code: string) => !!user && (user.isAdmin || (user.permissions ?? []).includes(code));
  return { can, isAdmin: !!user?.isAdmin, scope: user?.scope ?? 1 };
}

// 供非组件代码（fetch 拦截器）读取/失效
export const authStore = {
  get: () => useAuth.getState(),
  clearAndRedirect: () => {
    useAuth.getState().clear();
    if (location.pathname !== '/login') location.href = '/login';
  },
};
