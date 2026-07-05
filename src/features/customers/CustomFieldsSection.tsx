import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, SlidersHorizontal } from 'lucide-react';
import { customFieldsApi } from '@/api/crm';
import { useUI } from '@/store/ui';
import { Button } from '@/components/ui/primitives';
import { Dialog } from '@/components/ui/Dialog';
import { Field, TextInput } from '@/components/ui/form';
import type { CustomFieldDef, CustomFieldValues } from '@/types';

/**
 * 客户详情 · 个性信息：按租户自定义字段展示/填写（设置→自定义字段 维护定义）。
 * 值保存在 customer.custom_fields（键=fieldId），AI 洞察会一并分析。
 */
export function CustomFieldsSection({ customerId, values }: { customerId: number; values?: CustomFieldValues }) {
  const [editOpen, setEditOpen] = useState(false);
  const { data: defs = [] } = useQuery({ queryKey: ['custom-field-defs'], queryFn: () => customFieldsApi.defs() });

  if (defs.length === 0) return null; // 未定义字段则不占版面

  const vals = values ?? {};
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-text">
          <SlidersHorizontal size={14} className="text-primary" />个性信息
        </div>
        <Button size="sm" onClick={() => setEditOpen(true)}><Pencil size={12} />编辑</Button>
      </div>
      <div className="grid grid-cols-3 gap-x-6 gap-y-2 rounded-lg border border-border p-3">
        {defs.map((d) => {
          const v = vals[String(d.fieldId)];
          return (
            <div key={d.fieldId} className="text-sm">
              <span className="text-text-faint">{d.name}：</span>
              <span className={v != null && String(v) !== '' ? 'text-text' : 'text-text-faint'}>
                {v != null && String(v) !== '' ? (d.fieldType === 'number' ? Number(v).toLocaleString() : String(v)) : '未填写'}
              </span>
            </div>
          );
        })}
      </div>
      {editOpen && <EditDialog customerId={customerId} defs={defs} initial={vals} onClose={() => setEditOpen(false)} />}
    </div>
  );
}

function EditDialog({ customerId, defs, initial, onClose }: {
  customerId: number; defs: CustomFieldDef[]; initial: CustomFieldValues; onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const [draft, setDraft] = useState<Record<string, string>>(
    Object.fromEntries(defs.map((d) => [String(d.fieldId), initial[String(d.fieldId)] != null ? String(initial[String(d.fieldId)]) : ''])),
  );
  const [busy, setBusy] = useState(false);

  const set = (id: number, v: string) => setDraft((s) => ({ ...s, [String(id)]: v }));

  const save = async () => {
    for (const d of defs) {
      if (d.required && !draft[String(d.fieldId)]?.trim()) return toast(`「${d.name}」为必填`, 'error');
      if (d.fieldType === 'number' && draft[String(d.fieldId)]?.trim() && Number.isNaN(Number(draft[String(d.fieldId)])))
        return toast(`「${d.name}」需为数字`, 'error');
    }
    setBusy(true);
    try {
      await customFieldsApi.saveValues(customerId, draft);
      toast('个性信息已保存', 'success');
      qc.invalidateQueries({ queryKey: ['customer', customerId] });
      onClose();
    } catch (e) { toast(e instanceof Error ? e.message : '保存失败', 'error'); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open title="编辑个性信息" onClose={onClose}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={save} disabled={busy}>保存</Button></>}>
      <div className="grid grid-cols-2 gap-4">
        {defs.map((d) => (
          <Field key={d.fieldId} label={d.name} required={d.required}>
            {d.fieldType === 'select' ? (
              <select
                value={draft[String(d.fieldId)] ?? ''}
                onChange={(e) => set(d.fieldId, e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-surface px-2.5 text-sm outline-none focus:border-primary"
              >
                <option value="">未选择</option>
                {d.options.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <TextInput
                type={d.fieldType === 'date' ? 'date' : d.fieldType === 'number' ? 'number' : 'text'}
                value={draft[String(d.fieldId)] ?? ''}
                onChange={(e) => set(d.fieldId, e.target.value)}
              />
            )}
          </Field>
        ))}
      </div>
    </Dialog>
  );
}
