import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DatabaseZap, ListPlus, Trash2 } from 'lucide-react';
import { apiPricesApi } from '@/api/crm';
import { usePerm } from '@/store/auth';
import { useUI } from '@/store/ui';
import { PageHeader, SearchInput } from '@/components/ui/PageHeader';
import { Button, Card } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { Field, TextInput } from '@/components/ui/form';
import { StatusTag } from '@/components/ui/StatusTag';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import type { ApiPrice } from '@/types';

/**
 * 开放平台·数据产品价目表（2026）：数据API套餐报价的接口级价格依据。
 * 报价单「按量计费」行从此表勾选接口，形成接口报价清单。
 */
export function ApiPricesPage() {
  const { can } = usePerm();
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const [kw, setKw] = useState('');
  const [category, setCategory] = useState('');
  const [addOpen, setAddOpen] = useState(false);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['api-prices', kw, category],
    queryFn: () => apiPricesApi.list(kw || undefined, category || undefined, true),
    enabled: can('system.dict'),
  });
  const categories = useMemo(() => [...new Set(rows.map((r) => r.category).filter(Boolean))], [rows]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['api-prices'] });

  const savePrice = useMutation({
    mutationFn: ({ id, price }: { id: number; price: number }) => apiPricesApi.update(id, { price }),
    onSuccess: () => { toast('价格已更新', 'success'); refresh(); },
    onError: (e) => toast(e instanceof Error ? e.message : '更新失败', 'error'),
  });
  const toggle = useMutation({
    mutationFn: (r: ApiPrice) => apiPricesApi.update(r.apiPriceId, { active: !r.active }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => apiPricesApi.remove(id),
    onSuccess: () => { toast('条目已删除', 'info'); refresh(); },
  });

  if (!can('system.dict'))
    return <div><PageHeader title="数据产品价目表" /><Card><EmptyState title="无权限" description="需要「系统-字段/字典」权限" /></Card></div>;

  return (
    <div>
      <PageHeader
        title="数据产品价目表（开放平台 2026）"
        description="数据API套餐的接口级标准价；报价单按量计费行从此表选择接口形成报价清单"
        extra={
          <div className="flex items-center gap-2">
            <SearchInput value={kw} onChange={setKw} placeholder="接口名称 / ApiCode…" />
            <Button variant="primary" onClick={() => setAddOpen(true)}><ListPlus size={14} />新增条目</Button>
          </div>
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <CategoryChip label="全部" active={!category} onClick={() => setCategory('')} />
        {categories.map((c) => <CategoryChip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />)}
      </div>
      <Card>
        {isLoading ? <TableSkeleton rows={8} cols={6} /> : rows.length === 0 ? (
          <EmptyState title="无匹配条目" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-text-faint">
                  <th className="px-4 py-2.5 font-normal">类别</th>
                  <th className="px-4 py-2.5 font-normal">ApiCode</th>
                  <th className="px-4 py-2.5 font-normal">接口名称</th>
                  <th className="px-4 py-2.5 font-normal">类型</th>
                  <th className="px-4 py-2.5 text-right font-normal">标准价</th>
                  <th className="px-4 py-2.5 font-normal">备注</th>
                  <th className="px-4 py-2.5 font-normal">状态</th>
                  <th className="px-4 py-2.5 font-normal">操作</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.apiPriceId} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2 text-xs text-text-faint">{r.category}</td>
                    <td className="px-4 py-2 font-mono text-xs text-text-weak">{r.apiCode}</td>
                    <td className="px-4 py-2 font-medium text-text">{r.name}</td>
                    <td className="px-4 py-2 text-xs text-text-weak">{r.apiType}</td>
                    <td className="px-4 py-2 text-right">
                      <PriceCell value={r.price} unit={r.unit} onSave={(p) => savePrice.mutate({ id: r.apiPriceId, price: p })} />
                    </td>
                    <td className="max-w-56 truncate px-4 py-2 text-xs text-text-faint" title={r.remark}>{r.remark || '—'}</td>
                    <td className="px-4 py-2">
                      <button onClick={() => toggle.mutate(r)}>
                        <StatusTag kind={r.active ? 'success' : 'neutral'} label={r.active ? '在售' : '停用'} />
                      </button>
                    </td>
                    <td className="px-4 py-2">
                      <button onClick={() => remove.mutate(r.apiPriceId)} className="text-text-faint hover:text-danger"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {addOpen && <AddDialog onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); refresh(); }} />}
    </div>
  );
}

function CategoryChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn('rounded-full border px-2.5 py-0.5 text-xs', active ? 'border-primary bg-primary-weak text-primary' : 'border-border text-text-weak hover:border-primary/50')}
    >
      {label}
    </button>
  );
}

// 标准价内联编辑（回车/失焦保存）
function PriceCell({ value, unit, onSave }: { value: number; unit: string; onSave: (p: number) => void }) {
  const [v, setV] = useState(String(value));
  const commit = () => {
    const n = Number(v);
    if (!Number.isNaN(n) && n >= 0 && n !== value) onSave(n);
    else setV(String(value));
  };
  return (
    <span className="inline-flex items-center gap-1">
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        className="h-7 w-16 rounded border border-transparent px-1.5 text-right text-sm tabular-nums outline-none hover:border-border focus:border-primary"
      />
      <span className="text-xs text-text-faint">元/{unit}</span>
    </span>
  );
}

function AddDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useUI((s) => s.toast);
  const [f, setF] = useState({ category: '', apiCode: '', name: '', apiType: '数据类', price: '', unit: '次', remark: '' });
  const [busy, setBusy] = useState(false);
  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const save = async () => {
    if (!f.category || !f.apiCode || !f.name || f.price === '') return toast('请填写类别/ApiCode/名称/标准价', 'error');
    setBusy(true);
    try {
      await apiPricesApi.create({ ...f, price: Number(f.price) } as any);
      toast('条目已创建', 'success');
      onSaved();
    } catch (e) { toast(e instanceof Error ? e.message : '创建失败', 'error'); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open title={<span className="flex items-center gap-2"><DatabaseZap size={16} className="text-primary" />新增价目条目</span>} onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={save} disabled={busy}>保存</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        <Field label="类别" required><TextInput value={f.category} onChange={(e) => set('category', e.target.value)} placeholder="如：工商信息" /></Field>
        <Field label="ApiCode" required><TextInput value={f.apiCode} onChange={(e) => set('apiCode', e.target.value)} placeholder="如 886" /></Field>
        <Field label="接口名称" required className="col-span-2"><TextInput value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field label="类型"><TextInput value={f.apiType} onChange={(e) => set('apiType', e.target.value)} placeholder="数据类/核查类/套餐" /></Field>
        <Field label="标准价（元）" required><TextInput value={f.price} onChange={(e) => set('price', e.target.value)} inputMode="decimal" /></Field>
        <Field label="计费单位"><TextInput value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="次 / 户" /></Field>
        <Field label="备注" className="col-span-2"><TextInput value={f.remark} onChange={(e) => set('remark', e.target.value)} /></Field>
      </div>
    </Dialog>
  );
}
