import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok, parseList } from '../http.js';
import { runList, type FilterDef } from '../list.js';
import { mapContact, mapCustomer, mapTracking } from '../mappers.js';
import { createApprovalTask } from './approvals.js';

export const customersRouter = Router();

const FILTERS: Record<string, FilterDef> = {
  level: { col: 'level_term_id', kind: 'in' },
  currentTrackingStatus: { col: 'status_term_id', kind: 'in' },
  source: { col: 'source_term_id', kind: 'eq' },
  labels: { col: 'labels', kind: 'array' },
  leaderId: { col: 'leader_id', kind: 'eq' },
  industry: { col: 'industry', kind: 'contains' },
  trackingUpdateDate: { col: 'tracking_update_at', kind: 'dateRange' },
};

customersRouter.post(
  '/customers/list',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const body = parseList(req);
    const conds = ['organization_id = $1', 'active = 1', 'category IN (3,4)'];
    const params: unknown[] = [orgId];
    if (body.tab === 'sea') conds.push('category = 4');
    else if (body.tab === 'mine') conds.push('category = 3');
    else if (body.tab === 'deal') conds.push('status_term_id IN (12,13,14)');

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

customersRouter.get(
  '/customers/:id',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const row = await one(`SELECT * FROM customer WHERE customer_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
    if (!row) return fail(res, '客户不存在', 1, 404);
    ok(res, mapCustomer(row));
  }),
);

customersRouter.get(
  '/customers/:id/contacts',
  ah(async (req, res) => {
    const rows = await query(`SELECT * FROM contact WHERE customer_id=$1 ORDER BY type, contact_id`, [req.params.id]);
    ok(res, rows.map(mapContact));
  }),
);

customersRouter.get(
  '/customers/:id/trackings',
  ah(async (req, res) => {
    const rows = await query(`SELECT * FROM customer_tracking WHERE customer_id=$1 ORDER BY created_at DESC`, [req.params.id]);
    ok(res, rows.map(mapTracking));
  }),
);

// 客户历史报价单价（价格保护：同客户同产品的最近成交/报价单价，供新报价带入与提醒）
customersRouter.get(
  '/customers/:id/last-quote-prices',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const rows = await query(
      `SELECT DISTINCT ON (qp.product_id)
         qp.product_id, qp.discount_price, qp.discount_rate, q.code, q.quote_date
       FROM quotation q JOIN quotation_product qp ON qp.quotation_id=q.quotation_id
       WHERE q.organization_id=$1 AND q.customer_id=$2
       ORDER BY qp.product_id, q.quote_date DESC NULLS LAST, q.quotation_id DESC`,
      [orgId, req.params.id],
    );
    ok(res, rows.map((r: any) => ({
      productId: r.product_id, unitPrice: r.discount_price, discountRate: r.discount_rate, code: r.code, quoteDate: r.quote_date,
    })));
  }),
);

// 客户负责人移交（需交接审批）：创建移交记录 + 审批任务(bt=8)
customersRouter.post(
  '/customers/:id/transfer',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const toUserId = Number(req.body?.toUserId);
    const reason = String(req.body?.reason || '');
    if (!toUserId) return fail(res, '请选择接收人');
    const cust = await one<any>(`SELECT customer_id, name, leader_id FROM customer WHERE customer_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
    if (!cust) return fail(res, '客户不存在', 1, 404);
    if (cust.leader_id === toUserId) return fail(res, '接收人与当前负责人相同');
    const open = await one(`SELECT 1 FROM customer_transfer WHERE customer_id=$1 AND status=2`, [cust.customer_id]);
    if (open) return fail(res, '已有进行中的移交审批');

    const tr = await one<any>(
      `INSERT INTO customer_transfer (organization_id, customer_id, from_user_id, to_user_id, reason)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [orgId, cust.customer_id, cust.leader_id ?? null, toUserId, reason]);
    try {
      const task = await createApprovalTask(orgId, userId, 8, cust.customer_id, `客户移交：${cust.name}`);
      await one(`UPDATE customer_transfer SET task_id=$1 WHERE transfer_id=$2`, [task.task_id, tr.transfer_id]);
      ok(res, { transferId: tr.transfer_id, taskId: task.task_id, status: 2 });
    } catch (e) {
      await one(`DELETE FROM customer_transfer WHERE transfer_id=$1`, [tr.transfer_id]);
      fail(res, e instanceof Error ? e.message : '发起移交失败');
    }
  }),
);

const createSchema = z.object({
  name: z.string().min(2),
  level: z.coerce.number().int().positive(),
  source: z.coerce.number().int().positive(),
  industry: z.string().optional(),
  phoneName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  leaderId: z.coerce.number().int().positive(),
});

customersRouter.post(
  '/customers',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, parsed.error.issues[0]?.message ?? '参数错误');
    const d = parsed.data;
    const row = await one(
      `INSERT INTO customer (organization_id, name, category, status_term_id, level_term_id, source_term_id,
         industry, phone_name, phone, email, leader_id, created_by, tracking_update_at)
       VALUES ($1,$2,3,8,$3,$4,$5,$6,$7,$8,$9,$10, now()) RETURNING *`,
      [orgId, d.name, d.level, d.source, d.industry ?? null, d.phoneName ?? null, d.phone ?? null, d.email ?? null, d.leaderId, userId],
    );
    ok(res, mapCustomer(row));
  }),
);
