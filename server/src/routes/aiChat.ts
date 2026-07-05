import { Router } from 'express';
import type { Request } from 'express';
import { one, query, tx } from '../db.js';
import { ah, ctx, fail, ok } from '../http.js';
import { dataScopeCond } from '../auth.js';
import { chatWithTools, getLlmCfg, type ChatTurn, type ToolDef } from '../services/llm.js';
import { gatherFacts } from './insight.js';
import { autoAttachGroup } from './groups.js';

export const aiChatRouter = Router();

/**
 * AI 助手对话：模型通过工具调用完成 CRM 操作（建客户/商机/报价草稿、加跟进/联系人、查询等）。
 * 所有工具在当前登录用户上下文执行——组织隔离、负责人归属、数据范围与手工操作一致。
 */

export interface ChatAction {
  type: 'customer' | 'opportunity' | 'quotation' | 'tracking' | 'contact';
  label: string;
  link?: string;
}

// ---------- 工具定义（对两种模型协议同构） ----------

const TOOLS: ToolDef[] = [
  {
    name: 'search_customers',
    description: '按关键词搜索当前用户可见的客户（返回 customerId/名称/分级/负责人/集团）。创建商机、报价、跟进前先用它确认客户。',
    parameters: {
      type: 'object',
      properties: { keyword: { type: 'string', description: '客户名称关键词，可为空串列出最近客户' } },
      required: ['keyword'],
    },
  },
  {
    name: 'get_customer_overview',
    description: '获取客户全景：负责人、在途商机与阶段、最近跟进、合同与回款汇总。回答“XX客户情况如何”类问题用它。',
    parameters: {
      type: 'object',
      properties: { customerId: { type: 'number' } },
      required: ['customerId'],
    },
  },
  {
    name: 'create_customer',
    description: '创建客户档案（负责人默认当前用户）。注意：工商信息（集团归属等）由系统自动通过企查查匹配，不要虚构。',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '客户公司全称' },
        level: { type: 'string', enum: ['A', 'B', 'C'], description: '客户分级，默认 B' },
        source: { type: 'string', enum: ['官网注册', '广告投放', '转介绍', '陌拜', '展会'], description: '客户来源，默认陌拜' },
        industry: { type: 'string' },
        phoneName: { type: 'string', description: '主联系人姓名' },
        phone: { type: 'string' },
      },
      required: ['name'],
    },
  },
  {
    name: 'add_contact',
    description: '给客户新增联系人。',
    parameters: {
      type: 'object',
      properties: {
        customerId: { type: 'number' },
        name: { type: 'string' },
        phone: { type: 'string' },
        position: { type: 'string' },
        isPrimary: { type: 'boolean', description: '是否设为主联系人' },
      },
      required: ['customerId', 'name'],
    },
  },
  {
    name: 'add_tracking',
    description: '给客户写跟进记录；可附下次跟进日期（会自动生成待办提醒）。',
    parameters: {
      type: 'object',
      properties: {
        customerId: { type: 'number' },
        comment: { type: 'string', description: '跟进内容' },
        nextTrackingDate: { type: 'string', description: '下次跟进日期 YYYY-MM-DD，可选' },
      },
      required: ['customerId', 'comment'],
    },
  },
  {
    name: 'create_opportunity',
    description: '为客户创建商机（负责人默认当前用户，初始阶段=需求沟通）。',
    parameters: {
      type: 'object',
      properties: {
        customerId: { type: 'number' },
        name: { type: 'string', description: '商机名称，不填则用“客户名 商机”' },
        estimatedAmount: { type: 'number', description: '预计成交金额（元）' },
        expectedDate: { type: 'string', description: '预计成交日期 YYYY-MM-DD，默认 30 天后' },
        competitor: { type: 'string' },
      },
      required: ['customerId', 'estimatedAmount'],
    },
  },
  {
    name: 'list_products',
    description: '查询可报价的产品目录（名称与标准价），建报价单前先用它确认产品。',
    parameters: {
      type: 'object',
      properties: { keyword: { type: 'string', description: '产品名称关键词，可为空串列出全部' } },
      required: ['keyword'],
    },
  },
  {
    name: 'create_quotation_draft',
    description: '创建报价单草稿（status=草稿，后续可在报价单页面编辑/提交审批）。行项目用产品名称匹配产品目录，按标准价、不打折写入；如需折扣请让用户在报价单页面调整（受折扣政策管控）。',
    parameters: {
      type: 'object',
      properties: {
        customerId: { type: 'number' },
        name: { type: 'string', description: '报价单标题，不填自动生成' },
        quoteType: { type: 'string', enum: ['询价', '报价', '标书', '框架协议'], description: '默认 报价' },
        opportunityId: { type: 'number', description: '关联商机，可选' },
        lines: {
          type: 'array',
          description: '行项目（产品名+数量）；可为空数组创建空白草稿',
          items: {
            type: 'object',
            properties: { productName: { type: 'string' }, quantity: { type: 'number' } },
            required: ['productName'],
          },
        },
      },
      required: ['customerId'],
    },
  },
];

