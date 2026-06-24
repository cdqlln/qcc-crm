import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building2, ChevronDown, ChevronRight, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { orgApi } from '@/api/crm';
import { usePerm } from '@/store/auth';
import { useUI } from '@/store/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, Card, CardHeader, CountBadge, UserCell } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Select, TextInput } from '@/components/ui/form';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import type { DeptNode } from '@/types';

function buildTree(flat: DeptNode[]): DeptNode[] {
  const map = new Map<number, DeptNode>();
  flat.forEach((d) => map.set(d.depId, { ...d, children: [] }));
  const roots: DeptNode[] = [];
  for (const d of map.values()) {
    if (d.parentId && map.has(d.parentId)) map.get(d.parentId)!.children!.push(d);
    else roots.push(d);
  }
  return roots;
}

export function OrgPage() {
  const { can } = usePerm();
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const [selId, setSelId] = useState<number | null>(null);
  const [dialog, setDialog] = useState<{ mode: 'create' | 'edit'; dept?: DeptNode } | null>(null);

  const { data: org } = useQuery({ queryKey: ['org'], queryFn: () => orgApi.info(), enabled: can('system.org') });
  const { data: depts = [], isLoading } = useQuery({ queryKey: ['departments'], queryFn: () => orgApi.departments(), enabled: can('system.org') });
  const tree = useMemo(() => buildTree(depts), [depts]);
  const sel = depts.find((d) => d.depId === selId) ?? null;

  if (!can('system.org')) {
    return <div><PageHeader title="组织 / 部门" /><Card><EmptyState title="无权限" description="需要「系统-组织/部门」权限才能访问本页" /></Card></div>;
  }

  const del = async (d: DeptNode) => {
    const r: any = await orgApi.removeDept(d.depId);
    if (r && r.ok === false) return toast('该部门有子部门或成员，无法删除', 'error');
    qc.invalidateQueries({ queryKey: ['departments'] });
    if (selId === d.depId) setSelId(null);
    toast('部门已删除', 'info');
  };

  return (
    <div>
      <PageHeader title="组织 / 部门" description="组织信息 + 部门树（增删改、调整层级）+ 成员归属" />

      <Card className="mb-4 p-4">
        <div className="flex items-center gap-3">
          <Building2 className="text-primary" />
          <div className="flex-1">
            <div className="text-sm text-text-faint">组织名称</div>
            <div className="text-md font-medium text-text">{org?.name ?? '—'}</div>
          </div>
          <Button size="sm" onClick={() => {
            const name = prompt('组织名称', org?.name ?? '');
            if (name && name.trim()) orgApi.updateInfo(name.trim()).then(() => { qc.invalidateQueries({ queryKey: ['org'] }); toast('已保存', 'success'); });
          }}><Pencil size={13} />重命名</Button>
        </div>
      </Card>

      <div className="grid grid-cols-[1fr_1fr] gap-4">
        <Card>
          <CardHeader title="部门树" extra={<Button size="sm" onClick={() => setDialog({ mode: 'create' })}><Plus size={13} />新建部门</Button>} />
          <div className="p-2">
            {isLoading ? <TableSkeleton rows={5} cols={1} /> :
              tree.length === 0 ? <EmptyState title="暂无部门" /> :
              tree.map((d) => <DeptRow key={d.depId} node={d} selId={selId} onSelect={setSelId} onEdit={(dept) => setDialog({ mode: 'edit', dept })} onDelete={del} onAddChild={(p) => setDialog({ mode: 'create', dept: p })} />)}
          </div>
        </Card>

        <Card>
          <CardHeader title={sel ? `${sel.name} · 成员` : '成员'} />
          {sel ? <Members depId={sel.depId} depts={depts} onMoved={() => qc.invalidateQueries({ queryKey: ['departments'] })} /> : <EmptyState title="选择左侧部门查看成员" />}
        </Card>
      </div>

      {dialog && <DeptDialog dialog={dialog} depts={depts} onClose={() => setDialog(null)} onDone={() => { qc.invalidateQueries({ queryKey: ['departments'] }); setDialog(null); }} />}
    </div>
  );
}

