// 商机开拓管理 内存 Mock（《商机开拓管理办法》QCC-SALES-DEV-2026-005）。
import { delay, paginate, type ListParams } from './client';
import { customers, opportunities, products, contracts } from '@/mock/data';
import type {
  ProspectCampaign,
  ProspectIcp,
  ProspectList,
  ProspectSignal,
  ProspectStats,
  ProspectTarget,
  ProspectTouch,
  WhitespaceData,
} from '@/types';

const now = () => new Date().toISOString();
const addDays = (d: number) => new Date(Date.now() + d * 86400000).toISOString();
const addHours = (h: number) => new Date(Date.now() + h * 3600000).toISOString();
const QUARTER = `${new Date().getFullYear()}Q${Math.floor(new Date().getMonth() / 3) + 1}`;

// ---- ICP（第四条）----
const icps: ProspectIcp[] = [
  { icpId: 1, name: '银行反洗钱合规', line: 'B线', industryScope: '银行,金融', sizeRange: '城商行/农商行及以上', qualifications: '持牌金融机构', exclusions: '已进渠道报备名单', version: 'V1.2', quarter: QUARTER, tamCount: 420, active: 1 },
  { icpId: 2, name: '政府招商引资', line: 'G线', industryScope: '政府,园区,招商', sizeRange: '地市级及以上/国家级园区', qualifications: '有信息化预算', exclusions: '在建同类项目', version: 'V1.0', quarter: QUARTER, tamCount: 680, active: 1 },
  { icpId: 3, name: '供应链风险管理', line: 'S线', industryScope: '制造,供应链,汽车', sizeRange: '参保500人以上', qualifications: '核心企业或一级供应商', exclusions: '6个月内开拓未果', version: 'V1.1', quarter: QUARTER, tamCount: 950, active: 1 },
];
let icpSeq = 10;

// ---- 名单批次 + 目标（第五/六条）----
const lists: ProspectList[] = [
  { listId: 1, icpId: 1, icpName: '银行反洗钱合规', title: `B线作战名单Top100（${QUARTER}）`, quarter: QUARTER, line: 'B线', status: 2, publishedAt: addDays(-20), createdAt: addDays(-22) },
  { listId: 2, icpId: 3, icpName: '供应链风险管理', title: `S线作战名单Top100（${QUARTER}）`, quarter: QUARTER, line: 'S线', status: 1, publishedAt: null, createdAt: addDays(-3) },
];
let listSeq = 10;

const targets: ProspectTarget[] = [
  { targetId: 1, listId: 1, listTitle: lists[0].title, quarter: QUARTER, companyName: '苏南农商银行股份有限公司', industry: '银行', region: '江苏苏州', qScore: 88, tScore: 76, totalScore: 164, rankNo: 1, signalNote: '收到反洗钱专项检查通知', status: 2, ownerId: 1, ownerName: '张伟', claimedAt: addDays(-15), firstTouchDeadline: addDays(15), touchDeadline: addDays(75), touchCount: 2, effectiveTouchCount: 2, lastTouchAt: addDays(-2), frozenUntil: null, customerId: null, opportunityId: null, resultNote: '' },
  { targetId: 2, listId: 1, listTitle: lists[0].title, quarter: QUARTER, companyName: '浙东城市商业银行', industry: '银行', region: '浙江宁波', qScore: 82, tScore: 70, totalScore: 152, rankNo: 2, signalNote: '信贷系统招标预告', status: 1, ownerId: null, claimedAt: null, firstTouchDeadline: null, touchDeadline: null, touchCount: 0, effectiveTouchCount: 0, lastTouchAt: null, frozenUntil: null, customerId: null, opportunityId: null, resultNote: '' },
  { targetId: 3, listId: 1, listTitle: lists[0].title, quarter: QUARTER, companyName: '皖北村镇银行', industry: '银行', region: '安徽阜阳', qScore: 66, tScore: 40, totalScore: 106, rankNo: 3, signalNote: '', status: 4, ownerId: 2, ownerName: '李娜', claimedAt: addDays(-80), firstTouchDeadline: addDays(-50), touchDeadline: addDays(10), touchCount: 3, effectiveTouchCount: 3, lastTouchAt: addDays(-30), frozenUntil: addDays(150), customerId: null, opportunityId: null, resultNote: '完整触达无进展，冷冻6个月' },
];
let targetSeq = 10;
const touches: (ProspectTouch & { targetId: number })[] = [
  { touchId: 1, targetId: 1, method: '电话', content: '首轮触达，确认合规部对接人', effective: true, userName: '张伟', createdAt: addDays(-12) },
  { touchId: 2, targetId: 1, method: '拜访', content: '演示反洗钱场景卡方案', effective: true, userName: '张伟', createdAt: addDays(-2) },
];
let touchSeq = 10;

