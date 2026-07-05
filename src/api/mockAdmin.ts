// 字典配置 / 日志审计 内存 Mock。
import { delay, paginate, type ListParams } from './client';
import { MOCK_TERMS } from '@/mock/terms';
import { customers } from '@/mock/data';
import type { AuditLog, BizType, CustomFieldDef, CustomFieldValues, DictItem } from '@/types';

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
