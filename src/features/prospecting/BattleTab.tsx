import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Plus, Snowflake, Target as TargetIcon } from 'lucide-react';
import { prospectingApi } from '@/api/crm';
import { useListQuery } from '@/hooks/useListQuery';
import { useUI } from '@/store/ui';
import { SearchInput } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/primitives';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { StatusTag } from '@/components/ui/StatusTag';
import { Tabs } from '@/components/ui/Tabs';
import { Dialog } from '@/components/ui/Dialog';
import { Drawer } from '@/components/ui/Drawer';
import { Descriptions } from '@/components/ui/Descriptions';
import { Field, Select, TextArea, TextInput } from '@/components/ui/form';
import { formatDate, formatDateTime, daysUntil } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { ProspectList, ProspectTarget } from '@/types';
import { LINES, LIST_STATUS, TARGET_STATUS, currentQuarter } from './shared';

export function BattleTab() {
  const qc = useQueryClient();
  const toast = useUI((s) => s.toast);
  const [listId, setListId] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [addOpen, setAddOpen] = useState<ProspectList | null>(null);
  const [convert, setConvert] = useState<ProspectTarget | null>(null);
  const [detail, setDetail] = useState<ProspectTarget | null>(null);

  const listsQ = useQuery({ queryKey: ['prospect-lists'], queryFn: () => prospectingApi.lists({ page: 1, pageSize: 50 }) });
  const q = useListQuery<ProspectTarget>('prospect-targets', (p) =>
    prospectingApi.targets({ ...p, filters: { ...p.filters, listId: listId ?? undefined } }),
  );

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['prospect-targets'] });
    qc.invalidateQueries({ queryKey: ['prospect-lists'] });
    qc.invalidateQueries({ queryKey: ['prospect-stats'] });
  };

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      toast(msg, 'success');
      refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : '操作失败', 'error');
    }
  };

  const columns: Column<ProspectTarget>[] = [
    { key: 'rankNo', header: '#', minWidth: 40, render: (r) => <span className="text-text-faint">{r.rankNo ?? '—'}</span> },
    { key: 'companyName', header: '目标企业', minWidth: 180, truncate: 220, render: (r) => <span className="font-medium text-text">{r.companyName}</span> },
    { key: 'listTitle', header: '名单', minWidth: 130, truncate: 160, render: (r) => <span className="text-text-weak">{r.listTitle}</span> },
    { key: 'industry', header: '行业 / 地区', minWidth: 110, render: (r) => `${r.industry || '—'} · ${r.region || '—'}` },
    {
      key: 'totalScore', header: 'Q+T 分', numeric: true, minWidth: 90, sortable: true,
      render: (r) => (
        <span className="tabular-nums">
          <span className="text-primary font-medium">{r.totalScore}</span>
          <span className="ml-1 text-xs text-text-faint">({r.qScore}+{r.tScore})</span>
        </span>
      ),
    },
    { key: 'signalNote', header: '触发信号', minWidth: 120, truncate: 180, render: (r) => r.signalNote || '—' },
    { key: 'status', header: '状态', minWidth: 84, render: (r) => <StatusTag {...TARGET_STATUS[r.status]} /> },
    { key: 'ownerName', header: '承接人', minWidth: 70, render: (r) => r.ownerName || '—' },
    {
      key: 'touch', header: '触达', minWidth: 130,
      render: (r) => {
        if (r.status === 4) return <span className="text-xs text-text-faint">冷冻至 {formatDate(r.frozenUntil)}</span>;
        if (r.status !== 2) return <span className="tabular-nums text-text-weak">{r.effectiveTouchCount}/{r.touchCount} 次</span>;
        const firstDue = r.touchCount === 0 ? daysUntil(r.firstTouchDeadline) : null;
        const allDue = daysUntil(r.touchDeadline);
        return (
          <div className="text-xs">
            <span className="tabular-nums text-text">{r.effectiveTouchCount} 次有效 / {r.touchCount} 次</span>
            {firstDue != null && (
              <div className={cn(firstDue <= 7 ? 'text-danger' : 'text-text-faint')}>首触剩 {firstDue} 天</div>
            )}
            {firstDue == null && r.effectiveTouchCount < 3 && (
              <div className={cn(allDue <= 14 ? 'text-warning' : 'text-text-faint')}>三触剩 {allDue} 天</div>
            )}
          </div>
        );
      },
    },
    {
      key: 'actions', header: '操作', minWidth: 190,
      render: (r) => (
        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
          {(r.status === 1 || r.status === 5) && (
            <Button size="sm" onClick={() => act(() => prospectingApi.claimTarget(r.targetId), '已承接：30天内完成首轮触达')}>承接</Button>
          )}
          {r.status === 2 && (
            <>
              <Button size="sm" onClick={() => setDetail(r)}>触达</Button>
              <Button size="sm" variant="primary" onClick={() => setConvert(r)}>转商机</Button>
              {r.effectiveTouchCount >= 3 && (
                <Button size="sm" onClick={() => act(() => prospectingApi.freezeTarget(r.targetId), '已冷冻6个月，信号雷达继续监控')}>
                  <Snowflake size={13} />
                </Button>
              )}
            </>
          )}
          {r.status === 4 && (
            <Button size="sm" onClick={() => act(() => prospectingApi.unfreezeTarget(r.targetId), '已解冻回池')}>解冻</Button>
          )}
          {r.status === 3 && r.customerId && (
            <a className="text-xs text-primary hover:underline" href={`/customers/${r.customerId}`} onClick={(e) => e.stopPropagation()}>查看客户 ›</a>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {/* 名单批次（第五条：季度首月发布 Top100/线） */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setListId(null)}
          className={cn('rounded-full border px-3 py-1 text-sm', listId == null ? 'border-primary bg-primary-weak text-primary' : 'border-border text-text-weak hover:text-text')}
        >
          全部名单
        </button>
        {(listsQ.data?.list ?? []).map((l) => (
          <button
            key={l.listId}
            onClick={() => setListId(listId === l.listId ? null : l.listId)}
            className={cn(
              'flex items-center gap-2 rounded-full border px-3 py-1 text-sm',
              listId === l.listId ? 'border-primary bg-primary-weak text-primary' : 'border-border text-text-weak hover:text-text',
            )}
          >
            <span>{l.title}</span>
            <StatusTag {...LIST_STATUS[l.status]} dot={false} />
            <span className="tabular-nums text-xs text-text-faint">{l.convertedCount ?? 0}/{l.targetCount ?? 0}</span>
            {l.status === 1 && (
              <span
                className="text-xs text-primary hover:underline"
                onClick={(e) => { e.stopPropagation(); void act(() => prospectingApi.publishList(l.listId), '名单已发布，按线承接'); }}
              >
                <Megaphone size={13} className="inline" /> 发布
              </span>
            )}
            <span
              className="text-xs text-primary hover:underline"
              onClick={(e) => { e.stopPropagation(); setAddOpen(l); }}
            >
              <Plus size={13} className="inline" />目标
            </span>
          </button>
        ))}
        <Button size="sm" onClick={() => setCreateOpen(true)}><Plus size={14} /> 新建名单</Button>
      </div>

      <DataTable
        columns={columns}
        data={q.data}
        rowKey={(r) => r.targetId}
        loading={q.isLoading}
        error={q.isError}
        onRetry={q.refetch}
        onRowClick={setDetail}
        sort={q.sort}
        onSortChange={q.setSort}
        pagination={{ page: q.page, pageSize: 20, total: q.total, onChange: q.setPage }}
        topBar={
          <div className="flex items-center justify-between gap-3">
            <Tabs
              value={q.tab}
              onChange={q.setTab}
              items={[
                { key: 'all', label: '全部' },
                { key: 'pending', label: '待承接' },
                { key: 'mine', label: '我的跟进' },
                { key: 'converted', label: '已转商机' },
                { key: 'frozen', label: '冷冻池' },
              ]}
            />
            <SearchInput value={q.keyword} onChange={q.setKeyword} placeholder="搜索企业 / 行业 / 地区" />
          </div>
        }
      />

      {createOpen && (
        <ListCreateDialog
          onClose={() => setCreateOpen(false)}
          onDone={() => { setCreateOpen(false); refresh(); toast('名单已创建（草稿）', 'success'); }}
        />
      )}
      {addOpen && (
        <TargetsAddDialog
          list={addOpen}
          onClose={() => setAddOpen(null)}
          onDone={(msg) => { setAddOpen(null); refresh(); toast(msg, 'success'); }}
        />
      )}
      {convert && (
        <ConvertDialog
          target={convert}
          onClose={() => setConvert(null)}
          onDone={() => { setConvert(null); refresh(); toast('已转商机并完成报备', 'success'); }}
        />
      )}
      {detail && <TargetDrawer target={detail} onClose={() => setDetail(null)} onChanged={refresh} />}
    </div>
  );
}

// ---------- 新建名单 ----------
function ListCreateDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useUI((s) => s.toast);
  const icpsQ = useQuery({ queryKey: ['prospect-icps'], queryFn: prospectingApi.icps });
  const [title, setTitle] = useState('');
  const [quarter, setQuarter] = useState(currentQuarter());
  const [line, setLine] = useState(LINES[0]);
  const [icpId, setIcpId] = useState<string>('');
  const submit = async () => {
    if (title.trim().length < 2) return toast('请填写名单标题', 'error');
    await prospectingApi.createList({ title: title.trim(), quarter, line, icpId: icpId ? Number(icpId) : undefined });
    onDone();
  };
  return (
    <Dialog open onClose={onClose} title="新建作战名单" footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={() => void submit()}>创建</Button></>}>
      <div className="space-y-3">
        <Field label="名单标题" required>
          <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`如：B线作战名单Top100（${currentQuarter()}）`} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="季度" required>
            <TextInput value={quarter} onChange={(e) => setQuarter(e.target.value)} placeholder="2026Q3" />
          </Field>
          <Field label="行业线" required>
            <Select value={line} onChange={(e) => setLine(e.target.value)}>
              {LINES.map((l) => <option key={l} value={l}>{l}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="关联 ICP（场景卡）" hint="名单 = ICP 全量筛选 − 存量客户 − 渠道报备 − 冷冻名单 + 信号加权排序">
          <Select value={icpId} onChange={(e) => setIcpId(e.target.value)}>
            <option value="">不关联</option>
            {(icpsQ.data ?? []).map((i) => <option key={i.icpId} value={i.icpId}>{i.line} · {i.name}</option>)}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

// ---------- 批量添加目标 ----------
function TargetsAddDialog({ list, onClose, onDone }: { list: ProspectList; onClose: () => void; onDone: (msg: string) => void }) {
  const toast = useUI((s) => s.toast);
  const [text, setText] = useState('');
  const submit = async () => {
    const items = text
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const [companyName, industry, region, qs, ts, signalNote] = l.split(/[,，\t]/).map((s) => s?.trim());
        return { companyName, industry, region, qScore: Number(qs) || 0, tScore: Number(ts) || 0, signalNote };
      })
      .filter((it) => it.companyName && it.companyName.length >= 2);
    if (!items.length) return toast('请按行填写目标企业', 'error');
    try {
      const r = await prospectingApi.addTargets(list.listId, items);
      const skipped = r.skippedExistingCustomer.length + r.skippedDuplicate.length;
      onDone(`已加入 ${r.added} 家${skipped ? `，排除存量/重复 ${skipped} 家` : ''}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : '添加失败', 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`添加目标 → ${list.title}`}
      width="w-[640px]"
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={() => void submit()}>加入名单</Button></>}
    >
      <Field
        label="目标企业（每行一家）"
        required
        hint="格式：企业名称,行业,地区,Q分,T分,触发信号 —— 自动排除存量客户与重复目标，按 Q+T 总分重排名次"
      >
        <TextArea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'苏南农商银行股份有限公司,银行,江苏苏州,88,76,反洗钱专项检查\n浙东城市商业银行,银行,浙江宁波,82,70'}
        />
      </Field>
    </Dialog>
  );
}

// ---------- 转商机（第六条：填报数据需求收集表完成报备） ----------
function ConvertDialog({ target, onClose, onDone }: { target: ProspectTarget; onClose: () => void; onDone: () => void }) {
  const toast = useUI((s) => s.toast);
  const [oppName, setOppName] = useState(`${target.companyName} 开拓商机`);
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const submit = async () => {
    try {
      await prospectingApi.convertTarget(target.targetId, { oppName, estimatedAmount: amount || undefined, note: note || undefined });
      onDone();
    } catch (e) {
      toast(e instanceof Error ? e.message : '转商机失败', 'error');
    }
  };
  return (
    <Dialog
      open
      onClose={onClose}
      title={`转商机 · ${target.companyName}`}
      footer={<><Button onClick={onClose}>取消</Button><Button variant="primary" onClick={() => void submit()}>建档并报备</Button></>}
    >
      <div className="space-y-3">
        <Field label="商机名称" required>
          <TextInput value={oppName} onChange={(e) => setOppName(e.target.value)} />
        </Field>
        <Field label="预计金额（元）">
          <TextInput value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label="《客户数据需求收集表》摘要" hint="名单客户转商机须填报收集表完成商机报备，进入正常商机流程">
          <TextArea rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="客户数据需求、场景、预算与决策链摘要…" />
        </Field>
      </div>
    </Dialog>
  );
}

// ---------- 目标详情抽屉：触达留痕 ----------
function TargetDrawer({ target, onClose, onChanged }: { target: ProspectTarget; onClose: () => void; onChanged: () => void }) {
  const toast = useUI((s) => s.toast);
  const qc = useQueryClient();
  const touchesQ = useQuery({ queryKey: ['prospect-touches', target.targetId], queryFn: () => prospectingApi.targetTouches(target.targetId) });
  const [method, setMethod] = useState('电话');
  const [content, setContent] = useState('');
  const [effective, setEffective] = useState(true);

  const submitTouch = async () => {
    try {
      await prospectingApi.touchTarget(target.targetId, { method, content: content || undefined, effective });
      setContent('');
      toast('触达已登记', 'success');
      void qc.invalidateQueries({ queryKey: ['prospect-touches', target.targetId] });
      onChanged();
    } catch (e) {
      toast(e instanceof Error ? e.message : '登记失败', 'error');
    }
  };

  return (
    <Drawer open onClose={onClose} title={target.companyName} subtitle={<span>{target.listTitle} · <StatusTag {...TARGET_STATUS[target.status]} dot={false} /></span>} width="w-[620px]">
      <div className="space-y-5 p-5">
        <Descriptions
          items={[
            { label: '行业', value: target.industry || '—' },
            { label: '地区', value: target.region || '—' },
            { label: 'Q 企业质量分', value: String(target.qScore) },
            { label: 'T 时机信号分', value: String(target.tScore) },
            { label: '触发信号', value: target.signalNote || '—' },
            { label: '承接人', value: target.ownerName || '—' },
            { label: '承接时间', value: formatDateTime(target.claimedAt) },
            { label: '首触截止', value: formatDate(target.firstTouchDeadline) },
            { label: '三次有效触达截止', value: formatDate(target.touchDeadline) },
            { label: '结论备注', value: target.resultNote || '—' },
          ]}
        />

        {target.status === 2 && (
          <div className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center gap-2 text-sm font-medium text-text"><TargetIcon size={14} /> 登记触达</div>
            <div className="flex flex-wrap items-center gap-2">
              <Select className="!w-28" value={method} onChange={(e) => setMethod(e.target.value)}>
                {['电话', '拜访', '微信', '邮件', '会议'].map((m) => <option key={m}>{m}</option>)}
              </Select>
              <TextInput className="flex-1 min-w-40" value={content} onChange={(e) => setContent(e.target.value)} placeholder="触达内容 / 结论" />
              <label className="flex items-center gap-1 text-sm text-text-weak">
                <input type="checkbox" checked={effective} onChange={(e) => setEffective(e.target.checked)} /> 有效触达
              </label>
              <Button size="sm" variant="primary" onClick={() => void submitTouch()}>登记</Button>
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 text-sm font-medium text-text">触达记录（{target.effectiveTouchCount} 次有效 / {target.touchCount} 次）</div>
          <div className="space-y-2">
            {(touchesQ.data ?? []).map((t) => (
              <div key={t.touchId} className="rounded-md border border-border px-3 py-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-text">{t.method} {t.effective ? '' : '（无效）'}</span>
                  <span className="text-xs text-text-faint">{t.userName} · {formatDateTime(t.createdAt)}</span>
                </div>
                {t.content && <div className="mt-1 text-text-weak">{t.content}</div>}
              </div>
            ))}
            {!touchesQ.isLoading && (touchesQ.data ?? []).length === 0 && <div className="text-sm text-text-faint">暂无触达记录</div>}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
