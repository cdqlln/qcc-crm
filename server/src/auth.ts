import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? '2h';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL ?? '7d';

export interface AuthUser {
  userId: number;
  orgId: number;
  name: string;
}

export function signAccess(u: AuthUser): string {
  return jwt.sign({ sub: u.userId, org: u.orgId, name: u.name }, SECRET, { expiresIn: ACCESS_TTL as any });
}
export function signRefresh(userId: number): string {
  return jwt.sign({ sub: userId, typ: 'refresh' }, SECRET, { expiresIn: REFRESH_TTL as any });
}
export function verifyToken(token: string): any {
  return jwt.verify(token, SECRET);
}

// 全局守卫：校验 Bearer 访问令牌
export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.header('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ code: 401, msg: '未登录', data: null });
  try {
    const p = verifyToken(token);
    if (p.typ === 'refresh') throw new Error('wrong token type');
    (req as any).user = { userId: Number(p.sub), orgId: Number(p.org), name: p.name } as AuthUser;
    next();
  } catch {
    res.status(401).json({ code: 401, msg: '登录已过期', data: null });
  }
}

// 企业微信 SSO 配置
export const wecom = {
  corpId: process.env.WECOM_CORP_ID ?? '',
  agentId: process.env.WECOM_AGENT_ID ?? '',
  secret: process.env.WECOM_SECRET ?? '',
  /** 后端回调地址（企业微信后台需配置可信域名） */
  selfBase: process.env.SELF_BASE_URL ?? 'http://localhost:8080',
  /** 登录成功后前端地址（postMessage 目标） */
  frontend: (process.env.CORS_ORIGIN ?? 'http://localhost:5173').split(',')[0],
  get enabled() {
    return !!(this.corpId && this.secret && this.agentId);
  },
};
