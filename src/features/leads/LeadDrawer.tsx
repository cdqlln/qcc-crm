import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Briefcase, ExternalLink, Phone, Unlink } from 'lucide-react';
import { Paperclip } from 'lucide-react';
import { customersApi, leadsApi, uploadApi } from '@/api/crm';
import { Drawer } from '@/components/ui/Drawer';
import { Tabs } from '@/components/ui/Tabs';
import { Button, UserCell } from '@/components/ui/primitives';
import { Descriptions } from '@/components/ui/Descriptions';
import { Attachments, AttachmentDrafts } from '@/components/ui/Attachments';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { TermTag, TermTags } from '@/components/ui/TermTag';
import { Timeline } from '@/components/ui/Timeline';
import { AiPanel } from '@/components/ai/AiPanel';
import { FollowUpForm } from '@/components/ui/FollowUpForm';
import { OwnerTrace } from '@/components/ui/OwnerTrace';
import { TableSkeleton } from '@/components/ui/states';
import { useUI } from '@/store/ui';
import { TERMS_BIZ } from '@/mock/terms';
import { userName } from '@/mock/org';
import { formatDate, fromNow } from '@/lib/format';
import { useTerm } from '@/hooks/useTerms';
import type { Customer } from '@/types';

const TABS = [
  { key: 'overview', label: '概览' },
  { key: 'contacts', label: '联系人' },
  { key: 'tracking', label: '跟进' },
  { key: 'ai', label: 'AI 助手' },
];

