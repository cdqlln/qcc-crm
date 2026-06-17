import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { approvalsApi } from '@/api/crm';
import { useListQuery } from '@/hooks/useListQuery';
import { useUI } from '@/store/ui';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button, UserCell } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Tabs } from '@/components/ui/Tabs';
import { StatusTag } from '@/components/ui/StatusTag';
import { Drawer } from '@/components/ui/Drawer';
import { Timeline } from '@/components/ui/Timeline';
import { Descriptions } from '@/components/ui/Descriptions';
import { TextArea } from '@/components/ui/form';
import { TableSkeleton } from '@/components/ui/states';
import { userName } from '@/mock/org';
import { formatDateTime } from '@/lib/format';
import type { ApprovalTask } from '@/types';

const BIZ: Record<number, string> = { 1: '报价', 2: '合同', 3: '合同变更', 4: '回款单', 5: '发票', 6: '预授信', 7: '商机', 8: '客户移交' };
const STATUS: Record<number, { label: string; kind: 'warning' | 'danger' | 'success' }> = {
  2: { label: '进行中', kind: 'warning' },
  3: { label: '已驳回', kind: 'danger' },
  11: { label: '已通过', kind: 'success' },
};

export function ApprovalsPage() {
  const [tab, setTab] = useState('mine');
  const q = useListQuery<ApprovalTask>(
    'approvals',
    (p) => (tab === 'mine' ? approvalsApi.mine(p) : tab === 'acted' ? approvalsApi.acted(p) : approvalsApi.initiated(p)),
    { defaultTab: tab },
  );
  const [openId, setOpenId] = useState<number | null>(null);
  const qc = useQueryClient();

  const switchTab = (t: string) => {
    setTab(t);
    q.setTab(t);
  };

    const columns: Column<ApprovalTask>[] = [
    { key: 'businessType', header: '类型', minWidth: 80, render: (r) => <StatusTag kind="info" label={BIZ[r.businessType] ?? '单据'} dot={false} /> },
    { key: 'businessName', header: '单据', minWidth: 160, truncate: 220, render: (r) => <span className="font-medium text-text">{r.businessName}</span> },
    { key: 'applicantName', header: '发起人', minWidth: 100, render: (r) => <UserCell name={r.applicantName ?? userName(r.applicantId)} /> },
    ...(tab === 'acted'
      ? [
          { key: 'myAction', header: '我的处理', minWidth: 90, render: (r: ApprovalTask) => <StatusTag kind={r.myAction === 11 ? 'success' : 'danger'} label={r.myAction === 11 ? '已通过' : '已驳回'} /> },
          { key: 'myActedAt', header: '处理时间', minWidth: 140, numeric: true, render: (r: ApprovalTask) => formatDateTime(r.myActedAt) },
        ]
      : [{ key: 'nodeName', header: '当前节点', minWidth: 110, render: (r: ApprovalTask) => (r.status === 2 ? r.nodeName : '—') }]),
    { key: 'status', header: '单据状态', minWidth: 90, render: (r) => <StatusTag {...STATUS[r.status]} /> },
    { key: 'createDate', header: '发起时间', numeric: true, minWidth: 140, render: (r) => formatDateTime(r.createDate) },
  ];

  return (
    <div>
      <PageHeader title="审批" description="报价/合同/发票等单据审批流转" />
      <div className="mb-3">
        <Tabs items={[{ key: 'mine', label: '待我审批' }, { key: 'acted', label: '已审' }, { key: 'initiated', label: '我发起的' }]} value={tab} onChange={switchTab} className="border-0" />
      </div>
      <DataTable
        columns={columns}
        data={q.data}
        rowKey={(r) => r.taskId}
        loading={q.isLoading}
        error={q.isError}
        onRetry={q.refetch}
        onRowClick={(r) => setOpenId(r.taskId)}
        pagination={{ page: q.page, pageSize: q.pageSize, total: q.total, onChange: q.setPage }}
      />
      {openId != null && (
        <ApprovalDrawer
          id={openId}
          canAct={tab === 'mine'}
          onClose={() => setOpenId(null)}
          onActed={() => {
            qc.invalidateQueries({ queryKey: ['approvals'] });
            qc.invalidateQueries({ queryKey: ['task-counts'] });
          }}
        />
      )}
    </div>
  );
}

function ApprovalDrawer({ id, canAct, onClose, onActed }: { id: number; canAct: boolean; onClose: () => void; onActed: () => void }) {
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const [comment, setComment] = useState('');
  const { data: t, isLoading } = useQuery({ queryKey: ['approval', id], queryFn: () => approvalsApi.get(id) });

  const act = async (approve: boolean) => {
    try {
      await (approve ? approvalsApi.approve(id, comment) : approvalsApi.reject(id, comment));
      toast(approve ? '已通过' : '已驳回', 'success');
      qc.invalidateQueries({ queryKey: ['approval', id] });
      onActed();
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : '操作失败', 'error');
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={t?.businessName ?? '审批详情'}
      subtitle={t && `${BIZ[t.businessType] ?? ''} · 发起人 ${t.applicantName ?? userName(t.applicantId)}`}
      footer={
        canAct && t?.status === 2 ? (
          <div className="flex justify-end gap-2">
            <Button variant="danger" onClick={() => act(false)}><X size={14} />驳回</Button>
            <Button variant="primary" onClick={() => act(true)}><Check size={14} />通过</Button>
          </div>
        ) : undefined
      }
    >
      {isLoading || !t ? (
        <TableSkeleton rows={4} cols={2} />
      ) : (
        <div className="space-y-5 p-5">
          <Descriptions
            items={[
              { label: '单据类型', value: BIZ[t.businessType] ?? '—' },
              { label: '状态', value: <StatusTag {...STATUS[t.status]} /> },
              { label: '发起人', value: userName(t.applicantId) },
              { label: '发起时间', value: formatDateTime(t.createDate) },
            ]}
          />
          <div>
            <div className="mb-2 text-sm font-medium text-text">审批节点</div>
            <Timeline
              items={(t.nodes ?? []).map((n) => ({
                id: n.nodeIndex,
                kind: n.action === 11 ? 'success' : n.action === 3 ? 'danger' : n.nodeIndex === t.currentNode && t.status === 2 ? 'warning' : 'neutral',
                title: `${n.name}`,
                meta: n.approverIds.map((a) => userName(a)).join('、'),
                body:
                  n.action === 0
                    ? n.nodeIndex === t.currentNode && t.status === 2
                      ? '审批中…'
                      : '待审批'
                    : `${n.action === 11 ? '已通过' : '已驳回'}${n.actedBy ? ' · ' + userName(n.actedBy) : ''}${n.comment ? '：' + n.comment : ''}`,
              }))}
            />
          </div>
          {canAct && t.status === 2 && (
            <TextArea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="审批意见（可选）" />
          )}
        </div>
      )}
    </Drawer>
  );
}
