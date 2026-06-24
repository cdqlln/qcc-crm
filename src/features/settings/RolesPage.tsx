import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Save, Shield, Trash2, Users } from 'lucide-react';
import { rolesApi } from '@/api/crm';
import { useUI } from '@/store/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, Card, CardHeader, CountBadge } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Select, TextInput } from '@/components/ui/form';
import { Tabs } from '@/components/ui/Tabs';
import { usePerm } from '@/store/auth';
import { EmptyState } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import type { PermissionItem, Role, UserRoles } from '@/types';

const SCOPES = [
  { value: 1, label: '本人' },
  { value: 2, label: '本部门' },
  { value: 3, label: '本部门及下属' },
  { value: 4, label: '全公司' },
];

export function RolesPage() {
  const [tab, setTab] = useState('roles');
  const { can } = usePerm();
  if (!can('system.role')) {
    return (
      <div>
        <PageHeader title="角色权限" />
        <Card><EmptyState title="无权限" description="需要「系统-角色权限」权限才能访问本页" /></Card>
      </div>
    );
  }
  return (
    <div>
      <PageHeader title="角色权限" description="RBAC：功能权限点 + 数据范围(本人/部门/下属/全公司) + 成员分配" />
      <div className="mb-3">
        <Tabs items={[{ key: 'roles', label: '角色与权限' }, { key: 'members', label: '成员分配' }]} value={tab} onChange={setTab} className="border-0" />
      </div>
      {tab === 'roles' ? <RoleEditor /> : <MemberAssign />}
    </div>
  );
}

