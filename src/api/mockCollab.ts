// 协同模块的内存 Mock 实现（无后端时使用），与 backend 同签名。
import { delay, paginate, type ListParams } from './client';
import { MOCK_USERS, userName } from '@/mock/org';
import type { ApprovalRoute, ApprovalTask, ApprovalTaskNode, QywxMessage, Sign, Ticket, TicketComment } from '@/types';
import { dayjs } from '@/lib/format';

const now = () => dayjs().toISOString();
const nextId = (a: { [k: string]: any }[], k: string) => a.reduce((m, r) => Math.max(m, r[k] || 0), 0) + 1;

// ---- 签到 ----
const signs: Sign[] = [
  { signId: 1, userId: 1, userName: '张伟', type: 2, customerId: 1, customerName: '星辰云图科技有限公司', address: '苏州工业园区', remark: '拜访王总', createDate: dayjs().subtract(2, 'hour').toISOString() },
  { signId: 2, userId: 2, userName: '李娜', type: 1, address: '公司', remark: '上班打卡', createDate: dayjs().subtract(1, 'day').toISOString() },
];
export const signApi = {
  list: (p: ListParams) => paginate(p.tab === 'team' ? signs : signs.filter((s) => s.userId === 1), p, ['customerName', 'address', 'remark']),
  create: (input: Partial<Sign>) => {
    const row: Sign = { signId: nextId(signs, 'signId'), userId: 1, userName: userName(1), type: 2, createDate: now(), ...input } as Sign;
    signs.unshift(row);
    return delay(row);
  },
};

// ---- 工单 ----
const TICKET_TYPE: Record<number, string> = { 200: '咨询', 201: '投诉', 202: '故障', 203: '需求' };
const tickets: Ticket[] = [
  { ticketId: 1, code: 'WO20260001', title: '专业版无法登录', typeTerm: 202, customerId: 1, customerName: '星辰云图科技有限公司', priority: 3, status: 2, assigneeId: 3, assigneeName: '王芳', creatorId: 2, description: '账号登录报错', createDate: now() },
  { ticketId: 2, code: 'WO20260002', title: '发票信息变更', typeTerm: 200, customerId: 1, customerName: '星辰云图科技有限公司', priority: 2, status: 1, assigneeId: 5, assigneeName: '陈静', creatorId: 2, createDate: now() },
];
const ticketComments: TicketComment[] = [];
export const ticketsApi = {
  list: (p: ListParams) => {
    let src = tickets;
    if (p.tab === 'open') src = tickets.filter((t) => t.status <= 2);
    else if (p.tab === 'mine') src = tickets.filter((t) => t.assigneeId === 1);
    else if (p.tab === 'closed') src = tickets.filter((t) => t.status >= 3);
    return paginate(src, p, ['title', 'code', 'customerName']);
  },
  get: (id: number) => delay(tickets.find((t) => t.ticketId === id)),
  comments: (id: number) => delay(ticketComments.filter((c) => c.ticketId === id)),
  create: (input: Partial<Ticket>) => {
    const id = nextId(tickets, 'ticketId');
    const row: Ticket = {
      ticketId: id, code: `WO${dayjs().format('YYYY')}${String(id).padStart(4, '0')}`,
      title: input.title ?? '新工单', typeTerm: input.typeTerm, customerId: input.customerId, priority: (input.priority ?? 2) as 1 | 2 | 3,
      status: 1, assigneeId: input.assigneeId, assigneeName: userName(input.assigneeId), creatorId: 1, description: input.description, createDate: now(),
    };
    tickets.unshift(row);
    return delay(row);
  },
  updateStatus: (id: number, status: number) => {
    const t = tickets.find((x) => x.ticketId === id);
    if (t) t.status = status as 1 | 2 | 3 | 4;
    return delay(t);
  },
  addComment: (id: number, content: string) => {
    const row: TicketComment = { id: nextId(ticketComments, 'id'), ticketId: id, userId: 1, userName: userName(1), content, createDate: now() };
    ticketComments.push(row);
    return delay(row);
  },
};

