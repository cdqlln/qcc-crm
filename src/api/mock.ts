import {
  backLogs,
  contacts,
  contracts,
  customers,
  invoices,
  opportunities,
  payments,
  paymentSheets,
  preCredits,
  products,
  productTiers,
  quotationProducts,
  quotations,
  targets,
  trackings,
} from '@/mock/data';
import { MOCK_TERMS } from '@/mock/terms';
import { userName, MOCK_USERS, CURRENT_USER } from '@/mock/org';
import { delay, paginate, type ListParams } from './client';
import type {
  BackLog,
  Contract,
  Customer,
  Invoice,
  Opportunity,
  Payment,
  PreCredit,
  Quotation,
  Term,
} from '@/types';
import { buildAiReport } from '@/mock/ai';
import { dayjs } from '@/lib/format';

const nextId = (rows: { [k: string]: any }[], key: string) =>
  rows.reduce((m, r) => Math.max(m, Number(r[key]) || 0), 0) + 1;

// ---------- 字典 §9.4 ----------
export const termsApi = {
  all: () => delay<Term[]>(MOCK_TERMS, 120),
};

// 附件上传（Mock：读为 dataURL，便于本地预览/下载）
export const uploadApi = {
  upload: (files: File[]) =>
    Promise.all(
      files.map(
        (f) =>
          new Promise<{ name: string; url: string; mime: string; size: number }>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve({ name: f.name, url: String(reader.result), mime: f.type, size: f.size });
            reader.readAsDataURL(f);
          }),
      ),
    ),
};

// ---------- 线索 §6.2 ----------
// 转化留痕：固化转化那一刻的线索原貌（客户侧「查看原线索」）
const tName2 = (id?: number | null) => MOCK_TERMS.find((t) => t.termId === id)?.name ?? '';
function markConverted(c: Customer) {
  if (c.convertedAt) return;
  c.convertedAt = dayjs().toISOString();
  c.convertedBy = 1;
  c.leadSnapshot = {
    name: c.name, sourceName: tName2(c.source), poolGroupName: tName2(c.poolGroup),
    industry: c.industry ?? '', region: `${c.province ?? ''}${c.city ?? ''}`,
    phoneName: c.phoneName ?? '', phone: c.phone ?? '', leaderName: userName(c.leaderId) ?? '',
    trackingNum: c.trackingNum ?? 0, createdAt: c.createDate, claimAt: c.claimAt, assignAt: c.assignAt,
    utmSource: c.utmSource, utmMedium: c.utmMedium, utmCampaign: c.utmCampaign,
  };
}

export const leadsApi = {
  list: (p: ListParams) => {
    const tab = p.tab ?? 'all';
    // 已转化线索已成为客户，按转化留痕检索
    let src = tab === 'converted'
      ? customers.filter((c) => !!c.convertedAt)
      : customers.filter((c) => c.category === 1 || c.category === 2);
    if (tab === 'pool') src = src.filter((c) => c.category === 2);
    if (tab === 'mine') src = src.filter((c) => c.category === 1);
    return paginate(src, p, ['name', 'phoneName', 'industry']);
  },
  get: (id: number) => delay(customers.find((c) => c.customerId === id)),
  convert: (id: number) => {
    const c = customers.find((x) => x.customerId === id);
    if (c) {
      if (c.category > 2) return Promise.reject(new Error('该记录已是客户，无需再次转化'));
      markConverted(c);
      c.category = 3;
      c.currentTrackingStatus = 8;
    }
    return delay(c);
  },
  create: (input: Partial<Customer>) => {
    const row: Customer = {
      customerId: nextId(customers, 'customerId'),
      organizationId: 1,
      category: 1,
      currentTrackingStatus: 15, // 未分配
      trackingNum: 0,
      approval: -1,
      active: 1,
      createDate: dayjs().toISOString(),
      trackingUpdateDate: dayjs().toISOString(),
      labels: [],
      ...input,
      name: input.name ?? '未命名线索',
    } as Customer;
    customers.unshift(row);
    return delay(row);
  },
  update: (id: number, input: Partial<Customer>) => {
    const c = customers.find((x) => x.customerId === id);
    if (c) Object.assign(c, input);
    return delay(c);
  },
  claim: (ids: number[]) => {
    const rows = customers.filter((c) => ids.includes(c.customerId));
    rows.forEach((c) => { c.category = 1; c.leaderId = 1; c.currentTrackingStatus = 18; c.claimAt = dayjs().toISOString(); });
    return delay(rows);
  },
  receive: (ids: number[]) => {
    const rows = customers.filter((c) => ids.includes(c.customerId));
    rows.forEach((c) => { c.currentTrackingStatus = 18; });
    return delay(rows);
  },
  reject: (ids: number[]) => {
    const rows = customers.filter((c) => ids.includes(c.customerId));
    rows.forEach((c) => { c.currentTrackingStatus = 19; });
    return delay(rows);
  },
  returnPool: (ids: number[]) => {
    const rows = customers.filter((c) => ids.includes(c.customerId));
    rows.forEach((c) => { c.category = 2; c.leaderId = undefined; c.currentTrackingStatus = 15; });
    return delay(rows);
  },
  assign: (ids: number[], toUserId: number) => {
    const rows = customers.filter((c) => ids.includes(c.customerId));
    rows.forEach((c) => { c.category = 1; c.leaderId = toUserId; c.currentTrackingStatus = 16; c.assignAt = dayjs().toISOString(); });
    return delay(rows);
  },
  toOpportunity: (id: number, input?: { name?: string; estimatedAmount?: string }) => {
    const c = customers.find((x) => x.customerId === id);
    if (c) {
      if (c.category <= 2) markConverted(c); // 首次从线索侧转化时留痕
      c.category = 3; c.currentTrackingStatus = 17; c.opportunityCount = (c.opportunityCount ?? 0) + 1;
    }
    const oid = opportunities.reduce((m, o) => Math.max(m, o.opportunityId), 0) + 1;
    const code = `OPP${dayjs().format('YYYY')}${String(oid).padStart(4, '0')}`;
    opportunities.unshift({
      opportunityId: oid, code, name: input?.name ?? `${c?.name ?? ''} 商机`, customerId: id, customerName: c?.name,
      estimatedAmount: input?.estimatedAmount ?? '0', status: 30, allStayTime: 0, depId: 2, renewType: 1, additional: 1,
      approval: -1, active: 1, leaderId: c?.leaderId, createDate: dayjs().toISOString(),
    } as any);
    return delay({ opportunityId: oid, code });
  },
};

