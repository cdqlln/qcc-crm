import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DatabaseZap, Search } from 'lucide-react';
import { apiPricesApi } from '@/api/crm';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/primitives';
import { cn } from '@/lib/cn';
import type { ApiQuoteItem } from '@/types';

/**
 * 数据接口报价清单选择器：从「数据产品价目表」勾选接口，
 * 每项可设报价单价（默认标准价，可折）与预估月调用量（框架可为 0）。
 */
export function ApiItemsPicker({ initial, onSave, onClose }: {
  initial: ApiQuoteItem[];
  onSave: (items: ApiQuoteItem[]) => void;
  onClose: () => void;
}) {
  const [kw, setKw] = useState('');
  const [category, setCategory] = useState('');
  const [picked, setPicked] = useState<Map<string, ApiQuoteItem>>(new Map(initial.map((i) => [i.apiCode, { ...i }])));

  const { data: rows = [], isFetching } = useQuery({
    queryKey: ['api-prices-picker', kw, category],
    queryFn: () => apiPricesApi.list(kw || undefined, category || undefined),
    staleTime: 60_000,
  });
  const { data: allRows = [] } = useQuery({ queryKey: ['api-prices-picker', '', ''], queryFn: () => apiPricesApi.list(), staleTime: 60_000 });
  const categories = useMemo(() => [...new Set(allRows.map((r) => r.category).filter(Boolean))], [allRows]);

  const toggle = (apiCode: string) => {
    setPicked((m) => {
      const next = new Map(m);
      if (next.has(apiCode)) next.delete(apiCode);
      else {
        const r = rows.find((x) => x.apiCode === apiCode) ?? allRows.find((x) => x.apiCode === apiCode);
        if (r) next.set(apiCode, { apiCode: r.apiCode, name: r.name, price: r.price, quotePrice: r.price, estCalls: 0, unit: r.unit });
      }
      return next;
    });
  };
  const patch = (apiCode: string, p: Partial<ApiQuoteItem>) => {
    setPicked((m) => {
      const next = new Map(m);
      const cur = next.get(apiCode);
      if (cur) next.set(apiCode, { ...cur, ...p });
      return next;
    });
  };

  const items = [...picked.values()];
  const estMonthly = items.reduce((s, i) => s + i.quotePrice * i.estCalls, 0);

  return (
    <Dialog open width="w-[860px]" onClose={onClose}
      title={<span className="flex items-center gap-2"><DatabaseZap size={16} className="text-primary" />选择数据接口（价目表 2026）</span>}
      footer={
        <>
          <span className="mr-auto text-sm text-text-weak">
            已选 <b className="text-text">{items.length}</b> 项
            {estMonthly > 0 && <> · 预估月费用 <b className="text-primary">¥{estMonthly.toLocaleString('zh-CN', { maximumFractionDigits: 2 })}</b></>}
          </span>
          <Button onClick={onClose}>取消</Button>
          <Button variant="primary" onClick={() => { onSave(items); onClose(); }}>确定（{items.length} 项）</Button>
        </>
      }>
      <div className="grid grid-cols-2 gap-4" style={{ height: 440 }}>
        {/* 左：价目表 */}
        <div className="flex min-h-0 flex-col">
          <div className="mb-2 flex h-8 items-center gap-1.5 rounded-md border border-border px-2">
            <Search size={13} className="text-text-faint" />
            <input value={kw} onChange={(e) => setKw(e.target.value)} placeholder="接口名称 / ApiCode…" className="flex-1 bg-transparent text-sm outline-none" />
          </div>
          <div className="mb-2 flex flex-wrap gap-1">
            <Chip label="全部" active={!category} onClick={() => setCategory('')} />
            {categories.map((c) => <Chip key={c} label={c} active={category === c} onClick={() => setCategory(c)} />)}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
            {isFetching && <div className="px-3 py-2 text-xs text-text-faint">加载中…</div>}
            {rows.map((r) => (
              <label key={r.apiCode} className="flex cursor-pointer items-center gap-2 border-b border-border/50 px-3 py-1.5 text-sm last:border-0 hover:bg-bg">
                <input type="checkbox" checked={picked.has(r.apiCode)} onChange={() => toggle(r.apiCode)} />
                <span className="w-14 shrink-0 font-mono text-xs text-text-faint">{r.apiCode}</span>
                <span className="min-w-0 flex-1 truncate" title={r.remark || r.name}>{r.name}</span>
                <span className="shrink-0 text-xs tabular-nums text-text-weak">¥{r.price}/{r.unit}</span>
              </label>
            ))}
            {!isFetching && rows.length === 0 && <div className="px-3 py-4 text-center text-xs text-text-faint">无匹配接口</div>}
          </div>
        </div>

        {/* 右：已选清单（报价单价 + 预估调用量） */}
        <div className="flex min-h-0 flex-col">
          <div className="mb-2 flex h-8 items-center text-xs text-text-faint">
            已选接口 · 报价单价可低于标准价（折让体现在此），预估月调用量仅用于估费，框架按实际用量结算
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
            {items.length === 0 && <div className="px-3 py-6 text-center text-xs text-text-faint">从左侧勾选接口</div>}
            {items.map((i) => (
              <div key={i.apiCode} className="border-b border-border/50 px-3 py-2 last:border-0">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate font-medium text-text">{i.name}</span>
                  <button onClick={() => toggle(i.apiCode)} className="shrink-0 text-xs text-text-faint hover:text-danger">移除</button>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-text-weak">
                  <span>标准 ¥{i.price}/{i.unit}</span>
                  <span className="flex items-center gap-1">
                    报价
                    <input
                      value={String(i.quotePrice)}
                      onChange={(e) => patch(i.apiCode, { quotePrice: Math.max(0, Number(e.target.value) || 0) })}
                      className={cn('h-6 w-16 rounded border px-1.5 text-right tabular-nums outline-none focus:border-primary',
                        i.quotePrice < i.price ? 'border-warning text-warning' : 'border-border')}
                    />
                    元/{i.unit}
                  </span>
                  <span className="flex items-center gap-1">
                    预估月量
                    <input
                      value={String(i.estCalls)}
                      onChange={(e) => patch(i.apiCode, { estCalls: Math.max(0, Number(e.target.value) || 0) })}
                      className="h-6 w-20 rounded border border-border px-1.5 text-right tabular-nums outline-none focus:border-primary"
                    />
                  </span>
                  {i.estCalls > 0 && <span className="ml-auto tabular-nums text-text">≈ ¥{(i.quotePrice * i.estCalls).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}/月</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={cn('rounded-full border px-2 py-0.5 text-[11px]', active ? 'border-primary bg-primary-weak text-primary' : 'border-border text-text-weak hover:border-primary/50')}>
      {label}
    </button>
  );
}
