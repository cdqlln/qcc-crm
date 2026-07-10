import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { prospectingApi } from '@/api/crm';
import { useUI } from '@/store/ui';
import { Button } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { Dialog } from '@/components/ui/Dialog';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import type { ProspectIcp } from '@/types';
import { LINES, currentQuarter, pct } from './shared';

// ICP 理想客户画像（第四条）+ TAM 盘点与渗透率（第五条）
export function IcpTab() {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const [editing, setEditing] = useState<ProspectIcp | 'new' | null>(null);
  const q = useQuery({ queryKey: ['prospect-icps'], queryFn: prospectingApi.icps });

  const columns: Column<ProspectIcp>[] = [
    { key: 'name', header: '场景卡 / ICP', minWidth: 150, render: (r) => <span className="font-medium text-text">{r.name}</span> },
    { key: 'line', header: '行业线', minWidth: 60 },
    { key: 'industryScope', header: '行业范围', minWidth: 120, truncate: 160 },
    { key: 'sizeRange', header: '规模区间', minWidth: 130, truncate: 180 },
    { key: 'qualifications', header: '必要资质', minWidth: 120, truncate: 160, render: (r) => r.qualifications || '—' },
    { key: 'exclusions', header: '排除条件', minWidth: 120, truncate: 160, render: (r) => r.exclusions || '—' },
    { key: 'version', header: '版本', minWidth: 80, render: (r) => `${r.version} · ${r.quarter}` },
    { key: 'tamCount', header: 'TAM', numeric: true, minWidth: 70, render: (r) => <span className="tabular-nums">{r.tamCount}</span> },
    {
      key: 'penetration', header: '渗透率（存量/TAM）', minWidth: 160,
      render: (r) => {
        const p = r.tamCount ? (r.stockCount ?? 0) / r.tamCount : 0;
        return (
          <div className="flex items-center gap-2">
            <div className="w-24"><ProgressBar value={p * 100} height={6} /></div>
            <span className="text-xs tabular-nums text-text-faint">{r.stockCount ?? 0}/{r.tamCount || '—'}</span>
          </div>
        );
      },
    },
    {
      key: 'actions', header: '操作', minWidth: 70,
      render: (r) => <Button size="sm" onClick={(e) => { e.stopPropagation(); setEditing(r); }}>编辑</Button>,
    },
  ];

  return (
    <div>
      <DataTable
        columns={columns}
        data={q.data ?? []}
        rowKey={(r) => r.icpId}
        loading={q.isLoading}
        error={q.isError}
        onRetry={q.refetch}
        topBar={
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-text-weak">每张场景卡定义一个 ICP，随场景卡季度更新；TAM 盘点输出市场容量与渗透率</span>
            <Button size="sm" variant="primary" onClick={() => setEditing('new')}><Plus size={14} /> 新建 ICP</Button>
          </div>
        }
      />
      {editing && (
        <IcpDialog
          icp={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            toast('ICP 已保存', 'success');
            void qc.invalidateQueries({ queryKey: ['prospect-icps'] });
            void qc.invalidateQueries({ queryKey: ['prospect-stats'] });
          }}
        />
      )}
    </div>
  );
}

function IcpDialog({ icp, onClose, onDone }: { icp: ProspectIcp | null; onClose: () => void; onDone: () => void }) {
  const toast = useUI((s) => s.toast);
  const [form, setForm] = useState({
    name: icp?.name ?? '',
    line: icp?.line ?? LINES[0],
    industryScope: icp?.industryScope ?? '',
    sizeRange: icp?.sizeRange ?? '',
    qualifications: icp?.qualifications ?? '',
    exclusions: icp?.exclusions ?? '',
    version: icp?.version ?? 'V1.0',
    quarter: icp?.quarter ?? currentQuarter(),
    tamCount: icp?.tamCount ?? 0,
  });
  const set = (k: keyof typeof form, v: string | number) => setForm((f) => ({ ...f, [k]: v }));
  const submit = async () => {
    if (form.name.trim().length < 2) return toast('请填写 ICP 名称', 'error');
    try {
      if (icp) await prospectingApi.updateIcp(icp.icpId, form);
      else await prospectingApi.createIcp(form);
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : '保存失败', 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={icp ? `编辑 ICP · ${icp.name}` : '新建 ICP'}
      width="w-[640px]"
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={() => void submit()}>保存</Button></>}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="场景卡 / ICP 名称" required>
            <TextInput value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="如：银行反洗钱合规" />
          </Field>
          <Field label="行业线" required>
            <Select value={form.line} onChange={(e) => set('line', e.target.value)}>
              {LINES.map((l) => <option key={l}>{l}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="行业范围" hint="企业库行业标签，逗号分隔（用于存量匹配与渗透率计算）">
          <TextInput value={form.industryScope} onChange={(e) => set('industryScope', e.target.value)} placeholder="银行,金融" />
        </Field>
        <Field label="规模区间">
          <TextInput value={form.sizeRange} onChange={(e) => set('sizeRange', e.target.value)} placeholder="参保/资本/等级，如：城商行及以上" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="必要资质特征">
            <TextArea rows={2} value={form.qualifications} onChange={(e) => set('qualifications', e.target.value)} />
          </Field>
          <Field label="排除条件">
            <TextArea rows={2} value={form.exclusions} onChange={(e) => set('exclusions', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="版本"><TextInput value={form.version} onChange={(e) => set('version', e.target.value)} /></Field>
          <Field label="季度"><TextInput value={form.quarter} onChange={(e) => set('quarter', e.target.value)} /></Field>
          <Field label="TAM 市场容量">
            <TextInput type="number" value={form.tamCount} onChange={(e) => set('tamCount', Number(e.target.value) || 0)} />
          </Field>
        </div>
      </div>
    </Dialog>
  );
}