function RoleEditor() {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: () => rolesApi.list() });
  const { data: perms = [] } = useQuery({ queryKey: ['permissions'], queryFn: () => rolesApi.permissions() });
  const [activeId, setActiveId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState(1);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);

  const active = roles.find((r) => r.roleId === activeId) ?? roles[0];
  useEffect(() => {
    if (active) {
      setActiveId(active.roleId);
      setName(active.name);
      setScope(active.scope);
      setChecked(new Set(active.permissions));
    }
  }, [active?.roleId]);

  const groups = useMemo(() => {
    const m = new Map<string, PermissionItem[]>();
    for (const p of perms) { const a = m.get(p.module) ?? []; a.push(p); m.set(p.module, a); }
    return [...m.entries()];
  }, [perms]);

  const toggle = (code: string) => setChecked((s) => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  const toggleGroup = (items: PermissionItem[]) => setChecked((s) => {
    const n = new Set(s); const allOn = items.every((i) => n.has(i.code));
    items.forEach((i) => (allOn ? n.delete(i.code) : n.add(i.code))); return n;
  });

  const save = async () => {
    if (!active) return;
    await rolesApi.update(active.roleId, { name, scope });
    await rolesApi.setPermissions(active.roleId, [...checked]);
    qc.invalidateQueries({ queryKey: ['roles'] });
    toast('角色已保存', 'success');
  };
  const del = async () => {
    if (!active) return;
    if (active.userCount > 0) return toast('该角色仍有成员，无法删除', 'error');
    await rolesApi.remove(active.roleId);
    setActiveId(null);
    qc.invalidateQueries({ queryKey: ['roles'] });
    toast('角色已删除', 'info');
  };

  return (
    <div className="grid grid-cols-[240px_1fr] gap-4">
      <Card className="h-fit">
        <CardHeader title="角色" extra={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={13} />新建</Button>} />
        <div className="p-2">
          {roles.map((r) => (
            <button key={r.roleId} onClick={() => setActiveId(r.roleId)}
              className={cn('flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm', r.roleId === active?.roleId ? 'bg-primary-weak text-primary' : 'text-text-weak hover:bg-bg')}>
              <span className="flex items-center gap-1.5"><Shield size={14} />{r.name}</span>
              <CountBadge count={r.userCount} kind="neutral" />
            </button>
          ))}
        </div>
      </Card>

      {active && (
        <Card>
          <CardHeader title={`编辑角色 · ${active.name}`} extra={
            <div className="flex gap-2">
              <Button variant="danger" size="sm" onClick={del}><Trash2 size={13} />删除</Button>
              <Button variant="primary" size="sm" onClick={save}><Save size={13} />保存</Button>
            </div>} />
          <div className="space-y-5 p-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="角色名称"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
              <Field label="数据范围" hint="决定该角色可见数据：本人 / 本部门 / 含下属 / 全公司">
                <Select value={scope} onChange={(e) => setScope(Number(e.target.value))}>
                  {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </Select>
              </Field>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-text">功能权限</div>
              <div className="space-y-3">
                {groups.map(([module, items]) => {
                  const allOn = items.every((i) => checked.has(i.code));
                  return (
                    <div key={module} className="rounded-lg border border-border p-3">
                      <label className="flex items-center gap-2 text-sm font-medium text-text">
                        <input type="checkbox" checked={allOn} onChange={() => toggleGroup(items)} />
                        {module}
                      </label>
                      <div className="mt-2 grid grid-cols-3 gap-2">
                        {items.map((p) => (
                          <label key={p.code} className="flex items-center gap-1.5 text-sm text-text-weak">
                            <input type="checkbox" checked={checked.has(p.code)} onChange={() => toggle(p.code)} />
                            {p.name}
                            {p.type === 20 && <span className="rounded bg-[#FDECEC] px-1 text-[10px] text-danger">管理</span>}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      )}

      {createOpen && <CreateRole onClose={() => setCreateOpen(false)} onCreated={() => qc.invalidateQueries({ queryKey: ['roles'] })} />}
    </div>
  );
}

function CreateRole({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useUI((s) => s.toast);
  const [name, setName] = useState('');
  const [scope, setScope] = useState(1);
  const submit = async () => {
    if (!name.trim()) return toast('请输入角色名称', 'error');
    await rolesApi.create({ name: name.trim(), scope });
    onCreated(); onClose();
    toast('角色已创建', 'success');
  };
  return (
    <Dialog open onClose={onClose} title="新建角色" width="w-[420px]"
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={submit}>创建</Button></>}>
      <div className="space-y-4">
        <Field label="角色名称"><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="如：KA 大客户经理" /></Field>
        <Field label="数据范围">
          <Select value={scope} onChange={(e) => setScope(Number(e.target.value))}>
            {SCOPES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

function MemberAssign() {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const { data: roles = [] } = useQuery({ queryKey: ['roles'], queryFn: () => rolesApi.list() });
  const { data: users = [] } = useQuery({ queryKey: ['users-roles'], queryFn: () => rolesApi.usersRoles() });

  const setRole = async (u: UserRoles, roleId: number, on: boolean) => {
    const next = on ? [...new Set([...u.roleIds, roleId])] : u.roleIds.filter((r) => r !== roleId);
    await rolesApi.setUserRoles(u.userId, next);
    qc.invalidateQueries({ queryKey: ['users-roles'] });
    qc.invalidateQueries({ queryKey: ['roles'] });
    toast(`已更新 ${u.name} 的角色`, 'success');
  };

  return (
    <Card>
      <CardHeader title={<span className="flex items-center gap-2"><Users size={16} />成员角色分配</span>} />
      <div className="overflow-x-auto p-3">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-bg/60 text-xs text-text-weak">
              <th className="px-3 py-2 text-left">成员</th>
              <th className="px-3 py-2 text-left">部门</th>
              {roles.map((r) => <th key={r.roleId} className="px-3 py-2 text-center">{r.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {(users as UserRoles[]).map((u) => (
              <tr key={u.userId} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium text-text">{u.name}</td>
                <td className="px-3 py-2 text-text-weak">{u.depName}</td>
                {roles.map((r) => (
                  <td key={r.roleId} className="px-3 py-2 text-center">
                    <input type="checkbox" checked={u.roleIds.includes(r.roleId)} onChange={(e) => setRole(u, r.roleId, e.target.checked)} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
