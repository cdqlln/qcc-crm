import { Router } from 'express';
import { one, query } from '../db.js';
import { ah, ctx, fail, ok } from '../http.js';
import { chatComplete, getLlmCfg, parseJsonLoose } from '../services/llm.js';

export const insightRouter = Router();

// ---------- 客户洞察：事实聚合（全部来自真实库数据） ----------

const CONTRACT_STATUS = ['初始', '已签约', '执行中', '已完毕', '已终止', '已作废'];

export interface CustomerFacts {
  customer: {
    name: string; level: string; industry: string; groupName: string;
    leader: string; source: string; createdAt: string; trackingNum: number; lastTrackingAt: string | null;
    custom?: Record<string, string>; // 个性客户信息（自定义字段 名称→值）
  };
  contacts: { name: string; position: string; isKey: boolean }[];
  opportunities: {
    name: string; amount: number; stage: string; stayDays: number; leader: string;
    expectedDate: string | null; mainProduct: string; competitor: string;
  }[];
  trackings: { at: string; way: string; by: string; comment: string; nextAt: string | null }[];
  contracts: {
    name: string; amount: number; status: string; receivedAmount: number; outstandingAmount: number;
    receivedRate: number; invoiceAmount: number; leader: string; beginDate: string | null; expiredDate: string | null;
  }[];
  overduePayments: { contractName: string; planDate: string; outstanding: number }[];
  totals: {
    oppCount: number; oppAmount: number;
    contractCount: number; contractAmount: number;
    receivedAmount: number; outstandingAmount: number; invoiceAmount: number; receivedRate: number;
  };
}

