import { useEffect, useState } from 'react';
import { SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Button, CountBadge } from './primitives';
import { Drawer } from './Drawer';
import type { FilterValue } from '@/hooks/useListQuery';

// 工具栏「筛选」按钮（带激活条件数徽标）
export function FilterButton({ count, onClick }: { count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-sm transition-colors',
        count > 0 ? 'border-primary bg-primary-weak text-primary' : 'border-border bg-surface text-text hover:bg-bg',
      )}
    >
      <SlidersHorizontal size={14} />
      筛选
      {count > 0 && <CountBadge count={count} kind="primary" />}
    </button>
  );
}

export interface FilterOption {
  label: string;
  value: number | string;
}
export interface FilterField {
  key: string;
  label: string;
  type: 'select' | 'multiselect' | 'text' | 'dateRange' | 'numberRange';
  options?: FilterOption[];
  placeholder?: string;
}

// §4.3 FilterPanel：抽屉式高级筛选，条件可命名复用
export function FilterPanel({
  open,
  onClose,
  schema,
  value,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  schema: FilterField[];
  value: FilterValue;
  onApply: (v: FilterValue) => void;
}) {
  const [draft, setDraft] = useState<FilterValue>(value);
  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  const set = (key: string, v: unknown) => setDraft((d) => ({ ...d, [key]: v }));

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="高级筛选"
      subtitle="组合多个条件，可保存为视图复用"
      width="w-[420px]"
      footer={
        <div className="flex justify-between">
          <Button onClick={() => setDraft({})}>清空</Button>
          <div className="flex gap-2">
            <Button onClick={onClose}>取消</Button>
            <Button
              variant="primary"
              onClick={() => {
                onApply(draft);
                onClose();
              }}
            >
              应用筛选
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-5 p-5">
        {schema.map((f) => (
          <div key={f.key} className="flex flex-col gap-2">
            <label className="text-sm font-medium text-text">{f.label}</label>
            {f.type === 'select' && (
              <select
                value={(draft[f.key] as string) ?? ''}
                onChange={(e) => set(f.key, e.target.value === '' ? undefined : coerce(e.target.value))}
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
              >
                <option value="">全部</option>
                {f.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
            {f.type === 'multiselect' && (
              <div className="flex flex-wrap gap-1.5">
                {f.options?.map((o) => {
                  const arr = (draft[f.key] as (number | string)[]) ?? [];
                  const active = arr.includes(o.value);
                  return (
                    <button
                      key={o.value}
                      onClick={() => set(f.key, active ? arr.filter((x) => x !== o.value) : [...arr, o.value])}
                      className={cn(
                        'rounded-full border px-2.5 py-1 text-xs transition-colors',
                        active ? 'border-primary bg-primary-weak text-primary' : 'border-border text-text-weak hover:text-text',
                      )}
                    >
                      {o.label}
                    </button>
                  );
                })}
              </div>
            )}
            {f.type === 'text' && (
              <input
                value={((draft[f.key] as { contains?: string })?.contains) ?? ''}
                onChange={(e) => set(f.key, e.target.value ? { contains: e.target.value } : undefined)}
                placeholder={f.placeholder ?? '输入关键字'}
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm outline-none focus:border-primary"
              />
            )}
            {f.type === 'dateRange' && (
              <div className="flex items-center gap-2">
                <DateBox value={(draft[f.key] as any)?.start} onChange={(v) => set(f.key, { ...(draft[f.key] as object), start: v })} />
                <span className="text-text-faint">至</span>
                <DateBox value={(draft[f.key] as any)?.end} onChange={(v) => set(f.key, { ...(draft[f.key] as object), end: v })} />
              </div>
            )}
            {f.type === 'numberRange' && (
              <div className="flex items-center gap-2">
                <NumBox value={(draft[f.key] as any)?.min} placeholder="最小" onChange={(v) => set(f.key, { ...(draft[f.key] as object), min: v })} />
                <span className="text-text-faint">~</span>
                <NumBox value={(draft[f.key] as any)?.max} placeholder="最大" onChange={(v) => set(f.key, { ...(draft[f.key] as object), max: v })} />
              </div>
            )}
          </div>
        ))}
      </div>
    </Drawer>
  );
}

function coerce(v: string): number | string {
  const n = Number(v);
  return v !== '' && !Number.isNaN(n) ? n : v;
}
function DateBox({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <input
      type="date"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 flex-1 rounded-md border border-border bg-surface px-2 text-sm outline-none focus:border-primary"
    />
  );
}
function NumBox({ value, placeholder, onChange }: { value?: string; placeholder?: string; onChange: (v: string) => void }) {
  return (
    <input
      inputMode="decimal"
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 flex-1 rounded-md border border-border bg-surface px-2 text-right text-sm tabular-nums outline-none focus:border-primary"
    />
  );
}

// 已应用筛选的标签条（点击可移除单项）
export function FilterChips({
  schema,
  value,
  onChange,
}: {
  schema: FilterField[];
  value: FilterValue;
  onChange: (v: FilterValue) => void;
}) {
  const chips: { key: string; text: string }[] = [];
  for (const f of schema) {
    const v = value[f.key];
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      const labels = v.map((x) => f.options?.find((o) => o.value === x)?.label ?? x).join(' / ');
      chips.push({ key: f.key, text: `${f.label}: ${labels}` });
    } else if (typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (Object.values(o).every((x) => x === undefined || x === null || x === '')) continue;
      if ('contains' in o) chips.push({ key: f.key, text: `${f.label}: ${o.contains}` });
      else if ('min' in o || 'max' in o) chips.push({ key: f.key, text: `${f.label}: ${o.min ?? '*'} ~ ${o.max ?? '*'}` });
      else chips.push({ key: f.key, text: `${f.label}: ${o.start ?? '*'} 至 ${o.end ?? '*'}` });
    } else {
      const label = f.options?.find((opt) => opt.value === v)?.label ?? String(v);
      chips.push({ key: f.key, text: `${f.label}: ${label}` });
    }
  }

  if (chips.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {chips.map((c) => (
        <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-primary-weak px-2.5 py-1 text-xs text-primary">
          {c.text}
          <button
            onClick={() => {
              const next = { ...value };
              delete next[c.key];
              onChange(next);
            }}
            className="hover:text-danger"
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <button onClick={() => onChange({})} className="text-xs text-text-faint hover:text-danger">
        清空全部
      </button>
    </div>
  );
}
