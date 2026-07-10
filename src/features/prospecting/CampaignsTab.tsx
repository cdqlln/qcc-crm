import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { prospectingApi } from '@/api/crm';
import { useListQuery } from '@/hooks/useListQuery';
import { useUI } from '@/store/ui';
import { SearchInput } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusTag } from '@/components/ui/StatusTag';
import { Dialog } from '@/components/ui/Dialog';
import { Drawer } from '@/components/ui/Drawer';
import { Descriptions } from '@/components/ui/Descriptions';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { formatDate } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { ProspectCampaign } from '@/types';
import { CAMPAIGN_STATUS, LINES, currentQuarter } from './shared';

// 季度开拓战役（第十五条）：单场景卡集中作战 + 四件套 + 复盘强制回写
const KIT: { key: 'kitList' | 'kitScript' | 'kitContent' | 'kitSignal'; label: string }[] = [
  { key: 'kitList', label: '作战名单切片' },
  { key: 'kitScript', label: '话术与异议应答包' },
  { key: 'kitContent', label: '内容物料' },
  { key: 'kitSignal', label: '信号监测规则' },
];

export function CampaignsTab() {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<ProspectCampaign | null>(null);
  const q = useListQuery<ProspectCampaign>('prospect-campaigns', prospectingApi.campaigns);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['prospect-campaigns'] });
    qc.invalidateQueries({ queryKey: ['prospect-stats'] });
  };

  const columns: Column<ProspectCampaign>[] = [
    { key: 'name', header: '战役', minWidth: 190, truncate: 240, render: (r) => <span className="font-medium text-text">{r.name}</span> },
    { key: 'quarter', header: '季度 / 线', minWidth: 100, render: (r) => `${r.quarter} · ${r.line}` },
    { key: 'scenarioCard', header: '场景卡', minWidth: 110, render: (r) => r.scenarioCard || '—' },
    {
      key: 'kit', header: '四件套', minWidth: 130,
      render: (r) => (
        <div className="flex gap-1">
          {KIT.map((k) => (
            <span
              key={k.key}
              title={k.label}
              className={cn('inline-block h-2.5 w-2.5 rounded-full', r[k.key] ? 'bg-success' : 'bg-border')}
            />
          ))}
          <span className="ml-1 text-xs text-text-faint">{KIT.filter((k) => r[k.key]).length}/4</span>
        </div>
      ),
    },
    { key: 'goal', header: '目标', minWidth: 140, truncate: 200, render: (r) => r.goal || '—' },
    { key: 'ownerName', header: '负责人', minWidth: 70, render: (r) => r.ownerName || '—' },
    { key: 'status', header: '状态', minWidth: 80, render: (r) => <StatusTag {...CAMPAIGN_STATUS[r.status]} /> },
    { key: 'startedAt', header: '起止', minWidth: 120, render: (r) => `${formatDate(r.startedAt) || '—'} ~ ${formatDate(r.endedAt) || ''}` },
  ];

  return (
    <div>
      <DataTable
        columns={columns}
        data={q.data}
        rowKey={(r) => r.campaignId}
        loading={q.isLoading}
        error={q.isError}
        onRetry={q.refetch}
        onRowClick={setDetail}
        pagination={{ page: q.page, pageSize: 20, total: q.total, onChange: q.setPage }}
        topBar={
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-weak">每线每季度立项 1–2 个战役，以单张场景卡为单位集中作战</span>
            <div className="flex items-center gap-2">
              <SearchInput value={q.keyword} onChange={q.setKeyword} placeholder="搜索战役 / 场景卡" />
              <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> 战役立项</Button>
            </div>
          </div>
        }
      />
      {createOpen && (
        <CampaignCreateDialog onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); refresh(); toast('战役已立项', 'success'); }} />
      )}
      {detail && (
        <CampaignDrawer
          campaign={detail}
          onClose={() => setDetail(null)}
          onChanged={(c) => { setDetail(c); refresh(); }}
        />
      )}
    </div>
  );
}

function CampaignCreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useUI((s) => s.toast);
  const [name, setName] = useState('');
  const [quarter, setQuarter] = useState(currentQuarter());
  const [line, setLine] = useState(LINES[0]);
  const [scenarioCard, setScenarioCard] = useState('');
  const [goal, setGoal] = useState('');
  const submit = async () => {
    if (name.trim().length < 2) return toast('请填写战役名称', 'error');
    await prospectingApi.createCampaign({ name: name.trim(), quarter, line, scenarioCard: scenarioCard || undefined, goal: goal || undefined });
    onDone();
  };
  return (
    <Dialog open onClose={onClose} title="战役立项" footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={() => void submit()}>立项</Button></>}>
      <div className="space-y-3">
        <Field label="战役名称" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={`如：B线反洗钱合规战役（${currentQuarter()}）`} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="季度" required><TextInput value={quarter} onChange={(e) => setQuarter(e.target.value)} /></Field>
          <Field label="行业线 / 区域" required>
            <Select value={line} onChange={(e) => setLine(e.target.value)}>
              {LINES.map((l) => <option key={l}>{l}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="场景卡" hint="以单张场景卡为单位集中作战">
          <TextInput value={scenarioCard} onChange={(e) => setScenarioCard(e.target.value)} placeholder="如：银行反洗钱合规" />
        </Field>
        <Field label="战役目标">
          <TextInput value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="如：名单触达≥90%，转商机≥8个" />
        </Field>
      </div>
    </Dialog>
  );
}

function CampaignDrawer({ campaign, onClose, onChanged }: { campaign: ProspectCampaign; onClose: () => void; onChanged: (c: ProspectCampaign) => void }) {
  const toast = useUI((s) => s.toast);
  const [review, setReview] = useState(campaign.reviewNote);

  const update = async (input: Parameters<typeof prospectingApi.updateCampaign>[1], msg: string) => {
    try {
      const c = await prospectingApi.updateCampaign(campaign.campaignId, input);
      toast(msg, 'success');
      onChanged(c);
    } catch (e) {
      toast(e instanceof Error ? e.message : '操作失败', 'error');
    }
  };

  return (
    <Drawer open onClose={onClose} title={campaign.name} subtitle={<StatusTag {...CAMPAIGN_STATUS[campaign.status]} dot={false} />} width="w-[560px]">
      <div className="space-y-5 p-5">
        <Descriptions
          items={[
            { label: '季度', value: campaign.quarter },
            { label: '行业线', value: campaign.line },
            { label: '场景卡', value: campaign.scenarioCard || '—' },
            { label: '负责人', value: campaign.ownerName || '—' },
            { label: '目标', value: campaign.goal || '—' },
            { label: '起止', value: `${formatDate(campaign.startedAt) || '—'} ~ ${formatDate(campaign.endedAt) || '—'}` },
          ]}
        />

        <div>
          <div className="mb-2 text-sm font-medium text-text">战役四件套（标配）</div>
          <div className="grid grid-cols-2 gap-2">
            {KIT.map((k) => (
              <label key={k.key} className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={campaign[k.key]}
                  disabled={campaign.status === 4}
                  onChange={(e) => void update({ [k.key]: e.target.checked }, '四件套已更新')}
                />
                {k.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-2 text-sm font-medium text-text">复盘回写（强制）</div>
          <TextArea
            rows={4}
            value={review}
            disabled={campaign.status === 4}
            onChange={(e) => setReview(e.target.value)}
            placeholder="名单命中率→修正ICP；话术有效性→修订场景卡；信号查准率→反馈雷达调参"
          />
        </div>

        <div className="flex justify-end gap-2">
          {campaign.status === 1 && <Button variant="primary" onClick={() => void update({ status: 2 }, '战役已启动')}>启动战役</Button>}
          {campaign.status === 2 && <Button variant="primary" onClick={() => void update({ status: 3, reviewNote: review || undefined }, '进入复盘')}>进入复盘</Button>}
          {campaign.status !== 4 && (
            <>
              {review !== campaign.reviewNote && <Button onClick={() => void update({ reviewNote: review }, '复盘已保存')}>保存复盘</Button>}
              {campaign.status === 3 && <Button variant="danger" onClick={() => void update({ status: 4, reviewNote: review || undefined }, '战役已结束，复盘沉淀完成')}>结束战役</Button>}
            </>
          )}
        </div>
      </div>
    </Drawer>
  );
}