// ---------- 客户洞察 Mock：由内存数据按规则生成（与后端未配置模型时口径一致） ----------
const insightStore = new Map<number, import('@/types').CustomerInsightReport>();
const tName = (id?: number | null) => MOCK_TERMS.find((t) => t.termId === id)?.name ?? '';
let mockReportId = 8000;

function buildMockInsight(customerId: number): import('@/types').CustomerInsightReport | null {
  const c = customers.find((x) => x.customerId === customerId);
  if (!c) return null;
  const num = (v: unknown) => Number(v ?? 0) || 0;
  const myOpps = opportunities.filter((o) => o.customerId === customerId && o.active === 1);
  const myTrk = trackings.filter((t) => t.customerId === customerId).sort((a, b) => b.createDate.localeCompare(a.createDate)).slice(0, 15);
  const myCts = contracts.filter((x) => x.customerId === customerId && x.status !== 5);
  const contractAmount = myCts.reduce((s, x) => s + num(x.amount), 0);
  const receivedAmount = myCts.reduce((s, x) => s + num(x.receivedAmount), 0);
  const outstandingAmount = myCts.reduce((s, x) => s + num(x.outstandingAmount), 0);
  const receivedRate = contractAmount > 0 ? Math.round((receivedAmount / contractAmount) * 10000) / 100 : 0;
  const leader = userName(c.leaderId) ?? '未分配';
  const lastAt = c.trackingUpdateDate ? dayjs(c.trackingUpdateDate).format('YYYY-MM-DD') : null;
  const idle = c.trackingUpdateDate ? dayjs().diff(dayjs(c.trackingUpdateDate), 'day') : null;

  const facts: import('@/types').CustomerFacts = {
    customer: {
      name: c.name, level: tName(c.level) || '未分级', industry: c.industry ?? '', groupName: c.groupName ?? '',
      leader, source: tName(c.source), createdAt: dayjs(c.createDate).format('YYYY-MM-DD'),
      trackingNum: num(c.trackingNum), lastTrackingAt: lastAt,
    },
    contacts: contacts.filter((x) => x.customerId === customerId).slice(0, 10)
      .map((x) => ({ name: x.name, position: x.position ?? '', isKey: x.type === 1 })),
    opportunities: myOpps.map((o) => ({
      name: o.name, amount: num(o.estimatedAmount), stage: tName(o.status) || '未知阶段', stayDays: num(o.allStayTime),
      leader: userName(o.leaderId) ?? '未分配', expectedDate: o.expiryDate ?? null, mainProduct: (o as any).mainProduct ?? '', competitor: (o as any).competitor ?? '',
    })),
    trackings: myTrk.map((t) => ({
      at: dayjs(t.createDate).format('YYYY-MM-DD'), way: tName(t.trackingType), by: userName(t.createBy) ?? '',
      comment: (t.comment ?? '').slice(0, 200), nextAt: t.nextTrackingDate ? dayjs(t.nextTrackingDate).format('YYYY-MM-DD') : null,
    })),
    contracts: myCts.map((x) => ({
      name: x.name, amount: num(x.amount), status: ['初始', '已签约', '执行中', '已完毕', '已终止', '已作废'][x.status ?? 0] ?? '',
      receivedAmount: num(x.receivedAmount), outstandingAmount: num(x.outstandingAmount), receivedRate: num(x.receivedRate),
      invoiceAmount: num(x.invoiceAmount), leader: userName(x.leaderId) ?? '未分配', beginDate: x.beginDate ?? null, expiredDate: x.expiredDate ?? null,
    })),
    overduePayments: payments
      .filter((p) => p.customerId === customerId && [1, 2, 4].includes(p.status) && p.planDate && dayjs(p.planDate).isBefore(dayjs()) && num(p.outstandingAmount) > 0)
      .slice(0, 10)
      .map((p) => ({
        contractName: contracts.find((x) => x.contractId === p.contractId)?.name ?? '',
        planDate: dayjs(p.planDate).format('YYYY-MM-DD'), outstanding: num(p.outstandingAmount),
      })),
    totals: {
      oppCount: myOpps.length, oppAmount: myOpps.reduce((s, o) => s + num(o.estimatedAmount), 0),
      contractCount: myCts.length, contractAmount, receivedAmount, outstandingAmount,
      invoiceAmount: myCts.reduce((s, x) => s + num(x.invoiceAmount), 0), receivedRate,
    },
  };

  const risks: string[] = [];
  if (facts.overduePayments.length > 0)
    risks.push(`${facts.overduePayments.length} 笔回款计划已逾期，合计 ¥${facts.overduePayments.reduce((s, p) => s + p.outstanding, 0).toLocaleString()}`);
  if (idle != null && idle > 14) risks.push(`已 ${idle} 天无跟进记录，客户关系存在冷却风险`);
  for (const o of facts.opportunities) if (o.stayDays > 21) risks.push(`商机「${o.name}」在${o.stage}停留 ${o.stayDays} 天，推进偏慢`);
  if (facts.totals.contractCount > 0 && receivedRate < 60) risks.push(`整体回款率 ${receivedRate}%，低于健康水位（60%）`);
  if (risks.length === 0) risks.push('暂无明显风险信号');

  let score = 60;
  if (idle != null && idle <= 7) score += 10; else if (idle == null || idle > 14) score -= 15;
  if (facts.totals.oppCount > 0) score += 10;
  if (facts.totals.contractCount > 0) score += receivedRate >= 80 ? 15 : receivedRate >= 60 ? 5 : -10;
  if (facts.overduePayments.length > 0) score -= 10;

  const insight: import('@/types').CustomerInsight = {
    summary:
      `${facts.customer.name}（${facts.customer.level}${facts.customer.industry ? ' · ' + facts.customer.industry : ''}）当前由 ${leader} 负责，` +
      `在途商机 ${facts.totals.oppCount} 个（预计 ¥${facts.totals.oppAmount.toLocaleString()}），历史合同 ${facts.totals.contractCount} 份共 ¥${contractAmount.toLocaleString()}，` +
      `已回款 ¥${receivedAmount.toLocaleString()}（${receivedRate}%）` + (outstandingAmount > 0 ? `，未回款 ¥${outstandingAmount.toLocaleString()}。` : '。'),
    healthScore: Math.max(5, Math.min(95, score)),
    owners: [
      { role: '客户负责人', name: leader, note: `负责客户整体关系，累计跟进 ${facts.customer.trackingNum} 次` },
      ...facts.opportunities.slice(0, 3).map((o) => ({ role: '商机负责人', name: o.leader, note: `「${o.name}」处于${o.stage}，预计 ¥${o.amount.toLocaleString()}，已停留 ${o.stayDays} 天` })),
      ...facts.contracts.filter((x) => x.outstandingAmount > 0).slice(0, 2).map((x) => ({ role: '合同负责人', name: x.leader, note: `「${x.name}」未回款 ¥${x.outstandingAmount.toLocaleString()}（回款率 ${x.receivedRate}%）` })),
      ...facts.contacts.filter((x) => x.isKey).slice(0, 2).map((x) => ({ role: '客户主联系人', name: x.name, note: x.position || '客户侧关键角色' })),
    ],
    progress: {
      assessment:
        idle == null ? '尚无跟进记录，需要尽快建立首次触达。'
        : idle <= 7 ? `跟进节奏健康（最近 ${idle} 天内有动作）。`
        : idle <= 14 ? `跟进节奏一般（${idle} 天前最后一次），建议本周内安排一次触达。`
        : `跟进已断档 ${idle} 天，需要立即恢复联系。`,
      highlights: facts.trackings.slice(0, 5).map((t) => `${t.at} ${t.by}（${t.way || '跟进'}）：${t.comment || '—'}`),
    },
    finance: {
      assessment:
        facts.totals.contractCount === 0 ? '尚无成交合同，处于商机培育期。'
        : `历史合同 ${facts.totals.contractCount} 份共 ¥${contractAmount.toLocaleString()}，整体回款率 ${receivedRate}%` +
          (facts.overduePayments.length > 0 ? '，存在逾期回款需重点催收。' : '，回款进度正常。'),
      highlights: facts.contracts.slice(0, 5).map((x) =>
        `「${x.name}」¥${x.amount.toLocaleString()}（${x.status}）：已回款 ¥${x.receivedAmount.toLocaleString()}（${x.receivedRate}%）` +
        (x.outstandingAmount > 0 ? `，未回款 ¥${x.outstandingAmount.toLocaleString()}` : '')),
    },
    risks,
    nextSteps: (() => {
      const steps = [
        ...(facts.overduePayments.length > 0 ? ['安排合同负责人本周内跟进逾期回款'] : []),
        ...(idle != null && idle > 14 ? [`${leader} 3 日内恢复联系，更新客户近况`] : []),
        ...facts.opportunities.filter((o) => o.stayDays > 21).slice(0, 2).map((o) => `${o.leader} 与客户确认「${o.name}」卡点，制定阶段推进计划`),
      ].slice(0, 5);
      return steps.length > 0 ? steps : ['保持当前跟进节奏，按计划推进在途商机'];
    })(),
  };

  return { reportId: ++mockReportId, createdAt: dayjs().toISOString(), facts, insight, generatedBy: 'rules' };
}

