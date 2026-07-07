import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok, parseList } from '../http.js';
import { runList, type FilterDef } from '../list.js';
import { mapContract, mapInvoice, mapPayment } from '../mappers.js';
import { dataScopeCond, requirePermission } from '../auth.js';

export const contractsRouter = Router();

const TABLE = 'contract ct LEFT JOIN customer c ON c.customer_id = ct.customer_id';
const SELECT = 'ct.*, c.name AS customer_name';

const FILTERS: Record<string, FilterDef> = {
  status: { col: 'ct.status', kind: 'in' },
  currency: { col: 'ct.currency', kind: 'eq' },
  contractType: { col: 'ct.contract_type', kind: 'eq' },
  leaderId: { col: 'ct.leader_id', kind: 'eq' },
  amount: { col: 'ct.amount', kind: 'numRange' },
  expiredDate: { col: 'ct.expired_date', kind: 'dateRange' },
};

contractsRouter.post(
  '/contracts/list',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const body = parseList(req);
    const conds = ['ct.organization_id = $1'];
    if (body.tab === 'archived') conds.push('ct.archive = true');
    else if (body.tab === 'renew') conds.push('ct.renew_type = 2');
    else if (body.tab === 'review') conds.push('ct.review_status = 1'); // 法务待审核队列
    const scope = await dataScopeCond(req, 'ct.leader_id');
    if (scope) conds.push(scope);

    const result = await runList(
      {
        table: TABLE,
        select: SELECT,
        searchCols: ['ct.name', 'ct.code', 'c.name'],
        filterMap: FILTERS,
        sortMap: { amount: 'ct.amount', expiredDate: 'ct.expired_date' },
        defaultOrder: 'ct.created_at DESC',
        baseConds: conds,
        baseParams: [orgId],
        mapRow: mapContract,
      },
      body,
    );
    ok(res, result);
  }),
);

contractsRouter.get(
  '/contracts/:id',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const row = await one(
      `SELECT ct.*, c.name AS customer_name FROM contract ct LEFT JOIN customer c ON c.customer_id=ct.customer_id
       WHERE ct.contract_id=$1 AND ct.organization_id=$2`,
      [req.params.id, orgId],
    );
    if (!row) return fail(res, '合同不存在', 1, 404);
    ok(res, mapContract(row));
  }),
);

contractsRouter.get(
  '/contracts/:id/payments',
  ah(async (req, res) => {
    const rows = await query(
      `SELECT p.*, ct.code AS contract_code, c.name AS customer_name FROM payment p
       LEFT JOIN contract ct ON ct.contract_id=p.contract_id
       LEFT JOIN customer c ON c.customer_id=p.customer_id
       WHERE p.contract_id=$1 ORDER BY p.payment_id`,
      [req.params.id],
    );
    ok(res, rows.map(mapPayment));
  }),
);

contractsRouter.get(
  '/contracts/:id/invoices',
  ah(async (req, res) => {
    const rows = await query(
      `SELECT i.*, c.name AS customer_name FROM invoice i LEFT JOIN customer c ON c.customer_id=i.customer_id
       WHERE i.contract_id=$1 ORDER BY i.invoice_id`,
      [req.params.id],
    );
    ok(res, rows.map(mapInvoice));
  }),
);

// ---------- 法务审核 + 销售协同 ----------
const REVIEW_LABEL: Record<number, string> = { 0: '未送审', 1: '待法务审核', 2: '审核通过', 3: '已驳回' };

const mapReview = (r: any) => ({
  reviewId: Number(r.review_id),
  contractId: Number(r.contract_id),
  action: r.action, // 1送审 2通过 3驳回 4协同留言
  comment: r.comment ?? '',
  attachments: r.attachments ?? [],
  createBy: r.created_by,
  createByName: r.create_by_name ?? '',
  createDate: r.created_at,
});

// 审核过程时间线（送审/通过/驳回/留言）
contractsRouter.get('/contracts/:id/reviews', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const rows = await query(
    `SELECT r.*, u.name AS create_by_name FROM contract_review r
     LEFT JOIN app_user u ON u.user_id = r.created_by
     WHERE r.contract_id=$1 AND r.organization_id=$2 ORDER BY r.review_id`,
    [req.params.id, orgId],
  );
  ok(res, rows.map(mapReview));
}));

