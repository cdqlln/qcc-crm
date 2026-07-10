import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { ah, ctx, fail, ok, parseList } from '../http.js';
import { runList, type FilterDef } from '../list.js';

// 商机开拓管理（《商机开拓管理办法》QCC-SALES-DEV-2026-005）
//   引擎一 作战名单：ICP → 名单批次 → 目标承接/触达/转商机/冷冻/收回
//   引擎二 信号雷达：四类信号 SLA 处置留痕 + 查准率
//   引擎三 白空间：存量客户 × SKU 矩阵（实格由合同/商机产品行推导）
//   战役机制 + 第十四条开拓指标聚合
export const prospectingRouter = Router();

// ---------- 映射 ----------
const mapIcp = (r: any) => ({
  icpId: r.icp_id,
  name: r.name,
  line: r.line,
  industryScope: r.industry_scope ?? '',
  sizeRange: r.size_range ?? '',
  qualifications: r.qualifications ?? '',
  exclusions: r.exclusions ?? '',
  version: r.version,
  quarter: r.quarter,
  tamCount: Number(r.tam_count ?? 0),
  stockCount: r.stock_count != null ? Number(r.stock_count) : undefined,
  active: Number(r.active ?? 1),
  updatedAt: r.updated_at,
});

const mapList = (r: any) => ({
  listId: r.list_id,
  icpId: r.icp_id,
  icpName: r.icp_name ?? undefined,
  title: r.title,
  quarter: r.quarter,
  line: r.line,
  status: Number(r.status),
  publishedAt: r.published_at,
  createdAt: r.created_at,
  targetCount: r.target_count != null ? Number(r.target_count) : undefined,
  convertedCount: r.converted_count != null ? Number(r.converted_count) : undefined,
});

const mapTarget = (r: any) => ({
  targetId: r.target_id,
  listId: r.list_id,
  listTitle: r.list_title ?? undefined,
  quarter: r.quarter ?? undefined,
  companyName: r.company_name,
  industry: r.industry ?? '',
  region: r.region ?? '',
  qScore: Number(r.q_score ?? 0),
  tScore: Number(r.t_score ?? 0),
  totalScore: Number(r.q_score ?? 0) + Number(r.t_score ?? 0),
  rankNo: r.rank_no != null ? Number(r.rank_no) : null,
  signalNote: r.signal_note ?? '',
  status: Number(r.status),
  ownerId: r.owner_id,
  ownerName: r.owner_name ?? undefined,
  claimedAt: r.claimed_at,
  firstTouchDeadline: r.first_touch_deadline,
  touchDeadline: r.touch_deadline,
  touchCount: Number(r.touch_count ?? 0),
  effectiveTouchCount: Number(r.effective_touch_count ?? 0),
  lastTouchAt: r.last_touch_at,
  frozenUntil: r.frozen_until,
  customerId: r.customer_id,
  opportunityId: r.opportunity_id,
  resultNote: r.result_note ?? '',
});

const mapSignal = (r: any) => ({
  signalId: r.signal_id,
  type: Number(r.type),
  title: r.title,
  detail: r.detail ?? '',
  companyName: r.company_name,
  targetId: r.target_id,
  customerId: r.customer_id,
  ownerId: r.owner_id,
  ownerName: r.owner_name ?? undefined,
  dueAt: r.due_at,
  status: Number(r.status),
  overdue: Number(r.status) === 1 && r.due_at != null && new Date(r.due_at).getTime() < Date.now(),
  disposition: r.disposition != null ? Number(r.disposition) : null,
  dispositionNote: r.disposition_note ?? '',
  opportunityId: r.opportunity_id,
  handledBy: r.handled_by,
  handledAt: r.handled_at,
  createdAt: r.created_at,
});

const mapCampaign = (r: any) => ({
  campaignId: r.campaign_id,
  name: r.name,
  quarter: r.quarter,
  line: r.line,
  scenarioCard: r.scenario_card ?? '',
  goal: r.goal ?? '',
  ownerId: r.owner_id,
  ownerName: r.owner_name ?? undefined,
  status: Number(r.status),
  kitList: !!r.kit_list,
  kitScript: !!r.kit_script,
  kitContent: !!r.kit_content,
  kitSignal: !!r.kit_signal,
  reviewNote: r.review_note ?? '',
  startedAt: r.started_at,
  endedAt: r.ended_at,
  createdAt: r.created_at,
});

// 当前季度（如 2026Q3）
function currentQuarter(): string {
  const d = new Date();
  return `${d.getFullYear()}Q${Math.floor(d.getMonth() / 3) + 1}`;
}

// 懒惰维护（第五/六条）：冷冻到期回池；承接超期（30天未首触 / 90天不足3次有效触达）系统收回改派
async function sweepTargets(orgId: number) {
  await query(
    `UPDATE prospect_target SET status=1, owner_id=NULL, claimed_at=NULL,
       first_touch_deadline=NULL, touch_deadline=NULL, frozen_until=NULL,
       result_note='冷冻期满自动回池'
     WHERE organization_id=$1 AND status=4 AND frozen_until IS NOT NULL AND frozen_until < now()`,
    [orgId],
  );
  await query(
    `UPDATE prospect_target SET status=5,
       result_note = CASE WHEN touch_count = 0 THEN '30天未首触，系统收回' ELSE '90天未完成3次有效触达，系统收回' END
     WHERE organization_id=$1 AND status=2
       AND ((touch_count = 0 AND first_touch_deadline < now())
         OR (effective_touch_count < 3 AND touch_deadline < now()))`,
    [orgId],
  );
}