// ---------- 客户 §6.3 ----------
export const customersApi = {
  list: (p: ListParams) => {
    const tab = p.tab ?? 'all';
    let src = customers.filter((c) => c.category === 3 || c.category === 4);
    if (tab === 'sea') src = src.filter((c) => c.category === 4);
    if (tab === 'mine') src = src.filter((c) => c.category === 3);
    if (tab === 'deal') src = src.filter((c) => (c.currentTrackingStatus ?? 0) >= 12);
    return paginate(src, p, ['name', 'industry', 'phoneName']);
  },
  get: (id: number) => delay(customers.find((c) => c.customerId === id)),
  contacts: (customerId: number) => delay(contacts.filter((c) => c.customerId === customerId)),
  createContact: (customerId: number, input: any) => {
    if (input.type === 1) contacts.forEach((c) => { if (c.customerId === customerId && c.type === 1) c.type = 2; });
    const row: any = { contactId: nextId(contacts, 'contactId'), customerId, type: 2, ...input };
    contacts.push(row);
    return delay(row);
  },
  updateContact: (contactId: number, input: any) => {
    const c = contacts.find((x) => x.contactId === contactId) as any;
    if (c) {
      if (input.type === 1) contacts.forEach((x) => { if (x.customerId === c.customerId && x.type === 1 && x.contactId !== contactId) x.type = 2; });
      Object.assign(c, input);
    }
    return delay(c);
  },
  removeContact: (contactId: number) => {
    const i = contacts.findIndex((x) => x.contactId === contactId);
    if (i >= 0) contacts.splice(i, 1);
    return delay({ ok: true });
  },
  trackings: (customerId: number) =>
    delay(
      trackings
        .filter((t) => t.customerId === customerId)
        .sort((a, b) => b.createDate.localeCompare(a.createDate)),
    ),
  activities: (customerId: number) => {
    const ev: { kind: string; title: string; summary: string; operator?: string; date: string }[] = [];
    const c = customers.find((x) => x.customerId === customerId);
    if (c) ev.push({ kind: 'customer', title: '新增客户', summary: c.name, operator: userName(c.leaderId), date: c.createDate ?? dayjs().toISOString() });
    if (c?.convertedAt)
      ev.push({
        kind: 'lead', title: '线索转化',
        summary: `由线索转化而来${c.leadSnapshot?.sourceName ? `（来源：${c.leadSnapshot.sourceName}）` : ''}`,
        operator: userName(c.convertedBy), date: c.convertedAt,
      });
    for (const t of trackings.filter((x) => x.customerId === customerId))
      ev.push({ kind: 'tracking', title: '跟进记录', summary: (t.comment ?? '').slice(0, 50), operator: userName(t.createBy), date: t.createDate });
    for (const o of opportunities.filter((x) => x.customerId === customerId))
      ev.push({ kind: 'opportunity', title: '新增商机', summary: `${o.name} · 预计 ¥${o.estimatedAmount}`, operator: userName(o.leaderId), date: o.createDate ?? dayjs().toISOString() });
    for (const qq of quotations.filter((x) => x.customerId === customerId))
      ev.push({ kind: 'quotation', title: '新增报价', summary: `${qq.code} · ¥${qq.amount}`, operator: userName((qq as any).bidderId), date: (qq as any).quoteDate ?? dayjs().toISOString() });
    for (const ct of contracts.filter((x) => x.customerId === customerId))
      ev.push({ kind: 'contract', title: '新增合同', summary: `${ct.code} · ¥${ct.amount}`, operator: userName(ct.leaderId), date: dayjs().toISOString() });
    for (const iv of invoices.filter((x) => x.customerId === customerId))
      ev.push({ kind: 'invoice', title: '开票', summary: `${iv.code ?? '发票'} · ¥${iv.amount}`, date: iv.createDate ?? dayjs().toISOString() });
    ev.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    return delay(ev.slice(0, 100));
  },
  createTracking: (customerId: number, input: { comment: string; trackingType?: number; nextTrackingDate?: string; priorityLevel?: number; attachments?: any[] }) => {
    const row: any = {
      trackingId: nextId(trackings, 'trackingId'), customerId, businessType: 1, trackingType: input.trackingType,
      comment: input.comment, nextTrackingDate: input.nextTrackingDate, priorityLevel: input.priorityLevel ?? 1,
      attachments: input.attachments ?? [],
      createBy: 1, createDate: dayjs().toISOString(),
    };
    trackings.unshift(row);
    const c = customers.find((x) => x.customerId === customerId);
    if (c) { c.trackingNum = (c.trackingNum ?? 0) + 1; c.trackingUpdateDate = row.createDate; if (input.nextTrackingDate) c.nextTrackingDate = input.nextTrackingDate; }
    return delay(row);
  },
  // 工商数据必须来自真实企查查 API，Mock 模式不捏造 → enabled:false（前端隐藏工商候选段）
  companySearch: (_kw: string): Promise<{ enabled: boolean; list: { keyNo: string; name: string; creditCode?: string; operName?: string; status?: string }[] }> =>
    delay({ enabled: false, list: [] }),
  lastQuotePrices: (customerId: number) => {
    const qids = new Set(quotations.filter((q) => q.customerId === customerId).map((q) => q.quotationId));
    const byProduct: Record<number, any> = {};
    for (const qp of quotationProducts) {
      if (!qids.has(qp.quotationId)) continue;
      if (!byProduct[qp.productId]) {
        const q = quotations.find((x) => x.quotationId === qp.quotationId);
        byProduct[qp.productId] = { productId: qp.productId, unitPrice: qp.discountPrice, discountRate: qp.discountRate, code: q?.code, quoteDate: q?.quoteDate };
      }
    }
    return delay(Object.values(byProduct));
  },
  transfer: (_customerId: number, _toUserId: number, _reason: string) => delay({ status: 2 }),
  update: (id: number, input: Partial<Customer>) => {
    const c = customers.find((x) => x.customerId === id);
    if (!c) return Promise.reject(new Error('客户不存在'));
    const { customerId: _cid, leaderId: _lid, category: _cat, active: _act, ...rest } = input;
    Object.assign(c, Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined)));
    return delay({ ...c });
  },
  // 客户洞察（Mock 无真实模型 → 规则版，generatedBy:'rules'；真实 AI 需后端配置模型）
  insight: (customerId: number) => delay(insightStore.get(customerId) ?? null),
  generateInsight: (customerId: number) => {
    const r = buildMockInsight(customerId);
    if (r) insightStore.set(customerId, r);
    return delay(r as NonNullable<typeof r>, 600);
  },
  create: (input: Partial<Customer>) => {
    const row: Customer = {
      customerId: nextId(customers, 'customerId'),
      organizationId: 1,
      category: 3, // 个人客户
      currentTrackingStatus: 8, // 初访
      trackingNum: 0,
      opportunityCount: 0,
      approval: -1,
      active: 1,
      createDate: dayjs().toISOString(),
      trackingUpdateDate: dayjs().toISOString(),
      labels: [],
      ...input,
      name: input.name ?? '未命名客户',
    } as Customer;
    customers.unshift(row);
    return delay(row);
  },
};

