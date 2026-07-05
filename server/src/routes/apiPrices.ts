import { Router } from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok } from '../http.js';
import { requirePermission } from '../auth.js';

export const apiPricesRouter = Router();
const memUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// 调价留痕：old_price NULL=新增
async function logPriceChange(
  orgId: number, userId: number,
  row: { apiPriceId: number; apiCode: string; name: string },
  oldPrice: number | null, newPrice: number, source: 'manual' | 'import',
) {
  await one(
    `INSERT INTO api_price_history (organization_id, api_price_id, api_code, name, old_price, new_price, source, changed_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING history_id`,
    [orgId, row.apiPriceId, row.apiCode, row.name, oldPrice, newPrice, source, userId],
  );
}

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
  const { orgId, userId } = ctx(req);
  const b = req.body ?? {};
  const old = await one<any>(`SELECT * FROM api_price WHERE api_price_id=$1 AND organization_id=$2`, [req.params.id, orgId]);
  if (!old) return fail(res, '条目不存在', 1, 404);
  await one(
    `UPDATE api_price SET
       category=COALESCE($1,category), name=COALESCE($2,name), api_type=COALESCE($3,api_type),
       price=COALESCE($4,price), unit=COALESCE($5,unit), remark=COALESCE($6,remark),
       active=COALESCE($7,active), sort_order=COALESCE($8,sort_order)
     WHERE api_price_id=$9 RETURNING api_price_id`,
    [b.category ?? null, b.name ?? null, b.apiType ?? null, b.price ?? null, b.unit ?? null,
     b.remark ?? null, b.active ?? null, b.order ?? null, old.api_price_id],
  );
  // 价格变化 → 留痕
  if (b.price != null && Number(b.price) !== Number(old.price)) {
    await logPriceChange(orgId, userId, { apiPriceId: Number(old.api_price_id), apiCode: old.api_code, name: b.name ?? old.name },
      Number(old.price), Number(b.price), 'manual');
  }
  ok(res, { ok: true });
}));

const mapHist = (r: any) => ({
  historyId: Number(r.history_id),
  apiPriceId: r.api_price_id != null ? Number(r.api_price_id) : null,
  apiCode: r.api_code,
  name: r.name,
  oldPrice: r.old_price != null ? Number(r.old_price) : null,
  newPrice: Number(r.new_price),
  source: r.source,
  changedBy: r.changed_by,
  changedByName: r.changed_by_name ?? '',
  createDate: r.created_at,
});

// 全局调整记录（最近 200 条）—— 注册在 /:id 之前避免路径吞并
apiPricesRouter.get('/api-prices/history', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const rows = await query(
    `SELECT h.*, u.name AS changed_by_name FROM api_price_history h
     LEFT JOIN app_user u ON u.user_id = h.changed_by
     WHERE h.organization_id=$1 ORDER BY h.history_id DESC LIMIT 200`,
    [orgId],
  );
  ok(res, rows.map(mapHist));
}));

// 单条目的调整记录
apiPricesRouter.get('/api-prices/:id/history', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const rows = await query(
    `SELECT h.*, u.name AS changed_by_name FROM api_price_history h
     LEFT JOIN app_user u ON u.user_id = h.changed_by
     WHERE h.organization_id=$1 AND h.api_price_id=$2 ORDER BY h.history_id DESC LIMIT 100`,
    [orgId, req.params.id],
  );
  ok(res, rows.map(mapHist));
}));

// ---------- 文件导入（xlsx/csv）：按 ApiCode upsert，价格变化写调价记录 ----------
// 列名识别：接口类别/类别 | ApiCode/接口编码 | 接口名称/名称 | 接口类型/类型 | 标准价/价格 | 单位/计费单位 | 备注
const HEADER_ALIASES: Record<string, string[]> = {
  category: ['接口类别', '类别', 'category'],
  code: ['apicode', '接口编码', 'api编码', 'code'],
  name: ['接口名称', '名称', 'name'],
  type: ['接口类型', '类型', 'type'],
  price: ['标准价', '价格', '单价', 'price'],
  unit: ['单位', '计费单位', 'unit'],
  remark: ['备注', 'remark'],
};

