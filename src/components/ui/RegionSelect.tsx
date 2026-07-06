import { useEffect, useRef, useState } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import { PROVINCES, citiesOf } from '@/lib/regions';
import { cn } from '@/lib/cn';

/**
 * 省市联动选择/输入：省份决定城市候选；两级均支持自由输入（境外/特殊地区兜底）。
 * 切换省份时若已选城市不属于新省份则自动清空。
 */
export function RegionSelect({
  province,
  city,
  onChange,
  invalid,
}: {
  province?: string;
  city?: string;
  onChange: (province: string, city: string) => void;
  invalid?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <ComboInput
        value={province ?? ''}
        options={PROVINCES}
        placeholder="省份（可输入）"
        invalid={invalid}
        onPick={(p) => {
          const cs = citiesOf(p);
          onChange(p, city && cs.includes(city) ? city : '');
        }}
      />
      <ComboInput
        value={city ?? ''}
        options={citiesOf(province)}
        placeholder={province ? '城市（可输入）' : '先选省份或直接输入'}
        invalid={invalid}
        onPick={(c) => onChange(province ?? '', c)}
      />
    </div>
  );
}

// 可输入的下拉组合框：输入过滤候选，点击选中；不强制匹配候选
function ComboInput({ value, options, placeholder, invalid, onPick }: {
  value: string;
  options: string[];
  placeholder?: string;
  invalid?: boolean;
  onPick: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const kw = value.trim();
  const list = kw ? options.filter((o) => o.includes(kw)) : options;

  return (
    <div ref={ref} className="relative flex-1">
      <div className={cn('flex h-9 items-center gap-1.5 rounded-md border bg-surface px-2.5', invalid ? 'border-danger' : 'border-border')}>
        <MapPin size={13} className="shrink-0 text-text-faint" />
        <input
          value={value}
          onChange={(e) => { onPick(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full flex-1 bg-transparent text-sm outline-none placeholder:text-text-faint"
        />
        <button type="button" onClick={() => setOpen((v) => !v)} className="shrink-0 text-text-faint"><ChevronDown size={13} /></button>
      </div>
      {open && list.length > 0 && (
        <div className="absolute z-40 mt-1 max-h-52 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-card">
          {list.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => { onPick(o); setOpen(false); }}
              className={cn('block w-full px-3 py-1.5 text-left text-sm hover:bg-bg', o === value && 'text-primary')}
            >
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
