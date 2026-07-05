import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, BadgeCheck, Banknote, Bot, CalendarClock, ClipboardList,
  RefreshCw, Sparkles, TrendingUp, UserRound, Users,
} from 'lucide-react';
import { customersApi } from '@/api/crm';
import { useUI } from '@/store/ui';
import { Button } from '@/components/ui/primitives';
import { StatusTag } from '@/components/ui/StatusTag';
import { EmptyState } from '@/components/ui/states';
import { formatDate } from '@/lib/format';
import type { CustomerInsightReport } from '@/types';

const fmtMoney = (n: number) => `¥${n.toLocaleString('zh-CN')}`;

/**
 * 客户洞察面板：AI 模型（可在 设置→集成配置 配置）基于 CRM 真实数据生成——
 * 当前项目负责人 / 跟进进展 / 过往订单与回款 的可读分析。
 * 未配置模型时后端返回规则版（明确标注），保证功能可用。
 */
export function CustomerInsightPanel({ customerId }: { customerId: number }) {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);

  // 页面加载先展示最近一次洞察，避免重复消耗模型额度
  const { data: report, isLoading } = useQuery({
    queryKey: ['customer-insight', customerId],
    queryFn: () => customersApi.insight(customerId),
  });

  const gen = useMutation({
    mutationFn: () => customersApi.generateInsight(customerId),
    onSuccess: (r) => {
      qc.setQueryData(['customer-insight', customerId], r);
      toast(r.generatedBy === 'llm' ? `AI 洞察已生成（${r.model}）` : '已生成规则版洞察（未配置 AI 模型）', 'success');
    },
    onError: (e) => toast(e instanceof Error ? e.message : '生成失败', 'error'),
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-gradient-to-br from-primary to-[#8B5CF6] text-white">
            <Sparkles size={16} />
          </span>
          <div>
            <div className="text-sm font-semibold text-text">客户洞察</div>
            <div className="text-xs text-text-faint">AI 分析：项目负责人 · 跟进进展 · 订单与回款</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <>
              <StatusTag
                kind={report.generatedBy === 'llm' ? 'success' : 'neutral'}
                label={report.generatedBy === 'llm' ? `AI 模型 · ${report.model}` : '规则版（未配置 AI 模型）'}
              />
              <span className="text-xs text-text-faint">{formatDate(report.createdAt, 'MM-DD HH:mm')}</span>
            </>
          )}
          <Button variant="primary" size="sm" onClick={() => gen.mutate()} disabled={gen.isPending}>
            {gen.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Bot size={13} />}
            {gen.isPending ? '分析中…' : report ? '重新生成' : '生成洞察'}
          </Button>
        </div>
      </div>

      {isLoading && <div className="space-y-3"><div className="skeleton h-6 w-1/2" /><div className="skeleton h-24 w-full" /></div>}

      {!isLoading && !report && !gen.isPending && (
        <EmptyState
          title="还没有生成过洞察"
          description="点击「生成洞察」，AI 将基于客户的商机、跟进、合同与回款数据输出分析。可在 设置→集成配置 中配置 AI 模型。"
        />
      )}

      {gen.isPending && !report && (
        <div className="space-y-3">
          <div className="skeleton h-6 w-2/3" />
          <div className="skeleton h-20 w-full" />
          <div className="skeleton h-32 w-full" />
        </div>
      )}

      {report && <InsightBody report={report} />}
    </div>
  );
}

