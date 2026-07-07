import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok, parseList } from '../http.js';
import { runList, type FilterDef } from '../list.js';
import { mapOpportunity } from '../mappers.js';
import { dataScopeCond } from '../auth.js';
import { logOwnerChange } from '../services/ownerTrace.js';

export const opportunitiesRouter = Router();

const TABLE = 'opportunity o LEFT JOIN customer c ON c.customer_id = o.customer_id';
const SELECT = 'o.*, c.name AS customer_name';

const FILTERS: Record<string, FilterDef> = {
  status: { col: 'o.status_term_id', kind: 'in' },
  leaderId: { col: 'o.leader_id', kind: 'eq' },
  customerId: { col: 'o.customer_id', kind: 'eq' },
  estimatedAmount: { col: 'o.estimated_amount', kind: 'numRange' },
  expiryDate: { col: 'o.expiry_date', kind: 'dateRange' },
};

opportunitiesRouter.post(
  '/opportunities/list',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const body = parseList(req);
    const conds = ['o.organization_id = $1', 'o.active = 1'];
    const scope = await dataScopeCond(req, 'o.leader_id');
    if (scope) conds.push(scope);
    const result = await runList(
      {
        table: TABLE,
        select: SELECT,
        searchCols: ['o.name', 'o.code', 'c.name'],
        filterMap: FILTERS,
        sortMap: { estimatedAmount: 'o.estimated_amount', allStayTime: 'o.all_stay_time' },
        defaultOrder: 'o.created_at DESC',
        baseConds: conds,
        baseParams: [orgId],
        mapRow: mapOpportunity,
      },
      body,
    );
    ok(res, result);
  }),
);

opportunitiesRouter.get(
  '/opportunities/:id',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const row = await one(
      `SELECT o.*, c.name AS customer_name FROM opportunity o LEFT JOIN customer c ON c.customer_id=o.customer_id
       WHERE o.opportunity_id=$1 AND o.organization_id=$2`,
      [req.params.id, orgId],
    );
    if (!row) return fail(res, '商机不存在', 1, 404);
    ok(res, mapOpportunity(row));
  }),
);

opportunitiesRouter.put(
  '/opportunities/:id/stage',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const status = Number(req.body?.status);
    if (!status) return fail(res, '缺少 status');
    const row = await one(
      `UPDATE opportunity SET status_term_id=$1, status_expiry_at = now() + interval '14 day'
       WHERE opportunity_id=$2 AND organization_id=$3 RETURNING *`,
      [status, req.params.id, orgId],
    );
    if (!row) return fail(res, '商机不存在', 1, 404);
    ok(res, mapOpportunity(row));
  }),
);

const createSchema = z.object({
  name: z.string().min(2),
  customerId: z.coerce.number().int().positive(),
  estimatedAmount: z.string().min(1),
  status: z.coerce.number().int().positive(),
  expiryDate: z.string().min(1),
  leaderId: z.coerce.number().int().positive(),
  competitor: z.string().optional(),
  requirement: z.string().optional(),                       // 客户需求描述
  productIds: z.array(z.coerce.number().int().positive()).optional(), // 涉及产品（多选）
});

opportunitiesRouter.post(
  '/opportunities',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, parsed.error.issues[0]?.message ?? '参数错误');
    const d = parsed.data;
    const cust = await one<{ name: string; leader_id: number; department_id: number }>(
      `SELECT name, leader_id FROM customer WHERE customer_id=$1 AND organization_id=$2`,
      [d.customerId, orgId],
    );
    if (!cust) return fail(res, '客户不存在');
    // 涉及产品（多选）：写 opportunity_product 行，main_product 存名称便于列表展示
    const prodIds = (d.productIds ?? []).slice(0, 20);
    const prods = prodIds.length
      ? await query<any>(`SELECT product_id, name, price FROM product WHERE organization_id=$1 AND product_id = ANY($2)`, [orgId, prodIds])
      : [];
    // 生成编号
    const seq = await one<{ n: number }>(`SELECT count(*)+1 AS n FROM opportunity WHERE organization_id=$1`, [orgId]);
    const code = `OPP${new Date().getFullYear()}${String(seq!.n).padStart(4, '0')}`;
    const row = await one<any>(
      `INSERT INTO opportunity (organization_id, code, name, customer_id, estimated_amount, status_term_id,
         expiry_date, leader_id, competitor, requirement, main_product, status_expiry_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now()+interval '14 day') RETURNING *`,
      [orgId, code, d.name, d.customerId, d.estimatedAmount, d.status, d.expiryDate, d.leaderId, d.competitor ?? null,
       d.requirement ?? null, prods.length ? prods.map((p: any) => p.name).join(' / ') : null],
    );
    for (const p of prods) {
      await one(
        `INSERT INTO opportunity_product (opportunity_id, product_id, quantity, price) VALUES ($1,$2,1,$3) RETURNING id`,
        [row.opportunity_id, p.product_id, p.price],
      );
    }
    await one(`UPDATE customer SET opportunity_count = opportunity_count + 1 WHERE customer_id=$1`, [d.customerId]);
    await logOwnerChange(orgId, 'opportunity', (row as any).opportunity_id, null, d.leaderId, 'init', ctx(req).userId, '新建商机');
    ok(res, mapOpportunity({ ...row, customer_name: cust.name }));
  }),
);