export async function gatherFacts(orgId: number, customerId: number): Promise<CustomerFacts | null> {
  const cust = await one<any>(
    `SELECT c.*, g.name AS group_name, u.name AS leader_name, lv.name AS level_name, src.name AS source_name
     FROM customer c
     LEFT JOIN customer_group g ON g.group_id = c.group_id
     LEFT JOIN app_user u ON u.user_id = c.leader_id
     LEFT JOIN term lv ON lv.term_id = c.level_term_id
     LEFT JOIN term src ON src.term_id = c.source_term_id
     WHERE c.customer_id=$1 AND c.organization_id=$2`,
    [customerId, orgId],
  );
  if (!cust) return null;

  const [contacts, opps, trackings, contracts, overdue] = await Promise.all([
    query<any>(`SELECT name, position, type FROM contact WHERE customer_id=$1 ORDER BY type, contact_id LIMIT 10`, [customerId]),
    query<any>(
      `SELECT o.name, o.estimated_amount, o.all_stay_time, o.expiry_date, o.main_product, o.competitor,
              st.name AS stage_name, u.name AS leader_name
       FROM opportunity o
       LEFT JOIN term st ON st.term_id = o.status_term_id
       LEFT JOIN app_user u ON u.user_id = o.leader_id
       WHERE o.customer_id=$1 AND o.organization_id=$2 AND o.active=1
       ORDER BY o.updated_at DESC LIMIT 10`,
      [customerId, orgId],
    ),
    query<any>(
      `SELECT t.created_at, t.comment, t.next_tracking_at, tt.name AS way_name, u.name AS by_name
       FROM customer_tracking t
       LEFT JOIN term tt ON tt.term_id = t.tracking_type_term
       LEFT JOIN app_user u ON u.user_id = t.created_by
       WHERE t.customer_id=$1 ORDER BY t.created_at DESC LIMIT 15`,
      [customerId],
    ),
    query<any>(
      `SELECT c.name, c.amount, c.status, c.received_amount, c.outstanding_amount, c.received_rate,
              c.invoice_amount, c.begin_date, c.expired_date, u.name AS leader_name
       FROM contract c LEFT JOIN app_user u ON u.user_id = c.leader_id
       WHERE c.customer_id=$1 AND c.organization_id=$2 AND c.status <> 5
       ORDER BY c.created_at DESC LIMIT 15`,
      [customerId, orgId],
    ),
    query<any>(
      `SELECT ct.name AS contract_name, p.plan_date, p.outstanding_amount
       FROM payment p JOIN contract ct ON ct.contract_id = p.contract_id
       WHERE p.customer_id=$1 AND p.organization_id=$2 AND p.status IN (1,2,4)
         AND p.plan_date IS NOT NULL AND p.plan_date < CURRENT_DATE AND p.outstanding_amount > 0
       ORDER BY p.plan_date LIMIT 10`,
      [customerId, orgId],
    ),
  ]);

  const num = (v: unknown) => Number(v ?? 0);
  const contractAmount = contracts.reduce((s: number, c: any) => s + num(c.amount), 0);
  const receivedAmount = contracts.reduce((s: number, c: any) => s + num(c.received_amount), 0);

  // 个性客户信息（自定义字段）：field_id → 名称，供 AI 一并分析
  const custom: Record<string, string> = {};
  const cf = (cust.custom_fields ?? {}) as Record<string, unknown>;
  if (Object.keys(cf).length > 0) {
    const defs = await query<any>(
      `SELECT field_id, name FROM custom_field_def WHERE organization_id=$1 AND business_type=1 AND active`,
      [orgId],
    );
    for (const d of defs) {
      const v = cf[String(d.field_id)];
      if (v != null && String(v).trim() !== '') custom[d.name] = String(v);
    }
  }

  return {
    customer: {
      name: cust.name,
      level: cust.level_name ?? '未分级',
      industry: cust.industry ?? '',
      groupName: cust.group_name ?? '',
      leader: cust.leader_name ?? '未分配',
      source: cust.source_name ?? '',
      createdAt: String(cust.created_at).slice(0, 10),
      trackingNum: num(cust.tracking_num),
      lastTrackingAt: cust.tracking_update_at ? String(cust.tracking_update_at).slice(0, 10) : null,
      ...(Object.keys(custom).length > 0 ? { custom } : {}),
    },
    contacts: contacts.map((c: any) => ({ name: c.name, position: c.position ?? '', isKey: c.type === 1 })),
    opportunities: opps.map((o: any) => ({
      name: o.name, amount: num(o.estimated_amount), stage: o.stage_name ?? '未知阶段',
      stayDays: num(o.all_stay_time), leader: o.leader_name ?? '未分配',
      expectedDate: o.expiry_date ? String(o.expiry_date).slice(0, 10) : null,
      mainProduct: o.main_product ?? '', competitor: o.competitor ?? '',
    })),
    trackings: trackings.map((t: any) => ({
      at: String(t.created_at).slice(0, 10), way: t.way_name ?? '', by: t.by_name ?? '',
      comment: (t.comment ?? '').slice(0, 200), nextAt: t.next_tracking_at ? String(t.next_tracking_at).slice(0, 10) : null,
    })),
    contracts: contracts.map((c: any) => ({
      name: c.name, amount: num(c.amount), status: CONTRACT_STATUS[c.status] ?? String(c.status),
      receivedAmount: num(c.received_amount), outstandingAmount: num(c.outstanding_amount),
      receivedRate: num(c.received_rate), invoiceAmount: num(c.invoice_amount),
      leader: c.leader_name ?? '未分配',
      beginDate: c.begin_date ? String(c.begin_date).slice(0, 10) : null,
      expiredDate: c.expired_date ? String(c.expired_date).slice(0, 10) : null,
    })),
    overduePayments: overdue.map((p: any) => ({
      contractName: p.contract_name, planDate: String(p.plan_date).slice(0, 10), outstanding: num(p.outstanding_amount),
    })),
    totals: {
      oppCount: opps.length,
      oppAmount: opps.reduce((s: number, o: any) => s + num(o.estimated_amount), 0),
      contractCount: contracts.length,
      contractAmount,
      receivedAmount,
      outstandingAmount: contracts.reduce((s: number, c: any) => s + num(c.outstanding_amount), 0),
      invoiceAmount: contracts.reduce((s: number, c: any) => s + num(c.invoice_amount), 0),
      receivedRate: contractAmount > 0 ? Math.round((receivedAmount / contractAmount) * 10000) / 100 : 0,
    },
  };
}

// ---------- 洞察结构（LLM 输出与规则兜底共用同一 schema，前端排版统一） ----------

export interface CustomerInsight {
  summary: string;
  healthScore: number; // 0-100
  owners: { role: string; name: string; note: string }[];
  progress: { assessment: string; highlights: string[] };
  finance: { assessment: string; highlights: string[] };
  risks: string[];
  nextSteps: string[];
}

const INSIGHT_SCHEMA_DESC = `{
  "summary": "3~4 句总评，讲清客户当前状态与最重要的一件事",
  "healthScore": 0-100 的整数（综合跟进活跃度、商机推进、回款健康度）,
  "owners": [{"role": "客户负责人|商机负责人|合同负责人|客户主联系人", "name": "姓名", "note": "TA 手上有什么、当前该盯什么"}],
  "progress": {"assessment": "对跟进进展的判断（节奏、断档、下一步是否明确）", "highlights": ["具体依据，引用日期和事实"]},
  "finance": {"assessment": "对历史订单与回款的判断", "highlights": ["具体依据，引用金额与比例"]},
  "risks": ["按严重程度排序的风险，每条给出事实依据"],
  "nextSteps": ["可直接执行的动作，明确到人和时间窗口"]
}`;