// ============================================================
// ICP 画像（第四条）
// ============================================================
prospectingRouter.get(
  '/prospecting/icps',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    // 渗透率 = 存量客户数 / TAM（第五条）：存量按行业范围分词匹配客户行业
    const rows = await query(
      `SELECT i.*, (
         SELECT count(*) FROM customer c
         WHERE c.organization_id = i.organization_id AND c.category = 3 AND c.active = 1
           AND i.industry_scope IS NOT NULL AND i.industry_scope <> ''
           AND EXISTS (
             SELECT 1 FROM unnest(regexp_split_to_array(i.industry_scope, '[,，/、\\s]+')) t(tok)
             WHERE tok <> '' AND c.industry ILIKE '%' || tok || '%'
           )
       ) AS stock_count
       FROM prospect_icp i WHERE i.organization_id=$1 AND i.active=1 ORDER BY i.line, i.name`,
      [orgId],
    );
    ok(res, rows.map(mapIcp));
  }),
);

const icpSchema = z.object({
  name: z.string().min(2),
  line: z.string().min(1),
  industryScope: z.string().optional(),
  sizeRange: z.string().optional(),
  qualifications: z.string().optional(),
  exclusions: z.string().optional(),
  version: z.string().optional(),
  quarter: z.string().optional(),
  tamCount: z.coerce.number().int().min(0).optional(),
});

prospectingRouter.post(
  '/prospecting/icps',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const d = icpSchema.parse(req.body);
    const row = await one(
      `INSERT INTO prospect_icp (organization_id, name, line, industry_scope, size_range, qualifications, exclusions, version, quarter, tam_count, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
      [orgId, d.name, d.line, d.industryScope ?? null, d.sizeRange ?? null, d.qualifications ?? null,
       d.exclusions ?? null, d.version ?? 'V1.0', d.quarter ?? currentQuarter(), d.tamCount ?? 0, userId],
    );
    ok(res, mapIcp(row));
  }),
);

prospectingRouter.put(
  '/prospecting/icps/:id',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const d = icpSchema.partial().extend({ active: z.coerce.number().optional() }).parse(req.body);
    const map: Record<string, string> = {
      name: 'name', line: 'line', industryScope: 'industry_scope', sizeRange: 'size_range',
      qualifications: 'qualifications', exclusions: 'exclusions', version: 'version',
      quarter: 'quarter', tamCount: 'tam_count', active: 'active',
    };
    const sets: string[] = []; const vals: unknown[] = [];
    for (const [k, col] of Object.entries(map)) {
      const v = (d as any)[k];
      if (v !== undefined) { vals.push(v); sets.push(`${col}=$${vals.length}`); }
    }
    if (!sets.length) return fail(res, '无更新内容');
    vals.push(req.params.id, orgId);
    const row = await one(
      `UPDATE prospect_icp SET ${sets.join(', ')} WHERE icp_id=$${vals.length - 1} AND organization_id=$${vals.length} RETURNING *`,
      vals,
    );
    if (!row) return fail(res, 'ICP 不存在', 1, 404);
    ok(res, mapIcp(row));
  }),
);

// ============================================================
// 作战名单批次（第五条）
// ============================================================
const LIST_FILTERS: Record<string, FilterDef> = {
  quarter: { col: 'l.quarter', kind: 'eq' },
  line: { col: 'l.line', kind: 'eq' },
  status: { col: 'l.status', kind: 'in' },
};

prospectingRouter.post(
  '/prospecting/lists/list',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const body = parseList(req);
    const result = await runList(
      {
        table: `prospect_list l LEFT JOIN prospect_icp i ON i.icp_id = l.icp_id`,
        select: `l.*, i.name AS icp_name,
          (SELECT count(*) FROM prospect_target t WHERE t.list_id = l.list_id) AS target_count,
          (SELECT count(*) FROM prospect_target t WHERE t.list_id = l.list_id AND t.status = 3) AS converted_count`,
        searchCols: ['l.title', 'l.line'],
        filterMap: LIST_FILTERS,
        defaultOrder: 'l.created_at DESC',
        baseConds: ['l.organization_id = $1'],
        baseParams: [orgId],
        mapRow: mapList,
      },
      body,
    );
    ok(res, result);
  }),
);

const listSchema = z.object({
  title: z.string().min(2),
  quarter: z.string().min(4),
  line: z.string().min(1),
  icpId: z.coerce.number().int().positive().optional(),
});

prospectingRouter.post(
  '/prospecting/lists',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const d = listSchema.parse(req.body);
    const row = await one(
      `INSERT INTO prospect_list (organization_id, title, quarter, line, icp_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [orgId, d.title, d.quarter, d.line, d.icpId ?? null, userId],
    );
    ok(res, mapList(row));
  }),
);

