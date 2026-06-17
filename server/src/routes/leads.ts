import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok, parseList } from '../http.js';
import { runList, type FilterDef } from '../list.js';
import { mapCustomer } from '../mappers.js';

export const leadsRouter = Router();

const FILTERS: Record<string, FilterDef> = {
  source: { col: 'source_term_id', kind: 'eq' },
  poolGroup: { col: 'pool_group_term_id', kind: 'in' },
  currentTrackingStatus: { col: 'status_term_id', kind: 'in' },
  leaderId: { col: 'leader_id', kind: 'eq' },
  province: { col: 'province', kind: 'contains' },
  trackingUpdateDate: { col: 'tracking_update_at', kind: 'dateRange' },
};

leadsRouter.post(
  '/leads/list',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const body = parseList(req);
    const conds = ['organization_id = $1', 'active = 1', 'category IN (1,2)'];
    const params: unknown[] = [orgId];
    if (body.tab === 'pool') conds.push('category = 2');
    else if (body.tab === 'mine') conds.push('category = 1');
    else if (body.tab === 'converted') conds.push('status_term_id = 17');

    const result = await runList(
      {
        table: 'customer',
        searchCols: ['name', 'industry', 'phone_name'],
        filterMap: FILTERS,
        sortMap: { trackingUpdateDate: 'tracking_update_at' },
        defaultOrder: 'created_at DESC',
        baseConds: conds,
        baseParams: params,
        mapRow: mapCustomer,
      },
      body,
    );
    ok(res, result);
  }),
);

