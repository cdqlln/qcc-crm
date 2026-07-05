import { Router } from 'express';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok, parseList } from '../http.js';
import { runList } from '../list.js';
import { requirePermission } from '../auth.js';
import { mapTerm } from '../mappers.js';
import { getSetting, setSetting } from '../services/settings.js';
import { fuzzySearch, getQccCfg } from '../services/qcc.js';
import { chatComplete, getLlmCfg } from '../services/llm.js';

export const adminRouter = Router();

// ---------- 字典配置（system.dict）----------
const BIZ_TYPES = [
  { businessType: 1, label: '客户来源' },
  { businessType: 2, label: '商机阶段' },
  { businessType: 3, label: '客户状态' },
  { businessType: 4, label: '线索状态' },
  { businessType: 7, label: '工单类型' },
  { businessType: 8, label: '跟进方式' },
  { businessType: 9, label: '线索无效原因' },
  { businessType: 100, label: '客户分级' },
  { businessType: 101, label: '线索分组' },
  { businessType: 102, label: '客户标签' },
  { businessType: 103, label: '回款类型' },
  { businessType: 104, label: '发票种类' },
  { businessType: 105, label: '支付方式' },
];

adminRouter.get('/dict/biz-types', requirePermission('system.dict'), ah(async (_req, res) => ok(res, BIZ_TYPES)));

// 某类型全部字典项（系统级 + 本租户自定义，含停用）
adminRouter.get('/dict', requirePermission('system.dict'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const bt = Number(req.query.businessType);
  const rows = await query(
    `SELECT *, (organization_id IS NULL) AS system_level FROM term
     WHERE business_type=$1 AND (organization_id IS NULL OR organization_id=$2)
     ORDER BY sort_order, term_id`,
    [bt, orgId],
  );
  ok(res, rows.map((r: any) => ({ ...mapTerm(r), active: r.active, systemLevel: r.system_level })));
}));

const dictSchema = z.object({
  businessType: z.coerce.number().int(),
  name: z.string().min(1),
  kind: z.string().optional(),
  order: z.coerce.number().int().optional(),
});
adminRouter.post('/dict', requirePermission('system.dict'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const d = dictSchema.parse(req.body);
  const r = await one(
    `INSERT INTO term (organization_id, business_type, name, kind, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING term_id`,
    [orgId, d.businessType, d.name, d.kind ?? null, d.order ?? 0],
  );
  ok(res, { termId: (r as any).term_id });
}));
adminRouter.put('/dict/:id', requirePermission('system.dict'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const b = req.body ?? {};
  // 仅可改本租户自定义项；系统级只读
  const r = await one(
    `UPDATE term SET name=COALESCE($1,name), kind=COALESCE($2,kind), sort_order=COALESCE($3,sort_order), active=COALESCE($4,active)
     WHERE term_id=$5 AND organization_id=$6 RETURNING term_id`,
    [b.name ?? null, b.kind ?? null, b.order ?? null, b.active ?? null, req.params.id, orgId],
  );
  if (!r) return fail(res, '系统级字典不可修改，或字典项不存在', 1, 403);
  ok(res, { ok: true });
}));
adminRouter.delete('/dict/:id', requirePermission('system.dict'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const r = await one(`DELETE FROM term WHERE term_id=$1 AND organization_id=$2 RETURNING term_id`, [req.params.id, orgId]);
  if (!r) return fail(res, '系统级字典不可删除', 1, 403);
  ok(res, { ok: true });
}));

// ---------- 集成配置（system.integration）：企查查凭据管理员端维护，不入库仓库 ----------
const mask = (s: string | null | undefined) => (s ? s.slice(0, 4) + '****' + s.slice(-4) : '');

adminRouter.get('/integrations/qcc', requirePermission('system.integration'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const cfg = await getQccCfg(orgId);
  const fromDb = !!(await getSetting(orgId, 'qcc.key'));
  ok(res, {
    enabled: cfg.enabled,
    source: fromDb ? 'db' : cfg.enabled ? 'env' : 'none',
    base: cfg.base,
    keyMasked: mask(cfg.key),
    secretMasked: mask(cfg.secret),
  });
}));

const qccSchema = z.object({
  key: z.string().min(8),
  secret: z.string().min(8),
  base: z.string().url().optional(),
});
adminRouter.put('/integrations/qcc', requirePermission('system.integration'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const d = qccSchema.parse(req.body);
  await setSetting(orgId, 'qcc.key', d.key.trim());
  await setSetting(orgId, 'qcc.secret', d.secret.trim());
  if (d.base) await setSetting(orgId, 'qcc.base', d.base.trim());
  ok(res, { ok: true });
}));

