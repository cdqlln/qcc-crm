import { Router } from 'express';
import { z } from 'zod';
import { one, query, tx } from '../db.js';
import { ah, ctx, fail, ok, parseList } from '../http.js';
import { runList } from '../list.js';
import { mapQuotation, mapQuotationProduct } from '../mappers.js';
import { dataScopeCond } from '../auth.js';

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

const apiItemSchema = z.object({
  apiCode: z.string(),
  name: z.string(),
  price: z.coerce.number().min(0),       // 标准单价（价目表）
  quotePrice: z.coerce.number().min(0),  // 报价单价（可折）
  estCalls: z.coerce.number().min(0).default(0), // 预估月调用量（框架可为 0）
  unit: z.string().default('次'),
});
const lineSchema = z.object({
  productId: z.coerce.number().int().positive(),
  spec: z.string().optional(),
  quantity: z.coerce.number().int().positive(),
  price: z.string(),
  discountRate: z.string(),
  cost: z.string(),
  pricingMode: z.enum(['qty', 'usage']).default('qty'),
  apiItems: z.array(apiItemSchema).max(200).optional(), // 数据API接口报价清单
  apiMode: z.enum(['calls', 'recharge']).optional(), // 接口计费：calls=定量定价可算总价 recharge=只调价·售价=充值金额
  gift: z.boolean().default(false), // 赠送项目（折扣 0、实际单价 0）
});
const saveSchema = z.object({
  name: z.string().min(1),
  customerId: z.coerce.number().int().positive(),
  groupId: z.coerce.number().int().optional(),
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
  remark: z.string().max(2000).optional(),          // 报价说明
  serviceYears: z.coerce.number().int().min(0).max(50).optional(), // 服务年限（年）
  lines: z.array(lineSchema).default([]),
});

// 报价有效期不得早于当前日期（服务端兜底，前端已有快捷项与拦截）
function expiredDateInvalid(d: { expiredDate?: string; quoteDate?: string }): string | null {
  if (!d.expiredDate) return null;
  const today = new Date().toISOString().slice(0, 10);
  if (d.expiredDate < today) return '报价有效期不能早于当前日期';
  if (d.quoteDate && d.expiredDate < d.quoteDate) return '报价有效期不能早于报价日期';
  return null;
}

// 其他费用合计：有明细则取明细之和，否则用传入的合计
function otherChargesSum(d: { otherChargesItems?: { amount: number }[]; otherCharges: string }): string {
  if (d.otherChargesItems && d.otherChargesItems.length)
    return d.otherChargesItems.reduce((s, i) => s + Number(i.amount || 0), 0).toFixed(2);
  return d.otherCharges;
}

// 赠送策略校验（事务内，违规抛错回滚）：产品是否允许赠送 / 每订单最大赠送数量 / 赠送原价占订单金额比例上限
async function enforceGiftPolicy(client: any, quotationId: number, lines: any[]) {
  const giftLines = lines.filter((l) => l.gift);
  if (!giftLines.length) return;
  const ids = [...new Set(giftLines.map((l) => Number(l.productId)))];
  const prods = (await client.query(
    `SELECT product_id, name, allow_gift, max_gift_qty, max_gift_ratio FROM product WHERE product_id = ANY($1)`, [ids],
  )).rows;
  const q = (await client.query(`SELECT amount FROM quotation WHERE quotation_id=$1`, [quotationId])).rows[0];
  const orderAmount = Number(q?.amount ?? 0);
  for (const p of prods) {
    const rows = giftLines.filter((l) => Number(l.productId) === Number(p.product_id));
    const qty = rows.reduce((s: number, l: any) => s + Number(l.quantity), 0);
    const giftValue = rows.reduce((s: number, l: any) => s + Number(l.price) * Number(l.quantity), 0); // 赠送原价合计
    if (!p.allow_gift) throw new Error(`「${p.name}」不允许作为赠送项目`);
    if (p.max_gift_qty != null && qty > Number(p.max_gift_qty)) {
      throw new Error(`「${p.name}」每订单最多赠送 ${p.max_gift_qty}，当前 ${qty}`);
    }
    if (p.max_gift_ratio != null) {
      if (orderAmount <= 0) throw new Error(`「${p.name}」设有赠送金额占比上限（${p.max_gift_ratio}%），订单金额为 0 时不能赠送`);
      const ratio = (giftValue / orderAmount) * 100;
      if (ratio > Number(p.max_gift_ratio) + 1e-9) {
        throw new Error(`「${p.name}」赠送金额占比 ${ratio.toFixed(1)}% 超过上限 ${p.max_gift_ratio}%（赠送原价 ¥${giftValue.toLocaleString()} / 订单 ¥${orderAmount.toLocaleString()}）`);
      }
    }
  }
}