// ---- 信号（第七/八条）----
const SLA_HOURS: Record<number, number> = { 1: 48, 2: 24, 3: 336, 4: 168 };
const signals: ProspectSignal[] = [
  { signalId: 1, type: 1, title: '目标银行收到反洗钱罚单', detail: '监管公示：因客户身份识别不尽职被处罚', companyName: '苏南农商银行股份有限公司', targetId: 1, customerId: null, ownerId: 1, ownerName: '张伟', dueAt: addHours(30), status: 1, overdue: false, disposition: null, dispositionNote: '', opportunityId: null, handledBy: null, handledAt: null, createdAt: addHours(-18) },
  { signalId: 2, type: 2, title: '政府采购意向公示：产业大脑平台', detail: '预算800万，Q4招标', companyName: '苏州工业园区管委会', targetId: null, customerId: null, ownerId: 4, ownerName: '刘洋', dueAt: addHours(-2), status: 1, overdue: true, disposition: null, dispositionNote: '', opportunityId: null, handledBy: null, handledAt: null, createdAt: addHours(-26) },
  { signalId: 3, type: 4, title: '新设子公司+数字化岗位批量招聘', detail: '新注册2家子公司，招聘数据分析师12人', companyName: '华东智造集团', targetId: null, customerId: null, ownerId: 6, ownerName: '赵磊', dueAt: addDays(-1), status: 2, overdue: false, disposition: 1, dispositionNote: '已按扩张场景卡完成首轮触达', opportunityId: null, handledBy: 6, handledAt: addDays(-2), createdAt: addDays(-6) },
];
let signalSeq = 10;

// ---- 战役（第十五条）----
const campaigns: ProspectCampaign[] = [
  { campaignId: 1, name: `B线反洗钱合规战役（${QUARTER}）`, quarter: QUARTER, line: 'B线', scenarioCard: '银行反洗钱合规', goal: '名单触达≥90%，转商机≥8个', ownerId: 1, ownerName: '张伟', status: 2, kitList: true, kitScript: true, kitContent: false, kitSignal: true, reviewNote: '', startedAt: addDays(-20), endedAt: null, createdAt: addDays(-25) },
];
let campaignSeq = 10;

// ---- 白空间标记 ----
const wsFlags: { customerId: number; productId: number; status: number; note: string }[] = [];