adminRouter.delete('/integrations/qcc', requirePermission('system.integration'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  await setSetting(orgId, 'qcc.key', null);
  await setSetting(orgId, 'qcc.secret', null);
  await setSetting(orgId, 'qcc.base', null);
  ok(res, { ok: true });
}));

// 连通性测试：用当前配置调 FuzzySearch
adminRouter.post('/integrations/qcc/test', requirePermission('system.integration'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const cfg = await getQccCfg(orgId);
  if (!cfg.enabled) return fail(res, '尚未配置 Key/SecretKey');
  const list = await fuzzySearch(orgId, String(req.body?.keyword || '小米科技'));
  if (list === null) return fail(res, '调用失败：请检查凭据、账号额度或服务器出口 IP 是否境内');
  ok(res, { ok: true, sample: list.slice(0, 3).map((c) => c.name) });
}));

// ---------- 集成配置：AI 模型（客户洞察等 AI 能力；凭据仅存数据库） ----------
adminRouter.get('/integrations/ai', requirePermission('system.integration'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const cfg = await getLlmCfg(orgId);
  const fromDb = !!(await getSetting(orgId, 'ai.key'));
  ok(res, {
    enabled: cfg.enabled,
    source: fromDb ? 'db' : cfg.enabled ? 'env' : 'none',
    provider: cfg.provider,
    base: cfg.base,
    model: cfg.model,
    keyMasked: mask(cfg.key),
  });
}));

const aiSchema = z.object({
  provider: z.enum(['anthropic', 'openai-compatible']),
  key: z.string().min(8),
  model: z.string().min(1),
  base: z.string().url().optional().or(z.literal('')),
});
adminRouter.put('/integrations/ai', requirePermission('system.integration'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const d = aiSchema.parse(req.body);
  if (d.provider === 'openai-compatible' && !d.base) return fail(res, 'OpenAI 兼容服务必须填写接口地址（Base URL）');
  await setSetting(orgId, 'ai.provider', d.provider);
  await setSetting(orgId, 'ai.key', d.key.trim());
  await setSetting(orgId, 'ai.model', d.model.trim());
  await setSetting(orgId, 'ai.base', d.base ? d.base.trim() : null);
  ok(res, { ok: true });
}));

adminRouter.delete('/integrations/ai', requirePermission('system.integration'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  for (const k of ['ai.provider', 'ai.key', 'ai.model', 'ai.base']) await setSetting(orgId, k, null);
  ok(res, { ok: true });
}));

// 连通性测试：让模型回一句话，验证凭据/地址/模型名
adminRouter.post('/integrations/ai/test', requirePermission('system.integration'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const cfg = await getLlmCfg(orgId);
  if (!cfg.enabled) return fail(res, '尚未配置 AI 模型（Key/模型名，OpenAI 兼容还需 Base URL）');
  try {
    const text = await chatComplete(cfg, '你是连通性测试助手，请用一句中文确认可用。', '收到请回复：连接正常。', 50);
    ok(res, { ok: true, model: cfg.model, sample: text.trim().slice(0, 80) });
  } catch (e) {
    return fail(res, `连接失败：${e instanceof Error ? e.message : String(e)}`);
  }
}));

// ---------- 日志审计（system.audit）----------
adminRouter.post('/audit-logs', requirePermission('system.audit'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const body = parseList(req);
  const conds = ['organization_id = $1'];
  const params: unknown[] = [orgId];
  if (body.filters?.userId) { params.push(body.filters.userId); conds.push(`user_id = $${params.length}`); }
  const result = await runList(
    {
      table: 'audit_log',
      searchCols: ['action', 'detail', 'user_name', 'path'],
      filterMap: { createdAt: { col: 'created_at', kind: 'dateRange' } },
      defaultOrder: 'created_at DESC',
      baseConds: conds,
      baseParams: params,
      mapRow: (r: any) => ({
        auditId: r.audit_id, userId: r.user_id, userName: r.user_name, action: r.action,
        method: r.method, path: r.path, targetId: r.target_id, detail: r.detail, ip: r.ip,
        status: r.status, createDate: r.created_at,
      }),
    },
    body,
  );
  ok(res, result);
}));