// ---------- 工具执行（真实落库；与手工操作同权限口径） ----------

async function termId(orgId: number, businessType: number, name: string): Promise<number | null> {
  const r = await one<{ term_id: number }>(
    `SELECT term_id FROM term WHERE business_type=$1 AND (organization_id IS NULL OR organization_id=$2) AND name LIKE $3
     ORDER BY organization_id NULLS LAST, sort_order LIMIT 1`,
    [businessType, orgId, `${name}%`],
  );
  return r?.term_id ?? null;
}

function makeExecutor(req: Request, actions: ChatAction[]) {
  const { orgId, userId } = ctx(req);

  return async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const s = (k: string) => String(args[k] ?? '').trim();
    const n = (k: string) => Number(args[k] ?? 0);

    if (name === 'search_customers') {
      const scope = await dataScopeCond(req, 'c.leader_id');
      const kw = s('keyword');
      const rows = await query<any>(
        `SELECT c.customer_id, c.name, lv.name AS level, u.name AS leader, g.name AS group_name
         FROM customer c
         LEFT JOIN term lv ON lv.term_id=c.level_term_id
         LEFT JOIN app_user u ON u.user_id=c.leader_id
         LEFT JOIN customer_group g ON g.group_id=c.group_id
         WHERE c.organization_id=$1 AND c.active=1 AND c.category IN (3,4)
           ${kw ? `AND c.name ILIKE $2` : ''} ${scope ? 'AND ' + scope : ''}
         ORDER BY c.tracking_update_at DESC NULLS LAST LIMIT 10`,
        kw ? [orgId, `%${kw}%`] : [orgId],
      );
      return rows.map((r: any) => ({ customerId: Number(r.customer_id), name: r.name, level: r.level, leader: r.leader, group: r.group_name }));
    }

    if (name === 'get_customer_overview') {
      const facts = await gatherFacts(orgId, n('customerId'));
      if (!facts) return { error: '客户不存在或无权查看' };
      return facts;
    }

    if (name === 'create_customer') {
      const cname = s('name');
      if (cname.length < 2) return { error: '客户名称至少 2 个字' };
      const dup = await one(`SELECT customer_id FROM customer WHERE organization_id=$1 AND name=$2 AND active=1`, [orgId, cname]);
      if (dup) return { error: `客户「${cname}」已存在（customerId=${(dup as any).customer_id}），请勿重复创建` };
      const levelId = (await termId(orgId, 100, s('level') || 'B')) ?? 26;
      const sourceId = (await termId(orgId, 1, s('source') || '陌拜')) ?? 4;
      const row = await one<any>(
        `INSERT INTO customer (organization_id, name, category, status_term_id, level_term_id, source_term_id,
           industry, phone_name, phone, leader_id, created_by, tracking_update_at)
         VALUES ($1,$2,3,8,$3,$4,$5,$6,$7,$8,$8, now()) RETURNING customer_id, name`,
        [orgId, cname, levelId, sourceId, s('industry') || null, s('phoneName') || null, s('phone') || null, userId],
      );
      // 集团归属只走真实工商数据（企查查/映射表），无数据则保持独立
      const groupId = await autoAttachGroup(orgId, row.customer_id, cname, null);
      actions.push({ type: 'customer', label: `已创建客户「${cname}」`, link: `/customers/${row.customer_id}` });
      return { customerId: Number(row.customer_id), name: row.name, groupId, leader: '当前用户' };
    }

    if (name === 'add_contact') {
      const cid = n('customerId');
      const cust = await one<any>(`SELECT name FROM customer WHERE customer_id=$1 AND organization_id=$2`, [cid, orgId]);
      if (!cust) return { error: '客户不存在' };
      const isPrimary = args.isPrimary === true;
      if (isPrimary) await one(`UPDATE contact SET type=2 WHERE customer_id=$1 AND type=1 RETURNING contact_id`, [cid]).catch(() => null);
      const row = await one<any>(
        `INSERT INTO contact (organization_id, customer_id, name, phone, position, type, maintainer_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING contact_id`,
        [orgId, cid, s('name'), s('phone') || null, s('position') || null, isPrimary ? 1 : 2, userId],
      );
      actions.push({ type: 'contact', label: `已为「${cust.name}」添加联系人 ${s('name')}`, link: `/customers/${cid}` });
      return { contactId: Number(row.contact_id), customer: cust.name };
    }

    if (name === 'add_tracking') {
      const cid = n('customerId');
      const cust = await one<any>(`SELECT name FROM customer WHERE customer_id=$1 AND organization_id=$2`, [cid, orgId]);
      if (!cust) return { error: '客户不存在' };
      const comment = s('comment');
      if (!comment) return { error: '跟进内容不能为空' };
      const nextDate = s('nextTrackingDate') || null;
      await one(
        `INSERT INTO customer_tracking (organization_id, customer_id, business_type, comment, next_tracking_at, priority_level, created_by)
         VALUES ($1,$2,1,$3,$4,1,$5) RETURNING tracking_id`,
        [orgId, cid, comment, nextDate, userId],
      );
      await one(`UPDATE customer SET tracking_num = tracking_num + 1, tracking_update_at = now(), next_tracking_at=$2 WHERE customer_id=$1`, [cid, nextDate]);
      if (nextDate) {
        await one(
          `INSERT INTO back_log (organization_id, business_type, business_id, business_name, user_id, status, deadline_date, deadline_type)
           VALUES ($1,10,$2,$3,$4,0,$5,2)`,
          [orgId, cid, `跟进：${cust.name}`, userId, nextDate],
        );
      }
      actions.push({ type: 'tracking', label: `已为「${cust.name}」写跟进`, link: `/customers/${cid}` });
      return { ok: true, customer: cust.name, backlogCreated: !!nextDate };
    }

    if (name === 'create_opportunity') {
      const cid = n('customerId');
      const cust = await one<any>(`SELECT name FROM customer WHERE customer_id=$1 AND organization_id=$2`, [cid, orgId]);
      if (!cust) return { error: '客户不存在' };
      const amount = n('estimatedAmount');
      if (!(amount > 0)) return { error: '预计成交金额必须大于 0' };
      const oname = s('name') || `${cust.name} 商机`;
      const stageId = (await termId(orgId, 2, '需求沟通')) ?? 30;
      const expected = s('expectedDate') || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
      const seq = await one<{ nn: number }>(`SELECT count(*)+1 AS nn FROM opportunity WHERE organization_id=$1`, [orgId]);
      const code = `OPP${new Date().getFullYear()}${String(seq!.nn).padStart(4, '0')}`;
      const row = await one<any>(
        `INSERT INTO opportunity (organization_id, code, name, customer_id, estimated_amount, status_term_id,
           expiry_date, leader_id, competitor, status_expiry_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now()+interval '14 day') RETURNING opportunity_id`,
        [orgId, code, oname, cid, amount, stageId, expected, userId, s('competitor') || null],
      );
      await one(`UPDATE customer SET opportunity_count = opportunity_count + 1 WHERE customer_id=$1`, [cid]);
      actions.push({ type: 'opportunity', label: `已创建商机「${oname}」（¥${amount.toLocaleString()}）`, link: `/opportunities/${row.opportunity_id}` });
      return { opportunityId: Number(row.opportunity_id), code, name: oname, stage: '需求沟通', expectedDate: expected };
    }

    if (name === 'list_products') {
      const kw = s('keyword');
      const rows = await query<any>(
        `SELECT product_id, name, price, unit FROM product WHERE organization_id=$1 AND active ${kw ? 'AND name ILIKE $2' : ''} ORDER BY product_id LIMIT 10`,
        kw ? [orgId, `%${kw}%`] : [orgId],
      );
      return rows.map((r: any) => ({ productId: Number(r.product_id), name: r.name, price: Number(r.price), unit: r.unit }));
    }

    if (name === 'create_quotation_draft') {
      const cid = n('customerId');
      // 数据范围校验：与手工建报价一致，只能为可见范围内客户建
      const scope = await dataScopeCond(req, 'leader_id');
      const cust = await one<any>(
        `SELECT customer_id, name FROM customer WHERE customer_id=$1 AND organization_id=$2 ${scope ? 'AND ' + scope : ''}`,
        [cid, orgId],
      );
      if (!cust) return { error: '客户不存在或无权为该客户建报价（非你归属的客户）' };

      const typeMap: Record<string, number> = { 询价: 1, 报价: 2, 标书: 3, 框架协议: 4 };
      const quoteType = typeMap[s('quoteType')] ?? 2;
      const reqLines = Array.isArray(args.lines) ? (args.lines as { productName: string; quantity?: number }[]) : [];
      const matched: { productId: number; name: string; price: string; cost: string; quantity: number }[] = [];
      const missed: string[] = [];
      for (const l of reqLines) {
        const p = await one<any>(`SELECT product_id, name, price, cost FROM product WHERE organization_id=$1 AND active AND name ILIKE $2 ORDER BY product_id LIMIT 1`, [orgId, `%${l.productName}%`]);
        if (p) matched.push({ productId: Number(p.product_id), name: p.name, price: p.price, cost: p.cost, quantity: Math.max(1, Number(l.quantity ?? 1)) });
        else missed.push(l.productName);
      }
      const qname = s('name') || `${cust.name} ${quoteType === 1 ? '询价单' : '报价单'}`;
      const seq = await one<{ nn: number }>(`SELECT count(*)+1 AS nn FROM quotation WHERE organization_id=$1`, [orgId]);
      const code = `QT${new Date().getFullYear()}${String(seq!.nn).padStart(4, '0')}`;
      const oppId = args.opportunityId ? n('opportunityId') : null;
      const qid = await tx(async (c) => {
        const q = (await c.query(
          `INSERT INTO quotation (organization_id, code, version, name, customer_id, opportunity_id, quote_type, currency,
             status, order_discount_rate, other_charges, other_charges_items, discount, quote_date, approval)
           VALUES ($1,$2,1,$3,$4,$5,$6,'CNY',0,'1.0000','0','[]','0', CURRENT_DATE, -1) RETURNING quotation_id`,
          [orgId, code, qname, cid, oppId, quoteType],
        )).rows[0];
        for (const l of matched) {
          await c.query(
            `INSERT INTO quotation_product (quotation_id, product_id, quantity, price, discount_rate, cost, pricing_mode)
             VALUES ($1,$2,$3,$4,'1.0000',$5,'qty')`,
            [q.quotation_id, l.productId, l.quantity, l.price, l.cost],
          );
        }
        await c.query(
          `UPDATE quotation SET total = COALESCE((SELECT SUM(total_price) FROM quotation_product WHERE quotation_id=$1),0),
             cost = COALESCE((SELECT SUM(cost) FROM quotation_product WHERE quotation_id=$1),0) WHERE quotation_id=$1`,
          [q.quotation_id],
        );
        return q.quotation_id as number;
      });
      const total = await one<any>(`SELECT amount FROM quotation WHERE quotation_id=$1`, [qid]);
      actions.push({ type: 'quotation', label: `已创建报价草稿「${qname}」`, link: `/quotations/${qid}` });
      return {
        quotationId: Number(qid), code, name: qname, status: '草稿', amount: Number(total?.amount ?? 0),
        lines: matched.map((l) => ({ product: l.name, quantity: l.quantity, price: Number(l.price) })),
        unmatchedProducts: missed.length ? missed : undefined,
      };
    }

    return { error: `未知工具：${name}` };
  };
}

