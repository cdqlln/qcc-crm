import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok, parseList } from '../http.js';
import { runList, type FilterDef } from '../list.js';
import { mapCustomer } from '../mappers.js';
import { dataScopeCond, requirePermission } from '../auth.js';

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
    // 已转化线索已成为客户(category 3)，「已转化」页签按转化留痕检索，不再限定 category
    const conds = body.tab === 'converted'
      ? ['organization_id = $1', 'active = 1', 'converted_at IS NOT NULL']
      : ['organization_id = $1', 'active = 1', 'category IN (1,2)'];
    const params: unknown[] = [orgId];
    if (body.tab === 'pool') conds.push('category = 2');
    else if (body.tab === 'mine') conds.push('category = 1');
    const scope = await dataScopeCond(req, 'leader_id'); // 数据范围（线索池对所有人可见以便领取）
    if (scope) conds.push(`(category = 2 OR ${scope})`);

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

// 转化留痕：固化转化那一刻的线索原貌（客户侧「查看原线索」用，不随后续编辑变化）
export async function buildLeadSnapshot(orgId: number, row: any): Promise<Record<string, unknown>> {
  const [src, grp, leader] = await Promise.all([
    row.source_term_id ? one<{ name: string }>(`SELECT name FROM term WHERE term_id=$1`, [row.source_term_id]) : null,
    row.pool_group_term_id ? one<{ name: string }>(`SELECT name FROM term WHERE term_id=$1`, [row.pool_group_term_id]) : null,
    row.leader_id ? one<{ name: string }>(`SELECT name FROM app_user WHERE user_id=$1`, [row.leader_id]) : null,
  ]);
  return {
    name: row.name,
    sourceName: src?.name ?? '',
    poolGroupName: grp?.name ?? '',
    industry: row.industry ?? '',
    region: `${row.province ?? ''}${row.city ?? ''}`,
    phoneName: row.phone_name ?? '',
    phone: row.phone ?? '',
    leaderName: leader?.name ?? '',
    trackingNum: Number(row.tracking_num ?? 0),
    createdAt: row.created_at,
    claimAt: row.claim_at,
    assignAt: row.assign_at,
    utmSource: row.utm_source ?? '',
    utmMedium: row.utm_medium ?? '',
    utmCampaign: row.utm_campaign ?? '',
  };
}

// 线索转客户（category 1/2 → 3，状态置初访 8；记录转化留痕）
leadsRouter.post(
  '/leads/:id/convert',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const lead = await one<any>(`SELECT * FROM customer WHERE customer_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
    if (!lead) return fail(res, '线索不存在', 1, 404);
    if (lead.converted_at) return fail(res, '该线索已转化并关联客户，如需重新转化请先在「已转化」中解除关联');
    if (lead.category > 2) return fail(res, '该记录已是客户，无需再次转化');
    const snapshot = await buildLeadSnapshot(orgId, lead);
    const row = await one(
      `UPDATE customer SET category=3, status_term_id=8,
         converted_at=now(), converted_by=$3, lead_snapshot=$4
       WHERE customer_id=$1 AND organization_id=$2 RETURNING *`,
      [req.params.id, orgId, userId, JSON.stringify(snapshot)],
    );
    ok(res, mapCustomer(row));
  }),
);

// 解除转化关联：客户名下无业务单据时，把记录退回线索（可重新转化）
leadsRouter.post('/leads/:id/unlink', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const c = await one<any>(`SELECT * FROM customer WHERE customer_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
  if (!c) return fail(res, '记录不存在', 1, 404);
  if (!c.converted_at) return fail(res, '该线索未转化，无需解除关联');
  const biz = await one<any>(
    `SELECT
       (SELECT count(*) FROM opportunity WHERE customer_id=$1 AND active=1) AS opp,
       (SELECT count(*) FROM quotation WHERE customer_id=$1) AS quo,
       (SELECT count(*) FROM contract WHERE customer_id=$1) AS ct`,
    [c.customer_id],
  );
  const opp = Number(biz?.opp ?? 0), quo = Number(biz?.quo ?? 0), ct = Number(biz?.ct ?? 0);
  if (opp + quo + ct > 0) {
    return fail(res, `客户名下已有业务单据（商机 ${opp} / 报价 ${quo} / 合同 ${ct}），不能解除关联；请先处理相关单据`);
  }
  const row = await one(
    `UPDATE customer SET category=1, status_term_id=16,
       converted_at=NULL, converted_by=NULL, lead_snapshot=NULL, group_id=NULL
     WHERE customer_id=$1 RETURNING *`,
    [c.customer_id],
  );
  ok(res, mapCustomer(row));
}));

