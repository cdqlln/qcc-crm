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