prospectingRouter.post(
  '/prospecting/lists/:id/publish',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const row = await one(
      `UPDATE prospect_list SET status=2, published_at=now() WHERE list_id=$1 AND organization_id=$2 AND status=1 RETURNING *`,
      [req.params.id, orgId],
    );
    if (!row) return fail(res, '名单不存在或已发布');
    ok(res, mapList(row));
  }),
);

// 批量加入目标（第五条流水线：排除存量客户/已在册目标，按 Q+T 分排序定名次）
const targetsAddSchema = z.object({
  items: z
    .array(
      z.object({
        companyName: z.string().min(2),
        industry: z.string().optional(),
        region: z.string().optional(),
        qScore: z.coerce.number().int().min(0).max(100).optional(),
        tScore: z.coerce.number().int().min(0).max(100).optional(),
        signalNote: z.string().optional(),
      }),
    )
    .min(1)
    .max(200),
});

prospectingRouter.post(
  '/prospecting/lists/:id/targets',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const listId = Number(req.params.id);
    const list = await one(`SELECT * FROM prospect_list WHERE list_id=$1 AND organization_id=$2`, [listId, orgId]);
    if (!list) return fail(res, '名单不存在', 1, 404);
    const d = targetsAddSchema.parse(req.body);

    const names = d.items.map((it) => it.companyName.trim());
    // 排除存量客户及控股子公司（简化为同名客户）
    const existCust = await query<{ name: string }>(
      `SELECT name FROM customer WHERE organization_id=$1 AND category=3 AND active=1 AND name = ANY($2)`,
      [orgId, names],
    );
    // 排除本名单已在册目标
    const existTarget = await query<{ company_name: string }>(
      `SELECT company_name FROM prospect_target WHERE list_id=$1 AND company_name = ANY($2)`,
      [listId, names],
    );
    const skipCust = new Set(existCust.map((r) => r.name));
    const skipDup = new Set(existTarget.map((r) => r.company_name));
    const fresh = d.items.filter((it) => !skipCust.has(it.companyName.trim()) && !skipDup.has(it.companyName.trim()));

    const added = await tx(async (c) => {
      const out: any[] = [];
      for (const it of fresh) {
        const r = await c.query(
          `INSERT INTO prospect_target (organization_id, list_id, company_name, industry, region, q_score, t_score, signal_note)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
          [orgId, listId, it.companyName.trim(), it.industry ?? null, it.region ?? null, it.qScore ?? 0, it.tScore ?? 0, it.signalNote ?? null],
        );
        out.push(r.rows[0]);
      }
      // 重排名次：Q+T 总分降序
      await c.query(
        `UPDATE prospect_target t SET rank_no = s.rn FROM (
           SELECT target_id, row_number() OVER (ORDER BY q_score + t_score DESC, target_id) AS rn
           FROM prospect_target WHERE list_id = $1
         ) s WHERE t.target_id = s.target_id`,
        [listId],
      );
      return out;
    });
    ok(res, {
      added: added.length,
      skippedExistingCustomer: [...skipCust],
      skippedDuplicate: [...skipDup],
    });
  }),
);

// ============================================================
// 名单目标（第六条）
// ============================================================
const TARGET_FILTERS: Record<string, FilterDef> = {
  listId: { col: 't.list_id', kind: 'eq' },
  status: { col: 't.status', kind: 'in' },
  ownerId: { col: 't.owner_id', kind: 'eq' },
  quarter: { col: 'l.quarter', kind: 'eq' },
};

prospectingRouter.post(
  '/prospecting/targets/list',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const body = parseList(req);
    await sweepTargets(orgId);
    const conds = ['t.organization_id = $1'];
    if (body.tab === 'pending') conds.push('t.status IN (1,5)');
    else if (body.tab === 'mine') conds.push(`t.owner_id = ${userId} AND t.status = 2`);
    else if (body.tab === 'frozen') conds.push('t.status = 4');
    else if (body.tab === 'converted') conds.push('t.status = 3');
    const result = await runList(
      {
        table: `prospect_target t
          JOIN prospect_list l ON l.list_id = t.list_id
          LEFT JOIN app_user u ON u.user_id = t.owner_id`,
        select: 't.*, l.title AS list_title, l.quarter, u.name AS owner_name',
        searchCols: ['t.company_name', 't.industry', 't.region'],
        filterMap: TARGET_FILTERS,
        sortMap: { totalScore: 't.q_score + t.t_score', rankNo: 't.rank_no' },
        defaultOrder: 't.rank_no NULLS LAST, t.target_id',
        baseConds: conds,
        baseParams: [orgId],
        mapRow: mapTarget,
      },
      body,
    );
    ok(res, result);
  }),
);

// 承接：30天内首轮触达 / 90天内三次有效触达（第六条）
prospectingRouter.post(
  '/prospecting/targets/:id/claim',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const row = await one(
      `UPDATE prospect_target SET status=2, owner_id=$1, claimed_at=now(),
         first_touch_deadline = now() + interval '30 day', touch_deadline = now() + interval '90 day',
         result_note = NULL
       WHERE target_id=$2 AND organization_id=$3 AND status IN (1,5) RETURNING *`,
      [userId, req.params.id, orgId],
    );
    if (!row) return fail(res, '目标不可承接（不存在或状态不允许）');
    ok(res, mapTarget(row));
  }),
);

const touchSchema = z.object({
  method: z.string().min(1).max(20),
  content: z.string().optional(),
  effective: z.boolean().optional(),
});

prospectingRouter.post(
  '/prospecting/targets/:id/touch',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const d = touchSchema.parse(req.body);
    const target = await one(
      `SELECT * FROM prospect_target WHERE target_id=$1 AND organization_id=$2`,
      [req.params.id, orgId],
    );
    if (!target) return fail(res, '目标不存在', 1, 404);
    if (Number(target.status) !== 2) return fail(res, '仅跟进中的目标可登记触达');
    const effective = d.effective !== false;
    const row = await tx(async (c) => {
      await c.query(
        `INSERT INTO prospect_touch (organization_id, target_id, method, content, effective, created_by)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [orgId, target.target_id, d.method, d.content ?? null, effective, userId],
      );
      const r = await c.query(
        `UPDATE prospect_target SET touch_count = touch_count + 1,
           effective_touch_count = effective_touch_count + $1, last_touch_at = now()
         WHERE target_id=$2 RETURNING *`,
        [effective ? 1 : 0, target.target_id],
      );
      return r.rows[0];
    });
    ok(res, mapTarget(row));
  }),
);

