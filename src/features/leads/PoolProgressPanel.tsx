import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { leadsApi } from '@/api/crm';
import { Card } from '@/components/ui/primitives';
import { StatusTag } from '@/components/ui/StatusTag';
import { UserCell } from '@/components/ui/primitives';
import { EmptyState, TableSkeleton } from '@/components/ui/states';
import { formatDate, fromNow } from '@/lib/format';
import { cn } from '@/lib/cn';

const STATUS_META = {
  unfollowed: { label: '未跟进', kind: 'danger' as const },
  following: { label: '跟进中', kind: 'info' as const },
  converted: { label: '已转化', kind: 'success' as const },
};

/**
 * 线索池·分配进展（销售管理）：待分配水位 + 已分配线索的跟进/转化进展，
 * 未跟进（分配后无动作）标红提醒管理者督办。
 */
export function PoolProgressPanel() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'unfollowed' | 'following' | 'converted'>('all');
  const { data, isLoading } = useQuery({ queryKey: ['pool-overview'], queryFn: () => leadsApi.poolOverview() });

  if (isLoading) return <Card className="p-4"><TableSkeleton rows={5} cols={5} /></Card>;
  if (!data) return <EmptyState title="加载失败" />;

  const rows = filter === 'all' ? data.list : data.list.filter((x) => x.status === filter);
  const stats = [
    { key: 'all', label: '待分配（池中）', value: data.pending, sub: `今日新进 ${data.todayIn}`, kind: 'neutral' },
    { key: 'unfollowed', label: '已分配·未跟进', value: data.unfollowed, kind: 'danger' },
    { key: 'following', label: '已分配·跟进中', value: data.following, kind: 'info' },
    { key: 'converted', label: '已分配·已转化', value: data.converted, kind: 'success' },
  ] as const;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-4 gap-3">
        {stats.map((st) => (
          <button key={st.key} onClick={() => setFilter(st.key === 'all' ? 'all' : (st.key as any))}
            className={cn('rounded-lg border p-3 text-left transition-colors',
              filter === st.key || (st.key === 'all' && filter === 'all') ? 'border-primary bg-primary-weak/40' : 'border-border hover:border-primary/40')}>
            <div className="text-xs text-text-faint">{st.label}</div>
            <div className={cn('mt-1 text-2xl font-semibold tabular-nums',
              st.kind === 'danger' && st.value > 0 ? 'text-danger' : st.kind === 'success' ? 'text-success' : 'text-text')}>
              {st.value}
            </div>
            {'sub' in st && st.sub && <div className="text-xs text-text-faint">{st.sub}</div>}
          </button>
        ))}
      </div>

      <Card>
        {rows.length === 0 ? <EmptyState title="暂无记录" description="分配线索后在此跟踪各负责人的推进情况" /> : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-faint">
                <th className="px-4 py-2.5 font-normal">线索</th>
                <th className="px-4 py-2.5 font-normal">来源</th>
                <th className="px-4 py-2.5 font-normal">负责人</th>
                <th className="px-4 py-2.5 font-normal">分配时间</th>
                <th className="px-4 py-2.5 font-normal">最新跟进</th>
                <th className="px-4 py-2.5 text-right font-normal">跟进次数</th>
                <th className="px-4 py-2.5 font-normal">进展</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.customerId} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-bg"
                  onClick={() => navigate(r.status === 'converted' ? `/customers/${r.customerId}` : `/leads/${r.customerId}`)}>
                  <td className="px-4 py-2.5 font-medium text-primary">{r.name}</td>
                  <td className="px-4 py-2.5 text-xs text-text-weak">{r.sourceName || '—'}</td>
                  <td className="px-4 py-2.5"><UserCell name={r.leaderName} /></td>
                  <td className="px-4 py-2.5 text-text-weak">{formatDate(r.assignAt)}</td>
                  <td className="px-4 py-2.5 text-text-weak">
                    {r.status === 'unfollowed' ? <span className="text-danger">分配后无跟进（{fromNow(r.assignAt)}分配）</span> : formatDate(r.trackingUpdateDate, 'MM-DD HH:mm')}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-text-weak">{r.trackingNum}</td>
                  <td className="px-4 py-2.5"><StatusTag {...STATUS_META[r.status]} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
