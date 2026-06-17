import { Router } from 'express';
import { query } from '../db.js';
import { ah, ctx, ok, parseList } from '../http.js';
import { runList } from '../list.js';
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
