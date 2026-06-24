// 真实后端实现（Express + Postgres）。当设置 VITE_API_BASE 时启用（见 crm.ts）。
// 统一返回 { code, msg, data }，与 §2 约定一致。
import type { ListParams } from './client';
import type {
  AiReport,
  BackLog,
  Contact,
  Contract,
  Customer,
  Invoice,
  Opportunity,
  PageResult,
  Payment,
  PreCredit,
  Product,
  Quotation,
  QuotationProduct,
  Target,
  Term,
  Tracking,
} from '@/types';
import type { SearchHit } from './mock';
import { authStore, type Session } from '@/store/auth';

const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '';

function authHeaders(): Record<string, string> {
  const t = authStore.get().accessToken;
  return t ? { Authorization: `Bearer ${t}` } : {};
}

// 用刷新令牌换新令牌；失败返回 false
async function tryRefresh(): Promise<boolean> {
  const rt = authStore.get().refreshToken;
  if (!rt) return false;
  try {
    const res = await fetch(`${BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: rt }),
    });
    const body = (await res.json()) as { code: number; data: Session };
    if (body.code !== 0) return false;
    authStore.get().setSession(body.data);
    return true;
  } catch {
    return false;
  }
}

async function req<T>(path: string, init?: RequestInit, retried = false): Promise<T> {
  const res = await fetch(`${BASE}/api/crm${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) },
  });
  // 令牌过期：刷新一次后重试，否则登出
  if (res.status === 401) {
    if (!retried && (await tryRefresh())) return req<T>(path, init, true);
    authStore.clearAndRedirect();
    throw new Error('未登录或登录已过期');
  }
  if (!res.ok && res.status >= 500) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { code: number; msg: string; data: T };
  if (body.code !== 0) throw new Error(body.msg || '请求失败');
  return body.data;
}

const get = <T>(path: string) => req<T>(path);
const post = <T>(path: string, payload?: unknown) =>
  req<T>(path, { method: 'POST', body: JSON.stringify(payload ?? {}) });
const put = <T>(path: string, payload?: unknown) =>
  req<T>(path, { method: 'PUT', body: JSON.stringify(payload ?? {}) });
const list = <T>(path: string, p: ListParams) => post<PageResult<T>>(path, p);

export const termsApi = { all: () => get<Term[]>('/terms') };

export const leadsApi = {
  list: (p: ListParams) => list<Customer>('/leads/list', p),
  get: (id: number) => get<Customer>(`/leads/${id}`),
  convert: (id: number) => post<Customer>(`/leads/${id}/convert`),
  create: (input: Partial<Customer>) => post<Customer>('/leads', input),
  update: (id: number, input: Partial<Customer>) => put<Customer>(`/leads/${id}`, input),
  claim: (ids: number[]) => post<Customer[]>('/leads/claim', { ids }),
  receive: (ids: number[]) => post<Customer[]>('/leads/receive', { ids }),
  reject: (ids: number[]) => post<Customer[]>('/leads/reject', { ids }),
  returnPool: (ids: number[]) => post<Customer[]>('/leads/return-pool', { ids }),
  assign: (ids: number[], toUserId: number) => post<Customer[]>('/leads/assign', { ids, toUserId }),
  toOpportunity: (id: number, input?: { name?: string; estimatedAmount?: string }) =>
    post<{ opportunityId: number; code: string }>(`/leads/${id}/to-opportunity`, input ?? {}),
};

export const customersApi = {
  list: (p: ListParams) => list<Customer>('/customers/list', p),
  get: (id: number) => get<Customer>(`/customers/${id}`),
  contacts: (customerId: number) => get<Contact[]>(`/customers/${customerId}/contacts`),
  trackings: (customerId: number) => get<Tracking[]>(`/customers/${customerId}/trackings`),
  activities: (customerId: number) =>
    get<{ kind: string; title: string; summary: string; operator?: string; date: string }[]>(`/customers/${customerId}/activities`),
  createTracking: (customerId: number, input: { comment: string; trackingType?: number; nextTrackingDate?: string; priorityLevel?: number }) =>
    post<Tracking>(`/customers/${customerId}/trackings`, input),
  create: (input: Partial<Customer>) => post<Customer>('/customers', input),
  lastQuotePrices: (customerId: number) =>
    get<{ productId: number; unitPrice: string; discountRate: string; code: string; quoteDate?: string }[]>(
      `/customers/${customerId}/last-quote-prices`,
    ),
  transfer: (customerId: number, toUserId: number, reason: string) =>
    post<{ status: number }>(`/customers/${customerId}/transfer`, { toUserId, reason }),
};

export const opportunitiesApi = {
  list: (p: ListParams) => list<Opportunity>('/opportunities/list', p),
  get: (id: number) => get<Opportunity>(`/opportunities/${id}`),
  updateStage: (id: number, status: number) => put<Opportunity>(`/opportunities/${id}/stage`, { status }),
  create: (input: Partial<Opportunity>) => post<Opportunity>('/opportunities', input),
};

