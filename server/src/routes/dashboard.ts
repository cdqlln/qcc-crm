import { Router } from 'express';
import type { Request } from 'express';
import { one, query } from '../db.js';
import { ah, ctx, ok } from '../http.js';
import { dataScopeCond } from '../auth.js';

export const dashboardRouter = Router();

/**
 * 工作台聚合：全部来自真实库数据。
 * 视角（全公司/本部门/我）在用户 RBAC 数据范围之内进一步收窄；
 * 环比只给「新增线索/新增客户」（期内可比），存量指标（合同额等）不编造增幅。
 */

const TIME_UNITS: Record<string, string> = { day: 'day', week: 'week', month: 'month', quarter: 'quarter' };

async function scopeConds(req: Request, col: string, scope: string): Promise<string[]> {
  const { userId } = ctx(req);
  const conds: string[] = [];
  const rbac = await dataScopeCond(req, col); // RBAC 上限
  if (rbac) conds.push(rbac);
  if (scope === 'me') conds.push(`${col} = ${Number(userId)}`);
  else if (scope === 'dept')
    conds.push(`${col} IN (SELECT user_id FROM app_user WHERE department_id = (SELECT department_id FROM app_user WHERE user_id = ${Number(userId)}))`);
  return conds;
}

dashboardRouter.post('/dashboard', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const scope = ['company', 'dept', 'me'].includes(req.body?.scope) ? String(req.body.scope) : 'company';
  const unit = TIME_UNITS[String(req.body?.time)] ?? 'month';
  // unit 来自白名单，可安全内联
  const start = `date_trunc('${unit}', now())`;
  const prev = `${start} - interval '1 ${unit === 'quarter' ? 'month' : unit}' * ${unit === 'quarter' ? 3 : 1}`;

  const custScope = await scopeConds(req, 'leader_id', scope);
  const custWhere = ['organization_id=$1', 'active=1', ...custScope].join(' AND ');

  // KPI：客户表（线索=category 1/2；转商机后 status_term_id=17；新增客户=category 3/4）
  const kpi = await one<any>(
    `SELECT
       count(*) FILTER (WHERE created_at >= ${start} AND (category IN (1,2) OR status_term_id=17)) AS new_leads,
       count(*) FILTER (WHERE created_at >= ${prev} AND created_at < ${start} AND (category IN (1,2) OR status_term_id=17)) AS prev_leads,
       count(*) FILTER (WHERE created_at >= ${start} AND status_term_id=17) AS converted,
       count(*) FILTER (WHERE created_at >= ${start} AND category IN (3,4)) AS new_customers,
       count(*) FILTER (WHERE created_at >= ${prev} AND created_at < ${start} AND category IN (3,4)) AS prev_customers
     FROM customer WHERE ${custWhere}`,
    [orgId],
  );

  // 商机：总数 + 按阶段漏斗
  const oppScope = await scopeConds(req, 'leader_id', scope);
  const funnelRows = await query<any>(
    `SELECT status_term_id, count(*) AS n FROM opportunity
     WHERE ${['organization_id=$1', 'active=1', ...oppScope].join(' AND ')} GROUP BY status_term_id`,
    [orgId],
  );

  // 合同存量汇总（排除已作废）
  const ctScope = await scopeConds(req, 'leader_id', scope);
  const ct = await one<any>(
    `SELECT count(*) AS n, COALESCE(SUM(amount),0) AS amount, COALESCE(SUM(received_amount),0) AS received,
            COALESCE(SUM(outstanding_amount),0) AS outstanding
     FROM contract WHERE ${['organization_id=$1', 'status <> 5', ...ctScope].join(' AND ')}`,
    [orgId],
  );

  // 绩效 PK 榜（全公司口径的合同额排名）
  const pk = await query<any>(
    `SELECT u.name, COALESCE(SUM(c.amount),0) AS amount
     FROM app_user u
     LEFT JOIN contract c ON c.leader_id = u.user_id AND c.organization_id = $1 AND c.status <> 5
     WHERE u.organization_id = $1
     GROUP BY u.user_id, u.name
     ORDER BY amount DESC, u.user_id
     LIMIT 6`,
    [orgId],
  );

  // 最新跟进流（按跟进人应用视角）
  const trkScope = await scopeConds(req, 't.created_by', scope);
  const trackings = await query<any>(
    `SELECT t.comment, t.created_at, t.priority_level, u.name AS by_name, c.name AS customer_name, c.customer_id
     FROM customer_tracking t
     JOIN customer c ON c.customer_id = t.customer_id
     LEFT JOIN app_user u ON u.user_id = t.created_by
     WHERE ${['t.organization_id=$1', ...trkScope].join(' AND ')}
     ORDER BY t.created_at DESC LIMIT 6`,
    [orgId],
  );

  const num = (v: unknown) => Number(v ?? 0);
  const newLeads = num(kpi?.new_leads);
  const converted = num(kpi?.converted);
  ok(res, {
    kpis: {
      newLeads,
      prevLeads: num(kpi?.prev_leads),
      newCustomers: num(kpi?.new_customers),
      prevCustomers: num(kpi?.prev_customers),
      oppCount: funnelRows.reduce((s: number, r: any) => s + num(r.n), 0),
      contractCount: num(ct?.n),
      contractAmount: num(ct?.amount),
      receivedAmount: num(ct?.received),
      outstandingAmount: num(ct?.outstanding),
    },
    funnel: funnelRows.map((r: any) => ({ termId: Number(r.status_term_id), count: num(r.n) })),
    conversion: { newLeads, converted, rate: newLeads > 0 ? Math.round((converted / newLeads) * 1000) / 10 : 0 },
    pk: pk.map((r: any) => ({ name: r.name, amount: num(r.amount) })),
    recentTrackings: trackings.map((r: any) => ({
      by: r.by_name ?? '',
      customerId: Number(r.customer_id),
      customerName: r.customer_name,
      comment: r.comment ?? '',
      priorityLevel: r.priority_level ?? 1,
      at: r.created_at,
    })),
  });
}));
