import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok } from '../http.js';
import { mapCustomer } from '../mappers.js';
import { resolveGroup } from '../services/companyGraph.js';

export const groupsRouter = Router();

// 按工商关系自动归集：解析客户集团标识 → 同集团(ext_key)客户归到一起
export async function autoAttachGroup(orgId: number, customerId: number, name: string, refCompanyId?: string | null) {
  const { extKey, groupName } = await resolveGroup(refCompanyId, name);
  await one(`UPDATE customer SET ext_key=$1 WHERE customer_id=$2`, [extKey, customerId]);
  const g = await one<any>(`SELECT group_id FROM customer_group WHERE organization_id=$1 AND ext_key=$2`, [orgId, extKey]);
  if (g) {
    await one(`UPDATE customer SET group_id=$1 WHERE customer_id=$2`, [g.group_id, customerId]);
    return g.group_id as number;
  }
  const others = await query<{ customer_id: number }>(
    `SELECT customer_id FROM customer WHERE organization_id=$1 AND ext_key=$2 AND group_id IS NULL AND customer_id<>$3`,
    [orgId, extKey, customerId],
  );
  if (others.length) {
    const ng = await one<any>(`INSERT INTO customer_group (organization_id, name, ext_key) VALUES ($1,$2,$3) RETURNING group_id`, [orgId, groupName, extKey]);
    const ids = [customerId, ...others.map((o) => o.customer_id)];
    await one(`UPDATE customer SET group_id=$1 WHERE customer_id = ANY($2)`, [ng.group_id, ids]);
    return ng.group_id as number;
  }
  return null;
}

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

// 按工商关系全量重新归集：解析所有未归属客户，按 ext_key 聚合成集团
groupsRouter.post('/customer-groups/auto-regroup', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const list = await query<{ customer_id: number; name: string; ref_company_id: string | null }>(
    `SELECT customer_id, name, ref_company_id FROM customer WHERE organization_id=$1 AND category>=3 AND group_id IS NULL`,
    [orgId],
  );
  let grouped = 0;
  for (const c of list) {
    const gid = await autoAttachGroup(orgId, c.customer_id, c.name, c.ref_company_id);
    if (gid) grouped++;
  }
  ok(res, { scanned: list.length, grouped });
}));

// 人工调整客户集团归属（groupId 为空=移出集团）
groupsRouter.put('/customers/:id/group', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const gid = req.body?.groupId ? Number(req.body.groupId) : null;
  const r = await one(`UPDATE customer SET group_id=$1 WHERE customer_id=$2 AND organization_id=$3 RETURNING customer_id`, [gid, req.params.id, orgId]);
  if (!r) return fail(res, '客户不存在', 1, 404);
  ok(res, { ok: true });
}));
