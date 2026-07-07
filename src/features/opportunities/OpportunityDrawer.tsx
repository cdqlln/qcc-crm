import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FileText, XCircle } from 'lucide-react';
import { opportunitiesApi } from '@/api/crm';
import { Drawer } from '@/components/ui/Drawer';
import { Tabs } from '@/components/ui/Tabs';
import { Button, UserCell } from '@/components/ui/primitives';
import { Descriptions } from '@/components/ui/Descriptions';
import { StageStepper } from '@/components/ui/StageStepper';
import { MoneyText } from '@/components/ui/MoneyText';
import { TermTag } from '@/components/ui/TermTag';
import { ApprovalBadge } from '@/components/ui/ApprovalBadge';
import { AiPanel } from '@/components/ai/AiPanel';
import { OwnerTrace } from '@/components/ui/OwnerTrace';
import { TableSkeleton } from '@/components/ui/states';
import { useTerm } from '@/hooks/useTerms';
import { useUI } from '@/store/ui';
import { TERMS_BIZ } from '@/mock/terms';
import { userName } from '@/mock/org';
import { formatDate } from '@/lib/format';

const TABS = [
  { key: 'overview', label: '概览' },
  { key: 'product', label: '产品' },
  { key: 'tracking', label: '跟进' },
  { key: 'ai', label: 'AI 助手' },
];

export function OpportunityDrawer({ id, onClose }: { id: number; onClose: () => void }) {
  const [tab, setTab] = useState('overview');
  const term = useTerm();
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const navigate = useNavigate();
  const { data: opp, isLoading } = useQuery({ queryKey: ['opp', id], queryFn: () => opportunitiesApi.get(id) });

  const stages = term.options(TERMS_BIZ.oppStage);

  const changeStage = async (status: number) => {
    await opportunitiesApi.updateStage(id, status);
    qc.invalidateQueries({ queryKey: ['opp', id] });
    qc.invalidateQueries({ queryKey: ['opportunities'] });
    toast(`阶段已更新为「${term.name(status)}」`, 'success');
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={opp?.name ?? '商机详情'}
      subtitle={opp?.code}
      footer={
        opp && (
          <div className="flex justify-between">
            <Button variant="danger" onClick={() => toast('已标记输单', 'info')}>
              <XCircle size={14} />输单 / 取消
            </Button>
            <Button variant="primary" onClick={() => { onClose(); navigate('/quotations/new'); toast('已继承商机产品，生成报价单', 'success'); }}>
              <FileText size={14} />生成报价单
            </Button>
          </div>
        )
      }
    >
      {isLoading || !opp ? (
        <TableSkeleton rows={5} cols={2} />
      ) : (
        <div className="p-5">
          {/* 阶段进度条 */}
          <div className="mb-5 rounded-lg border border-border p-4">
            <StageStepper stages={stages} current={opp.status} onChange={changeStage} />
          </div>

          <Tabs items={TABS} value={tab} onChange={setTab} className="mb-4" />

          {tab === 'overview' && (
            <div className="space-y-5">
            <Descriptions
              items={[
                { label: '客户', value: opp.customerName },
                { label: '预计成交金额', value: <MoneyText value={opp.estimatedAmount} strong /> },
                { label: '预计成交日期', value: formatDate(opp.expiryDate) },
                { label: '当前阶段', value: <TermTag id={opp.status} /> },
                { label: '停留时长', value: `${opp.allStayTime} 天` },
                { label: '阶段超时时间', value: formatDate(opp.statusExpiryDate) },
                { label: '跟进人', value: <UserCell name={userName(opp.leaderId)} /> },
                { label: '竞争对手', value: opp.competitor ?? '—' },
                { label: '主要商品', value: opp.mainProduct },
                { label: '审批状态', value: <ApprovalBadge approval={opp.approval} /> },
              ]}
            />
            <OwnerTrace entityId={opp.opportunityId} types="opportunity" />
            </div>
          )}
          {tab === 'product' && (
            <div className="rounded-lg border border-border p-4 text-sm text-text-weak">
              主推产品：{opp.mainProduct}（opportunity_product 行项目，可继承至报价单）
            </div>
          )}
          {tab === 'tracking' && (
            <p className="py-8 text-center text-sm text-text-faint">该商机暂无独立跟进记录，请在客户详情查看完整时间线</p>
          )}
          {tab === 'ai' && (
            <div className="-mx-5 -mb-5 h-[520px]">
              <AiPanel businessType={3} businessId={id} stageId={opp.status} />
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
