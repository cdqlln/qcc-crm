// 字典配置 / 日志审计 内存 Mock。
import { delay, paginate, type ListParams } from './client';
import { MOCK_TERMS } from '@/mock/terms';
import type { AuditLog, BizType, DictItem } from '@/types';

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
