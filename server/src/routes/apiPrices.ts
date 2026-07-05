import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok } from '../http.js';
import { requirePermission } from '../auth.js';

export const apiPricesRouter = Router();

// 开放平台·数据产品价目表：数据API套餐报价的接口级价格依据（管理员维护，销售报价时引用）

const mapRow = (r: any) => ({
  apiPriceId: Number(r.api_price_id),
  category: r.category ?? '',
  apiCode: r.api_code,
  name: r.name,
  apiType: r.api_type ?? '',
  price: Number(r.price),
  unit: r.unit ?? '次',
  remark: r.remark ?? '',
  active: r.active,
  order: r.sort_order,
});

// 价目表查询（登录即可 —— 报价选择器用）
apiPricesRouter.get('/api-prices', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const kw = String(req.query.kw ?? '').trim();
  const category = String(req.query.category ?? '').trim();
  const all = req.query.all === '1'; // 管理页含停用
  const conds = ['organization_id=$1'];
  const params: unknown[] = [orgId];
  if (!all) conds.push('active');
  if (category) { params.push(category); conds.push(`category = $${params.length}`); }
  if (kw) { params.push(`%${kw}%`); conds.push(`(name ILIKE $${params.length} OR api_code ILIKE $${params.length})`); }
  const rows = await query(`SELECT * FROM api_price WHERE ${conds.join(' AND ')} ORDER BY sort_order, api_price_id LIMIT 300`, params);
  ok(res, rows.map(mapRow));
}));

const priceSchema = z.object({
  category: z.string().min(1),
  apiCode: z.string().min(1),
  name: z.string().min(1),
  apiType: z.string().optional(),
  price: z.coerce.number().min(0),
  unit: z.string().default('次'),
  remark: z.string().optional(),
  order: z.coerce.number().int().default(0),
});

apiPricesRouter.post('/api-prices', requirePermission('system.dict'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const d = priceSchema.parse(req.body);
  const r = await one<any>(
    `INSERT INTO api_price (organization_id, category, api_code, name, api_type, price, unit, remark, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (organization_id, api_code) DO NOTHING RETURNING api_price_id`,
    [orgId, d.category, d.apiCode.trim(), d.name.trim(), d.apiType ?? null, d.price, d.unit, d.remark ?? null, d.order],
  );
  if (!r) return fail(res, `ApiCode「${d.apiCode}」已存在`);
  ok(res, { apiPriceId: Number(r.api_price_id) });
}));

apiPricesRouter.put('/api-prices/:id', requirePermission('system.dict'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const b = req.body ?? {};
  const r = await one(
    `UPDATE api_price SET
       category=COALESCE($1,category), name=COALESCE($2,name), api_type=COALESCE($3,api_type),
       price=COALESCE($4,price), unit=COALESCE($5,unit), remark=COALESCE($6,remark),
       active=COALESCE($7,active), sort_order=COALESCE($8,sort_order)
     WHERE api_price_id=$9 AND organization_id=$10 RETURNING api_price_id`,
    [b.category ?? null, b.name ?? null, b.apiType ?? null, b.price ?? null, b.unit ?? null,
     b.remark ?? null, b.active ?? null, b.order ?? null, req.params.id, orgId],
  );
  if (!r) return fail(res, '条目不存在', 1, 404);
  ok(res, { ok: true });
}));

apiPricesRouter.delete('/api-prices/:id', requirePermission('system.dict'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const r = await one(`DELETE FROM api_price WHERE api_price_id=$1 AND organization_id=$2 RETURNING api_price_id`, [req.params.id, orgId]);
  if (!r) return fail(res, '条目不存在', 1, 404);
  ok(res, { ok: true });
}));
