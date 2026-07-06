import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

/** 通用组合输入框：候选下拉（输入过滤）+ 自由输入，不强制匹配候选 */
export function ComboInput({ value, options, placeholder, invalid, onChange }: {
  value: string;
  options: string[];
  placeholder?: string;
  invalid?: boolean;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const kw = value.trim();
  const uniq = [...new Set(options.filter(Boolean))];
  const list = kw ? uniq.filter((o) => o.includes(kw) && o !== kw) : uniq;

  return (
    <div ref={ref} className="relative">
      <div className={cn('flex h-9 items-center gap-1.5 rounded-md border bg-surface px-2.5', invalid ? 'border-danger' : 'border-border')}>
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full flex-1 bg-transparent text-sm outline-none placeholder:text-text-faint"
        />
        <button type="button" onClick={() => setOpen((v) => !v)} className="shrink-0 text-text-faint"><ChevronDown size={13} /></button>
      </div>
      {open && list.length > 0 && (
        <div className="absolute z-40 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-card">
          {list.map((o) => (
            <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-bg">
              {o}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
