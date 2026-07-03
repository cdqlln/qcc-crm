import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Building2, Network, Plus, Search, X } from 'lucide-react';
import { customersApi, groupsApi } from '@/api/crm';
import { useAuth } from '@/store/auth';
import { useUI } from '@/store/ui';
import { cn } from '@/lib/cn';

/**
 * 主体搜索选择器（商机/报价等选客户用）：
 *  直接输入公司或集团名称，候选合并三段——
 *   1) 我的客户（服务端按数据范围过滤）
 *   2) 集团命中 → 展开其成员客户
 *   3) 企查查工商候选 → 选中即自动建档为客户（带 KeyNo，自动归属集团）并选中
 */
export function EntitySearchSelect({
  value,
  valueName,
  onChange,
  onPickGroup,
  placeholder = '输入公司或集团名称…',
  invalid,
}: {
  value?: number;
  valueName?: string;
  onChange: (id: number | undefined, name?: string) => void;
  /** 提供后，集团段显示「按集团报价」入口：回传 (groupId, groupName, 主成员customerId, 主成员name) */
  onPickGroup?: (groupId: number, groupName: string, mainCustomerId: number, mainName: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  const user = useAuth((s) => s.user);
  const toast = useUI((s) => s.toast);
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [kw, setKw] = useState('');
  const [picked, setPicked] = useState<string | undefined>(valueName);
  const [creating, setCreating] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => setPicked(valueName), [valueName]);
  useEffect(() => {
    const t = setTimeout(() => setKw(input.trim()), 300);
    return () => clearTimeout(t);
  }, [input]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // 1) 我的客户
  const custQ = useQuery({
    queryKey: ['entity-cust', kw],
    queryFn: () => customersApi.list({ page: 1, pageSize: 10, keyword: kw, tab: 'all' }),
    enabled: open && kw.length >= 1,
  });
  const customers = custQ.data?.list ?? [];

  // 2) 集团命中 → 成员
  const groupsQ = useQuery({ queryKey: ['groups'], queryFn: () => groupsApi.list(), enabled: open, staleTime: 60_000 });
  const matchedGroups = (groupsQ.data ?? []).filter((g) => kw && g.name.includes(kw)).slice(0, 3);
  const membersQ = useQuery({
    queryKey: ['entity-group-members', matchedGroups.map((g) => g.groupId)],
    queryFn: async () => {
      const all = await Promise.all(matchedGroups.map(async (g) => ({ group: g, members: await groupsApi.members(g.groupId) })));
      return all;
    },
    enabled: open && matchedGroups.length > 0,
  });

  // 3) 企查查工商候选（排除已是客户的同名）
  const extQ = useQuery({
    queryKey: ['entity-ext', kw],
    queryFn: () => customersApi.companySearch(kw),
    enabled: open && kw.length >= 2,
    staleTime: 60_000,
  });
  const existingNames = new Set([
    ...customers.map((c) => c.name),
    ...(membersQ.data ?? []).flatMap((x) => x.members.map((m) => m.name)),
  ]);
  const externals = (extQ.data?.enabled ? extQ.data.list : []).filter((c) => !existingNames.has(c.name)).slice(0, 10);

  const pick = (id: number, name: string) => {
    onChange(id, name);
    setPicked(name);
    setOpen(false);
  };

  // 工商候选 → 自动建档为客户并选中
  const pickExternal = async (c: { keyNo: string; name: string }) => {
    if (!user) return;
    setCreating(c.keyNo);
    try {
      const created = await customersApi.create({
        name: c.name,
        refCompanyId: c.keyNo,
        level: 26, // 默认 B 级
        source: 6, // 企查查导入
        leaderId: user.userId,
      } as any);
      toast(`已建档客户「${c.name}」${created.groupId ? '并归属集团' : ''}`, 'success');
      pick(created.customerId, created.name);
    } catch (e) {
      toast(e instanceof Error ? e.message : '建档失败', 'error');
    } finally {
      setCreating(null);
    }
  };

  if (value && picked && !open) {
    return (
      <div className={cn('flex h-9 w-72 items-center gap-2 rounded-md border bg-surface px-3 text-sm', invalid ? 'border-danger' : 'border-border')}>
        <Building2 size={14} className="text-text-faint" />
        <span className="flex-1 truncate text-text">{picked}</span>
        <button onClick={() => { onChange(undefined); setPicked(undefined); setInput(''); }} className="text-text-faint hover:text-danger"><X size={14} /></button>
        <button onClick={() => setOpen(true)} className="text-xs text-primary">更换</button>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative w-72">
      <div className={cn('flex h-9 items-center gap-1.5 rounded-md border bg-surface px-2.5', invalid ? 'border-danger' : 'border-border')}>
        <Search size={14} className="text-text-faint" />
        <input
          value={input}
          onChange={(e) => { setInput(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-faint"
        />
      </div>
      {open && kw.length >= 1 && (
        <div className="absolute z-40 mt-1 max-h-96 w-[26rem] max-w-[80vw] overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-card">
          {/* 我的客户 */}
          <SectionTitle text="我的客户" />
          {custQ.isFetching && <Hint text="搜索中…" />}
          {!custQ.isFetching && customers.length === 0 && <Hint text="无匹配客户" />}
          {customers.map((c) => (
            <Row key={`c${c.customerId}`} icon={<Building2 size={14} className="text-primary" />} title={c.name}
              subtitle={c.groupName ?? c.industry} onClick={() => pick(c.customerId, c.name)} active={c.customerId === value} />
          ))}

          {/* 集团 → 成员 */}
          {matchedGroups.length > 0 && <SectionTitle text="集团" />}
          {(membersQ.data ?? []).map(({ group, members }) => (
            <div key={`g${group.groupId}`}>
              <div className="flex items-center gap-1.5 px-3 py-1 text-xs text-text-weak">
                <Network size={12} className="text-warning" />{group.name}（{members.length} 家成员）
                {onPickGroup && members.length > 0 && (
                  <button
                    onClick={() => { onPickGroup(group.groupId, group.name, members[0].customerId, members[0].name); setPicked(group.name); setOpen(false); }}
                    className="ml-auto rounded bg-primary-weak px-1.5 py-0.5 text-[11px] text-primary"
                  >
                    按集团报价
                  </button>
                )}
              </div>
              {members.map((m) => (
                <Row key={`gm${m.customerId}`} icon={<Building2 size={14} className="text-warning" />} title={m.name}
                  indent onClick={() => pick(m.customerId, m.name)} active={m.customerId === value} />
              ))}
            </div>
          ))}

          {/* 工商候选（建档） */}
          {extQ.data?.enabled === false ? null : (
            <>
              <SectionTitle text="工商候选（选中自动建档）" />
              {extQ.isFetching && <Hint text="工商检索中…" />}
              {!extQ.isFetching && externals.length === 0 && <Hint text="无更多工商候选" />}
              {externals.map((c) => (
                <Row key={`e${c.keyNo}`} icon={<Plus size={14} className="text-success" />} title={c.name}
                  subtitle={`${c.operName ?? ''}${c.status ? ' · ' + c.status : ''}`}
                  right={creating === c.keyNo ? '建档中…' : '新建并选中'}
                  onClick={() => creating || pickExternal(c)} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SectionTitle({ text }: { text: string }) {
  return <div className="border-t border-border/60 px-3 pb-0.5 pt-1.5 text-[11px] font-medium text-text-faint first:border-t-0">{text}</div>;
}
function Hint({ text }: { text: string }) {
  return <div className="px-3 py-1.5 text-xs text-text-faint">{text}</div>;
}
function Row({ icon, title, subtitle, right, indent, active, onClick }: {
  icon: React.ReactNode; title: string; subtitle?: string; right?: string; indent?: boolean; active?: boolean; onClick: () => void;
}) {
  return (
    <button onClick={onClick} className={cn('flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-bg', indent && 'pl-7', active && 'text-primary')}>
      {icon}
      <span className="truncate">{title}</span>
      {subtitle && <span className="truncate text-xs text-text-faint">{subtitle}</span>}
      {right && <span className="ml-auto shrink-0 text-xs text-success">{right}</span>}
    </button>
  );
}
