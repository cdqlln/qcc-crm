import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok, parseList } from '../http.js';
import { runList, type FilterDef } from '../list.js';
import { mapContract, mapInvoice, mapPayment } from '../mappers.js';
import { dataScopeCond } from '../auth.js';

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

// 申请开票：开票抬头可为合同签约主体，或其同集团子公司（形成 签约=子公司A、开票=子公司B）
contractsRouter.post(
  '/contracts/:id/invoices',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const ct = await one<any>(`SELECT * FROM contract WHERE contract_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
    if (!ct) return fail(res, '合同不存在', 1, 404);
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
});

contractsRouter.post(
  '/contracts',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, parsed.error.issues[0]?.message ?? '参数错误');
    const d = parsed.data;
    const cust = await one<{ name: string }>(`SELECT name FROM customer WHERE customer_id=$1 AND organization_id=$2`, [d.customerId, orgId]);
    if (!cust) return fail(res, '客户不存在');
    const seq = await one<{ n: number }>(`SELECT count(*)+1 AS n FROM contract WHERE organization_id=$1`, [orgId]);
    const code = `HT${new Date().getFullYear()}${String(seq!.n).padStart(4, '0')}`;
    const row = await one(
      `INSERT INTO contract (organization_id, code, name, customer_id, contract_type, renew_type,
         begin_date, expired_date, status, amount, leader_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,1,$9,$10) RETURNING *`,
      [orgId, code, d.name, d.customerId, d.contractType, d.renewType, d.beginDate, d.expiredDate, d.amount, d.leaderId],
    );
    ok(res, mapContract({ ...row, customer_name: cust.name }));
  }),
);