prospectingRouter.get(
  '/prospecting/targets/:id/touches',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const rows = await query(
      `SELECT p.*, u.name AS user_name FROM prospect_touch p LEFT JOIN app_user u ON u.user_id = p.created_by
       WHERE p.target_id=$1 AND p.organization_id=$2 ORDER BY p.created_at DESC`,
      [req.params.id, orgId],
    );
    ok(res, rows.map((r) => ({
      touchId: r.touch_id,
      method: r.method,
      content: r.content ?? '',
      effective: !!r.effective,
      userName: r.user_name ?? '',
      createdAt: r.created_at,
    })));
  }),
);

// 冷冻：≥3次有效触达仍无进展 → 冷冻6个月，信号雷达继续监控（第五条）
prospectingRouter.post(
  '/prospecting/targets/:id/freeze',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const note = String(req.body?.note ?? '').slice(0, 300);
    const row = await one(
      `UPDATE prospect_target SET status=4, frozen_until = now() + interval '6 month', result_note=$1
       WHERE target_id=$2 AND organization_id=$3 AND status=2 RETURNING *`,
      [note || '完整触达无进展，冷冻6个月', req.params.id, orgId],
    );
    if (!row) return fail(res, '仅跟进中的目标可冷冻');
    ok(res, mapTarget(row));
  }),
);

// 强信号提前解冻 → 回池待承接
prospectingRouter.post(
  '/prospecting/targets/:id/unfreeze',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const note = String(req.body?.note ?? '').slice(0, 300);
    const row = await one(
      `UPDATE prospect_target SET status=1, owner_id=NULL, claimed_at=NULL,
         first_touch_deadline=NULL, touch_deadline=NULL, frozen_until=NULL, result_note=$1
       WHERE target_id=$2 AND organization_id=$3 AND status=4 RETURNING *`,
      [note || '强信号提前解冻', req.params.id, orgId],
    );
    if (!row) return fail(res, '仅冷冻中的目标可解冻');
    ok(res, mapTarget(row));
  }),
);

// 转商机：建档客户（003号新客户建档归开发人）+ 商机报备（第六条）
const convertSchema = z.object({
  oppName: z.string().optional(),
  estimatedAmount: z.string().optional(),
  note: z.string().optional(), // 《客户数据需求收集表》摘要
});

prospectingRouter.post(
  '/prospecting/targets/:id/convert',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const d = convertSchema.parse(req.body ?? {});
    const target = await one(
      `SELECT * FROM prospect_target WHERE target_id=$1 AND organization_id=$2`,
      [req.params.id, orgId],
    );
    if (!target) return fail(res, '目标不存在', 1, 404);
    if (Number(target.status) === 3) return fail(res, '目标已转商机');
    const leaderId = target.owner_id ?? userId;

    const out = await tx(async (c) => {
      // 已有同名存量客户则直接挂靠，否则新建档（category=3）
      let cust = (
        await c.query(
          `SELECT customer_id, leader_id FROM customer WHERE organization_id=$1 AND category=3 AND active=1 AND name=$2 LIMIT 1`,
          [orgId, target.company_name],
        )
      ).rows[0];
      if (!cust) {
        cust = (
          await c.query(
            `INSERT INTO customer (organization_id, name, category, status_term_id, industry, leader_id, created_by, tracking_update_at)
             VALUES ($1,$2,3,8,$3,$4,$5, now()) RETURNING customer_id, leader_id`,
            [orgId, target.company_name, target.industry ?? null, leaderId, userId],
          )
        ).rows[0];
      }
      const seq = (await c.query(`SELECT count(*)+1 AS n FROM opportunity WHERE organization_id=$1`, [orgId])).rows[0];
      const code = `OPP${new Date().getFullYear()}${String(seq.n).padStart(4, '0')}`;
      const opp = (
        await c.query(
          `INSERT INTO opportunity (organization_id, code, name, customer_id, estimated_amount, status_term_id, leader_id, department_id, status_expiry_at)
           VALUES ($1,$2,$3,$4,$5,30,$6,2, now()+interval '14 day') RETURNING opportunity_id, code`,
          [orgId, code, d.oppName || `${target.company_name} 开拓商机`, cust.customer_id, d.estimatedAmount ?? '0', leaderId],
        )
      ).rows[0];
      await c.query(`UPDATE customer SET opportunity_count = opportunity_count + 1 WHERE customer_id=$1`, [cust.customer_id]);
      const t = (
        await c.query(
          `UPDATE prospect_target SET status=3, customer_id=$1, opportunity_id=$2, result_note=$3 WHERE target_id=$4 RETURNING *`,
          [cust.customer_id, opp.opportunity_id, d.note ?? '已填报《客户数据需求收集表》', target.target_id],
        )
      ).rows[0];
      return { target: t, opportunityId: opp.opportunity_id, code: opp.code, customerId: cust.customer_id };
    });
    ok(res, { ...mapTarget(out.target), opportunityCode: out.code });
  }),
);

