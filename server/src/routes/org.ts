import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { ah, ctx, fail, ok } from '../http.js';
import { requirePermission } from '../auth.js';

export const orgRouter = Router();

// 组织/部门管理需 system.org 权限
orgRouter.use(['/org', '/departments', '/departments/:id', '/users/:id/department'], requirePermission('system.org'));

// 组织信息
orgRouter.get('/org', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const o = await one<any>(`SELECT organization_id, name, ref_company_id FROM organization WHERE organization_id=$1`, [orgId]);
  ok(res, o ? { organizationId: o.organization_id, name: o.name, refCompanyId: o.ref_company_id } : null);
}));
orgRouter.put('/org', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const name = String(req.body?.name || '').trim();
  if (!name) return fail(res, '请输入组织名称');
  await one(`UPDATE organization SET name=$1 WHERE organization_id=$2`, [name, orgId]);
  ok(res, { ok: true });
}));

// 部门列表（含人数；前端组装为树）
orgRouter.get('/departments', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const rows = await query(
    `SELECT d.department_id, d.parent_id, d.name, d.path, d.depth,
       (SELECT count(*)::int FROM app_user u WHERE u.department_id=d.department_id) AS member_count
     FROM department d WHERE d.organization_id=$1 ORDER BY d.path`,
    [orgId],
  );
  ok(res, rows.map((d: any) => ({
    depId: d.department_id, parentId: d.parent_id, name: d.name, path: d.path, depth: d.depth, memberCount: d.member_count,
  })));
}));

const deptSchema = z.object({ name: z.string().min(1), parentId: z.coerce.number().int().optional() });

// 新建部门（依据父部门计算 path/depth）
orgRouter.post('/departments', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const d = deptSchema.parse(req.body);
  const parent = d.parentId ? await one<any>(`SELECT path, depth FROM department WHERE department_id=$1 AND organization_id=$2`, [d.parentId, orgId]) : null;
  if (d.parentId && !parent) return fail(res, '父部门不存在');
  const row = await one<any>(
    `INSERT INTO department (organization_id, parent_id, name, path, depth) VALUES ($1,$2,$3,'',0) RETURNING department_id`,
    [orgId, d.parentId ?? null, d.name],
  );
  const id = row.department_id;
  const path = parent ? `${parent.path},${id}` : `${id}`;
  const depth = parent ? parent.depth + 1 : 0;
  await one(`UPDATE department SET path=$1, depth=$2 WHERE department_id=$3`, [path, depth, id]);
  ok(res, { depId: id });
}));

// 编辑部门：重命名 + 可改父部门（递归维护子树 path/depth）
orgRouter.put('/departments/:id', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const id = Number(req.params.id);
  const d = deptSchema.parse(req.body);
  const cur = await one<any>(`SELECT department_id, parent_id, path, depth FROM department WHERE department_id=$1 AND organization_id=$2`, [id, orgId]);
  if (!cur) return fail(res, '部门不存在', 1, 404);

  // 仅改名
  if (d.parentId === undefined || d.parentId === cur.parent_id) {
    await one(`UPDATE department SET name=$1 WHERE department_id=$2`, [d.name, id]);
    return ok(res, { ok: true });
  }
  if (d.parentId === id) return fail(res, '不能将部门移动到自身');
  const np = await one<any>(`SELECT path, depth FROM department WHERE department_id=$1 AND organization_id=$2`, [d.parentId, orgId]);
  if (!np) return fail(res, '目标父部门不存在');
  if ((np.path + ',').startsWith(cur.path + ',')) return fail(res, '不能移动到自己的子部门下');

  const newPath = `${np.path},${id}`;
  const newDepth = np.depth + 1;
  const depthShift = newDepth - cur.depth;
  await tx(async (c) => {
    await c.query(`UPDATE department SET name=$1, parent_id=$2, path=$3, depth=$4 WHERE department_id=$5`, [d.name, d.parentId, newPath, newDepth, id]);
    // 子树：path 前缀替换 + depth 平移
    await c.query(
      `UPDATE department
         SET path = $1 || substring(path from ${cur.path.length + 1}),
             depth = depth + $2
       WHERE organization_id=$3 AND path LIKE $4`,
      [newPath, depthShift, orgId, cur.path + ',%'],
    );
  });
  ok(res, { ok: true });
}));

// 删除部门（有子部门或成员则拒绝）
orgRouter.delete('/departments/:id', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const id = Number(req.params.id);
  const kids = await one<{ n: number }>(`SELECT count(*)::int n FROM department WHERE parent_id=$1`, [id]);
  if ((kids?.n ?? 0) > 0) return fail(res, '存在子部门，无法删除');
  const mem = await one<{ n: number }>(`SELECT count(*)::int n FROM app_user WHERE department_id=$1`, [id]);
  if ((mem?.n ?? 0) > 0) return fail(res, '部门下仍有成员，无法删除');
  await one(`DELETE FROM department WHERE department_id=$1 AND organization_id=$2`, [id, orgId]);
  ok(res, { ok: true });
}));

// 部门成员
orgRouter.get('/departments/:id/members', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const rows = await query(
    `SELECT user_id, name, position, status, username FROM app_user WHERE organization_id=$1 AND department_id=$2 ORDER BY position DESC, user_id`,
    [orgId, req.params.id],
  );
  ok(res, rows.map((u: any) => ({ userId: u.user_id, name: u.name, position: u.position, status: u.status, username: u.username })));
}));

// 调整成员所属部门
orgRouter.put('/users/:id/department', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const departmentId = Number(req.body?.departmentId);
  if (!departmentId) return fail(res, '请选择部门');
  const r = await one(`UPDATE app_user SET department_id=$1 WHERE user_id=$2 AND organization_id=$3 RETURNING user_id`, [departmentId, req.params.id, orgId]);
  if (!r) return fail(res, '成员不存在', 1, 404);
  ok(res, { ok: true });
}));
