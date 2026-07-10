import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { prospectingApi } from '@/api/crm';
import { Card, CardHeader } from '@/components/ui/primitives';
import { Chart, CHART_COLORS } from '@/components/ui/Chart';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { TextInput } from '@/components/ui/form';
import { Skeleton } from '@/components/ui/states';
import { cn } from '@/lib/cn';
import { SIGNAL_TYPE, currentQuarter, pct } from './shared';

// 开拓指标体系（第十四条）：自拓占比 / 触达完成率 / 处置及时率 / 转商机率 / 白空间 / TAM渗透率
export function StatsTab() {
  const [quarter, setQuarter] = useState(currentQuarter());
  const q = useQuery({ queryKey: ['prospect-stats', quarter], queryFn: () => prospectingApi.stats(quarter) });
  const s = q.data;

  if (q.isLoading || !s) {
    return <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>;
  }

  const kpis = [
    {
      label: '自拓商机占比',
      value: pct(s.selfSourced.ratio),
      target: `目标 ≥${pct(s.selfSourced.targetRatio)}`,
      okay: s.selfSourced.ratio >= s.selfSourced.targetRatio,
      sub: `${s.selfSourced.prospectOpportunities}/${s.selfSourced.totalOpportunities} 个在途商机来自名单/信号`,
    },
    {
      label: '名单触达完成率',
      value: pct(s.listFunnel.touchRate),
      target: `目标 ≥${pct(s.listFunnel.touchRateTarget)}`,
      okay: s.listFunnel.touchRate >= s.listFunnel.touchRateTarget,
      sub: `${s.listFunnel.completed}/${s.listFunnel.total} 完成规定触达`,
    },
    {
      label: '信号处置及时率',
      value: pct(s.signals.timelyRate),
      target: `目标 ≥${pct(s.signals.timelyRateTarget)}`,
      okay: s.signals.timelyRate >= s.signals.timelyRateTarget,
      sub: `${s.signals.handled}/${s.signals.total} 已处置 · ${s.signals.pendingOverdue} 超期未处置`,
    },
    {
      label: '信号查准率',
      value: pct(s.signals.precision),
      target: `阈值 ≥${pct(s.signals.precisionTarget)}`,
      okay: s.signals.precision >= s.signals.precisionTarget,
      sub: '低于阈值的信号类型回炉调参',
    },
    {
      label: '名单转商机率',
      value: pct(s.listFunnel.convRate),
      target: '基线期测定',
      okay: true,
      sub: `${s.listFunnel.converted}/${s.listFunnel.total} 转报备商机`,
    },
    {
      label: '多SKU客户占比',
      value: pct(s.whitespace.multiSkuRatio),
      target: '持续提升',
      okay: true,
      sub: `户均 SKU ${s.whitespace.avgSku.toFixed(1)}（客户成功核心 KPI）`,
    },
    {
      label: '季度战役',
      value: `${s.campaigns.running}/${s.campaigns.total}`,
      target: '每线 1–2 个',
      okay: true,
      sub: `${s.campaigns.reviewed} 个已复盘沉淀`,
    },
    {
      label: '名单冷冻 / 收回',
      value: `${s.listFunnel.frozen} / ${s.listFunnel.recalled}`,
      target: '',
      okay: s.listFunnel.recalled === 0,
      sub: '超期未触达由系统收回改派',
    },
  ];

  const funnelOption = {
    tooltip: { trigger: 'item' },
    series: [
      {
        type: 'funnel', left: 24, right: 24, top: 8, bottom: 8, minSize: '18%', sort: 'none',
        label: { show: true, formatter: '{b}: {c}', color: '#5B6472' },
        data: [
          { name: '名单目标', value: s.listFunnel.total },
          { name: '已承接', value: s.listFunnel.claimed },
          { name: '已触达', value: s.listFunnel.touched },
          { name: '完成触达', value: s.listFunnel.completed },
          { name: '转商机', value: s.listFunnel.converted },
        ],
        itemStyle: { borderWidth: 0 },
        color: CHART_COLORS,
      },
    ],
  };

  const signalOption = {
    tooltip: { trigger: 'axis' },
    grid: { left: 40, right: 16, top: 28, bottom: 24 },
    legend: { top: 0 },
    xAxis: { type: 'category', data: s.signals.byType.map((t) => SIGNAL_TYPE[t.type]?.label ?? t.type) },
    yAxis: { type: 'value' },
    series: [
      { name: '信号量', type: 'bar', barWidth: 22, data: s.signals.byType.map((t) => t.total), itemStyle: { color: CHART_COLORS[0] } },
      { name: '已处置', type: 'bar', barWidth: 22, data: s.signals.byType.map((t) => t.handled), itemStyle: { color: CHART_COLORS[1] } },
      { name: '误报', type: 'bar', barWidth: 22, data: s.signals.byType.map((t) => t.falsePositive), itemStyle: { color: CHART_COLORS[4] } },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-text-weak">统计季度</span>
        <TextInput className="!w-28" value={quarter} onChange={(e) => setQuarter(e.target.value)} />
        <span className="text-xs text-text-faint">自拓占比为个人与团队季度考核项——派发线索是补给，不是口粮</span>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label} className="p-4">
            <div className="text-xs text-text-faint">{k.label}</div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className={cn('text-2xl font-semibold tabular-nums', k.okay ? 'text-text' : 'text-danger')}>{k.value}</span>
              {k.target && <span className="text-xs text-text-faint">{k.target}</span>}
            </div>
            <div className="mt-1 text-xs text-text-weak">{k.sub}</div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="作战名单漏斗" extra={<span className="text-xs text-text-faint">名单 → 承接 → 触达 → 转商机（季度口径）</span>} />
          <Chart option={funnelOption} height={260} />
        </Card>
        <Card>
          <CardHeader title="信号雷达处置" extra={<span className="text-xs text-text-faint">分类型信号量 / 处置 / 误报（查准率&lt;60% 回炉调参）</span>} />
          {s.signals.byType.length ? <Chart option={signalOption} height={260} /> : <div className="p-8 text-center text-sm text-text-faint">暂无信号数据</div>}
        </Card>
      </div>

      <Card>
        <CardHeader title="TAM 渗透率" extra={<span className="text-xs text-text-faint">渗透率 = 存量客户数 / TAM，按场景卡季度刷新</span>} />
        <div className="space-y-3 px-5 pb-5">
          {s.tam.map((t) => (
            <div key={t.icpId} className="flex items-center gap-3">
              <span className="w-44 shrink-0 truncate text-sm text-text">{t.line} · {t.name}</span>
              <div className="flex-1"><ProgressBar value={t.penetration * 100} height={8} /></div>
              <span className="w-28 shrink-0 text-right text-xs tabular-nums text-text-faint">{t.stockCount} / TAM {t.tamCount}</span>
            </div>
          ))}
          {s.tam.length === 0 && <div className="text-sm text-text-faint">尚未定义 ICP —— 在「ICP · TAM」页建立场景卡画像</div>}
        </div>
      </Card>
    </div>
  );
}