// ---------- 商机 §6.4 ----------
export const opportunitiesApi = {
  list: (p: ListParams) => paginate(opportunities, p, ['name', 'code', 'customerName']),
  get: (id: number) => delay(opportunities.find((o) => o.opportunityId === id)),
  updateStage: (id: number, status: number) => {
    const o = opportunities.find((x) => x.opportunityId === id);
    if (o) o.status = status;
    return delay(o);
  },
  create: (input: Partial<Opportunity> & { productIds?: number[] }) => {
    const id = nextId(opportunities, 'opportunityId');
    const cust = customers.find((c) => c.customerId === input.customerId);
    // 涉及产品（多选）→ main_product 存名称
    if (input.productIds?.length && !input.mainProduct) {
      input = { ...input, mainProduct: products.filter((p) => input.productIds!.includes(p.productId)).map((p) => p.name).join(' / ') };
    }
    const row: Opportunity = {
      opportunityId: id,
      code: `OPP${dayjs().format('YYYY')}${String(id).padStart(4, '0')}`,
      estimatedAmount: '0',
      status: 30,
      allStayTime: 0,
      depId: cust?.leaderId ? 2 : 2,
      renewType: 1,
      additional: 1,
      approval: -1,
      active: 1,
      createDate: dayjs().toISOString(),
      statusExpiryDate: dayjs().add(14, 'day').toISOString(),
      ...input,
      name: input.name ?? '未命名商机',
      customerId: input.customerId ?? 0,
      customerName: cust?.name,
    } as Opportunity;
    opportunities.unshift(row);
    if (cust) cust.opportunityCount = (cust.opportunityCount ?? 0) + 1;
    return delay(row);
  },
};