// ============================================================
// 信号雷达（第七/八条）
// ============================================================
// 类型 → SLA：1监管48h 2预算24h 3换约14天布局窗 4扩张1周
const SIGNAL_SLA_HOURS: Record<number, number> = { 1: 48, 2: 24, 3: 336, 4: 168 };

const SIGNAL_FILTERS: Record<string, FilterDef> = {
  type: { col: 's.type', kind: 'in' },
  ownerId: { col: 's.owner_id', kind: 'eq' },
  disposition: { col: 's.disposition', kind: 'in' },
};

prospectingRouter.post(
  '/prospecting/signals/list',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const body = parseList(req);
    const conds = ['s.organization_id = $1'];
    if (body.tab === 'pending') conds.push('s.status = 1');
    else if (body.tab === 'handled') conds.push('s.status = 2');
    else if (body.tab === 'mine') conds.push(`s.owner_id = ${userId} AND s.status = 1`);
    const result = await runList(
      {
        table: 'prospect_signal s LEFT JOIN app_user u ON u.user_id = s.owner_id',
        select: 's.*, u.name AS owner_name',
        searchCols: ['s.title', 's.company_name'],
        filterMap: SIGNAL_FILTERS,
        defaultOrder: 's.status ASC, s.due_at ASC',
        baseConds: conds,
        baseParams: [orgId],
        mapRow: mapSignal,
      },
      body,
    );
    ok(res, result);
  }),
);

const signalSchema = z.object({
  type: z.coerce.number().int().min(1).max(4),
  title: z.string().min(2),
  detail: z.string().optional(),
  companyName: z.string().min(2),
  targetId: z.coerce.number().int().positive().optional(),
  customerId: z.coerce.number().int().positive().optional(),
  ownerId: z.coerce.number().int().positive().optional(),
});

prospectingRouter.post(
  '/prospecting/signals',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const d = signalSchema.parse(req.body);
    // 004号路由：优先目标承接人 → 客户管辖负责人 → 录入人
    let ownerId = d.ownerId ?? null;
    let targetId = d.targetId ?? null;
    if (!targetId) {
      const t = await one<{ target_id: number; owner_id: number | null }>(
        `SELECT target_id, owner_id FROM prospect_target WHERE organization_id=$1 AND company_name=$2 AND status IN (2,4) ORDER BY status LIMIT 1`,
        [orgId, d.companyName],
      );
      if (t) { targetId = t.target_id; ownerId = ownerId ?? t.owner_id; }
    } else if (!ownerId) {
      const t = await one<{ owner_id: number | null }>(`SELECT owner_id FROM prospect_target WHERE target_id=$1`, [targetId]);
      ownerId = t?.owner_id ?? null;
    }
    let customerId = d.customerId ?? null;
    if (!customerId) {
      const c = await one<{ customer_id: number; leader_id: number | null }>(
        `SELECT customer_id, leader_id FROM customer WHERE organization_id=$1 AND category=3 AND active=1 AND name=$2 LIMIT 1`,
        [orgId, d.companyName],
      );
      if (c) { customerId = c.customer_id; ownerId = ownerId ?? c.leader_id; }
    } else if (!ownerId) {
      const c = await one<{ leader_id: number | null }>(`SELECT leader_id FROM customer WHERE customer_id=$1`, [customerId]);
      ownerId = c?.leader_id ?? null;
    }
    const sla = SIGNAL_SLA_HOURS[d.type];
    const row = await one(
      `INSERT INTO prospect_signal (organization_id, type, title, detail, company_name, target_id, customer_id, owner_id, due_at, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now() + make_interval(hours => $9), $10) RETURNING *`,
      [orgId, d.type, d.title, d.detail ?? null, d.companyName, targetId, customerId, ownerId ?? userId, sla, userId],
    );
    ok(res, mapSignal(row));
  }),
);

// 处置留痕：触达/转商机/误报/暂缓（第八条）
const handleSchema = z.object({
  disposition: z.coerce.number().int().min(1).max(4),
  note: z.string().optional(),
});