// 提交法务审核（销售）：未送审/被驳回后可（重新）送审
contractsRouter.post('/contracts/:id/submit-review', ah(async (req, res) => {
  const { orgId, userId } = ctx(req);
  const scope = await dataScopeCond(req, 'leader_id');
  const ct = await one<any>(
    `SELECT * FROM contract WHERE contract_id=$1 AND organization_id=$2 ${scope ? 'AND ' + scope : ''}`,
    [req.params.id, orgId],
  );
  if (!ct) return fail(res, '合同不存在或无权操作', 1, 404);
  if (ct.status >= 4) return fail(res, '已终止/作废的合同不能送审');
  if (ct.review_status === 1) return fail(res, '已在法务审核中，请勿重复提交');
  if (ct.review_status === 2) return fail(res, '该合同已审核通过');
  const comment = String(req.body?.comment ?? '').trim();
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments : [];

  await one(`UPDATE contract SET review_status=1 WHERE contract_id=$1 RETURNING contract_id`, [ct.contract_id]);
  await one(
    `INSERT INTO contract_review (organization_id, contract_id, action, comment, attachments, created_by)
     VALUES ($1,$2,1,$3,$4,$5) RETURNING review_id`,
    [orgId, ct.contract_id, comment || '提交法务审核', JSON.stringify(attachments), userId],
  );
  // 给所有具备 contract.review 权限的成员生成待办（business_type=80）
  await query(
    `INSERT INTO back_log (organization_id, business_type, business_id, business_name, user_id, status, deadline_date, deadline_type)
     SELECT $1, 80, $2, $3, ur.user_id, 0, now() + interval '3 day', 2
     FROM (SELECT DISTINCT ur.user_id FROM user_role ur
           JOIN role_permission rp ON rp.role_id = ur.role_id
           JOIN permission p ON p.permission_id = rp.permission_id
           JOIN app_user u ON u.user_id = ur.user_id
           WHERE p.code='contract.review' AND u.organization_id=$1) ur`,
    [orgId, ct.contract_id, `法务审核：${ct.name}`],
  );
  ok(res, { reviewStatus: 1 });
}));

