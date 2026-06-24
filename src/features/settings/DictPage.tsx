import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { dictApi } from '@/api/crm';
import { usePerm } from '@/store/auth';
import { useUI } from '@/store/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, Card, CardHeader } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Select, TextInput } from '@/components/ui/form';
import { StatusTag } from '@/components/ui/StatusTag';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import type { StatusKind } from '@/types';

const KINDS: { value: string; label: string }[] = [
  { value: 'info', label: '蓝' }, { value: 'success', label: '绿' }, { value: 'warning', label: '橙' },
  { value: 'danger', label: '红' }, { value: 'neutral', label: '灰' },
];

export function DictPage() {
  const { can } = usePerm();
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const [bt, setBt] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: types = [] } = useQuery({ queryKey: ['dict-biz'], queryFn: () => dictApi.bizTypes(), enabled: can('system.dict') });
  const activeBt = bt ?? types[0]?.businessType ?? null;
  const { data: items = [], isLoading } = useQuery({ queryKey: ['dict', activeBt], queryFn: () => dictApi.list(activeBt!), enabled: !!activeBt });

  if (!can('system.dict')) return <div><PageHeader title="字典配置" /><Card><EmptyState title="无权限" description="需要「系统-字段/字典」权限" /></Card></div>;

  const toggle = async (id: number, active: number) => { await dictApi.update(id, { active: active ? 0 : 1 }); qc.invalidateQueries({ queryKey: ['dict', activeBt] }); };
  const del = async (id: number) => { await dictApi.remove(id).then((r: any) => r?.ok === false ? toast('系统级字典不可删除', 'error') : null); qc.invalidateQueries({ queryKey: ['dict', activeBt] }); };

  return (
    <div>
      <PageHeader title="字典配置" description="维护来源/阶段/状态/标签等枚举；系统级只读，企业可增改自定义项" />
      <div className="grid grid-cols-[200px_1fr] gap-4">
        <Card className="h-fit">
          <CardHeader title="字典类型" />
          <div className="p-2">
            {types.map((t) => (
              <button key={t.businessType} onClick={() => setBt(t.businessType)}
                className={cn('block w-full rounded-md px-2.5 py-2 text-left text-sm', t.businessType === activeBt ? 'bg-primary-weak text-primary' : 'text-text-weak hover:bg-bg')}>
                {t.label}
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title={types.find((t) => t.businessType === activeBt)?.label ?? '字典项'}
            extra={<Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={13} />新增字典项</Button>} />
          {isLoading ? <TableSkeleton rows={5} cols={3} /> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border bg-bg/60 text-xs text-text-weak">
                <th className="px-3 py-2 text-left">名称</th><th className="px-3 py-2 text-left">颜色</th>
                <th className="px-3 py-2 text-right">排序</th><th className="px-3 py-2 text-center">来源</th>
                <th className="px-3 py-2 text-center">状态</th><th className="px-3 py-2"></th>
              </tr></thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.termId} className="border-b border-border last:border-0">
                    <td className="px-3 py-2">{it.systemLevel
                      ? <span className="text-text">{it.name}</span>
                      : <InlineName id={it.termId} value={it.name} bt={activeBt!} />}</td>
                    <td className="px-3 py-2">{it.kind ? <StatusTag kind={it.kind as StatusKind} label={KINDS.find((k) => k.value === it.kind)?.label ?? it.kind} dot={false} /> : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{it.order ?? 0}</td>
                    <td className="px-3 py-2 text-center">{it.systemLevel ? <span className="text-xs text-text-faint">系统</span> : <span className="text-xs text-primary">自定义</span>}</td>
                    <td className="px-3 py-2 text-center">
                      <StatusTag kind={it.active ? 'success' : 'neutral'} label={it.active ? '启用' : '停用'} dot={false} />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {!it.systemLevel && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => toggle(it.termId, it.active)} className="text-xs text-text-weak hover:text-primary">{it.active ? '停用' : '启用'}</button>
                          <button onClick={() => del(it.termId)} className="text-text-faint hover:text-danger"><Trash2 size={13} /></button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={6} className="py-8 text-center text-text-faint">暂无字典项</td></tr>}
              </tbody>
            </table>
          )}
        </Card>
      </div>

      {createOpen && activeBt && <CreateDict bt={activeBt} onClose={() => setCreateOpen(false)} onDone={() => { qc.invalidateQueries({ queryKey: ['dict', activeBt] }); setCreateOpen(false); }} />}
    </div>
  );
}

function InlineName({ id, value, bt }: { id: number; value: string; bt: number }) {
  const qc = useQueryClient();
  const [v, setV] = useState(value);
  return (
    <input value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && dictApi.update(id, { name: v }).then(() => qc.invalidateQueries({ queryKey: ['dict', bt] }))}
      className="rounded border border-transparent px-1 text-text hover:border-border focus:border-primary focus:outline-none" />
  );
}

function CreateDict({ bt, onClose, onDone }: { bt: number; onClose: () => void; onDone: () => void }) {
  const toast = useUI((s) => s.toast);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('info');
  const [order, setOrder] = useState('0');
  const submit = async () => {
    if (!name.trim()) return toast('请输入名称', 'error');
    await dictApi.create({ businessType: bt, name: name.trim(), kind, order: Number(order) || 0 });
    toast('已新增', 'success'); onDone();
  };
  return (
    <Dialog open onClose={onClose} title="新增字典项" width="w-[420px]"
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={submit}>保存</Button></>}>
      <div className="space-y-4">
        <Field label="名称"><TextInput value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="颜色"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</Select></Field>
        <Field label="排序"><TextInput value={order} onChange={(e) => setOrder(e.target.value.replace(/\D/g, ''))} /></Field>
      </div>
    </Dialog>
  );
}