export function LeadDrawer({
  id,
  onClose,
  onConvert,
}: {
  id: number;
  onClose: () => void;
  onConvert: (rows: Customer[]) => void;
}) {
  const [tab, setTab] = useState('overview');
  const term = useTerm();
  const toast = useUI((s) => s.toast);
  const navigate = useNavigate();
  const { data: lead, isLoading } = useQuery({ queryKey: ['lead', id], queryFn: () => leadsApi.get(id) });

  const qc = useQueryClient();
  const toOpportunity = async () => {
    try {
      const r = await leadsApi.toOpportunity(id);
      toast('已转为商机', 'success');
      onClose();
      navigate(`/opportunities/${r.opportunityId}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : '转商机失败', 'error');
    }
  };
  // 解除转化关联（客户名下无业务单据时）→ 记录退回线索，可重新转化
  const unlink = async () => {
    try {
      await leadsApi.unlink(id);
      qc.invalidateQueries({ queryKey: ['lead', id] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast('已解除转化关联，记录退回线索，可重新转化', 'success');
    } catch (e) {
      toast(e instanceof Error ? e.message : '解除失败', 'error');
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={lead?.name ?? '线索详情'}
      subtitle={lead && <TermTag id={lead.currentTrackingStatus} />}
      footer={
        lead && (
          lead.convertedAt ? (
            // 已转化：便捷跳转所转客户查看/维护；再转需先解除关联
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-text-faint">已于 {formatDate(lead.convertedAt)} 转化为客户；如需重新转化请先解除关联</span>
              <div className="flex gap-2">
                <Button onClick={unlink}><Unlink size={14} />解除关联</Button>
                <Button variant="primary" onClick={() => { onClose(); navigate(`/customers/${lead.customerId}`); }}>
                  <ExternalLink size={14} />查看客户
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end gap-2">
              <Button onClick={toOpportunity}><Briefcase size={14} />转商机</Button>
              <Button variant="primary" onClick={() => onConvert([lead])}>
                <ArrowRightLeft size={14} />转为客户（保留跟进）
              </Button>
            </div>
          )
        )
      }
    >
      <div className="px-5">
        <Tabs items={TABS} value={tab} onChange={setTab} className="sticky top-0 z-10 -mx-5 bg-surface px-5" />
      </div>
      {isLoading || !lead ? (
        <TableSkeleton rows={5} cols={2} />
      ) : (
        <div className="h-full p-5 pt-4">
          {tab === 'overview' && <OverviewTab lead={lead} />}
          {tab === 'contacts' && <ContactsTab customerId={id} />}
          {tab === 'tracking' && <TrackingTab customerId={id} />}
          {tab === 'ai' && (
            <div className="-m-5 h-[calc(100%+0px)]">
              <AiPanel businessType={0} businessId={id} />
            </div>
          )}
        </div>
      )}
    </Drawer>
  );

  function OverviewTab({ lead }: { lead: Customer }) {
    return (
      <div className="space-y-5">
      <Descriptions
        items={[
          { label: '线索名称', value: lead.name },
          { label: '工商主体', value: lead.refCompanyId
            ? <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">已关联工商主体</span>
            : <span className="rounded-full bg-bg px-2 py-0.5 text-xs text-text-faint">未关联</span> },
          { label: '线索来源', value: <TermTag id={lead.source} dot={false} /> },
          { label: '线索分组', value: <TermTag id={lead.poolGroup} dot={false} /> },
          { label: '行业', value: lead.industry },
          { label: '所在地区', value: `${lead.province ?? ''}${lead.city ?? ''}${lead.district ?? ''}` },
          { label: '联系人', value: <span className="inline-flex items-center gap-1.5">{lead.phoneName}<Phone size={12} className="text-primary" /></span> },
          { label: '电话', value: lead.phone },
          { label: '负责人', value: <UserCell name={userName(lead.leaderId)} /> },
          { label: '标签', value: <TermTags ids={lead.labels} /> },
          { label: '领取时间', value: lead.claimAt ? formatDate(lead.claimAt) : '—' },
          { label: '分配时间', value: lead.assignAt ? formatDate(lead.assignAt) : '—' },
          { label: 'UTM 来源', value: [lead.utmSource, lead.utmMedium, lead.utmCampaign].filter(Boolean).join(' / ') || '—' },
          { label: '创建时间', value: formatDate(lead.createDate) },
        ]}
      />
      <OwnerTrace entityId={lead.customerId} types="lead,customer" />
      </div>
    );
  }
}

function ContactsTab({ customerId }: { customerId: number }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['contacts', customerId],
    queryFn: () => customersApi.contacts(customerId),
  });
  if (isLoading) return <TableSkeleton rows={3} cols={2} />;
  return (
    <div className="space-y-3">
      {data.map((c) => (
        <div key={c.contactId} className="rounded-lg border border-border p-3">
          <div className="flex items-center gap-2">
            <span className="font-medium text-text">{c.name}</span>
            {c.type === 1 && <span className="rounded bg-primary-weak px-1.5 py-0.5 text-xs text-primary">主联系人</span>}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-y-1.5 text-sm text-text-weak">
            <span>职位：{c.position}</span>
            <span>部门：{c.department}</span>
            <span>电话：{c.phone}</span>
            <span>微信：{c.wechat}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function TrackingTab({ customerId }: { customerId: number }) {
  const term = useTerm();
  const qc = useQueryClient();
  const { data = [], isLoading } = useQuery({
    queryKey: ['trackings', customerId],
    queryFn: () => customersApi.trackings(customerId),
  });
  const onDone = () => {
    qc.invalidateQueries({ queryKey: ['trackings', customerId] });
    qc.invalidateQueries({ queryKey: ['lead', customerId] });
    qc.invalidateQueries({ queryKey: ['task-counts'] });
  };
  if (isLoading) return <TableSkeleton rows={4} cols={1} />;
  return (
    <>
      <FollowUpForm customerId={customerId} businessType={0} onDone={onDone} />
      {data.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-faint">暂无跟进记录</p>
      ) : (
    <Timeline
      items={data.map((t) => ({
        id: t.trackingId,
        kind: t.priorityLevel === 2 ? 'neutral' : 'info',
        title: term.name(t.trackingType),
        meta: `${userName(t.createBy)} · ${formatDate(t.createDate, 'MM-DD HH:mm')}`,
        body: (
          <div>
            <p>{t.comment}</p>
            <Attachments items={t.attachments} />
            {t.nextTrackingDate && (
              <p className="mt-1 text-xs text-warning">下次跟进：{formatDate(t.nextTrackingDate)}</p>
            )}
          </div>
        ),
      }))}
    />
      )}
    </>
  );
}
