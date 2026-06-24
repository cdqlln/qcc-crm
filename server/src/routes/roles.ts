import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { ah, ctx, fail, ok } from '../http.js';
import { requirePermission } from '../auth.js';

export const rolesRouter = Router();

// 所有角色权限管理接口需 system.role 权限
rolesRouter.use(['/roles', '/permissions', '/users-roles', '/users/:id/roles'], requirePermission('system.role'));

// 权限点目录（按模块分组）
rolesRouter.get('/permissions', ah(async (_req, res) => {
  const rows = await query(`SELECT permission_id, code, name, module, type, sort_order FROM permission ORDER BY module, sort_order, permission_id`);
  ok(res, rows.map((r: any) => ({ permissionId: r.permission_id, code: r.code, name: r.name, module: r.module ?? '其他', type: r.type })));
}));

const SCOPE = { 1: '本人', 2: '本部门', 3: '本部门及下属', 4: '全公司' } as const;

// 角色列表（含权限码与人数）
rolesRouter.get('/roles', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const roles = await query(`SELECT role_id, name, scope FROM role WHERE organization_id=$1 ORDER BY role_id`, [orgId]);
  const perms = await query(`SELECT rp.role_id, p.code FROM role_permission rp JOIN permission p ON p.permission_id=rp.permission_id`);
  const counts = await query(`SELECT role_id, count(*)::int n FROM user_role GROUP BY role_id`);
  const cmap = new Map(counts.map((c: any) => [c.role_id, c.n]));
  ok(res, roles.map((r: any) => ({
    roleId: r.role_id, name: r.name, scope: r.scope, scopeName: (SCOPE as any)[r.scope],
    permissions: perms.filter((p: any) => p.role_id === r.role_id).map((p: any) => p.code),
    userCount: cmap.get(r.role_id) ?? 0,
  })));
}));

const roleSchema = z.object({ name: z.string().min(1), scope: z.coerce.number().int().min(1).max(4) });
rolesRouter.post('/roles', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const d = roleSchema.parse(req.body);
  const r = await one(`INSERT INTO role (organization_id, name, scope) VALUES ($1,$2,$3) RETURNING role_id`, [orgId, d.name, d.scope]);
  ok(res, { roleId: (r as any).role_id });
}));
rolesRouter.put('/roles/:id', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const d = roleSchema.parse(req.body);
  const r = await one(`UPDATE role SET name=$1, scope=$2 WHERE role_id=$3 AND organization_id=$4 RETURNING role_id`, [d.name, d.scope, req.params.id, orgId]);
  if (!r) return fail(res, '角色不存在', 1, 404);
  ok(res, { ok: true });
}));
rolesRouter.delete('/roles/:id', ah(async (req, res) => {
  const { orgId } = ctx(req);
  await one(`DELETE FROM role WHERE role_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
  ok(res, { ok: true });
}));

// 设置角色权限（整体替换）
rolesRouter.put('/roles/:id/permissions', ah(async (req, res) => {
  const codes: string[] = req.body?.codes ?? [];
  await tx(async (c) => {
    await c.query(`DELETE FROM role_permission WHERE role_id=$1`, [req.params.id]);
    if (codes.length) {
      await c.query(
        `INSERT INTO role_permission (role_id, permission_id)
         SELECT $1, permission_id FROM permission WHERE code = ANY($2)`,
        [req.params.id, codes],
      );
    }
  });
  ok(res, { ok: true, count: codes.length });
}));

// 用户-角色分配
rolesRouter.get('/users-roles', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const users = await query(
    `SELECT u.user_id, u.name, d.name dep_name,
       COALESCE(array_agg(ur.role_id) FILTER (WHERE ur.role_id IS NOT NULL), '{}') AS role_ids
     FROM app_user u LEFT JOIN department d ON d.department_id=u.department_id
     LEFT JOIN user_role ur ON ur.user_id=u.user_id
     WHERE u.organization_id=$1 GROUP BY u.user_id, u.name, d.name ORDER BY u.user_id`,
    [orgId],
  );
  ok(res, users.map((u: any) => ({ userId: u.user_id, name: u.name, depName: u.dep_name, roleIds: u.role_ids })));
}));
rolesRouter.put('/users/:id/roles', ah(async (req, res) => {
  const roleIds: number[] = (req.body?.roleIds ?? []).map(Number);
  await tx(async (c) => {
    await c.query(`DELETE FROM user_role WHERE user_id=$1`, [req.params.id]);
    for (const rid of roleIds) await c.query(`INSERT INTO user_role (user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, [req.params.id, rid]);
  });
  ok(res, { ok: true });
}));
