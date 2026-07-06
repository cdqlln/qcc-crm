import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Building, ChevronRight, Pencil, Plus, Trash2, UserRound } from 'lucide-react';
import { customersApi } from '@/api/crm';
import { useUI } from '@/store/ui';
import { Button } from '@/components/ui/primitives';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import type { Contact, CustomerOrgNode } from '@/types';

/**
 * 客户组织结构收集管理：销售调研记录客户内部架构（部门树），
 * 联系人挂到节点展示（KP 关键人高亮），帮助识别决策链。
 */
export function CustomerOrgTab({ customerId }: { customerId: number }) {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const { data: nodes = [], isLoading } = useQuery({ queryKey: ['cust-org', customerId], queryFn: () => customersApi.orgNodes(customerId) });
  const { data: contactList = [] } = useQuery({ queryKey: ['contacts', customerId], queryFn: () => customersApi.contacts(customerId) });
  const [adding, setAdding] = useState<{ parentId: number | null } | null>(null);
  const [renaming, setRenaming] = useState<CustomerOrgNode | null>(null);
  const [nameInput, setNameInput] = useState('');

  const refresh = () => qc.invalidateQueries({ queryKey: ['cust-org', customerId] });

  const submitAdd = async () => {
    if (!nameInput.trim()) return toast('请填写部门/组织名称', 'error');
    try {
      await customersApi.createOrgNode(customerId, { name: nameInput.trim(), parentId: adding?.parentId ?? null });
      setAdding(null); setNameInput(''); refresh();
    } catch (e) { toast(e instanceof Error ? e.message : '创建失败', 'error'); }
  };
  const submitRename = async () => {
    if (!renaming || !nameInput.trim()) return;
    await customersApi.renameOrgNode(renaming.nodeId, nameInput.trim());
    setRenaming(null); setNameInput(''); refresh();
  };
  const del = async (n: CustomerOrgNode) => {
    await customersApi.removeOrgNode(n.nodeId);
    toast(`已删除「${n.name}」（子部门级联删除，联系人自动解挂）`, 'info');
    refresh();
    qc.invalidateQueries({ queryKey: ['contacts', customerId] });
  };

  const children = (pid: number | null) => nodes.filter((n) => n.parentId === pid);
  const nodeContacts = (nid: number) => contactList.filter((c) => c.orgNodeId === nid);
  const unassigned = contactList.filter((c) => !c.orgNodeId);

  const renderNode = (n: CustomerOrgNode, depth: number) => (
    <div key={n.nodeId}>
      <div className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-bg" style={{ marginLeft: depth * 20 }}>
        <ChevronRight size={13} className="text-text-faint" />
        <Building size={14} className="text-primary" />
        <span className="text-sm font-medium text-text">{n.name}</span>
        {/* 节点下联系人（KP 高亮） */}
        <span className="flex flex-wrap items-center gap-1.5">
          {nodeContacts(n.nodeId).map((c) => <ContactChip key={c.contactId} c={c} />)}
        </span>
        <span className="ml-auto flex items-center gap-1.5 opacity-0 group-hover:opacity-100">
          <button onClick={() => { setAdding({ parentId: n.nodeId }); setNameInput(''); }} className="text-text-faint hover:text-primary" title="添加子部门"><Plus size={13} /></button>
          <button onClick={() => { setRenaming(n); setNameInput(n.name); }} className="text-text-faint hover:text-primary" title="重命名"><Pencil size={13} /></button>
          <button onClick={() => del(n)} className="text-text-faint hover:text-danger" title="删除（子部门级联，联系人解挂）"><Trash2 size={13} /></button>
        </span>
      </div>
      {(adding?.parentId === n.nodeId || renaming?.nodeId === n.nodeId) && (
        <InlineInput depth={depth + 1} value={nameInput} onChange={setNameInput}
          onOk={renaming ? submitRename : submitAdd} onCancel={() => { setAdding(null); setRenaming(null); }} />
      )}
      {children(n.nodeId).map((c) => renderNode(c, depth + 1))}
    </div>
  );

  if (isLoading) return <TableSkeleton rows={4} cols={1} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-text-faint">记录客户内部组织架构与关键人分布，联系人可在「联系人」页挂到对应部门；KP=关键决策人。</p>
        <Button size="sm" variant="primary" onClick={() => { setAdding({ parentId: null }); setNameInput(''); }}><Plus size={13} />添加一级部门</Button>
      </div>

      {adding && adding.parentId === null && (
        <InlineInput depth={0} value={nameInput} onChange={setNameInput} onOk={submitAdd} onCancel={() => setAdding(null)} />
      )}

      {nodes.length === 0 && !adding ? (
        <EmptyState title="尚未收集组织结构" description="点击「添加一级部门」开始，如：采购部 / 技术部 / 财务部" />
      ) : (
        <div className="rounded-lg border border-border p-2">{children(null).map((n) => renderNode(n, 0))}</div>
      )}

      {unassigned.length > 0 && (
        <div className="rounded-lg border border-dashed border-border p-3">
          <div className="mb-1.5 text-xs text-text-faint">未挂到部门的联系人（在联系人编辑中选择「所属部门节点」）</div>
          <div className="flex flex-wrap gap-1.5">{unassigned.map((c) => <ContactChip key={c.contactId} c={c} />)}</div>
        </div>
      )}
    </div>
  );
}

function ContactChip({ c }: { c: Contact }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
      c.isKp ? 'border-warning bg-warning/10 font-medium text-warning' : 'border-border text-text-weak')}>
      <UserRound size={11} />
      {c.name}
      {c.isKp && <b>KP</b>}
      {c.position && <span className="text-[10px] opacity-80">{c.position}</span>}
    </span>
  );
}

function InlineInput({ depth, value, onChange, onOk, onCancel }: {
  depth: number; value: string; onChange: (v: string) => void; onOk: () => void; onCancel: () => void;
}) {
  return (
    <div className="my-1 flex items-center gap-2" style={{ marginLeft: depth * 20 + 24 }}>
      <input autoFocus value={value} onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') onOk(); if (e.key === 'Escape') onCancel(); }}
        placeholder="部门/组织名称，回车确认"
        className="h-8 w-56 rounded-md border border-primary px-2.5 text-sm outline-none" />
      <button onClick={onOk} className="text-xs text-primary">确定</button>
      <button onClick={onCancel} className="text-xs text-text-faint">取消</button>
    </div>
  );
}
