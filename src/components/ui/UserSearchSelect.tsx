import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, UserRound, X } from 'lucide-react';
import { usersApi } from '@/api/crm';
import { cn } from '@/lib/cn';

/**
 * 负责人/成员搜索选择器（全模块通用）：输入姓名联想组织成员，支持清除重选。
 * 受控组件：value=userId；valueName 仅作初始显示（如「当前用户」默认值）。
 */
export function UserSearchSelect({
  value,
  valueName,
  onChange,
  placeholder = '搜索姓名选择成员…',
  invalid,
  excludeUserId,
}: {
  value?: number;
  valueName?: string;
  onChange: (id: number | undefined, name?: string) => void;
  placeholder?: string;
  invalid?: boolean;
  /** 排除某人（如移交时排除当前负责人） */
  excludeUserId?: number;
}) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [kw, setKw] = useState('');
  const [picked, setPicked] = useState<string | undefined>(valueName);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setPicked(valueName), [valueName]);
  useEffect(() => {
    const t = setTimeout(() => setKw(input.trim()), 250);
    return () => clearTimeout(t);
  }, [input]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const { data = [], isFetching } = useQuery({
    queryKey: ['user-search', kw],
    queryFn: () => usersApi.search(kw),
    enabled: open,
    staleTime: 60_000,
  });
  const list = data.filter((u) => u.userId !== excludeUserId);

  if (value && picked && !open) {
    return (
      <div className={cn('flex h-9 items-center gap-2 rounded-md border bg-surface px-3 text-sm', invalid ? 'border-danger' : 'border-border')}>
        <UserRound size={14} className="text-text-faint" />
        <span className="flex-1 truncate text-text">{picked}</span>
        <button type="button" onClick={() => { onChange(undefined); setPicked(undefined); setInput(''); setOpen(true); }} className="text-text-faint hover:text-danger">
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className={cn('flex h-9 items-center gap-1.5 rounded-md border bg-surface px-2.5', invalid ? 'border-danger' : 'border-border')}>
        <UserRound size={14} className="text-text-faint" />
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-faint"
        />
        <ChevronDown size={14} className="text-text-faint" />
      </div>
      {open && (
        <div className="absolute z-40 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-card">
          {isFetching && <div className="px-3 py-1.5 text-xs text-text-faint">搜索中…</div>}
          {!isFetching && list.length === 0 && <div className="px-3 py-1.5 text-xs text-text-faint">无匹配成员</div>}
          {list.map((u) => (
            <button
              key={u.userId}
              type="button"
              onClick={() => { onChange(u.userId, u.name); setPicked(u.name); setOpen(false); setInput(''); }}
              className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-bg', u.userId === value && 'text-primary')}
            >
              <UserRound size={13} className="text-text-faint" />
              <span>{u.name}</span>
              {u.depName && <span className="text-xs text-text-faint">{u.depName}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
