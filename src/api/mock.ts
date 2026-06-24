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
import { userName } from '@/mock/org';
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
export const leadsApi = {
  list: (p: ListParams) => {
    const tab = p.tab ?? 'all';
    let src = customers.filter((c) => c.category === 1 || c.category === 2);
    if (tab === 'pool') src = src.filter((c) => c.category === 2);
    if (tab === 'mine') src = src.filter((c) => c.category === 1);
    if (tab === 'converted') src = src.filter((c) => c.currentTrackingStatus === 17);
    return paginate(src, p, ['name', 'phoneName', 'industry']);
  },
  get: (id: number) => delay(customers.find((c) => c.customerId === id)),
  convert: (id: number) => {
    const c = customers.find((x) => x.customerId === id);
    if (c) {
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
    if (c) { c.category = 3; c.currentTrackingStatus = 17; c.opportunityCount = (c.opportunityCount ?? 0) + 1; }
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
  create: (input: Partial<Opportunity>) => {
    const id = nextId(opportunities, 'opportunityId');
    const cust = customers.find((c) => c.customerId === input.customerId);
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
      currency: input.currency ?? 'CNY', status: 0, quoteType: input.quoteType ?? 2,
      total: total.toFixed(2), orderDiscountRate: input.orderDiscountRate ?? '1.00', otherCharges: input.otherCharges ?? '0', otherChargesItems: input.otherChargesItems ?? [],
      discount: input.discount ?? '0', amount: amount.toFixed(2), cost: cost.toFixed(2),
      grossProfit: (amount - cost).toFixed(2), grossProfitRate: amount > 0 ? (((amount - cost) / amount) * 100).toFixed(1) : '0',
      comDiscountRate: total > 0 ? ((amount / total) * 100).toFixed(1) : '0', approval: -1, customerConfirmed: false,
    };
    quotations.unshift(row);
    return delay(row);
  },
  update: (id: number, input: any) => {
    const q = quotations.find((x) => x.quotationId === id) as any;
    if (q) Object.assign(q, { name: input.name, quoteType: input.quoteType, orderDiscountRate: input.orderDiscountRate, otherCharges: input.otherCharges, otherChargesItems: input.otherChargesItems, discount: input.discount, opportunityId: input.opportunityId, quoteDate: input.quoteDate, expiredDate: input.expiredDate, contractTerm: input.contractTerm });
    return delay(q);
  },
  confirm: (id: number) => {
    const q = quotations.find((x) => x.quotationId === id) as any;
    if (q) { q.customerConfirmed = true; q.status = 1; }
    return delay(q);
  },
};

// ---------- 合同 §6.6 ----------
export const contractsApi = {
  list: (p: ListParams) => {
    const tab = p.tab ?? 'all';
    let src = contracts;
    if (tab === 'archived') src = src.filter((c) => c.archive);
    if (tab === 'renew') src = src.filter((c) => c.renewType === 2);
    return paginate(src, p, ['name', 'code', 'customerName']);
  },
  get: (id: number) => delay(contracts.find((c) => c.contractId === id)),
  payments: (contractId: number) => delay(payments.filter((p) => p.contractId === contractId)),
  paymentSheets: (contractId: number) => delay(paymentSheets.filter((s) => s.contractId === contractId)),
  invoices: (contractId: number) => delay(invoices.filter((i) => i.contractId === contractId)),
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