function parsePriceFile(buf: Buffer, isCsv: boolean): { rows: { category: string; code: string; name: string; type: string; price: number; unit: string; remark: string }[]; error?: string } {
  // CSV 按 UTF-8 文本读（XLSX 对 buffer 默认按 latin1 解码会导致中文表头乱码）
  const wb = isCsv
    ? XLSX.read(buf.toString('utf8').replace(/^﻿/, ''), { type: 'string' })
    : XLSX.read(buf, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { rows: [], error: '文件无工作表' };
  const grid: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });
  // 定位表头行：包含 ApiCode（或 接口名称+标准价）
  let headerIdx = -1;
  const colMap: Record<string, number> = {};
  for (let i = 0; i < Math.min(grid.length, 10); i++) {
    const cells = (grid[i] ?? []).map((v) => String(v ?? '').trim().toLowerCase());
    const found: Record<string, number> = {};
    for (const [key, aliases] of Object.entries(HEADER_ALIASES)) {
      const idx = cells.findIndex((c) => c && aliases.some((a) => c === a.toLowerCase()));
      if (idx >= 0) found[key] = idx;
    }
    if (found.code != null || (found.name != null && found.price != null)) {
      headerIdx = i;
      Object.assign(colMap, found);
      break;
    }
  }
  if (headerIdx < 0) return { rows: [], error: '未识别到表头（需包含 ApiCode 或 接口名称+标准价 列）' };

  const rows: { category: string; code: string; name: string; type: string; price: number; unit: string; remark: string }[] = [];
  let cat = '';
  for (let i = headerIdx + 1; i < grid.length; i++) {
    const g = grid[i] ?? [];
    const cell = (k: string) => (colMap[k] != null ? String(g[colMap[k]] ?? '').trim() : '');
    if (cell('category')) cat = cell('category'); // 合并单元格：类别向下继承
    const code = cell('code');
    const name = cell('name');
    const price = Number(cell('price'));
    if (!code || !name || Number.isNaN(price)) continue;
    rows.push({
      category: cat, code: code.replace(/\.0$/, ''), name, type: cell('type'),
      price, unit: cell('unit') || '次', remark: cell('remark').slice(0, 380),
    });
  }
  return { rows };
}

apiPricesRouter.post('/api-prices/import', requirePermission('system.dict'), memUpload.single('file'), ah(async (req, res) => {
  const { orgId, userId } = ctx(req);
  const file = (req as any).file as { buffer: Buffer; originalname: string } | undefined;
  if (!file) return fail(res, '请上传价目表文件（xlsx/csv）');
  let parsed: ReturnType<typeof parsePriceFile>;
  try {
    parsed = parsePriceFile(file.buffer, /\.csv$/i.test(file.originalname));
  } catch (e) {
    return fail(res, `文件解析失败：${e instanceof Error ? e.message : String(e)}`);
  }
  if (parsed.error) return fail(res, parsed.error);
  if (parsed.rows.length === 0) return fail(res, '未解析到有效条目（需 ApiCode/名称/标准价）');

  let inserted = 0, priceChanged = 0, unchanged = 0;
  const changes: { apiCode: string; name: string; oldPrice: number; newPrice: number }[] = [];
  for (const [i, r] of parsed.rows.entries()) {
    const old = await one<any>(`SELECT api_price_id, price, name FROM api_price WHERE organization_id=$1 AND api_code=$2`, [orgId, r.code]);
    if (!old) {
      const created = await one<any>(
        `INSERT INTO api_price (organization_id, category, api_code, name, api_type, price, unit, remark, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING api_price_id`,
        [orgId, r.category || null, r.code, r.name, r.type || null, r.price, r.unit, r.remark || null, 1000 + i],
      );
      await logPriceChange(orgId, userId, { apiPriceId: Number(created.api_price_id), apiCode: r.code, name: r.name }, null, r.price, 'import');
      inserted++;
    } else {
      await one(
        `UPDATE api_price SET category=COALESCE(NULLIF($1,''),category), name=$2, api_type=COALESCE(NULLIF($3,''),api_type),
           price=$4, unit=$5, remark=COALESCE(NULLIF($6,''),remark)
         WHERE api_price_id=$7 RETURNING api_price_id`,
        [r.category, r.name, r.type, r.price, r.unit, r.remark, old.api_price_id],
      );
      if (Number(old.price) !== r.price) {
        await logPriceChange(orgId, userId, { apiPriceId: Number(old.api_price_id), apiCode: r.code, name: r.name }, Number(old.price), r.price, 'import');
        priceChanged++;
        if (changes.length < 20) changes.push({ apiCode: r.code, name: r.name, oldPrice: Number(old.price), newPrice: r.price });
      } else {
        unchanged++;
      }
    }
  }
  ok(res, { total: parsed.rows.length, inserted, priceChanged, unchanged, changes, fileName: file.originalname });
}));

apiPricesRouter.delete('/api-prices/:id', requirePermission('system.dict'), ah(async (req, res) => {
  const { orgId } = ctx(req);
  const r = await one(`DELETE FROM api_price WHERE api_price_id=$1 AND organization_id=$2 RETURNING api_price_id`, [req.params.id, orgId]);
  if (!r) return fail(res, '条目不存在', 1, 404);
  ok(res, { ok: true });
}));
