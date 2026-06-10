import type { NextFunction, Request, Response } from 'express';

// 统一返回 { code, msg, data }
export function ok<T>(res: Response, data: T) {
  res.json({ code: 0, msg: 'success', data });
}
export function fail(res: Response, msg: string, code = 1, status = 400) {
  res.status(status).json({ code, msg, data: null });
}

// 包裹 async 路由，集中错误处理
export function ah(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => fn(req, res, next).catch(next);
}

export interface ListBody {
  page?: number;
  pageSize?: number;
  keyword?: string;
  tab?: string;
  filters?: Record<string, unknown>;
  sort?: { id: string; desc: boolean };
}

export function parseList(req: Request): Required<Pick<ListBody, 'page' | 'pageSize'>> & ListBody {
  const b = (req.body ?? {}) as ListBody;
  return {
    page: Math.max(1, Number(b.page) || 1),
    pageSize: Math.min(200, Math.max(1, Number(b.pageSize) || 20)),
    keyword: b.keyword?.trim() || undefined,
    tab: b.tab,
    filters: b.filters ?? {},
    sort: b.sort,
  };
}

// 当前租户 / 用户：优先取鉴权中间件注入的 req.user，兜底 env（仅无守卫场景）
export function ctx(req: Request) {
  const u = (req as any).user as { userId: number; orgId: number } | undefined;
  return {
    orgId: u?.orgId ?? Number(process.env.DEFAULT_ORG_ID || 1),
    userId: u?.userId ?? Number(process.env.DEFAULT_USER_ID || 1),
  };
}
