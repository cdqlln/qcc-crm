import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { ah, ctx, fail, ok, parseList } from '../http.js';
import { runList } from '../list.js';
import { mapQuotation, mapQuotationProduct } from '../mappers.js';

export const quotationsRouter = Router();

// 折扣政策（按客户分级）+ 报价编辑器用
quotationsRouter.get(
  '/discount-policy',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const rows = await query(`SELECT level_term_id, max_discount FROM discount_policy WHERE organization_id=$1 ORDER BY level_term_id`, [orgId]);
    ok(res, rows.map((r: any) => ({ levelTermId: r.level_term_id, maxDiscount: r.max_discount })));
  }),
);

// 后台设置：按客户分级配置销售自主折扣上限
quotationsRouter.put(
  '/discount-policy',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const policies = (req.body?.policies ?? []) as { levelTermId: number; maxDiscount: string | number }[];
    for (const p of policies) {
      await one(
        `INSERT INTO discount_policy (organization_id, level_term_id, max_discount) VALUES ($1,$2,$3)
         ON CONFLICT (organization_id, level_term_id) DO UPDATE SET max_discount=EXCLUDED.max_discount`,
        [orgId, p.levelTermId, p.maxDiscount],
      );
    }
    const rows = await query(`SELECT level_term_id, max_discount FROM discount_policy WHERE organization_id=$1 ORDER BY level_term_id`, [orgId]);
    ok(res, rows.map((r: any) => ({ levelTermId: r.level_term_id, maxDiscount: r.max_discount })));
  }),
);

const lineSchema = z.object({
  productId: z.coerce.number().int().positive(),
  spec: z.string().optional(),
  quantity: z.coerce.number().int().positive(),
  price: z.string(),
  discountRate: z.string(),
  cost: z.string(),
  pricingMode: z.enum(['qty', 'usage']).default('qty'),
});
const saveSchema = z.object({
  name: z.string().min(1),
  customerId: z.coerce.number().int().positive(),
  contactId: z.coerce.number().int().optional(),
  opportunityId: z.coerce.number().int().optional(),
  quoteType: z.coerce.number().int().min(1).max(4).default(2),
  currency: z.string().default('CNY'),
  orderDiscountRate: z.string().default('1.0000'),
  otherCharges: z.string().default('0'),
  otherChargesItems: z.array(z.object({ name: z.string().default(''), amount: z.coerce.number().default(0) })).default([]),
  discount: z.string().default('0'),
  quoteDate: z.string().optional(),
  expiredDate: z.string().optional(),
  contractTerm: z.coerce.number().int().optional(),
  lines: z.array(lineSchema).default([]),
});

// 其他费用合计：有明细则取明细之和，否则用传入的合计
function otherChargesSum(d: { otherChargesItems?: { amount: number }[]; otherCharges: string }): string {
  if (d.otherChargesItems && d.otherChargesItems.length)
    return d.otherChargesItems.reduce((s, i) => s + Number(i.amount || 0), 0).toFixed(2);
  return d.otherCharges;
}