function buildPrompt(facts: CustomerFacts): { system: string; user: string } {
  return {
    system:
      '你是一名资深 B2B 销售运营分析师。根据 CRM 中该客户的真实数据生成中文客户洞察，帮助销售快速掌握：当前项目由谁负责、跟进进展如何、过往订单与回款情况。' +
      '要求：只依据给定事实，不得编造数据；结论要具体、可执行、引用事实中的日期与金额；语言精炼直接。' +
      `严格输出 JSON（不要 markdown 围栏、不要多余文字），结构：${INSIGHT_SCHEMA_DESC}`,
    user: `客户 CRM 数据（JSON）：\n${JSON.stringify(facts, null, 1)}\n今天日期：${new Date().toISOString().slice(0, 10)}`,
  };
}

function normalizeInsight(raw: any): CustomerInsight {
  const arr = (v: any) => (Array.isArray(v) ? v.map((x) => String(x)) : []);
  return {
    summary: String(raw?.summary ?? ''),
    healthScore: Math.max(0, Math.min(100, Math.round(Number(raw?.healthScore ?? 0)))),
    owners: Array.isArray(raw?.owners)
      ? raw.owners.map((o: any) => ({ role: String(o?.role ?? ''), name: String(o?.name ?? ''), note: String(o?.note ?? '') }))
      : [],
    progress: { assessment: String(raw?.progress?.assessment ?? ''), highlights: arr(raw?.progress?.highlights) },
    finance: { assessment: String(raw?.finance?.assessment ?? ''), highlights: arr(raw?.finance?.highlights) },
    risks: arr(raw?.risks),
    nextSteps: arr(raw?.nextSteps),
  };
}

// 未配置模型时的规则兜底（明确标注 generatedBy: 'rules'）
function ruleInsight(f: CustomerFacts): CustomerInsight {
  const t = f.totals;
  const daysSince = (d: string | null) => (d ? Math.floor((Date.now() - new Date(d).getTime()) / 86400000) : null);
  const idle = daysSince(f.customer.lastTrackingAt);

  const owners: CustomerInsight['owners'] = [
    { role: '客户负责人', name: f.customer.leader, note: `负责客户整体关系，累计跟进 ${f.customer.trackingNum} 次` },
    ...f.opportunities.slice(0, 3).map((o) => ({
      role: '商机负责人', name: o.leader,
      note: `「${o.name}」处于${o.stage}，预计 ¥${o.amount.toLocaleString()}，已停留 ${o.stayDays} 天`,
    })),
    ...f.contracts.filter((c) => c.outstandingAmount > 0).slice(0, 2).map((c) => ({
      role: '合同负责人', name: c.leader,
      note: `「${c.name}」未回款 ¥${c.outstandingAmount.toLocaleString()}（回款率 ${c.receivedRate}%）`,
    })),
    ...f.contacts.filter((c) => c.isKey).slice(0, 2).map((c) => ({
      role: '客户主联系人', name: c.name, note: c.position || '客户侧关键角色',
    })),
  ];

  const risks: string[] = [];
  if (f.overduePayments.length > 0)
    risks.push(`${f.overduePayments.length} 笔回款计划已逾期，合计 ¥${f.overduePayments.reduce((s, p) => s + p.outstanding, 0).toLocaleString()}，最早逾期日 ${f.overduePayments[0].planDate}`);
  if (idle != null && idle > 14) risks.push(`已 ${idle} 天无跟进记录，客户关系存在冷却风险`);
  for (const o of f.opportunities) if (o.stayDays > 21) risks.push(`商机「${o.name}」在${o.stage}停留 ${o.stayDays} 天，推进偏慢`);
  if (t.contractCount > 0 && t.receivedRate < 60) risks.push(`整体回款率 ${t.receivedRate}%，低于健康水位（60%）`);
  if (risks.length === 0) risks.push('暂无明显风险信号');

  let score = 60;
  if (idle != null && idle <= 7) score += 10; else if (idle == null || idle > 14) score -= 15;
  if (t.oppCount > 0) score += 10;
  if (t.contractCount > 0) score += t.receivedRate >= 80 ? 15 : t.receivedRate >= 60 ? 5 : -10;
  if (f.overduePayments.length > 0) score -= 10;
  score = Math.max(5, Math.min(95, score));

  const nextSteps: string[] = [];
  if (f.overduePayments.length > 0) nextSteps.push(`安排 ${f.contracts.find((c) => c.outstandingAmount > 0)?.leader ?? f.customer.leader} 本周内跟进逾期回款`);
  if (idle != null && idle > 14) nextSteps.push(`${f.customer.leader} 3 日内恢复联系，更新客户近况`);
  for (const o of f.opportunities.slice(0, 2)) {
    if (o.stayDays > 21) nextSteps.push(`${o.leader} 与客户确认「${o.name}」卡点，制定阶段推进计划`);
  }
  if (nextSteps.length === 0) nextSteps.push('保持当前跟进节奏，按计划推进在途商机');

  return {
    summary:
      `${f.customer.name}（${f.customer.level}${f.customer.industry ? ' · ' + f.customer.industry : ''}）当前由 ${f.customer.leader} 负责，` +
      `在途商机 ${t.oppCount} 个（预计 ¥${t.oppAmount.toLocaleString()}），历史合同 ${t.contractCount} 份共 ¥${t.contractAmount.toLocaleString()}，` +
      `已回款 ¥${t.receivedAmount.toLocaleString()}（${t.receivedRate}%）` +
      (t.outstandingAmount > 0 ? `，未回款 ¥${t.outstandingAmount.toLocaleString()}` : '') +
      (idle != null ? `。最近一次跟进在 ${f.customer.lastTrackingAt}（${idle} 天前）。` : '。尚无跟进记录。'),
    healthScore: score,
    owners,
    progress: {
      assessment:
        idle == null ? '尚无跟进记录，需要尽快建立首次触达。'
        : idle <= 7 ? `跟进节奏健康（最近 ${idle} 天内有动作），近 ${f.trackings.length} 条记录连续。`
        : idle <= 14 ? `跟进节奏一般（${idle} 天前最后一次），建议本周内安排一次触达。`
        : `跟进已断档 ${idle} 天，需要立即恢复联系。`,
      highlights: f.trackings.slice(0, 5).map((tr) => `${tr.at} ${tr.by}（${tr.way || '跟进'}）：${tr.comment || '—'}`),
    },
    finance: {
      assessment:
        t.contractCount === 0 ? '尚无成交合同，处于商机培育期。'
        : `历史合同 ${t.contractCount} 份共 ¥${t.contractAmount.toLocaleString()}，整体回款率 ${t.receivedRate}%` +
          (f.overduePayments.length > 0 ? `，其中 ${f.overduePayments.length} 笔回款计划已逾期，需重点催收。` : '，回款进度正常。'),
      highlights: f.contracts.slice(0, 5).map((c) =>
        `「${c.name}」¥${c.amount.toLocaleString()}（${c.status}）：已回款 ¥${c.receivedAmount.toLocaleString()}（${c.receivedRate}%）` +
        (c.outstandingAmount > 0 ? `，未回款 ¥${c.outstandingAmount.toLocaleString()}` : ''),
      ),
    },
    risks,
    nextSteps,
  };
}