prospectingRouter.post(
  '/prospecting/signals/:id/handle',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const d = handleSchema.parse(req.body);
    const row = await one(
      `UPDATE prospect_signal SET status=2, disposition=$1, disposition_note=$2, handled_by=$3, handled_at=now()
       WHERE signal_id=$4 AND organization_id=$5 AND status=1 RETURNING *`,
      [d.disposition, d.note ?? null, userId, req.params.id, orgId],
    );
    if (!row) return fail(res, '信号不存在或已处置');
    ok(res, mapSignal(row));
  }),
);

// ============================================================
// 白空间矩阵（第九条）：实格 = 合同产品 ∪ 商机产品
// ============================================================
prospectingRouter.get(
  '/prospecting/whitespace',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const products = await query(
      `SELECT product_id, code, name FROM product WHERE organization_id=$1 AND active ORDER BY code`,
      [orgId],
    );
    const customers = await query(
      `SELECT c.customer_id, c.name, c.industry, u.name AS leader_name
       FROM customer c LEFT JOIN app_user u ON u.user_id = c.leader_id
       WHERE c.organization_id=$1 AND c.category=3 AND c.active=1 ORDER BY c.customer_id LIMIT 200`,
      [orgId],
    );
    const owned = await query<{ customer_id: number; product_id: number }>(
      `SELECT DISTINCT ct.customer_id, cp.product_id
         FROM contract_product cp JOIN contract ct ON ct.contract_id = cp.contract_id
        WHERE ct.organization_id=$1 AND ct.status <> 5
       UNION
       SELECT DISTINCT o.customer_id, op.product_id
         FROM opportunity_product op JOIN opportunity o ON o.opportunity_id = op.opportunity_id
        WHERE o.organization_id=$1 AND o.active=1`,
      [orgId],
    );
    const flags = await query(
      `SELECT customer_id, product_id, status, note FROM prospect_whitespace WHERE organization_id=$1`,
      [orgId],
    );
    const ownedBy = new Map<number, number[]>();
    for (const r of owned) {
      const arr = ownedBy.get(r.customer_id) ?? [];
      arr.push(r.product_id);
      ownedBy.set(r.customer_id, arr);
    }
    const flagBy = new Map<number, Record<number, { status: number; note: string }>>();
    for (const f of flags) {
      const m = flagBy.get(f.customer_id) ?? {};
      m[f.product_id] = { status: Number(f.status), note: f.note ?? '' };
      flagBy.set(f.customer_id, m);
    }
    const rows = customers.map((c) => ({
      customerId: c.customer_id,
      customerName: c.name,
      industry: c.industry ?? '',
      leaderName: c.leader_name ?? '',
      ownedProductIds: ownedBy.get(c.customer_id) ?? [],
      flags: flagBy.get(c.customer_id) ?? {},
    }));
    const skuCounts = rows.map((r) => r.ownedProductIds.length);
    const withSku = skuCounts.filter((n) => n > 0);
    ok(res, {
      products: products.map((p) => ({ productId: p.product_id, code: p.code, name: p.name })),
      rows,
      stats: {
        customerCount: rows.length,
        multiSkuRatio: withSku.length ? withSku.filter((n) => n >= 2).length / withSku.length : 0,
        avgSku: withSku.length ? withSku.reduce((a, b) => a + b, 0) / withSku.length : 0,
      },
    });
  }),
);

const wsSchema = z.object({
  customerId: z.coerce.number().int().positive(),
  productId: z.coerce.number().int().positive(),
  status: z.coerce.number().int().min(2).max(4).nullable(), // null=清除标记回白格
  note: z.string().optional(),
});

prospectingRouter.put(
  '/prospecting/whitespace',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const d = wsSchema.parse(req.body);
    if (d.status == null) {
      await query(`DELETE FROM prospect_whitespace WHERE organization_id=$1 AND customer_id=$2 AND product_id=$3`, [orgId, d.customerId, d.productId]);
      return ok(res, { cleared: true });
    }
    await query(
      `INSERT INTO prospect_whitespace (organization_id, customer_id, product_id, status, note, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (organization_id, customer_id, product_id)
       DO UPDATE SET status=EXCLUDED.status, note=EXCLUDED.note, updated_by=EXCLUDED.updated_by, updated_at=now()`,
      [orgId, d.customerId, d.productId, d.status, d.note ?? null, userId],
    );
    ok(res, { customerId: d.customerId, productId: d.productId, status: d.status, note: d.note ?? '' });
  }),
);

// ============================================================
// 季度开拓战役（第十五条）
// ============================================================
const CAMPAIGN_FILTERS: Record<string, FilterDef> = {
  quarter: { col: 'p.quarter', kind: 'eq' },
  line: { col: 'p.line', kind: 'eq' },
  status: { col: 'p.status', kind: 'in' },
};

prospectingRouter.post(
  '/prospecting/campaigns/list',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const body = parseList(req);
    const result = await runList(
      {
        table: 'prospect_campaign p LEFT JOIN app_user u ON u.user_id = p.owner_id',
        select: 'p.*, u.name AS owner_name',
        searchCols: ['p.name', 'p.scenario_card', 'p.line'],
        filterMap: CAMPAIGN_FILTERS,
        defaultOrder: 'p.created_at DESC',
        baseConds: ['p.organization_id = $1'],
        baseParams: [orgId],
        mapRow: mapCampaign,
      },
      body,
    );
    ok(res, result);
  }),
);

