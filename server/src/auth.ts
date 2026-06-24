import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { one } from './db.js';

export interface Authz {
  userId: number;
  scope: number; // 1本人 2本部门 3本部门及下属 4全公司
  deptId: number | null;
  path: string | null;
  permissions: string[];
  isAdmin: boolean;
}

// 汇总用户的角色权限与最大数据范围
export async function getAuthz(userId: number): Promise<Authz> {
  const r = await one<any>(
    `SELECT u.department_id, d.path,
       COALESCE(MAX(r.scope),1) AS scope,
       COALESCE(array_agg(DISTINCT p.code) FILTER (WHERE p.code IS NOT NULL), '{}') AS perms
     FROM app_user u
     LEFT JOIN department d ON d.department_id=u.department_id
     LEFT JOIN user_role ur ON ur.user_id=u.user_id
     LEFT JOIN role r ON r.role_id=ur.role_id
     LEFT JOIN role_permission rp ON rp.role_id=r.role_id
     LEFT JOIN permission p ON p.permission_id=rp.permission_id
     WHERE u.user_id=$1
     GROUP BY u.department_id, d.path`,
    [userId],
  );
  const permissions: string[] = r?.perms ?? [];
  const scope = Number(r?.scope ?? 1);
  return { userId, scope, deptId: r?.department_id ?? null, path: r?.path ?? null, permissions, isAdmin: scope >= 4 || permissions.includes('system.role') };
}

// 功能权限守卫（管理员/system.role 放行；否则需具备指定权限点）
export function requirePermission(code: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const u = (req as any).user as AuthUser | undefined;
    if (!u) return res.status(401).json({ code: 401, msg: '未登录', data: null });
    const az = await getAuthz(u.userId);
    (req as any).authz = az;
    if (az.isAdmin || az.permissions.includes(code)) return next();
    res.status(403).json({ code: 403, msg: `无权限：${code}`, data: null });
  };
}

// 数据范围条件（按 leaderCol 注入；返回 SQL 片段，整数/path 内联安全）
export async function dataScopeCond(req: Request, leaderCol: string): Promise<string | null> {
  const u = (req as any).user as AuthUser;
  const az: Authz = (req as any).authz ?? (await getAuthz(u.userId));
  (req as any).authz = az;
  if (az.scope >= 4) return null; // 全公司
  if (az.scope === 1) return `${leaderCol} = ${az.userId}`; // 本人
  if (az.scope === 2 && az.deptId) return `${leaderCol} IN (SELECT user_id FROM app_user WHERE department_id = ${az.deptId})`;
  if (az.scope === 3 && az.path) {
    const safe = az.path.replace(/'/g, '');
    return `${leaderCol} IN (SELECT u2.user_id FROM app_user u2 JOIN department d2 ON d2.department_id=u2.department_id WHERE d2.path LIKE '${safe}%')`;
  }
  return `${leaderCol} = ${az.userId}`;
}

const SECRET = process.env.JWT_SECRET ?? 'dev-secret-change-me';
const ACCESS_TTL = process.env.JWT_ACCESS_TTL ?? '2h';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL ?? '7d';

export interface AuthUser {
  userId: number;
  orgId: number;
  name: string;
}

// tv = token_version；改密/踢人时递增使旧令牌失效
export function signAccess(u: AuthUser, tv: number): string {
  return jwt.sign({ sub: u.userId, org: u.orgId, name: u.name, tv }, SECRET, { expiresIn: ACCESS_TTL as any });
}
export function signRefresh(userId: number, tv: number): string {
  return jwt.sign({ sub: userId, typ: 'refresh', tv }, SECRET, { expiresIn: REFRESH_TTL as any });
}
export function verifyToken(token: string): any {
  return jwt.verify(token, SECRET);
}

// 全局守卫：校验 Bearer 访问令牌 + 比对 token_version（吊销）+ 账号状态
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const h = req.header('authorization') || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return res.status(401).json({ code: 401, msg: '未登录', data: null });
  try {
    const p = verifyToken(token);
    if (p.typ === 'refresh') throw new Error('wrong token type');
    const u = await one<{ token_version: number; status: number }>(
      `SELECT token_version, status FROM app_user WHERE user_id=$1`,
      [Number(p.sub)],
    );
    if (!u || u.status !== 1) return res.status(401).json({ code: 401, msg: '账号已停用', data: null });
    if (Number(p.tv ?? 0) !== Number(u.token_version)) {
      return res.status(401).json({ code: 401, msg: '登录已失效，请重新登录', data: null });
    }
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