leadsRouter.get(
  '/leads/:id',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const row = await one(`SELECT * FROM customer WHERE customer_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
    if (!row) return fail(res, '线索不存在', 1, 404);
    ok(res, mapCustomer(row));
  }),
);

// 线索转客户（category 1/2 → 3，状态置初访 8）
leadsRouter.post(
  '/leads/:id/convert',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const row = await one(
      `UPDATE customer SET category=3, status_term_id=8 WHERE customer_id=$1 AND organization_id=$2 RETURNING *`,
      [req.params.id, orgId],
    );
    if (!row) return fail(res, '线索不存在', 1, 404);
    ok(res, mapCustomer(row));
  }),
);

const createSchema = z.object({
  name: z.string().min(2),
  source: z.coerce.number().int().positive(),
  poolGroup: z.coerce.number().int().optional(),
  industry: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  phoneName: z.string().optional(),
  phone: z.string().optional(),
  leaderId: z.coerce.number().int().positive(),
});

leadsRouter.post(
  '/leads',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, parsed.error.issues[0]?.message ?? '参数错误');
    const d = parsed.data;
    const row = await one(
      `INSERT INTO customer (organization_id, name, category, status_term_id, source_term_id, pool_group_term_id,
         industry, province, city, phone_name, phone, leader_id, created_by, tracking_update_at)
       VALUES ($1,$2,1,15,$3,$4,$5,$6,$7,$8,$9,$10,$11, now()) RETURNING *`,
      [orgId, d.name, d.source, d.poolGroup ?? null, d.industry ?? null, d.province ?? null, d.city ?? null, d.phoneName ?? null, d.phone ?? null, d.leaderId, userId],
    );
    ok(res, mapCustomer(row));
  }),
);

// 编辑线索（#6）
const editSchema = z.object({
  name: z.string().min(2).optional(),
  source: z.coerce.number().int().optional(),
  poolGroup: z.coerce.number().int().optional(),
  industry: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  phoneName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
});
leadsRouter.put(
  '/leads/:id',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const d = editSchema.parse(req.body);
    const map: Record<string, string> = {
      name: 'name', source: 'source_term_id', poolGroup: 'pool_group_term_id', industry: 'industry',
      province: 'province', city: 'city', phoneName: 'phone_name', phone: 'phone', email: 'email',
      utmSource: 'utm_source', utmMedium: 'utm_medium', utmCampaign: 'utm_campaign',
    };
    const sets: string[] = []; const vals: unknown[] = [];
    for (const [k, col] of Object.entries(map)) {
      const v = (d as any)[k];
      if (v !== undefined) { vals.push(v); sets.push(`${col}=$${vals.length}`); }
    }
    if (sets.length === 0) return fail(res, '无更新内容');
    vals.push(req.params.id, orgId);
    const row = await one(`UPDATE customer SET ${sets.join(', ')} WHERE customer_id=$${vals.length - 1} AND organization_id=$${vals.length} RETURNING *`, vals);
    if (!row) return fail(res, '线索不存在', 1, 404);
    ok(res, mapCustomer(row));
  }),
);

// 线索生命周期单条/批量动作（#5/#7）
async function actLeads(ids: number[], orgId: number, set: string, extra: unknown[] = []) {
  if (!ids.length) return [];
  const rows = await query(
    `UPDATE customer SET ${set} WHERE customer_id = ANY($${extra.length + 1}) AND organization_id=$${extra.length + 2} RETURNING *`,
    [...extra, ids, orgId],
  );
  return rows.map(mapCustomer);
}
const idsOf = (req: any): number[] => {
  if (req.params.id) return [Number(req.params.id)];
  return (req.body?.ids ?? []).map(Number);
};

// 领取（→个人线索，置跟进中，记领取时间）
leadsRouter.post(['/leads/:id/claim', '/leads/claim'], ah(async (req, res) => {
  const { orgId, userId } = ctx(req);
  ok(res, await actLeads(idsOf(req), orgId, `category=1, leader_id=$1, status_term_id=18, claim_at=now()`, [userId]));
}));
// 接收（被分配后接受 → 跟进中）
leadsRouter.post(['/leads/:id/receive', '/leads/receive'], ah(async (req, res) => {
  const { orgId } = ctx(req);
  ok(res, await actLeads(idsOf(req), orgId, `status_term_id=18`));
}));
// 拒绝（→无效）
leadsRouter.post(['/leads/:id/reject', '/leads/reject'], ah(async (req, res) => {
  const { orgId } = ctx(req);
  ok(res, await actLeads(idsOf(req), orgId, `status_term_id=19`));
}));
// 退回线索池（→线索池，清负责人，未分配）
leadsRouter.post(['/leads/:id/return-pool', '/leads/return-pool'], ah(async (req, res) => {
  const { orgId } = ctx(req);
  ok(res, await actLeads(idsOf(req), orgId, `category=2, leader_id=NULL, status_term_id=15, back_sea_time=now()`));
}));
// 分配（单条/批量，记分配时间）
leadsRouter.post(['/leads/:id/assign', '/leads/assign'], ah(async (req, res) => {
  const { orgId } = ctx(req);
  const toUserId = Number(req.body?.toUserId);
  if (!toUserId) return fail(res, '请选择分配对象');
  ok(res, await actLeads(idsOf(req), orgId, `category=1, leader_id=$1, status_term_id=16, assign_at=now()`, [toUserId]));
}));

// 直转商机（#9）：确保为客户(category=3) → 新建商机
leadsRouter.post('/leads/:id/to-opportunity', ah(async (req, res) => {
  const { orgId, userId } = ctx(req);
  const c = await one<any>(`SELECT * FROM customer WHERE customer_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
  if (!c) return fail(res, '线索不存在', 1, 404);
  await one(`UPDATE customer SET category=3, status_term_id=17 WHERE customer_id=$1`, [c.customer_id]);
  const seq = await one<{ n: number }>(`SELECT count(*)+1 AS n FROM opportunity WHERE organization_id=$1`, [orgId]);
  const code = `OPP${new Date().getFullYear()}${String(seq!.n).padStart(4, '0')}`;
  const name = String(req.body?.name || `${c.name} 商机`);
  const opp = await one(
    `INSERT INTO opportunity (organization_id, code, name, customer_id, estimated_amount, status_term_id, leader_id, department_id, status_expiry_at)
     VALUES ($1,$2,$3,$4,$5,30,$6,2, now()+interval '14 day') RETURNING *`,
    [orgId, code, name, c.customer_id, req.body?.estimatedAmount ?? '0', c.leader_id ?? userId],
  );
  await one(`UPDATE customer SET opportunity_count = opportunity_count + 1 WHERE customer_id=$1`, [c.customer_id]);
  ok(res, { opportunityId: (opp as any).opportunity_id, code });
}));