// ---- 审批流 ----
const routes: ApprovalRoute[] = [
  { routeId: 1, businessType: 2, name: '合同审批流', nodes: [{ name: '部门主管审批', approverIds: [1] }, { name: '大客户负责人审批', approverIds: [6] }] },
  { routeId: 2, businessType: 1, name: '报价审批流', nodes: [{ name: '销售主管审批', approverIds: [1] }] },
];
const tasks: ApprovalTask[] = [
  {
    taskId: 1, businessType: 2, businessId: 1, businessName: '星辰云图 服务合同', routeId: 1,
    applicantId: 2, applicantName: '李娜', status: 2, currentNode: 0, nodeName: '部门主管审批', createDate: now(),
    nodes: [
      { nodeIndex: 0, name: '部门主管审批', approverIds: [1], action: 0 },
      { nodeIndex: 1, name: '大客户负责人审批', approverIds: [6], action: 0 },
    ],
  },
];
const qywx: QywxMessage[] = [
  { msgId: 1, toUserId: 1, toUserName: '张伟', content: '待审批：合同「星辰云图 服务合同」', channel: 'log', status: 1, createDate: now() },
];
function pushMsg(toUserId: number | null, content: string) {
  qywx.unshift({ msgId: nextId(qywx, 'msgId'), toUserId: toUserId ?? undefined, toUserName: toUserId ? userName(toUserId) : undefined, content, channel: 'log', status: 1, createDate: now() });
}
const ME = 1;
export const approvalsApi = {
  routes: (bt?: number) => delay(bt ? routes.filter((r) => r.businessType === bt) : routes),
  submit: (input: { businessType: number; businessId: number; businessName?: string; routeId?: number }) => {
    const route = routes.find((r) => (input.routeId ? r.routeId === input.routeId : r.businessType === input.businessType));
    const nodes: ApprovalTaskNode[] = (route?.nodes ?? [{ name: '审批', approverIds: [1] }]).map((n, i) => ({ nodeIndex: i, name: n.name, approverIds: n.approverIds, action: 0 }));
    const task: ApprovalTask = {
      taskId: nextId(tasks, 'taskId'), businessType: input.businessType, businessId: input.businessId, businessName: input.businessName,
      routeId: route?.routeId, applicantId: ME, applicantName: userName(ME), status: 2, currentNode: 0, nodeName: nodes[0]?.name, createDate: now(), nodes,
    };
    tasks.unshift(task);
    nodes[0]?.approverIds.forEach((a) => pushMsg(a, `待审批：「${input.businessName ?? ''}」`));
    return delay(task);
  },
  mine: (p: ListParams) =>
    paginate(tasks.filter((t) => t.status === 2 && t.nodes?.[t.currentNode]?.approverIds.includes(ME)), p, ['businessName']),
  initiated: (p: ListParams) => paginate(tasks.filter((t) => t.applicantId === ME), p, ['businessName']),
  acted: (p: ListParams) => {
    const rows = tasks
      .map((t) => {
        const n = t.nodes?.find((x) => x.actedBy === ME && x.action !== 0);
        return n ? { ...t, myAction: n.action, myActedAt: n.actedAt, myComment: n.comment } : null;
      })
      .filter(Boolean) as ApprovalTask[];
    return paginate(rows, p, ['businessName']);
  },
  get: (taskId: number) => delay(tasks.find((t) => t.taskId === taskId)),
  approve: (taskId: number, comment?: string) => {
    const t = tasks.find((x) => x.taskId === taskId);
    if (t && t.nodes) {
      const node = t.nodes[t.currentNode];
      node.action = 11; node.actedBy = ME; node.actedByName = userName(ME); node.comment = comment; node.actedAt = now();
      if (t.currentNode >= t.nodes.length - 1) { t.status = 11; pushMsg(t.applicantId, `你的「${t.businessName}」审批已通过`); }
      else { t.currentNode++; t.nodeName = t.nodes[t.currentNode].name; t.nodes[t.currentNode].approverIds.forEach((a) => pushMsg(a, `待审批：「${t.businessName}」`)); }
    }
    return delay({ status: t?.status });
  },
  reject: (taskId: number, comment?: string) => {
    const t = tasks.find((x) => x.taskId === taskId);
    if (t && t.nodes) {
      const node = t.nodes[t.currentNode];
      node.action = 3; node.actedBy = ME; node.comment = comment; node.actedAt = now();
      t.status = 3; pushMsg(t.applicantId, `你的「${t.businessName}」审批被驳回`);
    }
    return delay({ status: 3 });
  },
};

// ---- 企微 ----
export const qywxApi = {
  list: (p: ListParams) => paginate(qywx, p, ['content']),
  send: (toUserId: number | null, content: string) => {
    pushMsg(toUserId, content);
    return delay({ ok: true });
  },
};

export { TICKET_TYPE };
