import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRightLeft, Briefcase, Phone } from 'lucide-react';
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

  const toOpportunity = async () => {
    const r = await leadsApi.toOpportunity(id);
    toast('已转为商机', 'success');
    onClose();
    navigate(`/opportunities/${r.opportunityId}`);
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={lead?.name ?? '线索详情'}
      subtitle={lead && <TermTag id={lead.currentTrackingStatus} />}
      footer={
        lead && (
          <div className="flex justify-end gap-2">
            <Button onClick={toOpportunity}><Briefcase size={14} />转商机</Button>
            <Button variant="primary" onClick={() => onConvert([lead])}>
              <ArrowRightLeft size={14} />转为客户（保留跟进）
            </Button>
          </div>
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
      <Descriptions
        items={[
          { label: '线索名称', value: lead.name },
          { label: '企查查ID', value: lead.refCompanyId },
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
    );
  }
}

// 写跟进（联动下次跟进 + 自动写待办）#5
function FollowUpForm({ customerId, onDone }: { customerId: number; onDone: () => void }) {
  const term = useTerm();
  const toast = useUI((s) => s.toast);
  const [comment, setComment] = useState('');
  const [type, setType] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [files, setFiles] = useState<import('@/types').Attachment[]>([]);
  const [uploading, setUploading] = useState(false);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!picked.length) return;
    setUploading(true);
    try {
      const up = await uploadApi.upload(picked);
      setFiles((f) => [...f, ...up]);
    } catch (err) {
      toast(err instanceof Error ? err.message : '上传失败', 'error');
    } finally {
      setUploading(false);
    }
  };

  const submit = async () => {
    if (!comment.trim()) return toast('请填写跟进内容', 'error');
    setBusy(true);
    try {
      await customersApi.createTracking(customerId, {
        comment: comment.trim(),
        trackingType: type ? Number(type) : undefined,
        nextTrackingDate: next || undefined,
        attachments: files,
      });
      toast(next ? '跟进已记录，已生成下次跟进待办' : '跟进已记录', 'success');
      setComment(''); setType(''); setNext(''); setFiles([]);
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : '提交失败', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mb-4 space-y-3 rounded-lg border border-border p-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="跟进方式">
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">选择方式</option>
            {term.options(TERMS_BIZ.followType).map((t) => <option key={t.termId} value={t.termId}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="下次跟进时间"><TextInput type="date" value={next} onChange={(e) => setNext(e.target.value)} /></Field>
      </div>
      <Field label="跟进内容"><TextArea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="记录沟通要点…" /></Field>
      <AttachmentDrafts items={files} onRemove={(i) => setFiles((f) => f.filter((_, x) => x !== i))} />
      <div className="flex items-center justify-between">
        <label className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-text-weak hover:text-primary">
          <Paperclip size={14} />{uploading ? '上传中…' : '附件/图片'}
          <input type="file" multiple className="hidden" onChange={onPick} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt" />
        </label>
        <Button variant="primary" onClick={submit} disabled={busy || uploading}>保存跟进</Button>
      </div>
    </div>
  );
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
      <FollowUpForm customerId={customerId} onDone={onDone} />
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
