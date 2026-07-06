import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok, parseList } from '../http.js';
import { runList, type FilterDef } from '../list.js';
import { mapContact, mapCustomer, mapTracking } from '../mappers.js';
import { createApprovalTask } from './approvals.js';
import { autoAttachGroup } from './groups.js';
import { dataScopeCond } from '../auth.js';
import { fuzzySearch, getQccCfg } from '../services/qcc.js';

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

// 工商企业名称补全（企查查 FuzzySearch）；未配置凭据时返回 enabled:false 由前端降级
customersRouter.get('/company-search', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const kw = String(req.query.kw ?? '').trim();
  const cfg = await getQccCfg(orgId);
  if (!cfg.enabled) return ok(res, { enabled: false, list: [] });
  if (kw.length < 2) return ok(res, { enabled: true, list: [] });
  const list = await fuzzySearch(orgId, kw);
  ok(res, { enabled: true, list: list ?? [] });
}));

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
  isKp: z.boolean().optional(),                         // KP 关键人标志
  orgNodeId: z.coerce.number().int().positive().nullish(), // 所属客户组织节点
});

// 新增联系人
customersRouter.post('/customers/:id/contacts', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const d = contactSchema.parse(req.body);
  const cid = Number(req.params.id);
  if (d.type === 1) await one(`UPDATE contact SET type=2 WHERE customer_id=$1 AND type=1`, [cid]); // 主联系人唯一
  const row = await one(
    `INSERT INTO contact (organization_id, customer_id, name, phone, email, wechat, position, department, remark, type, wecom_external_userid, is_kp, org_node_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
    [orgId, cid, d.name, d.phone ?? null, d.email ?? null, d.wechat ?? null, d.position ?? null, d.department ?? null, d.remark ?? null, d.type, d.wecomExternalUserid ?? null, d.isKp ?? false, d.orgNodeId ?? null],
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
    `UPDATE contact SET name=$1, phone=$2, email=$3, wechat=$4, position=$5, department=$6, remark=$7, type=$8, wecom_external_userid=$9,
       is_kp=COALESCE($11, is_kp), org_node_id=$12
     WHERE contact_id=$10 RETURNING *`,
    [d.name, d.phone ?? null, d.email ?? null, d.wechat ?? null, d.position ?? null, d.department ?? null, d.remark ?? null, d.type, d.wecomExternalUserid ?? null, req.params.id, d.isKp ?? null, d.orgNodeId ?? null],
  );
  ok(res, mapContact(row));
}));

customersRouter.delete('/contacts/:id', ah(async (req, res) => {
  await one(`DELETE FROM contact WHERE contact_id=$1`, [req.params.id]);
  ok(res, { ok: true });
}));

// ---------- 客户组织结构（销售调研收集；联系人可挂节点） ----------
const mapOrgNode = (r: any) => ({
  nodeId: Number(r.node_id), customerId: Number(r.customer_id),
  parentId: r.parent_id != null ? Number(r.parent_id) : null, name: r.name, order: r.sort_order,
});

customersRouter.get('/customers/:id/org-nodes', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const rows = await query(
    `SELECT * FROM customer_org_node WHERE organization_id=$1 AND customer_id=$2 ORDER BY parent_id NULLS FIRST, sort_order, node_id`,
    [orgId, req.params.id],
  );
  ok(res, rows.map(mapOrgNode));
}));

customersRouter.post('/customers/:id/org-nodes', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const name = String(req.body?.name ?? '').trim();
  if (!name) return fail(res, '请填写部门/组织名称');
  const parentId = req.body?.parentId ? Number(req.body.parentId) : null;
  const row = await one<any>(
    `INSERT INTO customer_org_node (organization_id, customer_id, parent_id, name, sort_order)
     VALUES ($1,$2,$3,$4, COALESCE((SELECT MAX(sort_order)+1 FROM customer_org_node WHERE customer_id=$2 AND parent_id IS NOT DISTINCT FROM $3),0))
     RETURNING *`,
    [orgId, req.params.id, parentId, name.slice(0, 80)],
  );
  ok(res, mapOrgNode(row));
}));

customersRouter.put('/org-nodes/:id', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const name = String(req.body?.name ?? '').trim();
  if (!name) return fail(res, '请填写名称');
  const row = await one(`UPDATE customer_org_node SET name=$1 WHERE node_id=$2 AND organization_id=$3 RETURNING *`,
    [name.slice(0, 80), req.params.id, orgId]);
  if (!row) return fail(res, '节点不存在', 1, 404);
  ok(res, mapOrgNode(row));
}));

customersRouter.delete('/org-nodes/:id', ah(async (req, res) => {
  const { orgId } = ctx(req);
  // 子节点级联删除（表定义 ON DELETE CASCADE）；联系人仅解挂（SET NULL）
  const row = await one(`DELETE FROM customer_org_node WHERE node_id=$1 AND organization_id=$2 RETURNING node_id`, [req.params.id, orgId]);
  if (!row) return fail(res, '节点不存在', 1, 404);
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
         SELECT 'lead','线索转化',
                '由线索转化而来' || COALESCE('（来源：' || NULLIF(lead_snapshot->>'sourceName','') || '）',''),
                converted_by, converted_at
         FROM customer WHERE customer_id=$1 AND converted_at IS NOT NULL
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

// 客户信息编辑（创建后可改；负责人变更走「移交」审批流，不在此处）
const updateSchema = z.object({
  name: z.string().min(2).optional(),
  level: z.coerce.number().int().positive().optional(),
  source: z.coerce.number().int().positive().optional(),
  industry: z.string().nullish(),
  province: z.string().nullish(),
  city: z.string().nullish(),
  district: z.string().nullish(),
  phoneName: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  refCompanyId: z.string().nullish(),
});

customersRouter.put(
  '/customers/:id',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, parsed.error.issues[0]?.message ?? '参数错误');
    const d = parsed.data;
    // 数据范围：只能改自己可见范围内的客户
    const scope = await dataScopeCond(req, 'leader_id');
    const old = await one<any>(
      `SELECT * FROM customer WHERE customer_id=$1 AND organization_id=$2 ${scope ? 'AND ' + scope : ''}`,
      [req.params.id, orgId],
    );
    if (!old) return fail(res, '客户不存在或无权修改（非你可见范围内的客户）', 1, 404);

    const row = await one<any>(
      `UPDATE customer SET
         name=COALESCE($1,name), level_term_id=COALESCE($2,level_term_id), source_term_id=COALESCE($3,source_term_id),
         industry=COALESCE($4,industry), province=COALESCE($5,province), city=COALESCE($6,city), district=COALESCE($7,district),
         phone_name=COALESCE($8,phone_name), phone=COALESCE($9,phone), email=COALESCE($10,email),
         ref_company_id=COALESCE($11,ref_company_id)
       WHERE customer_id=$12 RETURNING *`,
      [d.name ?? null, d.level ?? null, d.source ?? null, d.industry ?? null, d.province ?? null, d.city ?? null,
       d.district ?? null, d.phoneName ?? null, d.phone ?? null, d.email ?? null, d.refCompanyId ?? null, old.customer_id],
    );
    // 名称或企查查ID变化 → 重新按真实工商关系归集集团（无外部数据则保持独立，不臆造）
    let groupId = row.group_id;
    const nameChanged = d.name && d.name !== old.name;
    const refChanged = d.refCompanyId && d.refCompanyId !== old.ref_company_id;
    if (nameChanged || refChanged) {
      await one(`UPDATE customer SET group_id=NULL WHERE customer_id=$1 RETURNING customer_id`, [row.customer_id]);
      groupId = await autoAttachGroup(orgId, row.customer_id, row.name, row.ref_company_id);
    }
    const g = groupId ? await one<any>(`SELECT name FROM customer_group WHERE group_id=$1`, [groupId]) : null;
    ok(res, mapCustomer({ ...row, group_id: groupId, group_name: g?.name }));
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
