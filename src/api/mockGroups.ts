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
  setCustomerGroup: (customerId: number, groupId: number | null) => {
    const c = customers.find((x) => x.customerId === customerId);
    if (c) { c.groupId = groupId; c.groupName = groupId ? groups.find((g) => g.groupId === groupId)?.name : undefined; }
    return delay({ ok: true });
  },
};
