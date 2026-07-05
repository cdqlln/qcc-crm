// 字典配置 / 日志审计 内存 Mock。
import { delay, paginate, type ListParams } from './client';
import { MOCK_TERMS } from '@/mock/terms';
import { customers } from '@/mock/data';
import type { ApiPrice, AuditLog, BizType, CustomFieldDef, CustomFieldValues, DictItem } from '@/types';

const BIZ: BizType[] = [
  { businessType: 1, label: '客户来源' }, { businessType: 2, label: '商机阶段' }, { businessType: 3, label: '客户状态' },
  { businessType: 4, label: '线索状态' }, { businessType: 7, label: '工单类型' }, { businessType: 8, label: '跟进方式' },
  { businessType: 9, label: '线索无效原因' }, { businessType: 100, label: '客户分级' }, { businessType: 101, label: '线索分组' },
  { businessType: 102, label: '客户标签' }, { businessType: 103, label: '回款类型' }, { businessType: 104, label: '发票种类' },
  { businessType: 105, label: '支付方式' },
];

// 可变副本（系统级 = MOCK_TERMS；本租户自定义追加）
type Row = DictItem;
const custom: Row[] = [];
let cid = 9000;

export const dictApi = {
  bizTypes: () => delay(BIZ),
  list: (businessType: number): Promise<DictItem[]> => {
    const sys: Row[] = MOCK_TERMS.filter((t) => t.businessType === businessType).map((t) => ({
      termId: t.termId, businessType: t.businessType, name: t.name, kind: t.kind, order: t.order ?? 0, active: 1, systemLevel: true,
    }));
    const mine = custom.filter((t) => t.businessType === businessType);
    return delay([...sys, ...mine].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  },
  create: (input: { businessType: number; name: string; kind?: string; order?: number }) => {
    const termId = ++cid;
    custom.push({ termId, businessType: input.businessType, name: input.name, kind: input.kind, order: input.order ?? 0, active: 1, systemLevel: false });
    return delay({ termId });
  },
  update: (id: number, input: { name?: string; kind?: string; order?: number; active?: number }) => {
    const t = custom.find((x) => x.termId === id);
    if (t) Object.assign(t, input);
    return delay({ ok: true });
  },
  remove: (id: number) => {
    const i = custom.findIndex((x) => x.termId === id);
    if (i >= 0) custom.splice(i, 1);
    return delay({ ok: true });
  },
};

// Mock 审计：演示数据
const now = Date.now();
const logs: AuditLog[] = [
  { auditId: 3, userName: '张伟', action: '新建报价', method: 'POST', path: '/api/crm/quotations', detail: '测试报价', status: 200, ip: '127.0.0.1', createDate: new Date(now - 60000).toISOString() },
  { auditId: 2, userName: '张伟', action: '线索-转客户', method: 'POST', path: '/api/crm/leads/3/convert', status: 200, ip: '127.0.0.1', createDate: new Date(now - 600000).toISOString() },
  { auditId: 1, userName: 'admin', action: '登录', method: 'POST', path: '/api/auth/login', status: 200, ip: '127.0.0.1', createDate: new Date(now - 3600000).toISOString() },
];
export const auditApi = {
  list: (p: ListParams) => paginate(logs, p, ['action', 'detail', 'userName', 'path']),
};

// ---------- 个性客户信息：自定义字段（内存 Mock；值存 customer.customFields） ----------
const fieldDefs: CustomFieldDef[] = [
  { fieldId: 1, businessType: 1, name: '年采购预算', fieldType: 'number', options: [], required: false, order: 1, active: true },
  { fieldId: 2, businessType: 1, name: '决策周期', fieldType: 'select', options: ['1个月内', '1-3个月', '3-6个月', '6个月以上'], required: false, order: 2, active: true },
  { fieldId: 3, businessType: 1, name: '合同续签日', fieldType: 'date', options: [], required: false, order: 3, active: true },
  { fieldId: 4, businessType: 1, name: '客户偏好备注', fieldType: 'text', options: [], required: false, order: 4, active: true },
];
let fid = 100;

export const customFieldsApi = {
  defs: (all?: boolean) => delay(fieldDefs.filter((d) => all || d.active).slice().sort((a, b) => a.order - b.order)),
  create: (input: { name: string; fieldType: string; options?: string[]; required?: boolean; order?: number }) => {
    if (fieldDefs.some((d) => d.name === input.name)) return Promise.reject(new Error(`字段「${input.name}」已存在`));
    const def: CustomFieldDef = {
      fieldId: ++fid, businessType: 1, name: input.name, fieldType: input.fieldType as CustomFieldDef['fieldType'],
      options: input.options ?? [], required: input.required ?? false, order: input.order ?? 0, active: true,
    };
    fieldDefs.push(def);
    return delay({ fieldId: def.fieldId });
  },
  update: (id: number, input: Partial<Pick<CustomFieldDef, 'name' | 'options' | 'required' | 'order' | 'active'>>) => {
    const d = fieldDefs.find((x) => x.fieldId === id);
    if (d) Object.assign(d, input);
    return delay({ ok: true });
  },
  remove: (id: number) => {
    const i = fieldDefs.findIndex((x) => x.fieldId === id);
    if (i >= 0) fieldDefs.splice(i, 1);
    return delay({ ok: true });
  },
  saveValues: (customerId: number, values: CustomFieldValues) => {
    const c = customers.find((x) => x.customerId === customerId);
    const cleaned: CustomFieldValues = {};
    for (const d of fieldDefs.filter((x) => x.active)) {
      const v = values[String(d.fieldId)];
      if (v == null || String(v).trim() === '') continue;
      cleaned[String(d.fieldId)] = d.fieldType === 'number' ? Number(v) : String(v);
    }
    if (c) (c as any).customFields = cleaned;
    return delay({ customFields: cleaned });
  },
};

// ---------- 开放平台·数据产品价目表（Mock：节选真实价目表 2026 条目） ----------
const apiPrices: ApiPrice[] = ([
  ['工商信息', '886', '企业高级搜索', '数据类', 0.1, '次', '分页查询，每页最大返回5条数据'],
  ['工商信息', '2001', '企业信息核验', '核查类', 1, '次', ''],
  ['工商信息', '2003', '客户身份识别', '核查类', 3, '次', ''],
  ['工商信息', '2006', '综合风险排查', '核查类', 6, '次', ''],
  ['工商信息', '410', '企业工商照面', '数据类', 0.2, '次', ''],
  ['法律诉讼', '633', '裁判文书搜索', '数据类', 0.5, '次', ''],
  ['法律诉讼', '732', '失信核查', '核查类', 0.3, '次', ''],
  ['经营风险', '824', '经营异常核查', '核查类', 0.3, '次', ''],
  ['知识产权', '861', '商标信息搜索', '数据类', 0.3, '次', ''],
  ['历史信息', '926', '历史失信核查', '核查类', 0.3, '次', ''],
  ['标准企业户套餐', 'PKG-BASIC', '标准企业户·普通套餐（26个接口）', '套餐', 16, '户', '按户计费'],
  ['标准企业户套餐', 'PKG-PRO', '标准企业户·高级套餐（87个接口）', '套餐', 30, '户', '按户计费'],
] as [string, string, string, string, number, string, string][]).map(([category, apiCode, name, apiType, price, unit, remark], i) => ({
  apiPriceId: i + 1, category, apiCode, name, apiType, price, unit, remark, active: true, order: i + 1,
}));
let apiPriceSeq = 500;

// 调价留痕（Mock 内存）
const priceHistory: import('@/types').ApiPriceHistory[] = [];
let histSeq = 0;
function logPrice(p: ApiPrice, oldPrice: number | null, newPrice: number, source: 'manual' | 'import') {
  priceHistory.unshift({
    historyId: ++histSeq, apiPriceId: p.apiPriceId, apiCode: p.apiCode, name: p.name,
    oldPrice, newPrice, source, changedBy: 1, changedByName: '张伟', createDate: new Date().toISOString(),
  });
}

export const apiPricesApi = {
  list: (kw?: string, category?: string, all?: boolean) =>
    delay(apiPrices.filter((p) =>
      (all || p.active) &&
      (!category || p.category === category) &&
      (!kw || p.name.includes(kw) || p.apiCode.includes(kw)))),
  create: (input: Partial<ApiPrice>) => {
    if (apiPrices.some((p) => p.apiCode === input.apiCode)) return Promise.reject(new Error(`ApiCode「${input.apiCode}」已存在`));
    const row: ApiPrice = {
      apiPriceId: ++apiPriceSeq, category: input.category ?? '', apiCode: input.apiCode ?? '', name: input.name ?? '',
      apiType: input.apiType ?? '', price: Number(input.price ?? 0), unit: input.unit ?? '次', remark: input.remark ?? '',
      active: true, order: input.order ?? 999,
    };
    apiPrices.push(row);
    logPrice(row, null, row.price, 'manual');
    return delay({ apiPriceId: row.apiPriceId });
  },
  update: (id: number, input: Partial<ApiPrice>) => {
    const p = apiPrices.find((x) => x.apiPriceId === id);
    if (p) {
      if (input.price != null && Number(input.price) !== p.price) logPrice(p, p.price, Number(input.price), 'manual');
      Object.assign(p, input);
    }
    return delay({ ok: true });
  },
  remove: (id: number) => {
    const i = apiPrices.findIndex((x) => x.apiPriceId === id);
    if (i >= 0) apiPrices.splice(i, 1);
    return delay({ ok: true });
  },
  history: () => delay(priceHistory.slice(0, 200)),
  itemHistory: (id: number) => delay(priceHistory.filter((h) => h.apiPriceId === id)),
  // Mock 导入：仅支持 CSV（xlsx 解析在后端）；列：类别,ApiCode,名称,类型,标准价[,单位,备注]
  importFile: async (file: File): Promise<import('@/types').ApiPriceImportResult> => {
    if (!/\.csv$/i.test(file.name)) throw new Error('演示模式仅支持 CSV 导入；xlsx 请部署后端后使用');
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let inserted = 0, priceChanged = 0, unchanged = 0;
    const changes: { apiCode: string; name: string; oldPrice: number; newPrice: number }[] = [];
    for (const line of lines.slice(1)) {
      const [category = '', apiCode = '', name = '', apiType = '', priceS = '', unit = '次', remark = ''] = line.split(',').map((s) => s.trim());
      const price = Number(priceS);
      if (!apiCode || !name || Number.isNaN(price)) continue;
      const ex = apiPrices.find((p) => p.apiCode === apiCode);
      if (!ex) {
        const row: ApiPrice = { apiPriceId: ++apiPriceSeq, category, apiCode, name, apiType, price, unit: unit || '次', remark, active: true, order: 999 };
        apiPrices.push(row);
        logPrice(row, null, price, 'import');
        inserted++;
      } else if (ex.price !== price) {
        logPrice(ex, ex.price, price, 'import');
        if (changes.length < 20) changes.push({ apiCode, name, oldPrice: ex.price, newPrice: price });
        Object.assign(ex, { name, price, category: category || ex.category });
        priceChanged++;
      } else unchanged++;
    }
    return { total: inserted + priceChanged + unchanged, inserted, priceChanged, unchanged, changes, fileName: file.name };
  },
};

// Mock 集成配置（内存）
let qccCfg: { key: string; secret: string; base: string } | null = null;
let aiCfg: { provider: 'anthropic' | 'openai-compatible'; key: string; model: string; base: string } | null = null;
const maskv = (s: string) => (s ? s.slice(0, 4) + '****' + s.slice(-4) : '');
export const integrationsApi = {
  qcc: () => delay({
    enabled: !!qccCfg, source: qccCfg ? 'db' : 'none', base: qccCfg?.base ?? 'https://api.qichacha.com',
    keyMasked: maskv(qccCfg?.key ?? ''), secretMasked: maskv(qccCfg?.secret ?? ''),
  }),
  saveQcc: (input: { key: string; secret: string; base?: string }) => {
    qccCfg = { key: input.key, secret: input.secret, base: input.base ?? 'https://api.qichacha.com' };
    return delay({ ok: true });
  },
  clearQcc: () => { qccCfg = null; return delay({ ok: true }); },
  testQcc: (_keyword?: string) => delay({ ok: true, sample: ['小米科技有限责任公司', '小米通讯技术有限公司'] }),
  // Mock AI 模型配置（仅内存演示；真实模型调用需后端）
  ai: () => delay<import('@/types').AiIntegrationCfg>({
    enabled: !!aiCfg, source: aiCfg ? 'db' : 'none',
    provider: aiCfg?.provider ?? 'anthropic', base: aiCfg?.base ?? '', model: aiCfg?.model ?? '', keyMasked: maskv(aiCfg?.key ?? ''),
  }),
  saveAi: (input: { provider: 'anthropic' | 'openai-compatible'; key: string; model: string; base?: string }) => {
    aiCfg = { provider: input.provider, key: input.key, model: input.model, base: input.base ?? '' };
    return delay({ ok: true });
  },
  clearAi: () => { aiCfg = null; return delay({ ok: true }); },
  testAi: () => delay({ ok: true, model: aiCfg?.model ?? '', sample: 'Mock 模式无法调用真实模型，请部署后端后测试。' }),
};
