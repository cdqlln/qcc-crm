import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Radar } from 'lucide-react';
import { prospectingApi } from '@/api/crm';
import { useListQuery } from '@/hooks/useListQuery';
import { useUI } from '@/store/ui';
import { SearchInput } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusTag } from '@/components/ui/StatusTag';
import { Tabs } from '@/components/ui/Tabs';
import { Dialog } from '@/components/ui/Dialog';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { formatDateTime, fromNow } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { ProspectSignal } from '@/types';
import { DISPOSITION, SIGNAL_TYPE } from './shared';

// 引擎二：商机信号雷达（第七/八条）—— 四类信号 SLA 处置留痕
export function SignalsTab() {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const [createOpen, setCreateOpen] = useState(false);
  const [handling, setHandling] = useState<ProspectSignal | null>(null);
  const q = useListQuery<ProspectSignal>('prospect-signals', prospectingApi.signals, { defaultTab: 'pending' });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['prospect-signals'] });
    qc.invalidateQueries({ queryKey: ['prospect-stats'] });
  };

  const columns: Column<ProspectSignal>[] = [
    {
      key: 'type', header: '类型', minWidth: 90,
      render: (r) => <StatusTag kind={SIGNAL_TYPE[r.type].kind} label={SIGNAL_TYPE[r.type].label} />,
    },
    {
      key: 'title', header: '触发事件', minWidth: 200, truncate: 280,
      render: (r) => (
        <div>
          <span className="font-medium text-text">{r.title}</span>
          {r.detail && <div className="truncate text-xs text-text-faint">{r.detail}</div>}
        </div>
      ),
    },
    { key: 'companyName', header: '目标企业', minWidth: 150, truncate: 200 },
    { key: 'ownerName', header: '管辖承接人', minWidth: 90, render: (r) => r.ownerName || '—' },
    {
      key: 'dueAt', header: 'SLA', minWidth: 130,
      render: (r) => {
        if (r.status === 2) return <span className="text-xs text-text-faint">已处置 {formatDateTime(r.handledAt)}</span>;
        return (
          <div className="text-xs">
            <div className="text-text-faint">{SIGNAL_TYPE[r.type].sla}</div>
            <div className={cn(r.overdue ? 'font-medium text-danger' : 'text-text-weak')}>
              {r.overdue ? '已超期 ' : '截止 '}{fromNow(r.dueAt)}
            </div>
          </div>
        );
      },
    },
    {
      key: 'disposition', header: '处置结果', minWidth: 110,
      render: (r) =>
        r.disposition ? (
          <div>
            <StatusTag {...DISPOSITION[r.disposition]} dot={false} />
            {r.dispositionNote && <div className="mt-0.5 truncate text-xs text-text-faint" style={{ maxWidth: 160 }}>{r.dispositionNote}</div>}
          </div>
        ) : (
          <span className="text-text-faint">—</span>
        ),
    },
    {
      key: 'actions', header: '操作', minWidth: 90,
      render: (r) =>
        r.status === 1 ? (
          <Button size="sm" variant="primary" onClick={(e) => { e.stopPropagation(); setHandling(r); }}>处置</Button>
        ) : null,
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {Object.entries(SIGNAL_TYPE).map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-xs text-text-weak">
            <StatusTag kind={v.kind} label={v.label} dot={false} />
            <span>{v.sla}</span>
            <span className="text-text-faint">· {v.action}</span>
          </div>
        ))}
      </div>
      <DataTable
        columns={columns}
        data={q.data}
        rowKey={(r) => r.signalId}
        loading={q.isLoading}
        error={q.isError}
        onRetry={q.refetch}
        pagination={{ page: q.page, pageSize: 20, total: q.total, onChange: q.setPage }}
        topBar={
          <div className="flex items-center justify-between gap-3">
            <Tabs
              value={q.tab}
              onChange={q.setTab}
              items={[
                { key: 'pending', label: '待处置' },
                { key: 'handled', label: '已处置' },
                { key: 'all', label: '全部' },
              ]}
            />
            <div className="flex items-center gap-2">
              <SearchInput value={q.keyword} onChange={q.setKeyword} placeholder="搜索事件 / 企业" />
              <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> 录入信号</Button>
            </div>
          </div>
        }
      />
      {createOpen && (
        <SignalCreateDialog onClose={() => setCreateOpen(false)} onDone={() => { setCreateOpen(false); refresh(); toast('信号已推送管辖方', 'success'); }} />
      )}
      {handling && (
        <SignalHandleDialog signal={handling} onClose={() => setHandling(null)} onDone={() => { setHandling(null); refresh(); toast('处置已留痕', 'success'); }} />
      )}
    </div>
  );
}

// 录入信号（系统上线前由数据智能部半自动出具，第十六条）
function SignalCreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useUI((s) => s.toast);
  const [type, setType] = useState(1);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const submit = async () => {
    if (title.trim().length < 2 || companyName.trim().length < 2) return toast('请填写事件与目标企业', 'error');
    try {
      await prospectingApi.createSignal({ type, title: title.trim(), detail: detail || undefined, companyName: companyName.trim() });
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : '录入失败', 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={<span className="flex items-center gap-2"><Radar size={16} /> 录入商机信号</span>}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={() => void submit()}>推送</Button></>}
    >
      <div className="space-y-3">
        <Field label="信号类型" required hint={`${SIGNAL_TYPE[type].sla} · ${SIGNAL_TYPE[type].action}`}>
          <Select value={type} onChange={(e) => setType(Number(e.target.value))}>
            {Object.entries(SIGNAL_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="目标企业" required hint="自动按004号路由推送：名单承接人 → 客户管辖负责人 → 录入人">
          <TextInput value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="企业全称" />
        </Field>
        <Field label="触发事件" required>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="如：目标银行收到反洗钱罚单" />
        </Field>
        <Field label="事件详情">
          <TextArea rows={3} value={detail} onChange={(e) => setDetail(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  );
}

// 处置留痕（第八条：触达/转商机/误报/暂缓；误报按月回炉调参）
function SignalHandleDialog({ signal, onClose, onDone }: { signal: ProspectSignal; onClose: () => void; onDone: () => void }) {
  const toast = useUI((s) => s.toast);
  const [disposition, setDisposition] = useState(1);
  const [note, setNote] = useState('');
  const submit = async () => {
    try {
      await prospectingApi.handleSignal(signal.signalId, { disposition, note: note || undefined });
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : '处置失败', 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`处置信号 · ${signal.companyName}`}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={() => void submit()}>登记处置</Button></>}
    >
      <div className="space-y-3">
        <div className="rounded-md bg-bg px-3 py-2 text-sm">
          <StatusTag kind={SIGNAL_TYPE[signal.type].kind} label={SIGNAL_TYPE[signal.type].label} dot={false} />
          <span className="ml-2 text-text">{signal.title}</span>
        </div>
        <Field label="处置结论" required hint={disposition === 3 ? '误报信号由数据智能部按月分析调参（查准率目标≥60%）' : undefined}>
          <Select value={disposition} onChange={(e) => setDisposition(Number(e.target.value))}>
            {Object.entries(DISPOSITION).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>
        <Field label="处置说明">
          <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="触达结果 / 转商机报备 / 误报原因…" />
        </Field>
      </div>
    </Dialog>
  );
}