async function writeLines(client: any, quotationId: number, lines: any[]) {
  await client.query(`DELETE FROM quotation_product WHERE quotation_id=$1`, [quotationId]);
  for (const l of lines) {
    await client.query(
      `INSERT INTO quotation_product (quotation_id, product_id, spec, quantity, price, discount_rate, cost, pricing_mode)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [quotationId, l.productId, l.spec ?? null, l.quantity, l.price, l.discountRate, l.cost, l.pricingMode ?? 'qty'],
    );
  }
  // 行项目维护 total / cost（amount 等为生成列自动派生）
  await client.query(
    `UPDATE quotation SET total = COALESCE((SELECT SUM(total_price) FROM quotation_product WHERE quotation_id=$1),0),
        cost = COALESCE((SELECT SUM(cost) FROM quotation_product WHERE quotation_id=$1),0)
     WHERE quotation_id=$1`,
    [quotationId],
  );
}

// 新建报价/询价（草稿 status=0）
quotationsRouter.post(
  '/quotations',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, parsed.error.issues[0]?.message ?? '参数错误');
    const d = parsed.data;
    const seq = await one<{ n: number }>(`SELECT count(*)+1 AS n FROM quotation WHERE organization_id=$1`, [orgId]);
    const code = `QT${new Date().getFullYear()}${String(seq!.n).padStart(4, '0')}`;
    const oc = otherChargesSum(d);
    const id = await tx(async (c) => {
      const q = (await c.query(
        `INSERT INTO quotation (organization_id, code, version, name, customer_id, contact_id, opportunity_id,
           quote_type, currency, status, order_discount_rate, other_charges, other_charges_items, discount,
           quote_date, expired_date, contract_term, approval)
         VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,0,$9,$10,$11,$12,$13,$14,$15,-1) RETURNING quotation_id`,
        [orgId, code, d.name, d.customerId, d.contactId ?? null, d.opportunityId ?? null, d.quoteType, d.currency,
         d.orderDiscountRate, oc, JSON.stringify(d.otherChargesItems ?? []), d.discount, d.quoteDate ?? null, d.expiredDate ?? null, d.contractTerm ?? null],
      )).rows[0];
      await writeLines(c, q.quotation_id, d.lines);
      return q.quotation_id;
    });
    const row = await one(`SELECT q.*, c.name customer_name FROM quotation q LEFT JOIN customer c ON c.customer_id=q.customer_id WHERE q.quotation_id=$1`, [id]);
    ok(res, mapQuotation(row));
  }),
);

// 更新草稿
quotationsRouter.put(
  '/quotations/:id',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const parsed = saveSchema.safeParse(req.body);
    if (!parsed.success) return fail(res, parsed.error.issues[0]?.message ?? '参数错误');
    const d = parsed.data;
    const exists = await one(`SELECT quotation_id FROM quotation WHERE quotation_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
    if (!exists) return fail(res, '报价单不存在', 1, 404);
    await tx(async (c) => {
      await c.query(
        `UPDATE quotation SET name=$1, customer_id=$2, contact_id=$3, opportunity_id=$4, quote_type=$5,
           currency=$6, order_discount_rate=$7, other_charges=$8, discount=$9,
           quote_date=$11, expired_date=$12, contract_term=$13, other_charges_items=$14 WHERE quotation_id=$10`,
        [d.name, d.customerId, d.contactId ?? null, d.opportunityId ?? null, d.quoteType, d.currency, d.orderDiscountRate, otherChargesSum(d), d.discount, req.params.id,
         d.quoteDate ?? null, d.expiredDate ?? null, d.contractTerm ?? null, JSON.stringify(d.otherChargesItems ?? [])],
      );
      await writeLines(c, Number(req.params.id), d.lines);
    });
    const row = await one(`SELECT q.*, c.name customer_name FROM quotation q LEFT JOIN customer c ON c.customer_id=q.customer_id WHERE q.quotation_id=$1`, [req.params.id]);
    ok(res, mapQuotation(row));
  }),
);

// 客户确认（询价单销售自助 → 客户确认后方可后续动作）
quotationsRouter.post(
  '/quotations/:id/confirm',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const row = await one(
      `UPDATE quotation SET customer_confirmed=true, confirmed_at=now(), status=1
       WHERE quotation_id=$1 AND organization_id=$2 RETURNING *`,
      [req.params.id, orgId],
    );
    if (!row) return fail(res, '报价单不存在', 1, 404);
    ok(res, mapQuotation(row));
  }),
);

const TABLE = 'quotation q LEFT JOIN customer c ON c.customer_id = q.customer_id';
const SELECT = 'q.*, c.name AS customer_name';

quotationsRouter.post(
  '/quotations/list',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const body = parseList(req);
    const result = await runList(
      {
        table: TABLE,
        select: SELECT,
        searchCols: ['q.name', 'q.code', 'c.name'],
        sortMap: { amount: 'q.amount' },
        defaultOrder: 'q.created_at DESC',
        baseConds: ['q.organization_id = $1'],
        baseParams: [orgId],
        mapRow: mapQuotation,
      },
      body,
    );
    ok(res, result);
  }),
);

quotationsRouter.get(
  '/quotations/:id',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const row = await one(
      `SELECT q.*, c.name AS customer_name FROM quotation q LEFT JOIN customer c ON c.customer_id=q.customer_id
       WHERE q.quotation_id=$1 AND q.organization_id=$2`,
      [req.params.id, orgId],
    );
    if (!row) return fail(res, '报价单不存在', 1, 404);
    ok(res, mapQuotation(row));
  }),
);

quotationsRouter.get(
  '/quotations/:id/products',
  ah(async (req, res) => {
    const rows = await query(
      `SELECT qp.*, p.name AS product_name FROM quotation_product qp
       LEFT JOIN product p ON p.product_id=qp.product_id WHERE qp.quotation_id=$1 ORDER BY qp.id`,
      [req.params.id],
    );
    ok(res, rows.map(mapQuotationProduct));
  }),
);