// ---------- 报价 §6.5 ----------
const mockDiscountPolicy = [
  { levelTermId: 25, maxDiscount: '0.85' },
  { levelTermId: 26, maxDiscount: '0.90' },
  { levelTermId: 27, maxDiscount: '0.95' },
];

// Mock 报价行持久化（草稿回读 + 接口清单 apiItems）
function writeMockQuoteLines(quotationId: number, lines: any[]) {
  for (let i = quotationProducts.length - 1; i >= 0; i--) {
    if (quotationProducts[i].quotationId === quotationId) quotationProducts.splice(i, 1);
  }
  let qpid = quotationProducts.reduce((m, x) => Math.max(m, x.id), 0);
  for (const l of lines) {
    const p = products.find((x) => x.productId === l.productId);
    quotationProducts.push({
      id: ++qpid, quotationId, productId: l.productId, productName: p?.name ?? '', spec: l.spec,
      quantity: l.quantity, price: l.price, discountRate: l.discountRate,
      discountPrice: (Number(l.price) * Number(l.discountRate)).toFixed(2),
      totalPrice: l.pricingMode === 'usage' ? '0.00' : (Number(l.price) * Number(l.discountRate) * l.quantity).toFixed(2),
      cost: l.cost, gift: l.gift ?? false, pricingMode: l.pricingMode ?? 'qty', apiItems: l.apiItems,
    } as any);
  }
}

export const quotationsApi = {
  list: (p: ListParams) => paginate(quotations, p, ['name', 'code', 'customerName']),
  get: (id: number) => delay(quotations.find((q) => q.quotationId === id)),
  products: (quotationId: number) => delay(quotationProducts.filter((qp) => qp.quotationId === quotationId)),
  discountPolicy: () => delay(mockDiscountPolicy),
  updateDiscountPolicy: (policies: { levelTermId: number; maxDiscount: string }[]) => {
    for (const p of policies) {
      const ex = mockDiscountPolicy.find((x) => x.levelTermId === p.levelTermId);
      if (ex) ex.maxDiscount = p.maxDiscount;
      else mockDiscountPolicy.push({ ...p });
    }
    return delay(mockDiscountPolicy);
  },
  create: (input: any) => {
    const id = quotations.reduce((m, q) => Math.max(m, q.quotationId), 0) + 1;
    const cust = customers.find((c) => c.customerId === input.customerId);
    const total = (input.lines ?? []).reduce((s: number, l: any) => s + (l.pricingMode === 'usage' ? 0 : Number(l.price) * Number(l.discountRate) * l.quantity), 0);
    const cost = (input.lines ?? []).reduce((s: number, l: any) => s + (l.pricingMode === 'usage' ? 0 : Number(l.cost) * l.quantity), 0);
    const amount = total * Number(input.orderDiscountRate ?? 1) + Number(input.otherCharges ?? 0) - Number(input.discount ?? 0);
    const row: any = {
      quotationId: id, code: `QT${new Date().getFullYear()}${String(id).padStart(4, '0')}`, version: 1,
      name: input.name, customerId: input.customerId, customerName: cust?.name, opportunityId: input.opportunityId,
      quoteDate: input.quoteDate, expiredDate: input.expiredDate, contractTerm: input.contractTerm,
      serviceYears: input.serviceYears, remark: input.remark,
      currency: input.currency ?? 'CNY', status: 0, quoteType: input.quoteType ?? 2,
      total: total.toFixed(2), orderDiscountRate: input.orderDiscountRate ?? '1.00', otherCharges: input.otherCharges ?? '0', otherChargesItems: input.otherChargesItems ?? [],
      discount: input.discount ?? '0', amount: amount.toFixed(2), cost: cost.toFixed(2),
      grossProfit: (amount - cost).toFixed(2), grossProfitRate: amount > 0 ? (((amount - cost) / amount) * 100).toFixed(1) : '0',
      comDiscountRate: total > 0 ? ((amount / total) * 100).toFixed(1) : '0', approval: -1, customerConfirmed: false,
    };
    quotations.unshift(row);
    writeMockQuoteLines(id, input.lines ?? []);
    return delay(row);
  },
  update: (id: number, input: any) => {
    const q = quotations.find((x) => x.quotationId === id) as any;
    if (q) Object.assign(q, { name: input.name, quoteType: input.quoteType, orderDiscountRate: input.orderDiscountRate, otherCharges: input.otherCharges, otherChargesItems: input.otherChargesItems, discount: input.discount, opportunityId: input.opportunityId, quoteDate: input.quoteDate, expiredDate: input.expiredDate, contractTerm: input.contractTerm, serviceYears: input.serviceYears, remark: input.remark });
    writeMockQuoteLines(id, input.lines ?? []);
    return delay(q);
  },
  confirm: (id: number) => {
    const q = quotations.find((x) => x.quotationId === id) as any;
    if (q) { q.customerConfirmed = true; q.status = 1; }
    return delay(q);
  },
  toContract: (id: number, input: { signCustomerId: number; beginDate?: string }) => {
    const q = quotations.find((x) => x.quotationId === id) as any;
    const sign = customers.find((c) => c.customerId === input.signCustomerId);
    const cid = contracts.reduce((m, c) => Math.max(m, c.contractId), 0) + 1;
    const code = `HT${new Date().getFullYear()}${String(cid).padStart(4, '0')}`;
    contracts.unshift({
      contractId: cid, code, name: `${sign?.name ?? ''} 服务合同`, customerId: input.signCustomerId,
      customerName: sign?.name, quotationId: id, contractType: 1, renewType: 1,
      beginDate: input.beginDate, currency: 'CNY', status: 1, amount: q?.amount ?? '0',
      receivedAmount: '0.00', outstandingAmount: q?.amount ?? '0', badDebtsAmount: '0.00', receivedRate: '0',
      invoiceAmount: '0.00', notInvoiceAmount: q?.amount ?? '0', grossProfit: q?.grossProfit ?? '0',
      cashProfit: '0.00', approval: -1, changeApproval: -1, archive: false, leaderId: 1,
    } as any);
    if (q) q.status = 3;
    return delay({ contractId: cid, code, signCustomerId: input.signCustomerId });
  },
};

