// 组织/部门 内存 Mock（无后端时使用）。
import { delay } from './client';
import { MOCK_DEPARTMENTS, MOCK_USERS } from '@/mock/org';
import type { DeptMember, DeptNode, OrgInfo } from '@/types';

const org: OrgInfo = { organizationId: 1, name: '企查查科技', refCompanyId: 'QCC00000001' };

const nextDeptId = () => MOCK_DEPARTMENTS.reduce((m, d) => Math.max(m, d.depId), 0) + 1;
const memberCount = (depId: number) => MOCK_USERS.filter((u) => u.depId === depId).length;

export const orgApi = {
  info: () => delay(org),
  updateInfo: (name: string) => { org.name = name; return delay({ ok: true }); },
  departments: (): Promise<DeptNode[]> =>
    delay(
      MOCK_DEPARTMENTS.slice().sort((a, b) => a.path.localeCompare(b.path)).map((d) => ({
        depId: d.depId, parentId: d.parentId || null, name: d.name, path: d.path, depth: d.depth, memberCount: memberCount(d.depId),
      })),
    ),
  createDept: (input: { name: string; parentId?: number }) => {
    const id = nextDeptId();
    const parent = input.parentId ? MOCK_DEPARTMENTS.find((d) => d.depId === input.parentId) : undefined;
    MOCK_DEPARTMENTS.push({
      depId: id, name: input.name, parentId: input.parentId ?? 0,
      path: parent ? `${parent.path},${id}` : `${id}`, depth: parent ? parent.depth + 1 : 0,
    });
    return delay({ depId: id });
  },
  updateDept: (id: number, input: { name: string; parentId?: number }) => {
    const d = MOCK_DEPARTMENTS.find((x) => x.depId === id);
    if (d) {
      d.name = input.name;
      if (input.parentId !== undefined && input.parentId !== d.parentId && input.parentId !== id) {
        const np = MOCK_DEPARTMENTS.find((x) => x.depId === input.parentId);
        const oldPath = d.path;
        d.parentId = input.parentId;
        d.path = np ? `${np.path},${id}` : `${id}`;
        d.depth = np ? np.depth + 1 : 0;
        // 子树前缀替换
        for (const c of MOCK_DEPARTMENTS) {
          if (c.path.startsWith(oldPath + ',')) {
            c.path = d.path + c.path.slice(oldPath.length);
            c.depth = c.path.split(',').length - 1;
          }
        }
      }
    }
    return delay({ ok: true });
  },
  removeDept: (id: number) => {
    if (MOCK_DEPARTMENTS.some((d) => d.parentId === id)) return delay({ ok: false } as any);
    if (memberCount(id) > 0) return delay({ ok: false } as any);
    const i = MOCK_DEPARTMENTS.findIndex((d) => d.depId === id);
    if (i >= 0) MOCK_DEPARTMENTS.splice(i, 1);
    return delay({ ok: true });
  },
  members: (id: number): Promise<DeptMember[]> =>
    delay(MOCK_USERS.filter((u) => u.depId === id).map((u) => ({ userId: u.userId, name: u.name, position: u.position, status: 1, username: undefined }))),
  moveUser: (userId: number, departmentId: number) => {
    const u = MOCK_USERS.find((x) => x.userId === userId);
    if (u) { u.depId = departmentId; u.depName = MOCK_DEPARTMENTS.find((d) => d.depId === departmentId)?.name; }
    return delay({ ok: true });
  },
};
