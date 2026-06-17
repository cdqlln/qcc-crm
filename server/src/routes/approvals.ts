import { Router } from 'express';
import { one, query, tx } from '../db.js';
import { ah, ctx, fail, ok, parseList } from '../http.js';
import { runList } from '../list.js';
import { pushMessage } from '../services/wecom.js';

export const approvalsRouter = Router();

// 业务单据映射（审批结果回写其 approval 列）
const DOC: Record<number, { table: string; idCol: string; label: string }> = {
  1: { table: 'quotation', idCol: 'quotation_id', label: '报价' },
  2: { table: 'contract', idCol: 'contract_id', label: '合同' },
  5: { table: 'invoice', idCol: 'invoice_id', label: '发票' },
  6: { table: 'pre_credit', idCol: 'pre_credit_id', label: '预授信' },
  7: { table: 'opportunity', idCol: 'opportunity_id', label: '商机' },
};

async function setDocApproval(bt: number, bid: number, orgId: number, approval: number) {
  const d = DOC[bt];
  if (!d) return;
  await one(`UPDATE ${d.table} SET approval=$1 WHERE ${d.idCol}=$2 AND organization_id=$3`, [approval, bid, orgId]);
}

const mapTask = (r: any) => ({
  taskId: r.task_id, businessType: r.business_type, businessId: r.business_id, businessName: r.business_name,
  routeId: r.route_id, applicantId: r.applicant_id, applicantName: r.applicant_name,
  status: r.status, currentNode: r.current_node, nodeName: r.node_name, createDate: r.created_at,
  myAction: r.my_action, myActedAt: r.my_acted_at, myComment: r.my_comment,
});

// 审批路由模板
approvalsRouter.get('/approvals/routes', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const bt = req.query.businessType ? Number(req.query.businessType) : null;
  const rows = await query(
    `SELECT * FROM work_flow_route WHERE organization_id=$1 AND active=1 ${bt ? 'AND business_type=$2' : ''} ORDER BY business_type`,
    bt ? [orgId, bt] : [orgId]);
  ok(res, rows.map((r: any) => ({ routeId: r.route_id, businessType: r.business_type, name: r.name, nodes: r.nodes })));
}));

// 发起审批
approvalsRouter.post('/approvals/submit', ah(async (req, res) => {
  const { orgId, userId } = ctx(req);
  const bt = Number(req.body?.businessType);
  const bid = Number(req.body?.businessId);
  const name = String(req.body?.businessName || '');
  if (!bt || !bid) return fail(res, '缺少 businessType/businessId');
  const route = await one<any>(
    req.body?.routeId
      ? `SELECT * FROM work_flow_route WHERE route_id=$1 AND organization_id=$2`
      : `SELECT * FROM work_flow_route WHERE organization_id=$2 AND business_type=$1 AND active=1 ORDER BY route_id LIMIT 1`,
    req.body?.routeId ? [req.body.routeId, orgId] : [bt, orgId]);
  if (!route) return fail(res, '未配置该单据的审批流');
  const nodes: { name: string; approverIds: number[] }[] = route.nodes ?? [];
  if (nodes.length === 0) return fail(res, '审批流无节点');

  const task = await tx(async (c) => {
    const t = (await c.query(
      `INSERT INTO work_flow_task (organization_id, business_type, business_id, business_name, route_id, applicant_id, status, current_node)
       VALUES ($1,$2,$3,$4,$5,$6,2,0) RETURNING *`,
      [orgId, bt, bid, name, route.route_id, userId])).rows[0];
    for (let i = 0; i < nodes.length; i++) {
      await c.query(
        `INSERT INTO work_flow_task_node (task_id, node_index, name, approver_ids) VALUES ($1,$2,$3,$4)`,
        [t.task_id, i, nodes[i].name, nodes[i].approverIds ?? []]);
    }
    return t;
  });
  await setDocApproval(bt, bid, orgId, 2); // 进行中
  for (const a of nodes[0].approverIds ?? []) await pushMessage(orgId, a, `待审批：${DOC[bt]?.label ?? ''}「${name}」`, bt, bid);
  ok(res, mapTask(task));
}));

// 待我审批
approvalsRouter.post('/approvals/mine', ah(async (req, res) => {
  const { orgId, userId } = ctx(req);
  const body = parseList(req);
  const result = await runList({
    table: `work_flow_task t
      JOIN work_flow_task_node n ON n.task_id=t.task_id AND n.node_index=t.current_node
      LEFT JOIN app_user a ON a.user_id=t.applicant_id`,
    select: 't.*, n.name AS node_name, a.name AS applicant_name',
    defaultOrder: 't.created_at DESC',
    baseConds: ['t.organization_id=$1', 't.status=2', '$2 = ANY(n.approver_ids)'],
    baseParams: [orgId, userId], mapRow: mapTask,
  }, body);
  ok(res, result);
}));

