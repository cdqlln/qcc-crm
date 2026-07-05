import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ListPlus, Pencil, Trash2 } from 'lucide-react';
import { customFieldsApi } from '@/api/crm';
import { usePerm } from '@/store/auth';
import { useUI } from '@/store/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, Card, CardHeader } from '@/components/ui/primitives';
import { Field, TextInput } from '@/components/ui/form';
import { Dialog } from '@/components/ui/Dialog';
import { StatusTag } from '@/components/ui/StatusTag';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import type { CustomFieldDef } from '@/types';

const TYPE_LABEL: Record<string, string> = { text: '文本', number: '数字', date: '日期', select: '下拉' };

/** 个性客户信息：租户自定义字段管理（字段在客户详情「个性信息」区块填写展示） */
export function CustomFieldsPage() {
  const { can } = usePerm();
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const [editing, setEditing] = useState<CustomFieldDef | 'new' | null>(null);

  const { data: defs = [], isLoading } = useQuery({
    queryKey: ['custom-field-defs', 'all'],
    queryFn: () => customFieldsApi.defs(true),
    enabled: can('system.dict'),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['custom-field-defs'] });
  };

  const toggle = useMutation({
    mutationFn: (d: CustomFieldDef) => customFieldsApi.update(d.fieldId, { active: !d.active }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: number) => customFieldsApi.remove(id),
    onSuccess: () => { toast('字段已删除', 'info'); refresh(); },
    onError: (e) => toast(e instanceof Error ? e.message : '删除失败', 'error'),
  });

  if (!can('system.dict'))
    return <div><PageHeader title="自定义字段" /><Card><EmptyState title="无权限" description="需要「系统-字典配置」权限" /></Card></div>;

  return (
    <div>
      <PageHeader
        title="自定义字段（个性客户信息）"
        description="为客户档案增加企业专属字段（文本/数字/日期/下拉），销售在客户详情「个性信息」中填写，AI 洞察会一并分析"
        extra={<Button variant="primary" onClick={() => setEditing('new')}><ListPlus size={14} />新增字段</Button>}
      />
      <Card>
        {isLoading ? <TableSkeleton rows={4} cols={5} /> : defs.length === 0 ? (
          <EmptyState title="还没有自定义字段" description="点击右上角「新增字段」，如：年采购预算（数字）、决策周期（下拉）" />
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-faint">
                <th className="px-4 py-2.5 font-normal">字段名称</th>
                <th className="px-4 py-2.5 font-normal">类型</th>
                <th className="px-4 py-2.5 font-normal">选项</th>
                <th className="px-4 py-2.5 font-normal">必填</th>
                <th className="px-4 py-2.5 font-normal">排序</th>
                <th className="px-4 py-2.5 font-normal">状态</th>
                <th className="px-4 py-2.5 font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {defs.map((d) => (
                <tr key={d.fieldId} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2.5 font-medium text-text">{d.name}</td>
                  <td className="px-4 py-2.5 text-text-weak">{TYPE_LABEL[d.fieldType]}</td>
                  <td className="max-w-56 truncate px-4 py-2.5 text-xs text-text-faint">{d.options.join(' / ') || '—'}</td>
                  <td className="px-4 py-2.5 text-text-weak">{d.required ? '是' : '否'}</td>
                  <td className="px-4 py-2.5 text-text-weak">{d.order}</td>
                  <td className="px-4 py-2.5">
                    <button onClick={() => toggle.mutate(d)}>
                      <StatusTag kind={d.active ? 'success' : 'neutral'} label={d.active ? '启用' : '停用'} />
                    </button>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditing(d)} className="text-text-faint hover:text-primary"><Pencil size={14} /></button>
                      <button onClick={() => remove.mutate(d.fieldId)} className="text-text-faint hover:text-danger"><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {editing && (
        <FieldDialog
          def={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
        />
      )}
    </div>
  );
}

function FieldDialog({ def, onClose, onSaved }: { def: CustomFieldDef | null; onClose: () => void; onSaved: () => void }) {
  const toast = useUI((s) => s.toast);
  const [name, setName] = useState(def?.name ?? '');
  const [fieldType, setFieldType] = useState<CustomFieldDef['fieldType']>(def?.fieldType ?? 'text');
  const [options, setOptions] = useState((def?.options ?? []).join('，'));
  const [required, setRequired] = useState(def?.required ?? false);
  const [order, setOrder] = useState(String(def?.order ?? 0));
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!name.trim()) return toast('请填写字段名称', 'error');
    const opts = options.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    if (fieldType === 'select' && opts.length === 0) return toast('下拉字段需要至少一个选项', 'error');
    setBusy(true);
    try {
      if (def) await customFieldsApi.update(def.fieldId, { name: name.trim(), options: opts, required, order: Number(order) || 0 });
      else await customFieldsApi.create({ name: name.trim(), fieldType, options: opts, required, order: Number(order) || 0 });
      toast(def ? '字段已更新' : '字段已创建', 'success');
      onSaved();
    } catch (e) { toast(e instanceof Error ? e.message : '保存失败', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open title={def ? `编辑字段「${def.name}」` : '新增自定义字段'} onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={save} disabled={busy}>保存</Button></>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="字段名称" required><TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="如：年采购预算" /></Field>
          <Field label="类型" required hint={def ? '类型创建后不可改（避免已填数据失效）' : undefined}>
            <select
              value={fieldType}
              onChange={(e) => setFieldType(e.target.value as CustomFieldDef['fieldType'])}
              disabled={!!def}
              className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus:border-primary disabled:opacity-60"
            >
              <option value="text">文本</option>
              <option value="number">数字</option>
              <option value="date">日期</option>
              <option value="select">下拉</option>
            </select>
          </Field>
        </div>
        {fieldType === 'select' && (
          <Field label="下拉选项" required hint="用逗号分隔，如：1个月内，1-3个月，3-6个月">
            <TextInput value={options} onChange={(e) => setOptions(e.target.value)} placeholder="选项A，选项B，选项C" />
          </Field>
        )}
        <div className="grid grid-cols-2 gap-4">
          <Field label="排序（小在前）"><TextInput value={order} onChange={(e) => setOrder(e.target.value)} /></Field>
          <Field label="必填">
            <label className="flex h-9 items-center gap-2 text-sm text-text-weak">
              <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
              保存客户个性信息时必须填写
            </label>
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
