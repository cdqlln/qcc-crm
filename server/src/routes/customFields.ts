import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok } from '../http.js';
import { requirePermission } from '../auth.js';

export const customFieldsRouter = Router();

// 个性客户信息：租户自定义字段。定义由管理员维护（system.dict），值随客户保存。

const mapDef = (r: any) => ({
  fieldId: Number(r.field_id),
  businessType: r.business_type,
  name: r.name,
  fieldType: r.field_type,
  options: r.options ?? [],
  required: r.required,
  order: r.sort_order,
  active: r.active,
});

// 字段定义列表（登录即可 —— 表单渲染用；includeInactive 仅管理页用）
customFieldsRouter.get('/custom-fields', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const bt = Number(req.query.businessType ?? 1);
  const all = req.query.all === '1';
  const rows = await query(
    `SELECT * FROM custom_field_def WHERE organization_id=$1 AND business_type=$2 ${all ? '' : 'AND active'}
     ORDER BY sort_order, field_id`,
    [orgId, bt],
  );
  ok(res, rows.map(mapDef));
}));

const defSchema = z.object({
  businessType: z.coerce.number().int().default(1),
  name: z.string().min(1).max(60),
  fieldType: z.enum(['text', 'number', 'date', 'select']),
  options: z.array(z.string().min(1)).default([]),
  required: z.boolean().default(false),
  order: z.coerce.number().int().default(0),
});

customFieldsRouter.post('/custom-fields', requirePermission('system.dict'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const d = defSchema.parse(req.body);
  if (d.fieldType === 'select' && d.options.length === 0) return fail(res, '下拉字段需要至少一个选项');
  const r = await one<any>(
    `INSERT INTO custom_field_def (organization_id, business_type, name, field_type, options, required, sort_order)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (organization_id, business_type, name) DO NOTHING RETURNING field_id`,
    [orgId, d.businessType, d.name.trim(), d.fieldType, JSON.stringify(d.options), d.required, d.order],
  );
  if (!r) return fail(res, `字段「${d.name}」已存在`);
  ok(res, { fieldId: Number(r.field_id) });
}));

customFieldsRouter.put('/custom-fields/:id', requirePermission('system.dict'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const b = req.body ?? {};
  const r = await one(
    `UPDATE custom_field_def SET
       name=COALESCE($1,name), options=COALESCE($2,options), required=COALESCE($3,required),
       sort_order=COALESCE($4,sort_order), active=COALESCE($5,active)
     WHERE field_id=$6 AND organization_id=$7 RETURNING field_id`,
    [b.name ?? null, b.options ? JSON.stringify(b.options) : null, b.required ?? null, b.order ?? null, b.active ?? null, req.params.id, orgId],
  );
  if (!r) return fail(res, '字段不存在', 1, 404);
  ok(res, { ok: true });
}));

customFieldsRouter.delete('/custom-fields/:id', requirePermission('system.dict'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const r = await one(`DELETE FROM custom_field_def WHERE field_id=$1 AND organization_id=$2 RETURNING field_id`, [req.params.id, orgId]);
  if (!r) return fail(res, '字段不存在', 1, 404);
  ok(res, { ok: true });
}));

// 保存某客户的个性信息（按定义校验类型/必填/选项）
customFieldsRouter.put('/customers/:id/custom-fields', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const cust = await one<any>(`SELECT customer_id, custom_fields FROM customer WHERE customer_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
  if (!cust) return fail(res, '客户不存在', 1, 404);
  const values = (req.body?.values ?? {}) as Record<string, unknown>;
  const defs = (await query<any>(
    `SELECT * FROM custom_field_def WHERE organization_id=$1 AND business_type=1 AND active`,
    [orgId],
  )).map(mapDef);

  const cleaned: Record<string, string | number> = {};
  for (const def of defs) {
    const raw = values[String(def.fieldId)];
    const empty = raw == null || String(raw).trim() === '';
    if (empty) {
      if (def.required) return fail(res, `「${def.name}」为必填`);
      continue;
    }
    const sv = String(raw).trim();
    if (def.fieldType === 'number') {
      const nv = Number(sv);
      if (Number.isNaN(nv)) return fail(res, `「${def.name}」需为数字`);
      cleaned[def.fieldId] = nv;
    } else if (def.fieldType === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(sv)) return fail(res, `「${def.name}」需为日期（YYYY-MM-DD）`);
      cleaned[def.fieldId] = sv;
    } else if (def.fieldType === 'select') {
      if (!def.options.includes(sv)) return fail(res, `「${def.name}」的值必须是：${def.options.join('/')}`);
      cleaned[def.fieldId] = sv;
    } else {
      cleaned[def.fieldId] = sv.slice(0, 500);
    }
  }
  await one(`UPDATE customer SET custom_fields=$1 WHERE customer_id=$2`, [JSON.stringify(cleaned), cust.customer_id]);
  ok(res, { customFields: cleaned });
}));
