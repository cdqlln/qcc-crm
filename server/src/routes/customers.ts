import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok, parseList } from '../http.js';
import { runList, type FilterDef } from '../list.js';
import { mapContact, mapCustomer, mapTracking } from '../mappers.js';
import { createApprovalTask } from './approvals.js';
import { autoAttachGroup } from './groups.js';
import { dataScopeCond } from '../auth.js';

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
    const scope = await dataScopeCond(req, 'leader_id'); // 数据范围
    if (scope) conds.push(scope);

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
    const row = await one(
      `SELECT c.*, g.name AS group_name FROM customer c LEFT JOIN customer_group g ON g.group_id=c.group_id
       WHERE c.customer_id=$1 AND c.organization_id=$2`,
      [req.params.id, orgId],
    );
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

const contactSchema = z.object({
  name: z.string().min(1),
  phone: z.string().optional(),
  email: z.string().optional(),
  wechat: z.string().optional(),
  position: z.string().optional(),
  department: z.string().optional(),
  remark: z.string().optional(),
  type: z.coerce.number().int().min(1).max(2).default(2),
  wecomExternalUserid: z.string().optional(),
});

// 新增联系人
customersRouter.post('/customers/:id/contacts', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const d = contactSchema.parse(req.body);
  const cid = Number(req.params.id);
  if (d.type === 1) await one(`UPDATE contact SET type=2 WHERE customer_id=$1 AND type=1`, [cid]); // 主联系人唯一
  const row = await one(
    `INSERT INTO contact (organization_id, customer_id, name, phone, email, wechat, position, department, remark, type, wecom_external_userid)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
    [orgId, cid, d.name, d.phone ?? null, d.email ?? null, d.wechat ?? null, d.position ?? null, d.department ?? null, d.remark ?? null, d.type, d.wecomExternalUserid ?? null],
  );
  ok(res, mapContact(row));
}));

// 编辑联系人
customersRouter.put('/contacts/:id', ah(async (req, res) => {
  const d = contactSchema.parse(req.body);
  const cur = await one<any>(`SELECT customer_id FROM contact WHERE contact_id=$1`, [req.params.id]);
  if (!cur) return fail(res, '联系人不存在', 1, 404);
  if (d.type === 1) await one(`UPDATE contact SET type=2 WHERE customer_id=$1 AND type=1 AND contact_id<>$2`, [cur.customer_id, req.params.id]);
  const row = await one(
    `UPDATE contact SET name=$1, phone=$2, email=$3, wechat=$4, position=$5, department=$6, remark=$7, type=$8, wecom_external_userid=$9
     WHERE contact_id=$10 RETURNING *`,
    [d.name, d.phone ?? null, d.email ?? null, d.wechat ?? null, d.position ?? null, d.department ?? null, d.remark ?? null, d.type, d.wecomExternalUserid ?? null, req.params.id],
  );
  ok(res, mapContact(row));
}));

customersRouter.delete('/contacts/:id', ah(async (req, res) => {
  await one(`DELETE FROM contact WHERE contact_id=$1`, [req.params.id]);
  ok(res, { ok: true });
}));

customersRouter.get(
  '/customers/:id/trackings',
  ah(async (req, res) => {
    const rows = await query(`SELECT * FROM customer_tracking WHERE customer_id=$1 ORDER BY created_at DESC`, [req.params.id]);
    ok(res, rows.map(mapTracking));
  }),
);

// 客户动态：聚合 CRM 行为（建客户/跟进/商机/报价/合同/开票/回款），含操作人与概况
customersRouter.get(
  '/customers/:id/activities',
  ah(async (req, res) => {
    const rows = await query(
      `SELECT t.kind, t.title, t.summary, t.at, u.name AS operator
       FROM (
         SELECT 'customer' kind, '新增客户' title, name summary, created_by op, created_at at FROM customer WHERE customer_id=$1
         UNION ALL
         SELECT 'tracking','跟进记录', left(comment, 50), created_by, created_at FROM customer_tracking WHERE customer_id=$1
         UNION ALL
         SELECT 'opportunity','新增商机', name || ' · 预计 ¥' || estimated_amount::text, leader_id, created_at FROM opportunity WHERE customer_id=$1
         UNION ALL
         SELECT 'quotation','新增报价', code || ' · ¥' || amount::text, bidder_id, created_at FROM quotation WHERE customer_id=$1
         UNION ALL
         SELECT 'contract','新增合同', code || ' · ¥' || amount::text, leader_id, created_at FROM contract WHERE customer_id=$1
         UNION ALL
         SELECT 'invoice','开票', COALESCE(code,'发票') || ' · ¥' || amount::text, NULL::bigint, created_at FROM invoice WHERE customer_id=$1
       ) t LEFT JOIN app_user u ON u.user_id = t.op
       ORDER BY t.at DESC NULLS LAST
       LIMIT 100`,
      [req.params.id],
    );
    ok(res, rows.map((r: any) => ({ kind: r.kind, title: r.title, summary: r.summary, operator: r.operator, date: r.at })));
  }),
);

// 写跟进记录（线索/客户共用）；可联动下次跟进 + 写待办（#5/#20/#23）
customersRouter.post(
  '/customers/:id/trackings',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const cid = Number(req.params.id);
    const comment = String(req.body?.comment || '').trim();
    if (!comment) return fail(res, '请填写跟进内容');
    const trackingType = req.body?.trackingType ? Number(req.body.trackingType) : null;
    const nextDate = req.body?.nextTrackingDate || null;
    const priority = req.body?.priorityLevel ? Number(req.body.priorityLevel) : 1;
    const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];
    const row = await one(
      `INSERT INTO customer_tracking (organization_id, customer_id, business_type, tracking_type_term, comment, next_tracking_at, priority_level, attachments, created_by)
       VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [orgId, cid, trackingType, comment, nextDate, priority, JSON.stringify(attachments), userId],
    );
    await one(`UPDATE customer SET tracking_num = tracking_num + 1, tracking_update_at = now(), next_tracking_at=$2 WHERE customer_id=$1`, [cid, nextDate]);
    // 有下次跟进时间 → 生成跟进计划待办（business_type=10）
    if (nextDate && req.body?.createBacklog !== false) {
      const cust = await one<{ name: string }>(`SELECT name FROM customer WHERE customer_id=$1`, [cid]);
      await one(
        `INSERT INTO back_log (organization_id, business_type, business_id, business_name, user_id, status, deadline_date, deadline_type)
         VALUES ($1,10,$2,$3,$4,0,$5,2)`,
        [orgId, cid, `跟进：${cust?.name ?? ''}`, userId, nextDate],
      );
    }
    ok(res, mapTracking(row));
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
  refCompanyId: z.string().optional(),
  leaderId: z.coerce.number().int().positive(),
});

customersRouter.post(
  '/customers',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, parsed.error.issues[0]?.message ?? '参数错误');
    const d = parsed.data;
    const row = await one<any>(
      `INSERT INTO customer (organization_id, name, ref_company_id, category, status_term_id, level_term_id, source_term_id,
         industry, phone_name, phone, email, leader_id, created_by, tracking_update_at)
       VALUES ($1,$2,$3,3,8,$4,$5,$6,$7,$8,$9,$10,$11, now()) RETURNING *`,
      [orgId, d.name, d.refCompanyId ?? null, d.level, d.source, d.industry ?? null, d.phoneName ?? null, d.phone ?? null, d.email ?? null, d.leaderId, userId],
    );
    // 按工商关系(企查查集团/实控人)自动归集；多公司同集团时自动归到一起
    const groupId = await autoAttachGroup(orgId, row.customer_id, d.name, d.refCompanyId);
    ok(res, mapCustomer({ ...row, group_id: groupId }));
  }),
);