export const quotationsApi = {
  list: (p: ListParams) => list<Quotation>('/quotations/list', p),
  get: (id: number) => get<Quotation>(`/quotations/${id}`),
  products: (quotationId: number) => get<QuotationProduct[]>(`/quotations/${quotationId}/products`),
  discountPolicy: () => get<import('@/types').DiscountPolicy[]>('/discount-policy'),
  updateDiscountPolicy: (policies: import('@/types').DiscountPolicy[]) =>
    put<import('@/types').DiscountPolicy[]>('/discount-policy', { policies }),
  create: (input: unknown) => post<Quotation>('/quotations', input),
  update: (id: number, input: unknown) => put<Quotation>(`/quotations/${id}`, input),
  confirm: (id: number) => post<Quotation>(`/quotations/${id}/confirm`),
};

export const contractsApi = {
  list: (p: ListParams) => list<Contract>('/contracts/list', p),
  get: (id: number) => get<Contract>(`/contracts/${id}`),
  payments: (contractId: number) => get<Payment[]>(`/contracts/${contractId}/payments`),
  paymentSheets: (_contractId: number) => Promise.resolve([] as never[]),
  invoices: (contractId: number) => get<Invoice[]>(`/contracts/${contractId}/invoices`),
  create: (input: Record<string, unknown>) => post<Contract>('/contracts', input),
};

export const paymentsApi = {
  list: (p: ListParams) => list<Payment>('/payments/list', p),
  sheets: (p: ListParams) => list('/payments/list', p),
};
export const invoicesApi = { list: (p: ListParams) => list<Invoice>('/invoices/list', p) };
export const preCreditsApi = { list: (p: ListParams) => list<PreCredit>('/pre-credits/list', p) };

export const productsApi = {
  list: (p: ListParams) => list<Product>('/products/list', p),
  all: () => get<Product[]>('/products'),
  tiers: (id: number) => get<import('@/types').ProductTier[]>(`/products/${id}/tiers`),
};

export const tasksApi = {
  list: (p: ListParams) => list<BackLog>('/tasks/list', p),
  complete: (id: number) => post<BackLog>(`/tasks/${id}/complete`),
  counts: () => get<Record<number, number>>('/tasks/counts'),
};

export const targetsApi = { list: () => get<Target[]>('/targets') };

export const aiApi = {
  generate: (businessType: 0 | 1 | 2 | 3, businessId: number, stageId?: number) =>
    post<AiReport>('/ai/generate', { businessType, businessId, stageId }),
};

export const searchApi = {
  query: (kw: string) => get<SearchHit[]>(`/search?kw=${encodeURIComponent(kw)}`),
};

// ---- 协同模块 ----
import type { ApprovalRoute, ApprovalTask, QywxMessage, Sign, Ticket, TicketComment } from '@/types';

export const signApi = {
  list: (p: ListParams) => list<Sign>('/sign/list', p),
  create: (input: Partial<Sign>) => post<Sign>('/sign', input),
};

export const ticketsApi = {
  list: (p: ListParams) => list<Ticket>('/tickets/list', p),
  get: (id: number) => get<Ticket>(`/tickets/${id}`),
  comments: (id: number) => get<TicketComment[]>(`/tickets/${id}/comments`),
  create: (input: Partial<Ticket>) => post<Ticket>('/tickets', input),
  updateStatus: (id: number, status: number) => put<Ticket>(`/tickets/${id}/status`, { status }),
  addComment: (id: number, content: string) => post<TicketComment>(`/tickets/${id}/comments`, { content }),
};

export const approvalsApi = {
  routes: (businessType?: number) =>
    get<ApprovalRoute[]>(`/approvals/routes${businessType ? `?businessType=${businessType}` : ''}`),
  submit: (input: { businessType: number; businessId: number; businessName?: string; routeId?: number }) =>
    post<ApprovalTask>('/approvals/submit', input),
  mine: (p: ListParams) => list<ApprovalTask>('/approvals/mine', p),
  initiated: (p: ListParams) => list<ApprovalTask>('/approvals/initiated', p),
  acted: (p: ListParams) => list<ApprovalTask>('/approvals/acted', p),
  get: (taskId: number) => get<ApprovalTask>(`/approvals/${taskId}`),
  approve: (taskId: number, comment?: string) => post(`/approvals/${taskId}/approve`, { comment }),
  reject: (taskId: number, comment?: string) => post(`/approvals/${taskId}/reject`, { comment }),
};

export const qywxApi = {
  list: (p: ListParams) => list<QywxMessage>('/qywx/list', p),
  send: (toUserId: number | null, content: string) => post('/qywx/send', { toUserId, content }),
};

import type { PermissionItem, Role, UserRoles } from '@/types';
export const rolesApi = {
  permissions: () => get<PermissionItem[]>('/permissions'),
  list: () => get<Role[]>('/roles'),
  create: (input: { name: string; scope: number }) => post<{ roleId: number }>('/roles', input),
  update: (id: number, input: { name: string; scope: number }) => put(`/roles/${id}`, input),
  remove: (id: number) => req(`/roles/${id}`, { method: 'DELETE' }),
  setPermissions: (id: number, codes: string[]) => put(`/roles/${id}/permissions`, { codes }),
  usersRoles: () => get<UserRoles[]>('/users-roles'),
  setUserRoles: (userId: number, roleIds: number[]) => put(`/users/${userId}/roles`, { roleIds }),
};
