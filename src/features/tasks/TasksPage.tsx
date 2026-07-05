import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Circle } from 'lucide-react';
import { tasksApi } from '@/api/crm';
import { useListQuery } from '@/hooks/useListQuery';
import { useUI } from '@/store/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader, CountBadge, UserCell } from '@/components/ui/primitives';
import { Tabs } from '@/components/ui/Tabs';
import { StatusTag } from '@/components/ui/StatusTag';
import { cn } from '@/lib/cn';
import { formatDate, daysUntil } from '@/lib/format';
import { userName } from '@/mock/org';
import type { BackLog } from '@/types';

// §7 类型（back_log.business_type）
const TYPE_LABEL: Record<number, string> = {
  10: '跟进计划',
  20: '合同',
  30: '审批',
  40: '工单',
  50: '掉保客户',
  51: '掉保线索',
  60: '回款计划',
  70: '商机阶段超时',
  80: '合同法务审核',
};
const TYPE_KIND: Record<number, 'info' | 'success' | 'warning' | 'danger' | 'neutral'> = {
  10: 'info', 20: 'success', 30: 'warning', 40: 'info', 50: 'danger', 51: 'danger', 60: 'warning', 70: 'danger', 80: 'warning',
};

export function TasksPage() {
  const q = useListQuery<BackLog>('tasks', tasksApi.list, { pageSize: 100, defaultTab: 'mine' });
  const [typeFilter, setTypeFilter] = useState<number | null>(null);
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);

  const { data: counts = {} } = useQuery({ queryKey: ['task-counts'], queryFn: () => tasksApi.counts() });

  const complete = async (id: number) => {
    await tasksApi.complete(id);
    qc.invalidateQueries({ queryKey: ['tasks'] });
    qc.invalidateQueries({ queryKey: ['task-counts'] });
    toast('已完成待办', 'success');
  };

  const rows = q.data.filter((b) => (typeFilter == null ? true : b.businessType === typeFilter));

  // 按到期分组
  const groups: { label: string; items: BackLog[] }[] = [
    { label: '已逾期', items: rows.filter((b) => b.status === 0 && daysUntil(b.deadlineDate) < 0) },
    { label: '今天', items: rows.filter((b) => b.status === 0 && daysUntil(b.deadlineDate) === 0) },
    { label: '未来 7 天', items: rows.filter((b) => b.status === 0 && daysUntil(b.deadlineDate) > 0 && daysUntil(b.deadlineDate) <= 7) },
    { label: '已完成', items: rows.filter((b) => b.status === 1) },
  ];

  return (
    <div>
      <PageHeader title="待办中心" description="统一 back_log · 分析→待办→动作 闭环" />
      <div className="mb-3">
        <Tabs items={[{ key: 'mine', label: '我的待办' }, { key: 'team', label: '团队待办' }]} value={q.tab} onChange={q.setTab} className="border-0" />
      </div>

      <div className="grid grid-cols-[220px_1fr] gap-4">
        {/* 类型筛选 */}
        <Card className="h-fit">
          <CardHeader title="类型" />
          <div className="p-2">
            <FilterRow label="全部" active={typeFilter == null} count={Object.values(counts).reduce((a, b) => a + b, 0)} onClick={() => setTypeFilter(null)} />
            {Object.entries(TYPE_LABEL).map(([t, label]) => (
              <FilterRow
                key={t}
                label={label}
                active={typeFilter === Number(t)}
                count={counts[Number(t)] ?? 0}
                onClick={() => setTypeFilter(Number(t))}
              />
            ))}
          </div>
        </Card>

        {/* 任务流 */}
        <div className="space-y-4">
          {groups.map((g) =>
            g.items.length === 0 ? null : (
              <Card key={g.label}>
                <CardHeader title={<span className="flex items-center gap-2">{g.label}<CountBadge count={g.items.length} kind="neutral" /></span>} />
                <div className="divide-y divide-border">
                  {g.items.map((b) => (
                    <div key={b.backLogId} className="flex items-center gap-3 px-4 py-3">
                      <button
                        onClick={() => b.status === 0 && complete(b.backLogId)}
                        className={cn('shrink-0', b.status === 1 ? 'text-success' : 'text-text-faint hover:text-primary')}
                      >
                        {b.status === 1 ? <Check size={18} /> : <Circle size={18} />}
                      </button>
                      <StatusTag kind={TYPE_KIND[b.businessType]} label={TYPE_LABEL[b.businessType]} dot={false} />
                      <span className={cn('flex-1 text-sm', b.status === 1 ? 'text-text-faint line-through' : 'text-text')}>
                        {b.businessName}
                        {b.tipMsg && <span className="ml-2 text-xs text-text-faint">{b.tipMsg}</span>}
                      </span>
                      <UserCell name={userName(b.userId)} />
                      <span className={cn('w-24 text-right text-xs', daysUntil(b.deadlineDate) < 0 && b.status === 0 ? 'text-danger' : 'text-text-faint')}>
                        {formatDate(b.deadlineDate)}
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

function FilterRow({ label, active, count, onClick }: { label: string; active: boolean; count: number; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm',
        active ? 'bg-primary-weak font-medium text-primary' : 'text-text-weak hover:bg-bg',
      )}
    >
      {label}
      <CountBadge count={count} kind={active ? 'primary' : 'neutral'} />
    </button>
  );
}
