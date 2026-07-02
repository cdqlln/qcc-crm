import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { customersApi } from '@/api/crm';
import { cn } from '@/lib/cn';

// 客户搜索选择器：按关键字查（服务端已按数据范围过滤，销售仅见自归属客户）
export function CustomerSearchSelect({
  value,
  valueName,
  onChange,
  placeholder = '搜索客户名称…',
}: {
  value?: number;
  valueName?: string;
  onChange: (id: number | undefined, name?: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [kw, setKw] = useState('');
  const [picked, setPicked] = useState<string | undefined>(valueName);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setPicked(valueName), [valueName]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['cust-search', kw],
    queryFn: () => customersApi.list({ page: 1, pageSize: 20, keyword: kw, tab: 'all' }),
    enabled: open,
  });
  const list = data?.list ?? [];

  if (value && picked && !open) {
    return (
      <div className="flex h-9 w-64 items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm">
        <span className="flex-1 truncate text-text">{picked}</span>
        <button onClick={() => { onChange(undefined); setPicked(undefined); }} className="text-text-faint hover:text-danger"><X size={14} /></button>
        <button onClick={() => { setOpen(true); setKw(''); }} className="text-xs text-primary">更换</button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative w-64">
      <div className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-surface px-2.5">
        <Search size={14} className="text-text-faint" />
        <input
          autoFocus={open}
          value={kw}
          onChange={(e) => setKw(e.target.value)}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-faint"
        />
      </div>
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface py-1 shadow-card">
          {isFetching && <div className="px-3 py-2 text-xs text-text-faint">搜索中…</div>}
          {!isFetching && list.length === 0 && <div className="px-3 py-2 text-xs text-text-faint">无匹配的客户（仅显示你归属的客户）</div>}
          {list.map((c) => (
            <button
              key={c.customerId}
              onClick={() => { onChange(c.customerId, c.name); setPicked(c.name); setOpen(false); }}
              className={cn('block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-bg', c.customerId === value && 'text-primary')}
            >
              {c.name}
              {c.industry && <span className="ml-2 text-xs text-text-faint">{c.industry}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
