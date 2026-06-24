import type { NextFunction, Request, Response } from 'express';
import { pool } from './db.js';

// 路径 → 人类可读动作（按顺序首个匹配）
const RULES: { re: RegExp; m?: string; label: string }[] = [
  { re: /\/auth\/login$/, label: '登录' },
  { re: /\/auth\/password$/, label: '修改密码' },
  { re: /\/auth\/kick\//, label: '强制下线' },
  { re: /\/leads\/[^/]+\/convert$/, label: '线索-转客户' },
  { re: /\/leads\/[^/]+\/to-opportunity$/, label: '线索-转商机' },
  { re: /\/leads\/(claim|assign|return-pool|reject|receive)$/, label: '线索-流转' },
  { re: /\/leads\/[^/]+$/, m: 'PUT', label: '线索-编辑' },
  { re: /\/leads$/, m: 'POST', label: '新建线索' },
  { re: /\/customers\/[^/]+\/transfer$/, label: '客户-移交' },
  { re: /\/customers\/[^/]+\/trackings$/, label: '客户-写跟进' },
  { re: /\/customers$/, m: 'POST', label: '新建客户' },
  { re: /\/opportunities\/[^/]+\/stage$/, label: '商机-改阶段' },
  { re: /\/opportunities$/, m: 'POST', label: '新建商机' },
  { re: /\/quotations\/[^/]+\/confirm$/, label: '报价-确认出单' },
  { re: /\/quotations\/[^/]+$/, m: 'PUT', label: '报价-编辑' },
  { re: /\/quotations$/, m: 'POST', label: '新建报价' },
  { re: /\/contracts$/, m: 'POST', label: '新建合同' },
  { re: /\/approvals\/submit$/, label: '提交审批' },
  { re: /\/approvals\/[^/]+\/approve$/, label: '审批-通过' },
  { re: /\/approvals\/[^/]+\/reject$/, label: '审批-驳回' },
  { re: /\/tickets/, label: '工单' },
  { re: /\/roles|\/permissions|\/users\/[^/]+\/roles/, label: '角色权限变更' },
  { re: /\/departments|\/org$/, label: '组织/部门变更' },
  { re: /\/discount-policy$/, label: '折扣政策变更' },
  { re: /\/dict/, label: '字典配置' },
  { re: /\/upload$/, label: '上传附件' },
];

function deriveAction(method: string, path: string): string {
  for (const r of RULES) if ((!r.m || r.m === method) && r.re.test(path)) return r.label;
  return `${method} ${path.replace(/^\/api\/(crm|auth)/, '')}`;
}

function summarize(body: any): { targetId: string | null; detail: string } {
  if (!body || typeof body !== 'object') return { targetId: null, detail: '' };
  const b = { ...body };
  delete b.password; delete b.oldPassword; delete b.newPassword; // 不记录密码
  const targetId = b.id ?? b.customerId ?? b.businessId ?? b.toUserId ?? null;
  const detail = (b.name ?? b.title ?? b.code ?? b.comment ?? b.content ?? b.businessName ?? '') as string;
  return { targetId: targetId != null ? String(targetId) : null, detail: String(detail).slice(0, 200) };
}

// 审计中间件：写操作成功后异步留痕（GET、审计读取、健康检查不记）
export function auditMiddleware(req: Request, res: Response, next: NextFunction) {
  const method = req.method;
  const url = req.originalUrl.split('?')[0];
  const isLogin = method === 'POST' && /\/auth\/login$/.test(url);
  const isWrite = ['POST', 'PUT', 'DELETE'].includes(method) && url.startsWith('/api/crm');
  if (!isLogin && !isWrite) return next();

  const body = req.body;
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const u = (req as any).user as { userId: number; orgId: number; name: string } | undefined;
    const { targetId, detail } = summarize(body);
    const userId = u?.userId ?? null;
    const userName = u?.name ?? (isLogin ? body?.username ?? null : null);
    const orgId = u?.orgId ?? (isLogin ? 1 : null);
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || '';
    pool
      .query(
        `INSERT INTO audit_log (organization_id, user_id, user_name, action, method, path, target_id, detail, ip, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [orgId, userId, userName, deriveAction(method, url), method, url, targetId, detail, ip, res.statusCode],
      )
      .catch(() => {});
  });
  next();
}