// ---------- 合同 §6.6 ----------
// 合同法务审核留痕（Mock 内存）
const contractReviews: import('@/types').ContractReview[] = [];
let reviewSeq = 9000;
function pushReview(contractId: number, action: 1 | 2 | 3 | 4, comment: string): import('@/types').ContractReview {
  const row: import('@/types').ContractReview = {
    reviewId: ++reviewSeq, contractId, action, comment, attachments: [],
    createBy: 1, createByName: userName(1) ?? '我', createDate: dayjs().toISOString(),
  };
  contractReviews.push(row);
  return row;
}

export const contractsApi = {
  list: (p: ListParams) => {
    const tab = p.tab ?? 'all';
    let src = contracts;
    if (tab === 'archived') src = src.filter((c) => c.archive);
    if (tab === 'renew') src = src.filter((c) => c.renewType === 2);
    if (tab === 'review') src = src.filter((c) => (c.reviewStatus ?? 0) === 1);
    return paginate(src, p, ['name', 'code', 'customerName']);
  },
  get: (id: number) => delay(contracts.find((c) => c.contractId === id)),
  // ---- 法务审核 + 协同（内存留痕，与后端同状态机） ----
  reviews: (contractId: number) => delay(contractReviews.filter((r) => r.contractId === contractId)),
  submitReview: (contractId: number, comment?: string) => {
    const ct = contracts.find((c) => c.contractId === contractId);
    if (!ct) return Promise.reject(new Error('合同不存在'));
    if ((ct.reviewStatus ?? 0) === 1) return Promise.reject(new Error('已在法务审核中，请勿重复提交'));
    if (ct.reviewStatus === 2) return Promise.reject(new Error('该合同已审核通过'));
    ct.reviewStatus = 1;
    pushReview(contractId, 1, comment || '提交法务审核');
    return delay({ reviewStatus: 1 });
  },
  review: (contractId: number, pass: boolean, comment: string) => {
    const ct = contracts.find((c) => c.contractId === contractId);
    if (!ct) return Promise.reject(new Error('合同不存在'));
    if ((ct.reviewStatus ?? 0) !== 1) return Promise.reject(new Error('当前状态不能审核'));
    if (!pass && !comment.trim()) return Promise.reject(new Error('驳回必须填写审核意见，便于销售修改'));
    ct.reviewStatus = pass ? 2 : 3;
    pushReview(contractId, pass ? 2 : 3, comment || (pass ? '审核通过' : ''));
    return delay({ reviewStatus: ct.reviewStatus });
  },
  reviewComment: (contractId: number, comment: string) => delay(pushReview(contractId, 4, comment)),
  payments: (contractId: number) => delay(payments.filter((p) => p.contractId === contractId)),
  paymentSheets: (contractId: number) => delay(paymentSheets.filter((s) => s.contractId === contractId)),
  invoices: (contractId: number) => delay(invoices.filter((i) => i.contractId === contractId)),
  createInvoice: (contractId: number, input: { titleCustomerId?: number; amount: string; invoiceTypeTerm?: number }) => {
    const ct = contracts.find((c) => c.contractId === contractId) as any;
    if ((ct?.reviewStatus ?? 0) !== 2) return Promise.reject(new Error('合同尚未通过法务审核，暂不能开票（请在合同详情提交法务审核）'));
    const title = customers.find((c) => c.customerId === (input.titleCustomerId ?? ct?.customerId));
    const iid = invoices.reduce((m, i) => Math.max(m, i.invoiceId), 0) + 1;
    const noTax = (Number(input.amount) / 1.06).toFixed(2);
    const row: any = {
      invoiceId: iid, code: `FP${new Date().getFullYear()}${String(iid).padStart(5, '0')}`,
      contractId, customerId: title?.customerId, customerName: title?.name,
      invoiceType: input.invoiceTypeTerm ?? 130, redBlueFlag: 1, invoiceAttributes: 2,
      amount: input.amount, taxAmount: (Number(input.amount) - Number(noTax)).toFixed(2), noTaxAmount: noTax,
      status: 1, approval: -1, invalidApproval: -1, createDate: dayjs().toISOString(),
    };
    invoices.unshift(row);
    if (ct) { ct.invoiceAmount = (Number(ct.invoiceAmount) + Number(input.amount)).toFixed(2); ct.notInvoiceAmount = (Number(ct.amount) - Number(ct.invoiceAmount)).toFixed(2); }
    return delay(row);
  },
  create: (input: Partial<Contract>) => {
    const id = nextId(contracts, 'contractId');
    const cust = customers.find((c) => c.customerId === input.customerId);
    const amount = input.amount ?? '0';
    const row: Contract = {
      contractId: id,
      code: `HT${dayjs().format('YYYY')}${String(id).padStart(4, '0')}`,
      contractType: 1,
      renewType: 1,
      currency: 'CNY',
      status: 1, // 签约
      receivedAmount: '0.00',
      outstandingAmount: amount,
      badDebtsAmount: '0.00',
      receivedRate: '0',
      invoiceAmount: '0.00',
      notInvoiceAmount: amount,
      grossProfit: '0.00',
      cashProfit: '0.00',
      approval: -1,
      changeApproval: -1,
      archive: false,
      labels: [],
      ...input,
      name: input.name ?? '未命名合同',
      customerId: input.customerId ?? 0,
      customerName: cust?.name,
      amount,
    } as Contract;
    contracts.unshift(row);
    return delay(row);
  },
};

