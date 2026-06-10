// 认证 API：VITE_API_BASE 已定义走真实后端，否则用内存 Mock（演示）。
import type { AuthUser, Session } from '@/store/auth';
import { MOCK_USERS } from '@/mock/org';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';
const USE_API = import.meta.env.VITE_API_BASE !== undefined;

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}/api/auth${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json()) as { code: number; msg: string; data: T };
  if (data.code !== 0) throw new Error(data.msg || '请求失败');
  return data.data;
}

// ---- 真实后端 ----
const backendAuth = {
  login: (username: string, password: string) => call<Session>('/login', { username, password }),
  me: () => call<AuthUser>('/me'),
  wecomUrl: (as?: string) => call<{ url: string; dev: boolean }>(`/wecom/url${as ? `?as=${as}` : ''}`),
  supportsWecomPopup: true,
};

// ---- 内存 Mock ----
// 演示账号：用户名取拼音（admin/lina/...），密码统一 crm123456
const MOCK_LOGIN: Record<string, number> = {
  admin: 1, lina: 2, wangfang: 3, liuyang: 4, chenjing: 5, zhaolei: 6, sunyu: 7, zhoumin: 8,
};
function mockSession(userId: number): Session {
  const u = MOCK_USERS.find((x) => x.userId === userId) ?? MOCK_USERS[0];
  const user: AuthUser = {
    userId: u.userId,
    name: u.name,
    username: Object.keys(MOCK_LOGIN).find((k) => MOCK_LOGIN[k] === u.userId),
    depId: u.depId,
    depName: u.depName,
    position: u.position,
    organizationId: 1,
  };
  return { accessToken: `mock.${u.userId}.${Date.now()}`, refreshToken: `mockr.${u.userId}`, user };
}
const mockAuth = {
  login: async (username: string, password: string): Promise<Session> => {
    await new Promise((r) => setTimeout(r, 200));
    const id = MOCK_LOGIN[username.toLowerCase()];
    if (!id || password !== 'crm123456') throw new Error('账号或密码错误');
    return mockSession(id);
  },
  me: async (): Promise<AuthUser> => mockSession(1).user,
  wecomUrl: async () => ({ url: '', dev: true }),
  supportsWecomPopup: false,
  // 仅 mock：直接模拟企业微信扫码登录
  mockWecomLogin: async (): Promise<Session> => {
    await new Promise((r) => setTimeout(r, 400));
    return mockSession(1);
  },
};

export const authApi = USE_API ? backendAuth : mockAuth;
export const IS_API_MODE = USE_API;