// 法务审核（通过/驳回）—— contract.review 权限
contractsRouter.post('/contracts/:id/review', requirePermission('contract.review'), ah(async (req, res) => {
  const { orgId, userId } = ctx(req);
  const ct = await one<any>(`SELECT * FROM contract WHERE contract_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
  if (!ct) return fail(res, '合同不存在', 1, 404);
  if (ct.review_status !== 1) return fail(res, `当前状态为「${REVIEW_LABEL[ct.review_status]}」，不能审核`);
  const pass = req.body?.pass === true;
  const comment = String(req.body?.comment ?? '').trim();
  if (!pass && !comment) return fail(res, '驳回必须填写审核意见，便于销售修改');

  await one(`UPDATE contract SET review_status=$1 WHERE contract_id=$2 RETURNING contract_id`, [pass ? 2 : 3, ct.contract_id]);
  await one(
    `INSERT INTO contract_review (organization_id, contract_id, action, comment, created_by)
     VALUES ($1,$2,$3,$4,$5) RETURNING review_id`,
    [orgId, ct.contract_id, pass ? 2 : 3, comment || (pass ? '审核通过' : ''), userId],
  );
  // 结掉法务待办；给合同负责人回执待办
  await query(`UPDATE back_log SET status=1 WHERE organization_id=$1 AND business_type=80 AND business_id=$2 AND status=0`, [orgId, ct.contract_id]);
  if (ct.leader_id) {
    await one(
      `INSERT INTO back_log (organization_id, business_type, business_id, business_name, user_id, status, deadline_date, deadline_type)
       VALUES ($1,80,$2,$3,$4,0, now() + interval '3 day', 2) RETURNING back_log_id`,
      [orgId, ct.contract_id, `法务${pass ? '已通过' : '已驳回'}：${ct.name}${comment ? `（${comment.slice(0, 40)}）` : ''}`, ct.leader_id],
    );
  }
  ok(res, { reviewStatus: pass ? 2 : 3 });
}));

// 协同留言（法务与销售围绕合同讨论；双方都可发）
contractsRouter.post('/contracts/:id/review-comments', ah(async (req, res) => {
  const { orgId, userId } = ctx(req);
  const ct = await one<any>(`SELECT contract_id FROM contract WHERE contract_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
  if (!ct) return fail(res, '合同不存在', 1, 404);
  const comment = String(req.body?.comment ?? '').trim();
  if (!comment) return fail(res, '请填写留言内容');
  const row = await one<any>(
    `INSERT INTO contract_review (organization_id, contract_id, action, comment, created_by)
     VALUES ($1,$2,4,$3,$4) RETURNING *`,
    [orgId, ct.contract_id, comment.slice(0, 1000), userId],
  );
  const u = await one<{ name: string }>(`SELECT name FROM app_user WHERE user_id=$1`, [userId]);
  ok(res, mapReview({ ...row, create_by_name: u?.name }));
}));

// 申请开票：开票抬头可为合同签约主体，或其同集团子公司（形成 签约=子公司A、开票=子公司B）
contractsRouter.post(
  '/contracts/:id/invoices',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const ct = await one<any>(`SELECT * FROM contract WHERE contract_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
    if (!ct) return fail(res, '合同不存在', 1, 404);
    // 法务审核门禁：合同须通过法务审核方可开票
    if (ct.review_status !== 2) return fail(res, '合同尚未通过法务审核，暂不能开票（请在合同详情提交法务审核）');
    const titleId = Number(req.body?.titleCustomerId || ct.customer_id);
    const amount = String(req.body?.amount ?? '');
    if (!amount || Number(amount) <= 0) return fail(res, '请填写开票金额');
    if (Number(amount) > Number(ct.not_invoice_amount)) return fail(res, `开票金额超过未开票额（剩余 ${ct.not_invoice_amount}）`);
    const title = await one<any>(`SELECT customer_id, group_id FROM customer WHERE customer_id=$1 AND organization_id=$2`, [titleId, orgId]);
    if (!title) return fail(res, '开票主体不存在');
    if (titleId !== ct.customer_id) {
      const signer = await one<any>(`SELECT group_id FROM customer WHERE customer_id=$1`, [ct.customer_id]);
      if (!signer?.group_id || title.group_id !== signer.group_id) return fail(res, '开票主体须为签约方或其同集团子公司');
    }
    const taxRate = 0.06;
    const noTax = (Number(amount) / (1 + taxRate)).toFixed(2);
    const seq = await one<{ n: number }>(`SELECT count(*)+1 AS n FROM invoice WHERE organization_id=$1`, [orgId]);
    const code = `FP${new Date().getFullYear()}${String(seq!.n).padStart(5, '0')}`;
    const row = await one<any>(
      `INSERT INTO invoice (organization_id, code, contract_id, customer_id, invoice_type_term, red_blue_flag, amount, tax_amount, status, approval)
       VALUES ($1,$2,$3,$4,$5,1,$6,$7,1,-1) RETURNING *`,
      [orgId, code, ct.contract_id, titleId, req.body?.invoiceTypeTerm ?? 130, amount, (Number(amount) - Number(noTax)).toFixed(2)],
    );
    const cust = await one<{ name: string }>(`SELECT name FROM customer WHERE customer_id=$1`, [titleId]);
    ok(res, mapInvoice({ ...row, customer_name: cust?.name }));
  }),
);

const createSchema = z.object({
  name: z.string().min(2),
  customerId: z.coerce.number().int().positive(),
  amount: z.string().min(1),
  contractType: z.coerce.number().int().min(1).max(3).default(1),
  renewType: z.coerce.number().int().min(1).max(2).default(1),
  beginDate: z.string().min(1),
  expiredDate: z.string().min(1),
  leaderId: z.coerce.number().int().positive(),
  opportunityId: z.coerce.number().int().positive().optional(), // 关联商机（销售选自己的，部门负责人可选本部门的——列表接口按数据范围过滤）
  // 合同文件（合同文本/扫描件，供法务审核）
  attachments: z.array(z.object({
    name: z.string(), url: z.string(), mime: z.string().optional(), size: z.coerce.number().optional(),
  })).max(20).default([]),
});

contractsRouter.post(
  '/contracts',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, parsed.error.issues[0]?.message ?? '参数错误');
    const d = parsed.data;
    // 关联商机方式：校验商机存在且客户一致（客户以商机为准）
    let customerId = d.customerId;
    if (d.opportunityId) {
      const opp = await one<any>(`SELECT customer_id FROM opportunity WHERE opportunity_id=$1 AND organization_id=$2`, [d.opportunityId, orgId]);
      if (!opp) return fail(res, '关联商机不存在');
      customerId = Number(opp.customer_id);
    }
    const cust = await one<{ name: string }>(`SELECT name FROM customer WHERE customer_id=$1 AND organization_id=$2`, [customerId, orgId]);
    if (!cust) return fail(res, '客户不存在');
    const seq = await one<{ n: number }>(`SELECT count(*)+1 AS n FROM contract WHERE organization_id=$1`, [orgId]);
    const code = `HT${new Date().getFullYear()}${String(seq!.n).padStart(4, '0')}`;
    const row = await one(
      `INSERT INTO contract (organization_id, code, name, customer_id, opportunity_id, contract_type, renew_type,
         begin_date, expired_date, status, amount, leader_id, attachments)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1,$10,$11,$12) RETURNING *`,
      [orgId, code, d.name, customerId, d.opportunityId ?? null, d.contractType, d.renewType, d.beginDate, d.expiredDate, d.amount, d.leaderId,
       JSON.stringify(d.attachments ?? [])],
    );
    ok(res, mapContract({ ...row, customer_name: cust.name }));
  }),
);