const createSchema = z.object({
  name: z.string().min(2),
  source: z.coerce.number().int().positive(),
  poolGroup: z.coerce.number().int().optional(),
  industry: z.string().optional(),
  province: z.string().optional(),
  city: z.string().optional(),
  phoneName: z.string().optional(),
  phone: z.string().optional(),
  toPool: z.boolean().default(false),                    // 进入线索池（免负责人，由销售管理分配）
  leaderId: z.coerce.number().int().positive().optional(),
});

leadsRouter.post(
  '/leads',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, parsed.error.issues[0]?.message ?? '参数错误');
    const d = parsed.data;
    if (!d.toPool && !d.leaderId) return fail(res, '请指定负责人，或勾选「进入线索池」');
    // 进池：category=2 未分配（status 15），负责人留空等待销售管理分配
    const row = await one(
      `INSERT INTO customer (organization_id, name, category, status_term_id, source_term_id, pool_group_term_id,
         industry, province, city, phone_name, phone, leader_id, created_by, tracking_update_at)
       VALUES ($1,$2,$3,15,$4,$5,$6,$7,$8,$9,$10,$11,$12, now()) RETURNING *`,
      [orgId, d.name, d.toPool ? 2 : 1, d.source, d.poolGroup ?? null, d.industry ?? null, d.province ?? null, d.city ?? null,
       d.phoneName ?? null, d.phone ?? null, d.toPool ? null : d.leaderId, userId],
    );
    ok(res, mapCustomer(row));
  }),
);

// ---------- 线索池管理（lead.pool：销售管理人员分配并跟踪进展） ----------
leadsRouter.get('/lead-pool/overview', requirePermission('lead.pool'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  // 待分配池 + 今日新进池
  const pool = await one<any>(
    `SELECT count(*) FILTER (WHERE category=2) AS pending,
            count(*) FILTER (WHERE category=2 AND created_at >= date_trunc('day', now())) AS today_in
     FROM customer WHERE organization_id=$1 AND active=1`,
    [orgId],
  );
  // 已分配线索的进展：未跟进（分配后无跟进动作）/ 跟进中 / 已转化
  const rows = await query<any>(
    `SELECT c.customer_id, c.name, c.leader_id, u.name AS leader_name, c.assign_at, c.tracking_num,
            c.tracking_update_at, c.converted_at, src.name AS source_name
     FROM customer c
     LEFT JOIN app_user u ON u.user_id = c.leader_id
     LEFT JOIN term src ON src.term_id = c.source_term_id
     WHERE c.organization_id=$1 AND c.active=1 AND c.assign_at IS NOT NULL
     ORDER BY c.assign_at DESC LIMIT 200`,
    [orgId],
  );
  const list = rows.map((r: any) => {
    const status = r.converted_at ? 'converted'
      : r.tracking_update_at && r.assign_at && new Date(r.tracking_update_at) > new Date(r.assign_at) ? 'following'
      : 'unfollowed';
    return {
      customerId: Number(r.customer_id), name: r.name, leaderId: r.leader_id, leaderName: r.leader_name ?? '',
      sourceName: r.source_name ?? '', assignAt: r.assign_at, trackingNum: Number(r.tracking_num ?? 0),
      trackingUpdateDate: r.tracking_update_at, convertedAt: r.converted_at, status,
    };
  });
  ok(res, {
    pending: Number(pool?.pending ?? 0),
    todayIn: Number(pool?.today_in ?? 0),
    assigned: list.length,
    unfollowed: list.filter((x: any) => x.status === 'unfollowed').length,
    following: list.filter((x: any) => x.status === 'following').length,
    converted: list.filter((x: any) => x.status === 'converted').length,
    list,
  });
}));

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
leadsRouter.post(['/leads/:id/assign', '/leads/assign'], requirePermission('lead.pool'), ah(async (req, res) => {
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
  // 已转化线索需先解除关联才能再转（避免重复转化产生歧义链路）
  if (c.converted_at) return fail(res, '该线索已转化并关联客户，如需再转商机请先在「已转化」中解除关联');
  // 首次从线索侧转化时记录留痕（已是客户的复用记录不覆盖）
  const snapshot = c.category <= 2 && !c.converted_at ? await buildLeadSnapshot(orgId, c) : null;
  await one(
    `UPDATE customer SET category=3, status_term_id=17,
       converted_at = COALESCE(converted_at, CASE WHEN $2::jsonb IS NOT NULL THEN now() END),
       converted_by = COALESCE(converted_by, CASE WHEN $2::jsonb IS NOT NULL THEN $3::bigint END),
       lead_snapshot = COALESCE(lead_snapshot, $2)
     WHERE customer_id=$1 RETURNING customer_id`,
    [c.customer_id, snapshot ? JSON.stringify(snapshot) : null, userId],
  );
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