function DeptRow({ node, selId, onSelect, onEdit, onDelete, onAddChild, level = 0 }: {
  node: DeptNode; selId: number | null; level?: number;
  onSelect: (id: number) => void; onEdit: (d: DeptNode) => void; onDelete: (d: DeptNode) => void; onAddChild: (p: DeptNode) => void;
}) {
  const [open, setOpen] = useState(true);
  const hasKids = (node.children?.length ?? 0) > 0;
  return (
    <div>
      <div className={cn('group flex items-center gap-1 rounded-md px-2 py-1.5 hover:bg-bg', selId === node.depId && 'bg-primary-weak')}
        style={{ paddingLeft: 8 + level * 16 }}>
        <button onClick={() => setOpen((v) => !v)} className="text-text-faint">
          {hasKids ? (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />) : <span className="inline-block w-3.5" />}
        </button>
        <button onClick={() => onSelect(node.depId)} className={cn('flex flex-1 items-center gap-1.5 text-sm', selId === node.depId ? 'text-primary' : 'text-text')}>
          <Building2 size={14} />{node.name}
          <CountBadge count={node.memberCount} kind="neutral" />
        </button>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
          <button onClick={() => onAddChild(node)} title="加子部门" className="rounded p-1 text-text-faint hover:text-primary"><Plus size={13} /></button>
          <button onClick={() => onEdit(node)} title="编辑" className="rounded p-1 text-text-faint hover:text-primary"><Pencil size={12} /></button>
          <button onClick={() => onDelete(node)} title="删除" className="rounded p-1 text-text-faint hover:text-danger"><Trash2 size={12} /></button>
        </div>
      </div>
      {open && node.children?.map((c) => (
        <DeptRow key={c.depId} node={c} selId={selId} level={level + 1} onSelect={onSelect} onEdit={onEdit} onDelete={onDelete} onAddChild={onAddChild} />
      ))}
    </div>
  );
}

function Members({ depId, depts, onMoved }: { depId: number; depts: DeptNode[]; onMoved: () => void }) {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const { data: members = [], isLoading } = useQuery({ queryKey: ['dept-members', depId], queryFn: () => orgApi.members(depId) });
  const move = async (userId: number, to: number) => {
    await orgApi.moveUser(userId, to);
    qc.invalidateQueries({ queryKey: ['dept-members', depId] });
    qc.invalidateQueries({ queryKey: ['dept-members', to] });
    onMoved();
    toast('已调整成员部门', 'success');
  };
  if (isLoading) return <TableSkeleton rows={4} cols={2} />;
  if (members.length === 0) return <EmptyState title="该部门暂无成员" />;
  return (
    <div className="divide-y divide-border">
      {members.map((m) => (
        <div key={m.userId} className="flex items-center gap-3 px-4 py-2.5">
          <UserCell name={m.name} />
          {m.position === 1 && <span className="rounded bg-primary-weak px-1.5 py-0.5 text-xs text-primary">主管</span>}
          <Select className="ml-auto w-44" value={depId} onChange={(e) => move(m.userId, Number(e.target.value))}>
            {depts.map((d) => <option key={d.depId} value={d.depId}>{'　'.repeat(d.depth)}{d.name}</option>)}
          </Select>
        </div>
      ))}
    </div>
  );
}

function DeptDialog({ dialog, depts, onClose, onDone }: { dialog: { mode: 'create' | 'edit'; dept?: DeptNode }; depts: DeptNode[]; onClose: () => void; onDone: () => void }) {
  const toast = useUI((s) => s.toast);
  const editing = dialog.mode === 'edit';
  const [name, setName] = useState(editing ? dialog.dept!.name : '');
  // create: dept(if provided)=父部门；edit: dept=当前，parent=parentId
  const [parentId, setParentId] = useState<number | ''>(editing ? (dialog.dept!.parentId ?? '') : (dialog.dept?.depId ?? ''));

  const submit = async () => {
    if (!name.trim()) return toast('请输入部门名称', 'error');
    try {
      if (editing) await orgApi.updateDept(dialog.dept!.depId, { name: name.trim(), parentId: parentId ? Number(parentId) : undefined });
      else await orgApi.createDept({ name: name.trim(), parentId: parentId ? Number(parentId) : undefined });
      toast('已保存', 'success');
      onDone();
    } catch (e) { toast(e instanceof Error ? e.message : '保存失败', 'error'); }
  };
  const options = depts.filter((d) => !editing || d.depId !== dialog.dept!.depId);
  return (
    <Dialog open onClose={onClose} title={editing ? '编辑部门' : '新建部门'} width="w-[440px]"
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={submit}>保存</Button></>}>
      <div className="space-y-4">
        <Field label="部门名称"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="上级部门" hint="留空为顶级部门">
          <Select value={parentId} onChange={(e) => setParentId(e.target.value ? Number(e.target.value) : '')}>
            <option value="">（顶级）</option>
            {options.map((d) => <option key={d.depId} value={d.depId}>{'　'.repeat(d.depth)}{d.name}</option>)}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}
