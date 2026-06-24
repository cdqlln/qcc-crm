// RBAC 内存 Mock（无后端时使用），与 backend 同签名。
import { delay } from './client';
import { MOCK_USERS, userName } from '@/mock/org';
import type { PermissionItem, Role, UserRoles } from '@/types';

const PERMS: PermissionItem[] = [
  ['lead.view', '线索-查看', '线索'], ['lead.edit', '线索-编辑/转化', '线索'], ['lead.assign', '线索-分配/领取', '线索'], ['lead.export', '线索-导出', '线索'],
  ['customer.view', '客户-查看', '客户'], ['customer.edit', '客户-编辑', '客户'], ['customer.transfer', '客户-移交', '客户'], ['customer.export', '客户-导出', '客户'], ['customer.delete', '客户-删除/退公海', '客户'],
  ['opportunity.view', '商机-查看', '商机'], ['opportunity.edit', '商机-编辑', '商机'],
  ['quotation.view', '报价-查看', '报价'], ['quotation.edit', '报价-编辑', '报价'], ['quotation.approve', '报价/单据-审批', '审批'],
  ['contract.view', '合同-查看', '合同'], ['contract.edit', '合同-编辑', '合同'], ['finance.view', '资金-查看', '资金'],
  ['system.org', '系统-组织/部门', '系统'], ['system.role', '系统-角色权限', '系统'], ['system.dict', '系统-字段/字典', '系统'], ['system.audit', '系统-日志审计', '系统'],
].map(([code, name, module], i) => ({ permissionId: i + 1, code, name, module, type: code.startsWith('system') || code.includes('delete') || code.includes('approve') ? 20 : 10 }));

const allCodes = PERMS.map((p) => p.code);
const roles: Role[] = [
  { roleId: 1, name: '销售员', scope: 1, permissions: ['lead.view', 'lead.edit', 'lead.assign', 'lead.export', 'customer.view', 'customer.edit', 'opportunity.view', 'opportunity.edit', 'quotation.view', 'quotation.edit', 'contract.view', 'finance.view'], userCount: 5 },
  { roleId: 2, name: '销售主管', scope: 3, permissions: allCodes.filter((c) => !c.startsWith('system')), userCount: 3 },
  { roleId: 3, name: '管理员', scope: 4, permissions: allCodes, userCount: 1 },
];
const SCOPE: Record<number, string> = { 1: '本人', 2: '本部门', 3: '本部门及下属', 4: '全公司' };
const userRoleMap: Record<number, number[]> = { 1: [3], 2: [1], 3: [1], 4: [2], 5: [1], 6: [2], 7: [1], 8: [1] };

// 计算用户的权限/数据范围（mock 模式供 authApi 使用）
export function mockAuthz(userId: number): { scope: number; permissions: string[]; isAdmin: boolean } {
  const rids = userRoleMap[userId] ?? [];
  const myRoles = roles.filter((r) => rids.includes(r.roleId));
  const scope = myRoles.reduce((m, r) => Math.max(m, r.scope), 1);
  const permissions = [...new Set(myRoles.flatMap((r) => r.permissions))];
  return { scope, permissions, isAdmin: scope >= 4 || permissions.includes('system.role') };
}

export const rolesApi = {
  permissions: () => delay(PERMS),
  list: () => delay(roles.map((r) => ({ ...r, scopeName: SCOPE[r.scope] }))),
  create: (input: { name: string; scope: number }) => {
    const roleId = roles.reduce((m, r) => Math.max(m, r.roleId), 0) + 1;
    roles.push({ roleId, name: input.name, scope: input.scope, permissions: [], userCount: 0 });
    return delay({ roleId });
  },
  update: (id: number, input: { name: string; scope: number }) => {
    const r = roles.find((x) => x.roleId === id);
    if (r) { r.name = input.name; r.scope = input.scope; }
    return delay({ ok: true });
  },
  remove: (id: number) => {
    const i = roles.findIndex((x) => x.roleId === id);
    if (i >= 0) roles.splice(i, 1);
    return delay({ ok: true });
  },
  setPermissions: (id: number, codes: string[]) => {
    const r = roles.find((x) => x.roleId === id);
    if (r) r.permissions = codes;
    return delay({ ok: true, count: codes.length });
  },
  usersRoles: (): Promise<UserRoles[]> =>
    delay(MOCK_USERS.map((u) => ({ userId: u.userId, name: u.name, depName: u.depName, roleIds: userRoleMap[u.userId] ?? [] }))),
  setUserRoles: (userId: number, roleIds: number[]) => {
    userRoleMap[userId] = roleIds;
    return delay({ ok: true });
  },
};
void userName;
