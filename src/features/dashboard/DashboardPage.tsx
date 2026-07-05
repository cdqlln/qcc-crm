import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownRight, ArrowUpRight, Briefcase, FileText, HandCoins, Handshake, UserPlus, Wallet } from 'lucide-react';
import { dashboardApi, tasksApi } from '@/api/crm';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader, Avatar } from '@/components/ui/primitives';
import { Chart, CHART_COLORS } from '@/components/ui/Chart';
import { Timeline } from '@/components/ui/Timeline';
import { TableSkeleton } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { formatCompact } from '@/lib/money';
import { useTerm } from '@/hooks/useTerms';
import { TERMS_BIZ } from '@/mock/terms';
import { formatDate } from '@/lib/format';

const SCOPES = [
  { key: 'company', label: '全公司' },
  { key: 'dept', label: '本部门' },
  { key: 'me', label: '我' },
];
const TIMES = [
  { key: 'day', label: '本日' },
  { key: 'week', label: '本周' },
  { key: 'month', label: '本月' },
  { key: 'quarter', label: '本季' },
];

// 真实环比：上期为 0 时不显示（避免无意义的 ∞ 增幅）
function delta(cur: number, prev: number): number | null {
  if (prev <= 0) return null;
  return Math.round(((cur - prev) / prev) * 1000) / 10;
}

