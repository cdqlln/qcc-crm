import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, Briefcase, FileText, HandCoins, Handshake, TrendingUp, UserPlus, Wallet } from 'lucide-react';
import { backLogs, contracts, customers, opportunities, payments, tasksApi } from '@/api/crm';
import { trackings } from '@/mock/data';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card, CardHeader, Avatar } from '@/components/ui/primitives';
import { Chart, CHART_COLORS } from '@/components/ui/Chart';
import { Timeline } from '@/components/ui/Timeline';
import { cn } from '@/lib/cn';
import { formatCompact } from '@/lib/money';
import { useTerm } from '@/hooks/useTerms';
import { TERMS_BIZ } from '@/mock/terms';
import { userName, MOCK_USERS, CURRENT_USER } from '@/mock/org';
import { formatDate, dayjs } from '@/lib/format';

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

export function DashboardPage() {
  const [scope, setScope] = useState('company');
  const [time, setTime] = useState('month');
  const navigate = useNavigate();
  const term = useTerm();

  const { data: counts = {} } = useQuery({ queryKey: ['task-counts'], queryFn: () => tasksApi.counts() });

  // 范围/时间筛选（#2：使右上角切换真实生效）
  const deptUserIds = MOCK_USERS.filter((u) => u.depId === CURRENT_USER.depId).map((u) => u.userId);
  const inScope = (leaderId?: number) =>
    scope === 'company' ? true : scope === 'dept' ? deptUserIds.includes(leaderId ?? -1) : leaderId === CURRENT_USER.userId;
  const start = dayjs().startOf(time === 'day' ? 'day' : time === 'week' ? 'week' : time === 'quarter' ? 'quarter' : 'month');
  const inTime = (date?: string) => (date ? dayjs(date).isAfter(start) : true);
  const fc = customers.filter((c) => inScope(c.leaderId));
  const fo = opportunities.filter((o) => inScope(o.leaderId));
  const fct = contracts.filter((c) => inScope(c.leaderId));

  // KPI（叠加范围；"新增"类叠加时间）
  const newLeads = fc.filter((c) => c.category <= 2 && inTime(c.createDate)).length;
  const newCustomers = fc.filter((c) => c.category >= 3 && inTime(c.createDate)).length;
  const contractAmount = fct.reduce((s, c) => s + Number(c.amount), 0);
  const receivedAmount = fct.reduce((s, c) => s + Number(c.receivedAmount), 0);
  const outstanding = fct.reduce((s, c) => s + Number(c.outstandingAmount), 0);

  const kpis = [
    { label: '新增线索', value: newLeads, icon: UserPlus, path: '/leads', delta: '+12%' },
    { label: '新增客户', value: newCustomers, icon: UserPlus, path: '/customers', delta: '+8%' },
    { label: '商机数', value: fo.length, icon: Briefcase, path: '/opportunities', delta: '+5%' },
    { label: '合同数', value: fct.length, icon: Handshake, path: '/contracts', delta: '+3%' },
    { label: '合同额', value: formatCompact(String(contractAmount)), icon: FileText, path: '/contracts', delta: '+15%' },
    { label: '回款额', value: formatCompact(String(receivedAmount)), icon: Wallet, path: '/payments', delta: '+9%' },
    { label: '应收额', value: formatCompact(String(outstanding)), icon: HandCoins, path: '/payments', delta: '', warn: true },
  ];

  // 商机漏斗
  const stages = term.options(TERMS_BIZ.oppStage).filter((s) => s.kind !== 'danger');
  const funnelOption = {
    color: CHART_COLORS,
    tooltip: { trigger: 'item' },
    series: [{ type: 'funnel', left: '5%', width: '90%', label: { formatter: '{b}: {c}' }, data: stages.map((s) => ({ name: s.name, value: fo.filter((o) => o.status === s.termId).length })) }],
  };

  // 线索转化率仪表
  const converted = customers.filter((c) => c.category <= 2 && c.currentTrackingStatus === 17).length;
  const convRate = newLeads ? (converted / newLeads) * 100 : 0;
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
        data: [{ value: Number(convRate.toFixed(1)) }],
      },
    ],
  };

  // PK 榜
  const pk = MOCK_USERS.map((u) => ({ name: u.name, amount: contracts.filter((c) => c.leaderId === u.userId).reduce((s, c) => s + Number(c.amount), 0) }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 6);
  const maxPk = Math.max(1, ...pk.map((p) => p.amount));

  // 待办汇总
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

      {/* KPI 卡 */}
      <div className="mb-4 grid grid-cols-7 gap-3">
        {kpis.map((k) => (
          <button key={k.label} onClick={() => navigate(k.path)} className="group text-left">
            <Card className="p-3.5 transition-colors group-hover:border-primary/40">
              <div className="flex items-center justify-between">
                <span className="text-xs text-text-faint">{k.label}</span>
                <k.icon size={15} className="text-text-faint" />
              </div>
              <div className={cn('mt-2 text-xl font-semibold', k.warn ? 'text-warning' : 'text-text')}>{k.value}</div>
              {k.delta && (
                <div className="mt-1 flex items-center gap-0.5 text-xs text-success">
                  <ArrowUpRight size={12} />
                  {k.delta}
                </div>
              )}
            </Card>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Card>
          <CardHeader title="商机漏斗" extra={<button onClick={() => navigate('/analytics/opportunity')} className="text-xs text-primary">查看分析</button>} />
          <Chart option={funnelOption} />
        </Card>
        <Card>
          <CardHeader title="线索转化率" />
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
                <span className="w-12 text-sm text-text">{p.name}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${(p.amount / maxPk) * 100}%` }} />
                </div>
                <span className="w-16 text-right text-xs tabular-nums text-text-weak">{formatCompact(String(p.amount))}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* 最新跟进流 */}
      <Card className="mt-4">
        <CardHeader title="最新跟进流" />
        <div className="p-4">
          <Timeline
            items={trackings
              .slice()
              .sort((a, b) => b.createDate.localeCompare(a.createDate))
              .slice(0, 6)
              .map((t) => ({
                id: t.trackingId,
                kind: t.priorityLevel === 2 ? 'neutral' : 'info',
                title: `${userName(t.createBy)} 跟进了 ${customers.find((c) => c.customerId === t.customerId)?.name?.slice(0, 10) ?? ''}`,
                meta: formatDate(t.createDate, 'MM-DD HH:mm'),
                body: t.comment,
              }))}
          />
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
