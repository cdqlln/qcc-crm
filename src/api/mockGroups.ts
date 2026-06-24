// 集团客户 内存 Mock。
import { delay } from './client';
import { customers } from '@/mock/data';
import type { Customer, CustomerGroup } from '@/types';

const groups: { groupId: number; name: string; matchKey?: string; refCompanyId?: string }[] = [];
let gid = 5000;
const memberCount = (id: number) => customers.filter((c) => c.groupId === id).length;

export const groupsApi = {
  list: (): Promise<CustomerGroup[]> =>
    delay(groups.map((g) => ({ ...g, memberCount: memberCount(g.groupId) }))),
  create: (input: { name: string; matchKey?: string; refCompanyId?: string }) => {
    const groupId = ++gid;
    groups.push({ groupId, name: input.name, matchKey: input.matchKey, refCompanyId: input.refCompanyId });
    let attached = 0;
    if (input.matchKey) {
      for (const c of customers) {
        if (!c.groupId && c.name.includes(input.matchKey)) { c.groupId = groupId; attached++; }
      }
    }
    return delay({ groupId, attached });
  },
  update: (id: number, input: { name: string; matchKey?: string }) => {
    const g = groups.find((x) => x.groupId === id);
    if (g) { g.name = input.name; g.matchKey = input.matchKey; }
    return delay({ ok: true });
  },
  remove: (id: number) => {
    customers.forEach((c) => { if (c.groupId === id) c.groupId = null; });
    const i = groups.findIndex((g) => g.groupId === id);
    if (i >= 0) groups.splice(i, 1);
    return delay({ ok: true });
  },
  members: (id: number): Promise<Customer[]> => delay(customers.filter((c) => c.groupId === id)),
  // 按字号(核心词)模拟工商关系归集：未归属客户中同字号≥2 的聚成集团
  autoRegroup: () => {
    const key = (n: string) => n.replace(/(股份)?有限公司|集团|科技|信息技术|网络科技|智能科技|数据服务|电子商务|分公司/g, '').trim().slice(0, 4);
    const ungrouped = customers.filter((c) => c.category >= 3 && !c.groupId);
    const byKey: Record<string, Customer[]> = {};
    for (const c of ungrouped) (byKey[key(c.name)] ??= []).push(c);
    let grouped = 0;
    for (const [k, list] of Object.entries(byKey)) {
      if (list.length < 2 || !k) continue;
      const groupId = ++gid;
      groups.push({ groupId, name: `${k}集团`, matchKey: k });
      list.forEach((c) => { c.groupId = groupId; c.groupName = `${k}集团`; grouped++; });
    }
    return delay({ scanned: ungrouped.length, grouped });
  },
  setCustomerGroup: (customerId: number, groupId: number | null) => {
    const c = customers.find((x) => x.customerId === customerId);
    if (c) { c.groupId = groupId; c.groupName = groupId ? groups.find((g) => g.groupId === groupId)?.name : undefined; }
    return delay({ ok: true });
  },
};