// ---------- 资金 §6.7 ----------
export const paymentsApi = {
  list: (p: ListParams) => paginate(payments, p, ['contractCode', 'customerName']),
  sheets: (p: ListParams) => paginate(paymentSheets, p, []),
};
export const invoicesApi = {
  list: (p: ListParams) => paginate(invoices, p, ['code', 'customerName']),
};
export const preCreditsApi = {
  list: (p: ListParams) => paginate(preCredits, p, ['customerName']),
};

// ---------- 产品 §6.8 ----------
export const productsApi = {
  list: (p: ListParams) => paginate(products, p, ['name', 'code']),
  all: () => delay(products),
  tiers: (id: number) => delay(productTiers[id] ?? []),
};

// ---------- 待办 §7 ----------
export const tasksApi = {
  list: (p: ListParams) => {
    const tab = p.tab ?? 'mine';
    let src = backLogs;
    if (tab === 'mine') src = src.filter((b) => b.userId === 1);
    return paginate(src, p, ['businessName']);
  },
  complete: (id: number) => {
    const b = backLogs.find((x) => x.backLogId === id);
    if (b) b.status = 1;
    return delay(b);
  },
  counts: () => {
    const map: Record<number, number> = {};
    for (const b of backLogs) {
      if (b.status === 0) map[b.businessType] = (map[b.businessType] ?? 0) + 1;
    }
    return delay(map);
  },
};

// ---------- 目标 §6.9 ----------
export const targetsApi = {
  list: () => delay(targets),
};

// ---------- AI §8 ----------
export const aiApi = {
  generate: (businessType: 0 | 1 | 2 | 3, businessId: number, stageId?: number) =>
    delay(buildAiReport(businessType, businessId, stageId), 1400),
  // Mock 对话助手：规则版意图解析（真实自然语言操作需后端 + 配置 AI 模型）
  chat: async (messages: { role: 'user' | 'assistant'; content: string }[]): Promise<import('@/types').AiChatResponse> => {
    const text = messages[messages.length - 1]?.content?.trim() ?? '';
    const actions: import('@/types').AiChatAction[] = [];
    const findCust = (kw: string) => customers.find((c) => (c.category === 3 || c.category === 4) && c.active === 1 && c.name.includes(kw.trim()));
    let reply = '';
    let m: RegExpMatchArray | null;

    if ((m = text.match(/(?:创建|新建|添加).{0,2}客户[：:，,\s]*([^\s，。,：:]{2,30})/))) {
      const name = m[1];
      if (customers.some((c) => c.name === name && c.active === 1)) {
        reply = `客户「${name}」已存在，无需重复创建。`;
      } else {
        const created = await customersApi.create({ name, level: 26, source: 4, leaderId: 1 });
        actions.push({ type: 'customer', label: `已创建客户「${name}」`, link: `/customers/${created.customerId}` });
        reply = `已创建客户「${name}」（B 级 · 来源：陌拜），负责人为你。可以继续说「给${name}创建商机 预计50万」。`;
      }
    } else if ((m = text.match(/(?:给|为)\s*(.{2,30}?)\s*(?:创建|新建|建).{0,2}商机.*?([\d.]+)\s*(万|元)?/))) {
      const cust = findCust(m[1]);
      if (!cust) reply = `没找到客户「${m[1].trim()}」，请先创建：「创建客户 ${m[1].trim()}」。`;
      else {
        const amount = String(Number(m[2]) * (m[3] === '万' ? 10000 : 1));
        const r = await leadsApi.toOpportunity(cust.customerId, { name: `${cust.name} 商机`, estimatedAmount: amount });
        actions.push({ type: 'opportunity', label: `已创建商机（¥${Number(amount).toLocaleString()}）`, link: `/opportunities/${r.opportunityId}` });
        reply = `已为「${cust.name}」创建商机，预计成交 ¥${Number(amount).toLocaleString()}，初始阶段：需求沟通。`;
      }
    } else if ((m = text.match(/(?:给|为)\s*(.{2,30}?)\s*(?:写|加|添加|记).{0,2}跟进[：:，,\s]*(.+)/))) {
      const cust = findCust(m[1]);
      if (!cust) reply = `没找到客户「${m[1].trim()}」。`;
      else {
        await customersApi.createTracking(cust.customerId, { comment: m[2].trim() });
        actions.push({ type: 'tracking', label: `已为「${cust.name}」写跟进`, link: `/customers/${cust.customerId}` });
        reply = `已为「${cust.name}」记录跟进：${m[2].trim()}`;
      }
    } else {
      reply =
        'Mock 模式为规则版助手，仅支持固定句式：\n· 创建客户 XX科技有限公司\n· 给XX创建商机 预计50万\n· 给XX写跟进 今天电话沟通了需求\n\n部署后端并在「设置→集成配置」配置 AI 模型后，可用自然语言完成建客户/商机/报价单等全部操作。';
    }
    return delay({ reply, actions, generatedBy: 'rules' as const }, 500);
  },
};