function InsightBody({ report }: { report: CustomerInsightReport }) {
  const { insight, facts } = report;
  const t = facts.totals;
  const scoreColor = insight.healthScore >= 70 ? 'text-success' : insight.healthScore >= 40 ? 'text-warning' : 'text-danger';

  return (
    <div className="space-y-5">
      {/* 总评 + 健康度 */}
      <div className="flex flex-wrap items-stretch gap-4">
        <div className="min-w-64 flex-1 rounded-lg bg-primary-weak/60 p-4">
          <p className="text-sm leading-relaxed text-text">{insight.summary}</p>
        </div>
        <div className="flex w-32 flex-col items-center justify-center rounded-lg border border-border p-4">
          <div className={`text-3xl font-bold ${scoreColor}`}>{insight.healthScore}</div>
          <div className="mt-1 text-xs text-text-faint">客户健康度</div>
        </div>
      </div>

      {/* 关键数字（事实，非模型生成） */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="在途商机" value={`${t.oppCount} 个`} sub={fmtMoney(t.oppAmount)} />
        <Stat label="历史合同" value={`${t.contractCount} 份`} sub={fmtMoney(t.contractAmount)} />
        <Stat label="已回款" value={fmtMoney(t.receivedAmount)} sub={`回款率 ${t.receivedRate}%`} />
        <Stat label="未回款" value={fmtMoney(t.outstandingAmount)} warn={t.outstandingAmount > 0} />
        <Stat label="已开票" value={fmtMoney(t.invoiceAmount)} />
        <Stat label="逾期回款计划" value={`${facts.overduePayments.length} 笔`} warn={facts.overduePayments.length > 0} />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 当前项目负责人 */}
        <Block icon={<Users size={15} className="text-primary" />} title="当前项目负责人">
          {insight.owners.length === 0 ? <Hint text="暂无负责人信息" /> : (
            <div className="space-y-2">
              {insight.owners.map((o, i) => (
                <div key={i} className="flex items-start gap-2.5 rounded-md border border-border px-3 py-2">
                  <UserRound size={15} className="mt-0.5 shrink-0 text-text-faint" />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 text-sm">
                      <span className="font-medium text-text">{o.name}</span>
                      <span className="rounded bg-bg px-1.5 py-0.5 text-[11px] text-text-weak">{o.role}</span>
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-text-weak">{o.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Block>

        {/* 跟进进展 */}
        <Block icon={<TrendingUp size={15} className="text-success" />} title="跟进进展">
          <p className="mb-2 text-sm leading-relaxed text-text">{insight.progress.assessment}</p>
          <ul className="space-y-1.5">
            {insight.progress.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-text-weak">
                <CalendarClock size={12} className="mt-0.5 shrink-0 text-text-faint" />{h}
              </li>
            ))}
          </ul>
        </Block>

        {/* 订单与回款 */}
        <Block icon={<Banknote size={15} className="text-warning" />} title="过往订单与回款">
          <p className="mb-2 text-sm leading-relaxed text-text">{insight.finance.assessment}</p>
          <ul className="space-y-1.5">
            {insight.finance.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs leading-relaxed text-text-weak">
                <BadgeCheck size={12} className="mt-0.5 shrink-0 text-text-faint" />{h}
              </li>
            ))}
          </ul>
          {facts.overduePayments.length > 0 && (
            <div className="mt-2 rounded-md bg-danger/5 p-2.5">
              {facts.overduePayments.map((p, i) => (
                <div key={i} className="flex items-center justify-between text-xs text-danger">
                  <span>「{p.contractName}」计划 {p.planDate}</span>
                  <span className="font-medium">逾期 {fmtMoney(p.outstanding)}</span>
                </div>
              ))}
            </div>
          )}
        </Block>

        {/* 风险 + 下一步 */}
        <div className="space-y-5">
          <Block icon={<AlertTriangle size={15} className="text-danger" />} title="风险提示">
            <ul className="space-y-1.5">
              {insight.risks.map((r, i) => (
                <li key={i} className="flex items-start gap-1.5 text-sm leading-relaxed text-text-weak">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-danger/70" />{r}
                </li>
              ))}
            </ul>
          </Block>
          <Block icon={<ClipboardList size={15} className="text-primary" />} title="下一步建议">
            <ol className="space-y-1.5">
              {insight.nextSteps.map((s, i) => (
                <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-text">
                  <span className="mt-0.5 flex shrink-0 items-center justify-center rounded-full bg-primary-weak text-[11px] font-medium text-primary" style={{ height: 18, width: 18 }}>{i + 1}</span>
                  {s}
                </li>
              ))}
            </ol>
          </Block>
        </div>
      </div>
    </div>
  );
}

function Block({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold text-text">{icon}{title}</div>
      {children}
    </div>
  );
}

function Stat({ label, value, sub, warn }: { label: string; value: string; sub?: string; warn?: boolean }) {
  return (
    <div className="rounded-lg border border-border px-3 py-2.5">
      <div className="text-xs text-text-faint">{label}</div>
      <div className={`mt-0.5 truncate text-sm font-semibold ${warn ? 'text-danger' : 'text-text'}`}>{value}</div>
      {sub && <div className="truncate text-xs text-text-weak">{sub}</div>}
    </div>
  );
}

function Hint({ text }: { text: string }) {
  return <div className="text-xs text-text-faint">{text}</div>;
}