// ---------- 接口 ----------

// 最近一次洞察（页面加载即显示，避免重复消耗模型额度）
insightRouter.get('/customers/:id/insight', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const row = await one<any>(
    `SELECT report_id, content, created_at FROM ai_report
     WHERE organization_id=$1 AND business_type=1 AND business_id=$2 AND stage_id=901 AND status=2
     ORDER BY report_id DESC LIMIT 1`,
    [orgId, req.params.id],
  );
  if (!row?.content?.insight) return ok(res, null);
  ok(res, { reportId: row.report_id, createdAt: row.created_at, ...row.content });
}));

insightRouter.post('/customers/:id/insight', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const customerId = Number(req.params.id);
  const facts = await gatherFacts(orgId, customerId);
  if (!facts) return fail(res, '客户不存在', 1, 404);

  const cfg = await getLlmCfg(orgId);
  let insight: CustomerInsight;
  let generatedBy: 'llm' | 'rules' = 'rules';
  let model = '';
  if (cfg.enabled) {
    try {
      const { system, user } = buildPrompt(facts);
      const text = await chatComplete(cfg, system, user);
      insight = normalizeInsight(parseJsonLoose(text));
      if (!insight.summary) throw new Error('模型未返回有效洞察内容');
      generatedBy = 'llm';
      model = cfg.model;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return fail(res, `AI 模型调用失败：${msg}（可在 设置→集成配置 检查 AI 模型配置）`);
    }
  } else {
    insight = ruleInsight(facts);
  }

  const content = { facts, insight, generatedBy, model };
  // stage_id=901 标记「客户洞察」报告，与旧版 /ai/generate 记录区分
  const row = await one<any>(
    `INSERT INTO ai_report (organization_id, business_type, business_id, stage_id, status, content)
     VALUES ($1,1,$2,901,2,$3) RETURNING report_id, created_at`,
    [orgId, customerId, JSON.stringify(content)],
  );
  ok(res, { reportId: row.report_id, createdAt: row.created_at, ...content });
}));