// ---------- 成员搜索（选人控件通用） ----------
export const usersApi = {
  search: (kw?: string) =>
    delay(
      MOCK_USERS.filter((u) => !kw || u.name.includes(kw))
        .slice(0, 20)
        .map((u) => ({ userId: u.userId, name: u.name, depName: u.depName ?? '' })),
      150,
    ),
};

// ---------- 工作台聚合（Mock：由内存数据计算，与后端 /dashboard 同构） ----------
export const dashboardApi = {
  data: (scope: string, time: string): Promise<import('@/types').DashboardData> => {
    const unit = (['day', 'week', 'month', 'quarter'].includes(time) ? time : 'month') as 'day' | 'week' | 'month' | 'quarter';
    const start = dayjs().startOf(unit);
    const prevStart = unit === 'quarter' ? start.subtract(3, 'month') : start.subtract(1, unit);
    const deptIds = MOCK_USERS.filter((u) => u.depId === CURRENT_USER.depId).map((u) => u.userId);
    const inScope = (leaderId?: number) =>
      scope === 'company' ? true : scope === 'dept' ? deptIds.includes(leaderId ?? -1) : leaderId === CURRENT_USER.userId;
    const inWin = (d: string | undefined, from: ReturnType<typeof dayjs>, to?: ReturnType<typeof dayjs>) =>
      !!d && dayjs(d).isAfter(from) && (!to || dayjs(d).isBefore(to));

    const fc = customers.filter((c) => c.active === 1 && inScope(c.leaderId));
    const isLead = (c: Customer) => c.category <= 2 || c.currentTrackingStatus === 17;
    const newLeads = fc.filter((c) => isLead(c) && inWin(c.createDate, start)).length;
    const converted = fc.filter((c) => c.currentTrackingStatus === 17 && inWin(c.createDate, start)).length;
    const fo = opportunities.filter((o) => o.active === 1 && inScope(o.leaderId));
    const fct = contracts.filter((c) => c.status !== 5 && inScope(c.leaderId));

    const byStage = new Map<number, number>();
    fo.forEach((o) => byStage.set(o.status, (byStage.get(o.status) ?? 0) + 1));

    return delay({
      kpis: {
        newLeads,
        prevLeads: fc.filter((c) => isLead(c) && inWin(c.createDate, prevStart, start)).length,
        newCustomers: fc.filter((c) => c.category >= 3 && inWin(c.createDate, start)).length,
        prevCustomers: fc.filter((c) => c.category >= 3 && inWin(c.createDate, prevStart, start)).length,
        oppCount: fo.length,
        contractCount: fct.length,
        contractAmount: fct.reduce((s, c) => s + Number(c.amount), 0),
        receivedAmount: fct.reduce((s, c) => s + Number(c.receivedAmount), 0),
        outstandingAmount: fct.reduce((s, c) => s + Number(c.outstandingAmount), 0),
      },
      funnel: [...byStage.entries()].map(([termId, count]) => ({ termId, count })),
      conversion: { newLeads, converted, rate: newLeads > 0 ? Math.round((converted / newLeads) * 1000) / 10 : 0 },
      pk: MOCK_USERS.map((u) => ({
        name: u.name,
        amount: contracts.filter((c) => c.status !== 5 && c.leaderId === u.userId).reduce((s, c) => s + Number(c.amount), 0),
      })).sort((a, b) => b.amount - a.amount).slice(0, 6),
      recentTrackings: trackings
        .slice()
        .sort((a, b) => b.createDate.localeCompare(a.createDate))
        .slice(0, 6)
        .map((t) => ({
          by: userName(t.createBy) ?? '',
          customerId: t.customerId,
          customerName: customers.find((c) => c.customerId === t.customerId)?.name ?? '',
          comment: t.comment ?? '',
          priorityLevel: t.priorityLevel ?? 1,
          at: t.createDate,
        })),
    });
  },
};

// ---------- 全局搜索（CommandPalette） ----------
export interface SearchHit {
  group: '客户' | '商机' | '合同' | '联系人';
  id: number;
  title: string;
  subtitle: string;
  path: string;
}
export const searchApi = {
  query: (kw: string): Promise<SearchHit[]> => {
    if (!kw.trim()) return delay([], 80);
    const k = kw.toLowerCase();
    const hits: SearchHit[] = [];
    customers
      .filter((c) => c.name.toLowerCase().includes(k))
      .slice(0, 5)
      .forEach((c) =>
        hits.push({
          group: c.category >= 3 ? '客户' : '客户',
          id: c.customerId,
          title: c.name,
          subtitle: c.industry ?? '',
          path: c.category >= 3 ? `/customers/${c.customerId}` : `/leads/${c.customerId}`,
        }),
      );
    opportunities
      .filter((o) => o.name.toLowerCase().includes(k) || o.code.toLowerCase().includes(k))
      .slice(0, 5)
      .forEach((o) =>
        hits.push({ group: '商机', id: o.opportunityId, title: o.name, subtitle: o.code, path: `/opportunities/${o.opportunityId}` }),
      );
    contracts
      .filter((c) => c.name.toLowerCase().includes(k) || c.code.toLowerCase().includes(k))
      .slice(0, 5)
      .forEach((c) =>
        hits.push({ group: '合同', id: c.contractId, title: c.name, subtitle: c.code, path: `/contracts/${c.contractId}` }),
      );
    contacts
      .filter((c) => c.name.toLowerCase().includes(k))
      .slice(0, 4)
      .forEach((c) =>
        hits.push({ group: '联系人', id: c.contactId, title: c.name, subtitle: c.position ?? '', path: `/customers/${c.customerId}` }),
      );
    return delay(hits, 150);
  },
};

// 重新导出实体集合，供分析页就地聚合
export {
  customers,
  opportunities,
  contracts,
  quotations,
  payments,
  invoices,
  preCredits,
  backLogs,
  targets,
};
export type { BackLog, Contract, Customer, Invoice, Opportunity, Payment, PreCredit, Quotation };