async function writeLines(client: any, quotationId: number, lines: any[]) {
  await client.query(`DELETE FROM quotation_product WHERE quotation_id=$1`, [quotationId]);
  for (const l of lines) {
    await client.query(
      `INSERT INTO quotation_product (quotation_id, product_id, spec, quantity, price, discount_rate, cost, pricing_mode, api_items, api_mode, gift)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
      [quotationId, l.productId, l.spec ?? null, l.quantity, l.price, l.gift ? '0' : l.discountRate, l.cost,
       l.pricingMode ?? 'qty', l.apiItems?.length ? JSON.stringify(l.apiItems) : null, l.apiMode ?? null, l.gift ?? false],
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
    const dateErr = expiredDateInvalid(d);
    if (dateErr) return fail(res, dateErr);
    // 数据范围校验：销售只能为自归属（可见范围内）的客户建报价
    const scope = await dataScopeCond(req, 'leader_id');
    const own = await one(`SELECT 1 FROM customer WHERE customer_id=$1 AND organization_id=$2 ${scope ? 'AND ' + scope : ''}`, [d.customerId, orgId]);
    if (!own) return fail(res, '无权为该客户建报价（非你归属的客户）', 1, 403);
    const seq = await one<{ n: number }>(`SELECT count(*)+1 AS n FROM quotation WHERE organization_id=$1`, [orgId]);
    const code = `QT${new Date().getFullYear()}${String(seq!.n).padStart(4, '0')}`;
    const oc = otherChargesSum(d);
    const id = await tx(async (c) => {
      const q = (await c.query(
        `INSERT INTO quotation (organization_id, code, version, name, customer_id, group_id, contact_id, opportunity_id,
           quote_type, currency, status, order_discount_rate, other_charges, other_charges_items, discount,
           quote_date, expired_date, contract_term, remark, service_years, approval)
         VALUES ($1,$2,1,$3,$4,$5,$6,$7,$8,$9,0,$10,$11,$12,$13,$14,$15,$16,$17,$18,-1) RETURNING quotation_id`,
        [orgId, code, d.name, d.customerId, d.groupId ?? null, d.contactId ?? null, d.opportunityId ?? null, d.quoteType, d.currency,
         d.orderDiscountRate, oc, JSON.stringify(d.otherChargesItems ?? []), d.discount, d.quoteDate ?? null, d.expiredDate ?? null,
         d.contractTerm ?? null, d.remark ?? null, d.serviceYears ?? null],
      )).rows[0];
      await writeLines(c, q.quotation_id, d.lines);
      await enforceGiftPolicy(c, q.quotation_id, d.lines);
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
    const dateErr = expiredDateInvalid(d);
    if (dateErr) return fail(res, dateErr);
    const exists = await one(`SELECT quotation_id FROM quotation WHERE quotation_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
    if (!exists) return fail(res, '报价单不存在', 1, 404);
    await tx(async (c) => {
      await c.query(
        `UPDATE quotation SET name=$1, customer_id=$2, contact_id=$3, opportunity_id=$4, quote_type=$5,
           currency=$6, order_discount_rate=$7, other_charges=$8, discount=$9,
           quote_date=$11, expired_date=$12, contract_term=$13, other_charges_items=$14, group_id=$15,
           remark=$16, service_years=$17 WHERE quotation_id=$10`,
        [d.name, d.customerId, d.contactId ?? null, d.opportunityId ?? null, d.quoteType, d.currency, d.orderDiscountRate, otherChargesSum(d), d.discount, req.params.id,
         d.quoteDate ?? null, d.expiredDate ?? null, d.contractTerm ?? null, JSON.stringify(d.otherChargesItems ?? []), d.groupId ?? null,
         d.remark ?? null, d.serviceYears ?? null],
      );
      await writeLines(c, Number(req.params.id), d.lines);
      await enforceGiftPolicy(c, Number(req.params.id), d.lines);
    });
    const row = await one(`SELECT q.*, c.name customer_name FROM quotation q LEFT JOIN customer c ON c.customer_id=q.customer_id WHERE q.quotation_id=$1`, [req.params.id]);
    ok(res, mapQuotation(row));
  }),
);

// 生成合同：集团报价可指定集团下子公司为签约主体（形成 报价=集团、签约=子公司）
quotationsRouter.post(
  '/quotations/:id/to-contract',
  ah(async (req, res) => {
    const { orgId, userId } = ctx(req);
    const q = await one<any>(`SELECT * FROM quotation WHERE quotation_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
    if (!q) return fail(res, '报价单不存在', 1, 404);
    const signId = Number(req.body?.signCustomerId || q.customer_id);
    // 签约主体校验：= 报价客户，或与报价客户/报价集团同属一个集团
    const sign = await one<any>(`SELECT customer_id, name, group_id FROM customer WHERE customer_id=$1 AND organization_id=$2`, [signId, orgId]);
    if (!sign) return fail(res, '签约主体不存在');
    if (signId !== q.customer_id) {
      const qGroup = q.group_id ?? (await one<any>(`SELECT group_id FROM customer WHERE customer_id=$1`, [q.customer_id]))?.group_id;
      if (!qGroup || sign.group_id !== qGroup) return fail(res, '签约主体须为该集团下的子公司');
    }
    const begin = req.body?.beginDate ?? new Date().toISOString().slice(0, 10);
    const seq = await one<{ n: number }>(`SELECT count(*)+1 AS n FROM contract WHERE organization_id=$1`, [orgId]);
    const code = `HT${new Date().getFullYear()}${String(seq!.n).padStart(4, '0')}`;
    const row = await one<any>(
      `INSERT INTO contract (organization_id, code, name, customer_id, quotation_id, opportunity_id, contract_type, renew_type,
         begin_date, expired_date, currency, status, amount, gross_profit, leader_id)
       VALUES ($1,$2,$3,$4,$5,$6,1,1,$7,
         CASE WHEN $8::int IS NOT NULL THEN ($7::date + ($8::int || ' months')::interval)::date ELSE NULL END,
         $9,1,$10,$11,$12) RETURNING contract_id, code, expired_date`,
      [orgId, code, `${sign.name} 服务合同`, signId, q.quotation_id, q.opportunity_id ?? null,
       begin, q.contract_term ?? null, q.currency, q.amount, q.gross_profit, userId],
    );
    await one(`UPDATE quotation SET status=3 WHERE quotation_id=$1`, [q.quotation_id]); // 已生成合同
    ok(res, { contractId: row.contract_id, code: row.code, signCustomerId: signId, expiredDate: row.expired_date });
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