// ---------- 接口 ----------

const SYSTEM_PROMPT = `你是 NextCRM 的 AI 销售助手，通过调用工具帮销售完成 CRM 操作：搜索/创建客户、查看客户全景、添加联系人、写跟进、创建商机、创建报价单草稿。
规则：
1. 涉及某个客户的操作先用 search_customers 确认客户存在与 customerId；多个同名候选时向用户列出让其选择，不要猜。
2. 信息不足时先追问（如建商机缺金额），不要编造参数；日期一律 YYYY-MM-DD。
3. 工具返回 error 字段时，向用户解释原因并给出下一步建议。
4. 建报价前可用 list_products 核对产品名；未匹配的产品要明确告诉用户。
5. 操作完成后用简洁中文汇报做了什么（含名称与金额），不要输出 JSON 或工具细节。
6. 只能通过工具读写 CRM；工商集团归属由系统自动匹配真实数据，禁止虚构。`;

aiChatRouter.post('/ai/chat', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const raw = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const history: ChatTurn[] = raw
    .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string' && m.content.trim())
    .slice(-20)
    .map((m: any) => ({ role: m.role, content: String(m.content).slice(0, 4000) }));
  if (history.length === 0 || history[history.length - 1].role !== 'user') return fail(res, '缺少用户消息');

  const cfg = await getLlmCfg(orgId);
  if (!cfg.enabled) {
    return ok(res, {
      reply: '尚未配置 AI 模型，无法使用对话助手。请管理员到「设置 → 集成配置 → AI 模型」配置模型（支持 Anthropic 官方或 DeepSeek/通义等 OpenAI 兼容服务）后再试。',
      actions: [], generatedBy: 'none', model: '',
    });
  }

  const actions: ChatAction[] = [];
  const exec = makeExecutor(req, actions);
  const today = new Date().toISOString().slice(0, 10);
  try {
    const reply = await chatWithTools(cfg, `${SYSTEM_PROMPT}\n今天日期：${today}`, history, TOOLS, exec);
    ok(res, { reply, actions, generatedBy: 'llm', model: cfg.model });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // 已执行的操作如实返回，避免“做了一半但界面无感知”
    fail(res, `AI 模型调用失败：${msg}${actions.length ? `（注意：失败前已执行 ${actions.length} 项操作：${actions.map((a) => a.label).join('；')}）` : ''}`);
  }
}));
