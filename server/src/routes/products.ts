import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok, parseList } from '../http.js';
import { runList } from '../list.js';
import { requirePermission } from '../auth.js';
import { mapProduct, mapProductTier } from '../mappers.js';

export const productsRouter = Router();

const TABLE = 'product p LEFT JOIN product_category pc ON pc.category_id = p.category_id';
const SELECT = 'p.*, pc.name AS category_name';

productsRouter.post(
  '/products/list',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const body = parseList(req);
    const result = await runList(
      {
        table: TABLE,
        select: SELECT,
        searchCols: ['p.name', 'p.code'],
        sortMap: { price: 'p.price' },
        defaultOrder: 'p.product_id',
        baseConds: ['p.organization_id = $1'],
        baseParams: [orgId],
        mapRow: mapProduct,
      },
      body,
    );
    ok(res, result);
  }),
);

productsRouter.get(
  '/products',
  ah(async (req, res) => {
    const { orgId } = ctx(req);
    const rows = await query(`${'SELECT ' + SELECT + ' FROM ' + TABLE} WHERE p.organization_id=$1 AND p.active=true ORDER BY p.product_id`, [orgId]);
    ok(res, rows.map(mapProduct));
  }),
);

// 阶梯报价（数据类产品按采购量取单价）
productsRouter.get(
  '/products/:id/tiers',
  ah(async (req, res) => {
    const rows = await query(`SELECT * FROM product_tier WHERE product_id=$1 ORDER BY sort_order`, [req.params.id]);
    ok(res, rows.map(mapProductTier));
  }),
);

// ---------- 产品维护（system.dict）：新建/编辑产品信息、定价与赠送策略 ----------
const productSchema = z.object({
  name: z.string().min(2),
  spec: z.string().optional(),
  unit: z.string().min(1).default('套'),
  timeLimits: z.coerce.number().int().min(0).default(0),
  kind: z.coerce.number().int().min(1).max(2).default(2),          // 1数据 2产品
  price: z.string().min(1),
  cost: z.string().default('0'),
  minDiscount: z.string().default('0.70'),
  freePricing: z.boolean().default(false),
  active: z.boolean().default(true),
  // 赠送策略：是否允许赠送 + 每订单最大赠送数量 / 赠送金额占订单比例上限(%)
  allowGift: z.boolean().default(true),
  maxGiftQty: z.coerce.number().int().positive().nullish(),
  maxGiftRatio: z.coerce.number().min(0.01).max(100).nullish(),
});

productsRouter.post('/products', requirePermission('system.dict'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const d = productSchema.parse(req.body);
  const seq = await one<{ n: number }>(`SELECT count(*)+1 AS n FROM product WHERE organization_id=$1`, [orgId]);
  const code = `P${String(seq!.n).padStart(4, '0')}`;
  const row = await one<any>(
    `INSERT INTO product (organization_id, code, name, spec, unit, time_limits, kind, price, cost, min_discount,
       free_pricing, active, allow_gift, max_gift_qty, max_gift_ratio)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
    [orgId, code, d.name.trim(), d.spec ?? null, d.unit, d.timeLimits, d.kind, d.price, d.cost, d.minDiscount,
     d.freePricing, d.active, d.allowGift, d.maxGiftQty ?? null, d.maxGiftRatio ?? null],
  );
  ok(res, mapProduct(row));
}));

productsRouter.put('/products/:id', requirePermission('system.dict'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const d = productSchema.partial().parse(req.body);
  // 赠送上限：请求体带键才覆盖（显式传 null 表示清除为「不限」，缺省保持原值）
  const hasQty = 'maxGiftQty' in req.body;
  const hasRatio = 'maxGiftRatio' in req.body;
  const row = await one<any>(
    `UPDATE product SET
       name=COALESCE($1,name), spec=COALESCE($2,spec), unit=COALESCE($3,unit), time_limits=COALESCE($4,time_limits),
       kind=COALESCE($5,kind), price=COALESCE($6,price), cost=COALESCE($7,cost), min_discount=COALESCE($8,min_discount),
       free_pricing=COALESCE($9,free_pricing), active=COALESCE($10,active),
       allow_gift=COALESCE($11,allow_gift),
       max_gift_qty=CASE WHEN $12::boolean THEN $13::integer ELSE max_gift_qty END,
       max_gift_ratio=CASE WHEN $14::boolean THEN $15::numeric ELSE max_gift_ratio END
     WHERE product_id=$16 AND organization_id=$17 RETURNING *`,
    [d.name ?? null, d.spec ?? null, d.unit ?? null, d.timeLimits ?? null, d.kind ?? null, d.price ?? null,
     d.cost ?? null, d.minDiscount ?? null, d.freePricing ?? null, d.active ?? null,
     d.allowGift ?? null, hasQty, d.maxGiftQty ?? null, hasRatio, d.maxGiftRatio ?? null, req.params.id, orgId],
  );
  if (!row) return fail(res, '产品不存在', 1, 404);
  ok(res, mapProduct(row));
}));