export const prospectingApi = {
  icps: (): Promise<ProspectIcp[]> => {
    // 渗透率分子：按行业范围分词匹配存量客户
    const withStock = icps.filter((i) => i.active === 1).map((i) => {
      const toks = i.industryScope.split(/[,，/、\s]+/).filter(Boolean);
      const stock = customers.filter((c) => c.category === 3 && toks.some((t) => (c.industry ?? '').includes(t))).length;
      return { ...i, stockCount: stock };
    });
    return delay(withStock);
  },
  createIcp: (input: Partial<ProspectIcp>) => {
    const icp: ProspectIcp = {
      icpId: ++icpSeq, name: input.name ?? '', line: input.line ?? '', industryScope: input.industryScope ?? '',
      sizeRange: input.sizeRange ?? '', qualifications: input.qualifications ?? '', exclusions: input.exclusions ?? '',
      version: input.version ?? 'V1.0', quarter: input.quarter ?? QUARTER, tamCount: input.tamCount ?? 0, active: 1,
    };
    icps.push(icp);
    return delay(icp);
  },
  updateIcp: (id: number, input: Partial<ProspectIcp>) => {
    const icp = icps.find((i) => i.icpId === id)!;
    Object.assign(icp, input);
    return delay(icp);
  },

  lists: (p: ListParams) => paginate(lists, p, ['title', 'line']),
  createList: (input: { title: string; quarter: string; line: string; icpId?: number }) => {
    const l: ProspectList = {
      listId: ++listSeq, icpId: input.icpId ?? null, icpName: icps.find((i) => i.icpId === input.icpId)?.name,
      title: input.title, quarter: input.quarter, line: input.line, status: 1, publishedAt: null, createdAt: now(),
    };
    lists.unshift(l);
    return delay(l);
  },
  publishList: (id: number) => {
    const l = lists.find((x) => x.listId === id)!;
    l.status = 2;
    l.publishedAt = now();
    return delay(l);
  },
  addTargets: (listId: number, items: { companyName: string; industry?: string; region?: string; qScore?: number; tScore?: number; signalNote?: string }[]) => {
    const l = lists.find((x) => x.listId === listId)!;
    const skippedExistingCustomer = items.filter((it) => customers.some((c) => c.category === 3 && c.name === it.companyName)).map((it) => it.companyName);
    const skippedDuplicate = items.filter((it) => targets.some((t) => t.listId === listId && t.companyName === it.companyName)).map((it) => it.companyName);
    const fresh = items.filter((it) => !skippedExistingCustomer.includes(it.companyName) && !skippedDuplicate.includes(it.companyName));
    for (const it of fresh) {
      targets.push({
        targetId: ++targetSeq, listId, listTitle: l.title, quarter: l.quarter, companyName: it.companyName,
        industry: it.industry ?? '', region: it.region ?? '', qScore: it.qScore ?? 0, tScore: it.tScore ?? 0,
        totalScore: (it.qScore ?? 0) + (it.tScore ?? 0), rankNo: null, signalNote: it.signalNote ?? '',
        status: 1, ownerId: null, claimedAt: null, firstTouchDeadline: null, touchDeadline: null,
        touchCount: 0, effectiveTouchCount: 0, lastTouchAt: null, frozenUntil: null, customerId: null, opportunityId: null, resultNote: '',
      });
    }
    // 重排名次：Q+T 总分降序
    targets.filter((t) => t.listId === listId).sort((a, b) => b.totalScore - a.totalScore).forEach((t, i) => { t.rankNo = i + 1; });
    return delay({ added: fresh.length, skippedExistingCustomer, skippedDuplicate });
  },

  targets: (p: ListParams) => {
    let rows = targets;
    if (p.tab === 'pending') rows = rows.filter((t) => t.status === 1 || t.status === 5);
    else if (p.tab === 'mine') rows = rows.filter((t) => t.status === 2);
    else if (p.tab === 'frozen') rows = rows.filter((t) => t.status === 4);
    else if (p.tab === 'converted') rows = rows.filter((t) => t.status === 3);
    return paginate(rows, { ...p, tab: undefined }, ['companyName', 'industry', 'region']);
  },
  claimTarget: (id: number) => {
    const t = targets.find((x) => x.targetId === id)!;
    Object.assign(t, { status: 2, ownerId: 1, ownerName: '张伟', claimedAt: now(), firstTouchDeadline: addDays(30), touchDeadline: addDays(90), resultNote: '' });
    return delay(t);
  },
  touchTarget: (id: number, input: { method: string; content?: string; effective?: boolean }) => {
    const t = targets.find((x) => x.targetId === id)!;
    const effective = input.effective !== false;
    touches.unshift({ touchId: ++touchSeq, targetId: id, method: input.method, content: input.content ?? '', effective, userName: '张伟', createdAt: now() });
    t.touchCount += 1;
    if (effective) t.effectiveTouchCount += 1;
    t.lastTouchAt = now();
    return delay(t);
  },
  targetTouches: (id: number): Promise<ProspectTouch[]> => delay(touches.filter((x) => x.targetId === id)),
  freezeTarget: (id: number, note?: string) => {
    const t = targets.find((x) => x.targetId === id)!;
    Object.assign(t, { status: 4, frozenUntil: addDays(182), resultNote: note || '完整触达无进展，冷冻6个月' });
    return delay(t);
  },
  unfreezeTarget: (id: number, note?: string) => {
    const t = targets.find((x) => x.targetId === id)!;
    Object.assign(t, { status: 1, ownerId: null, ownerName: undefined, claimedAt: null, firstTouchDeadline: null, touchDeadline: null, frozenUntil: null, resultNote: note || '强信号提前解冻' });
    return delay(t);
  },
  convertTarget: (id: number, input: { oppName?: string; estimatedAmount?: string; note?: string }) => {
    const t = targets.find((x) => x.targetId === id)!;
    Object.assign(t, { status: 3, customerId: 999, opportunityId: 999, resultNote: input.note ?? '已填报《客户数据需求收集表》', opportunityCode: `OPP${new Date().getFullYear()}9999` });
    return delay(t);
  },

  signals: (p: ListParams) => {
    let rows = signals.map((s) => ({ ...s, overdue: s.status === 1 && new Date(s.dueAt).getTime() < Date.now() }));
    if (p.tab === 'pending') rows = rows.filter((s) => s.status === 1);
    else if (p.tab === 'handled') rows = rows.filter((s) => s.status === 2);
    else if (p.tab === 'mine') rows = rows.filter((s) => s.status === 1);
    return paginate(rows, { ...p, tab: undefined }, ['title', 'companyName']);
  },
  createSignal: (input: { type: number; title: string; detail?: string; companyName: string; targetId?: number; customerId?: number; ownerId?: number }) => {
    const t = targets.find((x) => x.companyName === input.companyName && (x.status === 2 || x.status === 4));
    const s: ProspectSignal = {
      signalId: ++signalSeq, type: input.type, title: input.title, detail: input.detail ?? '',
      companyName: input.companyName, targetId: input.targetId ?? t?.targetId ?? null, customerId: input.customerId ?? null,
      ownerId: input.ownerId ?? t?.ownerId ?? 1, ownerName: t?.ownerName ?? '张伟',
      dueAt: addHours(SLA_HOURS[input.type]), status: 1, overdue: false, disposition: null, dispositionNote: '',
      opportunityId: null, handledBy: null, handledAt: null, createdAt: now(),
    };
    signals.unshift(s);
    return delay(s);
  },
  handleSignal: (id: number, input: { disposition: number; note?: string }) => {
    const s = signals.find((x) => x.signalId === id)!;
    Object.assign(s, { status: 2, disposition: input.disposition, dispositionNote: input.note ?? '', handledBy: 1, handledAt: now(), overdue: false });
    return delay(s);
  },

  whitespace: (): Promise<WhitespaceData> => {
    const stock = customers.filter((c) => c.category === 3).slice(0, 60);
    // 实格：合同产品（mock 合同无产品行，则按客户ID伪随机铺 1-3 个 SKU 便于演示）
    const rows = stock.map((c) => {
      const fromContracts = contracts.filter((k) => k.customerId === c.customerId).length;
      const n = ((c.customerId * 7) % 3) + (fromContracts > 0 ? 1 : 0);
      const ownedProductIds = products.slice(c.customerId % 4, (c.customerId % 4) + n).map((p) => p.productId);
      const flags: Record<number, { status: number; note: string }> = {};
      for (const f of wsFlags.filter((x) => x.customerId === c.customerId)) flags[f.productId] = { status: f.status, note: f.note };
      return { customerId: c.customerId, customerName: c.name, industry: c.industry ?? '', leaderName: '', ownedProductIds, flags };
    });
    const withSku = rows.filter((r) => r.ownedProductIds.length > 0);
    return delay({
      products: products.map((p) => ({ productId: p.productId, code: p.code, name: p.name })),
      rows,
      stats: {
        customerCount: rows.length,
        multiSkuRatio: withSku.length ? withSku.filter((r) => r.ownedProductIds.length >= 2).length / withSku.length : 0,
        avgSku: withSku.length ? withSku.reduce((a, r) => a + r.ownedProductIds.length, 0) / withSku.length : 0,
      },
    });
  },
  setWhitespace: (input: { customerId: number; productId: number; status: number | null; note?: string }) => {
    const i = wsFlags.findIndex((x) => x.customerId === input.customerId && x.productId === input.productId);
    if (i >= 0) wsFlags.splice(i, 1);
    if (input.status != null) wsFlags.push({ customerId: input.customerId, productId: input.productId, status: input.status, note: input.note ?? '' });
    return delay({ ...input });
  },

  campaigns: (p: ListParams) => paginate(campaigns, p, ['name', 'scenarioCard', 'line']),
  createCampaign: (input: { name: string; quarter: string; line: string; scenarioCard?: string; goal?: string; ownerId?: number }) => {
    const c: ProspectCampaign = {
      campaignId: ++campaignSeq, name: input.name, quarter: input.quarter, line: input.line,
      scenarioCard: input.scenarioCard ?? '', goal: input.goal ?? '', ownerId: input.ownerId ?? 1, ownerName: '张伟',
      status: 1, kitList: false, kitScript: false, kitContent: false, kitSignal: false, reviewNote: '',
      startedAt: null, endedAt: null, createdAt: now(),
    };
    campaigns.unshift(c);
    return delay(c);
  },
  updateCampaign: (id: number, input: Partial<ProspectCampaign>) => {
    const c = campaigns.find((x) => x.campaignId === id)!;
    if (input.status === 4 && !(input.reviewNote ?? c.reviewNote)) return Promise.reject(new Error('战役结束前须回写复盘（名单命中率/话术有效性/信号查准率）'));
    Object.assign(c, input);
    if (input.status === 2 && !c.startedAt) c.startedAt = now();
    if (input.status === 4) c.endedAt = now();
    return delay(c);
  },

  stats: (quarter?: string): Promise<ProspectStats> => {
    const q = quarter ?? QUARTER;
    const qTargets = targets.filter((t) => t.quarter === q);
    const total = qTargets.length;
    const completed = qTargets.filter((t) => t.effectiveTouchCount >= 3 || t.status === 3 || t.status === 4).length;
    const converted = qTargets.filter((t) => t.status === 3).length;
    const handled = signals.filter((s) => s.status === 2);
    const timely = handled.filter((s) => s.handledAt && new Date(s.handledAt) <= new Date(s.dueAt)).length;
    const fp = handled.filter((s) => s.disposition === 3).length;
    const prospectOpp = targets.filter((t) => t.opportunityId).length + signals.filter((s) => s.opportunityId).length;
    const byType = [1, 2, 3, 4].map((tp) => {
      const rows = signals.filter((s) => s.type === tp);
      const h = rows.filter((s) => s.status === 2);
      const f = h.filter((s) => s.disposition === 3).length;
      return { type: tp, total: rows.length, handled: h.length, timely: h.filter((s) => s.handledAt && new Date(s.handledAt) <= new Date(s.dueAt)).length, falsePositive: f, precision: h.length ? 1 - f / h.length : 1 };
    }).filter((r) => r.total > 0);
    return delay({
      quarter: q,
      selfSourced: { prospectOpportunities: prospectOpp, totalOpportunities: opportunities.length, ratio: opportunities.length ? prospectOpp / opportunities.length : 0, targetRatio: 0.4 },
      listFunnel: {
        total, claimed: qTargets.filter((t) => t.status !== 1).length, touched: qTargets.filter((t) => t.touchCount > 0).length,
        completed, converted, frozen: qTargets.filter((t) => t.status === 4).length, recalled: qTargets.filter((t) => t.status === 5).length,
        touchRate: total ? completed / total : 0, convRate: total ? converted / total : 0, touchRateTarget: 0.9,
      },
      signals: {
        total: signals.length, handled: handled.length,
        pendingOverdue: signals.filter((s) => s.status === 1 && new Date(s.dueAt).getTime() < Date.now()).length,
        timelyRate: handled.length ? timely / handled.length : 0, timelyRateTarget: 0.85,
        precision: handled.length ? 1 - fp / handled.length : 1, precisionTarget: 0.6,
        byType,
      },
      whitespace: { multiSkuRatio: 0.42, avgSku: 1.8, customersWithSku: customers.filter((c) => c.category === 3).length },
      tam: icps.filter((i) => i.active === 1).map((i) => {
        const toks = i.industryScope.split(/[,，/、\s]+/).filter(Boolean);
        const stock = customers.filter((c) => c.category === 3 && toks.some((t) => (c.industry ?? '').includes(t))).length;
        return { icpId: i.icpId, name: i.name, line: i.line, quarter: i.quarter, tamCount: i.tamCount, stockCount: stock, penetration: i.tamCount ? stock / i.tamCount : 0 };
      }),
      campaigns: {
        total: campaigns.filter((c) => c.quarter === q).length,
        running: campaigns.filter((c) => c.quarter === q && (c.status === 1 || c.status === 2)).length,
        reviewed: campaigns.filter((c) => c.quarter === q && c.status === 4 && c.reviewNote).length,
      },
    });
  },
};