const campaignSchema = z.object({
  name: z.string().min(2),
  quarter: z.string().min(4),
  line: z.string().min(1),
  scenarioCard: z.string().optional(),
  goal: z.string().optional(),
  ownerId: z.coerce.number().int().positive().optional(),
});

prospectingRouter.post(
  '/prospecting/campaigns',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const d = campaignSchema.parse(req.body);
    const row = await one(
      `INSERT INTO prospect_campaign (organization_id, name, quarter, line, scenario_card, goal, owner_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [orgId, d.name, d.quarter, d.line, d.scenarioCard ?? null, d.goal ?? null, d.ownerId ?? userId, userId],
    );
    ok(res, mapCampaign(row));
  }),
);

const campaignEditSchema = z.object({
  status: z.coerce.number().int().min(1).max(4).optional(),
  kitList: z.boolean().optional(),
  kitScript: z.boolean().optional(),
  kitContent: z.boolean().optional(),
  kitSignal: z.boolean().optional(),
  reviewNote: z.string().optional(),
  goal: z.string().optional(),
});

prospectingRouter.put(
  '/prospecting/campaigns/:id',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const d = campaignEditSchema.parse(req.body);
    // 复盘产出强制回写：结束前必须有复盘记录（第十五条）
    if (d.status === 4) {
      const cur = await one<{ review_note: string | null }>(
        `SELECT review_note FROM prospect_campaign WHERE campaign_id=$1 AND organization_id=$2`,
        [req.params.id, orgId],
      );
      if (!cur) return fail(res, '战役不存在', 1, 404);
      if (!(d.reviewNote ?? cur.review_note)) return fail(res, '战役结束前须回写复盘（名单命中率/话术有效性/信号查准率）');
    }
    const map: Record<string, string> = {
      status: 'status', kitList: 'kit_list', kitScript: 'kit_script', kitContent: 'kit_content',
      kitSignal: 'kit_signal', reviewNote: 'review_note', goal: 'goal',
    };
    const sets: string[] = []; const vals: unknown[] = [];
    for (const [k, col] of Object.entries(map)) {
      const v = (d as any)[k];
      if (v !== undefined) { vals.push(v); sets.push(`${col}=$${vals.length}`); }
    }
    if (d.status === 2) sets.push('started_at = COALESCE(started_at, now())');
    if (d.status === 4) sets.push('ended_at = now()');
    if (!sets.length) return fail(res, '无更新内容');
    vals.push(req.params.id, orgId);
    const row = await one(
      `UPDATE prospect_campaign SET ${sets.join(', ')} WHERE campaign_id=$${vals.length - 1} AND organization_id=$${vals.length} RETURNING *`,
      vals,
    );
    if (!row) return fail(res, '战役不存在', 1, 404);
    ok(res, mapCampaign(row));
  }),
);

// ============================================================
// 开拓指标（第十四条）
// ============================================================
prospectingRouter.get(
  '/prospecting/stats',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const quarter = String(req.query.quarter || currentQuarter());
    await sweepTargets(orgId);

    // 自拓商机占比：来源为名单/信号的在途商机 / 全部在途商机
    const opp = await one<{ total: number; prospect: number }>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE o.opportunity_id IN (
                SELECT opportunity_id FROM prospect_target WHERE organization_id=$1 AND opportunity_id IS NOT NULL
                UNION
                SELECT opportunity_id FROM prospect_signal WHERE organization_id=$1 AND opportunity_id IS NOT NULL
              ))::int AS prospect
       FROM opportunity o WHERE o.organization_id=$1 AND o.active=1`,
      [orgId],
    );

    // 名单漏斗与触达完成率（季度口径）
    const funnel = await one<any>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE t.status <> 1)::int AS claimed,
              count(*) FILTER (WHERE t.touch_count > 0)::int AS touched,
              count(*) FILTER (WHERE t.effective_touch_count >= 3 OR t.status IN (3,4))::int AS completed,
              count(*) FILTER (WHERE t.status = 3)::int AS converted,
              count(*) FILTER (WHERE t.status = 4)::int AS frozen,
              count(*) FILTER (WHERE t.status = 5)::int AS recalled
       FROM prospect_target t JOIN prospect_list l ON l.list_id = t.list_id
       WHERE t.organization_id=$1 AND l.quarter=$2`,
      [orgId, quarter],
    );

    // 信号处置：及时率（SLA内处置）+ 查准率（1-误报）分类型
    const signalRows = await query<any>(
      `SELECT type,
              count(*)::int AS total,
              count(*) FILTER (WHERE status=2)::int AS handled,
              count(*) FILTER (WHERE status=2 AND handled_at <= due_at)::int AS timely,
              count(*) FILTER (WHERE status=2 AND disposition=3)::int AS false_positive,
              count(*) FILTER (WHERE status=1 AND due_at < now())::int AS overdue
       FROM prospect_signal WHERE organization_id=$1 GROUP BY type ORDER BY type`,
      [orgId],
    );
    const sigTotal = signalRows.reduce((a, r) => a + Number(r.total), 0);
    const sigHandled = signalRows.reduce((a, r) => a + Number(r.handled), 0);
    const sigTimely = signalRows.reduce((a, r) => a + Number(r.timely), 0);
    const sigFalse = signalRows.reduce((a, r) => a + Number(r.false_positive), 0);

    // 白空间：多SKU客户占比 / 户均SKU
    const ws = await one<any>(
      `SELECT count(*)::int AS with_sku,
              count(*) FILTER (WHERE n >= 2)::int AS multi,
              COALESCE(avg(n), 0)::float AS avg_sku
       FROM (
         SELECT customer_id, count(DISTINCT product_id)::int AS n FROM (
           SELECT ct.customer_id, cp.product_id
             FROM contract_product cp JOIN contract ct ON ct.contract_id = cp.contract_id
            WHERE ct.organization_id=$1 AND ct.status <> 5
           UNION
           SELECT o.customer_id, op.product_id
             FROM opportunity_product op JOIN opportunity o ON o.opportunity_id = op.opportunity_id
            WHERE o.organization_id=$1 AND o.active=1
         ) x GROUP BY customer_id
       ) y`,
      [orgId],
    );

    // TAM 渗透率（按 ICP）
    const icps = await query<any>(
      `SELECT i.icp_id, i.name, i.line, i.quarter, i.tam_count, (
         SELECT count(*) FROM customer c
         WHERE c.organization_id = i.organization_id AND c.category = 3 AND c.active = 1
           AND i.industry_scope IS NOT NULL AND i.industry_scope <> ''
           AND EXISTS (
             SELECT 1 FROM unnest(regexp_split_to_array(i.industry_scope, '[,，/、\\s]+')) t(tok)
             WHERE tok <> '' AND c.industry ILIKE '%' || tok || '%'
           )
       ) AS stock_count
       FROM prospect_icp i WHERE i.organization_id=$1 AND i.active=1 ORDER BY i.line, i.name`,
      [orgId],
    );

    // 战役概览
    const campaigns = await one<any>(
      `SELECT count(*)::int AS total,
              count(*) FILTER (WHERE status IN (1,2))::int AS running,
              count(*) FILTER (WHERE status = 4 AND review_note IS NOT NULL AND review_note <> '')::int AS reviewed
       FROM prospect_campaign WHERE organization_id=$1 AND quarter=$2`,
      [orgId, quarter],
    );

    ok(res, {
      quarter,
      selfSourced: {
        prospectOpportunities: Number(opp?.prospect ?? 0),
        totalOpportunities: Number(opp?.total ?? 0),
        ratio: Number(opp?.total) ? Number(opp!.prospect) / Number(opp!.total) : 0,
        targetRatio: 0.4, // ≥40%（试行期第二季度起考核）
      },
      listFunnel: {
        total: Number(funnel?.total ?? 0),
        claimed: Number(funnel?.claimed ?? 0),
        touched: Number(funnel?.touched ?? 0),
        completed: Number(funnel?.completed ?? 0),
        converted: Number(funnel?.converted ?? 0),
        frozen: Number(funnel?.frozen ?? 0),
        recalled: Number(funnel?.recalled ?? 0),
        touchRate: Number(funnel?.total) ? Number(funnel!.completed) / Number(funnel!.total) : 0,
        convRate: Number(funnel?.total) ? Number(funnel!.converted) / Number(funnel!.total) : 0,
        touchRateTarget: 0.9, // ≥90%
      },
      signals: {
        total: sigTotal,
        handled: sigHandled,
        pendingOverdue: signalRows.reduce((a, r) => a + Number(r.overdue), 0),
        timelyRate: sigHandled ? sigTimely / sigHandled : 0,
        timelyRateTarget: 0.85, // ≥85%
        precision: sigHandled ? 1 - sigFalse / sigHandled : 1,
        precisionTarget: 0.6, // ≥60%
        byType: signalRows.map((r) => ({
          type: Number(r.type),
          total: Number(r.total),
          handled: Number(r.handled),
          timely: Number(r.timely),
          falsePositive: Number(r.false_positive),
          precision: Number(r.handled) ? 1 - Number(r.false_positive) / Number(r.handled) : 1,
        })),
      },
      whitespace: {
        multiSkuRatio: Number(ws?.with_sku) ? Number(ws!.multi) / Number(ws!.with_sku) : 0,
        avgSku: Number(ws?.avg_sku ?? 0),
        customersWithSku: Number(ws?.with_sku ?? 0),
      },
      tam: icps.map((r) => ({
        icpId: r.icp_id,
        name: r.name,
        line: r.line,
        quarter: r.quarter,
        tamCount: Number(r.tam_count ?? 0),
        stockCount: Number(r.stock_count ?? 0),
        penetration: Number(r.tam_count) ? Number(r.stock_count) / Number(r.tam_count) : 0,
      })),
      campaigns: {
        total: Number(campaigns?.total ?? 0),
        running: Number(campaigns?.running ?? 0),
        reviewed: Number(campaigns?.reviewed ?? 0),
      },
    });
  }),
);
