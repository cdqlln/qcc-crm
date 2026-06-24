import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok } from '../http.js';
import { mapCustomer } from '../mappers.js';

export const groupsRouter = Router();

// 集团列表（含成员数）
groupsRouter.get('/customer-groups', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const rows = await query(
    `SELECT g.group_id, g.name, g.match_key, g.ref_company_id,
       (SELECT count(*)::int FROM customer c WHERE c.group_id=g.group_id) AS member_count
     FROM customer_group g WHERE g.organization_id=$1 ORDER BY g.group_id`,
    [orgId],
  );
  ok(res, rows.map((g: any) => ({ groupId: g.group_id, name: g.name, matchKey: g.match_key, refCompanyId: g.ref_company_id, memberCount: g.member_count })));
}));

const groupSchema = z.object({ name: z.string().min(1), matchKey: z.string().optional(), refCompanyId: z.string().optional() });

// 新建集团：按字号自动归属未分配且名称匹配的客户
groupsRouter.post('/customer-groups', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const d = groupSchema.parse(req.body);
  const g = await one<any>(
    `INSERT INTO customer_group (organization_id, name, match_key, ref_company_id) VALUES ($1,$2,$3,$4) RETURNING group_id`,
    [orgId, d.name, d.matchKey ?? null, d.refCompanyId ?? null],
  );
  let attached = 0;
  if (d.matchKey) {
    const r = await query(
      `UPDATE customer SET group_id=$1 WHERE organization_id=$2 AND group_id IS NULL AND name ILIKE $3 RETURNING customer_id`,
      [g.group_id, orgId, `%${d.matchKey}%`],
    );
    attached = r.length;
  }
  ok(res, { groupId: g.group_id, attached });
}));

groupsRouter.put('/customer-groups/:id', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const d = groupSchema.parse(req.body);
  const g = await one(`UPDATE customer_group SET name=$1, match_key=$2 WHERE group_id=$3 AND organization_id=$4 RETURNING group_id`, [d.name, d.matchKey ?? null, req.params.id, orgId]);
  if (!g) return fail(res, '集团不存在', 1, 404);
  ok(res, { ok: true });
}));

groupsRouter.delete('/customer-groups/:id', ah(async (req, res) => {
  const { orgId } = ctx(req);
  await one(`UPDATE customer SET group_id=NULL WHERE group_id=$1`, [req.params.id]);
  await one(`DELETE FROM customer_group WHERE group_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
  ok(res, { ok: true });
}));

// 集团成员
groupsRouter.get('/customer-groups/:id/members', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const rows = await query(
    `SELECT c.*, NULL AS group_name FROM customer c WHERE c.group_id=$1 AND c.organization_id=$2 ORDER BY c.customer_id`,
    [req.params.id, orgId],
  );
  ok(res, rows.map(mapCustomer));
}));

// 人工调整客户集团归属（groupId 为空=移出集团）
groupsRouter.put('/customers/:id/group', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const gid = req.body?.groupId ? Number(req.body.groupId) : null;
  const r = await one(`UPDATE customer SET group_id=$1 WHERE customer_id=$2 AND organization_id=$3 RETURNING customer_id`, [gid, req.params.id, orgId]);
  if (!r) return fail(res, '客户不存在', 1, 404);
  ok(res, { ok: true });
}));