export function DashboardPage() {
  const [scope, setScope] = useState('company');
  const [time, setTime] = useState('month');
  const navigate = useNavigate();
  const term = useTerm();

  const { data: counts = {} } = useQuery({ queryKey: ['task-counts'], queryFn: () => tasksApi.counts() });
  // 工作台全部指标来自真实数据（后端 /dashboard 聚合；Mock 模式由内存数据同构计算）
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard', scope, time],
    queryFn: () => dashboardApi.data(scope, time),
  });

  const k = data?.kpis;
  const kpis = k
    ? [
        { label: '新增线索', value: String(k.newLeads), icon: UserPlus, path: '/leads', delta: delta(k.newLeads, k.prevLeads) },
        { label: '新增客户', value: String(k.newCustomers), icon: UserPlus, path: '/customers', delta: delta(k.newCustomers, k.prevCustomers) },
        { label: '商机数', value: String(k.oppCount), icon: Briefcase, path: '/opportunities', delta: null },
        { label: '合同数', value: String(k.contractCount), icon: Handshake, path: '/contracts', delta: null },
        { label: '合同额', value: formatCompact(String(k.contractAmount)), icon: FileText, path: '/contracts', delta: null },
        { label: '回款额', value: formatCompact(String(k.receivedAmount)), icon: Wallet, path: '/payments', delta: null },
        { label: '应收额', value: formatCompact(String(k.outstandingAmount)), icon: HandCoins, path: '/payments', delta: null, warn: true },
      ]
    : [];

  // 商机漏斗（阶段字典 × 真实计数）
  const stages = term.options(TERMS_BIZ.oppStage).filter((s) => s.kind !== 'danger');
  const funnelCount = new Map((data?.funnel ?? []).map((f) => [f.termId, f.count]));
  const funnelOption = {
    color: CHART_COLORS,
    tooltip: { trigger: 'item' },
    series: [{ type: 'funnel', left: '5%', width: '90%', label: { formatter: '{b}: {c}' }, data: stages.map((s) => ({ name: s.name, value: funnelCount.get(s.termId) ?? 0 })) }],
  };

  const convRate = data?.conversion.rate ?? 0;
  const gaugeOption = {
    series: [
      {
        type: 'gauge',
        startAngle: 200,
        endAngle: -20,
        min: 0,
        max: 100,
        progress: { show: true, width: 16, itemStyle: { color: '#2A6FF0' } },
        axisLine: { lineStyle: { width: 16 } },
        axisTick: { show: false },
        splitLine: { show: false },
        axisLabel: { distance: 22, fontSize: 10 },
        pointer: { width: 4 },
        detail: { valueAnimation: true, formatter: '{value}%', fontSize: 26, offsetCenter: [0, '38%'] },
        data: [{ value: convRate }],
      },
    ],
  };

  const pk = data?.pk ?? [];
  const maxPk = Math.max(1, ...pk.map((p) => p.amount));

  const todoCards = [
    { label: '回款催收', count: counts[60] ?? 0, type: 60 },
    { label: '商机超时', count: counts[70] ?? 0, type: 70 },
    { label: '待审批', count: counts[30] ?? 0, type: 30 },
    { label: '工单', count: counts[40] ?? 0, type: 40 },
  ];

  return (
    <div>
      <PageHeader
        title="工作台"
        extra={
          <div className="flex items-center gap-2">
            <Segment items={SCOPES} value={scope} onChange={setScope} />
            <Segment items={TIMES} value={time} onChange={setTime} />
          </div>
        }
      />

      {/* KPI 卡（真实统计 + 真实环比） */}
      {isLoading ? (
        <Card className="mb-4 p-4"><TableSkeleton rows={2} cols={7} /></Card>
      ) : (
        <div className="mb-4 grid grid-cols-7 gap-3">
          {kpis.map((kp) => (
            <button key={kp.label} onClick={() => navigate(kp.path)} className="group text-left">
              <Card className="p-3.5 transition-colors group-hover:border-primary/40">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-text-faint">{kp.label}</span>
                  <kp.icon size={15} className="text-text-faint" />
                </div>
                <div className={cn('mt-2 text-xl font-semibold', kp.warn ? 'text-warning' : 'text-text')}>{kp.value}</div>
                {kp.delta != null && (
                  <div className={cn('mt-1 flex items-center gap-0.5 text-xs', kp.delta >= 0 ? 'text-success' : 'text-danger')}>
                    {kp.delta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                    {kp.delta >= 0 ? '+' : ''}{kp.delta}% 环比
                  </div>
                )}
              </Card>
            </button>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader title="商机漏斗" extra={<button onClick={() => navigate('/analytics/opportunity')} className="text-xs text-primary">查看分析</button>} />
          <Chart option={funnelOption} />
        </Card>
        <Card>
          <CardHeader
            title="线索转化率"
            extra={data ? <span className="text-xs text-text-faint">期内新线索 {data.conversion.newLeads} · 已转商机 {data.conversion.converted}</span> : null}
          />
          <Chart option={gaugeOption} />
        </Card>

        {/* 待办汇总 */}
        <Card>
          <CardHeader title="待办概览" extra={<button onClick={() => navigate('/tasks')} className="text-xs text-primary">前往待办中心</button>} />
          <div className="grid grid-cols-4 gap-3 p-4">
            {todoCards.map((t) => (
              <button
                key={t.label}
                onClick={() => navigate('/tasks')}
                className="rounded-lg border border-border p-3 text-center transition-colors hover:border-primary/40"
              >
                <div className={cn('text-2xl font-semibold', t.count > 0 ? 'text-danger' : 'text-text-faint')}>{t.count}</div>
                <div className="mt-1 text-xs text-text-weak">{t.label}</div>
              </button>
            ))}
          </div>
        </Card>

        {/* 绩效 PK 榜 */}
        <Card>
          <CardHeader title="绩效 PK 榜 · 合同额" />
          <div className="space-y-2.5 p-4">
            {pk.map((p, i) => (
              <div key={p.name} className="flex items-center gap-3">
                <span className={cn('w-5 text-center text-sm font-semibold', i === 0 ? 'text-warning' : 'text-text-faint')}>{i + 1}</span>
                <Avatar name={p.name} size={24} />
                <span className="w-12 truncate text-sm text-text">{p.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(p.amount / maxPk) * 100}%` }} />
                </div>
                <span className="w-16 text-right text-xs tabular-nums text-text-weak">{formatCompact(String(p.amount))}</span>
              </div>
            ))}
            {!isLoading && pk.length === 0 && <div className="py-4 text-center text-xs text-text-faint">暂无数据</div>}
          </div>
        </Card>
      </div>

      {/* 最新跟进流 */}
      <Card className="mt-4">
        <CardHeader title="最新跟进流" />
        <div className="p-4">
          {(data?.recentTrackings ?? []).length === 0 ? (
            <div className="py-4 text-center text-xs text-text-faint">暂无跟进记录</div>
          ) : (
            <Timeline
              items={(data?.recentTrackings ?? []).map((t, i) => ({
                id: i,
                kind: t.priorityLevel === 2 ? 'neutral' : 'info',
                title: `${t.by} 跟进了 ${t.customerName.slice(0, 12)}`,
                meta: formatDate(t.at, 'MM-DD HH:mm'),
                body: t.comment,
              }))}
            />
          )}
        </div>
      </Card>
    </div>
  );
}

function Segment({ items, value, onChange }: { items: { key: string; label: string }[]; value: string; onChange: (k: string) => void }) {
  return (
    <div className="flex items-center rounded-md border border-border bg-surface p-0.5">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          className={cn('rounded px-2.5 py-1 text-sm transition-colors', value === it.key ? 'bg-primary-weak font-medium text-primary' : 'text-text-weak hover:text-text')}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