// 我发起的
approvalsRouter.post('/approvals/initiated', ah(async (req, res) => {
  const { orgId, userId } = ctx(req);
  const body = parseList(req);
  const result = await runList({
    table: 'work_flow_task t LEFT JOIN app_user a ON a.user_id=t.applicant_id',
    select: 't.*, a.name AS applicant_name',
    defaultOrder: 't.created_at DESC',
    baseConds: ['t.organization_id=$1', 't.applicant_id=$2'],
    baseParams: [orgId, userId], mapRow: mapTask,
  }, body);
  ok(res, result);
}));

// 已审：我审批过的历史记录（含我的处理动作与时间）
approvalsRouter.post('/approvals/acted', ah(async (req, res) => {
  const { orgId, userId } = ctx(req);
  const body = parseList(req);
  const result = await runList({
    table: `work_flow_task t
      JOIN work_flow_task_node n ON n.task_id=t.task_id AND n.acted_by=$2
      LEFT JOIN app_user a ON a.user_id=t.applicant_id`,
    select: 't.*, a.name AS applicant_name, n.action AS my_action, n.acted_at AS my_acted_at, n.comment AS my_comment',
    defaultOrder: 'n.acted_at DESC',
    baseConds: ['t.organization_id=$1', 'n.acted_by=$2', 'n.action <> 0'],
    baseParams: [orgId, userId], mapRow: mapTask,
  }, body);
  ok(res, result);
}));

// 任务详情 + 节点
approvalsRouter.get('/approvals/:taskId', ah(async (req, res) => {
  const { orgId } = ctx(req);
  const t = await one<any>(
    `SELECT t.*, a.name AS applicant_name FROM work_flow_task t LEFT JOIN app_user a ON a.user_id=t.applicant_id
     WHERE t.task_id=$1 AND t.organization_id=$2`, [req.params.taskId, orgId]);
  if (!t) return fail(res, '审批任务不存在', 1, 404);
  const nodes = await query(
    `SELECT n.*, u.name AS acted_by_name FROM work_flow_task_node n LEFT JOIN app_user u ON u.user_id=n.acted_by
     WHERE n.task_id=$1 ORDER BY n.node_index`, [t.task_id]);
  ok(res, {
    ...mapTask(t),
    nodes: nodes.map((n: any) => ({
      nodeIndex: n.node_index, name: n.name, approverIds: n.approver_ids,
      action: n.action, actedBy: n.acted_by, actedByName: n.acted_by_name, comment: n.comment, actedAt: n.acted_at,
    })),
  });
}));

async function act(taskId: number, orgId: number, userId: number, approve: boolean, comment: string, res: any) {
  const t = await one<any>(`SELECT * FROM work_flow_task WHERE task_id=$1 AND organization_id=$2`, [taskId, orgId]);
  if (!t) return fail(res, '审批任务不存在', 1, 404);
  if (t.status !== 2) return fail(res, '该审批已结束');
  const node = await one<any>(`SELECT * FROM work_flow_task_node WHERE task_id=$1 AND node_index=$2`, [taskId, t.current_node]);
  if (!node || !(node.approver_ids ?? []).map(Number).includes(userId)) return fail(res, '你不是当前节点审批人', 1, 403);

  const nodeCount = await one<{ c: number }>(`SELECT count(*)::int c FROM work_flow_task_node WHERE task_id=$1`, [taskId]);
  await one(`UPDATE work_flow_task_node SET action=$1, acted_by=$2, comment=$3, acted_at=now() WHERE id=$4`,
    [approve ? 11 : 3, userId, comment || null, node.id]);

  if (!approve) {
    await one(`UPDATE work_flow_task SET status=3 WHERE task_id=$1`, [taskId]);
    await setDocApproval(t.business_type, t.business_id, orgId, 3);
    await pushMessage(orgId, t.applicant_id, `你的「${t.business_name}」审批被驳回`, t.business_type, t.business_id);
    return ok(res, { status: 3 });
  }
  const isLast = t.current_node >= (nodeCount!.c - 1);
  if (isLast) {
    await one(`UPDATE work_flow_task SET status=11 WHERE task_id=$1`, [taskId]);
    await setDocApproval(t.business_type, t.business_id, orgId, 11);
    await pushMessage(orgId, t.applicant_id, `你的「${t.business_name}」审批已通过`, t.business_type, t.business_id);
    return ok(res, { status: 11 });
  }
  const next = t.current_node + 1;
  await one(`UPDATE work_flow_task SET current_node=$1 WHERE task_id=$2`, [next, taskId]);
  const nn = await one<any>(`SELECT approver_ids FROM work_flow_task_node WHERE task_id=$1 AND node_index=$2`, [taskId, next]);
  for (const a of (nn?.approver_ids ?? [])) await pushMessage(orgId, a, `待审批：「${t.business_name}」`, t.business_type, t.business_id);
  ok(res, { status: 2, currentNode: next });
}

approvalsRouter.post('/approvals/:taskId/approve', ah(async (req, res) => {
  const { orgId, userId } = ctx(req);
  await act(Number(req.params.taskId), orgId, userId, true, String(req.body?.comment || ''), res);
}));
approvalsRouter.post('/approvals/:taskId/reject', ah(async (req, res) => {
  const { orgId, userId } = ctx(req);
  await act(Number(req.params.taskId), orgId, userId, false, String(req.body?.comment || ''), res);
}));
