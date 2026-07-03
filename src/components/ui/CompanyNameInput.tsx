import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, CheckCircle2 } from 'lucide-react';
import { customersApi } from '@/api/crm';
import { cn } from '@/lib/cn';

// 工商名称补全输入框（企查查 FuzzySearch）：输入→候选企业→选中回填企业名 + KeyNo
export function CompanyNameInput({
  value,
  onChange,
  onPick,
  placeholder = '输入企业名称，自动联想工商信息…',
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (c: { name: string; keyNo: string; operName?: string }) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [kw, setKw] = useState('');
  const [pickedKeyNo, setPickedKeyNo] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  // 300ms 防抖
  useEffect(() => {
    const t = setTimeout(() => setKw(value), 300);
    return () => clearTimeout(t);
  }, [value]);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const { data, isFetching } = useQuery({
    queryKey: ['company-search', kw],
    queryFn: () => customersApi.companySearch(kw),
    enabled: open && kw.trim().length >= 2 && !pickedKeyNo,
    staleTime: 60_000,
  });

  return (
    <div ref={ref} className="relative">
      <div className={cn('flex h-9 items-center gap-1.5 rounded-md border bg-surface px-2.5', invalid ? 'border-danger' : 'border-border')}>
        <Building2 size={14} className="text-text-faint" />
        <input
          value={value}
          onChange={(e) => { onChange(e.target.value); setPickedKeyNo(null); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-faint"
        />
        {pickedKeyNo && <CheckCircle2 size={14} className="text-success" />}
      </div>
      {open && !pickedKeyNo && kw.trim().length >= 2 && (
        <div className="absolute z-40 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface py-1 shadow-card">
          {isFetching && <div className="px-3 py-2 text-xs text-text-faint">工商检索中…</div>}
          {!isFetching && data && !data.enabled && (
            <div className="px-3 py-2 text-xs text-text-faint">未配置企查查凭据，无法联想（可直接输入）</div>
          )}
          {!isFetching && data?.enabled && data.list.length === 0 && (
            <div className="px-3 py-2 text-xs text-text-faint">无匹配企业（可直接输入）</div>
          )}
          {(data?.list ?? []).map((c) => (
            <button
              key={c.keyNo}
              onClick={() => { onPick(c); setPickedKeyNo(c.keyNo); setOpen(false); }}
              className="block w-full px-3 py-1.5 text-left text-sm hover:bg-bg"
            >
              <span className="text-text">{c.name}</span>
              <span className="ml-2 text-xs text-text-faint">{c.operName ?? ''}{c.status ? ` · ${c.status}` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
