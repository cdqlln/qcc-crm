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
  clear: () => {
    localStorage.removeItem(LS);
    set({ accessToken: null, refreshToken: null, user: null, isAuthed: false });
  },
}));

// 供非组件代码（fetch 拦截器）读取/失效
export const authStore = {
  get: () => useAuth.getState(),
  clearAndRedirect: () => {
    useAuth.getState().clear();
    if (location.pathname !== '/login') location.href = '/login';
  },
};
